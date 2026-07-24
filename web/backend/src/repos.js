import { spawn } from 'node:child_process';
import { stripAndParse } from './toolParse.js';

/**
 * parseReposStdout(stdout) -> RepoRow[].
 * R-1.2: tolerantly extract the JSON array, skipping leading non-JSON progress lines.
 */
export function parseReposStdout(stdout) {
  const parsed = stripAndParse(stdout);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.repos)) return parsed.repos;
  return [];
}

/**
 * parseRepoListTable(stdout) -> [{ name, path, has_graph }].
 * Parses the columnar `local-search repo list` output (fast — it does NOT trigger
 * the git reindex that `json repos` forces). Columns are separated by 2+ spaces:
 *   NAME  ADDED  LAST SCAN  LAST UPDATE  COMMIT  GRAPH  PATH
 * The GRAPH column is a dash ("—"/"-") when the repo has no graph, else a kind
 * list like "graphify+crg". The header and any CLI progress noise are skipped.
 */
export function parseRepoListTable(stdout) {
  const rows = [];
  for (const raw of String(stdout ?? '').split('\n')) {
    const line = raw.trimEnd();
    if (!line || line.startsWith('NAME')) continue;
    const cols = line.split(/\s{2,}/);
    // A data row has all 7 columns and ends in an absolute path; progress lines
    // ("(squirrel: git changes…)") and blanks fail one of these guards.
    if (cols.length < 7) continue;
    const name = cols[0];
    const graph = cols[5];
    const path = cols[6];
    if (!path.startsWith('/')) continue;
    rows.push({ name, path, has_graph: graph !== '—' && graph !== '-' && graph !== '' });
  }
  return rows;
}

/**
 * specCountsFromInit(stdout) -> Map<name, spec_count>.
 * `local-search init --json` reports spec counts per repo (also without the
 * reindex) under `repositories` (in the project scope) and `available` (the
 * rest). Union both so every registered repo gets its count. Best-effort:
 * malformed JSON yields an empty map and callers default to 0.
 */
export function specCountsFromInit(stdout) {
  const map = new Map();
  try {
    const parsed = JSON.parse(String(stdout ?? ''));
    for (const bucket of ['repositories', 'available']) {
      const list = Array.isArray(parsed?.[bucket]) ? parsed[bucket] : [];
      for (const r of list) {
        if (r && r.name != null) map.set(r.name, r.spec_count ?? 0);
      }
    }
  } catch {
    /* no counts available */
  }
  return map;
}

/**
 * mergeRepoRows(listStdout, initStdout) -> RepoRow[].
 * The registered-repo set + graph flag comes from `repo list`; spec counts are
 * enriched by name from `init --json`. This replaces the slow `json repos` while
 * preserving the fields the picker needs (name, path, spec_count, has_graph).
 */
export function mergeRepoRows(listStdout, initStdout) {
  const specs = specCountsFromInit(initStdout);
  return parseRepoListTable(listStdout).map((r) => ({
    name: r.name,
    path: r.path,
    spec_count: specs.get(r.name) ?? 0,
    has_graph: r.has_graph,
  }));
}

/** Default runRepos: shell `local-search json repos`, resolve its stdout string. */
export function defaultRunRepos() {
  return new Promise((resolve, reject) => {
    const child = spawn('local-search', ['json', 'repos'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`local-search json repos exited ${code}: ${err.trim()}`));
    });
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

/**
 * handleRepos(req, res, { runRepos }) — GET /api/repos.
 * R-1.2: runs runRepos(), parses rows, responds 200 with them.
 * R-1.6 (backend half): on failure respond 500 with an explicit error JSON so the
 * frontend never renders an empty picker as success.
 */
export async function handleRepos(req, res, { runRepos = defaultRunRepos } = {}) {
  try {
    const stdout = await runRepos();
    const repos = parseReposStdout(stdout);
    sendJson(res, 200, repos);
  } catch (err) {
    sendJson(res, 500, {
      error: 'repos_failed',
      message: err?.message ?? String(err),
    });
  }
}
