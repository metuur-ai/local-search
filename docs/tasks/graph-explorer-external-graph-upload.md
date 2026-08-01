# External Graph Upload & Blending in the Graph Explorer — Tasks

Source of truth: `docs/ears/graph-explorer-external-graph-upload.md`.
Architecture constraints: `docs/lld/graph-explorer-external-graph-upload.md`.

Ordering note: Unit 9 and Unit 0 carry no dependencies and unblock the two most
expensive branches (the format guide and every `GraphExplorer` assertion), so they
run first even though they sit last in the EARS document.

---

## Unit 9: Synthesized link family

- [x] 9.1 Tag synthesized links with their displayed family (est: ~15m)
  - why: `synthesizeGraphData` emits links with no `family` field, so `countEdgeFamilies`
    reads them as `undefined` and selecting "similarity" on a flat-array graph yields a
    blank canvas. The guide documents a family table that is a lie until this is fixed.
  - acceptance: R-9.1, R-9.2, R-9.3 — every emitted link carries `family: 'similarity'`;
    `countEdgeFamilies` reports it; the `undefined` fallback still reports as similarity.
  - verify: extend `test/graphData.test.js` — synthesize a flat-array fixture, assert every
    link has `family === 'similarity'` and that selecting that family leaves links on screen.
  - landed: 339bd1c — web/frontend/src/graph-explorer/graphData.js, web/frontend/test/graphData.test.js

---

## Unit 0: Component test infrastructure (from LLD constraints)

- [x] 0.1 Add `test/graphExplorer.test.jsx` with a mocked `useForceGraph` (est: ~45m)
  - why: nothing in `test/` renders `GraphExplorer.jsx` today — it reaches `useForceGraph.js`
    → `force-graph` → canvas, and there is no `canvas` package in `devDependencies`. Units 3,
    5 and 8 are unverifiable without this, and mocking the hook is the only way to assert
    "routes through `loadNewData`" and "does not re-fetch". This is new infrastructure, not
    an incremental case.
  - acceptance: the suite mounts `GraphExplorer` under jsdom with `useForceGraph` mocked and
    `navigator.clipboard.writeText` stubbed, and exposes a spy on the load path.
  - verify: one smoke test renders the toolbar and asserts the initial `/api/graph` fetch
    fires exactly once; `npm test` green with no canvas dependency added.
  - landed: 952235f — web/frontend/test/graphExplorer.test.jsx

---

## Unit 1: Origin tagging

- [x] 1.1 Add `tagOrigin(graph, origin)` to `graphData.js` (est: ~20m)
  - why: two datasets can only be told apart on one canvas if every node carries a
    provenance label — and it must be assigned by the viewer, not trusted from the file.
  - acceptance: R-1.1, R-1.4, R-1.5 — sets `__origin` on every node; never reads, writes or
    overwrites a field the uploaded data might already own; never touches node `id` or link
    `source`/`target`.
  - verify: `test/graphData.test.js` — tag a fixture that already contains an `origin` field
    and assert it survives untouched while `__origin` is set.
  - landed: 339bd1c — web/frontend/src/graph-explorer/graphData.js, web/frontend/test/graphData.test.js

- [x] 1.2 Tag at every load site, before any merge (deps: 1.1, est: ~15m)
  - why: a merged graph is only separable if each contributing dataset was labelled on the
    way in; tagging after the merge is too late to tell the halves apart.
  - acceptance: R-1.2, R-1.3, R-1.6 — `'local-search'` on the `fetchGraph` and
    `RefreshReposPanel` rebuild paths, the uploaded file's own label on the upload path,
    both applied before blending.
  - verify: component test asserts every node in the fetched graph carries
    `__origin === 'local-search'` and every uploaded node carries the file label.
  - landed:

---

## Unit 4: Id collision detection

- [x] 4.1 Add `detectIdCollisions(a, b)` to `graphData.js` (deps: 1.1, est: ~25m)
  - why: merging two graphs that share node ids silently rewires links across datasets — the
    graph renders, looks plausible, and is wrong. This has to be caught before the merge, not
    debugged after it.
  - acceptance: R-4.1, R-4.6 — returns the count of node ids present in both graphs;
    compares ids only and inspects no other field to decide a collision.
  - verify: `test/graphData.test.js` — disjoint fixtures return 0; deliberately overlapping
    ids return the exact overlap count; nodes differing in every field but sharing an id
    still count.
  - landed: 339bd1c — web/frontend/src/graph-explorer/graphData.js, web/frontend/test/graphData.test.js

- [x] 4.2 Gate every merge entry point on the collision check (deps: 4.1, est: ~30m)
  - why: there are two ways into a blend — uploading while blend is on, and toggling blend on
    after an upload — and both must refuse to corrupt the view, without throwing away the
    file the user just picked.
  - acceptance: R-4.2, R-4.3, R-4.4, R-4.5 — both entry points check before merging; a
    non-zero count leaves `blend` false and surfaces a message naming the count; the uploaded
    graph still loads standalone rather than being discarded.
  - verify: component test uploads a colliding fixture with blend on — asserts the message
    names the count, `blend` stays false, and the uploaded graph is on screen alone.
  - landed: 96f78ad

---

## Unit 2: Source filter dimension

- [x] 2.1 Add `origin` as a filter dimension (deps: 1.2, est: ~25m)
  - why: once two datasets share a canvas the user needs to isolate either one, and the
    dimension has to exist in state before any control can render it.
  - acceptance: R-2.1, R-2.2, R-2.3, R-2.4 — `origin: new Set()` in `EMPTY_MULTI`;
    `{ key: 'origin', emptyLabel: 'All Sources', searchLabel: 'Sources' }` ordered after the
    existing dimensions; `collectFilterOptions` returns `origin` as a sorted distinct list;
    `origin: []` in the initial `options` state so it is an array on first render.
  - verify: `test/graphData.test.js` covers `collectFilterOptions`; component test asserts no
    `options.origin.length` read throws before the first load resolves.
  - landed:

- [x] 2.2 Apply the origin filter strictly (deps: 2.1, est: ~20m)
  - why: an untagged node must not leak through a Source selection — "unknown provenance"
    is a distinct answer from "matches your filter".
  - acceptance: R-2.5, R-2.6 — a non-empty `multiSelect.origin` retains only nodes whose
    `__origin` is in the set; a node lacking `__origin` is never exempted.
  - verify: `test/graphData.test.js` — filter a mixed fixture containing one untagged node,
    assert it is excluded under every non-empty selection.
  - landed:

- [ ] 2.3 Render the Source dropdown only when it means something (deps: 2.1, est: ~25m)
  - why: a dropdown with a single option is noise; the control should appear exactly when
    there is a choice to make, and behave like every other filter once it does.
  - acceptance: R-2.7, R-2.8, R-2.9 — rendered IF AND ONLY IF more than one origin is
    present; `origin` included in the dimensions scanned for active chips; "Clear all"
    clears it with the rest.
  - verify: component test — absent with only the local-search graph loaded, present after an
    upload, and "Clear all" empties the selection.
  - landed:

---

## Unit 3: Blend state and the derived display graph

- [x] 3.1 Split state into `baseGraph` / `upload` / `blend` with a derived display graph
      (deps: 1.2, 0.1, est: ~60m)
  - why: blending must be a toggle the user can flip after the fact, not a decision frozen at
    upload time — which means the displayed graph has to be derived from its inputs rather
    than being the only copy of them.
  - acceptance: R-3.1, R-3.2, R-3.3, R-3.4 — `baseGraph` and `upload` held independently;
    `upload` stored as the raw file text; the display graph derived from the three; toggling
    re-derives without re-fetching.
  - verify: component test toggles blend twice and asserts `/api/graph` was fetched exactly
    once across the whole sequence.
  - landed:

- [x] 3.2 Give `loadNewData` an options bag (deps: 3.1, est: ~30m)
  - why: every load path resets filters because the dataset changed underneath the user — but
    a blend toggle is the one case where the user is deliberately comparing two views and
    wants the narrowing they just built to survive. One parameter resolves the contradiction.
  - acceptance: R-3.5, R-3.6 — `loadNewData(graph, { resetFilters, refit })`; the blend
    toggle passes `resetFilters: false, refit: false` and preserves `multiSelect`, `search`,
    `nameFilter` and `titleFilter`; every other caller keeps today's reset behaviour.
  - verify: component test narrows a filter, toggles blend, asserts the selection is intact
    and the viewport did not refit; a second test asserts a fresh upload still resets.
  - landed: c114e5a

- [x] 3.3 Blend toggle control and its default families (deps: 3.2, 4.2, est: ~45m)
  - why: opening a blend on all families would open on the base graph's similarity links,
    which outnumber declared ones roughly 8:1 — trading an invisible upload for a 3000-edge
    noise floor.
  - acceptance: R-3.7, R-3.8, R-3.9, R-3.10, R-3.11, R-3.12 — toggle rendered only WHERE
    `upload` is non-null; blend shows the concatenation of both node and link sets; families
    default to the union of the per-origin defaults rather than to all families.
  - verify: component test asserts the toggle is absent with no upload; with a blend active,
    asserts the selected families equal the union of each dataset's own defaults.
  - landed:

- [x] 3.4 Replace, rebuild and no-op paths (deps: 3.1, est: ~30m)
  - why: the three ways the inputs can change after mount each need a defined answer, and one
    of them — an unchanged display graph — must not churn the layout.
  - acceptance: R-3.13, R-3.14, R-3.15 — a second upload replaces `upload` rather than
    stacking; a `RefreshReposPanel` rebuild replaces `baseGraph` and preserves `upload` and
    `blend`; an unchanged display-graph identity does not re-run the layout; the derive effect
    does not clear the canvas while `baseGraph` is still empty and no upload exists.
  - verify: component test uploads twice and asserts one dataset on screen; a rebuild test
    asserts the upload survives; assert no empty-canvas frame during initial load.
  - landed: 1e382a1

- [x] 3.5 Keep the derived graph serializable and dimensionally consistent (deps: 3.1, est: ~30m)
  - why: `applyFilters` aliases rather than copies, so anything the force layout mutates is
    mutated in state — the boundary has to be enforced by copying at derive time. And two
    datasets with different `val` scales render at incomparable node sizes.
  - acceptance: R-3.16, R-3.17, R-3.18 — the persisted payload stays JSON-serializable at all
    times (no circular structure once the layout has run); node `val` normalized across
    origins at blend time.
  - verify: component test renders a blend, lets the layout run, then asserts
    `JSON.stringify` on the persisted payload succeeds; assert `val` ranges align.
  - landed: 2227c73 — copyGraph at every derive branch, normalizeValsByOrigin, per-origin family union

---

## Unit 5: Session persistence

- [ ] 5.1 Persist the upload as raw text plus the blend flag (deps: 3.5, est: ~35m)
  - why: re-uploading a multi-megabyte file after every reload makes the feature tedious
    enough not to use. Persisting text rather than the parsed object removes the only failure
    mode that is silent and permanent.
  - acceptance: R-5.1, R-5.2, R-5.3, R-5.4 — `{ filename, text, blend }` under a single
    namespaced `sessionStorage` key; written on upload and on toggle; the length checked
    against the budget in UTF-16 code units before writing.
  - verify: component test uploads, asserts the key contents; asserts an over-budget file
    reports at upload time rather than failing silently.
  - landed:

- [ ] 5.2 Restore on mount, ahead of the initial fetch (deps: 5.1, est: ~35m)
  - why: the point of persistence is that the reload lands on the view the user left, not on
    the local-search graph followed by a flash of replacement.
  - acceptance: R-5.5, R-5.6, R-5.7 — restore runs before the initial `/api/graph` resolves;
    the upload is re-parsed from the stored text; a stored value that is absent,
    unparseable or malformed leaves the page exactly as it is today.
  - verify: component test seeds `sessionStorage`, mounts, asserts the restored dataset
    renders and the blend flag is honoured; a corrupted-value test asserts a clean fallback.
  - landed:

- [ ] 5.3 Reset clears persistence; nothing goes server-side (deps: 5.1, est: ~15m)
  - why: an escape hatch that leaves the stored copy behind is not an escape hatch. And an
    uploaded file is the user's — it must not reach `localStorage` or any endpoint.
  - acceptance: R-5.8, R-5.9, R-5.10 — Reset removes the entry and restores the fetched
    graph; the upload is never written to `localStorage`; no upload is ever sent to a server
    endpoint.
  - verify: component test asserts the key is gone after Reset; assert no `fetch` call
    carries the upload body.
  - landed:

---

## Unit 6: Format guide in the help modal

- [x] 6.1 Document the node-link shape (deps: 9.1, est: ~40m)
  - why: the accepted shapes are currently discoverable only by reading `graphData.js`, which
    is not a reasonable ask of someone trying to produce a file.
  - acceptance: R-6.1, R-6.2, R-6.3, R-6.4, R-6.5, R-6.6 — `{ nodes, links }` documented;
    node `id` required and unique; link `source`/`target` as node ids; the three edge
    families with the no-`family` fallback; that a fresh graph opens on declared families.
  - verify: read the rendered section against `normalizeGraph` and confirm every documented
    field is one the parser actually reads.
  - landed:

- [x] 6.2 Document the flat-array shape and its limits (deps: 9.1, est: ~30m)
  - why: the flat-array shape is the easy one to hand-write and the one whose limitations are
    invisible until the graph comes out wrong.
  - acceptance: R-6.7, R-6.8, R-6.9, R-6.10 — array-of-file-records documented; stated that
    it cannot express typed relations and that links are synthesized; that ids must not
    collide with the local-search graph; no change to the shapes the parsers accept.
  - verify: round-trip a documented example through `synthesizeGraphData` and confirm it
    renders as described.
  - landed:

- [ ] 6.3 Route parse failures into the guide (deps: 6.1, est: ~25m)
  - why: the moment the user has the question "what JSON does this accept?" is the moment the
    file failed — and today that moment is a dead-end `alert()`.
  - acceptance: R-6.11, R-6.12, R-6.13 — an inline error containing a control that opens the
    help modal at the graph-format section; it replaces the `alert()`; no second toolbar
    button is added.
  - verify: component test uploads malformed JSON, asserts the inline error renders, asserts
    the control opens the modal at that section, and asserts no `alert` fired.
  - landed:

---

## Unit 7: Paste Prompt

- [x] 7.1 Define the prompt as an exported constant (deps: 6.1, est: ~30m)
  - why: most users will not hand-write a graph file. Handing them a prompt that produces one
    turns the format from a specification into a request. Keeping it as a constant guarantees
    the documented fields and the prompted fields stay one source of truth.
  - acceptance: R-7.1, R-7.2, R-7.3 — exported from a dedicated module, not inline JSX;
    describes both accepted shapes, the required and optional fields, and the id-uniqueness
    requirement; instructs the model to emit a single JSON document and nothing else.
  - verify: unit test asserts the constant names every field documented in Unit 6 — the test
    that keeps guide and prompt from drifting.
  - landed: 35b926d

- [ ] 7.2 Paste Prompt control and clipboard handling (deps: 7.1, est: ~30m)
  - why: a prompt the user has to select by hand out of a modal is a prompt they will
    retype badly.
  - acceptance: R-7.4, R-7.5, R-7.6, R-7.7 — control rendered in the graph-format section;
    copies to the clipboard and confirms; IF the clipboard is unavailable or write fails, the
    prompt is revealed in a read-only selectable field instead of failing silently; the modal
    does not close as a side effect of copying.
  - verify: component test with a stubbed `navigator.clipboard.writeText` covers both the
    success path and the throw path; assert the modal stays open in both.
  - landed:

---

## Unit 8: Non-regression

- [ ] 8.1 Verify the zero-upload page is unchanged (deps: 2.3, 3.4, 5.3, 6.3, 7.2, est: ~30m)
  - why: every user who never uploads a file must see exactly the page they see today. This
    is the story that says the feature is additive.
  - acceptance: R-8.1, R-8.2, R-8.3, R-8.4 — with no upload present the toolbar and filter row
    render exactly as before (four dropdowns, no Source, no blend toggle);
    upload-replaces-graph remains the behaviour while `blend` is false; the existing parse
    error path still reports and clears the file input, with the `alert()` swapped for the
    R-6.11 inline error; `skipFilterRef` still lets a fresh load refit once without being
    clobbered by the debounced filter effect.
  - verify: component test asserts the no-upload toolbar against the current control set,
    uploads with blend off and asserts replacement, and asserts exactly one refit per load.
  - landed:

- [ ] 8.2 Hold the blast radius to the frontend (deps: 8.1, est: ~15m)
  - why: this is a viewer change. Anything it touches outside `web/frontend/src` is a defect,
    and the one place the existing suite is allowed to move is the family assignment Unit 9
    deliberately corrects.
  - acceptance: R-8.5, R-8.6 — no Go source, HTTP route or `web/data/graph.json` modified;
    existing `graphData.test.js` assertions pass unchanged except where Unit 9 changes a
    documented family assignment.
  - verify: `git diff --stat` against the branch point shows no `.go`, no route registration
    and no `web/data/graph.json`; full `npm test` green including the pre-existing
    `refreshReposPanel`, `graphView` and `graphData` suites.
  - landed:

- [ ] 8.3 Settle the `Reset` visibility rule (deps: 5.3, est: ~20m)
  - why: `Reset` now has two independent triggers — an upload being present and a repo
    rebuild having occurred — and a control whose meaning depends on which one fired is a
    control nobody can predict.
  - acceptance: R-8.7 — a single visibility rule that holds for both triggers, with the
    control's effect stated for each case.
  - verify: component test covers all four combinations of (upload present, rebuild occurred)
    and asserts visibility and effect match the documented rule.
  - landed:
