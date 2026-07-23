// Dedicated coverage for IncrementalScan's "unchanged file" fast path: a file
// already indexed at the same on-disk (mtime, size) is skipped, and BOTH
// components of the key are load-bearing. mtime alone is only second-granular
// and can collide with a previously indexed value while content differs
// (old-commit checkouts, mtime-preserving tools, same-second edits) — the
// size check is what turns that silent skip into a re-index.
package db

import (
	"database/sql"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"local-search/git"
)

// mtsGit runs git in dir with a deterministic identity.
func mtsGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=test", "GIT_AUTHOR_EMAIL=test@example.com",
		"GIT_COMMITTER_NAME=test", "GIT_COMMITTER_EMAIL=test@example.com",
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v in %s: %v\n%s", args, dir, err, out)
	}
}

// mtsWrite writes path with content and pins its mtime to ts.
func mtsWrite(t *testing.T, path, content string, ts time.Time) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
	if err := os.Chtimes(path, ts, ts); err != nil {
		t.Fatalf("chtimes %s: %v", path, err)
	}
}

// mtsContent returns the indexed content for (repo, path), or "" when absent.
func mtsContent(t *testing.T, dbh *sql.DB, repo, path string) string {
	t.Helper()
	var content string
	err := dbh.QueryRow(
		"SELECT content FROM specs WHERE repo=? AND path=?", repo, path,
	).Scan(&content)
	if err == sql.ErrNoRows {
		return ""
	}
	if err != nil {
		t.Fatalf("query content %s: %v", path, err)
	}
	return content
}

func TestIncrementalScan_MtimeSizeFastPath(t *testing.T) {
	repoRoot := t.TempDir()
	mtsGit(t, repoRoot, "init")
	// A committed seed file gives the repo a HEAD, so ChangedFiles works and
	// the seed itself never shows up as changed.
	seed := filepath.Join(repoRoot, "seed.md")
	mtsWrite(t, seed, "# Seed\n\nCommitted baseline.\n", time.Now().Add(-time.Hour))
	mtsGit(t, repoRoot, "add", "seed.md")
	mtsGit(t, repoRoot, "commit", "-m", "seed")

	// The file under test stays UNTRACKED: git reports it as changed on every
	// invocation, which is exactly the churn the fast path exists to absorb.
	// Anchor its mtime a minute in the past on a whole-second boundary so
	// second-granularity comparisons are exact.
	t1 := time.Now().Add(-time.Minute).Truncate(time.Second)
	note := filepath.Join(repoRoot, "note.md")
	const v1 = "# Note\n\nversion one body\n"
	mtsWrite(t, note, v1, t1)

	dbh, err := Open(filepath.Join(t.TempDir(), "specs.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer dbh.Close()
	if err := CreateSchema(dbh); err != nil {
		t.Fatalf("CreateSchema: %v", err)
	}
	if _, err := FullScan(dbh, "r", repoRoot, nil); err != nil {
		t.Fatalf("FullScan: %v", err)
	}
	head := git.CurrentCommit(repoRoot)
	if head == "" {
		t.Fatal("no HEAD commit")
	}

	// 1. Unchanged (same mtime, same size) → skipped, zero updates.
	n, _, err := IncrementalScan(dbh, "r", repoRoot, head, nil)
	if err != nil {
		t.Fatalf("IncrementalScan (unchanged): %v", err)
	}
	if n != 0 {
		t.Fatalf("unchanged file was re-indexed: got %d updates, want 0", n)
	}
	if got := mtsContent(t, dbh, "r", "note.md"); got != v1 {
		t.Fatalf("content clobbered on skip: %q", got)
	}

	// 2. Same mtime, DIFFERENT size → must re-index. This is the mtime-only
	// false-skip regression guard: without the size check this edit is
	// silently dropped.
	const v2 = "# Note\n\nversion two body, deliberately longer\n"
	mtsWrite(t, note, v2, t1) // pin mtime back to the indexed value
	n, _, err = IncrementalScan(dbh, "r", repoRoot, head, nil)
	if err != nil {
		t.Fatalf("IncrementalScan (size change): %v", err)
	}
	if n != 1 {
		t.Fatalf("same-mtime different-size edit not re-indexed: got %d updates, want 1", n)
	}
	if got := mtsContent(t, dbh, "r", "note.md"); got != v2 {
		t.Fatalf("content not updated after size change: %q", got)
	}

	// 3. Same size, different mtime → must re-index.
	v3 := "# Note\n\nversion 3.0 body, deliberately longer\n"
	if len(v3) != len(v2) {
		t.Fatalf("fixture bug: len(v3)=%d must equal len(v2)=%d", len(v3), len(v2))
	}
	mtsWrite(t, note, v3, t1.Add(5*time.Second))
	n, _, err = IncrementalScan(dbh, "r", repoRoot, head, nil)
	if err != nil {
		t.Fatalf("IncrementalScan (mtime change): %v", err)
	}
	if n != 1 {
		t.Fatalf("same-size different-mtime edit not re-indexed: got %d updates, want 1", n)
	}
	if got := mtsContent(t, dbh, "r", "note.md"); got != v3 {
		t.Fatalf("content not updated after mtime change: %q", got)
	}
}
