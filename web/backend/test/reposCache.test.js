import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoizeRepos, DEFAULT_TTL_MS } from '../src/reposCache.js';

// A controllable clock so the TTL is tested without sleeping.
function clock(start = 0) {
  const c = { t: start, now: () => c.t, advance: (ms) => (c.t += ms) };
  return c;
}

test('memoizeRepos reuses the result inside the TTL', async () => {
  let calls = 0;
  const c = clock();
  const cached = memoizeRepos(async () => `run-${++calls}`, { ttlMs: 1000, now: c.now });

  assert.equal(await cached(), 'run-1');
  c.advance(999);
  assert.equal(await cached(), 'run-1');
  assert.equal(calls, 1);
});

test('memoizeRepos re-runs once the TTL expires', async () => {
  let calls = 0;
  const c = clock();
  const cached = memoizeRepos(async () => `run-${++calls}`, { ttlMs: 1000, now: c.now });

  await cached();
  c.advance(1000);
  assert.equal(await cached(), 'run-2');
  assert.equal(calls, 2);
});

test('memoizeRepos collapses concurrent callers into one run', async () => {
  let calls = 0;
  const cached = memoizeRepos(async () => {
    calls += 1;
    await new Promise((r) => setImmediate(r));
    return 'shared';
  });

  const all = await Promise.all([cached(), cached(), cached()]);
  assert.deepEqual(all, ['shared', 'shared', 'shared']);
  assert.equal(calls, 1);
});

test('memoizeRepos never caches a failure — the next call retries live', async () => {
  let calls = 0;
  const cached = memoizeRepos(async () => {
    calls += 1;
    if (calls === 1) throw new Error('cli exploded');
    return 'recovered';
  });

  await assert.rejects(() => cached(), /cli exploded/);
  assert.equal(await cached(), 'recovered');
  assert.equal(calls, 2);
});

test('memoizeRepos propagates the rejection to every concurrent caller', async () => {
  const cached = memoizeRepos(async () => {
    await new Promise((r) => setImmediate(r));
    throw new Error('boom');
  });

  const results = await Promise.allSettled([cached(), cached()]);
  assert.deepEqual(
    results.map((r) => r.status),
    ['rejected', 'rejected']
  );
});

test('the default TTL is a few seconds, not minutes', () => {
  assert.ok(DEFAULT_TTL_MS >= 1000 && DEFAULT_TTL_MS <= 60_000);
});
