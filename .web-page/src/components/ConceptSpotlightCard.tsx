import React from 'react';
import { AudienceLevel } from '../types';
import { Lightbulb, Cpu, ShieldCheck, Zap, Layers, Sparkles, BookOpen } from 'lucide-react';

interface ConceptSpotlightCardProps {
  audienceLevel: AudienceLevel;
  currentStepId: number;
}

export const ConceptSpotlightCard: React.FC<ConceptSpotlightCardProps> = ({
  audienceLevel,
  currentStepId,
}) => {
  return (
    <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-5 flex flex-col shadow-xs relative overflow-hidden h-full">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 bg-emerald-600 text-white rounded-lg flex items-center justify-center font-bold shadow-xs">
          {audienceLevel === 'beginner' ? (
            <Lightbulb className="w-4 h-4 text-emerald-100" />
          ) : (
            <Cpu className="w-4 h-4 text-emerald-100" />
          )}
        </div>
        <div>
          <h4 className="font-bold text-emerald-950 text-sm sm:text-base">
            {audienceLevel === 'beginner' ? 'Beginner-Friendly Insight' : 'Technical Advantage & Architecture'}
          </h4>
          <span className="text-[10px] font-mono text-emerald-700 uppercase tracking-wider font-semibold">
            {audienceLevel === 'beginner' ? 'Plain English Analogy' : 'Under the Hood Mechanics'}
          </span>
        </div>
      </div>

      {/* Dynamic Content based on Step & Audience */}
      <div className="flex-1 space-y-3 text-xs text-emerald-900 leading-relaxed">
        {audienceLevel === 'beginner' ? (
          <>
            {currentStepId === 1 && (
              <p>
                Imagine a library where every book is instantly indexed as soon as you put it on the shelf. Instead of searching letter-by-letter, the librarian understands word roots — so searching for <strong>&quot;running&quot;</strong> finds books mentioning <strong>&quot;run&quot;</strong>, <strong>&quot;ran&quot;</strong>, or <strong>&quot;runner&quot;</strong> in less than a blink (~30ms)!
              </p>
            )}
            {currentStepId === 2 && (
              <p>
                Think of <strong>Graph Only Mode</strong> like looking up an address directly in a phonebook — instant and exact. <strong>AI Answer Mode</strong> is like asking a knowledgeable assistant who reads the relevant pages first and summarizes the exact policy with clear bookmark citations!
              </p>
            )}
            {currentStepId === 3 && (
              <p>
                A knowledge graph is like a mind map for your company&apos;s documentation. <strong>Solid Teal lines</strong> show connections explicitly drawn by engineers (like dependencies), while <strong>Dashed Amber lines</strong> point out missing documents that haven&apos;t been written yet!
              </p>
            )}
            {currentStepId === 4 && (
              <p>
                Requirement tags like <code>@spec R-1.3</code> are like smart stickers. When you stick <code>@spec R-1.3</code> onto a design document, the system automatically collects all related files into one clickable collection.
              </p>
            )}
            {currentStepId === 5 && (
              <p>
                Diagram images like <code>refund-diagram.png</code> get a partner text file <code>refund-diagram.md</code>. Whatever you write in the partner text file makes the image fully searchable!
              </p>
            )}

            <div className="p-3 bg-white/80 rounded-xl border border-emerald-200/80 space-y-1">
              <div className="font-bold text-emerald-950 flex items-center gap-1.5 text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>100% Offline & Private</span>
              </div>
              <p className="text-[11px] text-emerald-800">
                All index data stays strictly on your machine in <code>~/.local-search/specs.db</code>. No sensitive specs ever leave your hardware.
              </p>
            </div>
          </>
        ) : (
          <>
            {currentStepId === 1 && (
              <p>
                SQLite FTS5 uses a <strong>Porter Stemmer</strong> tokenizer combined with standard <strong>BM25 Okapi scoring</strong>. Query syntax supports prefix matching (<code>auth*</code>), boolean operators (<code>OR/NOT</code>), exact phrases, and automatic literal fallbacks on punctuation errors.
              </p>
            )}
            {currentStepId === 2 && (
              <p>
                <strong>Graph-aware ranking</strong> calculates node degree centrality from frontmatter (<code>dependsOn</code>, <code>relationships</code>) and boosts hub specs. <strong>Hybrid Search</strong> combines vector cosine similarity over 256-d feature hashed vectors with BM25 using <strong>Reciprocal Rank Fusion (RRF)</strong>: <code>score = 1 / (60 + rank)</code>.
              </p>
            )}
            {currentStepId === 3 && (
              <p>
                The merged graph exports via <code>local-search graph export-view</code> into <code>web/data/graph.json</code>. Node IDs are namespaced by repository (<code>&lt;repo&gt;:&lt;id&gt;</code>) to avoid cross-repo collisions while maintaining 1-hop neighborhood traversals via <code>local-search graph explain</code>.
              </p>
            )}
            {currentStepId === 4 && (
              <p>
                Annotations following the EARS standard (e.g., <code>@spec R-1.3</code>) are parsed during markdown index scans and emitted as <code>spec:r-1.3</code> tags. Fenced code blocks are automatically stripped to avoid false positive tags from sample code.
              </p>
            )}
            {currentStepId === 5 && (
              <p>
                Project boundary resolution uses <code>.local-search.toml</code> for CLI resolution order (flag &gt; CWD walk-up &gt; global default) and <code>.agent/local-search-config.yaml</code> for the Claude Code skill runner.
              </p>
            )}

            <div className="mt-auto pt-2 border-t border-emerald-200/80 flex justify-between items-center text-[10px] font-mono text-emerald-800">
              <span>LATENCY: ~12ms - 30ms</span>
              <span>INDEX: SQLite FTS5 (Pure Go)</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
