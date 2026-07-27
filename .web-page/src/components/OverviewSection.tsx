import React, { useState } from 'react';
import { AudienceLevel } from '../types';
import {
  HelpCircle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Database,
  Cpu,
  Terminal,
  Share2,
  Sparkles,
  ShieldCheck,
  Zap,
  Layers,
  FileCode,
  Tag,
  BookOpen,
} from 'lucide-react';

interface OverviewSectionProps {
  audienceLevel: AudienceLevel;
  onNavigateTab: (tab: 'search' | 'cli' | 'graph' | 'workflows' | 'config') => void;
}

export const OverviewSection: React.FC<OverviewSectionProps> = ({
  audienceLevel,
  onNavigateTab,
}) => {
  const [activeQuestion, setActiveQuestion] = useState<'why' | 'what' | 'how'>('why');

  return (
    <div className="space-y-6 pb-12 max-w-[90%] w-full mx-auto">
      {/* Dark Hero Banner Header */}
      <div className="bg-slate-950 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-xl relative overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-mono font-bold tracking-wider uppercase">
                CONCEPT GUIDE
              </span>
              <span className="text-slate-400 text-xs">For Engineers, Managers & AI Coding Agents</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-50 tracking-tight leading-tight">
              local-search: <span className="text-emerald-400">Why</span>, <span className="text-blue-400">What</span> & <span className="text-amber-400">How</span>
            </h1>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Understand <code className="text-emerald-300 font-mono">local-search</code> in 3 straightforward questions. Discover why git-native offline retrieval beats cloud documentation drift, what technology powers it, and how to use it with your team and AI tools.
            </p>
          </div>

          <div className="flex sm:flex-col gap-2 shrink-0">
            <button
              onClick={() => onNavigateTab('search')}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              <span>Try Live Search Sandbox</span>
            </button>
            <button
              onClick={() => onNavigateTab('cli')}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Terminal className="w-4 h-4 text-blue-400" />
              <span>Launch CLI Simulator</span>
            </button>
          </div>
        </div>

        {/* 3 Interactive Question Tabs */}
        <div className="mt-8 pt-6 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => setActiveQuestion('why')}
            className={`p-3.5 rounded-2xl text-left border transition-all flex items-center gap-3 cursor-pointer ${
              activeQuestion === 'why'
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-100 shadow-md ring-1 ring-emerald-500/50'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
              activeQuestion === 'why' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
              1
            </div>
            <div>
              <div className="font-bold text-xs uppercase tracking-wider text-emerald-400">1. WHY</div>
              <div className="text-sm font-semibold text-slate-100">Why does this exist?</div>
            </div>
          </button>

          <button
            onClick={() => setActiveQuestion('what')}
            className={`p-3.5 rounded-2xl text-left border transition-all flex items-center gap-3 cursor-pointer ${
              activeQuestion === 'what'
                ? 'bg-blue-950/80 border-blue-500 text-blue-100 shadow-md ring-1 ring-blue-500/50'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
              activeQuestion === 'what' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
              2
            </div>
            <div>
              <div className="font-bold text-xs uppercase tracking-wider text-blue-400">2. WHAT</div>
              <div className="text-sm font-semibold text-slate-100">What is local-search?</div>
            </div>
          </button>

          <button
            onClick={() => setActiveQuestion('how')}
            className={`p-3.5 rounded-2xl text-left border transition-all flex items-center gap-3 cursor-pointer ${
              activeQuestion === 'how'
                ? 'bg-amber-950/80 border-amber-500 text-amber-100 shadow-md ring-1 ring-amber-500/50'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
              activeQuestion === 'how' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
              3
            </div>
            <div>
              <div className="font-bold text-xs uppercase tracking-wider text-amber-400">3. HOW</div>
              <div className="text-sm font-semibold text-slate-100">How do I use it?</div>
            </div>
          </button>
        </div>
      </div>

      {/* Dynamic Content Panel based on Selected Question */}
      {activeQuestion === 'why' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Side-by-Side Problem vs Solution Banner */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* The Old Problem Card */}
            <div className="bg-red-50/80 border border-red-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-red-100 text-red-600 rounded-xl flex items-center justify-center font-bold">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-red-950 text-base">THE OLD PROBLEM (Without local-search)</h3>
                  <span className="text-xs text-red-700">Documentation Drift & Context Fragmentation</span>
                </div>
              </div>

              <ul className="space-y-2.5 text-xs text-red-900 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">•</span>
                  <span><strong>Documentation Drift:</strong> PRDs and specs live in Notion or Google Docs, separated from the code in Git. Over time, docs become outdated and untrusted.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">•</span>
                  <span><strong>Cloud AI Hallucinations:</strong> AI coding assistants generate wrong code because they lack precise, grounded local specification context.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">•</span>
                  <span><strong>Keyword Blindspots:</strong> Standard regex or simple grep misses word stems (e.g., searching &quot;refund&quot; misses &quot;refunded&quot; or &quot;refunding&quot;).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">•</span>
                  <span><strong>Privacy & Speed Limits:</strong> Sending internal specs to third-party cloud servers is slow, expensive, and risks IP compliance leaks.</span>
                </li>
              </ul>
            </div>

            {/* The Solution Card */}
            <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-emerald-950 text-base">THE SOLUTION (Git-Native local-search)</h3>
                  <span className="text-xs text-emerald-700">100% Offline, Fast & Explainable Indexing</span>
                </div>
              </div>

              <ul className="space-y-2.5 text-xs text-emerald-900 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">•</span>
                  <span><strong>Co-located Specs in Git:</strong> Specifications live alongside code as standard Markdown files in your repositories.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">•</span>
                  <span><strong>Zero-Cloud Privacy & ~12ms Speed:</strong> All index data stays strictly on your computer inside <code className="bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-900 font-mono">~/.local-search/specs.db</code>.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">•</span>
                  <span><strong>Porter Stemming & Graph Boost:</strong> Automatic BM25 stem matching plus graph centrality boosts hub specifications.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">•</span>
                  <span><strong>EARS Requirement Tracking:</strong> Parses <code className="bg-emerald-100 px-1 py-0.5 rounded font-mono">@spec R-1.3</code> requirement tags directly from Markdown.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Core Why Takeaway Banner */}
          <div className="bg-blue-50 border border-blue-200/80 rounded-2xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-blue-950 text-sm">Key Takeaway: Why local-search Matters</h4>
                <p className="text-xs text-blue-800">
                  By keeping specifications inside Git and indexing them locally in a disposable SQLite database, both humans and AI coding agents get single-source-of-truth answers in milliseconds.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveQuestion('what')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl transition-all shrink-0 flex items-center gap-1.5"
            >
              <span>Next: What is it?</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {activeQuestion === 'what' && (
        <div className="space-y-6 animate-fadeIn">
          {/* 4 Pillars Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Pillar 1 */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs hover:border-blue-300 transition-all">
              <div className="w-9 h-9 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center text-blue-600 font-bold">
                <Database className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Pillar A: Pure Go & SQLite FTS5</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Uses SQLite&apos;s FTS5 extension with a Porter Stemmer. Matches root words (&quot;refund&quot; finds &quot;refunding&quot;) using standard BM25 Okapi relevance scoring.
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs hover:border-emerald-300 transition-all">
              <div className="w-9 h-9 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center text-emerald-600 font-bold">
                <Share2 className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Pillar B: Knowledge Graph</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Parses YAML frontmatter dependencies (<code className="text-emerald-700">dependsOn</code>, <code className="text-emerald-700">relationships</code>) into an in-memory node-link graph with PageRank boost.
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs hover:border-purple-300 transition-all">
              <div className="w-9 h-9 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-center text-purple-600 font-bold">
                <Sparkles className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Pillar C: Grounded AI Answers</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Synthesizes clear text answers grounded strictly in retrieved local source documents with clickable provenance citations (<code className="text-purple-700">[repo:file.md]</code>).
              </p>
            </div>

            {/* Pillar 4 */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs hover:border-amber-300 transition-all">
              <div className="w-9 h-9 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-center text-amber-600 font-bold">
                <Tag className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Pillar D: @spec & Media Sidecars</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Extracts requirement tags (<code className="text-amber-700">@spec R-1.3</code>) and pairs visual diagrams (<code className="text-amber-700">arch.png</code> + <code className="text-amber-700">arch.md</code>) for full text searchability.
              </p>
            </div>
          </div>

          {/* Under the hood technical architecture box */}
          <div className="bg-slate-900 text-slate-200 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-blue-400" />
                <h4 className="font-bold text-slate-100 text-sm">Under the Hood Architecture</h4>
              </div>
              <span className="font-mono text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                Reciprocal Rank Fusion (RRF)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="text-blue-400 font-mono font-bold">1. Full-Text BM25</div>
                <p className="text-slate-400 text-[11px]">
                  SQLite FTS5 scans tokenized terms, applying length normalization and term frequency weighting across title, tags, and content fields.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="text-emerald-400 font-mono font-bold">2. Graph Centrality</div>
                <p className="text-slate-400 text-[11px]">
                  Calculates node degree centrality from frontmatter fields. High-degree hub specs receive up to 1.5x rank multiplier.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="text-amber-400 font-mono font-bold">3. RRF Fusion Score</div>
                <p className="text-slate-400 text-[11px]">
                  Merges BM25 and vector similarity ranks: <code className="text-amber-300">score = 1 / (60 + rank_fts) + 1 / (60 + rank_vec)</code>.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center font-bold shrink-0">
                <Terminal className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-amber-950 text-sm">Ready to see how to use it?</h4>
                <p className="text-xs text-amber-800">
                  Explore how developers run local-search from terminal or connect it to Claude Code as an automated AI agent skill.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveQuestion('how')}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-xl transition-all shrink-0 flex items-center gap-1.5"
            >
              <span>Next: How do I use it?</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {activeQuestion === 'how' && (
        <div className="space-y-6 animate-fadeIn">
          {/* 3 Entry points */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Entry 1: CLI Terminal */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
              <div className="w-10 h-10 bg-slate-900 text-emerald-400 rounded-xl flex items-center justify-center font-bold font-mono">
                $&gt;
              </div>
              <h3 className="font-bold text-slate-900 text-base">1. Terminal CLI Commands</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Run automated search and spec inspections directly from your terminal terminal without requiring cloud network requests.
              </p>

              <div className="bg-slate-950 text-slate-200 p-3 rounded-xl font-mono text-[11px] space-y-1 border border-slate-800">
                <div className="text-emerald-400">$ local-search repo add ./docs</div>
                <div className="text-blue-300">$ local-search search &quot;refund&quot;</div>
                <div className="text-slate-400">$ local-search graph explain &quot;ref&quot;</div>
              </div>

              <button
                onClick={() => onNavigateTab('cli')}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
              >
                <span>Open Terminal Explorer</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              </button>
            </div>

            {/* Entry 2: Agent OS Skill */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
              <div className="w-10 h-10 bg-purple-100 text-purple-700 rounded-xl flex items-center justify-center font-bold">
                <Cpu className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">2. Claude Code AI Skill</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Connect local-search as a custom tool via <code className="text-purple-700 font-mono">.agent/local-search-config.yaml</code> so your AI agent reads specs before writing code.
              </p>

              <div className="bg-slate-950 text-purple-200 p-3 rounded-xl font-mono text-[11px] space-y-1 border border-slate-800">
                <div className="text-slate-400"># .agent/local-search-config.yaml</div>
                <div className="text-purple-300">name: local-search</div>
                <div className="text-purple-300">command: local-search search</div>
              </div>

              <button
                onClick={() => onNavigateTab('config')}
                className="w-full py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
              >
                <span>View Config & Skill Matrix</span>
                <ArrowRight className="w-3.5 h-3.5 text-purple-600" />
              </button>
            </div>

            {/* Entry 3: Web Console */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
              <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center font-bold">
                <BookOpen className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">3. Web Console Sandbox</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Use the visual Web Console to run interactive queries, inspect knowledge graph topology, and review AI grounded answers.
              </p>

              <div className="bg-emerald-50 text-emerald-950 p-3 rounded-xl text-[11px] space-y-1 border border-emerald-200 font-sans">
                <div className="font-bold">✓ Visual 1-Hop Graph Explorer</div>
                <div className="font-bold">✓ Real-time AI Answer Synthesis</div>
                <div className="font-bold">✓ Grounded Provenance Citations</div>
              </div>

              <button
                onClick={() => onNavigateTab('search')}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-xs"
              >
                <span>Launch Search Sandbox</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Workflows Teaser */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <h4 className="font-bold text-slate-100 text-base">Want to practice real-world team scenarios?</h4>
              <p className="text-xs text-slate-400">
                Try our step-by-step Interactive Workflow Simulator to practice indexing repos, tracing requirement tags, and resolving media sidecars.
              </p>
            </div>

            <button
              onClick={() => onNavigateTab('workflows')}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg transition-all shrink-0 flex items-center gap-2"
            >
              <span>Explore Interactive Workflows</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
