# Scan Command Overhaul — Tasks

Source of truth: `docs/ears/scan-command-overhaul.md` (R-ids) and
`docs/lld/scan-command-overhaul.md` (architecture). Deps reference story IDs in
this file only. `mutex:` marks stories that touch the same code region and must
not run concurrently.

Foundational stories (no deps): **1.1**, **2.2**, **3.2**, **6.1** — start here;
they unblock the rest.

---

## Unit 1 — Scan target resolution

- [x] 1.1 Implement `resolveScanTarget(args, cwd, repos) -> (mode, targets, err)` (est: ~40m)
  - why: The default `scan` must act on the repo the user is standing in and must
    decide mode + target as a pure, testable step before anything mutates — this
    is the seam that makes the whole "non-destructive default" guarantee possible.
  - acceptance: R-1.1, R-1.2 (deepest enclosing via `scope.NearestRepoForCWD`),
    R-1.4 (`scan <name>`), R-1.5 (unknown name → error), R-1.6 (`scan all` → full
    rebuild), R-1.7 (`rebuild`/`index` aliases), R-1.8 (no repos → existing guidance)
  - verify: table-driven Go test covering: no-arg inside one repo, no-arg inside
    nested/multiple repos (longest wins), no-arg outside any repo (err), known
    name, unknown name (err), `all`, empty repo set. No DB or FS access in the
    function.

- [x] 1.2 Wire `cmdScan` to resolve-before-mutate; guarantee no mutation on error (deps: 1.1, 2.1, est: ~30m)
  - why: Today `cmdScan` deletes the DB *first* then filters; inverting that
    ordering is what prevents a user outside any repo (or naming a bad repo) from
    losing their index.
  - acceptance: R-1.3 (outside any repo → non-zero error, zero changes to DB/FS),
    and the no-mutation clause of R-1.5 (unknown name changes nothing)
  - verify: integration test — run `scan` from a temp dir outside all repos and
    assert the DB file bytes are unchanged and exit is non-zero; same for
    `scan bogus-name`.
  - mutex: cmdscan

## Unit 2 — Surgical single-repo scan

- [x] 2.1 Rewrite `cmdScan` for surgical vs full-rebuild modes (deps: 1.1, est: ~50m)
  - why: A single-repo scan must be cheap and non-destructive; today even
    `scan <name>` wipes the whole DB and drops every other repo's index.
  - acceptance: R-2.1 (delete only target repo's rows via `localdb.DeleteRepo` +
    `FullScan`), R-2.2 (no DB-file deletion in surgical mode), R-2.3 (other repos
    untouched), R-2.4 (bootstrap schema when DB absent, no fan-out), R-2.5 (record
    git HEAD for git repos), R-2.6 (`scan all` retains delete-file + full rebuild)
  - verify: with repos A/B/C registered, `scan A`, then assert B and C specs still
    queryable via `find` with no intervening `scan all`; assert DB file inode/size
    persisted across a surgical scan; assert a fresh (no-DB) surgical scan indexes
    only the target.
  - mutex: cmdscan

- [x] 2.2 Open DB with concurrency-tolerant pragmas (deps: —, est: ~20m)
  - why: Automation makes a second writer routine while a foreground `search` may
    also write; without this, a hook-triggered scan racing a query hard-fails.
  - acceptance: R-2.7 (bounded `busy_timeout` and/or WAL so a scan contending with
    a read neither fails the read nor corrupts the index)
  - verify: concurrent test — spawn a scan and a query against the same DB; both
    complete without `SQLITE_BUSY` error; index intact afterward.

- [x] 2.3 Make surgical delete+reindex atomic to concurrent readers (deps: 2.1, est: ~40m)
  - why: `DeleteRepo` then `FullScan` in two transactions lets a concurrent
    `search` observe the repo with zero specs — automation fires this on every git
    event, exactly when the user is likely querying, so the empty window is frequent.
  - acceptance: R-2.8 (delete+reindex is one atomic unit; a concurrent reader sees
    either the pre- or post-scan index for the repo, never the empty intermediate)
  - verify: hammer test — repeatedly `find` in repo A while `scan A` runs in a
    loop; assert the query never returns zero results for A. Single transaction or
    staging-swap, per LLD.
  - mutex: cmdscan

## Unit 3 — Per-repo state tracking

- [x] 3.1 Record per-repo last-scan timestamp on surgical + full scans (deps: 2.1, est: ~20m)
  - why: Users need to know when each repo was last indexed; today only a single
    global `last_scan` exists.
  - acceptance: R-3.3 (write `last_scan_<name>` per repo in both surgical and
    full-rebuild modes), R-3.5 (latest indexed commit stays consistent with the
    HEAD just indexed), R-3.7 (retain the global `meta["last_scan"]` for `stats`)
  - verify: after `scan A`, `meta` has `last_scan_A`; after `scan all`, every repo
    has its own `last_scan_<name>`; `stats` still prints a global value.

- [x] 3.2 Shared incremental helper writing per-repo last-index-update at every incremental site (deps: —, est: ~35m)
  - why: The incremental logic is duplicated in `ensureDB` and
    `runIncrementalUpdates`; a per-repo "last update" timestamp must be written the
    same way in both or it silently drifts.
  - acceptance: R-3.4 (write `last_index_update_<name>` in every code path that
    applies an incremental update), R-6.5 (existing auto-incremental-at-query-time
    behavior preserved, only the timestamp write added)
  - verify: extract one helper; both call sites (`main.go:614-630`,
    `main.go:1653-1668`) call it; a query that triggers an incremental update sets
    `last_index_update_<name>`; unchanged repos are not re-indexed.
  - mutex: incremental

## Unit 4 — `repo list` display

- [x] 4.1 Columnar `repo list` with tracked state + placeholders (deps: 6.1, 3.1, 3.2, est: ~35m)
  - why: The tracked state is only useful if it's visible; today `repo list` shows
    name + path only.
  - acceptance: R-4.1 (name, path, added, last-scan, last-update, short commit),
    R-4.2 (`—` placeholder for missing values), R-4.3 (`humanAge` timestamps,
    7-char commit), R-4.4 (DB absent/unreadable → still list name/path/added, other
    cols `—`, exit 0), R-3.6 (repos with no recorded added_at render unknown, not
    fabricated)
  - verify: golden-output test with a repo that has full state and a legacy repo
    with no added_at (shows `—`); run with the DB deleted and confirm exit 0 with
    name/path/added populated.

## Unit 5 — Configurable scan automation (`scan-hooks`)

- [x] 5.1 `scan-hooks install/uninstall` scaffold: CWD guard + mechanism selection (deps: 1.1, est: ~35m)
  - why: Users want scans to keep up with git activity but must choose which
    mechanism gets installed and be able to remove it — mirroring `install-skill`.
  - acceptance: R-5.1 (`--mechanism git-hooks,shell` installs exactly those),
    R-5.2 (no flag → interactive selection via existing `ui.go` helpers), R-5.3
    (outside any registered repo → same error as `scan`, installs/removes nothing)
  - verify: `scan-hooks install --mechanism shell` outside a repo errors and writes
    nothing; inside a repo with no flag, the interactive selector is presented.

- [x] 5.2 Git-hooks mechanism: managed sentinel blocks, safe install/uninstall (deps: 5.1, est: ~45m)
  - why: History-movement events (pull/merge/rebase/checkout) are what the
    query-time path is slowest to surface; hooks must add this without ever
    destroying a user's existing hook content.
  - acceptance: R-5.4 (write executable `post-merge`/`post-checkout`/`post-rewrite`
    for git repos; `post-commit` excluded), R-5.4a (non-git repo → skip git-hooks
    with message, still install others), R-5.5 (sentinel-delimited managed block,
    never overwrite user content; `--force` replaces a stale block), R-5.8
    (uninstall removes only the managed block; deletes file only if it becomes
    empty), R-5.9 (idempotent re-install, no duplicate block)
  - verify: install into a hook file containing pre-existing user content; assert
    user lines survive and are runnable; re-install → no duplication; uninstall →
    user content intact, managed block gone; non-git dir → skipped with message.

- [x] 5.3 Shell-hook mechanism: snippet + source directive (deps: 5.1, est: ~30m)
  - why: A `cd`-into-repo trigger is editor-agnostic and catches non-git spec
    edits, but we must not silently edit the user's rc files.
  - acceptance: R-5.6 (write `~/.local-search/shell-hook.sh`, print the exact
    `source` line rather than editing rc; uninstall removes the file and prints the
    line to delete), R-5.9 (idempotent), R-5.8 (clean uninstall)
  - verify: install writes the snippet file and prints a `source ...` line; no rc
    file is modified; uninstall removes the file.

- [x] 5.4 Trigger behavior: surgical action, non-blocking, change-gate, safe lock (deps: 5.2, 5.3, 2.1, est: ~45m)
  - why: Automation firing a full re-walk on every `cd`/checkout is a scan-storm,
    a slow/failed scan blocking `git commit` is unacceptable, and a crashed
    detached scan holding a lock would silently kill automation forever.
  - acceptance: R-5.7 (trigger runs the surgical single-repo scan — not
    incremental-only, not full rebuild), R-5.10 (hook exits 0 unconditionally,
    dispatches detached so git is never blocked/failed), R-5.11 (change-gate: skip
    with no-op when no spec files changed vs. last indexed commit; scan only on
    change or for non-git repos), R-5.12 (per-repo re-entrancy lock; overlapping
    trigger is a no-op), R-5.13 (lock auto-releases on abnormal exit, e.g.
    `flock`/PID-based)
  - verify: simulate a trigger with no changes → no scan runs, exit 0; with a
    changed spec file → surgical scan runs; overlapping triggers → only one scan;
    kill a scan mid-run holding the lock → next trigger still fires (stale lock
    reclaimed); a failing scan still returns exit 0 to the caller.
  - mutex: cmdscan

## Unit 6 — Backward compatibility & internal callers

- [x] 6.1 Extend flat repos-file format with positional `added_at` (deps: —, est: ~40m)
  - why: Date-added must survive a full `scan all` (which deletes the DB), so it
    lives in the flat file — and the positional 4th-field encoding is the single
    highest-risk spot in this change (a wrong write silently drops the repo).
  - acceptance: R-6.1 (parse legacy 2/3-field lines, added_at unknown), R-6.2
    (emit added_at as 4th field only when present), R-6.6 (when added_at is set but
    skip-dirs is empty, emit the empty placeholder → literal `name|path||<added_at>`
    on disk; parse it back to empty skip-dirs + the date), R-3.2 (durability: stored
    in the file, not only in the DB)
  - verify: round-trip test — write/parse for all four line shapes (2-field,
    3-field, `name|path||<ts>`, `name|path|skip|<ts>`); a repo with added_at and no
    skip-dirs survives a save/load cycle without being dropped.
  - mutex: repos-file

- [x] 6.2 `repo add` records added_at and scans only the new repo (deps: 6.1, 2.1, est: ~25m)
  - why: Registration should not wipe and rebuild the whole DB, and it's the moment
    to stamp the date-added.
  - acceptance: R-3.1 (record current UTC added_at on `repo add`), R-6.3 (index
    only the newly added repo surgically; no DB deletion, no re-scan of other repos)
  - verify: `repo add` a new repo; assert its line has an added_at, other repos'
    `last_scan_<name>` timestamps are unchanged, and the new repo is queryable.

- [x] 6.3 `repo remove` becomes surgical (deps: 2.1, est: ~15m)
  - why: Removing one repo shouldn't rebuild the world; the surgical delete
    primitive already exists.
  - acceptance: R-6.4 (delete only that repo's rows via `localdb.DeleteRepo` and
    drop its flat-file entry; no DB deletion, no re-scan of other repos)
  - verify: `repo remove B` with A/B/C registered; assert A and C specs still
    queryable and the DB file was not recreated.

---

### Requirement coverage map

Unit 1: R-1.1/1.2/1.4/1.5/1.6/1.7/1.8 → 1.1; R-1.3 (+1.5 no-mutation) → 1.2.
Unit 2: R-2.1–2.6 → 2.1; R-2.7 → 2.2; R-2.8 → 2.3.
Unit 3: R-3.3/3.5/3.7 → 3.1; R-3.4 → 3.2; R-3.1 → 6.2; R-3.2 → 6.1; R-3.6 → 4.1.
Unit 4: R-4.1/4.2/4.3/4.4 → 4.1.
Unit 5: R-5.1/5.2/5.3 → 5.1; R-5.4/5.4a/5.5/5.8/5.9 → 5.2; R-5.6 → 5.3;
R-5.7/5.10/5.11/5.12/5.13 → 5.4.
Unit 6: R-6.1/6.2/6.6 → 6.1; R-6.3 → 6.2; R-6.4 → 6.3; R-6.5 → 3.2.

### Suggested execution order (respecting deps + mutex)

1. Parallel start: **1.1**, **2.2**, **3.2**, **6.1**
2. **2.1** (after 1.1) → then **2.3**, **1.2**, **3.1**, **6.3** (all gated on 2.1;
   2.1/2.3/1.2 share `mutex: cmdscan` so serialize those three)
3. **6.2** (after 6.1 + 2.1)
4. **4.1** (after 6.1 + 3.1 + 3.2)
5. **5.1** → **5.2**, **5.3** → **5.4**
