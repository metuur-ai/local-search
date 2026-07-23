# The CLI and the web console are the same tool wearing two outfits

It's tempting to think of the web console as a separate product — it has its own port, its own frontend, its own "AI Answer" mode that feels almost chat-like. But there's no second brain in there. Strip away the browser tab and what's left is: the same `local-search` binary you already have on your `PATH`, being called by a small Node process that mostly just knows how to spawn it and forward what comes back. The web layer is deliberately, almost stubbornly, thin.

## The glue layer, and why it stays thin

`web/server.js` is a single Node HTTP server (no framework, just `node:http`) exposing a handful of routes: `/api/health`, `/api/repos`, `/api/query`, and a family of `/api/session/:id/{stream,reply,cancel}` endpoints. When the frontend asks for the repo list, the server doesn't query a database of its own — it shells out to `local-search json repos` and parses the JSON that comes back. There is no retrieval logic duplicated in JavaScript; every ranking decision, every FTS5 query, every graph traversal happens exactly once, in the Go binary, exactly like it would from your terminal.

That's a deliberate non-goal, not an oversight: the HLD for this feature explicitly rules out any changes to the Go CLI to support the web UI. The join between a graph node and its search relevance, for instance, happens in the assembly layer above the CLI (in Claude's reasoning, or in the backend's event parsing) rather than by teaching the Go structs a new field. If the web UI disappeared tomorrow, the CLI would lose nothing — it doesn't know the web UI exists.

## Two modes, two very different amounts of machinery

The search box offers a choice, and the choice matters more than its two buttons might suggest:

- **"AI Answer"** spawns the actual `claude` CLI as a child process (`claude -p --output-format stream-json`, with a narrow tool grant limited to `Bash(local-search:*)` — Claude can run `local-search` commands and nothing else). Claude then runs its own search → read → reason loop, deciding what to query, reading the specs it finds relevant, and composing a natural-language answer — the same skill-driven workflow described in the project README, just triggered from a browser instead of a terminal. This can take real minutes, because it's model time: several tool calls, each waiting on an LLM turn.

- **"Graph only · fast"** skips the model entirely. It runs `local-search json search <query> <repo>` directly for each selected repo — the plain CLI path, no agent in the loop — and returns in roughly the time a terminal search would take. The tradeoff is explicit in the interface copy itself: "Direct graph-DB lookup — no model call, returns in ~a second" versus "Full AI synthesis over retrieved sources (slower — spawns the model)." Same sources panel, same provenance panel, same activity feed either way — just no synthesized prose at the end, because nothing generated any.

Both modes emit the identical shape of event (`sources`, `provenance`, `activity`, `done`) to the frontend, which is what lets the Inspector's Sources & Provenance view, Neighborhood Map, and Top Tags panels work the same regardless of which button you pressed. The events don't know or care whether a human is reading them from a terminal-like activity feed or a model orchestrated them — they're just what the CLI said, timestamped.

## Why sessions live in memory, over SSE

A multi-minute agentic run can't be a single request/response — the browser tab would just spin with nothing to show. So each query becomes a **session**: a small in-memory object (an id, the spawned child process, a set of connected SSE clients, a phase) held in the Node process's own memory, nothing persisted to disk. The frontend opens a Server-Sent Events connection to `/api/session/:id/stream`, and every line the `claude` (or `local-search`) child writes to its stdout gets normalized and broadcast down that stream in real time — which is how the activity feed can show "Claude just ran `local-search search refund`" seconds after it happened, rather than only once the whole run finishes.

This buys a few things that matter for a long-running, occasionally-interactive process:

- **Mid-run clarification.** If Claude asks a follow-up question, the session pauses in an `awaiting-reply` phase rather than closing; your reply resumes the same underlying `claude --resume <session-id>` conversation, on the same SSE stream, so context isn't lost.
- **Cancellation that actually stops work.** Because the child was spawned detached, cancelling a session kills its whole process group — not just the immediate child, but any `local-search` subprocess it spawned mid-search.
- **Never look frozen.** A single active session at a time is enforced deliberately (a second query returns 409 with the blocking session's id) so the UI never has two agentic runs racing each other, and heartbeats over the SSE connection keep a multi-minute wait from looking like it silently died.

None of this is backed by a database, on purpose: sessions live only as long as the Node process does, and disappear on restart. There is nothing to migrate, back up, or worry about outliving its usefulness — it's a scratchpad for one run, not a session history product.

## Why localhost, and why no auth

The web console binds to a local port (8787 by default) with no login screen, no API key, no user accounts — and that omission is a design choice, not a gap waiting to be filled in later. It's built for exactly one user, running on their own machine, pointed at their own already-local spec index. Adding authentication to a single-player tool that never leaves your laptop would add real complexity (sessions, secrets, a place to store credentials) in exchange for defending against a threat model that doesn't apply: nobody else is on the other end of `localhost:8787` unless you specifically set up something to expose it.

That constraint is also what keeps the entire promise of `local-search` — offline, private, no data leaving your machine — intact even with a web UI in the picture. The only network-adjacent thing that happens is spawning `claude` as a local child process; your specs, your queries, and the resulting index never touch a server you don't control. The web console isn't a hosted product wearing a local face — it's a local tool that happens to render its output as HTML instead of a terminal table.

## See also

- [how-search-works.md](how-search-works.md) for what's actually happening inside the `local-search` calls the web UI shells out to
- [../reference/troubleshooting.md](../reference/troubleshooting.md) for the current `local-search ui` subcommand quirk — use the `local-search-ui` launcher or the npm scripts in `web/` instead
- [../how-to/](../how-to/) for getting the web console running end to end
