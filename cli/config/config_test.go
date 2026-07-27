package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ── Absent vs. explicitly zero ────────────────────────────────────────────────
//
// The pre-0.4.0 rule was `if x == 0 { x = Default }`, which made 0
// unrepresentable for every weight and limit. These tests pin the fix.

func TestSettings_AbsentTakesDefaults(t *testing.T) {
	s := File{}.Settings()
	if s.Weights.Specs != DefaultWeightSpecs {
		t.Errorf("weights.specs = %v, want %v", s.Weights.Specs, DefaultWeightSpecs)
	}
	if s.Limits.BlastCap != DefaultBlastCap {
		t.Errorf("limits.blast_cap = %v, want %v", s.Limits.BlastCap, DefaultBlastCap)
	}
	if s.Version != SupportedVersion {
		t.Errorf("version = %d, want %d", s.Version, SupportedVersion)
	}
}

func TestSettings_ExplicitZeroSurvives(t *testing.T) {
	f := File{
		Weights: &Weights{Specs: Float(0)},
		Limits:  &Limits{BlastCap: Int(0)},
	}
	s := f.Settings()
	if s.Weights.Specs != 0 {
		t.Errorf("explicit weights.specs=0 became %v — the zero-means-default bug is back", s.Weights.Specs)
	}
	if s.Limits.BlastCap != 0 {
		t.Errorf("explicit limits.blast_cap=0 became %v", s.Limits.BlastCap)
	}
	// Sibling fields must still default.
	if s.Weights.Graphify != DefaultWeightGraphify {
		t.Errorf("weights.graphify = %v, want default %v", s.Weights.Graphify, DefaultWeightGraphify)
	}
}

func TestDecode_ExplicitZeroFromYAML(t *testing.T) {
	f, err := Decode("t.yaml", []byte("repositories: [a]\nweights:\n  specs: 0\n"))
	if err != nil {
		t.Fatal(err)
	}
	if f.Weights == nil || f.Weights.Specs == nil || *f.Weights.Specs != 0 {
		t.Fatalf("weights.specs did not decode as explicit 0: %+v", f.Weights)
	}
	if f.Settings().Weights.Specs != 0 {
		t.Error("explicit 0 lost when folding defaults")
	}
}

func TestDecode_ExplicitNullTakesDefault(t *testing.T) {
	f, err := Decode("t.yaml", []byte("repositories: [a]\nweights:\n  specs:\n"))
	if err != nil {
		t.Fatal(err)
	}
	if s := f.Settings(); s.Weights.Specs != DefaultWeightSpecs {
		t.Errorf("explicit null should take the default, got %v", s.Weights.Specs)
	}
}

// ── Parsing ───────────────────────────────────────────────────────────────────

func TestDecode_Forms(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{"block list", "repositories:\n  - platform\n  - docs\n", []string{"platform", "docs"}},
		{"inline flow", `repositories: ["platform", 'docs']`, []string{"platform", "docs"}},
		{"empty inline", "repositories: []\n", nil},
		{"absent key", "# just a comment\n", nil},
		{"empty file", "", nil},
		{"whitespace only", "   \n\n", nil},
		// graph: entries are the reason this matters — verified to parse as a
		// plain string, not a map, in both PyYAML and goccy.
		{"graph prefix", "repositories:\n  - graph:legacy\n", []string{"graph:legacy"}},
		{"graph prefix inline", "repositories: [graph:legacy]\n", []string{"graph:legacy"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f, err := Decode("t.yaml", []byte(tc.in))
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(f.Repositories) != len(tc.want) {
				t.Fatalf("got %v, want %v", f.Repositories, tc.want)
			}
			for i := range tc.want {
				if f.Repositories[i] != tc.want[i] {
					t.Errorf("[%d] got %q, want %q", i, f.Repositories[i], tc.want[i])
				}
			}
		})
	}
}

// The hand-rolled pre-0.4.0 parser `break`ed at the first non-"- " line, so a
// weights block after repositories was silently swallowed.
func TestDecode_KeyAfterListIsNotSwallowed(t *testing.T) {
	f, err := Decode("t.yaml", []byte("repositories:\n  - a\nweights:\n  specs: 2.5\n"))
	if err != nil {
		t.Fatal(err)
	}
	if f.Weights == nil || f.Weights.Specs == nil || *f.Weights.Specs != 2.5 {
		t.Fatal("weights block after repositories was lost — the old parser bug is back")
	}
}

func TestDecode_StripsBOM(t *testing.T) {
	in := append([]byte{0xEF, 0xBB, 0xBF}, []byte("repositories:\n  - a\n")...)
	f, err := Decode("t.yaml", in)
	if err != nil {
		t.Fatalf("BOM not stripped: %v", err)
	}
	if len(f.Repositories) != 1 || f.Repositories[0] != "a" {
		t.Errorf("got %v", f.Repositories)
	}
}

// ── Validation ────────────────────────────────────────────────────────────────

func TestDecode_Rejects(t *testing.T) {
	cases := []struct {
		name      string
		in        string
		wantInMsg string
	}{
		{"unknown key", "repositorys:\n  - a\n", `did you mean "repositories"`},
		{"legacy scope key", "scope:\n  - a\n", `renamed to "repositories"`},
		{"camelCase limit", "limits:\n  blastDepth: 3\n", `did you mean "blast_depth"`},
		{"ambiguous specs", "specs: 3\n", "weights.specs"},
		{"not a list", `repositories: "notalist"`, ""},
		{"version too new", "version: 2\nrepositories: []\n", "newer than this local-search"},
		{"negative weight", "weights:\n  specs: -1\n", "must be >= 0"},
		{"tab indent", "repositories:\n\t- a\n", ""},
		{"duplicate entry", "repositories:\n  - a\n  - a\n", "duplicate"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Decode("t.yaml", []byte(tc.in))
			if err == nil {
				t.Fatal("expected an error, got none")
			}
			if tc.wantInMsg != "" && !strings.Contains(err.Error(), tc.wantInMsg) {
				t.Errorf("error missing %q:\n%s", tc.wantInMsg, err)
			}
		})
	}
}

func TestDecode_ErrorHasLineNumber(t *testing.T) {
	_, err := Decode("/p/t.yaml", []byte("repositories:\n  - a\n\nrepositorys:\n  - b\n"))
	if err == nil {
		t.Fatal("expected an error")
	}
	msg := err.Error()
	if !strings.Contains(msg, "/p/t.yaml:4:") {
		t.Errorf("error should point at line 4:\n%s", msg)
	}
	if !strings.Contains(msg, "repositorys:") {
		t.Errorf("error should include the source line:\n%s", msg)
	}
}

// x- prefixed keys are the deliberate escape hatch for third-party tooling.
func TestDecode_AllowsExtensionKeys(t *testing.T) {
	if _, err := Decode("t.yaml", []byte("repositories: [a]\nx-mytool: hello\n")); err != nil {
		t.Fatalf("x- prefixed key should be allowed: %v", err)
	}
}

func TestDecode_ReportsEveryUnknownKeyAtOnce(t *testing.T) {
	_, err := Decode("t.yaml", []byte("repositorys: []\nweightz:\n  specs: 1\n"))
	if err == nil {
		t.Fatal("expected an error")
	}
	ce, ok := err.(*Error)
	if !ok {
		t.Fatalf("want *Error, got %T", err)
	}
	if len(ce.Problems) != 2 {
		t.Errorf("want 2 problems reported at once, got %d:\n%s", len(ce.Problems), err)
	}
}

// ── Round-trip / writing ──────────────────────────────────────────────────────

// P0-3: repo names are unvalidated at registration, so the writer must quote
// anything a real YAML parser would choke on or coerce to a non-string.
func TestSave_QuotesHostileNames(t *testing.T) {
	names := []string{"@acme/ui", "*shared", "%metrics", "2024", "true", "null", "a b", "graph:legacy", "plain-name"}
	dir := t.TempDir()
	path := filepath.Join(dir, "c.yaml")

	if err := SetRepositories(path, names); err != nil {
		t.Fatal(err)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatalf("wrote a file our own parser rejects: %v", err)
	}
	if len(got.Repositories) != len(names) {
		t.Fatalf("got %v, want %v", got.Repositories, names)
	}
	for i := range names {
		if got.Repositories[i] != names[i] {
			t.Errorf("[%d] round-trip changed %q into %q", i, names[i], got.Repositories[i])
		}
	}
}

// The headline bug: `scope set` used to wipe weights and limits.
func TestSetRepositories_PreservesEverythingElse(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "c.yaml")
	original := `# yaml-language-server: $schema=https://example/schema.json
# my own note
repositories:
  - old

weights:
  specs: 2.5
  graphify: 0

limits:
  blast_depth: 7
`
	if err := os.WriteFile(path, []byte(original), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := SetRepositories(path, []string{"new1", "new2"}); err != nil {
		t.Fatal(err)
	}
	s, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if s.Weights.Specs != 2.5 {
		t.Errorf("weights.specs = %v, want 2.5 — destroy-on-write is back", s.Weights.Specs)
	}
	if s.Weights.Graphify != 0 {
		t.Errorf("weights.graphify = %v, want explicit 0", s.Weights.Graphify)
	}
	if s.Limits.BlastDepth != 7 {
		t.Errorf("limits.blast_depth = %v, want 7", s.Limits.BlastDepth)
	}
	if strings.Join(s.Repositories, ",") != "new1,new2" {
		t.Errorf("repositories = %v", s.Repositories)
	}

	raw, _ := os.ReadFile(path)
	for _, want := range []string{"yaml-language-server", "# my own note"} {
		if !strings.Contains(string(raw), want) {
			t.Errorf("splice dropped %q:\n%s", want, raw)
		}
	}
}

func TestSave_SpliceCases(t *testing.T) {
	cases := []struct{ name, original string }{
		{"inline empty", "repositories: []\n"},
		{"bare key", "repositories:\n"},
		{"no trailing newline", "repositories:\n  - a"},
		{"key absent", "weights:\n  specs: 1.5\n"},
		{"crlf", "repositories:\r\n  - a\r\n"},
		{"trailing key after list", "repositories:\n  - a\nweights:\n  specs: 1.5\n"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, "c.yaml")
			if err := os.WriteFile(path, []byte(tc.original), 0o644); err != nil {
				t.Fatal(err)
			}
			if err := SetRepositories(path, []string{"x", "y"}); err != nil {
				t.Fatal(err)
			}
			s, err := Load(path)
			if err != nil {
				raw, _ := os.ReadFile(path)
				t.Fatalf("reload failed: %v\n--- file ---\n%s", err, raw)
			}
			if strings.Join(s.Repositories, ",") != "x,y" {
				raw, _ := os.ReadFile(path)
				t.Errorf("repositories = %v\n--- file ---\n%s", s.Repositories, raw)
			}
			// A weights block present in the original must survive.
			if strings.Contains(tc.original, "specs: 1.5") && s.Weights.Specs != 1.5 {
				raw, _ := os.ReadFile(path)
				t.Errorf("weights lost: %v\n--- file ---\n%s", s.Weights.Specs, raw)
			}
		})
	}
}

func TestSave_IsAtomicAndCreatesDirs(t *testing.T) {
	dir := t.TempDir()
	path := ProjectPath(dir) // <dir>/.agent/local-search-config.yaml
	if err := SetRepositories(path, []string{"a"}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf(".agent/ not created: %v", err)
	}
	// No temp files left behind.
	entries, _ := os.ReadDir(filepath.Dir(path))
	for _, e := range entries {
		if strings.Contains(e.Name(), ".tmp") {
			t.Errorf("temp file left behind: %s", e.Name())
		}
	}
}

// A broken config must not be silently overwritten by a routine write.
func TestSetRepositories_RefusesToClobberBrokenConfig(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "c.yaml")
	broken := "repositorys:\n  - a\n"
	if err := os.WriteFile(path, []byte(broken), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := SetRepositories(path, []string{"new"}); err == nil {
		t.Fatal("expected an error rather than a silent overwrite")
	}
	raw, _ := os.ReadFile(path)
	if string(raw) != broken {
		t.Errorf("file was modified despite the error:\n%s", raw)
	}
}

// ── Walk-up ───────────────────────────────────────────────────────────────────

func TestFindProject_WalksUp(t *testing.T) {
	root := t.TempDir()
	if err := SetRepositories(ProjectPath(root), []string{"rooted"}); err != nil {
		t.Fatal(err)
	}
	deep := filepath.Join(root, "src", "api", "handlers")
	if err := os.MkdirAll(deep, 0o755); err != nil {
		t.Fatal(err)
	}
	s, err := FindProject(deep, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Repositories) != 1 || s.Repositories[0] != "rooted" {
		t.Errorf("got %v, want [rooted]", s.Repositories)
	}
}

func TestFindProject_NearestWins(t *testing.T) {
	root := t.TempDir()
	child := filepath.Join(root, "packages", "api")
	if err := os.MkdirAll(child, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := SetRepositories(ProjectPath(root), []string{"parent"}); err != nil {
		t.Fatal(err)
	}
	if err := SetRepositories(ProjectPath(child), []string{"child"}); err != nil {
		t.Fatal(err)
	}
	s, err := FindProject(child, "")
	if err != nil {
		t.Fatal(err)
	}
	if s.Repositories[0] != "child" {
		t.Errorf("got %v, want nearest config [child]", s.Repositories)
	}
}

// P0-5: a stray ~/.agent/local-search-config.yaml must not capture every
// project on the machine.
func TestFindProject_StopsAtHome(t *testing.T) {
	home := t.TempDir()
	if err := SetRepositories(ProjectPath(home), []string{"home-capture"}); err != nil {
		t.Fatal(err)
	}
	proj := filepath.Join(home, "work", "project")
	if err := os.MkdirAll(proj, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := FindProject(proj, home); err == nil {
		t.Fatal("a config in $HOME must not be inherited by projects beneath it")
	} else if !IsNotExist(err) {
		t.Fatalf("want not-exist, got %v", err)
	}
}

func TestFindProject_StopsAtGitRoot(t *testing.T) {
	outer := t.TempDir()
	if err := SetRepositories(ProjectPath(outer), []string{"outer"}); err != nil {
		t.Fatal(err)
	}
	inner := filepath.Join(outer, "vendor", "other")
	if err := os.MkdirAll(filepath.Join(inner, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := FindProject(inner, ""); err == nil {
		t.Fatal("walk-up must stop at a nested git repo root")
	}
}

// A malformed config must STOP the walk, not fall through to an ancestor.
// The pre-0.4.0 fall-through is what let auto-init overwrite a broken file.
func TestFindProject_MalformedStopsTheWalk(t *testing.T) {
	root := t.TempDir()
	if err := SetRepositories(ProjectPath(root), []string{"ancestor"}); err != nil {
		t.Fatal(err)
	}
	child := filepath.Join(root, "child")
	if err := os.MkdirAll(filepath.Join(child, AgentDir), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(ProjectPath(child), []byte("repositorys: []\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := FindProject(child, "")
	if err == nil {
		t.Fatal("a broken config must be an error, not a silent fall-through")
	}
	if IsNotExist(err) {
		t.Fatalf("broken config reported as not-found: %v", err)
	}
}
