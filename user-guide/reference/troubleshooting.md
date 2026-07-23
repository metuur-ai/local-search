# Troubleshooting

Symptom-first reference. For task-oriented setup help, see
**[../how-to/](../how-to/)**; for the underlying design decisions, see
**[../explanation/](../explanation/)**.

## `local-search: command not found`

**Cause:** `~/.local/bin` (the installer's default `$INSTALL_DIR`) isn't on
your shell's `PATH`, or the install step was skipped.

**Fix:**
1. Confirm the binary exists: `ls ~/.local/bin/local-search`.
2. If it's missing, re-run the installer (see
   **[../tutorials/getting-started.md](../tutorials/getting-started.md)**).
3. If it exists but isn't found, add `~/.local/bin` to `PATH` in your shell
   profile (`~/.zshrc`, `~/.bashrc`) and open a new terminal:
   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   ```
4. If you installed to a custom `INSTALL_DIR`, use that path instead.

## `local-search ui` fails to start

**Symptom:** running `local-search ui` prints one of two errors and never
opens a browser:

```
Error: could not locate the web/ directory. Run from inside the local-search repo, or set LOCAL_SEARCH_WEB_DIR to the path of its web/ folder
```
or, if you had `LOCAL_SEARCH_WEB_DIR` set:
```
Error: LOCAL_SEARCH_WEB_DIR=<path> does not contain backend/bin/serve.js
```

**Cause:** confirmed bug in v0.3.1. `local-search ui` looks for a marker file
at `web/backend/bin/serve.js` to locate the web app, but that file doesn't
exist anywhere in the shipped bundle (`web/backend/` only ships
`package.json` and `src/`, no `bin/`). This means the search fails no matter
where you run the command from, and setting `LOCAL_SEARCH_WEB_DIR` does
**not** work around it — the same marker check applies to that path too.

**Fix — use one of the two working launch paths instead:**

- **The installed launcher** (if you used `install.sh` and it's on your
  `PATH`):
  ```bash
  local-search-ui
  ```
  This script runs the Node server directly and doesn't go through
  `local-search ui`'s broken directory-detection at all.

- **From a checkout, in dev mode:**
  ```bash
  cd web
  npm install
  npm run dev
  ```
  Then open `http://localhost:8787` yourself (`npm run dev` doesn't open a
  browser for you).

`local-search ui stop` and `local-search ui status` are unaffected by this bug
— they only read the pidfile and don't need to locate `web/`.

## Search returns no results

Work through these in order:

1. **Is the repo registered?** `local-search repo list` — if it's not there,
   `local-search repo add <folder> <name>` first.
2. **Is your scope excluding it?** `local-search scope show` tells you the
   resolved scope and where it came from. If the repo you expect isn't in
   scope, either pass `--repos <name>` explicitly or adjust `.local-search.toml`
   (see **[configuration.md](configuration.md)**, "Engine scope" section).
3. **Is the index stale?** Local Search usually rescans automatically on git
   changes, but if you edited files without committing, or the auto-rescan
   didn't trigger, force one: `local-search scan <repo-name>` (or `scan` with
   no argument to rescan everything).
4. **Is the query itself the problem?** Try a single common word first. If
   punctuation in your query (colons, slashes, parentheses, an unbalanced
   quote) is involved, see
   **[cli-commands.md](cli-commands.md#query-syntax)** — it should
   automatically degrade to a literal-term search rather than erroring, but
   simplifying the query rules out any doubt.

## `--semantic` doesn't seem to change anything

**Cause:** `--semantic` (alias `--hybrid`) re-ranks using vector similarity in
addition to full-text matching (RRF fusion of the two rankings). On a small
corpus, or when your query's best full-text match is also its best semantic
match, the ranking can come out identical to a plain search — that's expected,
not a sign the flag is broken. It matters most on larger corpora, or queries
phrased very differently from the wording in the target document. Also
confirm the repo you're searching actually has embeddings/graph data
available — `local-search stats` and `local-search graphs` show what's
present per repo.

## Web UI shows `claude_missing`

**Cause:** the backend tried to spawn `claude` (the Claude Code CLI) for an
"AI Answer" search, and it isn't on `PATH` for the process running the web
server.

**Fix:** either install/expose the `claude` CLI to that process's environment,
or switch the mode toggle to **"Graph only · fast"** — it doesn't spawn Claude
at all and keeps working regardless of whether `claude` is installed.

## Port `8787` already in use

**Cause:** something else is bound to the web UI's default port, or a previous
UI daemon is still running.

**Fix:**
- Check for a stale daemon first: `local-search ui status`; stop it with
  `local-search ui stop` if it's yours.
- Otherwise, pick a different port:
  ```bash
  local-search ui --port 9000
  ```
  or, running the server directly:
  ```bash
  PORT=9000 npm run dev   # from web/
  ```

## `session_active` (409) in the web UI

**Cause:** a search session is already running for this server process, and
the backend refuses to start a second one concurrently.

**Fix:** the error response includes `activeSessionId`; the web UI surfaces
this as a banner with a **"Kill active session"** button, which calls
`POST /api/session/:id/cancel` on the blocking session before letting your new
query through. If you're calling the API directly, cancel that session id
yourself first.

## Where the logs live

| Log | Path | How to view |
|---|---|---|
| `local-search ui` daemon | `~/.local-search/ui.log` | Any text viewer/`tail` |
| Web backend CLI-interaction log | `web/logs/server-<timestamp>.log` | `npm run logs` (from `web/`) tails the newest one |

## Safely resetting

The index (`~/.local-search/specs.db`) is a disposable cache — nothing is lost
by deleting it, since it's rebuilt entirely from your markdown files on the
next scan. Two ways to reset:

- `local-search reset` — interactive; deletes the repo registry
  (`~/.local-search/repos`) and the index together, after a `y/N` confirmation.
- Delete `~/.local-search/specs.db` by hand if you only want to force a full
  reindex without losing your registered repos — the next search or `scan`
  rebuilds it from scratch.
