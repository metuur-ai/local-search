# Every command, explained

Every user-facing `local-search` command, answered three ways:

- **What** — what the command actually does.
- **How** — the shape you type, with a real example.
- **Why** — the problem it exists to solve, and when to reach for it.

This is the *understanding* companion to
**[cli-commands.md](cli-commands.md)**, which is the terse flag-and-signature
lookup. If you know which command you want and just need the flag, go there. If
you're deciding *which* command to run, stay here.

Verified against the `cli/` source at v0.4.0.

### The mental model

Four things exist, and almost every command touches exactly one of them:

| Thing | Lives at | Built by | Thrown away by |
|---|---|---|---|
| **Repo registry** — folders you told it about | `~/.local-search/repos` | `repo add` | `repo remove`, `reset` |
| **Index** — the searchable SQLite cache | `~/.local-search/specs.db` | `scan` | `reset` (safe to delete anytime) |
| **Project config** — which repos `find`/`code` AND the Claude skill consider | `<project>/.agent/local-search-config.yaml` (walks up) | `scope set` or `init` | `scope clear` |
| **Global config** — the fallback when no project config is found | `~/.local-search-config.yaml` | you, by hand | delete the file |

The index is disposable. Nothing you can do to `specs.db` loses data, because
every byte in it was derived from files still sitting on your disk. That single
fact is why so many commands below are safe to run without thinking.

### Which config governs which command

The sharpest edge in the CLI: **`search` does not read any config file.** It
takes `--repos`, defaulting to `all`. Only `find` and `code` resolve scope.

| Command | Repo selection | Default |
|---|---|---|
| `search` | `--repos a,b` | **all registered repos** |
| `find`, `code` | `--scope a,b`, else resolved scope | the resolved scope |

So this is consistent, not a bug:

```bash
$ local-search scope set payments   # .agent/local-search-config.yaml → payments
$ local-search find "refund"        # searches payments only
$ local-search search "refund"      # searches ALL registered repos
```

Engine scope resolution, highest precedence first:

1. `--scope` flag
2. `<project>/.agent/local-search-config.yaml`, walking up to root
3. `~/.local-search-config.yaml`
4. CWD walk-up — the deepest registered repo whose path encloses the CWD
5. **Hard error.** Fanning out across every repo by accident is refused by
   design: it "turns local-search into a noisy global tool."

Full details in [configuration.md](configuration.md) and
[one config file](../explanation/two-config-files.md).

### Contents

- [Getting set up](#getting-set-up) — `repo`, `scan`, `init`, `install-skill`
- [Searching](#searching) — `search`, `find`, `read`
- [Discovering](#discovering) — `list`, `projects`, `tags`, `recent`, `related`
- [Narrowing what gets searched](#narrowing-what-gets-searched) — `scope`
- [Config](#config) — `config show`, `validate`, `migrate`, `schema`
- [Knowledge graph](#knowledge-graph) — `graphs`, `graph`
- [Code graph](#code-graph) — `code`
- [Web UI](#web-ui) — `ui`
- [Health and maintenance](#health-and-maintenance) — `doctor`, `stats`, `size`, `db`, `inspect`, `reset`
- [Automation](#automation) — `scan-hooks`, `scan-hook-run`
- [Machine output](#machine-output-for-agents) — `json`
- [Meta](#meta) — `help`, `--version`
- [Alias table](#alias-table)

---

## Getting set up

### `repo add [folder] [name] [--skip-directory <name>]`

**What.** Registers a folder as a searchable repo and indexes it immediately.
There is no separate "now index it" step — registration and the first scan are
one operation. The scan is *surgical*: it indexes only the new repo and leaves
every other repo's rows untouched.

**How.**

```bash
$ local-search repo add ./docs my-project
Added repo "my-project" (/abs/path/to/docs)
Scanning…
  my-project: 42 files indexed
```

Run it with no folder and it infers the current directory (and its basename as
the name), then asks before committing to the guess:

```bash
$ cd ~/work/my-project
$ local-search repo add
Add the current directory as a repo?
  name: my-project
  path: /Users/you/work/my-project
Continue? [y/N]
```

Passing a folder explicitly skips the prompt. When stdin isn't a terminal — a
script, a CI job, a pipe — the inferred form *declines* rather than guess, and
tells you to pass the folder explicitly.

`--skip-directory <name>` (repeatable) excludes a subfolder by name. You usually
don't need it: every scan already honours the repo's `.gitignore` and
`.graphifyignore`, so `node_modules/`, `dist/`, and `graphify-out/` are excluded
for free. `repo add` prints which directories it's ignoring for that reason.

**Why.** This is the one command that has to exist — nothing else works until
Local Search knows where your specs are. Making the scan implicit removes the
single most common failure mode of index-backed tools: registering a source and
then wondering why nothing turns up, because you forgot the second step. The
non-interactive refusal exists for the same reason in reverse: a script that
silently registers whatever directory it happened to be standing in is a bug
waiting to happen.

### `repo list` (alias `repo ls`)

**What.** Prints every registered repo with its path, when it was added, when it
was last scanned, when its files last changed, the commit at last scan, and
whether it has a knowledge graph.

**How.**

```bash
$ local-search repo list
NAME                  ADDED  LAST SCAN  LAST UPDATE  COMMIT   GRAPH     PATH
uncle-os              4d     3d         9m           71588ba  —         /Users/you/uncle-os
squirrel              3d     3d         1d           18d1075  graphify  /Users/you/squirrel
```

**Why.** It's the answer to "what am I actually searching?" — the question
behind most surprising empty results. The `LAST SCAN` vs `LAST UPDATE` pair is
the useful part: when *update* is more recent than *scan*, that repo's results
are stale and you want a `scan`. The `GRAPH` column tells you which repos will
trigger graph-aware ranking under `--rank auto`.

### `repo remove <name>` (alias `repo rm`)

**What.** Unregisters a repo and drops its rows from the index. **It does not
touch the folder on disk** — your files are untouched, only Local Search's
knowledge of them goes away.

**How.**

```bash
$ local-search repo remove my-project
```

**Why.** Repos accumulate. You clone something to look at it, add it, and three
months later it's still padding every search with noise. Removing is cheap
precisely because it's non-destructive — if you're wrong, `repo add` puts it
back in one command.

### `scan` / `scan <repo-name>` (aliases `rebuild`, `index`)

**What.** Rebuilds the index. The two forms behave differently on purpose:

- **`scan`** (no argument) — a full rebuild. Deletes `specs.db`, recreates the
  schema, re-indexes every registered repo. This is the only command that
  deletes the database file.
- **`scan <name>`** — a *surgical* single-repo scan. Re-indexes just that repo
  in place; every other repo's rows survive.

Both resolve their target *before* mutating anything, so a scan for an unknown
repo name, or a bare `scan` run outside any registered repo, fails having
touched nothing.

**How.**

```bash
$ local-search scan examples
  examples: indexing /path/to/examples…
  examples: 8 files indexed

Done. 8 specs indexed. Run 'local-search search <keyword>' to find specs.
```

**Why.** You mostly won't need it. Local Search opportunistically
incremental-scans on its own before most commands when it notices git changes
since the last scan — you'll see `(git changes detected — incremental update…)`
when that happens. `scan` is the manual override for the cases that detection
can't cover: files changed outside git, an interrupted scan, or a schema
upgrade after a version bump. The full-rebuild form is safe to reach for
whenever something looks wrong, because rebuilding costs seconds and risks
nothing.

### `init` / `setup`

**What.** Shows or edits `.agent/local-search-config.yaml` — the project scope
file read by the bundled Claude Code skill. This is a *different* file from
`.agent/local-search-config.yaml` (which `scope` manages); see
[two-config-files](../explanation/two-config-files.md) for who reads what.

**How.**

```bash
$ local-search init                  # show current state
$ local-search init --add docs,api   # add repos to the project scope
$ local-search init --set docs       # replace the whole scope
$ local-search init --remove api     # drop one repo
$ local-search init --json           # machine-readable state
```

```json
{
  "path": "/abs/path/.agent/local-search-config.yaml",
  "exists": true,
  "empty": true,
  "repositories": [],
  "available": [ { "name": "my-project", "path": "...", "spec_count": 42 } ]
}
```

`--dir <path>` operates on a project directory other than the current one.
Repo names are validated against the registry, so a typo is caught at write
time rather than silently producing an empty scope.

**Why.** When Claude searches on your behalf, you want it looking at the three
repos this project cares about, not all fourteen you've ever registered. Without
this file the skill searches everything and buries the answer. The `--json` mode
exists so the skill itself can read the state without parsing human prose.

> For the full `init` deep dive — flag precedence, validation rules, the
> `--json` field contract, `graph:` entries, and stale-entry handling — see
> [skill-reference.md](skill-reference.md#option-1-configure-project-scope-init).

### `install-skill [--global | --local | --dir <path>] [--force]`

**What.** Writes the bundled Claude Code skill into a skills directory. The
skill files are embedded in the binary, so this works offline and always matches
your CLI version.

**How.**

```bash
$ local-search install-skill            # → ~/.claude/skills/local-search
$ local-search install-skill --local    # → ./.claude/skills/local-search
$ local-search install-skill --dir ./x  # → arbitrary directory
$ local-search install-skill --force    # overwrite an existing install
```

Without `--force`, an existing install is left alone and the command fails
loudly rather than silently clobbering it.

**Why.** It closes the loop between "I have an index" and "my agent can use it."
`--local` matters for teams: committing `.claude/skills/local-search` means
everyone who clones the repo gets the same skill without a setup step. Shipping
the skill *inside* the binary rather than fetching it means the skill can never
drift out of sync with the CLI it drives.

---

## Searching

### `search <query>` (alias `s`)

**What.** The main command. Runs full-text search over the index and — when the
selected repos have knowledge graphs — blends in graph results and re-ranks
using graph structure. The three `auto` flags decide all of that for you.

**How.**

```bash
$ local-search search "refund"
[source=fts · rank=bm25 · repos=1 (0 with graphs)]

Specs (3):
  [examples · FTS] product-specs/payments/refund.md
    Refund flow  (billing, refund, customer, payments)  .md
```

| Flag | Values | Default | Meaning |
|---|---|---|---|
| `--repos` | `all` \| `graph-only` \| `a,b` | `all` | Which repos to search |
| `--repo` | `<name>` | — | Single repo (legacy; prefer `--repos`) |
| `--source` | `auto` \| `fts` \| `graph` \| `both` | `auto` | Where results come from |
| `--rank` | `auto` \| `bm25` \| `graph-aware` | `auto` | Ranking strategy |
| `--semantic` (alias `--hybrid`) | flag | off | Hybrid FTS + vector re-ranking (RRF fusion) |
| `--exclude-location <pattern>` | repeatable | — | Drop results whose path contains `pattern` |

What `auto` resolves to:

- `--source auto` → `both` if any selected repo has `graphify-out/`, else `fts`.
- `--rank auto` → `graph-aware` if any selected repo has `graphify-out/`, else `bm25`.

Flags work in any position — `search --semantic "refund"` and
`search "refund" --semantic` are equivalent.

**Query syntax.** Queries run against a Porter-stemmed, `unicode61`-tokenized
FTS5 index:

- **Stemming is automatic** — `refunding` and `refund` match the same rows.
- **`OR`**, **`NEAR`**, prefix (`refund*`), and quoted `"exact phrase"` work.
- **A leading `-`** excludes a term: `"refund -chargeback"`.
- **Punctuation FTS5 can't parse** — a stray `:`, `/`, `(`, `?`, an unbalanced
  `"` — is automatically retried as a literal search, each word quoted and
  ANDed. An ordinary sentence degrades gracefully instead of erroring. You only
  see an error if the sanitized fallback also fails.

**Why.** Everything above is in service of one goal: you shouldn't have to know
how the index is built to get a good answer. The `auto` defaults mean a repo
with a graph automatically gets better ranking without you asking, and a repo
without one doesn't pay for machinery it can't use. The bracketed status line
above every result set exists so `auto` is never a black box — it reports what
actually ran, not what you requested.

### `find <query>` (alias `f`)

**What.** Unified scoped search across **three** sources at once — indexed
specs, the graphify knowledge graph, and the code-review-graph — merged into one
score-ranked table. Where `search` is spec-first with graph enrichment, `find`
treats all three as peers and weights them per the resolved scope.

**How.**

```bash
$ local-search find "refund"
─────────────────────────────────────────────────────────────
Searched repos: payments, billing
Scope source:   /Users/you/work/.agent/local-search-config.yaml
Results:        7
─────────────────────────────────────────────────────────────

SCORE   TYPE        REPO      NAME                     LOCATION
0.92    spec        payments  Refund flow              specs/refund.md
0.81    codegraph   payments  payments.RefundService   src/refund.go:42
```

`--scope repo1,repo2` overrides the resolved scope for this one call.

When a repo in scope is missing a source, `find` says so *and* tells you how to
fix it, rather than silently returning less:

```
Missing sources:
  [billing] no .code-review-graph/
        fix: run the code-review-graph generator in /path/to/billing
```

**Why.** "Where is the refund logic?" is rarely a question about only specs or
only code — the answer is usually a spec *and* the service that implements it.
`find` is the command for that question. The always-on banner naming the
searched repos and the scope source exists because the most confusing possible
result is a short list caused by a scope you forgot you set; `find` refuses to
let that be invisible.

### `read <name> [repo]` (aliases `r`, `get`, `show`)

**What.** Prints a spec's full content, frontmatter included.

**How.**

```bash
$ local-search read refund
---
id: capability://payments/refund
tags: billing, refund, customer, payments
---
# Refund flow
...
```

Pass a repo name as a second argument, or `--directory <path>` to filter to
paths under a given directory, when a name matches more than one file.

**Why.** Search gives you a path; `read` saves you the round-trip to an editor.
It matters most for agents, which can chain `search` → `read` without a file
tool and without you granting filesystem access.

---

## Discovering

These four commands are for browsing rather than searching — when you don't yet
know the word to search *for*.

### `list [repo-or-project]` (alias `ls`)

**What.** Lists every indexed spec, optionally filtered to one repo or one
project. Output is streamed, so it stays responsive on large indexes.

**How.**

```bash
$ local-search list
$ local-search list my-project
```

**Why.** The inventory view. It answers "did that file actually get indexed?" —
which is the first thing to check when a search comes back empty and you're
certain the content exists.

### `projects` (alias `p`)

**What.** Lists every project across every repo, with its spec count. A
"project" is the directory grouping Local Search derives while scanning.

**How.**

```bash
$ local-search projects
  [uncle-os] docs/go-cli-tui-port  (12 specs)
  [squirrel] specs/vault           (31 specs)
```

**Why.** It's the table of contents for an unfamiliar index — the fastest way to
see how someone else's docs are organised, and it gives you valid filter
arguments for `list`.

### `tags` / `tags <tag>` (alias `t`)

**What.** With no argument, lists every tag in the index with its usage count.
With a tag, lists the specs carrying it.

Tags come from two places: frontmatter `tags:`, and the body. `@spec <ID>`
annotations become `spec:<id>` tags, and `[[wikilinks]]` become `link:` tags.

**How.**

```bash
$ local-search tags
  link:wikilinks                 17
  status/draft                    8

$ local-search tags spec:tasks-012
```

**Why.** Tags are the cross-cutting axis search can't give you — `search
"authentication"` finds documents *about* auth, while `tags auth` finds
documents *classified as* auth by whoever wrote them. The `spec:` derivation is
the payoff of the [EARS annotation
convention](ears-spec-annotations.md): every requirement ID becomes a browsable
tag for free, so you can jump from a requirement to every document that
implements or tests it.

### `recent [n]`

**What.** Lists the `n` most recently modified specs (default 10).

**How.**

```bash
$ local-search recent 3
  [uncle-os] docs/go-cli-tui-port  Go CLI + TUI Port — High-Level Design
```

**Why.** The Monday-morning command — "what did we change while I was out?" It's
also a fast sanity check after a scan: if the file you just edited isn't at the
top, the index didn't pick it up.

### `related <name>` (alias `rel`)

**What.** Finds specs related to the named one by *declared* relationships —
frontmatter fields like `dependsOn` and `relationships`. This is explicit
authorship, not similarity: it shows what someone wrote down, not what happens
to use similar words.

**How.**

```bash
$ local-search related refund
```

**Why.** It follows the graph your team actually maintained. That distinction
matters — for lexical similarity you want `--semantic` search or `graph search`;
`related` is for when you trust the frontmatter more than the prose.

---

## Narrowing what gets searched

Scope controls which repos a bare `find`/`code` call considers when you don't
pass `--scope`. It's stored in `.agent/local-search-config.yaml`, resolved by walking up from
the current directory. See [configuration.md](configuration.md) for resolution
order.

### `scope show`

**What.** Prints the resolved scope, the file it came from, and the effective
weights and limits.

**How.**

```bash
$ local-search scope show
Scope:   payments, billing
Source:  /Users/you/work/.agent/local-search-config.yaml
Weights: specs=1.00 graphify=0.70 codegraph=0.80
Limits:  specs=20 graphify=10 codegraph=10 blast_depth=2 blast_cap=50
```

> **Changed in v0.4.0:** `scope show` used to *create* an empty config in the
> current directory when none was found. It no longer does — reads never write.
> If a config would be auto-created for a search, `find` still says so on stderr.

**Why.** Scope resolution walks up directories, so the file governing your
search may be three levels above where you're standing. `scope show` is the only
way to see the answer without guessing — and the weights and limits it prints
are exactly the numbers that produced your last `find` ranking.

### `scope set repo1,repo2`

**What.** Sets the `repositories:` list in the current directory's config,
creating the file if absent. Non-destructive: existing `weights:`, `limits:`,
and comments survive.

**How.**

```bash
$ local-search scope set payments,billing
Wrote /Users/you/work/.agent/local-search-config.yaml with scope = [payments billing]
```

**Why.** Committing this file is the point. It makes "which repos matter here"
a property of the project rather than of each developer's shell history, so
everyone on the team gets the same results from the same query.

### `scope init`

**What.** Auto-detects the nearest enclosing registered repo and writes it as
the scope.

**How.**

```bash
$ cd ~/work/payments && local-search scope init
```

**Why.** The 90% case is "scope this to the repo I'm standing in," and typing
the name is both boring and typo-prone. If auto-detection can't find an
enclosing repo it fails and points you at `scope set` rather than writing
something arbitrary.

### `scope clear`

**What.** Empties the `repositories:` list, keeping the file — and with it your
`weights:` and `limits:`. `--delete` removes the file outright.

**How.**

```bash
$ local-search scope clear
Cleared repositories in /Users/you/work/.agent/local-search-config.yaml (weights and limits kept).
Use --delete to remove the file entirely.
```

**Why.** Now that one file holds both the repo list and your tuning, deleting it
to reset scope would take the tuning as collateral damage. Emptying is the
narrower operation people actually mean. `--delete` is still there for a genuine
clean slate.

---

## Knowledge graph

`graphs` (plural) manages graph *registration*. `graph` (singular) *queries and
exports* graphs. Two commands, one letter apart, doing genuinely different jobs
— worth reading the name carefully.

### `graphs` / `graphs list`

**What.** Lists graph status per repo, one line per graph kind present
(`graphify` and `code-review-graph`), with node counts and age.

**How.**

```bash
$ local-search graphs
REPO                    KIND                  NODES  AGE
squirrel                graphify              16169  4d
uncle-os                —                         —  —
```

**Why.** Graphs are what upgrade `--rank auto` from BM25 to graph-aware, so this
table tells you which repos get the better ranking. The `AGE` column is the
important one: a graph is a snapshot, and a four-week-old graph is describing a
codebase that no longer exists.

### `graphs add <name> <path> [--kind graphify|code-review-graph]`

**What.** Registers a standalone graph file that isn't tied to a spec repo. The
kind is auto-detected from the file; `--kind` overrides that.

**How.**

```bash
$ local-search graphs add legacy ./exports/legacy-graph.json
Added external graph "legacy"  (2431 nodes)
```

**Why.** Graphs don't have to come from a registered repo — they might be
exported from CI, generated by another tool, or handed to you by a teammate.
This is also the receiving end of `graph export`: export from one machine, `graphs
add` on another, and the round-trip works.

### `graphs remove <name>` (alias `graphs rm`)

**What.** Unregisters a standalone graph. Doesn't delete the file.

**How.**

```bash
$ local-search graphs remove legacy
```

**Why.** Same reasoning as `repo remove` — deregistration should be reversible
and shouldn't destroy anything.

### `graphs prune`

**What.** Forgets standalone graphs whose backing files have vanished from disk.

**How.**

```bash
$ local-search graphs prune
```

**Why.** Graph files get regenerated into temp directories, cleaned up, or
deleted with a branch. Rather than making every query defensively check the
filesystem, registration is allowed to go stale and `prune` reconciles it on
demand.

### `graph explain <entity> [--json]`

**What.** The one-hop typed neighbourhood of a single graph entity — a function,
a spec, a component — grouped by edge type, with provenance saying which
repo and file declared or referenced each edge.

**How.**

```bash
$ local-search graph explain "payments.RefundService"
payments.RefundService  [function]
  defined: my-project:src/payments/refund.go

outgoing:
  calls:
    -> payments.ChargebackService  (my-project:src/payments/refund.go, field calls)

incoming: (none)
```

Exit codes are part of the contract: `0` found, `1` usage error, `2` not found,
`3` no database. In `--json` mode a miss is still well-formed JSON with
`"found": false` — never an error blob.

This command **never scans implicitly**. If no index exists it tells you to run
`local-search scan` instead of triggering one.

**Why.** Search tells you a thing exists; `explain` tells you what it's
connected to. The provenance is the part that makes it trustworthy — you can see
*why* the graph believes an edge exists and go read that line yourself. The
never-scan rule and the stable exit codes exist because this is the command
agents and scripts call most, and a query that silently triggers a
multi-second rebuild is a query you can't put in a loop.

> **Gap:** `graph explain` is fully implemented but doesn't appear in
> `local-search help`'s output. Only `graph tag`, `graph search`, and
> `graph export` are listed there.

### `graph search <query> [--repo <name>]`

**What.** Builds an ego vector graph seeded by a query and prints it as NetworkX
JSON. Results are ranked by embedding similarity, not keyword match.

**How.**

```bash
$ local-search graph search "payment retries" --repo payments > ego.json
```

**Why.** For feeding a visualizer or a notebook rather than reading in a
terminal. NetworkX JSON is the lingua franca of graph tooling, so the output
drops straight into Python analysis or a D3 view.

### `graph tag <tag>`

**What.** Builds a kNN vector graph over every spec carrying `tag`, printed as
NetworkX JSON.

**How.**

```bash
$ local-search graph tag architecture > arch.json
```

**Why.** Same output contract as `graph search`, different seed: a tag instead
of a query. Use it to see how the documents in one category cluster — which
often reveals that a single tag is doing the work of three.

### `graph export <repo> [--edges auto|vector|tags|nodes] [--include-content] [--out <file>]`

**What.** Exports one repo's indexed specs as node-link JSON. Round-trips via
`graphs add`.

`--edges` picks how links are derived: `vector` (embedding similarity), `tags`
(shared tags), `nodes` (no edges), or `auto` — which resolves to `vector` when
the repo has vectors and `tags` otherwise, announcing its choice on stderr.
`--include-content` inlines full spec text into each node.

**How.**

```bash
$ local-search graph export payments --out payments-graph.json
graph export: edges=vector (auto)
wrote 358 nodes, 12 links → payments-graph.json
```

Without `--out`, JSON goes to stdout — progress notes always go to stderr, so
piping stays clean.

**Why.** Getting the graph *out*, for a visualizer, a diff between two points in
time, or a teammate without your repos checked out. `--include-content` makes
the export self-contained at the cost of size — worth it when the recipient has
no access to the source files.

### `graph export-view [--repos a,b | --all] [--edges …] [--out <file>]`

**What.** Merges **several** repos' graphs into one viewer-ready node-link JSON
(default `graph.json`). Every node id is namespaced by repo (`<repo>:<id>`) so
per-repo ids can't collide.

Repo selection:

- `--repos a,b` or `--all` — non-interactive, for scripts and CI.
- No selection flag **in a terminal** — prints a numbered list with spec counts
  and prompts `Include (e.g. 1,3 or all): `.
- No selection flag and **no TTY** — exits with usage. It never blocks on stdin.

Output is deterministic: nodes sorted by id, links stably sorted, so repeat runs
are byte-identical and the file diffs cleanly in git.

**How.**

```bash
$ local-search graph export-view --repos my-project,other-repo --out graph.json
graph export-view: my-project edges=vector (auto)
graph export-view: other-repo edges=tags (auto)
wrote 358 nodes, 12 links from 2 repo(s) → graph.json
```

**Why.** The interesting connections in a multi-repo system are the ones that
cross repo boundaries, and a per-repo export can't show them. The determinism is
deliberate — it means a merged graph can be committed and reviewed as a diff.

Note that cross-repo canonical nodes (the same `component://…` referenced in two
repos) stay **distinct** in v1: they're namespaced per repo, not merged.

---

## Code graph

These query the `code-review-graph` — a call graph of your *source code*,
separate from the spec index. All of them accept `--scope repo1,repo2` and
silently skip repos without a code graph. When a repo lacks one, `code <query>`
prints how to generate it.

### `code <query>`

**What.** Searches code-graph nodes by name, printing kind, qualified name, and
`file:line`.

**How.**

```bash
$ local-search code Refund

[payments] 2 match(es):
  function  payments.RefundService.Process   src/refund.go:42
  class     payments.RefundRequest           src/types.go:18
```

**Why.** "Where is this defined?" without leaving the terminal or firing up an
LSP. It's most useful across repos, where your editor's jump-to-definition stops
at the project boundary but the code graph doesn't.

### `code hubs`

**What.** Top hub functions and classes by out-degree — the symbols that call
the most other things (default: 10 per repo).

**How.**

```bash
$ local-search code hubs

[payments] top hubs:
  function  payments.Orchestrator.Run   out=34
```

**Why.** The orientation command for a codebase you've never seen. Hubs are
where the control flow concentrates, so reading the top five teaches you more
about a system's shape than reading its README. They're also your highest-risk
change targets — which leads directly to the next command.

### `code blast <qualified-name>`

**What.** The impact set: everything reachable from a symbol. Defaults are depth
2 and a cap of 50 results, both configurable via scope limits.

**How.**

```bash
$ local-search code blast payments.RefundService.Process

[payments] blast radius of payments.RefundService.Process (depth=2, cap=50):
  function  payments.ChargebackService.Reverse   src/chargeback.go:12
```

**Why.** The pre-refactor question — "if I change this, what breaks?" The depth
cap is a feature: unbounded reachability in a real codebase is most of the
codebase, which tells you nothing. Two hops is the range where the answer is
still small enough to read and act on.

### `code callers <qualified-name>` / `code callees <qualified-name>`

**What.** Direct callers (who calls this) and direct callees (what this calls) —
one hop, no transitive closure.

**How.**

```bash
$ local-search code callers payments.RefundService.Process
$ local-search code callees payments.RefundService.Process
```

**Why.** The precise pair that `blast` approximates. Use `callers` to check
whether a function is safe to change signature on, and `callees` to understand
what a function actually depends on before you extract or mock it. When `blast`
returns too much to read, these two are how you walk it manually.

---

## Web UI

### `ui` / `ui --port <n>` / `ui stop` / `ui status`

**What.** Starts, stops, and inspects the web console daemon. `ui` with no
subcommand means `start`.

Starting does several things in order: finds the `web/` directory, verifies
Node.js is on PATH, verifies the frontend is built, launches `node server.js`
detached, writes a pidfile at `~/.local-search/ui.pid`, waits up to 6 seconds
for `/api/health`, then opens your browser. If it's already running, it just
re-opens the browser.

**How.**

```bash
$ local-search ui --port 9000
UI started (pid 4821) — http://localhost:9000

$ local-search ui status
UI: stopped

$ local-search ui stop
```

Default port is `8787`. `LOCAL_SEARCH_WEB_DIR` overrides web-directory
discovery; otherwise it walks up from the binary and the current directory, then
falls back to the standalone app location (`~/.local/share/local-search/web`,
XDG-aware).

If the frontend isn't built, it tells you exactly what to run:

```
Error: frontend not built (…/web/frontend/dist/index.html missing).
Build it once with: (cd …/web/frontend && npm install && npm run build)
```

**Why.** The CLI is better for targeted lookups; the console is better for
exploring — comparing ranking modes side by side, browsing the graph, reading
inspector tabs. Running it as a detached daemon means it survives closing your
terminal, and the pidfile is what makes `stop` and `status` possible from a
different shell. The health-check wait exists so `ui` doesn't lie to you: it
only reports success once the server actually answers.

Logs go to `~/.local-search/ui.log`. If the process starts but never becomes
healthy, that file has the reason.

> **Version note:** the behaviour above describes the current source. v0.3.1 had
> a web-directory detection bug that made `ui` unable to start at all — if
> you're on that version, see
> [troubleshooting](troubleshooting.md#local-search-ui-fails-to-start) for the
> workaround. `ui stop` and `ui status` were never affected.

---

## Config

### `config show` / `config path` / `config validate` / `config migrate` / `config schema`

**What.** Inspect, check, and convert the config file.

**How.**

```bash
$ local-search config show
Source:  /Users/you/work/.agent/local-search-config.yaml
Repos:   [payments billing]
Weights: specs=1.00 graphify=0.70 codegraph=0.80
Limits:  specs=20 graphify=10 codegraph=10 blast_depth=2 blast_cap=50

$ local-search config validate
/Users/you/work/.agent/local-search-config.yaml:4:1: unknown key "repositorys"
   4 | repositorys:
     | ^
   did you mean "repositories"?

$ local-search config migrate --dry-run
[dry-run] migrated /Users/you/work/.local-search.toml → /Users/you/work/.agent/local-search-config.yaml
  repositories added: payments
  carried over: weights.specs, limits.blast_depth
```

`--dir <path>` operates elsewhere; `--global` targets `~/.local-search-config.yaml`;
`--all` sweeps a whole tree; `--keep-toml` leaves the legacy file; `config schema
--write <path>` saves the JSON Schema locally.

**Why.** `validate` exists because a broken config now makes `find` and `code`
refuse to run — there has to be a read-only command that shows the problem
without trying to repair it by overwriting. `migrate` exists so conversion can be
deliberate and reviewable (`--dry-run`, `--all`, and `LOCAL_SEARCH_NO_AUTO_MIGRATE=1`)
rather than something that happens to your working tree whenever someone next
runs a search. `schema` exists so the editor integration works offline.

Migration is conservative on purpose: it will not delete a TOML it could not
parse, nor one holding settings this version doesn't understand. A leftover file
is a nuisance; a silently vanished scope is a bug you'd never trace.

## Health and maintenance

### `doctor` (aliases `diagnose`, `health`)

**What.** A read-only health check across five groups — Environment, Database,
Repos, Dependencies, Web UI — printing `✓` / `⚠` / `✗` per line. Exits `0` (all
clear), `1` (warnings), `2` (errors), so it's scriptable. `--json` emits the same
findings as structured data.

It checks, among other things: whether a *different* `local-search` shadows
yours on PATH, whether the app directory is writable, SQLite integrity, schema
version vs what the binary expects, a large uncheckpointed WAL (a sign of an
interrupted scan), whether each repo's path still exists, whether any repo's git
HEAD has drifted from the commit at last scan, whether `claude` and Node ≥ 18
are available, and whether a pidfile points at a dead process.

**How.**

```bash
$ local-search doctor
local-search doctor — v0.3.14

Environment
  ✓ CLI version: 0.3.14
  ✓ Binary path: /Users/you/.local/bin/local-search
  ✓ App directory: /Users/you/.local-search

Database
  ✓ Database file: /Users/you/.local-search/specs.db (81.9 MB)
  ✓ Integrity: ok
  ✓ Schema version: v3

Repos
  ✓ Registered repos: 4
  ⚠ squirrel: changed since last scan (index is stale)
  ⚠ Index freshness: last scan: 2026-07-23T04:15:25Z — 1 repo(s) drifted; run `local-search scan`

Dependencies
  ✓ claude CLI: /Users/you/.nvm/versions/node/v20.19.4/bin/claude
  ✓ Node.js: v20 (…/bin/node)

Web UI
  ⚠ Daemon: stale pid file (pid 20800 not running) — `local-search ui stop` to clear

Result: healthy with 3 warning(s).
```

**Why.** It exists to answer the three questions people actually hit: *why isn't
search working*, *why are results stale*, and *why won't the web UI start*.
Notice that every warning names its own fix. Missing optional dependencies warn
rather than fail, because `claude` and Node gate specific features, not the CLI
— you can lose both and still search. Run this first whenever anything is odd;
it's read-only and never triggers a scan.

### `stats`

**What.** Index-wide counts: repos, specs, projects, unique tags, total content
size, last scan time, DB size.

**How.**

```bash
$ local-search stats
Repos:       4
Specs:       837
Projects:    24
Unique tags: 239
Total size:  6.0 MB
Last scan:   2026-07-23T04:15:25Z
DB size:     81.9 MB
```

**Why.** The one-glance summary. `Last scan` is the field to check when results
feel wrong, and the gap between `Total size` (your content) and `DB size` (what
that costs on disk) is usually the surprise — which `size` then explains.

### `size [--by repo|project] [--json]`

**What.** Splits disk cost into the DB **file** size (storage and backup cost —
includes the FTS index, WAL, and SHM) and indexed **content** bytes (your actual
corpus), then breaks the corpus down per repo or per project.

**How.**

```bash
$ local-search size
DB file:          81.9 MB   /Users/you/.local-search/specs.db
  ├─ WAL          4.1 KB
  └─ SHM          32.0 KB
Indexed content:  6.0 MB across 837 specs

Per repo                        specs     content   share
  --------------------------------------------------------
  squirrel                        361      2.7 MB     45%
  foyer-platform                  120      1.6 MB     27%
  uncle-os                        161    900.6 KB     15%
  team-os-example-repo            195    841.4 KB     14%
```

**Why.** When the DB is unexpectedly large, this tells you whether it's one repo
dominating (fix: `repo remove`, or `--skip-directory`) or FTS and vector
overhead (fix: nothing, that's the price of fast search). The example above is
the common shock — 6 MB of markdown costing 82 MB on disk — and seeing the split
is what turns that from alarming into expected.

### `db`

**What.** Prints the database file path. That's all.

**How.**

```bash
$ local-search db
/Users/you/.local-search/specs.db
```

**Why.** So you can pipe it. `sqlite3 "$(local-search db)"` opens the index for
ad-hoc SQL; `ls -la "$(local-search db)"` checks it directly. A one-line command
that composes beats a path you have to remember.

### `inspect` (aliases `dump`, `debug`)

**What.** Dumps the entire index — every indexed spec with its metadata.

**How.**

```bash
$ local-search inspect | less
$ local-search inspect | grep refund
```

**Why.** The escape hatch for when a search result makes no sense and you need
to see the raw rows. It's verbose by design; pipe it. If you're reaching for it
often, `json list` is probably the structured version you actually want.

### `reset`

**What.** Deletes the repo registry **and** the index, after a `y/N`
confirmation. Removes `~/.local-search/repos` and `~/.local-search/specs.db`.
Your source files are never touched.

**How.**

```bash
$ local-search reset
This will delete all repos and the index. Continue? [y/N] y
Reset complete. Start fresh with: local-search repo add /path/to/specs
```

**Why.** Start-over in one step, for a corrupted index or an accumulated mess of
repos not worth removing one by one. It's confirmation-gated because unlike
deleting `specs.db` alone, this *also* forgets your repo list — the one piece of
state that isn't derived from your files and can't be rebuilt automatically.
See [the disposable index](../explanation/the-disposable-index.md) for what's
recoverable and what isn't.

---

## Automation

### `scan-hooks install|uninstall [--mechanism git-hooks,shell] [--force]`

**What.** Wires up automatic rescanning so the index refreshes as you work. Two
mechanisms, either or both:

- **`git-hooks`** — writes an idempotent, sentinel-delimited managed block into
  `post-merge`, `post-checkout`, and `post-rewrite` (deliberately **not**
  `post-commit`). Each triggers a detached, backgrounded rescan of the repo
  after the git operation completes.
- **`shell`** — writes a shared snippet to `~/.local-search/shell-hook.sh` and
  registers it with your shell's directory-change hook (zsh `add-zsh-hook
  chpwd`, or bash `PROMPT_COMMAND`), so `cd`-ing into a registered repo triggers
  a rescan.

Omit `--mechanism` to be prompted. `--force` (install only) overwrites an
existing managed block without asking. Both mechanisms resolve the target repo
from the current directory *before* writing anything, so running this outside a
registered repo installs nothing.

**How.**

```bash
$ cd ~/work/payments
$ local-search scan-hooks install --mechanism git-hooks
$ local-search scan-hooks uninstall
```

**Why.** Stale results are the failure mode that quietly erodes trust in a
search tool — you get a wrong answer, don't realize it's stale, and stop
believing the tool. Automating the refresh removes the discipline requirement.
The details are all about staying out of your way: `post-commit` is excluded
because it fires constantly and would scan on every commit; hooks run detached
and always `exit 0`, so a slow or broken scan can never block or fail a git
operation; the managed block is sentinel-delimited so your own hook code is
never clobbered.

### `scan-hook-run [name]` — internal

**What.** The dispatch entry the generated hooks call. Not meant to be run by
hand. It resolves the repo (by name, or from the current directory), takes a
per-repo lock, change-gates against the last indexed commit, and runs a surgical
single-repo scan.

**Why.** It's documented here only so the line you find in your `.git/hooks/`
files isn't a mystery. Keeping the logic in Go rather than POSIX shell is what
makes the locking and change-gating testable — and it's why concurrent hook
fires don't stampede: the second one sees the lock and no-ops. If nothing
changed since the last indexed commit, it does nothing at all. On any detection
failure it errs toward scanning, so automation fails toward freshness rather
than silent staleness.

---

## Machine output (for agents)

### `json <subcommand>` (alias `j`)

**What.** Mirrors the human commands but prints a single JSON value on stdout
and **nothing else** — no `(git changes detected…)` banners, no prompts, no
progress lines. This is what the bundled Claude Code skill and the web UI's
"Graph only" mode call under the hood.

**How.**

```
local-search json search <query> [repo] [--semantic]
local-search json read <name> [repo]
local-search json list [repo-or-project]
local-search json repos
local-search json related <name>
local-search json tags
local-search json stats
local-search json find <query> [--scope repo1,repo2]
local-search json context <query> [--scope repo1,repo2]
```

`json find` is the JSON form of `find` — same scope resolution, same three
sources. `json context` goes further: it's the agent payload, returning `find`
results *plus* the inlined blast radius of the top code-graph hit.

> **Gap:** `json find` and `json context` are implemented but not listed in
> `local-search help`'s JSON section.

**Why.** Agents and scripts need a stable contract, and the human commands
deliberately break that contract with helpful chatter. Splitting them means the
human output stays free to be friendly while the machine output stays parseable.
`json context` exists because the most common agent workflow — find the thing,
then find what it touches — was two calls and a parse; now it's one.

---

## Meta

### `help` (aliases `--help`, `-h`)

**What.** Prints the full command summary. Also what you get from running
`local-search` with no arguments, or from an unknown command (which additionally
exits `1`).

**How.**

```bash
$ local-search help
```

**Why.** Note that help is the *fallback*, not an error: a typo prints the
summary rather than a bare "unknown command," so you can find the right name
without a second command.

### `-v` / `--version`

**What.** Prints `local-search version <semver>` and exits.

**How.**

```bash
$ local-search --version
local-search version 0.3.15
```

**Why.** The first thing to check when behaviour doesn't match the docs, and the
first thing to include in a bug report. If it disagrees with what you just
installed, `doctor`'s PATH-shadowing check will tell you which binary is
actually running.

---

## Alias table

Every alias in the dispatcher, so an unfamiliar command in someone's script is
never a mystery.

| Canonical | Aliases |
|---|---|
| `repo` | `repos` |
| `repo remove` | `repo rm` |
| `repo list` | `repo ls` |
| `graph` | `vgraph` |
| `graphs remove` | `graphs rm` |
| `graphs list` | `graphs ls` |
| `scan` | `rebuild`, `index` |
| `search` | `s` |
| `find` | `f` |
| `read` | `r`, `get`, `show` |
| `list` | `ls` |
| `projects` | `p` |
| `related` | `rel` |
| `tags` | `t` |
| `doctor` | `diagnose`, `health` |
| `inspect` | `dump`, `debug` |
| `json` | `j` |
| `init` | `setup` |
| `help` | `--help`, `-h` |
| `--version` | `-v` |
| `--semantic` | `--hybrid` |
| `init --remove` | `init --rm` |

---

### Where to go next

- Exact flags and signatures — [cli-commands.md](cli-commands.md)
- Every file, path, and env var — [configuration.md](configuration.md)
- Why ranking behaves the way it does —
  [how search works](../explanation/how-search-works.md)
- Something's broken — [troubleshooting.md](troubleshooting.md)

*Verified against Local Search v0.4.0 (`cli/` source).*
