import React, { useState } from 'react';
import {
  Settings,
  FileCode,
  AlertTriangle,
  Code,
  CheckCircle2,
  Database,
  Tag,
  ChevronRight,
  FileText,
  ExternalLink,
  FolderGit2,
} from 'lucide-react';

export const ConfigMatrixSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'toml' | 'ears' | 'locations'>('toml');

  return (
    <div className="max-w-[90%] w-full mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1 bg-blue-500/20 text-blue-300 rounded-md">
                <Settings className="w-4 h-4" />
              </span>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-300">
                System Reference &amp; Specifications
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight font-sans">
              Configuration File Matrix &amp; EARS Syntax
            </h2>
            <p className="text-xs text-slate-300">
              Technical reference for <code className="font-mono text-blue-300">.local-search.toml</code>, storage paths, and EARS requirements annotations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl font-mono text-[11px] text-blue-200">
              <span className="text-slate-400">Resolution:</span> Walk parent dirs up to root
            </div>
          </div>
        </div>

        {/* Tab Selection Row */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-800/80 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('toml')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'toml'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-900/60 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>.local-search.toml Scoping</span>
          </button>

          <button
            onClick={() => setActiveTab('ears')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'ears'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-900/60 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Tag className="w-3.5 h-3.5 text-amber-400" />
            <span>EARS &amp; Wikilinks Indexing</span>
          </button>

          <button
            onClick={() => setActiveTab('locations')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'locations'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-900/60 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5 text-purple-400" />
            <span>Storage &amp; File Paths</span>
          </button>
        </div>
      </div>

      {/* Tab 1: .local-search.toml Scoping */}
      {activeTab === 'toml' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Local Workspace Config (.local-search.toml)</h3>
              <p className="text-xs text-slate-500">
                Created at repository root or directory level to pin searches, adjust BM25 weight multipliers, and enforce blast depth caps.
              </p>
            </div>
            <span className="text-[10px] font-mono bg-blue-50 text-blue-800 px-2.5 py-1 rounded border border-blue-200 font-bold">
              TOML Schema v1
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-2">
              <span className="text-xs font-mono font-bold text-slate-700">Sample .local-search.toml File</span>
              <pre className="bg-slate-950 text-blue-200 p-4 rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto border border-slate-800">
{`# .local-search.toml - Local Search Directory Config
scope = ["product-specs", "platform-docs", "billing-service"]

[weights]
specs = 1.00
graphify = 0.70
codegraph = 0.80

[limits]
specs = 20
graphify = 10
codegraph = 10
blast_depth = 2
blast_cap = 50`}
              </pre>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <ChevronRight className="w-4 h-4 text-blue-600" />
                  <span>Resolution Order</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  When executing <code className="font-mono text-slate-900">local-search find</code> or <code className="font-mono text-slate-900">code</code>, local-search walks up parent directories starting from CWD to find the nearest <code className="font-mono">.local-search.toml</code> file.
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <ChevronRight className="w-4 h-4 text-blue-600" />
                  <span>Weight Multipliers ([weights])</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Controls score weighting across multi-source queries. For example, specs=1.00 keeps specifications as primary, while codegraph=0.80 slightly penalizes code symbols in unified search results.
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <ChevronRight className="w-4 h-4 text-blue-600" />
                  <span>Blast Limits ([limits])</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Enforces bounded graph reachability during <code className="font-mono text-slate-900">code blast</code>. <code className="font-mono text-blue-700">blast_depth = 2</code> limits transitive dependency search to 2 hops, preventing graph explosion.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: EARS & Wikilinks Syntax Reference */}
      {activeTab === 'ears' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base">EARS Requirements &amp; Wikilinks Content Indexing</h3>
              <p className="text-xs text-slate-500">
                Standardized requirements annotations (<code className="font-mono text-purple-700">@spec ID</code>) and cross-document Wikilinks (<code className="font-mono text-blue-700">[[target-doc]]</code>) automatically extracted into SQLite FTS5 for content indexing and graph traversal.
              </p>
            </div>
            <span className="text-[10px] font-mono bg-amber-50 text-amber-800 px-2.5 py-1 rounded border border-amber-200 font-bold">
              EARS &amp; Wikilinks
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2">
              <div className="font-bold text-amber-900 text-sm flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-amber-700" />
                <span>1. Event-Driven EARS Pattern</span>
              </div>
              <p className="text-amber-950 leading-relaxed">
                WHEN &lt;trigger event&gt;, THE SYSTEM SHALL &lt;system action&gt;. Extracted as searchable requirement tag facets.
              </p>
              <div className="bg-white p-2.5 rounded border border-amber-200 font-mono text-[11px] text-slate-800">
                - @spec R-1.3 — WHEN customer submits refund request within 30 days, THE SYSTEM SHALL process refund.
              </div>
            </div>

            <div className="p-4 bg-purple-50/60 border border-purple-200 rounded-xl space-y-2">
              <div className="font-bold text-purple-900 text-sm flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-purple-700" />
                <span>2. State-Driven EARS Pattern</span>
              </div>
              <p className="text-purple-950 leading-relaxed">
                WHILE &lt;system state&gt;, THE SYSTEM SHALL &lt;continuous behavior&gt;. Creates trace tags like <code className="font-mono text-purple-800">spec:tasks-012</code>.
              </p>
              <div className="bg-white p-2.5 rounded border border-purple-200 font-mono text-[11px] text-slate-800">
                - @spec TASKS-012 — WHILE in maintenance mode, THE SYSTEM SHALL queue incoming payments.
              </div>
            </div>

            <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
              <div className="font-bold text-blue-900 text-sm flex items-center gap-1.5">
                <ExternalLink className="w-4 h-4 text-blue-700" />
                <span>3. Wikilinks Content Indexing ([[doc]])</span>
              </div>
              <p className="text-blue-950 leading-relaxed">
                <code className="font-mono text-blue-800 font-bold">[[target-page]]</code> links create automatic bidirectional graph edges and tag facets (<code className="font-mono text-blue-800">link:target-page</code>) in FTS5.
              </p>
              <div className="bg-white p-2.5 rounded border border-blue-200 font-mono text-[11px] text-slate-800 space-y-1">
                <div>See details in <span className="text-blue-700 font-bold">[[chargeback-doc]]</span> or <span className="text-blue-700 font-bold">[[stripe-integration|Stripe API]]</span></div>
                <div className="text-[10px] text-slate-500 mt-1">Indexed as: tag &quot;link:chargeback-doc&quot; &amp; graph relationship</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: File & Storage Locations */}
      {activeTab === 'locations' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base">File Locations &amp; Directory Paths</h3>
              <p className="text-xs text-slate-500">
                Key local directories created by <code className="font-mono text-slate-700">local-search</code> for state, caches, and configuration.
              </p>
            </div>
            <span className="text-[10px] font-mono bg-purple-50 text-purple-800 px-2.5 py-1 rounded border border-purple-200 font-bold">
              XDG Standard
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-purple-700 font-bold">~/.local-search/specs.db</span>
              <p className="font-sans text-slate-600 text-[11px]">Primary SQLite database cache storing FTS5 tables, embeddings, and tags.</p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-purple-700 font-bold">~/.local-search/repos</span>
              <p className="font-sans text-slate-600 text-[11px]">Plain text repository registry storing registered folder paths &amp; names.</p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-purple-700 font-bold">.local-search.toml</span>
              <p className="font-sans text-slate-600 text-[11px]">Project directory level CLI scope, weights, and blast depth limits.</p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-purple-700 font-bold">.agent/local-search-config.yaml</span>
              <p className="font-sans text-slate-600 text-[11px]">Claude Code AI skill project scope definition file.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
