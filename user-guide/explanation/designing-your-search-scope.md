# Designing your search scope

Local Search indexes markdown, documentation, and other text so any session —
and any agent — can find it again. It searches by semantic content, by document
name, by tags and metadata, by relevance weighting, and by the relationships
recorded in the knowledge graph.

The point isn't to hand back an answer. It's to surface the *right documents* so
the agent can open them, read them, and build its response on your actual
sources rather than on its own recollection. That only works if the documents it
opens belong to the reality you're asking about — which is what scope decides.

## The problem: too many sources

With one or two registered repos, "search everything" is fine. At fifteen,
twenty, thirty indexed sources, it stops being fine — and the problem usually
isn't speed, it's *contextual accuracy*.

A global search happily mixes:

- current information with historical documentation,
- shipped specs with future proposals,
- documentation belonging to different components,
- throwaway research with ratified decisions,
- content from unrelated platforms or domains.

The more sources you index, the more the scope of each search has to be a
deliberate choice.

> Semantic search decides which content is relevant. Scope decides the universe
> that search happens in.

## The default scope lives in the project

Each project declares its normal context in one file:

```
<project>/.agents/local-search-config.yaml
```

Its `repositories:` list is the default scope for every search run from inside
that project — by you, or by the Claude Code skill on your behalf.

Say you're working on `payments-service`. You'll almost always want two things:
the component's own docs, and the platform's official view of how things
actually work today.

```yaml
repositories:
  - payments-service
  - platform-current-reality
```

Write that once and no prompt has to repeat it. Every session opened in this
project starts with the component's local context, the platform's high-level
truth, and the rules and dependencies that connect the two.

Set it with either phrasing — both write the same list:

```bash
local-search scope set payments-service,platform-current-reality
local-search init --set payments-service,platform-current-reality
```

See [../how-to/scope-a-project.md](../how-to/scope-a-project.md) for the full
command set, and [two-config-files.md](two-config-files.md) for how the file is
found (it walks up from your current directory).

## Extending the scope for one task

The default is your normal context, not a wall. When a task genuinely needs
another source, name it for that task only.

To Claude:

> Explain the relationship between Component A and Component B. Use the project's
> Local Search scope and also include the `component-b` repo.

From the CLI:

```bash
local-search find "transaction retry" --scope payments-service,platform-current-reality,component-b
local-search search "transaction retry" --repos payments-service,component-b
```

This is why you don't need to pre-register every conceivable repo in the project
config. The everyday context stays small; the occasional source shows up only
when the question calls for it.

## One index per directory, or one per context?

Local Search will happily index a whole directory and treat it as a single
source. That's the right call when the content is small, or when all of it
belongs to the same context.

It stops being the right call when one directory holds several *kinds* of
knowledge. A knowledge base often contains, side by side:

- the platform's current reality,
- detailed per-component documentation,
- PRDs and in-flight changes,
- research and technology evaluations,
- scratch notes nobody has validated yet.

Index all of that as one source and the search space is too wide. A question
about how payments work today can pull back the current implementation, a PRD
for a future one, a write-up of an alternative provider, and some notes from an
abandoned spike. Every one of those is *about payments* and scores well on
similarity. None of them describe the same reality, and they don't carry the
same authority.

Splitting them makes the index itself the first relevance filter:

1. **The repo decides where to look.**
2. **Semantic search decides what's most relevant in that space.**
3. **The agent opens the selected sources and builds its answer from them.**

> Local Search can index everything. It shouldn't always search everything.

## Organizing a knowledge base

For a large knowledge base, register its top-level directories as separate
repos. They can all live in the same git repository — a Local Search repo is a
*logical* source, not necessarily a physical one.

```text
knowledge-base/
├── current-reality/
├── components/
├── work-in-progress/
├── research/
└── scratchpad/
```

Each one earns its own registration:

```bash
local-search repo add ./knowledge-base/current-reality   platform-current-reality
local-search repo add ./knowledge-base/components        platform-components
local-search repo add ./knowledge-base/work-in-progress  platform-work-in-progress
local-search repo add ./knowledge-base/research          platform-research
local-search repo add ./knowledge-base/scratchpad        platform-scratchpad
```

`local-search repo list` then shows all five as sources you can scope to
individually.

**`current-reality`** — the operating truth: how the platform works today, what's
live in production, active processes, current decisions, existing integrations.

> How do payments work today? Search only `platform-current-reality`.

**`components`** — per-component detail: responsibilities, interfaces, inputs and
outputs, dependencies, events produced and consumed, persistence, internal flows.

> Explain how the components participate in payment processing. Search
> `platform-components`.

**`work-in-progress`** — what isn't reality yet: PRDs, proposals, product intent,
designs under evaluation, changes in flight, undecided questions.

> What changes are planned for payments? Search `platform-work-in-progress`.

**`research`** — evaluations, comparisons, proofs of concept, external references,
alternatives nobody has approved.

**`scratchpad`** — unprocessed notes that haven't been validated or promoted.
Treat anything found here as preliminary, not as a source of truth.

## Worked example

You're inside the `component-a` repo. Its default scope:

```yaml
repositories:
  - component-a
  - platform-current-reality
  - platform-components
```

Ask *"how does Component A process a transaction today?"* and the search uses
exactly those three.

Ask *"how does Component A interact with Component B during a transaction?
Include the `component-b` repo"* and it uses four:

```text
component-a
platform-current-reality
platform-components
component-b
```

And when you want to compare today against tomorrow, say so explicitly:

> Compare how payments work today with the proposed changes. Search
> `platform-current-reality`, `platform-components`, and
> `platform-work-in-progress`. Clearly distinguish what exists from what's still
> in development.

The separation is what stops an agent from presenting a proposal as though it
already shipped.

## Tips: setting up multiple indexes

Splitting one body of documentation into several indexes is cheap, but there are
a handful of choices worth getting right the first time.

**Split when the content changes meaning, not when it gets big.** Size isn't the
signal — authority is. Two directories describing the same reality can stay one
index however large they grow. Two directories where one says "this is how it
works" and the other says "this is how it might work" should never share an
index, however small. Before splitting, ask: *would a hit from here mislead
someone who asked about the other?* If yes, split.

**Register the subdirectories, not the parent.** Registered repos can nest, and
nothing stops you registering both `knowledge-base` and
`knowledge-base/research`. But then every research file is indexed twice and
shows up in both — including in searches you scoped narrowly to avoid it. Pick
one level and stay there. If you want the whole tree searchable as a unit *and*
individually, prefer the five separate repos and list all five in a scope when
you genuinely want everything.

**If you must register a parent, exclude the noisy children:**

```bash
local-search repo add ./knowledge-base platform-docs \
  --skip-directory scratchpad \
  --skip-directory research
```

`--skip-directory` takes a folder *name*, matched at any depth — not a path.

**Encode authority in the name.** The repo name is what you'll type into a
scope, what the skill echoes back, and what appears next to every result. Make
it say both *what* the content is and *how much to trust it*:
`platform-current-reality` beats `docs`, and `platform-scratchpad` warns you
before you read the hit. Consistent prefixes (`platform-*`, `payments-*`) also
make the list legible once you have twenty of them.

**Give each project the smallest default that makes it productive.** Different
projects want different combinations of the same indexes — that's the point of
splitting. A service repo usually wants its own docs plus current reality; a
planning workspace wants current reality plus work-in-progress:

```bash
cd payments-service && local-search scope set payments-service,platform-current-reality
cd ../roadmap       && local-search scope set platform-current-reality,platform-work-in-progress
```

**Keep the risky indexes out of every default.** `platform-scratchpad` and
`platform-research` earn their place in a scope only when someone explicitly
asks for exploratory material. Leave them out of project configs and name them
in the prompt when you want them.

**Registered graphs join a scope too.** A `graph:` prefix in `repositories:`
points at a registered external graph rather than a repo, so a scope can mix
document indexes and graph sources:

```yaml
repositories:
  - payments-service
  - platform-current-reality
  - graph:legacy
```

**Verify the split before you rely on it.** Two commands and one search:

```bash
local-search repo list                     # all five indexes present, sensible LAST SCAN
local-search scope show                    # the project resolves to what you expect
local-search find "payments" --scope platform-work-in-progress
```

That last one is the real check — a term you know appears in several indexes,
scoped to one, should come back with hits from only that index.

**Rescan per index.** Each repo rescans independently
(`local-search scan platform-work-in-progress`), so a churning work-in-progress
directory doesn't force a rebuild of your stable current-reality docs. Reserve
`scan all` for genuine full rebuilds.

**Promotion is a file move.** When a proposal ships, moving the document from
`work-in-progress/` to `current-reality/` moves it between indexes on the next
scan — no re-registration, no config edit. That's what makes this layout hold up
over time instead of drifting.

### A granular setup, end to end

Here is the whole thing on one physical directory — a single git repository at
`~/work/knowledge-base`, carved into five logical indexes.

**1. The directory**

```text
~/work/knowledge-base/          ← one git repo, one folder on disk
├── .git/
├── README.md                   ← not indexed (no repo registered at the root)
├── current-reality/
│   ├── payments.md
│   ├── identity.md
│   └── integrations/
│       └── stripe.md
├── components/
│   ├── payments-service.md
│   └── ledger-service.md
├── work-in-progress/
│   ├── prd-instant-payouts.md
│   └── rfc-ledger-rewrite.md
├── research/
│   └── payment-providers-comparison.md
└── scratchpad/
    └── 2026-09-02-notes.md
```

**2. Register each subdirectory as its own index**

```bash
cd ~/work/knowledge-base

local-search repo add ./current-reality    platform-current-reality
local-search repo add ./components         platform-components
local-search repo add ./work-in-progress   platform-work-in-progress
local-search repo add ./research           platform-research
local-search repo add ./scratchpad         platform-scratchpad
```

Each command scans immediately:

```text
Added repo "platform-current-reality" (/Users/you/work/knowledge-base/current-reality)
Scanning…
  platform-current-reality: indexing /Users/you/work/knowledge-base/current-reality…
  platform-current-reality: 3 files indexed
```

Note there is **no** `local-search repo add .` here. Registering the root as
well would index every file a second time, and those duplicates would surface in
scopes you narrowed specifically to exclude them.

**3. Confirm the split**

```bash
$ local-search repo list
NAME                        ADDED   LAST SCAN   LAST UPDATE   COMMIT    PATH
platform-current-reality    2m      2m          —             a1b2c3d   /Users/you/work/knowledge-base/current-reality
platform-components         2m      2m          —             a1b2c3d   /Users/you/work/knowledge-base/components
platform-work-in-progress   1m      1m          —             a1b2c3d   /Users/you/work/knowledge-base/work-in-progress
platform-research           1m      1m          —             a1b2c3d   /Users/you/work/knowledge-base/research
platform-scratchpad         1m      1m          —             a1b2c3d   /Users/you/work/knowledge-base/scratchpad
```

Same `COMMIT` on every row — they're five views of one git repository.

**4. Give each project the slice it needs**

`~/work/payments-service/.agents/local-search-config.yaml` — building the
service, so: its own docs, plus how the platform works today, plus component
contracts. No proposals, no research.

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/metuur-ai/local-search/main/cli/config/schema/local-search-config.schema.json
repositories:
  - payments-service
  - platform-current-reality
  - platform-components
```

`~/work/roadmap/.agents/local-search-config.yaml` — planning, so: today's
reality set against what's proposed. Nothing about a specific service.

```yaml
repositories:
  - platform-current-reality
  - platform-work-in-progress
```

**5. See the isolation working**

The same query against three scopes returns three different realities:

```bash
$ local-search find "instant payouts" --scope platform-current-reality
No results.

$ local-search find "instant payouts" --scope platform-work-in-progress
work-in-progress/prd-instant-payouts.md   PRD: Instant Payouts

$ local-search find "instant payouts" --scope platform-research
research/payment-providers-comparison.md  Payment provider comparison
```

That empty first result is the feature, not a failure: instant payouts *don't
exist yet*, and the current-reality index is the one index that will never claim
otherwise.

### Going finer inside one section

The same pattern nests. If `components/` grows past the point where one index is
useful, split it by domain — still inside the same directory:

```text
knowledge-base/components/
├── payments/
├── identity/
└── ledger/
```

```bash
local-search repo remove platform-components   # drop the coarse index first

local-search repo add ./components/payments  platform-components-payments
local-search repo add ./components/identity  platform-components-identity
local-search repo add ./components/ledger    platform-components-ledger
```

Then a project scopes only to the domains it touches:

```yaml
repositories:
  - payments-service
  - platform-current-reality
  - platform-components-payments
  - platform-components-ledger
```

Remove the coarse index before adding the fine ones — leaving both registered is
the double-indexing trap again, one level down.

## Principles

1. **Configure the normal context.** Every project declares the repos it
   actually needs during ordinary work.
2. **Keep the default small.** Only repos that provide recurring, directly
   relevant context belong in the default list.
3. **Add sources on demand.** When a task needs more, name the repo in the
   prompt or on the command line.
4. **Separate reality, intent, and research.** Shipped documentation, future
   proposals, and experiments shouldn't share a scope without a reason.
5. **Split indexes by usage, not by folder layout.** The boundary that matters
   is the logical one — what the content *is* and how it will be searched. The
   goal isn't maximum indexes; it's preventing a search from returning similar
   documents that belong to a different reality.
6. **Name indexes descriptively.** The name should convey both content and
   authority: `platform-current-reality`, `platform-components`,
   `platform-work-in-progress`, `platform-research`, `platform-scratchpad`.
7. **Ask for traceability.** Have the agent report which documents it used and
   which repos they came from, so you can verify the answer and jump back to the
   source.

## What you get

Default scope plus on-demand additions turns Local Search into a per-project
context layer. It cuts irrelevant results, keeps current documentation from
blurring into future proposals, sharpens what reaches the agent, keeps distinct
areas of knowledge distinct, supports work that spans related components, scales
from a handful of repos to dozens, and produces answers you can trace back to
real documents.

The idea is small:

> Each project defines its normal context. Each prompt can extend it when the
> task requires. Local Search searches only inside that scope, and hands the
> agent the sources it needs to understand the problem.

## See also

- [../how-to/scope-a-project.md](../how-to/scope-a-project.md) — the commands
  that set and inspect scope
- [../how-to/manage-repos.md](../how-to/manage-repos.md) — registering,
  naming, and excluding directories
- [two-config-files.md](two-config-files.md) — the config schema and resolution
  order
- [how-search-works.md](how-search-works.md) — what happens *inside* a scope
