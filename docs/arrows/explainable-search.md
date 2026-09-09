# Arrow: Explainable Search

This segment owns the user's explainable AI search over selected repositories.
This initial registry entry covers only the requested CLI/provider/model selection
extension. It does not claim full migration or audit of the existing web UI specs.

## Segment Boundary

- **Prefix:** `SEARCH-AI-*`.
- **Owner LLD:** [explainable-search web UI](../lld/explainable-search-web-ui.md#ai-execution-selection).
- **HLD:** [AI execution selection intent](../hld/explainable-search-web-ui.md#ai-execution-selection).
- **Spec catalog:** [explainable-search-specs.md](../specs/explainable-search-specs.md).

## Spec-to-test-to-code edges

| Spec | Status | Test citation | Code citation |
| --- | --- | --- | --- |
| SEARCH-AI-001 | Implemented: CLI selection | `web/backend/test/aiRoutes.test.js`, `web/backend/test/codex.test.js`, `web/frontend/test/aiSelection.test.jsx` | `web/frontend/src/components/AiSelection.jsx`, `web/backend/src/query.js`, `web/backend/src/ai.js`, `web/backend/src/codex.js` |
| SEARCH-AI-002 | Implemented: provider selection | `web/backend/test/ai.test.js`, `web/backend/test/aiRoutes.test.js`, `web/frontend/test/aiSelection.test.jsx` | `web/frontend/src/components/AiSelection.jsx`, `web/backend/src/query.js`, `web/backend/src/ai.js` |
| SEARCH-AI-003 | Implemented: model selection | `web/backend/test/ai.test.js`, `web/backend/test/aiRoutes.test.js`, `web/frontend/test/aiSelection.test.jsx` | `web/frontend/src/components/AiSelection.jsx`, `web/backend/src/query.js`, `web/backend/src/ai.js` |

## Coherence scope

The stable IDs resolve in `docs/specs/`. All three have code and test citations. A scan with no
orphans establishes reference integrity; it does not establish implementation.
The bundled scanner's default source roots omit this repository's `web/` and `cli/`
directories, so verification must explicitly include those roots when scanning code.

Verification on September 7, 2026 used the bundled scanner in regex fallback mode,
with source roots supplied in memory (the plugin was not changed):

- The initial specification-only scan had three active gaps and no citations. Implementation validation is recorded below.
- `web/` plus `cli/`: six orphan reports and five malformed-ID reports in existing
  annotation-parser examples in `cli/extract/extract.go` and
  `cli/extract/reftags_test.go`. These pre-existing examples include `TASKS-012`
  and `HEALTH-007`; they are not requirements for this feature.

The segment remains MAPPED, not AUDITED. A repository-wide clean scan is not claimed.

## Remaining validation

Authenticated remote calls have not been used to verify individual provider/model
compatibility. Existing Go parser examples still prevent a clean repository-wide
scan; they are outside this segment. Web-scope verification includes actual `web/`
source/test roots rather than relying on the scanner defaults.

## Implementation verification

- Strict coherence with `web/` explicitly included: three specs, each with code and
  test citations; zero orphan, missing, helper, or malformed-ID reports.
- Backend: 116 tests passed using Node 20.19.4.
- Frontend: 288 tests passed using Node 20.19.4. The local default test-worker runtime
  selected Node 25, whose Web Storage globals conflicted with this jsdom setup;
  invoking the Node 20 binary explicitly produced a clean run without test changes.
- Production build passed, with the existing large-chunk advisory.
- Mocked browser verification: Codex/provider/model selection, query answer,
  retained selection on follow-up, and desktop/mobile form layout.
- Installed CLI smoke check (September 8): Claude Code 2.1.263 and Codex CLI
  0.153.4 completed initial and resumed turns against a localhost mock provider,
  using temporary configuration and fake credentials. Both sent the selected model.
- Regression checks cover output emitted before SSE connects (including logging
  and resumed turns), plus rejection of unsupported Codex authentication modes.
- No remote-provider compatibility claim is made by these tests.
