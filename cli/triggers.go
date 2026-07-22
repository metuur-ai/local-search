package main

// Internal automation trigger (story 5.4). The generated git hooks and shell
// snippet do NOT encode change-gate / lock / dispatch logic in POSIX sh — they
// invoke the hidden `local-search scan-hook-run [name]` command, whose behavior
// lives here in testable Go:
//
//	1. Resolve the repo (by name, or from CWD when name is omitted).
//	2. Take a per-repo re-entrancy lock (R-5.12), auto-released on exit (R-5.13).
//	3. Change-gate (R-5.11): for a git repo, scan only when spec files changed
//	   since the last indexed commit; non-git repos always scan.
//	4. Run the SURGICAL single-repo scan (R-5.7).
//
// Non-blocking (R-5.10) is provided by the generated hook, which backgrounds
// this command and unconditionally `exit 0`s — so a slow or failing scan can
// never block or fail the git operation.

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	localdb "local-search/db"
	"local-search/git"
)

// scanSurgicalFn is an injectable seam so tests can drive scanHookRun and assert
// whether (and with what) the surgical scan fired, without a real DB scan.
var scanSurgicalFn = scanSurgical

// cmdScanHookRun is the (undocumented) dispatch entry the generated automation
// calls. The name arg is optional: when absent the enclosing repo is resolved
// from the CWD. Errors are intentionally swallowed — automation must never
// surface a failure to its caller (the hook already backgrounds + exit 0s, but
// direct/foreground invocation stays quiet and non-fatal too, R-5.10).
func cmdScanHookRun(args []string) {
	name := ""
	if len(args) > 0 {
		name = args[0]
	}
	cwd, _ := os.Getwd()
	_ = scanHookRun(name, cwd, loadRepos())
}

// scanHookRun implements the trigger behavior. It returns nil on every no-op
// path (already-locked, nothing-changed, or a completed scan) and an error only
// for a genuine resolution/lock failure the caller may log.
func scanHookRun(name, cwd string, repos []repoEntry) error {
	repo, err := resolveHookRunTarget(name, cwd, repos)
	if err != nil {
		return err
	}

	// R-5.12/R-5.13: per-repo lock, non-blocking; the OS releases it if we die.
	locksDir := filepath.Join(appDir, "locks")
	if err := os.MkdirAll(locksDir, 0o755); err != nil {
		return fmt.Errorf("creating locks dir: %w", err)
	}
	lock, held, err := acquireRepoLock(filepath.Join(locksDir, lockFileName(repo.Name)))
	if err != nil {
		return fmt.Errorf("acquiring repo lock: %w", err)
	}
	if !held {
		return nil // another trigger is already scanning this repo → no-op
	}
	defer lock.release()

	// R-5.11: change-gate. Only git repos can be gated; a non-git repo has no
	// commit baseline, so it always scans.
	if git.IsRepo(repo.Path) && !hookRepoHasSpecChanges(repo) {
		return nil // nothing changed since the last indexed commit → no scan
	}

	// R-5.7: the surgical single-repo scan — not incremental-only, not a full
	// rebuild.
	scanSurgicalFn([]repoEntry{repo})
	return nil
}

// resolveHookRunTarget picks the repo to act on: by explicit name when given
// (the git hook bakes it in), otherwise the CWD-enclosing repo (the shell
// snippet resolves by directory) using the same resolver `scan` uses.
func resolveHookRunTarget(name, cwd string, repos []repoEntry) (repoEntry, error) {
	if len(repos) == 0 {
		return repoEntry{}, fmt.Errorf("no repos added yet")
	}
	if strings.TrimSpace(name) != "" {
		for _, r := range repos {
			if r.Name == name {
				return r, nil
			}
		}
		return repoEntry{}, fmt.Errorf("unknown repo %s", name)
	}
	return resolveHookRepo(cwd, repos)
}

// hookRepoHasSpecChanges is the change-gate detection (R-5.11). It reuses the
// EXACT same primitives as the query-time incremental path
// (applyIncrementalUpdate): the last indexed commit from meta git_commit_<name>
// and git.ChangedFiles, which already covers committed/staged/unstaged/untracked
// spec files. No diffing is reimplemented here. On any read/detection failure it
// returns true (scan) so automation errs toward freshness, never silent staleness.
func hookRepoHasSpecChanges(repo repoEntry) bool {
	db, err := localdb.Open(dbFile)
	if err != nil {
		return true // can't read the baseline → scan to be safe
	}
	defer db.Close()

	lastCommit := localdb.GetMeta(db, "git_commit_"+repo.Name)
	changed, err := git.ChangedFiles(repo.Path, lastCommit)
	if err != nil {
		return true // detection failed → scan to be safe
	}
	return len(changed) > 0
}

// lockFileName maps a repo name to a safe single-segment lock file name so an
// unusual name (e.g. containing a path separator) cannot escape the locks dir.
func lockFileName(repoName string) string {
	safe := strings.NewReplacer("/", "_", "\\", "_", string(filepath.Separator), "_").Replace(repoName)
	return safe + ".lock"
}
