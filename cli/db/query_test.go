package db

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func setupTestDB(t *testing.T) *sql.DB {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	db, err := Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	if err := CreateSchema(db); err != nil {
		t.Fatalf("failed to create schema: %v", err)
	}
	return db
}

func insertTestSpec(t *testing.T, db *sql.DB, repo, path, name, title string) {
	_, err := db.Exec(
		"INSERT INTO specs (repo, path, project, name, title, tags, summary, fullpath, modified, size, ext, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		repo, path, "project", name, title, "", "summary", "/tmp/"+name, "2024-01-01", 100, ".md", "content",
	)
	if err != nil {
		t.Fatalf("failed to insert spec: %v", err)
	}
	_, err = db.Exec("INSERT INTO specs_fts (rowid, repo, name, title, tags, summary, content) VALUES ((SELECT id FROM specs WHERE name=?), ?, ?, ?, ?, ?, ?)",
		name, repo, name, title, "", "summary", "content")
	if err != nil {
		t.Fatalf("failed to insert into FTS: %v", err)
	}
}

func TestSearch_WithDirectoryFilter(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	insertTestSpec(t, db, "repo1", "docs/api.md", "api", "API Docs")
	insertTestSpec(t, db, "repo1", "guides/intro.md", "intro", "Introduction")
	insertTestSpec(t, db, "repo1", "docs/tutorial.md", "tutorial", "Tutorial")

	// Search all
	results, err := Search(db, "content", "", "")
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if len(results) != 3 {
		t.Fatalf("expected 3 results, got %d", len(results))
	}

	// Search with directory filter
	results, err = Search(db, "content", "", "docs/")
	if err != nil {
		t.Fatalf("search with directory filter failed: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results in docs/, got %d", len(results))
	}
	for _, r := range results {
		if !("docs/" == r.Path[:5]) {
			t.Fatalf("expected path starting with 'docs/', got %s", r.Path)
		}
	}

	// Search with guides filter
	results, err = Search(db, "content", "", "guides/")
	if err != nil {
		t.Fatalf("search with guides filter failed: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result in guides/, got %d", len(results))
	}
}

func TestReadSpec_WithDirectoryFilter(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	// Create a temp file for fullpath
	tmpDir := t.TempDir()
	docFile := filepath.Join(tmpDir, "test.md")
	if err := os.WriteFile(docFile, []byte("test content"), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	// Insert two docs with same name in different directories
	_, err := db.Exec(
		"INSERT INTO specs (repo, path, project, name, title, tags, summary, fullpath, modified, size, ext, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		"repo1", "docs/readme.md", "project", "readme", "Documentation", "", "summary", docFile, "2024-01-01", 100, ".md", "content",
	)
	if err != nil {
		t.Fatalf("failed to insert first spec: %v", err)
	}

	_, err = db.Exec(
		"INSERT INTO specs (repo, path, project, name, title, tags, summary, fullpath, modified, size, ext, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		"repo1", "guides/readme.md", "project", "readme", "Guide", "", "summary", docFile, "2024-01-01", 100, ".md", "content",
	)
	if err != nil {
		t.Fatalf("failed to insert second spec: %v", err)
	}

	// Read without directory filter should fail (ambiguous)
	path, err := ReadSpec(db, "readme", "", "")
	if err != nil {
		t.Fatalf("read spec failed: %v", err)
	}
	if path != "" {
		t.Fatalf("expected empty path for ambiguous read, got %s", path)
	}

	// Read with directory filter should succeed
	path, err = ReadSpec(db, "readme", "", "docs/")
	if err != nil {
		t.Fatalf("read spec with directory filter failed: %v", err)
	}
	if path != docFile {
		t.Fatalf("expected %s, got %s", docFile, path)
	}
}
