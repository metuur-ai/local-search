# Explainable-Search Web UI — Tasks

Arrow of intent: HLD → LLD → EARS → **tasks** → code/tests.
Source of truth: `docs/ears/explainable-search-web-ui.md`. Each story cites its EARS ID.
Greenfield web layer only — **zero changes to Go `cli/`** (LLD constraint).

## Unit 0: Scaffolding

- [x] 0.1 Node HTTP backend skeleton (est: ~30m)
  - why: every endpoint, the SSE relay, and the session registry hang off one `node:http` server that also serves the built frontend — nothing else can be built until it exists.
  - acceptance: a `node:http` server boots, serves static assets, and exposes an in-memory session registry (`sessionId → {child, sseClients, claudeSessionId, startedAt}`) with no retrieval logic of its own (LLD Architecture).
  - verify: `curl localhost:<port>/` returns the app shell; a unit test asserts the registry create/get/delete lifecycle.

- [x] 0.2 Preact + Vite frontend skeleton (est: ~30m)
  - why: the single-view shell (repo picker, query box, and result regions — Activity, Answer, Graph, Sources, Provenance) is the host every UI story renders into.
  - acceptance: a Preact + Vite app builds and mounts one view with empty placeholder regions for each result area (LLD Frontend).
  - verify: `vite build` succeeds; loading the page shows the labeled regions.

## Unit 1: Repo picker + `/api/repos`

- [x] 1.1 `GET /api/repos` with tolerant parse (deps: 0.1, est: ~25m)
  - why: the picker must be grounded in the real registry, and `local-search json repos` prints leading progress lines before its JSON, so a naive parse breaks.
  - acceptance: R-1.2 — WHEN `/api/repos` is requested, THE SYSTEM SHALL run `local-search json repos`, tolerantly extract the `RepoRow[]` JSON (skip leading non-JSON lines), and respond with the parsed rows.
  - verify: unit test feeds captured stdout with a progress prefix and asserts parsed `RepoRow[]`; integration `curl /api/repos` returns rows.

- [x] 1.2 Render selectable picker entries (deps: 0.2, 1.1, est: ~25m)
  - why: the user selects which repos a query reaches; the choice is mandatory and must be visible.
  - acceptance: R-1.1 — WHEN the frontend loads, THE SYSTEM SHALL request `GET /api/repos` and render one selectable entry per repo returned.
  - verify: with a stub `/api/repos`, the picker lists one entry per repo and selection state toggles.

- [x] 1.3 Per-repo indicators: has-graph + spec_count (deps: 1.2, est: ~15m)
  - why: the user needs to see which repos carry a graph and how much each holds before choosing.
  - acceptance: R-1.3 — WHERE `graph_node_count > 0`, show a "has graph" indicator; R-1.4 — display `spec_count` as a badge on each entry.
  - verify: stub rows with/without graph and varying counts render the indicator and badge correctly.

- [x] 1.4 Disable submit while zero repos selected (deps: 1.2, est: ~10m)
  - why: selecting ≥1 repo is mandatory (Gap G7); an unscoped query must be impossible from the UI.
  - acceptance: R-1.5 — WHILE zero repos are selected, THE SYSTEM SHALL keep the query-submit control disabled.
  - verify: submit is disabled at 0 selected, enabled at ≥1.

- [x] 1.5 Surface `/api/repos` failure explicitly (deps: 1.1, 1.2, est: ~15m)
  - why: an empty picker rendered as success would hide a missing binary or a dead backend and mislead the user.
  - acceptance: R-1.6 — IF `/api/repos` fails or `local-search` is not on PATH, show an explicit error and do not render an empty picker as success.
  - verify: stub a 500 / missing-binary response; the UI shows an error, not an empty-but-ok picker.

## Unit 2: Query session + agentic Claude invocation (streaming)

- [x] 2.1 `POST /api/query` spawns Claude, returns sessionId, captures Claude `session_id` (deps: 0.1, est: ~40m)
  - why: the agentic run starts here; the captured Claude `session_id` is what later `--resume` turns depend on.
  - acceptance: R-2.1 — WHEN `POST /api/query` has a query and ≥1 repo, spawn `claude -p --output-format stream-json --verbose` with a self-contained scope-pinned prompt, capture `session_id` from the init event, and respond with a `sessionId`.
  - verify: unit test with a fake `claude` that emits an init event asserts the returned `sessionId` and stored `claudeSessionId`.

- [x] 2.2 Reject empty repos with 400 (deps: 2.1, est: ~10m)
  - why: mandatory scope must be re-checked server-side, not trusted from the UI.
  - acceptance: R-2.2 — IF `repos` is empty, respond `400` and do not spawn Claude.
  - verify: POST with `repos:[]` returns 400 and spawns no child.

- [x] 2.3 SSE stream: line-by-line NDJSON → normalized events (deps: 2.1, est: ~45m)
  - why: the run is observable only if each event is flushed as it occurs; buffering the whole multi-minute run would defeat the live feed.
  - acceptance: R-2.3 — WHEN the frontend opens `GET /api/session/:id/stream`, read child stdout line-by-line and emit normalized SSE events (`status`, `activity`, `assistant`, `question`, `sources`, `graph`, `answer`, `heartbeat`, `done`, `error`) without buffering the whole run.
  - verify: feed a fake NDJSON script; assert SSE frames arrive incrementally in order.

- [x] 2.4 Scope-pinned prompt with per-command scope flags (deps: 2.1, est: ~25m)
  - why: scope must be deterministic (Gap G4) and each `local-search` command takes its own scope flag — one uniform flag would be wrong.
  - acceptance: R-2.4 — embed selected repos as scope, attaching the appropriate flag per command (`json search --scope`, `json context --scope`, `graph search`), never relying on server-CWD resolution.
  - verify: snapshot the built prompt for a 2-repo selection; assert each command template carries the correct scope flag.

- [x] 2.5 Fail explicitly on unusable answer / unparseable stream (deps: 2.3, est: ~20m)
  - why: a fabricated or blank-but-successful answer would violate the explainability contract.
  - acceptance: R-2.5 — IF the child exits without a usable answer or the stream can't be parsed, emit an `error` event with an explicit message and do not fabricate an answer.
  - verify: fake child that exits non-zero / emits garbage → an `error` event, no `answer`.

- [x] 2.6 Explicit error when `claude` is missing (deps: 2.1, est: ~10m)
  - why: a missing binary must be named, not surface as a generic hang.
  - acceptance: R-2.6 — IF `claude` is not on PATH, emit an explicit `error` identifying the missing binary.
  - verify: spawn with a bogus binary path → `error` event names the missing binary.

- [x] 2.7 Derive sources/graph from parsed Bash tool events (deps: 2b.3, est: ~10m)
  - why: ties the UI's sources/graph to the commands Claude actually ran, not to a Claude-formatted blob (mitigates G2).
  - acceptance: R-2.7 — derive `sources` and `graph` from the parsed Bash tool events (Unit 2b), not from a combined JSON block.
  - verify: end-to-end fake run: `sources`/`graph` SSE events originate only from parsed tool results.

- [x] 2.8 Pre-grant Bash permission narrowly (deps: 2.1, est: ~15m)
  - why: headless `-p` Bash calls deadlock on an interactive permission prompt; a narrow allow-list unblocks exactly `local-search`.
  - acceptance: R-2.8 — pass `--allowedTools 'Bash(local-search:*)'` and no blanket `--dangerously-skip-permissions`.
  - verify: assert the spawned argv contains the allow-list flag and omits the blanket bypass.

- [x] 2.9 Enforce single active session (deps: 2.1, est: ~15m)
  - why: single local user, single Claude child — interleaving two runs would corrupt the registry and the shared index reads.
  - acceptance: R-2.9 — WHILE a session is active, reject a new `POST /api/query` (409) or explicitly supersede the prior session; never silently interleave.
  - verify: a second concurrent query returns 409 (or a documented supersede) with only one live child.

## Unit 2b: Tool-event parsing (Bash → local-search)

- [x] 2b.1 Classify Bash command by `local-search` subcommand (deps: 2.3, est: ~25m)
  - why: `stream-json` carries the command as a shell string in `tool_use.input.command`; the backend must recover which subcommand ran before it can parse anything.
  - acceptance: R-2b.1 — WHEN a Bash `tool_use` arrives, parse `input.command` and classify it (`json search`, `json context`, `json repos`, `graph search`, or other).
  - verify: table test of command strings → expected classifications, including quoting/whitespace variants.

- [x] 2b.2 Strip progress lines + `JSON.parse` result stdout (deps: 2b.1, est: ~25m)
  - why: `tool_result.content` is opaque stdout polluted with progress lines; the JSON must be isolated before parsing.
  - acceptance: R-2b.2 — WHEN a classified command's `tool_result` arrives (matched by `tool_use_id`), take `content` as stdout, strip leading/trailing non-JSON lines, and `JSON.parse` the remainder.
  - verify: fixtures of real polluted stdout parse to the expected object.

- [x] 2b.3 Route parsed results to `sources`/`graph` events (deps: 2b.2, est: ~15m)
  - why: parsed payloads must become the typed SSE events the UI consumes.
  - acceptance: R-2b.3 — `json search`/`json context` → `sources` event; `graph search` → `graph` event.
  - verify: parsed search fixture emits `sources`; parsed graph fixture emits `graph`.

- [x] 2b.4 Fail-soft on unparseable results (deps: 2b.2, est: ~15m)
  - why: a single malformed result must not crash the stream or fabricate data.
  - acceptance: R-2b.4 — IF a classified result can't be parsed after stripping, emit an `activity` entry noting it and do not crash the stream or fabricate `sources`/`graph`.
  - verify: malformed fixture → `activity` note, stream continues, no `sources`/`graph`.

- [x] 2b.5 Non-local-search commands → activity only (deps: 2b.1, est: ~10m)
  - why: Claude may run other Bash commands; those belong in the feed but must not be parsed as JSON.
  - acceptance: R-2b.5 — WHERE a Bash command is not a recognized `local-search` subcommand, surface it as `activity` but do not attempt JSON extraction.
  - verify: an `ls`/`cat` command yields an `activity` entry and no parse attempt.

## Unit 3: Answer rendering

- [x] 3.1 Render answer markdown (deps: 2.3, 0.2, est: ~20m)
  - why: the primary deliverable is a readable natural-language answer.
  - acceptance: R-3.1 — WHEN an `answer` event is received, render its markdown in the Answer region.
  - verify: an `answer` event renders formatted markdown.

- [x] 3.2 Running state + disable re-submission (deps: 2.3, est: ~15m)
  - why: the user needs to know a run is in progress and must not launch a second (ties to single-session).
  - acceptance: R-3.2 — WHILE a session is running, show a running state and disable re-submission until it ends.
  - verify: submit is disabled and a running indicator shows between start and `done`.

- [x] 3.3 Indicate "no answer produced" (deps: 3.1, est: ~10m)
  - why: a blank region after `done` is ambiguous; the absence of an answer must be explicit.
  - acceptance: R-3.3 — IF the session ends (`done`) with no answer, indicate "no answer produced" rather than a blank region.
  - verify: `done` with no prior `answer` shows the explicit message.

- [x] 3.4 Incremental (partial) answer rendering (deps: 3.1, est: ~15m)
  - why: token-level streaming keeps a long answer feeling live.
  - acceptance: R-3.4 — WHERE partial-message events are received, MAY render the answer incrementally as it streams.
  - verify: partial events append progressively to the Answer region.

## Unit 4: Knowledge-graph visualization

- [x] 4.1 Render node-link graph in Cytoscape.js (deps: 2b.3, 0.2, est: ~30m)
  - why: the user must see the specs behind the answer and their relationships.
  - acceptance: R-4.1 — WHEN a `graph` event contains a graph, render its `nodes` and `links` in Cytoscape.js without transforming the node-link shape.
  - verify: a node-link fixture renders nodes and edges in the canvas.

- [x] 4.2 Mark contributing-source nodes (deps: 4.1, 5.1, est: ~20m)
  - why: the client-side Gap-G1 join makes visible which graph nodes actually powered this answer.
  - acceptance: R-4.2 — WHERE a node's `id`/`path` also appears in `sources[]`, visually mark it as a contributing source.
  - verify: nodes matching source rows are highlighted; non-matching nodes are not.

- [x] 4.3 Node styling + honest edge labeling (deps: 4.1, est: ~20m)
  - why: size/color convey relevance and grouping; edges must not overclaim semantic similarity (Gap G5 honesty).
  - acceptance: R-4.3 — size nodes by `relevance` and color by `tag` when present; R-4.4 — label edges as lexical (token-overlap cosine) similarity, not semantic.
  - verify: nodes vary in size/color by field; edge label/tooltip reads "lexical similarity (cosine)".

- [x] 4.4 Empty-graph message (deps: 4.1, est: ~10m)
  - why: a blank canvas is indistinguishable from a broken render.
  - acceptance: R-4.5 — IF the graph has zero nodes, show an empty-graph message rather than a blank canvas.
  - verify: a zero-node graph shows the message.

## Unit 5: Sources + provenance panels

- [x] 5.1 List sources with ranking fields (deps: 2b.3, 0.2, est: ~20m)
  - why: explainability requires showing which files contributed and how they ranked.
  - acceptance: R-5.1 — WHEN a `sources` event is received, list each source with `title`/`name`, `repo`, `path`, `tags`, and `relevance`.
  - verify: a `sources` fixture renders each row with all fields.

- [x] 5.2 Render searched scope from `json context` (deps: 2b.3, est: ~15m)
  - why: the user must see which repos were actually reached, not assume all selected were.
  - acceptance: R-5.2 — WHEN scope/provenance is available from a parsed `json context` result, render `scope` as the set of repos actually searched.
  - verify: a provenance fixture renders its `scope` set.

- [x] 5.3 Show missing repos with reason + fix (deps: 5.2, est: ~15m)
  - why: a skipped repo must come with an actionable reason, not a silent gap.
  - acceptance: R-5.3 — WHERE `missing[]` is non-empty, show each missing repo with its `reason` and `fix`.
  - verify: a fixture with `missing[]` renders reason + fix per entry.

- [x] 5.4 Make selected-but-unreached repos visible (deps: 5.2, est: ~15m)
  - why: silent omission of a selected repo would mislead the user about coverage.
  - acceptance: R-5.4 — IF a selected repo does not appear in `scope`, make that omission visible (via `missing` or an explicit note), not silent.
  - verify: select a repo absent from `scope` → an explicit note or `missing` entry appears.

- [x] 5.5 Startup smoke test pins `json context` shape, degrade on failure (deps: 0.1, est: ~20m)
  - why: `json context` is not advertised in `json help`; relying on it unverified risks fabricating provenance.
  - acceptance: R-5.5 — validate at startup that `local-search json context --scope <repo>` returns `{scope, missing}`; IF it fails, provenance degrades to "unavailable" rather than fabricated scope.
  - verify: smoke test passes against the real binary; a stubbed failure flips provenance to "unavailable".

## Unit 6: Retrieval-path view

- [x] 6.1 Static retrieval-pipeline diagram (deps: 0.2, est: ~20m)
  - why: the user asked to see the path from vector DB → answer; the pipeline is a fixed architecture, honestly shown as documentary.
  - acceptance: R-6.1 — present the pipeline as a static ordered-stage diagram (query → FTS/BM25 → embed 256-d → cosine → RRF fusion → ranked sources → answer), labeled as the fixed architecture, not claimed reconstructed per-run.
  - verify: the diagram renders the labeled ordered stages.

- [x] 6.2 Illustrate fused ranking from per-hit relevance (deps: 6.1, 5.1, est: ~15m)
  - why: grounding the static diagram in this run's actual `relevance` values makes the ranking concrete.
  - acceptance: R-6.2 — WHERE per-hit `relevance` is available in `sources[]`, use it to illustrate the fused ranking in the retrieval-path view.
  - verify: the ranked-sources stage reflects the current run's `relevance` ordering.

## Unit 7: Live session activity feed

- [x] 7.1 Append tool/command activity timeline (deps: 2.3, 0.2, est: ~25m)
  - why: during a multi-minute run the user must see every `local-search` command Claude runs, not a spinner.
  - acceptance: R-7.1 — WHEN an `activity` event is received, append a timeline entry showing the tool/command, its arguments, and a short result summary, in arrival order.
  - verify: a sequence of `activity` events renders ordered entries with command + summary.

- [x] 7.2 Show assistant progress text (deps: 7.1, est: ~10m)
  - why: Claude's own progress narration adds context between tool calls.
  - acceptance: R-7.2 — WHEN an `assistant` event is received, show Claude's progress text in the activity feed.
  - verify: an `assistant` event appears as a feed entry.

- [x] 7.3 Keep feed visible and live (deps: 7.1, est: ~10m)
  - why: the feed is the primary "what's happening" surface during the run.
  - acceptance: R-7.3 — WHILE the session is running, keep the activity feed visible and continuously updated as events arrive.
  - verify: the feed stays mounted and updates across a running session.

- [x] 7.4 Reflect phase from `status` events (deps: 7.1, est: ~10m)
  - why: a coarse phase (started/searching/awaiting input/done) orients the user at a glance.
  - acceptance: R-7.4 — WHEN a `status` event indicates a phase change, reflect the current phase in the UI.
  - verify: phase indicator updates as `status` events arrive.

- [x] 7.5 Preserve full ordered activity log (deps: 7.1, est: ~10m)
  - why: after completion the user must scroll back through every step for auditability.
  - acceptance: R-7.5 — preserve the full ordered activity log so the user can scroll back through every step after completion.
  - verify: after `done`, the complete ordered log remains scrollable.

## Unit 8: Interactive clarification loop (`--resume`)

- [x] 8.1 Detect end-with-question from turn `result` (deps: 2.3, est: ~25m)
  - why: in headless `-p` a persistent child can't be reliably detected as awaiting input, so the question signal is read from the turn's `result`.
  - acceptance: R-8.1 — WHEN a turn's `result` carries a question and no answer, treat the turn as ended-with-question, emit a `question` event, and present a reply input.
  - verify: a fake turn that ends with a question yields a `question` event and a reply box.

- [x] 8.2 Reply spawns a `--resume` child (deps: 8.1, 2.1, est: ~30m)
  - why: conversational continuity across turns comes from resuming the captured Claude `session_id`, not from stdin.
  - acceptance: R-8.2 — WHEN the user submits a reply, `POST /api/session/:id/reply {text}` spawns a new `claude -p --resume <claudeSessionId> --output-format stream-json --verbose` child whose prompt is the reply.
  - verify: posting a reply spawns a child whose argv includes `--resume <claudeSessionId>` and the reply as prompt.

- [x] 8.3 Keep logical session alive while awaiting reply (deps: 8.1, est: ~15m)
  - why: an awaiting-reply session must not be reaped as an idle failure.
  - acceptance: R-8.3 — WHILE awaiting a user reply, keep the logical session record (incl. the Claude `session_id`) alive and do not time it out as idle.
  - verify: a session paused on a question survives past the idle window and still resumes.

- [x] 8.4 Resumed turn continues on the same SSE stream (deps: 8.2, 2.3, est: ~20m)
  - why: the user experiences one continuous session, not a new stream per turn.
  - acceptance: R-8.4 — WHEN a reply resumes the session, continue emitting activity/answer events for the resumed turn on the existing SSE stream without the frontend opening a new stream.
  - verify: after a reply, new events arrive on the original SSE connection.

- [x] 8.5 Record question + reply in the feed (deps: 8.1, 7.1, est: ~10m)
  - why: the clarification dialogue is part of the auditable activity log.
  - acceptance: R-8.5 — record each question and the user's reply in the activity feed.
  - verify: question and reply both appear as ordered feed entries.

## Unit 9: Long-wait handling

- [x] 9.1 Heartbeat frames (~15s) (deps: 2.3, est: ~15m)
  - why: idle SSE connections and proxies drop without periodic traffic during a multi-minute run.
  - acceptance: R-9.1 — WHILE a session is running, emit `heartbeat` events (~every 15s) so the SSE connection and proxies stay alive.
  - verify: with no tool activity, `heartbeat` frames arrive ~15s apart.

- [x] 9.2 Elapsed time + current activity (deps: 7.1, est: ~10m)
  - why: the UI must never look frozen during long waits.
  - acceptance: R-9.2 — WHILE running, display elapsed time and the current activity so the UI never appears frozen.
  - verify: elapsed timer advances and current activity is shown during a run.

- [x] 9.3 Cancel kills the child (deps: 2.1, est: ~15m)
  - why: the user must be able to abort a long or wrong run.
  - acceptance: R-9.3 — WHEN the user cancels, `POST /api/session/:id/cancel`, kill the Claude child, and emit `done{cancelled:true}`.
  - verify: cancel terminates the child and emits `done{cancelled:true}`.

- [x] 9.4 Generous tunable safety timeout → explicit error (deps: 2.1, est: ~15m)
  - why: an unbounded run must eventually fail loudly, but a short hard timeout would kill legitimate multi-minute runs; the value is an unvalidated tunable.
  - acceptance: R-9.4 — apply only a generous safety timeout (default 5 min, configurable) and, on hitting it, emit an explicit `error` rather than a silent drop.
  - verify: with a short test-configured timeout, an over-running child produces an `error` event.

- [x] 9.5 Process-group reaping on disconnect/cancel (deps: 2.1, 9.3, est: ~20m)
  - why: killing only the `claude` child would orphan the `local-search` grandchildren it spawned.
  - acceptance: R-9.5 — IF the SSE client disconnects or the session is cancelled, kill the child's whole process group (child + `local-search` grandchildren) so nothing is orphaned.
  - verify: after disconnect/cancel, no `claude` or `local-search` processes from the session remain.
