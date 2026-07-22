import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from '../src/server.js';
import { createRegistry } from '../src/sessions.js';
import { makeFakeChild } from './helpers/fakeChild.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, 'fixtures');

// A scripted claude stream-json run: init -> search tool -> graph tool -> answer.
const SCRIPT = [
  { type: 'system', subtype: 'init', session_id: 'sid-xyz', model: 'claude-x' },
  {
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'local-search json search "q"' } },
      ],
    },
  },
  {
    type: 'user',
    message: {
      content: [{ type: 'tool_result', tool_use_id: 't1', content: 'progress\n[{"name":"a"}]\n' }],
    },
  },
  {
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'local-search json related a' } },
      ],
    },
  },
  {
    type: 'user',
    message: {
      content: [{ type: 'tool_result', tool_use_id: 't2', content: '[{"repo":"a","name":"n1","path":"x/n1"}]' }],
    },
  },
  { type: 'result', subtype: 'success', is_error: false, result: 'Final answer.' },
];

let server;
let base;
let registry;
let spawnCalls;
let deps;

before(async () => {
  registry = createRegistry();
  spawnCalls = [];
  deps = {
    spawnClaude: ({ prompt }) => {
      spawnCalls.push({ prompt });
      return makeFakeChild(SCRIPT);
    },
    runRepos: async () => 'noise\n[{"repo":"a","spec_count":2}]',
  };
  server = createServer({ staticDir: fixtureDir, registry, deps });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  for (const s of registry.list()) registry.delete(s.id);
  spawnCalls.length = 0;
});

test('R-2.2: POST /api/query with empty repos -> 400, spawn not called', async () => {
  const res = await fetch(`${base}/api/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: 'hi', repos: [] }),
  });
  assert.equal(res.status, 400);
  assert.equal(spawnCalls.length, 0);
});

test('R-2.1/R-2.9: first query -> 200 {sessionId}; second concurrent -> 409', async () => {
  const r1 = await fetch(`${base}/api/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: 'hi', repos: ['a'] }),
  });
  assert.equal(r1.status, 200);
  const { sessionId } = await r1.json();
  assert.ok(sessionId);
  assert.equal(spawnCalls.length, 1);

  const r2 = await fetch(`${base}/api/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: 'again', repos: ['a'] }),
  });
  assert.equal(r2.status, 409);
});

test('R-2.3: SSE stream emits sources, graph, answer, done from scripted child', async () => {
  const r1 = await fetch(`${base}/api/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: 'hi', repos: ['a'] }),
  });
  const { sessionId } = await r1.json();

  const res = await fetch(`${base}/api/session/${sessionId}/stream`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  // Read until we see the terminal `done` frame (or the stream ends).
  while (!/event: done/.test(text)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel();

  assert.match(text, /event: status/);
  assert.match(text, /event: sources/);
  assert.match(text, /event: graph/);
  assert.match(text, /event: answer/);
  assert.match(text, /event: done/);

  // claudeSessionId captured onto the session from the init status.
  assert.equal(registry.get(sessionId).claudeSessionId, 'sid-xyz');
});

test('R-8.1: a question-ending turn streams `question` and no error on close', async () => {
  const questionScript = [
    { type: 'system', subtype: 'init', session_id: 'sid-q', model: 'claude-x' },
    { type: 'result', subtype: 'success', is_error: false, result: 'Which repo did you mean?' },
  ];
  // Override spawn just for this test via a fresh registry-scoped fake child.
  deps.spawnClaude = () => makeFakeChild(questionScript);

  const r1 = await fetch(`${base}/api/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: 'hi', repos: ['a'] }),
  });
  const { sessionId } = await r1.json();

  const res = await fetch(`${base}/api/session/${sessionId}/stream`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (!/event: question/.test(text)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel();

  assert.match(text, /event: question/);
  assert.doesNotMatch(text, /event: error/);

  // restore the default multi-step script for later tests
  deps.spawnClaude = ({ prompt }) => {
    spawnCalls.push({ prompt });
    return makeFakeChild(SCRIPT);
  };
});

test('R-1.2: GET /api/repos with fake runRepos -> 200 rows', async () => {
  const res = await fetch(`${base}/api/repos`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), [{ repo: 'a', spec_count: 2 }]);
});

test('reply on unknown session -> 404; cancel on unknown session -> 404', async () => {
  const reply = await fetch(`${base}/api/session/nope/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'x' }),
  });
  assert.equal(reply.status, 404);
  const cancel = await fetch(`${base}/api/session/nope/cancel`, { method: 'POST' });
  assert.equal(cancel.status, 404);
});
