package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

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

// TestApplyIncrementalUpdate_StampsLastIndexUpdateOnlyWhenChanged verifies the
// shared incremental helper (Story 3.2, R-3.4/R-6.5): a real update stamps
// last_index_update_<name>, while a no-op query neither re-indexes nor writes
// the timestamp.
func TestApplyIncrementalUpdate_StampsLastIndexUpdateOnlyWhenChanged(t *testing.T) {
	repoDir := t.TempDir()
	gitRun(t, repoDir, "init")

	writeSpec(t, filepath.Join(repoDir, "a.md"), "# A\n\ninitial spec\n")
	gitRun(t, repoDir, "add", ".")
	gitRun(t, repoDir, "commit", "-m", "init")

	dbPath := filepath.Join(t.TempDir(), "index.db")
	db, err := localdb.Open(dbPath)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()
	if err := localdb.CreateSchema(db); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	repo := repoEntry{Name: "docs", Path: repoDir}

	// Baseline: full scan + record HEAD, mirroring the bootstrap path.
	if _, err := localdb.FullScan(db, repo.Name, repo.Path, nil); err != nil {
		t.Fatalf("full scan: %v", err)
	}
	localdb.SetMeta(db, "git_commit_"+repo.Name, git.CurrentCommit(repo.Path)) //nolint:errcheck

	const stampKey = "last_index_update_docs"

	// 1. No changes yet → no-op, no timestamp written.
	changed, err := applyIncrementalUpdate(db, repo)
	if err != nil {
		t.Fatalf("unexpected error on no-op: %v", err)
	}
	if changed {
		t.Fatalf("expected no change on unmodified repo")
	}
	if ts := localdb.GetMeta(db, stampKey); ts != "" {
		t.Fatalf("timestamp spuriously written for no-op update: %q", ts)
	}

	// 2. Commit a new spec file → incremental update should apply and stamp.
	writeSpec(t, filepath.Join(repoDir, "b.md"), "# B\n\nnew spec\n")
	gitRun(t, repoDir, "add", ".")
	gitRun(t, repoDir, "commit", "-m", "add b")

	changed, err = applyIncrementalUpdate(db, repo)
	if err != nil {
		t.Fatalf("unexpected error on real update: %v", err)
	}
	if !changed {
		t.Fatalf("expected change after committing a new spec file")
	}
	stamp := localdb.GetMeta(db, stampKey)
	if stamp == "" {
		t.Fatalf("last_index_update was not written after a real update")
	}
	if _, perr := time.Parse(time.RFC3339, stamp); perr != nil {
		t.Fatalf("last_index_update is not RFC3339: %q (%v)", stamp, perr)
	}

	// 3. A subsequent no-op query must NOT re-index or bump the timestamp.
	changed, err = applyIncrementalUpdate(db, repo)
	if err != nil {
		t.Fatalf("unexpected error on second no-op: %v", err)
	}
	if changed {
		t.Fatalf("expected no change on second no-op query")
	}
	if got := localdb.GetMeta(db, stampKey); got != stamp {
		t.Fatalf("timestamp changed on no-op: was %q now %q", stamp, got)
	}
}

// TestApplyIncrementalUpdate_ConvergesOnUntrackedFiles verifies repeated updates
// converge: an untracked spec file (which git reports as "changed" forever) is
// indexed once, and a subsequent run with nothing changed on disk is a no-op.
func TestApplyIncrementalUpdate_ConvergesOnUntrackedFiles(t *testing.T) {
	repoDir := t.TempDir()
	gitRun(t, repoDir, "init")
	writeSpec(t, filepath.Join(repoDir, "a.md"), "# A\n\ninitial\n")
	gitRun(t, repoDir, "add", ".")
	gitRun(t, repoDir, "commit", "-m", "init")

	dbPath := filepath.Join(t.TempDir(), "index.db")
	db, err := localdb.Open(dbPath)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()
	if err := localdb.CreateSchema(db); err != nil {
		t.Fatalf("schema: %v", err)
	}
	repo := repoEntry{Name: "docs", Path: repoDir}
	if _, err := localdb.FullScan(db, repo.Name, repo.Path, nil); err != nil {
		t.Fatalf("full scan: %v", err)
	}
	localdb.SetMeta(db, "git_commit_"+repo.Name, git.CurrentCommit(repo.Path)) //nolint:errcheck

	// Untracked spec file (never committed): git reports it changed on every run.
	writeSpec(t, filepath.Join(repoDir, "untracked.md"), "# U\n\nuntracked body\n")

	changed1, err := applyIncrementalUpdate(db, repo)
	if err != nil {
		t.Fatalf("update1: %v", err)
	}
	if !changed1 {
		t.Fatalf("first update should index the untracked file")
	}
	changed2, err := applyIncrementalUpdate(db, repo)
	if err != nil {
		t.Fatalf("update2: %v", err)
	}
	if changed2 {
		t.Fatalf("did not converge: untracked file re-indexed though unchanged on disk")
	}
}
