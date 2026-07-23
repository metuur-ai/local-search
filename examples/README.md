# Example spec repos — search + knowledge graph walkthrough

Two sample spec repos you can register as-is to try every feature, including
the local-first knowledge graph (canonical IDs, typed edges, `graph explain`):

- `product-specs/` — product capabilities (payments, onboarding)
- `platform-docs/` — platform components (API, architecture)

## 1. Register and scan

```bash
cd examples
local-search repo add ./product-specs product
local-search repo add ./platform-docs platform
```

Registration auto-scans. The scan summary now ends with per-repo knowledge-graph
feedback (nodes/edges per extraction profile, `conflict`/`unresolved` counts,
and top unrecognized relational-looking fields):

```
kg: structural N nodes; typed 4 nodes, 6 edges; conflicts 0, unresolved 2
```

The 2 `unresolved` phantoms are **intentional** in these fixtures — see step 4.

## 2. How the graph is declared

Files declare a canonical identity with the frontmatter `id` field using one of
the v1 URL-style schemes (`component://`, `req://`, `capability://`,
`context://`). Files without one still get a stable fallback identity
(`<repo-name>:<relative-path>`, forward slashes on every platform).

Typed, directed edges come from the recognized relationship fields:

| Field | Edge type | Direction |
| ----- | --------- | --------- |
| `relationships` | `related_to` | this node → ref |
| `implementedBy` | `implements` | ref → this node (reversed) |
| `upstream` | `upstream` | this node → ref |
| `dependsOn` | `depends_on` | this node → ref |
| `components` | `has_component` | this node → ref |
| `from-discovery` | `from_discovery` | this node → ref |

In these examples:

- `platform-docs/api/authentication.mdx` → `component://auth-api`, declares
  `components: component://token-service` and a `relationships` link to the
  signup capability.
- `product-specs/onboarding/signup.md` → `capability://onboarding/signup`,
  `dependsOn: component://auth-api` — a **cross-repo** edge that resolves to
  the node defined in the other repo.
- `product-specs/payments/refund.md` → `capability://payments/refund`,
  depends on `component://auth-api`, related to the chargeback capability. Its
  `linkedSpecs` field is *not* in the recognized table — because its value is
  canonical-ID-shaped, the scan summary surfaces `linkedSpecs` as a top
  unrecognized relational-looking field (nothing is silently dropped).
- `product-specs/payments/chargeback.md` → `capability://payments/chargeback`,
  `upstream` back to refund, and `implementedBy: component://disputes-service`
  (a reversed edge: disputes-service --implements--> chargeback).

## 3. Explore with `graph explain`

One-hop typed neighbors, both directions, with provenance (origin repo + file
path on every item), from any working directory:

```bash
local-search graph explain component://auth-api
```

You'll see incoming `depends_on` edges from both `capability://onboarding/signup`
and `capability://payments/refund` (cross-repo), plus the outgoing
`has_component` edge to `component://token-service`.

Machine consumers use the JSON contract — JSON-only stdout, `schema_version`
field, canonical ordering, byte-deterministic:

```bash
local-search graph explain capability://payments/refund --json
```

Exit codes: `0` found (including conflict/phantom nodes), `1` usage error,
`2` not found (`--json` still emits a well-formed `"found": false` envelope),
`3` DB missing (run `local-search scan` — explain never scans implicitly).

## 4. Phantom (unresolved) nodes

`component://token-service` and `component://disputes-service` are referenced
but defined nowhere — the resolver creates `unresolved` phantom nodes for them
and counts them in the scan summary. They're still first-class query targets:

```bash
local-search graph explain component://token-service   # exit 0, flags: unresolved
```

Define the ID in any registered repo (add `id: component://token-service` to a
new file's frontmatter) and rescan — the phantom flips to a real node on the
next global resolution pass.

## 5. Typed links in the export

The existing export now additionally carries typed links (additive-only; the
legacy untyped `links` array is unchanged):

```bash
local-search graph export
```

Exports are canonically sorted (nodes by ID; edges by src, type, dst) and fully
regenerated from the source files on every scan — delete the DB, rescan, and
the export is byte-identical.

## Notes

- Malformed frontmatter never breaks a scan: the file is indexed structurally
  and the summary shows a warning naming the repo and path.
- Unknown frontmatter fields are ignored without error; only
  canonical-ID-shaped ones are counted for the summary (like `linkedSpecs`
  above).
- `local-search repo remove <name>` purges that repo's graph rows and
  re-resolves the rest.
