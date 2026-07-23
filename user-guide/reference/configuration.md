# Configuration reference

Every file, environment variable, and directory Local Search reads or writes.
For *why* there are two separate config files (engine scope vs. skill scope),
see **[../explanation/two-config-files.md](../explanation/two-config-files.md)**.

## State the CLI owns

### `~/.local-search/repos` — repo registry

Plain text, one repo per line, pipe-delimited:

```
name|/absolute/path/to/repo|skipdir1,skipdir2|2026-07-01T12:00:00Z
```

Written by `repo add`, `repo remove`, `graphs add`, `graphs remove`. Not meant
to be hand-edited, though it's plain text if you need to inspect it. There's no
CLI command that prints this path directly (`local-search db` prints the
*database* path instead) — it's always the fixed location above.

### `~/.local-search/specs.db` — the index

A SQLite database (FTS5 virtual table, Porter + unicode61 tokenizer) containing
every indexed spec's content and metadata, plus the knowledge-graph tables used
by `graph explain`. Printed by `local-search db`.

This file is a **disposable cache**, not a source of truth — everything in it
is rebuilt from your markdown files by `scan`. It is always safe to delete;
`reset` deletes it along with the repo registry. See
**[../explanation/the-disposable-index.md](../explanation/the-disposable-index.md)**.

### `~/.local-search/ui.pid` and `~/.local-search/ui.log`

Written by `local-search ui` when the web UI daemon starts: `ui.pid` holds the
process ID and port, `ui.log` captures the daemon's stdout/stderr. `ui stop` and
`ui status` read `ui.pid` to find and signal the running process.

## Engine scope — `<cwd>/.local-search.toml`

Controls which repos a bare `search`/`find`/`code` call considers, plus ranking
weights and result limits, for whoever runs `local-search` from that directory
(or a subdirectory of it — resolution walks upward). Written by `scope set`,
removed by `scope clear`, inspected with `scope show`.

```toml
scope = ["repoA", "repoB"]

[weights]
specs = 1.0
graphify = 0.7
codegraph = 0.8

[limits]
specs = 20
graphify = 10
codegraph = 10
blast_depth = 2
blast_cap = 50
```

`scope set` only ever writes the `scope = [...]` line — `[weights]` and
`[limits]` are optional and fall back to the defaults below if omitted or if
the file doesn't have those sections at all.

| Key | Section | Default | Meaning |
|---|---|---|---|
| `specs` | `[weights]` | `1.0` | Ranking weight for spec/doc matches |
| `graphify` | `[weights]` | `0.7` | Ranking weight for graphify-sourced matches |
| `codegraph` | `[weights]` | `0.8` | Ranking weight for code-review-graph matches |
| `specs` | `[limits]` | `20` | Max spec results returned |
| `graphify` | `[limits]` | `10` | Max graphify results returned |
| `codegraph` | `[limits]` | `10` | Max code-review-graph results returned |
| `blast_depth` | `[limits]` | `2` | Default traversal depth for `code blast` |
| `blast_cap` | `[limits]` | `50` | Default max nodes returned by `code blast` |

A scope entry can also point at a standalone graph rather than a spec repo, by
prefixing it with `graph:` (e.g. `scope = ["graph:my-graph"]`).

**Resolution order** (highest precedence first):
1. An explicit `--scope` flag on the command itself.
2. `<cwd>/.local-search.toml`, found by walking upward from the current
   directory.
3. `~/.local-search/config.toml` — an optional global default scope, same
   schema as above.
4. Walking upward from the current directory to find the nearest folder that
   is itself a registered repo, and scoping to just that repo.
5. If none of the above resolve, the command fails with a "no scope" error.

`scope show` prints which of these sources was actually used.

## Skill scope — `<project>/.agent/local-search-config.yaml`

A separate, much simpler file consumed by the bundled Claude Code skill (not
the Go search engine directly) — it tells the skill which registered repos to
include when it runs `local-search search --scope ...` on your behalf from
inside a project. Managed by `local-search init` (alias `setup`).

```yaml
# LocalSearch project scope — repositories searched when running from this project.
# Names must match `local-search repo list`. Managed by `local-search init`.
repositories:
  - my-project
  - shared-docs
```

The schema is a single `repositories:` list of repo names (must match names
from `local-search repo list`); everything else in the file is the header
comment shown above. `local-search init --json` reports:

| Field | Meaning |
|---|---|
| `path` | Absolute path to the config file |
| `exists` | Whether the file is present |
| `empty` | Whether `repositories:` is empty or the file doesn't exist |
| `repositories` | Currently configured repo names |
| `available` | Every registered repo, with `path` and `spec_count` |
| `unknown` | Configured names that aren't currently registered repos |

Edit it via `init --add a,b`, `init --remove a` (alias `--rm`), or `init --set
a,b` — see the `init` / `setup` entry in **[cli-commands.md](cli-commands.md)**.

## Environment variables

| Variable | Used by | Meaning | Default |
|---|---|---|---|
| `LOCAL_SEARCH_WEB_DIR` | `local-search ui` | Path to the `web/` folder, when the binary can't locate it on its own | (auto-detected) |
| `PORT` | `web/server.js` | Port the Node backend listens on | `8787` |
| `NODE_ENV` | `web/server.js`, `local-search-ui` launcher | `production` serves the built frontend from `frontend/dist`; anything else runs in Vite dev-middleware mode | `production` (via the launcher); unset in a plain `node server.js` |
| `LOG_CLI` | `web/server.js` | Truthy enables logging of every Claude/CLI subprocess interaction to a file; `0` disables it | on in dev mode, off in prod, overridable |
| `LOG_FILE` | `web/server.js` | Overrides the CLI-interaction log file path | `web/logs/server-<timestamp>.log` |

`local-search ui`'s `--port` flag is equivalent to setting `PORT` for the
spawned server process.

> **Note:** `LOCAL_SEARCH_WEB_DIR` is documented here for completeness, but as
> of v0.3.1 it does not actually help — see
> **[troubleshooting.md](troubleshooting.md#local-search-ui-fails-to-start)**.

## Installer layout (`install.sh`)

`install.sh` installs three independent components, each individually
skippable:

| Component | Destination | Skip with |
|---|---|---|
| CLI binary | `$INSTALL_DIR` (default `~/.local/bin`) | `INSTALL_CLI=0` |
| Claude Code skill | `$SKILLS_DIR/local-search` (default `~/.claude/skills`) | `INSTALL_SKILLS=0` |
| Web UI assets | `$WEB_DIR` (default `~/.local/share/local-search/web`) | `INSTALL_WEB=0` |
| `local-search-ui` launcher script | `$INSTALL_DIR` (same directory as the CLI binary, so it's on `PATH` alongside it) | (tied to `INSTALL_WEB`) |

Additional env vars: `BUNDLE_URL` overrides where the installer fetches a
release tarball from when not run inside a checkout (default points at the
GitHub Releases asset `local-search-bundle.tar.gz`).

The web UI step is skipped with a warning (CLI and skill still install) if
`node` isn't found on `PATH`. It also warns if `frontend/dist/index.html` is
missing after copying, since the UI will 404 until built.

The generated `local-search-ui` launcher always sets `NODE_ENV=production` by
default and execs Node against an entry file it picks at install time:
`$WEB_DIR/bin/local-search-ui.js` if the source bundle has one, otherwise
`$WEB_DIR/server.js`.

> **Discrepancy:** `web/package.json` declares
> `"bin": {"local-search-ui": "bin/local-search-ui.js"}`, but no such file
> exists in the source tree — only `web/bin/explainable-search.js` does. The
> installer's existence check therefore always fails and it falls back to
> `server.js` as the launcher's entry point, regardless of what
> `package.json` claims.

## Web UI default port

`8787` — used by `web/server.js` when `PORT` is unset, and by `local-search ui`
when `--port` is omitted. Override with `--port <n>` (CLI) or `PORT=<n>` (direct
`node` invocation).
