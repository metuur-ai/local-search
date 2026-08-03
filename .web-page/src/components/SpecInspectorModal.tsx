import React, { useEffect, useId, useState } from 'react';
import { SpecFile } from '../types';
import { X, FileText, Tag, Link2, Copy, Check, FileImage, ShieldAlert, Cpu } from 'lucide-react';

interface SpecInspectorModalProps {
  spec: SpecFile | null;
  onClose: () => void;
}

export const SpecInspectorModal: React.FC<SpecInspectorModalProps> = ({
  spec,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
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

  const handleCopyContent = () => {
    navigator.clipboard.writeText(spec.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="bg-paper rounded-card border border-rule shadow-2xs w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-paper-2 border-b border-rule flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-info-soft rounded-input flex items-center justify-center text-info-ink">
              {spec.isMediaSidecar ? (
                <FileImage className="w-4 h-4" aria-hidden="true" />
              ) : (
                <FileText className="w-4 h-4" aria-hidden="true" />
              )}
            </div>
            <div>
              <h3 id={titleId} className="font-display font-semibold text-ink text-base leading-tight">
                {spec.title}
              </h3>
              <p className="text-sm text-ink-3 font-mono">
                {spec.repo}/{spec.path}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyContent}
              className="px-3 py-1.5 bg-paper border border-rule rounded-input text-sm font-semibold text-ink-2 hover:bg-paper-2 flex items-center gap-1.5 shadow-2xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-accent" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>{copied ? 'Copied' : 'Copy Markdown'}</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close spec inspector"
              className="p-1.5 hover:bg-paper-3 rounded-input text-ink-3 hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-paper-2 border border-rule rounded-card text-sm">
            <div>
              <span className="text-ink-3 font-semibold block text-[10px] uppercase mb-0.5">
                Doc Type
              </span>
              <span className="font-bold text-ink-2 uppercase">{spec.docType || 'PRD'}</span>
            </div>
            <div>
              <span className="text-ink-3 font-semibold block text-[10px] uppercase mb-0.5">
                Status
              </span>
              <span className="font-bold text-accent-ink capitalize">{spec.status || 'approved'}</span>
            </div>
            <div>
              <span className="text-ink-3 font-semibold block text-[10px] uppercase mb-0.5">
                Last Modified
              </span>
              <span className="font-mono text-ink-2">{spec.lastModified}</span>
            </div>
            <div>
              <span className="text-ink-3 font-semibold block text-[10px] uppercase mb-0.5">
                Media Sidecar
              </span>
              <span className="font-bold text-ink-2">{spec.isMediaSidecar ? 'Yes (.png)' : 'No'}</span>
            </div>
          </div>

          {/* Tags section */}
          <div>
            <span className="text-sm font-bold text-ink-3 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" aria-hidden="true" />
              Tags & EARS Requirement Annotations
            </span>
            <div className="flex flex-wrap gap-1.5">
              {spec.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className={`px-2.5 py-1 rounded-input text-sm font-bold ${
                    tag.startsWith('spec:')
                      ? 'bg-warn-soft text-warn-ink border border-warn/30'
                      : 'bg-info-soft text-info-ink border border-info/25'
                  }`}
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {/* Dependencies / Relationships */}
          {(spec.dependsOn || spec.relationships || spec.upstream) && (
            <div>
              <span className="text-sm font-bold text-ink-3 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                Declared Graph Relationships
              </span>
              <div className="space-y-1.5 text-sm font-mono">
                {spec.dependsOn?.map((dep, idx) => (
                  <div key={idx} className="p-2 bg-paper-2 border border-rule rounded-input flex items-center justify-between">
                    <span className="text-accent-ink font-bold">dependsOn →</span>
                    <span className="text-ink-2">{dep}</span>
                  </div>
                ))}
                {spec.relationships?.map((rel, idx) => (
                  <div key={idx} className="p-2 bg-paper-2 border border-rule rounded-input flex items-center justify-between">
                    <span className="text-info-ink font-bold">relationships ↔</span>
                    <span className="text-ink-2">{rel}</span>
                  </div>
                ))}
                {spec.upstream?.map((up, idx) => (
                  <div key={idx} className="p-2 bg-paper-2 border border-rule rounded-input flex items-center justify-between">
                    <span className="text-syntax-fn font-bold">upstream ↑</span>
                    <span className="text-ink-2">{up}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Media Sidecar Visual Preview (If applicable) */}
          {spec.isMediaSidecar && (
            <div className="p-4 bg-panel rounded-card text-panel-ink text-center">
              <FileImage className="w-10 h-10 text-syntax-keyword mx-auto mb-2" aria-hidden="true" />
              <div className="font-bold text-sm mb-1">Image Sidecar Pattern Detected</div>
              <p className="text-sm text-panel-ink-3 max-w-md mx-auto">
                In Local Search, binary media like <code className="text-syntax-number rounded-input">{spec.mediaFile}</code> is indexed using a companion <code className="text-syntax-number rounded-input">.md</code> sidecar file sitting in the same folder with matching name!
              </p>
            </div>
          )}

          {/* Full Markdown Raw Content */}
          <div>
            <span className="text-sm font-bold text-ink-3 uppercase tracking-wider block mb-2">
              Raw Markdown Content
            </span>
            <pre className="p-4 bg-panel-inset text-panel-ink rounded-card font-mono text-xs overflow-x-auto leading-relaxed border border-panel-edge">
              {spec.content}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-paper-2 border-t border-rule text-right">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-ink text-paper rounded-input text-sm font-bold hover:bg-ink-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
