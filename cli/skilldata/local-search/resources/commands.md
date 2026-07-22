# Command reference

Complete documentation for all `local-search` commands.

## Version

```bash
local-search -v
local-search --version
```

Prints the current version and exits.

## Table of contents

0. Project scope (init / setup)
1. Repo management
2. Scanning
3. Searching
4. Reading
5. Browsing
6. JSON output (agents)
7. Maintenance

---

## 0. Project scope (init / setup)

Manages the per-project scope file `<project>/.agent/localsearch-config.yaml`, which
declares the registered repositories searched from that project. `init` and `setup`
are exact aliases. The command is non-interactive — the LocalSearch skill drives the
interactive add/remove/modify/review flow and calls these primitives.

```bash
local-search init                     # show current scope + available repos; create file if missing
local-search setup                    # exact alias of init
local-search init --json              # machine state: {path, exists, empty, repositories, available, unknown}
local-search init --add repoA,repoB   # add repos to the scope (comma-separated)
local-search init --remove repoA      # remove repos from the scope
local-search init --set repoA,repoB   # replace the whole scope list ("" clears it)
local-search init --dir <path>        # operate on a project dir other than CWD
```

- Only registered repos are accepted; `--add`/`--set` reject unknown names and list
  the valid ones. External graphs are added as `graph:<name>` entries.
- Any invocation creates `.agent/localsearch-config.yaml` if it does not exist.
- To scope a search from the file (read the list with `local-search init --json`):
  - `local-search search "<query>" --repos repoA,repoB`
  - `local-search find "<query>" --scope repoA,repoB` (also `code`)

File shape:

```yaml
# LocalSearch project scope — repositories searched when running from this project.
# Names must match `local-search repo list`. Managed by `local-search init`.
repositories:
  - platform
  - docs
```

---

## 1. Repo management

### repo add

```bash
local-search repo add <folder> [name] [--skip-directory <folder-name>]...
```

Register a spec folder. Surgically indexes only the newly added repo (other repos are untouched, the DB is never wiped) and stamps its date-added.

- `folder` — path to your spec directory (absolute or relative)
- `name` — optional label (defaults to folder basename)
- `--skip-directory` — exclude a folder by name during indexing (repeatable, persisted)
  - Matches by exact folder **name** only, not full path. `.skills` won't match `.skills-old`.
  - Applies to all future full and incremental scans
- Scans recursively through all subdirectories
- Indexes `.md`, `.mdx`, and `.txt` files

```bash
local-search repo add ./product-specs product
local-search repo add /home/team/docs
local-search repo add ./docs docs --skip-directory .skills
local-search repo add ~/code backend --skip-directory vendor --skip-directory .git
```

### repo remove

```bash
local-search repo remove <name>
  # Example: local-search repo remove product
```

Unregister a repo. Surgically deletes only that repo's rows and its flat-file entry — the DB is not deleted and other repos are not re-scanned.

### repo list

```bash
local-search repo list
```

Shows a column per registered repo: name, date added, last-scan age,
last-index-update age, short (7-char) latest indexed commit, and path. Missing
values render as `—`. Tolerates an absent/unreadable DB (still lists
name/path/date-added and exits 0). Timestamps are human-relative ages.

```
NAME                  ADDED       LAST SCAN    LAST UPDATE  COMMIT    PATH
product               3d          2h           5m           a1b2c3d   /home/team/product-specs
platform              3d          2h           —            —         /home/team/platform-docs
```

---

## 2. Scanning

### scan

```bash
local-search scan              # surgical re-index of the repo the current directory is inside
local-search scan platform     # surgical re-index of one repo (others untouched)
local-search scan all          # full rebuild: delete the DB and re-index every repo
```

With no argument, `scan` resolves the one registered repo your current directory
is inside (deepest match if nested) and re-indexes only that repo. If you are not
inside any registered repo it exits non-zero and suggests `cd`-ing into one or
running `scan all`. Naming an unknown repo errors with `unknown repo <name>`.

Surgical scans are atomic and never delete the database or touch other repos'
rows; `scan all` is the only full-rebuild path (deletes the DB file, recreates
the schema, re-indexes everything). `rebuild` and `index` are exact aliases of
`scan` with identical target resolution.

Usually not needed — the index auto-detects file changes on git repos at query
time. Force a manual scan if auto-detection isn't catching changes.

### scan-hooks

```bash
local-search scan-hooks install                              # prompt for which mechanism(s)
local-search scan-hooks install --mechanism git-hooks,shell  # install both
local-search scan-hooks install --mechanism git-hooks --force  # refresh a stale managed block
local-search scan-hooks uninstall --mechanism shell          # remove one mechanism
```

Installs/uninstalls automation that keeps a repo's index fresh as git activity
happens. Operates on the repo your current directory is inside (same resolution
and same "not inside a registered repo" error as `scan`).

- `--mechanism <list>` — comma-separated, any of `git-hooks`,`shell`. Omit to be
  prompted interactively.
- `--force` — replace a stale managed git-hook block in place.
- **git-hooks** — writes managed (sentinel-delimited) `post-merge`,
  `post-checkout`, `post-rewrite` hooks under `.git/hooks/` (`post-commit`
  excluded). Existing user hook content is preserved; a non-git repo skips this
  mechanism with a message but still installs the others.
- **shell** — writes `~/.local-search/shell-hook.sh` and prints the exact
  `source <path>` line to add to your shell rc (never edits rc files); triggers a
  scan when you `cd` into a registered repo.

When automation fires it runs a **surgical** scan of that repo. It is
non-blocking (git hook always exits 0, scan dispatched detached), change-gated
(skips when no spec files changed since the last indexed commit; non-git repos
always scan), and guarded by a self-healing per-repo lock so overlapping triggers
are a no-op. `uninstall` removes only that mechanism's managed content (deletes a
hook file only if it becomes empty); install is idempotent.

---

## 3. Searching

### search

```bash
local-search search <query> [--repo <name>] [--directory <path>] [--exclude-location <pattern>]...
```

Full-text search across all repos (or one repo if specified). Results show the **full filesystem path** of each match.

| Feature | Syntax | Example |
|---|---|---|
| Keyword | `search refund` | Matches "refund" in any field or content |
| Stemming | `search refunding` | Also matches "refund", "refunds" |
| Boolean OR | `search "refund OR chargeback"` | Either term |
| Boolean NOT | `search "billing NOT fraud"` | Exclude terms |
| Prefix | `search "payment*"` | Words starting with "payment" |
| Phrase | `search '"refund request"'` | Exact phrase |
| Repo filter (flag) | `search "refund" --repo product` | Only search "product" repo |
| Repo filter (positional) | `search refund product` | Legacy positional form |
| Directory filter | `search "refund" --directory billing/` | Only paths starting with `billing/` |
| Combine repo + dir | `search "event" --repo backend --directory integrations/` | Both filters together |
| Exclude location | `search refund --exclude-location archive` | Exclude paths containing "archive" |
| Multi-exclude | `search refund --exclude-location archive --exclude-location tmp` | Multiple patterns |

Results are ranked by relevance (BM25). Best matches first.

```
  [product] /home/team/product-specs/payments/refund-flow.md
    Refund flow  (billing, refund, customer)  .md
  [product] /home/team/product-specs/payments/chargeback.md
    Chargeback handling  (disputes, chargeback)  .md
```

---

## 4. Reading

### read

```bash
local-search read <name> [repo] [--repo <name>] [--directory <path>]
```

Print the full content of a spec. Matches by exact name.

```bash
local-search read refund-flow                       # first match across all repos
local-search read refund-flow product               # from specific repo
local-search read config backend --directory src/   # from specific repo and directory
```

`--directory` narrows by path prefix — useful when the same name exists in multiple directories. If multiple specs still match, all choices are listed.

---

## 5. Browsing

### list

```bash
local-search list                       # all specs, all repos
local-search list platform              # one repo
local-search list payments              # one project (if not a repo name)
```

### projects

```bash
local-search projects
```

### tags

```bash
local-search tags                       # all tags with counts
local-search tags billing               # specs tagged "billing"
```

### related

```bash
local-search related refund-flow
```

Finds specs related to a given spec by analyzing its title and tags.

### recent

```bash
local-search recent                     # default: last 10
local-search recent 20
```

---

## 6. JSON output

Every command has a JSON equivalent for programmatic use by agents.

### json search

```bash
local-search json search <query> [repo]
  # Example: local-search json search "payment" platform
```

Returns:
```json
[
  {
    "repo": "product",
    "project": "payments",
    "name": "refund-flow",
    "title": "Refund flow",
    "tags": "billing, refund, customer, payments",
    "path": "payments/refund-flow.md",
    "fullpath": "/home/team/product-specs/payments/refund-flow.md",
    "ext": "md",
    "relevance": -1.65
  }
]
```

### json read

```bash
local-search json read <name> [repo]
  # Example: local-search json read refund-flow
```

Returns:
```json
{
  "path": "/full/path/to/spec.md",
  "content": "full markdown content..."
}
```

### json list / json repos / json related / json tags / json stats

All return JSON arrays or objects.

---

## 7. Maintenance

### stats

```bash
local-search stats
```

Shows repo count, spec count, projects, tags, DB size, last scan time.

### inspect

```bash
local-search inspect
```

Dumps the full index as readable text. Useful for debugging.

### reset

```bash
local-search reset
```

Deletes everything (index + repo list) and starts fresh.

### Manual rebuild

```bash
rm ~/.local-search/specs.db
local-search scan all
```

Deletes the cache and rebuilds every repo from source files. (`scan all` also
deletes and recreates the DB on its own, so the explicit `rm` is optional.)

## File locations

| Path | Contents |
|---|---|
| `<project>/.agent/localsearch-config.yaml` | Per-project search scope (`repositories:` list). Managed by `local-search init`/`setup`; read by the skill, which passes `--scope` to searches. |
| `~/.local-search/repos` | Registered repo list, pipe-delimited per line: `name\|path`, `name\|path\|skip1,skip2`, or with a 4th date-added field `name\|path\|<skip-dirs>\|<added_at>` (empty 3rd field when there are no skip-dirs: `name\|path\|\|<added_at>`). Legacy 2- and 3-field lines still parse. |
| `~/.local-search/specs.db` | SQLite database (disposable cache — source files are the truth) |
