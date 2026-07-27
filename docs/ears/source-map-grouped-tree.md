# Source Map — Grouped Source Tree — EARS Specifications

Arrow of intent: HLD → LLD → **EARS** → code/tests. Each unit below is an implementable slice.

## Unit 1: Pane registration and lifecycle

**Why:** The pane must exist alongside the four current panes without disturbing them, and must not
do work while the user is looking at something else. All panes stay mounted and are toggled by the
`hidden` attribute, so an ungated pane would re-render on every `sources` event of every run.

| ID    | EARS statement |
| ----- | -------------- |
| R-1.1 | WHEN the results inspector renders, THE SYSTEM SHALL present a fifth tab labeled "Source Map" alongside AI Answer, Sources & Provenance, Neighborhood Map, and Top Tags. |
| R-1.2 | WHEN the "Source Map" tab is selected, THE SYSTEM SHALL reveal the Source Map pane and hide the other four. |
| R-1.3 | WHILE the "Source Map" tab is not selected, THE SYSTEM SHALL NOT build or render the source tree. |
| R-1.4 | WHEN the Source Map tab is selected, THE SYSTEM SHALL display the count of retrieved sources in the inspector's right-aligned label, consistent with the existing per-tab labels. |
| R-1.5 | IF the current run has produced zero sources, THE SYSTEM SHALL render an explicit empty-state message in the Source Map pane and SHALL NOT render a blank pane. |
| R-1.6 | THE SYSTEM SHALL state in the pane header that branches group sources by file location, and SHALL NOT describe them as relationship, similarity, or relevance connections. |
| R-1.7 | THE SYSTEM SHALL leave the AI Answer, Sources & Provenance, Neighborhood Map, and Top Tags panes behaviorally unchanged. |

## Unit 2: Tree derivation

**Why:** The pane's entire value is that the distribution of retrieved sources becomes legible. That
requires grouping on an axis that actually discriminates, counts that can be trusted against the
source list, and a deterministic order so the tree does not reshuffle as rows stream in.

| ID    | EARS statement |
| ----- | -------------- |
| R-2.1 | WHEN building the tree, THE SYSTEM SHALL group source rows by `repo` at the top level and by `project` within each repo. |
| R-2.2 | THE SYSTEM SHALL NOT use `kindFromPath` as a grouping axis. |
| R-2.3 | WHERE exactly one distinct `repo` is present across the sources, THE SYSTEM SHALL omit the repo level, render projects as the top level, and name the repo in the pane header. |
| R-2.4 | THE SYSTEM SHALL label every branch with the number of source documents beneath it. |
| R-2.5 | THE SYSTEM SHALL ensure the sum of top-level branch counts equals the total number of retrieved sources. |
| R-2.6 | THE SYSTEM SHALL order sibling branches by descending count, breaking ties alphabetically by branch name. |
| R-2.6a | THE SYSTEM SHALL identify each branch by a stable key derived from its repo and project name, never by its position in the ordered list, so that re-ordering during streaming cannot transfer one branch's state to another. |
| R-2.7 | WHEN ordering leaves within a branch, THE SYSTEM SHALL sort by `relevance` ascending, because `relevance` is raw negative BM25 where lower is better. |
| R-2.8 | WHERE a source row's `project` is `_root`, THE SYSTEM SHALL render a human-readable label for that branch rather than the raw `_root` token. |
| R-2.9 | IF a source row is missing `repo` or `project`, THE SYSTEM SHALL place it under an explicit "unknown" branch and SHALL NOT drop it from the tree. |
| R-2.10 | THE SYSTEM SHALL implement tree derivation as a pure function of the sources array, free of rendering-library imports, so it is unit-testable in isolation. |
| R-2.11 | IF fewer than 2 top-level groups are derived from the sources, THE SYSTEM SHALL render the sources as a plain list without branch disclosure elements, and SHALL state in the header that there was nothing to group by. |
| R-2.12 | THE SYSTEM SHALL build the tree from all retrieved sources rather than the filtered subset, and SHALL name that scope in the pane header. |

## Unit 3: Leaf rendering and interaction

**Why:** A group count tells the user the shape; the leaf is how they act on it. Leaf behavior must
match the interaction users already learned from the result cards and the sources list, and must
survive the field-level irregularities of the source rows.

| ID    | EARS statement |
| ----- | -------------- |
| R-3.1 | WHEN rendering a leaf, THE SYSTEM SHALL display the source's `title`, falling back to `name`, then to `path`. |
| R-3.2 | WHEN rendering a leaf's tags, THE SYSTEM SHALL read them through the shared tag-normalization helper, so rows whose `tags` arrived as a bare or bracketed string display correctly. |
| R-3.3 | WHEN a leaf is activated, THE SYSTEM SHALL select that source and switch to the Sources & Provenance tab, matching the existing result-card behavior. |
| R-3.4 | THE SYSTEM SHALL offer a reveal-in-file-manager control on each leaf, consistent with the sources list. |
| R-3.5 | WHERE a source row's `fullpath` is empty, THE SYSTEM SHALL fall back to `path` for reveal and SHALL NOT render a broken or no-op control. |
| R-3.6 | THE SYSTEM SHALL identify leaves using the same source-identity key used to deduplicate the sources array, so a leaf and its list row always refer to the same document. |

## Unit 4: Streaming behavior

**Why:** `sources` events accumulate over the life of a run rather than arriving once. The tree must
grow with them without destroying the user's place in it.

| ID    | EARS statement |
| ----- | -------------- |
| R-4.1 | WHILE a run is streaming, THE SYSTEM SHALL rebuild the tree as new source rows are merged in, so the pane reflects everything retrieved so far. |
| R-4.2 | WHEN the tree is rebuilt during streaming, THE SYSTEM SHALL preserve the expanded or collapsed state of every branch the user has already interacted with, keyed by branch identity rather than by position. |
| R-4.2a | WHILE a run is streaming, THE SYSTEM SHALL hold branch expansion state in component state rather than relying on browser-owned disclosure state, because branch ordering changes as counts change and DOM-owned state cannot survive re-ordering reliably. |
| R-4.3 | WHEN a new run starts, THE SYSTEM SHALL reset the tree to the new run's sources and SHALL NOT retain branches from the previous run. |
| R-4.4 | WHEN a run is restored from history, THE SYSTEM SHALL build the tree from the restored sources exactly as it would for a live run. |
| R-4.5 | THE SYSTEM SHALL render every branch expanded by default. |

## Unit 5: Dependency and footprint

**Why:** The pane is justified by being nearly free. A dependency added here would need to be earned
by observed use, not assumed at design time.

| ID    | EARS statement |
| ----- | -------------- |
| R-5.1 | THE SYSTEM SHALL implement the Source Map without adding any runtime dependency to the frontend package manifest. |
| R-5.2 | THE SYSTEM SHALL implement expand and collapse using native browser disclosure elements with their open state controlled from component state, so the pane is keyboard-operable and exposes correct roles to assistive technology while surviving branch re-ordering. |
| R-5.3 | THE SYSTEM SHALL NOT modify the backend, CLI, index schema, or any SSE event contract. |
