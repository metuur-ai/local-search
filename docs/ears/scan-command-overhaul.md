# Scan Command Overhaul — EARS Specifications

Keyword legend: `THE SYSTEM SHALL` (always-on) · `WHEN … THE SYSTEM SHALL`
(event) · `WHILE … THE SYSTEM SHALL` (continuous during a state) · `IF … THE
SYSTEM SHALL` (conditional/gate) · `WHERE … THE SYSTEM SHALL` (context-scoped).

"The system" = the `local-search` CLI. "Registered repo" = an entry in
`~/.local-search/repos`. "Surgical scan" = re-index one repo without deleting the
database or touching other repos' rows. "Full rebuild" = delete the DB file,
recreate schema, and re-index every registered repo.

---

## Unit 1: Scan target resolution

**Why:** The default `scan` must operate on the repo the user is standing in —
like `search` already does — and must never accidentally fan out across, or
destroy, unrelated repos. Resolution decides mode and target before any mutation.

| ID | EARS statement |
| --- | --- |
| R-1.1 | WHEN `scan` is invoked with no argument AND the current working directory is inside exactly one registered repo (or nested under it), THE SYSTEM SHALL select that repo as the sole surgical-scan target. |
| R-1.2 | WHEN `scan` is invoked with no argument AND the current working directory is enclosed by more than one registered repo, THE SYSTEM SHALL select the repo with the longest enclosing path (deepest match). |
| R-1.3 | IF `scan` is invoked with no argument AND the current working directory is not inside any registered repo, THE SYSTEM SHALL exit non-zero with a message stating that the directory is not inside a registered repo and suggesting `cd` into one or `scan all`, AND SHALL make no change to the database or any file. |
| R-1.4 | WHEN `scan <name>` is invoked AND `<name>` matches a registered repo, THE SYSTEM SHALL select that repo as the sole surgical-scan target. |
| R-1.5 | IF `scan <name>` is invoked AND `<name>` matches no registered repo, THE SYSTEM SHALL exit non-zero with an "unknown repo" message naming `<name>`, AND SHALL make no change to the database or any file. |
| R-1.6 | WHEN `scan all` is invoked, THE SYSTEM SHALL select the full-rebuild mode over every registered repo. |
| R-1.7 | THE SYSTEM SHALL treat `rebuild` and `index` as exact aliases of `scan`, preserving identical target-resolution behavior. |
| R-1.8 | IF no repos are registered at all, THE SYSTEM SHALL exit with the existing "no repos added yet" guidance rather than resolving a target. |

---

## Unit 2: Surgical single-repo scan

**Why:** Scanning one repo must be cheap and non-destructive; today it wipes the
entire database and drops every other repo's index. Surgical scans preserve
everything not targeted.

| ID | EARS statement |
| --- | --- |
| R-2.1 | WHEN a surgical scan runs for a target repo, THE SYSTEM SHALL delete only that repo's rows (`specs`, `spec_vectors`, `spec_tags`, `spec_edges`, and its FTS entries) and re-index that repo. |
| R-2.2 | WHILE a surgical scan runs, THE SYSTEM SHALL NOT delete the database file. |
| R-2.3 | WHEN a surgical scan completes, THE SYSTEM SHALL leave every non-targeted registered repo's indexed rows unchanged. |
| R-2.4 | IF the database file does not exist when a surgical scan is requested, THE SYSTEM SHALL create the schema and index only the target repo (bootstrap), and SHALL NOT fan out to other repos. |
| R-2.5 | WHERE the target repo is a git repository, THE SYSTEM SHALL record its current HEAD commit as the latest indexed commit for that repo after a surgical scan. |
| R-2.6 | WHEN `scan all` (full rebuild) runs, THE SYSTEM SHALL delete the database file, recreate the schema, and re-index every registered repo (baseline behavior retained). |
| R-2.7 | THE SYSTEM SHALL tolerate a concurrent scan and query against the same database (e.g. a bounded SQLite `busy_timeout` and/or WAL mode) such that a scan contending with a read does not fail the read or corrupt the index. |
| R-2.8 | WHEN a surgical scan runs, THE SYSTEM SHALL apply the delete-and-reindex as a single atomic unit such that a concurrent reader observes either the pre-scan or the post-scan index for that repo, never an empty intermediate state. |

---

## Unit 3: Per-repo state tracking

**Why:** Users need to answer "when was this repo added, last scanned, last
updated, and at what commit?" — none of which is durably tracked per repo today.

| ID | EARS statement |
| --- | --- |
| R-3.1 | WHEN a repo is added via `repo add`, THE SYSTEM SHALL record the current UTC timestamp as that repo's date-added in the flat repos file. |
| R-3.2 | THE SYSTEM SHALL persist a repo's date-added such that it survives a full rebuild (`scan all`), i.e. it SHALL NOT be stored only in the database. |
| R-3.3 | WHEN a surgical scan or a full rebuild indexes a repo, THE SYSTEM SHALL record that repo's last-scan timestamp keyed per repo; in full-rebuild mode this SHALL be written per repo (not only as the global value), so a just-rebuilt repo shows a last-scan time rather than a placeholder. |
| R-3.4 | WHEN any code path applies an incremental update for a repo (every incremental site, not just one), THE SYSTEM SHALL record that repo's last-index-update timestamp keyed per repo. |
| R-3.5 | THE SYSTEM SHALL keep the latest indexed commit hash per repo consistent with the actual HEAD indexed by the most recent scan or incremental update. |
| R-3.6 | WHERE a repo was registered before this change and has no recorded date-added, THE SYSTEM SHALL treat its date-added as unknown rather than fabricating one. |
| R-3.7 | THE SYSTEM SHALL retain the existing global last-scan value consumed by `stats` for backward compatibility. |

---

## Unit 4: `repo list` display

**Why:** The tracked state is only useful if it is visible; today `repo list`
shows name and path only.

| ID | EARS statement |
| --- | --- |
| R-4.1 | WHEN `repo list` runs, THE SYSTEM SHALL display, per registered repo: name, path, date added, last-scan time, last-index-update time, and latest indexed commit hash. |
| R-4.2 | WHERE a displayed field has no recorded value (e.g. never scanned, unknown date-added, or non-git repo), THE SYSTEM SHALL render a placeholder (`—`) rather than a blank or a zero value. |
| R-4.3 | THE SYSTEM SHALL render timestamps as human-relative ages using the existing age formatter, and the commit hash in short (7-character) form. |
| R-4.4 | IF the database is absent or unreadable when `repo list` runs, THE SYSTEM SHALL still list every repo's name, path, and date-added, rendering DB-derived columns as `—` and exiting zero. |

---

## Unit 5: Configurable scan automation (`scan-hooks`)

**Why:** Users want scans to keep up with git activity without remembering to run
`scan`, but must control which mechanism gets installed and be able to remove it
cleanly.

| ID | EARS statement |
| --- | --- |
| R-5.1 | WHEN `scan-hooks install` is invoked with `--mechanism` listing one or more of {git-hooks, shell}, THE SYSTEM SHALL install exactly the listed mechanism(s) for the CWD-resolved repo. |
| R-5.2 | WHEN `scan-hooks install` is invoked without `--mechanism`, THE SYSTEM SHALL interactively present the available mechanisms and install only those the user selects. |
| R-5.3 | IF `scan-hooks install` or `scan-hooks uninstall` is invoked outside any registered repo, THE SYSTEM SHALL exit non-zero with the same "not inside a registered repo" error as `scan`, AND SHALL install/remove nothing. |
| R-5.4 | WHERE the git-hooks mechanism is installed AND the target is a git repository, THE SYSTEM SHALL write managed, executable hook scripts for `post-merge`, `post-checkout`, and `post-rewrite` under the repo's `.git/hooks/`, each triggering a surgical scan of that repo. (`post-commit` is intentionally excluded: it is redundant with the query-time incremental path and the highest scan-storm risk on rapid commits.) |
| R-5.4a | IF the git-hooks mechanism is requested for a repo that is not a git repository, THE SYSTEM SHALL skip git-hook installation with a clear message and SHALL still install any other requested mechanism (e.g. shell). |
| R-5.5 | WHEN installing a git hook where a hook file already exists, THE SYSTEM SHALL insert its managed content within sentinel delimiters and SHALL NOT overwrite or discard the user's existing hook content (unless `--force` replaces a stale managed block). |
| R-5.6 | WHERE the shell mechanism is installed, THE SYSTEM SHALL write a shell-hook snippet that triggers a surgical scan when the user enters a registered repo, and SHALL print the exact `source` line for the user to add to their shell rc rather than editing rc files automatically. |
| R-5.7 | WHEN any installed automation fires for a repo, THE SYSTEM SHALL run the surgical single-repo scan for that repo (not incremental-only and not a full rebuild). |
| R-5.8 | WHEN `scan-hooks uninstall` runs for a mechanism, THE SYSTEM SHALL remove only that mechanism's managed content — deleting a git hook file only if it becomes empty after the managed block is removed — and SHALL leave unrelated user content intact. |
| R-5.9 | THE SYSTEM SHALL make `scan-hooks install` idempotent: re-installing an already-installed mechanism SHALL NOT duplicate managed content. |
| R-5.10 | WHERE a git hook triggers a surgical scan, THE SYSTEM SHALL ensure the git operation is never blocked or failed by the scan: the hook SHALL exit 0 regardless of scan outcome, and SHOULD dispatch the scan without holding the git process (background/detached). |
| R-5.11 | WHEN automation fires for a git repo, THE SYSTEM SHALL first check whether tracked, staged, unstaged, or untracked spec files changed since the last indexed commit, and SHALL skip the scan (do nothing, exit 0) when nothing changed; only on a detected change (or for a non-git repo) SHALL it run the surgical scan. |
| R-5.12 | THE SYSTEM SHALL guard automation against re-entrancy so that overlapping triggers for the same repo do not run concurrent scans (e.g. a per-repo lock; a second overlapping trigger is a no-op). |
| R-5.13 | THE SYSTEM SHALL use an automation lock that is automatically released if the holding process exits abnormally (e.g. `flock`/PID-based), so that a crashed or killed detached scan does not permanently disable future automation. |

---

## Unit 6: Backward compatibility & internal callers

**Why:** Existing configs and internal flows must not break, and the surgical
primitive must replace the whole-DB-wipe that `repo add`/`repo remove` cause today.

| ID | EARS statement |
| --- | --- |
| R-6.1 | WHEN loading `~/.local-search/repos`, THE SYSTEM SHALL parse legacy 2- and 3-field lines (name, path, optional skip-dirs) without error, treating date-added as unknown. |
| R-6.2 | WHEN writing the repos file, THE SYSTEM SHALL emit the date-added as a 4th pipe-delimited field only when a value exists, keeping lines readable by prior parsing. |
| R-6.3 | WHEN a repo is added via `repo add`, THE SYSTEM SHALL index only the newly added repo (surgical) and SHALL NOT delete the database or re-scan other repos. |
| R-6.4 | WHEN a repo is removed via `repo remove`, THE SYSTEM SHALL delete only that repo's rows (surgical) and its flat-file entry, and SHALL NOT delete the database or re-scan other repos. |
| R-6.5 | THE SYSTEM SHALL preserve the existing auto-incremental-at-query-time behavior (reads still trigger incremental updates for changed git repos), adding only the per-repo last-index-update timestamp write. |
| R-6.6 | WHEN writing a repos line that has a date-added but no skip-directories, THE SYSTEM SHALL emit an empty skip-directories field so date-added remains the 4th positional field (`name\|path\|\|<added_at>` — the backslashes are Markdown table escaping; the literal on disk is `name|path||<added_at>`), AND SHALL parse such a line back to empty skip-directories with the given date-added. |
