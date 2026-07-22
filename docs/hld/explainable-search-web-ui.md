# Explainable-Search Web UI — High-Level Design

## Overview

A lightweight web UI that lets a user run a search across selected indexed repos, gets a
natural-language answer produced by the Claude CLI (running the `local-search` skill agentically),
and shows an **explainable** view of how that answer was reached: the contributing files/sources,
their ranking, the provenance (which repos were reached vs. skipped), and a knowledge-graph
visualization of the specs and their similarity relationships.

The web layer is pure glue. All retrieval data (ranked sources, provenance, node-link graph) is
already emitted as JSON by the existing `local-search` CLI; the only genuinely new pieces are a thin
HTTP backend and a Preact frontend. Per the input research
(`.devlocal/research/2026-07-18-explainable-search-web-ui.md`), no changes to the Go `code/` are
required for the POC.

Because the answer is produced **agentically** and a run can take **minutes** (Claude issues several
tool calls: search, read, graph), the interaction is not one-shot request/response. It is a
**streaming, interactive session**: the UI shows a **live feed of everything Claude is doing** (each
`local-search` command it runs and the result), lets **Claude ask the user clarifying questions
mid-session** and the user answer them, and keeps long waits legible (elapsed time, current activity,
cancel). The session activity feed is not just cosmetic — the streamed tool results are the source of
truth for the sources list and the graph, tying what the UI shows to what Claude actually ran.

## Stakeholders & Impact

- **Primary user — a developer/analyst exploring indexed docs.** Today they must run `local-search`
  commands in a terminal and mentally stitch together the answer, the sources, and the graph JSON.
  After this ships they get one screen: type a query, pick repos, see the answer + an interactive
  graph + a "why this answer" panel.
- **Secondary consumer — the Claude CLI + `local-search` skill.** The backend drives `claude -p`
  with the skill available; Claude runs the search→read→reason pipeline and returns a structured
  result. This is the first executable integration of the skill (previously passive prose).
- **Not affected:** the `local-search` Go binary and its on-disk state (`~/.local-search/`). The web
  layer only reads through the CLI.

## Goals

- A user can select **one or more** indexed repos (mandatory) from a picker populated by the CLI,
  enter a query, and receive:
  1. a natural-language **answer** rendered as markdown, and
  2. an interactive **knowledge-graph** visualization of the contributing specs and their
     similarity edges, and
  3. a **sources** list (which files contributed, with ranking), and
  4. an honest **provenance** panel (which selected repos were searched vs. skipped, with fixes).
- The answer is produced **agentically**: `claude -p` runs with the `local-search` skill available,
  Claude itself runs the searches scoped to the selected repos, and returns the answer together with
  the graph metadata.
- Graph nodes are joined to their `tags`/`relevance` so the UI can color/size and mark which nodes
  are contributing sources for this answer.
- **Live session activity:** the UI streams and displays every step of the agentic run in real time —
  each tool call (which `local-search` command + arguments), a summary of its result, and Claude's
  progress — so the user can see *what is happening* during a multi-minute run.
- **Interactive clarification:** WHEN Claude needs more information it can ask the user a question; the
  UI surfaces the question, accepts a reply, and continues the *same* session without losing context.
- **Long-wait legibility:** a run may take minutes; the UI keeps the connection alive, shows elapsed
  time and the current activity, and offers a cancel — it never looks frozen and never silently times
  out.

## Non-Goals

- **No changes to the Go `cli/`.** The `tags`/`relevance` join on graph nodes (research Gap G1) is
  performed in the assembly layer (by Claude / the backend), not by adding fields to the Go structs.
- **No learned-embedding upgrade.** Similarity edges remain the existing model-free FNV
  feature-hashing cosine (research Gap G5); the UI labels them honestly as lexical similarity, it
  does not try to improve them.
- **No auth, multi-user, or persistence.** Single local user; sessions live in memory for their
  duration and are not stored after they end.
- **Not a general chat product.** The interactive loop exists only to let Claude gather what it needs
  to answer *this* search; it is not open-ended conversation, history browsing, or multi-session
  management.
- **No write path.** The UI never mutates the index or source files; `scan`/`rebuild` stay in the CLI.
- **No deterministic/pre-run backend.** The agentic path was chosen deliberately (research Gap G3);
  a constrained pre-run backend is explicitly out of scope for this iteration.

## Success Criteria

- From a cold load, the picker lists every repo returned by `local-search json repos` with its
  spec-count badge and a "has graph" indicator.
- Submitting a query with ≥1 repo selected renders a non-empty answer, a Cytoscape graph with nodes
  and edges, and a sources panel — derived from the streamed session events.
- During the run, the activity feed updates live with each `local-search` command Claude executes and
  a summary of its result, in order.
- If Claude asks a clarifying question, the UI shows it, accepts the user's reply, and the run
  continues in the same session.
- A multi-minute run keeps the connection alive (heartbeats), shows elapsed time and current activity,
  and can be cancelled; it never appears frozen and never silently drops.
- Selecting a repo that cannot be reached surfaces it in the provenance panel with a reason and fix
  (not a silent omission).
- Attempting to submit with zero repos selected is prevented by the UI.
- When the Claude CLI or `local-search` binary is missing, or the stream ends without a usable answer,
  the UI shows an explicit error — it never fabricates an answer or an empty-but-successful result.
