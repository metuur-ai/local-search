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
// eslint-disable-next-line import/first
import { UPLOAD_STORAGE_KEY, writeStoredUpload } from '../src/graph-explorer/uploadStorage.js';

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

// Shares `a.py` with `fixtureGraph`, so blending it against the base graph is
// exactly one id collision.
const collidingGraph = {
  nodes: [{ id: 'a.py', name: 'a.py', type: 'file', repo: 'ext', project: 'lib', tags: [] }],
  links: [],
};

describe('collision gate on every merge entry point', () => {
  it('refuses the blend when the toggle is turned on over a colliding upload', async () => {
    const { container, graphLoad } = await renderExplorer();

    await uploadFile(container, { name: 'clash.json', graph: collidingGraph });
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2));

    const toggle = screen.getByLabelText('Blend local-search');
    fireEvent.click(toggle);

    // The message names the count…
    await waitFor(() => expect(screen.getByText(/1 node id/)).toBeTruthy());
    // …`blend` is back to false…
    expect(toggle.checked).toBe(false);
    // …and nothing merged reached the canvas.
    const merged = graphLoad.mock.calls.find(
      ([g]) => g.nodes.some((n) => n.__origin === 'local-search')
        && g.nodes.some((n) => n.__origin === 'clash.json'),
    );
    expect(merged).toBeUndefined();
  });

  it('loads a colliding upload standalone when it arrives while blend is on', async () => {
    const { container, graphLoad } = await renderExplorer();

    // A clean upload first, so blend can legitimately be switched on.
    await uploadFile(container, { name: 'clean.json', graph: uploadGraph });
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2));
    const toggle = screen.getByLabelText('Blend local-search');
    fireEvent.click(toggle);
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(3));
    expect(toggle.checked).toBe(true);

    // Now a colliding one, uploaded while blend is true.
    await uploadFile(container, { name: 'clash.json', graph: collidingGraph });
    await waitFor(() => expect(screen.getByText(/1 node id/)).toBeTruthy());

    expect(toggle.checked).toBe(false);
    // R-4.4: the upload is not discarded — it is on screen, alone.
    const [shown] = graphLoad.mock.calls[graphLoad.mock.calls.length - 1];
    expect(shown.nodes.map((n) => n.id)).toEqual(['a.py']);
    expect(shown.nodes.every((n) => n.__origin === 'clash.json')).toBe(true);
  });

  it('clears the collision message when the upload is replaced', async () => {
    const { container, graphLoad } = await renderExplorer();

    await uploadFile(container, { name: 'clash.json', graph: collidingGraph });
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByLabelText('Blend local-search'));
    await waitFor(() => expect(screen.getByText(/1 node id/)).toBeTruthy());

    await uploadFile(container, { name: 'clean.json', graph: uploadGraph });
    await waitFor(() => expect(screen.queryByText(/node id/)).toBeNull());
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

describe('origin filter dimension', () => {
  // R-2.4: the Source control reads `options.origin.length` on the first render,
  // which happens before the mount fetch resolves. If the initial `options` state
  // omits `origin`, that read throws and the page never paints.
  it('renders before the first load resolves, with no graph in state yet', () => {
    // A fetch that never settles: the component only ever sees initial state.
    global.fetch = vi.fn(() => new Promise(() => {}));
    expect(() => render(<GraphExplorer />)).not.toThrow();
    expect(screen.getByText('Upload JSON')).toBeTruthy();
  });

  // R-2.7: the control appears exactly when there is a choice to make. One
  // origin — which is every single-dataset state, blended or not — is noise.
  it('hides the Source dropdown until more than one origin is on screen', async () => {
    const { container, graphLoad } = await renderExplorer();
    expect(screen.queryByText('All Sources')).toBeNull();

    // An upload displayed standalone is still one origin, so still no control.
    await uploadFile(container);
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('All Sources')).toBeNull();

    // Blended, both origins are on the canvas and the choice becomes real.
    fireEvent.click(screen.getByLabelText('Blend local-search'));
    await waitFor(() => expect(screen.getByText('All Sources')).toBeTruthy());
  });

  it('gives a Source selection a removable chip that "Clear all" also clears', async () => {
    const { container, graphLoad } = await renderExplorer();
    await uploadFile(container);
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByLabelText('Blend local-search'));
    await waitFor(() => expect(screen.getByText('All Sources')).toBeTruthy());

    fireEvent.click(screen.getByText('All Sources'));
    fireEvent.click(screen.getByLabelText('local-search'));

    // R-2.8: Source is chipped like every other dimension…
    await waitFor(() => expect(screen.getByTitle('origin: local-search')).toBeTruthy());
    // …and individually removable.
    fireEvent.click(screen.getByLabelText('Remove origin filter local-search'));
    await waitFor(() => expect(screen.queryByTitle('origin: local-search')).toBeNull());

    // R-2.9: and "Clear all" takes it out along with the other dimensions.
    fireEvent.click(screen.getByText('All Sources'));
    fireEvent.click(screen.getByLabelText('local-search'));
    await waitFor(() => expect(screen.getByTitle('origin: local-search')).toBeTruthy());
    fireEvent.click(screen.getByText('Clear all'));
    await waitFor(() => expect(screen.queryByTitle('origin: local-search')).toBeNull());
  });
});

describe('blend toggle control', () => {
  it('is absent until something has been uploaded', async () => {
    const { container } = await renderExplorer();
    // R-3.11: nothing to blend with, so no toggle.
    expect(screen.queryByLabelText('Blend local-search')).toBeNull();

    await uploadFile(container);
    // R-3.10: an upload exists, so the toggle names what blends in.
    await waitFor(() => expect(screen.getByLabelText('Blend local-search')).toBeTruthy());
  });

  it('drops a preserved selection whose value left the new option list', async () => {
    const { container, graphLoad } = await renderExplorer();
    await uploadFile(container);
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2));

    const toggle = screen.getByLabelText('Blend local-search');
    fireEvent.click(toggle);
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(3));

    // Blended, both repos are on offer. Select one from each half.
    fireEvent.click(screen.getByText('All Repos'));
    fireEvent.click(screen.getByLabelText('alpha'));
    fireEvent.click(screen.getByLabelText('ext'));
    await waitFor(() => expect(screen.getByTitle('repo: alpha')).toBeTruthy());
    expect(screen.getByTitle('repo: ext')).toBeTruthy();

    // Blend off: only the upload remains, so `alpha` is no longer an option.
    fireEvent.click(toggle);
    // R-3.8: the vanished value is dropped, the surviving one is preserved.
    await waitFor(() => expect(screen.queryByTitle('repo: alpha')).toBeNull());
    expect(screen.getByTitle('repo: ext')).toBeTruthy();
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

// ── Unit 5: session persistence ────────────────────────────────────────────
// The stored value is the raw uploaded text, never a re-serialization of live
// state: the force layout replaces `link.source` with the node object in the
// graph it is handed, so a re-stringify would persist layout mutations (and go
// circular). These assertions compare against the exact bytes uploaded.
describe('persisting the upload to sessionStorage', () => {
  const stored = () => JSON.parse(sessionStorage.getItem(UPLOAD_STORAGE_KEY));

  it('writes { filename, text, blend } under one namespaced key on upload', async () => {
    const { container, graphLoad } = await renderExplorer();
    expect(sessionStorage.getItem(UPLOAD_STORAGE_KEY)).toBeNull();

    await uploadFile(container);
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(sessionStorage.getItem(UPLOAD_STORAGE_KEY)).toBeTruthy());
    const entry = stored();
    expect(Object.keys(entry).sort()).toEqual(['blend', 'filename', 'text']);
    expect(entry.filename).toBe('external.json');
    expect(entry.blend).toBe(false);
    // Byte-for-byte the uploaded text, not a re-serialization of the parsed,
    // tagged, force-mutated graph.
    expect(entry.text).toBe(JSON.stringify(uploadGraph));
  });

  it('rewrites the entry when the blend flag is toggled', async () => {
    const { container, graphLoad } = await renderExplorer();
    await uploadFile(container);
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(stored().blend).toBe(false));

    fireEvent.click(screen.getByLabelText('Blend local-search'));
    await waitFor(() => expect(stored().blend).toBe(true));
    // Still the raw text — a toggle must not re-serialize the live graph.
    expect(stored().text).toBe(JSON.stringify(uploadGraph));
  });

  it('reports an over-budget file at upload time instead of writing it', async () => {
    const { container, graphLoad } = await renderExplorer();

    // Quota is counted in UTF-16 code units (~2 bytes per character), so a
    // ~3M-character document is already past a typical 5 MB ceiling.
    const huge = {
      nodes: [{ id: 'big.ts', name: 'x'.repeat(3_000_000), type: 'file', repo: 'ext', project: 'lib', tags: [] }],
      links: [],
    };
    await uploadFile(container, { name: 'huge.json', graph: huge });
    await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2));

    // Said so, once, at upload time…
    expect(await screen.findByText(/too large to survive a reload/i)).toBeTruthy();
    // …skipped the write rather than letting it throw…
    expect(sessionStorage.getItem(UPLOAD_STORAGE_KEY)).toBeNull();
    // …and the upload itself still went through.
    const [shown] = graphLoad.mock.calls[1];
    expect(shown.nodes.map((n) => n.id)).toEqual(['big.ts']);
  });

  // R-5.6. Asserted on the helper rather than through the component: a throw
  // inside the persist effect is swallowed by preact's async hook runner, so a
  // component-level test cannot tell a guarded write from an unguarded one.
  it('swallows a throwing write so the upload survives in memory', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    try {
      expect(() => writeStoredUpload({ filename: 'f.json', text: '{}', blend: false }))
        .not.toThrow();
    } finally {
      setItem.mockRestore();
    }

    // …and the upload still reaches the canvas with storage unavailable.
    const { container, graphLoad } = await renderExplorer();
    const setItem2 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    try {
      await uploadFile(container);
      await waitFor(() => expect(graphLoad).toHaveBeenCalledTimes(2));
      expect(graphLoad.mock.calls[1][0].nodes.map((n) => n.id)).toEqual(['x.ts']);
      // Not the oversize path — this file fits; the write simply failed.
      expect(screen.queryByText(/too large to survive a reload/i)).toBeNull();
    } finally {
      setItem2.mockRestore();
    }
  });
});

describe('restoring the upload from sessionStorage on mount', () => {
  // A fetch stub whose /api/graph promise is held open until the test releases
  // it, so "restored before the initial fetch resolves" can be asserted as an
  // ordering fact rather than inferred from the end state.
  function stubDeferredFetch(graph = fixtureGraph) {
    let release;
    const pending = new Promise((resolve) => { release = () => resolve(graph); });
    global.fetch = vi.fn((url) => {
      if (String(url).startsWith('/api/graph')) {
        return Promise.resolve({ ok: true, json: () => pending });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
    return () => release();
  }

  it('puts the stored upload on the canvas before /api/graph resolves', async () => {
    writeStoredUpload({
      filename: 'restored.json', text: JSON.stringify(uploadGraph), blend: false,
    });
    const releaseFetch = stubDeferredFetch();

    render(<GraphExplorer />);

    // First thing the canvas ever sees is the restored upload — no flash of the
    // local-search graph, which has not even resolved yet.
    await waitFor(() => expect(forceGraph.load).toHaveBeenCalledTimes(1));
    const [shown] = forceGraph.load.mock.calls[0];
    expect(shown.nodes.map((n) => n.id)).toEqual(['x.ts']);
    // Re-parsed from the stored text through the upload path: origin-tagged with
    // the stored filename.
    expect(shown.nodes.every((n) => n.__origin === 'restored.json')).toBe(true);
    // The escape hatch survives the reload too.
    expect(screen.getByText('Reset')).toBeTruthy();

    // The base graph landing afterwards fills baseGraph without displacing the
    // restored upload — the canvas is not reloaded at all…
    releaseFetch();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(forceGraph.load).toHaveBeenCalledTimes(1);
    // …yet blending now finds both halves, which is only possible if the fetch
    // populated baseGraph behind the restored upload.
    fireEvent.click(screen.getByLabelText('Blend local-search'));
    await waitFor(() => expect(forceGraph.load).toHaveBeenCalledTimes(2));
    expect(forceGraph.load.mock.calls[1][0].nodes.map((n) => n.id).sort())
      .toEqual(['a.py', 'b.md', 'x.ts']);
  });

  it('honours a stored blend flag once the base graph arrives', async () => {
    writeStoredUpload({
      filename: 'restored.json', text: JSON.stringify(uploadGraph), blend: true,
    });
    stubFetch();

    render(<GraphExplorer />);

    await waitFor(() => {
      const calls = forceGraph.load.mock.calls;
      expect(calls[calls.length - 1][0].nodes.length).toBe(3);
    });
    const last = forceGraph.load.mock.calls[forceGraph.load.mock.calls.length - 1][0];
    expect(last.nodes.map((n) => n.id).sort()).toEqual(['a.py', 'b.md', 'x.ts']);
    expect(screen.getByLabelText('Blend local-search').checked).toBe(true);
  });

  it('falls back to no upload when the stored value is malformed', async () => {
    // Well-formed envelope, unparseable payload — the failure the restore path
    // owns, as opposed to a missing key.
    sessionStorage.setItem(
      UPLOAD_STORAGE_KEY,
      JSON.stringify({ filename: 'broken.json', text: '{not json', blend: true }),
    );
    const { graphLoad } = await renderExplorer();

    // Exactly today's page: the fetched graph, blend off, no upload.
    expect(graphLoad).toHaveBeenCalledTimes(1);
    expect(graphLoad.mock.calls[0][0].nodes.map((n) => n.id)).toEqual(['a.py', 'b.md']);
    expect(screen.queryByLabelText('Blend local-search')).toBeNull();
  });
});
