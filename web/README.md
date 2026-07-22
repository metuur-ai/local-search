# explainable-search

A single Node project (npm workspaces) that runs the Preact frontend and the
raw-Node HTTP API as **one process**, in two modes.

## Requirements

- Node.js (with `npm` workspaces support)
- The `local-search` and `claude` CLIs must be available on your `PATH`.

## Setup

Install once from this directory. This installs both workspaces and hoists
shared dev deps (notably Vite) to the root `node_modules`:

```bash
npm install
```

## Commands

- `npm run dev` — start the single process in dev mode. Vite runs in middleware
  mode on the same port as the API, so you get HMR and `/api/*` from one server
  (http://localhost:8787 by default; override with `PORT`).
- `npm start` — build the frontend, then serve it in production mode from the
  same process (`NODE_ENV=production node server.js`). Static assets are served
  from `frontend/dist`.
- `npm run build` — build the frontend into `frontend/dist`.
- `npm run logs` — `tail -f` the newest CLI interaction log under `logs/`.
- `npm test` — run backend (`node --test`) and frontend (`vitest`) tests.

## CLI interaction logging

Every interaction with the external `local-search` and `claude` CLIs (the exact
command, the claude prompt, captured stdout/stderr, exit code and duration) can
be logged to a file for debugging. The log is human-readable and meant to be
`tail -f`'d.

Enable/disable precedence:

- `--no-logs` or `LOG_CLI=0` — always **disabled**.
- `--logs` or a truthy `LOG_CLI` (`1`/`true`) — **enabled** (and `--logs` also
  echoes a one-line summary per interaction to the console).
- Otherwise: **enabled by default in dev** (`npm run dev`), **disabled in prod**.

Log file path: `LOG_FILE` if set, else `logs/server-<YYYYMMDD-HHMMSS>.log`. The
`logs/` directory is gitignored. Use `npm run logs` to tail the newest file.
