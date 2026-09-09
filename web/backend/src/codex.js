import os from 'node:os';
import path from 'node:path';
import { deriveEvents } from './toolParse.js';
import { endsWithQuestion } from './normalize.js';

export function buildCodexArgs({ model, resumeSessionId, provider } = {}) {
  // SQLite needs journal/schema writes even with --no-index-update. Use the
  // cache as the workspace so repositories stay outside the writable root.
  // Exec-level flags must precede resume as well as initial-turn prompts.
  const args = [
    'exec', '--sandbox', 'workspace-write',
    '--cd', path.join(os.homedir(), '.local-search'),
    '-c', 'sandbox_workspace_write.writable_roots=[]',
    '-c', 'sandbox_workspace_write.exclude_tmpdir_env_var=true',
    '-c', 'sandbox_workspace_write.exclude_slash_tmp=true',
    '--json', '--skip-git-repo-check',
  ];
  if (model) args.push('--model', model);
  if (provider?.baseUrl) {
    args.push('-c', 'model_provider="local_search"');
    const fields = [
      `name=${JSON.stringify(provider.label || provider.id)}`,
      `base_url=${JSON.stringify(provider.baseUrl)}`,
      'wire_api="responses"',
    ];
    if (provider.apiKeyEnv) fields.push(`env_key=${JSON.stringify(provider.apiKeyEnv)}`);
    args.push('-c', `model_providers.local_search={${fields.join(',')}}`);
  }
  if (resumeSessionId) args.push('resume', resumeSessionId);
  return args;
}

// Codex emits a shell wrapper as the command string on macOS/Linux. Unwrap
// only a single quoted -c/-lc payload; never execute or evaluate the string.
function commandText(command) {
  if (typeof command !== 'string') return '';
  const match = command.match(/^(?:\S*\/)?(?:ba|z|da)?sh\s+-l?c\s+(['"])([\s\S]*)\1$/);
  return match ? match[2] : command;
}

// @spec SEARCH-AI-001
export function createCodexNormalizer({ model = null } = {}) {
  let sessionId = null;
  let answer = '';
  let terminal = false;
  const startedAt = Date.now();
  const error = (message) => [{ type: 'error', data: { kind: 'result', message } }];
  return {
    get sessionId() { return sessionId; },
    push(obj) {
      if (terminal) return [];
      switch (obj?.type) {
        case 'thread.started':
          sessionId = obj.thread_id;
          return [{ type: 'status', data: { phase: 'started', sessionId, model } }];
        case 'item.completed': {
          const item = obj.item ?? {};
          if (item.type === 'agent_message' && typeof item.text === 'string') {
            answer = item.text;
            return [{ type: 'assistant', data: { text: item.text } }];
          }
          if (item.type === 'command_execution') {
            const command = commandText(item.command);
            if (item.exit_code !== 0 || item.status === 'failed') {
              return [{ type: 'activity', data: { tool: 'shell', command, resultSummary: 'command failed' } }];
            }
            return deriveEvents({ command, stdout: item.aggregated_output ?? '' });
          }
          return [];
        }
        case 'turn.failed':
        case 'error':
          terminal = true;
          return error(obj.error?.message || obj.message || 'Codex reported an error');
        case 'turn.completed': {
          terminal = true;
          if (!answer.trim()) return error('no answer produced');
          if (endsWithQuestion(answer)) return [{ type: 'question', data: { text: answer } }];
          const usage = obj.usage ?? {};
          const num = (v) => Number.isFinite(v) && v >= 0 ? v : 0;
          const inputTokens = num(usage.input_tokens);
          const outputTokens = num(usage.output_tokens);
          return [
            { type: 'answer', data: { markdown: answer, meta: {
              model, durationMs: Date.now() - startedAt, inputTokens, outputTokens,
              cacheReadTokens: num(usage.cached_input_tokens), cacheWriteTokens: 0,
              totalTokens: inputTokens + outputTokens, costUsd: null,
            } } },
            { type: 'done', data: { ok: true } },
          ];
        }
        default: return [];
      }
    },
  };
}
