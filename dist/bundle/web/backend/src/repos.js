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
