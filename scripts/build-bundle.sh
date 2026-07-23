#!/usr/bin/env bash
# build-bundle.sh — assemble the distributable that install.sh fetches.
#
# Produces two self-contained artifacts in dist/, both carrying the binaries and
# a prebuilt frontend/dist so install.sh needs no build step:
#   local-search-bundle.tar.gz   fetched by `curl … install.sh | bash`; top dir bundle/
#   local-search-<version>.zip   download-and-unzip artifact;      top dir local-search-<version>/
# Each contains:
#   bin/         all cross-compiled CLI binaries (make -C cli build-all)
#                each binary embeds the Claude skill (cli/skilldata)
#   web/         the web UI with a prebuilt frontend/dist, minus node_modules
#   install.sh
#
# Upload the tarball + install.sh to your release host, then users run:
#   curl -fsSL https://…/install.sh | bash
#
# Optionally bump the product version across ALL components before building:
#   scripts/build-bundle.sh                     # build only (no version change)
#   scripts/build-bundle.sh --bump patch        # 0.3.0 -> 0.3.1, everywhere, then build
#   scripts/build-bundle.sh --bump minor        # 0.3.0 -> 0.4.0
#   scripts/build-bundle.sh --bump major        # 0.3.0 -> 1.0.0
#   scripts/build-bundle.sh --set-version 1.2.3 # set an explicit version, then build
#
# The Go const in cli/main.go is the source of truth (release.sh and
# `local-search --version` read it); the web package.json files are unified
# onto that same version.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist"
STAGE="$OUT/bundle"

info() { printf '  %s\n' "$*"; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

# ── Version bump (optional, runs before the build) ────────────────────────────
# The Go const carries the product version compiled into every binary; the web
# workspace (root + backend + frontend + lockfile) is unified onto the same one.
GO_VERSION_FILE="$ROOT/cli/main.go"

current_version() { sed -n 's/^const Version = "\(.*\)"/\1/p' "$GO_VERSION_FILE"; }

# compute_bump <major|minor|patch> — echo the next version relative to current.
compute_bump() {
  local level="$1" cur; cur="$(current_version)"
  [[ "$cur" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || die "current version '$cur' is not MAJOR.MINOR.PATCH"
  local M="${BASH_REMATCH[1]}" m="${BASH_REMATCH[2]}" p="${BASH_REMATCH[3]}"
  case "$level" in
    major) echo "$((M + 1)).0.0" ;;
    minor) echo "$M.$((m + 1)).0" ;;
    patch) echo "$M.$m.$((p + 1))" ;;
    *)     die "unknown bump level '$level' (use major|minor|patch)" ;;
  esac
}

# apply_version <x.y.z> — write the version into every component.
apply_version() {
  local new="$1"
  [[ "$new" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "version '$new' must be MAJOR.MINOR.PATCH"
  info "Bumping version: $(current_version) → $new"

  # Go CLI const — compiled into every binary; the source of truth.
  sed -i.bak "s/^const Version = \".*\"/const Version = \"$new\"/" "$GO_VERSION_FILE"
  rm -f "$GO_VERSION_FILE.bak"
  info "  cli/main.go → $new"

  # Web workspace — root + backend + frontend package.json + package-lock, kept
  # consistent via npm's own tool so the later `npm ci` stays happy.
  command -v npm >/dev/null || die "npm is required to bump the web package versions"
  ( cd "$ROOT/web" && npm version "$new" \
      --workspaces --include-workspace-root \
      --no-git-tag-version --allow-same-version >/dev/null )
  info "  web root + backend + frontend + lockfile → $new"
}

BUMP_LEVEL="" SET_VERSION=""
while [ $# -gt 0 ]; do
  case "$1" in
    --bump)        BUMP_LEVEL="${2:-}"; shift 2 ;;
    --set-version) SET_VERSION="${2:-}"; shift 2 ;;
    -h|--help)     sed -n '2,20p' "$0"; exit 0 ;;
    *)             die "unknown argument: $1 (see --help)" ;;
  esac
done
[ -n "$SET_VERSION" ] && [ -n "$BUMP_LEVEL" ] && die "use either --bump or --set-version, not both"
if   [ -n "$SET_VERSION" ]; then apply_version "$SET_VERSION"
elif [ -n "$BUMP_LEVEL"  ]; then apply_version "$(compute_bump "$BUMP_LEVEL")"
fi

rm -rf "$STAGE"
mkdir -p "$STAGE/bin"

info "Building CLI binaries…"
make -C "$ROOT/cli" build-all
cp "$ROOT/cli/dist/"* "$STAGE/bin/"

info "Building frontend…"
( cd "$ROOT/web" && npm ci && npm run build )

# No separate skill staging: the skill is embedded in each CLI binary
# (cli/skilldata) and installed via `local-search install-skill`.

info "Staging web UI (excluding node_modules/logs)…"
mkdir -p "$STAGE/web"
( cd "$ROOT/web" && tar --exclude=node_modules --exclude=logs --exclude=.devlocal -cf - . ) \
  | ( tar -xf - -C "$STAGE/web" )

cp "$ROOT/install.sh" "$STAGE/install.sh"

info "Packing tarball…"
tar -czf "$OUT/local-search-bundle.tar.gz" -C "$OUT" bundle

# Self-contained versioned zip — the "download, unzip, ./install.sh" artifact.
# Same payload as the tarball (binaries + web with a prebuilt frontend/dist +
# install.sh) but as a zip, extracting to local-search-<version>/ so it installs
# out of the box with no build step. This is what users should grab from the
# Releases page instead of GitHub's auto-generated "Source code" archive, which
# omits the (gitignored) frontend/dist build.
VER="$(current_version)"
ZIP_DIR="local-search-$VER"
command -v zip >/dev/null || die "zip is required to build the release zip (install 'zip')"
rm -rf "${OUT:?}/$ZIP_DIR" "$OUT/$ZIP_DIR.zip"
cp -R "$STAGE" "$OUT/$ZIP_DIR"
( cd "$OUT" && zip -r -q "$ZIP_DIR.zip" "$ZIP_DIR" )
rm -rf "${OUT:?}/$ZIP_DIR"

printf '\nBundle: %s\n' "$OUT/local-search-bundle.tar.gz"
du -h "$OUT/local-search-bundle.tar.gz" | awk '{print "  size: "$1}'
printf 'Zip:    %s\n' "$OUT/$ZIP_DIR.zip"
du -h "$OUT/$ZIP_DIR.zip" | awk '{print "  size: "$1}'
