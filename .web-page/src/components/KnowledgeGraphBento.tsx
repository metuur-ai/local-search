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

  // OS Layer Colors
  const layerColors: Record<string, string> = {
    Ontology: '#3b82f6', // Blue
    Platform: '#10b981', // Emerald
    Team: '#f59e0b', // Amber
    Research: '#ef4444', // Red
    Docs: '#8b5cf6', // Purple
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
    <div className="bg-slate-900 rounded-2xl p-5 text-white flex flex-col justify-between shadow-md relative h-full min-h-[420px] overflow-hidden">
      {/* Graph Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 z-10 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-400 border border-blue-500/30">
            <Network className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base leading-tight">Knowledge Graph</h3>
            <p className="text-[11px] text-slate-400">Agent OS Entity & Dependency Map</p>
          </div>
        </div>

        {/* Link Family Toggles */}
        <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/80 text-[11px]">
          <button
            onClick={() => setShowDeclared(!showDeclared)}
            className={`px-2 py-0.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
              showDeclared
                ? 'bg-teal-500 text-slate-950 shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="w-2 h-0.5 bg-teal-400 inline-block" />
            Declared ({links.filter((l) => l.family === 'declared').length})
          </button>

          <button
            onClick={() => {
              setShowUnresolved(!showUnresolved);
              if (onToggleUnresolvedTriggered) onToggleUnresolvedTriggered();
            }}
            className={`px-2 py-0.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
              showUnresolved
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            Unresolved ({links.filter((l) => l.family === 'unresolved').length})
          </button>

          <button
            onClick={() => setShowSimilarity(!showSimilarity)}
            className={`px-2 py-0.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
              showSimilarity
                ? 'bg-slate-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Similarity ({links.filter((l) => l.family === 'similarity').length})
          </button>
        </div>
      </div>

      {/* Canvas / SVG Area */}
      <div className="relative flex-1 bg-slate-950/60 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center">
        {/* Controls Overlay */}
        <div className="absolute top-3 right-3 z-10 flex gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setZoomLevel((z) => Math.min(z + 0.2, 1.6))}
            className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoomLevel((z) => Math.max(z - 0.2, 0.6))}
            className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoomLevel(1)}
            className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white"
            title="Reset Zoom"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <svg
          viewBox="0 0 580 360"
          className="w-full h-full cursor-grab active:cursor-grabbing transition-transform duration-300"
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
                      ? '#f59e0b'
                      : isSimilarity
                      ? '#475569'
                      : '#14b8a6'
                  }
                  strokeWidth={isSimilarity ? 1 : 2}
                  strokeDasharray={isUnresolved ? '5,5' : 'none'}
                  opacity={isSimilarity ? 0.35 : 0.85}
                />
                {link.relation && !isSimilarity && (
                  <text
                    x={(srcPos.x + tgtPos.x) / 2}
                    y={(srcPos.y + tgtPos.y) / 2 - 4}
                    fill={isUnresolved ? '#fcd34d' : '#2dd4bf'}
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
            const color = isUnresolved ? '#ef4444' : layerColors[node.osLayer] || '#3b82f6';

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
                  className="transition-all duration-300 group-hover:scale-125"
                />

                {/* Main Node Circle */}
                <circle
                  r={isSelected ? 14 : 10}
                  fill={color}
                  stroke="#0f172a"
                  strokeWidth={2}
                  className="shadow-lg"
                />

                {/* Label text */}
                <text
                  y={isSelected ? 28 : 22}
                  textAnchor="middle"
                  fill={isSelected ? '#ffffff' : '#cbd5e1'}
                  fontSize={isSelected ? '11' : '10'}
                  fontWeight={isSelected ? 'bold' : 'normal'}
                  className="pointer-events-none transition-all drop-shadow-md"
                >
                  {node.title.split(' ')[0]}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Selected Node Quick Inspector Overlay */}
        {activeNode && (
          <div className="absolute bottom-3 left-3 right-3 bg-slate-900/95 border border-slate-800 rounded-xl p-3 backdrop-blur-md flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 overflow-hidden mr-2">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: layerColors[activeNode.osLayer] || '#3b82f6' }}
              />
              <div className="truncate">
                <span className="font-bold text-white block truncate">{activeNode.title}</span>
                <span className="text-[10px] font-mono text-slate-400 truncate block">
                  {activeNode.name}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-blue-300">
                {activeNode.osLayer} Layer
              </span>
              {onInspectSpecByPath && (
                <button
                  onClick={() => onInspectSpecByPath(activeNode.path)}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-[11px] transition-colors"
                >
                  Inspect Spec
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer OS Layer Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-[11px] text-slate-400 pt-2 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-300">OS Layers:</span>
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
