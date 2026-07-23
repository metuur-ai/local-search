# Run the web UI

Local Search's web console gives you a browser-based search box, a synthesized answer view, and a clickable graph — same index, friendlier surface. This guide covers the ways that actually start it.

> **Warning: `local-search ui` doesn't currently work.** It looks for a `web/backend/bin/serve.js` file that doesn't exist in this build — you'll get `Error: could not locate the web/ directory…`, even if you set the `LOCAL_SEARCH_WEB_DIR` environment variable it suggests (that variable is checked against the same missing file, so it doesn't help). Use one of the two working methods below instead. Full details at [../reference/troubleshooting.md](../reference/troubleshooting.md).

## Method 1: the `local-search-ui` launcher (recommended)

If you installed via the bundled `install.sh`, this is already on your PATH — it's a separate global command from `local-search` itself, installed specifically to run the web UI in production mode.

```bash
$ local-search-ui
local-search-ui (production) listening on http://localhost:8787
```

Open `http://localhost:8787` in your browser. That's it — no build step, no `npm install` required at run time, because `install.sh` already copied the app and (if it built successfully) the compiled frontend into place.

**Pick a different port:**

```bash
PORT=8799 local-search-ui
```

**Quiet the terminal logging:**

```bash
local-search-ui --no-logs     # or --logs to force it on
```

### Stopping it, and checking whether it's running

```bash
local-search ui stop      # stops the daemon local-search started, if any
local-search ui status    # UI: running (pid N) — http://localhost:8787   /   UI: stopped
```

> **Note:** `ui stop`/`ui status` track state in `~/.local-search/ui.pid`, and logs land in `~/.local-search/ui.log`. If you started the UI via the `local-search-ui` launcher directly (rather than `local-search ui`), it's just a foreground/background process — stop it the normal way (`Ctrl-C`, or find and kill the PID) rather than expecting `local-search ui stop` to track it.

## Method 2: from a source checkout

If you're working inside a cloned `local-search` repo rather than an installed bundle, run the web app straight from its own `web/` folder:

```bash
cd local-search/web
npm install        # first time only
npm run dev         # node server.js — fast iteration, no production build step
```

or, for a production-style run that builds the frontend first:

```bash
npm start           # npm run build && NODE_ENV=production node server.js
```

Either way, it listens on port 8787 by default (override with `PORT`, same as above). Tail the current log file with:

```bash
npm run logs
```

## Done-check

- Visiting `http://localhost:8787` (or your chosen port) in a browser shows the search console, not a connection error.
- `curl http://localhost:8787/api/health` returns `{"ok":true}`.

## See also

- [../explanation/cli-and-web-together.md](../explanation/cli-and-web-together.md) — how the web UI and CLI share the same index
- [../reference/troubleshooting.md](../reference/troubleshooting.md) — the `local-search ui` bug in detail, and other common issues
