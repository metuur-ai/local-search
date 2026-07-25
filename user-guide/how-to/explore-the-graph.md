# Explore the knowledge graph

The web UI ships a standalone **graph explorer** — an interactive map of your
indexed files and the links between them. This guide covers how to open it,
how the graph is built and kept up to date, how to tell a **relationship you
declared** from a **lexical coincidence** the indexer guessed, and — the part
most people miss — how `@spec` references and `[[wikilinks]]` in your files
become **tags** you can filter and visualize by.

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

> **Refresh re-exports the index; it does not re-read your files.** If you just
> added a `dependsOn:` and it isn't showing, scan first, then refresh. The same
> applies after upgrading the binary: a cache written by an older version has
> its derived tables dropped, and a scan is what repopulates them — so scan
> once after upgrading, then refresh the graph.

Every node's colour is its **OS layer**, derived from the file's path (see the
**Node Types** legend — Docs, Research, Team, Ontology, Platform, …). Node ids
are namespaced by repo (`<repo>:<id>`) so two repos never collide.

## Declared links vs. lexical similarity

The graph mixes two kinds of edge, and reading them as the same thing is the
single easiest way to draw a wrong conclusion from the map:

- A **declared** link is something a human wrote down — a `dependsOn:` in
  frontmatter, or a markdown link in the body. It is a claim about your system.
- A **similarity** link is the indexer noticing that two files share vocabulary.
  It is a hint, not a claim. A 0.38-cosine overlap between two unrelated specs
  is common and means nothing on its own.

So the explorer draws them differently, and the **Links** toggles in the filter
bar (right of **Title contains…**) are both the key and the switch:

| Toggle | How it's drawn | What it means |
|---|---|---|
| **Declared** | solid teal | A relationship you wrote, pointing at a file that exists |
| **Unresolved** | dashed amber | A relationship you wrote, pointing at something **nothing declares** |
| **Similarity** | faint thin grey | The indexer's guess from shared wording |

Each toggle shows its link count, and hovering gives the full name. Click one to
show or hide that family. A few behaviours worth knowing:

- **Similarity links start hidden** whenever the graph has any declared links,
  because otherwise a few thousand grey hairlines bury the structure you
  actually wrote. A graph with no declared links at all opens showing
  everything, so you never land on an empty canvas.
- **You can't hide every family** — turning the last one off re-enables all of
  them rather than leaving you with a blank screen and no explanation.
- **Hiding a family also hides any node left with nothing attached.** This is
  why "Declared only" can shrink a 800-node graph to a few hundred — the rest
  were held in place solely by similarity links. Re-enable **Similarity** to
  bring them back.
- A family with **0** links is shown but greyed out and unclickable. That zero
  is informative: no declared links means nothing in the selection was ever
  wired up by hand.

> **Dashed amber is the most diagnostic thing on the canvas.** It means a file
> points at an id that no indexed file declares — a typo, a doc that was never
> written, or a file that moved. Filter to it alone to get a to-do list of
> broken references. The phantom endpoint is drawn as a node badged
> **unresolved** in the inspector.

## Where declared links come from

Two places, and they behave differently.

### 1. Frontmatter relationship fields

These carry a **type**, so the explorer can tell you *how* two things relate.
Values are canonical ids (`component://billing`, `req://core/refund-policy`) or
paths. A field may hold one value or a list.

| Frontmatter field | Edge type | Direction |
|---|---|---|
| `relationships` | `related_to` | this → target |
| `dependsOn` | `depends_on` | this → target |
| `upstream` | `upstream` | this → target |
| `downstream` | `downstream` | this → target |
| `components` | `has_component` | this → target |
| `boundedContext` | `in_context` | this → target |
| `fromDiscovery` *(or `from-discovery`)* | `from_discovery` | this → target |
| `implementedBy` | `implements` | **target → this** |

`implementedBy` is the one reversal: `implementedBy: X` records that *X
implements this document*, so the arrow points at you, not away.

```markdown
---
id: component://billing
dependsOn: component://ledger
components:
  - component://invoicing
  - component://dunning
implementedBy: service://billing-api
---
```

Two conveniences: unknown fields are ignored rather than erroring, and
scaffolding placeholders like `<component-id>` are skipped, so a template you
copied never litters the graph with phantom nodes.

### 2. Markdown links in the body

An ordinary inline link to another indexed file — `[the ledger](../ledger.md)` —
becomes a `links_to` edge. Unlike a frontmatter field it carries **no type**: it
records only *that* the two are related, because the meaning lives in the
sentence around it.

The rules are deliberately conservative — an edge appears only when the link
plainly resolves:

- Targets ending `.md`, `.mdx`, or `.txt` (an optional `#anchor` is fine).
- The file **must exist on disk**; broken links make no edge.
- Relative to the linking file, or to the repo root when it starts with `/`.
- Links outside the repo, external URLs (`https://…`), and links inside fenced
  code blocks are all ignored.

> `[[wikilinks]]` are **not** body links. They become `link:` **tags**, covered
> below — a different mechanism with a different purpose.

## Inspect one node

Click any node to open the inspector. Alongside path, repo, and tags it shows:

- **Type** and **Status** badges, read verbatim from the file's frontmatter
  `type:` and `status:` (e.g. `prd`, `draft`). These are free-form — whatever
  your docs already use shows up.
- An **unresolved** badge when the node is a phantom nothing declares, or
  **conflict** when two files claim the same canonical id.
- **Connections**, with a count of how many are *declared*. Each declared row
  names its relation and shows direction (`→ depends_on`, `← implements`), tinted
  by link family; similarity rows read *lexical similarity*.
- Every connection is **clickable** — jump straight to that node and keep
  walking the graph.

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

The **Links** toggles at the end of the same bar are the exception: every filter
above selects *nodes*, those select *edges*, and the two combine.

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
