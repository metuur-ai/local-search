#!/usr/bin/env bash
# install.sh — install the local-search bundle: CLI + Claude skill + local web UI
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/javierhbr/random-poc/main/local-doc-tool/install.sh | bash
#   or from a checkout / unpacked bundle:  bash install.sh
#
# What it installs:
#   1. local-search            -> $INSTALL_DIR (default /usr/local/bin)        [CLI]
#   2. local-search skill      -> $SKILLS_DIR/local-search (default ~/.claude/skills)
#   3. web UI + `local-search-web` launcher -> $WEB_DIR (default ~/.local/share/local-search/web)
#                                 The web UI needs Node >= 18; it is skipped (with a
#                                 warning) if `node` is not found — the CLI + skill still install.
#
# Options (env):
#   INSTALL_DIR=/custom/bin        binary + launcher location   (default /usr/local/bin)
#   SKILLS_DIR=~/.claude/skills    Claude skills location
#   WEB_DIR=~/.local/share/...     web app location
#   BUNDLE_URL=https://...tar.gz   remote bundle, fetched when not run from a checkout
#   INSTALL_CLI=0 INSTALL_SKILLS=0 INSTALL_WEB=0   skip a component

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

TOOL_NAME="local-search"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
SKILLS_DIR="${SKILLS_DIR:-$HOME/.claude/skills}"
WEB_DIR="${WEB_DIR:-$HOME/.local/share/local-search/web}"
BUNDLE_URL="${BUNDLE_URL:-https://raw.githubusercontent.com/javierhbr/random-poc/main/local-doc-tool/dist/local-search-bundle.tar.gz}"

INSTALL_CLI="${INSTALL_CLI:-1}"
INSTALL_SKILLS="${INSTALL_SKILLS:-1}"
INSTALL_WEB="${INSTALL_WEB:-1}"

# ── Helpers ───────────────────────────────────────────────────────────────────

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n'  "$*"; }
info()  { printf '  %s\n' "$*"; }
warn()  { printf '\033[33m  %s\033[0m\n' "$*"; }

die() { red "Error: $*" >&2; exit 1; }

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
  info "Downloading bundle: $BUNDLE_URL"
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "$PWD")"

resolve_source() {
  # A checkout has web/ + code/; an unpacked bundle has web/ + bin/.
  if [[ -d "$SCRIPT_DIR/web" && ( -d "$SCRIPT_DIR/bin" || -d "$SCRIPT_DIR/code" ) ]]; then
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
  for p in "$src/bin/$bin" "$src/code/dist/$bin" "$src/dist/$bin" "$src/local-search"; do
    [[ -f "$p" ]] && { echo "$p"; return; }
  done
  echo ""
}

# ── Component installers ──────────────────────────────────────────────────────

install_cli() {
  local src="$1" bin path dest="$INSTALL_DIR/$TOOL_NAME"
  bin="$(binary_name "$(detect_platform)")"
  path="$(resolve_binary "$src" "$bin")"
  [[ -n "$path" ]] || die "CLI binary not found (looked for $bin). Build with 'make -C code build-all'."
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
  info "Skill:  $SKILLS_DIR/local-search"
  if "$cli" install-skill --dir "$SKILLS_DIR" --force >/dev/null; then
    green "  installed local-search skill"
  else
    warn "skill install failed"
  fi
}

install_web() {
  local src="$1" from="$1/web" launcher="$INSTALL_DIR/${TOOL_NAME}-web"
  [[ -d "$from" ]] || { warn "web/ not found — skipping web UI install"; return; }
  if ! command -v node &>/dev/null; then
    warn "Node not found — skipping web UI. Install Node >= 18, then re-run with INSTALL_CLI=0 INSTALL_SKILLS=0."
    return
  fi
  info "Web:    $WEB_DIR"
  mkdir -p "$WEB_DIR"
  # Copy the app without the (build-time only) node_modules / logs / scratch dirs.
  ( cd "$from" && tar --exclude=node_modules --exclude=logs --exclude=.devlocal -cf - . ) \
    | ( tar -xf - -C "$WEB_DIR" )
  if [[ ! -f "$WEB_DIR/frontend/dist/index.html" ]]; then
    warn "frontend/dist missing — the UI will 404 until built (cd web && npm ci && npm run build)."
  fi
  # Launcher: production mode, served by Node's built-ins only (no npm install needed).
  local tmp; tmp="$(mktemp)"
  cat > "$tmp" <<EOF
#!/usr/bin/env bash
# local-search-web — launch the local-search web UI (installed by install.sh)
export NODE_ENV="\${NODE_ENV:-production}"
exec node "$WEB_DIR/server.js" "\$@"
EOF
  info "Launch: $launcher"
  install_file "$tmp" "$launcher"
  rm -f "$tmp"
  green "  installed web UI + local-search-web launcher"
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

  printf '\n'
  green "Done."
  info "CLI:   local-search help"
  info "Web:   local-search-web        # then open http://localhost:8787"
  info "Skill: available to Claude Code from $SKILLS_DIR/local-search"
}

main "$@"
