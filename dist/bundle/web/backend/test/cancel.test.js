import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from '../src/server.js';
import { createRegistry } from '../src/sessions.js';
import { makeFakeChild } from './helpers/fakeChild.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, 'fixtures');

let server;
let base;
let registry;

before(async () => {
  registry = createRegistry();
  const deps = {
    // A claude that emits init then never answers (stays running).
    spawnClaude: () =>
      makeFakeChild(
        [{ type: 'system', subtype: 'init', session_id: 'sid-cancel', model: 'm' }],
        { autoClose: false }
      ),
    runRepos: async () => '[]',
  };
  server = createServer({ staticDir: fixtureDir, registry, deps });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
});

test('cancel on a running AI session emits done{cancelled}', async () => {
  const r1 = await fetch(`${base}/api/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: 'hi', repos: ['a'] }),
  });
  const { sessionId } = await r1.json();

  const res = await fetch(`${base}/api/session/${sessionId}/stream`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  // Read until we see status (stream is live), then cancel.
  let text = '';
  while (!/event: status/.test(text)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }

  const c = await fetch(`${base}/api/session/${sessionId}/cancel`, { method: 'POST' });
  assert.equal(c.status, 200, 'cancel should return 200');

  while (!/event: done/.test(text)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel();

  assert.match(text, /event: done/);
  assert.match(text, /"cancelled":true/);
});
