#!/usr/bin/env bash
# install.sh — install the local-search bundle: CLI + shared agent skill + local web UI
#
# Usage:
#   tmp=$(mktemp -d) && curl -fsSL https://github.com/metuur-ai/local-search/releases/latest/download/local-search-bundle.tar.gz | tar -xz -C "$tmp" && bash "$tmp/bundle/install.sh"
#   or from a checkout / unpacked bundle:  bash install.sh
#
# What it installs:
#   1. local-search            -> $INSTALL_DIR (default ~/.local/bin)          [CLI]
#   2. shared local-search skill -> Claude, Codex, and shared .agents skills directories
#   3. web UI + `local-search-ui` global launcher -> $WEB_DIR (default ~/.local/share/local-search/web)
#                                 `local-search-ui` lands in $INSTALL_DIR so the web UI
#                                 runs from anywhere (like `npm install -g local-search-ui`).
#                                 The web UI needs Node >= 18; it is skipped (with a
#                                 warning) if `node` is not found — the CLI + skill still install.
#   4. ~/.local-search         -> sandbox.filesystem.allowWrite in the Claude settings.
#                                 Claude Code's Bash sandbox only allows writes under the
#                                 working directory, so without this every scan that needs
#                                 to update ~/.local-search/specs.db fails inside a
#                                 sandboxed session and the agent falls back to grep.
#
#   5. ~/.local-search -> Codex sandbox_workspace_write.writable_roots.
#      Requires Python 3.11+ (or tomli); preserves sandbox mode and approval policy.
#      Restart Codex after installation; project/profile policies may override it.
#
# Options (env):
#   INSTALL_DIR=/custom/bin        binary + launcher location   (default ~/.local/bin)
#   CLAUDE_SKILLS_DIR=~/.claude/skills (SKILLS_DIR is a legacy alias)
#   CODEX_SKILLS_DIR=$CODEX_HOME/skills (default ~/.codex/skills)
#   AGENTS_SKILLS_DIR=~/.agents/skills (shared agent-agnostic destination)
#   INSTALL_AGENTS=0              skip the shared skill copy
#   CODEX_CONFIG=$CODEX_HOME/config.toml (default ~/.codex/config.toml)
#   INSTALL_CLAUDE=0 INSTALL_CODEX=0  skip an agent’s skill and customization
#   WEB_DIR=~/.local/share/...     web app location
#   BUNDLE_URL=https://...tar.gz   remote bundle, fetched when not run from a checkout
#   CLAUDE_SETTINGS=~/.claude/settings.json        Claude Code settings file to patch
#   INSTALL_CLI=0 INSTALL_SKILLS=0 INSTALL_WEB=0 INSTALL_SANDBOX=0   skip a component

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

TOOL_NAME="local-search"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
# SKILLS_DIR remains a backwards-compatible override for the Claude destination.
CLAUDE_SKILLS_DIR="${CLAUDE_SKILLS_DIR:-${SKILLS_DIR:-$HOME/.claude/skills}}"
CODEX_SKILLS_DIR="${CODEX_SKILLS_DIR:-${CODEX_HOME:-$HOME/.codex}/skills}"
AGENTS_SKILLS_DIR="${AGENTS_SKILLS_DIR:-$HOME/.agents/skills}"
INSTALL_AGENTS="${INSTALL_AGENTS:-1}"
CODEX_CONFIG="${CODEX_CONFIG:-${CODEX_HOME:-$HOME/.codex}/config.toml}"
INSTALL_CLAUDE="${INSTALL_CLAUDE:-1}"
INSTALL_CODEX="${INSTALL_CODEX:-1}"
WEB_DIR="${WEB_DIR:-$HOME/.local/share/local-search/web}"
BUNDLE_URL="${BUNDLE_URL:-https://github.com/metuur-ai/local-search/releases/latest/download/local-search-bundle.tar.gz}"

CLAUDE_SETTINGS="${CLAUDE_SETTINGS:-$HOME/.claude/settings.json}"
# Fixed in the CLI (main.go: appDir = ~/.local-search), so it is not configurable here.
APP_DIR_TILDE="~/.local-search"

INSTALL_CLI="${INSTALL_CLI:-1}"
INSTALL_SKILLS="${INSTALL_SKILLS:-1}"
INSTALL_WEB="${INSTALL_WEB:-1}"
INSTALL_SANDBOX="${INSTALL_SANDBOX:-1}"

# ── Helpers ───────────────────────────────────────────────────────────────────

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n'  "$*"; }
info()  { printf '  %s\n' "$*"; }
warn()  { printf '\033[33m  %s\033[0m\n' "$*"; }

die() { red "Error: $*" >&2; exit 1; }

# ensure_on_path <dir> — warn + print how to add <dir> to PATH if it is missing.
ensure_on_path() {
  local dir="$1"
  case ":${PATH}:" in
    *":${dir}:"*) return 0 ;;
  esac
  warn "$dir is not on your PATH — installed commands won't be found until you add it."
  info "zsh:  echo 'export PATH=\"$dir:\$PATH\"' >> ~/.zshrc  && source ~/.zshrc"
  info "bash: echo 'export PATH=\"$dir:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
}

# install_file <src> <dest> — copy with +x, elevating to sudo if the dir is unwritable.
install_file() {
  local src="$1" dest="$2" dir
  dir="$(dirname "$dest")"
  if { [[ -d "$dir" ]] || mkdir -p "$dir" 2>/dev/null; } && [[ -w "$dir" ]]; then
    cp "$src" "$dest" && chmod +x "$dest"
  else
    info "Elevated permissions required for $dir"
    sudo mkdir -p "$dir"
    sudo cp "$src" "$dest" && sudo chmod +x "$dest"
  fi
}

# ── Detect platform ───────────────────────────────────────────────────────────

detect_platform() {
  local os arch
  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux"  ;;
    MINGW*|MSYS*|CYGWIN*) os="windows" ;;
    *) die "Unsupported OS: $(uname -s)" ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64)  arch="amd64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) die "Unsupported architecture: $(uname -m)" ;;
  esac
  echo "${os}/${arch}"
}

binary_name() {
  case "$1" in
    darwin/arm64)  echo "local-search-mac-silicon-darwin-arm64" ;;
    darwin/amd64)  echo "local-search-darwin-amd64"             ;;
    linux/amd64)   echo "local-search-linux-amd64"              ;;
    linux/arm64)   echo "local-search-linux-arm64"              ;;
    windows/amd64) echo "local-search-windows-amd64.exe"        ;;
    *) die "No pre-built binary for platform: $1" ;;
  esac
}

# ── Resolve source (local checkout / unpacked bundle vs. remote download) ──────

download_bundle() {
  local dest_dir="$1" tmp
  tmp="$(mktemp)"
  # stderr: stdout is captured by resolve_source's command substitution.
  info "Downloading bundle: $BUNDLE_URL" >&2
  if command -v curl &>/dev/null; then
    curl -fsSL --progress-bar "$BUNDLE_URL" -o "$tmp" || die "Download failed: $BUNDLE_URL"
  elif command -v wget &>/dev/null; then
    wget -q --show-progress "$BUNDLE_URL" -O "$tmp" || die "Download failed: $BUNDLE_URL"
  else
    die "Neither curl nor wget found. Install one and retry."
  fi
  # Bundle root is a single `bundle/` dir → strip it so $dest_dir has bin/ skills/ web/.
  tar -xzf "$tmp" -C "$dest_dir" --strip-components=1 || die "Failed to unpack bundle"
  rm -f "$tmp"
}

# When piped (`curl … | bash`) there is no script file on disk: BASH_SOURCE[0]
# is empty and $0 is "bash". In that case SCRIPT_DIR must stay empty so we never
# mistake the current working directory for a checkout/bundle — we always fetch
# the release bundle instead. Only a real on-disk install.sh yields a SCRIPT_DIR.
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
  SCRIPT_DIR=""
fi

resolve_source() {
  # A checkout has web/ + cli/; an unpacked bundle has web/ + bin/. Only trust
  # SCRIPT_DIR when install.sh is a real file there (not a `curl | bash` pipe).
  if [[ -n "$SCRIPT_DIR" && -d "$SCRIPT_DIR/web" && ( -d "$SCRIPT_DIR/bin" || -d "$SCRIPT_DIR/cli" ) ]]; then
    echo "$SCRIPT_DIR"
  else
    local tmp
    tmp="$(mktemp -d)"
    download_bundle "$tmp"
    echo "$tmp"
  fi
}

# Echo the platform binary path within $SRC, or nothing if absent.
resolve_binary() {
  local src="$1" bin="$2" p
  for p in "$src/bin/$bin" "$src/cli/dist/$bin" "$src/dist/$bin" "$src/local-search"; do
    [[ -f "$p" ]] && { echo "$p"; return; }
  done
  echo ""
}

# ── Component installers ──────────────────────────────────────────────────────

install_cli() {
  local src="$1" bin path dest="$INSTALL_DIR/$TOOL_NAME"
  bin="$(binary_name "$(detect_platform)")"
  path="$(resolve_binary "$src" "$bin")"
  [[ -n "$path" ]] || die "CLI binary not found (looked for $bin). Build with 'make -C cli build-all'."
  info "CLI:    $dest"
  install_file "$path" "$dest"
  "$dest" --version &>/dev/null || die "Binary installed but failed to run: $dest"
  green "  installed $("$dest" --version 2>/dev/null || echo "$TOOL_NAME")"
}

# The skill is embedded in the CLI binary, so install it via the binary itself
# (`local-search install-skill`) rather than copying a loose directory.
install_skills() {
  local src="$1" cli="$INSTALL_DIR/$TOOL_NAME"
  if [[ ! -x "$cli" ]]; then
    # CLI not installed this run — fall back to the bundle binary, then PATH.
    cli="$(resolve_binary "$src" "$(binary_name "$(detect_platform)")")"
    [[ -n "$cli" ]] || cli="$(command -v "$TOOL_NAME" 2>/dev/null || true)"
    [[ -n "$cli" ]] && chmod +x "$cli" 2>/dev/null || true
  fi
  if [[ -z "$cli" || ! -x "$cli" ]]; then
    warn "CLI unavailable — cannot install the embedded skill. Install the CLI, then run: $TOOL_NAME install-skill"
    return
  fi
  local agent dir enabled
  for agent in claude codex agents; do
    case "$agent" in
      claude) dir="$CLAUDE_SKILLS_DIR"; enabled="$INSTALL_CLAUDE" ;;
      codex)  dir="$CODEX_SKILLS_DIR"; enabled="$INSTALL_CODEX" ;;
      agents) dir="$AGENTS_SKILLS_DIR"; enabled="$INSTALL_AGENTS" ;;
    esac
    [[ "$enabled" == "1" ]] || continue
    info "Skill ($agent): $dir/local-search"
    "$cli" install-skill --dir "$dir" --force >/dev/null || die "skill install failed for $agent"
    green "  installed local-search skill for $agent"
  done
}

# ── Claude sandbox ────────────────────────────────────────────────────────────
#
# Claude Code's Bash sandbox allows writes under the working directory only, so a
# sandboxed session cannot update ~/.local-search/specs.db — every scan fails and
# the agent falls back to grep instead. `sandbox.filesystem.allowWrite` is the
# supported way to widen that boundary for one path. Those arrays merge across
# settings scopes, so appending here never clobbers a project-level list.

sandbox_snippet() {
  info 'Add this to your Claude settings by hand:'
  info '  {'
  info '    "sandbox": {'
  info '      "filesystem": {'
  info "        \"allowWrite\": [\"$APP_DIR_TILDE\"]"
  info '      }'
  info '    }'
  info '  }'
}

# patch_settings <file> — merge $APP_DIR_TILDE into sandbox.filesystem.allowWrite.
# Returns 0 on a write, 3 when the path was already there, 1 on a malformed file,
# 2 when neither python3 nor jq is available for a safe JSON edit.
patch_settings() {
  local file="$1" tilde="$APP_DIR_TILDE" expanded="$HOME/.local-search"

  if command -v python3 &>/dev/null; then
    APP_TILDE="$tilde" APP_EXPANDED="$expanded" python3 - "$file" <<'PYEOF'
import json, os, sys

path = sys.argv[1]
tilde, expanded = os.environ["APP_TILDE"], os.environ["APP_EXPANDED"]

try:
    with open(path) as fh:
        text = fh.read()
    data = json.loads(text) if text.strip() else {}
except FileNotFoundError:
    data = {}
except (json.JSONDecodeError, OSError):
    sys.exit(1)

if not isinstance(data, dict):
    sys.exit(1)

sandbox = data.setdefault("sandbox", {})
if not isinstance(sandbox, dict):
    sys.exit(1)
fs = sandbox.setdefault("filesystem", {})
if not isinstance(fs, dict):
    sys.exit(1)
allow = fs.setdefault("allowWrite", [])
if not isinstance(allow, list):
    sys.exit(1)

# Either spelling already covers the path, so a second install is a no-op.
if tilde in allow or expanded in allow:
    sys.exit(3)

allow.append(tilde)
# Write through a temp file in the same directory, then rename: a crash mid-write
# leaves the user's settings intact rather than truncated.
tmp = path + ".tmp"
with open(tmp, "w") as fh:
    json.dump(data, fh, indent=2)
    fh.write("\n")
os.replace(tmp, path)
PYEOF
    return $?
  fi

  if command -v jq &>/dev/null; then
    if jq -e --arg t "$tilde" --arg e "$expanded" \
         '(.sandbox.filesystem.allowWrite // []) as $a | ($a | index($t)) // ($a | index($e))' \
         "$file" >/dev/null 2>&1; then
      return 3
    fi
    local out; out="$(mktemp)"
    if jq --arg t "$tilde" \
         '.sandbox.filesystem.allowWrite = ((.sandbox.filesystem.allowWrite // []) + [$t])' \
         "$file" > "$out" 2>/dev/null && [[ -s "$out" ]]; then
      cat "$out" > "$file"
      return 0
    fi
    return 1
  fi

  return 2
}

install_sandbox() {
  local file="$CLAUDE_SETTINGS" created=0

  if [[ ! -d "$(dirname "$file")" ]]; then
    warn "Claude settings directory not found — skipping sandbox allowWrite."
    sandbox_snippet
    return
  fi

  info "Sandbox: $file"

  if [[ ! -f "$file" ]]; then
    printf '{}\n' > "$file" || { warn "could not create $file"; sandbox_snippet; return; }
    created=1
  else
    cp "$file" "$file.bak" 2>/dev/null || warn "could not back up $file"
  fi

  local rc=0
  patch_settings "$file" || rc=$?
  case "$rc" in
    0)
      if [[ "$created" == "1" ]]; then
        green "  created $file with $APP_DIR_TILDE in sandbox.filesystem.allowWrite"
      else
        green "  added $APP_DIR_TILDE to sandbox.filesystem.allowWrite (backup: $(basename "$file").bak)"
      fi
      ;;
    3) info "  $APP_DIR_TILDE already allowed — unchanged" ;;
    2) warn "neither python3 nor jq found — $file left untouched."; sandbox_snippet ;;
    *) warn "could not parse $file — left untouched."; sandbox_snippet ;;
  esac
}

# Preserve TOML formatting and unrelated settings. Unsupported layouts fail closed.
patch_codex_settings() {
  command -v python3 >/dev/null || return 2
  python3 - "$CODEX_CONFIG" "$HOME/.local-search" <<'PYCODEX'
import copy, json, os, pathlib, re, shutil, sys, tempfile
try:
    import tomllib
except ImportError:
    try:
        import tomli as tomllib
    except ImportError:
        sys.exit(2)
path = pathlib.Path(sys.argv[1])
root = sys.argv[2]
try:
    text = path.read_text() if path.exists() else ""
    data = tomllib.loads(text)
    section = data.get("sandbox_workspace_write", {})
    roots = section.get("writable_roots", [])
    if not isinstance(roots, list) or not all(isinstance(v, str) for v in roots):
        sys.exit(1)
    if root in roots or "~/.local-search" in roots:
        sys.exit(3)
    expected = copy.deepcopy(data)
    expected.setdefault("sandbox_workspace_write", {})["writable_roots"] = roots + [root]
    value = json.dumps(roots + [root], ensure_ascii=False)
    lines = text.splitlines(keepends=True)
    candidates = []
    if "sandbox_workspace_write" not in data:
        candidates.append(text + "\n[sandbox_workspace_write]\nwritable_roots = " + value + "\n")
    else:
        # Try only conventional table/key spellings. Parse-and-compare proves
        # that a candidate changes exactly the intended setting, even when
        # multiline strings contain table-like text or arrays span lines.
        for i, line in enumerate(lines):
            if re.match(r"^\s*\[sandbox_workspace_write\]\s*(?:#.*)?$", line):
                if "writable_roots" not in section:
                    candidates.append("".join(lines[:i+1]).rstrip("\n") + "\nwritable_roots = " + value + "\n" + "".join(lines[i+1:]))
            if re.match(r"^\s*writable_roots\s*=", line):
                for end in range(i+1, len(lines)+1):
                    candidates.append("".join(lines[:i]) + "writable_roots = " + value + "\n" + "".join(lines[end:]))
    updated = None
    for candidate in candidates:
        try:
            if tomllib.loads(candidate) == expected:
                updated = candidate
                break
        except tomllib.TOMLDecodeError:
            pass
    if updated is None:
        sys.exit(1)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        shutil.copy2(path, str(path) + ".bak")
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".local-search-")
    try:
        with os.fdopen(fd, "w") as out:
            out.write(updated)
        if path.exists():
            os.chmod(tmp, path.stat().st_mode & 0o777)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
except (OSError, ValueError, AttributeError, TypeError):
    sys.exit(1)
PYCODEX
}

install_codex_sandbox() {
  local rc=0
  patch_codex_settings || rc=$?
  case "$rc" in
    0) green "  configured Codex index writes in $CODEX_CONFIG (existing file backed up)"
       info "Restart Codex to load the setting; project/profile policies may override it." ;;
    3) info "  Codex index directory already allowed — unchanged" ;;
    *) warn "Codex config unchanged: Python 3.11+/tomli is required, with a supported valid TOML layout."
       info "Add $HOME/.local-search to [sandbox_workspace_write].writable_roots in $CODEX_CONFIG, or launch Codex with --add-dir $HOME/.local-search." ;;
  esac
}

install_web() {
  local src="$1" from="$1/web" launcher="$INSTALL_DIR/local-search-ui"
  [[ -d "$from" ]] || { warn "web/ not found — skipping web UI install"; return; }
  if ! command -v node &>/dev/null; then
    warn "Node not found — skipping web UI. Install Node >= 18, then re-run with INSTALL_CLI=0 INSTALL_SKILLS=0."
    return
  fi
  info "Web:    $WEB_DIR"
  mkdir -p "$WEB_DIR"
  # Copy the app without the machine-local node_modules / logs / data (runtime
  # graph.json cache) / scratch dirs. Matters when installing from a checkout,
  # where those exist on disk; tar does not honour .gitignore.
  ( cd "$from" && tar --exclude=node_modules --exclude=logs --exclude=data --exclude=.devlocal -cf - . ) \
    | ( tar -xf - -C "$WEB_DIR" )
  if [[ ! -f "$WEB_DIR/frontend/dist/index.html" ]]; then
    warn "frontend/dist missing — the UI will 404 until built (cd web && npm ci && npm run build)."
  fi
  # Global launcher: production mode, served by Node's built-ins only (no npm
  # install needed). Placed in $INSTALL_DIR so `local-search-ui` runs from
  # anywhere, like `npm install -g local-search-ui`. Prefers the packaged
  # bin/ entrypoint, falling back to server.js for older bundles.
  local entry="$WEB_DIR/bin/local-search-ui.js"
  [[ -f "$from/bin/local-search-ui.js" ]] || entry="$WEB_DIR/server.js"
  local tmp; tmp="$(mktemp)"
  cat > "$tmp" <<EOF
#!/usr/bin/env bash
# local-search-ui — launch the local-search-ui web UI (installed by install.sh)
export NODE_ENV="\${NODE_ENV:-production}"
exec node "$entry" "\$@"
EOF
  info "Launch: $launcher"
  install_file "$tmp" "$launcher"
  rm -f "$tmp"
  green "  installed web UI + local-search-ui launcher"
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  bold "local-search bundle installer"
  printf '\n'
  info "Platform: $(detect_platform)"

  local src; src="$(resolve_source)"

  if [[ "$INSTALL_CLI"    == "1" ]]; then install_cli    "$src"; else info "CLI:    skipped"; fi
  if [[ "$INSTALL_SKILLS" == "1" ]]; then install_skills "$src"; else info "Skill:  skipped"; fi
  if [[ "$INSTALL_WEB"    == "1" ]]; then install_web    "$src"; else info "Web:    skipped"; fi
  if [[ "$INSTALL_SANDBOX" == "1" ]]; then
    if [[ "$INSTALL_CLAUDE" == "1" ]]; then install_sandbox; fi
    if [[ "$INSTALL_CODEX" == "1" ]]; then install_codex_sandbox; fi
  else
    info "Sandbox: skipped"
  fi

  ensure_on_path "$INSTALL_DIR"

  printf '\n'
  green "Done."
  info "CLI:   local-search help"
  info "Web:   local-search-ui      # runs from anywhere, then open http://localhost:8787"

}

if [[ "${BASH_SOURCE[0]:-}" == "$0" || -z "${BASH_SOURCE[0]:-}" ]]; then main "$@"; fi
