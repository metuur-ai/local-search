# The disposable index

Somewhere on your machine, at `~/.local-search/specs.db`, sits a SQLite file. It has your whole spec index in it — every title, tag, and full-text token from every repo you've registered. And here's the thing worth internalizing about it: **you don't need to protect it.** Back it up if you want a warm start after a fresh install, sure, but if it vanished right now, nothing would be lost. It would just come back.

That's not a caveat or a "well, technically" — it's the design. The database is a cache of the truth, not the truth itself. Your markdown files are the truth. The `.db` is closer to a garden that regrows from seed than a vault you need to guard: burn it down and the same plants come back, because the seeds — your actual files — never left.

## Why this matters in practice

Most tools with a local database train you to be careful with it: don't delete it, don't corrupt it, back it up. `local-search` inverts that instinct entirely. The troubleshooting advice for "something seems off" is, unironically, `rm ~/.local-search/specs.db` — delete the cache and let it rebuild. There's no import/export step, no migration to run, no data you'd grieve. The only state that would take real effort to reconstruct is the *registry* of which folders you've added (`~/.local-search/repos`) — the index contents themselves are fully derived from files already on disk.

## How it stays fresh without you asking

The reason you can be this cavalier about the index is that `local-search` re-checks it before *every* query, using whichever detection strategy fits the repo:

**Git repos** get the sharp end of the stick. The last-scanned commit hash is stored in the database's `meta` table. On your next query, the tool compares that stored hash against the current `HEAD`; if they differ, it asks git — not the filesystem — for the exact list of changed files (`git diff --name-only`), plus whatever's staged, unstaged, or newly untracked. Only those files get re-indexed. Edit two files out of five hundred and only two get touched; the other 498 rows sit untouched in the database, no different from a moment ago. Git already did the bookkeeping of "what changed" — the tool just asks rather than re-deriving it the hard way.

**Non-git repos** don't have that luxury, so the fallback is coarser: a timestamp comparison (`find -newer`) against the database file. If anything in the folder is newer than the last scan, the whole repo gets rebuilt from scratch. It works, but it can't tell *which* file changed, only *that* something did — so it doesn't try to be surgical about it.

Either way, the point is the same: you never run a "sync" or "refresh" command as a matter of habit. It happens automatically, incrementally when it can be, as a side effect of just using the tool.

## Deleting it is always safe

To make the point as concretely as possible, here's the mental checklist for "can I nuke this":

| You delete… | What happens |
|---|---|
| `~/.local-search/specs.db` | Next query triggers a full rebuild from your registered repos. Slower once, then back to normal. |
| The whole `~/.local-search/` directory | You also lose the repo registry — you'll need to `repo add` your folders again, but zero source content is affected, because none of it lived there. |
| A row in the database by hand | Don't bother — it'll just get re-derived on the next scan anyway. |

Nothing you do to `specs.db` can touch your actual spec files. The arrow of truth only ever points one way: files → index, never index → files. That one-directional flow is what makes the "just delete it" advice something you can follow without a second thought, rather than a nervous last resort.

## See also

- [../how-to/](../how-to/) for rebuilding the index or troubleshooting a stale scan
- [../reference/troubleshooting.md](../reference/troubleshooting.md) for the full list of reset commands
- [two-config-files.md](two-config-files.md) for the other pieces of on-disk state (the scope files), which are *not* disposable in the same way — they hold configuration you wrote, not a derived cache
