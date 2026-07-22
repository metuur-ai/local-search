import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCliLog, NOOP_CLILOG } from '../src/cliLog.js';
import { runGraphSearch } from '../src/graphSearch.js';

const tmpFiles = [];
function tmpLog() {
  const file = path.join(os.tmpdir(), `cliLog-${process.pid}-${Math.random().toString(36).slice(2)}.log`);
  tmpFiles.push(file);
  return file;
}

afterEach(() => {
  while (tmpFiles.length) {
    const f = tmpFiles.pop();
    try {
      fs.rmSync(f, { force: true });
    } catch {
      /* ignore */
    }
  }
});

// Flush the append stream, then read the file back.
async function readAfterClose(log) {
  await log.close();
  return fs.readFileSync(log.file, 'utf8');
}

test('createCliLog writes a header + trailer with command, exit code, and duration', async () => {
  const log = createCliLog({ file: tmpLog() });
  const h = log.record({ cli: 'local-search', command: 'local-search json repos' });
  h.stdout(Buffer.from('some output\n'));
  h.end(0);

  const text = await readAfterClose(log);
  assert.match(text, /▶ local-search/);
  assert.match(text, /local-search json repos/);
  assert.match(text, /some output/);
  assert.match(text, /exit=0/);
  assert.match(text, /duration=\d+ms/);
});

test('stdout larger than maxBytes is capped and marked truncated', async () => {
  const log = createCliLog({ file: tmpLog(), maxBytes: 16 });
  const h = log.record({ cli: 'local-search', command: 'local-search json search "q" r' });
  h.stdout(Buffer.from('x'.repeat(100)));
  h.end(0);

  const text = await readAfterClose(log);
  assert.match(text, /stdout \(truncated\)/);
  // The captured stdout body must not contain all 100 chars.
  assert.ok(!text.includes('x'.repeat(100)));
});

test("record with cli:'claude' includes the prompt block", async () => {
  const log = createCliLog({ file: tmpLog() });
  const h = log.record({
    cli: 'claude',
    command: 'claude -p ... <prompt>',
    prompt: 'line one\nline two',
    sessionId: 'sess-1',
  });
  h.end(0);

  const text = await readAfterClose(log);
  assert.match(text, /session=sess-1/);
  assert.match(text, /prompt:/);
  assert.match(text, /line one/);
  assert.match(text, /line two/);
});

test('error(err) writes an error trailer for spawn failures', async () => {
  const log = createCliLog({ file: tmpLog() });
  const h = log.record({ cli: 'claude', command: 'claude -p ... <prompt>' });
  h.error(new Error('ENOENT'));

  const text = await readAfterClose(log);
  assert.match(text, /error: ENOENT/);
});

test('NOOP_CLILOG.record returns a safe no-op handle', () => {
  const h = NOOP_CLILOG.record({ cli: 'claude', command: 'x' });
  assert.doesNotThrow(() => {
    h.stdout(Buffer.from('a'));
    h.stderr(Buffer.from('b'));
    h.end(0);
    h.error(new Error('boom'));
  });
});

test('runGraphSearch is a no-op-safe path when deps.cliLog is undefined', async () => {
  const frames = [];
  const client = { write: (s) => frames.push(s) };
  const session = { phase: 'running', cancelled: false, sseClients: new Set([client]) };
  // No deps.cliLog: the `cliLog?.record` guard inside defaultSpawnSearch/runGraphSearch
  // must not throw. Use a fake spawnSearch so no real CLI is invoked.
  const deps = { spawnSearch: async () => '[]' };

  await assert.doesNotReject(
    runGraphSearch({ query: 'q', repos: ['r1'], session, deps })
  );
  assert.equal(session.phase, 'done');
});
