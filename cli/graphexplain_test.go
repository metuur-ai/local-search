package main

// Tests for `graph explain` (Unit 4, tasks 4.1/4.2). Test names trace the
// R-4.x requirements they verify. The fixture is TWO registered repos with
// cross-repo typed edges, queried from an UNRELATED working directory —
// exactly the R-4.1 acceptance shape. Reuses the golden harness's
// buildGoldenBinary/runGolden (golden_test.go).

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// runExplain executes the binary with an isolated HOME and returns stdout,
// stderr, and the exit code (unlike runGolden, non-zero exits are expected
// here — R-4.4 branches on them).
func runExplain(t *testing.T, bin, home, workDir string, args ...string) (string, string, int) {
	t.Helper()
	cmd := exec.Command(bin, args...)
	cmd.Dir = workDir
	cmd.Env = append(os.Environ(), "HOME="+home)
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	code := 0
	if err != nil {
		ee, ok := err.(*exec.ExitError)
		if !ok {
			t.Fatalf("%s %v: %v", bin, args, err)
		}
		code = ee.ExitCode()
	}
	return stdout.String(), stderr.String(), code
}

// setupExplainFixture registers and scans two repos with cross-repo edges:
//
//	repoA docs/auth.md    id component://auth  dependsOn component://db (phantom)
//	repoB specs/login.md  id req://login       implementedBy component://auth
//	                      (reversed field ⇒ auth --implements--> login)
//	repoB specs/portal.md id component://portal dependsOn component://auth
//
// So `explain component://auth` must show edges declared in BOTH repos, in
// BOTH directions. Returned work dir is unrelated to either repo (R-4.1
// "regardless of the current working directory").
func setupExplainFixture(t *testing.T) (bin, home, work string) {
	t.Helper()
	bin = buildGoldenBinary(t)
	home = t.TempDir()
	work = t.TempDir()
	repoA := t.TempDir()
	repoB := t.TempDir()

	files := map[string]string{
		filepath.Join(repoA, "docs", "auth.md"): "---\n" +
			"id: component://auth\ntitle: Auth Service\ndependsOn:\n  - component://db\n" +
			"---\n# Auth Service\n",
		filepath.Join(repoB, "specs", "login.md"): "---\n" +
			"id: req://login\ntitle: Login Requirement\nimplementedBy:\n  - component://auth\n" +
			"---\n# Login\n",
		filepath.Join(repoB, "specs", "portal.md"): "---\n" +
			"id: component://portal\ntitle: Portal\ndependsOn:\n  - component://auth\n" +
			"---\n# Portal\n",
	}
	for abs, content := range files {
		if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	runGolden(t, bin, home, work, "repo", "add", repoA, "repoA")
	runGolden(t, bin, home, work, "repo", "add", repoB, "repoB")
	runGolden(t, bin, home, work, "scan", "all")
	return bin, home, work
}

// explainEnvelope mirrors the documented JSON contract
// (docs/guides/graph-explain.md).
type explainEnvelope struct {
	SchemaVersion int    `json:"schema_version"`
	Query         string `json:"query"`
	Found         bool   `json:"found"`
	Node          *struct {
		ID         string   `json:"id"`
		Kind       string   `json:"kind"`
		Repo       string   `json:"repo"`
		Path       string   `json:"path"`
		Title      string   `json:"title"`
		Flags      string   `json:"flags"`
		Provenance []string `json:"provenance"`
	} `json:"node"`
	Outgoing []struct {
		Type  string `json:"type"`
		Edges []struct {
			Src, Dst, Repo, Path, Field string
		} `json:"edges"`
	} `json:"outgoing"`
	Incoming []struct {
		Type  string `json:"type"`
		Edges []struct {
			Src, Dst, Repo, Path, Field string
		} `json:"edges"`
	} `json:"incoming"`
}

func TestGraphExplain_R41_OneHopBothDirectionsAcrossRepos(t *testing.T) {
	bin, home, work := setupExplainFixture(t)
	stdout, stderr, code := runExplain(t, bin, home, work, "graph", "explain", "component://auth")
	if code != 0 {
		t.Fatalf("exit code = %d, want 0\nstderr: %s", code, stderr)
	}
	for _, want := range []string{
		"component://auth", // the node itself
		"[component]",      // kind
		"defined: repoA:docs/auth.md",
		"outgoing:",
		"depends_on:",
		"-> component://db  (repoA:docs/auth.md, field dependsOn)",
		"implements:",
		"-> req://login  (repoB:specs/login.md, field implementedBy)",
		"incoming:",
		"<- component://portal  (repoB:specs/portal.md, field dependsOn)",
	} {
		if !strings.Contains(stdout, want) {
			t.Errorf("human output missing %q\nstdout:\n%s", want, stdout)
		}
	}
	// R-4.1 grouping: depends_on group must precede implements (ascending type).
	if strings.Index(stdout, "depends_on:") > strings.Index(stdout, "implements:") {
		t.Errorf("edge-type groups not in canonical (ascending) order:\n%s", stdout)
	}
}

func TestGraphExplain_R41_PhantomNode(t *testing.T) {
	bin, home, work := setupExplainFixture(t)
	stdout, stderr, code := runExplain(t, bin, home, work, "graph", "explain", "component://db")
	if code != 0 {
		t.Fatalf("phantom must be found (exit 0), got %d\nstderr: %s", code, stderr)
	}
	for _, want := range []string{
		"(unresolved)",
		"phantom",
		"<- component://auth  (repoA:docs/auth.md, field dependsOn)",
	} {
		if !strings.Contains(stdout, want) {
			t.Errorf("phantom output missing %q\nstdout:\n%s", want, stdout)
		}
	}
}

func TestGraphExplain_R44_UnknownEntityExitCode(t *testing.T) {
	bin, home, work := setupExplainFixture(t)
	stdout, stderr, code := runExplain(t, bin, home, work, "graph", "explain", "component://nope")
	if code != 2 {
		t.Fatalf("exit code = %d, want 2 (not found)", code)
	}
	if stdout != "" {
		t.Errorf("human not-found must keep stdout empty, got: %s", stdout)
	}
	if !strings.Contains(stderr, "no graph entity found") {
		t.Errorf("stderr missing not-found message: %s", stderr)
	}
}

func TestGraphExplain_R44_UsageErrorExitCode(t *testing.T) {
	bin, home, work := setupExplainFixture(t)
	if _, _, code := runExplain(t, bin, home, work, "graph", "explain"); code != 1 {
		t.Errorf("missing entity: exit code = %d, want 1", code)
	}
	if _, _, code := runExplain(t, bin, home, work, "graph", "explain", "x", "--bogus"); code != 1 {
		t.Errorf("unknown flag: exit code = %d, want 1", code)
	}
	if _, _, code := runExplain(t, bin, home, work, "graph", "explain", "a", "b"); code != 1 {
		t.Errorf("extra positional: exit code = %d, want 1", code)
	}
}

func TestGraphExplain_R45_MissingDBFailsWithoutScan(t *testing.T) {
	bin := buildGoldenBinary(t)
	home := t.TempDir() // never scanned — no DB
	work := t.TempDir()
	stdout, stderr, code := runExplain(t, bin, home, work, "graph", "explain", "component://auth")
	if code != 3 {
		t.Fatalf("exit code = %d, want 3 (missing DB)\nstdout: %s\nstderr: %s", code, stdout, stderr)
	}
	if !strings.Contains(stderr, "run `local-search scan`") {
		t.Errorf("stderr must instruct to run scan, got: %s", stderr)
	}
	// R-4.5: no implicit scan side-effect — the DB must still not exist.
	if _, err := os.Stat(filepath.Join(home, ".local-search", "specs.db")); !os.IsNotExist(err) {
		t.Errorf("explain created a DB (implicit scan): stat err = %v", err)
	}
}

func TestGraphExplainJSON_R42_ProvenanceInEveryItem(t *testing.T) {
	bin, home, work := setupExplainFixture(t)
	stdout, stderr, code := runExplain(t, bin, home, work, "graph", "explain", "component://auth", "--json")
	if code != 0 {
		t.Fatalf("exit code = %d, want 0\nstderr: %s", code, stderr)
	}
	var env explainEnvelope
	if err := json.Unmarshal([]byte(stdout), &env); err != nil {
		t.Fatalf("stdout is not valid JSON (R-4.3): %v\n%s", err, stdout)
	}
	if env.Node == nil || env.Node.Repo != "repoA" || env.Node.Path != "docs/auth.md" {
		t.Fatalf("node missing origin repo/path: %+v", env.Node)
	}
	if len(env.Node.Provenance) != 1 || env.Node.Provenance[0] != "repoA:docs/auth.md" {
		t.Errorf("node provenance = %v, want [repoA:docs/auth.md]", env.Node.Provenance)
	}
	edgeCount := 0
	for _, dir := range [][]struct {
		Type  string `json:"type"`
		Edges []struct{ Src, Dst, Repo, Path, Field string } `json:"edges"`
	}{env.Outgoing, env.Incoming} {
		for _, g := range dir {
			for _, e := range g.Edges {
				edgeCount++
				if e.Repo == "" || e.Path == "" || e.Field == "" {
					t.Errorf("edge missing provenance (R-4.2): %+v", e)
				}
			}
		}
	}
	if edgeCount != 3 {
		t.Errorf("edge count = %d, want 3 (both repos, both directions)", edgeCount)
	}
}

func TestGraphExplainJSON_R43_SchemaVersionAndByteDeterminism(t *testing.T) {
	bin, home, work := setupExplainFixture(t)
	out1, _, code1 := runExplain(t, bin, home, work, "graph", "explain", "component://auth", "--json")
	out2, _, code2 := runExplain(t, bin, home, work, "graph", "explain", "component://auth", "--json")
	if code1 != 0 || code2 != 0 {
		t.Fatalf("exit codes = %d/%d, want 0/0", code1, code2)
	}
	if out1 != out2 {
		t.Fatalf("two runs over the same graph state differ (R-4.3):\n--1--\n%s\n--2--\n%s", out1, out2)
	}
	var env explainEnvelope
	if err := json.Unmarshal([]byte(out1), &env); err != nil {
		t.Fatalf("stdout is not valid JSON: %v\n%s", err, out1)
	}
	if env.SchemaVersion != 1 {
		t.Errorf("schema_version = %d, want 1", env.SchemaVersion)
	}
	if !env.Found || env.Query != "component://auth" {
		t.Errorf("found/query wrong: %+v", env)
	}
	// Canonical group order: outgoing types ascend (depends_on < implements).
	if len(env.Outgoing) != 2 || env.Outgoing[0].Type != "depends_on" || env.Outgoing[1].Type != "implements" {
		t.Errorf("outgoing groups not canonically ordered: %+v", env.Outgoing)
	}
}

func TestGraphExplainJSON_R44_NotFoundWellFormedResult(t *testing.T) {
	bin, home, work := setupExplainFixture(t)
	stdout, _, code := runExplain(t, bin, home, work, "graph", "explain", "component://nope", "--json")
	if code != 2 {
		t.Fatalf("exit code = %d, want 2 (not found)", code)
	}
	var env explainEnvelope
	if err := json.Unmarshal([]byte(stdout), &env); err != nil {
		t.Fatalf("not-found stdout must be well-formed JSON (R-4.4): %v\n%s", err, stdout)
	}
	if env.Found || env.Node != nil {
		t.Errorf("not-found envelope wrong: found=%v node=%+v", env.Found, env.Node)
	}
	if env.Outgoing == nil || env.Incoming == nil || len(env.Outgoing) != 0 || len(env.Incoming) != 0 {
		t.Errorf("outgoing/incoming must be empty arrays, got %v / %v", env.Outgoing, env.Incoming)
	}
	if !strings.Contains(stdout, `"schema_version": 1`) {
		t.Errorf("not-found envelope missing schema_version:\n%s", stdout)
	}
}
