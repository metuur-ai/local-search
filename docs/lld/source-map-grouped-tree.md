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

### Builder contract

`buildSourceTree(sources)` returns:

```js
{
  total,     // number of rows grouped; equals the sum of top-level branch counts (R-2.5)
  repoName,  // single repo's name when the repo level was elided, else null (R-2.3)
  branches,  // repo branches (each with `projects`), or project branches (each with
             // `sources`) when elided — `repoName` tells the caller which
  flat,      // true when fewer than 2 top-level branches carry rows; the pane then
             // renders `branches[0].sources` as a plain list (R-2.11, D9). False for
             // zero sources — that is the empty state R-1.5 owns, not a flat tree
}
```

Every branch carries `{ key, name, count }`. `key` is `repo`+`project` joined by NUL and never
encodes position, so streaming re-order cannot move one branch's expansion state onto another
(R-2.6a) — and a project's key is identical whether or not the repo level was elided, so a run that
gains a second repo mid-stream does not renumber branches under the user.

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

Its open state, however, does **not** stay browser-owned. Expansion is held in component state as a
set of collapsed branch keys (R-4.2a), and branches are keyed by `repo + project` identity, never by
index (R-2.6a).

**Correcting this decision's original reasoning** — 2026-07-27, measured while implementing Unit 4.
This decision first argued that because R-2.6 re-orders branches by descending count as rows stream
in, DOM-owned disclosure state could not be relied on to follow a branch through a re-order. That
premise is **wrong**, and it was tested rather than argued: with browser-owned `open`, a pure
re-order preserves the collapse correctly, because branches are keyed and Preact moves the same
`<details>` element — carrying its DOM state — to the branch's new position.

The conclusion survives on two different grounds, both verified by reverting to browser-owned `open`
and watching the relevant tests fail:

1. **Re-shaping, not re-ordering.** When a second repo arrives mid-run, the repo level stops being
   elided (D4) and every project branch is re-parented. Its element is torn down and rebuilt, so
   DOM-owned `open` is lost. Component state survives because the project key is identical either way.
2. **The visibility gate unmounts.** R-1.3 returns early while the pane is inactive, so switching to
   another inspector tab and back destroys the subtree along with any DOM-owned state.

Both are ordinary events in a normal run, so expansion still belongs in component state — but for
these reasons, not the re-ordering one.

A set of **collapsed** keys rather than expanded ones, because R-4.5/D6 default every branch open: a
branch appearing mid-stream is absent from the set and opens with no one having to add it.

**How `open` is controlled** — added 2026-07-27 while implementing Unit 4. `<details>` normally writes
its own `open`, which would make the browser a second writer alongside component state. Preact diffs
props against the previous **vnode**, not against the DOM, so once the two disagree Preact skips
re-asserting a value it believes unchanged and the disagreement sticks. The summary's default action is
therefore cancelled — `onClick` calls `preventDefault()` — leaving state the sole writer. Cancelling
covers the keyboard too: activating a focused `<summary>` with Enter or Space dispatches the same click
event, so the element stays keyboard-operable and R-5.2's assistive-technology roles are untouched.

The one path left where the DOM can change `open` without a cancellable click is a browser
auto-expanding a `<details>` to reveal a find-in-page match. Accepted: it leaves a branch visibly open
that state records as collapsed until the user next toggles it, which is the behaviour the user asked
for by searching inside it. No data is wrong, so it is not reconciled.

Two consequences for the stylesheet. Setting `display: flex` on `<summary>` removes its default
`list-item` display and with it the browser's disclosure triangle — invisible while every branch was
permanently open, but the only affordance for collapsing once collapsing works, so the caret is drawn
by hand in `SourceMap.css`.

This is roughly fifteen lines more than the naive version and removes an entire class of
"my tree collapsed itself while I was reading it" bug.

### D6 — Default every branch expanded

At a median of 7 groups and ~28 leaves the whole tree fits comfortably. Starting collapsed would hide
the very skew the pane exists to show. Users can collapse what they do not need.

### D7 — Counts only; no proportional bars

A count answers "is the mix defensible". A bar would add a second encoding of the same number. Left
out deliberately; the `tag-rank-bar` pattern (`app.css:1038-1043`) remains available if counts alone
prove insufficient in use.

### D8 — Branch counts cover all retrieved sources, not the filtered subset

Decided 2026-07-27, closing pre-mortem risk 3.

With a tag or file-type filter active the left console renders `filteredSources` (`app.jsx:542-543`)
while `SourcesPanel` and `topTags` read unfiltered `sources`. The tree joins the latter group: it is
built from the full `sources` array, and its header names that set explicitly ("all N retrieved") so
a tree reading 28 beside a list reading 6 is legible rather than alarming.

Two reasons. The pane answers "is the retrieval mix defensible" — a question about what the search
retrieved, not about what the user is currently narrowing to. And it sits beside two panes that
already count unfiltered; a third convention in the same inspector would be the confusing choice.

The cost accepted: the tree does not agree with the left console under an active filter. Mitigated by
the header stating its scope rather than leaving the user to infer it.

### D9 — Below 2 groups, drop the branch chrome and say why

Decided 2026-07-27, closing pre-mortem risk 4.

The grouping axis was chosen against corpora whose registered roots point at a `docs/` directory, so
the first path segment is the doc type. A repo registered at its root instead yields `src`/`docs`/
`tests` — sometimes one usable group — and a one-branch tree is exactly the "flat list with boxes
drawn around it" the HLD's success criterion 2 warns about.

So below 2 derived groups the pane renders a plain ranked list with no disclosure elements, and a
header line saying there was nothing to group by. It degrades into something honest rather than
performing structure it does not have.

Rejected: falling back to `kindFromPath` as a second axis. It would recover structure in root-
registered repos, but it contradicts R-2.2, and maintaining two grouping axes for a pane whose kill
signal is "did this change a decision" is more machinery than the question warrants.

### D10 — Source selection moved from a positional index to an identity key

Decided 2026-07-27, while implementing Unit 3. Selection was `activeSourceIdx`, a position resolved
as `filteredSources[activeSourceIdx]`. D8 builds the Source Map from **unfiltered** `sources`, so a
leaf's position is not its position in `filteredSources` — with a filter active a leaf would have
opened a different document, or none at all. The same representation carried a pre-existing latent
bug on the result cards: changing the filter after selecting silently re-pointed the detail block at
whatever row landed on that index next. Selection is therefore held as `activeSourceKey`, a
`sourceKey` (now in `src/sourceIdentity.js`, re-exported from `app.jsx`), and `activeSource` is looked
up in `sources` by that key —
the same identity `mergeSources` dedupes on, which is what R-3.6 asks for. Result-card behaviour is
unchanged by construction: both surfaces call one `selectSource(row)` handler, so a leaf and its list
row can no longer address different documents.

`sourceKey` and `normalizeTags` moved out of `app.jsx` into `src/sourceIdentity.js` as part of this.
Components need both, and importing them from `app.jsx` made a component depend on the app shell that
renders it — a cycle that resolved only because both were hoisted function declarations, and that
pulled `app.jsx`'s whole dependency graph into every component test. `app.jsx` re-exports them so
existing importers are unaffected.

### D11 — A run boundary is detected from row-object identity, not from an empty step

Decided 2026-07-27, while implementing Unit 4 (story 4.3).

Holding expansion in component state (D5) creates a state that has to be discarded at a run boundary,
and the obvious trigger — "reset when `sources` goes empty" — does not fire on the path that needs it
most. A new run does pass through empty (`setSources([])`, `app.jsx:304`), but `restoreRun` replaces
`sources` outright, non-empty straight to non-empty (`setSources(mergeSources([], run.sources))`,
`app.jsx:629`). Restoring run A after run B therefore never sees an empty step, and A and B share
branch keys whenever they share repos and project folders — which is the normal case — so A would
render collapsed because of something the user did in B, in violation of R-4.4 and R-4.5.

Pruning the collapsed set to keys present in the current tree has the same hole: shared keys survive
the prune.

The signal used instead is **row-object identity**. Within a run `sources` only grows and reuses its
existing row objects — `mergeSources` slices the previous array and pushes only unseen rows
(`app.jsx:60-70`, constraint 4). Every wholesale replacement mints new objects via `{ ...r, tags }`
(`app.jsx:67`). So the component stores, alongside the collapsed keys, the `sources` array as it stood
when the user last collapsed something; if the current array still starts with those same objects **by
reference**, the collapse still belongs to this tree, otherwise it is ignored and every branch renders
open.

Identity rather than `sourceKey`: re-running the same query returns the same documents under the same
branch keys, so nothing about the tree's shape says "new run" — but the row objects are always new.

All four run transitions are covered — live→live, live→restore, restore→restore, restore→live — as is
a boundary crossed while the user is on another inspector tab, because the check reads the `sources`
prop rather than an event. What it does **not** cover is a future writer of `sources` that replaces the
array while reusing the previous row objects; there is no such writer today (the three are enumerated
above), and one would read as a continuation of the same run.

Chosen over passing a run-sequence counter down from `app.jsx`. That would be more explicit, but it
contradicts this document's own "No new event, endpoint, or state variable is introduced" and adds
app-shell state to solve a problem the component can see for itself.

Not persisted across runs or reloads — see Out of Scope.

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
