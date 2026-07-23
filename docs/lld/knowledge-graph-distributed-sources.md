# Local-First Knowledge Graph for Distributed Sources — Low-Level Design

> Revised after three-way review. Locked decisions: **A1** yaml parser, **B3**
> split graph ownership, **C3** spec-only-new-behavior. Companion specs:
> `docs/{hld,lld,ears}/scan-command-overhaul.md` (scan semantics, registry file).

## Architecture

### Graph ownership doctrine (B3 — replaces the ambiguity flagged in review)

- **local-search owns declared edges:** typed, directed relationships extracted
  from frontmatter, stored canonical-ID-keyed in SQLite, served by `graph explain`
  directly from SQL. No external binary required to answer v1 queries.
- **graphify owns semantic/community traversal:** `cli/graph/graph.go` (the
  graphify delegation layer) is untouched. Typed edges flow *into* graphify via
  the export; traversal beyond one hop stays graphify's job.

### Components (extends real, existing packages)

```
cli/
  main.go          # dispatch ONLY — new cases route to sibling files (existing
                   # pattern: initcmd.go, scanhooks.go). No logic added here.
  graphcmd.go      # NEW: `graph explain` implementation + --json envelope
  extract/         # EXTEND extract.go: one shared frontmatter parse (yaml) feeds
                   #   BOTH legacy tag extraction and new typed-edge extraction —
                   #   a single parse so search and graph never disagree
  db/              # EXTEND: schemaVersion 1 → 2 (drop-and-rebuild via
                   #   derivedTables, per existing convention — no ALTERs):
                   #   kg_nodes(id TEXT PK, kind, repo, path, title, flags)
                   #   kg_edges(src TEXT, dst TEXT, type, repo, path, field)
                   #   — keyed on canonical STRING IDs, never rowids (avoids
                   #   the spec_edges rowid-reassignment divergence)
                   #   NOTE: existing spec_edges (vector-similarity) is a
                   #   different concept and is left untouched
  db/vgraph.go     # EXTEND GraphLink with optional fields matching graphify's
                   #   own schema: relation, confidence, source_file,
                   #   source_location. Untyped links unchanged.
  git/, scope/     # unchanged — inherited change detection & scope resolution
  graph/           # unchanged — graphify delegation (doctrine above)
```

### Data flow

```
registry file (~/.local-search/repos — the existing 4-field
name|path|skipdirs|added_at format from scan-command-overhaul; `repo add`)
   │
scan (surgical per-repo default / `scan all` — semantics INHERITED from
scan-command-overhaul; this feature only adds extraction outputs to it)
   │  per changed file (existing git detection, meta keys git_commit_<name>):
   │    shared yaml frontmatter parse
   │      ├─ legacy: tags, wikilinks, @spec reftags  (existing behavior)
   │      └─ new: canonical ID (node identity) + typed edges from the
   │             recognized-field table
   ▼
GLOBAL RESOLUTION PASS (always, after every scan, over all repos):
   – merge references to one node per canonical ID
   – duplicate definitions → deterministic winner (lexicographically smallest
     repo:path), node flagged `conflict`, all definers kept in provenance
   – dangling references → phantom node flagged `unresolved`
   – recomputed globally each time; never computed incrementally (a surgical
     rescan of repo A can change resolution state of nodes defined in repo B)
   ▼
kg_nodes / kg_edges (derived cache — delete & rescan reproduces exactly)
   ├─► graph explain <entity> [--json]   (SQL one-hop, grouped by edge type)
   ├─► scan summary (per-profile node/edge yield, conflict/unresolved counts,
   │    top unrecognized relational-looking fields)
   └─► existing `graph export` — now including typed links (relation/
        confidence/source_file) in the NetworkX node-link JSON
```

### Node identity

1. Frontmatter canonical URL-style ID (`component://`, `req://`, `capability://`,
   `context://`) ⇒ node ID, regardless of repo.
2. Else `<repo-name>:<relative-path>` (registry names are already unique —
   existing dedupe in `repoAdd`).
3. All ordering emitted anywhere (export, JSON, summary) is canonically sorted —
   nodes by ID, edges by (src, type, dst) — so equivalence is `diff`-testable and
   Go map iteration order can never leak out.

### Recognized relationship fields (v1, table-driven)

`relationships`, `implementedBy`, `upstream`, `dependsOn`, `components`,
`from-discovery` → typed edges (`implements`, `depends_on`, …). Unknown fields
ignored; unrecognized-but-relational-looking field names are counted and surfaced
in the scan summary (the feedback loop against sparse edge yield).

## Constraints

- Go, single static binary. **One new dependency admitted (A1):** a pure-Go YAML
  parser (`goccy/go-yaml` preferred — actively maintained; `gopkg.in/yaml.v3`
  acceptable). No CGO. Nothing else added.
- Files are truth; DB and export are derived. Registry stays in its existing file.
- Registered repos are read-only to this tool.
- Deterministic extraction — no LLM, no network.
- Scan semantics owned by scan-command-overhaul are not modified.
- Existing commands' outputs unchanged; before touching `main.go` dispatch,
  capture golden-output tests for the top existing commands (regression gate is
  enforceable, not aspirational).
- Cross-platform: repo-relative paths in node IDs always use forward slashes
  (Windows separator must not leak into identity).

## Key Decisions

| Decision | Why | Rejected alternative |
|---|---|---|
| A1: admit a pure-Go YAML parser | Relationship fields are nested YAML; regex subset would silently drop edges — the #1 adoption risk | Regex-subset grammar (protects a constraint at the cost of the feature's value) |
| B3: split ownership — SQL serves declared edges, graphify keeps traversal | v1 ship gate (canonical-ID merge) is the one thing graphify doesn't do; delegating queries would couple v1 to an external binary + 1.9MB JSON load | B1 second full engine (doctrine violation); B2 full graphify delegation (merge semantics + latency) |
| Cut `graph path`; ship `explain` only | Zero cited queries need >1 hop; BFS was the most complex, least-evidenced piece | Multi-hop in v1 |
| Canonical-string-ID-keyed tables, canonical sort everywhere | Makes rebuild equivalence and incremental≡full testable as `diff`; rowids reassign on rebuild | rowid keys (nondeterministic), byte-comparing SQLite files (impossible) |
| Deterministic conflict winner (smallest `repo:path`) + `conflict` flag | Without a total order, map iteration silently breaks rebuild equivalence; company-os wants to gate on the flag | Silently pick a winner; reject the scan |
| Global post-scan resolution pass | Phantom/conflict state depends on *other* repos; per-repo incremental resolution diverges | Incremental resolution during extraction |
| Extend `GraphLink`/existing export | graphify's schema already carries `relation`/`confidence`/`source_file`; reuse beats a parallel shape | New export format |
| New logic in sibling files, `main.go` dispatch-only | 79K-line monolith; codebase already has the sibling-file pattern | Growing main.go |

## Out of Scope

- `graph path` / multi-hop traversal (deferred; delegate to graphify if ever needed).
- Semantic/LLM extraction profile (seam only).
- Changes to `web/`, `cli/embed/`, `cli/codegraph/`, `cli/graph/`.
- Re-implementing registry, structural extraction, incremental scanning, or the
  export command — inherited (see EARS "Inherited behavior").
- Writing back to company-os workspaces (`ids/registry.yaml` etc.).
