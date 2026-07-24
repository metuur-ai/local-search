# Web UI reference

Screens, controls, and the HTTP/SSE API behind the Local Search web app. For a
guided first run, see
**[../tutorials/first-web-search.md](../tutorials/first-web-search.md)**. For
what's actually happening in the retrieval pipeline, see
**[../explanation/how-search-works.md](../explanation/how-search-works.md)**.

Verified against `web/backend/src/*.js` and `web/frontend/src/*.jsx` (v0.3.1).

## Screen layout

### Search bar and controls

- **Query input** — free text, same syntax as `local-search search` (see
  **[cli-commands.md](cli-commands.md#query-syntax)**).
- **Repo picker** — checkboxes for every repo returned by `GET /api/repos`,
  plus a select-all toggle. Each repo shows its spec count and, if it has a
  knowledge graph attached, a "has graph" badge. At least one repo must be
  selected to submit a search.
- **Mode toggle** — **"AI Answer"** vs. **"Graph only · fast"**:
  - *AI Answer* spawns a Claude Code subprocess that searches, reads, and
    synthesizes a written answer with citations.
  - *Graph only* skips Claude entirely and runs `local-search json search`
    directly against each selected repo — returns in CLI time instead of model
    time, with the same sources/provenance panels but no synthesized answer.
- **File-type and tag facets** — narrow results by file extension or tag after
  a search has returned.
- **Search / Cancel buttons** — Cancel calls `POST /api/session/:id/cancel` and
  kills the running Claude/CLI subprocess (whole process group, not just the
  parent).
- **Elapsed timer** — ticks once per second while a session is running,
  formatted `mm:ss`.
- **Metrics bar** — result counts and timing once a run completes.
- **Error / cancelled banners**, including a dedicated banner for the
  `session_active` conflict (see below) with a "Kill active session" button
  that calls cancel on the blocking session before letting you retry.
- **Recent searches** — the last 5 queries, persisted to the browser's
  `localStorage` (key `local-search:history:v1`); degrades silently if
  `localStorage` isn't available.

### Reply box

When Claude's answer ends with a genuine clarifying question (as opposed to a
substantive answer that merely ends in "?"), a reply textarea appears so you
can answer inline; your reply resumes the *same* Claude session and streams
onto the *same* SSE connection.

### Result cards

Streamed sources appear as cards with a file-type icon, title, repo, path, and
relevance.

### Inspector tabs

Four tabs, always mounted (so switching between them doesn't lose streaming
state), each covering one facet of the same run:

| Tab | Shows |
|---|---|
| **AI Answer** | The synthesized, markdown-rendered answer (with lazy Mermaid diagram rendering), threaded across follow-up turns, with "Copy Markdown" / "Save .md" per turn |
| **Sources & Provenance** | Flat list of every source used, plus an explicit accounting of scope/missing/"selected but not reached" repos — this panel is designed to never go silent about a repo that was selected but never actually searched |
| **Neighborhood Map** | A Cytoscape.js graph view: node size by relevance, color by document kind, a ring around source nodes, zoom/fit controls, a full-screen toggle, a label-visibility toggle (Sources / All / None), and a type-color legend |
| **Top Tags** | A "fused ranking" illustration — the same sources re-sorted purely by relevance, numbered |

A static **retrieval-path diagram** (query → FTS/BM25 candidates → embed (256-d)
→ cosine over vectors → RRF fusion → ranked sources → answer) is shown as a
fixed reference illustration of the pipeline, not a live visualization of the
current run.

Follow-up answers go through a "rollover" confirmation modal that keeps the
last few versions of an answer accessible rather than silently discarding them.

## HTTP API

All endpoints are served by `web/backend/src/server.js`.

### `GET /api/health`

```json
{ "ok": true }
```

Always 200 if the server process is up. Used by `local-search ui` to detect
when the daemon has finished starting (polled every 150ms for up to 6s before
giving up).

### `GET /api/repos`

Runs `local-search json repos` under the hood.

- **200** — array of repo objects (name, path, spec count, graph presence).
- **500** `{ "error": "repos_failed", "message": "..." }` — the underlying CLI
  call failed.

### `POST /api/query`

Starts a new search session.

Request body:
```json
{ "q": "refund policy", "repos": ["my-project"], "mode": "ai" }
```

`mode` is `"ai"` (default) or `"graph"`.

Responses:

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ "sessionId": "..." }` | Session created; connect to its SSE stream next |
| 400 | `{ "error": "bad_json" }` | Malformed request body |
| 400 | `{ "error": "repos_required" }` | No repos selected |
| 409 | `{ "error": "session_active", "activeSessionId": "..." }` | Another session is already running; cancel it first (the UI's "Kill active session" button does exactly this) |
| 500 | `{ "error": "claude_missing", ... }` | `claude` isn't on `PATH` — only relevant in `mode: "ai"`; Graph-only mode has no such dependency and keeps working |
| 500 | `{ "error": "spawn_failed", ... }` | The subprocess (Claude or `local-search`) failed to start |

### `GET /api/session/:id/stream`

Server-Sent Events stream for a session. Event `type` values:

`status`, `activity`, `assistant`, `question`, `sources`, `provenance`,
`graph`, `answer`, `reply`, `heartbeat`, `done`, `error`

- A `heartbeat` event is sent every 15 seconds by default while a session is
  `running`, to keep the connection alive through proxies/idle timeouts.
- A safety timeout (300 seconds by default) force-ends a stuck session,
  broadcasting `error { "message": "the run exceeded the <N>ms safety timeout", "kind": "timeout" }`
  and killing the subprocess tree.
- On normal completion, `done` is broadcast (`{ "ok": true, "mode": "ai" | "graph" }`
  depending on which mode ran); the client's `EventSource` closes on `done` or
  `error`.
- If the run ends without ever producing an `answer` (and no clarifying
  `question` was pending), an `error { "kind": "exit" }` is broadcast instead of
  a silent `done`.

### `POST /api/session/:id/reply`

Answers a pending clarifying question; resumes the same Claude session
(`--resume <id>`) and continues streaming on the same open connection.

```json
{ "text": "just the enterprise plan" }
```

| Status | Body | Meaning |
|---|---|---|
| 200 | — | Accepted |
| 400 | `{ "error": "text_required" }` | Empty reply body |
| 404 | `{ "error": "no_session" }` | Unknown session id |
| 409 | `{ "error": "not_resumable" }` | Session isn't in a state that can accept a reply (e.g. nothing is awaiting one) |

### `POST /api/session/:id/cancel`

Kills the session's subprocess (entire process group) and marks it cancelled.

| Status | Body |
|---|---|
| 200 | — |
| 404 | `{ "error": "no_session" }` |

### `GET /api/graph`

Returns the persisted merged knowledge graph as node-link JSON for the graph
explorer. Reads the cached file at `web/data/graph.json` (produced by
`graph export-view`). If no graph has been built yet, returns an empty
`{ "nodes": [], "links": [] }` (never an error) so the explorer renders and
prompts a refresh.

### `POST /api/graph/refresh`

Rebuilds and persists the graph from selected repos, then returns it. Body:
`{ "repos": ["a", "b"] }` — an empty or absent list means **all** repos. Runs
`local-search graph export-view [--repos a,b | --all] --out web/data/graph.json`
and responds with the fresh graph JSON.

| Status | Body |
|---|---|
| 200 | the merged `{ nodes, links }` graph |
| 500 | `{ "error": "export_failed", "message": "<stderr>" }` |

> The Node server runs whichever `local-search` is on its `PATH`; Refresh
> therefore requires a build that includes the `graph export-view` subcommand.

## Graph explorer

Served at `/graph-explorer.html`. A self-contained page that renders the
merged graph (`GET /api/graph`), colored by OS layer (derived from each node's
`path`). The **⟳ Refresh from repos** button lists registered repos (`GET
/api/repos`), lets you pick which to include, and rebuilds the cached graph via
`POST /api/graph/refresh` without a page reload. Because the graph is persisted
to `web/data/graph.json`, reopening or refreshing the page reuses it instantly.

Filter by Type / Repo / Project / Tag (with removable "Active" chips), or by
name/title substring. Tags include the `spec:` and `link:` tags derived from
`@spec` references and `[[wikilinks]]` during indexing — filtering by a
`link:<slug>` tag isolates every file that wikilinks to that target. See
[Explore the knowledge graph](../how-to/explore-the-graph.md) for the full
walkthrough.

## Claude Code subprocess

In AI mode, the backend spawns:

```
claude -p --output-format stream-json --allowedTools 'Bash(local-search:*)' --verbose [--resume <id>]
```

Deliberately **without** `--dangerously-skip-permissions`. The prompt sent to
Claude pins it to the selected repos and instructs it to use
`local-search json search|read|related` — never shell pipes or redirection,
since the backend parses each command's whole stdout as JSON.

## Graph-only mode

Runs `local-search json search <query> <repo>` once per selected repo (no
Claude subprocess at all), deriving the same `sources`/`provenance`/`activity`
SSE events the AI path would produce, but with no synthesized `answer`. Ends
with `done { "ok": true, "mode": "graph" }` even for repos that returned zero
results — a repo is never silently dropped from the provenance accounting.

## Logs

- `~/.local-search/ui.log` — the `local-search ui` daemon's stdout/stderr.
- `web/logs/server-<timestamp>.log` — the Node backend's CLI-interaction log
  (human-readable record of every Claude/`local-search` subprocess call, with
  captured stdout/stderr and duration); tail the latest one with `npm run logs`
  from inside `web/`.
