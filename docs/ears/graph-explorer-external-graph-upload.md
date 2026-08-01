# External Graph Upload & Blending in the Graph Explorer — EARS Specifications

## Unit 1: Origin tagging

**Why:** Two datasets can only be told apart on one canvas if every node carries a provenance label.
The label must be assigned by the viewer, at load time, without disturbing any field the user's own
data might already use.

| ID | EARS statement |
| --- | --- |
| R-1.1 | THE SYSTEM SHALL provide `tagOrigin(graph, origin)` in `graphData.js`, returning a graph whose every node carries `__origin` set to `origin`. |
| R-1.2 | THE SYSTEM SHALL set `__origin` to `'local-search'` on every node of the graph obtained from `fetchGraph()` and from `RefreshReposPanel`'s rebuilt graph. |
| R-1.3 | WHEN a file is uploaded, THE SYSTEM SHALL set `__origin` on every node of the parsed graph to the uploaded file's name. |
| R-1.4 | THE SYSTEM SHALL NOT read, write, or overwrite any node field named `origin` when tagging. |
| R-1.5 | THE SYSTEM SHALL NOT modify node `id`, link `source`, or link `target` when tagging. |
| R-1.6 | THE SYSTEM SHALL apply `tagOrigin` before any merge, so a merged graph carries the origin of each contributing dataset per node. |

## Unit 2: Source filter dimension

**Why:** Once two datasets share a canvas the user needs to isolate either one — but a filter with a
single option is noise, so the control only exists when there is something to choose between.

| ID | EARS statement |
| --- | --- |
| R-2.1 | THE SYSTEM SHALL include `origin: new Set()` in `EMPTY_MULTI`. |
| R-2.2 | THE SYSTEM SHALL include a fifth `DIMS` entry `{ key: 'origin', emptyLabel: 'All Sources', searchLabel: 'Sources' }`, ordered after `tag`. |
| R-2.3 | THE SYSTEM SHALL have `collectFilterOptions` return `origin` as the sorted distinct set of `__origin` values across the graph's nodes. |
| R-2.4 | THE SYSTEM SHALL include `origin: []` in the initial `options` state, so `options.origin` is an array on the first render, before any graph has loaded. |
| R-2.5 | WHERE `multiSelect.origin` is non-empty, THE SYSTEM SHALL retain only nodes whose `__origin` is in that set. |
| R-2.6 | THE SYSTEM SHALL apply the origin filter strictly — a node lacking `__origin` SHALL NOT be exempted, unlike the `repo` and `project` checks in `applyFilters`. |
| R-2.7 | THE SYSTEM SHALL render the Source dropdown in the filter row IF AND ONLY IF `options.origin` has more than one value. |
| R-2.8 | THE SYSTEM SHALL include `origin` in the dimensions scanned for active filter chips, so a Source selection is individually removable like every other dimension. |
| R-2.9 | WHEN "Clear all" filters is invoked, THE SYSTEM SHALL clear the origin selection along with the other four dimensions. |

## Unit 3: Blend state and the derived display graph

**Why:** Blending must be a toggle the user can flip after the fact, not a decision frozen at
file-pick time — which means the base graph and the uploaded graph have to survive independently,
and flipping the toggle must not cost the user the filter state they built up to make the comparison.

| ID | EARS statement |
| --- | --- |
| R-3.1 | THE SYSTEM SHALL hold `baseGraph` (local-search), `upload` (`{ filename, text, graph }` or `null`), and `blend` (boolean) as independent state. |
| R-3.2 | WHERE `upload` is `null`, THE SYSTEM SHALL display `baseGraph`. |
| R-3.3 | WHERE `upload` is non-null AND `blend` is false, THE SYSTEM SHALL display `upload.graph` alone. |
| R-3.4 | WHERE `upload` is non-null AND `blend` is true, THE SYSTEM SHALL display a merge of `baseGraph` and `upload.graph` built from **structural copies** of their nodes and links, so no object reachable from `baseGraph` or `upload.graph` is also reachable from the displayed graph. |
| R-3.5 | THE SYSTEM SHALL give `loadNewData` an options bag controlling whether filters reset, whether the canvas refits, and which edge families are opened, so callers with different needs share one load path. |
| R-3.6 | WHEN the displayed dataset changes (mount fetch, upload, reset, repo rebuild), THE SYSTEM SHALL call `loadNewData` with filters reset and the canvas refitting. |
| R-3.7 | WHEN `blend` is toggled, THE SYSTEM SHALL call `loadNewData` preserving `multiSelect`, `search`, `nameFilter`, `titleFilter`, and the selected edge families, and SHALL NOT refit the canvas. |
| R-3.8 | WHEN `blend` is toggled, THE SYSTEM SHALL rebuild the filter option lists and drop from each preserved selection any value that is no longer present in the new option list. |
| R-3.9 | WHEN `blend` is toggled, THE SYSTEM SHALL re-derive the display graph from state already held and SHALL NOT re-fetch `/api/graph` or re-read the uploaded file. |
| R-3.10 | WHERE `upload` is non-null, THE SYSTEM SHALL render a blend toggle labelled to name the local-search graph as what is being blended in. |
| R-3.11 | WHERE `upload` is `null`, THE SYSTEM SHALL NOT render the blend toggle. |
| R-3.12 | WHEN a second file is uploaded, THE SYSTEM SHALL replace `upload` with the new file rather than accumulating both. |
| R-3.13 | WHEN `RefreshReposPanel` reports a rebuilt graph, THE SYSTEM SHALL replace `baseGraph` and SHALL preserve `upload` and `blend`. |
| R-3.14 | WHERE a state change does not alter the identity of the displayed graph — such as a `baseGraph` replacement while `upload` is present and `blend` is false — THE SYSTEM SHALL NOT call `loadNewData`, so filters and viewport are not reset for a graph the user is not looking at. |
| R-3.15 | WHILE `baseGraph` is still at its initial empty value and no upload is present, THE SYSTEM SHALL NOT display the empty-graph notice, so the first paint before the mount fetch resolves does not flash an empty state. |
| R-3.16 | THE SYSTEM SHALL keep the persisted upload payload JSON-serializable at all times, including after a blend has been rendered by the force layout. |
| R-3.17 | WHERE the display graph is a blend, THE SYSTEM SHALL open on the union of the default edge families computed independently for each origin, so an origin whose links are all of one family is not filtered off the canvas by the other origin's families. |
| R-3.18 | WHERE the display graph is a blend, THE SYSTEM SHALL normalize node `val` across origins so that neither dataset's nodes are rendered at a systematically larger radius than the other's on account of one dataset assigning `val` and the other not. |

## Unit 4: Id collision detection

**Why:** Merging two graphs that share node ids silently rewires links across datasets — a link from
the uploaded graph would attach to a local-search node. It also collapses them in
`buildPerformanceMaps`, where `nodeByIdMap.set` overwrites and neighbour sets merge, so the inspector
and neighbour highlighting would report one node's data for another. A blocked blend is recoverable;
a cross-wired graph is a lie.

| ID | EARS statement |
| --- | --- |
| R-4.1 | THE SYSTEM SHALL provide `detectIdCollisions(a, b)` in `graphData.js`, returning the number of node ids present in both graphs. |
| R-4.2 | WHENEVER a blend would be produced — on upload while `blend` is true, on toggling `blend` on, and on a `baseGraph` replacement while `blend` is true — THE SYSTEM SHALL run collision detection at derive time, before merging, with identical handling in every case. |
| R-4.3 | IF the collision count is greater than zero, THE SYSTEM SHALL NOT merge, SHALL set `blend` to false, and SHALL display a message naming the collision count. |
| R-4.4 | IF a blend is refused on upload, THE SYSTEM SHALL still load the uploaded graph standalone rather than discarding it. |
| R-4.5 | THE SYSTEM SHALL clear the collision message when `upload` is replaced or reset. |
| R-4.6 | THE SYSTEM SHALL compare ids only; it SHALL NOT compare or inspect any other node field to decide collision. |

## Unit 5: Session persistence

**Why:** Re-uploading a multi-megabyte file after every reload makes the feature tedious. Per-tab
persistence is enough, and must never be able to break the upload path itself. Persisting the raw
file text rather than the parsed graph sidesteps serialization entirely — there is no object graph to
go circular, and no multi-megabyte re-stringify on every toggle.

| ID | EARS statement |
| --- | --- |
| R-5.1 | WHEN a file is uploaded, THE SYSTEM SHALL retain the raw `FileReader` result string as `upload.text` alongside the parsed graph. |
| R-5.2 | WHEN `upload` or `blend` changes, THE SYSTEM SHALL write `{ filename, text, blend }` to `sessionStorage` under a single namespaced key, persisting the raw text and never the parsed or rendered graph. |
| R-5.3 | BEFORE writing, THE SYSTEM SHALL compare the payload length against the storage budget, counting two bytes per code unit, and IF it will not fit SHALL skip the write and tell the user once, at upload time, that this file is too large to survive a reload. |
| R-5.4 | WHEN the explorer mounts, THE SYSTEM SHALL restore `upload` and `blend` from `sessionStorage` before the initial `/api/graph` fetch resolves, parsing the stored text through the same path as a fresh upload. |
| R-5.5 | WHEN the initial `/api/graph` fetch resolves WHILE a restored `upload` is present, THE SYSTEM SHALL populate `baseGraph` and re-derive, and SHALL NOT replace the restored upload. |
| R-5.6 | IF writing to `sessionStorage` throws, THE SYSTEM SHALL keep the upload in memory and SHALL NOT surface an error that blocks the upload. |
| R-5.7 | IF the stored value is absent, unparseable, or malformed, THE SYSTEM SHALL start with no upload rather than throwing. |
| R-5.8 | WHEN a blend is derived, THE SYSTEM SHALL produce `upload.graph`'s contribution as a structural copy, so the retained upload is never the object handed to the force layout. |
| R-5.9 | WHEN Reset is invoked, THE SYSTEM SHALL clear `upload`, set `blend` to false, remove the `sessionStorage` entry, and display `baseGraph`. |
| R-5.10 | THE SYSTEM SHALL NOT persist the uploaded graph to `localStorage` or to any server endpoint. |

## Unit 6: Format guide in the help modal

**Why:** The accepted shapes are currently discoverable only by reading `graphData.js`. The guide
must describe exactly what the parser already accepts — both shapes — and be honest about what each
one can and cannot express. It must also be reachable at the moment the question arises, which is
when a file fails to parse, not when a user goes hunting behind a help icon.

| ID | EARS statement |
| --- | --- |
| R-6.1 | THE SYSTEM SHALL add a graph-format section to `HelpModal.jsx` documenting both accepted shapes. |
| R-6.2 | THE SYSTEM SHALL document the node-link shape as `{ nodes, links }`, noting that `edges` is accepted as a synonym for `links`. |
| R-6.3 | THE SYSTEM SHALL document node `id` as required and unique, and SHALL document `name`/`label`/`title`, `type`, `path`, `repo`, `project`, `tags`, and `val` as optional with the effect each has on the canvas. |
| R-6.4 | THE SYSTEM SHALL document link `source` and `target` as node ids, and `relation` as what promotes a link out of the grey similarity family. |
| R-6.5 | THE SYSTEM SHALL document the three edge families — a link with no `relation` is `similarity`; a link with a `relation` whose endpoint is missing or flagged `unresolved` is `dangling`; otherwise it is `declared`. |
| R-6.6 | THE SYSTEM SHALL document that a freshly loaded graph opens on declared and dangling links when any exist, and on all families otherwise. |
| R-6.7 | THE SYSTEM SHALL document the flat-array shape as an array of file records with `id`, `name`, `title`, `type`, `repo`, `project`, and `tags`, from which repo, project, and tag hub nodes are synthesized. |
| R-6.8 | THE SYSTEM SHALL state that the flat-array shape cannot express typed relations, and that its synthesized links therefore all belong to the similarity family. |
| R-6.9 | THE SYSTEM SHALL state that ids must not collide with the local-search graph's ids if the file is to be blended. |
| R-6.10 | THE SYSTEM SHALL NOT change the shapes accepted by `toGraph`, `normalizeGraph`, or `synthesizeGraphData`. |
| R-6.11 | WHEN an uploaded file fails to parse, THE SYSTEM SHALL render an inline error containing a control that opens the help modal at the graph-format section. |
| R-6.12 | THE SYSTEM SHALL name the accepted shapes in the Upload control's hover text. |
| R-6.13 | THE SYSTEM SHALL NOT add a toolbar control dedicated to the format guide. |

## Unit 7: Paste Prompt

**Why:** Most users will not hand-write a graph file. Handing them a prompt that produces one turns
the format guide from reference material into a working on-ramp.

| ID | EARS statement |
| --- | --- |
| R-7.1 | THE SYSTEM SHALL define the prompt text as an exported constant in a dedicated module, not inline in JSX. |
| R-7.2 | THE SYSTEM SHALL have the prompt describe both accepted shapes, the required and optional fields, and the id-uniqueness requirement, consistent with Unit 6. |
| R-7.3 | THE SYSTEM SHALL have the prompt instruct the model to emit a single JSON document and nothing else. |
| R-7.4 | THE SYSTEM SHALL render a "Paste Prompt" control in the graph-format section of the help modal. |
| R-7.5 | WHEN the control is activated, THE SYSTEM SHALL copy the prompt text to the clipboard and confirm the copy in the UI. |
| R-7.6 | IF the clipboard write fails or is unavailable (non-secure context), THE SYSTEM SHALL reveal the prompt text in a read-only, selectable field instead of failing silently. |
| R-7.7 | THE SYSTEM SHALL NOT close the help modal as a side effect of copying. |

## Unit 8: Non-regression

**Why:** Every user who never uploads a file must see exactly the page they see today.

| ID | EARS statement |
| --- | --- |
| R-8.1 | WHERE no upload is present, THE SYSTEM SHALL render the toolbar and filter row exactly as before this change — four dropdowns, no Source, no blend toggle. |
| R-8.2 | THE SYSTEM SHALL keep upload-replaces-graph as the behaviour when `blend` is false, matching today's `onUpload`. |
| R-8.3 | THE SYSTEM SHALL preserve the existing upload error path — a file that is neither a flat array nor `{nodes, links\|edges}` SHALL report a parse error and clear the file input — while replacing the `alert()` with the inline error of R-6.11. |
| R-8.4 | THE SYSTEM SHALL preserve `skipFilterRef` behaviour so a fresh load still refits once without being clobbered by the debounced filter effect. |
| R-8.5 | THE SYSTEM SHALL NOT modify any Go source, HTTP route, or `web/data/graph.json`. |
| R-8.6 | THE SYSTEM SHALL keep the existing `graphData.test.js` assertions passing unchanged, except where Unit 9 changes a documented family assignment. |
| R-8.7 | THE SYSTEM SHALL define a `Reset` visibility rule that holds for both of its triggers — an upload being present, and a repo rebuild having occurred — and SHALL state what the control does in each case. |

## Unit 9: Synthesized link family

**Why:** `synthesizeGraphData` emits links with no `family` field at all. `countEdgeFamilies` falls
back to displaying them as similarity, so the legend looks right, but `applyFilters` matches on the
field itself — `families.has(undefined)` is always false. Selecting "Similarity" on a flat-array
graph therefore empties the canvas today. The format guide (R-6.8) would tell users these are
similarity links, walking them straight into it.

| ID | EARS statement |
| --- | --- |
| R-9.1 | THE SYSTEM SHALL have `synthesizeGraphData` set `family: 'similarity'` on every link it emits. |
| R-9.2 | WHEN a flat-array graph is displayed and the similarity family is selected, THE SYSTEM SHALL render that graph's links rather than an empty canvas. |
| R-9.3 | THE SYSTEM SHALL NOT change the family displayed for any link by `countEdgeFamilies`, whose `undefined` fallback already reported these as similarity. |
