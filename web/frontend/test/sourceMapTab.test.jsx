import { render, screen, fireEvent, within } from '@testing-library/preact';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { App } from '../src/app.jsx';
import { readFileSync } from 'node:fs';
import appSrc from '../src/app.jsx?raw';

// Read from disk, not via `?raw`: vitest leaves CSS processing off, so a raw CSS
// import resolves to an empty string and any assertion against it passes vacuously.
const appCss = readFileSync('src/app.css', 'utf8');

// App fetches repos on mount; stub fetch so the test never hits the network.
beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const TAB_LABELS = [
  /ai answer/i,
  /sources & provenance/i,
  /neighborhood map/i,
  /source map/i,
  /top tags/i,
];

const paneIds = [
  'region-answer',
  'region-sources',
  'region-graph',
  'region-source-map',
  'region-tags',
];

// Scope tab lookups to the strip itself. "AI Answer" also names a control
// elsewhere in the shell, so an unscoped role query is ambiguous.
const tab = (container, label) =>
  within(container.querySelector('.inspector-tablist')).getByRole('button', { name: label });

describe('inspector tab strip (R-1.1, R-1.2)', () => {
  it('presents a fifth tab labeled Source Map alongside the existing four', () => {
    const { container } = render(<App />);

    for (const label of TAB_LABELS) {
      expect(tab(container, label)).toBeTruthy();
    }
  });

  it('reveals only the Source Map pane when its tab is selected', () => {
    const { container } = render(<App />);

    fireEvent.click(tab(container, /^source map$/i));

    expect(screen.getByTestId('region-source-map').hidden).toBe(false);
    for (const id of paneIds.filter((p) => p !== 'region-source-map')) {
      expect(screen.getByTestId(id).hidden).toBe(true);
    }
  });

  it('leaves the other four panes reachable and mutually exclusive (R-1.7)', () => {
    const { container } = render(<App />);

    // Selecting each tab in turn must reveal exactly one pane. A fifth tab that
    // broke the toggle would show up here rather than in manual clicking.
    const byTab = [
      [/ai answer/i, 'region-answer'],
      [/sources & provenance/i, 'region-sources'],
      [/neighborhood map/i, 'region-graph'],
      [/^source map$/i, 'region-source-map'],
      [/top tags/i, 'region-tags'],
    ];

    for (const [label, pane] of byTab) {
      fireEvent.click(tab(container, label));
      const visible = paneIds.filter((id) => !screen.getByTestId(id).hidden);
      expect(visible).toEqual([pane]);
    }
  });
});

describe('inspector right-aligned label (R-1.4)', () => {
  it('reports the retrieved source count on the Source Map tab', () => {
    const { container } = render(<App />);

    fireEvent.click(tab(container, /^source map$/i));

    // Zero sources in this shell, but the label must name the source count rather
    // than fall through to the graph pane's static 'Graph'.
    expect(container.querySelector('.inspector-ext').textContent).toMatch(/0 sources/);
  });

  it('counts unfiltered sources in the label', () => {
    // The rendering assertion above cannot tell `sources` from `filteredSources`:
    // both are 0 in this shell, so the swap survives it. R-2.12 wants the count to
    // match the tree, which is built from unfiltered `sources`.
    expect(appSrc).toMatch(/inspectorTab === 'sourcemap'\s*\?\s*`\$\{sources\.length\} sources`/);
  });
});

describe('pane wiring (R-1.3, R-2.12)', () => {
  // These guard props no rendering test can observe. The component cannot tell
  // which array it was handed, and cannot tell an always-true `active` from a
  // correctly gated one.

  it('feeds the pane unfiltered sources', () => {
    // D8: the tree counts every retrieved source, matching SourcesPanel and
    // topTags. Swapping this to `filteredSources` would make the header's "all N
    // retrieved" claim false.
    expect(appSrc).toMatch(/<SourceMap\s+sources=\{sources\}/);
    expect(appSrc).not.toMatch(/<SourceMap\s+sources=\{filteredSources\}/);
  });

  it('gates the pane on the Source Map tab being selected', () => {
    // Constraint 5 exists because all panes stay mounted. Hardcoding `active` to
    // true would rebuild the tree on every `sources` event of every run while the
    // user reads another tab, and the component-level gating test would still pass
    // — it is handed `active` as a prop.
    expect(appSrc).toMatch(/<SourceMap[\s\S]{0,160}active=\{inspectorTab === 'sourcemap'\}/);
    expect(appSrc).not.toMatch(/<SourceMap[\s\S]{0,160}active(=\{true\})?\s*\n/);
  });
});

describe('tab strip width (story 1.6)', () => {
  it('keeps every tab label short enough to fit five across a narrow inspector', () => {
    const { container } = render(<App />);

    // jsdom has no layout, so this cannot assert the outcome — reachability was
    // verified in a real browser instead (see the story 1.6 commit: one 45px row at
    // 1680px, wrapping to two rows with zero horizontal overflow at 1280px). What
    // it guards is the INPUT to that measurement: the five labels fitted one row
    // only after the tab padding was tightened, with about 10px of slack. A longer
    // label spends that slack and silently sends the strip back to two rows, so
    // changing one means re-measuring rather than trusting this file.
    const labels = [...container.querySelectorAll('.inspector-tab')].map((b) =>
      b.textContent.trim(),
    );

    expect(labels).toHaveLength(5);
    expect(labels.join('').length).toBeLessThanOrEqual(72);
    // No single label should dominate the strip either.
    for (const label of labels) {
      expect(label.length).toBeLessThanOrEqual(22);
    }
  });

  it('keeps wrapping as the fallback so no tab can be clipped out of reach', () => {
    // The reachability guarantee at narrow widths is `flex-wrap: wrap`; removing it
    // returns `.inspector-tablist` to a single scrolling row where the fifth tab is
    // the first out of sight. Asserted against the stylesheet because jsdom applies
    // no layout, so no rendering test can see it.
    const tablist = appCss.match(/\.inspector-tablist\s*\{[^}]*\}/)?.[0] ?? '';
    expect(tablist).toMatch(/flex-wrap:\s*wrap/);
  });
});

describe('Neighborhood Map disambiguation (story 1.5)', () => {
  it('points at the Source Map for where documents live', () => {
    const { container } = render(<App />);

    const contrast = container.querySelector('.graph-intro-contrast');
    expect(contrast).toBeTruthy();
    expect(contrast.textContent).toMatch(/source map/i);
    expect(contrast.textContent).toMatch(/query/i);
  });

  it('does not claim the map shows how documents relate to each other', () => {
    // This line first read "shows which documents relate to each other", and an
    // earlier version of this test asserted /relate/i — enforcing the overclaim.
    // The pane has two modes: an explicit `graph` event from `json related` does
    // carry document-to-document links, but the fallback `graphFromSources` builds
    // a pure query→document star with no inter-document edge at all
    // (graphElements.js:74-96). Copy asserting documents relate to each other is
    // therefore false in the fallback mode, which is what constraint 7 and
    // explainable-search R-4.4 forbid. The Source Map header is held to the same
    // bar in sourceMap.test.jsx.
    const { container } = render(<App />);

    const contrast = container.querySelector('.graph-intro-contrast').textContent;
    expect(contrast).not.toMatch(/relate|related|similar|connected to each other/i);
  });
});

// ---------------------------------------------------------------- Unit 3 wiring
//
// Getting real sources into <App /> without a live SSE stream: restore a run from
// history. `onRestore` feeds `run.sources` through the same `mergeSources` a live
// run uses (app.jsx:629), so this is the R-4.4 path, not a test-only shortcut.

const HISTORY_KEY = 'local-search:history:v1';

const MOBILE = {
  repo: 'foyer-platform',
  project: 'hld',
  name: 'mobile.md',
  path: 'hld/mobile.md',
  fullpath: '/r/hld/mobile.md',
  tags: ['mobile'],
};
const BILLING = {
  repo: 'foyer-platform',
  project: 'lld',
  name: 'billing.md',
  path: 'lld/billing.md',
  fullpath: '/r/lld/billing.md',
  tags: ['billing'],
};

// Seed history, mount, and reopen the run so `sources` is populated.
function renderWithRestoredRun(sources) {
  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify([
      { id: 'run-1', ts: Date.now(), query: 'care rules', repos: ['foyer-platform'], answerMarkdown: '', sources, provenance: {}, graph: null },
    ]),
  );
  const rendered = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /recent searches/i }));
  fireEvent.click(rendered.container.querySelector('.history-item'));
  return rendered;
}

// The Source Map leaf whose label matches `text`.
const leafFor = (text) =>
  screen
    .getAllByTestId('source-map-leaf')
    .find((li) => li.textContent.includes(text))
    .querySelector('[data-testid="source-map-leaf-activate"]');

// Narrow the console with a tag facet. Scoped to the ribbon: the Top Tags pane
// renders a button per tag too, so an unscoped role query is ambiguous.
const filterByTag = (container, tag) =>
  fireEvent.click(
    within(container.querySelector('.tag-ribbon')).getByRole('button', { name: new RegExp(`#${tag}\\b`) }),
  );

// The document the detail block is currently pointed at.
const detailPath = (container) =>
  container.querySelector('.source-detail .source-detail-path span')?.textContent ?? null;

describe('Source Map leaf activation (R-3.3)', () => {
  afterEach(() => localStorage.clear());

  it('selects the source and switches to Sources & Provenance', () => {
    const { container } = renderWithRestoredRun([MOBILE, BILLING]);
    fireEvent.click(tab(container, /^source map$/i));

    fireEvent.click(leafFor('billing.md'));

    expect(screen.getByTestId('region-sources').hidden).toBe(false);
    expect(screen.getByTestId('region-source-map').hidden).toBe(true);
    expect(detailPath(container)).toBe('lld/billing.md');
  });
});

describe('identity-based source selection (R-3.6)', () => {
  afterEach(() => localStorage.clear());

  it('opens the document the leaf names even with a filter narrowing the console', () => {
    // The defect this closes: `activeSourceIdx` was a POSITIONAL index resolved
    // against `filteredSources`, but D8 builds the Source Map from UNFILTERED
    // `sources`. With #mobile active, filteredSources is [MOBILE] — so a leaf
    // reporting position 1 (billing) resolved to nothing at all.
    const { container } = renderWithRestoredRun([MOBILE, BILLING]);
    filterByTag(container, 'mobile');
    fireEvent.click(tab(container, /^source map$/i));

    fireEvent.click(leafFor('billing.md'));

    expect(detailPath(container)).toBe('lld/billing.md');
  });

  it('keeps a selected result card pointed at its own document when the filter changes', () => {
    // Same defect on the result cards themselves: selecting position 1 of an
    // unfiltered list and then filtering re-pointed the detail block at whatever
    // row happened to land at position 1 next.
    const { container } = renderWithRestoredRun([MOBILE, BILLING]);
    fireEvent.click(container.querySelectorAll('.result-card')[1]);
    expect(detailPath(container)).toBe('lld/billing.md');

    filterByTag(container, 'billing');

    expect(detailPath(container)).toBe('lld/billing.md');
  });
});

describe('result-card selection is unchanged (R-1.7)', () => {
  afterEach(() => localStorage.clear());

  it('marks the clicked card active, opens Sources, and shows its detail block', () => {
    const { container } = renderWithRestoredRun([MOBILE, BILLING]);
    const cards = () => [...container.querySelectorAll('.result-card')];

    fireEvent.click(cards()[1]);

    expect(screen.getByTestId('region-sources').hidden).toBe(false);
    expect(cards()[1].className).toContain('is-active');
    expect(cards()[0].className).not.toContain('is-active');
    expect(detailPath(container)).toBe('lld/billing.md');

    // And selection moves rather than accumulating.
    fireEvent.click(cards()[0]);
    expect(cards()[0].className).toContain('is-active');
    expect(cards()[1].className).not.toContain('is-active');
    expect(detailPath(container)).toBe('hld/mobile.md');
  });

  it('a leaf and its result card land on the same detail block', () => {
    const { container } = renderWithRestoredRun([MOBILE, BILLING]);

    fireEvent.click(container.querySelectorAll('.result-card')[1]);
    const fromCard = detailPath(container);

    fireEvent.click(tab(container, /^source map$/i));
    fireEvent.click(leafFor('billing.md'));

    expect(detailPath(container)).toBe(fromCard);
  });
});

// ------------------------------------------------------- Unit 4 run boundaries
//
// The component-level file covers expansion state under streaming; these two go
// through the app's real run-boundary paths, which is where the reset actually has
// to be triggered from.

const branchCount = (name) =>
  screen.getByTestId(`branch-${name}`).querySelector('.source-map-count').textContent;

describe('restored runs build the tree as a live run would (R-4.4)', () => {
  afterEach(() => localStorage.clear());

  it('groups the restored sources into branches with their counts', () => {
    const { container } = renderWithRestoredRun([MOBILE, BILLING]);
    fireEvent.click(tab(container, /^source map$/i));

    // One repo, so the repo level is elided and `hld`/`lld` are the top level
    // (R-2.3) — exactly what a live run over the same rows produces.
    expect(screen.getByTestId('source-tree')).toBeTruthy();
    expect(branchCount('hld')).toBe('1');
    expect(branchCount('lld')).toBe('1');
    expect(screen.getAllByTestId('source-map-leaf')).toHaveLength(2);
  });
});

describe('a new run resets the tree (R-4.3)', () => {
  afterEach(() => localStorage.clear());

  it('leaves no branches from the previous run behind', () => {
    const { container } = renderWithRestoredRun([MOBILE, BILLING]);
    fireEvent.click(tab(container, /^source map$/i));
    expect(screen.getByTestId('source-tree')).toBeTruthy();

    // "New search" runs `resetRunState`, which clears `sources` (app.jsx:304).
    fireEvent.click(screen.getByTestId('new-search'));
    fireEvent.click(tab(container, /^source map$/i));

    expect(screen.queryByTestId('source-tree')).toBeNull();
    expect(screen.queryByTestId('branch-hld')).toBeNull();
    expect(screen.getByTestId('source-map-empty')).toBeTruthy();
  });
});
