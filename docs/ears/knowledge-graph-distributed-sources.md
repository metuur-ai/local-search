# Local-First Knowledge Graph for Distributed Sources — EARS Specifications

> Revised after three-way review (C3 scoping): only genuinely new behavior is
> specified below. Everything else is inherited — see the table — and its
> existing outputs MUST NOT change (R-5.4).

## Inherited behavior (verified, not re-specified)

| Capability | Where it lives | Verification duty (not new requirements) |
|---|---|---|
| Repo registry: `repo add\|remove\|list\|prune`, unique names, file-based (survives DB deletion), purge-on-remove | `cli/main.go` (`repoAdd`/`repoRemove`/`repoList`), registry file per scan-command-overhaul EARS R-6.x | Confirm `repo remove` also purges `kg_nodes`/`kg_edges` rows (extend `DeleteRepo`) |
| Scan semantics: surgical per-repo default, `scan all`, lock, non-git/dirty-tree handling | `docs/ears/scan-command-overhaul.md` | Graph extraction hooks the existing scan path; adds outputs, never changes semantics |
| Structural extraction: H1 title, `tags:`, wikilinks, `@spec` reftags | `cli/extract/extract.go` | Migrate to the shared YAML parse without output change |
| Incremental change detection | `cli/git/git.go`, `runIncrementalUpdates`, `meta` keys | Reused as-is; covered by R-3.3 equivalence |
| Graph export command (NetworkX node-link JSON, graphify-compatible) | `cmdGraphExport`, `cli/db/vgraph.go` | Extended per R-5.2; untyped output unchanged |

## Unit 1: Canonical node identity

**Why:** The v1 ship gate — a `component://x` mentioned in any registered repo must be one node, with deterministic handling when identity goes wrong (duplicates, dangling refs), because company-os gates on those signals.

| ID    | EARS statement |
| ----- | -------------- |
| R-1.1 | WHEN a file's frontmatter declares a canonical URL-style ID (`component://`, `req://`, `capability://`, `context://`), THE SYSTEM SHALL use that ID as the node's identity regardless of which repo defines it. |
| R-1.2 | WHERE no canonical ID is declared, THE SYSTEM SHALL derive the node ID as `<repo-name>:<relative-path>` using forward slashes on all platforms. |
| R-1.3 | IF files in different registered repos reference the same canonical ID, THE SYSTEM SHALL resolve all references to a single node. |
| R-1.4 | IF two or more scanned files declare the same canonical ID, THE SYSTEM SHALL keep one node choosing the definition with the lexicographically smallest `repo:path`, flag the node `conflict`, retain every defining file in provenance, and report the count in the scan summary. |
| R-1.5 | IF an edge references a canonical ID that no scanned file defines, THE SYSTEM SHALL create a phantom node flagged `unresolved` and report the count in the scan summary. |

## Unit 2: Typed frontmatter edges

**Why:** Tags can't express "implements" vs "depends_on" vs direction; frontmatter fields where authors already declare meaning become traversable, provenance-bearing edges.

| ID    | EARS statement |
| ----- | -------------- |
| R-2.1 | WHEN frontmatter contains a recognized relationship field (v1 table: `relationships`, `implementedBy`, `upstream`, `dependsOn`, `components`, `from-discovery`), THE SYSTEM SHALL emit one typed, directed edge per referenced ID, carrying provenance (repo, path, field name). |
| R-2.2 | THE SYSTEM SHALL parse each file's frontmatter exactly once per scan, feeding both legacy extraction (tags, wikilinks, `@spec` reftags) and typed-edge extraction from the same parse, so search and graph results never disagree about a file. |
| R-2.3 | IF frontmatter YAML is malformed, THE SYSTEM SHALL index the file structurally, emit a warning naming repo and path, and continue the scan. |
| R-2.4 | WHERE frontmatter contains fields not in the recognized table, THE SYSTEM SHALL ignore them without error, and SHALL count unrecognized fields whose values look relational (canonical-ID-shaped) for the scan summary. |

## Unit 3: Determinism & resolution

**Why:** "DB is a derived cache" is only true if it's provably rebuildable; resolution state spans repos, so it must be recomputed globally or incremental scans silently diverge.

| ID    | EARS statement |
| ----- | -------------- |
| R-3.1 | WHEN any scan completes, THE SYSTEM SHALL recompute canonical-ID resolution (merge, `conflict`, `unresolved`) globally across all registered repos' data, never incrementally per repo. |
| R-3.2 | IF the DB is deleted and all repos rescanned with unchanged files, THE SYSTEM SHALL produce a canonically sorted export (nodes by ID; edges by src, type, dst) byte-identical to the pre-deletion export. |
| R-3.3 | IF an incremental scan and a from-scratch full scan run against the same working trees, THE SYSTEM SHALL produce identical canonically sorted exports, including after file adds, edits, deletes, and renames. |

## Unit 4: `graph explain` & the machine contract

**Why:** One-hop explain is the query surface that defines v1 shipped; agents and tools are first-class consumers, so the JSON shape and exit codes are requirements, not details.

| ID    | EARS statement |
| ----- | -------------- |
| R-4.1 | WHEN the user runs `local-search graph explain <entity>`, THE SYSTEM SHALL return the entity's node (including flags), its direct edges grouped by type in both directions, and each edge's provenance, drawing from all registered repos regardless of the current working directory. |
| R-4.2 | THE SYSTEM SHALL include origin repo and file path in every result item, human or JSON. |
| R-4.3 | WHERE `--json` is passed, THE SYSTEM SHALL emit only JSON on stdout, containing a `schema_version` field, deterministically ordered per R-3.2's canonical sort, with schema evolution additive-only. |
| R-4.4 | THE SYSTEM SHALL exit with distinct codes for: entity found (0), entity not found (documented non-zero), usage error, and missing DB — and in `--json` mode SHALL express "not found" as a well-formed JSON result, not an error blob. |
| R-4.5 | IF the DB does not exist when a query runs, THE SYSTEM SHALL fail with a message instructing the user to run `scan`, and SHALL NOT scan implicitly. |
| R-4.6 | THE SYSTEM SHALL NOT modify the behavior or output of the existing `graph export|tag|search` subcommands. |

## Unit 5: Feedback & export

**Why:** The scan summary is the only loop telling the user whether the graph is worth querying (sparse-yield risk); the export is how graphify, company-os, and UIs consume typed edges without touching SQLite.

| ID    | EARS statement |
| ----- | -------------- |
| R-5.1 | WHEN a scan completes, THE SYSTEM SHALL print a summary per repo: files scanned, nodes and edges produced per extraction profile, warnings, `conflict` and `unresolved` counts, and the top unrecognized relational-looking frontmatter fields (per R-2.4). |
| R-5.2 | WHEN the existing graph export runs, THE SYSTEM SHALL include typed edges as links carrying `relation`, `confidence`, `source_file`, and `source_location` fields (graphify's own link schema), while existing untyped links remain unchanged. |
| R-5.3 | THE SYSTEM SHALL regenerate the export fully on each run as derived output. |
| R-5.4 | THE SYSTEM SHALL keep all inherited commands and their outputs unchanged (existing test suite plus pre-captured golden outputs for top commands pass). |

## Deferred (explicitly out of v1)

- `graph path` multi-hop traversal — restore only when a real query proves one hop insufficient; delegate to graphify per the B3 doctrine.
- Semantic/LLM extraction profile.
