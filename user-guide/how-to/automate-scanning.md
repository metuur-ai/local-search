# Automate scanning

Local Search already rescans a repo incrementally before every query, so you rarely need to run `scan` by hand. But if you'd rather have the index stay fresh the moment something changes — right after a `git pull`, or the instant you `cd` into a repo — `scan-hooks` sets that up for you.

> **Note:** `scan-hooks` doesn't show up in `local-search help` — it's a real, working command, just not in the summary list. Everything below is verified against the source and a live run.

## Before you start

You'll need the target repo already registered (`local-search repo list`), and you need to run `scan-hooks` **from inside that repo's directory** — it resolves its target the same way a bare `local-search scan` does, so it errors with "not inside a registered repo" if you run it from anywhere else.

## Two mechanisms, pick one or both

- **`git-hooks`** — installs into that repo's own `.git/hooks/` (only works if it's a git repo). A scan of this repo fires automatically after a merge, checkout, or rebase/rewrite — the moments when files change without you having typed anything Local Search would otherwise notice.
- **`shell`** — installs a shared snippet (used by every repo you enable it for) that triggers a scan the moment you `cd` into a registered repo's directory, via your shell's own hook mechanism (zsh's `chpwd`, bash's `PROMPT_COMMAND`).

## Install

Pick your mechanism(s) explicitly with `--mechanism` (comma-separated):

```bash
cd /path/to/your/repo
local-search scan-hooks install --mechanism git-hooks
```

Or leave `--mechanism` off and choose interactively:

```bash
$ local-search scan-hooks install
Select scan-hook mechanism(s) to install:
  1) git-hooks — git .git/hooks post-merge/checkout/rewrite
  2) shell      — cd-into-repo trigger
Enter numbers (e.g. 1,2) or 'all': all
  git-hooks: installed for your-repo
  shell: wrote /Users/you/.local-search/shell-hook.sh
  Add this line to your shell rc (~/.zshrc or ~/.bashrc), then restart your shell:
      source /Users/you/.local-search/shell-hook.sh
```

> **Warning:** The `shell` mechanism writes the snippet file, but it does **not** touch your `~/.zshrc` or `~/.bashrc` for you — you still have to add that `source` line yourself, then restart your shell (or `source` the rc file) for it to take effect.

If the repo isn't a git repository, `git-hooks` is skipped with a message (`not a git repository`) rather than failing the whole command — any other mechanism you asked for still installs.

## What git-hooks actually installs

Three hooks get a managed block: `post-merge`, `post-checkout`, `post-rewrite`. `post-commit` is deliberately left alone — committing rapidly (e.g. an interactive rebase) would otherwise trigger a scan storm.

The managed content is wrapped in sentinel comments:

```
# >>> local-search scan-hooks (managed) >>>
...
# <<< local-search scan-hooks (managed) <<<
```

so it never clobbers a hook script you already had — anything outside those markers is left exactly as it was, both on install and uninstall. Re-running `install` (with or without `--force`) simply reconciles the block in place, so you never end up with it duplicated.

## Uninstall

```bash
local-search scan-hooks uninstall --mechanism git-hooks,shell
```

Same CWD rule applies — run it from inside the repo whose hooks you want removed. Uninstalling:

- **git-hooks:** removes just the managed block from each hook file. If that leaves the file empty (or just a bare shebang), the file itself is deleted; otherwise your own content stays intact and runnable.
- **shell:** deletes the shared snippet file and reminds you to remove the `source` line from your shell rc — again, that edit is yours to make; the tool never writes to your rc file directly.

## Done-check

- **git-hooks:** make a commit and merge/rebase it (or just `git checkout` a branch) — the repo's index should reflect the change without you running `scan` yourself. Check `.git/hooks/post-merge` (etc.) for the managed block.
- **shell:** open a new shell (or re-`source` your rc file), `cd` into the repo, and give it a second — a background scan should have run. `local-search repo list` will show an updated `LAST SCAN` time.

## See also

- [manage-repos.md](manage-repos.md) — running `scan` manually, and what surgical vs. full-rebuild scans mean
- [../explanation/the-disposable-index.md](../explanation/the-disposable-index.md) — why incremental rescans are safe and cheap in the first place
