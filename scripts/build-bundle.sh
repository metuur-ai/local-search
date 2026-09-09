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
# Versions are date-based: YYYY-MM-DD.N, where N restarts at 1 each day and
# increments for every further release cut on the same date.
#
# Optionally bump the product version across ALL components before building:
#   scripts/build-bundle.sh                              # build only (no version change)
#   scripts/build-bundle.sh --bump                       # 2026-09-08.2 -> 2026-09-09.1 (new day)
#                                                        # 2026-09-09.1 -> 2026-09-09.2 (same day)
#   scripts/build-bundle.sh --set-version 2026-09-09.3   # set an explicit version, then build
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

VERSION_RE='^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$'

# compute_next — echo today's version: same date as current means patch+1,
# any other date (including an older MAJOR.MINOR.PATCH version) restarts at 1.
compute_next() {
  local today cur; today="$(date +%Y-%m-%d)"; cur="$(current_version)"
  if [[ "$cur" =~ ^${today}\.([0-9]+)$ ]]; then echo "$today.$(( BASH_REMATCH[1] + 1 ))"
  else echo "$today.1"; fi
}

# apply_version <x.y.z> — write the version into every component.
apply_version() {
  local new="$1"
  [[ "$new" =~ $VERSION_RE ]] || die "version '$new' must be YYYY-MM-DD.N"
  info "Bumping version: $(current_version) → $new"

  # Go CLI const — compiled into every binary; the source of truth.
  sed -i.bak "s/^const Version = \".*\"/const Version = \"$new\"/" "$GO_VERSION_FILE"
  rm -f "$GO_VERSION_FILE.bak"
  info "  cli/main.go → $new"

  # Web workspace — root + backend + frontend package.json + package-lock. Written
  # directly rather than via `npm version`, which rejects a date version as
  # invalid semver; the lockfile's own copies are updated so `npm ci` stays happy.
  command -v node >/dev/null || die "node is required to bump the web package versions"
  node -e '
    const fs = require("fs"), [root, v] = process.argv.slice(1);
    const write = (f, edit) => {
      const j = JSON.parse(fs.readFileSync(f, "utf8"));
      edit(j);
      fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
    };
    for (const f of ["package.json", "backend/package.json", "frontend/package.json"]) {
      write(`${root}/web/${f}`, (j) => { j.version = v; });
    }
    write(`${root}/web/package-lock.json`, (j) => {
      j.version = v;
      for (const key of ["", "backend", "frontend"]) if (j.packages?.[key]) j.packages[key].version = v;
    });
  ' "$ROOT" "$new"
  info "  web root + backend + frontend + lockfile → $new"
}

BUMP=0 SET_VERSION=""
while [ $# -gt 0 ]; do
  case "$1" in
    --bump)        BUMP=1; shift ;;
    --set-version) SET_VERSION="${2:-}"; shift 2 ;;
    -h|--help)     sed -n '2,24p' "$0"; exit 0 ;;
    *)             die "unknown argument: $1 (see --help)" ;;
  esac
done
[ -n "$SET_VERSION" ] && [ "$BUMP" -eq 1 ] && die "use either --bump or --set-version, not both"
if   [ -n "$SET_VERSION" ]; then apply_version "$SET_VERSION"
elif [ "$BUMP" -eq 1 ];     then apply_version "$(compute_next)"
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

info "Staging web UI (excluding node_modules/logs/data)…"
mkdir -p "$STAGE/web"
# data/ holds the runtime graph.json cache (gitignored, machine-local). tar does
# not honour .gitignore, so exclude it explicitly — otherwise the build machine's
# own cached graph leaks into every published bundle.
#
# .agents/ is excluded for the same class of reason: the web server runs
# `local-search init --json` from its own cwd, which used to create a config
# there. Shipping one would make it a walk-up ancestor for every project
# created under the install directory, silently forcing an empty scope.
( cd "$ROOT/web" && tar --exclude=node_modules --exclude=logs --exclude=data --exclude=.devlocal --exclude=.agents -cf - . ) \
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
