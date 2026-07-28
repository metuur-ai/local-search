import React from 'react';
import { SpecFile } from '../types';
import { X, FileCode, Tag, ExternalLink, Calendar, Layers, Image as ImageIcon } from 'lucide-react';

interface SpecDetailModalProps {
  spec: SpecFile | null;
  onClose: () => void;
  onTagClick: (tag: string) => void;
}

export const SpecDetailModal: React.FC<SpecDetailModalProps> = ({ spec, onClose, onTagClick }) => {
  if (!spec) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold">
              {spec.isMediaSidecar ? <ImageIcon className="w-5 h-5 text-purple-600" /> : <FileCode className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-mono text-[11px] rounded font-semibold">
                  {spec.repo}
                </span>
                <span className="text-slate-400 text-xs">/</span>
                <span className="font-mono text-xs text-slate-600">{spec.path}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-0.5">{spec.title}</h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tags */}
        <div className="py-3 border-b border-slate-100 flex flex-wrap gap-1.5">
          <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5" /> Tags:
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
                className={`px-2 py-0.5 text-xs font-mono font-medium rounded ${
                  isReq
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold hover:bg-amber-200'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {/* Spec Raw Markdown Content */}
        <div className="flex-1 overflow-y-auto py-4 font-mono text-xs text-slate-800 space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200 my-3">
          <pre className="whitespace-pre-wrap leading-relaxed">{spec.content}</pre>
        </div>

        {/* Linked Dependencies */}
        {spec.dependsOn && spec.dependsOn.length > 0 && (
          <div className="text-xs text-slate-600 pt-2 flex items-center gap-2">
            <span className="font-bold text-slate-800">Declared DependsOn:</span>
            <div className="flex flex-wrap gap-1 font-mono">
              {spec.dependsOn.map((dep) => (
                <span key={dep} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[11px]">
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
            className="px-4 py-2 bg-panel text-white rounded-xl text-xs font-semibold hover:bg-panel-raised transition-all"
          >
            Close Spec Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
