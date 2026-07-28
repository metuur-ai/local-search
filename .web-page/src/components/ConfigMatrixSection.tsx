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
  const [activeTab, setActiveTab] = useState<'yaml' | 'ears' | 'locations'>('yaml');

  return (
    <div className="app-container space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-panel via-blue-950 to-panel text-white rounded-2xl p-6 shadow-md border border-panel-edge relative overflow-hidden">
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
              Technical reference for <code className="font-mono text-blue-300">.agent/local-search-config.yaml</code>, storage paths, and EARS requirements annotations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-panel-inset border border-panel-edge p-2.5 rounded-xl font-mono text-[11px] text-blue-200">
              <span className="text-slate-400">Resolution:</span> Walk up, stop at git root
            </div>
          </div>
        </div>

        {/* Tab Selection Row */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-panel-edge overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('yaml')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'yaml'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-panel-inset text-slate-300 hover:bg-panel-raised'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>local-search-config.yaml Scoping</span>
          </button>

          <button
            onClick={() => setActiveTab('ears')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'ears'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-panel-inset text-slate-300 hover:bg-panel-raised'
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
                : 'bg-panel-inset text-slate-300 hover:bg-panel-raised'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5 text-purple-400" />
            <span>Storage &amp; File Paths</span>
          </button>
        </div>
      </div>

      {/* Tab 1: local-search-config.yaml Scoping */}
      {activeTab === 'yaml' && (
        <div className="space-y-5 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Local Workspace Config (.agent/local-search-config.yaml)
                </h3>
                <p className="text-xs text-slate-500">
                  One file, read by both the CLI engine and the Claude Code skill. Pins which repos a bare <code className="font-mono text-slate-700">find</code> or <code className="font-mono text-slate-700">code</code> considers, and tunes ranking weights and result limits.
                </p>
              </div>
              <span className="text-[10px] font-mono bg-blue-50 text-blue-800 px-2.5 py-1 rounded border border-blue-200 font-bold shrink-0">
                YAML · JSON Schema
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="space-y-2">
                <span className="text-xs font-mono font-bold text-slate-700">
                  Sample .agent/local-search-config.yaml
                </span>
                <pre className="bg-panel-inset text-blue-200 p-4 rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto border border-panel-edge">
{`# yaml-language-server: $schema=https://raw.githubusercontent.com/
#   metuur-ai/local-search/main/cli/config/schema/
#   local-search-config.schema.json
repositories:
  - product-specs
  - platform-docs
  - graph:legacy      # graph: prefix = registered external graph

weights:              # optional - omit to take defaults
  specs: 1.0
  graphify: 0.7
  codegraph: 0.8

limits:               # optional
  specs: 20
  graphify: 10
  codegraph: 10
  blast_depth: 2
  blast_cap: 50`}
                </pre>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  The first line is a <strong>modeline</strong>: editors with the YAML language server give you autocomplete, inline docs, and a red squiggle on a typo&apos;d key. <code className="font-mono text-slate-700">local-search config schema</code> prints the schema for air-gapped setups.
                </p>
              </div>

              <div className="space-y-3 text-xs text-slate-700">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <ChevronRight className="w-4 h-4 text-blue-600" />
                    <span>Resolution Order</span>
                  </div>
                  <ol className="text-slate-600 leading-relaxed text-[11px] space-y-0.5 list-decimal list-inside">
                    <li><code className="font-mono text-slate-900">--scope</code> flag on the command</li>
                    <li><code className="font-mono text-slate-900">&lt;cwd&gt;/.agent/local-search-config.yaml</code>, walking up</li>
                    <li><code className="font-mono text-slate-900">~/.local-search-config.yaml</code> global fallback</li>
                    <li>Nearest registered repo enclosing the CWD</li>
                    <li><strong className="text-red-700">Hard error</strong> — never a silent search of every repo</li>
                  </ol>
                  <p className="text-slate-500 text-[11px] pt-1">
                    The walk stops at a git repository root and never reads at <code className="font-mono">$HOME</code> itself, so one stray parent config cannot capture everything beneath it.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <ChevronRight className="w-4 h-4 text-blue-600" />
                    <span>weights: and limits:</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    Every key is optional — an absent key takes its default, and an explicit <code className="font-mono text-blue-700">0</code> is honoured (use it to disable a source). Unknown keys are a hard error with a &quot;did you mean&quot; suggestion, except <code className="font-mono">x-</code> prefixed keys reserved for third-party tooling.
                  </p>
                </div>

                <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 space-y-1">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>Non-destructive writes</span>
                  </div>
                  <p className="text-emerald-900 leading-relaxed text-[11px]">
                    <code className="font-mono">scope set</code> and <code className="font-mono">init --set</code> rewrite only the <code className="font-mono">repositories:</code> list — your weights, limits, comments and key order survive byte-for-byte. Writes are atomic, so a concurrent reader never sees a half-written file.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Defaults table */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Database className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="font-bold text-slate-900 text-base">Keys &amp; Defaults</h3>
                <p className="text-xs text-slate-500">
                  Omitted keys fall back to these values.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4 font-semibold">Key</th>
                    <th className="py-2 pr-4 font-semibold">Section</th>
                    <th className="py-2 pr-4 font-semibold">Default</th>
                    <th className="py-2 font-semibold">Meaning</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {[
                    ['specs', 'weights', '1.0', 'Ranking weight for spec/doc matches'],
                    ['graphify', 'weights', '0.7', 'Ranking weight for graphify-sourced matches'],
                    ['codegraph', 'weights', '0.8', 'Ranking weight for code-review-graph matches'],
                    ['specs', 'limits', '20', 'Max spec results returned'],
                    ['graphify', 'limits', '10', 'Max graphify results returned'],
                    ['codegraph', 'limits', '10', 'Max code-review-graph results returned'],
                    ['blast_depth', 'limits', '2', 'Default traversal depth for code blast'],
                    ['blast_cap', 'limits', '50', 'Default max nodes returned by code blast'],
                  ].map(([key, section, def, meaning]) => (
                    <tr key={`${section}.${key}`} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-4 font-mono text-blue-700 font-semibold">{key}</td>
                      <td className="py-2 pr-4 font-mono text-slate-500">{section}</td>
                      <td className="py-2 pr-4 font-mono text-slate-900">{def}</td>
                      <td className="py-2 text-slate-600">{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gotcha + migration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-2">
              <div className="font-bold text-amber-950 text-sm flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                <span>search reads neither file</span>
              </div>
              <p className="text-xs text-amber-900 leading-relaxed">
                Only <code className="font-mono font-bold">find</code> and <code className="font-mono font-bold">code</code> resolve scope. <code className="font-mono font-bold">local-search search</code> takes <code className="font-mono">--repos</code>, defaulting to <code className="font-mono">all</code> — which is why the Claude Code skill appends <code className="font-mono">--repos &lt;list&gt;</code> by hand to every search call.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-2">
              <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-600" />
                <span>Migrating from .local-search.toml (v0.3.x)</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Three files became one in v0.4.0. Any <code className="font-mono">.local-search.toml</code> is migrated automatically on the first config read after upgrade, then deleted. Preview with <code className="font-mono text-slate-900">config migrate --dry-run</code>, or opt out with <code className="font-mono text-slate-900">LOCAL_SEARCH_NO_AUTO_MIGRATE=1</code>. Migration refuses to delete a TOML it could not parse.
              </p>
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
              <span className="text-purple-700 font-bold">&lt;project&gt;/.agent/local-search-config.yaml</span>
              <p className="font-sans text-slate-600 text-[11px]">Per-project scope, weights and limits, found by walking up. Read by the engine <strong>and</strong> the Claude Code skill.</p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-purple-700 font-bold">~/.local-search-config.yaml</span>
              <p className="font-sans text-slate-600 text-[11px]">Global fallback, same schema, used when no project config is found.</p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-purple-700 font-bold">~/.local-search/ui.pid &amp; ui.log</span>
              <p className="font-sans text-slate-600 text-[11px]">Written by <code className="font-mono">local-search ui</code>; how <code className="font-mono">ui stop</code> and <code className="font-mono">ui status</code> find the daemon.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
