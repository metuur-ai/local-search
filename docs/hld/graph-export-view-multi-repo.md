# Multi-Repo Graph Export for Self-Hosted Viewer — High-Level Design

## Overview

`local-search` already exports one registered repo's knowledge graph as viewer-ready
`{nodes, links}` JSON via `graph export <repo> --out graph.json`. The graph-explorer HTML
(hosted by the user) reads exactly this shape and colors nodes by OS layer through its
`normalizeGraph()` step. Two gaps remain: the export takes a **single** repo, and there is
no way to pick repos — `local-search` is fully headless with no interactive prompts anywhere.

This change adds a new command, `graph export-view`, that lists the registered repos, lets a
user select several (interactively when run in a terminal, or via flags for scripts/CI), merges
their graphs into **one** `graph.json`, and writes it out for the self-hosted viewer. No new
graph logic is introduced — it composes the existing per-repo export building blocks.

## Stakeholders & Impact

- **Primary — the user hosting the graph-explorer HTML.** Today they can only feed the viewer
  one repo at a time; to see multiple repos they would hand-merge JSON or re-run and lose the
  combined view. After this ships they run one command, pick the repos, and get a single
  viewer-ready file.
- **Secondary — CI / scripts.** The flag-driven path (`--repos a,b` / `--all`) makes the merged
  export reproducible in automation without a TTY, matching the headless nature of the tool.
- **Not affected — `company-os`.** It is a single workspace; the multi-repo registry lives in
  `local-search`, so this command belongs here. `company-os` is explicitly untouched.
- **Not affected — the existing single-repo `graph export`.** It keeps its exact behavior.

## Goals

- A user in a terminal can run the command with no repo flags, see a numbered list of registered
  repos with their spec counts, type a selection (`1,3` or `all`), and get one merged `graph.json`.
- A script can run the command non-interactively with `--repos a,b` or `--all` and no TTY.
- The merged output is the same `{nodes, links}` NetworkX shape the viewer already consumes, so
  the hosted HTML renders colored, layer-categorized nodes across all selected repos with no
  viewer code change required.
- Repeated runs with the same inputs produce **byte-identical** output (deterministic), matching
  the guarantee the existing exporters already make.
- Node IDs from different repos never collide in the merged file.

## Non-Goals

- No changes to `company-os`.
- No changes to the existing single-repo `graph export`.
- No embedded HTTP server or bundled viewer — the user hosts the HTML themselves.
- No CDN vendoring or new third-party dependencies.
- No cross-repo canonical node merging in v1 — the same `component://…` referenced in two repos
  stays as two nodes (namespaced by repo). Merging them is a possible later enhancement, called
  out but not built now.

## Success Criteria

- `graph export-view --repos <a>,<b> --out /tmp/graph.json` writes a valid `{nodes, links}` file
  whose node/link counts equal the sum of the selected repos' graphs.
- Running the same flags twice yields two byte-identical files (`diff` is clean).
- Running with no `--repos`/`--all` in a terminal prints the numbered repo list and prompt, and
  a selection of `1,3` produces a merged file for exactly repos 1 and 3.
- Running with no flags and **no** TTY exits with a usage message rather than hanging on stdin.
- Loading the merged file in the hosted viewer shows colored nodes from every selected repo.

> **Note on the coloring risk.** An earlier concern was that namespacing node ids (`repo:id`)
> could break the viewer's OS-layer coloring. Inspection of the hosted
> `os-graph-explorer-pro.html` settled this: layer is derived from `n.type || layerOf(n.path)` —
> the node **path**, never the id — and the merge preserves `path`. So prefixing the id is safe.
> The "load in the hosted viewer" manual step remains the verification gate, since that viewer is
> external and not vendored here.
