---
name: local-search
description: >
  Use this skill whenever someone asks a question that could be answered or informed
  by project specs, requirements, or documentation. This includes direct spec requests
  ('find the spec for X', 'search our docs', 'what specs do we have', 'check the
  requirements for Y', 'look up the docs on Z'), analytical questions where specs
  contain the answer ('what is the impact of changing X', 'how does our Y flow work',
  'what happens if Z'), and setup tasks (adding repos, scanning, troubleshooting the
  index). Also trigger when the user wants to configure, initialize, or set up which
  repositories this project searches ('set up local search', 'init local search scope',
  'which repos does this project search', 'add/remove a repo from my search scope') —
  managed via `local-search init`/`setup` and the `.agent/localsearch-config.yaml` file.
  Trigger this skill even if the user doesn't say "spec" explicitly — if their
  question touches a domain that might be documented in spec files (.md, .mdx, .txt),
  search first. Also use when the user says 'what do our docs say about', 'is there
  a spec for', 'check the requirements', 'look up', or asks about any business process,
  product rule, API contract, or architectural decision that could be documented.
  Search first, answer grounded in results. Do NOT answer from general knowledge when
  spec content is available.
---

# Local Search

A CLI tool that indexes `.md`, `.mdx`, and `.txt` spec files across multiple repos and provides instant full-text search. Powered by SQLite FTS5. Single Go binary, zero runtime dependencies.

## Prerequisites

The `local-search` command must be on your PATH. Build from source:

```bash
cd local-doc-tool/code
go build -o local-search .
cp local-search /usr/local/bin/local-search
```

Requires Go 1.21+ to build. No runtime dependencies — SQLite is compiled in.

## Project search scope (`.agent/localsearch-config.yaml`)

Each project declares which registered repositories LocalSearch includes, via
`<project>/.agent/localsearch-config.yaml`. **Before searching from a project,
read its scope from this file and pass it to every search** so results stay inside
the project's boundary:

1. Read scope: `local-search init --json` (creates the file if missing) → returns
   `{ path, exists, empty, repositories, available, unknown }`.
2. If `repositories` is non-empty, pass them to every search — note the flag differs
   per command:
   - `local-search search "auth" --repos repoA,repoB`
   - `local-search find "auth" --scope repoA,repoB` (also `code`)
   Both take a comma-separated list.
3. If the file is missing or `empty`, offer to set it up (below), or fall back to a
   one-off unscoped `local-search search "..."`.

### Configuring scope interactively (`local-search init` / `setup`)

`init` and `setup` are identical. **You (the skill) run the conversation** — the CLI
only exposes non-interactive primitives. Drive it with `AskUserQuestion`:

1. `local-search init --json` — read current state (creates the file if absent).
2. Branch on the state:
   - **Empty / just created** → show `available` repos, ask which to include, then
     `local-search init --set repoA,repoB`.
   - **Has repositories** → show the current list and offer:
     - **Add** → `local-search init --add repoC`
     - **Remove** → `local-search init --remove repoA`
     - **Modify** an entry → `local-search init --remove old` then `--add new`
       (or `--set` the whole new list)
     - **Review** → re-run `local-search init --json` and show the list
     - **Done** → stop
3. Only registered repos are accepted — `--add`/`--set` reject unknown names and list
   the valid ones. Add an external graph as a `graph:<name>` entry.

Never hand-edit the YAML for the user — always go through `local-search init`.

## Core workflow: search, read, reason

When a user asks ANY question that might be answered by specs, follow this pipeline. Specs are the authoritative source of truth for the project — answering from general knowledge when spec content exists risks contradicting what the team has actually agreed on.

### Step 1: Extract search terms

Break the user's question into 1-3 search queries. Focus on domain nouns, not verbs or filler words — FTS5 indexes words, and common verbs like "changing" or "adding" are noise that dilute relevance ranking.

| User asks | Search queries to run |
|---|---|
| "What's the impact of adding a new rule to payment eligibility?" | `local-search search "payment eligibility"` then `local-search search "refund"` |
| "How does our signup flow work?" | `local-search search "signup"` |
| "What are the deployment requirements?" | `local-search search "deployment"` then `local-search search "infrastructure"` |
| "Can international customers get refunds?" | `local-search search "refund international"` then `local-search search "refund eligibility"` |
| "What APIs need auth tokens?" | `local-search search "authentication" platform` |

Tips for extracting good queries:
- Use domain nouns: "payment eligibility" not "what is the impact of changing"
- Use OR for broader coverage: `local-search search "refund OR chargeback"`
- Use NOT to filter noise: `local-search search "billing NOT invoice"`
- Scope to a repo when you know which one: `local-search search "auth" platform`
- Run 2-3 searches if the question spans multiple domains
- FTS5 supports stemming: "refunding" matches "refund" automatically

### Step 2: Read the matched specs

For each relevant result from Step 1, read the full content:

```bash
local-search read refund
local-search read deployment
```

Read the top 2-4 matches. More than that floods your context with noise — BM25 ranking puts the most relevant first, so the tail is rarely useful.

For agent pipelines, use JSON output:

```bash
local-search json read refund
```

### Step 3: Reason over the spec content

Answer the user's question using what you found.

**Ground every claim.** Specs are what the team agreed on. If the spec says "refunds must be within 30 days", say exactly that. Hallucinating or paraphrasing loosely can lead users to act on wrong information.

**Cite your sources.** Name the spec file that informed each part of your answer: "According to the refund flow spec (payments/refund.md), eligibility requires..."

**Flag gaps explicitly.** If the specs don't cover part of the question, say so: "The current specs don't address [X]. This may need a new spec or an update to an existing one." This is more valuable than guessing — it surfaces documentation debt.

**Connect dots across specs.** If the question touches multiple specs, synthesize: "The refund spec requires [X], but the chargeback spec assumes [Y] — changing eligibility would affect both."

**Suggest next steps.** After answering, point to related specs: "You might also want to review: `local-search related refund`"

### Full example

User: "What's the impact of adding a new rule to the payment eligibility?"

**You run:**
1. `local-search search "payment eligibility"`
2. `local-search search "refund"`
3. `local-search read refund`
4. `local-search read chargeback`
5. `local-search related refund`

**You answer:**

Based on the refund flow spec (payments/refund.md), the current eligibility rules are: within 30 days, item not used, original payment method available. Partial refunds require manager approval.

Adding a new eligibility rule would impact:
- The support team's 24-hour review process (step 2 in the refund flow)
- The chargeback handling spec (payments/chargeback.md) — chargebacks that fail the new rule would need updated evidence packages
- Edge cases: international refunds (up to 10 business days) and gift card purchases (refunded as store credit) have separate paths that may also need the new rule applied

The specs don't currently cover how eligibility changes are rolled out or communicated to customers. That might need a new spec.

Related specs to review: payments/chargeback, billing/invoices.

### When NOT to search

- Pure setup questions: "how do I add a repo" — answer from the command reference below
- Questions clearly outside any documented domain — answer from general knowledge, note that no specs were found
- The user explicitly asks you not to check specs ("from your general knowledge", "don't check the docs")
- Follow-ups where you already have the spec content loaded from a previous step

## Setup (helping users get started)

```bash
local-search repo add /path/to/specs my-project   # auto-scans immediately
local-search repo add /path/to/docs docs --skip-directory .skills   # skip folder by name
local-search search "payment refund"              # ready to use
```

The index auto-rebuilds when repos are added/removed and auto-detects when files change on next search. No manual scan needed.

## Essential commands

### Search
```bash
local-search search "payment refund"              # keyword
local-search search "refund OR chargeback"        # boolean OR
local-search search "billing NOT fraud"           # exclude
local-search search refunding                     # stemming: matches "refund"
local-search search "payment" --repo platform     # filter by repo
local-search search "webhook" --directory billing/             # focus to directory
local-search search "event" --repo backend --directory integrations/  # combine both
local-search search "refund" --exclude-location deprecated/   # exclude path pattern
```

Results display the **full path** of each matching file.

### Read
```bash
local-search read refund-flow                     # full content
local-search read refund-flow platform            # from specific repo
local-search read config backend --directory src/ # from specific repo and directory
```

### Browse
```bash
local-search list                              # all specs, all repos
local-search list platform                    # one repo
local-search projects                         # all projects
local-search tags                             # all tags
local-search related refund-flow              # related specs
local-search recent 20                        # recently modified
```

### Repos
```bash
local-search repo add ./specs product                              # register + auto-scan
local-search repo add ./docs docs --skip-directory .skills         # skip folder by name
local-search repo add ./code backend --skip-directory vendor --skip-directory .git
local-search repo remove product                                   # unregister + rebuild
local-search repo list                                             # show all repos
```

`--skip-directory` takes a folder **name** (not a path). It's repeatable and persisted — future scans will also skip it. Matching is exact: `.skills` won't skip `.skills-old`.

### JSON (agent pipelines)
```bash
local-search json search "payment" platform   # ranked results
local-search json read refund-flow            # full content as JSON
local-search json list platform               # listing
local-search json repos                       # all repos + counts
```

## References (load on demand)

For detailed documentation beyond what's above, read these files:

- `resources/commands.md` — Full command reference with all options, output examples, and edge cases
- `resources/troubleshooting.md` — Common problems, fixes, auto-rebuild behavior, file locations
- `resources/spec-format.md` — How to write spec files, YAML frontmatter, folder structure, indexing details
