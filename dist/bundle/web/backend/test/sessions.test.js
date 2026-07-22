import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../src/sessions.js';

test('create() returns a well-formed session', () => {
  const registry = createRegistry();
  const before = Date.now();
  const s = registry.create();

  assert.equal(typeof s.id, 'string');
  assert.ok(s.id.length > 0);
  assert.ok(s.sseClients instanceof Set);
  assert.equal(s.sseClients.size, 0);
  assert.equal(s.phase, 'idle');
  assert.equal(s.claudeSessionId, null);
  assert.equal(s.child, null);
  assert.equal(typeof s.startedAt, 'number');
  assert.ok(s.startedAt >= before);
});

test('create() generates unique ids', () => {
  const registry = createRegistry();
  const a = registry.create();
  const b = registry.create();
  assert.notEqual(a.id, b.id);
});

test('create() merges extra fields', () => {
  const registry = createRegistry();
  const s = registry.create({ phase: 'starting', repo: 'demo' });
  assert.equal(s.phase, 'starting');
  assert.equal(s.repo, 'demo');
});

test('get() returns same session; unknown returns undefined', () => {
  const registry = createRegistry();
  const s = registry.create();
  assert.equal(registry.get(s.id), s);
  assert.equal(registry.get('nope'), undefined);
});

test('delete() removes session and reports presence', () => {
  const registry = createRegistry();
  const s = registry.create();
  assert.equal(registry.delete(s.id), true);
  assert.equal(registry.get(s.id), undefined);
  assert.equal(registry.delete(s.id), false);
  assert.equal(registry.delete('never'), false);
});

test('list() reflects current sessions', () => {
  const registry = createRegistry();
  assert.deepEqual(registry.list(), []);
  const a = registry.create();
  const b = registry.create();
  const ids = registry.list().map((x) => x.id).sort();
  assert.deepEqual(ids, [a.id, b.id].sort());
  registry.delete(a.id);
  assert.deepEqual(registry.list().map((x) => x.id), [b.id]);
});
