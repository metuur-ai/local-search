# Two config files, two audiences

If you go looking, you'll find two small config files living in different corners of a project, both quietly deciding "which repos get searched," and it's easy to assume they're the same thing wearing different clothes. They're not. They serve two different callers who never talk to each other directly, and conflating them is the single easiest way to get confused about why a search behaved one way from your terminal and another way when Claude ran it.

This page exists to draw that line clearly.

## `.local-search.toml` — for the CLI engine

This file lives at `<cwd>/.local-search.toml` (or a parent directory — the tool walks up looking for it) and is read by the Go binary's own scope-resolution logic when you run `local-search scope set/init`. It's the CLI talking to itself: "when someone runs a scoped search from around here, which registered repos should that mean?"

You write it with:

```
local-search scope set repo1,repo2
local-search scope init          # auto-detects from CWD, no manual list needed
```

and it holds more than just a repo list — it can carry per-source **weights** (how much specs vs. graphify vs. code-review-graph nodes count toward a blended score) and **limits** (result caps, blast-radius depth for impact queries). It's the configuration file for the engine itself, and the engine's resolution order — `--scope` flag first, then this file walking up from CWD, then a global fallback at `~/.local-search/config.toml`, then a CWD-based guess — is deliberately strict about never silently fanning a query out across *every* repo you've ever registered. A missing scope is a hard stop, not a quiet "search everything."

## `.agent/local-search-config.yaml` — for the Claude Code skill

This one lives inside `<project>/.agent/` and is written and read by an entirely different consumer: the Claude Code skill. When Claude runs `local-search init` (or its alias `setup`) — usually because you asked it to "set up local search for this project" — it's managing this file, not the TOML one. The schema is intentionally tiny: a `repositories:` list, nothing else.

```yaml
# LocalSearch project scope — repositories searched when running from this project.
# Names must match `local-search repo list`. Managed by `local-search init`.
repositories:
  - product
  - platform
```

The skill reads this list and passes it along as `--scope repo1,repo2` when it drives searches on your behalf — so this file answers a narrower question than the TOML one: "when *Claude* searches from this project, which repos is it allowed to touch?" It's edited conversationally (`local-search init --add a,b`, `--remove a`, `--set a,b`) rather than by hand, and it validates every name against your actual repo registry before writing anything, so you can't end up with a config pointing at a repo that doesn't exist.

## Why two files instead of one

Because the two callers have genuinely different needs. The CLI's scope file is about engine-level query resolution — weights, limits, walk-up precedence, and a hard refusal to guess when scope is ambiguous. The skill's file is about giving an LLM agent a simple, legible, "here's what you're allowed to search" list that it can read and reason about without parsing TOML or understanding weight tuning. Merging them would mean either dragging engine internals into what's meant to be a conversational config, or stripping the engine's config down to something too thin for its own resolution logic. Two small, single-purpose files turned out simpler than one file trying to serve two jobs.

## The bigger picture: everything that's on disk

Beyond these two per-project files, there are two pieces of *global* state that both files ultimately point back to:

| File | Scope | Written by | Read by |
|---|---|---|---|
| `<cwd>/.local-search.toml` | per-project (walks up to nearest) | `local-search scope set` / `scope init` | The CLI engine, resolving `find`/scoped `search` queries |
| `<project>/.agent/local-search-config.yaml` | per-project | `local-search init` / `setup` (the Claude Code skill) | The Claude Code skill, before it drives `local-search` on your behalf |
| `~/.local-search/repos` | global | `local-search repo add/remove` | The CLI, to know which repos exist at all (`repo_name\|/absolute/path` per line) |
| `~/.local-search/specs.db` | global | Every scan (`repo add`, `scan`, incremental updates) | Every search/list/read command — the cache described in [the-disposable-index.md](the-disposable-index.md) |

Notice the direction of dependency: both scope files *reference* repo names, and those names only mean something because they're registered in `~/.local-search/repos`. Delete a repo from the registry and both scope files will start complaining about an "unknown repo" the next time they're touched — a small, deliberate safety check rather than a silent dangling reference.

## See also

- [the-disposable-index.md](the-disposable-index.md) for why `specs.db` doesn't belong in this same "handle with care" category
- [../how-to/](../how-to/) for the step-by-step of scoping a project or setting up the skill
- [../reference/](../reference/) for the full `scope` and `init` command syntax
