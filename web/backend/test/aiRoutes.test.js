import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { createRegistry } from '../src/sessions.js';
import { createAiCatalog } from '../src/ai.js';
import { makeFakeChild } from './helpers/fakeChild.js';

async function harness(t) {
  const calls = [];
  const registry = createRegistry();
  const deps = {
    spawnClaude: () => { throw new Error('Unexpected legacy Claude spawn'); },
    aiCatalog: createAiCatalog({ providers: [{ id: 'test', cli: 'codex', models: ['test-model'], baseUrl: 'http://localhost:9999/v1' }] }),
    spawnAi: (args) => {
      const child = makeFakeChild([], { autoClose: false });
      calls.push({ ...args, child });
      return child;
    },
  };
  const server = createServer({ registry, deps, staticDir: '/tmp/nonexistent-ai-test-assets' });
  t.after(async () => {
    for (const { child } of calls) child.emit('close', 0);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { base, post, calls, registry, deps };
}

// @spec SEARCH-AI-001, SEARCH-AI-002, SEARCH-AI-003
test('HTTP query selection and resume retain the chosen CLI/provider/model', async (t) => {
  const { base, post, calls, registry } = await harness(t);
  const res = await post('/api/query', { q: 'refund?', repos: ['docs'], ai: { cli: 'codex', provider: 'test', model: 'test-model' } });
  assert.equal(res.status, 200);
  const { sessionId } = await res.json();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].execution.cli, 'codex');
  assert.equal(calls[0].execution.provider.id, 'test');
  assert.equal(calls[0].execution.model, 'test-model');
  const stream = fetch(`${base}/api/session/${sessionId}/stream`);
  const timer = setTimeout(() => {
    calls[0].child.stdout.push(JSON.stringify({ type: 'thread.started', thread_id: 'codex-thread' }) + '\n');
    calls[0].child.stdout.push(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Refunds are allowed.' } }) + '\n');
    calls[0].child.stdout.push(JSON.stringify({ type: 'turn.completed', usage: {} }) + '\n');
    calls[0].child.emit('close', 0);
  }, 30);
  t.after(() => clearTimeout(timer));
  const text = await (await stream).text();
  assert.match(text, /event: answer/);
  assert.match(text, /"provider":"test"/);
  assert.equal(registry.get(sessionId).agentSessionId, 'codex-thread');
  const reply = await post(`/api/session/${sessionId}/reply`, { text: 'More details', ai: { cli: 'claude' } });
  assert.equal(reply.status, 200);
  assert.equal(calls[1].resumeSessionId, 'codex-thread');
  assert.deepEqual(calls[1].execution, calls[0].execution);
});

// @spec SEARCH-AI-001, SEARCH-AI-002, SEARCH-AI-003
test('HTTP rejects invalid choices, exposes only public catalog, and graph mode bypasses AI validation', async (t) => {
  const { base, post, calls } = await harness(t);
  const catalog = await (await fetch(base + '/api/ai-options')).json();
  assert.equal(catalog.providers.length, 3);
  assert.ok(!JSON.stringify(catalog).includes('baseUrl'));
  const invalid = await post('/api/query', { q: 'q', repos: ['docs'], ai: { cli: 'codex', provider: 'test', model: 'wrong' } });
  assert.equal(invalid.status, 400);
  assert.equal(calls.length, 0);
  const graph = await post('/api/query', { q: 'q', repos: ['docs'], mode: 'graph', ai: { cli: 'bad' } });
  assert.equal(graph.status, 200);
  assert.equal(calls.length, 0);
});

// @spec SEARCH-AI-001
test('a missing selected CLI is still reported when its error precedes the SSE connection', async (t) => {
  const { base, post, calls } = await harness(t);
  const { sessionId } = await (await post('/api/query', { q: 'q', repos: ['docs'], ai: { cli: 'codex' } })).json();
  calls[0].child.emit('error', Object.assign(new Error('missing'), { code: 'ENOENT' }));
  const response = await fetch(`${base}/api/session/${sessionId}/stream`, { signal: AbortSignal.timeout(500) });
  assert.match(await response.text(), /codex binary is not on PATH/);
});

// @spec SEARCH-AI-001
test('early output and completed replies survive connecting SSE late with CLI logging enabled', async (t) => {
  const { base, post, calls, registry, deps } = await harness(t);
  const { NOOP_CLILOG } = await import('../src/cliLog.js');
  deps.cliLog = NOOP_CLILOG;
  const { sessionId } = await (await post('/api/query', { q: 'q', repos: ['docs'], ai: { cli: 'codex' } })).json();
  async function finish(child) {
    child.stdout.push(JSON.stringify({ type: 'thread.started', thread_id: 'early-thread' }) + '\n');
    child.stdout.push(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Early answer.' } }) + '\n');
    child.stdout.push(JSON.stringify({ type: 'turn.completed', usage: {} }) + '\n');
    await new Promise(setImmediate);
    child.emit('close', 0);
  }
  await finish(calls[0].child);
  assert.equal(registry.get(sessionId).agentSessionId, 'early-thread');
  const read = async () => (await fetch(`${base}/api/session/${sessionId}/stream`, { signal: AbortSignal.timeout(1000) })).text();
  assert.match(await read(), /event: answer/);
  assert.equal((await post(`/api/session/${sessionId}/reply`, { text: 'More' })).status, 200);
  await finish(calls[1].child);
  assert.match(await read(), /Early answer/);
  assert.equal(calls[1].resumeSessionId, 'early-thread');
});
