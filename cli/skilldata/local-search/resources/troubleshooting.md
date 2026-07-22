# Troubleshooting

## Common problems

### "No repos added yet"

The tool doesn't know where your specs are. Register a folder:

```bash
local-doc repo add /path/to/your/specs my-project
```

This auto-scans immediately.

### Search returns no results

Check these in order:

1. Are repos registered? `local-doc repo list`
2. Is the path still valid? The folder might have moved.
3. Was the index built? `local-doc stats` — check "Total specs" count.
4. Is your query too narrow? Try broader terms or OR: `local-doc search "refund OR payment"`
5. Force a rebuild: `local-doc scan`

### Index seems stale (missing recent changes)

The index auto-detects file changes on the next search. If it doesn't:

1. Check the file was saved (not just open in editor)
2. Check the file extension is `.md`, `.mdx`, or `.txt`
3. Force rebuild: `local-doc scan`

### sqlite3 not found

`sqlite3` is pre-installed on macOS and most Linux distributions. If missing:

- Ubuntu/Debian: `sudo apt install sqlite3`
- Alpine: `apk add sqlite`
- RHEL/Fedora: `dnf install sqlite`
- macOS: already included

### Prefix search doesn't match expected words

FTS5 uses Porter stemming. Prefix search operates on stemmed tokens, not raw text. "pay*" won't match "payment" because the stem of "payment" is "payment" — use "payment*" instead.

### Database is corrupted

Delete and rebuild:

```bash
rm ~/.local-doc/specs.db
local-doc scan
```

The `.db` is a disposable cache. Your spec files are untouched.

### Nuclear reset

Removes everything — index AND repo registrations:

```bash
local-doc reset
```

Then start fresh with `local-doc repo add`.

## File locations

| File | Path | Purpose |
|---|---|---|
| Repo list | `~/.local-doc/repos` | Text file, one repo per line: `name\|/path` |
| Database | `~/.local-doc/specs.db` | SQLite FTS5 index (disposable cache) |

## Auto-rebuild behavior

The index manages itself:

| Event | What happens |
|---|---|
| `repo add` | Scans all repos immediately |
| `repo remove` | Rebuilds without the removed repo |
| Any query (search, list, etc.) | Checks if files changed since last scan; rebuilds if stale |
| `scan` | Manual force rebuild (rarely needed) |
