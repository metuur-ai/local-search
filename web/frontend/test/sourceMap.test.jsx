import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

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
  // Leaves carry a RevealButton, which POSTs to /api/reveal. Stub fetch so no
  // leaf test reaches the network.
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Read a leaf's own rendered tags. Scoped per-leaf because a branch's textContent
// concatenates every nested leaf's tags too.
const leafTags = (leaf) =>
  [...leaf.querySelectorAll('[data-testid="source-map-leaf-tag"]')].map((t) =>
    t.textContent.trim(),
  );

// One leaf, guaranteed: a single group renders flat (R-2.11) but still renders
// Leaf, so these fixtures exercise the same component the tree does.
const oneLeaf = (row) => {
  render(<SourceMap sources={[row]} active />);
  return screen.getByTestId('source-map-leaf');
};

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

describe('SourceMap — degenerate tree (R-2.11)', () => {
  // A root-registered repo, so the first path segment is `src` rather than a doc
  // type and every hit lands in the same group.
  const ONE_GROUP = [
    { repo: 'root-registered', project: 'src', name: 'index.ts', path: 'src/index.ts' },
    { repo: 'root-registered', project: 'src', name: 'router.ts', path: 'src/router.ts' },
  ];

  it('renders a plain list with no disclosure elements', () => {
    const { container } = render(<SourceMap sources={ONE_GROUP} active />);

    expect(screen.getByTestId('source-list')).toBeTruthy();
    expect(screen.queryByTestId('source-tree')).toBeNull();
    expect(container.querySelectorAll('details')).toHaveLength(0);
  });

  it('says there was nothing to group by', () => {
    render(<SourceMap sources={ONE_GROUP} active />);

    expect(screen.getByTestId('source-map-header').textContent).toMatch(/nothing to group by/i);
  });

  it('still lists every source', () => {
    render(<SourceMap sources={ONE_GROUP} active />);

    expect(screen.getAllByTestId('source-map-leaf')).toHaveLength(ONE_GROUP.length);
  });

  it('keeps the disclosure tree once a second group appears', () => {
    const { container } = render(
      <SourceMap
        sources={[...ONE_GROUP, { repo: 'root-registered', project: 'docs', name: 'readme.md' }]}
        active
      />,
    );

    expect(screen.getByTestId('source-tree')).toBeTruthy();
    expect(screen.queryByTestId('source-list')).toBeNull();
    expect(container.querySelectorAll('details').length).toBeGreaterThan(0);
  });
});

describe('SourceMap — counted scope (R-2.12)', () => {
  it('names the scope the counts cover so it cannot be confused with the filtered view', () => {
    render(<SourceMap sources={SOURCES} active />);

    const header = screen.getByTestId('source-map-header').textContent;
    expect(header).toMatch(new RegExp(`all ${SOURCES.length} retrieved sources`, 'i'));
    expect(header).toMatch(/not the filtered view/i);
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

describe('SourceMap — leaf label (R-3.1)', () => {
  it('prefers title', () => {
    expect(
      oneLeaf({ repo: 'r', project: 'hld', title: 'Mobile app', name: 'mobile.md', path: 'hld/mobile.md' })
        .textContent,
    ).toContain('Mobile app');
  });

  it('falls back to name when there is no title', () => {
    const leaf = oneLeaf({ repo: 'r', project: 'hld', name: 'mobile.md', path: 'hld/mobile.md' });
    expect(leaf.textContent).toContain('mobile.md');
  });

  it('falls back to path when there is neither title nor name', () => {
    expect(oneLeaf({ repo: 'r', project: 'hld', path: 'hld/mobile.md' }).textContent).toContain(
      'hld/mobile.md',
    );
  });
});

describe('SourceMap — leaf tags (R-3.2)', () => {
  // LLD constraint 2: the AI path emits `Tags` as a STRING and the graph-DB path
  // emits "" or "[a, b, c]". mergeSources normalizes on the way in, but a row
  // reaching this component by any other path must not render one long fake tag.
  it('renders an array of tags as discrete tags', () => {
    const leaf = oneLeaf({
      repo: 'r',
      project: 'hld',
      name: 'mobile.md',
      tags: ['research', 'codebase'],
    });
    expect(leafTags(leaf)).toEqual(['#research', '#codebase']);
  });

  it('splits a bare comma-separated string into discrete tags', () => {
    const leaf = oneLeaf({
      repo: 'r',
      project: 'hld',
      name: 'mobile.md',
      tags: 'research, codebase',
    });
    expect(leafTags(leaf)).toEqual(['#research', '#codebase']);
  });

  it('splits a bracketed string into discrete tags', () => {
    const leaf = oneLeaf({
      repo: 'r',
      project: 'hld',
      name: 'mobile.md',
      tags: '[research, codebase, installer]',
    });
    expect(leafTags(leaf)).toEqual(['#research', '#codebase', '#installer']);
  });

  it('renders no tags at all when the row has no tags field', () => {
    expect(leafTags(oneLeaf({ repo: 'r', project: 'hld', name: 'mobile.md' }))).toEqual([]);
  });

  it('renders no tags at all when tags is the empty string the graph-DB path emits', () => {
    expect(leafTags(oneLeaf({ repo: 'r', project: 'lld', name: 'billing.md', tags: '' }))).toEqual(
      [],
    );
  });
});

describe('SourceMap — leaf activation (R-3.3, R-3.6)', () => {
  const ROW = {
    repo: 'foyer-platform',
    project: 'lld',
    name: 'billing.md',
    path: 'lld/billing.md',
    fullpath: '/r/lld/billing.md',
  };

  it('reports the activated row on click', () => {
    const onSelectSource = vi.fn();
    render(<SourceMap sources={[ROW]} active onSelectSource={onSelectSource} />);

    fireEvent.click(screen.getByTestId('source-map-leaf-activate'));

    expect(onSelectSource).toHaveBeenCalledTimes(1);
    expect(onSelectSource).toHaveBeenCalledWith(ROW);
  });

  it('activates on Enter and on Space, so the leaf is keyboard-operable', () => {
    const onSelectSource = vi.fn();
    render(<SourceMap sources={[ROW]} active onSelectSource={onSelectSource} />);
    const activate = screen.getByTestId('source-map-leaf-activate');

    fireEvent.keyDown(activate, { key: 'Enter' });
    fireEvent.keyDown(activate, { key: ' ' });

    expect(onSelectSource).toHaveBeenCalledTimes(2);
  });

  it('exposes the leaf as a focusable button without nesting one inside the reveal button', () => {
    const { container } = render(<SourceMap sources={[ROW]} active onSelectSource={() => {}} />);
    const activate = screen.getByTestId('source-map-leaf-activate');

    expect(activate.getAttribute('role')).toBe('button');
    expect(activate.getAttribute('tabindex')).toBe('0');
    // A <button> here would nest the reveal <button> inside another button, which
    // is invalid — the same reason the result cards use role/tabIndex/onKeyDown.
    expect(activate.tagName).not.toBe('BUTTON');
    expect(container.querySelectorAll('button button')).toHaveLength(0);
  });

  it('does not activate the leaf when the reveal control inside it is clicked', async () => {
    const onSelectSource = vi.fn();
    render(<SourceMap sources={[ROW]} active onSelectSource={onSelectSource} />);

    fireEvent.click(screen.getByTestId('reveal-btn'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(onSelectSource).not.toHaveBeenCalled();
  });

  it('keys leaves by the shared source-identity key (R-3.6)', () => {
    // Two rows sharing a name across different repos are distinct documents. A
    // key derived from `name` alone would collide and drop one of them.
    render(
      <SourceMap
        sources={[
          { repo: 'a', project: 'hld', name: 'index.md', fullpath: '/a/hld/index.md' },
          { repo: 'b', project: 'hld', name: 'index.md', fullpath: '/b/hld/index.md' },
        ]}
        active
      />,
    );

    expect(screen.getAllByTestId('source-map-leaf')).toHaveLength(2);
  });
});

describe('SourceMap — reveal control (R-3.4, R-3.5)', () => {
  it('offers a reveal control on every leaf', () => {
    render(<SourceMap sources={SOURCES} active />);

    expect(screen.getAllByTestId('reveal-btn')).toHaveLength(SOURCES.length);
  });

  it('falls back to path when fullpath is empty, rather than a no-op control', async () => {
    // LLD constraint 3: `json related` rows carry a synthetic `path` and an EMPTY
    // `fullpath` (cli/db/query.go:501-510), and the prompt instructs Claude to run
    // `json related` — so these rows occur in real runs.
    render(
      <SourceMap
        sources={[
          { repo: 'foyer-platform', project: 'lld', name: 'billing.md', path: 'lld/billing.md', fullpath: '' },
        ]}
        active
      />,
    );

    fireEvent.click(screen.getByTestId('reveal-btn'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/reveal');
    expect(JSON.parse(init.body)).toEqual({
      repo: 'foyer-platform',
      path: 'lld/billing.md',
      fullpath: '',
    });
  });

  it('reveals by fullpath when the row carries one', async () => {
    render(
      <SourceMap
        sources={[
          {
            repo: 'foyer-platform',
            project: 'lld',
            name: 'billing.md',
            path: 'lld/billing.md',
            fullpath: '/r/lld/billing.md',
          },
        ]}
        active
      />,
    );

    fireEvent.click(screen.getByTestId('reveal-btn'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).fullpath).toBe('/r/lld/billing.md');
  });

  it('renders no control at all when the row has neither path nor fullpath', () => {
    render(<SourceMap sources={[{ repo: 'r', project: 'hld', name: 'ghost.md' }]} active />);

    expect(screen.getByTestId('source-map-leaf')).toBeTruthy();
    expect(screen.queryByTestId('reveal-btn')).toBeNull();
  });
});
