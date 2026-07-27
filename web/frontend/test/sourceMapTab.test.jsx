import { render, screen, fireEvent, within } from '@testing-library/preact';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { App } from '../src/app.jsx';
import appSrc from '../src/app.jsx?raw';

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
});

describe('counted scope wiring (R-2.12)', () => {
  it('feeds the pane unfiltered sources', () => {
    // D8: the tree counts every retrieved source, matching SourcesPanel and
    // topTags. Swapping this to `filteredSources` would make the header's "all N
    // retrieved" claim false, and no rendering test would catch it — the pane
    // cannot tell which array it was handed.
    expect(appSrc).toMatch(/<SourceMap\s+sources=\{sources\}/);
    expect(appSrc).not.toMatch(/<SourceMap\s+sources=\{filteredSources\}/);
  });
});

describe('tab strip width (story 1.6)', () => {
  it('keeps every tab label short enough to fit five across a narrow inspector', () => {
    const { container } = render(<App />);

    // .inspector-tablist is `overflow-x: auto` with nowrap tabs and the app has no
    // media queries, so a fifth tab is the first to scroll out of sight. jsdom has
    // no layout, so this guards the input to that overflow instead: the total
    // label length. Measured budget — the four original labels totalled 58 chars
    // and fit; "Source Map" adds 10, and the strip still fits at the narrowest
    // width the app supports. Anything longer needs a real width check first.
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
});

describe('Neighborhood Map disambiguation (story 1.5)', () => {
  it('states what the Neighborhood Map claims and points at the Source Map', () => {
    const { container } = render(<App />);

    const contrast = container.querySelector('.graph-intro-contrast');
    expect(contrast).toBeTruthy();
    expect(contrast.textContent).toMatch(/relate/i);
    expect(contrast.textContent).toMatch(/source map/i);
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
