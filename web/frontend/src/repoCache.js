// Local (browser) cache of the repo list from GET /api/repos. Listing repos
// shells `local-search json repos`, which re-checks git and runs incremental
// index updates on every call — slow on each page load. Caching the last good
// list in localStorage lets the picker render instantly on reload; a manual
// "refresh" re-fetches live. Purely client-side; the backend is untouched. All
// access is wrapped so a disabled/absent localStorage (private mode, tests
// without jsdom storage) degrades to an in-memory no-op.

const KEY = 'local-search:repos:v1';

function safeStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

// loadCachedRepos() → { repos, ts } or null when absent/unreadable (never throws).
export function loadCachedRepos() {
  const store = safeStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.repos)) return null;
    return { repos: parsed.repos, ts: typeof parsed.ts === 'number' ? parsed.ts : null };
  } catch {
    return null;
  }
}

// saveCachedRepos(repos, ts) → persist the list with a timestamp; returns ts.
// `ts` is injected so the caller controls the clock (and tests stay deterministic).
export function saveCachedRepos(repos, ts) {
  const store = safeStorage();
  if (store) {
    try {
      store.setItem(KEY, JSON.stringify({ repos: Array.isArray(repos) ? repos : [], ts }));
    } catch {
      /* quota / disabled — nothing else to do */
    }
  }
  return ts;
}

// clearCachedRepos() → wipe the stored list.
export function clearCachedRepos() {
  const store = safeStorage();
  if (store) {
    try {
      store.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}
