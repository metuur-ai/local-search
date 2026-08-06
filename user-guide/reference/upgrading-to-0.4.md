# Upgrading to v0.4.0

v0.4.0 replaces three config files across two formats with **one YAML schema in
two locations**, validated on every read.

If you have never edited a config by hand, the upgrade is invisible: your
`.local-search.toml` is converted on the first run and everything keeps working.
Read on if you hand-edit configs, share them via git, or run local-search in CI.

## Auto-migration deletes `.local-search.toml`

The first time local-search reads config after upgrading, any
`.local-search.toml` reachable from your current directory is converted and
**the original is deleted**. Notices go to stderr:

```
migrated /Users/you/proj/.local-search.toml → /Users/you/proj/.agents/local-search-config.yaml
  repositories added: payments
  carried over: weights.specs, limits.blast_depth
  removed /Users/you/proj/.local-search.toml
```

Preview first, or opt out:

```bash
local-search config migrate --dry-run   # show the plan, write nothing
local-search config migrate --all       # sweep a whole tree in one commit
local-search config migrate --keep-toml # convert but leave the original

export LOCAL_SEARCH_NO_AUTO_MIGRATE=1   # never touch the working tree
```

Migration is deliberately conservative. It **refuses to delete** a TOML it could
not parse, or one containing settings this version doesn't understand — in both
cases it leaves the file and explains why. A leftover file is a nuisance; a
silently vanished scope is a bug you'd never trace.

The write is atomic and verified — the YAML is re-read and re-validated before
the TOML is removed.

## Path changes

| Before | After |
|---|---|
| `<cwd>/.local-search.toml` | `<project>/.agents/local-search-config.yaml` |
| `~/.local-search/config.toml` | `~/.local-search-config.yaml` |
| `<project>/.agents/local-search-config.yaml` | unchanged — now read by the engine too |

The `scope:` key is now `repositories:`. One list serves both the CLI engine
(`find`, `code`) and the Claude Code skill.

## Behaviour changes

**Config lookup now walks up.** `.agents/local-search-config.yaml` used to be
exact-path-only. Running `find` from `src/api/handlers/` now picks up the
project root's config. Nearest ancestor wins.

The walk stops at a **git repository root**, and never reads at `$HOME` itself.
Without those guards, one stray config in a parent directory would silently
capture the scope of everything beneath it.

> **Monorepo note:** a subdirectory with no config of its own now inherits the
> repo root's. If a sub-project needs a different scope, give it its own
> `.agents/local-search-config.yaml`.

**Malformed configs are now errors.** They used to be silently ignored, which
also meant the auto-create path could overwrite a file you were mid-edit. Now:

```bash
$ local-search config validate
/Users/you/proj/.agents/local-search-config.yaml:4:1: unknown key "repositorys"
   4 | repositorys:
     | ^
   did you mean "repositories"?
```

Forms that were tolerated before and now fail: tab indentation, unterminated
flow lists (`repositories: [a, b`), duplicate keys, and unknown keys. Use
`local-search config validate` to check; `local-search doctor` reports it too.

**`scope clear` empties the list instead of deleting the file.** Deleting would
take your `weights:` and `limits:` with it now that one file holds both. Pass
`--delete` for the old behaviour.

**`init` and `init --json` no longer create a file.** They are pure reads, so
`"exists": false` now means what it says. Only `--set`/`--add`/`--remove` write.

**`0` is now a settable value.** Weights and limits used to apply defaults with
`if x == 0`, so writing `specs: 0` silently produced `1.0`. An explicit `0` is
now honoured — use it to disable a source entirely.

**Writes no longer destroy your tuning.** `scope set` used to emit only the repo
list, wiping any weights and limits. It now edits in place, preserving them
along with your comments and key order.

## Editor validation

Generated configs carry a modeline on line 1:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/metuur-ai/local-search/main/cli/config/schema/local-search-config.schema.json
```

Editors with the YAML language server (VS Code, Neovim, JetBrains) then give you
autocomplete, inline docs, and a squiggle on typo'd keys. For air-gapped setups,
`local-search config schema --write ./schema.json` saves a local copy — repoint
the modeline at it.

Keys prefixed `x-` are reserved for third-party tooling and are never rejected.

## Mixed-version teams

**Upgrade together.** A v0.3.x CLI will re-create `.local-search.toml` files
that v0.4.0 removes, and the two versions will fight over your working tree —
every search on the old CLI re-dirties it.

If some of the team is still on v0.3.x, set `LOCAL_SEARCH_NO_AUTO_MIGRATE=1`
until everyone has upgraded, then migrate once with
`local-search config migrate --all` and commit the result in one reviewable
change.

## Housekeeping for existing installs

Earlier bundles shipped a stray `web/.agents/local-search-config.yaml`. With
walk-up added, that file would become an ancestor config for anything created
under the install directory, silently forcing an empty scope. It is no longer
packaged — delete it from an existing install:

```bash
rm ~/.local/share/local-search/web/.agents/local-search-config.yaml
```

## See also

- [One config file](../explanation/two-config-files.md) — the full model
- [Configuration](configuration.md) — every path and environment variable
- [Scope a project](../how-to/scope-a-project.md) — the task-shaped walkthrough
