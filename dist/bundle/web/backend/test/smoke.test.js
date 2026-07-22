import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeJsonContext } from '../src/smoke.js';

test('R-5.5: valid {scope,missing} with a progress prefix -> { available: true }', async () => {
  const run = async () => ({
    stdout: 'Loading registry...\n{"scope":["r"],"missing":[]}\n',
    code: 0,
  });
  const result = await probeJsonContext({ run, repo: 'r' });
  assert.deepEqual(result, { available: true });
});

test('R-5.5: run rejects -> { available: false } with reason, no throw', async () => {
  const run = async () => {
    throw new Error('local-search not found');
  };
  const result = await probeJsonContext({ run, repo: 'r' });
  assert.equal(result.available, false);
  assert.equal(typeof result.reason, 'string');
});

test('R-5.5: non-zero exit code -> { available: false } with reason', async () => {
  const run = async () => ({ stdout: '{"scope":[],"missing":[]}', code: 1 });
  const result = await probeJsonContext({ run, repo: 'r' });
  assert.equal(result.available, false);
  assert.equal(typeof result.reason, 'string');
});

test('R-5.5: stdout has no JSON -> { available: false } with reason', async () => {
  const run = async () => ({ stdout: 'no json here at all', code: 0 });
  const result = await probeJsonContext({ run, repo: 'r' });
  assert.equal(result.available, false);
  assert.equal(typeof result.reason, 'string');
});

test('R-5.5: JSON present but missing scope/missing keys -> { available: false }', async () => {
  const run = async () => ({ stdout: '{"results":[]}', code: 0 });
  const result = await probeJsonContext({ run, repo: 'r' });
  assert.equal(result.available, false);
  assert.equal(typeof result.reason, 'string');
});
