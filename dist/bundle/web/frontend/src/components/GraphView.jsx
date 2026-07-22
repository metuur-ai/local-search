// Knowledge-graph visualization (stories 4.1–4.4). Renders the NetworkX
// node-link `graph` event with Cytoscape.js. Pure element-building lives in
// graphElements.js; this component owns the Cytoscape lifecycle.

import { useEffect, useRef, useState } from 'preact/hooks';
import cytoscape from 'cytoscape';
import { buildElements } from './graphElements.js';
import './GraphView.css';

// Exported so tests can assert the stylesheet directly without a full mount
// (R-4.3 / R-4.4). Node size is driven by `relevance`, color by `tag`, source
// nodes get a distinct mark, and the edge label stays lexically honest.
export const GRAPH_STYLE = [
  {
    selector: 'node',
    style: {
      width: 'mapData(relevance, 0, 1, 12, 48)',
      height: 'mapData(relevance, 0, 1, 12, 48)',
      // Unlabeled by default: a dense `json related` graph has ~150 nodes, and
      // labeling them all turns the map into an unreadable wall of text. Only
      // the meaningful nodes (retrieved sources + the query) carry a label
      // below; the rest reveal theirs on hover (see the [hover] rule).
      label: '',
      'background-color': '#94a3b8',
      'font-family': 'Fira Code, monospace',
      'font-size': 9,
      color: '#0f172a',
      // Sit the label below the node (not over it) and truncate long titles so
      // neighboring labels stop stacking on top of one another.
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 4,
      'text-wrap': 'ellipsis',
      // Shorter cap so neighboring labels stop stacking into one another; a
      // readable white pill keeps the text legible where it sits over an edge.
      'text-max-width': 90,
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.85,
      'text-background-padding': 2,
      'text-outline-width': 1,
      'text-outline-color': '#ffffff',
      // Hide labels once the graph is zoomed out far enough that they would
      // collide — they reappear as the user zooms in. Raised so labels only
      // show when the user has zoomed in close enough to read them.
      'min-zoomed-font-size': 14,
    },
  },
  // Retrieved sources are the nodes worth naming — keep their labels on. This
  // is the default "Sources" label mode: only retrieved-source (and the query
  // node below) carry a label; everything else stays clean.
  {
    selector: 'node[?isSource]',
    style: { label: 'data(label)' },
  },
  // "All" label mode: force every node's label on, ignoring the zoom-out hide
  // threshold.
  {
    selector: 'node.show-label',
    style: { label: 'data(label)', 'min-zoomed-font-size': 0 },
  },
  {
    // The synthesized center node ("your query") in the sources-fallback graph.
    selector: 'node[tag = "query"]',
    style: {
      label: 'data(label)',
      'background-color': '#8b5cf6',
      'border-width': 2,
      'border-color': '#7c3aed',
      'font-weight': 'bold',
    },
  },
  { selector: 'node[tag = "code"]', style: { 'background-color': '#2563eb' } },
  { selector: 'node[tag = "doc"]', style: { 'background-color': '#16a34a' } },
  { selector: 'node[tag = "test"]', style: { 'background-color': '#dc2626' } },
  {
    selector: '[isSource]',
    style: {
      'border-width': 3,
      'border-color': '#16a34a',
    },
  },
  // "None" label mode: blank every node's label for an uncluttered structural
  // view. Placed AFTER the isSource / query / show-label label rules so it wins
  // (cytoscape resolves same-property conflicts by last-matching-rule). The
  // `.hover` rule below still comes after this, so hovering a node reveals its
  // label even while None is active.
  {
    selector: 'node.no-label',
    style: { label: '' },
  },
  // Reveal any node's label while hovered, so unlabeled nodes stay inspectable
  // in every label mode (including None).
  {
    selector: 'node.hover',
    style: { label: 'data(label)', 'min-zoomed-font-size': 0, 'z-index': 9999 },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      width: 'mapData(weight, 0, 1, 1, 5)',
      'line-color': '#cbd5e1',
      // No static edge label: repeating "lexical similarity (cosine)" on every
      // spoke buried the center of the map. The relationship is explained in
      // the pane intro instead; the label surfaces on hover (see edge.hover).
      label: '',
      'font-family': 'Fira Code, monospace',
      'font-size': 6,
      color: '#94a3b8',
    },
  },
  {
    selector: 'edge.hover',
    style: { label: 'lexical similarity (cosine)', 'line-color': '#94a3b8' },
  },
];

// Label modes for the segmented control:
//  - 'sources': only retrieved-source + query nodes are labeled (default).
//  - 'all':     every node is labeled (adds `.show-label`).
//  - 'none':    every label is hidden (adds `.no-label`) for a structural view.
//
// Apply a label mode to a live cytoscape instance by toggling the marker
// classes the GRAPH_STYLE label rules key off of. Kept as a helper so the fresh
// build and the toggle effect stay in sync.
function applyLabelMode(cy, mode) {
  cy.batch(() => {
    const nodes = cy.nodes();
    nodes.removeClass('show-label no-label');
    if (mode === 'all') nodes.addClass('show-label');
    else if (mode === 'none') nodes.addClass('no-label');
  });
}

export function GraphView({ graph, sources }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [labelMode, setLabelMode] = useState('sources');

  const hasNodes = !!(graph && Array.isArray(graph.nodes) && graph.nodes.length > 0);

  useEffect(() => {
    if (!hasNodes || !containerRef.current) return;

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: buildElements(graph, sources),
      headless: false,
      style: GRAPH_STYLE,
      // Without an explicit layout Cytoscape falls back to `preset`, which
      // drops every node at (0,0) — the pile-up in the top-left corner. `cose`
      // spreads the star (fallback) and arbitrary `json related` graphs alike.
      layout: {
        name: 'cose',
        padding: 30,
        fit: true,
        animate: false,
        // A dense `json related` graph (~150 nodes) piles up unless we push the
        // nodes hard apart: strong repulsion + a long ideal edge length + wide
        // component spacing spread the star and the arbitrary graph alike, low
        // gravity stops everything being sucked back into a central ball, and a
        // high iteration count lets the layout actually settle. Labels are
        // excluded from node dimensions so label width doesn't distort spacing.
        nodeRepulsion: 20000,
        idealEdgeLength: 120,
        componentSpacing: 120,
        nodeOverlap: 20,
        gravity: 0.2,
        numIter: 1500,
        nodeDimensionsIncludeLabels: false,
      },
    });

    // Re-fit once the container has its final size (the tab may mount hidden,
    // so the first layout can run against a zero-width box).
    cyRef.current.ready(() => cyRef.current && cyRef.current.fit(undefined, 30));

    // Hover reveals the label of an otherwise-unlabeled node and the
    // relationship on an edge (see the `.hover` style rules).
    const cy = cyRef.current;
    cy.on('mouseover', 'node, edge', (e) => e.target.addClass('hover'));
    cy.on('mouseout', 'node, edge', (e) => e.target.removeClass('hover'));

    // Apply the current label mode to freshly-built nodes (the graph may be
    // rebuilt while the user is in "All"/"None").
    applyLabelMode(cy, labelMode);

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
    // labelMode is intentionally omitted: the dedicated effect below re-applies
    // it on change, and re-listing it here would needlessly rebuild the graph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, sources, hasNodes]);

  // Re-apply the label mode when the segmented control changes.
  useEffect(() => {
    if (!cyRef.current) return;
    applyLabelMode(cyRef.current, labelMode);
  }, [labelMode]);

  // The container changes size when entering/leaving fullscreen; Cytoscape needs
  // an explicit resize + re-fit or it keeps rendering against the old box.
  useEffect(() => {
    if (!cyRef.current) return;
    // Defer to the next frame so the CSS class has applied its new dimensions.
    const id = requestAnimationFrame(() => {
      if (!cyRef.current) return;
      cyRef.current.resize();
      cyRef.current.fit(undefined, 30);
    });
    return () => cancelAnimationFrame(id);
  }, [isFullscreen]);

  // Escape leaves fullscreen — matches the usual native-fullscreen affordance.
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  // Zoom controls — step the zoom around the viewport center so the graph
  // grows/shrinks in place rather than drifting toward a corner.
  const zoomBy = (factor) => {
    const cy = cyRef.current;
    if (!cy) return;
    const center = { x: cy.width() / 2, y: cy.height() / 2 };
    cy.animate({ zoom: { level: cy.zoom() * factor, renderedPosition: center }, duration: 150 });
  };
  const zoomIn = () => zoomBy(1.3);
  const zoomOut = () => zoomBy(1 / 1.3);
  // Reset/Fit: frame the whole graph again with a little padding, then recenter.
  const fitView = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.fit(undefined, 30);
    cy.center();
  };

  if (!hasNodes) {
    return (
      <div class="graph-view" data-testid="graph-view">
        <p class="graph-empty" data-testid="graph-empty">
          No graph to display yet.
        </p>
      </div>
    );
  }

  return (
    <div
      class={`graph-view${isFullscreen ? ' graph-view--fullscreen' : ''}`}
      data-testid="graph-view"
    >
      <div class="graph-toolbar">
        {/* Label-mode cluster: a segmented Sources / All / None control. Each
            button sets one mode; the active one is highlighted. `graph-labels-btn`
            is preserved (it selects "All", the old "File names" behavior). */}
        <div class="graph-tool-group" role="group" aria-label="Node labels">
          <button
            type="button"
            class={`graph-tool-btn${labelMode === 'sources' ? ' is-active' : ''}`}
            data-testid="graph-labels-sources-btn"
            aria-pressed={labelMode === 'sources'}
            onClick={() => setLabelMode('sources')}
            title="Label only retrieved sources and the query"
          >
            <i class="fa-solid fa-tag" />
            <span>Sources</span>
          </button>
          <button
            type="button"
            class={`graph-tool-btn${labelMode === 'all' ? ' is-active' : ''}`}
            data-testid="graph-labels-btn"
            aria-pressed={labelMode === 'all'}
            onClick={() => setLabelMode('all')}
            title="Show file names on every node"
          >
            <span>All</span>
          </button>
          <button
            type="button"
            class={`graph-tool-btn${labelMode === 'none' ? ' is-active' : ''}`}
            data-testid="graph-labels-none-btn"
            aria-pressed={labelMode === 'none'}
            onClick={() => setLabelMode('none')}
            title="Hide every label for an uncluttered structural view"
          >
            <span>None</span>
          </button>
        </div>

        {/* Zoom cluster: explicit in / out / fit alongside the built-in mouse
            pan + wheel-zoom. */}
        <div class="graph-tool-group" role="group" aria-label="Zoom">
          <button
            type="button"
            class="graph-tool-btn graph-tool-btn--icon"
            data-testid="graph-zoom-in-btn"
            onClick={zoomIn}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <i class="fa-solid fa-plus" />
          </button>
          <button
            type="button"
            class="graph-tool-btn graph-tool-btn--icon"
            data-testid="graph-zoom-out-btn"
            onClick={zoomOut}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <i class="fa-solid fa-minus" />
          </button>
          <button
            type="button"
            class="graph-tool-btn graph-tool-btn--icon"
            data-testid="graph-fit-btn"
            onClick={fitView}
            title="Reset / fit view"
            aria-label="Reset and fit view"
          >
            <i class="fa-solid fa-arrows-to-dot" />
          </button>
        </div>

        <button
          type="button"
          class="graph-tool-btn"
          data-testid="graph-fullscreen-btn"
          onClick={() => setIsFullscreen((v) => !v)}
          title={isFullscreen ? 'Exit full screen (Esc)' : 'View full screen'}
          aria-label={isFullscreen ? 'Exit full screen' : 'View full screen'}
        >
          <i class={`fa-solid ${isFullscreen ? 'fa-compress' : 'fa-expand'}`} />
          <span>{isFullscreen ? 'Exit' : 'Full screen'}</span>
        </button>
      </div>
      <div class="graph-canvas" ref={containerRef} />
    </div>
  );
}
