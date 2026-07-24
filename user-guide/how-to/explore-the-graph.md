# Explore the knowledge graph

The web UI ships a standalone **graph explorer** — an interactive map of your
indexed files and the links between them. This guide covers how to open it,
how the graph is built and kept up to date, and — the part most people miss —
how `@spec` references and `[[wikilinks]]` in your files become **tags** you can
filter and visualize by.

> Prerequisite: the web UI must be running (`local-search ui`) and your
> `local-search` binary must include the `graph export-view` command. See
> [Run the web UI](run-the-web-ui.md).

## Open it

Two ways:

- Go straight to **`http://localhost:8787/graph-explorer.html`**.
- Or click **Agent OS Graph →** in the header of the main Local-Search Console.
  (The explorer has a **← local-search** link back.)

## Build and refresh the graph

The explorer renders a **merged** graph produced by `graph export-view`, and it
**persists** the result to `web/data/graph.json`:

- On open, it loads the last-built graph instantly — a page reload never
  regenerates it.
- Click **⟳ Refresh from repos**, tick the repos you want, and hit **Rebuild
  graph** to regenerate from the current index. This overwrites the cached file
  and re-renders in place.

Every node's colour is its **OS layer**, derived from the file's path (see the
**Node Types** legend — Docs, Research, Team, Ontology, Platform, …). Node ids
are namespaced by repo (`<repo>:<id>`) so two repos never collide.

## How files become tags

When `local-search` indexes a file, a node's **tags** come from three places:

1. **Frontmatter `tags:`** — kept verbatim.
2. **`@spec` references in the body** — every `@spec req://<id>` becomes a
   `spec:<id>` tag.
3. **`[[wikilinks]]` in the body** — every `[[Target]]` becomes a `link:<slug>`
   tag, where the slug is the target lowercased with non-alphanumeric runs
   collapsed to hyphens.

Fenced code blocks are stripped before this scan, so shell `[[ … ]]` tests and
code samples never leak in as tags. Derived tags are deduped and appended to the
frontmatter tags.

### Example

Given `payments/refund.md`:

```markdown
---
tags: billing, payments
---
# Refund flow

Implements @spec req://core/refund-policy and pairs with the [[Chargeback Doc]].
```

the node's tags become:

```
billing, payments, spec:core/refund-policy, link:chargeback-doc
```

- `spec:core/refund-policy` — from the `@spec req://core/refund-policy` reference.
- `link:chargeback-doc` — from the `[[Chargeback Doc]]` wikilink.

These are ordinary tags: they show up in `local-search tags`, in tag-based
search, and — the point here — in the explorer's **Tags** filter.

## Visualize by tags (and everything else)

The filter bar drives what's drawn. All filters combine (a node must pass every
active one):

| Filter | What it matches |
|---|---|
| **Types** | OS layer (Docs, Research, …) |
| **Repos** | the node's source repo |
| **Projects** | the node's project (top path segment) |
| **Tags** | any tag on the node — including derived `spec:` / `link:` tags |
| **Name / Title contains** | substring on the node's name or title |

Because a `link:<slug>` tag is written onto **every** file that wikilinks to the
same target, filtering **Tags → `link:chargeback-doc`** instantly isolates every
file that points at *Chargeback Doc* — a fast way to see "what references this?"
across repos. Likewise, **Tags → `spec:core/refund-policy`** surfaces every file
that implements or cites that requirement.

Tips:

- Hover any dropdown option to see the full value (tags like
  `link:community-guidelines` are truncated to fit).
- Selected filters appear as removable chips in the **Active** row under the
  filter bar — click **×** to drop one, or **Clear all** to reset.
- **Name contains** / **Title contains** narrow within the current selection.

> Note on frontmatter tag format: a YAML flow sequence like
> `tags: [a, b, c]` is read literally. Prefer a comma list (`tags: a, b, c`) or a
> block list to avoid stray brackets appearing on the first/last tag.
