import fs from 'node:fs';
import path from 'node:path';

/**
 * File-based logger for interactions with the external CLIs (`local-search`,
 * `claude`). It appends a human-readable header when an interaction starts and a
 * trailer (captured stdout/stderr, exit code, duration) when it ends — a format
 * meant to be `tail -f`'d and read by a person. No external deps.
 *
 * All logging is injected through `deps.cliLog` (same pattern as
 * `deps.spawnClaude`/`deps.spawnSearch`) and callers guard with optional
 * chaining, so an absent logger is always a no-op.
 */

/** A no-op logger: every method is safe to call and records nothing. */
export const NOOP_CLILOG = {
  file: null,
  record() {
    return {
      stdout() {},
      stderr() {},
      end() {},
      error() {},
    };
  },
  close() {},
};

/**
 * createCliLog({ file, echo, maxBytes }) -> { file, record(...), close() }.
 * Ensures the parent dir of `file` exists and opens an append stream.
 * `record({ cli, command, prompt, sessionId })` writes a header immediately and
 * returns a handle whose stdout/stderr accumulate (capped at `maxBytes` each)
 * and whose end/error flush a trailer block.
 */
export function createCliLog({ file, echo = false, maxBytes = 64 * 1024 } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const stream = fs.createWriteStream(file, { flags: 'a' });

  function record({ cli, command, prompt, sessionId } = {}) {
    const start = Date.now();
    const iso = new Date(start).toISOString();

    // Header block.
    let header = `${iso} ▶ ${cli}\n  ${command}\n`;
    if (sessionId) header += `  session=${sessionId}\n`;
    if (cli === 'claude' && prompt) {
      const indented = String(prompt)
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n');
      header += `  prompt:\n${indented}\n`;
    }
    stream.write(header);
    if (echo) console.log(`[${cli}] ▶ ${command}`);

    // Per-stream capped buffers; flushed on end (not per-chunk).
    const out = { buf: '', truncated: false };
    const err = { buf: '', truncated: false };
    const accumulate = (slot, chunk) => {
      if (slot.truncated) return;
      slot.buf += chunk.toString();
      if (slot.buf.length > maxBytes) {
        slot.buf = slot.buf.slice(0, maxBytes);
        slot.truncated = true;
      }
    };

    let finished = false;
    const trailer = (extra) => {
      if (finished) return;
      finished = true;
      const ms = Date.now() - start;
      let block = '';
      block += `  stdout${out.truncated ? ' (truncated)' : ''}:\n${out.buf}\n`;
      if (err.buf) block += `  stderr${err.truncated ? ' (truncated)' : ''}:\n${err.buf}\n`;
      block += extra;
      block += `  duration=${ms}ms\n\n`;
      stream.write(block);
      return ms;
    };

    return {
      stdout(chunk) {
        accumulate(out, chunk);
      },
      stderr(chunk) {
        accumulate(err, chunk);
      },
      end(code) {
        const ms = trailer(`  exit=${code}\n`);
        if (echo) {
          const mark = code === 0 ? '✔' : '✗';
          console.log(`[${cli}] ${mark} ${command} (exit ${code}, ${ms}ms)`);
        }
      },
      error(e) {
        const ms = trailer(`  error: ${e?.message ?? String(e)}\n`);
        if (echo) console.log(`[${cli}] ✗ ${command} (error: ${e?.message ?? String(e)}, ${ms}ms)`);
      },
    };
  }

  return {
    file,
    record,
    // Resolves once the append stream has flushed and closed.
    close() {
      return new Promise((resolve) => stream.end(resolve));
    },
  };
}

/**
 * tapChild(handle, child) — attach the log handle to a spawned child's streams
 * as ADDITIONAL, non-invasive listeners. Node allows multiple 'data' listeners,
 * so this never replaces or interferes with the existing stdout/stderr consumers.
 */
export function tapChild(handle, child) {
  if (!handle || !child) return;
  child.stdout?.on('data', (d) => handle.stdout(d));
  child.stderr?.on('data', (d) => handle.stderr(d));
  child.on('close', (code) => handle.end(code));
  child.on('error', (err) => handle.error(err));
}
