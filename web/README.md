# local-search-ui

A single Node project (npm workspaces) that runs the Preact frontend and the
raw-Node HTTP API as **one process**, in two modes.

## Requirements

- Node.js (with `npm` workspaces support)
- `local-search` must be on `PATH`. AI searches also require the selected `claude` or `codex` CLI, configured and authenticated. Graph-only search needs neither AI CLI.

## AI CLI, provider, and model selection

In **AI Answer** mode, choose **AI CLI**, **Provider**, and **Model** before searching.
Claude CLI is the default. Each CLI has a **CLI default** provider that inherits its
existing configuration; leave Model empty to use its default, or enter a model ID.
Follow-ups retain the original selection. Choices stay in the current page until
reload; saved answer metadata includes the CLI, provider, and requested model.

To add providers, create `~/.local-search/ai-providers.json`, or set
`LOCAL_SEARCH_AI_CONFIG` to an explicit JSON file path before starting the server.
Restart the server after editing this file. An explicit missing or invalid file
disables AI searches with an error; Graph only remains available.

```json
{
  "providers": [
    {
      "id": "claude-gateway",
      "cli": "claude",
      "label": "Claude gateway",
      "baseUrl": "https://gateway.example.com/anthropic",
      "apiKeyEnv": "MY_CLAUDE_GATEWAY_KEY",
      "auth": "bearer",
      "models": ["your-supported-model-id"]
    },
    {
      "id": "codex-gateway",
      "cli": "codex",
      "label": "Codex gateway",
      "baseUrl": "https://gateway.example.com/v1",
      "apiKeyEnv": "MY_CODEX_GATEWAY_KEY",
      "models": ["your-supported-model-id"]
    }
  ]
}
```

Replace the example URLs and model IDs with values supported by your service.
Set the named key variables in the server environment; put no key values in this
file. The browser receives only provider IDs, labels, CLI names, and model lists.
Unknown selections are rejected before execution. Configured providers require a
nonempty model list; the first model is selected when the provider changes.

Custom Claude providers must implement the Anthropic Messages API. `auth` defaults
to `bearer` (`ANTHROPIC_AUTH_TOKEN`); use `api-key` for `ANTHROPIC_API_KEY`.
Custom Codex providers must support the Responses API and the Codex tool protocol;
the adapter sets `model_provider` and an `env_key` reference through CLI config
overrides. These compatibility requirements are not automatic compatibility with
every model endpoint. `apiKeyEnv` may be omitted for an unauthenticated local service.

Claude retains the narrow `Bash(local-search:*)` permission grant. Codex uses
`exec --sandbox read-only --json`; follow-ups use its `resume` subcommand. Both
produce the same browser answer/activity interface. The requested Codex model is
recorded from the selection because its exec event stream does not report a model
in the initialization event.

API additions: `GET /api/ai-options` returns `{ providers: [...] }`.
`POST /api/query` accepts an optional `ai` object:
`{ "cli": "codex", "provider": "codex-gateway", "model": "your-supported-model-id" }`.
Omitting `ai` preserves Claude defaults. Graph mode ignores `ai`. Reply requests
continue to accept `{ text }`; selection overrides on replies are ignored.

## Setup

Install once from this directory. This installs both workspaces and hoists
shared dev deps (notably Vite) to the root `node_modules`:

```bash
npm install
```

## Commands

- `npm run dev` — start the single process in dev mode. Vite runs in middleware
  mode on the same port as the API, so you get HMR and `/api/*` from one server
  (http://localhost:8787 by default; override with `PORT`).
- `npm start` — build the frontend, then serve it in production mode from the
  same process (`NODE_ENV=production node server.js`). Static assets are served
  from `frontend/dist`.
- `npm run build` — build the frontend into `frontend/dist`.
- `npm run logs` — `tail -f` the newest CLI interaction log under `logs/`.
- `npm test` — run backend (`node --test`) and frontend (`vitest`) tests.

## CLI interaction logging

Every interaction with the external `local-search` and `claude` CLIs (the exact
command, the claude prompt, captured stdout/stderr, exit code and duration) can
be logged to a file for debugging. The log is human-readable and meant to be
`tail -f`'d.

Enable/disable precedence:

- `--no-logs` or `LOG_CLI=0` — always **disabled**.
- `--logs` or a truthy `LOG_CLI` (`1`/`true`) — **enabled** (and `--logs` also
  echoes a one-line summary per interaction to the console).
- Otherwise: **enabled by default in dev** (`npm run dev`), **disabled in prod**.

Log file path: `LOG_FILE` if set, else `logs/server-<YYYYMMDD-HHMMSS>.log`. The
`logs/` directory is gitignored. Use `npm run logs` to tail the newest file.
