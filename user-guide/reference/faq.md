# FAQ

Short answers to the questions that come up most. Each links to the page that
covers it in full.

## Indexing & tags

**Which files get indexed?**
`.md`, `.mdx`, and `.txt` are indexed directly. Images and PDFs are indexed only
through a companion `.md` sidecar (see
[Index images and PDFs](../how-to/index-images-and-pdfs.md)). **Source files
(`.tsx`, `.py`, `.go`, …) are not indexed** — local-search is a spec/docs index,
not a code index.

**Where do a spec's tags come from?**
Two places: its frontmatter `tags:`, and markers in its body. Body markers are
`@spec <ID>` → a `spec:<id>` tag, and `[[wikilink]]` → a `link:<slug>` tag. See
[EARS spec annotations](ears-spec-annotations.md).

**How do I make requirement IDs like `R-1.3` or `TASKS-012` searchable as tags?**
Annotate them in a `.md` doc with the explicit marker: `@spec R-1.3`,
`@spec TASKS-012`. That produces `spec:r-1.3` / `spec:tasks-012` facets. A bare
`R-1.3` in prose is *not* tagged — the marker is required. Full convention:
[EARS spec annotations](ears-spec-annotations.md).

**My `@spec` annotation is in a `.tsx`/`.py` file and isn't found — why?**
Because code files aren't indexed (see above). Put the `@spec <ID>` marker in the
requirement's `.md` doc. To migrate existing docs to the marker form, run
`scripts/migrate-ears-annotations.py` (dry-run by default).

**What were the `link:community-community-N` tags, and why are they gone?**
They were graphify's internal navigation anchors from `GRAPH_REPORT.md`, scraped
into tags by accident. They're now filtered at extraction. If you still see them,
re-scan the repo to clear the old ones from the index.

## Search & scope

**A search says scope is required and won't just search everything — why?**
By design. local-search refuses to silently fan a query across every repo you've
ever registered. Set a scope for the project and searches resolve to it. See
[Scope a project](../how-to/scope-a-project.md) and
[One config file](../explanation/two-config-files.md).

**Which config file controls what gets searched?**
One file, in one of two places: `<project>/.agents/local-search-config.yaml`
(found by walking up) or `~/.local-search-config.yaml` as a global fallback. Its
`repositories:` list is read by **both** the CLI engine and the Claude Code
skill. Note that `local-search search` reads neither — it takes `--repos`,
defaulting to `all`; only `find` and `code` resolve scope.
[One config file](../explanation/two-config-files.md) has the details.

**Can I search across multiple repos at once?**
Yes — register them and set a multi-repo scope. See
[Manage your repos](../how-to/manage-repos.md).

## Keeping the index fresh

**Search results look stale or something seems off — what do I do?**
Delete the index and let it rebuild: `rm ~/.local-search/specs.db`, then run a
search or `local-search scan`. The `.db` is a disposable cache — your markdown
files are the source of truth, so nothing is lost. See
[The disposable index](../explanation/the-disposable-index.md).

**Do I need to back up the `.db`?**
No. It's fully derived from your files. The only state worth keeping is the repo
registry at `~/.local-search/repos` (the list of folders you've added).

**How do I keep the index current as files change?**
Re-scan on demand (`local-search scan <repo>`) or automate it — see
[Automate scanning](../how-to/automate-scanning.md).

## Web UI & the graph

**AI Answer vs. Graph only — which mode do I pick?**
*AI Answer* spawns the model to synthesize a grounded answer over retrieved
sources (slower). *Graph only* hits the local-search graph DB directly with no
model call (returns in about a second). Use Graph-only for fast lookups, AI for a
written answer. See [Web UI reference](web-ui-reference.md).

**Do I need graphify installed?**
No. Search works without it. When a repo has a `graphify-out/graph.json`,
local-search uses it for centrality boosts and the neighborhood map; without one,
those features degrade to "no graph available" rather than failing. graphify is the
source of truth for graph data — local-search reads it, never recomputes it.

**Where do graph "communities" come from?**
From graphify's community detection, not local-search. local-search only reads the
per-node `community` value. See [Explore the graph](../how-to/explore-the-graph.md).

---

Not here? Try [Troubleshooting](troubleshooting.md) for symptom → cause → fix, or
the [CLI commands](cli-commands.md) reference for exact flags.
