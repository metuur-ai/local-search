package db

import (
	"database/sql"
	"path/filepath"
	"testing"

	"local-search/extract"
)

// openKGTestDB returns a schema-initialized DB in a temp dir.
func openKGTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "specs.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := CreateSchema(db); err != nil {
		t.Fatalf("CreateSchema: %v", err)
	}
	return db
}

// kgApply mimics a scan's kg write path: raw decls/edges per spec, then the
// GLOBAL resolution pass, all in one transaction (R-3.1).
func kgApply(t *testing.T, db *sql.DB, specs ...*extract.Spec) {
	t.Helper()
	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("Begin: %v", err)
	}
	defer tx.Rollback() //nolint:errcheck
	for _, sp := range specs {
		if err := insertKGSpec(tx, sp); err != nil {
			t.Fatalf("insertKGSpec(%s/%s): %v", sp.Repo, sp.Path, err)
		}
	}
	if err := resolveKG(tx); err != nil {
		t.Fatalf("resolveKG: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("Commit: %v", err)
	}
}

type kgNodeRow struct {
	id, kind, repo, path, title, flags, provenance string
}

func kgNode(t *testing.T, db *sql.DB, id string) (kgNodeRow, bool) {
	t.Helper()
	var r kgNodeRow
	err := db.QueryRow(
		"SELECT id,kind,repo,path,title,flags,provenance FROM kg_nodes WHERE id=?", id,
	).Scan(&r.id, &r.kind, &r.repo, &r.path, &r.title, &r.flags, &r.provenance)
	if err == sql.ErrNoRows {
		return r, false
	}
	if err != nil {
		t.Fatalf("query kg_nodes[%s]: %v", id, err)
	}
	return r, true
}

func kgCount(t *testing.T, db *sql.DB, query string, args ...any) int {
	t.Helper()
	var n int
	if err := db.QueryRow(query, args...).Scan(&n); err != nil {
		t.Fatalf("count %q: %v", query, err)
	}
	return n
}

// ── task 0.3: schema version bump + kg table shapes ──────────────────────────

// TestKGSchema_Task03_VersionBumpAndTableShapes pins the schemaVersion 1→2
// bump and the canonical-string-ID shapes of the kg tables: TEXT primary keys,
// never rowid-derived integer keys (LLD schema constraint).
func TestKGSchema_Task03_VersionBumpAndTableShapes(t *testing.T) {
	if schemaVersion != 2 {
		t.Fatalf("schemaVersion = %d, want 2 (kg tables bump)", schemaVersion)
	}
	db := openKGTestDB(t)

	type col struct {
		name, typ string
		pk        int
	}
	tableCols := func(table string) map[string]col {
		rows, err := db.Query("SELECT name, type, pk FROM pragma_table_info(?)", table)
		if err != nil {
			t.Fatalf("table_info(%s): %v", table, err)
		}
		defer rows.Close()
		out := map[string]col{}
		for rows.Next() {
			var c col
			if err := rows.Scan(&c.name, &c.typ, &c.pk); err != nil {
				t.Fatalf("scan table_info(%s): %v", table, err)
			}
			out[c.name] = c
		}
		return out
	}

	nodes := tableCols("kg_nodes")
	if c, ok := nodes["id"]; !ok || c.typ != "TEXT" || c.pk != 1 {
		t.Errorf("kg_nodes.id: want TEXT primary key, got %+v (present=%v)", c, ok)
	}
	for _, name := range []string{"kind", "repo", "path", "title", "flags", "provenance"} {
		if c, ok := nodes[name]; !ok || c.typ != "TEXT" {
			t.Errorf("kg_nodes.%s: want TEXT column, got %+v (present=%v)", name, c, ok)
		}
	}

	edges := tableCols("kg_edges")
	wantEdgePK := map[string]bool{"src": true, "dst": true, "type": true, "repo": true, "path": true, "field": true}
	for name := range wantEdgePK {
		c, ok := edges[name]
		if !ok || c.typ != "TEXT" {
			t.Errorf("kg_edges.%s: want TEXT column, got %+v (present=%v)", name, c, ok)
		}
		if ok && c.pk == 0 {
			t.Errorf("kg_edges.%s: want part of composite PK (provenance-deduped), pk=0", name)
		}
	}

	decls := tableCols("kg_decls")
	for _, name := range []string{"repo", "path", "id"} {
		if c, ok := decls[name]; !ok || c.pk == 0 {
			t.Errorf("kg_decls.%s: want part of composite PK, got %+v (present=%v)", name, c, ok)
		}
	}

	// Rebuild-safety: none of the kg tables may use INTEGER PRIMARY KEY
	// (rowid-aliased) identity.
	for table, cols := range map[string]map[string]col{"kg_nodes": nodes, "kg_edges": edges, "kg_decls": decls} {
		for _, c := range cols {
			if c.pk > 0 && c.typ == "INTEGER" {
				t.Errorf("%s.%s: INTEGER primary key is rowid-derived — kg identity must be canonical strings", table, c.name)
			}
		}
	}
}

// ── task 1.1 / R-1.1: canonical identity is global across repos ──────────────

// TestKGResolve_R11_SameCanonicalIDAcrossRepos_OneIdentity: two files in two
// different repos using the same canonical ID map onto ONE identity key — a
// single kg_nodes row.
func TestKGResolve_R11_SameCanonicalIDAcrossRepos_OneIdentity(t *testing.T) {
	db := openKGTestDB(t)
	kgApply(t, db,
		&extract.Spec{Repo: "repo-a", Path: "auth.md", NodeID: "component://auth-service", CanonicalID: "component://auth-service", Kind: "component", Title: "Auth"},
		&extract.Spec{Repo: "repo-b", Path: "docs/auth.md", NodeID: "component://auth-service", CanonicalID: "component://auth-service", Kind: "component", Title: "Auth (b)"},
	)
	if n := kgCount(t, db, "SELECT count(*) FROM kg_nodes WHERE id=?", "component://auth-service"); n != 1 {
		t.Fatalf("kg_nodes rows for shared canonical ID = %d, want 1", n)
	}
	if n := kgCount(t, db, "SELECT count(*) FROM kg_nodes"); n != 1 {
		t.Errorf("total kg_nodes = %d, want 1 (no per-repo forks)", n)
	}
}

// ── task 1.2 / R-1.3: reference in A + definition in B merge to one node ─────

func TestKGResolve_R13_RefInA_DefInB_OneNode(t *testing.T) {
	db := openKGTestDB(t)
	kgApply(t, db,
		// repo-a only REFERENCES component://payments.
		&extract.Spec{
			Repo: "repo-a", Path: "notes.md", NodeID: "repo-a:notes.md", Kind: "file",
			Edges: []extract.Edge{{Src: "repo-a:notes.md", Dst: "component://payments", Type: "related_to", Field: "relationships"}},
		},
		// repo-b DEFINES it.
		&extract.Spec{Repo: "repo-b", Path: "payments.md", NodeID: "component://payments", CanonicalID: "component://payments", Kind: "component", Title: "Payments"},
	)

	n, ok := kgNode(t, db, "component://payments")
	if !ok {
		t.Fatal("component://payments node missing")
	}
	if n.flags != "" {
		t.Errorf("merged ref+def node flags = %q, want \"\" (not phantom, not conflict)", n.flags)
	}
	if n.repo != "repo-b" || n.path != "payments.md" {
		t.Errorf("node provenance = %s:%s, want repo-b:payments.md (the definer)", n.repo, n.path)
	}
	if total := kgCount(t, db, "SELECT count(*) FROM kg_nodes"); total != 2 {
		t.Errorf("total kg_nodes = %d, want 2 (referencing file + defined node, no phantom fork)", total)
	}
}

// ── task 1.2 / R-1.4: duplicate definitions → deterministic winner ───────────

func TestKGResolve_R14_ConflictWinner_SmallestRepoPath(t *testing.T) {
	db := openKGTestDB(t)
	// Insert the LOSER first to prove resolution is order-independent: the
	// winner is `alpha:z.md` because "alpha:z.md" < "beta:a.md" as strings.
	kgApply(t, db,
		&extract.Spec{Repo: "beta", Path: "a.md", NodeID: "req://checkout/r1", CanonicalID: "req://checkout/r1", Kind: "req", Title: "Beta claim"},
		&extract.Spec{Repo: "alpha", Path: "z.md", NodeID: "req://checkout/r1", CanonicalID: "req://checkout/r1", Kind: "req", Title: "Alpha claim"},
	)

	n, ok := kgNode(t, db, "req://checkout/r1")
	if !ok {
		t.Fatal("req://checkout/r1 node missing")
	}
	if n.repo != "alpha" || n.path != "z.md" || n.title != "Alpha claim" {
		t.Errorf("winner = %s:%s (%q), want alpha:z.md (lexicographically smallest repo:path, R-1.4)", n.repo, n.path, n.title)
	}
	if n.flags != "conflict" {
		t.Errorf("flags = %q, want \"conflict\" (R-1.4)", n.flags)
	}
	if want := `["alpha:z.md","beta:a.md"]`; n.provenance != want {
		t.Errorf("provenance = %s, want %s (ALL definers retained, R-1.4)", n.provenance, want)
	}
}

// ── task 1.2 / R-1.5: unresolved references become phantom nodes ─────────────

func TestKGResolve_R15_UnresolvedReference_PhantomNode(t *testing.T) {
	db := openKGTestDB(t)
	kgApply(t, db, &extract.Spec{
		Repo: "repo-a", Path: "spec.md", NodeID: "repo-a:spec.md", Kind: "file",
		Edges: []extract.Edge{{Src: "repo-a:spec.md", Dst: "capability://search/rank", Type: "depends_on", Field: "dependsOn"}},
	})

	n, ok := kgNode(t, db, "capability://search/rank")
	if !ok {
		t.Fatal("phantom node for unresolved reference missing (R-1.5)")
	}
	if n.flags != "unresolved" {
		t.Errorf("phantom flags = %q, want \"unresolved\"", n.flags)
	}
	if n.kind != "capability" {
		t.Errorf("phantom kind = %q, want \"capability\" (derived from ID scheme)", n.kind)
	}
	if n.repo != "" || n.path != "" {
		t.Errorf("phantom carries file provenance %s:%s, want none", n.repo, n.path)
	}
}

// ── task 1.2 / R-3.1: resolution is global and recomputed, never per-repo ────

// TestKGResolve_R31_GlobalRecompute_PhantomFlips: the SAME reference flips
// phantom → resolved when another repo's scan later defines the target, and
// back to phantom when the defining repo is removed. Both transitions require
// the global recompute — per-repo incremental resolution cannot see them.
func TestKGResolve_R31_GlobalRecompute_PhantomFlips(t *testing.T) {
	db := openKGTestDB(t)
	refSpec := &extract.Spec{
		Repo: "repo-a", Path: "uses.md", NodeID: "repo-a:uses.md", Kind: "file",
		Edges: []extract.Edge{{Src: "repo-a:uses.md", Dst: "component://ledger", Type: "depends_on", Field: "dependsOn"}},
	}
	kgApply(t, db, refSpec)
	if n, ok := kgNode(t, db, "component://ledger"); !ok || n.flags != "unresolved" {
		t.Fatalf("before definer scan: flags = %q (present=%v), want unresolved", n.flags, ok)
	}

	// repo-b's later scan defines the target: same node ID flips to resolved.
	kgApply(t, db, &extract.Spec{Repo: "repo-b", Path: "ledger.md", NodeID: "component://ledger", CanonicalID: "component://ledger", Kind: "component", Title: "Ledger"})
	if n, ok := kgNode(t, db, "component://ledger"); !ok || n.flags != "" {
		t.Fatalf("after definer scan: flags = %q (present=%v), want \"\"", n.flags, ok)
	}

	// Removing the definer flips it back to phantom — recomputed globally.
	if err := DeleteRepo(db, "repo-b"); err != nil {
		t.Fatalf("DeleteRepo: %v", err)
	}
	if n, ok := kgNode(t, db, "component://ledger"); !ok || n.flags != "unresolved" {
		t.Fatalf("after definer removed: flags = %q (present=%v), want unresolved again", n.flags, ok)
	}
}

// ── task 0.3: `repo remove` leaves zero orphaned kg rows ─────────────────────

func TestKGRepoRemove_Task03_ZeroOrphans(t *testing.T) {
	db := openKGTestDB(t)
	kgApply(t, db,
		&extract.Spec{
			Repo: "gone", Path: "a.md", NodeID: "component://gone-only", CanonicalID: "component://gone-only", Kind: "component",
			Edges: []extract.Edge{{Src: "component://gone-only", Dst: "component://stays", Type: "depends_on", Field: "dependsOn"}},
		},
		&extract.Spec{Repo: "kept", Path: "b.md", NodeID: "component://stays", CanonicalID: "component://stays", Kind: "component"},
	)

	if err := DeleteRepo(db, "gone"); err != nil {
		t.Fatalf("DeleteRepo: %v", err)
	}

	for _, q := range []string{
		"SELECT count(*) FROM kg_decls WHERE repo='gone'",
		"SELECT count(*) FROM kg_edges WHERE repo='gone'",
		"SELECT count(*) FROM kg_nodes WHERE repo='gone'",
		"SELECT count(*) FROM kg_nodes WHERE provenance LIKE '%gone:%'",
		"SELECT count(*) FROM kg_nodes WHERE id='component://gone-only'",
	} {
		if n := kgCount(t, db, q); n != 0 {
			t.Errorf("%s = %d, want 0 (zero orphans after repo remove)", q, n)
		}
	}
	// The other repo's node survives untouched.
	if n, ok := kgNode(t, db, "component://stays"); !ok || n.flags != "" {
		t.Errorf("kept repo's node damaged by removal: present=%v flags=%q", ok, n.flags)
	}
}
