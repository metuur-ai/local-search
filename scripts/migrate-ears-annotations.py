#!/usr/bin/env python3
"""Migrate legacy EARS requirement definitions to the `@spec <ID>` convention.

local-search turns `@spec <ID>` annotations into `spec:` tags (see
user-guide/reference/ears-spec-annotations.md). Older EARS docs define requirements
as bold list items (`- **R-1.3**: ...`) or table rows (`| R-1.3 | ... |`), which are
NOT annotations and so never become tags. This script rewrites those definition
sites to the `@spec <ID>` form.

Two forms are rewritten:

    - **TASKS-012**: When a user ...     ->  - @spec TASKS-012 — When a user ...
    | R-1.3 | WHEN ... SHALL ... |        ->  | @spec R-1.3 | WHEN ... SHALL ... |

Safe by default: prints a unified diff and writes nothing unless you pass --write.
Idempotent: lines that already contain `@spec` are left untouched.

Usage:
    python3 scripts/migrate-ears-annotations.py docs/ears/            # preview
    python3 scripts/migrate-ears-annotations.py docs/ears/ --write    # apply
    python3 scripts/migrate-ears-annotations.py a.md b.md --write
"""

import argparse
import difflib
import re
import sys
from pathlib import Path

EMDASH = "—"

# An EARS requirement id: alpha area prefix, hyphen, dotted number (R-1.3, TASKS-012).
ID = r"[A-Za-z]+-[0-9]+(?:\.[0-9]+)*"

# Bold list-item definition: `- [x] **R-1.3**:  text` / `- **R-1.3** — text`.
# Captures: (1) the list marker + optional checkbox, (2) the id, (3) the rest.
BOLD_LIST_RE = re.compile(
    r"^(\s*[-*]\s+(?:\[[ xX]\]\s+)?)\*\*(" + ID + r")\*\*\s*[:–—-]?\s*(.*)$"
)

# Table row whose FIRST cell is only the id (optionally bold): `| **R-1.3** | ... |`.
# Captures: (1) leading `|` + spaces, (2) the id, (3) the rest of the row.
TABLE_ROW_RE = re.compile(
    r"^(\s*\|\s*)\*{0,2}(" + ID + r")\*{0,2}(\s*\|.*)$"
)


def migrate_line(line: str) -> str:
    """Return the rewritten line, or the original if nothing applies."""
    if "@spec" in line:  # already annotated — idempotent
        return line

    m = BOLD_LIST_RE.match(line)
    if m:
        marker, rid, rest = m.group(1), m.group(2), m.group(3)
        rest = rest.strip()
        return f"{marker}@spec {rid} {EMDASH} {rest}" if rest else f"{marker}@spec {rid}"

    m = TABLE_ROW_RE.match(line)
    if m:
        return f"{m.group(1)}@spec {m.group(2)}{m.group(3)}"

    return line


def migrate_text(text: str) -> tuple[str, int]:
    """Rewrite a whole file's text; return (new_text, num_lines_changed)."""
    out, changed = [], 0
    for line in text.splitlines(keepends=True):
        nl = line[len(line.rstrip("\n")):]  # preserve trailing newline exactly
        body = line[: len(line) - len(nl)]
        new_body = migrate_line(body)
        if new_body != body:
            changed += 1
        out.append(new_body + nl)
    return "".join(out), changed


def iter_md_files(paths):
    for p in paths:
        path = Path(p)
        if path.is_dir():
            yield from sorted(path.rglob("*.md"))
        elif path.suffix.lower() in (".md", ".mdx", ".txt"):
            yield path
        else:
            print(f"skip (not a markdown file/dir): {path}", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser(description="Migrate EARS defs to the @spec <ID> form.")
    ap.add_argument("paths", nargs="+", help="Markdown files or directories to scan.")
    ap.add_argument("--write", action="store_true",
                    help="Apply changes in place (default: print a diff only).")
    args = ap.parse_args()

    total_files, total_lines = 0, 0
    for path in iter_md_files(args.paths):
        try:
            original = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as e:
            print(f"skip {path}: {e}", file=sys.stderr)
            continue
        new_text, changed = migrate_text(original)
        if not changed:
            continue
        total_files += 1
        total_lines += changed
        if args.write:
            path.write_text(new_text, encoding="utf-8")
            print(f"rewrote {changed} line(s): {path}")
        else:
            diff = difflib.unified_diff(
                original.splitlines(keepends=True), new_text.splitlines(keepends=True),
                fromfile=str(path), tofile=str(path) + " (migrated)",
            )
            sys.stdout.writelines(diff)

    verb = "rewrote" if args.write else "would rewrite"
    print(f"\n{verb} {total_lines} line(s) across {total_files} file(s).", file=sys.stderr)
    if not args.write and total_files:
        print("Re-run with --write to apply. Then: local-search scan <repo>", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
