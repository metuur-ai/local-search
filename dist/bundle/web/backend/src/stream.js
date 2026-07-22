import { killTree } from './claude.js';

/** Write one SSE frame to a single response: event:<type>\ndata:<json>\n\n */
export function writeSse(res, type, data) {
  res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Broadcast one SSE frame to every client currently connected to the session. */
export function broadcast(session, type, data) {
  for (const client of session.sseClients) {
    writeSse(client, type, data);
  }
}

/**
 * pipeChild({ session, child, normalizer, deps }) — pipe a child's stdout through the
 * given normalizer to the session's sseClients (broadcast), tracking sawAnswer/sawQuestion.
 *
 * Shared by both the initial stream (R-2.3) and a resumed turn (R-8.4) so a resumed
 * turn continues on the SAME sseClients — the frontend never opens a new stream.
 *
 * On child close: if a question was seen keep phase='awaiting-reply' (R-8.1/R-8.3);
 * else phase='done' and, with no answer, broadcast an explicit error (R-2.5).
 *
 * R-9.1: while running with live clients, broadcast a `heartbeat` every ~deps.heartbeatMs.
 * R-9.4: a generous safety timeout (deps.timeoutMs) fires an explicit `error` + kills the
 *   child ONLY if still running (not awaiting-reply, not done).
 * All timers are unref'd and cleared on close so tests don't hang.
 */
export function pipeChild({ session, child, normalizer, deps = {} } = {}) {
  const heartbeatMs = deps.heartbeatMs ?? 15000;
  const timeoutMs = deps.timeoutMs ?? 300000;

  let sawAnswer = false;
  let sawQuestion = false;
  let buffer = '';

  const onData = (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue; // ignore non-JSON stdout noise
      }
      for (const ev of normalizer.push(obj)) {
        if (ev.type === 'status' && ev.data?.sessionId) {
          session.claudeSessionId = ev.data.sessionId;
        }
        if (ev.type === 'answer') sawAnswer = true;
        if (ev.type === 'question') {
          sawQuestion = true;
          session.phase = 'awaiting-reply';
        }
        broadcast(session, ev.type, ev.data);
      }
    }
  };

  // R-9.1: heartbeat frames keep the connection/proxies alive during long waits.
  const heartbeat = setInterval(() => {
    if (session.phase !== 'running') return;
    broadcast(session, 'heartbeat', { t: Date.now() });
  }, heartbeatMs);
  heartbeat.unref?.();

  // R-9.4: generous safety timeout -> explicit error, only if still running.
  const safety = setTimeout(() => {
    if (session.phase !== 'running') return;
    broadcast(session, 'error', {
      message: `the run exceeded the ${timeoutMs}ms safety timeout`,
      kind: 'timeout',
    });
    session.phase = 'done';
    killTree(child);
  }, timeoutMs);
  safety.unref?.();

  const clearTimers = () => {
    clearInterval(heartbeat);
    clearTimeout(safety);
  };

  const onClose = () => {
    clearTimers();
    // R-8.1/R-8.3: a turn that ended with a question is not a failure — keep the
    // session awaiting a reply and do NOT emit an error.
    if (sawQuestion) return;
    session.phase = 'done';
    // R-2.5: closed with no usable answer -> explicit error.
    if (!sawAnswer) {
      broadcast(session, 'error', { message: 'the run ended without producing an answer', kind: 'exit' });
    }
  };

  child.stdout?.on('data', onData);
  child.on('close', onClose);

  return { clearTimers };
}
