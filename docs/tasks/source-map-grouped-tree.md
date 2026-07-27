# Source Map — Grouped Source Tree — Tasks

Source of truth: `docs/ears/source-map-grouped-tree.md`. Architecture: `docs/lld/source-map-grouped-tree.md`.

All code lands in `web/frontend/src/` (two new components, one new pure helper, one new stylesheet,
plus edits to `app.jsx` / `app.css`). No backend, CLI, index, or schema change. No new dependency.
The Neighborhood Map and the standalone Graph Explorer are not touched.

Build order is the dependency order, not the unit order: the pure builder (2.1–2.4) lands and is
tested before any pane exists.

Verification commands used throughout:
- unit tests — `cd web && npm --workspace frontend run test`
- build — `cd web && npm --workspace frontend run build`
- manual — `cd web && npm run dev`, then run a query and open the pane

## Unit 0: Decisions carried from the pre-mortem

These three were flagged as risks and accepted at the spec gate, but each still needs a call before
the code it governs can be written. Each is a five-minute decision, not a work item.

- [x] 0.1 Decide whether branch counts ignore or reflect the active filter (est: ~10m)
  - why: The pane's whole value is counts the user trusts. With a tag or file-type filter active,
    the left console shows `filteredSources` (`app.jsx:542-543`) while `SourcesPanel` and `topTags`
    use unfiltered `sources`. A tree saying 28 beside a list showing 6 destroys the pane's only
    asset. Pre-mortem risk 3.
  - acceptance: A decision is recorded in the LLD Key Decisions section — either the tree counts all
    retrieved sources (consistent with `SourcesPanel` and `topTags`) and says so in its header, or it
    reflects the active filter and says so. Not left implicit.
  - verify: `docs/lld/source-map-grouped-tree.md` contains the decision and its rationale; the chosen
    behaviour is expressible as a check in 2.5.
  - **DECIDED 2026-07-27:** counts cover all retrieved sources, consistent with `SourcesPanel` and
    `topTags`; the header names that scope. Recorded as LLD D8 and EARS R-2.12.

- [x] 0.2 Decide the degenerate-tree fallback (est: ~10m)
  - why: The grouping axis was chosen on one machine, where every registered repo points at a
    `docs/` directory so the first path segment is the doc type. A repo registered at its root yields
    `src`/`docs`/`tests` — possibly two groups — and the tree becomes a flat list with boxes drawn
    around it. Pre-mortem risk 4.
  - acceptance: A recorded decision on what the pane does when fewer than 2 groups are derived —
    state it plainly, fall back to a flat list, or fall back to `kindFromPath`. Written into the LLD
    and expressed as a new EARS requirement under Unit 2.
  - verify: The new requirement exists in `docs/ears/source-map-grouped-tree.md` and is covered by a
    test in 2.6.
  - **DECIDED 2026-07-27:** below 2 derived groups the pane drops the branch chrome, renders a plain
    list, and says there was nothing to group by. Recorded as LLD D9 and EARS R-2.11.

- [x] 0.3 Decide whether to disambiguate the Neighborhood Map header (est: ~10m)
  - why: Two panes will be named "…Map". R-1.6 makes Source Map state its own claim, but the user
    still has to guess which tab answers their question — the exact objection recorded on
    2026-07-24. One line of copy on the Neighborhood Map header resolves it, and the HLD currently
    forbids touching that pane. Pre-mortem risk 2.
  - acceptance: Either the HLD non-goal is amended to permit a header-copy-only change to the
    Neighborhood Map, or the decision to leave it alone is recorded with its rationale.
  - verify: `docs/hld/source-map-grouped-tree.md` reflects the decision; if permitted, 1.5 is
    in scope, otherwise 1.5 is struck.
  - **DECIDED 2026-07-27:** the HLD non-goal is amended to permit a header-copy-only change to the
    Neighborhood Map. Story 1.5 is IN SCOPE.

## Unit 2: Tree derivation

- [x] 2.1 Pure `buildSourceTree(sources)` — grouping and counts (est: ~35m)
  - why: Everything else renders this. Keeping it a pure function with no rendering-library import
    is what makes the grouping rules testable without mounting a component, matching the
    `graphElements.js` precedent.
  - acceptance:
    - R-2.1 — group by `repo` at the top level, by `project` within each repo.
    - R-2.2 — `kindFromPath` is not used as a grouping axis.
    - R-2.4 — every branch carries the count of documents beneath it.
    - R-2.5 — top-level branch counts sum to the total number of sources.
    - R-2.10 — implemented as a pure function of the sources array, free of Preact imports.
  - verify: New `web/frontend/test/sourceTree.test.js` asserts grouping and count-sum on a fixture
    spanning 2 repos and 4 projects; the module imports nothing from `preact`.

- [x] 2.2 Ordering and stable branch identity (deps: 2.1, est: ~25m)
  - why: Counts change as rows stream in, so branch order changes with them. Without identity-based
    keys the user's expansion state would follow a position rather than a branch — the defect the
    pre-mortem caught in the first draft of this spec.
  - acceptance:
    - R-2.6 — sibling branches ordered by descending count, ties broken alphabetically by name.
    - R-2.6a — each branch carries a stable key derived from repo and project name, never position.
    - R-2.7 — leaves within a branch sorted by `relevance` **ascending** (raw negative BM25).
  - verify: Tests assert descending-count order with an alphabetical tie-break, that keys are
    unchanged when a rebuild reorders branches, and that a fixture with relevance
    `[-2.1, -5.3, -3.8]` orders as `[-5.3, -3.8, -2.1]`.

- [x] 2.3 Single-repo elision (deps: 2.1, est: ~20m)
  - why: Measured runs frequently return a single repo (all 28 sources from `foyer-platform`).
    A lone root branch wrapping everything costs a click and conveys nothing.
  - acceptance: R-2.3 — where exactly one distinct repo is present, the repo level is omitted,
    projects become the top level, and the repo name is exposed for the pane header.
  - verify: Test with a single-repo fixture returns projects at the top level and reports the repo
    name; a two-repo fixture keeps the repo level.

- [x] 2.4 Irregular-row handling (deps: 2.1, est: ~20m)
  - why: `_root` is a real `project` value for repo-root files, and a row missing `repo` or
    `project` must never silently vanish from a pane whose counts are supposed to be trustworthy.
  - acceptance:
    - R-2.8 — a `_root` project renders a human-readable label, not the raw token.
    - R-2.9 — rows missing `repo` or `project` land in an explicit "unknown" branch, never dropped.
  - verify: Fixture containing a `_root` row and a row with `project: undefined`; assert the labels
    and that the total count still equals the input length.

- [x] 2.5 Apply the filter-semantics decision (deps: 2.1, 0.1, est: ~15m)
  - why: Implements whatever 0.1 concluded, so the counts and the header agree.
  - acceptance: The tree is built from the source set chosen in 0.1, and the pane header names that
    set explicitly.
  - verify: With a tag filter active, the header text and the branch totals agree with the decision
    recorded in the LLD.

- [x] 2.6 Apply the degenerate-tree fallback (deps: 2.1, 0.2, est: ~20m)
  - why: Implements whatever 0.2 concluded, so a low-cardinality corpus degrades honestly instead of
    rendering a flat list dressed as a tree.
  - acceptance: The requirement added to EARS Unit 2 by 0.2 is satisfied.
  - verify: Fixture yielding a single group triggers the chosen behaviour; test asserts it.

## Unit 1: Pane registration and lifecycle

- [x] 1.1 Register the fifth tab and pane (deps: 2.1, est: ~30m)
  - why: Gives the tree a surface. Panes are always mounted and toggled by `hidden`, so the pane must
    join that pattern rather than invent a new one.
  - acceptance:
    - R-1.1 — a fifth tab labeled "Source Map" appears alongside the existing four.
    - R-1.2 — selecting it reveals the Source Map pane and hides the other four.
    - R-1.4 — the inspector's right-aligned label shows the source count for this tab.
    - R-1.7 — AI Answer, Sources & Provenance, Neighborhood Map, and Top Tags are behaviourally
      unchanged.
  - verify: `npm run dev`, run a query, click through all five tabs; the other four behave as before.
    Existing frontend tests still pass.

- [x] 1.2 Gate rendering on tab visibility (deps: 1.1, est: ~15m)
  - why: All panes stay mounted, so an ungated pane rebuilds on every `sources` event of every run
    while the user is reading something else — the exact problem documented at `GraphView.jsx:170-174`.
  - acceptance: R-1.3 — while the Source Map tab is not selected, the tree is neither built nor
    rendered.
  - verify: Instrument the builder with a temporary counter (or a spy in a component test); run a
    query while sitting on AI Answer and confirm zero invocations until the tab is selected.

- [x] 1.3 Empty state (deps: 1.1, est: ~10m)
  - why: A blank pane reads as broken. The prior graph pane already establishes an explicit empty
    state as the house style.
  - acceptance: R-1.5 — zero sources renders an explicit message, never a blank pane.
  - verify: Open the tab before running any query; the message is visible.

- [x] 1.4 Honest header copy (deps: 1.1, est: ~15m)
  - why: Every graph-ish surface in this product is governed by the rule that a connection must not
    claim more than it means. Tree branches are file-location containment, and the header has to say
    so before a user infers relationship or similarity.
  - acceptance: R-1.6 — the header states that branches group by file location and does not describe
    them as relationship, similarity, or relevance connections.
  - verify: Read the rendered header; it names grouping, not relationship.

- [x] 1.5 Disambiguate the Neighborhood Map header (deps: 0.3, est: ~10m)
  - why: Resolves the two-"Map"-tabs confusion at its source. In scope — 0.3 amended the HLD
    non-goal on 2026-07-27 to permit a header-copy-only change.
  - acceptance: The Neighborhood Map header states its own claim in one line, distinct from the
    Source Map's.
  - verify: Both headers read side by side make it obvious which tab answers which question.

- [x] 1.6 Verify the five-tab strip does not clip (deps: 1.1, est: ~20m)
  - why: `.inspector-tablist` is `overflow-x: auto` with nowrap tabs (`app.css:858-868`) and the app
    has no media queries at all. A fifth tab lands last, so it is the first to scroll out of sight —
    and a feature nobody can find is a feature that failed. Pre-mortem risk 1.
  - acceptance: At the narrowest inspector width the app supports, all five tabs are reachable
    without horizontal scrolling, or labels are shortened until they are.
  - verify: Resize the window to the narrowest supported width; confirm the Source Map tab is
    visible without scrolling the tab strip.

## Unit 3: Leaf rendering and interaction

- [x] 3.1 Leaf label and tags (deps: 1.1, 2.1, est: ~25m)
  - why: The leaf is where the user goes from "the mix looks wrong" to "this specific document".
    Tags arrive as a string on this path, so they must go through the shared normalizer or they
    render as one long fake tag.
  - acceptance:
    - R-3.1 — display `title`, falling back to `name`, then `path`.
    - R-3.2 — tags read through the shared normalization helper.
  - verify: Fixture rows with a bare string, a bracketed string, and an array of tags all render as
    discrete tags; a row with no `title` shows its `name`.

- [x] 3.2 Leaf activation and identity (deps: 3.1, est: ~25m)
  - why: Users already learned this interaction from the result cards; a leaf that behaves
    differently is a second thing to learn for no gain.
  - acceptance:
    - R-3.3 — activating a leaf selects that source and switches to Sources & Provenance.
    - R-3.6 — leaves are identified by the same source-identity key used to dedupe the sources array.
  - verify: Click a leaf; the Sources tab opens with that document's detail block showing.

- [x] 3.3 Reveal control with fullpath fallback (deps: 3.1, est: ~20m)
  - why: `json related` rows carry a synthetic `path` and an empty `fullpath` (`cli/db/query.go:501-510`),
    and the prompt explicitly instructs Claude to run `json related` — so these rows will occur in
    real runs, and a reveal button that silently does nothing is worse than none.
  - acceptance:
    - R-3.4 — each leaf offers a reveal-in-file-manager control, consistent with the sources list.
    - R-3.5 — where `fullpath` is empty, fall back to `path`; never render a no-op control.
  - verify: Run a query whose answer triggers `json related`; confirm reveal works on a related-derived
    leaf.

## Unit 4: Streaming behavior

- [x] 4.1 Rebuild on streamed rows (deps: 1.1, 2.1, est: ~20m)
  - why: `sources` events accumulate over a run rather than arriving once, so a tree built only at
    the end would sit empty during the part of the run the user is actually watching.
  - acceptance: R-4.1 — the tree rebuilds as rows merge in and reflects everything retrieved so far.
  - verify: Watch the pane during a live multi-repo run; branches and counts grow.

- [x] 4.2 Component-owned expansion state (deps: 2.2, 4.1, est: ~30m)
  - why: Branch order changes as counts change, and browser-owned disclosure state cannot be relied
    on to follow a branch through a reorder. This is the fix for the contradiction the pre-mortem
    found between R-2.6 and the original R-4.2.
  - acceptance:
    - R-4.2 — expansion state is preserved across rebuilds, keyed by branch identity.
    - R-4.2a — expansion state is held in component state, not browser-owned.
    - R-5.2 — disclosure elements remain native, with `open` controlled from state.
  - verify: Collapse a branch mid-run; as further rows arrive and reorder the branches, it stays
    collapsed and no sibling collapses with it.

- [x] 4.3 Run boundaries and history restore (deps: 4.1, est: ~20m)
  - why: A tree carrying branches from the previous question is actively misleading, and restored
    runs are a first-class path in this UI, not an edge case.
  - acceptance:
    - R-4.3 — a new run resets the tree; no branches survive from the previous run.
    - R-4.4 — a run restored from history builds the tree exactly as a live run would.
  - verify: Run query A, run query B, confirm no A branches remain; restore A from history and
    confirm its tree matches what it showed live.

- [x] 4.4 Default expanded (deps: 4.2, est: ~10m)
  - why: At a median of ~7 groups and ~28 leaves the whole tree fits on screen. Starting collapsed
    would hide the very skew the pane exists to reveal.
  - acceptance: R-4.5 — every branch renders expanded by default.
  - verify: Open the tab on a fresh run; all branches are open.

## Unit 5: Dependency and footprint

- [x] 5.1 Confirm zero new dependencies and no contract change (deps: 1.1, est: ~15m)
  - why: The pane is justified by being nearly free. A dependency added here would have to be earned
    by observed use, and a backend change would break the "purely additive" premise the whole plan
    rests on.
  - acceptance:
    - R-5.1 — no runtime dependency added to the frontend package manifest.
    - R-5.3 — no backend, CLI, index schema, or SSE contract change.
  - verify: `git diff` shows no change to any `package.json` dependency block, nothing under
    `web/backend/`, `cli/`, and no change to `EVENT_TYPES` in `web/frontend/src/api.js`;
    `npm --workspace frontend run build` succeeds.

- [ ] 5.2 Full regression pass (deps: all, est: ~20m)
  - why: The single largest risk of an additive change is that it quietly perturbs the four panes
    that already work.
  - acceptance: All existing frontend and backend tests pass; the other four panes are unchanged.
  - verify: `cd web && npm test`; then manually exercise AI Answer, Sources & Provenance,
    Neighborhood Map, and Top Tags on a real run.

## Kill signal

Recorded from pre-mortem risk 5, to be evaluated after a fortnight of real use: if no decision can be
named that this pane changed, delete it. Removal is a revert of purely additive, dependency-free
code — `web/frontend/src/components/SourceMap.jsx`, `sourceTree.js`, `SourceMap.css`, and the tab
and pane blocks in `app.jsx`.
