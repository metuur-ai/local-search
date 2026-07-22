import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runGraphSearch } from '../src/graphSearch.js';
import { createServer } from '../src/server.js';
import { createRegistry } from '../src/sessions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, 'fixtures');

// A fake SSE client that records the frames written to it.
function fakeSession() {
  const frames = [];
  const client = { write: (s) => frames.push(s) };
  return {
    session: { phase: 'running', cancelled: false, sseClients: new Set([client]) },
    frames,
  };
}

const ROWS = JSON.stringify([
  { repo: 'r1', name: 'a', path: 'a.md', relevance: -0.9 },
  { repo: 'r1', name: 'b', path: 'b.md', relevance: -0.8 },
]);

test('runGraphSearch broadcasts sources + provenance + done, no answer', async () => {
  const { session, frames } = fakeSession();
  const deps = { spawnSearch: async ({ repo }) => (repo === 'r1' ? ROWS : 'null') };

  await runGraphSearch({ query: 'q', repos: ['r1'], session, deps });

  const joined = frames.join('');
  assert.match(joined, /event: sources/);
  assert.match(joined, /event: provenance/);
  assert.match(joined, /event: done/);
  assert.match(joined, /"mode":"graph"/);
  assert.doesNotMatch(joined, /event: answer/);
  assert.equal(session.phase, 'done');
});

test('runGraphSearch emits empty sources for a no-match (null) repo', async () => {
  const { session, frames } = fakeSession();
  const deps = { spawnSearch: async () => 'null\n' };

  await runGraphSearch({ query: 'zzz', repos: ['r1'], session, deps });

  const joined = frames.join('');
  // A bare `null` still records a sources event (empty) + provenance for the repo.
  assert.match(joined, /event: sources\ndata: \[\]/);
  assert.match(joined, /"scope":\["r1"\]/);
});

test('runGraphSearch stops early when cancelled between repos', async () => {
  const { session, frames } = fakeSession();
  let calls = 0;
  const deps = {
    spawnSearch: async () => {
      calls += 1;
      session.cancelled = true; // simulate a cancel arriving mid-run
      return ROWS;
    },
  };

  await runGraphSearch({ query: 'q', repos: ['r1', 'r2', 'r3'], session, deps });
  assert.equal(calls, 1, 'should not search further repos after cancel');
});

// ---- Route-level: POST /api/query {mode:'graph'} then stream ----

let server;
let base;
let registry;

before(async () => {
  registry = createRegistry();
  const deps = {
    spawnSearch: async ({ repo }) => (repo === 'a' ? ROWS : 'null'),
    runRepos: async () => '[]',
  };
  server = createServer({ staticDir: fixtureDir, registry, deps });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
});

beforeEach(() => {
  for (const s of registry.list()) registry.delete(s.id);
});

test('POST /api/query mode=graph -> stream emits sources + done{mode:graph}', async () => {
  const r1 = await fetch(`${base}/api/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: 'hi', repos: ['a'], mode: 'graph' }),
  });
  assert.equal(r1.status, 200);
  const { sessionId } = await r1.json();

  const res = await fetch(`${base}/api/session/${sessionId}/stream`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (!/event: done/.test(text)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel();

  assert.match(text, /event: sources/);
  assert.match(text, /event: done/);
  assert.match(text, /"mode":"graph"/);
  assert.doesNotMatch(text, /event: answer/);
});
