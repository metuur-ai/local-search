import { buildPrompt } from './prompt.js';
import { spawnClaude as realSpawnClaude, killTree, buildClaudeArgs } from './claude.js';
import { createNormalizer } from './normalize.js';
import { pipeChild, broadcast } from './stream.js';
import { runGraphSearch } from './graphSearch.js';
import { tapChild } from './cliLog.js';

function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

/**
 * handleQuery(req, res, { registry, deps }) — POST /api/query {q, repos}.
 * R-2.2: empty/absent repos -> 400, spawn nothing.
 * R-2.9: a session already active -> 409 (single active session).
 * R-2.1: otherwise build prompt, spawnClaude (injected), register a session with the
 *   child + normalizer, respond {sessionId}.
 * R-2.6: spawn ENOENT (claude missing) -> 500 explicit JSON naming the missing binary.
 */
export async function handleQuery(req, res, { registry, deps = {} } = {}) {
  const spawnClaude = deps.spawnClaude ?? realSpawnClaude;
  const body = await readJsonBody(req);
  if (body === null) {
    return sendJson(res, 400, { error: 'bad_json', message: 'invalid JSON body' });
  }

  const { q, repos } = body;
  if (!Array.isArray(repos) || repos.length === 0) {
    // R-2.2
    return sendJson(res, 400, { error: 'repos_required', message: 'at least one repo is required' });
  }

  // R-2.9: single active session — reject a second concurrent query. A graph
  // (no-AI) session has no child until its stream connects, so also treat any
  // non-done session as active.
  const active = registry.list().find((s) => s.phase !== 'done' && (s.child || s.mode === 'graph'));
  if (active) {
    // Return the blocking session's id so the client can surface + kill it
    // (an orphaned session — e.g. a graph run whose stream never finished —
    // would otherwise block every new query with no way to recover from the UI).
    return sendJson(res, 409, {
      error: 'session_active',
      message: 'a session is already active',
      activeSessionId: active.id,
    });
  }

  // No-AI ("graph only") path: skip claude entirely and run the local-search
  // graph DB search directly when the stream connects. Returns in CLI time.
  if (body.mode === 'graph') {
    const session = registry.create({ mode: 'graph', phase: 'running', deps, query: q, repos });
    session.runGraph = () => runGraphSearch({ query: q ?? '', repos, session, deps });
    return sendJson(res, 200, { sessionId: session.id });
  }

  const prompt = buildPrompt({ query: q, repos });

  let child;
  try {
    child = spawnClaude({ prompt });
  } catch (err) {
    // R-2.6: claude binary missing (ENOENT) -> explicit 500.
    const missing = err?.code === 'ENOENT';
    return sendJson(res, 500, {
      error: missing ? 'claude_missing' : 'spawn_failed',
      message: missing ? 'the `claude` binary is not on PATH' : err?.message ?? String(err),
    });
  }

  const normalizer = createNormalizer();
  const session = registry.create({ child, normalizer, phase: 'running', deps });

  // Log the claude interaction (no-op when deps.cliLog is absent). Recorded after
  // session creation so session.id is available; tapChild adds a SECOND stdout
  // 'data' listener alongside pipeChild's, which does not disturb the pipe.
  const h = deps.cliLog?.record({
    cli: 'claude',
    command: 'claude ' + buildClaudeArgs({}).join(' ') + ' <prompt>',
    prompt,
    sessionId: session.id,
  });
  if (h) tapChild(h, child);

  // R-2.6 (async): spawn errors that surface after creation (async ENOENT) end the session.
  child.on('error', (err) => {
    session.phase = 'done';
    const missing = err?.code === 'ENOENT';
    broadcast(session, 'error', {
      message: missing ? 'the `claude` binary is not on PATH' : err?.message ?? String(err),
      kind: 'spawn',
    });
  });

  return sendJson(res, 200, { sessionId: session.id });
}

/**
 * handleStream(req, res, { registry, id }) — GET /api/session/:id/stream (SSE).
 * R-2.3: set SSE headers, register res in session.sseClients, and pipe the child's
 *   stdout through the session normalizer to sseClients via the shared pipeChild
 *   helper (R-8.4: same set is reused across resumed turns).
 * R-2.5: on child close with no answer -> error (inside pipeChild).
 * Captures claudeSessionId from the init status onto the session.
 */
export function handleStream(req, res, { registry, id } = {}) {
  const session = registry.get(id);
  if (!session) {
    return sendJson(res, 404, { error: 'no_session', message: 'unknown session' });
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  session.sseClients.add(res);

  // No-AI path: no claude child to pipe. Kick off the graph search once (on the
  // first stream connect) so its events broadcast to this now-registered client,
  // and end the response when it finishes.
  if (session.mode === 'graph') {
    const endIfDone = () => {
      if (session.phase === 'done') res.end();
    };
    req.on('close', () => {
      session.sseClients.delete(res);
      if (session.phase !== 'done') {
        session.cancelled = true;
        killTree(session.child);
      }
    });
    if (!session.graphStarted && typeof session.runGraph === 'function') {
      session.graphStarted = true;
      Promise.resolve()
        .then(() => session.runGraph())
        .catch((err) =>
          broadcast(session, 'error', { message: err?.message ?? String(err), kind: 'graph' })
        )
        .finally(endIfDone);
    } else {
      endIfDone();
    }
    return;
  }

  pipeChild({ session, child: session.child, normalizer: session.normalizer, deps: session.deps ?? {} });

  // End this SSE response once the session is truly done. A turn that ended with a
  // question stays awaiting-reply, so the stream is left open for the resumed turn (R-8.4).
  const endIfDone = () => {
    if (session.phase === 'done') res.end();
  };
  session.child.on('close', endIfDone);

  // R-9.5: if the SSE client disconnects, kill the child's process group (unless the
  // session is done or paused awaiting a reply, which must survive — R-8.3).
  req.on('close', () => {
    session.sseClients.delete(res);
    if (session.phase !== 'done' && session.phase !== 'awaiting-reply') {
      killTree(session.child);
    }
  });
}

/**
 * handleReply(req, res, { registry, id }) — POST /api/session/:id/reply {text}.
 * R-8.2: 404 unknown, 409 if no captured claudeSessionId, 400 if text missing/empty.
 *   Spawn a NEW child with --resume <claudeSessionId> and the reply as the prompt,
 *   set session.child + phase='running', and pipe it to the EXISTING sseClients so the
 *   resumed turn continues on the same stream (R-8.4).
 * R-8.5: emit a `reply` event so the user's reply lands in the activity feed.
 */
export async function handleReply(req, res, { registry, id } = {}) {
  const session = registry.get(id);
  if (!session) {
    return sendJson(res, 404, { error: 'no_session', message: 'unknown session' });
  }
  if (!session.claudeSessionId) {
    return sendJson(res, 409, { error: 'not_resumable', message: 'session has no claude session to resume' });
  }

  const body = await readJsonBody(req);
  if (body === null) {
    return sendJson(res, 400, { error: 'bad_json', message: 'invalid JSON body' });
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return sendJson(res, 400, { error: 'text_required', message: 'reply text is required' });
  }

  const deps = session.deps ?? {};
  const spawnClaude = deps.spawnClaude ?? realSpawnClaude;

  let child;
  try {
    child = spawnClaude({ prompt: text, resumeSessionId: session.claudeSessionId });
  } catch (err) {
    return sendJson(res, 500, { error: 'spawn_failed', message: err?.message ?? String(err) });
  }

  session.child = child;
  session.phase = 'running';

  // Log the resumed claude interaction (no-op when deps.cliLog is absent).
  const h = deps.cliLog?.record({
    cli: 'claude',
    command:
      'claude ' + buildClaudeArgs({ resumeSessionId: session.claudeSessionId }).join(' ') + ' <prompt>',
    prompt: text,
    sessionId: session.id,
  });
  if (h) tapChild(h, child);

  // R-8.5: record the user's reply in the feed so it renders alongside the prior question.
  broadcast(session, 'reply', { text });

  // R-8.4: resumed turn continues on the already-connected sseClients with a fresh normalizer.
  pipeChild({ session, child, normalizer: createNormalizer(), deps });

  return sendJson(res, 200, { ok: true });
}

/**
 * handleCancel(req, res, { registry, id }) — POST /api/session/:id/cancel.
 * R-9.3: 404 unknown; otherwise killTree the child (R-9.5), broadcast a `done`
 *   {cancelled:true} frame, set phase='done', respond 200 {ok:true}.
 */
export function handleCancel(req, res, { registry, id } = {}) {
  const session = registry.get(id);
  if (!session) {
    return sendJson(res, 404, { error: 'no_session', message: 'unknown session' });
  }

  // Flag first so an in-flight graph loop stops between repos, then kill the
  // current child (claude, or the live local-search search) and end the turn.
  session.cancelled = true;
  session.phase = 'done';
  killTree(session.child);
  broadcast(session, 'done', { cancelled: true });

  return sendJson(res, 200, { ok: true });
}
