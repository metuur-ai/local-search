# Changelog

Versions are `YYYY-MM-DD.N` — the release date plus a counter that restarts at 1
each day. Tags are the version prefixed with `v` (e.g. `v2026-09-09.1`).

## Unreleased

### Added

- The bundle installer now installs the shared Local Search skill for Claude,
  Codex, and other agents through `~/.claude/skills`, `$CODEX_HOME/skills`
  (default `~/.codex/skills`), and `~/.agents/skills`.
- Each skill destination can be customized with `CLAUDE_SKILLS_DIR`,
  `CODEX_SKILLS_DIR`, or `AGENTS_SKILLS_DIR`, and disabled independently with
  `INSTALL_CLAUDE=0`, `INSTALL_CODEX=0`, or `INSTALL_AGENTS=0`.
- Codex setup now adds the index directory to its workspace-write permissions,
  preserving existing settings and backing up changed configuration files.
  Automatic configuration requires Python 3.11+ or `tomli`; otherwise the
  installer provides manual setup instructions. Restart Codex after setup.

### Changed

- The shared skill now uses the active agent’s question and permission mechanisms
  instead of requiring Claude-specific tools or editing Claude settings.
  Agent-specific configuration is handled by the installer.
- `SKILLS_DIR` remains supported as a legacy override for the Claude destination.

### Fixed

- Shortened the skill description to pass Codex skill validation.
- Corrected the command reference: scope inspection is read-only, and the
  `--directory` filter is supported by `read`, not `search`.
- Updated the documented Go build requirement and index-rebuild instructions.

## 2026-09-09.1

First release under the date-based versioning scheme; supersedes `0.4.12`.

### Added

- **Codex CLI as a search engine.** AI Answer searches can now run through
  `codex` as well as `claude`. The prompt, argv, stream normalizer, and session
  resume path are selected per CLI (`web/backend/src/codex.js`,
  `web/backend/src/ai.js`).
- **Provider and model selection.** Each CLI has a built-in `CLI default`
  provider that inherits the CLI's own configuration, plus a model list
  (`opus`/`sonnet`/`haiku` for Claude, `gpt-5.4-codex`/`gpt-5.4`/
  `gpt-5.4-codex-mini` for Codex). Additional API endpoints can be declared in
  `~/.local-search/ai-providers.json`, or a file named by `LOCAL_SEARCH_AI_CONFIG`.
  Credentials are referenced by environment-variable name and never sent to the
  browser. See `web/README.md#ai-cli-provider-and-model-selection`.
- **`GET /api/ai-options`** returns the public catalog (id, cli, label, models,
  suggestions) for the picker. Returns 503 when the configured provider file is
  missing or invalid; graph-only search stays available.
- **AI selection control in the top header**, styled as a pill alongside the run
  status. Shows AI CLI and Model; the Provider dropdown appears only when more
  than one endpoint is configured for the selected CLI.
- **Answer metadata** now records and displays the CLI and provider that
  produced each answer.
- Requirements registry `docs/specs/explainable-search-specs.md`
  (`SEARCH-AI-001..003`), annotated across the implementing code and tests.

### Changed

- **Versioning moved to `YYYY-MM-DD.N`.** `scripts/build-bundle.sh --bump` no
  longer takes a level — it derives the next version from the date, restarting
  the counter each day. `--set-version` validates the new format.
  `npm version` was replaced with direct writes to the three `package.json`
  files and `package-lock.json`, because npm rejects a date version as invalid
  semver.
- Errors now name the CLI that actually failed (`codex_missing` rather than
  always `claude_missing`).
- UI copy is CLI-neutral: the answer byline reads "Assistant" instead of
  "Claude", and the follow-up placeholder no longer names a vendor.

### Fixed

- **Events emitted before the browser connected were lost.** Output is now piped
  as soon as the child spawns and buffered on the session, then flushed to the
  first SSE client; a spawn failure is replayed to a late-connecting client
  instead of hanging (`web/backend/src/stream.js`, `query.js`).
- Repeated `pipeChild` calls for the same child no longer attach duplicate
  listeners.

### Notes

- These package versions are not valid semver. All packages are `private`, so
  nothing is published to a registry; if that changes, the scheme has to change
  with it.
- `0.4.11` and `0.4.12` were never tagged as releases — the last published tag
  was `v0.4.10`.
