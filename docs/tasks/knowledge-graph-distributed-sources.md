# Local-First Knowledge Graph for Distributed Sources — Tasks

> Source of truth: `docs/ears/knowledge-graph-distributed-sources.md` (18 reqs, 5 units)
> Constraints: `docs/lld/knowledge-graph-distributed-sources.md`
> Order: Foundations → Unit 2 → Unit 1/3 → Unit 4/5 → acceptance gates.

## Foundations (cross-cutting prerequisites)

- [x] 0.1 Capture golden-output tests for top existing commands (est: ~45m) (mutex: main)
  - why: R-5.4's regression gate is only enforceable if today's outputs are pinned *before* any change lands — protects the 79K-line main.go and every inherited command
  - acceptance: R-5.4 — THE SYSTEM SHALL keep all inherited commands and their outputs unchanged
  - verify: golden files committed for `repo list`, `scan`, `query`, `graph export|tag|search`, `json`; a test target diffs live output against them and passes on unmodified HEAD

- [x] 0.2 Add goccy/go-yaml + shared frontmatter parse in extract.go (deps: 0.1, est: ~60m)
  - why: A1 decision — one real YAML parse feeding both legacy tag extraction and new typed-edge extraction, so search and graph never disagree (the extractor-drift risk)
  - acceptance: R-2.2 — parse each file's frontmatter exactly once per scan, feeding both legacy and typed-edge extraction; R-2.3 — malformed YAML ⇒ structural-only + warning naming repo/path, scan continues
  - verify: existing extract tests + golden outputs unchanged; new unit tests: nested lists/inline lists/quoted scalars parse; malformed-YAML fixture indexes structurally with warning

- [x] 0.3 DB schema v2: kg_nodes / kg_edges, canonical-string-ID keys (deps: 0.1, est: ~45m) (mutex: db)
  - why: rowid-keyed tables reassign on rebuild and silently break determinism (R-3.2/R-3.3); drop-and-rebuild via derivedTables matches the codebase's no-ALTER convention
  - acceptance: LLD schema — `kg_nodes(id TEXT PK, kind, repo, path, title, flags)`, `kg_edges(src, dst, type, repo, path, field)`; schemaVersion 1→2; `repo remove` purges kg rows (inherited-table duty, extends `DeleteRepo`)
  - verify: schema test asserts version bump + table shapes; `repo remove` test shows zero kg rows remain for the removed repo; existing `spec_edges` untouched

## Unit 1: Canonical node identity

- [x] 1.1 Canonical-ID and fallback node identity (deps: 0.2, 0.3, est: ~45m)
  - why: the v1 ship gate — cross-repo references can only merge if identity is canonical-first and path-fallback is platform-stable
  - acceptance: R-1.1 — frontmatter canonical ID (`component://`, `req://`, `capability://`, `context://`) is the node identity regardless of repo; R-1.2 — otherwise `<repo-name>:<relative-path>` with forward slashes on all platforms
  - verify: unit tests: same ID from two repo fixtures produces one identity key; Windows-style path fixture yields forward-slash ID

- [x] 1.2 Global resolution pass: merge, conflict, phantom (deps: 1.1, 2.1, est: ~90m) (mutex: db)
  - why: resolution state spans repos — computing it per-repo during extraction is the pre-mortem's divergence vector; conflict needs a total order or map iteration breaks rebuild equivalence
  - acceptance: R-3.1 — recompute resolution globally after every scan, never incrementally; R-1.3 — cross-repo references resolve to a single node; R-1.4 — duplicate definitions keep lexicographically-smallest `repo:path` winner, flag `conflict`, retain all definers in provenance, count in summary; R-1.5 — dangling references create `unresolved` phantom nodes, counted in summary
  - verify: fixtures: (a) ref-in-A/def-in-B ⇒ one node; (b) def-in-A+def-in-B ⇒ winner deterministic across 10 repeated rebuilds, `conflict` flagged; (c) dangling ref ⇒ phantom flagged; surgical rescan of one repo updates resolution of nodes defined elsewhere

## Unit 2: Typed frontmatter edges

- [x] 2.1 Typed-edge extraction from the recognized-field table (deps: 0.2, 0.3, est: ~60m)
  - why: the feature's core value — direction and type ("implements" vs "depends_on") that tags cannot express, with provenance for every claim
  - acceptance: R-2.1 — recognized fields (`relationships`, `implementedBy`, `upstream`, `dependsOn`, `components`, `from-discovery`) emit one typed, directed edge per referenced ID with provenance (repo, path, field); R-2.4 — unknown fields ignored without error; canonical-ID-shaped unrecognized fields counted for the summary
  - verify: table-driven tests per field ⇒ expected edge type/direction/provenance; unknown-field fixture: no error, counter incremented; hooks into existing surgical scan + `scan all` without changing scan semantics (scan-command-overhaul EARS still pass)

## Unit 3: Determinism & resolution

- [x] 3.1 Canonical sort everywhere + rebuild-equivalence acceptance test (deps: 1.2, est: ~60m)
  - why: "DB is a derived cache" is marketing until `rm db && rescan && diff` proves it; canonical ordering is what makes equivalence diff-testable
  - acceptance: R-3.2 — delete DB, rescan unchanged files ⇒ canonically sorted export (nodes by ID; edges by src, type, dst) byte-identical to pre-deletion export
  - verify: automated test: scan all → export → rm DB → scan all → export → `diff` empty; test repeated 5× to catch map-order leaks

- [x] 3.2 Incremental ≡ full-scan equivalence test (deps: 3.1, est: ~45m)
  - why: the pre-mortem's top trust-erosion risk — if incremental drifts, users go back to grep and the graph dies
  - acceptance: R-3.3 — incremental scan and from-scratch full scan over the same working trees produce identical canonical exports, including after adds, edits, deletes, renames
  - verify: fixture sequence add→edit→rename→delete, after each step: incremental export == fresh-full-scan export

## Unit 4: `graph explain` & the machine contract

- [x] 4.1 `graphcmd.go`: graph explain, one-hop, both directions (deps: 1.2, est: ~75m) (mutex: main)
  - why: the query surface that defines v1 shipped — one-hop typed neighbors with provenance, served from SQL with no external binary
  - acceptance: R-4.1 — node (with flags) + direct edges grouped by type in both directions + provenance, across all registered repos regardless of cwd; R-4.2 — origin repo and file path in every result item; R-4.5 — missing DB ⇒ fail with "run scan" instruction, never auto-scan; R-4.6 — existing `graph export|tag|search` behavior unchanged
  - verify: two-repo fixture query from an unrelated cwd returns both repos' edges; missing-DB test asserts message + no scan side-effect; golden outputs for existing graph subcommands still pass; new logic lives in graphcmd.go, main.go diff is dispatch-only

- [x] 4.2 --json contract + exit codes (deps: 4.1, est: ~45m)
  - why: agents are first-class consumers — they branch on exit codes and hard-code field names, so the contract is a requirement, not an afterthought
  - acceptance: R-4.3 — JSON-only stdout, `schema_version` field, canonical ordering, additive-only evolution documented; R-4.4 — distinct exit codes for found (0) / not-found / usage error / missing DB; JSON not-found is a well-formed result, not an error blob
  - verify: schema documented in the LLD or a docs/guides page; tests assert exit codes per case and that `--json` stdout parses with expected keys incl. `schema_version`; two runs byte-identical

## Unit 5: Feedback & export

- [x] 5.1 Scan summary (deps: 1.2, 2.1, est: ~45m)
  - why: the only feedback loop against the sparse-edge-yield adoption risk — makes "did registration+scan yield a graph worth querying?" visible
  - acceptance: R-5.1 — per-repo summary: files scanned, nodes/edges per extraction profile, warnings, `conflict`/`unresolved` counts, top unrecognized relational-looking fields
  - verify: fixture scan output contains all fields; sparse-repo fixture surfaces its unrecognized relational field name

- [x] 5.2 Typed links in the existing export (deps: 2.1, 3.1, est: ~45m)
  - why: graphify, company-os, and future UIs consume typed edges through the export, not SQLite — reusing graphify's own link field names keeps the promise "compatible" testable
  - acceptance: R-5.2 — export includes typed links carrying `relation`, `confidence`, `source_file`, `source_location`; untyped links unchanged; R-5.3 — export fully regenerated each run
  - verify: export diff shows typed links with the four fields; pre-existing untyped links byte-identical to golden; graphify `Load` (cli/graph/graph.go) parses the file without error

- [x] 5.3 Final regression + spec-conformance gate (deps: 3.2, 4.2, 5.1, 5.2, est: ~30m)
  - why: single checkpoint proving the whole EARS set before ship — the LID contract is that docs regenerate code, so every R-x.x must trace to a passing test
  - acceptance: R-5.4 — full existing test suite + golden outputs pass; every requirement R-1.1…R-5.4 has at least one named test
  - verify: `make test` (or `go test ./...`) green; a conformance checklist in the PR maps each R-x.x to its test name; HLD soft perf target measured and recorded (not gated)
