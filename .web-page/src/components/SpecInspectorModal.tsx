import React, { useState } from 'react';
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

  if (!spec) return null;

  const handleCopyContent = () => {
    navigator.clipboard.writeText(spec.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700">
              {spec.isMediaSidecar ? (
                <FileImage className="w-4 h-4" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base leading-tight">
                {spec.title}
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                {spec.repo}/{spec.path}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyContent}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 shadow-2xs transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Markdown'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 rounded-xl text-slate-500 hover:text-slate-900 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div>
              <span className="text-slate-400 font-semibold block text-[10px] uppercase mb-0.5">
                Doc Type
              </span>
              <span className="font-bold text-slate-800 uppercase">{spec.docType || 'PRD'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block text-[10px] uppercase mb-0.5">
                Status
              </span>
              <span className="font-bold text-emerald-700 capitalize">{spec.status || 'approved'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block text-[10px] uppercase mb-0.5">
                Last Modified
              </span>
              <span className="font-mono text-slate-700">{spec.lastModified}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block text-[10px] uppercase mb-0.5">
                Media Sidecar
              </span>
              <span className="font-bold text-slate-800">{spec.isMediaSidecar ? 'Yes (.png)' : 'No'}</span>
            </div>
          </div>

          {/* Tags section */}
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" />
              Tags & EARS Requirement Annotations
            </span>
            <div className="flex flex-wrap gap-1.5">
              {spec.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    tag.startsWith('spec:')
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
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
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2 flex items-center gap-1">
                <Link2 className="w-3.5 h-3.5" />
                Declared Graph Relationships
              </span>
              <div className="space-y-1.5 text-xs font-mono">
                {spec.dependsOn?.map((dep, idx) => (
                  <div key={idx} className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <span className="text-teal-700 font-bold">dependsOn →</span>
                    <span className="text-slate-800">{dep}</span>
                  </div>
                ))}
                {spec.relationships?.map((rel, idx) => (
                  <div key={idx} className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <span className="text-blue-700 font-bold">relationships ↔</span>
                    <span className="text-slate-800">{rel}</span>
                  </div>
                ))}
                {spec.upstream?.map((up, idx) => (
                  <div key={idx} className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <span className="text-purple-700 font-bold">upstream ↑</span>
                    <span className="text-slate-800">{up}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Media Sidecar Visual Preview (If applicable) */}
          {spec.isMediaSidecar && (
            <div className="p-4 bg-slate-900 rounded-xl text-white text-center">
              <FileImage className="w-10 h-10 text-blue-400 mx-auto mb-2" />
              <div className="font-bold text-sm mb-1">Image Sidecar Pattern Detected</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                In Local Search, binary media like <code className="text-amber-300">{spec.mediaFile}</code> is indexed using a companion <code className="text-amber-300">.md</code> sidecar file sitting in the same folder with matching name!
              </p>
            </div>
          )}

          {/* Full Markdown Raw Content */}
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Raw Markdown Content
            </span>
            <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
              {spec.content}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-right">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
