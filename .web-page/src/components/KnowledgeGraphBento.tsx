import React, { useState, useMemo } from 'react';
import { GraphNode, GraphLink, LinkFamily, SpecFile } from '../types';
import { Network, ZoomIn, ZoomOut, RefreshCw, Eye, AlertTriangle, CheckCircle, Info, Layers } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface KnowledgeGraphBentoProps {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onInspectSpecByPath?: (path: string) => void;
  activeQuery?: string;
  onToggleUnresolvedTriggered?: () => void;
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

export const KnowledgeGraphBento: React.FC<KnowledgeGraphBentoProps> = ({
  nodes,
  links,
  selectedNodeId,
  onSelectNode,
  onInspectSpecByPath,
  activeQuery,
  onToggleUnresolvedTriggered,
}) => {
  // Link family toggles
  const [showDeclared, setShowDeclared] = useState(true);
  const [showUnresolved, setShowUnresolved] = useState(true);
  const [showSimilarity, setShowSimilarity] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  // OS Layer Colors — the categorical ramp, one hue per unordered layer.
  const layerColors: Record<string, string> = {
    Ontology: 'var(--color-cat-2)',
    Platform: 'var(--color-cat-1)',
    Team: 'var(--color-cat-4)',
    Research: 'var(--color-cat-5)',
    Docs: 'var(--color-cat-3)',
  };

  // Filter links based on family toggles
  const filteredLinks = useMemo(() => {
    return links.filter((l) => {
      if (l.family === 'declared' && !showDeclared) return false;
      if (l.family === 'unresolved' && !showUnresolved) return false;
      if (l.family === 'similarity' && !showSimilarity) return false;
      return true;
    });
  }, [links, showDeclared, showUnresolved, showSimilarity]);

  // Positions layout for nodes (deterministic SVG position calculation)
  const nodePositions = useMemo(() => {
    const width = 580;
    const height = 360;
    const centerX = width / 2;
    const centerY = height / 2;

    const map = new Map<string, { x: number; y: number }>();
    const total = nodes.length;

    nodes.forEach((node, i) => {
      const angle = (i / total) * 2 * Math.PI - Math.PI / 2;
      const radius = node.docType === 'unresolved' ? 140 : i % 2 === 0 ? 110 : 130;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      map.set(node.id, { x, y });
    });

    return map;
  }, [nodes]);

  const activeNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];

  return (
    <div className="bg-panel rounded-card border border-panel-edge p-5 text-panel-ink flex flex-col justify-between shadow-2xs relative h-full min-h-[420px] overflow-hidden">
      {/* Graph Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 z-10 mb-3">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-accent" aria-hidden="true" />
          <div>
            <h3 className="font-display font-semibold text-panel-ink text-base leading-tight">Knowledge Graph</h3>
            <p className="text-sm text-panel-ink-2">Agent OS Entity &amp; Dependency Map</p>
          </div>
        </div>

        {/* Link Family Toggles */}
        <div className="flex items-center gap-1.5 bg-panel-inset/80 p-1 rounded-card border border-panel-edge text-xs">
          <button
            onClick={() => setShowDeclared(!showDeclared)}
            className={`px-2 py-0.5 rounded-input font-bold transition-all flex items-center gap-1 min-h-11 sm:min-h-0 ${FOCUS_RING} ${
              showDeclared
                ? 'bg-cat-5 text-panel shadow-2xs'
                : 'text-panel-ink-3 hover:text-panel-ink'
            }`}
          >
            <span className="w-2 h-0.5 bg-cat-5 inline-block" aria-hidden="true" />
            Declared ({links.filter((l) => l.family === 'declared').length})
          </button>

          <button
            onClick={() => {
              setShowUnresolved(!showUnresolved);
              if (onToggleUnresolvedTriggered) onToggleUnresolvedTriggered();
            }}
            className={`px-2 py-0.5 rounded-input font-bold transition-all flex items-center gap-1 min-h-11 sm:min-h-0 ${FOCUS_RING} ${
              showUnresolved
                ? 'bg-warn text-panel shadow-2xs'
                : 'text-panel-ink-3 hover:text-panel-ink'
            }`}
          >
            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            Unresolved ({links.filter((l) => l.family === 'unresolved').length})
          </button>

          <button
            onClick={() => setShowSimilarity(!showSimilarity)}
            className={`px-2 py-0.5 rounded-input font-bold transition-all flex items-center gap-1 min-h-11 sm:min-h-0 ${FOCUS_RING} ${
              showSimilarity
                ? 'bg-panel-raised text-panel-ink shadow-2xs'
                : 'text-panel-ink-3 hover:text-panel-ink-2'
            }`}
          >
            Similarity ({links.filter((l) => l.family === 'similarity').length})
          </button>
        </div>
      </div>

      {/* Canvas / SVG Area */}
      <div className="relative flex-1 bg-panel-inset rounded-card border border-panel-edge overflow-hidden flex items-center justify-center">
        {/* Controls Overlay */}
        <div className="absolute top-3 right-3 z-10 flex gap-1 bg-panel/90 p-1 rounded-input border border-panel-edge">
          <button
            onClick={() => setZoomLevel((z) => Math.min(z + 0.2, 1.6))}
            aria-label="Zoom in"
            title="Zoom In"
            className={`p-1 hover:bg-panel-raised rounded-input text-panel-ink-2 hover:text-panel-ink ${FOCUS_RING}`}
          >
            <ZoomIn className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => setZoomLevel((z) => Math.max(z - 0.2, 0.6))}
            aria-label="Zoom out"
            title="Zoom Out"
            className={`p-1 hover:bg-panel-raised rounded-input text-panel-ink-2 hover:text-panel-ink ${FOCUS_RING}`}
          >
            <ZoomOut className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => setZoomLevel(1)}
            aria-label="Reset zoom"
            title="Reset Zoom"
            className={`p-1 hover:bg-panel-raised rounded-input text-panel-ink-2 hover:text-panel-ink ${FOCUS_RING}`}
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <svg
          viewBox="0 0 580 360"
          className="w-full h-full cursor-grab active:cursor-grabbing transition-transform duration-300 motion-reduce:transition-none"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          {/* Links Render */}
          {filteredLinks.map((link, idx) => {
            const srcPos = nodePositions.get(link.source);
            const tgtPos = nodePositions.get(link.target);
            if (!srcPos || !tgtPos) return null;

            const isUnresolved = link.family === 'unresolved';
            const isSimilarity = link.family === 'similarity';

            return (
              <g key={idx}>
                <line
                  x1={srcPos.x}
                  y1={srcPos.y}
                  x2={tgtPos.x}
                  y2={tgtPos.y}
                  stroke={
                    isUnresolved
                      ? 'var(--color-warn)'
                      : isSimilarity
                      ? 'var(--color-panel-ink-3)'
                      : 'var(--color-cat-5)'
                  }
                  strokeWidth={isSimilarity ? 1 : 2}
                  strokeDasharray={isUnresolved ? '5,5' : 'none'}
                  opacity={isSimilarity ? 0.35 : 0.85}
                />
                {link.relation && !isSimilarity && (
                  <text
                    x={(srcPos.x + tgtPos.x) / 2}
                    y={(srcPos.y + tgtPos.y) / 2 - 4}
                    fill={isUnresolved ? 'var(--color-warn)' : 'var(--color-cat-5)'}
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {link.relation}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes Render */}
          {nodes.map((node) => {
            const pos = nodePositions.get(node.id);
            if (!pos) return null;

            const isSelected = node.id === selectedNodeId;
            const isUnresolved = node.flags?.includes('unresolved');
            const color = isUnresolved ? 'var(--color-danger)' : layerColors[node.osLayer] || 'var(--color-cat-2)';

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => onSelectNode(node.id)}
                className="cursor-pointer group"
              >
                {/* Outer Glow */}
                <circle
                  r={isSelected ? 22 : 16}
                  fill={color}
                  fillOpacity={isSelected ? 0.35 : 0.15}
                  stroke={color}
                  strokeWidth={isSelected ? 2 : 1}
                  className="transition-all duration-300 motion-reduce:transition-none group-hover:scale-125"
                />

                {/* Main Node Circle */}
                <circle
                  r={isSelected ? 14 : 10}
                  fill={color}
                  stroke="var(--color-panel-inset)"
                  strokeWidth={2}
                  className="shadow-lg"
                />

                {/* Label text */}
                <text
                  y={isSelected ? 28 : 22}
                  textAnchor="middle"
                  fill={isSelected ? 'var(--color-panel-ink)' : 'var(--color-panel-ink-2)'}
                  fontSize={isSelected ? '11' : '10'}
                  fontWeight={isSelected ? 'bold' : 'normal'}
                  className="pointer-events-none transition-all motion-reduce:transition-none drop-shadow-md"
                >
                  {node.title.split(' ')[0]}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Selected Node Quick Inspector Overlay */}
        {activeNode && (
          <div className="absolute bottom-3 left-3 right-3 bg-panel/95 border border-panel-edge rounded-card p-3 backdrop-blur-md flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 overflow-hidden mr-2">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: layerColors[activeNode.osLayer] || 'var(--color-cat-2)' }}
              />
              <div className="truncate">
                <span className="font-bold text-panel-ink block truncate">{activeNode.title}</span>
                <span className="text-xs font-mono text-panel-ink-3 truncate block">
                  {activeNode.name}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold px-2 py-0.5 rounded-input bg-panel-raised text-panel-ink-2">
                {activeNode.osLayer} Layer
              </span>
              {onInspectSpecByPath && (
                <button
                  onClick={() => onInspectSpecByPath(activeNode.path)}
                  className={`px-2.5 py-1 bg-accent hover:bg-accent/90 text-accent-contrast rounded-input font-bold text-xs transition-colors ${FOCUS_RING}`}
                >
                  Inspect Spec
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer OS Layer Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-xs text-panel-ink-3 pt-2 border-t border-panel-edge">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-panel-ink-2">OS Layers:</span>
          {Object.entries(layerColors).map(([layer, color]) => (
            <div key={layer} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span>{layer}</span>
            </div>
          ))}
        </div>
        <span>{nodes.length} Connected Entities</span>
      </div>
    </div>
  );
};
