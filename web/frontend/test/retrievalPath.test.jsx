import { render, screen } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import RetrievalPath from '../src/components/RetrievalPath.jsx';

describe('RetrievalPath (R-6.1)', () => {
  it('renders the retrieval-path container', () => {
    render(<RetrievalPath />);
    expect(screen.getByTestId('retrieval-path')).toBeTruthy();
  });

  it('shows all 7 pipeline stages in order', () => {
    const { container } = render(<RetrievalPath />);
    const text = container.textContent.toLowerCase();

    const stages = [
      'query',
      'fts/bm25',
      'embed',
      'cosine',
      'rrf fusion',
      'ranked sources',
      'answer',
    ];

    let cursor = -1;
    for (const stage of stages) {
      const idx = text.indexOf(stage, cursor + 1);
      expect(idx, `stage "${stage}" should appear after the previous one`).toBeGreaterThan(cursor);
      cursor = idx;
    }
  });

  it('includes the honesty / documentary caption', () => {
    const { container } = render(<RetrievalPath />);
    const text = container.textContent.toLowerCase();
    expect(text).toContain('documentary');
    expect(text).toContain('not reconstructed per run');
  });
});
