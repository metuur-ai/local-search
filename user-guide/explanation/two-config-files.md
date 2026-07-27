# One config file (it used to be three)

> **This page used to be called "Two config files, two audiences."** As of
> v0.4.0 that framing is obsolete: the CLI engine and the Claude Code skill now
> read the *same* file, with the same key. The filename is kept so existing
> links still work. If you're on v0.3.x, see
> [what changed](#what-changed-in-v040) at the bottom.

There is one config file, and it can live in one of two places:

| File | Scope |
|---|---|
| `<project>/.agent/local-search-config.yaml` | per-project, found by **walking up** from your current directory |
| `~/.local-search-config.yaml` | global fallback when no project config is found |

Same schema, same parser, same validation. The project file wins when both
exist.

## What's in it

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/metuur-ai/local-search/main/cli/config/schema/local-search-config.schema.json
repositories:
  - platform
  - docs
  - graph:legacy

weights:   # optional — omit to take defaults
  specs: 1.0
  graphify: 0.7
  codegraph: 0.8

limits:    # optional
  specs: 20
  graphify: 10
  codegraph: 10
  blast_depth: 2
  blast_cap: 50
```

`repositories` is the list both readers consult. Names must match
`local-search repo list`; a `graph:` prefix refers to a registered external
graph rather than a repo. `weights` and `limits` tune the engine's blended
scoring and result caps — the skill ignores them, which is fine, because absent
keys simply take their defaults.

The first line is a **modeline**. Editors with the YAML language server (VS Code,
Neovim, JetBrains) read it and give you autocomplete, inline docs, and a red
squiggle on a typo'd key. `local-search config schema` prints the schema if you
want a local copy for an air-gapped setup.

## Who reads it

- **The CLI engine** — `find` and `code`, resolving which repos a scoped query
  should hit, plus the weights and limits it scores with.
- **The Claude Code skill** — before it searches on your behalf, so it stays
  inside your project's boundary rather than fanning out across every repo
  you've ever registered.

One caveat worth internalizing: **`local-search search` reads neither file.** It
takes `--repos`, defaulting to `all`. Only `find` and `code` resolve scope. That
is why the skill appends `--repos <list>` by hand to every `search` call — the
scope it read would otherwise have no effect.

## How it's found

Resolution order, highest precedence first:

1. `--scope` flag on the command line
2. `<cwd>/.agent/local-search-config.yaml`, **walking up** — so running `find`
   from `src/api/handlers/` still picks up the project root's config
3. `~/.local-search-config.yaml`
4. The nearest registered repo whose path encloses your current directory
5. **Hard error.** Silently searching every registered repo would turn
   local-search into a noisy global tool, so an unresolvable scope stops rather
   than guesses.

The walk-up stops at a **git repository root**, and never reads at `$HOME`
itself. Both guards exist for the same reason: without them, one stray config in
a parent directory would silently capture the scope of everything beneath it.

## How to edit it

Two doors to the same list — use whichever fits what you're doing:

```bash
local-search scope set repo1,repo2   # engine-facing phrasing
local-search init --set repo1,repo2  # skill-facing phrasing, also --add/--remove
local-search init --json             # read the state as data (writes nothing)
```

Both validate every name against your repo registry **before** writing, so a
typo fails loudly with the list of valid names instead of producing a config
that points at nothing.

Hand-editing is fine too — the file is yours. `local-search config validate`
checks it and reports problems with line numbers:

```
/Users/you/proj/.agent/local-search-config.yaml:4:1: unknown key "repositorys"
   4 | repositorys:
     | ^
   did you mean "repositories"?
```

Writes are **non-destructive**: `scope set` replaces the repository list and
leaves your weights, limits, and comments byte-for-byte intact. Writes are also
atomic (temp file + rename), so a concurrent reader can never observe a
half-written file.

## The bigger picture: everything on disk

| File | Scope | Written by | Read by |
|---|---|---|---|
| `<project>/.agent/local-search-config.yaml` | per-project (walks up) | `scope set` / `init` | The engine **and** the skill |
| `~/.local-search-config.yaml` | global | you, by hand | The engine, when no project config is found |
| `~/.local-search/repos` | global | `repo add` / `repo remove` | The CLI, to know which repos exist at all |
| `~/.local-search/specs.db` | global | every scan | Every search/list/read — see [the disposable index](the-disposable-index.md) |

Note the direction of dependency: the config *references* repo names, and those
names only mean anything because they're registered in `~/.local-search/repos`.
Remove a repo from the registry and any config still naming it reports it under
`unknown` — surfaced, not silently deleted, because the usual cause is temporary
(a checkout you haven't made on this machine yet) and rewriting a shared file to
match one machine's state would be worse than the dangling name.

## What changed in v0.4.0

Three files became one:

| Before | After |
|---|---|
| `<cwd>/.local-search.toml` (TOML, engine, key `scope:`) | `<project>/.agent/local-search-config.yaml` |
| `~/.local-search/config.toml` (TOML, engine global) | `~/.local-search-config.yaml` |
| `<project>/.agent/local-search-config.yaml` (YAML, skill, key `repositories:`) | unchanged path, now also read by the engine |

Any `.local-search.toml` is **migrated automatically** the first time
local-search reads config after the upgrade: its contents are merged into the
YAML and the TOML is deleted. Preview it first with
`local-search config migrate --dry-run`, or opt out entirely with
`LOCAL_SEARCH_NO_AUTO_MIGRATE=1`.

Migration is deliberately conservative. It refuses to delete a TOML it could not
parse, or one containing settings this version doesn't understand — in both
cases it leaves the file and tells you why, because a silently vanished scope is
much worse than a leftover file.

Three behaviours also changed:

- **Malformed configs are now errors.** They used to be silently ignored, which
  also meant the auto-create path could overwrite a file you were mid-edit.
- **`scope clear` empties the list rather than deleting the file** — deleting
  would take your weights and limits with it. `--delete` still removes it.
- **`init --json` no longer creates a file.** It's a pure read, so `exists:
  false` now means what it says.

## See also

- [the disposable index](the-disposable-index.md) — why `specs.db` isn't in the
  "handle with care" category
- [../how-to/scope-a-project.md](../how-to/scope-a-project.md) — the
  step-by-step
- [../reference/configuration.md](../reference/configuration.md) — every path
  and environment variable
