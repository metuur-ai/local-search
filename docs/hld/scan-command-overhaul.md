# Scan Command Overhaul — High-Level Design

## Overview

`local-search scan` is being reworked from a blunt, whole-database rebuild into a
CWD-aware, surgical, single-repo operation with observable per-repo indexing
state and optional, user-selected automation.

Today `scan` (no argument) deletes the entire SQLite cache and full-rebuilds
**every** registered repo, and even `scan <name>` wipes the whole DB before
re-indexing just the named repo — silently dropping every other repo's index.
There is no current-directory awareness, no per-repo scan/added/updated
timestamps, and no way to trigger a scan automatically after a pull, merge, or
rebase.

This change makes the default `scan` behave like `search` already does:
resolve the current directory to its enclosing registered repo and operate only
on that repo, refusing to run if the directory is not inside a registered repo.
A single-repo scan becomes **surgical** — it rebuilds only that repo's rows and
leaves all other repos intact. Per-repo state (date added, last scan, last index
update, latest indexed commit) is tracked and surfaced in `repo list`. Finally, a
new `scan-hooks install` / `scan-hooks uninstall` command lets the user choose
which automation to wire up (git hooks and/or a shell hook) so scans fire
automatically after history-changing git events or when entering a repo.

## Stakeholders & Impact

- **The developer running `local-search` locally** — the primary user. Today they
  cannot safely `scan` one repo without losing every other repo's index, cannot
  see when a repo was added or last indexed, and must remember to run `scan`
  manually. After this ships: `scan` "just works" on the repo they're standing
  in, single-repo scans are cheap and non-destructive, `repo list` answers "when
  was this last indexed and at what commit?", and they can opt into automation so
  scans keep up with `git pull`/`merge`/`rebase` without manual effort.
- **The read/query commands (`search`, `find`, etc.)** — secondary consumers via
  `ensureDB()` / `runIncrementalUpdates()`. Their existing auto-incremental
  behavior must keep working and should now also record a per-repo
  "last index update" timestamp.
- **Internal callers `repo add` / `repo remove`** — today both trigger a full
  `cmdScan("all")` rebuild. They become consumers of the new surgical primitive
  so that adding or removing one repo no longer rebuilds the world.
- **`git` (as a subsystem)** — invoked by the installed git hooks. The hooks are
  the newly written integration point; the user's own repos gain managed hook
  scripts under `.git/hooks/`.

## Goals

Observable outcomes when this ships:

1. Running `scan` with no argument inside a registered repo indexes **only** that
   repo and leaves every other repo's index untouched.
2. Running `scan` with no argument outside any registered repo fails with a clear
   error and changes nothing (no partial rebuild, no DB deletion).
3. `scan <name>` and the automation-triggered scan are surgical: other repos'
   rows are provably still present afterward.
4. A full every-repo teardown+rebuild is still reachable via an explicit
   `scan all`.
5. `repo list` shows, per repo: name, path, date added, last scan time, last
   index-update time, and latest indexed commit hash.
6. `repo add` records the date added; `repo add` / `repo remove` no longer wipe
   and rebuild the entire database.
7. `scan-hooks install` sets up exactly the automation mechanism(s) the user
   selects (git hooks, shell hook, or both) for the CWD-resolved repo, and
   `scan-hooks uninstall` removes them cleanly.
8. Automation, when triggered, runs the surgical single-repo scan for the
   affected repo.

## Non-Goals

- No file-system watcher / daemon (fsnotify). Only git hooks and a shell hook are
  offered. (Explicitly excluded from the automation mechanisms.)
- No remote/push detection, no `git fetch`, no branch-awareness added to change
  detection. The existing stored-HEAD-vs-current-HEAD diff logic is unchanged.
- No change to what counts as a spec file, to the extraction pipeline, to the
  embedding/vector logic, or to search ranking.
- No change to the auto-incremental-at-query-time mechanism's triggering
  behavior (it keeps firing on reads); only a new per-repo timestamp is recorded.
- No migration tooling for existing databases beyond what already happens on a
  schema-version bump; a full `scan all` remains the reset path.
- The default `scan` must NOT change to become destructive; a no-op-on-error
  guarantee replaces today's "wipe first, then filter" behavior.

## Success Criteria

This work is done when:

- From inside repo A (with repos A, B, C registered), `scan` re-indexes A and a
  subsequent `find` in B and C still returns their specs — verified without any
  intervening `scan all`.
- From a directory inside no registered repo, `scan` exits non-zero with a
  message naming the problem, and the DB file's contents are byte-for-byte
  unchanged.
- `repo list` output includes added / last-scan / last-index-update / commit
  columns, with sensible placeholders for repos registered before this change
  (no added_at recorded).
- After `scan-hooks install` selecting git hooks, a `git merge`/`pull` that
  touches spec files results in that repo's index reflecting the change with no
  manual `scan`; `scan-hooks uninstall` removes the managed hook content and
  leaves any pre-existing user hook content intact.
- `repo add` of a new repo indexes only that repo (other repos' `last_scan`
  timestamps are unchanged), and records the added date.
- Existing `~/.local-search/repos` files (3-field lines) still load without error.
