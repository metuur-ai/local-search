import React, { useEffect, useId } from 'react';
import { SpecFile } from '../types';
import { X, FileCode, Tag, ExternalLink, Calendar, Layers, Image as ImageIcon } from 'lucide-react';

interface SpecDetailModalProps {
  spec: SpecFile | null;
  onClose: () => void;
  onTagClick: (tag: string) => void;
}

export const SpecDetailModal: React.FC<SpecDetailModalProps> = ({ spec, onClose, onTagClick }) => {
  const titleId = useId();

  useEffect(() => {
    if (!spec) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [spec, onClose]);

  if (!spec) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="bg-paper rounded-card max-w-2xl w-full p-6 shadow-2xs border border-rule overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-4 border-b border-rule">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-input bg-info-soft border border-info/25 flex items-center justify-center text-info-ink font-bold">
              {spec.isMediaSidecar ? <ImageIcon className="w-5 h-5 text-syntax-fn" aria-hidden="true" /> : <FileCode className="w-5 h-5" aria-hidden="true" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-paper-3 text-ink-2 font-mono text-[11px] rounded-input font-semibold">
                  {spec.repo}
                </span>
                <span className="text-ink-3 text-xs">/</span>
                <span className="font-mono text-xs text-ink-2">{spec.path}</span>
              </div>
              <h3 id={titleId} className="text-lg font-display font-semibold text-ink mt-0.5">{spec.title}</h3>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close spec viewer"
            className="p-1.5 text-ink-3 hover:text-ink hover:bg-paper-3 rounded-input transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Tags */}
        <div className="py-3 border-b border-rule flex flex-wrap gap-1.5">
          <span className="text-sm font-semibold text-ink-3 mr-1 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5" aria-hidden="true" /> Tags:
          </span>
          {spec.tags.map((tag) => {
            const isReq = tag.startsWith('spec:');
            return (
              <button
                key={tag}
                onClick={() => {
                  onTagClick(tag);
                  onClose();
                }}
                className={`px-2 py-0.5 text-sm font-mono font-medium rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                  isReq
                    ? 'bg-warn-soft text-warn-ink border border-warn/30 font-bold hover:bg-warn-soft/70'
                    : 'bg-paper-3 text-ink-2 hover:bg-paper-3/70'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {/* Spec Raw Markdown Content */}
        <div className="flex-1 overflow-y-auto py-4 font-mono text-xs text-ink-2 space-y-2 bg-paper-2 p-4 rounded-card border border-rule my-3">
          <pre className="whitespace-pre-wrap leading-relaxed">{spec.content}</pre>
        </div>

        {/* Linked Dependencies */}
        {spec.dependsOn && spec.dependsOn.length > 0 && (
          <div className="text-sm text-ink-2 pt-2 flex items-center gap-2">
            <span className="font-bold text-ink-2">Declared DependsOn:</span>
            <div className="flex flex-wrap gap-1 font-mono">
              {spec.dependsOn.map((dep) => (
                <span key={dep} className="px-2 py-0.5 bg-accent-soft text-accent-ink border border-accent/25 rounded-input text-[11px]">
                  {dep}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Close Action */}
        <div className="pt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-panel text-panel-ink rounded-input text-sm font-semibold hover:bg-panel-raised transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Close Spec Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
