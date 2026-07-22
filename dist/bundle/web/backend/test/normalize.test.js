import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNormalizer } from '../src/normalize.js';

function feed(n, objs) {
  const out = [];
  for (const o of objs) out.push(...n.push(o));
  return out;
}

test('full turn: init -> tool_use/result search -> tool_use/result related -> answer', () => {
  const n = createNormalizer();
  const events = feed(n, [
    { type: 'system', subtype: 'init', session_id: 'sid-123', model: 'claude-x' },
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'local-search json search "q" foyer-platform' } },
        ],
      },
    },
    {
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 't1', content: 'progress\n[{"repo":"foyer-platform","name":"a","relevance":0.9}]\n' },
        ],
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
        content: [
          { type: 'tool_result', tool_use_id: 't2', content: '[{"repo":"foyer-platform","name":"b","path":"x/b","relevance":-7.4}]' },
        ],
      },
    },
    { type: 'result', subtype: 'success', is_error: false, result: 'The answer is 42.' },
  ]);

  const types = events.map((e) => e.type);
  assert.deepEqual(types, ['status', 'sources', 'provenance', 'activity', 'graph', 'activity', 'answer', 'done']);
  assert.equal(events[0].data.phase, 'started');
  assert.equal(events[0].data.model, 'claude-x');
  assert.equal(n.sessionId, 'sid-123'); // captured for the registry
  assert.deepEqual(events[1].data, [{ repo: 'foyer-platform', name: 'a', relevance: 0.9 }]);
  assert.deepEqual(events[2].data, { scope: ['foyer-platform'], missing: [] });
  assert.equal(events[4].data.nodes[0].id, 'a'); // synthesized graph center
  assert.equal(events.at(-2).data.markdown, 'The answer is 42.');
});

test('R-8.1: a result that ends with a question -> question, no answer', () => {
  const n = createNormalizer();
  const events = feed(n, [
    { type: 'result', subtype: 'success', is_error: false, result: 'Which repo did you mean?' },
  ]);
  const types = events.map((e) => e.type);
  assert.deepEqual(types, ['question']);
  assert.equal(events[0].data.text, 'Which repo did you mean?');
});

test('R-2.5: is_error result -> error event, never an answer', () => {
  const n = createNormalizer();
  const events = feed(n, [
    { type: 'result', subtype: 'error_during_execution', is_error: true, result: 'boom' },
  ]);
  assert.deepEqual(events.map((e) => e.type), ['error']);
  assert.equal(events[0].data.kind, 'result');
});

test('assistant text blocks surface as assistant events', () => {
  const n = createNormalizer();
  const events = feed(n, [
    { type: 'assistant', message: { content: [{ type: 'text', text: 'thinking...' }] } },
  ]);
  assert.deepEqual(events.map((e) => e.type), ['assistant']);
  assert.equal(events[0].data.text, 'thinking...');
});

test('R-2.5: empty answer result -> error (no fabricated answer)', () => {
  const n = createNormalizer();
  const events = feed(n, [{ type: 'result', subtype: 'success', is_error: false, result: '   ' }]);
  assert.deepEqual(events.map((e) => e.type), ['error']);
});
