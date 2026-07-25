import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RefreshReposPanel } from '../src/graph-explorer/components/RefreshReposPanel.jsx';
import { saveCachedRepos, clearCachedRepos, loadCachedRepos } from '../src/repoCache.js';

// A fetch whose resolution the test controls, so the in-flight state is observable.
function deferredFetch() {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const fn = vi.fn(() => gate);
  return { fn, release };
}

describe('RefreshReposPanel loading states', () => {
  beforeEach(() => {
    // The panel renders cached repos instantly; clear so the spinner path is
    // exercised deterministically. The cache tests seed it explicitly.
    clearCachedRepos();
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    );
  });

  afterEach(() => {
    clearCachedRepos();
    vi.restoreAllMocks();
  });

  it('shows a spinner while the repo list is in flight', async () => {
    const { fn, release } = deferredFetch();
    global.fetch = fn;

    render(<RefreshReposPanel onRebuilt={() => {}} />);
    fireEvent.click(screen.getByText('Refresh from repos'));

    // In flight: spinner visible.
    const loading = await screen.findByTestId('repos-loading');
    expect(loading.querySelector('.repos-spinner')).toBeTruthy();
    expect(loading.textContent).toContain('Loading repos');

    release({ ok: true, json: () => Promise.resolve([{ name: 'squirrel', spec_count: 3 }]) });

    // Settled: spinner gone, rows rendered.
    await waitFor(() => expect(screen.queryByTestId('repos-loading')).toBeNull());
    // The label is `${name}  (${count} specs)`; testing-library collapses the
    // double space, so match on the normalized form.
    expect(screen.getByText(/squirrel \(3 specs\)/)).toBeTruthy();
  });

  it('spins the rebuild button and marks it busy while rebuilding', async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/api/repos')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return new Promise(() => {}); // /api/graph/refresh never settles
    });

    render(<RefreshReposPanel onRebuilt={() => {}} />);
    fireEvent.click(screen.getByText('Refresh from repos'));
    await waitFor(() => expect(screen.queryByTestId('repos-loading')).toBeNull());

    const btn = screen.getByText('Rebuild graph');
    fireEvent.click(btn);

    await waitFor(() => {
      const busy = screen.getByText('Rebuilding…');
      expect(busy.getAttribute('aria-busy')).toBe('true');
      expect(busy.hasAttribute('disabled')).toBe(true);
      expect(busy.querySelector('.repos-spinner')).toBeTruthy();
    });
  });

  it('renders cached repos immediately, with no spinner', async () => {
    saveCachedRepos([{ name: 'squirrel', spec_count: 7 }], 111);
    const { fn } = deferredFetch(); // never settles — nothing but cache on screen
    global.fetch = fn;

    render(<RefreshReposPanel onRebuilt={() => {}} />);
    fireEvent.click(screen.getByText('Refresh from repos'));

    await waitFor(() => expect(screen.getByText(/squirrel \(7 specs\)/)).toBeTruthy());
    expect(screen.queryByTestId('repos-loading')).toBeNull();
  });

  it('revalidates behind the cached list and persists the fresh one', async () => {
    saveCachedRepos([{ name: 'stale-repo', spec_count: 1 }], 111);
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ name: 'fresh-repo', spec_count: 9 }]),
      })
    );

    render(<RefreshReposPanel onRebuilt={() => {}} />);
    fireEvent.click(screen.getByText('Refresh from repos'));

    // Cached row first, then replaced by the live one.
    expect(screen.getByText(/stale-repo \(1 specs\)/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/fresh-repo \(9 specs\)/)).toBeTruthy());
    expect(loadCachedRepos().repos).toEqual([{ name: 'fresh-repo', spec_count: 9 }]);
  });

  it('keeps cached rows on screen when revalidation fails', async () => {
    saveCachedRepos([{ name: 'squirrel', spec_count: 7 }], 111);
    global.fetch = vi.fn(() => Promise.reject(new Error('offline')));

    render(<RefreshReposPanel onRebuilt={() => {}} />);
    fireEvent.click(screen.getByText('Refresh from repos'));

    await waitFor(() => expect(screen.getByTestId('repos-error')).toBeTruthy());
    // The list must survive the error — it is still actionable.
    expect(screen.getByText(/squirrel \(7 specs\)/)).toBeTruthy();
  });

  it('replaces the spinner with the error when the repo list fails', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'boom' }),
      })
    );

    render(<RefreshReposPanel onRebuilt={() => {}} />);
    fireEvent.click(screen.getByText('Refresh from repos'));

    await waitFor(() => expect(screen.getByText(/Failed to load repos: boom/)).toBeTruthy());
    expect(screen.queryByTestId('repos-loading')).toBeNull();
  });
});
