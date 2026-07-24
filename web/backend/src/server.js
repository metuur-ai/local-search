import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { handleRepos } from './repos.js';
import { handleQuery, handleStream, handleReply, handleCancel } from './query.js';
import { handleGraphGet, handleGraphRefresh } from './graphExport.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

/**
 * Resolve a request pathname to an absolute file path inside staticDir.
 * Returns null if the resolved path escapes staticDir (traversal attempt).
 */
function resolveStatic(staticDir, pathname) {
  const root = path.resolve(staticDir);
  const rel = decodeURIComponent(pathname);
  const target = path.resolve(root, '.' + (rel === '/' ? '/index.html' : rel));
  if (target !== root && !target.startsWith(root + path.sep)) {
    return null;
  }
  return target;
}

/**
 * createServer({ staticDir, registry, deps, assetHandler }) -> unstarted http.Server.
 * The caller is responsible for calling .listen(). API routes match first; for
 * GET/HEAD, an optional `assetHandler` (e.g. Vite dev middleware) takes over
 * asset serving, otherwise assets are served statically from staticDir.
 */
export function createServer({ staticDir, registry, deps, assetHandler } = {}) {
  const handler = (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;

    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { ok: true });
    }

    // GET /api/repos
    if (req.method === 'GET' && pathname === '/api/repos') {
      return handleRepos(req, res, deps);
    }

    // POST /api/query
    if (req.method === 'POST' && pathname === '/api/query') {
      return handleQuery(req, res, { registry, deps });
    }

    // GET /api/graph — return the persisted graph (or an empty one).
    if (req.method === 'GET' && pathname === '/api/graph') {
      return handleGraphGet(req, res, deps);
    }

    // POST /api/graph/refresh — rebuild + persist the graph from repos.
    if (req.method === 'POST' && pathname === '/api/graph/refresh') {
      return handleGraphRefresh(req, res, deps);
    }

    // /api/session/:id/{stream,reply,cancel}
    const sessionMatch = pathname.match(/^\/api\/session\/([^/]+)\/(stream|reply|cancel)$/);
    if (sessionMatch) {
      const [, id, action] = sessionMatch;
      if (action === 'stream' && req.method === 'GET') {
        return handleStream(req, res, { registry, id });
      }
      if (action === 'reply' && req.method === 'POST') {
        return handleReply(req, res, { registry, id });
      }
      if (action === 'cancel' && req.method === 'POST') {
        return handleCancel(req, res, { registry, id });
      }
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      // In dev, hand asset serving to the injected handler (Vite middleware).
      if (assetHandler) {
        return assetHandler(req, res);
      }
      const filePath = resolveStatic(staticDir, pathname);
      if (filePath === null) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Forbidden');
      }
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Not Found');
      }
      if (stat.isDirectory()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Not Found');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(filePath).pipe(res);
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  };

  return http.createServer(handler);
}
