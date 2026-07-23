# Multi-Repo Graph Export for Self-Hosted Viewer — Low-Level Design

## Architecture

New command surface:

```
local-search graph export-view [--repos a,b | --all] [--edges auto|vector|tags|nodes] [--out graph.json]
```

All new code lives in `local-search/cli/`. No changes to the `cli/db` graph engine.

### Components

1. **`cli/graphexportview.go` — new file, `cmdGraphExportView(db *sql.DB, args []string)`**

   Flow:
   1. **Parse flags** — `--repos` (comma list), `--all`, `--edges` (default `auto`), `--out`
      (default `graph.json`).
   2. **Load registry** — `localdb.Repos(db)` → `[]RepoRow` (each has `.Name` and
      `.GraphNodeCount`), `query.go:740`.
   3. **Select repos**:
      - `--all` → every registered repo.
      - `--repos a,b` → the named repos; unknown name → `die` with the registered list.
      - Neither flag **and** stdin is an interactive TTY → print a numbered list
        (`N. <name>  (<Count> specs)`) to **stderr**, prompt
        `Include (e.g. 1,3 or all): `, read one line via `bufio.NewReader(os.Stdin).ReadString('\n')`,
        parse comma-separated 1-based indices or the literal `all`, trimming whitespace and
        deduping the resulting set.
        - **Count source:** display `RepoRow.Count` (the repo's `spec_count`), NOT
          `RepoRow.GraphNodeCount`. `GraphNodeCount` is the node count of the repo's own
          detected graphify artifact — a different artifact from what `export-view` builds.
          `RepoGraph` derives nodes from the `specs` table, so `Count` is the honest predictor
          of a repo's contribution; a repo with specs but no graphify artifact has
          `GraphNodeCount == 0` and would otherwise mislead the picker.
      - Neither flag **and not** a TTY → `die(usage)`; never block on stdin.
      - TTY check without new deps:
        `fi, _ := os.Stdin.Stat(); isTTY := fi != nil && fi.Mode()&os.ModeCharDevice != 0`.
   4. **Per selected repo** (iterate repos **sorted by name** for deterministic output):
      - Resolve `--edges` exactly as `cmdGraphExport` does (`main.go:1049-1065`):
        `auto` → `localdb.RepoHasVectors(db, repo)` → `vector` if true else `tags`; `vector|tags|nodes`
        pass through; anything else → `die`. Emit the `edges=… (auto)` note to **stderr** once per repo.
      - `g, err := localdb.RepoGraph(db, repo, edges, false, 0.3, 8)` (`vgraph.go:355`) —
        `includeContent=false`, and the same `minWeight 0.3 / perNodeTopK 8` defaults the
        single-repo export uses.
   5. **Merge** via a new local helper `mergeGraphs(perRepo []struct{repo string; g NodeLinkGraph})`:
      - Namespace **every** node ID: `id = repo + ":" + node.ID`. Leave all other node fields
        untouched — in particular `Path`, `Type`, `Repo` — so the viewer's `layerOf(path)`
        coloring keeps working (see Key Decisions).
      - Remap **every** link: `Source = repo + ":" + link.Source`, `Target = repo + ":" + link.Target`,
        using the link's owning repo prefix.
      - Concatenate all nodes and links into one `NodeLinkGraph`.
      - **Top-level metadata:** set the merged `Graph` to a deterministic
        `{"repos": [<selected names, sorted>]}`, and `Directed = false`, `Multigraph = false`.
        (The viewer reads only `nodes`/`links`, but leaving `Graph` as one arbitrary repo's map
        would be misleading and non-deterministic.)
      - **Sort for byte-stable output:** sort merged `Nodes` by `ID` (node IDs are unique — spec
        rowids plus at-most-one supplementary node per canonical endpoint — so this is a total
        order). Sort `Links` with **`sort.SliceStable`** keyed on `(Source, Target)`: duplicate
        `(Source, Target)` pairs are real (a similarity link and one-or-more typed kg links can
        share the same endpoints), and the per-repo input order is already deterministic
        (repos in name order; each repo's links in `RepoGraph`'s stable DB order, guaranteed by
        the existing export golden test), so a *stable* sort preserves a total order across runs.
        A plain `sort.Slice` would reorder ties nondeterministically and break R-5.4.
   6. **Write** with `localdb.WriteJSONFile(out, merged)` (`query.go:863`).
   7. Print `wrote N nodes, M links from K repo(s) → <out>` to **stderr** (stdout stays clean,
      matching `graph export`).

2. **Router wiring — `cmdVectorGraph` (`main.go:934`)**
   - Add `case "export-view": cmdGraphExportView(db, args[1:])`.
   - Extend the `usage` const string (`main.go:938`) to document `export-view`.
   - `export-view` goes through `ensureDB()` like `export`/`tag`/`search` (it needs the DB);
     only `explain` bypasses it.

3. **Reused graph types** (`cli/db/vgraph.go`) — unchanged:
   - `NodeLinkGraph{ Nodes []GraphNode; Links []GraphLink }` (`vgraph.go:68`).
   - `GraphNode.ID` → json `"id"` (`vgraph.go:20`).
   - `GraphLink.Source`/`Target` → json `"source"`/`"target"` (`vgraph.go:53-54`).

### Data flow

```
Repos(db) ──► repo selection (flags | interactive | die)
                     │  (sorted by name)
                     ▼
   for each repo:  resolve edges ─► RepoGraph(db, repo, edges, false, 0.3, 8)
                     ▼
   mergeGraphs: prefix ids by repo, concat, sort ─► NodeLinkGraph
                     ▼
            WriteJSONFile(out) + stderr summary
```

## Constraints

- **Go stdlib only** — TTY detection uses `os.Stdin.Stat()` + `os.ModeCharDevice`; interactive
  read uses `bufio`. No new modules.
- **stdout is data-only.** Prompts, the repo list, edge notes, and the summary all go to
  **stderr**, so a redirected `--out`-less future use (and the existing `export` convention)
  keeps stdout clean.
- **Determinism** — repos processed in name order; merged nodes sorted by ID (total order);
  links sorted with `sort.SliceStable` on `(Source, Target)` over deterministic input; merged
  `Graph` metadata set to `{"repos": [sorted names]}`. Same flags twice → identical bytes
  (mirrors R-3.2/R-5.4 guarantees of the existing exporters). The interactive selection is
  deduped so `1,1` cannot double a repo's nodes.
- **No new graph traversal logic** — only `Repos`, `RepoHasVectors`, `RepoGraph`, `WriteJSONFile`
  are called; all already exist.

## Key Decisions

- **Namespace all node IDs by repo (`repo:id`).** Per-repo node IDs are rowid-derived
  (`vgraph.go:389`, `ID: strconv.FormatInt(id, 10)` — every repo's first spec is node `"1"`), so
  collisions across repos are **guaranteed**, not hypothetical. Prefixing is collision-free and
  trivially deterministic. **This does not break viewer coloring:** the hosted
  `os-graph-explorer-pro.html` derives a node's OS layer from `n.type || layerOf(n.path)`
  (`normalizeGraph` ~line 987, `layerOf` ~line 473) — the **path**, never the id; the id is only
  a link-resolution key and a last-resort display fallback. `mergeGraphs` rewrites only
  `id`/`source`/`target` and preserves `path`/`type`, so `layerOf` behaves identically to the
  single-repo export (which already emits bare-integer, scheme-less ids). Repo identity also
  already rides on the always-populated `GraphNode.Repo` field. Tradeoff: a canonical entity
  referenced in two repos appears as two nodes. Accepted for v1; cross-repo canonical merging is
  deferred (see Out of Scope).
- **Home the command in `local-search`, not `company-os`.** The multi-repo registry lives in
  `local-search`; `company-os` is a single workspace and the wrong home.
- **Interactive picker only when a TTY is present; die (never hang) otherwise.** Preserves the
  tool's headless contract while giving humans a picker. Flags always win and are the
  script/CI path.
- **Reuse `graph export`'s edge-resolution and `RepoGraph` defaults verbatim.** Keeps merged
  per-repo subgraphs identical to what single-repo export would produce, so the viewer behaves
  the same.

## Out of Scope

- Cross-repo canonical node merging (dedup of the same `component://…` across repos) — deferred.
- Optional hosted-HTML change to load any `graph.json` by `?data=` URL — a one-line viewer tweak,
  not required if the user names the file `sample.json`. Not part of this command's code.
- Any change to `company-os`, to single-repo `graph export`, an embedded server, or CDN vendoring.

## Test Plan

The existing golden harness runs the built binary as a subprocess (`exec.Command(bin, args...)`,
`golden_test.go:45/94`), so the safety-critical paths are cheap to assert automatically — only the
interactive TTY prompt itself needs a pty and is left manual.

- **Happy path (golden)** — flag-driven `--repos <a>,<b> --out <f>` across two fixture repos:
  assert the merged output is byte-identical across two runs (R-5.4) and that node/link counts
  equal the sum of the inputs (R-4.3).
- **Never-hang (R-2.6)** — run with **no** repo flags and stdin redirected from `/dev/null`:
  assert non-zero exit, usage on stderr, and that it returns **promptly** (proves it never blocks
  on stdin when not a TTY).
- **Unknown repo (R-2.3)** — `--repos <unknown>`: assert non-zero exit and an error listing the
  registered repos.
- **Bad index (R-2.7)** — feed an out-of-range / unparseable selection on stdin: assert non-zero
  exit and error (the read path is testable via redirected stdin even though the live TTY prompt
  is not).
- **Manual** — build, run the interactive picker in a real terminal, pick `1,2`, and load the
  resulting file in the hosted viewer to confirm colored, layer-categorized nodes across both
  repos (this is the verification gate for the external, unvendored viewer assumption).
