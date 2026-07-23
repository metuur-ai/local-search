# Your first web search

The CLI is fast, but sometimes you want to *see* a search happen — watch the
retrieval pipeline light up, click through to a source, poke at a graph of how
things connect. That's what the Local-Search Console (the web UI) is for. This
tutorial picks up where [getting-started.md](getting-started.md) left off: same
`examples/` repo, same refund spec, now in a browser.

> **Tip:** Haven't registered the `examples` repo yet? Go run through
> [getting-started.md](getting-started.md) first — this tutorial assumes it's
> already there.

## Step 1 — Start the console

> **Note:** You'll see `local-search ui` mentioned in some places as the way to
> start the web app. As of this version it doesn't work — it looks for a folder
> layout that doesn't ship anymore, and exits with an error instead of starting
> anything. Use one of the two methods below instead; both start the exact same
> server.

**Option A — the installed launcher.** If you ran the one-command installer in
the getting-started tutorial, you already have it:

```bash
$ local-search-ui
local-search-ui (production) listening on http://localhost:8787
CLI logging disabled (enable with --logs or LOG_CLI=1)
```

**Option B — from a source checkout.** Inside your `local-search` clone:

```bash
$ cd web
$ npm run dev

> local-search-ui@0.3.1 dev
> node server.js

local-search-ui (dev) listening on http://localhost:8787
```

Either way, open **http://localhost:8787** in your browser. You should land on a
page titled "Local-Search Console" — a search box up top, a status indicator that
says `idle`, and a quiet moment before you type anything.

> **Tip:** Something else already using port 8787? Set `PORT` before launching,
> e.g. `PORT=9000 local-search-ui`.

## Step 2 — Pick your repos

On the left, under **Target Repositories**, you'll see every repo you've
registered with the CLI, each with its spec count. Check the box next to
`examples`. The header near it updates to show how many you've selected, e.g.
"Select all — 1/4" if you happen to have other repos registered too — searches
only run against whatever you've ticked.

## Step 3 — Search in "Graph only · fast" mode

Type `refund` into the query box. Above the Search button, you'll see a **Search
Mode** toggle with two options:

- **AI Answer** — spawns Claude to synthesize a written answer from your specs
- **Graph only · fast** — a direct lookup against the local index, no model call

Click **Graph only · fast** — the button under it relabels itself to
**Search (no AI)** — then click it.

Results land in under a second. You'll see three source cards (the same three
files from the CLI tutorial: `refund.md`, `README.md`, `chargeback.md`), each with
its tags and a relevance score. The activity feed on the console shows you exactly
what ran under the hood:

```
COMMAND
local-search json search "refund" examples
3 source(s)
```

That's the whole trick of "Graph only" mode: it's the same CLI you already know,
just wired to a browser.

## Step 4 — Try "AI Answer" mode

Now switch the mode toggle back to **AI Answer** and click **Search** again. This
time it spawns the `claude` CLI in the background, hands it your retrieved specs,
and asks it to write a grounded answer. The header shows which model picked up the
job and flips from `STARTED` to `DONE` when it's finished — usually within
10–30 seconds, since it's actually reading and reasoning over your files rather
than just matching keywords.

Once it's done, the **AI Answer** tab in the right-hand inspector shows the
synthesized write-up, with buttons to expand it, copy the markdown, or save it to
a file.

> **Note:** No `claude` CLI on your `PATH`? The search will come back with an
> error saying the claude binary wasn't found. That's expected — **Graph only ·
> fast** mode doesn't need Claude at all, so you can still search and browse
> results without it.

## Step 5 — Inspect Sources & Provenance and the Neighborhood Map

The right-hand panel has four tabs: **AI Answer**, **Sources & Provenance**,
**Neighborhood Map**, and **Top Tags**. Click into the two that make this "explainable"
search instead of a black box:

**Sources & Provenance** lists every retrieved file with its score, plus a
retrieval-pipeline diagram:

```
query → FTS/BM25 candidates → embed (256-d) → cosine over vectors →
RRF fusion → ranked sources → answer
```

This is the fixed shape of every search Local Search runs — not something
reconstructed after the fact. It's how you can trust that the AI Answer traces
back to real files, not a hallucination.

**Neighborhood Map** draws the same sources as a small graph: your query sits in
the middle, retrieved docs are outlined around it, and node size tracks
relevance. Nothing to configure — just a different lens on the same three
results.

> **Tip:** Poke around **Top Tags** too — it's a quick facet view of which tags
> showed up across your retrieved sources, handy when a search returns more than
> a handful of results.

## Step 6 — Stop the console

When you're done, go back to the terminal where you started it and press
`Ctrl-C`. That's it — the server was running in your foreground terminal, so
stopping the process stops the console.

> **Note:** You may see `local-search ui stop` and `local-search ui status`
> mentioned elsewhere. Those only track a daemon started by `local-search ui` —
> which, as noted above, doesn't currently work. Since you started the server
> yourself with `local-search-ui` or `npm run dev`, `Ctrl-C` is the correct (and
> only) way to stop it.

## Where to go next

You've started the console, searched two ways, and looked under the hood at
provenance and the graph view. From here:

- **[../how-to/](../how-to/)** — practical guides for running the console against
  your own repos, working around a missing `claude` CLI, and changing the port.
- **[../explanation/](../explanation/)** — the reasoning behind the two search
  modes, why the retrieval pipeline is fixed rather than dynamic, and how the
  Neighborhood Map is built from search results.
