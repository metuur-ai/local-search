# local-search

A fast, offline spec registry that searches your project documentation across multiple repos. Single Go binary, no runtime dependencies.

## Why

Teams store specs as markdown files scattered across repos. Finding the right spec means grepping, scrolling, or asking someone. MCP servers add latency and complexity. `local-search` gives you instant full-text search across all your spec repos with a 3-word command.

## Install

### One command (recommended)

Installs the **CLI**, the **Claude Code skill**, and the local **web UI** in one shot:

```bash
curl -fsSL https://raw.githubusercontent.com/metuur-ai/local-search/main/install.sh | bash
```

It pulls the latest release bundle and installs:

- `local-search` → `~/.local/bin` (the CLI)
- the Claude skill → `~/.claude/skills/local-search`
- the web UI + `local-search-ui` launcher → `~/.local/share/local-search/web`

The web UI needs Node ≥ 18; if `node` is missing it's skipped with a warning and the CLI + skill still install. Override locations or skip components with env vars (`INSTALL_DIR`, `SKILLS_DIR`, `WEB_DIR`, `INSTALL_WEB=0`, `INSTALL_SKILLS=0`) — see [`install.sh`](install.sh).

### Download a release archive (offline, everything included)

Prefer downloading over `curl | bash`? Grab **`local-search-<version>.zip`** from the
[latest release](https://github.com/metuur-ai/local-search/releases/latest) — it's
self-contained (all platform binaries + the prebuilt web UI + `install.sh`), so it
installs with no build step:

```bash
unzip local-search-<version>.zip
cd local-search-<version>
./install.sh
```

> Don't use GitHub's auto-generated **"Source code (zip)"** asset — it omits the
> prebuilt `frontend/dist`, so the web UI 404s. Use `local-search-<version>.zip`
> (or `local-search-bundle.tar.gz`) instead.

### Pre-built binary (CLI only)

Grab a single binary for your platform from the [latest release](https://github.com/metuur-ai/local-search/releases/latest):

```bash
# macOS Apple Silicon
curl -fsSL https://github.com/metuur-ai/local-search/releases/latest/download/local-search-mac-silicon-darwin-arm64 -o /usr/local/bin/local-search
chmod +x /usr/local/bin/local-search

# macOS Intel      → local-search-darwin-amd64
# Linux  amd64     → local-search-linux-amd64
# Linux  arm64     → local-search-linux-arm64
# Windows amd64    → local-search-windows-amd64.exe
```

### Build from source

```bash
git clone https://github.com/metuur-ai/local-search.git
cd local-search/cli
go build -o local-search .
cp local-search /usr/local/bin/local-search
```

Requirements: Go 1.25+ to build. No runtime dependencies — SQLite is compiled in via `modernc.org/sqlite` (pure Go, no CGO, no C toolchain needed).

## Quick start

```bash
# 1. Register your spec folders (auto-scans immediately)
local-search repo add ./product-specs product
local-search repo add ./platform-docs platform

# 2. Search — no manual scan needed, it just works
local-search search refund
```

The index auto-rebuilds when you add/remove repos, and auto-detects when files change on your next search.

## Example output

### Search

```
$ local-search search refund

Results for "refund":

  1. [product] payments/refund  (.md)
     Refund flow
     tags: billing, refund, customer, payments
```

### Search across multiple repos

```
$ local-search search "refund OR authentication"

Results for "refund OR authentication":

  1. [product] payments/refund  (.md)
     Refund flow
     tags: billing, refund, customer, payments

  2. [platform] api/authentication  (.mdx)
     Authentication API
     tags: auth, security, api, tokens
```

### Stemming — "refunding" finds "refund"

```
$ local-search search refunding

Results for "refunding":

  1. [product] payments/refund  (.md)
     Refund flow
     tags: billing, refund, customer, payments
```

### Exclude terms with NOT

```
$ local-search search "billing NOT fraud"

Results for "billing NOT fraud":

  1. [product] billing/invoices  (.md)
     Invoice generation
     tags: billing, invoices, payments, accounting

  2. [product] payments/refund  (.md)
     Refund flow
     tags: billing, refund, customer, payments
```

### Deep content search — finds words inside files, not just titles

```
$ local-search search webhook

Results for "webhook":

  1. [product] payments/chargeback  (.md)
     Chargeback handling
     tags: disputes, chargeback, fraud
```

### Filter by repo

```
$ local-search search "billing" --repo product

Results for "billing":
(filtered to repo: product)

  1. [product] billing/invoices  (.md)
     Invoice generation
     tags: billing, invoices, payments, accounting

  2. [product] payments/refund  (.md)
     Refund flow
     tags: billing, refund, customer, payments
```

### Exclude paths

```
$ local-search search "billing" --exclude-location archived

Results for "billing":

  1. [product] billing/invoices  (.md)
     Invoice generation
     tags: billing, invoices, payments, accounting
```

### List all specs

```
$ local-search list

All specs:

  [platform]
    api/authentication.mdx — Authentication API
    architecture/database.txt — database

  [product]
    billing/invoices.md — Invoice generation
    onboarding/signup.md — Signup flow
    payments/chargeback.md — Chargeback handling
    payments/refund.md — Refund flow
```

### List one repo

```
$ local-search list platform

Specs in repo "platform":

  api/
    authentication.mdx — Authentication API
  architecture/
    database.txt — database
```

### Browse projects

```
$ local-search projects

Projects:

  [platform] api (1 specs)
  [platform] architecture (1 specs)
  [product] billing (1 specs)
  [product] onboarding (1 specs)
  [product] payments (2 specs)
```

### Tags

```
$ local-search tags

All tags:

  payments (2)
  billing (2)
  user (1)
  tokens (1)
  security (1)
  registration (1)
  refund (1)
  ...
```

### Stats

```
$ local-search stats

Local Doc Stats

  Repos:          2
  Total specs:    6
  Projects:       5
  Unique tags:    16
  Total size:     2384 bytes
  File types:     md,mdx,txt,jpg,pdf
  Database:       56K
  Last scan:      2026-03-15 00:48:12

  Per repo:
    platform: 2 specs
    product: 4 specs
```

### JSON output for agents

```
$ local-search json search "billing OR security"

[
  {
    "repo": "platform",
    "project": "api",
    "name": "authentication",
    "title": "Authentication API",
    "tags": "auth, security, api, tokens",
    "path": "api/authentication.mdx",
    "ext": "mdx",
    "relevance": -1.71
  },
  {
    "repo": "product",
    "project": "billing",
    "name": "invoices",
    "title": "Invoice generation",
    "tags": "billing, invoices, payments, accounting",
    "path": "billing/invoices.md",
    "ext": "md",
    "relevance": -0.95
  }
]
```

```
$ local-search json repos

[
  {"repo": "platform", "path": "/path/to/platform-docs", "spec_count": 2},
  {"repo": "product",  "path": "/path/to/product-specs",  "spec_count": 4}
]
```

```
$ local-search json read chargeback

{
  "path": "/path/to/product-specs/payments/chargeback.md",
  "content": "---\ntags: disputes, chargeback, fraud\n---\n\n# Chargeback handling\n\nProcess for managing payment chargebacks and disputes.\n..."
}
```

## Multi-repo support

Register as many repos as you need. Each gets a name for easy filtering.

```bash
local-search repo add ./frontend-specs frontend
local-search repo add ./backend-specs backend
local-search repo add ./shared-docs shared

local-search repo list           # See all repos
local-search search auth         # Search across all
local-search search auth --repo backend  # Search one repo
local-search list frontend       # Browse one repo
```

## Supported file types

### Text files (indexed directly)

- `.md` — Markdown
- `.mdx` — MDX (Markdown + JSX)
- `.txt` — Plain text

### Visual / document files (require a companion `.md`)

- `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg` — Images
- `.pdf` — PDF documents

## Spec format

Any repo structure works. The tool recursively scans for `.md`, `.mdx`, `.txt`, and visual/document files. You don't need to reorganize anything.

```
# All of these work — flat, nested, monorepo, whatever
my-project/
  src/docs/api.md             ← indexed
  README.md                   ← indexed
  payments/refund.md          ← indexed
  deep/nested/folder/spec.txt ← indexed
  diagrams/architecture.png   ← indexed via companion .md (see below)
  reports/q1.pdf              ← indexed via companion .md (see below)
  app.ts                      ← ignored (not a supported type)
```

Optional YAML frontmatter adds tags:

```markdown
---
tags: billing, refund, customer
---

# Refund flow
...
```

## Images and PDFs — companion `.md` pattern

Images and PDF files are supported via a **companion `.md` sidecar file**. The sidecar must have the exact same base name in the same directory:

```
diagrams/
  architecture.png        ← the visual asset
  architecture.md         ← companion sidecar (required)

reports/
  q1-summary.pdf          ← the document
  q1-summary.md           ← companion sidecar (required)
```

The sidecar `.md` provides the **content that gets indexed** (title, tags, description, context). The search result's path points to the actual image or PDF so AI agents can open it directly.

**If no companion `.md` exists**, the image/PDF is skipped and a warning is printed:

```text
Warning: /path/to/diagram.png — skipped (no companion .md with metadata)
```

**Example sidecar** (`architecture.md`):

```markdown
---
tags: architecture, database, infrastructure
---

# System Architecture Diagram

Overview of the platform's three-tier architecture. Shows the relationship
between the web layer, API layer, and database cluster. Use this diagram
when explaining deployment topology or onboarding new engineers.
```

**Search result** — only one entry per image/PDF, path points to the asset:

```text
$ local-search search architecture

Results for "architecture":

  1. [platform] diagrams/architecture  (.png)
     System Architecture Diagram
     tags: architecture, database, infrastructure
     /path/to/diagrams/architecture.png
```

The `.md` sidecar is not indexed as a separate record — it only serves as metadata for its companion asset.

## Full command reference

### Repo management
```bash
local-search repo add <folder> [name]   # Add a repo (auto-scans)
local-search repo remove <name>         # Remove a repo (auto-rebuilds)
local-search repo list                  # List all repos
```

Aliases: `repo rm` = `repo remove`, `repo ls` = `repo list`

### Searching
```bash
local-search search <query>                            # Keyword search, all repos
local-search search refunding                          # Stemming (matches "refund")
local-search search "refund OR signup"                 # Boolean OR
local-search search "billing NOT fraud"                # Exclude terms
local-search search "payment*"                         # Prefix match
local-search search '"refund request"'                 # Exact phrase
local-search search refund --repo my-repo              # Filter by repo (named flag)
local-search search refund my-repo                     # Filter by repo (positional, legacy)
local-search search refund --exclude-location archived # Exclude paths containing pattern
```

`--exclude-location` can be repeated to exclude multiple path patterns:
```bash
local-search search billing --exclude-location archived --exclude-location deprecated
```

### Browsing
```bash
local-search list                       # All specs, grouped by repo
local-search list <repo-or-project>     # Filter by repo or project name
local-search projects                   # All projects with spec counts
local-search tags                       # All tags with usage counts
local-search tags <tag>                 # Specs with a specific tag
local-search recent                     # Recently modified (default 10)
local-search recent <n>                 # Recently modified, limit n
local-search related <name>             # Find related specs by tags/title
```

### Reading
```bash
local-search read <name>                # Print full spec content
local-search read <name> <repo>         # From specific repo
```

### JSON output (for agents)
```bash
local-search json search <query>            # Ranked results
local-search json search <query> <repo>     # Filter by repo
local-search json read <name>               # Full content
local-search json read <name> <repo>        # From specific repo
local-search json list                      # All specs
local-search json list <repo-or-project>    # Filter listing
local-search json repos                     # All repos + counts
local-search json related <name>            # Related specs
local-search json tags                      # All tags
local-search json stats                     # Stats
```

### Maintenance
```bash
local-search scan                       # Force full rebuild, all repos
local-search scan <repo>                # Rebuild one repo
local-search stats                      # Index statistics
local-search db                         # Print database file path
local-search inspect                    # Dump full index
local-search reset                      # Delete everything (prompts for confirmation)
local-search --version                  # Print version
```

### Knowledge graph export (for a self-hosted viewer)
```bash
local-search graph export <repo> [--out graph.json]        # One repo → node-link JSON
local-search graph export-view --repos a,b [--out graph.json]  # Merge several repos → one file
local-search graph export-view --all                       # Merge every registered repo
local-search graph export-view                             # Interactive: pick repos in a terminal
```

`graph export-view` merges multiple repos' graphs into one viewer-ready
`{nodes, links}` file (default `graph.json`), namespacing node ids by repo
(`<repo>:<id>`) so they can't collide. Run with no `--repos`/`--all` in a
terminal to pick from a numbered list; pass the flags for scripts/CI. Output is
deterministic (byte-identical across runs). See
[`user-guide/reference/cli-commands.md`](user-guide/reference/cli-commands.md#graph-export-view---repos-ab----all---edges-autovectortagsnodes---out-file)
for details.

### Command aliases

| Alias | Full command |
|---|---|
| `s`, `find`, `f` | `search` |
| `r`, `get`, `show` | `read` |
| `ls` | `list` |
| `p` | `projects` |
| `rel` | `related` |
| `t` | `tags` |
| `j` | `json` |
| `rebuild`, `index` | `scan` |
| `dump`, `debug` | `inspect` |

## Web UI

An optional browser UI for explainable search. `local-search ui` starts the web
server as a background daemon and opens your browser; `ui stop` kills it.

```bash
local-search ui                         # Start daemon (port 8787) and open the browser
local-search ui --port 9000             # Start on a specific port
local-search ui status                  # Show whether the UI is running
local-search ui stop                    # Stop the daemon
```

**Prerequisites:**

- [Node.js](https://nodejs.org) on your `PATH` (the server is Node; the CLI only launches it).
- The frontend must be built once:
  ```bash
  cd web/frontend && npm install && npm run build
  ```

**How it works:**

- The command finds the repo's `web/` folder by walking up from the binary and
  the current directory looking for `web/backend/bin/serve.js`. Run it from
  inside the repo, or set `LOCAL_SEARCH_WEB_DIR` to the path of the `web/` folder
  if you launch the installed binary from elsewhere.
- The server is spawned detached (its own process group) so it survives the
  command exiting. `ui start` waits for `GET /api/health` before opening the
  browser; if the server isn't healthy within 6s it prints the log path instead.
- `ui stop` kills the whole process group, so the Node server and any
  `local-search` subprocesses it spawned are terminated together.
- Running `ui` again while it's already up just re-opens the browser.

**Runtime files:**

| File | Purpose |
|---|---|
| `~/.local-search/ui.pid` | PID + port of the running daemon (removed on stop) |
| `~/.local-search/ui.log` | Server stdout/stderr (truncated on each start) |

## Search features

| Feature | Example | Description |
|---|---|---|
| Stemming | `search refunding` | Matches "refund", "refunds", "refunding" |
| BM25 ranking | any search | Most relevant results first |
| Boolean OR | `search "refund OR chargeback"` | Either term |
| Boolean NOT | `search "billing NOT fraud"` | Exclude terms |
| Prefix | `search "payment*"` | Words starting with prefix |
| Phrase | `search '"refund request"'` | Exact phrase match |
| Deep content | `search webhook` | Searches full file content |
| Cross-repo | `search auth` | Searches all registered repos |
| Repo filter | `search auth backend` | Limit to one repo |

## Change detection

`local-search` automatically detects file changes before every query. It uses two strategies depending on whether your repo is a git repository.

### Git repos (default)

When a registered repo has git initialized, `local-search` uses git to detect changes. This is faster and smarter than filesystem scanning — git already knows exactly what changed.

**How it works:**

1. On the first full scan (`local-search scan` or `repo add`), the current `HEAD` commit hash is stored in the database
2. On every subsequent query, the tool compares the stored commit against the current `HEAD`
3. If commits differ, it asks git for the exact list of changed spec and media files
4. It also checks for uncommitted changes (staged, unstaged, and untracked files)
5. Only the changed files are re-indexed — no full rebuild needed

**What gets detected:**

| Change type | Detected? | How |
|---|---|---|
| New commits (pushed or local) | Yes | `git diff --name-only <old>..<new>` |
| Edited but uncommitted files | Yes | `git diff --name-only` |
| Staged files | Yes | `git diff --cached --name-only` |
| New untracked spec/media files | Yes | `git ls-files --others --exclude-standard` |
| Deleted files | Yes | Removed from the index automatically |
| Files in `.gitignore` | No | Ignored, same as git |

**Incremental updates** mean that if you edited 2 files out of 500, only those 2 get re-indexed. The rest of the index stays untouched.

```
$ local-search search refund
(product: git changes detected — incremental update...)

  product: 2 files updated (incremental)

Results for "refund":
  ...
```

### Non-git repos (fallback)

When a registered repo is **not** a git repository, `local-search` falls back to filesystem timestamp comparison using `find -newer`. If any spec file has a modification time newer than the database file, a full rebuild is triggered.

This works reliably but is less efficient — it can't tell which files changed, so it rebuilds the entire index.

### Auto-rebuild triggers

| Event | Git repo | Non-git repo |
|---|---|---|
| `repo add` | Full scan + store commit hash | Full scan |
| `repo remove` | Full rescan remaining repos | Full rescan remaining repos |
| New commits since last query | Incremental update (changed files only) | N/A |
| Uncommitted/staged edits | Incremental update | Full rebuild |
| New untracked spec files | Incremental update | Full rebuild |
| Deleted spec files | Removed from index | Full rebuild |
| No changes at all | Skipped (zero cost) | Skipped (zero cost) |
| `local-search scan` | Full rebuild + store commit hash | Full rebuild |

You never have to think about the index.

## How it works

1. Your files (`.md`, `.mdx`, `.txt`, images, PDFs) are always the **source of truth**
2. `local-search` reads them and builds a SQLite FTS5 index
3. For images and PDFs, the companion `.md` sidecar is what gets indexed; the asset path is stored so agents can open it
4. The `.db` file is a **disposable cache** at `~/.local-search/specs.db`
5. Searches use Porter stemming + BM25 ranking
6. Delete the `.db` anytime — it auto-rebuilds on next use
7. For git repos, commit hashes are stored in the database to enable incremental updates

## Performance

| Operation | Speed |
|---|---|
| Search | ~30ms |
| Boolean search | ~30ms |
| Read spec | ~50ms |
| JSON search | ~70ms |

CPU at rest: zero. Memory at rest: zero. Disk: one small `.db` file.

## Troubleshooting

### Common issues

| Problem | Fix |
|---|---|
| "No repos added yet" | `local-search repo add /path/to/specs` |
| Search returns nothing | Check `local-search repo list` — is the path correct? |
| Index seems stale | Should auto-rebuild. Force with `local-search scan` |
| Something is broken | `rm ~/.local-search/specs.db && local-search scan` |
| Nuclear reset | `local-search reset` |

### Git-related issues

| Problem | Fix |
|---|---|
| Git changes not detected | Make sure the repo has at least one commit. Bare `git init` with no commits won't have a `HEAD` to compare against |
| Incremental update missed a file | Run `local-search scan` to force a full rebuild. The git commit hash will be re-stored |
| "incremental update" on every query | You have uncommitted changes to spec files. Commit them or the tool will keep detecting them as dirty |
| Repo is git but using timestamp fallback | Check that `git` is on your `$PATH`. Run `git -C /path/to/repo status` to verify |
| Submodule or worktree repo not recognized | The tool checks for `.git` directory or runs `git rev-parse --git-dir`. Both submodules and worktrees are supported |

### Rebuilding from scratch

If anything feels off, the database is disposable:

```bash
# Option 1: delete and let it auto-rebuild on next query
rm ~/.local-search/specs.db

# Option 2: force rebuild now
local-search scan

# Option 3: nuclear — remove everything including repo registrations
local-search reset
```

### Verifying the index

```bash
# Check what's registered
local-search repo list

# See full index contents
local-search inspect

# Check stats (repo count, spec count, last scan time)
local-search stats
```

## FAQ

**Q: Do I need git installed for this to work?**
No. Git is optional. If a registered repo has git, the tool uses it for faster incremental updates. If not, it falls back to filesystem timestamp comparison. Both work automatically.

**Q: What happens if I add a non-git folder?**
It works the same as before — `find -newer` checks if any spec file was modified since the last scan. If so, the entire index is rebuilt.

**Q: Will it detect changes I haven't committed yet?**
Yes. For git repos, the tool checks committed changes (via `git diff`), staged changes (`git diff --cached`), unstaged edits (`git diff`), and new untracked files (`git ls-files --others`). Everything is covered.

**Q: How does incremental update differ from a full scan?**
A full scan (`local-search scan`) drops the entire database and re-indexes everything from scratch. An incremental update only touches the files that changed — deleting removed entries, updating modified ones, and adding new ones. The rest of the index stays untouched.

**Q: Can I mix git and non-git repos?**
Yes. Each repo is evaluated independently. You can have three git repos and two plain folders registered at the same time. Each uses the appropriate change detection strategy.

**Q: Does it respect `.gitignore`?**
For git repos, yes. Untracked file detection uses `git ls-files --others --exclude-standard`, which honors `.gitignore`. For non-git repos, all supported file types are indexed regardless.

**Q: What if I rebase, amend, or force-push?**
The tool stores the last scanned commit hash. If `HEAD` changes for any reason (rebase, amend, reset, force-push), it detects the difference and incrementally updates. If the old commit hash no longer exists in history, git's `diff` may fail gracefully and the tool falls back to treating all spec files as changed.

**Q: What if I switch branches?**
Switching branches changes `HEAD`, so the tool detects it and incrementally updates the index with the files that differ between the old and new branch. This happens automatically on your next query.

**Q: How much faster is git detection vs filesystem scanning?**
For large repos with thousands of files, git detection is significantly faster because `git diff` is O(changed files) while `find -newer` must stat every file. For small repos (< 100 files), the difference is negligible.

**Q: Can I force a full rebuild even if git is available?**
Yes. `local-search scan` always does a full rebuild regardless of git status. It also re-stores the current commit hash for future incremental updates.

**Q: Where is the commit hash stored?**
In the SQLite database's `meta` table, keyed as `git_commit_<reponame>`. It's part of the disposable cache — deleting the `.db` file clears it, and the next full scan re-stores it.

## Claude Code skill

`local-search` ships with a custom Claude Code skill that teaches Claude how to search, read, and reason over your specs automatically. When the skill is active, Claude will search your specs before answering domain questions instead of relying on general knowledge.

### What the skill does

The skill gives Claude a three-step workflow:

1. **Extract search terms** from the user's question (domain nouns, not filler words)
2. **Read matched specs** — the top 2-4 results by relevance
3. **Reason over spec content** — ground every claim in what the specs actually say, cite sources, flag gaps

This means questions like "what's the impact of changing payment eligibility rules?" will trigger spec searches, read the relevant files, and produce answers grounded in your actual documentation.

### Installing the skill

The skill is **embedded in the `local-search` binary** — the one-command installer sets it up automatically. To (re)install it yourself:

```bash
# Writes the skill into ~/.claude/skills/local-search (or $SKILLS_DIR)
local-search install-skill
```

To pin it to a single project instead of installing globally:

```bash
local-search install-skill --local        # into ./.claude/skills
local-search install-skill --dir <path>   # into a specific skills directory
```

The skill file then lives at `.claude/skills/local-search/SKILL.md`. (Source: `cli/skilldata/local-search/`.)

### How Claude uses it

Once installed, Claude triggers the skill when it detects questions that could be answered by spec files. This includes:

| User asks | What Claude does |
|---|---|
| "Find the spec for refund" | Direct spec lookup — `search` then `read` |
| "What specs do we have about billing?" | Browse + search — `search "billing"`, `list` |
| "How does our signup flow work?" | Domain question — `search "signup"`, `read signup`, answer from content |
| "What's the impact of changing payment eligibility?" | Multi-spec analysis — searches multiple terms, reads top matches, synthesizes |
| "What happens if a chargeback is disputed?" | Cross-reference — `search "chargeback dispute"`, reads and connects related specs |
| "Add my docs folder as a repo" | Setup — runs `repo add` |

### Skill behavior rules

The skill enforces these behaviors on Claude:

- **Search first, answer second.** Claude will not answer domain questions from general knowledge when spec content is available.
- **Cite sources.** Every claim references the spec file it came from: "According to payments/refund.md, eligibility requires..."
- **Flag gaps.** If specs don't cover part of the question, Claude says so explicitly instead of guessing.
- **Connect across specs.** When a question spans multiple specs, Claude reads all relevant files and synthesizes.
- **Suggest related specs.** After answering, Claude points to related specs using `local-search related`.

### Search strategy examples

The skill teaches Claude how to extract good search queries from natural language:

```
User: "Can international customers get refunds?"
Claude runs:
  local-search search "refund international"
  local-search search "refund eligibility"
  local-search read refund

User: "What APIs need auth tokens?"
Claude runs:
  local-search search "authentication" platform
  local-search read authentication

User: "What's the difference between a refund and a chargeback?"
Claude runs:
  local-search search "refund OR chargeback"
  local-search read refund
  local-search read chargeback
```

### JSON mode for agent pipelines

The skill also supports JSON output for automated workflows:

```bash
local-search json search "refund"       # ranked results as JSON
local-search json read refund           # full content as JSON
local-search json list my-repo          # listing as JSON
local-search json repos                 # all repos + counts
```

### When the skill does NOT trigger

- Pure setup questions ("how do I add a repo") — Claude answers from the command reference
- Questions clearly outside any documented domain — Claude answers from general knowledge and notes no specs were found
- Follow-ups where spec content is already loaded from a previous step

### Customizing the skill

The skill file (`SKILL.md`) is plain markdown. You can edit it to:

- Add project-specific search strategies or domain terms
- Change the number of specs Claude reads per query
- Adjust the reasoning rules (e.g., always check a specific repo first)
- Add references to additional documentation files

The skill also supports on-demand reference loading. Detailed docs live in `references/` and are only read when needed:

```
references/
  commands.md          # Full command reference
  troubleshooting.md   # Common problems and fixes
  spec-format.md       # How to write spec files, frontmatter, folder structure
```

## File structure

```
~/.local-search/
  repos          # Text file: repo_name|/absolute/path (one per line)
  specs.db       # SQLite database (disposable cache)
  ui.pid         # PID + port of the running web UI daemon (see `local-search ui`)
  ui.log         # Web UI server log

local-search/
  cli/                          # Go CLI (module: local-search) — the shipped binary
    main.go                     # CLI entry point + repo management
    db/                         # schema.go, index.go, query.go — SQLite FTS5
    extract/                    # Metadata parsing: title, tags, summary, content
    git/                        # Git change detection
    graph/  find/  scope/  embed/  codegraph/
    skilldata/local-search/     # Claude Code skill, go:embed-ed into the binary
      SKILL.md
      resources/                # commands.md, troubleshooting.md, spec-format.md
    Makefile                    # `build-all` cross-compiles into cli/dist/
  web/                          # Companion web UI — started by `local-search ui`
    backend/                    # Node server (bin/serve.js)
    frontend/                   # Preact UI; `npm run build` → frontend/dist/
  docs/                         # HLD / LLD / EARS / tasks specs + guides/
  examples/                     # Sample spec repos for testing
  legacy/local-search.sh        # Original pure-bash prototype (not shipped)
  scripts/build-bundle.sh       # Assembles the release tarball into dist/
  install.sh                    # `curl | bash` entrypoint (checkout + bundle installer)
```

## License

MIT
