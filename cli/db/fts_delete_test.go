package db

import (
	"fmt"
	"testing"
)

// TestContentlessDelete_NoOrphanPostings is the sharp guard: each cycle indexes a
// UNIQUE content token, then deletes the row. If the contentless FTS5 'delete' is
// given the wrong content ("" instead of the indexed text), that row's content
// tokens are never removed and remain as orphan postings — so a MATCH on an old,
// deleted token still returns a (phantom) hit. With the correct content passed,
// every deleted token yields zero matches.
func TestContentlessDelete_NoOrphanPostings(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	const repo, path = "r1", "docs/a.md"

	insert := func(content string) {
		if _, err := db.Exec(`INSERT INTO specs
			(repo,path,project,name,title,tags,summary,fullpath,modified,modified_unix,size,ext,content)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			repo, path, "proj", "a", "A", "go", "s", "/tmp/a", "2024", 0, 10, "md", content); err != nil {
			t.Fatalf("insert specs: %v", err)
		}
		if _, err := db.Exec(`INSERT INTO specs_fts(rowid,repo,name,title,tags,summary,content)
			SELECT id,repo,name,title,tags,summary,content FROM specs WHERE repo=? AND path=?`,
			repo, path); err != nil {
			t.Fatalf("insert fts: %v", err)
		}
	}
	matches := func(term string) int {
		var n int
		if err := db.QueryRow("SELECT count(*) FROM specs_fts WHERE specs_fts MATCH ?", term).Scan(&n); err != nil {
			t.Fatalf("match %q: %v", term, err)
		}
		return n
	}

	const cycles = 25
	for i := 0; i < cycles; i++ {
		insert(fmt.Sprintf("uniquetoken%d filler words here", i))
		tx, err := db.Begin()
		if err != nil {
			t.Fatalf("begin: %v", err)
		}
		if err := deleteSpecEntry(tx, repo, path); err != nil {
			t.Fatalf("delete cycle %d: %v", i, err)
		}
		if err := tx.Commit(); err != nil {
			t.Fatalf("commit cycle %d: %v", i, err)
		}
	}

	// Every deleted unique token must be gone. Orphans mean the delete used the
	// wrong content values.
	for i := 0; i < cycles; i++ {
		if got := matches(fmt.Sprintf("uniquetoken%d", i)); got != 0 {
			t.Fatalf("orphan posting: MATCH 'uniquetoken%d' returned %d, want 0", i, got)
		}
	}
	if _, err := db.Exec("INSERT INTO specs_fts(specs_fts) VALUES('integrity-check')"); err != nil {
		t.Fatalf("FTS integrity-check failed: %v", err)
	}
}

// TestIncrementalChurn_NoFTSCorruption reproduces the incremental-update churn
// (a file repeatedly re-indexed on every command) and asserts the contentless
// FTS5 index stays consistent. Before the fix, deleteSpecEntry passed "" for the
// content column, so the real content tokens were never removed — repeated
// delete/insert cycles corrupted the index and any FTS read raised
// "database disk image is malformed (267)".
func TestIncrementalChurn_NoFTSCorruption(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	const repo, path = "r1", "docs/a.md"
	const content = "settlement finality payments refund chargeback eligibility international deployment"

	insert := func() {
		if _, err := db.Exec(`INSERT INTO specs
			(repo,path,project,name,title,tags,summary,fullpath,modified,modified_unix,size,ext,content)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			repo, path, "proj", "a", "A Title", "go,http", "a summary",
			"/tmp/a", "2024-01-01", 0, 10, "md", content); err != nil {
			t.Fatalf("insert specs: %v", err)
		}
		if _, err := db.Exec(`INSERT INTO specs_fts(rowid,repo,name,title,tags,summary,content)
			SELECT id,repo,name,title,tags,summary,content FROM specs WHERE repo=? AND path=?`,
			repo, path); err != nil {
			t.Fatalf("insert fts: %v", err)
		}
	}
	insert()

	// The churn: delete + re-insert the same file many times, as the buggy
	// incremental path did on every CLI invocation.
	for i := 0; i < 40; i++ {
		tx, err := db.Begin()
		if err != nil {
			t.Fatalf("begin: %v", err)
		}
		if err := deleteSpecEntry(tx, repo, path); err != nil {
			t.Fatalf("deleteSpecEntry (cycle %d): %v", i, err)
		}
		if err := tx.Commit(); err != nil {
			t.Fatalf("commit (cycle %d): %v", i, err)
		}
		insert()
	}

	// The FTS5 'integrity-check' command raises the exact malformed error when
	// the contentless index is inconsistent. This is the direct regression guard.
	if _, err := db.Exec("INSERT INTO specs_fts(specs_fts) VALUES('integrity-check')"); err != nil {
		t.Fatalf("FTS integrity-check failed after churn (index corrupt): %v", err)
	}
	var res string
	if err := db.QueryRow("PRAGMA integrity_check").Scan(&res); err != nil || res != "ok" {
		t.Fatalf("PRAGMA integrity_check = %q, err=%v", res, err)
	}

	// Content still searchable exactly once (one live row), proving the delete
	// removed the right postings rather than orphaning them.
	var n int
	if err := db.QueryRow(
		"SELECT count(*) FROM specs_fts WHERE specs_fts MATCH 'settlement'").Scan(&n); err != nil {
		t.Fatalf("match query: %v", err)
	}
	if n != 1 {
		t.Fatalf("want exactly 1 match after churn, got %d (orphaned postings)", n)
	}
}
