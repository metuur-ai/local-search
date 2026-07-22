import { spawn as nodeSpawn } from 'node:child_process';
import { deriveEvents } from './toolParse.js';
import { broadcast } from './stream.js';
import { tapChild } from './cliLog.js';

/**
 * No-AI ("graph only") retrieval path. Instead of spawning `claude` and waiting
 * on a full agentic search -> read -> reason loop, this runs the `local-search`
 * graph DB search directly for each selected repo. It returns in CLI time
 * (~milliseconds) rather than model time (minutes), and emits the SAME
 * `sources`/`provenance`/`activity` SSE events the AI path derives from tool
 * output — just with no `answer`, terminating on a `done{mode:'graph'}` frame.
 */

/**
 * defaultSpawnSearch({ query, repo, session, spawn }) -> Promise<string stdout>.
 * Spawns `local-search json search <query> <repo>` with an argv array (no shell,
 * so the query needs no quoting/escaping) and resolves its stdout. Records the
 * live child on `session` so cancel/disconnect can killTree it. `spawn` is
 * injected for tests.
 */
export function defaultSpawnSearch({ query, repo, session, spawn = nodeSpawn, cliLog } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('local-search', ['json', 'search', query, repo], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (session) session.child = child;
    // Log the interaction (no-op when cliLog is absent). tapChild adds extra
    // listeners; it does not disturb the accumulation/resolve logic below.
    const h = cliLog?.record({
      cli: 'local-search',
      command: `local-search json search "${query}" ${repo}`,
      sessionId: session?.id,
    });
    if (h) tapChild(h, child);
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`local-search json search exited ${code}: ${err.trim()}`))
    );
  });
}

// Command string deriveEvents classifies (it only reads the positionals). The
// real spawn uses argv, so this is display/parse-only; strip quotes from the
// query so the repo stays the 4th positional token.
function commandFor(query, repo) {
  const safe = String(query ?? '').replace(/"/g, '');
  return `local-search json search "${safe}" ${repo}`;
}

/**
 * runGraphSearch({ query, repos, session, deps }) — drive the no-AI path.
 * Searches each repo in turn, broadcasting derived events; a repo that yields no
 * parseable rows (e.g. a bare `null` for no matches) still records an empty
 * sources set + provenance so the UI reads "0 sources" for that repo rather than
 * silently skipping it. Stops early on cancel. Always ends with `done`.
 */
export async function runGraphSearch({ query, repos, session, deps = {} } = {}) {
  const spawnSearch = deps.spawnSearch ?? defaultSpawnSearch;
  const list = Array.isArray(repos) ? repos : [];

  for (const repo of list) {
    if (session.cancelled || session.phase === 'done') break;

    const command = commandFor(query, repo);
    let stdout;
    try {
      stdout = await spawnSearch({ query: query ?? '', repo, session, cliLog: deps.cliLog });
    } catch (err) {
      broadcast(session, 'activity', {
        command,
        resultSummary: `error: ${err?.message ?? String(err)}`,
      });
      continue;
    }

    const events = deriveEvents({ command, stdout });
    if (!events.some((e) => e.type === 'sources')) {
      broadcast(session, 'sources', []);
      broadcast(session, 'provenance', { scope: [repo], missing: [] });
    }
    for (const ev of events) broadcast(session, ev.type, ev.data);
  }

  if (session.phase !== 'done') {
    session.phase = 'done';
    broadcast(session, 'done', { ok: true, mode: 'graph' });
  }
}
