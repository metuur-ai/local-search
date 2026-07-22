#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# local-search — multi-repo spec registry with full-text search
#
# Scan multiple spec repos, search across all of them instantly.
# Powered by SQLite FTS5. Uses pre-installed sqlite3.
# The .db is a disposable cache — your files are the source of truth.
#
# Supports: .md  .mdx  .txt  .jpg  .jpeg  .png  .gif  .webp  .svg  .pdf
#
# ─────────────────────────────────────────────────────────

set -euo pipefail

# ── Config ──────────────────────────────────────────────

APP_DIR="${HOME}/.local-search"
REPOS_FILE="${APP_DIR}/repos"
DB_FILE="${APP_DIR}/specs.db"

# File extensions to index (text-based)
FILE_PATTERNS=(-name '*.md' -o -name '*.mdx' -o -name '*.txt')

# Media/binary extensions requiring a companion .md for metadata
MEDIA_PATTERNS=(-name '*.jpg' -o -name '*.jpeg' -o -name '*.png' -o -name '*.gif' -o -name '*.webp' -o -name '*.svg' -o -name '*.pdf')

# ── Helpers ─────────────────────────────────────────────

die() { printf 'Error: %s\n' "$1" >&2; exit 1; }

ensure_sqlite() {
  command -v sqlite3 &>/dev/null || die "sqlite3 not found.
  It comes pre-installed on macOS and most Linux.
  Ubuntu/Debian:  sudo apt install sqlite3
  Alpine:         apk add sqlite
  RHEL/Fedora:    dnf install sqlite"
}

ensure_repos() {
  [[ -f "$REPOS_FILE" ]] || die "No repos added yet. Run: local-search repo add /path/to/specs"
}

is_git_repo() {
  [[ -d "$1/.git" ]] || git -C "$1" rev-parse --git-dir &>/dev/null
}

# Detect changed spec files in a git repo since last scanned commit.
# Prints changed file paths (relative to repo root), one per line.
# Returns 1 if no changes detected, 0 if changes found.
git_changed_files() {
  local rname="$1" rpath="$2"
  local last_commit current_commit

  current_commit="$(git -C "$rpath" rev-parse HEAD 2>/dev/null)" || return 1
  last_commit="$(sql "SELECT value FROM meta WHERE key='git_commit_$(e "$rname")';" 2>/dev/null)"

  local changed_files=""

  if [[ -z "$last_commit" ]]; then
    # Never scanned with git — treat all spec files as changed
    changed_files="$(git -C "$rpath" ls-files -- '*.md' '*.mdx' '*.txt' '*.jpg' '*.jpeg' '*.png' '*.gif' '*.webp' '*.svg' '*.pdf' 2>/dev/null)"
  elif [[ "$last_commit" != "$current_commit" ]]; then
    # Committed changes since last scan
    changed_files="$(git -C "$rpath" diff --name-only "$last_commit" "$current_commit" -- '*.md' '*.mdx' '*.txt' '*.jpg' '*.jpeg' '*.png' '*.gif' '*.webp' '*.svg' '*.pdf' 2>/dev/null)"
  fi

  # Also check uncommitted changes (staged + unstaged + untracked spec files)
  local dirty
  dirty="$(git -C "$rpath" diff --name-only -- '*.md' '*.mdx' '*.txt' '*.jpg' '*.jpeg' '*.png' '*.gif' '*.webp' '*.svg' '*.pdf' 2>/dev/null)"
  local staged
  staged="$(git -C "$rpath" diff --cached --name-only -- '*.md' '*.mdx' '*.txt' '*.jpg' '*.jpeg' '*.png' '*.gif' '*.webp' '*.svg' '*.pdf' 2>/dev/null)"
  local untracked
  untracked="$(git -C "$rpath" ls-files --others --exclude-standard -- '*.md' '*.mdx' '*.txt' '*.jpg' '*.jpeg' '*.png' '*.gif' '*.webp' '*.svg' '*.pdf' 2>/dev/null)"

  # Combine all sources, deduplicate
  changed_files="$(printf '%s\n%s\n%s\n%s' "$changed_files" "$dirty" "$staged" "$untracked" | sort -u | sed '/^$/d')"

  if [[ -z "$changed_files" ]]; then
    return 1
  fi

  echo "$changed_files"
  return 0
}

# Index a media/binary asset using its companion .md file for metadata.
# Args: $1=rname $2=rpath $3=asset_rel (relative path to image/PDF)
#       $4=populate_fts (1=insert into FTS now; 0=skip, caller does bulk FTS later)
# Returns 0 if indexed, 1 if skipped (no companion or empty .md).
index_asset_with_companion() {
  local rname="$1" rpath="$2" asset_rel="$3" populate_fts="${4:-1}"
  local asset_file="${rpath}/${asset_rel}"

  # Derive companion .md: same dir, same basename, .md extension
  local dir name_no_ext companion_rel companion_file
  dir="$(dirname "$asset_rel")"
  name_no_ext="$(basename "$asset_rel")"
  name_no_ext="${name_no_ext%.*}"
  [[ "$dir" == "." ]] && companion_rel="${name_no_ext}.md" || companion_rel="${dir}/${name_no_ext}.md"
  companion_file="${rpath}/${companion_rel}"

  # Companion must exist and be non-empty
  if [[ ! -f "$companion_file" ]] || [[ ! -s "$companion_file" ]]; then
    printf 'Warning: %s — skipped (no companion .md with metadata)\n' "$asset_file" >&2
    return 1
  fi

  local project
  [[ "$asset_rel" == */* ]] && project="${asset_rel%%/*}" || project="_root"

  local ext="${asset_file##*.}"
  local name="$name_no_ext"

  # Metadata from companion .md
  local title
  title="$(grep -m1 '^#[[:space:]]' "$companion_file" 2>/dev/null | sed 's/^#[[:space:]]*//' || true)"
  [[ -z "$title" ]] && title="$name"

  local tags=""
  if head -1 "$companion_file" 2>/dev/null | grep -q '^---'; then
    tags="$(sed -n '/^---$/,/^---$/p' "$companion_file" | grep -i '^tags:' | sed 's/^tags:[[:space:]]*//' || true)"
  fi

  local summary
  summary="$(awk '
    BEGIN { fm=0; got=0 }
    /^---$/ && NR==1 { fm=1; next }
    /^---$/ && fm { fm=0; next }
    fm { next }
    /^#/ { next }
    /^[[:space:]]*$/ { if (got) exit; next }
    { got=1; print }
  ' "$companion_file" | head -c 300)"

  # modified/size from the asset file itself
  local modified size
  modified="$(stat -c '%Y' "$asset_file" 2>/dev/null || stat -f '%m' "$asset_file" 2>/dev/null || echo "0")"
  size="$(stat -c '%s' "$asset_file" 2>/dev/null || stat -f '%z' "$asset_file" 2>/dev/null || echo "0")"

  # path = asset rel path (unique key); fullpath = asset absolute path (what AI opens)
  # content = companion .md content (what FTS indexes)
  sql "INSERT OR REPLACE INTO specs (repo, path, project, name, title, tags, summary, fullpath, modified, size, ext, content)
       VALUES ('$(e "$rname")', '$(e "$asset_rel")', '$(e "$project")', '$(e "$name")', '$(e "$title")', '$(e "$tags")', '$(e "$summary")', '$(e "$asset_file")', '$(e "$modified")', ${size}, '$(e "$ext")', readfile('$(e "$companion_file")'));" 2>/dev/null

  local new_id
  new_id="$(sql "SELECT id FROM specs WHERE repo='$(e "$rname")' AND path='$(e "$asset_rel")';")"
  if [[ -n "$new_id" ]]; then
    if [[ "$populate_fts" -eq 1 ]]; then
      sql "INSERT INTO specs_fts (rowid, repo, name, title, tags, summary, content)
           SELECT id, repo, name, title, tags, summary, content FROM specs WHERE id=${new_id};" 2>/dev/null
    fi

    if [[ -n "$tags" ]]; then
      local IFS=','
      for tag in $tags; do
        tag="$(printf '%s' "$tag" | sed "s/^[[:space:]]*//;s/[[:space:]]*$//")"
        [[ -n "$tag" ]] && sql "INSERT INTO spec_tags (spec_id, tag) VALUES (${new_id}, '$(e "$tag")');"
      done
    fi
  fi

  return 0
}

# Incremental re-index: update only the changed files for a git repo.
incremental_reindex() {
  local rname="$1" rpath="$2" changed_files="$3"
  local count=0

  while IFS= read -r rel; do
    [[ -z "$rel" ]] && continue

    # Classify: media file or text file?
    local file_ext="${rel##*.}"
    local is_media=0
    case "$file_ext" in jpg|jpeg|png|gif|webp|svg|pdf) is_media=1 ;; esac
    local file="${rpath}/${rel}"

    # Media branch
    if [[ "$is_media" -eq 1 ]]; then
      if [[ ! -f "$file" ]]; then
        # Asset deleted — remove its DB entry by asset path
        local spec_id
        spec_id="$(sql "SELECT id FROM specs WHERE repo='$(e "$rname")' AND path='$(e "$rel")';" 2>/dev/null)"
        if [[ -n "$spec_id" ]]; then
          fts_delete "$spec_id"
          sql "DELETE FROM spec_tags WHERE spec_id=${spec_id};" 2>/dev/null
          sql "DELETE FROM specs WHERE id=${spec_id};" 2>/dev/null
        fi
      else
        # Asset changed — delete old row, re-index via companion helper
        local old_id
        old_id="$(sql "SELECT id FROM specs WHERE repo='$(e "$rname")' AND path='$(e "$rel")';" 2>/dev/null)"
        if [[ -n "$old_id" ]]; then
          fts_delete "$old_id"
          sql "DELETE FROM spec_tags WHERE spec_id=${old_id};" 2>/dev/null
          sql "DELETE FROM specs WHERE id=${old_id};" 2>/dev/null
        fi
        index_asset_with_companion "$rname" "$rpath" "$rel" && count=$((count + 1))
      fi
      continue
    fi

    # If text file was deleted, remove from index
    if [[ ! -f "$file" ]]; then
      local spec_id
      spec_id="$(sql "SELECT id FROM specs WHERE repo='$(e "$rname")' AND path='$(e "$rel")';" 2>/dev/null)"
      if [[ -n "$spec_id" ]]; then
        fts_delete "$spec_id"
        sql "DELETE FROM spec_tags WHERE spec_id=${spec_id};" 2>/dev/null
        sql "DELETE FROM specs WHERE id=${spec_id};" 2>/dev/null
      fi
      continue
    fi

    # Skip .md/.mdx files that have a media companion — the media entry covers them
    local _name_no_ext="${rel%.*}"
    local _has_media=0
    for _mext in jpg jpeg png gif webp svg pdf; do
      [[ -f "${rpath}/${_name_no_ext}.${_mext}" ]] && { _has_media=1; break; }
    done
    [[ "$_has_media" -eq 1 ]] && continue

    local project
    [[ "$rel" == */* ]] && project="${rel%%/*}" || project="_root"

    local ext="${file##*.}"
    local name
    name="$(basename "$rel")"
    name="${name%.*}"

    local title
    title="$(grep -m1 '^#[[:space:]]' "$file" 2>/dev/null | sed 's/^#[[:space:]]*//' || true)"
    [[ -z "$title" ]] && title="$name"

    local tags=""
    if head -1 "$file" 2>/dev/null | grep -q '^---'; then
      tags="$(sed -n '/^---$/,/^---$/p' "$file" | grep -i '^tags:' | sed 's/^tags:[[:space:]]*//' || true)"
    fi

    local summary
    summary="$(awk '
      BEGIN { fm=0; got=0 }
      /^---$/ && NR==1 { fm=1; next }
      /^---$/ && fm { fm=0; next }
      fm { next }
      /^#/ { next }
      /^[[:space:]]*$/ { if (got) exit; next }
      { got=1; print }
    ' "$file" | head -c 300)"

    local modified size
    modified="$(stat -c '%Y' "$file" 2>/dev/null || stat -f '%m' "$file" 2>/dev/null || echo "0")"
    size="$(stat -c '%s' "$file" 2>/dev/null || stat -f '%z' "$file" 2>/dev/null || echo "0")"

    # Remove old entry if exists
    local old_id
    old_id="$(sql "SELECT id FROM specs WHERE repo='$(e "$rname")' AND path='$(e "$rel")';" 2>/dev/null)"
    if [[ -n "$old_id" ]]; then
      fts_delete "$old_id"
      sql "DELETE FROM spec_tags WHERE spec_id=${old_id};" 2>/dev/null
      sql "DELETE FROM specs WHERE id=${old_id};" 2>/dev/null
    fi

    # Insert fresh
    sql "INSERT INTO specs (repo, path, project, name, title, tags, summary, fullpath, modified, size, ext, content)
         VALUES ('$(e "$rname")', '$(e "$rel")', '$(e "$project")', '$(e "$name")', '$(e "$title")', '$(e "$tags")', '$(e "$summary")', '$(e "$file")', '$(e "$modified")', ${size}, '$(e "$ext")', readfile('$(e "$file")'));" 2>/dev/null

    # FTS entry
    local new_id
    new_id="$(sql "SELECT id FROM specs WHERE repo='$(e "$rname")' AND path='$(e "$rel")';")"
    sql "INSERT INTO specs_fts (rowid, repo, name, title, tags, summary, content)
         SELECT id, repo, name, title, tags, summary, content FROM specs WHERE id=${new_id};" 2>/dev/null

    # Tags
    if [[ -n "$tags" ]]; then
      local IFS=','
      for tag in $tags; do
        tag="$(printf '%s' "$tag" | sed "s/^[[:space:]]*//;s/[[:space:]]*$//")"
        [[ -n "$tag" ]] && sql "INSERT INTO spec_tags (spec_id, tag) VALUES (${new_id}, '$(e "$tag")');"
      done
    fi

    count=$((count + 1))

    # Propagate to any media companion with the same base name
    local dir_part name_part
    dir_part="$(dirname "$rel")"
    name_part="$(basename "$rel")"
    name_part="${name_part%.*}"
    for media_ext in jpg jpeg png gif webp svg pdf; do
      local media_rel
      [[ "$dir_part" == "." ]] && media_rel="${name_part}.${media_ext}" || media_rel="${dir_part}/${name_part}.${media_ext}"
      local media_file="${rpath}/${media_rel}"
      if [[ -f "$media_file" ]]; then
        local old_media_id
        old_media_id="$(sql "SELECT id FROM specs WHERE repo='$(e "$rname")' AND path='$(e "$media_rel")';" 2>/dev/null)"
        if [[ -n "$old_media_id" ]]; then
          fts_delete "$old_media_id"
          sql "DELETE FROM spec_tags WHERE spec_id=${old_media_id};" 2>/dev/null
          sql "DELETE FROM specs WHERE id=${old_media_id};" 2>/dev/null
        fi
        index_asset_with_companion "$rname" "$rpath" "$media_rel" || true
      fi
    done
  done <<< "$changed_files"

  echo "  ${rname}: ${count} files updated (incremental)"
}

ensure_db() {
  if [[ ! -f "$DB_FILE" ]]; then
    # No DB at all — full build
    cmd_scan
    return
  fi

  local needs_rebuild=""

  while IFS='|' read -r rname rpath; do
    [[ -d "$rpath" ]] || continue

    if is_git_repo "$rpath"; then
      # Git-based change detection
      local changed
      if changed="$(git_changed_files "$rname" "$rpath")"; then
        echo "(${rname}: git changes detected — incremental update...)"
        echo ""
        incremental_reindex "$rname" "$rpath" "$changed"
        # Store current commit
        local commit
        commit="$(git -C "$rpath" rev-parse HEAD 2>/dev/null)"
        [[ -n "$commit" ]] && sql "INSERT OR REPLACE INTO meta VALUES ('git_commit_$(e "$rname")', '$(e "$commit")');"
        echo ""
      fi
    else
      # Fallback: filesystem timestamp comparison
      local latest
      latest="$(find "$rpath" -type f \( \( "${FILE_PATTERNS[@]}" \) -o \( "${MEDIA_PATTERNS[@]}" \) \) -newer "$DB_FILE" -print -quit 2>/dev/null)"
      if [[ -n "$latest" ]]; then
        needs_rebuild="$rname"
        break
      fi
    fi
  done < "$REPOS_FILE"

  if [[ -n "$needs_rebuild" ]]; then
    echo "(Index is stale — auto-rebuilding...)"
    echo ""
    cmd_scan
  fi
}

sql() { sqlite3 "$DB_FILE" "$@"; }
sql_json() { sqlite3 -json "$DB_FILE" "$@"; }

# Escape a string for safe embedding in a SQLite single-quoted literal.
# Replaces every ' with '' (the only escape SQLite recognises).
# Usage: val=$(e "$untrusted_string")  then use '$val' in SQL.
e() { printf '%s' "$1" | sed "s/'/''/g"; }

# Remove a row from the contentless FTS5 index by rowid.
# FTS5 contentless tables don't support DELETE — use the 'delete' command instead.
fts_delete() {
  local rid="$1"
  sql "INSERT INTO specs_fts (specs_fts, rowid, repo, name, title, tags, summary, content)
       SELECT 'delete', id, repo, name, title, tags, summary, content FROM specs WHERE id=${rid};" 2>/dev/null || true
}

# ── Schema ──────────────────────────────────────────────

create_schema() {
  sql <<'SQL'
    CREATE TABLE IF NOT EXISTS repos (
      id    INTEGER PRIMARY KEY,
      name  TEXT UNIQUE NOT NULL,
      path  TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS specs (
      id        INTEGER PRIMARY KEY,
      repo      TEXT NOT NULL,
      path      TEXT NOT NULL,
      project   TEXT NOT NULL,
      name      TEXT NOT NULL,
      title     TEXT NOT NULL,
      tags      TEXT DEFAULT '',
      summary   TEXT DEFAULT '',
      fullpath  TEXT NOT NULL,
      modified  TEXT NOT NULL,
      size      INTEGER NOT NULL,
      ext       TEXT NOT NULL,
      content   TEXT DEFAULT '',
      UNIQUE(repo, path)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS specs_fts USING fts5(
      repo,
      name,
      title,
      tags,
      summary,
      content,
      content='',
      tokenize='porter unicode61'
    );

    CREATE TABLE IF NOT EXISTS spec_tags (
      spec_id INTEGER NOT NULL,
      tag     TEXT NOT NULL,
      FOREIGN KEY (spec_id) REFERENCES specs(id)
    );
    CREATE INDEX IF NOT EXISTS idx_tags ON spec_tags(tag);

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
SQL
}

# ── Repo Management ─────────────────────────────────────

cmd_repo() {
  local subcmd="${1:-help}"
  shift || true

  case "$subcmd" in
    add)
      local dir="${1:?Usage: local-search repo add /path/to/specs [name]}"
      dir="$(cd "$dir" 2>/dev/null && pwd)" || die "Folder not found: $1"
      local rname="${2:-$(basename "$dir")}"

      mkdir -p "$APP_DIR"
      # Append if not already present
      if grep -q "^${rname}|" "$REPOS_FILE" 2>/dev/null; then
        die "Repo '${rname}' already exists. Remove it first or use a different name."
      fi
      echo "${rname}|${dir}" >> "$REPOS_FILE"
      echo "Added repo: ${rname} → ${dir}"
      echo ""
      # Auto-scan immediately (Option A)
      cmd_scan
      ;;

    remove|rm)
      local rname="${1:?Usage: local-search repo remove <name>}"
      ensure_repos
      if ! grep -q "^${rname}|" "$REPOS_FILE"; then
        die "Repo '${rname}' not found."
      fi
      grep -v "^${rname}|" "$REPOS_FILE" > "${REPOS_FILE}.tmp" || true
      mv "${REPOS_FILE}.tmp" "$REPOS_FILE"
      echo "Removed repo: ${rname}"
      echo ""
      # Auto-rebuild without the removed repo
      if [[ -s "$REPOS_FILE" ]]; then
        cmd_scan
      else
        rm -f "$DB_FILE"
        echo "No repos left. Index cleared."
      fi
      ;;

    list|ls)
      if [[ ! -f "$REPOS_FILE" ]] || [[ ! -s "$REPOS_FILE" ]]; then
        echo "No repos added yet."
        echo ""
        echo "Add one:  local-search repo add /path/to/specs"
        return 0
      fi
      echo "Registered repos:"
      echo ""
      while IFS='|' read -r rname rpath; do
        local fcount
        fcount="$(find "$rpath" -type f \( \( "${FILE_PATTERNS[@]}" \) -o \( "${MEDIA_PATTERNS[@]}" \) \) 2>/dev/null | wc -l | tr -d ' ')"
        echo "  ${rname}"
        echo "    ${rpath}"
        echo "    ${fcount} files (.md .mdx .txt .jpg .png .pdf …)"
        echo ""
      done < "$REPOS_FILE"
      ;;

    *)
      echo "Usage: local-search repo <add|remove|list>"
      echo ""
      echo "  repo add /path [name]   Add a spec repo"
      echo "  repo remove <name>      Remove a repo"
      echo "  repo list               Show all repos"
      ;;
  esac
}

# ── Index Builder ───────────────────────────────────────

index_repo() {
  local rname="$1"
  local rpath="$2"
  local count=0

  [[ -d "$rpath" ]] || { echo "  Warning: ${rpath} not found, skipping."; return 0; }

  while IFS= read -r -d '' file; do
    local rel="${file#$rpath/}"

    # Skip .md/.mdx files that have a media companion — indexed_asset_with_companion handles them
    local name_no_ext="${rel%.*}"
    local has_media=0
    for _mext in jpg jpeg png gif webp svg pdf; do
      [[ -f "${rpath}/${name_no_ext}.${_mext}" ]] && { has_media=1; break; }
    done
    [[ "$has_media" -eq 1 ]] && continue

    local project
    [[ "$rel" == */* ]] && project="${rel%%/*}" || project="_root"

    local ext="${file##*.}"
    local name
    name="$(basename "$rel")"
    name="${name%.*}"  # strip any extension

    # Title: first H1 line, or filename
    local title
    title="$(grep -m1 '^#[[:space:]]' "$file" 2>/dev/null | sed 's/^#[[:space:]]*//' || true)"
    [[ -z "$title" ]] && title="$name"

    # Tags from YAML frontmatter
    local tags=""
    if head -1 "$file" 2>/dev/null | grep -q '^---'; then
      tags="$(sed -n '/^---$/,/^---$/p' "$file" | grep -i '^tags:' | sed 's/^tags:[[:space:]]*//' || true)"
    fi

    # Summary: first paragraph after heading
    local summary
    summary="$(awk '
      BEGIN { fm=0; got=0 }
      /^---$/ && NR==1 { fm=1; next }
      /^---$/ && fm { fm=0; next }
      fm { next }
      /^#/ { next }
      /^[[:space:]]*$/ { if (got) exit; next }
      { got=1; print }
    ' "$file" | head -c 300)"

    local modified size
    modified="$(stat -c '%Y' "$file" 2>/dev/null || stat -f '%m' "$file" 2>/dev/null || echo "0")"
    size="$(stat -c '%s' "$file" 2>/dev/null || stat -f '%z' "$file" 2>/dev/null || echo "0")"

    sql "INSERT INTO specs (repo, path, project, name, title, tags, summary, fullpath, modified, size, ext, content)
         VALUES ('$(e "$rname")', '$(e "$rel")', '$(e "$project")', '$(e "$name")', '$(e "$title")', '$(e "$tags")', '$(e "$summary")', '$(e "$file")', '$(e "$modified")', ${size}, '$(e "$ext")', readfile('$(e "$file")'));" 2>/dev/null

    # Tags
    if [[ -n "$tags" ]]; then
      local IFS=','
      for tag in $tags; do
        tag="$(printf '%s' "$tag" | sed "s/^[[:space:]]*//;s/[[:space:]]*$//")"
        [[ -n "$tag" ]] && sql "INSERT INTO spec_tags (spec_id, tag) VALUES ((SELECT id FROM specs WHERE repo='$(e "$rname")' AND path='$(e "$rel")'), '$(e "$tag")');"
      done
    fi

    count=$((count + 1))
  done < <(find "$rpath" \( "${FILE_PATTERNS[@]}" \) -type f -print0 | sort -z)

  # Scan media files — each requires a companion .md for metadata
  local media_count=0
  while IFS= read -r -d '' asset_file; do
    local asset_rel="${asset_file#$rpath/}"
    if index_asset_with_companion "$rname" "$rpath" "$asset_rel" 0; then
      media_count=$((media_count + 1))
    fi
  done < <(find "$rpath" \( "${MEDIA_PATTERNS[@]}" \) -type f -print0 | sort -z)
  count=$((count + media_count))

  echo "  ${rname}: ${count} files indexed"
  return $count
}

cmd_scan() {
  local target="${1:-all}"
  ensure_repos
  mkdir -p "$APP_DIR"

  # Fresh DB
  rm -f "$DB_FILE"
  create_schema

  echo "Scanning repos..."
  echo ""

  local total=0

  if [[ "$target" == "all" ]]; then
    while IFS='|' read -r rname rpath; do
      index_repo "$rname" "$rpath" || true
      local rc=$?
      total=$((total + rc))
    done < "$REPOS_FILE"
  else
    # Scan a specific repo
    local rpath
    rpath="$(grep "^${target}|" "$REPOS_FILE" | cut -d'|' -f2)"
    [[ -n "$rpath" ]] || die "Repo '${target}' not found. Run: local-search repo list"
    index_repo "$target" "$rpath" || true
    total=$?
  fi

  # Populate FTS
  sql "INSERT INTO specs_fts (rowid, repo, name, title, tags, summary, content)
       SELECT id, repo, name, title, tags, summary, content FROM specs;"

  # Store repos in DB too
  while IFS='|' read -r rname rpath; do
    sql "INSERT OR REPLACE INTO repos (name, path) VALUES ('$(e "$rname")', '$(e "$rpath")');"
  done < "$REPOS_FILE"

  # Store git commit hashes for incremental detection on next query
  while IFS='|' read -r rname rpath; do
    if is_git_repo "$rpath"; then
      local commit
      commit="$(git -C "$rpath" rev-parse HEAD 2>/dev/null)"
      [[ -n "$commit" ]] && sql "INSERT OR REPLACE INTO meta VALUES ('git_commit_${rname//\'/\'\'}', '${commit}');"
    fi
  done < "$REPOS_FILE"

  sql "INSERT OR REPLACE INTO meta VALUES ('last_scan', datetime('now'));"

  echo ""
  echo "Done. Run 'local-search search <keyword>' to find specs."
}

# ── Search ──────────────────────────────────────────────

cmd_search() {
  local query="${1:?Usage: local-search search <query>}"
  local repo_filter="${2:-}"
  ensure_repos; ensure_db

  local where_clause="specs_fts MATCH '$(e "$query")'"
  [[ -n "$repo_filter" ]] && where_clause="${where_clause} AND s.repo = '$(e "$repo_filter")'"

  local results
  results="$(sql "SELECT s.repo, s.project || '/' || s.name, s.title, COALESCE(NULLIF(s.tags, ''), '-'), s.ext, s.fullpath FROM specs_fts f JOIN specs s ON s.id = f.rowid WHERE ${where_clause} ORDER BY f.rank LIMIT 20;" 2>/dev/null)" || true

  if [[ -z "$results" ]]; then
    echo "No specs found for: ${query}"
    echo ""
    echo "Tips:"
    echo "  Broader term, or prefix: local-search search \"ref*\""
    echo "  Boolean: local-search search \"refund OR chargeback\""
    echo "  Browse: local-search list"
    return 0
  fi

  echo "Results for \"${query}\":"
  [[ -n "$repo_filter" ]] && echo "(filtered to repo: ${repo_filter})"
  echo ""

  local i=1
  while IFS='|' read -r repo path title tags ext fullpath; do
    printf "  %d. [%s] %s  (.%s)\n" "$i" "$repo" "$path" "$ext"
    printf "     %s\n" "$title"
    [[ "$tags" != "-" ]] && printf "     tags: %s\n" "$tags"
    printf "     %s\n" "$fullpath"
    echo ""
    i=$((i + 1))
  done <<< "$results"
}

# ── Read ────────────────────────────────────────────────

cmd_read() {
  local query="${1:?Usage: local-search read <name>}"
  local repo_filter="${2:-}"
  ensure_repos; ensure_db

  local where="LOWER(name) LIKE '%$(printf '%s' "$query" | tr '[:upper:]' '[:lower:]' | sed "s/'/''/g")%'"
  [[ -n "$repo_filter" ]] && where="${where} AND repo = '$(e "$repo_filter")'"

  local fullpath
  fullpath="$(sql "SELECT fullpath FROM specs WHERE ${where} LIMIT 1;")"

  if [[ -z "$fullpath" ]]; then
    echo "No spec found matching: ${query}"
    echo ""
    cmd_search "$query" "$repo_filter"
    return 1
  fi

  local match_count
  match_count="$(sql "SELECT COUNT(*) FROM specs WHERE ${where};")"

  if [[ "$match_count" -gt 1 ]]; then
    echo "Multiple matches for \"${query}\". Showing first."
    echo "All matches:"
    sql "SELECT '  [' || repo || '] ' || project || '/' || name FROM specs WHERE ${where};"
    echo ""
    echo "─────────────────────────────────────────"
    echo ""
  fi

  cat "$fullpath"
}

# ── List ────────────────────────────────────────────────

cmd_list() {
  local filter="${1:-}"
  ensure_repos; ensure_db

  if [[ -n "$filter" ]]; then
    # Could be a repo name or project name — try repo first
    local is_repo
    is_repo="$(sql "SELECT COUNT(*) FROM repos WHERE name = '${filter//\'/\'\'}';")"

    if [[ "$is_repo" -gt 0 ]]; then
      echo "Specs in repo \"${filter}\":"
      echo ""
      local prev=""
      sql "SELECT project, name, title, ext FROM specs WHERE repo = '${filter//\'/\'\'}' ORDER BY project, name;" | while IFS='|' read -r proj nm tit ext; do
        if [[ "$proj" != "$prev" ]]; then
          echo "  ${proj}/"
          prev="$proj"
        fi
        echo "    ${nm}.${ext} — ${tit}"
      done
    else
      echo "Specs in project \"${filter}\":"
      echo ""
      sql "SELECT '  [' || repo || '] ' || name || '.' || ext || '  —  ' || title FROM specs WHERE project = '${filter//\'/\'\'}' ORDER BY repo, name;"
    fi
  else
    echo "All specs:"
    echo ""
    local prev_repo=""
    sql "SELECT repo, project, name, title, ext FROM specs ORDER BY repo, project, name;" | while IFS='|' read -r repo proj nm tit ext; do
      if [[ "$repo" != "$prev_repo" ]]; then
        [[ -n "$prev_repo" ]] && echo ""
        echo "  [$repo]"
        prev_repo="$repo"
      fi
      echo "    ${proj}/${nm}.${ext} — ${tit}"
    done
  fi
  echo ""
}

# ── Projects ────────────────────────────────────────────

cmd_projects() {
  ensure_repos; ensure_db

  echo "Projects:"
  echo ""
  sql "SELECT '  [' || repo || '] ' || project || ' (' || COUNT(*) || ' specs)' FROM specs GROUP BY repo, project ORDER BY repo, project;"
}

# ── Related ─────────────────────────────────────────────

cmd_related() {
  local query="${1:?Usage: local-search related <name>}"
  ensure_repos; ensure_db

  local spec_name spec_title spec_tags
  spec_name="$(sql "SELECT name FROM specs WHERE LOWER(name) LIKE '%$(echo "$query" | tr '[:upper:]' '[:lower:]' | sed "s/'/''/g")%' LIMIT 1;")"
  spec_title="$(sql "SELECT title FROM specs WHERE name = '${spec_name//\'/\'\'}' LIMIT 1;")"
  spec_tags="$(sql "SELECT tags FROM specs WHERE name = '${spec_name//\'/\'\'}' LIMIT 1;")"

  [[ -z "$spec_name" ]] && { echo "No spec found matching: ${query}"; return 1; }

  local search_terms
  search_terms="$(echo "${spec_title} ${spec_tags}" | tr ',' ' ' | tr -cs '[:alnum:]' ' ' | tr '[:upper:]' '[:lower:]' | xargs)"
  local fts_query
  fts_query="$(echo "$search_terms" | sed 's/[[:space:]]\+/ OR /g')"

  echo "Specs related to \"${spec_name}\":"
  echo ""

  local results
  results="$(sql "SELECT s.repo, s.project || '/' || s.name, s.title FROM specs_fts f JOIN specs s ON s.id = f.rowid WHERE specs_fts MATCH '$(e "$fts_query")' AND s.name != '$(e "$spec_name")' ORDER BY f.rank LIMIT 10;" 2>/dev/null)" || true

  if [[ -z "$results" ]]; then
    echo "  No related specs found."
  else
    echo "$results" | while IFS='|' read -r repo path title; do
      echo "  [${repo}] ${path}"
      echo "    ${title}"
      echo ""
    done
  fi
}

# ── Recent ──────────────────────────────────────────────

cmd_recent() {
  local n="${1:-10}"
  ensure_repos; ensure_db

  echo "Recently modified (last ${n}):"
  echo ""
  sql "SELECT '  [' || repo || '] ' || project || '/' || name || '.' || ext || '  —  ' || title FROM specs ORDER BY modified DESC LIMIT ${n};"
}

# ── Tags ────────────────────────────────────────────────

cmd_tags() {
  local tag="${1:-}"
  ensure_repos; ensure_db

  if [[ -n "$tag" ]]; then
    echo "Specs tagged \"${tag}\":"
    echo ""
    sql "SELECT '  [' || s.repo || '] ' || s.project || '/' || s.name || '  —  ' || s.title FROM spec_tags t JOIN specs s ON t.spec_id = s.id WHERE LOWER(t.tag) = '$(echo "$tag" | tr '[:upper:]' '[:lower:]' | sed "s/'/''/g")' ORDER BY s.repo, s.project;"
  else
    echo "All tags:"
    echo ""
    sql "SELECT '  ' || tag || ' (' || COUNT(*) || ')' FROM spec_tags GROUP BY LOWER(tag) ORDER BY COUNT(*) DESC;"
  fi
}

# ── Stats ───────────────────────────────────────────────

cmd_stats() {
  ensure_repos; ensure_db

  echo "Local Doc Stats"
  echo ""
  echo "  Repos:          $(sql "SELECT COUNT(*) FROM repos;")"
  echo "  Total specs:    $(sql "SELECT COUNT(*) FROM specs;")"
  echo "  Projects:       $(sql "SELECT COUNT(DISTINCT project) FROM specs;")"
  echo "  Unique tags:    $(sql "SELECT COUNT(DISTINCT LOWER(tag)) FROM spec_tags;")"
  echo "  Total size:     $(sql "SELECT COALESCE(SUM(size), 0) FROM specs;") bytes"
  echo "  File types:     $(sql "SELECT GROUP_CONCAT(DISTINCT ext) FROM specs;")"
  echo "  Database:       $(du -h "$DB_FILE" 2>/dev/null | cut -f1 || echo 'N/A')"
  echo "  Last scan:      $(sql "SELECT COALESCE(value, 'never') FROM meta WHERE key = 'last_scan';")"
  echo ""
  echo "  Per repo:"
  sql "SELECT '    ' || repo || ': ' || COUNT(*) || ' specs' FROM specs GROUP BY repo;"
}

# ── Inspect ─────────────────────────────────────────────

cmd_inspect() {
  ensure_repos; ensure_db

  echo "=== Repos ==="
  sql "SELECT name || '  →  ' || path FROM repos;"
  echo ""
  echo "=== All Specs ==="
  sql ".mode column
.headers on
.width 12 30 12 25 5
SELECT repo, path, project, title, ext FROM specs ORDER BY repo, project, name;"
  echo ""
  echo "=== Tags ==="
  sql "SELECT tag || ': ' || GROUP_CONCAT(s.name, ', ') FROM spec_tags t JOIN specs s ON t.spec_id = s.id GROUP BY LOWER(t.tag) ORDER BY LOWER(t.tag);"
  echo ""
  echo "Database: ${DB_FILE} ($(du -h "$DB_FILE" 2>/dev/null | cut -f1))"
  echo "Tip: this .db is a cache. Delete it + run 'local-search scan' to rebuild."
}

# ── JSON (for agents) ──────────────────────────────────

cmd_json() {
  local subcmd="${1:-help}"
  shift || true
  ensure_repos; ensure_db

  case "$subcmd" in
    search)
      local query="${1:?Usage: local-search json search <query>}"
      local repo_filter="${2:-}"
      local where="specs_fts MATCH '$(e "$query")'"
      [[ -n "$repo_filter" ]] && where="${where} AND s.repo = '$(e "$repo_filter")'"
      sql_json "SELECT s.repo, s.project, s.name, s.title, s.tags, s.path, s.ext, ROUND(f.rank, 2) as relevance FROM specs_fts f JOIN specs s ON s.id = f.rowid WHERE ${where} ORDER BY f.rank LIMIT 20;"
      ;;

    read)
      local query="${1:?Usage: local-search json read <name>}"
      local fullpath
      fullpath="$(sql "SELECT fullpath FROM specs WHERE LOWER(name) LIKE '%$(echo "$query" | tr '[:upper:]' '[:lower:]' | sed "s/'/''/g")%' LIMIT 1;")"
      if [[ -n "$fullpath" && -f "$fullpath" ]]; then
        if command -v python3 &>/dev/null; then
          python3 -c "
import json, sys
with open('${fullpath}') as f:
    print(json.dumps({'path': '${fullpath}', 'content': f.read()}))" 2>/dev/null
        else
          printf '{"path":"%s","content":"(use python3 for safe encoding)"}\n' "$fullpath"
        fi
      else
        printf '{"error":"not found","query":"%s"}\n' "$query"
      fi
      ;;

    list)
      local filter="${1:-}"
      if [[ -n "$filter" ]]; then
        sql_json "SELECT repo, name, title, tags, path, ext FROM specs WHERE repo = '${filter//\'/\'\'}' OR project = '${filter//\'/\'\'}' ORDER BY repo, name;"
      else
        sql_json "SELECT repo, project, COUNT(*) as spec_count, GROUP_CONCAT(name) as specs FROM specs GROUP BY repo, project ORDER BY repo, project;"
      fi
      ;;

    repos)
      sql_json "SELECT r.name as repo, r.path, COUNT(s.id) as spec_count FROM repos r LEFT JOIN specs s ON r.name = s.repo GROUP BY r.name;"
      ;;

    related)
      local query="${1:?Usage: local-search json related <name>}"
      local spec_name spec_title spec_tags
      spec_name="$(sql "SELECT name FROM specs WHERE LOWER(name) LIKE '%$(echo "$query" | tr '[:upper:]' '[:lower:]' | sed "s/'/''/g")%' LIMIT 1;")"
      spec_title="$(sql "SELECT title FROM specs WHERE name = '${spec_name//\'/\'\'}' LIMIT 1;")"
      spec_tags="$(sql "SELECT tags FROM specs WHERE name = '${spec_name//\'/\'\'}' LIMIT 1;")"
      local search_terms
      search_terms="$(echo "${spec_title} ${spec_tags}" | tr ',' ' ' | tr -cs '[:alnum:]' ' ' | tr '[:upper:]' '[:lower:]' | xargs)"
      local fts_query
      fts_query="$(echo "$search_terms" | sed 's/[[:space:]]\+/ OR /g')"
      sql_json "SELECT s.repo, s.project, s.name, s.title, s.tags FROM specs_fts f JOIN specs s ON s.id = f.rowid WHERE specs_fts MATCH '$(e "$fts_query")' AND s.name != '$(e "$spec_name")' ORDER BY f.rank LIMIT 10;"
      ;;

    tags)
      sql_json "SELECT tag, COUNT(*) as count FROM spec_tags GROUP BY LOWER(tag) ORDER BY count DESC;"
      ;;

    stats)
      sql_json "SELECT (SELECT COUNT(*) FROM repos) as repos, (SELECT COUNT(*) FROM specs) as total_specs, (SELECT COUNT(DISTINCT project) FROM specs) as projects, (SELECT COUNT(DISTINCT LOWER(tag)) FROM spec_tags) as unique_tags, (SELECT COALESCE(SUM(size), 0) FROM specs) as total_bytes, (SELECT value FROM meta WHERE key = 'last_scan') as last_scan;"
      ;;

    *)
      echo '{"error":"Unknown command. Use: search, read, list, repos, related, tags, stats"}'
      ;;
  esac
}

# ── Reset ───────────────────────────────────────────────

cmd_reset() {
  echo "This will delete the index and all repo registrations."
  read -r -p "Are you sure? (y/N) " confirm
  if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
    rm -rf "$APP_DIR"
    echo "Reset complete. Start fresh with: local-search repo add /path/to/specs"
  else
    echo "Cancelled."
  fi
}

# ── Help ────────────────────────────────────────────────

cmd_help() {
  cat << 'EOF'

  local-search — search your project specs across multiple repos

  REPO MANAGEMENT:

    local-search repo add <folder> [name]   Register a spec repo
    local-search repo remove <name>         Remove a repo
    local-search repo list                  Show all repos

  SCANNING:

    local-search scan                       Scan all repos
    local-search scan <repo-name>           Scan one repo

  SEARCHING:

    local-search search <query>             Search all repos
    local-search search <query> <repo>      Search one repo
    local-search read <name>                Read a spec
    local-search read <name> <repo>         Read from specific repo
    local-search related <name>             Find related specs

  BROWSING:

    local-search list                       All specs, all repos
    local-search list <repo-or-project>     Filter by repo or project
    local-search projects                   List all projects
    local-search tags                       List all tags
    local-search tags <tag>                 Specs with a tag
    local-search recent [n]                 Recently modified

  INFO:

    local-search stats                      Index statistics
    local-search db                         Print database file path
    local-search inspect                    Dump full index
    local-search reset                      Delete everything and start over
    local-search help                       This help

  AGENT COMMANDS (JSON):

    local-search json search <query> [repo]
    local-search json read <name>
    local-search json list [repo-or-project]
    local-search json repos
    local-search json related <name>
    local-search json tags
    local-search json stats

  SEARCH FEATURES:

    Stemming:    "refunding" matches "refund"
    Ranking:     Best matches first (BM25)
    Boolean:     "refund OR chargeback"  /  "billing NOT fraud"
    Prefix:      "payment*"
    Phrase:       '"refund request"'
    Deep:        Searches full file content, not just titles

  SUPPORTED FILES:  .md  .mdx  .txt

  TROUBLESHOOTING:

    Something broken? Delete the cache and rebuild:
      rm ~/.local-search/specs.db
      local-search scan

    Nuclear reset (removes repo list too):
      local-search reset

EOF
}

# ── Main ────────────────────────────────────────────────

ensure_sqlite

case "${1:-help}" in
  repo|repos)           shift; cmd_repo "$@" ;;
  scan|rebuild|index)   shift; cmd_scan "${1:-all}" ;;
  search|s|find|f)      shift; cmd_search "$@" ;;
  read|r|get|show)      shift; cmd_read "$@" ;;
  list|ls)              shift; cmd_list "$@" ;;
  projects|p)           shift; cmd_projects ;;
  related|rel)          shift; cmd_related "$@" ;;
  recent)               shift; cmd_recent "$@" ;;
  tags|t)               shift; cmd_tags "$@" ;;
  stats)                shift; cmd_stats ;;
  db)                   echo "$DB_FILE" ;;
  inspect|dump|debug)   shift; cmd_inspect ;;
  json|j)               shift; cmd_json "$@" ;;
  reset)                shift; cmd_reset ;;
  help|--help|-h)       cmd_help ;;
  *) echo "Unknown command: $1"; cmd_help; exit 1 ;;
esac
