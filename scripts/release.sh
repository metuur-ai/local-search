#!/usr/bin/env bash
# release.sh — cut a GitHub Release from your machine and upload the bundle.
#
# Publishes a release tagged v<VERSION> with the installable assets:
#   dist/local-search-bundle.tar.gz   the tarball install.sh fetches
#   install.sh                        the one-command installer
#   cli/dist/local-search-*           each platform's binary (direct download)
#
# Usage:
#   scripts/release.sh                 # tag from cli/main.go, reuse existing tarball
#   scripts/release.sh v0.3.0          # explicit tag (overrides cli/main.go)
#   scripts/release.sh --build         # rebuild the bundle first (build-bundle.sh)
#   scripts/release.sh --draft         # publish as a draft to review before going live
#
# Requires: gh (authenticated), git. --build additionally needs Go + Node.
#
# NOTE: .github/workflows/release.yml also cuts a release when a v* tag is
# pushed. This script creates the tag on the remote, so that workflow will fire
# too and update the same release. Use one path or the other — either run this
# script, or push the tag and let CI do it — not both in quick succession.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

info() { printf '  %s\n' "$*"; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

BUILD=0
DRAFT=0
TAG=""
for arg in "$@"; do
  case "$arg" in
    --build)      BUILD=1 ;;
    --draft)      DRAFT=1 ;;
    -h|--help)    sed -n '2,20p' "$0"; exit 0 ;;
    v[0-9]*)      TAG="$arg" ;;
    *)            die "unknown argument: $arg (see --help)" ;;
  esac
done

# Tag defaults to the const Version in cli/main.go — the single source of truth.
if [ -z "$TAG" ]; then
  VERSION="$(sed -n 's/^const Version = "\(.*\)"/\1/p' cli/main.go)"
  [ -n "$VERSION" ] || die "could not read Version from cli/main.go"
  TAG="v$VERSION"
fi
info "Release tag: $TAG"

command -v gh >/dev/null || die "gh CLI not found — https://cli.github.com"
gh auth status >/dev/null 2>&1 || die "gh not authenticated — run: gh auth login"

# The tag captures HEAD, not your working tree — surface uncommitted edits.
if [ -n "$(git status --porcelain)" ]; then
  info "WARNING: uncommitted changes present; the release tag will point at HEAD ($(git rev-parse --short HEAD))."
fi

TARBALL="dist/local-search-bundle.tar.gz"
if [ "$BUILD" -eq 1 ]; then
  info "Building bundle (scripts/build-bundle.sh)…"
  bash scripts/build-bundle.sh
fi
[ -f "$TARBALL" ] || die "$TARBALL not found — run with --build, or run scripts/build-bundle.sh first"

# Asset set mirrors .github/workflows/release.yml so local and CI releases match.
ASSETS=("$TARBALL" "install.sh")
while IFS= read -r f; do
  [ -n "$f" ] && ASSETS+=("$f")
done < <(ls cli/dist/local-search-* 2>/dev/null || true)
info "Assets: ${ASSETS[*]}"

if gh release view "$TAG" >/dev/null 2>&1; then
  info "Release $TAG already exists — replacing its assets…"
  gh release upload "$TAG" "${ASSETS[@]}" --clobber
else
  info "Creating release $TAG at $(git rev-parse --short HEAD)…"
  create_flags=(--target "$(git rev-parse HEAD)" --title "$TAG" --generate-notes)
  [ "$DRAFT" -eq 1 ] && create_flags+=(--draft)
  gh release create "$TAG" "${ASSETS[@]}" "${create_flags[@]}"
fi

info "Done → $(gh release view "$TAG" --json url -q .url 2>/dev/null || echo "release $TAG")"
