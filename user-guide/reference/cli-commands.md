# CLI command reference

Every user-facing `local-search` command, its flags, and a short example. For
task-oriented walkthroughs (adding a repo, narrowing a search, writing hooks so
scans run automatically) see **[../how-to/](../how-to/)**. For what a flag or
ranking mode actually *does* under the hood, see **[../explanation/](../explanation/)**.

Verified against `local-search help` (v0.3.1) and the `cli/` source. Where the two
disagree, this page follows the source and calls the gap out explicitly.

## Synopsis format

```
local-search <command> [subcommand] [args] [--flag value]
```

Aliases are listed next to the command name. Flags are listed in the form the
binary's own `-h` output uses (single dash, e.g. `-repos`); `--repos` and `-repos`
are accepted identically.

## Repos

### `repo add <folder> [name] [--skip-directory <name>]`

Registers a folder as a searchable repo and scans it immediately — there is no
separate index step.

```bash
$ local-search repo add ./docs my-project
Added repo "my-project" (/abs/path/to/docs)
Scanning…
  my-project: 42 files indexed
```

`--skip-directory <name>` (repeatable) excludes a subfolder by name (e.g.
`node_modules`) from scanning.

### `repo remove <name>`

Unregisters a repo. Does not touch the folder on disk — only removes it from
`~/.local-search/repos` and drops its rows from the index.

### `repo list`

Lists every registered repo with its path.

```bash
$ local-search repo list
examples                /Users/you/local-search/examples
my-project               /Users/you/docs
```

## Searching

### `search <query>` (alias `find`)

The main command. Auto-routes between full-text search and the knowledge graph.

```bash
$ local-search search "refund"
[source=fts · rank=bm25 · repos=1 (0 with graphs)]

Specs (3):
  [examples · FTS] product-specs/payments/refund.md
    Refund flow  (billing, refund, customer, payments)  .md
```

| Flag | Values | Default | Meaning |
|---|---|---|---|
| `--repos` | `all` \| `graph-only` \| `name1,name2` | `all` | Which repos to search |
| `--repo` | `<name>` | — | Single repo (legacy; prefer `--repos`) |
| `--source` | `auto` \| `fts` \| `graph` \| `both` | `auto` | Where results come from |
| `--rank` | `auto` \| `bm25` \| `graph-aware` | `auto` | Ranking strategy |
| `--semantic` (alias `--hybrid`) | flag | off | Hybrid FTS + vector re-ranking (RRF fusion) |
| `--exclude-location <pattern>` | repeatable | — | Exclude results whose path contains `pattern` |

**Auto rules** (what `auto` resolves to):
- `--source auto` → `both` if any selected repo has `graphify-out/`, else `fts`.
- `--rank auto` → `graph-aware` if any selected repo has `graphify-out/`, else `bm25`.

The `[source=... · rank=... · repos=N (M with graphs)]` line printed above every
result set shows the values actually resolved, not just what you asked for.

### Query syntax

Queries run against a Porter-stemmed, `unicode61`-tokenized full-text index, so:

- **Stemming is automatic.** `search refunding` and `search refund` match the
  same rows — no need to type the exact word form.
- **`OR`**, **`NEAR`**, prefix matches (`refund*`), and quoted **`"exact phrase"`**
  searches all work natively, as long as the rest of the query is valid FTS5
  syntax.
- **A leading `-`** excludes a term (`local-search search "refund -chargeback"`).
- **Punctuation that FTS5 doesn't understand as a query operator** — a stray
  `:`, `/`, `(`, `)`, `?`, an unbalanced `"`, or certain other symbols — is
  automatically retried as a plain literal search: each whitespace-separated
  word gets wrapped in quotes and ANDed together, so an ordinary sentence with
  punctuation in it degrades gracefully to a literal-term match instead of
  erroring out. You'll only see an error if the *sanitized* fallback also fails.

### `read <name> [repo]`

Prints a spec's full content, frontmatter included.

```bash
$ local-search read refund
---
id: capability://payments/refund
tags: billing, refund, customer, payments
---
# Refund flow
...
```

An undocumented `--directory <path>` flag (present in the source, not shown in
`local-search help`) filters to paths starting with the given directory when a
name matches more than one file.

### `list [repo-or-project]`

Lists all specs, optionally filtered by repo name or project.

### `projects`

Lists all projects across every registered repo.

### `related <name>`

Finds specs related to the given one (via frontmatter links such as `dependsOn`
and `relationships`).

### `recent [n]`

Lists the `n` most recently modified specs (default 10).

### `tags` / `tags <tag>`

With no argument, lists every tag across the index with its usage count. With a
tag argument, lists specs carrying that tag.

## Knowledge graph

### `graphs`

Lists graph status per repo (both `graphify` and `code-review-graph` kinds, with
node counts and age).

### `graphs add <name> <path> [--kind graphify|code-review-graph]`

Registers a standalone graph (not tied to a spec repo).

### `graphs remove <name>`

Unregisters a standalone graph.

### `graphs prune`

Forgets standalone graphs whose backing files have vanished from disk.

### `graph export <repo> [--edges auto|vector|tags|nodes] [--include-content] [--out <file>]`

Exports a repo's graph as node-link JSON; round-trips via `graphs add`.

> **Discrepancy:** `local-search help` documents this as
> `graph export <repo> [--edges M] [--out F]` — the `--include-content` flag
> exists in the source and in the command's own usage error, but is not listed
> in the top-level help text.

### `graph tag <tag>`

Builds a kNN vector graph over specs carrying `tag`, printed as NetworkX JSON.

### `graph search <query> [--repo <name>]`

Builds an ego vector graph seeded by a query, printed as NetworkX JSON.

### `graph explain <entity> [--json]`

One-hop typed neighborhood for a single graph entity (functions, specs, etc.),
grouped by edge type, with provenance (which repo/file declared or referenced
it).

```bash
$ local-search graph explain "payments.RefundService"
payments.RefundService  [function]
  defined: my-project:src/payments/refund.go

outgoing:
  calls:
    -> payments.ChargebackService  (my-project:src/payments/refund.go, field calls)

incoming: (none)
```

Exit codes are part of the command's contract: `0` entity found, `1` usage
error, `2` entity not found (in `--json` mode, still a well-formed result with
`"found": false` — never an error blob), `3` no database found. This command
**never scans implicitly** — if the index doesn't exist yet, it tells you to run
`local-search scan` rather than triggering one.

> **Discrepancy:** `graph explain` is a real, fully implemented command (its own
> exit-code contract, JSON schema, and `--json` mode) but does not appear
> anywhere in `local-search help`'s printed output. Only `graph tag`,
> `graph search`, and top-level `graph export` are listed there.

## Code graph

These search the `code-review-graph` (source-code call graph), distinct from the
spec/documentation index.

- `code <query> [--scope repo1,repo2]` — search code-review-graph nodes by name.
- `code hubs [--scope repo1,repo2]` — top hub functions/classes by centrality.
- `code blast <qualified-name> [--scope repo1,repo2]` — impact set: everything
  reachable from this symbol (default depth 2, cap 50 results).
- `code callers <qualified-name> [--scope repo1,repo2]` — direct callers.
- `code callees <qualified-name> [--scope repo1,repo2]` — direct callees.

## Scope

Scope controls which repos a bare `search`/`find`/`code` call considers when you
don't pass `--repos` explicitly. See **[configuration.md](configuration.md)** for
how the underlying `.local-search.toml` file is resolved.

- `scope show` — print the resolved scope, its source file, and the effective
  weights/limits.
- `scope set repo1,repo2` — write `.local-search.toml` in the current directory
  with that scope.
- `scope clear` — remove `.local-search.toml` from the current directory.
- `scope init` — auto-detect the nearest enclosing registered repo and scope to
  it.

## Skill-level project scope

### `init` / `setup`

Shows or creates the project scope file consumed by the bundled Claude Code
skill, `.agent/local-search-config.yaml`.

```bash
$ local-search init --json
{
  "path": "/abs/path/.agent/local-search-config.yaml",
  "exists": true,
  "empty": true,
  "repositories": [],
  "available": [ { "name": "my-project", "path": "...", "spec_count": 42 } ]
}
```

| Flag | Meaning |
|---|---|
| `--json` | Print machine-readable state instead of human text |
| `--dir <path>` | Operate on a project directory other than the CWD |
| `--add a,b` | Add repos to the project scope |
| `--remove a` (alias `--rm`) | Remove a repo from the project scope |
| `--set a,b` | Replace the entire project scope |

## Indexing

### `scan` / `scan <repo-name>`

Rebuilds the index. With no argument, rescans every registered repo; with a
repo name, rescans only that one.

```bash
$ local-search scan examples
  examples: indexing /path/to/examples…
  examples: 8 files indexed

Done. 8 specs indexed. Run 'local-search search <keyword>' to find specs.
```

`local-search` also opportunistically incremental-scans on its own before most
commands run, when it detects git changes since the last scan — you'll see a
`(git changes detected — incremental update…)` line when this happens. `scan`
itself always does a full rebuild.

## Web UI

### `ui` / `ui --port <n>` / `ui stop` / `ui status`

Starts (or manages) the web UI daemon.

```bash
$ local-search ui --port 9000
```

| Flag | Meaning |
|---|---|
| `-p`, `--port <n>` | Port to serve on (default `8787`) |

> **Warning:** As of v0.3.1, `local-search ui` (the `start` subcommand) cannot
> locate its own web assets and always fails with an error about a missing
> `web/` directory — see
> **[troubleshooting.md](troubleshooting.md#local-search-ui-fails-to-start)**
> for the exact messages and the working alternative.

`ui stop` and `ui status` operate on the pidfile at `~/.local-search/ui.pid` and
work regardless of the `start` bug above.

## Index inspection & maintenance

- `stats` — index statistics (repos, specs, projects, unique tags, DB size, last
  scan time).
- `db` — prints the database file path (`~/.local-search/specs.db`).
- `inspect` — dumps the full index (every indexed spec's metadata).
- `reset` — deletes the repo registry and the index, after a `y/N` confirmation
  prompt. See **[configuration.md](configuration.md)** for what exactly gets
  removed.

## Claude Code integration

### `install-skill [--global | --local | --dir <path>] [--force]`

Installs the bundled Claude Code skill.

| Flag | Meaning |
|---|---|
| `--global` (default) | Install to `~/.claude/skills/local-search` |
| `--local` (alias `-l`) | Install to `./.claude/skills/local-search` |
| `--dir <path>` | Install into an arbitrary skills directory |
| `--force` (alias `-f`) | Overwrite an existing install |

### `scan-hooks install|uninstall [--mechanism git-hooks,shell] [--force]`

Wires up automation so the index gets rescanned as git activity happens. Not
listed in `local-search help`'s printed output; documented here from the
`cli/scanhooks.go` source.

| Flag | Meaning |
|---|---|
| `--mechanism`, `-m <list>` | Comma-separated mechanisms to (un)install: `git-hooks`, `shell`, or both. Omit to be prompted interactively. |
| `--force`, `-f` | (`install` only) Overwrite an existing managed block without prompting |

Two mechanisms are available, and either or both can be installed at once:

- **`git-hooks`** — writes an idempotent, sentinel-delimited managed block into
  `post-merge`, `post-checkout`, and `post-rewrite` (deliberately **not**
  `post-commit`) that triggers a detached, backgrounded rescan of the current
  repo after the git operation completes.
- **`shell`** — writes a shared snippet to `~/.local-search/shell-hook.sh` and
  registers it with your shell's directory-change hook (zsh's
  `add-zsh-hook chpwd`, or bash's `PROMPT_COMMAND`), so changing into a
  registered repo triggers a rescan.

Both mechanisms resolve their target repo the same way `scan` does (from the
current working directory) before writing anything, and both call the same
internal dispatch command to trigger the actual rescan — that internal command
is not meant to be run by hand and isn't documented here.

`scan-hooks uninstall` removes the managed block(s)/registration for the
mechanisms named (or all of them, if `--mechanism` is omitted and you confirm
interactively) — it does not take `--force`.

## Help & version

- `help` — prints the full command summary shown by running `local-search` with
  no arguments.
- `-v`, `--version` — prints `local-search version <semver>` and exits.

## JSON output (for agents)

Every JSON subcommand mirrors a human command, but prints a single JSON value on
stdout and nothing else — no `(git changes detected…)` banners, no confirmation
prompts. This is what the bundled Claude Code skill and the web UI's "Graph
only" mode both call under the hood.

```
local-search json search <query> [repo] [--semantic]
local-search json read <name>
local-search json list [repo-or-project]
local-search json repos
local-search json related <name>
local-search json tags
local-search json stats
```

## Supported file types

| Category | Extensions |
|---|---|
| Indexed directly | `.md` `.mdx` `.txt` |
| Indexed via companion `.md` | `.jpg` `.jpeg` `.png` `.gif` `.webp` `.svg` `.pdf` |

## File locations

| What | Path |
|---|---|
| Repo registry | `~/.local-search/repos` |
| Index database | `~/.local-search/specs.db` |

Full details on every config/state file live in
**[configuration.md](configuration.md)**.
