import { render, screen } from '@testing-library/preact';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { App } from '../src/app.jsx';

// App fetches repos on mount; stub fetch so the test never hits the network.
// An empty repo list keeps zero repos selectable, so Search stays disabled.
beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App shell', () => {
  it('renders every labeled region', () => {
    render(<App />);

    const testids = [
      'repo-picker',
      'query-box',
      'region-activity',
      'region-answer',
      'region-graph',
      'region-sources',
      'region-provenance',
    ];

    for (const testid of testids) {
      expect(screen.getByTestId(testid)).toBeTruthy();
    }
  });

  it('has a submit control disabled in the initial no-repos state', () => {
    render(<App />);
    const submit = screen.getByRole('button', { name: /search/i });
    expect(submit).toBeTruthy();
    expect(submit.disabled).toBe(true);
  });
});
