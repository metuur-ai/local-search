import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClaudeArgs, spawnClaude } from '../src/claude.js';

test('R-2.1/R-2.8: base args carry stream-json, verbose, narrow allowedTools', () => {
  const args = buildClaudeArgs();
  assert.deepEqual(args, [
    '-p',
    '--output-format',
    'stream-json',
    '--allowedTools',
    'Bash(local-search:*)',
    '--verbose',
  ]);
});

test('variadic --allowedTools is not the last flag, so the appended prompt is not swallowed', () => {
  const args = buildClaudeArgs();
  const i = args.indexOf('--allowedTools');
  // A non-variadic flag must sit between --allowedTools value and the prompt.
  assert.notEqual(args.at(-1), 'Bash(local-search:*)');
  assert.equal(args.at(-1), '--verbose');
  assert.equal(args[i + 1], 'Bash(local-search:*)');
});

test('R-2.8: base args never include --dangerously-skip-permissions', () => {
  assert.ok(!buildClaudeArgs().includes('--dangerously-skip-permissions'));
  assert.ok(!buildClaudeArgs({ resumeSessionId: 'sid' }).includes('--dangerously-skip-permissions'));
});

test('R-8.2: --resume <id> is added only when resumeSessionId is provided', () => {
  assert.ok(!buildClaudeArgs().includes('--resume'));
  const resumed = buildClaudeArgs({ resumeSessionId: 'abc123' });
  const i = resumed.indexOf('--resume');
  assert.ok(i !== -1);
  assert.equal(resumed[i + 1], 'abc123');
});

test('spawnClaude calls injected spawn with claude + args + prompt positional last', () => {
  const calls = [];
  const fakeSpawn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return { pid: 1 };
  };
  spawnClaude({ prompt: 'THE PROMPT', spawn: fakeSpawn });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, 'claude');
  assert.equal(calls[0].args.at(-1), 'THE PROMPT');
  assert.equal(calls[0].opts.detached, true); // R-9.5
  assert.ok(calls[0].args.includes('stream-json'));
});
