# `graph explain` — machine contract (Unit 4)

`local-search graph explain <entity> [--json]` returns the entity's resolved
node (including flags), its direct typed edges grouped by type in **both
directions**, and each edge's provenance — drawn from **all registered repos**
regardless of the current working directory (R-4.1). Every result item carries
its origin repo and file path (R-4.2).

## Exit codes (R-4.4)

| Code | Meaning |
| ---- | ------- |
| 0 | Entity found — including `conflict` nodes and `unresolved` phantoms |
| 1 | Usage error (missing entity, unknown flag, extra positional) — matches the CLI-wide error convention |
| 2 | Entity not found (nothing declares or references the id). In `--json` mode stdout still carries a well-formed envelope with `"found": false` — never an error blob |
| 3 | DB missing — the message instructs to run `local-search scan`; explain **never** scans implicitly (R-4.5) |

## JSON envelope (R-4.3)

`--json` emits **only** JSON on stdout (2-space indented, trailing newline).
Deterministic byte-for-byte for the same graph state: struct-ordered fields,
canonical sort everywhere.

```json
{
  "schema_version": 1,
  "query": "component://auth",
  "found": true,
  "node": {
    "id": "component://auth",
    "kind": "component",
    "repo": "repoA",
    "path": "docs/auth.md",
    "title": "Auth Service",
    "flags": "",
    "provenance": ["repoA:docs/auth.md"]
  },
  "outgoing": [
    {
      "type": "depends_on",
      "edges": [
        {
          "src": "component://auth",
          "dst": "component://db",
          "repo": "repoA",
          "path": "docs/auth.md",
          "field": "dependsOn"
        }
      ]
    }
  ],
  "incoming": []
}
```

Notes:

- `node` is `null` when `found` is `false`; `outgoing`/`incoming` are then `[]`.
- `flags` is `""`, `"conflict"` (duplicate definitions; all definers listed in
  `provenance`), or `"unresolved"` (phantom: referenced but never declared —
  `repo`/`path` are empty; provenance lives on the referencing edges).
- Ordering: groups ascend by edge `type`; within a group edges follow R-3.2's
  canonical sort (src, type, dst) extended by provenance columns
  (repo, path, field). SQLite BINARY collation == Go/bytewise order.

## Evolution policy (R-4.3)

Additive-only: fields may be **added**, never renamed, removed, or re-typed.
`schema_version` bumps on additive changes; consumers must ignore unknown
fields.
