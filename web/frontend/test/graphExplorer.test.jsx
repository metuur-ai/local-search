import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
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

// Drives the hidden file input the way the browser does. `FileReader` is async
// even in jsdom, so callers await the resulting canvas load.
async function uploadFile(container, { name = 'external.json', graph = uploadGraph } = {}) {
  const input = container.querySelector('input[type="file"]');
  const file = new File([JSON.stringify(graph)], name, { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

const uploadGraph = {
  nodes: [{ id: 'x.ts', name: 'x.ts', type: 'file', repo: 'ext', project: 'lib', tags: [] }],
  links: [],
};

describe('derived display graph (baseGraph / upload / blend)', () => {
  it('re-derives on blend toggle without re-fetching /api/graph', async () => {
    const { container, fetchMock, graphLoad } = await renderExplorer();
    expect(fetchCallsTo(fetchMock, '/api/graph')).toBe(1);

    await uploadFile(container);
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2));
    // Upload alone: only the uploaded nodes, tagged with the file's own label.
    let [shown] = graphLoad.mock.calls[1];
    expect(shown.nodes.map((n) => n.id)).toEqual(['x.ts']);
    expect(shown.nodes.every((n) => n.__origin === 'external.json')).toBe(true);

    const toggle = screen.getByLabelText('Blend local-search');

    // Blend on: both halves on the canvas, each still carrying its own origin.
    fireEvent.click(toggle);
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(3));
    [shown] = graphLoad.mock.calls[2];
    expect(shown.nodes.map((n) => n.id).sort()).toEqual(['a.py', 'b.md', 'x.ts']);

    // Blend off: back to the upload, recovered from state rather than the wire.
    fireEvent.click(toggle);
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(4));
    [shown] = graphLoad.mock.calls[3];
    expect(shown.nodes.map((n) => n.id)).toEqual(['x.ts']);

    // The whole sequence went to the network exactly once, at mount.
    expect(fetchCallsTo(fetchMock, '/api/graph')).toBe(1);
  });
});

describe('origin tagging at the load sites', () => {
  it('tags every node of the fetched graph with __origin local-search', async () => {
    const { graphLoad } = await renderExplorer();

    const [shown] = graphLoad.mock.calls[0];
    expect(shown.nodes.length).toBe(2);
    expect(shown.nodes.every((n) => n.__origin === 'local-search')).toBe(true);
  });

  it('tags every node of the RefreshReposPanel rebuild with __origin local-search', async () => {
    const rebuilt = {
      nodes: [{ id: 'c.go', name: 'c.go', type: 'file', repo: 'beta', project: 'cmd', tags: [] }],
      links: [],
    };
    const fetchMock = vi.fn((url) => {
      const u = String(url);
      if (u.startsWith('/api/graph/refresh')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(rebuilt) });
      }
      if (u.startsWith('/api/graph')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(fixtureGraph) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
    global.fetch = fetchMock;

    render(<GraphExplorer />);
    await waitFor(() => expect(graphMock.load).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Refresh from repos'));
    fireEvent.click(await screen.findByText('Rebuild graph'));

    await waitFor(() => expect(graphMock.load).toHaveBeenCalledTimes(2));
    const [shown] = graphMock.load.mock.calls[1];
    expect(shown.nodes.map((n) => n.id)).toEqual(['c.go']);
    expect(shown.nodes.every((n) => n.__origin === 'local-search')).toBe(true);
  });
});

describe('loadNewData options bag', () => {
  // A blend toggle is an A/B comparison of two views of the same narrowing —
  // wiping the filters and refitting on every flip makes it a reload with a
  // checkbox affordance.
  it('preserves the narrowed filters and skips the refit when blend is toggled', async () => {
    const { container, graphLoad } = await renderExplorer();
    await uploadFile(container);
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2));

    // Narrow to the uploaded node by name. The filter effect is debounced 300ms.
    const searchBox = screen.getByPlaceholderText('Search files, tags, or projects…');
    fireEvent.input(searchBox, { target: { value: 'x' } });
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(3), { timeout: 2000 });

    fireEvent.click(screen.getByLabelText('Blend local-search'));
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(4));

    // The blend went to the canvas still narrowed: a.py and b.md are in the
    // merged graph but do not match the search the user had already built.
    const [shown, opts] = graphLoad.mock.calls[3];
    expect(shown.nodes.map((n) => n.id)).toEqual(['x.ts']);
    expect(opts.refit).toBe(false);
    // …and the text the narrowing came from is still in the box.
    expect(searchBox.value).toBe('x');
  });

  it('still resets the filters and refits for a fresh upload', async () => {
    const { container, graphLoad } = await renderExplorer();

    const searchBox = screen.getByPlaceholderText('Search files, tags, or projects…');
    fireEvent.input(searchBox, { target: { value: 'a' } });
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2), { timeout: 2000 });

    await uploadFile(container);
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(3));

    const [shown, opts] = graphLoad.mock.calls[2];
    expect(shown.nodes.map((n) => n.id)).toEqual(['x.ts']);
    expect(opts.refit).toBe(true);
    expect(searchBox.value).toBe('');
  });
});

describe('replace, rebuild and no-op paths', () => {
  it('replaces the upload with a second one rather than stacking them', async () => {
    const { container, graphLoad } = await renderExplorer();

    await uploadFile(container, { name: 'first.json', graph: uploadGraph });
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2));

    const second = {
      nodes: [{ id: 'y.rb', name: 'y.rb', type: 'file', repo: 'ext2', project: 'lib', tags: [] }],
      links: [],
    };
    await uploadFile(container, { name: 'second.json', graph: second });
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(3));

    // One dataset on screen — the newest — not both uploads concatenated.
    const [shown] = graphLoad.mock.calls[2];
    expect(shown.nodes.map((n) => n.id)).toEqual(['y.rb']);
    expect(shown.nodes.every((n) => n.__origin === 'second.json')).toBe(true);
  });

  it('keeps the upload and the blend across a RefreshReposPanel rebuild', async () => {
    const rebuilt = {
      nodes: [{ id: 'c.go', name: 'c.go', type: 'file', repo: 'beta', project: 'cmd', tags: [] }],
      links: [],
    };
    const fetchMock = vi.fn((url) => {
      const u = String(url);
      if (u.startsWith('/api/graph/refresh')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(rebuilt) });
      }
      if (u.startsWith('/api/graph')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(fixtureGraph) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
    global.fetch = fetchMock;
    const { container } = render(<GraphExplorer />);
    await waitFor(() => expect(graphMock.load).toHaveBeenCalled());

    await uploadFile(container);
    await waitFor(() => expect(graphMock.load).toHaveBeenCalledTimes(2));
    const toggle = screen.getByLabelText('Blend local-search');
    fireEvent.click(toggle);
    await waitFor(() => expect(graphMock.load).toHaveBeenCalledTimes(3));

    fireEvent.click(screen.getByText('Refresh from repos'));
    fireEvent.click(await screen.findByText('Rebuild graph'));
    await waitFor(() => expect(graphMock.load).toHaveBeenCalledTimes(4));

    // The rebuild replaced the base half only; the upload and the blend survive.
    const [shown] = graphMock.load.mock.calls[3];
    expect(shown.nodes.map((n) => n.id).sort()).toEqual(['c.go', 'x.ts']);
    expect(screen.getByLabelText('Blend local-search').checked).toBe(true);
  });

  it('does not reload when a rebuild leaves the displayed graph unchanged', async () => {
    const rebuilt = {
      nodes: [{ id: 'c.go', name: 'c.go', type: 'file', repo: 'beta', project: 'cmd', tags: [] }],
      links: [],
    };
    const fetchMock = vi.fn((url) => {
      const u = String(url);
      if (u.startsWith('/api/graph/refresh')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(rebuilt) });
      }
      if (u.startsWith('/api/graph')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(fixtureGraph) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
    global.fetch = fetchMock;
    const { container } = render(<GraphExplorer />);
    await waitFor(() => expect(graphMock.load).toHaveBeenCalled());

    // Upload shown standalone: the base half is off screen.
    await uploadFile(container);
    await waitFor(() => expect(graphMock.load).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByText('Refresh from repos'));
    fireEvent.click(await screen.findByText('Rebuild graph'));
    await waitFor(() => expect(fetchCallsTo(fetchMock, '/api/graph/refresh')).toBe(1));
    // Let the rebuild's state update render on its own, before the toggle can
    // coalesce with it — otherwise a reload it caused would hide inside the
    // toggle's.
    await new Promise((r) => { setTimeout(r, 20); });
    expect(graphMock.load).toHaveBeenCalledTimes(2);

    // Flipping the blend on is what proves the rebuild landed in `baseGraph`:
    // the merged half is the rebuilt graph, not the mount fetch's.
    fireEvent.click(screen.getByLabelText('Blend local-search'));
    await waitFor(() => expect(graphMock.load).toHaveBeenCalledTimes(3));
    const [shown] = graphMock.load.mock.calls[2];
    expect(shown.nodes.map((n) => n.id).sort()).toEqual(['c.go', 'x.ts']);

    // Three loads total: mount, upload, toggle. The rebuild itself contributed
    // none — the user was not looking at the half it replaced, and reloading
    // would have reset their filters and refit the viewport for nothing.
    expect(graphMock.load).toHaveBeenCalledTimes(3);
  });

  it('does not flash the empty-graph notice before the mount fetch resolves', async () => {
    let resolveGraph;
    const pending = new Promise((res) => { resolveGraph = res; });
    global.fetch = vi.fn((url) => {
      if (String(url).startsWith('/api/graph')) {
        return Promise.resolve({ ok: true, json: () => pending });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    render(<GraphExplorer />);
    // First paint, fetch still in flight: no notice, and nothing pushed to the
    // canvas — an empty load here would clear it and then immediately refill.
    expect(document.querySelector('#graph-empty-notice')).toBe(null);
    expect(graphMock.load).not.toHaveBeenCalled();

    resolveGraph(fixtureGraph);
    await waitFor(() => expect(graphMock.load).toHaveBeenCalledTimes(1));
    expect(document.querySelector('#graph-empty-notice')).toBe(null);
  });
});

describe('serializable and dimensionally consistent derived graph', () => {
  // What the force layout does to whatever it is handed: `link.source` stops
  // being an id and becomes the node object itself. If the derive step handed
  // over the upload's own graph, that mutation lands in the payload that has to
  // survive a reload as JSON.
  function runLayout(graph) {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    graph.links.forEach((l) => {
      l.source = byId.get(l.source) || l.source;
      l.target = byId.get(l.target) || l.target;
      l.__controlPoints = null;
    });
    graph.nodes.forEach((n) => { n.x = 1; n.y = 2; });
  }

  const linkedUpload = {
    nodes: [
      { id: 'x.ts', name: 'x.ts', type: 'file', repo: 'ext', project: 'lib', tags: [] },
      { id: 'z.ts', name: 'z.ts', type: 'file', repo: 'ext', project: 'lib', tags: [] },
    ],
    links: [{ source: 'x.ts', target: 'z.ts', family: 'declared' }],
  };

  it('keeps the stored upload payload out of the layout reach', async () => {
    const { container, graphLoad } = await renderExplorer();
    await uploadFile(container, { graph: linkedUpload });
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2));

    // What the canvas got is what the layout owns. Mark it and mutate it the way
    // the layout does.
    const rendered = graphLoad.mock.calls[1][0];
    rendered.nodes[0].__layoutOnly = true;
    runLayout(rendered);

    // Blending re-derives from the stored upload, so the stored upload is what
    // shows here: no layout marker, endpoints still ids, still JSON.
    fireEvent.click(screen.getByLabelText('Blend local-search'));
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(3));

    const [merged] = graphLoad.mock.calls[2];
    expect(merged.nodes.some((n) => n.__layoutOnly)).toBe(false);
    expect(merged.links.every((l) => typeof l.source === 'string')).toBe(true);
    expect(() => JSON.stringify(merged)).not.toThrow();
  });

  it('normalizes node val across origins in a blend', async () => {
    // The fixture assigns no `val` at all; the upload counts in the thousands.
    const bigVals = {
      nodes: [
        { id: 'x.ts', name: 'x.ts', type: 'file', repo: 'ext', project: 'lib', tags: [], val: 1000 },
        { id: 'z.ts', name: 'z.ts', type: 'file', repo: 'ext', project: 'lib', tags: [], val: 200 },
      ],
      links: [],
    };
    const { container, graphLoad } = await renderExplorer();
    await uploadFile(container, { graph: bigVals });
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByLabelText('Blend local-search'));
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(3));

    const [shown] = graphLoad.mock.calls[2];
    const vals = shown.nodes.map((n) => n.val);
    expect(Math.max(...vals)).toBeLessThanOrEqual(12);
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(4);
    // Neither origin is systematically the bigger one. The upload has a spread
    // and keeps its ranking, rescaled; the fixture assigns no `val` at all, so
    // it cannot be ranked and sits mid-range rather than uniformly at the floor.
    const byOrigin = (o) => shown.nodes.filter((n) => n.__origin === o).map((n) => n.val);
    expect(byOrigin('external.json').sort((a, b) => a - b)).toEqual([4, 12]);
    expect(byOrigin('local-search')).toEqual([8, 8]);
  });

  it('opens a blend on the union of each origin default families', async () => {
    // Base has declared links, the upload has only similarity ones. Deriving the
    // default from the merged links picks declared+dangling and filters the
    // whole upload off the canvas.
    const similarityOnly = {
      nodes: [
        { id: 'x.ts', name: 'x.ts', type: 'file', repo: 'ext', project: 'lib', tags: [] },
        { id: 'z.ts', name: 'z.ts', type: 'file', repo: 'ext', project: 'lib', tags: [] },
      ],
      links: [{ source: 'x.ts', target: 'z.ts', family: 'similarity' }],
    };
    // `family` on an input link is ignored — `normalizeGraph` re-derives it, and
    // only a link carrying `relation` classifies as declared.
    const declaredBase = {
      nodes: fixtureGraph.nodes,
      links: [{ source: 'a.py', target: 'b.md', relation: 'imports' }],
    };
    const { container, graphLoad } = await renderExplorer({ graph: declaredBase });
    await uploadFile(container);
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByLabelText('Blend local-search'));
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(3));

    // A fresh upload while blended: this load resets the families.
    await uploadFile(container, { name: 'sim.json', graph: similarityOnly });
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(4));

    const [shown] = graphLoad.mock.calls[3];
    const fams = shown.links.map((l) => l.family).sort();
    expect(fams).toEqual(['declared', 'similarity']);
  });
});
