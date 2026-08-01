import { render, screen, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `useForceGraph` reaches `force-graph` → a real <canvas>, which jsdom does not
// implement and which would need the `canvas` package as a devDependency. The
// hook is mocked instead: every load path in GraphExplorer funnels into
// `loadNewData`, which ends in `graphLoad(...)`, so `graphMock.load` is the
// observable handle for "this routed through loadNewData" and for counting
// re-loads. Hoisted so the spies exist before the module factory runs.
const graphMock = vi.hoisted(() => ({
  load: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  fit: vi.fn(),
  togglePhysics: vi.fn(),
  setShowLabels: vi.fn(),
  deselect: vi.fn(),
  selectById: vi.fn(),
  getConnections: vi.fn(() => []),
}));

vi.mock('../src/graph-explorer/useForceGraph.js', () => ({
  useForceGraph: vi.fn(() => graphMock),
}));

// eslint-disable-next-line import/first
import { GraphExplorer } from '../src/graph-explorer/GraphExplorer.jsx';

// The hoisted mock cannot be exported directly (vitest forbids it); re-export
// under a plain binding so later suites can reach the canvas spies.
export const forceGraph = graphMock;

// Small valid { nodes, links } graph — enough for `toGraph` to pass it through
// untouched and for the stats readout to be non-zero.
export const fixtureGraph = {
  nodes: [
    { id: 'a.py', name: 'a.py', type: 'file', repo: 'alpha', project: 'src', tags: ['code'] },
    { id: 'b.md', name: 'b.md', type: 'file', repo: 'alpha', project: 'docs', tags: ['doc'] },
  ],
  links: [{ source: 'a.py', target: 'b.md', family: 'declared' }],
};

// Stubs `fetch` for every route GraphExplorer's subtree can hit. `/api/graph`
// resolves with `graph`; anything else resolves empty so nothing throws.
// Returns the vi.fn so tests can assert call counts per route.
export function stubFetch(graph = fixtureGraph) {
  const fetchMock = vi.fn((url) => {
    if (String(url).startsWith('/api/graph')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(graph) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
  global.fetch = fetchMock;
  return fetchMock;
}

// How many times `fetch` was called for a given route prefix.
export function fetchCallsTo(fetchMock, prefix) {
  return fetchMock.mock.calls.filter(([url]) => String(url).startsWith(prefix)).length;
}

// Mounts GraphExplorer with the canvas hook mocked and the initial fetch
// settled, so a test starts from the loaded steady state.
// Returns the render result plus the fetch spy and the canvas-load spy.
export async function renderExplorer({ graph = fixtureGraph } = {}) {
  const fetchMock = stubFetch(graph);
  const view = render(<GraphExplorer />);
  await waitFor(() => expect(graphMock.load).toHaveBeenCalled());
  return { ...view, fetchMock, graphLoad: graphMock.load };
}

beforeEach(() => {
  // jsdom implements neither the clipboard API nor scrollIntoView.
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(() => Promise.resolve()) },
    configurable: true,
    writable: true,
  });
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

describe('GraphExplorer mount (test infrastructure smoke)', () => {
  it('renders the toolbar and fetches /api/graph exactly once', async () => {
    const { fetchMock, graphLoad } = await renderExplorer();

    // Toolbar is on screen.
    expect(screen.getByText('Upload JSON')).toBeTruthy();
    expect(screen.getByLabelText('Help')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search files, tags, or projects…')).toBeTruthy();

    // The mount fetch fired once and only once.
    expect(fetchCallsTo(fetchMock, '/api/graph')).toBe(1);

    // …and the fetched graph reached the canvas through loadNewData.
    expect(graphLoad).toHaveBeenCalledTimes(1);
    const [shown, opts] = graphLoad.mock.calls[0];
    expect(shown.nodes.map((n) => n.id)).toEqual(['a.py', 'b.md']);
    expect(opts).toEqual({ refit: true });
  });
});
