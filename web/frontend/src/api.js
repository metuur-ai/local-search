// SSE + JSON client for the local-search-ui backend. Thin wrappers over
// fetch/EventSource so app.jsx can orchestrate the flow without inlining
// transport details. All errors carry the server's message so the UI can
// surface them (R-1.6, R-2.5).

async function readError(res) {
  try {
    const body = await res.json();
    return body?.message || body?.error || `request failed (${res.status})`;
  } catch {
    return `request failed (${res.status})`;
  }
}

// GET /api/repos -> RepoRow[]. Throws on non-200 so the UI shows R-1.6.
// The CLI (`local-search json repos`) names each repo under `repo`; the picker
// keys off `name`. Normalize so `name` is always populated without dropping the
// other fields.
export async function fetchRepos() {
  const res = await fetch('/api/repos');
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({ ...r, name: r.name ?? r.repo }));
}

// POST /api/query -> { sessionId }. Throws carrying the server message on 400/409/500.
// `mode` is 'ai' (default, spawns claude) or 'graph' (no-AI, direct graph DB search).
export async function postQuery({ q, repos, mode }) {
  const res = await fetch('/api/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q, repos, mode }),
  });
  if (!res.ok) {
    // Preserve the structured body so the UI can react to a 409 `session_active`
    // (surfacing the blocking session's id so the user can kill it).
    const body = await res.json().catch(() => ({}));
    const err = new Error(body?.message || body?.error || `request failed (${res.status})`);
    err.code = body?.error;
    err.activeSessionId = body?.activeSessionId;
    throw err;
  }
  return res.json();
}

// The SSE event types the backend emits.
const EVENT_TYPES = [
  'status',
  'activity',
  'assistant',
  'question',
  'sources',
  'provenance',
  'graph',
  'answer',
  'reply',
  'heartbeat',
  'done',
  'error',
];

// Opens an EventSource for the session and dispatches each named event to the
// matching handler. Closes the stream on `done`/`error`. Returns the
// EventSource so the caller can close() it (e.g. on unmount/cancel).
export function openStream(sessionId, handlers = {}) {
  const es = new EventSource('/api/session/' + sessionId + '/stream');

  for (const type of EVENT_TYPES) {
    es.addEventListener(type, (e) => {
      let payload;
      try {
        payload = e.data ? JSON.parse(e.data) : {};
      } catch {
        payload = {};
      }
      if (typeof handlers[type] === 'function') {
        handlers[type](payload);
      }
      if (type === 'done' || type === 'error') {
        es.close();
      }
    });
  }

  return es;
}

// POST /api/session/:id/reply { text }.
export async function postReply(sessionId, text) {
  const res = await fetch('/api/session/' + sessionId + '/reply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

// POST /api/session/:id/cancel.
export async function postCancel(sessionId) {
  const res = await fetch('/api/session/' + sessionId + '/cancel', {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}
