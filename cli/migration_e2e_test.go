package main

// End-to-end migration tests driving the REAL binary.
//
// These exist because the highest-severity bug in this change lives in
// resolveScope's ordering, which no unit test can reach: the auto-create of a
// project config used to happen BEFORE the first read, so a migration wired at
// read time would never run and the legacy TOML would be deleted unread.
//
// Reuses the golden harness's build-once binary and temp-HOME pattern.

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"local-search/config"
)

// runLS runs the built binary with an isolated HOME and cwd.
func runLS(t *testing.T, bin, home, cwd string, extraEnv []string, args ...string) (string, string, int) {
	t.Helper()
	cmd := exec.Command(bin, args...)
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "HOME="+home)
	cmd.Env = append(cmd.Env, extraEnv...)
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	code := 0
	if ee, ok := err.(*exec.ExitError); ok {
		code = ee.ExitCode()
	} else if err != nil {
		t.Fatalf("running %v: %v", args, err)
	}
	return stdout.String(), stderr.String(), code
}

// P0-1. The regression guard for the ordering bug.
//
// A legacy TOML naming "fixture" sits in cwd, there is no .agent/ config, and
// cwd is ALSO inside a different registered repo. If auto-create runs before
// migration, the config is seeded from the enclosing repo and the user's
// explicit scope is silently replaced by a plausible-looking wrong one.
func TestMigrationRunsBeforeAutoInit(t *testing.T) {
	bin := buildGoldenBinary(t)
	home := t.TempDir()

	// Register a repo named "enclosing" whose path contains our working dir,
	// so NearestRepoForCWD would return it.
	enclosing := filepath.Join(t.TempDir(), "enclosing")
	specs := filepath.Join(enclosing, "docs")
	if err := os.MkdirAll(specs, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(specs, "a.md"), []byte("# A\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runLS(t, bin, home, enclosing, nil, "repo", "add", enclosing, "enclosing")

	// And a second repo named "fixture", which is what the legacy TOML names.
	fixture := filepath.Join(t.TempDir(), "fixture")
	if err := os.MkdirAll(fixture, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(fixture, "b.md"), []byte("# B\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runLS(t, bin, home, fixture, nil, "repo", "add", fixture, "fixture")

	// Work from INSIDE the enclosing repo, with a legacy TOML naming "fixture".
	work := filepath.Join(enclosing, "sub")
	if err := os.MkdirAll(work, 0o755); err != nil {
		t.Fatal(err)
	}
	tomlPath := filepath.Join(work, config.LegacyName)
	if err := os.WriteFile(tomlPath, []byte(`scope = ["fixture"]`), 0o644); err != nil {
		t.Fatal(err)
	}

	stdout, stderr, _ := runLS(t, bin, home, work, nil, "scope", "show")

	// Assert on the Scope: line only — the Source path legitimately contains
	// "enclosing", since the working directory lives inside that repo.
	scopeLine := ""
	for _, l := range strings.Split(stdout, "\n") {
		if strings.HasPrefix(l, "Scope:") {
			scopeLine = l
			break
		}
	}
	if !strings.Contains(scopeLine, "fixture") {
		t.Errorf("scope should come from the migrated TOML (fixture), not the enclosing repo.\n"+
			"scope line: %q\nstdout:\n%s\nstderr:\n%s", scopeLine, stdout, stderr)
	}
	if strings.Contains(scopeLine, "enclosing") {
		t.Errorf("auto-init ran before migration and seeded the wrong scope: %q", scopeLine)
	}
	if _, err := os.Stat(tomlPath); !os.IsNotExist(err) {
		t.Errorf("legacy TOML should have been removed after a verified write")
	}
	if _, err := config.Load(config.ProjectPath(work)); err != nil {
		t.Errorf("migrated config should be loadable: %v", err)
	}
}

// The opt-out must actually prevent the working tree being touched.
func TestNoAutoMigrateEnvVar(t *testing.T) {
	bin := buildGoldenBinary(t)
	home := t.TempDir()

	repo := filepath.Join(t.TempDir(), "r")
	if err := os.MkdirAll(repo, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, "a.md"), []byte("# A\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runLS(t, bin, home, repo, nil, "repo", "add", repo, "r")

	work := t.TempDir()
	tomlPath := filepath.Join(work, config.LegacyName)
	if err := os.WriteFile(tomlPath, []byte(`scope = ["r"]`), 0o644); err != nil {
		t.Fatal(err)
	}

	runLS(t, bin, home, work, []string{"LOCAL_SEARCH_NO_AUTO_MIGRATE=1"}, "scope", "show")

	if _, err := os.Stat(tomlPath); err != nil {
		t.Error("LOCAL_SEARCH_NO_AUTO_MIGRATE=1 must leave the legacy file alone")
	}
}

// P0-5. `init --json` must be a pure read. The old create-if-missing is how a
// stray config ended up committed and shipped in every release bundle.
func TestInitJSONDoesNotCreateFile(t *testing.T) {
	bin := buildGoldenBinary(t)
	home := t.TempDir()
	work := t.TempDir()

	stdout, _, _ := runLS(t, bin, home, work, nil, "init", "--json")

	if !strings.Contains(stdout, `"exists": false`) {
		t.Errorf(`init --json should report "exists": false for a fresh dir:\n%s`, stdout)
	}
	if _, err := os.Stat(config.ProjectPath(work)); !os.IsNotExist(err) {
		t.Error("init --json created a config file — it must be a pure read")
	}
	// An explicit mutation still writes.
	runLS(t, bin, home, work, nil, "init", "--set", "")
	if _, err := os.Stat(config.ProjectPath(work)); err != nil {
		t.Errorf("init --set should create the file: %v", err)
	}
}

// P0-3. Every repo name the tool accepts must round-trip through the config it
// writes. Before quoting, `init --add @acme/ui` wrote a file its own parser
// rejected on the very next read.
func TestHostileRepoNamesRoundTrip(t *testing.T) {
	bin := buildGoldenBinary(t)
	home := t.TempDir()

	names := []string{"@acme/ui", "2024", "true"}
	for _, n := range names {
		dir := filepath.Join(t.TempDir(), "repo")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "a.md"), []byte("# A\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		runLS(t, bin, home, dir, nil, "repo", "add", dir, n)
	}

	work := t.TempDir()
	_, stderr, code := runLS(t, bin, home, work, nil, "init", "--set", strings.Join(names, ","))
	if code != 0 {
		t.Fatalf("init --set failed: %s", stderr)
	}

	got, err := config.Load(config.ProjectPath(work))
	if err != nil {
		raw, _ := os.ReadFile(config.ProjectPath(work))
		t.Fatalf("wrote a config our own parser rejects: %v\n%s", err, raw)
	}
	for _, n := range names {
		found := false
		for _, r := range got.Repositories {
			if r == n {
				found = true
			}
		}
		if !found {
			t.Errorf("%q did not round-trip; got %v", n, got.Repositories)
		}
	}
}

// P0-6. `scope clear` must not silently no-op, and must not take the user's
// weights and limits with it.
func TestScopeClearEmptiesButKeepsTuning(t *testing.T) {
	bin := buildGoldenBinary(t)
	home := t.TempDir()

	repo := filepath.Join(t.TempDir(), "r")
	if err := os.MkdirAll(repo, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, "a.md"), []byte("# A\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runLS(t, bin, home, repo, nil, "repo", "add", repo, "r")

	work := t.TempDir()
	path := config.ProjectPath(work)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("repositories:\n  - r\n\nweights:\n  specs: 3.5\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	stdout, _, _ := runLS(t, bin, home, work, nil, "scope", "clear")
	if strings.Contains(stdout, "or it did not exist") {
		t.Errorf("scope clear reported a no-op success:\n%s", stdout)
	}
	got, err := config.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Repositories) != 0 {
		t.Errorf("repositories = %v, want empty", got.Repositories)
	}
	if got.Weights.Specs != 3.5 {
		t.Errorf("weights.specs = %v, want 3.5 kept", got.Weights.Specs)
	}
}

// A broken config must produce a readable, line-numbered error rather than
// being silently overwritten.
func TestBrokenConfigIsReportedNotOverwritten(t *testing.T) {
	bin := buildGoldenBinary(t)
	home := t.TempDir()
	work := t.TempDir()

	path := config.ProjectPath(work)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	broken := "repositorys:\n  - a\n"
	if err := os.WriteFile(path, []byte(broken), 0o644); err != nil {
		t.Fatal(err)
	}

	stdout, stderr, code := runLS(t, bin, home, work, nil, "config", "validate")
	if code == 0 {
		t.Errorf("config validate should exit non-zero for a broken config\n%s%s", stdout, stderr)
	}
	if !strings.Contains(stderr, "did you mean") {
		t.Errorf("error should suggest the correct key:\n%s", stderr)
	}
	raw, _ := os.ReadFile(path)
	if string(raw) != broken {
		t.Errorf("the broken config was modified:\n%s", raw)
	}
}

// Concurrent readers must never observe a torn config. Without the atomic
// temp-file + rename write, one of these processes sees a truncated file — and
// with strict validation that is a hard error on an innocent read.
func TestConcurrentAccessNeverSeesTornConfig(t *testing.T) {
	bin := buildGoldenBinary(t)
	home := t.TempDir()

	repo := filepath.Join(t.TempDir(), "r")
	if err := os.MkdirAll(repo, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, "a.md"), []byte("# A\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runLS(t, bin, home, repo, nil, "repo", "add", repo, "r")

	work := t.TempDir()
	if err := os.WriteFile(filepath.Join(work, config.LegacyName), []byte(`scope = ["r"]`), 0o644); err != nil {
		t.Fatal(err)
	}

	const n = 8
	type result struct {
		code   int
		stderr string
	}
	results := make(chan result, n)
	for i := 0; i < n; i++ {
		go func() {
			cmd := exec.Command(bin, "scope", "show")
			cmd.Dir = work
			cmd.Env = append(os.Environ(), "HOME="+home)
			var stderr strings.Builder
			cmd.Stderr = &stderr
			err := cmd.Run()
			code := 0
			if ee, ok := err.(*exec.ExitError); ok {
				code = ee.ExitCode()
			}
			results <- result{code, stderr.String()}
		}()
	}
	for i := 0; i < n; i++ {
		r := <-results
		if r.code != 0 {
			t.Errorf("concurrent run %d failed (torn write?): exit %d\n%s", i, r.code, r.stderr)
		}
	}
	if _, err := config.Load(config.ProjectPath(work)); err != nil {
		t.Errorf("final config is not valid: %v", err)
	}
}
