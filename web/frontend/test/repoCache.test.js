import { describe, it, expect, afterEach } from 'vitest';
import { loadCachedRepos, saveCachedRepos, clearCachedRepos } from '../src/repoCache.js';

// The repo list is cached in localStorage so a page reload renders instantly
// instead of re-shelling the (slow, re-indexing) CLI. These pin the round-trip
// and the tolerance of absent/malformed storage.

afterEach(() => {
  clearCachedRepos();
});

describe('repoCache', () => {
  it('returns null when nothing is cached', () => {
    expect(loadCachedRepos()).toBeNull();
  });

  it('round-trips the repo list with its timestamp', () => {
    const repos = [{ name: 'alpha', spec_count: 3 }, { name: 'beta', spec_count: 5 }];
    saveCachedRepos(repos, 1234);
    const cached = loadCachedRepos();
    expect(cached).toEqual({ repos, ts: 1234 });
  });

  it('coerces a non-array payload to null rather than throwing', () => {
    localStorage.setItem('local-search:repos:v1', JSON.stringify({ repos: 'nope', ts: 1 }));
    expect(loadCachedRepos()).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    localStorage.setItem('local-search:repos:v1', '{not json');
    expect(loadCachedRepos()).toBeNull();
  });

  it('clearCachedRepos removes the entry', () => {
    saveCachedRepos([{ name: 'alpha' }], 1);
    expect(loadCachedRepos()).not.toBeNull();
    clearCachedRepos();
    expect(loadCachedRepos()).toBeNull();
  });

  it('normalizes a null timestamp to null', () => {
    localStorage.setItem('local-search:repos:v1', JSON.stringify({ repos: [], ts: 'bad' }));
    expect(loadCachedRepos()).toEqual({ repos: [], ts: null });
  });
});
