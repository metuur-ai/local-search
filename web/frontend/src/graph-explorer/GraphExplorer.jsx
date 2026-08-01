// Agent OS Graph — Knowledge Atlas. A Preact port of the former standalone
// graph-explorer.html: same UI/UX, but decomposed into components + pure data
// helpers + a hook that owns the force-graph canvas. Owns the page state
// (loaded graph, filters, selection, view toggles) and wires the pieces
// together; all heavy graph rendering lives in useForceGraph.

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { fetchGraph } from '../api.js';
import {
  colors, COLOR_NAMES,
  synthesizeGraphData, normalizeGraph, toGraph,
  applyFilters, collectFilterOptions,
  EDGE_FAMILY_ORDER, countEdgeFamilies, defaultFamilies,
  tagOrigin, mergeGraphs, copyGraph, normalizeValsByOrigin, detectIdCollisions,
} from './graphData.js';
import { useForceGraph } from './useForceGraph.js';
import { FilterDropdown } from './components/FilterDropdown.jsx';
import { LinkTypeFilter } from './components/LinkTypeFilter.jsx';
import { Inspector } from './components/Inspector.jsx';
import { Legend } from './components/Legend.jsx';
import { Dock } from './components/Dock.jsx';
import { HelpModal } from './components/HelpModal.jsx';
import { RefreshReposPanel } from './components/RefreshReposPanel.jsx';

const EMPTY_MULTI = () => ({
  type: new Set(), repo: new Set(), project: new Set(), tag: new Set(), origin: new Set(),
});

// One shared instance, so the derive can recognise "nothing has loaded yet" by
// identity and skip the load that would otherwise flash an empty canvas.
const EMPTY_GRAPH = { nodes: [], links: [] };

// Steady-state trigger labels + option-search placeholders per filter dimension.
const DIMS = [
  { key: 'type', emptyLabel: 'All Files Types', searchLabel: 'File Types' },
  { key: 'repo', emptyLabel: 'All Repos', searchLabel: 'Repos' },
  { key: 'project', emptyLabel: 'All Directories', searchLabel: 'Directories' },
  { key: 'tag', emptyLabel: 'All Tags', searchLabel: 'Tags' },
  { key: 'origin', emptyLabel: 'All Sources', searchLabel: 'Sources' },
];

export function GraphExplorer() {
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  // The two datasets are held independently and the graph on screen is derived
  // from them, so the blend toggle is a re-derivation rather than a reload: an
  // upload never overwrites the base graph, and turning blend off never has to
  // go back to the network to recover either half.
  const [baseGraph, setBaseGraph] = useState(EMPTY_GRAPH);
  const [upload, setUpload] = useState(null);
  const [blend, setBlend] = useState(false);
  const [collisionNotice, setCollisionNotice] = useState(null);

  const [originalData, setOriginalData] = useState({ nodes: [], links: [] });
  const [activeData, setActiveData] = useState({ nodes: [], links: [] });
  // `origin: []` from the start: the Source control reads `options.origin.length`
  // on the very first render, before any graph has resolved.
  const [options, setOptions] = useState({
    type: [], repo: [], project: [], tag: [], origin: [],
  });
  const [multiSelect, setMultiSelect] = useState(EMPTY_MULTI);
  const [families, setFamilies] = useState(() => new Set(EDGE_FAMILY_ORDER));
  const [search, setSearch] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [titleFilter, setTitleFilter] = useState('');

  const [selectedNode, setSelectedNode] = useState(null);
  const [physicsRunning, setPhysicsRunning] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showReset, setShowReset] = useState(false);
  const [emptyNotice, setEmptyNotice] = useState(false);

  const {
    load: graphLoad, zoomIn, zoomOut, fit, togglePhysics,
    setShowLabels: graphSetShowLabels, deselect, selectById, getConnections,
  } = useForceGraph({
    containerRef,
    onSelectNode: setSelectedNode,
    onPhysicsChange: setPhysicsRunning,
  });

  // The filter effect must not re-run right after a fresh dataset is loaded
  // (which resets all filters) — that would clobber the one-time zoom-to-fit
  // with a reheat. This flag skips exactly those runs.
  const skipFilterRef = useRef(true);

  // Load a graph into the view. A dataset change (the default) resets
  // filters/selection and re-arms the zoom-to-fit; a blend toggle passes
  // `resetFilters: false, refit: false` because it is an A/B comparison of the
  // narrowing the user just built, not a new dataset. `families` overrides the
  // opening edge-family pick, which is otherwise derived from the graph.
  const loadNewData = useCallback((g, {
    resetFilters = true, refit = true, families: familiesOpt = null,
  } = {}) => {
    skipFilterRef.current = true;
    setOriginalData(g);
    const opts = collectFilterOptions(g.nodes);
    setOptions(opts);
    setEmptyNotice(g.nodes.length === 0);

    // Open on declared structure when the graph has any — that is what the view
    // is for, and similarity links outnumber declared ones by ~8:1.
    const fams = familiesOpt || (resetFilters ? defaultFamilies(g.links) : families);
    setFamilies(fams);

    // A preserved selection is intersected against the rebuilt option lists.
    // Blending off drops a whole dataset, and a value from the half that left is
    // no longer selectable — kept, it would silently filter the remaining graph
    // by something the dropdowns no longer offer and the user cannot undo.
    const carried = resetFilters ? EMPTY_MULTI() : Object.fromEntries(
      Object.entries(multiSelect).map(([dim, sel]) => {
        const offered = new Set(opts[dim] || []);
        return [dim, new Set([...sel].filter((v) => offered.has(v)))];
      }),
    );

    const next = resetFilters
      ? { search: '', name: '', title: '', multiSelect: carried }
      : { search, name: nameFilter, title: titleFilter, multiSelect: carried };
    setMultiSelect(carried);
    if (resetFilters) {
      setSearch(''); setNameFilter(''); setTitleFilter('');
      setSelectedNode(null);
    }

    const shown = applyFilters(g, { ...next, families: fams });
    setActiveData(shown);
    graphLoad(shown, { refit });
  }, [graphLoad, families, search, nameFilter, titleFilter, multiSelect]);

  // Initial load: flat array (hub graph) OR {nodes,links} (graph export).
  // Tagged at the load site, before anything can merge it, so a later blend can
  // still tell which half of the canvas came from local-search.
  useEffect(() => {
    let active = true;
    fetchGraph()
      .then((data) => { if (active) setBaseGraph(tagOrigin(toGraph(data), 'local-search')); })
      .catch(() => { /* Upload a file or refresh from repos to start. */ });
    return () => { active = false; };
  }, []);

  // What is on screen, derived from the two sources plus the toggle.
  // Always a copy: the force layout replaces `link.source` with the node object
  // in whatever it is handed, so handing over a source graph itself would make
  // the state that has to persist as JSON circular.
  // Each copy is memoized on its own source, so a change to the half that is not
  // on screen does not hand the canvas a new identity and force a reload.
  // The empty sentinel is passed through by identity, not copied: the derive
  // effect recognises "nothing loaded yet" by comparing against it.
  const baseCopy = useMemo(
    () => (baseGraph === EMPTY_GRAPH ? EMPTY_GRAPH : copyGraph(baseGraph)), [baseGraph],
  );
  const uploadCopy = useMemo(() => (upload ? copyGraph(upload.graph) : null), [upload]);

  // Collisions are checked here, at derive time, rather than at each of the
  // three events that can produce a blend (upload while blended, toggling on, a
  // baseGraph replacement while blended). All three land on this memo, so one
  // check covers them with identical handling and none can be forgotten.
  const collisions = useMemo(
    () => (upload && blend ? detectIdCollisions(baseGraph, upload.graph) : 0),
    [baseGraph, upload, blend],
  );

  const displayGraph = useMemo(() => {
    if (!upload) return baseCopy;
    // A refused blend falls back to the upload alone rather than to nothing:
    // the file the user just picked is still worth looking at.
    if (!blend || collisions > 0) return uploadCopy;
    // Sizes only comparable once both halves are on one scale.
    return normalizeValsByOrigin(mergeGraphs(baseGraph, upload.graph));
  }, [baseGraph, upload, blend, collisions, baseCopy, uploadCopy]);

  // Refuse the blend and say why. `blend` reverts, which zeroes `collisions` on
  // the next pass — so the notice is set only on the way up and is cleared by
  // the upload being replaced or reset, not by the revert.
  useEffect(() => {
    if (collisions === 0) return;
    setBlend(false);
    setCollisionNotice(
      `Blend refused: ${collisions} node id${collisions === 1 ? '' : 's'} `
      + 'appear in both graphs. Showing the upload on its own.',
    );
  }, [collisions]);

  // Push the derived graph to the canvas whenever it is a different graph than
  // the one already loaded. Identity, not the inputs: a source can change
  // without changing what the user is looking at, and reloading then would reset
  // filters and refit the viewport for no visible reason. It also covers the
  // first render, where `baseGraph` is still the shared empty value.
  // A flip of the toggle is the one input change that must not reset filters or
  // refit, so the effect tracks which input moved rather than only the result.
  const loadedRef = useRef(EMPTY_GRAPH);
  const blendRef = useRef(blend);
  useEffect(() => {
    const blendToggled = blendRef.current !== blend;
    blendRef.current = blend;
    if (displayGraph === loadedRef.current) return;
    loadedRef.current = displayGraph;
    if (blendToggled) { loadNewData(displayGraph, { resetFilters: false, refit: false }); return; }
    // A blend opens on the union of what each half would have opened on. Derived
    // from the merged links instead, an origin whose links are all similarity is
    // filtered off the canvas entirely by the other origin's declared ones.
    // An origin with no links at all is skipped: `defaultFamilies([])` opens on
    // everything, which would drag the whole union open on its behalf.
    const halves = [baseGraph, upload && upload.graph]
      .filter((g) => g && (g.links || []).length);
    const families = upload && blend && halves.length
      ? new Set(halves.flatMap((g) => [...defaultFamilies(g.links)]))
      : null;
    loadNewData(displayGraph, { families });
  }, [displayGraph, blend, baseGraph, upload, loadNewData]);

  // Re-filter (debounced, matching the original 300ms) whenever a filter changes.
  useEffect(() => {
    if (skipFilterRef.current) { skipFilterRef.current = false; return undefined; }
    const t = setTimeout(() => {
      const filtered = applyFilters(originalData, {
        search, name: nameFilter, title: titleFilter, multiSelect, families,
      });
      setActiveData(filtered);
      graphLoad(filtered, { reheat: true });
    }, 300);
    return () => clearTimeout(t);
  }, [search, nameFilter, titleFilter, multiSelect, families, originalData, graphLoad]);

  const toggleFilter = useCallback((dim, value, isChecked) => {
    setMultiSelect((prev) => {
      const next = new Set(prev[dim]);
      if (isChecked) next.add(value);
      else next.delete(value);
      return { ...prev, [dim]: next };
    });
  }, []);

  const clearAllFilters = useCallback(() => setMultiSelect(EMPTY_MULTI()), []);

  const onToggleLabels = useCallback((e) => {
    const val = e.currentTarget.checked;
    setShowLabels(val);
    graphSetShowLabels(val);
  }, [graphSetShowLabels]);

  const onUpload = useCallback((e) => {
    const file = e.currentTarget.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const json = JSON.parse(text);
        let g;
        if (Array.isArray(json)) g = synthesizeGraphData(json);
        else if (json.nodes && (json.edges || json.links)) g = normalizeGraph(json);
        else throw new Error('Format must be flat array or {nodes, links}');
        // The raw text is kept alongside the parsed graph: it is the one form of
        // the upload that stays JSON-serializable no matter what the force layout
        // does to the objects it is handed.
        setUpload({ filename: file.name, text, graph: tagOrigin(g, file.name) });
        // A new file is a new question about collisions; the old verdict goes.
        setCollisionNotice(null);
        setShowReset(true);
      } catch (err) {
        alert('Error parsing JSON: ' + err.message);
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  }, []);

  const onReset = useCallback(() => {
    setUpload(null);
    setBlend(false);
    setCollisionNotice(null);
    fetchGraph()
      .then((data) => setBaseGraph(tagOrigin(toGraph(data), 'local-search')))
      .catch(() => setBaseGraph(tagOrigin(synthesizeGraphData([]), 'local-search')));
    setShowReset(false);
  }, []);

  const onRebuilt = useCallback((g) => {
    setBaseGraph(tagOrigin(g, 'local-search'));
    setShowReset(true);
  }, []);

  // Stats readout, derived from the active (filtered) graph.
  const stats = useMemo(() => ({
    nodes: activeData.nodes.length,
    edges: activeData.links.length,
    projects: activeData.nodes.filter((n) => n.type === 'project').length,
    tags: activeData.nodes.filter((n) => n.type === 'tag').length,
  }), [activeData]);

  // Legend groups, rebuilt from whatever render colors are on screen.
  const legendGroups = useMemo(() => {
    const groups = new Map();
    activeData.nodes.forEach((n) => {
      const c = n.renderColor || colors[n.type] || colors.file;
      groups.set(c, (groups.get(c) || 0) + 1);
    });
    return [...groups.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([color, count]) => ({ color, name: COLOR_NAMES[color] || 'Nodes', count }));
  }, [activeData]);

  // Edge-family counts over the WHOLE graph, so the toggles show what is
  // available rather than what survived the current filter.
  const familyCounts = useMemo(
    () => countEdgeFamilies(originalData.links),
    [originalData],
  );

  const toggleFamily = useCallback((fam) => {
    setFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(fam)) next.delete(fam);
      else next.add(fam);
      // Never allow an empty selection — that renders an empty canvas with no
      // affordance explaining why.
      return next.size === 0 ? new Set(EDGE_FAMILY_ORDER) : next;
    });
  }, []);

  // Active-filter chips across every dimension.
  const activeChips = useMemo(() => {
    const chips = [];
    ['type', 'repo', 'project', 'tag'].forEach((dim) => {
      multiSelect[dim].forEach((val) => chips.push({ dim, val }));
    });
    return chips;
  }, [multiSelect]);

  // Close any open filter dropdown on an outside click (single-open model).
  useEffect(() => {
    const onDoc = (e) => {
      if (!e.target.closest('[data-dd]')) setOpenDropdown(null);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  return (
    <>
      {/* TOPBAR */}
      <div class="topbar">
        <div class="row row-1">
          {/* brand */}
          <div class="brand">
            <div class="brand-mark">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
                <path d="M12 12 L5 6 M12 12 L19 7 M12 12 L6.5 18 M12 12 L18 17" opacity="0.6" />
                <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
                <circle cx="5" cy="6" r="1.7" fill="currentColor" stroke="none" />
                <circle cx="19" cy="7" r="1.7" fill="currentColor" stroke="none" />
                <circle cx="6.5" cy="18" r="1.7" fill="currentColor" stroke="none" />
                <circle cx="18" cy="17" r="1.7" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div>
              <h1>Agent OS Graph</h1>
              <p>Knowledge Atlas</p>
            </div>
            <a class="brand-nav-link" href="/">← local-search</a>
          </div>

          {/* search + switch */}
          <div class="center">
            <div class="search">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                type="text"
                placeholder="Search files, tags, or projects…"
                value={search}
                onInput={(e) => setSearch(e.currentTarget.value)}
              />
            </div>
            <label class="switch">
              <input type="checkbox" checked={showLabels} onChange={onToggleLabels} />
              <span class="track" />
              All labels
            </label>
          </div>

          {/* actions */}
          <div class="actions">
            <input type="file" ref={fileInputRef} accept=".json" class="hidden" onChange={onUpload} />
            <button type="button" class="btn" onClick={() => fileInputRef.current?.click()}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Upload JSON
            </button>
            {upload && (
              <label class="switch">
                <input
                  type="checkbox"
                  checked={blend}
                  onChange={(e) => setBlend(e.currentTarget.checked)}
                />
                <span class="track" />
                Blend local-search
              </label>
            )}
            {showReset && (
              <button type="button" class="btn btn-primary" onClick={onReset}>Reset</button>
            )}
            <RefreshReposPanel onRebuilt={onRebuilt} />
            <button type="button" class="help-btn" title="How to use this page" aria-label="Help" onClick={() => setShowHelp(true)}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
          </div>
        </div>

        {/* filters + stats */}
        <div class="row row-2">
          <div class="filters">
            <span class="filters-label">Filters</span>
            {DIMS.map(({ key, emptyLabel, searchLabel }) => (
              <FilterDropdown
                key={key}
                emptyLabel={emptyLabel}
                searchLabel={searchLabel}
                options={options[key]}
                selected={multiSelect[key]}
                onToggle={(value, isChecked) => toggleFilter(key, value, isChecked)}
                open={openDropdown === key}
                onOpenChange={(next) => setOpenDropdown(next ? key : null)}
              />
            ))}
            <input
              type="text"
              class="field"
              placeholder="Name contains…"
              value={nameFilter}
              onInput={(e) => setNameFilter(e.currentTarget.value)}
            />
            <input
              type="text"
              class="field"
              placeholder="Title contains…"
              value={titleFilter}
              onInput={(e) => setTitleFilter(e.currentTarget.value)}
            />
            <span class="filters-sep" />
            <LinkTypeFilter
              families={families}
              counts={familyCounts}
              onToggle={toggleFamily}
            />
          </div>

          <div class="stats">
            <div class="stat"><span class="stat-value v-nodes">{stats.nodes.toLocaleString()}</span><span class="stat-label">Nodes</span></div>
            <div class="stat"><span class="stat-value v-edges">{stats.edges.toLocaleString()}</span><span class="stat-label">Links</span></div>
            <div class="stat"><span class="stat-value v-projects">{stats.projects.toLocaleString()}</span><span class="stat-label">Projects</span></div>
            <div class="stat"><span class="stat-value v-tags">{stats.tags.toLocaleString()}</span><span class="stat-label">Tags</span></div>
          </div>
        </div>

        {/* active filter chips */}
        {activeChips.length > 0 && (
          <div class="row row-3">
            <span class="filters-label">Active</span>
            <div class="active-chips">
              {activeChips.map(({ dim, val }) => (
                <span class="active-chip" key={`${dim}:${val}`} title={`${dim}: ${val}`}>
                  <span class="chip-key">{dim}</span>
                  <span class="chip-val">{val}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${dim} filter ${val}`}
                    onClick={() => toggleFilter(dim, val, false)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <button type="button" class="chip-clear-all" onClick={clearAllFilters}>Clear all</button>
          </div>
        )}
      </div>

      {/* GRAPH */}
      <div id="graph-wrapper">
        <div id="graph-container" ref={containerRef} />
        <div class="graph-vignette" />

        <Legend groups={legendGroups} />

        <Dock
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFit={fit}
          physicsRunning={physicsRunning}
          onTogglePhysics={togglePhysics}
        />

        {selectedNode && (
          <Inspector
            node={selectedNode}
            getConnections={getConnections}
            onSelectId={selectById}
            onClose={deselect}
          />
        )}

        {collisionNotice && (
          <div id="graph-collision-notice" role="status">{collisionNotice}</div>
        )}

        {emptyNotice && (
          <div id="graph-empty-notice">
            No cached graph yet. Click <b>Refresh from repos</b> to build one.
          </div>
        )}
      </div>

      {/* site footer */}
      <footer class="app-footer">
        <span class="app-footer-credit">
          © 2026 local-search · made by{' '}
          <a href="https://x.com/javierhbr" target="_blank" rel="noopener noreferrer">@javierhbr</a>
        </span>
        <span class="app-footer-links">
          <a href="https://github.com/javierhbr" target="_blank" rel="noopener noreferrer" title="GitHub" aria-label="GitHub">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.28-.01-1.02-.02-2-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.39 1.24-3.23-.13-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.29-1.23 3.29-1.23.66 1.65.25 2.88.12 3.18.77.84 1.24 1.92 1.24 3.23 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22 0 1.6-.01 2.9-.01 3.29 0 .32.21.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" /></svg>
          </a>
          <a href="https://x.com/javierhbr" target="_blank" rel="noopener noreferrer" title="X" aria-label="X">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.714 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" /></svg>
          </a>
          <a class="app-footer-coffee" href="https://www.buymeacoffee.com/javierhbr" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8z" /><path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17" /><path d="M7 2.5v2M10.5 2.5v2M14 2.5v2" /></svg>
            Buy me a coffee
          </a>
        </span>
      </footer>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}
