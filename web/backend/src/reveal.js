// Reveal a source file in the OS file manager (Finder / Explorer / xdg).
// The UI only ever holds a repo-relative path (the graph export carries no
// absolute path at all), so resolution happens here against the registered repo
// roots — which also bounds what can be revealed: a target outside every
// registered root is refused.

import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseReposStdout } from './repos.js';

function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const MAX_BODY = 1 << 16; // 64 KiB — a path payload is tiny.

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

/** True when `target` is `root` itself or sits underneath it. */
function isInside(root, target) {
  return target === root || target.startsWith(root + path.sep);
}

/**
 * resolveRevealTarget({ repo, path, fullpath }, roots) -> { abs } | { error }.
 *
 * `roots` is the registered-repo list ([{ name, path }]). Resolution order:
 *   1. an absolute `fullpath` (search results carry one; graph nodes do not)
 *   2. `path` joined onto the named repo's root
 * Either way the result must land inside a registered root — that check is what
 * stops `..` traversal and arbitrary-path reveals, so it is applied to both.
 */
export function resolveRevealTarget({ repo, path: rel, fullpath } = {}, roots = []) {
  const bounds = roots
    .map((r) => (typeof r?.path === 'string' ? path.resolve(r.path) : null))
    .filter(Boolean);
  if (bounds.length === 0) {
    return { error: 'no_repos', message: 'no registered repositories to resolve against' };
  }

  let abs = null;
  if (typeof fullpath === 'string' && fullpath.trim() && path.isAbsolute(fullpath)) {
    abs = path.resolve(fullpath);
  } else if (typeof rel === 'string' && rel.trim()) {
    if (typeof repo !== 'string' || !repo.trim()) {
      return { error: 'bad_request', message: 'a repo is required to resolve a relative path' };
    }
    const row = roots.find((r) => r?.name === repo || r?.repo === repo);
    if (!row?.path) {
      return { error: 'unknown_repo', message: `repo "${repo}" is not registered` };
    }
    abs = path.resolve(row.path, rel);
  } else {
    return { error: 'bad_request', message: 'path or fullpath is required' };
  }

  if (!bounds.some((root) => isInside(root, abs))) {
    return { error: 'forbidden', message: 'target is outside every registered repository' };
  }
  return { abs };
}

/**
 * revealArgs(platform, abs) -> [command, args].
 * Windows Explorer wants the flag and the path as one token. Linux has no
 * portable "select the file" verb, so the containing directory is opened.
 */
export function revealArgs(platform, abs) {
  if (platform === 'darwin') return ['open', ['-R', abs]];
  if (platform === 'win32') return ['explorer.exe', [`/select,${abs}`]];
  return ['xdg-open', [path.dirname(abs)]];
}

/**
 * handleReveal(req, res, { runRepos, spawn, platform }) — POST /api/reveal.
 * Body: { repo?, path?, fullpath? }.
 * Resolves + bounds-checks the target, then hands it to the OS file manager.
 * Resolves as soon as the child spawns: Explorer exits non-zero even on success,
 * and the user does not need to wait for the file manager to finish opening.
 */
export async function handleReveal(req, res, deps = {}) {
  const { runRepos, spawn = nodeSpawn, platform = process.platform } = deps;

  let body;
  try {
    const raw = await readBody(req);
    body = raw && raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    return sendJson(res, 400, {
      error: 'bad_request',
      message: err?.message ?? 'invalid request body',
    });
  }

  let roots;
  try {
    roots = parseReposStdout(await runRepos());
  } catch (err) {
    return sendJson(res, 500, {
      error: 'repos_failed',
      message: err?.message ?? String(err),
    });
  }

  const resolved = resolveRevealTarget(body, roots);
  if (resolved.error) {
    const status =
      resolved.error === 'forbidden' ? 403 : resolved.error === 'bad_request' ? 400 : 404;
    return sendJson(res, status, { error: resolved.error, message: resolved.message });
  }

  if (!fs.existsSync(resolved.abs)) {
    return sendJson(res, 404, {
      error: 'not_found',
      message: `${resolved.abs} no longer exists on disk`,
    });
  }

  const [cmd, args] = revealArgs(platform, resolved.abs);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
  } catch (err) {
    return sendJson(res, 500, {
      error: 'reveal_failed',
      message: `${cmd} failed: ${err?.message ?? String(err)}`,
    });
  }

  return sendJson(res, 200, { ok: true, path: resolved.abs });
}
