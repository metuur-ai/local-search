import React from 'react';
import { GraphNode } from '../types';
import { SAMPLE_GRAPH_LINKS } from '../data/sampleCorpus';
import { X, Share2, Tag, Layers, ArrowRight, AlertTriangle } from 'lucide-react';

interface NodeDetailModalProps {
  node: GraphNode | null;
  onClose: () => void;
  onTagClick: (tag: string) => void;
}

export const NodeDetailModal: React.FC<NodeDetailModalProps> = ({ node, onClose, onTagClick }) => {
  if (!node) return null;

  const connectedLinks = SAMPLE_GRAPH_LINKS.filter(
    (l) => l.source === node.id || l.target === node.id
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-panel text-blue-400 flex items-center justify-center font-bold">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold uppercase rounded">
                  {node.osLayer} Layer
                </span>
                <span className="text-xs font-mono text-slate-500">{node.repo}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-0.5">{node.title}</h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Explanatory Help Callout */}
        <div className="mt-3 p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-xs space-y-1">
          <div className="font-bold text-blue-900 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span>Graph Node Inspector</span>
          </div>
          <p className="text-blue-950 text-[11px] leading-relaxed">
            This modal inspects a single document or component in the Knowledge Graph. It shows its classification layer, canonical system ID, searchable tags, and <strong>1-Hop Neighborhood Connections</strong> (all documents directly linked to or dependent on this one).
          </p>
        </div>

        {/* Node Metadata & Tags */}
        <div className="py-3 border-b border-slate-100 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Canonical Node ID:</span>
            <span className="font-mono text-slate-800 font-semibold">{node.name}</span>
          </div>

          <div className="flex flex-wrap gap-1">
            {node.tags.map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  onTagClick(tag);
                  onClose();
                }}
                className="px-2 py-0.5 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-mono rounded"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Connections List */}
        <div className="py-4 flex-1 overflow-y-auto space-y-2">
          <h4 className="text-xs font-bold text-slate-800 mb-2">
            1-Hop Graph Neighborhood Connections ({connectedLinks.length})
          </h4>

          {connectedLinks.map((link, idx) => {
            const isSource = link.source === node.id;
            const targetId = isSource ? link.target : link.source;

            return (
              <div
                key={idx}
                className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between gap-2"
              >
                <div className="space-y-0.5">
                  <div className="font-mono text-slate-800 font-semibold">
                    {isSource ? '→ Outgoing Edge' : '← Incoming Edge'}
                  </div>
                  <div className="text-slate-500 font-mono text-[11px]">{targetId}</div>
                </div>

                <div className="text-right">
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                      link.family === 'declared'
                        ? 'bg-emerald-100 text-emerald-800'
                        : link.family === 'unresolved'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {link.relation || link.family}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-panel text-white rounded-xl text-xs font-semibold hover:bg-panel-raised transition-all"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
