#!/usr/bin/env bash
# build-bundle.sh — assemble the distributable that install.sh fetches.
#
# Produces dist/local-search-bundle.tar.gz containing:
#   bundle/bin/      all cross-compiled CLI binaries (make -C cli build-all)
#                    each binary embeds the Claude skill (cli/skilldata)
#   bundle/web/      the web UI with a prebuilt frontend/dist, minus node_modules
#   bundle/install.sh
#
# Upload the tarball + install.sh to your release host, then users run:
#   curl -fsSL https://…/install.sh | bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist"
STAGE="$OUT/bundle"

info() { printf '  %s\n' "$*"; }

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

printf '\nBundle: %s\n' "$OUT/local-search-bundle.tar.gz"
du -h "$OUT/local-search-bundle.tar.gz" | awk '{print "  size: "$1}'
