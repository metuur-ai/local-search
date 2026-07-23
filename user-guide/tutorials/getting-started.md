# Getting started with Local Search

Somewhere in your repos there's a markdown file with the answer you need — you just
don't remember which one, or which repo. That's the itch Local Search scratches. In
the next ten minutes you'll install the CLI, point it at a folder of specs, run your
first search, read a result, and tell it to rescan. No servers, no API keys, no
internet connection required.

## Before you start

Local Search is a single Go binary with zero runtime dependencies — it carries its
own SQLite engine, so there's nothing else to install alongside it. All you need is
a terminal.

## Step 1 — Install the CLI

Grab the repo and read the installer before running anything blind — always good
practice for a `curl | bash` one-liner:

```bash
curl -fsSL https://raw.githubusercontent.com/metuur-ai/local-search/main/install.sh | bash
```

This one command installs three things: the `local-search` CLI to `~/.local/bin`,
a Claude Code skill to `~/.claude/skills/local-search`, and a small companion web
app (more on that in the next tutorial). If Node.js isn't on your machine, the web
app step is skipped automatically — the CLI still installs fine on its own.

> **Tip:** Prefer building from source? Clone the repo, then:
> ```bash
> cd local-search/cli
> go build -o local-search .
> cp local-search ~/.local/bin/local-search
> ```
> You'll need Go 1.25+. No CGO, no C toolchain — the SQLite driver is pure Go.

Check it landed:

```bash
$ local-search --version
local-search version 0.3.1
```

If that printed a version instead of "command not found," you're good to go.

## Step 2 — Register your first repo

Local Search doesn't index anything until you tell it to. Every project it
searches is a "repo" — just a folder, registered by name. To keep this tutorial
self-contained, we'll point it at the sample specs that ship inside the
`local-search` project itself, under `examples/`. They're a small pretend company's
docs: refunds, chargebacks, authentication, signup — plenty to search over.

From inside your `local-search` checkout:

```bash
$ local-search repo add examples
Added repo "examples" (/path/to/local-search/examples)
Scanning…
  examples: indexing /path/to/local-search/examples…
  examples: 8 files indexed

Done. 8 specs indexed. Run 'local-search search <keyword>' to find specs.
```

That's it — no separate index step. Adding a repo scans it immediately.

> **Note:** In real use you'd run `local-search repo add /path/to/your/docs
> your-name` against your own spec folders. `examples/` here is just a stand-in so
> this tutorial works the same for everyone, on the first try.

## Step 3 — Run your first search

Time for the payoff. The sample corpus has a spec about refunds, so let's find it:

```bash
$ local-search search "refund"

[source=fts · rank=bm25 · repos=1 (0 with graphs)]

Specs (3):
  [examples · FTS] product-specs/payments/refund.md
    Refund flow  (billing, refund, customer, payments)  .md
  [examples · FTS] README.md
    Example spec repos — search + knowledge graph walkthrough  .md
  [examples · FTS] product-specs/payments/chargeback.md
    Chargeback handling  (disputes, chargeback, fraud)  .md
```

Three results, ranked by relevance (that `[source=... rank=...]` line tells you how
the query was resolved — full-text search with BM25 ranking here, since this repo
has no knowledge graph attached). Notice the chargeback spec showed up too, even
though the word "refund" only appears in its body, not its title — Local Search
searches full file content, not just filenames.

> **Tip:** Try `local-search search refunding` next. Thanks to stemming, it matches
> the same result — you don't have to guess the exact word form.

## Step 4 — Read a result

Search tells you *what* matched. `read` shows you the whole thing:

```bash
$ local-search read refund

---
id: capability://payments/refund
tags: billing, refund, customer, payments
dependsOn:
  - component://auth-api
relationships:
  - capability://payments/chargeback
linkedSpecs:
  - req://payments/refund-policy
---

# Refund flow

When a customer requests a refund, the following process applies.

## Eligibility

- Within 30 days of purchase
- Item not used or consumed
- Original payment method available

## Steps

1. Customer submits refund request via support portal
2. Support team reviews within 24 hours
3. If approved, refund processed to original payment method
4. Customer notified via email
5. Refund appears in 3-5 business days

## Edge cases

- Partial refunds require manager approval
- International refunds may take up to 10 business days
- Gift card purchases refunded as store credit
```

You get the full file — frontmatter and all. That frontmatter (`tags`,
`dependsOn`, `relationships`) is exactly what powers the tags you saw in the
search results a moment ago.

## Step 5 — Rescan

Specs change. New files get added, old ones get edited. Local Search usually
catches this on its own before every query — but you can always force a full
rebuild by hand:

```bash
$ local-search scan examples
  examples: indexing /path/to/local-search/examples…
  examples: 8 files indexed

Done. 8 specs indexed. Run 'local-search search <keyword>' to find specs.
```

Run `local-search scan` with no repo name to rebuild every registered repo at
once.

> **Note:** The index (`~/.local-search/specs.db`) is a disposable cache, not a
> source of truth. If anything ever looks stale or wrong, delete it and let it
> rebuild — nothing is lost, because your markdown files are always what it reads
> from.

## Where to go next

You've installed the CLI, registered a repo, searched it, read a result, and
rescanned. That's the whole loop — everything else is a variation on these five
steps.

From here:

- **[../how-to/](../how-to/)** — task-focused guides for things like registering
  your real repos, narrowing a search to one repo or excluding a path, using
  boolean/phrase queries, and troubleshooting a stale or missing index.
- **[../explanation/](../explanation/)** — background on how the BM25 ranking and
  git-based change detection work under the hood, and why the index is treated as
  disposable.

Or keep going right away with **[first-web-search.md](first-web-search.md)** —
same specs, but in a browser, with an AI-synthesized answer and a graph you can
click around in.
