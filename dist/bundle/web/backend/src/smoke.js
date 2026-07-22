import { stripAndParse } from './toolParse.js';

/**
 * probeJsonContext({ run, repo }) — startup validation for R-5.5.
 *
 * Runs the equivalent of `local-search json context --scope <repo>` via the
 * injected `run` and checks the parsed stdout is an object containing BOTH
 * `scope` and `missing` keys (the provenance contract). Never throws: on any
 * failure it resolves { available: false, reason } so callers can degrade
 * provenance to "unavailable" rather than fabricate scope.
 *
 * @param {object}   deps
 * @param {(args:string[]) => Promise<{ stdout:string, code:number }>} deps.run
 * @param {string}   deps.repo  sample repo name to probe.
 * @returns {Promise<{ available: true } | { available: false, reason: string }>}
 */
export async function probeJsonContext({ run, repo } = {}) {
  let result;
  try {
    // `local-search json context` requires a <query> positional before --scope
    // (usage: `json context <query> [--scope repo1,repo2]`). Omitting it exits 1,
    // so the probe would always report "degraded". A neutral probe query is enough
    // to exercise the provenance contract.
    result = await run(['json', 'context', 'probe', '--scope', repo]);
  } catch (err) {
    return { available: false, reason: err?.message ?? String(err) };
  }

  const { stdout, code } = result ?? {};
  if (code !== 0) {
    return { available: false, reason: `exit code ${code}` };
  }

  const parsed = stripAndParse(stdout);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    return { available: false, reason: 'no JSON object in output' };
  }

  if (!('scope' in parsed) || !('missing' in parsed)) {
    return { available: false, reason: 'missing scope/missing keys' };
  }

  return { available: true };
}
