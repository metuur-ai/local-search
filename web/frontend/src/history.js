// Local (browser) history of completed search runs. Keeps the last 5 runs in
// localStorage so the user can list and re-open a previous answer, its sources,
// provenance and graph without re-querying. Purely client-side; the backend is
// untouched. All access is wrapped so a disabled/absent localStorage (private
// mode, tests without jsdom storage) degrades to an in-memory no-op.

const KEY = 'local-search:history:v1';
const MAX = 5;

function safeStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

// loadHistory() → array of saved runs, newest first (never throws).
export function loadHistory() {
  const store = safeStorage();
  if (!store) return [];
  try {
    const raw = store.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

// saveRun(run) → prepend a run, cap at MAX, persist, and return the new list.
// `run` is a snapshot: { id, ts, query, repos, answerMarkdown, sources,
// provenance, graph }. Runs with the same id replace the earlier entry so a
// resumed turn updates in place rather than duplicating.
export function saveRun(run) {
  const list = loadHistory().filter((r) => r.id !== run.id);
  const next = [run, ...list].slice(0, MAX);
  const store = safeStorage();
  if (store) {
    try {
      store.setItem(KEY, JSON.stringify(next));
    } catch {
      /* quota / disabled — keep the in-memory list */
    }
  }
  return next;
}

// clearHistory() → wipe stored history and return [].
export function clearHistory() {
  const store = safeStorage();
  if (store) {
    try {
      store.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
  return [];
}
