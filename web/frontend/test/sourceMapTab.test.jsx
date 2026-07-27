import { render, screen, fireEvent, within } from '@testing-library/preact';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { App } from '../src/app.jsx';

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
