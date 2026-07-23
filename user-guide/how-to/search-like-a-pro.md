# Search like a pro

`local-search search` looks simple — type a word, get results — but there's a whole query language and a handful of flags underneath it that turn "find the file with refund in it" into "find exactly the spec I mean, in exactly the repos I care about, ranked the way I want." This guide is the recipe book.

Examples below use the sample corpus in this project's own `examples/` folder (`local-search repo add examples`) — refund, chargeback, signup, and auth specs. Swap in your own repo names once you've got the pattern.

## Before you start

You need at least one repo registered (`local-search repo list` should show something). If not, see [manage-repos.md](manage-repos.md) first.

## Query syntax recipes

Local Search's keyword engine is SQLite FTS5 under the hood, so these all work natively — no special mode to turn on.

**Stemming (matches word forms automatically):**

```bash
local-search search refunding
```
Matches documents containing "refund," "refunds," "refunded," etc. — you don't have to guess the exact form.

**OR (either term):**

```bash
local-search search "refund OR signup"
```

**NOT (exclude a term):**

```bash
local-search search "payments NOT chargeback"
```

**Prefix (starts-with):**

```bash
local-search search "auth*"
```
Matches "authentication," "authorize," "authority" — anything starting with `auth`.

**Exact phrase:**

```bash
local-search search "\"refund request\""
```
Quote the phrase, and quote the whole thing again for your shell (or use single quotes around it) so the inner double quotes survive — the phrase only matches that exact word sequence, not the words scattered anywhere in the document.

> **Tip:** These combine. `"refund* NOT chargeback"` is a perfectly valid query.

## Narrow to specific repos

By default a plain `search` looks across every registered repo. Scope it down with `--repos` (comma-separated, preferred) or the older single-repo `--repo`:

```bash
local-search search "auth" --repos platform-docs,product-specs
local-search search "auth" --repo platform-docs        # legacy, single repo only
```

Other handy values for `--repos`:

```bash
local-search search "auth" --repos all          # every repo (the default)
local-search search "auth" --repos graph-only   # only repos with a graphify-out/ graph attached
```

## Choose where results come from

```bash
local-search search "auth" --source auto   # default: both if any selected repo has a graph, else fts
local-search search "auth" --source fts    # spec files only, never graph nodes
local-search search "auth" --source graph  # graph nodes only
local-search search "auth" --source both   # specs + graph nodes together
```

> **Note:** Asking for `--source graph` (or `both`) on a repo with no `graphify-out/` attached doesn't error — it just tells you plainly: `no graphs in selected repos — graph results will be empty`. Build a graph for that repo first if you want graph-sourced hits.

## Choose how results are ranked

```bash
local-search search "auth" --rank auto          # default: graph-aware if any selected repo has a graph, else bm25
local-search search "auth" --rank bm25          # plain keyword relevance, ignores any graph
local-search search "auth" --rank graph-aware   # boosts specs that are well-connected hubs in the graph
```

The status line above every result list — `[source=fts · rank=bm25 · repos=1 (0 with graphs)]` — always tells you exactly what got resolved, so you're never guessing what `auto` decided.

## Add semantic re-ranking

`--semantic` (alias `--hybrid`) layers a keyword-free similarity pass on top of your plain-text query, useful when the right document doesn't happen to contain your exact words:

```bash
local-search search "customer payment" --repos examples --semantic
```

> **Note:** Semantic re-ranks the *candidates that FTS already found* — it doesn't independently search the whole corpus by meaning alone. A query with zero keyword overlap against anything in the repo (e.g. `"money back"` when nothing in the corpus uses those words) still comes back empty, with a suggestion box for a broader term, a boolean query, or `local-search list`. Give it at least one word in common with the document you're after.

## Exclude a path

```bash
local-search search "auth" --repos examples --exclude-location platform-docs
```
Filters out any result whose path contains `platform-docs`, wherever else it matches.

## Discover, don't just search

Sometimes you don't have a query yet — you want to browse.

**Find specs related to one you already know:**

```bash
$ local-search related refund
  [team-os-example-repo] Credit Usage Dashboards  .md
  [uncle-os] PRD: Instant refunds — payments rails  ([component/payment-gateway, ...])  .md
```
`related` isn't repo-scoped — it looks across every registered repo for specs connected to the one you named, so it's a good way to find cross-repo echoes of a topic.

**See what changed recently:**

```bash
local-search recent          # last 10 modified specs, across all repos
local-search recent 3        # just the last 3
```

**Browse by tag:**

```bash
local-search tags            # every tag in use, with counts
local-search tags billing    # every spec tagged "billing"
```

**Browse by project (folder grouping) or repo:**

```bash
local-search projects            # every project across every repo
local-search list <repo-name>    # every spec in one repo
```

**Walk the frontmatter graph for one entity:**

```bash
$ local-search graph explain "capability://payments/refund"
capability://payments/refund  [capability]
  title:   Refund flow
  defined: examples:product-specs/payments/refund.md

outgoing:
  depends_on:
    -> component://auth-api  (examples:product-specs/payments/refund.md, field dependsOn)
  related_to:
    -> capability://payments/chargeback  (examples:product-specs/payments/refund.md, field relationships)

incoming:
  upstream:
    <- capability://payments/chargeback  (examples:product-specs/payments/chargeback.md, field upstream)
```

This works from a spec's own `dependsOn`/`relationships`/`upstream` frontmatter — you don't need a full `graphify-out/` graph for `graph explain` to find something, just specs that declare typed relationships to each other. Add `--json` for a machine-readable version. `graph tag <tag>` and `graph search <query>` produce a broader vector-graph view (NetworkX JSON) seeded from a tag or a query, if you want to export and visualize a neighborhood rather than read a single node's edges.

## Done-check

You should be able to narrow a search to the right repo(s), get the source/rank you expect (check the `[source=... · rank=...]` line), and fall back to browsing (`related`/`recent`/`tags`/`projects`) when you don't have exact words to search for yet.

## See also

- [../explanation/how-search-works.md](../explanation/how-search-works.md) — the BM25/RRF/graph-aware machinery behind these flags
- [../reference/cli-commands.md](../reference/cli-commands.md) — the complete flag and syntax reference
- [scope-a-project.md](scope-a-project.md) — narrowing *every* search from a project automatically, instead of typing `--repos` each time
