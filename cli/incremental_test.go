package main

import (
	"database/sql"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	localdb "local-search/db"
	"local-search/git"
)

// gitRun executes a git command in dir with a deterministic identity so commits
// succeed regardless of the host's global git config.
func gitRun(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=test", "GIT_AUTHOR_EMAIL=test@example.com",
		"GIT_COMMITTER_NAME=test", "GIT_COMMITTER_EMAIL=test@example.com",
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v failed: %v\n%s", args, err, out)
	}
}

func writeSpec(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

// useTempReposFile points the package-level reposFile at a temp path holding
// the given entries, so loadRepos() inside the code under test sees them.
func useTempReposFile(t *testing.T, entries []repoEntry) {
	t.Helper()
	orig := reposFile
	t.Cleanup(func() { reposFile = orig })
	reposFile = filepath.Join(t.TempDir(), "repos")
	saveRepos(entries)
}

func newTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := localdb.Open(filepath.Join(t.TempDir(), "index.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := localdb.CreateSchema(db); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	return db
}

// TestIndexNewRepos_LeavesKnownRepoUntouched is the regression test for the
// read-path freeze: a repo that is already in the index is never re-probed or
// re-indexed, even when git reports dirty spec files (uncommitted, staged, or
// untracked). Only `scan` may update an index.
func TestIndexNewRepos_LeavesKnownRepoUntouched(t *testing.T) {
	repoDir := t.TempDir()
	gitRun(t, repoDir, "init")
	writeSpec(t, filepath.Join(repoDir, "a.md"), "# A\n\ninitial spec\n")
	gitRun(t, repoDir, "add", ".")
	gitRun(t, repoDir, "commit", "-m", "init")

	db := newTestDB(t)
	repo := repoEntry{Name: "docs", Path: repoDir}
	useTempReposFile(t, []repoEntry{repo})

	if _, err := localdb.FullScan(db, repo.Name, repo.Path, nil, nil); err != nil {
		t.Fatalf("full scan: %v", err)
	}
	baseCommit := git.CurrentCommit(repo.Path)
	localdb.SetMeta(db, "git_commit_"+repo.Name, baseCommit) //nolint:errcheck

	// Make the repo dirty in all three ways git reports as "changed":
	// an untracked file, an unstaged edit, and a staged edit.
	writeSpec(t, filepath.Join(repoDir, "untracked.md"), "# U\n\nuntracked\n")
	writeSpec(t, filepath.Join(repoDir, "a.md"), "# A\n\nedited\n")
	writeSpec(t, filepath.Join(repoDir, "staged.md"), "# S\n\nstaged\n")
	gitRun(t, repoDir, "add", "staged.md")

	known, err := localdb.Repos(db)
	if err != nil {
		t.Fatalf("repos: %v", err)
	}

	before := countSpecs(t, db, "docs")

	indexNewRepos(db, known)

	if got := countSpecs(t, db, "docs"); got != before {
		t.Fatalf("known repo was re-indexed by a read path: %d specs before, %d after", before, got)
	}
	if got := localdb.GetMeta(db, "git_commit_"+repo.Name); got != baseCommit {
		t.Fatalf("git_commit was rewritten by a read path: was %q now %q", baseCommit, got)
	}
	if ts := localdb.GetMeta(db, "last_index_update_"+repo.Name); ts != "" {
		t.Fatalf("last_index_update stamped by a read path: %q", ts)
	}
}

// TestIndexNewRepos_FirstScansUnknownRepo keeps the one deliberate exception:
// a repo registered but never indexed still gets its initial FullScan, so a
// hand-edited repos file does not silently return zero results forever.
func TestIndexNewRepos_FirstScansUnknownRepo(t *testing.T) {
	repoDir := t.TempDir()
	gitRun(t, repoDir, "init")
	writeSpec(t, filepath.Join(repoDir, "a.md"), "# A\n\ninitial spec\n")
	gitRun(t, repoDir, "add", ".")
	gitRun(t, repoDir, "commit", "-m", "init")

	db := newTestDB(t)
	useTempReposFile(t, []repoEntry{{Name: "docs", Path: repoDir}})

	// Nothing known yet.
	indexNewRepos(db, nil)

	if got := countSpecs(t, db, "docs"); got == 0 {
		t.Fatalf("never-indexed repo was not first-scanned")
	}
	if got := localdb.GetMeta(db, "git_commit_docs"); got == "" {
		t.Fatalf("git_commit not recorded after first scan")
	}
}
