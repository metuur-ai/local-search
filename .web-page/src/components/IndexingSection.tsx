import React from 'react';
import {
  Database,
  Cpu,
  Zap,
  ShieldCheck,
  Tag,
  CheckCircle2,
  Layers,
} from 'lucide-react';

/**
 * "How we Index" — the indexing mechanics that used to live behind the
 * CLI Terminal Explorer's third sub-tab. Promoted to a top-level section
 * because it explains the engine rather than the CLI surface.
 */
export const IndexingSection: React.FC = () => {
  return (
    <div className="app-container space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-panel text-white rounded-2xl p-6 shadow-md border border-panel-edge relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#34d399_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1 bg-emerald-500/20 text-emerald-300 rounded-md">
                <Layers className="w-4 h-4" />
              </span>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-300">
                Engine Internals
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight font-sans">
              How we Index
            </h2>
            <p className="text-xs text-slate-300">
              From markdown on disk to a ranked answer: tokenizing, scoring, and the
              requirement tags and wikilinks that become graph edges.
            </p>
          </div>

          <div className="bg-panel-inset border border-panel-edge p-2.5 rounded-xl font-mono text-[11px] text-emerald-200 shrink-0">
            <span className="text-slate-400">Store:</span> ~/.local-search/specs.db
          </div>
        </div>
      </div>

      {/* SQLite FTS5 Mechanics */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Database className="w-5 h-5 text-emerald-600" />
          <div>
            <h3 className="font-bold text-slate-900 text-base">How the Local Index Works</h3>
            <p className="text-xs text-slate-500">
              Fast, fully offline SQLite FTS5 engine storing specifications in{' '}
              <code className="font-mono text-slate-700">~/.local-search/specs.db</code>.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
              <Cpu className="w-4 h-4" />
              <span>1. SQLite FTS5 &amp; Porter Stemmer</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              The local engine parses markdown documents into{' '}
              <code className="font-mono text-emerald-700">~/.local-search/specs.db</code>. Words
              are tokenized with <code className="font-mono">unicode61</code> and Porter Stemming,
              so queries for &quot;refunding&quot; or &quot;refunds&quot; automatically match
              &quot;refund&quot;.
            </p>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[10px] text-slate-700">
              Stemming Rule: &quot;processing&quot; → &quot;process&quot;
              <br />
              Fallback: Punctuation syntax errors are auto-quoted &amp; retried.
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center gap-1.5 text-blue-700 font-bold">
              <Zap className="w-4 h-4" />
              <span>2. BM25, then RRF fusion</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              BM25 runs first and produces a candidate list. With{' '}
              <code className="font-mono text-blue-700">--semantic</code>, each candidate&apos;s
              256-d feature-hashed vector is scored by cosine similarity, and the two{' '}
              <strong>rankings</strong> are fused with Reciprocal Rank Fusion — position only,
              never the raw BM25 or cosine value.
            </p>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[10px] text-slate-700">
              score = 1 / (60 + rank_fts) + 1 / (60 + rank_vec)
              <br />
              Zero-vector query → quiet fallback to plain FTS order.
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center gap-1.5 text-purple-700 font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>3. Disposable &amp; Rebuildable Cache</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Markdown files on disk remain the absolute source of truth. The SQLite database is
              100% disposable and can be deleted or rebuilt anytime using{' '}
              <code className="font-mono text-purple-700">local-search scan</code> (aliases{' '}
              <code className="font-mono text-purple-700">rebuild</code>,{' '}
              <code className="font-mono text-purple-700">index</code>) without data loss.
            </p>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[10px] text-slate-700">
              Safety: Deleting specs.db loses zero source data.
              <br />
              Incremental: Auto-detects git HEAD changes on search.
            </div>
          </div>
        </div>
      </div>

      {/* Graph-aware ranking */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Layers className="w-5 h-5 text-blue-600" />
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              What <code className="font-mono text-blue-700">auto</code> resolves to
            </h3>
            <p className="text-xs text-slate-500">
              When a repo has a registered <code className="font-mono">graphify-out/</code> graph,
              the defaults change on their own — and the status line above every result says which
              way they went.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200 space-y-2">
            <h4 className="font-bold text-blue-900 text-sm">--source auto</h4>
            <p className="text-blue-950 leading-relaxed">
              Resolves to <code className="font-mono font-bold">both</code> (specs + graph) when any
              selected repo has a graph registered, otherwise{' '}
              <code className="font-mono font-bold">fts</code> (specs only).
            </p>
          </div>

          <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-2">
            <h4 className="font-bold text-emerald-900 text-sm">--rank auto</h4>
            <p className="text-emerald-950 leading-relaxed">
              Resolves to <code className="font-mono font-bold">graph-aware</code> when a graph
              exists — specs matching well-connected hub nodes get boosted — otherwise plain{' '}
              <code className="font-mono font-bold">bm25</code>.
            </p>
          </div>

          <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200 space-y-2">
            <h4 className="font-bold text-amber-900 text-sm">They don&apos;t combine</h4>
            <p className="text-amber-950 leading-relaxed">
              Graph-aware ranking and <code className="font-mono font-bold">--semantic</code> assume
              opposite ordering conventions. When both are in play,{' '}
              <strong>semantic wins</strong> for that query.
            </p>
          </div>
        </div>

        <div className="bg-panel-inset border border-panel-edge rounded-xl p-3 font-mono text-[11px] text-slate-200 overflow-x-auto">
          <span className="text-blue-300">
            [source=both · rank=graph-aware · repos=3 (2 with graphs)]
          </span>
          <span className="text-slate-400"> ← printed above every result list</span>
        </div>
      </div>

      {/* EARS Tag & Wikilinks Mechanics */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Tag className="w-5 h-5 text-purple-600" />
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              Requirement Tags (@spec) &amp; Wikilinks ([[doc]]) Mechanics
            </h3>
            <p className="text-xs text-slate-500">
              How inline requirement annotations and cross-document Wikilinks become searchable
              facets and knowledge graph edges across all repositories.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-amber-50/80 rounded-xl border border-amber-200 space-y-2">
            <h4 className="font-bold text-amber-900 text-sm flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-amber-700" />
              <span>1. EARS Requirement Extraction</span>
            </h4>
            <p className="text-amber-950 leading-relaxed">
              When scanning markdown files, <code className="font-mono font-bold">local-search</code>{' '}
              parses inline Easy Approach to Requirements Syntax (EARS) tags formatted as{' '}
              <code className="font-mono bg-white px-1 py-0.5 rounded text-amber-800">
                @spec &lt;ID&gt;
              </code>
              .
            </p>
            <div className="bg-white p-3 rounded-lg border border-amber-200 font-mono text-[11px] text-slate-800 space-y-1">
              <div>
                - <span className="text-amber-700 font-bold">@spec R-1.3</span> — WHEN customer
                submits refund request within 30 days, THE SYSTEM SHALL process refund.
              </div>
              <div>
                - <span className="text-amber-700 font-bold">@spec TASKS-012</span> — WHEN refund
                exceeds $500, THE SYSTEM SHALL require manager approval.
              </div>
            </div>
          </div>

          <div className="p-4 bg-purple-50/80 rounded-xl border border-purple-200 space-y-2">
            <h4 className="font-bold text-purple-900 text-sm flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-purple-700" />
              <span>2. Traceability &amp; Facet Filtering</span>
            </h4>
            <p className="text-purple-950 leading-relaxed">
              Extracted requirement IDs automatically create searchable tag facets (
              <code className="font-mono text-purple-800 bg-white px-1 rounded">spec:r-1.3</code>).
              Developers and automated test runners can query tags to verify compliance.
            </p>
            <div className="bg-white p-3 rounded-lg border border-purple-200 font-mono text-[11px] text-slate-800 space-y-1">
              <div>
                <span className="text-purple-700 font-bold">$ local-search tags spec:r-1.3</span>
              </div>
              <div className="text-slate-500">payments/refund.md (spec)</div>
              <div className="text-slate-500">billing/override.md (architecture decision)</div>
            </div>
          </div>

          <div className="p-4 bg-blue-50/80 rounded-xl border border-blue-200 space-y-2">
            <h4 className="font-bold text-blue-900 text-sm flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-blue-700" />
              <span>3. Wikilinks Indexing ([[target]])</span>
            </h4>
            <p className="text-blue-950 leading-relaxed">
              Inline <code className="font-mono font-bold text-blue-800">[[target-page]]</code> links
              are indexed as document relationship edges and searchable tag facets (
              <code className="font-mono text-blue-800 bg-white px-1 rounded">link:target-page</code>
              ).
            </p>
            <div className="bg-white p-3 rounded-lg border border-blue-200 font-mono text-[11px] text-slate-800 space-y-1">
              <div>
                <span className="text-blue-700 font-bold">
                  $ local-search tags link:chargeback-doc
                </span>
              </div>
              <div className="text-slate-500">payments/refund.md → chargeback.md</div>
              <div className="text-slate-500">Indexed in graph &amp; FTS5 text tables</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
