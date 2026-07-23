package db

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"local-search/embed"
)

// insertSpecFull inserts a spec plus its spec_tags rows and returns the new id.
func insertSpecFull(t *testing.T, db *sql.DB, repo, path, name, title, tags, content string) int64 {
	t.Helper()
	res, err := db.Exec(
		"INSERT INTO specs (repo, path, project, name, title, tags, summary, fullpath, modified, size, ext, content) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
		repo, path, "proj", name, title, tags, "sum", "/tmp/"+name, "2024-01-01", 10, ".md", content)
	if err != nil {
		t.Fatalf("insert spec: %v", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		t.Fatalf("last insert id: %v", err)
	}
	for _, tg := range splitTags(tags) {
		if _, err := db.Exec("INSERT INTO spec_tags (spec_id, tag) VALUES (?,?)", id, tg); err != nil {
			t.Fatalf("insert tag: %v", err)
		}
	}
	return id
}

// insertVector stores an embedding for a spec so vector edges can be built.
func insertVector(t *testing.T, db *sql.DB, id int64, repo, text string) {
	t.Helper()
	v := embed.Embed(text)
	blob := embed.Encode(v)
	if _, err := db.Exec("INSERT INTO spec_vectors (spec_id, repo, dim, vec) VALUES (?,?,?,?)",
		id, repo, len(v), blob); err != nil {
		t.Fatalf("insert vector: %v", err)
	}
}

func nodeByID(g NodeLinkGraph, id string) (GraphNode, bool) {
	for _, n := range g.Nodes {
		if n.ID == id {
			return n, true
		}
	}
	return GraphNode{}, false
}

func TestRepoGraph_RichNodes(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	id := insertSpecFull(t, db, "r1", "docs/api.md", "api", "API Reference", "go, http", "body")
	insertSpecFull(t, db, "r1", "docs/auth.md", "auth", "", "security", "body")

	g, err := RepoGraph(db, "r1", "nodes", false, 0.3, 8)
	if err != nil {
		t.Fatalf("RepoGraph: %v", err)
	}
	if len(g.Nodes) != 2 {
		t.Fatalf("want 2 nodes, got %d", len(g.Nodes))
	}
	n, ok := nodeByID(g, itoa(id))
	if !ok {
		t.Fatalf("node %d missing", id)
	}
	if n.Label != "API Reference" || n.NormLabel != "api reference" {
		t.Errorf("label/norm_label = %q/%q", n.Label, n.NormLabel)
	}
	if n.Name != "api" || n.Title != "API Reference" || n.Summary != "sum" {
		t.Errorf("identity fields wrong: %+v", n)
	}
	if n.FileType != "md" {
		t.Errorf("file_type = %q, want md", n.FileType)
	}
	if len(n.Tags) != 2 || n.Tags[0] != "go" || n.Tags[1] != "http" {
		t.Errorf("tags = %v, want [go http]", n.Tags)
	}
	if n.Content != "" {
		t.Errorf("content should be omitted without --include-content, got %q", n.Content)
	}
	// A spec with an empty title falls back to name for the label.
	if n2, ok := nodeByID(g, itoa(id+1)); !ok || n2.Label != "auth" {
		t.Errorf("empty-title label fallback failed: %+v", n2)
	}
}

func TestRepoGraph_IncludeContent(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	id := insertSpecFull(t, db, "r1", "a.md", "a", "A", "x", "hello world")

	g, err := RepoGraph(db, "r1", "nodes", true, 0.3, 8)
	if err != nil {
		t.Fatalf("RepoGraph: %v", err)
	}
	n, _ := nodeByID(g, itoa(id))
	if n.Content != "hello world" {
		t.Errorf("content = %q, want 'hello world'", n.Content)
	}
}

func TestRepoGraph_NodesModeNoLinks(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	a := insertSpecFull(t, db, "r1", "a.md", "a", "A", "shared", "x")
	b := insertSpecFull(t, db, "r1", "b.md", "b", "B", "shared", "x")
	insertVector(t, db, a, "r1", "same text")
	insertVector(t, db, b, "r1", "same text")

	g, err := RepoGraph(db, "r1", "nodes", false, 0.3, 8)
	if err != nil {
		t.Fatalf("RepoGraph: %v", err)
	}
	if len(g.Links) != 0 {
		t.Fatalf("nodes mode must have 0 links, got %d", len(g.Links))
	}
}

func TestRepoGraph_TagEdges(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	insertSpecFull(t, db, "r1", "a.md", "a", "A", "payments, refund", "x")
	insertSpecFull(t, db, "r1", "b.md", "b", "B", "payments, billing", "x")
	insertSpecFull(t, db, "r1", "c.md", "c", "C", "unrelated", "x")

	g, err := RepoGraph(db, "r1", "tags", false, 0.3, 8)
	if err != nil {
		t.Fatalf("RepoGraph: %v", err)
	}
	if len(g.Nodes) != 3 {
		t.Fatalf("want 3 nodes, got %d", len(g.Nodes))
	}
	// a & b share "payments"; c shares nothing → exactly one link.
	if len(g.Links) != 1 {
		t.Fatalf("want 1 tag link, got %d (%+v)", len(g.Links), g.Links)
	}
	if g.Links[0].Weight <= 0 || g.Links[0].Weight > 1 {
		t.Errorf("jaccard weight out of range: %v", g.Links[0].Weight)
	}
}

func TestRepoGraph_VectorEdges(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	a := insertSpecFull(t, db, "r1", "a.md", "a", "A", "", "x")
	b := insertSpecFull(t, db, "r1", "b.md", "b", "B", "", "x")
	// Identical text → identical embeddings → cosine 1.0 ≥ 0.3 → one edge.
	insertVector(t, db, a, "r1", "identical content here")
	insertVector(t, db, b, "r1", "identical content here")

	g, err := RepoGraph(db, "r1", "vector", false, 0.3, 8)
	if err != nil {
		t.Fatalf("RepoGraph: %v", err)
	}
	if len(g.Links) != 1 {
		t.Fatalf("want 1 vector link, got %d", len(g.Links))
	}
	if g.Links[0].Weight < 0.99 {
		t.Errorf("identical vectors should be ~1.0, got %v", g.Links[0].Weight)
	}
}

func TestRepoHasVectors(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	a := insertSpecFull(t, db, "r1", "a.md", "a", "A", "", "x")
	insertSpecFull(t, db, "r2", "b.md", "b", "B", "", "x")
	insertVector(t, db, a, "r1", "text")

	if ok, err := RepoHasVectors(db, "r1"); err != nil || !ok {
		t.Errorf("r1 should have vectors: ok=%v err=%v", ok, err)
	}
	if ok, err := RepoHasVectors(db, "r2"); err != nil || ok {
		t.Errorf("r2 should have no vectors: ok=%v err=%v", ok, err)
	}
}

func TestWriteJSONFile_RoundTrip(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	insertSpecFull(t, db, "r1", "a.md", "a", "A", "go, http", "x")

	g, err := RepoGraph(db, "r1", "nodes", false, 0.3, 8)
	if err != nil {
		t.Fatalf("RepoGraph: %v", err)
	}
	out := filepath.Join(t.TempDir(), "g.json")
	if err := WriteJSONFile(out, g); err != nil {
		t.Fatalf("WriteJSONFile: %v", err)
	}
	raw, err := os.ReadFile(out)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	var back struct {
		Nodes []struct {
			ID   string   `json:"id"`
			Tags []string `json:"tags"`
		} `json:"nodes"`
		Links []any `json:"links"`
	}
	if err := json.Unmarshal(raw, &back); err != nil {
		t.Fatalf("unmarshal exported file: %v", err)
	}
	if len(back.Nodes) != 1 || len(back.Nodes[0].Tags) != 2 {
		t.Fatalf("round-trip lost data: %+v", back)
	}
}

// itoa mirrors the node id format (spec int64 id as a decimal string) so tests
// can look nodes up by id.
func itoa(id int64) string { return strconv.FormatInt(id, 10) }
