import React, { useEffect, useId } from 'react';
import { GraphNode } from '../types';
import { SAMPLE_GRAPH_LINKS } from '../data/sampleCorpus';
import { X, Share2, Layers } from 'lucide-react';
import { getNodeTypeStyle, LINK_FAMILY_STYLES } from './GraphExplorerCard';

interface NodeDetailModalProps {
  node: GraphNode | null;
  onClose: () => void;
  onTagClick: (tag: string) => void;
}

export const NodeDetailModal: React.FC<NodeDetailModalProps> = ({ node, onClose, onTagClick }) => {
  const titleId = useId();

  useEffect(() => {
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [node, onClose]);

  if (!node) return null;

  const connectedLinks = SAMPLE_GRAPH_LINKS.filter(
    (l) => l.source === node.id || l.target === node.id
  );

  const nodeTypeStyle = getNodeTypeStyle(node.osLayer);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="bg-paper rounded-card max-w-xl w-full p-6 shadow-2xs border border-rule overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-rule">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-card bg-panel text-panel-ink flex items-center justify-center font-bold">
              <Share2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 ${nodeTypeStyle.soft} text-ink text-xs font-bold uppercase rounded-input flex items-center gap-1`}>
                  <span className={`w-2 h-2 rounded-full ${nodeTypeStyle.swatch}`}></span>
                  {nodeTypeStyle.label} Layer
                </span>
                <span className="text-xs font-mono text-ink-3">{node.repo}</span>
              </div>
              <h3 id={titleId} className="text-lg font-display font-semibold text-ink mt-0.5">{node.title}</h3>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close node detail"
            className="p-1.5 text-ink-3 hover:text-ink-2 hover:bg-paper-2 rounded-input transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Explanatory Help Callout */}
        <div className="mt-3 p-3 bg-info-soft border border-info/25 rounded-card text-sm space-y-1">
          <div className="font-bold text-info-ink flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Graph Node Inspector</span>
          </div>
          <p className="text-info-ink text-sm leading-relaxed">
            This modal inspects a single document or component in the Knowledge Graph. It shows its classification layer, canonical system ID, searchable tags, and <strong>1-Hop Neighborhood Connections</strong> (all documents directly linked to or dependent on this one).
          </p>
        </div>

        {/* Node Metadata & Tags */}
        <div className="py-3 border-b border-rule space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-3">Canonical Node ID:</span>
            <span className="font-mono text-ink font-semibold">{node.name}</span>
          </div>

          <div className="flex flex-wrap gap-1">
            {node.tags.map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  onTagClick(tag);
                  onClose();
                }}
                className="px-2 py-0.5 bg-paper-3 text-ink-2 hover:bg-rule text-xs font-mono rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Connections List */}
        <div className="py-4 flex-1 overflow-y-auto space-y-2">
          <h4 className="text-sm font-display font-semibold text-ink mb-2">
            1-Hop Graph Neighborhood Connections ({connectedLinks.length})
          </h4>

          {connectedLinks.map((link, idx) => {
            const isSource = link.source === node.id;
            const targetId = isSource ? link.target : link.source;
            const familyStyle = LINK_FAMILY_STYLES[link.family];

            return (
              <div
                key={idx}
                className="p-3 bg-paper-2 rounded-card border border-rule text-sm flex items-center justify-between gap-2"
              >
                <div className="space-y-0.5">
                  <div className="font-mono text-ink font-semibold">
                    {isSource ? 'Outgoing Edge' : 'Incoming Edge'}
                  </div>
                  <div className="text-ink-3 font-mono text-xs">{targetId}</div>
                </div>

                <div className="text-right">
                  <span
                    className={`px-2 py-0.5 rounded-input font-mono text-[10px] font-bold ${familyStyle.badge}`}
                  >
                    {link.relation || familyStyle.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-rule flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-panel text-panel-ink rounded-input text-sm font-semibold hover:bg-panel-raised transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
