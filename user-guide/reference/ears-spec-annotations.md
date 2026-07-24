# EARS spec annotations (`@spec`)

local-search turns `@spec` annotations in your indexed docs into **`spec:` tags** —
browsable facets that connect a spec's requirements to the docs (and, if you index
code, the source) that reference them. This page is the exact convention.

## The format

Mark a requirement with an explicit `@spec <ID>` marker. One tag is produced per ID.

**As an EARS requirement definition (list form):**

```markdown
- @spec R-1.3 — WHEN `install --agent copilot` is invoked without `--workspace`,
  THE SYSTEM SHALL install into user-level locations under `$COPILOT_HOME`.
```

**As an EARS requirement table:**

```markdown
| ID              | Requirement                                    |
| --------------- | ---------------------------------------------- |
| @spec R-1.3     | WHEN … THE SYSTEM SHALL …                       |
| @spec TASKS-012 | WHEN a user requests a print … THE SYSTEM SHALL … |
```

**As a reference from prose or code comments:**

```markdown
This screen implements @spec TASKS-012, HEALTH-007.
```

Each of these yields tags you can browse:

| You write            | Tag produced                    |
| -------------------- | ------------------------------- |
| `@spec R-1.3`        | `spec:r-1.3`                    |
| `@spec TASKS-012`    | `spec:tasks-012`               |
| `@spec A-1, B-2.3`   | `spec:a-1`, `spec:b-2.3`       |

## What counts as an ID

Any `AREA-NUMBER` token: an alphabetic area prefix, a hyphen, then a dotted
number. Both common EARS schemes work:

- `R-<story>.<req>` — e.g. `R-1.3`, `R-2.11`
- `<DOMAIN>-<NNN>` — e.g. `TASKS-012`, `HEALTH-007`

IDs are lowercased in the tag (`R-1.3` → `spec:r-1.3`). Comma-separated lists are
split into one tag each.

## The rules (what is and isn't captured)

- **The `@spec` marker is required.** A bare `R-1.3` in prose, a `(R-1.3)` in a
  comment banner, or a table full of unrelated `R-1.x` rows is **not** tagged. This
  is deliberate — the explicit marker is what keeps noise out of your facets.
- **Only indexed file types are scanned:** `.md`, `.mdx`, `.txt`. Annotations in
  code files (`.tsx`, `.py`, `.go`, …) are **not** picked up, because local-search
  does not index source files. Put `@spec` markers in your docs.
- **Fenced code is ignored.** A `@spec` shown inside a ``` ``` ``` block (e.g. a
  "how to annotate" example) is not tagged — only real annotations in prose are.
- **Duplicates collapse.** The same ID annotated twice in one doc yields one tag.

## Browsing spec tags

```bash
local-search tags                 # every tag with counts (spec:… included)
local-search tags spec:r-1.3      # every doc annotated @spec R-1.3
```

In the web UI, `spec:` tags appear in the tag facet dropdown alongside `#`-tags,
so you can filter results to a single requirement.

## Also supported: the URI form

The longer `@spec req://<path>/<id>@<version>#<clause>` form is still recognized and
maps to `spec:<path>/<id>` (version and clause are dropped). Use whichever fits;
for most EARS docs the short `@spec <ID>` form above is the recommended convention.

## Migrating existing docs

If your docs already define requirements as `**R-1.3**:` bold items or `| R-1.3 |`
table rows, `scripts/migrate-ears-annotations.py` rewrites them to the `@spec <ID>`
form. It is a **dry-run by default** — it prints a diff and changes nothing until
you pass `--write`:

```bash
python3 scripts/migrate-ears-annotations.py docs/ears/        # preview
python3 scripts/migrate-ears-annotations.py docs/ears/ --write  # apply
```

After migrating, re-scan the affected repo so the new tags land in the index:

```bash
local-search scan <repo>
```
