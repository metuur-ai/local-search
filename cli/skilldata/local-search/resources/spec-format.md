# Spec file format

## Supported file types

- `.md` — Markdown
- `.mdx` — MDX (Markdown + JSX components)
- `.txt` — Plain text

## Any repo structure works

`local-doc` scans recursively from the root of the registered folder. It finds every `.md`, `.mdx`, and `.txt` file regardless of how your repo is organized. You don't need to restructure anything.

All of these work:

```
# Flat folder
docs/
  refund.md
  signup.md
  auth.txt

# Nested monorepo
my-project/
  src/
    payments/
      docs/
        refund.md
    auth/
      README.md
  docs/
    architecture.txt

# Deep nesting
wiki/
  team-a/
    q4/
      2024/
        retro.md

# Mixed content (non-spec files are ignored)
repo/
  src/
    app.ts          ← ignored
    utils.py        ← ignored
  docs/
    setup.md        ← indexed
    api.mdx         ← indexed
  README.md         ← indexed
  package.json      ← ignored
```

The tool only picks up `.md`, `.mdx`, and `.txt` files. Everything else is ignored.

## How folder structure maps to "projects"

The first subfolder level inside your registered repo becomes the "project" name in search results. This is purely for display and filtering — it doesn't affect search quality.

If your repo is registered as `/home/team/docs`:

| File path | Project shown | Name shown |
|---|---|---|
| `/home/team/docs/payments/refund.md` | payments | refund |
| `/home/team/docs/src/auth/README.md` | src | README |
| `/home/team/docs/notes.md` | _root | notes |
| `/home/team/docs/a/b/c/deep.txt` | a | deep |

Files at the repo root get project `_root`. Deeply nested files still use only the first-level folder as their project.

This is cosmetic. If the project grouping doesn't match your structure, it doesn't matter — search, read, tags, and related all work the same regardless.

## Frontmatter (optional)

You can add YAML frontmatter to `.md` and `.mdx` files for tags:

```markdown
---
tags: billing, refund, customer, payments
---

# Refund flow

Your spec content here...
```

The `tags` field is the only frontmatter field used. Tags are comma-separated.

Files without frontmatter work fine — they're indexed by filename, title (first `# heading`), and full content. Frontmatter is a bonus, not a requirement.

## What gets indexed

For each file, the indexer extracts:

| Field | Source | Used for |
|---|---|---|
| name | Filename without extension | Search, display |
| title | First `# heading` in the file (or filename if none) | Search, display |
| tags | YAML frontmatter `tags:` field (if present) | Search, filtering |
| summary | First paragraph after the heading | Display |
| content | Full file text | Deep search |
| project | First subfolder name | Grouping, display |
| repo | Registered repo name | Multi-repo filtering |
| ext | File extension (md, mdx, txt) | Display |

## Tips for better search results

These are optional — the tool works without any of them:

- A clear `# Title` as the first heading gets the most search weight
- Tags in frontmatter help with browsing via `local-doc tags`
- Domain-specific terms anywhere in the body are searchable (full-text index)
- One concept per file tends to produce more focused search results than large omnibus docs
