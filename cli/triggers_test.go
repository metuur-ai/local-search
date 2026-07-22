package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	localdb "local-search/db"
	"local-search/git"
)

// spyScanSurgical swaps scanSurgicalFn for a recorder for the duration of a test
// and returns a pointer to the call count, so tests assert whether the surgical
// scan actually fired without running a real DB scan.
func spyScanSurgical(t *testing.T) *int {
	t.Helper()
	orig := scanSurgicalFn
	calls := 0
	scanSurgicalFn = func(targets []repoEntry) { calls++ }
	t.Cleanup(func() { scanSurgicalFn = orig })
	return &calls
}

// makeGitScanRepo creates a real git repo with one committed spec file. Skips
// when git is unavailable.
func makeGitScanRepo(t *testing.T, name string) repoEntry {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git binary not available")
	}
	dir := t.TempDir()
	gitRun(t, dir, "init")
	writeSpec(t, filepath.Join(dir, name+".md"), "# "+name+"\n\nspec\n")
	gitRun(t, dir, "add", ".")
	gitRun(t, dir, "commit", "-m", "init")
	return repoEntry{Name: name, Path: dir}
}

// setBaselineCommit records git_commit_<name> = HEAD in the DB, mirroring what a
// prior surgical scan leaves behind, so the change-gate has a baseline.
func setBaselineCommit(t *testing.T, repo repoEntry) {
	t.Helper()
	db := openDB()
	defer db.Close()
	localdb.SetMeta(db, "git_commit_"+repo.Name, git.CurrentCommit(repo.Path)) //nolint:errcheck
}

// R-5.11: a git repo with NO spec changes since git_commit_<name> is a no-op —
// the surgical scan must not fire.
func TestScanHookRun_ChangeGate_NoChangesSkips(t *testing.T) {
	setupScanEnv(t)
	repo := makeGitScanRepo(t, "docs")
	saveRepos([]repoEntry{repo})
	setBaselineCommit(t, repo) // baseline == HEAD, clean tree → nothing changed

	calls := spyScanSurgical(t)
	if err := scanHookRun("docs", "", []repoEntry{repo}); err != nil {
		t.Fatalf("scanHookRun: %v", err)
	}
	if *calls != 0 {
		t.Fatalf("expected no scan when nothing changed, got %d scan(s)", *calls)
	}
}

// R-5.11: a new (untracked) spec file since the baseline commit trips the gate
// and the surgical scan fires.
func TestScanHookRun_ChangeGate_ChangedFileScans(t *testing.T) {
	setupScanEnv(t)
	repo := makeGitScanRepo(t, "docs")
	saveRepos([]repoEntry{repo})
	setBaselineCommit(t, repo)

	// New untracked spec file → git.ChangedFiles reports a change.
	writeSpec(t, filepath.Join(repo.Path, "new.md"), "# New\n\nadded\n")

	calls := spyScanSurgical(t)
	if err := scanHookRun("docs", "", []repoEntry{repo}); err != nil {
		t.Fatalf("scanHookRun: %v", err)
	}
	if *calls != 1 {
		t.Fatalf("expected exactly one surgical scan on a changed spec file, got %d", *calls)
	}
}

// R-5.11: a non-git repo has no commit baseline, so the gate never applies and
// the surgical scan always fires.
func TestScanHookRun_NonGitRepoAlwaysScans(t *testing.T) {
	setupScanEnv(t)
	repo := makeScanRepo(t, "docs") // non-git
	saveRepos([]repoEntry{repo})

	calls := spyScanSurgical(t)
	if err := scanHookRun("docs", "", []repoEntry{repo}); err != nil {
		t.Fatalf("scanHookRun: %v", err)
	}
	if *calls != 1 {
		t.Fatalf("expected a surgical scan for a non-git repo, got %d", *calls)
	}
}

// R-5.12: while the per-repo lock is already held, an overlapping trigger for the
// same repo is a no-op — no second concurrent scan.
func TestScanHookRun_ReentrancyLockNoOp(t *testing.T) {
	setupScanEnv(t)
	repo := makeGitScanRepo(t, "docs")
	saveRepos([]repoEntry{repo})
	setBaselineCommit(t, repo)
	writeSpec(t, filepath.Join(repo.Path, "new.md"), "# New\n\nchanged\n") // gate would pass

	// Simulate a live holder: take the same per-repo lock the trigger would.
	locksDir := filepath.Join(appDir, "locks")
	if err := os.MkdirAll(locksDir, 0o755); err != nil {
		t.Fatal(err)
	}
	held, ok, err := acquireRepoLock(filepath.Join(locksDir, lockFileName("docs")))
	if err != nil || !ok {
		t.Fatalf("test could not take the repo lock (ok=%v err=%v)", ok, err)
	}
	defer held.release()

	calls := spyScanSurgical(t)
	if err := scanHookRun("docs", "", []repoEntry{repo}); err != nil {
		t.Fatalf("scanHookRun: %v", err)
	}
	if *calls != 0 {
		t.Fatalf("expected no scan while the repo lock is held, got %d", *calls)
	}
}

// R-5.13: once the holder exits (lock released), a fresh trigger reclaims the
// lock and scans — the lock is self-healing, not permanently wedged.
func TestScanHookRun_SelfHealingLockReclaimed(t *testing.T) {
	setupScanEnv(t)
	repo := makeGitScanRepo(t, "docs")
	saveRepos([]repoEntry{repo})
	setBaselineCommit(t, repo)
	writeSpec(t, filepath.Join(repo.Path, "new.md"), "# New\n\nchanged\n")

	locksDir := filepath.Join(appDir, "locks")
	if err := os.MkdirAll(locksDir, 0o755); err != nil {
		t.Fatal(err)
	}
	held, ok, err := acquireRepoLock(filepath.Join(locksDir, lockFileName("docs")))
	if err != nil || !ok {
		t.Fatalf("test could not take the repo lock (ok=%v err=%v)", ok, err)
	}
	held.release() // dead holder exits → lock must be reclaimable

	calls := spyScanSurgical(t)
	if err := scanHookRun("docs", "", []repoEntry{repo}); err != nil {
		t.Fatalf("scanHookRun: %v", err)
	}
	if *calls != 1 {
		t.Fatalf("expected a surgical scan after the stale lock was released, got %d", *calls)
	}
}

// R-5.10: the generated git-hook managed block dispatches the trigger detached
// (`&`) and then `exit 0`s unconditionally, so a slow or failing scan can never
// change the hook's exit status or block git.
func TestGitHookManagedBlock_BackgroundedThenExit0(t *testing.T) {
	block := strings.Join(gitHookManagedBlock("docs"), "\n")

	ampIdx := strings.Index(block, "scan-hook-run 'docs' >/dev/null 2>&1 &")
	if ampIdx < 0 {
		t.Fatalf("expected a backgrounded scan-hook-run dispatch, got:\n%s", block)
	}
	exitIdx := strings.Index(block, "exit 0")
	if exitIdx < 0 {
		t.Fatalf("expected an unconditional `exit 0`, got:\n%s", block)
	}
	if exitIdx < ampIdx {
		t.Fatalf("`exit 0` must follow the backgrounded dispatch, got:\n%s", block)
	}
}
