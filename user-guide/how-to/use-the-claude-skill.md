# Use the Claude skill

Local Search ships a Claude Code skill so Claude can search your specs on your behalf, without you having to type `local-search` commands yourself. This guide is about installing it and understanding what it does once it's there.

## Before you start

You'll need `local-search` on your PATH. If you installed via the bundled `install.sh`, the skill is likely already installed — this guide covers both that default path and installing/reinstalling it yourself.

## Install it globally (the default)

```bash
$ local-search install-skill
Installed local-search skill (4 files) → /Users/you/.claude/skills/local-search
Claude Code discovers skills under /Users/you/.claude/skills
```

`--global`/`-g` is the default, so a bare `install-skill` is enough — it's identical to `install.sh`'s own skill step, just runnable on its own.

## Install it into just this project instead

```bash
local-search install-skill --local
```

This lands the skill at `./.claude/skills/local-search` instead — use it when you want the skill available only inside one project's Claude Code session, rather than globally for every project.

## Install somewhere custom

```bash
local-search install-skill --dir /path/to/skills
```

## Reinstalling / updating

Installing over an existing skill is refused by default, so you don't silently clobber a version you might have customized:

```bash
$ local-search install-skill
Error: skill already installed at /Users/you/.claude/skills/local-search (use --force to overwrite)
```

Add `--force`/`-f` when you actually want to overwrite it — for example, after upgrading `local-search` and wanting the newest bundled skill content:

```bash
local-search install-skill --force
```

## What the skill actually does

Once installed, Claude reads the skill's instructions whenever a question looks like it could be answered by your specs — "what's our refund policy," "is there a spec for X," "set up local search for this project," and similar. From there:

1. **It reads your project's search scope** from `.agent/local-search-config.yaml` (creating it via `local-search init --json` if it doesn't exist yet) — this keeps Claude's searches inside the repos you've scoped for this project, rather than fanning out across everything you've ever registered. See [scope-a-project.md](scope-a-project.md) for how that file gets written.
2. **It drives `local-search` through its JSON output**, not the human-readable one — commands like `local-search json search <query>`, `local-search json read <name>`, and `local-search json related <name>` return structured data that's easy for the skill to parse and reason over, while you keep seeing normal formatted output whenever you run `local-search` yourself in a terminal.
3. **It offers to configure scope conversationally** — asking "set up local search for this project" leads Claude to drive `local-search init --add/--remove/--set` on your behalf, rather than you hand-editing YAML.

You don't need to invoke any of this directly; it's what happens automatically once the skill is installed and Claude Code picks it up for a session.

## Done-check

- The skill directory exists and has content: `ls ~/.claude/skills/local-search` (or your `--local`/`--dir` target) shows `SKILL.md` plus a `resources/` folder.
- Ask Claude something spec-shaped in a project with local-search set up (e.g. "what does our refund spec say?") and it should search before answering, rather than answering from general knowledge.

## See also

- [scope-a-project.md](scope-a-project.md) — the `.agent/local-search-config.yaml` file the skill reads before every search
- [../reference/cli-commands.md](../reference/cli-commands.md) — the full `install-skill` flag reference, and the `json` subcommands the skill relies on
