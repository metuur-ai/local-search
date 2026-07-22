import { spawn as nodeSpawn } from 'node:child_process';

/**
 * buildClaudeArgs({ resumeSessionId }) -> argv array (without the prompt positional).
 *
 * R-2.1/R-2.8: base flags include stream-json output, verbose, and a narrow
 * allowedTools grant for `Bash(local-search:*)`; MUST NOT include
 * `--dangerously-skip-permissions`.
 * R-8.2: when `resumeSessionId` is provided, prepend `--resume <id>`.
 *
 * `--allowedTools` is variadic, so it MUST NOT be the last flag before the
 * prompt positional — otherwise it swallows the prompt and `claude` reports
 * "Input must be provided". Keep a non-variadic flag (`--verbose`) between it
 * and the appended prompt.
 */
export function buildClaudeArgs({ resumeSessionId } = {}) {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--allowedTools',
    'Bash(local-search:*)',
    '--verbose',
  ];
  if (resumeSessionId) {
    return ['--resume', resumeSessionId, ...args];
  }
  return args;
}

/**
 * spawnClaude({ prompt, resumeSessionId, spawn }) -> ChildProcess.
 *
 * Spawns `claude` with the built args and the prompt as the final positional
 * argument (how `claude -p` takes its prompt). `spawn` is injected for testing;
 * defaults to node:child_process spawn.
 * R-9.5: spawned with `detached:true` so the whole process group can be killed later.
 */
export function spawnClaude({ prompt, resumeSessionId, spawn = nodeSpawn } = {}) {
  const args = [...buildClaudeArgs({ resumeSessionId }), prompt];
  return spawn('claude', args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * killTree(child) -> kill the child's whole process group (child + grandchildren).
 * R-9.5: because the child was spawned detached, `-child.pid` addresses the group.
 */
export function killTree(child, signal = 'SIGTERM') {
  if (!child || !child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // group may already be gone; fall back to killing the child directly
    try {
      child.kill(signal);
    } catch {
      /* already dead */
    }
  }
}
