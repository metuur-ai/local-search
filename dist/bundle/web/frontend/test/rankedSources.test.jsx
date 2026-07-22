import { render, screen } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { RankedSources, rankByRelevance } from '../src/components/RankedSources.jsx';

describe('rankByRelevance (R-6.2) — pure fused-ranking sort', () => {
  it('orders sources by relevance descending', () => {
    const input = [
      { title: 'low', relevance: 0.1 },
      { title: 'high', relevance: 0.9 },
      { title: 'mid', relevance: 0.5 },
    ];
    const ranked = rankByRelevance(input);
    expect(ranked.map((s) => s.title)).toEqual(['high', 'mid', 'low']);
  });

  it('does not mutate the input array', () => {
    const input = [
      { title: 'low', relevance: 0.1 },
      { title: 'high', relevance: 0.9 },
    ];
    const snapshot = input.map((s) => s.title);
    rankByRelevance(input);
    expect(input.map((s) => s.title)).toEqual(snapshot);
  });

  it('sorts sources without a relevance last', () => {
    const input = [
      { title: 'no-score' },
      { title: 'scored', relevance: 0.4 },
    ];
    const ranked = rankByRelevance(input);
    expect(ranked.map((s) => s.title)).toEqual(['scored', 'no-score']);
  });
});

describe('RankedSources 6.2 (R-6.2)', () => {
  it('renders entries in descending relevance order with position + relevance', () => {
    const sources = [
      { title: 'low', path: 'a.md', relevance: 0.1 },
      { name: 'high', path: 'b.md', relevance: 0.9 },
    ];
    render(<RankedSources sources={sources} />);
    expect(screen.getByTestId('ranked-sources')).toBeTruthy();

    const first = screen.getByTestId('ranked-source-0');
    const second = screen.getByTestId('ranked-source-1');
    expect(first.textContent).toContain('high');
    expect(first.textContent).toContain('0.9');
    expect(first.textContent).toContain('1');
    expect(second.textContent).toContain('low');
    expect(second.textContent).toContain('0.1');
    expect(second.textContent).toContain('2');
  });

  it('renders the empty note when sources is empty', () => {
    render(<RankedSources sources={[]} />);
    expect(screen.getByTestId('ranked-empty')).toBeTruthy();
    expect(screen.queryByTestId('ranked-sources')).toBeNull();
  });

  it('renders the empty note when sources is absent', () => {
    render(<RankedSources />);
    expect(screen.getByTestId('ranked-empty')).toBeTruthy();
  });
});
