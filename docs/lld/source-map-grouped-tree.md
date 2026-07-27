# Source Map — Grouped Source Tree — Low-Level Design

## Architecture

### Data flow

```
sources (SSE event, array of SearchResult rows)
  → mergeSources()            app.jsx:76-86   — accumulates, dedupes by sourceKey
  → sources state             app.jsx
  → buildSourceTree(sources)  NEW pure helper — grouping + ordering + counts
  → <SourceMap>               NEW presentational component
```

No new event, endpoint, or state variable is introduced. `buildSourceTree` is a pure function of the
existing `sources` array, memoized with `useMemo`, and the component renders its output.

### Tree shape

Three levels, plus leaf detail:

```
repo            ← row.repo               (elided when only one distinct repo present)
└── project     ← row.project            (first path segment; "_root" at repo root)
    └── document ← row.title || row.name  (leaf)
        └── tags ← normalizeTags(row.tags)
```

### Grouping axis — why `project`, not `kindFromPath`

`kindFromPath` (`web/frontend/src/components/graphElements.js:46-56`) classifies by matching a
`docs/<type>/` segment in `row.path`. But `path` is relative to the **scan root**, and registered
roots already point at the docs directory — e.g. `foyer-platform` is registered at
`/Users/.../foyer-platform/docs`. Paths therefore arrive as `hld/mobile-app-features.md`,
`lld/billing.md`, `audits/final-audit/01-architecture.md`. There is no `docs/` segment to match, so
every row falls through to `doc`.

Measured over 8 representative queries (top 28 hits each):

| Axis | Distinct groups per run | Median |
|---|---|---|
| `repo` | 1–4 | 2 |
| `kindFromPath(path)` | 1–3 | **1** |
| `project` | 4–10 | **7** |

`kindFromPath` produced a single `doc` bucket on 5 of 8 queries. `project` is the discriminating
axis, and its values in these corpora *are* the doc types (`hld`, `lld`, `ears`, `tasks`, `audits`,
`adr`, `reviews`, `pre-mortem`) precisely because the scan root is the docs directory.

### Components and files

| File | Change |
|---|---|
| `web/frontend/src/components/sourceTree.js` | **New.** Pure `buildSourceTree(sources)`. No JSX, no imports from Preact — testable in jsdom, matching the `graphElements.js` precedent. |
| `web/frontend/src/components/SourceMap.jsx` | **New.** Presentational tree using native `<details>`/`<ul>`. |
| `web/frontend/src/components/SourceMap.css` | **New.** Pane styles. |
| `web/frontend/src/app.jsx` | Add the fifth tab button, the fifth pane, and the `sourceTree` memo. |
| `web/frontend/src/app.css` | Extend `.inspector-tablist` to accommodate a fifth tab. |
| `web/frontend/test/sourceTree.test.js` | **New.** Unit tests for the pure builder. |

### Rendering approach

Native `<details>` / `<summary>` elements, not a JS tree widget. This gives expand/collapse,
keyboard operation, and screen-reader semantics with no library. The `open` attribute is driven from
component state rather than left browser-owned — see D5 for why R-2.6's count ordering forces that.

`Top Tags` (`app.jsx:1249-1270`) is the in-repo precedent: a real analytical view delivered by plain
markup and CSS.

### Interaction

Leaf interaction mirrors the existing result-card behavior at `app.jsx:998-1004`: clicking a leaf
sets `activeSourceIdx` and switches `inspectorTab` to `'sources'`, landing the user on the detail
block for that document. Each leaf also carries a `<RevealButton>` (`components/RevealButton.jsx`),
consistent with `SourcesPanel`, `RankedSources`, and the result cards.

## Constraints

1. **`relevance` is raw negative BM25** (`cli/db/query.go:38-43`) — lower is better. Leaves sort
   **ascending**. It must never be fed to a 0..1 scale or sorted descending.
2. **`tags` may arrive as a string.** The AI path emits `Tags string` (`cli/db/query.go:24`); the
   graph-DB path emits `""` or `"[a, b, c]"`. Always read tags through `normalizeTags`
   (`app.jsx:57-71`), which `mergeSources` already applies.
3. **`fullpath` is empty on `json related` rows.** The related SQL selects
   `s.project || '/' || s.name` into `Path` and never selects `fullpath`
   (`cli/db/query.go:501-510`). Reveal and identity must fall back to `path`, and identity uses
   `sourceKey` (`app.jsx:53-55`).
4. **`sources` accumulates, it does not replace** (`mergeSources`, `app.jsx:76-86`). The tree is a
   derived memo that must tolerate rows arriving in batches.
5. **All panes stay mounted**; visibility is the `hidden` attribute (`app.jsx:1212-1216`). The pane
   must be gated on an `active` prop, following `GraphView`'s precedent (`app.jsx:1227`, rationale
   at `GraphView.jsx:170-174`), or it will re-render on every `sources` event while the user is
   elsewhere.
6. **`project` may be `_root`** for files at the repo root (`cli/extract/extract.go:443-450`).
7. **Honesty doctrine.** R-4.4 of `docs/ears/explainable-search-web-ui.md` forbids overclaiming
   semantic similarity. Tree edges are containment derived from `repo`/`path` — factual — and the
   pane must say so rather than let the user infer relationship.

## Key Decisions

### D1 — Group by `project`, not `kindFromPath`

Decided on measurement, not preference. `kindFromPath` yields a median of 1 group; `project` yields
7. See "Grouping axis" above. `kindFromPath` remains untouched and continues to serve the
Neighborhood Map legend.

### D2 — A fifth tab, not a replacement of the Neighborhood Map

**Product decision by the user, made against the Product Owner's recommendation.** The PO argued for
replacing the Neighborhood Map on three grounds: its edge weight (`0.9 - idx*0.08`,
`toolParse.js:141-144`) has no referent; it is the only pane requiring the Cytoscape dependency; and
adding a pane repeats the "two UIs, and the user must know which one answers their question" pattern
rejected on 2026-07-24 (`.devlocal/research/2026-07-24-okf-spec-for-local-search-graph-viz.md:596-599`).

The tradeoff accepted: five result panes and a second structural view of the same source set. The
mitigation is naming and labeling — "Source Map" describes grouping, "Neighborhood Map" describes the
relevance star, and each pane's header states what its connections mean.

### D3 — No new dependency

markmap (`markmap-lib` + `markmap-view` + `d3`, since the resolved `d3@7.9.0` is only a mermaid
transitive) buys fold, pan, and zoom for a tree that fits on one screen at ~28 leaves and ~7 groups.
Native `<details>` already provides fold. If real use shows runs large enough that a nested list stops
being scannable, markmap becomes a justified rendering upgrade against evidence.

### D4 — Elide the repo level when there is exactly one repo

Measurement shows runs with a single repo (`care rules` → all 28 from `foyer-platform`). Rendering a
lone root branch wrapping everything adds a click and no information. When one distinct repo is
present, projects become the top level and the repo is named in the pane header instead.

### D5 — Native `<details>` elements, with `open` controlled from component state

`<details>`/`<summary>` brings keyboard operation and correct assistive-technology roles for free, so
it stays.

Its open state, however, does **not** stay browser-owned. R-2.6 orders branches by descending count,
and counts change as `sources` events stream in — so branches re-order mid-run. DOM-owned disclosure
state cannot be relied on to follow a branch through a re-order. Expansion is therefore held in
component state as a set of collapsed branch keys (R-4.2a), and branches are keyed by
`repo + project` identity, never by index (R-2.6a).

This is roughly five lines more than the naive version and removes an entire class of
"my tree collapsed itself while I was reading it" bug.

### D6 — Default every branch expanded

At a median of 7 groups and ~28 leaves the whole tree fits comfortably. Starting collapsed would hide
the very skew the pane exists to show. Users can collapse what they do not need.

### D7 — Counts only; no proportional bars

A count answers "is the mix defensible". A bar would add a second encoding of the same number. Left
out deliberately; the `tag-rank-bar` pattern (`app.css:1038-1043`) remains available if counts alone
prove insufficient in use.

## Out of Scope

- Mind-mapping the AI answer markdown
- Document-internal outlines / heading trees; any `json read` fan-out
- markmap, d3, mermaid `mindmap`, or any new visualization library
- Any modification to `GraphView.jsx`, `graphElements.js`, `synthesizeGraph`, `graphFromSources`, or
  the `cytoscape` dependency
- Any modification to the standalone Graph Explorer
- Backend, CLI, index, or schema changes; new or altered SSE events
- Export of the tree in any format; pan/zoom/fit; full-screen mode
- Tag filtering initiated from the tree
- Sorting controls or a user-selectable grouping axis
- Persisting expansion state across runs or reloads
