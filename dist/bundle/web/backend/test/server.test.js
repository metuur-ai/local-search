import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from '../src/server.js';
import { createRegistry } from '../src/sessions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, 'fixtures');

let server;
let base;

before(async () => {
  server = createServer({ staticDir: fixtureDir, registry: createRegistry(), deps: {} });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET /api/health returns 200 JSON {ok:true}', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);
  const body = await res.json();
  assert.deepEqual(body, { ok: true });
});

test('GET / serves index.html from staticDir', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /FIXTURE_MARKER_OK/);
});

test('path traversal is rejected (never serves outside staticDir)', async () => {
  const res = await fetch(`${base}/../server.js`);
  assert.ok(res.status === 403 || res.status === 404, `got ${res.status}`);
  const body = await res.text();
  assert.doesNotMatch(body, /createServer/);
});

test('unknown path returns 404', async () => {
  const res = await fetch(`${base}/does-not-exist.txt`);
  assert.equal(res.status, 404);
});
