import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createCodexNormalizer, buildCodexArgs } from '../src/codex.js';

// @spec SEARCH-AI-001, SEARCH-AI-003
test('Codex initial and resumed turns select a model without bypassing the sandbox', () => {
  for (const resumeSessionId of [undefined, 'thread-123']) {
    const args = buildCodexArgs({ model: 'chosen-model', resumeSessionId });
    assert.equal(args[0], 'exec');
    assert.ok(args.includes('--json'));
    assert.equal(args[args.indexOf('--model') + 1], 'chosen-model');
    assert.equal(args[args.indexOf('--sandbox') + 1], 'workspace-write');
    assert.equal(args[args.indexOf('--cd') + 1], path.join(os.homedir(), '.local-search'));
    assert.ok(args.includes('sandbox_workspace_write.writable_roots=[]'));
    assert.ok(args.includes('sandbox_workspace_write.exclude_tmpdir_env_var=true'));
    assert.ok(args.includes('sandbox_workspace_write.exclude_slash_tmp=true'));
    assert.ok(!args.some((v) => v.includes('dangerously')));
    assert.equal(args.includes('resume'), Boolean(resumeSessionId));
    if (resumeSessionId) assert.equal(args.at(-1), resumeSessionId);
  }
});

// @spec SEARCH-AI-001
test('Codex events produce session identity, retrieval sources and a final answer', () => {
  const n = createCodexNormalizer({ model: 'chosen-model' });
  assert.equal(n.push({ type: 'thread.started', thread_id: 'thread-123' })[0].data.sessionId, 'thread-123');
  const events = n.push({ type: 'item.completed', item: {
    id: 'cmd-1', type: 'command_execution', status: 'completed', exit_code: 0,
    command: '/bin/zsh -lc \'local-search --no-index-update json search "refund" specs\'',
    aggregated_output: '[{"name":"refund","repo":"specs"}]',
  } });
  assert.ok(events.some((e) => e.type === 'sources' && e.data[0].name === 'refund'));
  n.push({ type: 'item.completed', item: { type: 'agent_message', text: 'The refund policy.' } });
  const result = n.push({ type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 3, output_tokens: 4 } });
  assert.equal(result[0].type, 'answer');
  assert.equal(result[0].data.markdown, 'The refund policy.');
  assert.equal(result[0].data.meta.totalTokens, 14);
  assert.equal(result[1].type, 'done');
});

// @spec SEARCH-AI-001
test('Codex failures and empty turns cannot become successful answers', () => {
  const n = createCodexNormalizer();
  n.push({ type: 'item.completed', item: { type: 'agent_message', text: 'Partial text' } });
  assert.equal(n.push({ type: 'turn.failed', error: { message: 'Provider unavailable' } })[0].type, 'error');
  assert.deepEqual(n.push({ type: 'turn.completed' }), []);
  assert.equal(createCodexNormalizer().push({ type: 'turn.completed' })[0].type, 'error');
});

// @spec SEARCH-AI-001
test('Codex clarification uses the same question behavior as Claude', () => {
  const n = createCodexNormalizer();
  n.push({ type: 'item.completed', item: { type: 'agent_message', text: 'Which repository?' } });
  assert.deepEqual(n.push({ type: 'turn.completed' }), [{ type: 'question', data: { text: 'Which repository?' } }]);
});
