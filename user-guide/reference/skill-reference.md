# The `/local-search` skill — every option

What the bundled Claude Code skill can do, how each capability is driven, and
why it works that way. Same **What / How / Why** shape as
[command-guide.md](command-guide.md), but for the skill rather than the binary.

For *installing* the skill, see
[how-to/use-the-claude-skill.md](../how-to/use-the-claude-skill.md). This page
assumes it's already installed and answers "what can I actually ask it to do?"

Verified against `cli/skilldata/local-search/` at v0.4.0.

## How the skill gets invoked

Two ways, and the difference matters:

- **Automatically.** The skill's `description` frontmatter is a broad trigger
  list. Claude loads it whenever a question *might* be answerable from specs —
  including questions that never say the word "spec." "What's our refund
  policy," "how does the signup flow work," "what happens if a payment fails"
  all trigger it.
- **Explicitly.** Typing `/local-search` invokes it directly. Use this when
  auto-triggering didn't fire and you want the skill's behaviour anyway.

The skill's standing instruction is **search first, answer grounded in results,
and do not answer from general knowledge when spec content is available.** That
is the whole point of it — it exists to stop Claude confidently paraphrasing
what your team actually wrote down.

## The options at a glance

| Option | Ask it like | Drives |
|--------|-------------|--------|
| [Configure scope](#option-1-configure-project-scope-init) | "set up local search for this project" | `init --json / --add / --remove / --set` |
| [Search & answer](#option-2-search-and-answer) | "what does our refund spec say?" | `search --repos …` |
| [Read a spec](#option-3-read-a-spec) | "show me the refund flow spec" | `read` / `json read` |
| [Browse](#option-4-browse-and-discover) | "what specs do we have?" | `list`, `projects`, `tags`, `recent`, `related` |
| [Set up repos](#option-5-set-up-repos) | "index my docs folder" | `repo add / remove / list` |
| [Machine pipelines](#option-6-machine-readable-pipelines) | (internal) | `json …` |
| [Deep reference](#option-7-on-demand-reference-files) | "how do I write a spec file?" | `resources/*.md` |

Everything below expands one row.

---

## Option 1: Configure project scope (`init`)

This is the option to understand first, because **every other option depends on
it.** Scope is what stops a search across fourteen registered repos from burying
the one answer you wanted.

### What

`local-search init` (alias `setup`) manages one file:

```
<project>/.agent/local-search-config.yaml
```

It declares which registered repos the skill searches when you're working in
this project. The command is **deliberately non-interactive** — it exposes
scriptable primitives only. The *conversation* is run by the skill, which calls
these primitives on your behalf.

> **`init` and `scope` are two doors to the same file.** As of v0.4.0 there is
> one config — `.agent/local-search-config.yaml`, with `~/.local-search-config.yaml`
> as a global fallback — and its `repositories:` list is read by both the skill
> and the CLI engine (`find`, `code`). `init --set a,b` and `scope set a,b` do
> the same thing in different phrasing.
>
> Note that `local-search search` reads **neither**: it takes `--repos`,
> defaulting to `all`. That's why the skill appends `--repos <scope>` to every
> `search` call by hand — the scope it read from `init` would otherwise have no
> effect. See [configuration.md](configuration.md) and
> [one config file](../explanation/two-config-files.md).

### How

Five flags, each doing one job.

#### `init` (no flags) — show state

Prints current scope plus everything available.

```bash
$ local-search init
Project scope config: /Users/you/work/api/.agent/local-search-config.yaml

Included repositories:
  - squirrel
  - uncle-os

Available repositories (local-search repo list):
  - foyer-platform           120 specs
  - squirrel                 361 specs
  - team-os-example-repo     195 specs
  - uncle-os                 161 specs

Edit with: local-search init --add <a,b> | --remove <a> | --set <a,b>
```

**Why this shape:** it shows current *and* available side by side, because the
question after "what's my scope?" is always "what else could it be?" — and the
spec counts tell you whether a repo is worth including.

#### `--json` — read state as data

The contract the skill consumes. Always valid JSON, never partial.

```bash
$ local-search init --json
{
  "path": "/Users/you/work/api/.agent/local-search-config.yaml",
  "exists": true,
  "empty": true,
  "repositories": [],
  "available": [
    { "name": "foyer-platform", "path": "/…/docs",     "spec_count": 120 },
    { "name": "squirrel",       "path": "/…/squirrel", "spec_count": 361 }
  ],
  "unknown": [],
  "error": ""
}
```

`error` is present only when the config exists but fails validation; the JSON
stays well-formed and the exit status is 1, so a consumer never has to parse a
plain-text death message.

| Field | Meaning |
|-------|---------|
| `path` | Absolute path to the config file |
| `exists` | Whether the file is actually on disk. `init --json` is a pure read as of v0.4.0, so `false` means what it says |
| `empty` | `true` when `repositories` is empty; the skill's branch condition |
| `repositories` | Configured scope, in order, deduped |
| `available` | Every registered repo with its path and spec count |
| `unknown` | Configured entries that are **not** currently valid |

Empty lists render as `[]`, never `null` — so a consumer can index without a nil
check.

**Why:** the skill needs to branch on state before deciding what to ask you.
`empty` distinguishes "never configured" from "configured to nothing," and
`available` gives it the option list for the question it's about to ask —
in one call, without parsing human prose.

#### `--set a,b` — replace the whole list

```bash
$ local-search init --set squirrel,uncle-os
```

Passing an empty string **clears** the scope:

```bash
$ local-search init --set ""
Included repositories: (none yet)
```

which writes:

```yaml
# yaml-language-server: $schema=https://…/local-search-config.schema.json
# LocalSearch config. Managed by `local-search init` / `local-search scope set`; safe to hand-edit.
# Names must match `local-search repo list`; "graph:" entries are external graphs.
# Validate with `local-search config validate`.

repositories: []
```

**Why:** the decisive operation. First-time setup and "start over" are both
`--set`, so neither needs a sequence of `--remove` calls.

#### `--add a,b` — add without disturbing the rest

```bash
$ local-search init --add foyer-platform
```

Repeatable and comma-separated. Duplicates are dropped; first-seen order is
preserved.

**Why:** scope grows incrementally as a project touches new areas. Making
addition non-destructive means Claude can widen your scope mid-conversation
without needing to know, or re-state, what was already there.

#### `--remove a,b` (alias `--rm`) — drop entries

```bash
$ local-search init --remove squirrel
```

**Why:** the inverse of `--add`, and the repair for a stale entry (see
`unknown` below).

#### `--dir <path>` — operate on another project

```bash
$ local-search init --dir ../other-project --json
```

**Why:** so scope can be configured for a project you aren't standing in —
useful in monorepos and in scripted setup, without a `cd`.

### The rules that aren't obvious

Five behaviours worth knowing, all verified against a live binary.

**1. Flags compose, with a fixed precedence: `--set` → `--add` → `--remove`.**

```bash
$ local-search init --set squirrel --add uncle-os --remove squirrel
Included repositories:
  - uncle-os
```

`--set` lays down the base, `--add` extends it, `--remove` subtracts last —
regardless of the order you typed them.

**2. `--add` and `--set` validate; `--remove` does not.**

An unknown name is rejected, and the error lists every valid entry:

```bash
$ local-search init --add nope
Error: unknown repo(s): nope
Valid entries: foyer-platform, squirrel, team-os-example-repo, uncle-os
(See `local-search repo list` and `local-search graphs list`.)
```

Exit code `1`. `--remove ghost` for a name that isn't there succeeds silently —
removal is idempotent by design, so cleanup scripts don't need existence checks.

**3. Validation happens *before* any write.** A rejected `--add` leaves the file
byte-for-byte unchanged. There is no half-applied state, even when you combine
valid and invalid names in one call. Writes are also atomic (temp file +
rename) and non-destructive: your `weights:` and `limits:` blocks, comments, and
key order all survive a `--set`.

**4. Reads never write.** `init` and `init --json` are pure reads as of v0.4.0;
only `--set`/`--add`/`--remove` create or modify the file.

The old create-if-missing behaviour is how a stray config ended up committed and
shipped in every release bundle — the web server runs `init --json` from its own
cwd. Now that resolution also walks up, one such run from `$HOME` would have
captured the scope of every project on the machine.

**5. `init` never scans.** It opens the DB and ensures the schema, but never
triggers indexing. Configuring scope is always fast and never has side effects
on your index.

**6. A broken config is reported, not overwritten.** If the file exists but
fails validation, `init` refuses rather than clobbering a file you may be
mid-edit, and `--json` returns the error in the `error` field. Use
`local-search config validate` to see it with line numbers.

### Stale entries and the `unknown` field

Remove a repo from the registry and any project still scoping to it now has a
dangling entry. `init` reports it rather than silently fixing it:

```bash
$ local-search init --json
{
  "repositories": ["squirrel", "deleted-repo"],
  "unknown": ["deleted-repo"]
}
```

The entry stays in `repositories` *and* appears in `unknown`.

**Why not auto-remove?** Because the usual cause is temporary — a repo not yet
registered on this machine, a teammate's checkout, a registry you're about to
rebuild. Silently rewriting a committed config file to match one machine's local
state would turn a shared file into a source of merge conflicts. Reporting lets
you decide; `init --remove deleted-repo` applies the fix.

### External graphs in scope

Standalone graphs registered with `graphs add` are valid scope entries under a
`graph:` prefix:

```bash
$ local-search init --add graph:legacy
```

**Why:** scope means "sources this project cares about," and a graph is a source
even when it isn't a repo. The prefix keeps the two namespaces from colliding
when a graph and a repo share a name.

### The conversation the skill runs

Given only the primitives above, the skill drives this loop with
`AskUserQuestion`:

1. `local-search init --json` — read state (creating the file if needed).
2. Branch:
   - **Empty or just created** → show `available`, ask which to include, then
     `init --set <chosen>`.
   - **Already has repositories** → show the list and offer **Add** (`--add`),
     **Remove** (`--remove`), **Modify** (`--remove` then `--add`, or `--set`),
     **Review** (re-run `--json`), or **Done**.
3. Repeat until you say done.

The skill is instructed to **never hand-edit the YAML** — always through `init`.

**Why the split?** Interactive prompts inside the CLI would be unusable from a
script and unparseable from an agent. Putting the primitives in the binary and
the conversation in the skill means the same commands serve CI, your shell, and
Claude — and the validation rules can't be bypassed by whichever one is driving.

### Worked example

```bash
$ cd ~/work/payments-api

$ local-search init --json          # 1. what's the state?
{ "empty": true, "repositories": [], "available": [ … ] }

$ local-search init --set platform,docs   # 2. pick the two that matter
$ local-search init --add graph:legacy    # 3. add an external graph

$ cat .agent/local-search-config.yaml
# LocalSearch project scope — repositories searched when running from this project.
# Names must match `local-search repo list`. Managed by `local-search init`.
repositories:
  - platform
  - docs
  - graph:legacy
```

Commit that file. Every teammate's Claude now searches the same three sources.

---

## Option 2: Search and answer

**What.** The core pipeline. Given any question that might be documented, the
skill resolves scope, runs 1–3 searches, reads the top matches, and answers from
what it found — with citations.

**How.** You just ask. Behind it:

- **Step 0 — resolve scope.** `init --json`, then append `--repos <a,b>` to
  every search. Note the flag differs per command: `search` takes `--repos`,
  while `find` and `code` take `--scope`. Both are comma-separated.
- **Step 1 — extract terms.** The question is broken into 1–3 queries built from
  *domain nouns*, not verbs. "What's the impact of adding a rule to payment
  eligibility?" becomes `"payment eligibility"` and `"refund"` — because FTS5
  indexes words, and filler verbs dilute BM25 ranking.
- **Step 2 — read.** The top 2–4 matches, no more. Ranking puts the best first;
  the tail is context noise.
- **Step 3 — reason.** Ground every claim, cite the file, flag gaps explicitly,
  connect findings across specs, and suggest `related` as a next step.

**Why.** Each constraint is there to prevent a specific failure. Scoping
prevents cross-project noise. Noun-only queries prevent BM25 dilution. The 2–4
read cap prevents context flooding. Mandatory citation makes the answer
checkable. And "flag gaps explicitly" is the valuable one — being told *"the
specs don't cover this"* surfaces documentation debt, where a plausible guess
would hide it.

> **Discrepancy:** `SKILL.md` shows `local-search search … --directory <path>`
> in three examples. **That flag does not exist on `search`** — it errors with
> `flag provided but not defined: -directory`. `--directory` is a flag of
> **`read`** only. To narrow a search by path, use `--exclude-location
> <pattern>` (which excludes rather than includes) or scope with `--repos`.

## Option 3: Read a spec

**What.** Prints a spec's full content, frontmatter included — human form via
`read`, structured form via `json read`.

**How.**

```bash
local-search read refund-flow                     # full content
local-search read refund-flow platform            # from a specific repo
local-search read config backend --directory src/ # disambiguate by directory
```

**Why.** Search returns a path; reasoning needs the text. Going through the CLI
rather than a file tool means the skill needs no filesystem permissions and gets
the same disambiguation logic you'd get by hand.

## Option 4: Browse and discover

**What.** The commands for when you don't yet know what to search *for*.

**How.**

```bash
local-search list                  # every spec, every repo
local-search list platform         # one repo or project
local-search projects              # all projects
local-search tags                  # all tags with counts
local-search related refund-flow   # declared relationships
local-search recent 20             # recently modified
```

**Why.** "What specs do we have?" isn't a search — there's no query term. These
give the skill an inventory to reason from, and let it answer orientation
questions ("what's documented about billing?") without guessing keywords.
`related` is the one that follows *declared* frontmatter links rather than word
similarity — the connections your team actually maintained.

## Option 5: Set up repos

**What.** The skill can register and manage repos for you.

**How.**

```bash
local-search repo add ./specs product                       # register + auto-scan
local-search repo add ./docs docs --skip-directory .skills  # skip a folder by name
local-search repo remove product
local-search repo list
```

`--skip-directory` takes a folder **name**, not a path. It's repeatable and
persisted, so future scans skip it too. Matching is exact — `.skills` will not
skip `.skills-old`.

**Why.** Setup questions are the ones people hit first and abandon over. Letting
the skill drive registration means "index my docs folder" is a sentence rather
than a man-page lookup. The index rebuilds automatically on add/remove and
detects file changes on the next search, so there's no manual scan step to
forget.

## Option 6: Machine-readable pipelines

**What.** The `json` subcommands: same data as the human commands, emitted as a
single JSON value on stdout with no banners, prompts, or progress lines.

**How.**

```bash
local-search json search "payment" platform
local-search json read refund-flow
local-search json list platform
local-search json repos
local-search json find "payment" --scope platform,docs
local-search json context "payment" --scope platform,docs
```

**Why.** You never invoke these — the skill does, on every search. They exist
because the human output is deliberately chatty (`(git changes detected —
incremental update…)`, confirmation prompts, status headers), and that chatter
would corrupt a parse. Splitting them lets the human output stay friendly while
the machine contract stays stable. `json context` is the efficient one: `find`
results *plus* the inlined blast radius of the top code-graph hit, so the common
"find it, then find what it touches" workflow is one call instead of two.

## Option 7: On-demand reference files

**What.** Three files the skill loads only when needed, keeping the main
`SKILL.md` small.

| File | Covers |
|------|--------|
| `resources/commands.md` | Full command reference, all options, output examples, edge cases |
| `resources/troubleshooting.md` | Common problems, fixes, auto-rebuild behaviour, file locations |
| `resources/spec-format.md` | How to write spec files, YAML frontmatter, folder structure, indexing |

**How.** Ask a question they cover — "how do I write a spec file?", "why isn't
my file being indexed?" — and the skill reads the relevant one.

**Why.** Progressive disclosure. Everything inline would spend context on
reference material most conversations never need; loading on demand keeps the
always-resident instructions short enough to be reliably followed.

> **Discrepancy:** `resources/troubleshooting.md` (12 occurrences) and
> `resources/spec-format.md` (2) still refer to the binary as **`local-doc`**, an
> old name. The commands are otherwise correct — substitute `local-search`.

---

## When the skill does *not* search

By design, it skips the search pipeline when:

- The question is pure setup — "how do I add a repo" — answerable from the
  command reference.
- The domain clearly isn't documented anywhere. It answers from general
  knowledge and says no specs were found.
- You explicitly opt out: "from your general knowledge", "don't check the docs".
- It's a follow-up and the spec content is already loaded from a previous step.

**Why this list exists:** a skill that searches unconditionally becomes latency
with no upside, and users learn to work around it. Naming the exceptions keeps
the default ("search first") credible.

## Cheat sheet

| You want | Say |
|----------|-----|
| Set up scope for this project | "set up local search for this project" |
| See current scope | "which repos does this project search?" |
| Widen scope | "add the platform repo to my search scope" |
| Narrow scope | "remove docs from my search scope" |
| Answer from specs | "what does our refund spec say?" |
| Find without knowing the word | "what specs do we have about billing?" |
| Register a new source | "index my docs folder as a repo" |
| Force the skill on | `/local-search` |

## See also

- [Install the skill](../how-to/use-the-claude-skill.md) — `install-skill` flags
- [Scope a project](../how-to/scope-a-project.md) — the task-shaped walkthrough
- [One config file](../explanation/two-config-files.md) — the schema, walk-up rules, and what changed in v0.4.0
- [command-guide.md](command-guide.md) — the same What/How/Why for every CLI command
- [cli-commands.md](cli-commands.md) — terse flag lookup

*Verified against Local Search v0.4.0.*
