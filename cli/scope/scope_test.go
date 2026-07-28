package scope

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"local-search/config"
)

// helper: write a project config in dir with the given repositories list and
// any extra YAML body (e.g. a weights/limits block). Returns the absolute path.
func writeConfig(t *testing.T, dir string, repos []string, extra string) string {
	t.Helper()
	body := "repositories:"
	if len(repos) == 0 {
		body += " []\n"
	} else {
		body += "\n"
		for _, r := range repos {
			body += "  - " + r + "\n"
		}
	}
	body += extra
	path := config.ProjectPath(dir)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	return path
}

func TestResolve_FlagOverridesEverything(t *testing.T) {
	dir := t.TempDir()
	writeConfig(t, dir, []string{"from-config"}, "")
	r := Resolver{
		CWD:       dir,
		FlagValue: "from-flag",
		Repos:     []Repo{{Name: "from-flag", Path: dir}},
		HomeDir:   "",
	}
	sc, err := r.Resolve()
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if !reflect.DeepEqual(sc.Repos, []string{"from-flag"}) {
		t.Fatalf("Repos = %v, want [from-flag]", sc.Repos)
	}
	if sc.Source != "--scope flag" {
		t.Fatalf("Source = %q, want --scope flag", sc.Source)
	}
}

func TestResolve_FlagWithUnknownRepoFails(t *testing.T) {
	r := Resolver{
		CWD:       t.TempDir(),
		FlagValue: "nope",
		Repos:     []Repo{{Name: "real", Path: "/some/path"}},
	}
	_, err := r.Resolve()
	if err == nil {
		t.Fatal("expected error when --scope names no registered repos")
	}
}

func TestResolve_ProjectConfigFound(t *testing.T) {
	dir := t.TempDir()
	cfg := writeConfig(t, dir, []string{"alpha", "beta"}, "")
	r := Resolver{
		CWD:   dir,
		Repos: []Repo{{Name: "alpha", Path: "/a"}, {Name: "beta", Path: "/b"}},
	}
	sc, err := r.Resolve()
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if !reflect.DeepEqual(sc.Repos, []string{"alpha", "beta"}) {
		t.Fatalf("Repos = %v, want [alpha beta]", sc.Repos)
	}
	if sc.Source != cfg {
		t.Fatalf("Source = %q, want %q", sc.Source, cfg)
	}
}

func TestResolve_ProjectConfigWalkUp(t *testing.T) {
	root := t.TempDir()
	deep := filepath.Join(root, "a", "b", "c")
	if err := os.MkdirAll(deep, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	writeConfig(t, root, []string{"alpha"}, "")
	r := Resolver{
		CWD:   deep,
		Repos: []Repo{{Name: "alpha", Path: "/a"}},
	}
	sc, err := r.Resolve()
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if !reflect.DeepEqual(sc.Repos, []string{"alpha"}) {
		t.Fatalf("Repos = %v, want [alpha]", sc.Repos)
	}
}

func TestResolve_ConfigWithNoRegisteredReposFails(t *testing.T) {
	dir := t.TempDir()
	writeConfig(t, dir, []string{"ghost"}, "")
	r := Resolver{
		CWD:   dir,
		Repos: []Repo{{Name: "real", Path: "/x"}},
	}
	_, err := r.Resolve()
	if err == nil {
		t.Fatal("expected error when config lists only unregistered repos")
	}
}

func TestResolve_GlobalConfig(t *testing.T) {
	homeDir := t.TempDir()
	gpath := config.GlobalPath(homeDir)
	if err := os.WriteFile(gpath, []byte("repositories:\n  - alpha\n"), 0o644); err != nil {
		t.Fatalf("write global: %v", err)
	}
	// CWD has no project config.
	r := Resolver{
		CWD:     t.TempDir(),
		Repos:   []Repo{{Name: "alpha", Path: "/elsewhere"}},
		HomeDir: homeDir,
	}
	sc, err := r.Resolve()
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if !reflect.DeepEqual(sc.Repos, []string{"alpha"}) {
		t.Fatalf("Repos = %v, want [alpha]", sc.Repos)
	}
	if sc.Source != gpath {
		t.Errorf("Source = %q, want %q", sc.Source, gpath)
	}
}

func TestResolve_CWDWalkUpFindsEnclosingRepo(t *testing.T) {
	repoRoot := t.TempDir()
	deep := filepath.Join(repoRoot, "src", "internal")
	if err := os.MkdirAll(deep, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	r := Resolver{
		CWD:     deep,
		Repos:   []Repo{{Name: "myrepo", Path: repoRoot}},
		HomeDir: "",
	}
	sc, err := r.Resolve()
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if !reflect.DeepEqual(sc.Repos, []string{"myrepo"}) {
		t.Fatalf("Repos = %v, want [myrepo]", sc.Repos)
	}
}

func TestResolve_CWDWalkUpPicksDeepestEnclosing(t *testing.T) {
	outer := t.TempDir()
	inner := filepath.Join(outer, "child")
	if err := os.MkdirAll(inner, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	// Both repos are prefixes of inner, but inner is deeper and should win.
	r := Resolver{
		CWD: inner,
		Repos: []Repo{
			{Name: "outer", Path: outer},
			{Name: "inner", Path: inner},
		},
	}
	sc, err := r.Resolve()
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if !reflect.DeepEqual(sc.Repos, []string{"inner"}) {
		t.Fatalf("Repos = %v, want [inner]", sc.Repos)
	}
}

func TestResolve_NoScopeReturnsErrNoScope(t *testing.T) {
	r := Resolver{
		CWD:   t.TempDir(),
		Repos: []Repo{{Name: "alpha", Path: "/elsewhere"}},
	}
	_, err := r.Resolve()
	if !errors.Is(err, ErrNoScope) {
		t.Fatalf("expected ErrNoScope, got %v", err)
	}
}

func TestResolve_DefaultsApplied(t *testing.T) {
	dir := t.TempDir()
	writeConfig(t, dir, []string{"alpha"}, "")
	r := Resolver{
		CWD:   dir,
		Repos: []Repo{{Name: "alpha", Path: "/a"}},
	}
	sc, err := r.Resolve()
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if sc.Weights.Specs != DefaultWeightSpecs {
		t.Fatalf("Weights.Specs = %v, want default %v", sc.Weights.Specs, DefaultWeightSpecs)
	}
	if sc.Limits.BlastDepth != DefaultBlastDepth {
		t.Fatalf("Limits.BlastDepth = %v, want default %v", sc.Limits.BlastDepth, DefaultBlastDepth)
	}
}

func TestResolve_ConfigOverridesDefaults(t *testing.T) {
	dir := t.TempDir()
	writeConfig(t, dir, []string{"alpha"}, `weights:
  specs: 2.5
  codegraph: 1.5

limits:
  blast_depth: 7
`)
	r := Resolver{
		CWD:   dir,
		Repos: []Repo{{Name: "alpha", Path: "/a"}},
	}
	sc, err := r.Resolve()
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if sc.Weights.Specs != 2.5 {
		t.Fatalf("Weights.Specs = %v, want 2.5", sc.Weights.Specs)
	}
	if sc.Weights.CodeGraph != 1.5 {
		t.Fatalf("Weights.CodeGraph = %v, want 1.5", sc.Weights.CodeGraph)
	}
	if sc.Limits.BlastDepth != 7 {
		t.Fatalf("Limits.BlastDepth = %v, want 7", sc.Limits.BlastDepth)
	}
	// Unset limits should still get defaults.
	if sc.Limits.BlastCap != DefaultBlastCap {
		t.Fatalf("Limits.BlastCap = %v, want default %v", sc.Limits.BlastCap, DefaultBlastCap)
	}
}

func TestWriteProjectConfig_RoundTrips(t *testing.T) {
	dir := t.TempDir()
	path, err := WriteProjectConfig(dir, []string{"alpha", "beta"})
	if err != nil {
		t.Fatalf("WriteProjectConfig: %v", err)
	}
	if filepath.Base(path) != ConfigFileName {
		t.Fatalf("written path = %q, want basename %q", path, ConfigFileName)
	}
	r := Resolver{CWD: dir, Repos: []Repo{{Name: "alpha", Path: "/a"}, {Name: "beta", Path: "/b"}}}
	sc, err := r.Resolve()
	if err != nil {
		t.Fatalf("Resolve after write: %v", err)
	}
	if !reflect.DeepEqual(sc.Repos, []string{"alpha", "beta"}) {
		t.Fatalf("round-tripped repositories = %v", sc.Repos)
	}
	// RemoveProjectConfig is idempotent.
	if err := RemoveProjectConfig(dir); err != nil {
		t.Fatalf("RemoveProjectConfig: %v", err)
	}
	if err := RemoveProjectConfig(dir); err != nil {
		t.Fatalf("RemoveProjectConfig (second call): %v", err)
	}
}

// scope clear empties the list but keeps the file, so a user's weights and
// limits are not collateral damage.
func TestClearProjectConfig_KeepsTuning(t *testing.T) {
	dir := t.TempDir()
	writeConfig(t, dir, []string{"alpha"}, "weights:\n  specs: 2.5\n")
	if _, err := ClearProjectConfig(dir); err != nil {
		t.Fatalf("ClearProjectConfig: %v", err)
	}
	settings, err := config.Load(config.ProjectPath(dir))
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	if len(settings.Repositories) != 0 {
		t.Errorf("repositories = %v, want empty", settings.Repositories)
	}
	if settings.Weights.Specs != 2.5 {
		t.Errorf("weights.specs = %v, want 2.5 kept", settings.Weights.Specs)
	}
}

func TestFindProjectConfig_FoundAtCWD(t *testing.T) {
	dir := t.TempDir()
	cfg := writeConfig(t, dir, []string{"alpha"}, "")
	path, ok := FindProjectConfig(dir, "")
	if !ok {
		t.Fatal("expected ok=true when config exists in CWD")
	}
	if path != cfg {
		t.Fatalf("path = %q, want %q", path, cfg)
	}
}

func TestFindProjectConfig_FoundViaWalkUp(t *testing.T) {
	root := t.TempDir()
	deep := filepath.Join(root, "a", "b")
	if err := os.MkdirAll(deep, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	cfg := writeConfig(t, root, []string{"alpha"}, "")
	path, ok := FindProjectConfig(deep, "")
	if !ok || path != cfg {
		t.Fatalf("walk-up should find %q from %q, got path=%q ok=%v", cfg, deep, path, ok)
	}
}

func TestFindProjectConfig_NotFound(t *testing.T) {
	dir := t.TempDir()
	if _, ok := FindProjectConfig(dir, ""); ok {
		t.Fatal("expected ok=false when no config exists anywhere")
	}
}

// A broken config must be a hard error, never a silent fall-through to the
// global config or the cwd-walk. The fall-through is what let auto-init
// overwrite a config the user was mid-edit.
func TestResolve_BrokenConfigIsFatal(t *testing.T) {
	dir := t.TempDir()
	path := config.ProjectPath(dir)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("repositorys: []\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	r := Resolver{CWD: dir, Repos: []Repo{{Name: "alpha", Path: dir}}}
	if _, err := r.Resolve(); err == nil {
		t.Fatal("a broken config must not fall through to the cwd-walk")
	}
}

// An empty repositories list gets a sentinel so callers can render the
// friendly banner instead of dying.
func TestResolve_EmptyListReturnsErrEmptyScope(t *testing.T) {
	dir := t.TempDir()
	writeConfig(t, dir, nil, "")
	r := Resolver{CWD: dir, Repos: []Repo{{Name: "alpha", Path: "/a"}}}
	_, err := r.Resolve()
	if !errors.Is(err, ErrEmptyScope) {
		t.Fatalf("want ErrEmptyScope, got %v", err)
	}
}

func TestNearestRepoForCWD_Exported(t *testing.T) {
	// Sanity check that the exported wrapper agrees with the internal impl.
	repo := t.TempDir()
	deep := filepath.Join(repo, "src")
	if err := os.MkdirAll(deep, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	got, ok := NearestRepoForCWD(deep, []Repo{{Name: "myrepo", Path: repo}})
	if !ok || got != "myrepo" {
		t.Fatalf("NearestRepoForCWD = %q ok=%v, want myrepo true", got, ok)
	}
}

// ── graph: prefix tests ─────────────────────────────────────────────────────

func TestHasGraphPrefix(t *testing.T) {
	cases := []struct {
		in       string
		want     string
		isGraph  bool
	}{
		{"graph:foyer-app-api", "foyer-app-api", true},
		{"graph:", "", true},
		{"foyer-app-api", "foyer-app-api", false},
		{"graph", "graph", false},
		{"", "", false},
	}
	for _, c := range cases {
		got, isGraph := HasGraphPrefix(c.in)
		if got != c.want || isGraph != c.isGraph {
			t.Errorf("HasGraphPrefix(%q) = (%q, %v), want (%q, %v)",
				c.in, got, isGraph, c.want, c.isGraph)
		}
	}
}

func TestResolve_GraphPrefixResolvesToExternalGraph(t *testing.T) {
	dir := t.TempDir()
	writeConfig(t, dir, []string{"graph:my-cg"}, "")
	r := Resolver{
		CWD:            dir,
		Repos:          []Repo{}, // no repos at all — must not require any
		ExternalGraphs: []string{"my-cg"},
	}
	sc, err := r.Resolve()
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if !reflect.DeepEqual(sc.Repos, []string{"graph:my-cg"}) {
		t.Fatalf("Repos = %v, want [graph:my-cg]", sc.Repos)
	}
}

func TestResolve_GraphPrefixUnknownGraphFiltered(t *testing.T) {
	dir := t.TempDir()
	writeConfig(t, dir, []string{"graph:nope"}, "")
	r := Resolver{
		CWD:            dir,
		Repos:          []Repo{},
		ExternalGraphs: []string{"different-name"},
	}
	_, err := r.Resolve()
	if err == nil {
		t.Fatal("expected error when graph: scope entry refers to unknown external graph")
	}
}

func TestResolve_MixedRepoAndGraphScope(t *testing.T) {
	dir := t.TempDir()
	writeConfig(t, dir, []string{"my-repo", "graph:my-cg"}, "")
	r := Resolver{
		CWD:            dir,
		Repos:          []Repo{{Name: "my-repo", Path: "/tmp/x"}},
		ExternalGraphs: []string{"my-cg"},
	}
	sc, err := r.Resolve()
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if !reflect.DeepEqual(sc.Repos, []string{"my-repo", "graph:my-cg"}) {
		t.Fatalf("Repos = %v, want both entries kept", sc.Repos)
	}
}

func TestResolve_GraphPrefixCollidesWithRepoName(t *testing.T) {
	// A repo named "foo" and an external graph named "foo" can coexist —
	// the prefix disambiguates which one the scope refers to.
	dir := t.TempDir()
	writeConfig(t, dir, []string{"foo", "graph:foo"}, "")
	r := Resolver{
		CWD:            dir,
		Repos:          []Repo{{Name: "foo", Path: "/tmp/foo"}},
		ExternalGraphs: []string{"foo"},
	}
	sc, err := r.Resolve()
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if !reflect.DeepEqual(sc.Repos, []string{"foo", "graph:foo"}) {
		t.Fatalf("Repos = %v, want both kept (prefix disambiguates)", sc.Repos)
	}
}

func TestParseScopeList(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"a,b,c", []string{"a", "b", "c"}},
		{" a , b , c ", []string{"a", "b", "c"}},
		{"single", []string{"single"}},
		{",,,", nil},
		{"", nil},
	}
	for _, c := range cases {
		got := parseScopeList(c.in)
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("parseScopeList(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}
