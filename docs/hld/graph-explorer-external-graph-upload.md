# External Graph Upload & Blending in the Graph Explorer — High-Level Design

## Overview

The Graph Explorer can already render an externally supplied `graph.json` — the "Upload JSON"
button parses a file, normalizes it, and swaps it in for the local-search graph. But the feature is
effectively undiscoverable and one-dimensional: nothing on the page or in the help modal says what
shape the JSON must have, so a user has to read `graphData.js` to find out; and an upload always
*replaces* the local-search graph, so an external dataset can never be seen next to the repos it
relates to.

This change makes the upload path self-serve and additive. It documents both accepted JSON shapes
in the help modal, adds a **Paste Prompt** button that copies a complete, ready-to-run LLM prompt
for generating a conforming file, and lets an uploaded graph be **blended** with the local-search
graph rather than replacing it. When two datasets are on the canvas at once, a new **Source** filter
dimension makes it possible to isolate either one.

## Stakeholders & Impact

**Primary: an engineer or analyst with graph-shaped data outside local-search.** Today they can only
use the explorer by reverse-engineering the accepted format from source, and once they do, they get
an isolated island — their data on a blank canvas, disconnected from the repo knowledge graph that
motivated them to open this page. After this ships they can ask an LLM to produce the file (using
the copied prompt), drop it in, and view it either standalone or overlaid on the local-search graph,
with a filter to separate the two.

**Secondary: existing Graph Explorer users** who never upload anything. They must be unaffected. The
Source dropdown does not appear when only one dataset is loaded, the default view on page load is
unchanged, and the existing replace-on-upload behaviour remains the default upload action.

**Secondary: the `local-search graph export-view` CLI**, which is the canonical producer of the
node-link shape. The documented format must describe what that command already emits, not a new
dialect — so the guide stays true without any CLI change.

## Goals

- The help modal documents both accepted JSON shapes — the `{nodes, links}` node-link object and the
  flat array of file records — field by field, with which fields are required and what each one
  drives on the canvas.
- A **Paste Prompt** control copies a complete prompt to the clipboard that a user can paste into any
  LLM to have it generate a conforming graph file from their own data.
- The format guide is reachable at the moment the question arises — a file that fails to parse links
  straight to it — not only from behind the help icon.
- An uploaded graph can be **blended** with the local-search graph so both render together, and the
  blend can be toggled on and off after upload without re-uploading the file, **without losing the
  filter state** the user built up to make the comparison.
- When more than one dataset is on the canvas, a **Source** filter dimension can isolate either one.
- Selecting the similarity edge family on a flat-array graph shows its links instead of an empty
  canvas — a pre-existing bug the format guide would otherwise walk users into.
- Blending never silently corrupts the graph: if the two datasets share any node id, the blend is
  refused with a message that says how many ids collide, because merging them would rewire links
  across datasets.
- An uploaded graph and its blend state survive a page reload within the same browser tab.

## Non-Goals

- **No change to the accepted JSON formats.** Both shapes are documented exactly as
  `toGraph`/`normalizeGraph`/`synthesizeGraphData` already parse them. This is a documentation and
  composition change, not a schema change. (Tagging synthesized links with the similarity family they
  are already *displayed* as is a bug fix, not a format change — nothing about the accepted input
  moves.)
- **No id namespacing or rewriting.** Uploaded ids are never mutated to force a merge; collisions are
  reported and the blend is blocked, so what the user sees on the canvas is always the ids they
  supplied.
- **No server-side storage of uploads.** No new backend route, no second cache file beside
  `web/data/graph.json`, no upload-size handling. Persistence is per-tab and client-side only.
- **No cross-tab or cross-restart persistence.** An upload is gone once the tab closes.
- **No blending of more than one uploaded graph at a time.** A second upload replaces the first.
- **No change to the default page-load experience.** With no upload present, the toolbar, the filter
  row, and the rendered graph are exactly what they are today.

## Success Criteria

1. A user who has never read the source can open the help modal, learn what both file shapes are,
   and produce a valid file — either by hand from the documented fields or by pasting the copied
   prompt into an LLM.
2. Uploading a file with blend enabled renders the uploaded nodes and the local-search nodes on one
   canvas, and the Source dropdown lists both origins and can isolate either.
3. Toggling blend off after an upload shows the uploaded graph alone; toggling it back on restores
   the combined view — with no re-upload, no re-fetch, and with the user's filters and viewport
   still in place.
4. Uploading a file whose ids overlap the local-search graph produces a visible message naming the
   collision count, and the canvas is left showing a graph that has not been cross-wired.
5. Reloading the tab after an upload returns to the same view — same dataset, same blend state —
   rather than reverting to the local-search graph. If the file is too large for per-tab storage, the
   user is told so at upload time rather than discovering it after a reload.
6. A file that fails to parse produces an inline error that offers the format guide, rather than a
   dead-end `alert()`.
7. With no upload loaded, the page is indistinguishable from today: no Source dropdown, no blend
   control, no extra toolbar button, unchanged initial fetch and render.
