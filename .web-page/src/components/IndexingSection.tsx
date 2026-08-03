import React from 'react';
import {
  Database,
  Cpu,
  Zap,
  ShieldCheck,
  Tag,
  CheckCircle2,
  Layers,
  ArrowRight,
  ArrowLeft,
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
      <div className="bg-panel text-panel-ink rounded-card p-6 shadow-2xs border border-panel-edge relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(var(--color-accent)_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1 bg-panel-raised text-syntax-string rounded-input">
                <Layers className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-syntax-string">
                Engine Internals
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">
              How we Index
            </h2>
            <p className="text-sm text-panel-ink-2">
              From markdown on disk to a ranked answer: tokenizing, scoring, and the
              requirement tags and wikilinks that become graph edges.
            </p>
          </div>

          <div className="bg-panel-inset border border-panel-edge p-2.5 rounded-input font-mono text-[11px] text-syntax-string shrink-0">
            <span className="text-panel-ink-3">Store:</span> ~/.local-search/specs.db
          </div>
        </div>
      </div>

      {/* SQLite FTS5 Mechanics */}
      <div className="bg-white border border-rule rounded-card p-6 space-y-4 shadow-2xs">
        <div className="flex items-center gap-2 border-b border-rule pb-3">
          <Database className="w-5 h-5 text-accent" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-ink text-base">How the Local Index Works</h3>
            <p className="text-sm text-ink-3">
              Fast, fully offline SQLite FTS5 engine storing specifications in{' '}
              <code className="font-mono text-ink-2">~/.local-search/specs.db</code>.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-4 bg-paper-2 rounded-card border border-rule space-y-2">
            <div className="flex items-center gap-1.5 text-accent-ink font-bold">
              <Cpu className="w-4 h-4" aria-hidden="true" />
              <span>1. SQLite FTS5 &amp; Porter Stemmer</span>
            </div>
            <p className="text-ink-2 leading-relaxed">
              The local engine parses markdown documents into{' '}
              <code className="font-mono text-accent-ink">~/.local-search/specs.db</code>. Words
              are tokenized with <code className="font-mono">unicode61</code> and Porter Stemming,
              so queries for &quot;refunding&quot; or &quot;refunds&quot; automatically match
              &quot;refund&quot;.
            </p>
            <div className="bg-white p-2.5 rounded-input border border-rule font-mono text-[11px] text-ink-2">
              <span className="inline-flex items-center gap-1">
                Stemming Rule: &quot;processing&quot; <ArrowRight className="w-3 h-3 inline shrink-0" aria-hidden="true" /> &quot;process&quot;
              </span>
              <br />
              Fallback: Punctuation syntax errors are auto-quoted &amp; retried.
            </div>
          </div>

          <div className="p-4 bg-paper-2 rounded-card border border-rule space-y-2">
            <div className="flex items-center gap-1.5 text-info-ink font-bold">
              <Zap className="w-4 h-4" aria-hidden="true" />
              <span>2. BM25, then RRF fusion</span>
            </div>
            <p className="text-ink-2 leading-relaxed">
              BM25 runs first and produces a candidate list. With{' '}
              <code className="font-mono text-info-ink">--semantic</code>, each candidate&apos;s
              256-d feature-hashed vector is scored by cosine similarity, and the two{' '}
              <strong>rankings</strong> are fused with Reciprocal Rank Fusion — position only,
              never the raw BM25 or cosine value.
            </p>
            <div className="bg-white p-2.5 rounded-input border border-rule font-mono text-[11px] text-ink-2">
              score = 1 / (60 + rank_fts) + 1 / (60 + rank_vec)
              <br />
              <span className="inline-flex items-center gap-1">
                Zero-vector query <ArrowRight className="w-3 h-3 inline shrink-0" aria-hidden="true" /> quiet fallback to plain FTS order.
              </span>
            </div>
          </div>

          <div className="p-4 bg-paper-2 rounded-card border border-rule space-y-2">
            <div className="flex items-center gap-1.5 text-ink font-bold">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              <span>3. Disposable &amp; Rebuildable Cache</span>
            </div>
            <p className="text-ink-2 leading-relaxed">
              Markdown files on disk remain the absolute source of truth. The SQLite database is
              100% disposable and can be deleted or rebuilt anytime using{' '}
              <code className="font-mono text-ink-2">local-search scan</code> (aliases{' '}
              <code className="font-mono text-ink-2">rebuild</code>,{' '}
              <code className="font-mono text-ink-2">index</code>) without data loss.
            </p>
            <div className="bg-white p-2.5 rounded-input border border-rule font-mono text-[11px] text-ink-2">
              Safety: Deleting specs.db loses zero source data.
              <br />
              Incremental: Auto-detects git HEAD changes on search.
            </div>
          </div>
        </div>
      </div>

      {/* Graph-aware ranking */}
      <div className="bg-white border border-rule rounded-card p-6 space-y-4 shadow-2xs">
        <div className="flex items-center gap-2 border-b border-rule pb-3">
          <Layers className="w-5 h-5 text-info" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-ink text-base">
              What <code className="font-mono text-info-ink">auto</code> resolves to
            </h3>
            <p className="text-sm text-ink-3">
              When a repo has a registered <code className="font-mono">graphify-out/</code> graph,
              the defaults change on their own — and the status line above every result says which
              way they went.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-4 bg-info-soft rounded-card border border-info/25 space-y-2">
            <h4 className="font-bold text-info-ink text-sm">--source auto</h4>
            <p className="text-info-ink leading-relaxed">
              Resolves to <code className="font-mono font-bold">both</code> (specs + graph) when any
              selected repo has a graph registered, otherwise{' '}
              <code className="font-mono font-bold">fts</code> (specs only).
            </p>
          </div>

          <div className="p-4 bg-accent-soft rounded-card border border-accent/25 space-y-2">
            <h4 className="font-bold text-accent-ink text-sm">--rank auto</h4>
            <p className="text-accent-ink leading-relaxed">
              Resolves to <code className="font-mono font-bold">graph-aware</code> when a graph
              exists — specs matching well-connected hub nodes get boosted — otherwise plain{' '}
              <code className="font-mono font-bold">bm25</code>.
            </p>
          </div>

          <div className="p-4 bg-warn-soft rounded-card border border-warn/25 space-y-2">
            <h4 className="font-bold text-warn-ink text-sm">They don&apos;t combine</h4>
            <p className="text-warn-ink leading-relaxed">
              Graph-aware ranking and <code className="font-mono font-bold">--semantic</code> assume
              opposite ordering conventions. When both are in play,{' '}
              <strong>semantic wins</strong> for that query.
            </p>
          </div>
        </div>

        <div className="bg-panel-inset border border-panel-edge rounded-input p-3 font-mono text-[11px] text-panel-ink overflow-x-auto">
          <span className="text-syntax-keyword">
            [source=both · rank=graph-aware · repos=3 (2 with graphs)]
          </span>
          <span className="text-panel-ink-3 inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3 shrink-0" aria-hidden="true" /> printed above every result list
          </span>
        </div>
      </div>

      {/* EARS Tag & Wikilinks Mechanics */}
      <div className="bg-white border border-rule rounded-card p-6 space-y-4 shadow-2xs">
        <div className="flex items-center gap-2 border-b border-rule pb-3">
          <Tag className="w-5 h-5 text-ink-2" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-ink text-base">
              Requirement Tags (@spec) &amp; Wikilinks ([[doc]]) Mechanics
            </h3>
            <p className="text-sm text-ink-3">
              How inline requirement annotations and cross-document Wikilinks become searchable
              facets and knowledge graph edges across all repositories.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-4 bg-warn-soft rounded-card border border-warn/25 space-y-2">
            <h4 className="font-bold text-warn-ink text-sm flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span>1. EARS Requirement Extraction</span>
            </h4>
            <p className="text-warn-ink leading-relaxed">
              When scanning markdown files, <code className="font-mono font-bold">local-search</code>{' '}
              parses inline Easy Approach to Requirements Syntax (EARS) tags formatted as{' '}
              <code className="font-mono bg-white px-1 py-0.5 rounded-input text-warn-ink">
                @spec &lt;ID&gt;
              </code>
              .
            </p>
            <div className="bg-white p-3 rounded-input border border-warn/25 font-mono text-[11px] text-ink-2 space-y-1">
              <div>
                - <span className="text-warn-ink font-bold">@spec R-1.3</span> — WHEN customer
                submits refund request within 30 days, THE SYSTEM SHALL process refund.
              </div>
              <div>
                - <span className="text-warn-ink font-bold">@spec TASKS-012</span> — WHEN refund
                exceeds $500, THE SYSTEM SHALL require manager approval.
              </div>
            </div>
          </div>

          <div className="p-4 bg-paper-2 rounded-card border border-rule space-y-2">
            <h4 className="font-bold text-ink text-sm flex items-center gap-1.5">
              <Tag className="w-4 h-4" aria-hidden="true" />
              <span>2. Traceability &amp; Facet Filtering</span>
            </h4>
            <p className="text-ink-2 leading-relaxed">
              Extracted requirement IDs automatically create searchable tag facets (
              <code className="font-mono text-ink-2 bg-white px-1 rounded-input">spec:r-1.3</code>).
              Developers and automated test runners can query tags to verify compliance.
            </p>
            <div className="bg-white p-3 rounded-input border border-rule font-mono text-[11px] text-ink-2 space-y-1">
              <div>
                <span className="text-ink font-bold">$ local-search tags spec:r-1.3</span>
              </div>
              <div className="text-ink-3">payments/refund.md (spec)</div>
              <div className="text-ink-3">billing/override.md (architecture decision)</div>
            </div>
          </div>

          <div className="p-4 bg-info-soft rounded-card border border-info/25 space-y-2">
            <h4 className="font-bold text-info-ink text-sm flex items-center gap-1.5">
              <Tag className="w-4 h-4" aria-hidden="true" />
              <span>3. Wikilinks Indexing ([[target]])</span>
            </h4>
            <p className="text-info-ink leading-relaxed">
              Inline <code className="font-mono font-bold text-info-ink">[[target-page]]</code> links
              are indexed as document relationship edges and searchable tag facets (
              <code className="font-mono text-info-ink bg-white px-1 rounded-input">link:target-page</code>
              ).
            </p>
            <div className="bg-white p-3 rounded-input border border-info/25 font-mono text-[11px] text-ink-2 space-y-1">
              <div>
                <span className="text-info-ink font-bold">
                  $ local-search tags link:chargeback-doc
                </span>
              </div>
              <div className="text-ink-3 inline-flex items-center gap-1">
                payments/refund.md <ArrowRight className="w-3 h-3 inline shrink-0" aria-hidden="true" /> chargeback.md
              </div>
              <div className="text-ink-3">Indexed in graph &amp; FTS5 text tables</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
