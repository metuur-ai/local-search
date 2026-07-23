# Local Search User Guide

Welcome! Local Search is a fast, fully offline search engine for the markdown
specs, design docs, and notes scattered across your repositories. One small Go
binary indexes everything into a local SQLite cache, and from there you can
search it three ways: from the command line, from a friendly web console, or
straight from Claude Code via a skill. No cloud, no API keys, no waiting.

This guide follows the [Diátaxis](https://diataxis.fr/) framework — four kinds
of documentation for four kinds of moments. Pick the door that matches yours.

## 🧑‍🎓 Tutorials — *"I'm new here, show me around"*

Guided, guaranteed-to-work walkthroughs. Start here on day one.

- [Getting started](tutorials/getting-started.md) — install the CLI, index your
  first repo, run your first search, and read a result. About ten minutes.
- [Your first web search](tutorials/first-web-search.md) — launch the
  Local-Search Console, compare **Graph only · fast** and **AI Answer** modes,
  and poke around the inspector tabs.

## 🧰 How-to guides — *"I know the basics, help me do X"*

Task-shaped recipes for everyday work.

- [Manage your repos](how-to/manage-repos.md) — add, remove, skip directories,
  and force rebuilds.
- [Search like a pro](how-to/search-like-a-pro.md) — query syntax, source and
  ranking flags, semantic mode, and discovery commands.
- [Scope a project](how-to/scope-a-project.md) — pin searches to the repos a
  project actually cares about.
- [Index images and PDFs](how-to/index-images-and-pdfs.md) — the markdown
  sidecar pattern.
- [Automate scanning](how-to/automate-scanning.md) — keep the index fresh with
  `scan-hooks` (git hooks or shell hooks).
- [Use the Claude Code skill](how-to/use-the-claude-skill.md) — let Claude
  search your specs for you.
- [Run the web UI](how-to/run-the-web-ui.md) — the working ways to start,
  stop, and monitor the console.

## 💡 Explanation — *"Wait, how does this actually work?"*

Background reading for the curious. No steps, just understanding.

- [How search works](explanation/how-search-works.md) — FTS5, BM25, the
  no-model semantic embedder, rank fusion, and graph-aware ranking.
- [The disposable index](explanation/the-disposable-index.md) — why deleting
  `specs.db` is always safe.
- [Two config files](explanation/two-config-files.md) — `.local-search.toml`
  vs `.agent/local-search-config.yaml`, and who reads what.
- [CLI and web, together](explanation/cli-and-web-together.md) — how the
  console is a thin, private layer over the same binary.

## 📚 Reference — *"Just give me the exact flags"*

Complete, source-verified lookup material.

- [CLI commands](reference/cli-commands.md) — every command, flag, and the
  query syntax, with examples.
- [Configuration](reference/configuration.md) — every file, path, and
  environment variable.
- [Web UI reference](reference/web-ui-reference.md) — screens, controls, HTTP
  API, SSE events, and error codes.
- [Troubleshooting](reference/troubleshooting.md) — symptom → cause → fix,
  including the known `local-search ui` startup issue.

---

> **Tip:** Not sure where to begin? If Local Search isn't installed yet, take
> the [getting started tutorial](tutorials/getting-started.md). If something
> just broke, go straight to
> [troubleshooting](reference/troubleshooting.md). Everything else is a search
> away — fittingly.

*Verified against Local Search v0.3.1.*
