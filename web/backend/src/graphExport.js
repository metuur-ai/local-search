import fs from 'node:fs';
import path from 'node:path';

function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// Stream/return a JSON file verbatim with a 200 + application/json.
function sendJsonFile(res, file) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
}

/**
 * handleGraphGet(req, res, { graphCacheFile }) — GET /api/graph.
 * Returns the persisted graph verbatim if the cache file exists; otherwise an
 * empty graph so the viewer renders and prompts a refresh. Never 500s for a
 * missing cache.
 */
export function handleGraphGet(req, res, { graphCacheFile } = {}) {
  if (graphCacheFile && fs.existsSync(graphCacheFile)) {
    return sendJsonFile(res, graphCacheFile);
  }
  return sendJson(res, 200, { nodes: [], links: [] });
}

const MAX_BODY = 1 << 20; // 1 MiB — repo-name lists are tiny; guard against abuse.

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      if (tooBig) return;
      data += chunk;
      if (data.length > MAX_BODY) {
        tooBig = true;
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!tooBig) resolve(data);
    });
    req.on('error', reject);
  });
}

/**
 * handleGraphRefresh(req, res, { runLocalSearch, graphCacheFile }) —
 * POST /api/graph/refresh. Body: { repos?: string[] }.
 * Rebuilds the graph via `local-search graph export-view` into graphCacheFile,
 * then responds with the freshly written JSON. Empty/missing repos => --all.
 */
export async function handleGraphRefresh(req, res, { runLocalSearch, graphCacheFile } = {}) {
  let repos = [];
  try {
    const raw = await readBody(req);
    if (raw && raw.trim()) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.repos)) {
        // Only accept string entries — args are passed to spawn, not a shell,
        // but filtering to strings avoids malformed/injected argv values.
        repos = parsed.repos.filter((r) => typeof r === 'string' && r.length > 0);
      }
    }
  } catch (err) {
    return sendJson(res, 400, {
      error: 'bad_request',
      message: err?.message ?? 'invalid request body',
    });
  }

  // Ensure the parent dir of the cache file exists.
  try {
    fs.mkdirSync(path.dirname(graphCacheFile), { recursive: true });
  } catch (err) {
    return sendJson(res, 500, {
      error: 'export_failed',
      message: err?.message ?? 'could not create cache directory',
    });
  }

  const args = [
    'graph',
    'export-view',
    ...(repos.length ? ['--repos', repos.join(',')] : ['--all']),
    '--out',
    graphCacheFile,
  ];

  let result;
  try {
    result = await runLocalSearch(args);
  } catch (err) {
    return sendJson(res, 500, {
      error: 'export_failed',
      message: err?.message ?? 'graph export-view failed',
    });
  }

  if (!result || result.code !== 0) {
    return sendJson(res, 500, {
      error: 'export_failed',
      message: (result?.stderr || '').trim() || 'graph export-view failed',
    });
  }

  if (!fs.existsSync(graphCacheFile)) {
    return sendJson(res, 500, {
      error: 'export_failed',
      message: 'graph export-view produced no output file',
    });
  }
  return sendJsonFile(res, graphCacheFile);
}
