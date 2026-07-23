# How search actually works

Type `local-search search refund` and a result list appears in about the time it takes to blink. Nothing about that feels remarkable until you ask what actually happened in the gap between pressing Enter and seeing text — and it turns out a surprising amount of quiet machinery ran in that blink.

This page is about that machinery: the keyword engine underneath everything, the optional semantic layer that rides on top of it, the graph-aware re-ranking that kicks in when you've built a knowledge graph, and the `auto` logic that decides which of these to use without being asked.

For flags and syntax, see [../reference/](../reference/). For step-by-step setup, see [../how-to/](../how-to/).

## The bedrock: FTS5, stemming, and BM25

At the base of everything is SQLite's FTS5 full-text index. Every `.md`, `.mdx`, and `.txt` file you register gets tokenized and stored with Porter stemming, which is why `search refunding` finds a document that only ever says "refund" — the stemmer reduces both to the same root before either one touches the index. It's the same trick a librarian uses when you ask for "the book about running" and she doesn't blink at "runs," "ran," or "runner."

Ranking on top of that index is BM25 — a well-worn formula that scores a document higher when your query terms show up more often *and* the document itself isn't a haystack of unrelated text. It's not fancy. It doesn't know what "refund" means. It just counts, in a mathematically informed way, and it counts fast: this whole path — parse query, hit the index, rank, print — is the ~30ms baseline the tool is built around. Boolean `OR`/`NOT`, prefix (`payment*`), and exact phrases (`"refund request"`) are all native FTS5 query syntax, so they're essentially free.

Nothing here calls out to the network, loads a model, or waits on anything. It's a local SQLite query, full stop.

## The optional layer: semantic search without a model

Keyword search has a known blind spot: it only finds what you typed, or close morphological cousins of it. Search for "cancellation policy" and a document that only says "refund terms" won't rank, even though a human reading both would say they're about the same thing.

`--semantic` (alias `--hybrid`) is the answer to that blind spot, and it takes a delightfully unglamorous approach: no ML model, no API key, no download, fully offline. Every document gets converted into a 256-dimensional vector using **feature hashing** — each word is run through a hash function that picks one of 256 buckets and a sign (+1 or −1), and the resulting vector is L2-normalized so cosine similarity reduces to a simple dot product. It's deterministic: the same text always produces the same vector, today or a year from now, on this laptop or any other. There's no training, no vocabulary file, no corpus to keep in sync. It's less "understanding" than "a very consistent way of turning text into coordinates," but that's enough to notice that "cancellation" and "refund" tend to share a neighborhood, because feature hashing on real text has just enough collision structure to make loosely-related words land near each other more often than chance would predict.

Here's the fun part: the tool doesn't pick between keyword and semantic results. It runs the BM25 search first, gets a candidate list, computes cosine similarity between the query vector and each candidate's stored vector, and then fuses the two rankings using **Reciprocal Rank Fusion (RRF)**. Picture two judges at a science fair, one who only cares about which project used the most precise vocabulary in its poster, the other who only cares about which project *feels* closest in spirit to the assignment. Neither judge sees the other's scorecard. RRF just asks each of them "where did you rank this one?" and hands out points as `1 / (60 + rank)` — a high rank (near the top) scores much better than a low one, but the exact score never depends on the raw BM25 number or the raw cosine number, only on position in each judge's list. Sum the two judges' points per document, re-sort by the total, and the documents that both judges liked — even if for entirely different reasons — float to the top.

The constant of 60 is a standard RRF damping term: it keeps a single judge's #1 pick from completely dominating just because the other judge ranked it #40 instead of leaving it off the list. If your query embeds to a zero vector (rare — it happens on pure punctuation or empty strings) or no vectors are stored yet, semantic search quietly falls back to plain FTS ordering rather than erroring out.

## When you have a graph: re-ranking by centrality

If you've run `graphify` against a repo, `local-search` notices the `graphify-out/` artifact the next time it scans and registers it against that repo. From then on, two more things become available:

- **`--source graph` or `both`** — pulls in graph node matches (concepts, entities) alongside or instead of spec files.
- **`--rank graph-aware`** — re-ranks your FTS results using the graph's notion of *centrality*. A spec whose name matches a well-connected node in the knowledge graph — something many other nodes point to or reference — gets its score boosted. The idea: a document sitting at a hub of the graph is more likely to be the "load-bearing" answer than a peripheral one, even if a peripheral document happens to repeat your search term more often.

Think of it as asking someone who's actually mapped the neighborhood, rather than someone who just counted street signs. FTS5's `rank` is "lower is better," so the boost is applied by multiplying or dividing depending on the sign of the score — a bit of internal bookkeeping you'll never need to think about, since the tool handles it and just presents you with a best-first list either way.

Graph-aware ranking and `--semantic` don't combine on a single query — RRF fusion already produces a best-first order, and the graph-aware pass assumes the opposite (FTS5-native) ordering convention. When both a graph and semantic mode are in play, semantic wins for that query; graph-aware ranking applies when semantic is off.

## The `auto` in `--source auto` and `--rank auto`

Left to its defaults, `local-search search` doesn't make you choose anything. The resolution logic is genuinely simple:

- **`--source auto`** → `both` (specs + graph) when any selected repo has a `graphify-out/` graph registered, otherwise `fts` (specs only).
- **`--rank auto`** → `graph-aware` when any selected repo has a graph, otherwise plain `bm25`.

In other words: if you've invested in building a knowledge graph for a repo, the tool assumes you'd like to benefit from it, every time, without a flag to remember. If you haven't, it stays out of your way and runs the plain, fast keyword path. The status line printed above every result list — `[source=both · rank=graph-aware · repos=3 (2 with graphs)]` — always tells you exactly what got resolved, so `auto` never feels like a black box; it's just a default you're free to override with an explicit `--source` or `--rank` when you want something different for one query.

`--semantic` is orthogonal to all of this — it's opt-in only, never implied by `auto`, because it changes the ordering fundamentally (RRF fusion) rather than layering a boost on top of the existing one.

## See also

- [../reference/](../reference/) for the full flag reference and query syntax
- [../how-to/](../how-to/) for setting up graphify and running your first semantic search
- [../reference/troubleshooting.md](../reference/troubleshooting.md) for the current `local-search ui` quirk (use the `local-search-ui` launcher instead)
