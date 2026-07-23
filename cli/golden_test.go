package main

// Golden-output regression tests (task 0.1, R-5.4).
//
// These pin the observable stdout of the top inherited commands BEFORE any
// knowledge-graph change lands, so later work is diffable against today's
// behavior. Run with UPDATE_GOLDEN=1 to regenerate the files under
// testdata/golden/ (only do that for an intentional, reviewed output change).
//
// Normalization: absolute temp paths are replaced with placeholders, and the
// NetworkX graph JSON is canonicalized (rowid-based node ids are renumbered
// after a deterministic sort) because rowid assignment order depends on the
// concurrent scan worker pool, not on command behavior.

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

var (
	goldenBinOnce sync.Once
	goldenBinPath string
	goldenBinErr  error
)

// buildGoldenBinary builds the local-search binary once per test run.
func buildGoldenBinary(t *testing.T) string {
	t.Helper()
	goldenBinOnce.Do(func() {
		dir, err := os.MkdirTemp("", "ls-golden-bin")
		if err != nil {
			goldenBinErr = err
			return
		}
		goldenBinPath = filepath.Join(dir, "local-search")
		cmd := exec.Command("go", "build", "-o", goldenBinPath, ".")
		out, err := cmd.CombinedOutput()
		if err != nil {
			goldenBinErr = fmt.Errorf("go build: %v\n%s", err, out)
		}
	})
	if goldenBinErr != nil {
		t.Fatalf("building binary: %v", goldenBinErr)
	}
	return goldenBinPath
}

// fixtureMtime is a fixed instant applied to every fixture file so mtime-derived
// output (modified fields, ordering) is stable across runs and machines.
var fixtureMtime = time.Unix(1705307400, 0) // 2024-01-15 08:30:00 UTC

// writeGoldenFixture creates a small deterministic spec repo (non-git, so the
// scan takes the FullScan path with no commit-dependent output).
func writeGoldenFixture(t *testing.T, dir string) {
	t.Helper()
	files := map[string]string{
		"guides/alpha.md": "---\ntags: alpha, beta\n---\n# Alpha Doc\n\nAlpha paragraph mentions [[Beta Doc]] here.\n",
		"guides/beta.md":  "---\ntags: beta\n---\n# Beta Doc\n\nBeta paragraph with @spec req://core/beta-req body.\n",
		"root.md":         "# Root Doc\n\nRoot content about alpha things.\n",
	}
	for rel, content := range files {
		abs := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(abs, fixtureMtime, fixtureMtime); err != nil {
			t.Fatal(err)
		}
	}
}

// runGolden executes the binary with an isolated HOME and returns stdout.
func runGolden(t *testing.T, bin, home, workDir string, args ...string) string {
	out, _ := runGoldenBoth(t, bin, home, workDir, args...)
	return out
}

// runGoldenBoth is runGolden but also returns stderr (some commands report
// their human summary on stderr, e.g. graph export).
func runGoldenBoth(t *testing.T, bin, home, workDir string, args ...string) (string, string) {
	t.Helper()
	cmd := exec.Command(bin, args...)
	cmd.Dir = workDir
	cmd.Env = append(os.Environ(), "HOME="+home)
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		t.Fatalf("%s %v: %v\nstderr: %s\nstdout: %s", bin, args, err, stderr.String(), stdout.String())
	}
	return stdout.String(), stderr.String()
}

// normalizeGolden replaces run-specific absolute paths with stable placeholders.
func normalizeGolden(out, home, repoDir, outFile string) string {
	out = strings.ReplaceAll(out, outFile, "<OUT>")
	out = strings.ReplaceAll(out, repoDir, "<REPO>")
	out = strings.ReplaceAll(out, home, "<HOME>")
	return out
}

// normalizeRepoList makes `repo list` output deterministic for goldening. Two
// sources of nondeterminism are removed: (1) the ADDED and LAST SCAN columns
// render a wall-clock-relative age (humanAge vs time.Now()) that flips between
// "—" (sub-second) and "1s" under CPU load; (2) the "—" glyph is 3 bytes but one
// display column, and fmt pads by byte width, so an "—" cell and a "1s" cell
// shift the whole row's alignment. Collapsing whitespace runs neutralizes the
// alignment, and rewriting the two age columns to a stable <AGE> neutralizes the
// value flip. Scoped to repo list so no other golden is affected.
func normalizeRepoList(out string) string {
	lines := strings.Split(strings.TrimRight(out, "\n"), "\n")
	for i, ln := range lines {
		f := strings.Fields(ln)
		// Data row: NAME ADDED LAST-SCAN LAST-UPDATE COMMIT PATH (6 fields). The
		// header splits into more fields (spaces inside "LAST SCAN"), so guard on
		// count and the NAME sentinel to touch only data rows.
		if len(f) == 6 && f[0] != "NAME" {
			f[1], f[2] = "<AGE>", "<AGE>"
		}
		lines[i] = strings.Join(f, " ")
	}
	return strings.Join(lines, "\n") + "\n"
}

// canonicalizeGraphJSON parses a NetworkX node-link JSON document and rewrites
// its rowid-based node ids deterministically: nodes are sorted by (label, path,
// project), renumbered n1..nN, links re-pointed and sorted. Everything else is
// preserved, so any behavioral change in the exported shape still fails the diff.
func canonicalizeGraphJSON(t *testing.T, raw string) string {
	t.Helper()
	var doc map[string]any
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		t.Fatalf("graph output is not valid JSON: %v\n%s", err, raw)
	}
	nodes, _ := doc["nodes"].([]any)
	sortKey := func(n map[string]any) string {
		get := func(k string) string { s, _ := n[k].(string); return s }
		return get("label") + "\x00" + get("path") + "\x00" + get("project") + "\x00" + get("name")
	}
	sort.SliceStable(nodes, func(i, j int) bool {
		a, _ := nodes[i].(map[string]any)
		b, _ := nodes[j].(map[string]any)
		return sortKey(a) < sortKey(b)
	})
	idMap := map[string]string{}
	for i, n := range nodes {
		m, _ := n.(map[string]any)
		old, _ := m["id"].(string)
		nu := fmt.Sprintf("n%d", i+1)
		idMap[old] = nu
		m["id"] = nu
	}
	doc["nodes"] = nodes
	directed, _ := doc["directed"].(bool)
	numID := func(s string) int {
		n, _ := strconv.Atoi(strings.TrimPrefix(s, "n"))
		return n
	}
	if links, ok := doc["links"].([]any); ok {
		for _, l := range links {
			m, _ := l.(map[string]any)
			for _, k := range []string{"source", "target"} {
				if s, ok := m[k].(string); ok {
					if nu, ok := idMap[s]; ok {
						m[k] = nu
					}
				}
			}
			// For undirected graphs the (source, target) orientation is
			// arbitrary; canonicalize it so run-to-run emission order of
			// symmetric pairs cannot flip the golden diff.
			if !directed {
				s, _ := m["source"].(string)
				tg, _ := m["target"].(string)
				if numID(s) > numID(tg) {
					m["source"], m["target"] = tg, s
				}
			}
		}
		sort.SliceStable(links, func(i, j int) bool {
			a, _ := links[i].(map[string]any)
			b, _ := links[j].(map[string]any)
			ak, _ := a["source"].(string)
			bk, _ := b["source"].(string)
			at, _ := a["target"].(string)
			bt, _ := b["target"].(string)
			if ak != bk {
				return ak < bk
			}
			return at < bt
		})
		doc["links"] = links
	}
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	return string(out) + "\n"
}

// checkGolden compares got against testdata/golden/<name>.golden, regenerating
// the file when UPDATE_GOLDEN=1 is set.
func checkGolden(t *testing.T, name, got string) {
	t.Helper()
	path := filepath.Join("testdata", "golden", name+".golden")
	if os.Getenv("UPDATE_GOLDEN") == "1" {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(got), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("missing golden file %s (run with UPDATE_GOLDEN=1 to create): %v", path, err)
	}
	if string(want) != got {
		t.Errorf("output of %q differs from golden file %s\n--- want ---\n%s\n--- got ---\n%s", name, path, want, got)
	}
}

// TestGoldenOutputs pins stdout of: repo list, scan, search (the query surface),
// graph export|tag|search, and json search (R-5.4 regression gate).
func TestGoldenOutputs(t *testing.T) {
	bin := buildGoldenBinary(t)

	home := t.TempDir()
	repoDir := filepath.Join(t.TempDir(), "fixture-repo")
	if err := os.MkdirAll(repoDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeGoldenFixture(t, repoDir)
	work := t.TempDir() // unrelated cwd — commands must not depend on it
	outFile := filepath.Join(t.TempDir(), "export.json")

	norm := func(s string) string { return normalizeGolden(s, home, repoDir, outFile) }

	// Setup (not goldened): register the fixture repo.
	runGolden(t, bin, home, work, "repo", "add", repoDir, "fixture")

	// repo list: the ADDED / LAST SCAN columns render a human-relative age
	// (humanAge) computed against wall-clock time.Now(). That is NOT stable —
	// sub-second elapsed renders "—" but ≥1s renders "1s", so under CPU load the
	// column flips and the diff flakes. Collapse those age tokens back to "—"
	// (scoped to this check) so the golden pins layout/columns, not machine speed.
	checkGolden(t, "repo-list", normalizeRepoList(norm(runGolden(t, bin, home, work, "repo", "list"))))

	// First scan of all registered repos.
	checkGolden(t, "scan", norm(runGolden(t, bin, home, work, "scan", "all")))

	// The query surface.
	checkGolden(t, "search", norm(runGolden(t, bin, home, work, "search", "alpha")))
	checkGolden(t, "json-search", norm(runGolden(t, bin, home, work, "json", "search", "alpha")))

	// Graph subcommands. JSON bodies are canonicalized (rowid renumbering).
	checkGolden(t, "graph-tag",
		canonicalizeGraphJSON(t, runGolden(t, bin, home, work, "graph", "tag", "beta")))
	checkGolden(t, "graph-search",
		canonicalizeGraphJSON(t, runGolden(t, bin, home, work, "graph", "search", "alpha")))

	exportStdout, exportStderr := runGoldenBoth(t, bin, home, work, "graph", "export", "fixture", "--out", outFile)
	checkGolden(t, "graph-export-stdout", norm(exportStdout+exportStderr))
	exported, err := os.ReadFile(outFile)
	if err != nil {
		t.Fatalf("graph export wrote no file: %v", err)
	}
	checkGolden(t, "graph-export-file", norm(canonicalizeGraphJSON(t, string(exported))))
}
