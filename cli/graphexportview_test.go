package main

// Tests for `graph export-view` (multi-repo merge). The subprocess tests reuse
// the golden harness (buildGoldenBinary / writeGoldenFixture / runGoldenBoth)
// from golden_test.go. Requirement ids refer to docs/ears/graph-export-view-multi-repo.md.

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	localdb "local-search/db"
)

// nlCount is a minimal view of a NetworkX node-link doc for counting.
type nlCount struct {
	Nodes []json.RawMessage `json:"nodes"`
	Links []json.RawMessage `json:"links"`
}

func readNL(t *testing.T, path string) nlCount {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var d nlCount
	if err := json.Unmarshal(b, &d); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
	return d
}

// runRaw runs the binary and returns stdout, stderr, and the process exit error
// (nil on success). Unlike runGoldenBoth it never fails the test on a non-zero
// exit, so error-path requirements can assert the exit themselves.
func runRaw(t *testing.T, bin, home, workDir string, stdin *os.File, args ...string) (string, string, error) {
	t.Helper()
	cmd := exec.Command(bin, args...)
	cmd.Dir = workDir
	cmd.Env = append(os.Environ(), "HOME="+home)
	if stdin != nil {
		cmd.Stdin = stdin
	}
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	return stdout.String(), stderr.String(), err
}

// setupTwoRepos registers and scans two fixture repos ("alpha", "beta") in a
// fresh HOME and returns (bin, home, work).
func setupTwoRepos(t *testing.T) (string, string, string) {
	t.Helper()
	bin := buildGoldenBinary(t)
	home := t.TempDir()
	work := t.TempDir()

	for _, name := range []string{"alpha", "beta"} {
		dir := filepath.Join(t.TempDir(), name)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		writeGoldenFixture(t, dir)
		runGoldenBoth(t, bin, home, work, "repo", "add", dir, name)
	}
	runGoldenBoth(t, bin, home, work, "scan", "all")
	return bin, home, work
}

// TestGraphExportViewMerge covers the happy path: R-4.3 (counts == sum),
// R-5.2 (stdout empty, summary on stderr), R-5.4 (byte-identical across runs).
func TestGraphExportViewMerge(t *testing.T) {
	bin, home, work := setupTwoRepos(t)
	dir := t.TempDir()
	aOut := filepath.Join(dir, "a.json")
	bOut := filepath.Join(dir, "b.json")
	v1 := filepath.Join(dir, "v1.json")
	v2 := filepath.Join(dir, "v2.json")

	// Per-repo single exports → establish the expected sum.
	runGoldenBoth(t, bin, home, work, "graph", "export", "alpha", "--out", aOut)
	runGoldenBoth(t, bin, home, work, "graph", "export", "beta", "--out", bOut)
	ca, cb := readNL(t, aOut), readNL(t, bOut)
	wantNodes := len(ca.Nodes) + len(cb.Nodes)
	wantLinks := len(ca.Links) + len(cb.Links)

	// Merged export-view, run twice.
	stdout1, stderr1, err := runRaw(t, bin, home, work, nil, "graph", "export-view", "--repos", "alpha,beta", "--out", v1)
	if err != nil {
		t.Fatalf("export-view run 1 failed: %v\nstderr: %s", err, stderr1)
	}
	_, _, err = runRaw(t, bin, home, work, nil, "graph", "export-view", "--repos", "alpha,beta", "--out", v2)
	if err != nil {
		t.Fatalf("export-view run 2 failed: %v", err)
	}

	// R-5.2: stdout must be empty; summary on stderr.
	if stdout1 != "" {
		t.Errorf("R-5.2: stdout must be empty, got %q", stdout1)
	}
	if !strings.Contains(stderr1, "wrote ") || !strings.Contains(stderr1, "repo(s)") {
		t.Errorf("R-5.2: expected summary on stderr, got %q", stderr1)
	}

	// R-5.4: byte-identical output files.
	b1, _ := os.ReadFile(v1)
	b2, _ := os.ReadFile(v2)
	if string(b1) != string(b2) {
		t.Errorf("R-5.4: outputs differ across runs")
	}

	// R-4.3: merged counts == sum of inputs.
	cm := readNL(t, v1)
	if len(cm.Nodes) != wantNodes {
		t.Errorf("R-4.3: merged nodes=%d want %d", len(cm.Nodes), wantNodes)
	}
	if len(cm.Links) != wantLinks {
		t.Errorf("R-4.3: merged links=%d want %d", len(cm.Links), wantLinks)
	}
}

// TestGraphExportViewDedup covers R-2.8: --repos alpha,alpha yields one alpha.
func TestGraphExportViewDedup(t *testing.T) {
	bin, home, work := setupTwoRepos(t)
	dir := t.TempDir()
	single := filepath.Join(dir, "single.json")
	dup := filepath.Join(dir, "dup.json")

	runGoldenBoth(t, bin, home, work, "graph", "export-view", "--repos", "alpha", "--out", single)
	runGoldenBoth(t, bin, home, work, "graph", "export-view", "--repos", "alpha,alpha", "--out", dup)

	cs, cd := readNL(t, single), readNL(t, dup)
	if len(cs.Nodes) != len(cd.Nodes) || len(cs.Links) != len(cd.Links) {
		t.Errorf("R-2.8: alpha,alpha not deduped: single=%d/%d dup=%d/%d",
			len(cs.Nodes), len(cs.Links), len(cd.Nodes), len(cd.Links))
	}
}

// TestGraphExportViewNonTTY covers R-2.6: no flags + non-TTY stdin → non-zero,
// usage on stderr, and returns promptly (never blocks on stdin).
func TestGraphExportViewNonTTY(t *testing.T) {
	bin, home, work := setupTwoRepos(t)

	devnull, err := os.Open(os.DevNull)
	if err != nil {
		t.Fatal(err)
	}
	defer devnull.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, bin, "graph", "export-view")
	cmd.Dir = work
	cmd.Env = append(os.Environ(), "HOME="+home)
	cmd.Stdin = devnull
	var stderr strings.Builder
	cmd.Stderr = &stderr
	runErr := cmd.Run()

	if ctx.Err() == context.DeadlineExceeded {
		t.Fatalf("R-2.6: command hung waiting on stdin")
	}
	if runErr == nil {
		t.Fatalf("R-2.6: expected non-zero exit, got success")
	}
	if !strings.Contains(stderr.String(), "Usage:") {
		t.Errorf("R-2.6: expected usage on stderr, got %q", stderr.String())
	}
}

// TestGraphExportViewUnknownRepo covers R-2.3: unknown name → non-zero + list.
func TestGraphExportViewUnknownRepo(t *testing.T) {
	bin, home, work := setupTwoRepos(t)
	_, stderr, err := runRaw(t, bin, home, work, nil, "graph", "export-view", "--repos", "nope")
	if err == nil {
		t.Fatalf("R-2.3: expected non-zero exit for unknown repo")
	}
	if !strings.Contains(stderr, "unknown repo") {
		t.Errorf("R-2.3: expected 'unknown repo' error, got %q", stderr)
	}
	if !strings.Contains(stderr, "alpha") || !strings.Contains(stderr, "beta") {
		t.Errorf("R-2.3: expected registered-repo list, got %q", stderr)
	}
}

// TestGraphExportViewBadEdges covers R-1.5: invalid --edges → non-zero naming set.
func TestGraphExportViewBadEdges(t *testing.T) {
	bin, home, work := setupTwoRepos(t)
	_, stderr, err := runRaw(t, bin, home, work, nil,
		"graph", "export-view", "--repos", "alpha", "--edges", "bogus")
	if err == nil {
		t.Fatalf("R-1.5: expected non-zero exit for bad --edges")
	}
	if !strings.Contains(stderr, "auto|vector|tags|nodes") {
		t.Errorf("R-1.5: expected accepted-values in error, got %q", stderr)
	}
}

// TestGraphExportViewBadIndexStdin covers R-2.7 at the subprocess level. A piped
// stdin is not a TTY, so the headless guard (R-2.6) fires first and the command
// exits non-zero without reading — the observable contract (non-zero exit, no
// arbitrary pick) still holds. The live out-of-range parse path needs a pty and
// is verified manually.
func TestGraphExportViewBadIndexStdin(t *testing.T) {
	bin, home, work := setupTwoRepos(t)

	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		w.WriteString("9\n")
		w.Close()
	}()
	defer r.Close()

	_, _, runErr := runRaw(t, bin, home, work, r, "graph", "export-view")
	if runErr == nil {
		t.Fatalf("R-2.7/R-2.6: expected non-zero exit for no-flags piped stdin")
	}
}

// TestMergeGraphs unit-tests the merge helper directly for R-4.1/4.2/4.3/4.5,
// R-5.3, R-5.5 — cheaper and more precise than grepping JSON.
func TestMergeGraphs(t *testing.T) {
	// Two repos, each with node id "1" (rowid collision) and a link 1→1.
	mk := func(repo string) repoGraph {
		return repoGraph{
			repo: repo,
			g: localdb.NodeLinkGraph{
				Nodes: []localdb.GraphNode{
					{ID: "2", Path: repo + "/b.md"},
					{ID: "1", Path: repo + "/a.md"},
				},
				Links: []localdb.GraphLink{
					{Source: "1", Target: "2", Weight: 0.9},
					{Source: "1", Target: "2", Relation: "depends_on"}, // dup endpoints, real
				},
			},
		}
	}
	// Pass in reverse name order to prove the merge doesn't rely on input order.
	merged := mergeGraphs([]repoGraph{mk("beta"), mk("alpha")})

	// R-4.3: counts == sum.
	if len(merged.Nodes) != 4 || len(merged.Links) != 4 {
		t.Fatalf("R-4.3: got %d nodes, %d links; want 4/4", len(merged.Nodes), len(merged.Links))
	}

	// R-4.1 + R-5.3: node ids repo-prefixed and sorted ascending; R-4.5 collision-safe.
	wantIDs := []string{"alpha:1", "alpha:2", "beta:1", "beta:2"}
	for i, want := range wantIDs {
		if merged.Nodes[i].ID != want {
			t.Errorf("R-4.1/5.3: node[%d].id=%q want %q", i, merged.Nodes[i].ID, want)
		}
	}

	// R-4.2: link endpoints prefixed with owning repo.
	for _, l := range merged.Links {
		if !strings.HasPrefix(l.Source, "alpha:") && !strings.HasPrefix(l.Source, "beta:") {
			t.Errorf("R-4.2: link source not prefixed: %q", l.Source)
		}
		if !strings.HasPrefix(l.Target, "alpha:") && !strings.HasPrefix(l.Target, "beta:") {
			t.Errorf("R-4.2: link target not prefixed: %q", l.Target)
		}
	}

	// R-5.3 stable: the two alpha 1→2 links keep weight-first, relation-second order.
	if merged.Links[0].Source != "alpha:1" || merged.Links[0].Weight != 0.9 {
		t.Errorf("R-5.3: expected weight link first, got %+v", merged.Links[0])
	}
	if merged.Links[1].Relation != "depends_on" {
		t.Errorf("R-5.3: expected relation link second, got %+v", merged.Links[1])
	}

	// R-5.5: metadata.
	if merged.Directed || merged.Multigraph {
		t.Errorf("R-5.5: directed/multigraph must be false")
	}
	repos, _ := merged.Graph["repos"].([]string)
	if len(repos) != 2 || repos[0] != "alpha" || repos[1] != "beta" {
		t.Errorf("R-5.5: graph.repos=%v want [alpha beta]", merged.Graph["repos"])
	}

	// Invariant: path preserved untouched.
	if merged.Nodes[0].Path != "alpha/a.md" {
		t.Errorf("path mutated: %q", merged.Nodes[0].Path)
	}
}

// TestMergeGraphsStableLinkOrder guards R-5.3's requirement that merged links are
// sorted with a STABLE sort. A similarity link and multiple typed-kg links can
// share the same (Source,Target) pair, so their relative input order must survive
// the sort. This test builds a run of 16 links all on the same endpoint pair — Go's
// pdqsort permutes ties above the n<=12 insertion-sort threshold, so an unstable
// sort.Slice would reorder them and fail here, while sort.SliceStable preserves them.
func TestMergeGraphsStableLinkOrder(t *testing.T) {
	const n = 16
	// The run of 16 tied links is flanked by links on a higher-sorting pair
	// (9->NN) and a lower-sorting pair (0->NN). Under Go's pdqsort (sort.Slice),
	// partitioning around these neighbors swaps elements *inside* the tied block,
	// permuting r00..r15; sort.SliceStable leaves them in input order. Without the
	// flanking pairs a fully-equal slice is left untouched even by sort.Slice, so
	// they are essential to make this test discriminating.
	var links []localdb.GraphLink
	for i := 0; i < 8; i++ {
		links = append(links, localdb.GraphLink{Source: "9", Target: fmt.Sprintf("%02d", i)})
	}
	for i := 0; i < n; i++ {
		links = append(links, localdb.GraphLink{
			Source:   "1",
			Target:   "2",
			Relation: fmt.Sprintf("r%02d", i), // r00..r15 in input order
		})
	}
	for i := 0; i < 8; i++ {
		links = append(links, localdb.GraphLink{Source: "0", Target: fmt.Sprintf("%02d", i)})
	}
	pr := repoGraph{
		repo: "alpha",
		g: localdb.NodeLinkGraph{
			Nodes: []localdb.GraphNode{
				{ID: "0", Path: "alpha/z.md"},
				{ID: "1", Path: "alpha/a.md"},
				{ID: "2", Path: "alpha/b.md"},
				{ID: "9", Path: "alpha/y.md"},
			},
			Links: links,
		},
	}

	merged := mergeGraphs([]repoGraph{pr})

	// Filter to the single (alpha:1 -> alpha:2) endpoint pair and check the
	// Relation sequence is still ascending r00..r15 (stable order preserved).
	var got []string
	for _, l := range merged.Links {
		if l.Source == "alpha:1" && l.Target == "alpha:2" {
			got = append(got, l.Relation)
		}
	}
	if len(got) != n {
		t.Fatalf("expected %d links on the shared endpoint pair, got %d", n, len(got))
	}
	for i := 0; i < n; i++ {
		want := fmt.Sprintf("r%02d", i)
		if got[i] != want {
			t.Fatalf("R-5.3: unstable link order at index %d: got %q want %q (full sequence: %v)",
				i, got[i], want, got)
		}
	}
}

// TestDedupSort unit-tests the dedup+sort helper (R-2.8, R-3.3).
func TestDedupSort(t *testing.T) {
	got := dedupSort([]string{"beta", "alpha", "beta", "alpha", "gamma"})
	want := []string{"alpha", "beta", "gamma"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("dedupSort=%v want %v", got, want)
	}
}
