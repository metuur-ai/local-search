package db

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

// legacyCacheSchema is a trimmed derived-cache schema as it existed before the
// vector-search schema version shipped: a specs table WITHOUT the modified_unix
// column, and no spec_vectors / spec_edges tables. user_version is left at 0.
// Used by TestCreateSchema_RebuildsLegacyCache to prove the version guard
// drops and rebuilds a stale-shaped cache in one open.
const legacyCacheSchema = `
CREATE TABLE IF NOT EXISTS repos (
  id   INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  path TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS external_graphs (
  name       TEXT PRIMARY KEY,
  graph_path TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS specs (
  id INTEGER PRIMARY KEY, repo TEXT NOT NULL, path TEXT NOT NULL,
  project TEXT NOT NULL, name TEXT NOT NULL, title TEXT NOT NULL,
  tags TEXT DEFAULT '', summary TEXT DEFAULT '', fullpath TEXT NOT NULL,
  modified TEXT NOT NULL, size INTEGER NOT NULL, ext TEXT NOT NULL,
  content TEXT DEFAULT '', UNIQUE(repo, path));
CREATE VIRTUAL TABLE IF NOT EXISTS specs_fts USING fts5(repo,name,title,tags,summary,content,content='',tokenize='porter unicode61');
CREATE TABLE IF NOT EXISTS spec_tags (spec_id INTEGER NOT NULL, tag TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`

// tableInfoHas reports whether the given column appears in PRAGMA table_info.
func tableInfoHas(t *testing.T, db *sql.DB, table, column string) bool {
	t.Helper()
	rows, err := db.Query("PRAGMA table_info(" + table + ")")
	if err != nil {
		t.Fatalf("table_info(%s): %v", table, err)
	}
	defer rows.Close()
	for rows.Next() {
		var (
			cid       int
			name      string
			ctype     string
			notnull   int
			dfltValue sql.NullString
			pk        int
		)
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err != nil {
			t.Fatalf("scan table_info(%s): %v", table, err)
		}
		if name == column {
			return true
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("rows.Err table_info(%s): %v", table, err)
	}
	return false
}

// TestCreateSchema_RebuildsLegacyCache proves the derived-cache principle: a
// pre-existing legacy cache (specs without modified_unix, user_version 0) is
// dropped and rebuilt into the current shape on open, instead of being migrated
// column-by-column. A follow-up scan (not exercised here) repopulates it.
func TestCreateSchema_RebuildsLegacyCache(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "specs.db")

	// Phase 1: build a legacy-shaped cache and leave user_version at 0.
	older, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if _, err := older.Exec(legacyCacheSchema); err != nil {
		older.Close()
		t.Fatalf("seed legacy schema: %v", err)
	}
	older.Close()

	// Phase 2: open with the current code, which should rebuild the cache.
	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer db.Close()
	if err := CreateSchema(db); err != nil {
		t.Fatalf("CreateSchema (rebuild): %v", err)
	}

	// Phase 3: the DB now has the new shape.
	if !tableInfoHas(t, db, "specs", "modified_unix") {
		t.Errorf("after rebuild, specs.modified_unix should exist")
	}
	// spec_vectors and spec_edges tables must now exist (queryable).
	var n int
	if err := db.QueryRow("SELECT count(*) FROM spec_vectors").Scan(&n); err != nil {
		t.Errorf("spec_vectors should exist after rebuild: %v", err)
	}
	if err := db.QueryRow("SELECT count(*) FROM spec_edges").Scan(&n); err != nil {
		t.Errorf("spec_edges should exist after rebuild: %v", err)
	}

	// user_version must be bumped to the current schemaVersion.
	var version int
	if err := db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		t.Fatalf("read user_version: %v", err)
	}
	if version != schemaVersion {
		t.Errorf("user_version = %d, want %d", version, schemaVersion)
	}

	// Phase 4: the columns Repos/ExternalGraphs query must exist, so both succeed.
	if _, err := Repos(db); err != nil {
		t.Fatalf("Repos() after rebuild: %v", err)
	}
	if _, err := ExternalGraphs(db); err != nil {
		t.Fatalf("ExternalGraphs() after rebuild: %v", err)
	}
}

// TestCreateSchema_IsIdempotent ensures running CreateSchema three times on a
// fresh DB is a no-op and never errors.
func TestCreateSchema_IsIdempotent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "specs.db")

	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer db.Close()
	if err := CreateSchema(db); err != nil {
		t.Fatalf("CreateSchema #1: %v", err)
	}
	if err := CreateSchema(db); err != nil {
		t.Fatalf("CreateSchema #2: %v", err)
	}
	if err := CreateSchema(db); err != nil {
		t.Fatalf("CreateSchema #3: %v", err)
	}
}
