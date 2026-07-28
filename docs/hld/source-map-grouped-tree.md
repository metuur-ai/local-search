# Source Map — Grouped Source Tree — High-Level Design

## Overview

An AI Results run retrieves ~28 source documents and presents them as a flat, relevance-ordered
list. That list answers "what was retrieved" but not "what was the *shape* of what was retrieved".
A user cannot see from it that 10 of 28 sources came from `audits/` and only 3 from `ears/` — a
skew that materially changes whether the answer should be trusted, because it means the model
reasoned from review chatter rather than from requirements.

This change adds a fifth results pane, **Source Map**, that groups the retrieved sources into a
collapsible tree by `repo` → `project` (the first path segment), with a count on every branch. It is
derived entirely client-side from source rows already held in component state. No backend change, no
new dependency, no change to any existing pane.

## Stakeholders & Impact

**Primary user — the person evaluating an AI answer.** Today they read a synthesized answer and a
flat list of 28 sources. To judge whether the answer rests on the right kind of evidence they must
scan every row and tally paths by eye. After this ships, the distribution is the first thing they
see, and any skew or absence is legible at a glance.

**Secondary consumer — none.** The pane consumes only streamed state that already exists in the
browser. No API, CLI, index, or schema is touched, so nothing downstream can observe this change.

**Current pain, concretely.** Measured across 8 representative queries (top 28 hits each), a typical
run spans 4–10 distinct `project` groups. All of that structure is currently flattened into an
undifferentiated list.

## Goals

- A user can see, without scrolling or counting, how the retrieved sources distribute across repos
  and projects, with an exact count on every branch.
- Branch counts are verifiably consistent with the total shown in Sources & Provenance.
- The tree updates live as `sources` events stream in, without discarding the user's expand/collapse
  state.
- The pane states plainly that its branches are **file-location grouping**, not relationship or
  similarity — preserving the honesty constraint that governs every other graph-ish surface in this
  product.
- The pane costs zero new runtime dependencies.

## Non-Goals

- **No mind-map of the AI answer.** Its structure depends on how the model happened to format prose
  that run; a pane that is rich on one run and a single node on the next is not worth building.
- **No document-internal outline.** The index captures the first H1 only; there is no heading
  hierarchy to render, and reconstructing one would require an N-call `local-search json read`
  fan-out per result set.
- **No change to the Neighborhood Map, with one exception: its header copy.** It keeps its tab, its
  Cytoscape renderer, and its behavior. One line may be added to its header so users can tell which
  of the two "…Map" tabs answers which question — decided 2026-07-27, resolving pre-mortem risk 2 at
  its source rather than relying on the Source Map's own header alone. Behavior stays untouched, so
  the change remains additive.
- **No change to the standalone Graph Explorer** (`/graph-explorer.html`).
- **No backend, CLI, index, or schema change.** No new or modified SSE event.
- **No new visualization library** — not markmap, not d3, not a new mermaid diagram type.
- **No export** of the tree (PNG/SVG/JSON), no pan/zoom/fit controls, no full-screen mode.
- **No tag-based filtering from the tree.** Clicking a tag stays a Top Tags behavior.

## Success Criteria

1. On a run whose sources span more than one repo, the Source Map pane shows one branch per repo and
   one sub-branch per project, each carrying a count, and the counts sum to the total source count.
2. On the measured corpus, a typical run renders at least 3 distinct groups — the threshold below
   which the tree would be a flat list with boxes drawn around it. Below 2 groups the pane drops the
   branch chrome and renders a plain list, saying why (D9).
3. Switching to another tab during a run causes the Source Map to perform no layout or render work.
4. A run that returns zero sources shows an explicit empty state, never a blank pane.
5. The Neighborhood Map, Sources & Provenance, AI Answer, and Top Tags panes behave exactly as they
   did before the change.
6. `web/frontend/package.json` gains no dependency.
