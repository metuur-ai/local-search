import { render, screen } from '@testing-library/preact';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Wrap the real builder in a spy so the gating requirement (R-1.3) can be
// asserted by call count rather than inferred. The implementation stays real, so
// every other test in this file exercises the actual grouping.
vi.mock('../src/components/sourceTree.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, buildSourceTree: vi.fn(actual.buildSourceTree) };
});

import { buildSourceTree } from '../src/components/sourceTree.js';
import { SourceMap } from '../src/components/SourceMap.jsx';

const SOURCES = [
  { repo: 'foyer-platform', project: 'hld', name: 'mobile.md', path: 'hld/mobile.md' },
  { repo: 'foyer-platform', project: 'hld', name: 'payments.md', path: 'hld/payments.md' },
  { repo: 'foyer-platform', project: 'lld', name: 'billing.md', path: 'lld/billing.md' },
  { repo: 'local-search', project: 'ears', name: 'source-map.md', path: 'ears/source-map.md' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SourceMap — visibility gating (R-1.3)', () => {
  it('does not build the tree while the tab is not selected', () => {
    render(<SourceMap sources={SOURCES} active={false} />);

    expect(buildSourceTree).not.toHaveBeenCalled();
    expect(screen.queryByTestId('source-tree')).toBeNull();
  });

  it('builds the tree once the tab is selected', () => {
    render(<SourceMap sources={SOURCES} active />);

    expect(buildSourceTree).toHaveBeenCalled();
    expect(screen.getByTestId('source-tree')).toBeTruthy();
  });
});

describe('SourceMap — empty state (R-1.5)', () => {
  it('renders an explicit message rather than a blank pane', () => {
    render(<SourceMap sources={[]} active />);

    const empty = screen.getByTestId('source-map-empty');
    expect(empty.textContent.trim().length).toBeGreaterThan(0);
    expect(screen.queryByTestId('source-tree')).toBeNull();
  });
});

describe('SourceMap — header honesty (R-1.6)', () => {
  it('says branches group by file location', () => {
    render(<SourceMap sources={SOURCES} active />);

    expect(screen.getByTestId('source-map-header').textContent).toMatch(
      /group|location|where/i,
    );
  });

  it('never describes branches as relationship, similarity, or relevance links', () => {
    render(<SourceMap sources={SOURCES} active />);

    // The honesty doctrine (R-4.4 of the explainable-search EARS) forbids letting
    // a containment edge read as a semantic one.
    expect(screen.getByTestId('source-map-header').textContent).not.toMatch(
      /relationship|related|similar|relevance|connect/i,
    );
  });
});

describe('SourceMap — branch rendering (R-2.4)', () => {
  it('renders a branch per group with its document count', () => {
    render(<SourceMap sources={SOURCES} active />);

    const tree = screen.getByTestId('source-tree');
    expect(tree.textContent).toContain('foyer-platform');
    expect(tree.textContent).toContain('local-search');

    // foyer-platform holds 3 of the 4 rows. Read the branch's own count element
    // rather than its textContent, which concatenates every nested count too.
    const ownCount = (name) =>
      screen.getByTestId(`branch-${name}`).querySelector('.source-map-count').textContent;

    expect(ownCount('foyer-platform')).toBe('3');
    expect(ownCount('local-search')).toBe('1');
    expect(ownCount('hld')).toBe('2');
  });

  it('renders a leaf per document', () => {
    render(<SourceMap sources={SOURCES} active />);

    for (const row of SOURCES) {
      expect(screen.getByTestId('source-tree').textContent).toContain(row.name);
    }
  });
});
