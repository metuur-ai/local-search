# Scope a project

Once you've registered a handful of repos, "search everything" stops being useful — you want *this* project's search to only ever touch *its* repos. This guide covers pinning that down.

## Before you start

You'll need at least one repo already registered (`local-search repo list`). Run everything below from inside the project directory you want to scope.

## One file, two commands

Since v0.4.0 there is **one** config file:

```
<project>/.agent/local-search-config.yaml
```

Its `repositories:` list is read by both the CLI engine (`find`, `code`) and the Claude Code skill. There's also a global fallback at `~/.local-search-config.yaml` for a machine-wide default.

Two commands write that same list — use whichever phrasing fits what you're doing:

| You run… | Reads better when |
|---|---|
| `local-search scope set/init/clear` | You're thinking about your own terminal searches |
| `local-search init --set/--add/--remove` | You're setting up what Claude searches (and what the skill drives) |

> **One thing to internalize:** `local-search search` reads **neither** — it takes `--repos`, defaulting to `all`. Only `find` and `code` resolve scope. That's why the Claude skill appends `--repos <list>` by hand to every `search` call.

## Set the scope

**Auto-detect from where you are** (works when your CWD is inside a registered repo):

```bash
$ local-search scope init
Wrote /path/to/project/.agent/local-search-config.yaml with repositories = [myrepo] (auto-detected from cwd-walk (myrepo))
```

**Set an explicit list** (works anywhere, and can list more than one repo):

```bash
$ local-search scope set squirrel,uncle-os
Wrote /path/to/project/.agent/local-search-config.yaml with repositories = [squirrel uncle-os]
```

The same thing in the skill's phrasing, with incremental variants:

```bash
local-search init --set squirrel,uncle-os   # replace the whole list
local-search init --add uncle-os            # add without disturbing the rest
local-search init --remove uncle-os         # drop one
```

`setup` is an exact alias of `init` — use whichever reads better in the moment.

> **Note:** Every name is validated against your actual repo registry *before* anything is written, so a typo fails loudly rather than producing a config that points at nothing:
> ```
> $ local-search init --add totally-fake-repo
> Error: unknown repo(s): totally-fake-repo
> Valid entries: squirrel, team-os-example-repo, uncle-os
> ```

Writes are **non-destructive**: setting the repository list leaves any `weights:`, `limits:`, and comments in the file byte-for-byte intact. They're also atomic, so a concurrent reader never sees a half-written file.

## Check what's resolved

```bash
$ local-search scope show
Scope:   squirrel, uncle-os
Source:  /path/to/project/.agent/local-search-config.yaml
Weights: specs=1.00 graphify=0.70 codegraph=0.80
Limits:  specs=20 graphify=10 codegraph=10 blast_depth=2 blast_cap=50
```

The `Source` line matters: resolution **walks up** from your current directory, so the file governing your search may be several levels above where you're standing. (The walk stops at a git repository root, and never reads at `$HOME`.)

Machine-readable state — this is what the Claude skill reads before every search:

```bash
$ local-search init --json
{
  "path": "/path/to/project/.agent/local-search-config.yaml",
  "exists": true,
  "empty": false,
  "repositories": ["uncle-os"],
  "available": [ { "name": "squirrel", "path": "...", "spec_count": 558 } ],
  "unknown": []
}
```

Both `init` and `init --json` are **pure reads** — they never create the file. Only `--set`/`--add`/`--remove` write.

## Clear the scope

```bash
$ local-search scope clear
Cleared repositories in /path/to/project/.agent/local-search-config.yaml (weights and limits kept).
Use --delete to remove the file entirely.
```

`clear` empties the list rather than deleting the file, because deleting would take your weights and limits with it. Pass `--delete` for a genuine clean slate.

With no scope resolvable at all (and no `--scope` flag), `local-search find` and `code` refuse to guess — you get an error rather than a silent "searched everything."

## Hand-editing

The file is yours; edit it directly whenever that's easier:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/metuur-ai/local-search/main/cli/config/schema/local-search-config.schema.json
repositories:
  - squirrel
  - uncle-os

weights:   # optional
  specs: 1.0

limits:    # optional
  blast_cap: 50
```

That first line is a modeline: editors with the YAML language server give you autocomplete and flag typo'd keys inline. Check a file any time with:

```bash
$ local-search config validate
/path/to/project/.agent/local-search-config.yaml:4:1: unknown key "repositorys"
   4 | repositorys:
     | ^
   did you mean "repositories"?
```

A malformed config is a hard error — `find` will refuse to run rather than silently ignoring it, which is why `config validate` exists as the read-only way to see the problem.

## Upgrading from v0.3.x

If this project has a `.local-search.toml`, it's converted automatically the first time local-search reads config after the upgrade, and the TOML is removed. Preview it first:

```bash
$ local-search config migrate --dry-run
[dry-run] migrated /path/to/project/.local-search.toml → /path/to/project/.agent/local-search-config.yaml
  repositories added: payments
  carried over: weights.specs, limits.blast_depth
```

Set `LOCAL_SEARCH_NO_AUTO_MIGRATE=1` to opt out entirely — useful in shared CI checkouts where you don't want the working tree touched.

## Done-check

- `local-search scope show` reports the repo(s) you expect, and a `Source` path you recognize.
- `local-search init` (no flags) shows the same repo(s) under "Included repositories".
- A plain `local-search find <something>` from inside the project only returns hits from the scoped repos.

## See also

- [../explanation/two-config-files.md](../explanation/two-config-files.md) — the full resolution order, why the walk-up stops where it does, and what changed in v0.4.0
- [use-the-claude-skill.md](use-the-claude-skill.md) — installing the skill that reads this file
- [../reference/cli-commands.md](../reference/cli-commands.md) — full flag reference for `scope`, `init`, and `config`
