# Local-First Knowledge Graph for Distributed Sources — High-Level Design

> Revised after three-way review (PO / Tech Lead / Senior challenge, 2026-07-22).
> Decisions locked: **A1** (add a pure-Go YAML parser), **B3** (split graph
> ownership — see Goals), **C3** (spec only genuinely new behavior; inherit the
> rest by reference).

## Overview

Add a **typed, cross-repo knowledge-graph layer** to local-search. Markdown files
remain the single source of truth; the SQLite index remains a derived, rebuildable
cache. local-search *already* has a multi-repo registry, structural extraction,
incremental git-based scanning, and a graphify-compatible export — this change adds
what tags cannot express: **canonical node identity across repos** (`component://`,
`req://` IDs merge into one node no matter which repo mentions them) and **typed,
directed, provenance-bearing edges** declared in YAML frontmatter
(`implementedBy`, `upstream`, `dependsOn`, …), queryable via a new one-hop
`graph explain` command.

Source research: `.devlocal/research/2026-07-22-knowledge-graph-recommendation.md`
(uncle-os repo). Prior specs this builds on: `docs/{hld,lld,ears}/scan-command-overhaul.md`.

## Stakeholders & Impact

| Stakeholder | Pain today | After this ships |
|---|---|---|
| Human (CLI user) | Tags can't say "implements" vs "depends_on" vs direction; relationship questions need per-repo grep | `local-search graph explain <entity>` answers with typed edges + provenance across all registered repos |
| AI agents (Claude/Codex) | Grep/Read fan-outs across repos burn context | Stable `--json` contract (schema-versioned, exit-coded) as first search option |
| company-os CLI | Ontology links exist in files but aren't traversable across repos | Consumes the graph/export for ontology and spec-trace checks; `conflict`/`unresolved` flags are gate-able signals |
| graphify / future UI | local-search edges are untyped (`source/target/weight` only) | Export carries `relation`/`confidence`/`source_file` — the field names graphify's own schema already uses |

## Goals

- **Cross-repo query works (v1 definition of shipped):** with ≥2 registered repos
  scanned, `graph explain <entity>` returns the entity's typed edges with
  provenance, sourced from all repos, from any working directory.
- **Canonical-ID identity:** a `component://x` referenced in repo A and defined in
  repo B is *one node*. Duplicate definitions resolve deterministically and are
  flagged `conflict`; dangling references become `unresolved` phantom nodes.
- **Typed frontmatter edges:** recognized relationship fields become directed,
  typed edges with provenance (repo, path, field), parsed with a real YAML parser
  shared with the existing extraction path.
- **Split graph ownership (B3):** local-search is the source of truth for
  *declared* frontmatter edges (stored canonical-ID-keyed in SQLite, served
  directly — no external binary needed); graphify remains the source of truth for
  *semantic/community* traversal. Typed edges flow into the existing
  graphify-compatible export so graphify and UIs can enrich, never the reverse.
- **Determinism:** delete the DB, rescan → the canonically sorted export is
  byte-identical. Incremental scan ≡ full scan.

## Non-Goals

- **No multi-hop path-finding (`graph path`) in v1** — deferred until a real query
  demonstrates one-hop `explain` is insufficient.
- **No LLM/semantic extraction** — the layered-profile seam stays open.
- **No second community/semantic traversal engine** — graphify keeps that role.
- No mutation of registered repos; no server, daemon, or UI.
- **No re-specification of shipped behavior** — repo registry, structural
  extraction, incremental scanning, and the export command are inherited (see EARS
  "Inherited behavior" table), and their existing outputs must not change.
- No change to the scan semantics defined by scan-command-overhaul (surgical
  per-repo default, `scan all` for the registry).

## Success Criteria

1. Two registered repos, one canonical ID defined in repo B and referenced in repo
   A: `graph explain` shows a single node with edges whose provenance spans both
   repos.
2. **Rebuild equivalence:** `scan all → export → rm DB → scan all → export` yields
   a byte-identical canonically-sorted export.
3. **Incremental ≡ full:** after add/modify/delete/rename fixtures, an incremental
   scan's export equals a from-scratch full scan's export.
4. A duplicate canonical-ID definition and a dangling reference each appear in the
   scan summary and carry `conflict` / `unresolved` flags in query and JSON output.
5. `--json` output validates against the documented schema (with `schema_version`)
   and exit codes distinguish found / not-found / usage error / missing DB.
6. All existing tests pass and scan-command-overhaul EARS behavior is unchanged.
7. Soft performance target: 5 repos / 10k markdown files — full scan < 60s,
   `graph explain` < 1s (measured, not gated, in v1).
