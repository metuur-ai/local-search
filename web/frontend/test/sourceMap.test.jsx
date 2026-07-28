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
import sourceMapSrc from '../src/components/SourceMap.jsx?raw';

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

// ------------------------------------------------------------ Unit 4: streaming
//
// A run emits one `sources` event PER searched repo and the handler ACCUMULATES
// (`setSources((prev) => mergeSources(prev, rows))`, app.jsx:257-258; LLD
// constraint 4). `mergeSources` slices the previous array and pushes only the new
// rows (app.jsx:60-70), so the row OBJECTS of earlier batches are reused by
// reference. These batch fixtures reuse their rows the same way — a fixture that
// rebuilt its rows per batch would be exercising a wholesale replacement, which is
// the different code path the run-boundary block below covers.

const REPO = 'foyer-platform';
const row = (project, name) => ({ repo: REPO, project, name, path: `${project}/${name}` });

// Batch 1 — `hld` leads with 3 of 4 rows.
const HLD_A = row('hld', 'mobile.md');
const HLD_B = row('hld', 'payments.md');
const HLD_C = row('hld', 'care.md');
const LLD_A = row('lld', 'billing.md');
const BATCH_1 = [HLD_A, HLD_B, HLD_C, LLD_A];

// Batch 2 — four more `lld` rows land, so `lld` (5) OVERTAKES `hld` (3) under
// R-2.6's descending-count order, and `ears` appears for the first time. The
// branch the user collapsed genuinely moves position.
const BATCH_2 = [
  ...BATCH_1,
  row('lld', 'payments.md'),
  row('lld', 'care.md'),
  row('lld', 'auth.md'),
  row('lld', 'search.md'),
  row('ears', 'source-map.md'),
];

// Batch 3 — a SECOND repo arrives mid-run, so `buildSourceTree` stops eliding the
// repo level (R-2.3) and the project branches move a level deeper. Project keys are
// unchanged by that (sourceTree.js:100 keys on repo+project), which is the whole
// point of R-2.6a.
const BATCH_3 = [...BATCH_1, { repo: 'local-search', project: 'ears', name: 'sm.md' }];

// What `mergeSources` produces on a wholesale replace: the same DOCUMENTS as
// `batch`, but freshly built row objects (`{ ...r, tags }`, app.jsx:67). Both run
// boundaries go through this — `setSources([])` then a fresh accumulation
// (app.jsx:304), and `setSources(mergeSources([], run.sources))` on restore
// (app.jsx:629).
const replaced = (batch) => batch.map((r) => ({ ...r }));

const topBranches = (container) => [
  ...container.querySelectorAll('.source-map-root > .source-map-branch'),
];
const nameOf = (li) => li.querySelector('.source-map-branch-name').textContent;
// Read the branch's OWN count element, not its textContent, which concatenates
// every nested count too.
const countOf = (li) => li.querySelector('.source-map-count').textContent;

const branchOrder = (container) => topBranches(container).map(nameOf);
const countByBranch = (container) =>
  Object.fromEntries(topBranches(container).map((li) => [nameOf(li), countOf(li)]));
const openByBranch = (container) =>
  Object.fromEntries(
    topBranches(container).map((li) => [nameOf(li), li.querySelector('details').open]),
  );

// A branch at any depth, so the nested case (BATCH_3) is reachable too.
const detailsFor = (name) => screen.getByTestId(`branch-${name}`).querySelector('details');

const activateSummary = (container, name) =>
  fireEvent.click(
    topBranches(container)
      .find((li) => nameOf(li) === name)
      .querySelector('summary'),
  );

describe('SourceMap — rebuild on streamed rows (R-4.1)', () => {
  it('grows branches, counts and leaves as further sources events merge in', () => {
    const { container, rerender } = render(<SourceMap sources={BATCH_1} active />);

    expect(branchOrder(container)).toEqual(['hld', 'lld']);
    expect(countByBranch(container)).toEqual({ hld: '3', lld: '1' });
    expect(screen.getAllByTestId('source-map-leaf')).toHaveLength(4);

    rerender(<SourceMap sources={BATCH_2} active />);

    expect(countByBranch(container)).toEqual({ lld: '5', hld: '3', ears: '1' });
    expect(screen.getAllByTestId('source-map-leaf')).toHaveLength(9);
    // R-2.5 still holds mid-stream: the header's total tracks the branch counts.
    expect(screen.getByTestId('source-map-header').textContent).toMatch(
      /all 9 retrieved sources/i,
    );
  });

  it('grows out of the empty state when the first rows of a run arrive', () => {
    // The pane is empty for the part of the run the user is actually watching, so
    // the empty state has to give way rather than persist until `done`.
    const { container, rerender } = render(<SourceMap sources={[]} active />);
    expect(screen.getByTestId('source-map-empty')).toBeTruthy();

    rerender(<SourceMap sources={BATCH_1} active />);

    expect(screen.queryByTestId('source-map-empty')).toBeNull();
    expect(branchOrder(container)).toEqual(['hld', 'lld']);
  });

  it('deepens to repo branches when a second repo arrives mid-run', () => {
    const { container, rerender } = render(<SourceMap sources={BATCH_1} active />);
    expect(branchOrder(container)).toEqual(['hld', 'lld']);

    rerender(<SourceMap sources={BATCH_3} active />);

    expect(branchOrder(container)).toEqual(['foyer-platform', 'local-search']);
    expect(detailsFor('hld')).toBeTruthy();
  });
});

describe('SourceMap — default expanded (R-4.5)', () => {
  it('renders every branch expanded on a fresh tree', () => {
    const { container } = render(<SourceMap sources={BATCH_1} active />);

    expect(openByBranch(container)).toEqual({ hld: true, lld: true });
  });

  it('expands nested repo and project branches alike', () => {
    const { container } = render(<SourceMap sources={BATCH_3} active />);

    const all = [...container.querySelectorAll('details')];
    expect(all.length).toBeGreaterThan(2);
    expect(all.every((d) => d.open)).toBe(true);
  });

  it('opens a branch that first appears mid-stream, even while another is collapsed', () => {
    // D6/R-4.5 must hold for branches nobody has seen yet: a COLLAPSED-key set
    // gives that for free, where a set of expanded keys would leave every new
    // branch shut.
    const { container, rerender } = render(<SourceMap sources={BATCH_1} active />);
    activateSummary(container, 'hld');

    rerender(<SourceMap sources={BATCH_2} active />);

    expect(openByBranch(container).ears).toBe(true);
  });
});

describe('SourceMap — component-owned expansion (R-4.2, R-4.2a, R-5.2)', () => {
  it('collapses only the branch whose summary was activated', () => {
    const { container } = render(<SourceMap sources={BATCH_1} active />);

    activateSummary(container, 'hld');

    expect(openByBranch(container)).toEqual({ hld: false, lld: true });
  });

  it('re-expands the branch on a second activation', () => {
    const { container } = render(<SourceMap sources={BATCH_1} active />);

    activateSummary(container, 'hld');
    activateSummary(container, 'hld');

    expect(openByBranch(container).hld).toBe(true);
  });

  it('keeps the collapse on the branch the user collapsed when streaming re-orders them', () => {
    // The exact defect D5 exists to prevent: R-2.6 orders by DESCENDING COUNT and
    // counts change as rows stream in, so `hld` slides from first to second while
    // the user is reading it. The collapse must travel with `hld`, not stay at
    // position 0.
    const { container, rerender } = render(<SourceMap sources={BATCH_1} active />);
    activateSummary(container, 'hld');
    expect(branchOrder(container)).toEqual(['hld', 'lld']);

    rerender(<SourceMap sources={BATCH_2} active />);

    // Prove the re-order actually happened — without this the assertion below
    // would pass on a tree that never moved.
    expect(branchOrder(container)).toEqual(['lld', 'hld', 'ears']);
    expect(openByBranch(container)).toEqual({ lld: true, hld: false, ears: true });
    // And no sibling came along for the ride.
    expect([...container.querySelectorAll('details')].filter((d) => !d.open)).toHaveLength(1);
  });

  it('keeps the collapse when a second repo appears and the repo level stops being elided', () => {
    // The re-shaping case sourceTree.js:126-128 calls out. `hld` moves from a
    // top-level branch to a nested one, so its DOM element is torn down and
    // rebuilt — browser-owned `open` cannot survive that, component state can,
    // because the project key is identical either way (R-2.6a).
    const { container, rerender } = render(<SourceMap sources={BATCH_1} active />);
    activateSummary(container, 'hld');

    rerender(<SourceMap sources={BATCH_3} active />);

    expect(detailsFor('hld').open).toBe(false);
    expect(detailsFor('lld').open).toBe(true);
    expect(detailsFor('foyer-platform').open).toBe(true);
  });

  it('keeps the collapse across a switch to another inspector tab and back', () => {
    // Every pane stays mounted and is toggled by `hidden` (app.jsx:1212-1216), so
    // the component is not remounted — but it does return early while inactive,
    // and that early return must not drop the state.
    const { container, rerender } = render(<SourceMap sources={BATCH_1} active />);
    activateSummary(container, 'hld');

    rerender(<SourceMap sources={BATCH_1} active={false} />);
    rerender(<SourceMap sources={BATCH_1} active />);

    expect(openByBranch(container).hld).toBe(false);
  });

  it('keeps the collapse when rows merge in while the pane is not selected', () => {
    const { container, rerender } = render(<SourceMap sources={BATCH_1} active />);
    activateSummary(container, 'hld');

    rerender(<SourceMap sources={BATCH_1} active={false} />);
    rerender(<SourceMap sources={BATCH_2} active={false} />);
    rerender(<SourceMap sources={BATCH_2} active />);

    expect(openByBranch(container).hld).toBe(false);
  });

  it('uses native details/summary elements throughout (R-5.2)', () => {
    const { container } = render(<SourceMap sources={BATCH_3} active />);

    // Not a hand-rolled disclosure widget: keyboard operation and the
    // group/button roles assistive technology reads come from the elements.
    for (const details of container.querySelectorAll('details')) {
      expect(details.firstElementChild.tagName).toBe('SUMMARY');
    }
    expect(container.querySelectorAll('[role="switch"], [aria-expanded]')).toHaveLength(0);
  });

  it('cancels the summary default action, so the browser never writes open itself (R-4.2a)', () => {
    // The one directly observable proof that state is the SOLE writer of `open`.
    // jsdom implements the summary activation behaviour (it flips `open` on click,
    // verified against jsdom 25), so an uncancelled default would leave the browser
    // and component state as two writers of the same attribute — and Preact, which
    // diffs against the previous vnode rather than the DOM, would then skip
    // re-asserting a value it believes unchanged.
    const { container } = render(<SourceMap sources={BATCH_1} active />);
    const summary = topBranches(container)[0].querySelector('summary');

    // fireEvent returns dispatchEvent's result: false when the default was cancelled.
    expect(fireEvent.click(summary)).toBe(false);
  });

  it('never hardcodes the disclosure open, so the browser cannot own the state (R-4.2a)', () => {
    // No rendering assertion can see this: on a fresh tree a hardcoded
    // `<details open>` and a state-driven `open={true}` produce identical DOM, and
    // Preact's keyed reconciliation hides the difference through a plain re-order
    // too. The raw-source guard is the same tactic sourceMapTab.test.jsx:89-97
    // uses for wiring no rendering test can observe.
    expect(sourceMapSrc).not.toMatch(/<details\s+open\s*>/);
    expect(sourceMapSrc).toMatch(/<details\s+open=\{/);
  });
});

describe('SourceMap — run boundaries (R-4.3, R-4.4)', () => {
  it('drops the previous run collapse when a new run clears and refills sources', () => {
    // A new run calls `setSources([])` (app.jsx:304) and then accumulates fresh
    // rows. Re-running the SAME query returns the same documents under the same
    // branch keys, so nothing about the tree's shape says "new run" — only the
    // fact that the rows are new objects does.
    const RERUN = replaced(BATCH_1);
    const { container, rerender } = render(<SourceMap sources={BATCH_1} active />);
    activateSummary(container, 'hld');

    rerender(<SourceMap sources={[]} active />);
    rerender(<SourceMap sources={RERUN} active />);

    expect(openByBranch(container)).toEqual({ hld: true, lld: true });
  });

  it('drops the previous run collapse when a restore replaces sources with no empty step', () => {
    // The trap R-4.4 hides: `restoreRun` goes non-empty straight to non-empty
    // (`setSources(mergeSources([], run.sources))`, app.jsx:629). Restoring run A
    // after run B never passes through empty, and A and B share branch keys
    // because they share repos and project folders — so a pane that only reset on
    // empty would render A collapsed because of something the user did in B.
    const RESTORED = replaced(BATCH_1);
    const { container, rerender } = render(<SourceMap sources={BATCH_2} active />);
    activateSummary(container, 'hld');

    rerender(<SourceMap sources={RESTORED} active />);

    expect(openByBranch(container)).toEqual({ hld: true, lld: true });
  });

  it('drops the previous run collapse when one restored run replaces another', () => {
    const FIRST = replaced(BATCH_2);
    const SECOND = replaced(BATCH_1);
    const { container, rerender } = render(<SourceMap sources={FIRST} active />);
    activateSummary(container, 'hld');

    rerender(<SourceMap sources={SECOND} active />);

    expect(openByBranch(container)).toEqual({ hld: true, lld: true });
  });

  it('drops the previous run collapse across a boundary that happened on another tab', () => {
    const RERUN = replaced(BATCH_1);
    const { container, rerender } = render(<SourceMap sources={BATCH_1} active />);
    activateSummary(container, 'hld');

    rerender(<SourceMap sources={BATCH_1} active={false} />);
    rerender(<SourceMap sources={RERUN} active={false} />);
    rerender(<SourceMap sources={RERUN} active />);

    expect(openByBranch(container).hld).toBe(true);
  });

  it('builds a restored run tree identically to the live run it came from', () => {
    // R-4.4 stated as an equality rather than a description: the same documents
    // through the replace path must produce the same branches, order and counts.
    const live = render(<SourceMap sources={BATCH_2} active />);
    const liveShape = [branchOrder(live.container), countByBranch(live.container)];
    live.unmount();

    const restored = render(<SourceMap sources={replaced(BATCH_2)} active />);

    expect([branchOrder(restored.container), countByBranch(restored.container)]).toEqual(
      liveShape,
    );
  });
});
