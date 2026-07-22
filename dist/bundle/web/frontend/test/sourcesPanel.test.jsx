import { render, screen } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { SourcesPanel } from '../src/components/SourcesPanel.jsx';

describe('SourcesPanel', () => {
  it('renders the sources-panel container', () => {
    render(<SourcesPanel sources={[]} />);
    expect(screen.getByTestId('sources-panel')).toBeTruthy();
  });

  it('R-5.1: lists each source with title/name, repo, path, tags, and relevance', () => {
    const sources = [
      {
        title: 'Auth flow overview',
        repo: 'core',
        path: 'docs/auth.md',
        tags: ['auth', 'security'],
        relevance: 0.92,
      },
      {
        name: 'Rate limiter',
        repo: 'gateway',
        path: 'src/rate.go',
        tags: ['perf'],
        relevance: 0.71,
      },
    ];
    render(<SourcesPanel sources={sources} />);

    const row0 = screen.getByTestId('source-row-0');
    expect(row0.textContent).toContain('Auth flow overview');
    expect(row0.textContent).toContain('core');
    expect(row0.textContent).toContain('docs/auth.md');
    expect(row0.textContent).toContain('auth');
    expect(row0.textContent).toContain('security');
    expect(row0.textContent).toContain('0.92');

    const row1 = screen.getByTestId('source-row-1');
    expect(row1.textContent).toContain('Rate limiter');
    expect(row1.textContent).toContain('gateway');
    expect(row1.textContent).toContain('src/rate.go');
    expect(row1.textContent).toContain('perf');
    expect(row1.textContent).toContain('0.71');
  });
});
