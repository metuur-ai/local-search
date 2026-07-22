# Explainable-Search Web UI — Low-Level Design

## Architecture

Three processes, streaming session boundary:

```
Browser (Preact + Cytoscape.js)
  │  GET  /api/repos                              (populate picker)
  │  POST /api/query {q, repos[]}   → {sessionId} (start a session)
  │  GET  /api/session/:id/stream                 (SSE: live activity + results)
  │  POST /api/session/:id/reply {text}           (answer Claude's question)
  │  POST /api/session/:id/cancel                 (abort the run)
  ▼
Node HTTP backend  (thin glue: session registry + stream relay, no retrieval logic)
  │  child_process → `local-search json repos`                       (one-shot)
  │  child_process → `claude -p --output-format stream-json --verbose  (one child per
  │                    --allowedTools 'Bash(local-search:*)' ...`       turn; resumed
  │                                                                     via --resume)
  │     · reads NDJSON events from claude stdout → normalizes → SSE
  │     · captures Claude session_id from the init event for --resume
  │     · a reply starts a fresh `claude -p --resume <sid>` child
  ▼
Existing binaries on PATH: `claude`, `local-search`
  └─ local-search reads ~/.local-search/{repos, specs.db}
     (Claude runs local-search through its **Bash** tool)
```

- **Frontend** — Preact + Vite. Single view: repo picker (multi-select), query box, and a results
  area with regions — **Session Activity** (live timeline), Answer (markdown), Graph (Cytoscape.js),
  Sources, Provenance. An inline reply box appears when Claude asks a question.
- **Backend** — Node (`node:http` + built-in SSE; zero web-framework deps for the POC). Serves the
  built frontend, holds an in-memory **session registry** (`sessionId → {child, sseClients, buffers,
  startedAt}`), and relays normalized events. It contains no ranking or retrieval logic of its own.
- **Retrieval + reasoning** — delegated entirely to the existing CLI and the agentic Claude run. Claude
  invokes `local-search` through the **Bash** tool, so `stream-json` does not carry typed JSON: the
  command arrives as a shell string in `tool_use.input.command` and the output as an opaque stdout
  string in the matching `tool_result.content`. The backend therefore **classifies** each Bash command
  by its `local-search` subcommand, **strips** non-JSON progress lines from the result stdout, and
  `JSON.parse`s the remainder to derive `sources` (`json search`/`json context`) and `graph`
  (`graph search`); the answer is Claude's final assistant text. This ties the UI to what Claude
  actually ran (see "Tool-event parsing" below and EARS Unit 2b).

### Session lifecycle

1. `POST /api/query {q, repos}` (repos non-empty; 400 otherwise; one active session only, 409
   otherwise) → backend spawns the `claude` child for the first turn with a self-contained,
   scope-pinned prompt, registers a **logical** `sessionId`, returns it.
2. Frontend opens `GET /api/session/:id/stream` (SSE). Backend reads the child's stdout line by line
   (NDJSON), normalizes each event, captures the Claude `session_id` from the `system`/init event
   (stored on the logical session for later `--resume`), and pushes each event as an SSE
   `event:`/`data:` frame.
3. If the turn's `result` ends with a question and no answer, backend emits a `question` event and
   awaits a reply. `POST /api/session/:id/reply {text}` spawns a **new** `claude -p --resume
   <claudeSessionId>` child whose prompt is the reply; its events continue on the same SSE stream.
4. On a `result` event that carries an answer, backend emits `answer` + `done`, then closes the child.
   (The SSE stream stays open only while a turn's child is running or a question is pending.)
5. `POST /api/session/:id/cancel` kills the current child's process group and emits `done{cancelled:true}`.

### `claude` invocation

`claude -p --output-format stream-json --verbose --allowedTools 'Bash(local-search:*)'` (optionally
`--include-partial-messages` for token-level answer streaming). Each turn is a **discrete** invocation;
follow-up turns add `--resume <claudeSessionId>` for conversational continuity — there is no persistent
child with `--input-format stream-json` stdin, because a headless `-p` child cannot be reliably detected
as "awaiting input". The prompt is **self-contained**: it embeds the `local-search`
search→read→reason instructions and exact command syntax, pins scope to the selected repos (each command
carries the scope flag appropriate to it — `json search --scope`, `json context --scope`,
`graph search`), instructs Claude to run `graph search` for the graph, and asks clarifying questions when
it lacks what it needs. `--allowedTools 'Bash(local-search:*)'` pre-approves exactly the `local-search`
Bash calls so the run does not stall on an interactive permission prompt (no blanket
`--dangerously-skip-permissions`).

### Tool-event parsing (Bash → local-search)

Because Claude shells out via the Bash tool, the backend reconstructs structured data from string events:

1. On a `tool_use` block with `name == "Bash"`, read `input.command` (a shell string) and classify it
   by the `local-search` subcommand it runs (`json search`, `json context`, `json repos`,
   `graph search`, else "other").
2. On the matching `tool_result` (correlated by `tool_use_id`), take `content` as plain stdout, strip
   leading/trailing non-JSON progress lines, and `JSON.parse` the remaining payload.
3. Route by subcommand: `json search`/`json context` → `sources` event (`json context` also →
   provenance `{scope, missing}`); `graph search` → `graph` event; every command → an `activity` entry.
4. If parsing fails after stripping, emit an `activity` entry flagging the unparseable result — never
   crash the stream and never fabricate `sources`/`graph`.

### Normalized SSE event types (backend → browser)

| SSE `event:` | payload | derived from claude NDJSON |
| --- | --- | --- |
| `status`    | `{phase, sessionId, model?}` | `system`/init (also source of Claude `session_id`), turn start/end |
| `activity`  | `{tool, command, argv[], resultSummary}` | Bash `tool_use.input.command` + matching `tool_result` (by `tool_use_id`) |
| `assistant` | `{text, partial?}` | `assistant` text blocks (+ partials) |
| `question`  | `{text}` | a turn's `result` ends with a question and no answer |
| `sources`   | `SourceRow[]` | Bash `tool_result` of `json search`/`json context`, progress-stripped + `JSON.parse` |
| `graph`     | `NodeLinkGraph` | Bash `tool_result` of `graph search`, progress-stripped + `JSON.parse` |
| `answer`    | `{markdown}` | final `assistant` text on `result` |
| `heartbeat` | `{elapsedMs}` | backend timer, ~every 15s while running |
| `done`      | `{ok, cancelled?}` | `result` event / cancel |
| `error`     | `{message, kind}` | spawn failure, non-zero exit, unusable stream |

### Data shapes the frontend consumes

All three are recovered by progress-stripping + `JSON.parse` of the Bash `tool_result` stdout string:

```jsonc
// SourceRow  (from json search / json context tool results)
{ "repo","project","name","title","tags","path","fullpath","relevance" }
// NodeLinkGraph  (from graph search tool result — NetworkX node-link, Cytoscape-ready)
{ "directed": false, "multigraph": false, "graph": {},
  "nodes": [ { "id","label","repo","project","path","tags?","relevance?" } ],
  "links": [ { "source","target","weight" } ] }   // weight = cosine (lexical) similarity
// provenance (from json context result): { "scope":[...], "missing":[{repo,reason,fix}] }
//   json context is not listed in `json help` but works; a startup smoke test pins its shape,
//   and provenance degrades to "unavailable" if that smoke test fails.
```

The Gap-G1 join (attach `tags`/`relevance` to graph nodes) and the contributing-source highlight are
computed **client-side** by matching graph node `id`/`path` against the `sources` rows — no dependency
on Claude formatting a combined JSON blob.

### Frontend data flow / joins

- Cytoscape elements: `nodes → {data:{id,label,repo,tags,relevance}}`,
  `links → {data:{source,target,weight}}`. No transform of the node-link shape is needed.
- A graph node whose `id`/`path` appears in `sources[]` is styled as a **contributing source**
  (highlight); node size ∝ `relevance`, node color ∝ primary `tag`.
- Edge label/tooltip states "lexical similarity (cosine)" to honor Gap G5.
- Provenance region renders `scope` (honored) and `missing[]` (`repo` + `reason` + `fix`).

## Constraints

- **Zero Go changes.** Only the existing CLI/JSON surface is consumed. The Gap-G1 join
  (tags/relevance onto graph nodes) happens in the Claude/assembly layer.
- **Binaries on PATH.** `claude` and `local-search` must be resolvable; startup and per-query errors
  must be explicit when they are not.
- **Scope is always explicit** (Gap G4). The backend passes the selected `repos` into the prompt; it
  never lets Claude resolve scope from the server CWD or a `.local-search.toml`.
- **Agentic non-determinism is bounded by structured events, not a formatted blob.** Retrieval is
  Claude-driven, but `sources`/`graph` are recovered from the Bash `tool_use`/`tool_result` events
  (classify command string, strip progress lines, `JSON.parse` stdout), so they reflect the commands
  Claude actually ran (directly mitigates the G2 mismatch). The answer is the final assistant text.
- **Headless permission is pre-granted, narrowly.** Bash tool calls in `-p` mode stall on an
  interactive permission prompt; the backend passes `--allowedTools 'Bash(local-search:*)'` to
  pre-approve exactly the `local-search` calls, and never a blanket `--dangerously-skip-permissions`.
- **Runs can take minutes.** The stream must flush per event (read child stdout line-by-line, no
  buffering the whole run), send `heartbeat` frames while idle, and impose only a generous safety
  timeout (default 5 min, configurable, **unvalidated tunable**) plus user cancel — never a short hard
  timeout.
- **SSE backpressure is bounded.** `sources`/`graph`/`activity` payloads are size-capped before being
  written to the SSE stream (large graphs/result blobs are truncated with an explicit "truncated"
  marker) so a slow browser client cannot make the backend buffer an unbounded run in memory.
- **Interactive input uses `--resume`, not a persistent stdin.** Each turn is a discrete `claude -p`
  child; a reply spawns a fresh child with `--resume <claudeSessionId>`. The backend tracks the current
  child per logical session and reaps its **process group** on done/cancel/disconnect (killing the
  child and any `local-search` grandchildren).
- **Single active session.** Local-only, single user: at most one session runs at a time; a second
  `POST /api/query` is rejected (409) or explicitly supersedes the first, never silently interleaved.
- **Local-only, single user.** No auth; sessions are in-memory and ephemeral (dropped on end).
- **Model-free similarity** (Gap G5) is surfaced honestly in the UI, not hidden or relabeled.

## Key Decisions

- **Agentic backend (Gap G3 → agentic).** `claude -p` with the skill available runs the searches and
  assembles the result. Chosen for flexibility and because it lets Claude do the G1 tags/relevance
  join and reconcile sources↔graph in one place. *Rejected:* deterministic pre-run backend (cheaper,
  reproducible) — deferred; the user explicitly chose agentic.
- **Repo picker from `local-search json repos` (Gap G7).** The picker is populated by the CLI's repo
  list; selected repo names are passed into the agentic prompt as scope. "Mandatory ≥1 repo" is
  enforced in the UI (submit disabled) and re-checked server-side (400 on empty). *Rejected:*
  standardizing on `json context --scope` or per-repo `json search` fan-out in the backend — in the
  agentic model Claude issues the scoped commands itself, so the backend does not pick a CLI
  repo-filter convention.
- **Cytoscape.js for the graph.** Consumes the node-link JSON directly; rich layouts + styling for
  coloring by tag / sizing by relevance / highlighting contributing sources. *Rejected:* D3-force
  (more hand-wiring), vis-network (less styling control).
- **Node backend (not Go).** Colocates the whole web layer in one toolchain with the Preact/Vite
  frontend; the backend only shells out, so language is orthogonal to retrieval. *Rejected:* a Go
  HTTP server in `cli/` — would split toolchains and touch the Go module for pure glue.
- **Streaming via `--output-format stream-json` + SSE (not a fenced-JSON blob, not WebSocket).**
  `stream-json` gives native, structured events (tool_use, tool_result, result) — more reliable and
  more explainable than asking Claude to format one JSON block, and it is the source for the live
  activity feed. SSE (one-way server→client) carries the event stream; a plain `POST …/reply` carries
  user answers back. *Rejected:* single fenced-JSON output (no live activity, brittle parsing);
  WebSocket (bidirectional but heavier than needed — replies are infrequent and fit a POST).
- **Derive sources/graph by parsing Bash tool events (classify command + progress-strip + JSON.parse),
  client-side join.** Claude runs `local-search` via the Bash tool, so `tool_result` content is an
  opaque stdout string, not typed JSON — the backend must classify `input.command` and parse stdout.
  *Rejected:* assuming typed `tool_result` JSON (does not exist in this CLI's Bash path); trusting a
  Claude-assembled combined JSON — re-introduces the G2 mismatch and a formatting failure mode.
- **Pre-grant Bash permission narrowly with `--allowedTools 'Bash(local-search:*)'`.** Headless `-p`
  Bash calls otherwise deadlock on an interactive permission prompt. *Rejected:* blanket
  `--dangerously-skip-permissions` (over-broad, and the local sandbox denies it); `--permission-mode`
  presets (coarser than a per-tool allow-list for a single known binary).
- **`--resume`-per-clarification, not a persistent stream-json stdin child.** A headless `-p` child
  cannot be reliably detected as "awaiting input", so the awaiting-input heuristic is unimplementable;
  instead each turn is a discrete child and a reply resumes via `--resume <claudeSessionId>`.
  *Rejected:* persistent child with `--input-format stream-json` stdin — cleaner single stream in
  theory, but the yield/await signal is not observable in `-p` mode, so it cannot be built reliably.
  Trade-off accepted: a small per-turn resume latency and re-emitted init event.
- **Self-contained prompt (skill instructions embedded), not skill-auto-load.** Guarantees Claude
  knows the exact `local-search` commands even if the skill isn't installed in the server's Claude
  environment (pre-mortem risk #5).

## Out of Scope

- Deterministic/constrained pre-run backend (Gap G3 alternative).
- Any learned-embedding / semantic-quality improvement (Gap G5).
- Adding `Tags`/`Relevance` fields to the Go `GraphNode` (Gap G1 code-change alternative).
- Auth, multi-user, rate limiting, persistence, deploy/hosting.
- A separate JSON-namespaced alias for `graph`/`vgraph` (Gap G6) — Claude runs the existing
  `graph search` command directly.
- Session persistence/reconnection after a browser reload (the logical session is ephemeral and lives
  in server memory; `--resume` is used to continue a clarification turn, not to survive a page reload).
- Open-ended chat / conversation history beyond the clarification turns needed to answer the query.
- Cancelling an individual in-flight `local-search` command (cancel aborts the whole session).
