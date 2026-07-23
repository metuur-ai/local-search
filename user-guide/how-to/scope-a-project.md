# Scope a project

Once you've registered a handful of repos, "search everything" stops being useful — you want *this* project's search to only ever touch *its* repos. Local Search has two separate ways to pin that down, for two separate callers, and they write to two different files. This guide covers both, and is explicit about which command writes which file so you never have to guess.

## Before you start

You'll need at least one repo already registered (`local-search repo list`). Run everything below from inside the project directory you want to scope.

## The two files, at a glance

| You run… | It writes… | Who reads it |
|---|---|---|
| `local-search scope set/init/clear` | `<cwd>/.local-search.toml` | The CLI itself, when resolving a scoped query |
| `local-search init` / `setup` | `<cwd>/.agent/local-search-config.yaml` | The Claude Code skill, before it searches on your behalf |

They don't talk to each other. Scoping your terminal with `scope set` does nothing for what Claude searches, and vice versa. If you use both the CLI directly and the Claude skill on the same project, you'll likely want to set up both.

## Scope the CLI: `.local-search.toml`

**Auto-detect from where you are** (works when your CWD is inside a registered repo):

```bash
$ local-search scope init
Wrote /path/to/project/.local-search.toml with scope = [myrepo] (auto-detected from cwd-walk (myrepo))
```

**Set an explicit list** (works anywhere, and can list more than one repo):

```bash
$ local-search scope set squirrel,uncle-os
Wrote /path/to/project/.local-search.toml with scope = [squirrel uncle-os]
```

**Check what's currently resolved, and where it came from:**

```bash
$ local-search scope show
Scope:   squirrel, uncle-os
Source:  /path/to/project/.local-search.toml
Weights: specs=1.00 graphify=0.70 codegraph=0.80
Limits:  specs=20 graphify=10 codegraph=10 blast_depth=2 blast_cap=50
```

> **Tip:** Run `scope show` with no file yet in place and Local Search creates an empty one for you with a helpful comment (`scope = ["repo1", "repo2"]`) rather than erroring — open it and fill in the list by hand if you'd rather not use `scope set`.

**Remove the file entirely:**

```bash
local-search scope clear
```

With no scope file (and no `--scope` flag on the command), `local-search find` and scoped lookups refuse to guess — you'll get an error rather than a silent "searched everything." `local-search search` without an explicit scope still searches every registered repo by default; the scope file is specifically what narrows `find` and similar CWD-aware commands.

## Scope the Claude skill: `.agent/local-search-config.yaml`

This is a different, smaller file, meant to be edited conversationally rather than by hand.

**See the current state** (creates the file if it doesn't exist yet):

```bash
$ local-search init
Project scope config: /path/to/project/.agent/local-search-config.yaml

Included repositories: (none yet)

Available repositories (local-search repo list):
  - squirrel                 558 specs
  - uncle-os                 137 specs

Edit with: local-search init --add <a,b> | --remove <a> | --set <a,b>
```

`setup` is an exact alias of `init` — use whichever reads better in the moment.

**Add repos to the scope:**

```bash
$ local-search init --add uncle-os
Project scope config: /path/to/project/.agent/local-search-config.yaml

Included repositories:
  - uncle-os
...
```

**Remove one, or replace the whole list:**

```bash
local-search init --remove uncle-os
local-search init --set squirrel,uncle-os
```

> **Note:** Every name is validated against your actual repo registry *before* anything is written. Try to add a repo that doesn't exist and nothing gets touched:
> ```
> $ local-search init --add totally-fake-repo
> Error: unknown repo(s): totally-fake-repo
> Valid entries: squirrel, team-os-example-repo, uncle-os
> ```

**Machine-readable state** (what the Claude skill actually reads before every search):

```bash
$ local-search init --json
{
  "path": "/path/to/project/.agent/local-search-config.yaml",
  "exists": true,
  "empty": false,
  "repositories": ["uncle-os"],
  "available": [ { "name": "squirrel", "path": "...", "spec_count": 558 }, ... ],
  "unknown": []
}
```

The resulting YAML is intentionally tiny:

```yaml
# LocalSearch project scope — repositories searched when running from this project.
# Names must match `local-search repo list`. Managed by `local-search init`.
repositories:
  - uncle-os
```

## Done-check

- `local-search scope show` reports the repo(s) you expect as the CLI's resolved scope.
- `local-search init` (no flags) shows the same repo(s) under "Included repositories" for the Claude skill.
- A plain `local-search find <something>` from inside the project only returns hits from the scoped repos.

## See also

- [../explanation/two-config-files.md](../explanation/two-config-files.md) — why these are deliberately two files instead of one, and the full resolution order (`--scope` flag → `.local-search.toml` walk-up → global fallback)
- [use-the-claude-skill.md](use-the-claude-skill.md) — installing the skill that reads `.agent/local-search-config.yaml`
- [../reference/cli-commands.md](../reference/cli-commands.md) — full flag reference for `scope` and `init`
