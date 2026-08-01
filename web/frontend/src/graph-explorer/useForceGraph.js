// Owns the force-graph canvas instance and all imperative rendering/physics.
// The force-graph render closures read mutable per-frame state (selection,
// hover, highlight sets, glow, labels) every tick, so that state lives in refs
// — never Preact state — to avoid re-initializing the graph on each change. The
// hook surfaces a small imperative API and notifies the component of selection
// and physics changes via callbacks.

import { useCallback, useEffect, useRef } from 'preact/hooks';
import ForceGraph from 'force-graph';
import {
  colors, COMMUNITY, buildPerformanceMaps, EDGE_FAMILY_META, linkEndId,
} from './graphData.js';

// Layout spacing. `s` is a multiplier over the defaults (1 = the original
// packing); nodes shrink as the layout widens so dense graphs read as points
// rather than overlapping blobs.
export const SPREAD_MIN = 0.6;
export const SPREAD_MAX = 3;
const applySpread = (graph, s) => {
  graph.d3Force('charge').strength(-40 * s).distanceMax(300 * s);
  graph.d3Force('link').distance(35 * s);
  graph.nodeRelSize(Math.min(4.5, Math.max(3, 4 - (s - 1) * 0.5)));
};

export function useForceGraph({ containerRef, onSelectNode, onPhysicsChange }) {
  const graphRef = useRef(null);
  const mapsRef = useRef({ neighborNodesMap: new Map(), nodeLinksMap: new Map(), nodeByIdMap: new Map() });

  const selectedRef = useRef(null);
  const hoverRef = useRef(null);
  const highlightNodesRef = useRef(new Set());
  const highlightLinksRef = useRef(new Set());
  const glowRef = useRef(true);   // soft node shadows; auto-disabled on huge graphs
  const labelsRef = useRef(false); // "All labels" toggle
  const physicsRef = useRef(true);
  const fittedRef = useRef(false); // one-time auto zoom-to-fit after first settle
  const spreadRef = useRef(1);     // layout spacing multiplier (see applySpread)
  const refitRef = useRef(false);  // refit the view once the next settle finishes

  // Keep the latest callbacks reachable from the stable graph closures.
  const onSelectRef = useRef(onSelectNode);
  const onPhysicsRef = useRef(onPhysicsChange);
  onSelectRef.current = onSelectNode;
  onPhysicsRef.current = onPhysicsChange;

  const updateHighlight = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const highlightNodes = highlightNodesRef.current;
    const highlightLinks = highlightLinksRef.current;
    highlightNodes.clear();
    highlightLinks.clear();
    const activeCenter = selectedRef.current || hoverRef.current;
    if (activeCenter) {
      highlightNodes.add(activeCenter);
      (mapsRef.current.nodeLinksMap.get(activeCenter.id) || []).forEach((link) => {
        highlightLinks.add(link);
        const sid = typeof link.source === 'object' ? link.source.id : link.source;
        const tid = typeof link.target === 'object' ? link.target.id : link.target;
        highlightNodes.add(mapsRef.current.nodeByIdMap.get(sid));
        highlightNodes.add(mapsRef.current.nodeByIdMap.get(tid));
      });
    }
    // Re-assigning the accessors forces a repaint without changing behavior.
    graph.nodeColor(graph.nodeColor());
    graph.linkWidth(graph.linkWidth());
  }, []);

  // Initialize the graph once, on mount.
  useEffect(() => {
    const elem = containerRef.current;
    if (!elem) return undefined;

    const graph = ForceGraph()(elem)
      .backgroundColor('#eef1f6')
      .nodeRelSize(4)
      .nodeVal((node) => node.val || 4)
      .nodeColor((node) => node.renderColor)
      // Style by edge family, not just highlight state: a declared frontmatter
      // edge and a lexical-similarity edge must not look identical.
      .linkColor((link) => (highlightLinksRef.current.has(link)
        ? 'rgba(15,118,110,0.95)'
        : (EDGE_FAMILY_META[link.family] || EDGE_FAMILY_META.similarity).color))
      .linkWidth((link) => (highlightLinksRef.current.has(link)
        ? 2.4
        : (EDGE_FAMILY_META[link.family] || EDGE_FAMILY_META.similarity).width))
      .linkLineDash((link) => (EDGE_FAMILY_META[link.family] || EDGE_FAMILY_META.similarity).dash)
      // No directional particles — they force a continuous 60fps repaint of the
      // whole graph while hovering. Highlight is shown via link color/width instead.
      .linkDirectionalParticles(0)
      // Cheap hit-area for hover detection — keeps the pointer canvas from
      // re-running the expensive shadow/label paint on every mouse move.
      .nodePointerAreaPaint((node, color, ctx) => {
        const r = Math.sqrt(Math.max(0, node.val || 4)) * graph.nodeRelSize();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 2, 0, 2 * Math.PI, false);
        ctx.fill();
      })
      .nodeCanvasObject((node, ctx, globalScale) => {
        if (node.x === undefined || node.y === undefined) return;

        const r = Math.sqrt(Math.max(0, node.val || 4)) * graph.nodeRelSize();
        const selectedNode = selectedRef.current;
        const hoverNode = hoverRef.current;
        const isHighlight = highlightNodesRef.current.has(node) || node === selectedNode || node === hoverNode;
        const isMuted = (selectedNode || hoverNode) && !isHighlight;
        const isCommunity = COMMUNITY.has(node.type);

        ctx.globalAlpha = isMuted ? 0.16 : 1;

        // soft drop shadow lifts the dot off the paper — only on the few
        // hub / highlighted nodes, since shadowBlur is the costliest per-node op
        const withShadow = glowRef.current && !isMuted && (isHighlight || isCommunity);
        if (withShadow) {
          ctx.shadowColor = 'rgba(23,27,38,0.28)';
          ctx.shadowBlur = isHighlight ? 12 : 9;
          ctx.shadowOffsetY = 1.5;
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
        ctx.fillStyle = node.renderColor;
        ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

        // glossy top-left highlight — only on hub/highlighted nodes, so the
        // per-frame draw stays cheap when the whole graph repaints
        if (withShadow) {
          ctx.beginPath();
          ctx.arc(node.x - r * 0.3, node.y - r * 0.3, r * 0.4, 0, 2 * Math.PI, false);
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.fill();
        }

        // selection / hover ring
        if (node === selectedNode || (isHighlight && node === hoverNode)) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 3 / globalScale, 0, 2 * Math.PI, false);
          ctx.lineWidth = 1.8 / globalScale;
          ctx.strokeStyle = node === selectedNode ? '#0f766e' : 'rgba(23,27,38,0.35)';
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // LEVEL OF DETAIL labels
        let shouldDrawLabel = false;
        if (labelsRef.current) {
          shouldDrawLabel = globalScale > 0.3;
        } else {
          shouldDrawLabel = (isCommunity && globalScale > 0.7 && !isMuted) || (isHighlight && !isMuted);
        }

        if (shouldDrawLabel) {
          const label = node.name || node.id;
          const fontSize = isCommunity ? 12.5 / globalScale : 10.5 / globalScale;
          ctx.font = `${isCommunity ? '600' : '500'} ${fontSize}px 'JetBrains Mono', monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const textY = node.y + r + (8 / globalScale) + (fontSize / 2);

          ctx.lineWidth = 3.5 / globalScale;
          ctx.strokeStyle = 'rgba(238,241,246,0.95)';
          ctx.strokeText(label, node.x, textY);
          ctx.fillStyle = isCommunity ? node.renderColor : '#485061';
          ctx.fillText(label, node.x, textY);
        }
      })
      .onNodeHover((node) => {
        elem.style.cursor = node ? 'pointer' : null;
        if (selectedRef.current) return;
        hoverRef.current = node;
        updateHighlight();
      })
      .onNodeClick((node) => {
        if (selectedRef.current === node) {
          selectedRef.current = null;
          onSelectRef.current?.(null);
        } else {
          selectedRef.current = node;
          onSelectRef.current?.(node);
          graph.centerAt(node.x, node.y, 1000);
          graph.zoom(6, 1500);
        }
        updateHighlight();
      })
      .onBackgroundClick(() => {
        selectedRef.current = null;
        hoverRef.current = null;
        updateHighlight();
        onSelectRef.current?.(null);
      });

    applySpread(graph, spreadRef.current);
    graph.d3AlphaDecay(0.05).d3VelocityDecay(0.5);
    graph.cooldownTicks(150);
    graph.onEngineStop(() => {
      physicsRef.current = false;
      onPhysicsRef.current?.(false);
      if (!fittedRef.current || refitRef.current) {
        fittedRef.current = true;
        refitRef.current = false;
        graph.zoomToFit(600, 70);
      }
    });

    graphRef.current = graph;

    const onResize = () => graph.width(elem.clientWidth).height(elem.clientHeight);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      graph._destructor?.();
      graphRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load a renderable graph. `refit` re-arms the one-time zoom-to-fit for a new
  // dataset; `reheat` restarts the simulation briefly (used after re-filtering).
  const load = useCallback((data, { refit = false, reheat = false } = {}) => {
    const graph = graphRef.current;
    if (!graph) return;
    mapsRef.current = buildPerformanceMaps(data);
    selectedRef.current = null;
    hoverRef.current = null;
    highlightNodesRef.current.clear();
    highlightLinksRef.current.clear();
    onSelectRef.current?.(null);
    glowRef.current = data.nodes.length <= 2500; // keep soft shadows only where they stay smooth
    if (refit) fittedRef.current = false;
    graph.graphData(data);
    if (reheat) {
      graph.d3ReheatSimulation();
      graph.cooldownTicks(60);
    }
  }, []);

  const zoomIn = useCallback(() => {
    const g = graphRef.current;
    if (g) g.zoom(g.zoom() * 1.3, 400);
  }, []);
  const zoomOut = useCallback(() => {
    const g = graphRef.current;
    if (g) g.zoom(g.zoom() / 1.3, 400);
  }, []);
  const fit = useCallback(() => graphRef.current?.zoomToFit(400, 60), []);

  const togglePhysics = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    if (physicsRef.current) {
      graph.d3Force('charge').strength(0);
      graph.cooldownTicks(0);
    } else {
      applySpread(graph, spreadRef.current);
      graph.d3ReheatSimulation();
      graph.cooldownTicks(150);
    }
    physicsRef.current = !physicsRef.current;
    onPhysicsRef.current?.(physicsRef.current);
  }, []);

  // Widen or tighten the layout. Spacing only means something while the
  // simulation runs, so this reheats — and resumes physics if it was paused.
  // A wider layout would otherwise push the graph past the edges of the
  // viewport, so the view is refit once the new layout settles.
  const setSpread = useCallback((value) => {
    const graph = graphRef.current;
    spreadRef.current = value;
    if (!graph) return;
    refitRef.current = true;
    applySpread(graph, value);
    graph.d3ReheatSimulation();
    graph.cooldownTicks(150);
    if (!physicsRef.current) {
      physicsRef.current = true;
      onPhysicsRef.current?.(true);
    }
  }, []);

  const setShowLabels = useCallback((val) => {
    labelsRef.current = val;
    updateHighlight();
  }, [updateHighlight]);

  // Clear the current selection/hover (e.g. the inspector's close button) and
  // notify the component so its selected-node state clears too.
  const deselect = useCallback(() => {
    selectedRef.current = null;
    hoverRef.current = null;
    updateHighlight();
    onSelectRef.current?.(null);
  }, [updateHighlight]);

  // Select a node by id — the same transition onNodeClick performs, so the
  // inspector's connection rows navigate the graph instead of being inert text.
  // A node filtered off the canvas is simply not selectable.
  const selectById = useCallback((id) => {
    const graph = graphRef.current;
    const node = mapsRef.current.nodeByIdMap.get(id);
    if (!graph || !node) return;
    selectedRef.current = node;
    hoverRef.current = null;
    onSelectRef.current?.(node);
    if (node.x !== undefined && node.y !== undefined) {
      graph.centerAt(node.x, node.y, 1000);
      graph.zoom(6, 1500);
    }
    updateHighlight();
  }, [updateHighlight]);

  // Connections for the inspector, resolved from the current lookup maps.
  //
  // Walks the node's LINKS rather than its neighbour set, so each row can carry
  // the edge's own facts: which relation it asserts, which way it points, and
  // whether the other end actually resolves. Declared edges sort first — with
  // 385 declared among 3000 similarity links, relevance order matters more than
  // insertion order.
  const getConnections = useCallback((node) => {
    const { nodeLinksMap, nodeByIdMap } = mapsRef.current;
    const out = [];
    const seen = new Set();
    (nodeLinksMap.get(node.id) || []).forEach((l) => {
      const s = linkEndId(l.source);
      const t = linkEndId(l.target);
      const outgoing = s === node.id;
      const otherId = outgoing ? t : s;
      const other = nodeByIdMap.get(otherId);
      const key = `${l.relation || ''}|${outgoing ? '>' : '<'}|${otherId}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        id: otherId,
        name: (other && (other.name || other.id)) || otherId,
        color: (other && (other.renderColor || colors[other.type])) || colors.file,
        relation: l.relation || '',
        outgoing,
        family: l.family,
        unresolved: !other || other.flags === 'unresolved',
        location: l.source_location || '',
      });
    });
    // Declared before similarity; then by relation, then by name.
    const rank = (c) => (c.relation ? 0 : 1);
    out.sort((a, b) => rank(a) - rank(b)
      || a.relation.localeCompare(b.relation)
      || a.name.localeCompare(b.name));
    return out;
  }, []);

  return {
    load, zoomIn, zoomOut, fit, togglePhysics, setShowLabels, setSpread,
    deselect, selectById, getConnections,
  };
}
