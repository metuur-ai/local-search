// Short-lived memo for the repo listing.
//
// Listing repos spawns two `local-search` subprocesses (~120 ms). That was one
// call per page load; it is now also one per Reveal-in-Finder click, since
// resolving a repo-relative path needs the registered roots. Repo roots change
// only when a repo is added or removed, so a few seconds of staleness is a fair
// trade for making those paths free.

export const DEFAULT_TTL_MS = 10_000;

/**
 * memoizeRepos(run, { ttlMs, now }) -> a drop-in replacement for `run` that
 * reuses the last successful result for ttlMs.
 *
 * Concurrent callers within the window share one in-flight promise rather than
 * each spawning their own subprocess. Failures are never cached: a rejection
 * drops the entry so the next call retries live.
 */
export function memoizeRepos(run, { ttlMs = DEFAULT_TTL_MS, now = Date.now } = {}) {
  let entry = null;

  return function cachedRunRepos() {
    const t = now();
    if (entry && t - entry.at < ttlMs) return entry.promise;

    const promise = Promise.resolve().then(run);
    entry = { at: t, promise };
    // Swallowed here only to drop the entry; the caller still sees the rejection
    // through the promise returned above.
    promise.catch(() => {
      if (entry && entry.promise === promise) entry = null;
    });
    return promise;
  };
}
