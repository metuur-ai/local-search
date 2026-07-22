package codegraph

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

// upstreamSchema matches code-review-graph's _SCHEMA_SQL exactly. Keeping it
// here lets tests build fixture databases without depending on the Python tool.
const upstreamSchema = `
CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  qualified_name TEXT NOT NULL UNIQUE,
  file_path TEXT NOT NULL,
  line_start INTEGER,
  line_end INTEGER,
  language TEXT,
  parent_name TEXT,
  params TEXT,
  return_type TEXT,
  modifiers TEXT,
  is_test INTEGER DEFAULT 0,
  file_hash TEXT,
  extra TEXT DEFAULT '{}',
  updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  source_qualified TEXT NOT NULL,
  target_qualified TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line INTEGER DEFAULT 0,
  extra TEXT DEFAULT '{}',
  confidence REAL DEFAULT 1.0,
  confidence_tier TEXT DEFAULT 'EXTRACTED',
  updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_qualified ON nodes(qualified_name);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_qualified);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_qualified);
`

// buildFixture writes a fresh code-review-graph SQLite into a temp file and
// returns its path. The fixture has 1 File, 3 Functions and a small CALLS
// chain so blast-radius and hubs queries have something to chew on.
//
//   File:   pkg/charge.py
//   Nodes:  pkg.charge.process_payment  (Function)
//           pkg.charge.charge_card      (Function, called BY process_payment)
//           pkg.charge.log_audit        (Function, called BY charge_card)
//           pkg.api.handle_payment      (Function, calls process_payment)
//   Edges:  CALLS handle_payment   → process_payment
//           CALLS process_payment  → charge_card
//           CALLS charge_card      → log_audit
func buildFixture(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "graph.sqlite")

	db, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec(upstreamSchema); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	type node struct {
		kind, name, qualified, file string
		line                        int
	}
	nodes := []node{
		{"File", "charge.py", "pkg/charge.py", "pkg/charge.py", 0},
		{"Function", "process_payment", "pkg.charge.process_payment", "pkg/charge.py", 10},
		{"Function", "charge_card", "pkg.charge.charge_card", "pkg/charge.py", 50},
		{"Function", "log_audit", "pkg.charge.log_audit", "pkg/charge.py", 90},
		{"Function", "handle_payment", "pkg.api.handle_payment", "pkg/api.py", 7},
	}
	for _, n := range nodes {
		_, err := db.Exec(`INSERT INTO nodes
			(kind, name, qualified_name, file_path, line_start, line_end, language, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, 'python', 1.0)`,
			n.kind, n.name, n.qualified, n.file, n.line, n.line+5)
		if err != nil {
			t.Fatalf("insert node %s: %v", n.qualified, err)
		}
	}
	type edge struct{ src, dst string }
	edges := []edge{
		{"pkg.api.handle_payment", "pkg.charge.process_payment"},
		{"pkg.charge.process_payment", "pkg.charge.charge_card"},
		{"pkg.charge.charge_card", "pkg.charge.log_audit"},
	}
	for _, e := range edges {
		_, err := db.Exec(`INSERT INTO edges
			(kind, source_qualified, target_qualified, file_path, updated_at)
			VALUES ('CALLS', ?, ?, 'pkg/charge.py', 1.0)`, e.src, e.dst)
		if err != nil {
			t.Fatalf("insert edge: %v", err)
		}
	}
	return path
}

func TestDetect_Missing(t *testing.T) {
	dir := t.TempDir()
	info := Detect(dir)
	if info.Path != "" || info.MTime != 0 || info.NodeCount != 0 {
		t.Fatalf("expected zero Info, got %+v", info)
	}
}

func TestDetect_PresentAtConventionalPath(t *testing.T) {
	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, ".code-review-graph"), 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	// Build the fixture, then move it into the conventional location.
	src := buildFixture(t)
	dst := filepath.Join(repo, DBRelPath)
	if err := os.Rename(src, dst); err != nil {
		t.Fatalf("rename: %v", err)
	}

	info := Detect(repo)
	if info.Path != dst {
		t.Fatalf("Detect.Path = %q, want %q", info.Path, dst)
	}
	if info.NodeCount != 5 {
		t.Fatalf("Detect.NodeCount = %d, want 5", info.NodeCount)
	}
	if info.MTime == 0 {
		t.Fatal("Detect.MTime should be non-zero for an existing file")
	}
}

// TestDetect_FindsGraphDB regression-tests a real-world path where the
// upstream tool wrote `.code-review-graph/graph.db` (not `.sqlite`). Earlier
// versions of Detect hardcoded the .sqlite filename and missed this.
func TestDetect_FindsGraphDB(t *testing.T) {
	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, DirName), 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	src := buildFixture(t)
	dst := filepath.Join(repo, DirName, "graph.db")
	if err := os.Rename(src, dst); err != nil {
		t.Fatalf("rename: %v", err)
	}

	info := Detect(repo)
	if info.Path != dst {
		t.Fatalf("Detect.Path = %q, want %q (graph.db must be probed)", info.Path, dst)
	}
	if info.NodeCount != 5 {
		t.Fatalf("Detect.NodeCount = %d, want 5", info.NodeCount)
	}
}

// TestDetect_FallsBackToSchemaProbe ensures Detect finds an arbitrarily-named
// SQLite file in .code-review-graph/ as long as its schema matches.
func TestDetect_FallsBackToSchemaProbe(t *testing.T) {
	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, DirName), 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	src := buildFixture(t)
	// Use a non-conventional name so neither well-known filename matches.
	dst := filepath.Join(repo, DirName, "custom-name.db")
	if err := os.Rename(src, dst); err != nil {
		t.Fatalf("rename: %v", err)
	}

	info := Detect(repo)
	if info.Path != dst {
		t.Fatalf("Detect.Path = %q, want schema-probe to find %q", info.Path, dst)
	}
}

// TestDetect_IgnoresUnrelatedSQLite ensures Detect doesn't mistake a random
// SQLite file (e.g. a cache db with a different schema) for a code-graph.
func TestDetect_IgnoresUnrelatedSQLite(t *testing.T) {
	repo := t.TempDir()
	cgDir := filepath.Join(repo, DirName)
	if err := os.MkdirAll(cgDir, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	// A SQLite file that is NOT a code-graph.
	other := filepath.Join(cgDir, "stranger.db")
	db, err := sql.Open("sqlite", "file:"+other)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE unrelated(id INTEGER)`); err != nil {
		t.Fatalf("create: %v", err)
	}
	db.Close()

	info := Detect(repo)
	if info.Path != "" {
		t.Fatalf("expected zero-value Info for unrelated SQLite, got %+v", info)
	}
}

func TestLooksLikeCodeReviewGraph_True(t *testing.T) {
	path := buildFixture(t)
	if !LooksLikeCodeReviewGraph(path) {
		t.Fatal("expected fixture to be recognised as code-review-graph")
	}
}

func TestLooksLikeCodeReviewGraph_FalseForUnknownSchema(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "other.sqlite")
	db, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE foo(id INTEGER)`); err != nil {
		t.Fatalf("create: %v", err)
	}
	db.Close()
	if LooksLikeCodeReviewGraph(path) {
		t.Fatal("expected non-code-review-graph SQLite to be rejected")
	}
}

func TestLooksLikeCodeReviewGraph_FalseForMissingFile(t *testing.T) {
	if LooksLikeCodeReviewGraph(filepath.Join(t.TempDir(), "missing.sqlite")) {
		t.Fatal("expected missing file to be rejected")
	}
}

func openFixture(t *testing.T) *DB {
	t.Helper()
	path := buildFixture(t)
	st, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	d, err := Open("test-repo", path, st.ModTime().Unix())
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if d == nil {
		t.Fatal("Open returned nil for existing file")
	}
	return d
}

func TestFindNodes_NameMatch(t *testing.T) {
	d := openFixture(t)
	hits, err := d.FindNodes("process_payment", 10)
	if err != nil {
		t.Fatalf("FindNodes: %v", err)
	}
	if len(hits) == 0 {
		t.Fatal("expected at least one hit for process_payment")
	}
	// Exact-name match should sort first.
	if hits[0].Name != "process_payment" {
		t.Fatalf("first hit name = %q, want process_payment", hits[0].Name)
	}
	if hits[0].Repo != "test-repo" {
		t.Fatalf("first hit repo = %q, want test-repo", hits[0].Repo)
	}
}

func TestFindNodes_NoMatch(t *testing.T) {
	d := openFixture(t)
	hits, err := d.FindNodes("does_not_exist", 10)
	if err != nil {
		t.Fatalf("FindNodes: %v", err)
	}
	if len(hits) != 0 {
		t.Fatalf("expected no hits, got %d", len(hits))
	}
}

func TestCallersOf(t *testing.T) {
	d := openFixture(t)
	callers, err := d.CallersOf("pkg.charge.process_payment")
	if err != nil {
		t.Fatalf("CallersOf: %v", err)
	}
	if len(callers) != 1 || callers[0].QualifiedName != "pkg.api.handle_payment" {
		t.Fatalf("CallersOf returned %+v", callers)
	}
}

func TestCalleesOf(t *testing.T) {
	d := openFixture(t)
	callees, err := d.CalleesOf("pkg.charge.process_payment")
	if err != nil {
		t.Fatalf("CalleesOf: %v", err)
	}
	if len(callees) != 1 || callees[0].QualifiedName != "pkg.charge.charge_card" {
		t.Fatalf("CalleesOf returned %+v", callees)
	}
}

func TestBlastRadius_Depth1(t *testing.T) {
	d := openFixture(t)
	out, err := d.BlastRadius("pkg.charge.process_payment", 1, 50)
	if err != nil {
		t.Fatalf("BlastRadius: %v", err)
	}
	got := qualifiedNameSet(out)
	want := map[string]bool{
		"pkg.api.handle_payment":     true,
		"pkg.charge.charge_card":     true,
	}
	if !setsEqual(got, want) {
		t.Fatalf("depth-1 blast = %v, want %v", got, want)
	}
}

func TestBlastRadius_Depth2(t *testing.T) {
	d := openFixture(t)
	out, err := d.BlastRadius("pkg.charge.process_payment", 2, 50)
	if err != nil {
		t.Fatalf("BlastRadius: %v", err)
	}
	got := qualifiedNameSet(out)
	// Depth 2 reaches log_audit (charge_card → log_audit).
	if !got["pkg.charge.log_audit"] {
		t.Fatalf("depth-2 blast should include log_audit, got %v", got)
	}
}

func TestBlastRadius_CapBoundsResultSize(t *testing.T) {
	d := openFixture(t)
	out, err := d.BlastRadius("pkg.charge.process_payment", 5, 1)
	if err != nil {
		t.Fatalf("BlastRadius: %v", err)
	}
	if len(out) > 1 {
		t.Fatalf("expected at most 1 node with cap=1, got %d", len(out))
	}
}

func TestBlastRadius_UnknownSeed(t *testing.T) {
	d := openFixture(t)
	out, err := d.BlastRadius("nope.nothing", 2, 50)
	if err != nil {
		t.Fatalf("BlastRadius: %v", err)
	}
	if len(out) != 0 {
		t.Fatalf("expected no results for unknown seed, got %v", qualifiedNameSet(out))
	}
}

func TestHubNodes_OrderedByOutDegree(t *testing.T) {
	d := openFixture(t)
	hubs, err := d.HubNodes(10)
	if err != nil {
		t.Fatalf("HubNodes: %v", err)
	}
	if len(hubs) == 0 {
		t.Fatal("expected at least one hub")
	}
	// Hubs must be sorted by OutDegree descending.
	for i := 1; i < len(hubs); i++ {
		if hubs[i].OutDegree > hubs[i-1].OutDegree {
			t.Fatalf("hubs not sorted desc: %+v", hubs)
		}
	}
	// process_payment, charge_card, handle_payment each have out-degree 1.
	// Top hub should be one of them.
	top := hubs[0].Node.QualifiedName
	if top != "pkg.api.handle_payment" &&
		top != "pkg.charge.process_payment" &&
		top != "pkg.charge.charge_card" {
		t.Fatalf("unexpected top hub: %s", top)
	}
}

func TestOutDegreeOf(t *testing.T) {
	d := openFixture(t)
	deg, err := d.OutDegreeOf("pkg.charge.process_payment")
	if err != nil {
		t.Fatalf("OutDegreeOf: %v", err)
	}
	if deg != 1 {
		t.Fatalf("OutDegreeOf process_payment = %d, want 1", deg)
	}
	deg, err = d.OutDegreeOf("pkg.charge.log_audit")
	if err != nil {
		t.Fatalf("OutDegreeOf: %v", err)
	}
	if deg != 0 {
		t.Fatalf("OutDegreeOf log_audit = %d, want 0", deg)
	}
}

func TestOpen_CachesByPathAndMtime(t *testing.T) {
	path := buildFixture(t)
	st, _ := os.Stat(path)
	d1, err := Open("repo", path, st.ModTime().Unix())
	if err != nil {
		t.Fatalf("Open #1: %v", err)
	}
	d2, err := Open("repo", path, st.ModTime().Unix())
	if err != nil {
		t.Fatalf("Open #2: %v", err)
	}
	if d1 != d2 {
		t.Fatal("Open should return cached *DB for identical (path, mtime)")
	}
}

func TestOpen_MissingFileReturnsNilNoErr(t *testing.T) {
	d, err := Open("repo", filepath.Join(t.TempDir(), "missing.sqlite"), 0)
	if err != nil {
		t.Fatalf("expected no error for missing file, got %v", err)
	}
	if d != nil {
		t.Fatal("expected nil DB for missing file")
	}
}

func TestMissingInstructions_ContainsRepoPath(t *testing.T) {
	repo := t.TempDir()
	msg := MissingInstructions(repo)
	if !strings.Contains(msg, repo) {
		t.Fatalf("MissingInstructions should mention %q, got %q", repo, msg)
	}
	if !strings.Contains(msg, "code-review-graph") {
		t.Fatalf("MissingInstructions should mention code-review-graph, got %q", msg)
	}
}

func TestCountNodes_OnFreshFixture(t *testing.T) {
	path := buildFixture(t)
	if n := CountNodes(path); n != 5 {
		t.Fatalf("CountNodes = %d, want 5", n)
	}
}

func TestCountNodes_MissingFileReturnsZero(t *testing.T) {
	if n := CountNodes(filepath.Join(t.TempDir(), "missing.sqlite")); n != 0 {
		t.Fatalf("CountNodes on missing file = %d, want 0", n)
	}
}

// ── helpers ─────────────────────────────────────────────────────────────────

func qualifiedNameSet(nodes []Node) map[string]bool {
	out := make(map[string]bool, len(nodes))
	for _, n := range nodes {
		out[n.QualifiedName] = true
	}
	return out
}

func setsEqual(a, b map[string]bool) bool {
	if len(a) != len(b) {
		return false
	}
	for k := range a {
		if !b[k] {
			return false
		}
	}
	return true
}
