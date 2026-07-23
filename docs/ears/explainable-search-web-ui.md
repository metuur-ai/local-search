# local-search-ui Web UI — EARS Specifications

Arrow of intent: HLD → LLD → **EARS** → code/tests. Each unit below is an implementable slice.

## Unit 1: Repo picker + `/api/repos`

**Why:** The user must choose which indexed repos a query reaches, and the choice must be grounded in
the real registry — not a hardcoded list. Selecting repos is mandatory (research Gap G7).

| ID    | EARS statement |
| ----- | -------------- |
| R-1.1 | WHEN the frontend loads, THE SYSTEM SHALL request `GET /api/repos` and render one selectable entry per repo returned. |
| R-1.2 | WHEN `/api/repos` is requested, THE SYSTEM SHALL run `local-search json repos`, tolerantly extract the `RepoRow[]` JSON from stdout (skipping any leading non-JSON progress lines), and respond with the parsed rows. |
| R-1.3 | WHERE a repo has `graph_node_count > 0`, THE SYSTEM SHALL show a "has graph" indicator on that repo's picker entry. |
| R-1.4 | THE SYSTEM SHALL display each repo's `spec_count` as a badge on its picker entry. |
| R-1.5 | WHILE zero repos are selected, THE SYSTEM SHALL keep the query-submit control disabled. |
| R-1.6 | IF `/api/repos` fails or `local-search` is not on PATH, THE SYSTEM SHALL show an explicit error and SHALL NOT render an empty picker as success. |

## Unit 2: Query session + agentic Claude invocation (streaming)

**Why:** The answer must be produced agentically by the Claude CLI running the `local-search` skill,
scoped to exactly the selected repos, over a long-lived streaming session so the run is observable and
interactive (Gap G3, G4).

| ID    | EARS statement |
| ----- | -------------- |
| R-2.1 | WHEN `POST /api/query` is received with a query and ≥1 repo, THE SYSTEM SHALL spawn a `claude -p --output-format stream-json --verbose` child with a self-contained, scope-pinned prompt, capture the Claude `session_id` from its `system`/init event, and respond with a `sessionId`. |
| R-2.2 | IF `POST /api/query` is received with an empty `repos` array, THE SYSTEM SHALL respond `400` and SHALL NOT spawn Claude. |
| R-2.3 | WHEN the frontend opens `GET /api/session/:id/stream`, THE SYSTEM SHALL read the child's NDJSON stdout line-by-line and emit normalized SSE events (`status`, `activity`, `assistant`, `question`, `sources`, `graph`, `answer`, `heartbeat`, `done`, `error`) as they occur, without buffering the whole run. |
| R-2.4 | WHEN the prompt embeds the selected repos as scope, THE SYSTEM SHALL instruct Claude to attach the scope flag appropriate to each command (`json search --scope`, `json context --scope`, `graph search` per its own scoping) rather than assuming one uniform flag, and SHALL NOT rely on server-CWD scope resolution. |
| R-2.5 | IF the child exits without producing a usable answer, or the stream cannot be parsed, THE SYSTEM SHALL emit an `error` event with an explicit message and SHALL NOT fabricate an answer. |
| R-2.6 | IF the `claude` binary is not on PATH, THE SYSTEM SHALL emit an explicit `error` identifying the missing binary. |
| R-2.7 | THE SYSTEM SHALL derive `sources` and `graph` from the parsed **Bash tool events** that ran `local-search` (per Unit 2b), rather than from a Claude-formatted combined JSON block. |
| R-2.8 | WHEN spawning the `claude` child, THE SYSTEM SHALL pass `--allowedTools 'Bash(local-search:*)'` (and no blanket `--dangerously-skip-permissions`) so the agentic `local-search` calls run without an interactive permission prompt that would deadlock a headless session. |
| R-2.9 | WHILE a session is active, THE SYSTEM SHALL permit only one active session for the single local user; IF a new `POST /api/query` arrives while one runs, THE SYSTEM SHALL reject it (409) or supersede the prior session explicitly, not silently interleave two Claude children. |

## Unit 2b: Tool-event parsing (Bash → local-search)

**Why:** Claude runs `local-search` through the **Bash** tool, so `stream-json` carries the command as a
shell string in `tool_use.input.command` and the output as an opaque stdout string in the matching
`tool_result.content` — not typed JSON. The backend must recover which `local-search` subcommand ran and
parse its JSON out of noisy stdout before it can emit `sources`/`graph`. This unit is load-bearing for
R-2.7, R-4.1, and R-5.1.

| ID    | EARS statement |
| ----- | -------------- |
| R-2b.1 | WHEN a `tool_use` event for the Bash tool is received, THE SYSTEM SHALL parse `input.command` as a shell string and classify it by the `local-search` subcommand it invokes (`json search`, `json context`, `json repos`, `graph search`, or other). |
| R-2b.2 | WHEN the matching `tool_result` for a classified Bash command arrives, THE SYSTEM SHALL take `content` as a plain stdout string, strip any leading/trailing non-JSON progress lines, and `JSON.parse` the remaining JSON payload. |
| R-2b.3 | WHERE the parsed command is `json search`/`json context`, THE SYSTEM SHALL emit a `sources` event; WHERE it is `graph search`, THE SYSTEM SHALL emit a `graph` event. |
| R-2b.4 | IF a classified command's `tool_result` cannot be parsed as JSON after stripping progress lines, THE SYSTEM SHALL emit an `activity` entry noting the unparseable result and SHALL NOT crash the stream or fabricate `sources`/`graph`. |
| R-2b.5 | WHERE a Bash command is not a recognized `local-search` subcommand, THE SYSTEM SHALL still surface it as an `activity` entry but SHALL NOT attempt JSON extraction. |

## Unit 3: Answer rendering

**Why:** The primary deliverable is a readable natural-language answer.

| ID    | EARS statement |
| ----- | -------------- |
| R-3.1 | WHEN an `answer` SSE event is received, THE SYSTEM SHALL render its markdown in the Answer region. |
| R-3.2 | WHILE a session is running, THE SYSTEM SHALL show a running state and disable re-submission until the session ends. |
| R-3.3 | IF the session ends (`done`) with no answer, THE SYSTEM SHALL indicate "no answer produced" rather than showing a blank region. |
| R-3.4 | WHERE partial-message events are received, THE SYSTEM MAY render the answer incrementally as it streams. |

## Unit 4: Knowledge-graph visualization

**Why:** The user must see the specs that powered the answer and their similarity relationships, with
contributing sources visually distinguished (Gap G1 join, Gap G5 honesty).

| ID    | EARS statement |
| ----- | -------------- |
| R-4.1 | WHEN a query response contains a `graph`, THE SYSTEM SHALL render its `nodes` and `links` in a Cytoscape.js graph without transforming the node-link shape. |
| R-4.2 | WHERE a graph node's `id` or `path` also appears in `sources[]`, THE SYSTEM SHALL visually mark that node as a contributing source. |
| R-4.3 | THE SYSTEM SHALL size graph nodes by `relevance` and color them by `tag` when those fields are present on the node. |
| R-4.4 | THE SYSTEM SHALL label graph edges as lexical (token-overlap cosine) similarity, not semantic similarity. |
| R-4.5 | IF the `graph` has zero nodes, THE SYSTEM SHALL show an empty-graph message rather than a blank canvas. |

## Unit 5: Sources + provenance panels

**Why:** Explainability requires showing which files contributed and honestly reporting which selected
repos were reached vs. skipped, with a fix hint (research §4/§8).

| ID    | EARS statement |
| ----- | -------------- |
| R-5.1 | WHEN a `sources` event is received, THE SYSTEM SHALL list each source with its `title`/`name`, `repo`, `path`, `tags`, and `relevance`. |
| R-5.2 | WHEN scope/provenance is available (from a parsed `json context` result), THE SYSTEM SHALL render `scope` as the set of repos actually searched. |
| R-5.3 | WHERE `missing[]` is non-empty, THE SYSTEM SHALL show each missing repo with its `reason` and `fix`. |
| R-5.4 | IF a selected repo does not appear in `scope`, THE SYSTEM SHALL make that omission visible to the user (via `missing` or an explicit note), not silent. |
| R-5.5 | THE SYSTEM SHALL be validated by a startup smoke test that `local-search json context --scope <repo>` returns the `{scope, missing}` shape the provenance panel depends on, since `json context` is not advertised in `json help`; IF the smoke test fails, provenance SHALL degrade to "unavailable" rather than showing fabricated scope. |

## Unit 6: Retrieval-path view

**Why:** The question asks to show the path from vector DB → answer; the CLI already exposes the
before/after ordering that makes the pipeline observable (research §3).

| ID    | EARS statement |
| ----- | -------------- |
| R-6.1 | THE SYSTEM SHALL present the retrieval pipeline as a **static, documentary** ordered-stage diagram (query → FTS/BM25 candidates → embed 256-d → cosine over vectors → RRF fusion → ranked sources → answer), labeled as the fixed `local-search` architecture and not claimed to be reconstructed per-run from stream events. |
| R-6.2 | WHERE per-hit `relevance` is available in `sources[]`, THE SYSTEM SHALL use it to illustrate the fused ranking in the retrieval-path view. |

## Unit 7: Live session activity feed

**Why:** During a multi-minute agentic run the user must be able to *see what is happening* — every
`local-search` command Claude runs and what it returned — not stare at a spinner.

| ID    | EARS statement |
| ----- | -------------- |
| R-7.1 | WHEN an `activity` event is received, THE SYSTEM SHALL append a timeline entry showing the tool/command, its arguments, and a short result summary, in arrival order. |
| R-7.2 | WHEN an `assistant` event is received, THE SYSTEM SHALL show Claude's progress text in the activity feed. |
| R-7.3 | WHILE the session is running, THE SYSTEM SHALL keep the activity feed visible and continuously updated as new events arrive. |
| R-7.4 | WHEN a `status` event indicates a phase change (started, searching, awaiting input, done), THE SYSTEM SHALL reflect the current phase in the UI. |
| R-7.5 | THE SYSTEM SHALL preserve the full ordered activity log for the session so the user can scroll back through every step after it completes. |

## Unit 8: Interactive clarification loop

**Why:** WHEN Claude needs more information to answer well, it must be able to ask the user and
continue the *logical* session with the reply. In headless `-p` mode a persistent child cannot be
reliably detected as "awaiting input", so each turn is a discrete `claude -p` invocation resumed by
`--resume <claudeSessionId>`; the sessionId gives conversational continuity across turns.

| ID    | EARS statement |
| ----- | -------------- |
| R-8.1 | WHEN a turn's `result` event carries an assistant message that poses a question and yields no answer, THE SYSTEM SHALL treat the turn as ended-with-question, emit a `question` event, and present a reply input. |
| R-8.2 | WHEN the user submits a reply, THE SYSTEM SHALL `POST /api/session/:id/reply {text}` and the backend SHALL start a new `claude -p --resume <claudeSessionId> --output-format stream-json --verbose` child whose prompt is the user's reply, continuing the same logical session. |
| R-8.3 | WHILE the session is awaiting a user reply, THE SYSTEM SHALL keep the logical session record (including the Claude `session_id` to resume) alive and SHALL NOT time it out as an idle failure. |
| R-8.4 | WHEN a reply resumes the session, THE SYSTEM SHALL continue emitting activity/answer events for the resumed turn on the existing SSE stream without the frontend opening a new stream. |
| R-8.5 | THE SYSTEM SHALL record each question and the user's reply in the activity feed. |

## Unit 9: Long-wait handling

**Why:** A run may take minutes; the connection must stay alive and the wait must stay legible, and the
user must be able to abort (pre-mortem risk #2).

| ID    | EARS statement |
| ----- | -------------- |
| R-9.1 | WHILE a session is running, THE SYSTEM SHALL emit `heartbeat` events (~every 15s) so the SSE connection and any proxies stay alive. |
| R-9.2 | WHILE a session is running, THE SYSTEM SHALL display elapsed time and the current activity so the UI never appears frozen. |
| R-9.3 | WHEN the user cancels, THE SYSTEM SHALL `POST /api/session/:id/cancel`, kill the Claude child, and emit `done{cancelled:true}`. |
| R-9.4 | THE SYSTEM SHALL apply only a generous safety timeout (default 5 min, configurable) as an unvalidated tunable and, on hitting it, SHALL emit an explicit `error` rather than a silent drop. |
| R-9.5 | IF the SSE client disconnects or the session is cancelled, THE SYSTEM SHALL kill the Claude child's whole process group (the child plus any `local-search` grandchildren it spawned) so no orphaned process is left running. |
