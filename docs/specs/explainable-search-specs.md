# Explainable Search — AI Selection Specs

**HLD:** [web UI intent](../hld/explainable-search-web-ui.md#ai-execution-selection)
**LLD:** [web UI selection extension](../lld/explainable-search-web-ui.md#ai-execution-selection)
**Arrow:** [explainable-search](../arrows/explainable-search.md)
**Prefix:** `SEARCH-AI-*`

Status markers: `[x]` implemented · `[ ]` active gap · `[D]` deferred.

These requirements capture the requested “Support Claude and Codex CLI with
user-selected provider and model.” All were active gaps in the researched baseline; the web application now implements them.
This file is the registry for the new IDs; the existing `docs/ears/` catalogs retain
their legacy IDs and are outside this annotation pass.

- [x] **SEARCH-AI-001**: When a user submits an AI search with Claude CLI or Codex CLI selected, the system SHALL execute the search through the selected CLI.
- [x] **SEARCH-AI-002**: When a user submits an AI search with a supported provider selected for the chosen CLI, the system SHALL use that provider for the search.
- [x] **SEARCH-AI-003**: When a user submits an AI search with a supported model selected for the chosen CLI and provider, the system SHALL use that model for the search.

## Implemented contract

“CLI” means Claude CLI or Codex CLI. “Provider” is either the selected CLI's existing
configuration (CLI default), or a server-configured compatible API endpoint.
“Model” is an explicit model identifier, or the CLI default when left empty.

Custom providers and their allowed model IDs are loaded from a server-owned JSON
file. Credentials are referenced by environment-variable name and are not returned
to the browser. Defaults preserve existing Claude behavior. Invalid selections are
rejected before spawning. Follow-ups use the original session selection; changing
the controls affects the next search. Choices are not persisted across page reloads.

The implementation supports Anthropic Messages-compatible endpoints for Claude and
Responses-compatible endpoints for Codex. A configured model must support the
selected CLI's tool protocol. Compatibility with individual remote services requires
verification against those services.

See [setup and API contract](../../web/README.md#ai-cli-provider-and-model-selection)
and [code/test evidence](../arrows/explainable-search.md).
