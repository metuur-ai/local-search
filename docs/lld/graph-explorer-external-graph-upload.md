# External Graph Upload & Blending in the Graph Explorer — Low-Level Design

## Architecture

### Current shape

`GraphExplorer.jsx` holds one dataset. `originalData` is the loaded graph; `activeData` is the
filtered projection pushed to the canvas. Every load path — the mount fetch, `onUpload`, `onReset`,
`onRebuilt` — funnels into `loadNewData(g)`, which resets filters, rebuilds option lists via
`collectFilterOptions`, picks default edge families, and calls `graphLoad(shown, { refit: true })`.
Because `loadNewData` overwrites `originalData` wholesale, an upload is structurally a replacement.

### Change: split the single dataset into two sources plus a derived graph

Introduce three pieces of state above `originalData`:

- `baseGraph` — the local-search graph, from `fetchGraph()` on mount or from `RefreshReposPanel`.
- `upload` — `{ filename, graph }` for the uploaded dataset, or `null`.
- `blend` — boolean, meaningful only while `upload` is non-null.

The graph handed to `loadNewData` becomes derived:

```
upload === null            → baseGraph
upload && !blend           → upload.graph
upload && blend            → mergeGraphs(baseGraph, upload.graph)
```

`mergeGraphs` builds the merged arrays from **structural copies** of both inputs' nodes and links,
not from concatenated references — see "Why the merge copies" below.

### `loadNewData` gains an options bag

`loadNewData(graph, { resetFilters, refit, families })`. Two callers need different things:

- **A dataset change** (mount fetch, upload, reset, repo rebuild) resets filters and refits — today's
  behaviour, and the default.
- **A blend toggle** preserves `multiSelect`, `search`, `nameFilter`, `titleFilter`, and the selected
  families, and skips the refit. Option lists are still rebuilt, and any preserved selection whose
  value no longer exists is dropped by intersecting against the new lists.

The toggle case is not a nicety. The whole point of the toggle is A/B comparison: narrow to one repo
and three tags, flip blend off to see what the upload contributes, flip it back. If every flip wipes
the filters and refits the viewport, the toggle is a reload with a checkbox affordance.

The `families` option also resolves the blend case — the default-family pick is hardcoded inside
`loadNewData` today, so a blend cannot override it without this parameter.

The filter/refit/skip-flag machinery (`skipFilterRef`) is otherwise untouched: every load path still
goes through this one function.

### Derive is identity-aware

The derive runs on `[baseGraph, upload, blend]`, but not every change to those alters what is on
screen. A repo rebuild while an upload is displayed standalone (`blend === false`) leaves the display
graph identical — calling `loadNewData` there would reset filters and refit for a no-op. The derive
compares the produced graph's identity against the current one and short-circuits.

It also guards the initial state: on mount, `baseGraph` is `{nodes:[],links:[]}` until the fetch
resolves. Running the derive on that would set the empty-graph notice and flash "no results" before
the first paint of real data.

### Why the merge copies

The force layout mutates links in place — `d3-force-3d/src/link.js` rewrites `link.source` from an id
to the node object. And `applyFilters` **aliases** rather than copies: it returns `.filter()` results
over `originalData`'s arrays, so the objects handed to `graph.graphData()` *are* the objects held in
state. A merge built by concatenation would therefore hand `upload.graph`'s own link objects to the
layout, which makes them self-referential — and the next `sessionStorage` write throws on the
circular structure, killing persistence permanently.

Copying at derive time is the fix. See Persistence for the other half of it.

### Origin tagging

Every node gets a viewer-assigned `__origin` string at load time, via a new
`tagOrigin(graph, origin)` in `graphData.js`. The double-underscore prefix keeps it out of the way of
user data: an uploaded file may legitimately carry its own `origin` field, and this must not clobber
it or be confused with it.

- `baseGraph` nodes → `__origin: 'local-search'`
- uploaded nodes → `__origin: <filename>`

`tagOrigin` runs at the load sites (mount fetch, refresh, upload parse), not inside `loadNewData`, so
`mergeGraphs` receives already-tagged inputs and the merged graph carries both origins naturally.

### Source filter dimension

`EMPTY_MULTI` gains `origin: new Set()`. `DIMS` gains a fifth entry
`{ key: 'origin', emptyLabel: 'All Sources', searchLabel: 'Sources' }`. `collectFilterOptions`
collects distinct `__origin` values into `options.origin`. `applyFilters` matches
`multiSelect.origin` against `node.__origin`.

The Source dropdown renders only when `options.origin.length > 1`. With a single dataset loaded — the
normal case — a one-option dropdown would be pure noise in an already-dense filter row.

Two places must be updated alongside `collectFilterOptions`, both currently hardcoded to the four
existing dimensions: the initial `options` state object (otherwise `options.origin.length` reads
`undefined.length` on the first render, before any graph has loaded), and the active-chip list
(otherwise Source is the one filter with no removable chip).

Unlike `repo` and `project`, the origin check is **strict**, not exempting: `tagOrigin` guarantees
every node carries `__origin`, so there is no "nodes without the property" case to protect, and
exempting would defeat the dimension's whole purpose.

### Collision detection

`detectIdCollisions(a, b)` in `graphData.js` returns the count of ids present in both graphs. It runs
**once, at derive time**, on every path that would produce a blend — upload-with-blend, toggle-on, and
a `baseGraph` replacement while blended — with identical handling in all three. On a non-zero count
the merge is refused, `blend` reverts to `false`, and a notice is surfaced naming the count. The
uploaded graph is still loaded, standalone; the user is not left with nothing.

Colliding ids break more than link wiring. `buildPerformanceMaps` does `nodeByIdMap.set(n.id, n)`,
which silently overwrites, and merges the two nodes' neighbour sets — so the inspector and neighbour
highlighting would report one dataset's node as the other's. That is the stronger reason for blocking.

### Persistence

The **raw `FileReader` result string** is retained as `upload.text` and is what gets persisted, in
`{ filename, text, blend }` under a single `sessionStorage` key. Persisting text rather than the
parsed graph means there is no object graph that can go circular, no multi-megabyte re-stringify on
every toggle, and a natural parse-guard on restore — a malformed stored value fails exactly where a
malformed upload does.

On mount the explorer restores from `sessionStorage` first, then still fetches `/api/graph` to
populate `baseGraph` (needed for blending). Because the graph handed to the canvas is derived rather
than fetched directly, the mount fetch resolving no longer clobbers a restored upload — it only
fills `baseGraph` and re-derives.

Before writing, the payload length is checked against the storage budget. Quota is counted in UTF-16
code units, so the cost is roughly two bytes per character: a 2.7 MB file needs ~5.4 MB and is
already over a typical 5 MB ceiling. Rather than letting the write throw and warning after the fact,
the oversize case is detected up front and reported once, at upload time.

### Format guide + Paste Prompt

A new section in `HelpModal.jsx` documents both shapes. The prompt text lives in a new module
(`graphPrompt.js`) as an exported constant, so the guide and the copied prompt cannot drift apart and
the constant is unit-testable without rendering the modal.

**Discoverability is solved on the failure path, not the toolbar.** Nobody hunting "what JSON does
Upload accept?" opens a generic help icon — they open the file picker, guess, and hit the parse
error. So the existing `alert('Error parsing JSON: …')` becomes an inline error containing a link
that opens the modal at the format section. That reaches the user at the exact moment they have the
question, costs no toolbar space, and keeps the default page untouched. The Upload button's hover
text also names the accepted shapes. A second toolbar button for the guide is explicitly rejected —
it would violate the untouched-default non-goal to solve a problem the error path solves better.

### Synthesized link family

`synthesizeGraphData` never sets `family` on the links it emits. `countEdgeFamilies` has an
`undefined` fallback that displays them as similarity, so the legend has always looked correct, but
`applyFilters` matches the field itself — so selecting "Similarity" on a flat-array graph empties the
canvas today. Setting `family: 'similarity'` at synthesis time is a one-line fix that this change
must carry, because R-6.8 documents these as similarity links and the new Source filter gives users
a fresh reason to go poking at the family chips.

It also reduces the blend problem: a flat-array upload's links stop being family-less, so they are no
longer unconditionally dropped when the base graph's declared links set the default.

## Constraints

- **Preact, not React.** Components use `class=` and `onInput`; hooks come from `preact/hooks`.
- **Client-side only.** No Go changes, no new HTTP route, no touching `web/data/graph.json` or
  `handleGraphGet`.
- **`sessionStorage` quota.** `web/data/graph.json` is ~936 K, and uploads of a few MB are plausible.
  Quota is counted in UTF-16 code units, so budget ~2 bytes per character against a typical ~5 MB
  ceiling. A quota failure must degrade to in-memory-only, never break the upload. (`graphify-out/graph.json`
  is larger but is a different schema this viewer does not accept — not a reference point.)
- **Clipboard API needs a secure context.** `localhost` qualifies, but the same server reached over a
  LAN IP on plain HTTP does not. Copy must have a visible fallback.
- **The two data shapes are fixed** by `toGraph` / `normalizeGraph` / `synthesizeGraphData`. The guide
  describes them; it does not get to change them.
- **`graphLoad` refit/reheat semantics.** `skipFilterRef` exists to stop the post-load filter effect
  from clobbering the one-time zoom-to-fit. Any new load path must go through `loadNewData` so this
  keeps working.
- **Link endpoints are ids before layout and node objects after** (`linkEndId`). Collision detection
  and merging run on freshly parsed data, i.e. the id form — but must not assume it blindly.
- **`applyFilters` aliases, it does not copy.** Its outputs are `.filter()` results over the state
  arrays, so anything the layout mutates is mutated in state. Any requirement about "not handing X to
  the layout" has to be enforced by copying at derive time, not by the filter boundary.
- **No `GraphExplorer` test exists, and jsdom has no canvas backend.** `test/` covers
  `refreshReposPanel`, `graphView`, and the pure `graphData` helpers, but nothing renders
  `GraphExplorer.jsx` — it reaches `useForceGraph.js` → `force-graph` → canvas, and there is no
  `canvas` package in `devDependencies`. Component-level coverage of Units 3, 5, and 8 requires a new
  `test/graphExplorer.test.jsx` that mocks `useForceGraph`, which is also the only way to assert
  "routes through `loadNewData`" and "does not re-fetch" (spy on the mocked load). This is new test
  infrastructure for the repo, not an incremental case in an existing file — budget it as such.
- **`navigator.clipboard.writeText` is absent in jsdom 25.** Clipboard tests must stub it, and should
  cover the throw path as well as the success path.

## Key Decisions

**Derived display graph instead of mutating `originalData` in place.** The alternative — merging into
`originalData` on upload and un-merging on toggle — makes blend-off lossy and forces a re-fetch to
recover the base graph. Keeping `baseGraph` and `upload` as independent sources makes the toggle a
pure re-derivation with no I/O.

**`__origin` as a viewer-assigned field rather than reusing `repo`.** Overloading `repo` would corrupt
the Repos dropdown with a pseudo-repo and would collide with real repo values in uploaded data. A
separate namespaced field keeps both dimensions honest.

**Detect-and-warn on id collision rather than auto-namespacing.** `cli/graphexportview.go` namespaces
ids as `<repo>:<id>` when it merges repos, and that precedent was considered. Rejected here because
namespacing rewrites the ids the user sees in the inspector and in their own source file, breaking
the correspondence between what they uploaded and what is on screen. Blocking is louder but honest.

**Blend as persistent state, not a one-shot upload mode.** Asking "replace or blend?" at file-pick
time would force a re-upload to change your mind. A toggle that re-derives is both less code at the
picker and more useful afterwards.

**Source dropdown hidden below two origins.** Conditional rendering costs one line and keeps the
default filter row exactly as it is today, which is a stated non-goal to disturb.

**Prompt text as an exported constant, not inline JSX.** Makes it testable and guarantees the
documented fields and the prompted fields are one source of truth.

**Persist the raw file text, not the parsed graph.** The alternative requires guaranteeing that the
persisted object never touches the force layout, which the aliasing in `applyFilters` makes fragile —
and the failure mode is silent and permanent (one circular-structure throw and persistence is dead).
Text has no such failure mode, costs no re-stringify per toggle, and reuses the upload parse path on
restore.

**Blend defaults to the union of per-origin default families, not to all families.** Opening a blend
on everything would open on the base graph's similarity links, which outnumber declared ones roughly
8:1 — trading an invisible upload for a 3000-edge noise floor. Computing `defaultFamilies`
independently per origin and unioning keeps each dataset visible on its own terms.

**Blend toggle is exempt from the filter reset.** Every other load path resets because the dataset
changed underneath the user. A blend toggle is the one case where the user is deliberately comparing
two views and wants their narrowing to survive. This is why `loadNewData` takes an options bag.

**Node count doubling is not pre-optimized.** `useForceGraph.js` already drops soft shadows above
2500 nodes, so a degradation path exists and will engage. Blending a ~936 K base graph with a typical
upload is well inside what `force-graph` handles. Measure before acting.

## Out of Scope

- Namespacing, renaming, or otherwise reconciling colliding ids.
- Server-side upload storage, or any backend change.
- Blending more than two graphs, or blending two uploads together.
- Persisting across tabs or browser restarts.
- Changing either accepted JSON shape, or adding a third.
- Validating uploaded files beyond what `toGraph` already tolerates (no schema validator, no
  per-field error reporting).
- Any change to `local-search graph export-view` or the format it emits.
