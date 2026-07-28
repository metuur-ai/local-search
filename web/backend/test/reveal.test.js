import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../src/server.js';
import { createRegistry } from '../src/sessions.js';
import { resolveRevealTarget, revealArgs } from '../src/reveal.js';

// A real temp repo so the existence check has something to find.
let repoRoot;
let outsideFile;
let server;
let base;
let spawnCalls;

/** A child stub that reports a successful spawn without touching the OS. */
function fakeChild() {
  const child = new EventEmitter();
  child.unref = () => {};
  queueMicrotask(() => child.emit('spawn'));
  return child;
}

before(async () => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reveal-repo-'));
  fs.mkdirSync(path.join(repoRoot, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'docs', 'auth.md'), '# auth\n');

  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reveal-outside-'));
  outsideFile = path.join(outsideDir, 'secret.md');
  fs.writeFileSync(outsideFile, 'nope\n');

  spawnCalls = [];
  const deps = {
    runRepos: async () => JSON.stringify([{ name: 'squirrel', path: repoRoot }]),
    platform: 'darwin',
    spawn: (cmd, args) => {
      spawnCalls.push({ cmd, args });
      return fakeChild();
    },
  };
  server = createServer({ staticDir: repoRoot, registry: createRegistry(), deps });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

function postReveal(body) {
  return fetch(`${base}/api/reveal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// --- resolveRevealTarget -----------------------------------------------------

test('resolveRevealTarget joins a repo-relative path onto the repo root', () => {
  const roots = [{ name: 'squirrel', path: '/repos/squirrel' }];
  const out = resolveRevealTarget({ repo: 'squirrel', path: 'docs/a.md' }, roots);
  assert.equal(out.abs, path.resolve('/repos/squirrel/docs/a.md'));
});

test('resolveRevealTarget prefers an absolute fullpath when it is inside a root', () => {
  const roots = [{ name: 'squirrel', path: '/repos/squirrel' }];
  const out = resolveRevealTarget(
    { repo: 'squirrel', path: 'docs/a.md', fullpath: '/repos/squirrel/docs/b.md' },
    roots
  );
  assert.equal(out.abs, path.resolve('/repos/squirrel/docs/b.md'));
});

test('resolveRevealTarget refuses a traversal that escapes the repo root', () => {
  const roots = [{ name: 'squirrel', path: '/repos/squirrel' }];
  const out = resolveRevealTarget({ repo: 'squirrel', path: '../../etc/passwd' }, roots);
  assert.equal(out.error, 'forbidden');
  assert.equal(out.abs, undefined);
});

test('resolveRevealTarget refuses a fullpath outside every registered root', () => {
  const roots = [{ name: 'squirrel', path: '/repos/squirrel' }];
  const out = resolveRevealTarget({ fullpath: '/etc/passwd' }, roots);
  assert.equal(out.error, 'forbidden');
});

test('resolveRevealTarget reports an unregistered repo', () => {
  const roots = [{ name: 'squirrel', path: '/repos/squirrel' }];
  assert.equal(resolveRevealTarget({ repo: 'ghost', path: 'a.md' }, roots).error, 'unknown_repo');
});

test('resolveRevealTarget requires a path and a repo to join it to', () => {
  const roots = [{ name: 'squirrel', path: '/repos/squirrel' }];
  assert.equal(resolveRevealTarget({}, roots).error, 'bad_request');
  assert.equal(resolveRevealTarget({ path: 'a.md' }, roots).error, 'bad_request');
});

test('resolveRevealTarget refuses when no repos are registered', () => {
  assert.equal(resolveRevealTarget({ fullpath: '/a/b.md' }, []).error, 'no_repos');
});

// --- revealArgs --------------------------------------------------------------

test('revealArgs selects the file on macOS and Windows, the folder elsewhere', () => {
  assert.deepEqual(revealArgs('darwin', '/r/docs/a.md'), ['open', ['-R', '/r/docs/a.md']]);
  assert.deepEqual(revealArgs('win32', 'C:\\r\\a.md'), [
    'explorer.exe',
    ['/select,C:\\r\\a.md'],
  ]);
  assert.deepEqual(revealArgs('linux', '/r/docs/a.md'), ['xdg-open', ['/r/docs']]);
});

// --- POST /api/reveal --------------------------------------------------------

test('POST /api/reveal spawns the platform reveal command for a repo-relative path', async () => {
  spawnCalls.length = 0;
  const res = await postReveal({ repo: 'squirrel', path: 'docs/auth.md' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.path, path.join(repoRoot, 'docs', 'auth.md'));
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].cmd, 'open');
  assert.deepEqual(spawnCalls[0].args, ['-R', path.join(repoRoot, 'docs', 'auth.md')]);
});

test('POST /api/reveal 403s a path outside every repo root without spawning', async () => {
  spawnCalls.length = 0;
  const res = await postReveal({ fullpath: outsideFile });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'forbidden');
  assert.equal(spawnCalls.length, 0);
});

test('POST /api/reveal 404s a file that no longer exists', async () => {
  spawnCalls.length = 0;
  const res = await postReveal({ repo: 'squirrel', path: 'docs/gone.md' });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'not_found');
  assert.equal(spawnCalls.length, 0);
});

test('POST /api/reveal 400s a request with no path at all', async () => {
  const res = await postReveal({ repo: 'squirrel' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'bad_request');
});
