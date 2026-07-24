# Manage your repos

Repos are the folders Local Search actually knows about — nothing gets searched until you've registered it. This guide covers the full lifecycle: adding, excluding noisy subfolders, listing, removing, forcing a rebuild, and safely wiping the index when you want a clean slate.

## Before you start

You'll need `local-search` on your PATH (`local-search --version` should print something). If you haven't registered anything yet, start with [../tutorials/getting-started.md](../tutorials/getting-started.md) instead — this guide assumes you already know the basic add/search loop.

## Add a repo

```bash
$ local-search repo add /path/to/your/docs
Added repo "docs" (/path/to/your/docs)
Scanning…
  docs: indexing /path/to/your/docs…
  docs: 42 files indexed

Done. 42 specs indexed. Run 'local-search search <keyword>' to find specs.
```

If you don't give it a name, Local Search uses the folder's own name (`docs` here, from `/path/to/your/docs`). Give it an explicit name as a second argument when you want something else:

```bash
local-search repo add /path/to/your/docs product-docs
```

Adding a repo scans it immediately — there's no separate "index now" step to remember.

> **Note:** Registering the same name (or the same path) twice fails on purpose: `Repo "docs" already registered`. Pick a different name, or `repo remove` the old one first.

## Skip noisy subfolders

Big repos often have folders you never want indexed — `node_modules`, a `dist` build output, a vendored `.devlocal` scratch area. Most of the time you don't have to name them: **every scan already skips the directories your repo's `.gitignore` and `.graphifyignore` exclude.** So if `node_modules/`, `dist/`, and `graphify-out/` are in `.gitignore`, they're skipped automatically — no flags needed. This is applied at scan time, so editing `.gitignore` and rescanning takes effect immediately, and repos added before this behavior existed pick it up on their next scan.

Only directory-style ignore patterns are honored (`node_modules/`, `build/`, or a bare `vendor`); file globs like `*.log`, negations (`!keep/`), and multi-segment paths (`web/frontend/dist`) are left to the file-level scanner.

For anything not covered by an ignore file, exclude it at registration time with `--skip-directory` (repeatable):

```bash
local-search repo add /path/to/monorepo \
  --skip-directory node_modules \
  --skip-directory dist
```

> **Tip:** `--skip-directory` takes a folder **name**, not a path — `node_modules`, never `src/node_modules` or a trailing slash. Any value containing `/`, `\`, `|`, or `,` is rejected outright, and `.`/`..` aren't allowed either. Local Search matches the name at any depth, so one `--skip-directory node_modules` skips every `node_modules` folder in the tree, however deeply nested.

Changed your mind about what to skip after the fact? There's no `repo edit` — remove the repo and re-add it with the flags you want.

## List what's registered

```bash
$ local-search repo list
NAME                  ADDED       LAST SCAN    LAST UPDATE  COMMIT    PATH
docs                  2h          2h           —            a1b2c3d   /path/to/your/docs
product-docs          1d          10h          —            —        /path/to/product-docs
```

An em dash means "not applicable yet" — a fresh repo shows no `LAST UPDATE` until its second scan, and a non-git folder never gets a `COMMIT`.

## Remove a repo

```bash
$ local-search repo remove docs
Removed repo "docs"
```

This deletes just that repo's rows from the index — everything else stays untouched and searchable. The one exception: if `docs` was the *last* repo registered, removing it deletes the whole index file (there's nothing left to keep an index of), and you'll get a fresh one automatically the next time you add a repo.

## Force a rebuild

Local Search re-checks your files before every query, so you'd rarely need to do this by hand — but sometimes you want to force it, e.g. after a bulk rename that confuses git's change detection.

```bash
local-search scan            # rescan just the repo enclosing your CWD
local-search scan docs       # rescan one named repo, wherever you are
local-search scan all        # full rebuild: every repo, from scratch
```

> **Note:** `scan` with no arguments is **surgical**, not global — it re-indexes only the single repo your current directory is inside of, and errors with "not inside a registered repo" if you run it somewhere unrelated. If your CWD sits inside more than one registered repo (nested registrations), the deepest enclosing one wins. To rebuild *everything*, you need `scan all` explicitly — a bare `scan` only touches one repo at a time.

`scan all` is the only path that deletes and recreates the whole database file; a targeted `scan <repo>` (or the CWD-resolved bare `scan`) replaces just that repo's rows in one atomic step, so a search running at the same moment never sees a half-empty index.

## Done-check

- `local-search repo list` shows the repo(s) you expect, with sensible `LAST SCAN` times.
- A quick `local-search search <something-you-know-is-in-there>` returns a hit.

## Wipe the index (or start completely over)

The index (`~/.local-search/specs.db`) is a disposable cache — see [../explanation/the-disposable-index.md](../explanation/the-disposable-index.md) for why. You can delete that file directly and it'll rebuild on the next query or scan, with zero data loss, because it's derived entirely from your registered folders.

`local-search reset` goes one step further:

```bash
$ local-search reset
This will delete all repos and the index. Continue? [y/N] y
Reset complete. Start fresh with: local-search repo add /path/to/specs
```

> **Warning:** `reset` deletes **both** the index (`specs.db`) *and* your repo registry (`~/.local-search/repos`). It's not just "clear the cache" — every repo you've registered is forgotten too, and you'll need to `repo add` them all again. If you only want to force a rebuild, use `scan all` instead; save `reset` for when you genuinely want to start over from zero.

## See also

- [../reference/cli-commands.md](../reference/cli-commands.md) — full flag reference for `repo`, `scan`, and `reset`
- [../explanation/the-disposable-index.md](../explanation/the-disposable-index.md) — why the index is safe to delete, and how incremental rescans work
- [automate-scanning.md](automate-scanning.md) — set up automatic rescans instead of running `scan` by hand
