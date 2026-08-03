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
  Download,
  Copy,
  Check,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';

type GuideQuestion = 'why' | 'what' | 'how';

/** The three guide sections, as data — the markup for them is identical, and
 *  writing it once is what stops the three from drifting apart again. */
const GUIDE_QUESTIONS: ReadonlyArray<{
  id: GuideQuestion;
  step: number;
  label: string;
  question: string;
}> = [
  { id: 'why', step: 1, label: 'Why', question: 'Why does this exist?' },
  { id: 'what', step: 2, label: 'What', question: 'What is local-search?' },
  { id: 'how', step: 3, label: 'How', question: 'How do I use it?' },
];

/** A shell snippet with a copy button — the install commands are the most
 *  copied strings on the page, so they should not need selecting by hand. */
const CopyableCommand: React.FC<{ command: string }> = ({ command }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is unavailable over plain http or without permission;
      // the text stays selectable, so there is nothing to recover from.
    }
  };

  return (
    <div className="relative group">
      <pre className="bg-panel-inset text-syntax-string p-3.5 pr-12 rounded-card font-mono text-[11px] leading-relaxed overflow-x-auto border border-panel-edge whitespace-pre">
{command.split('\n').map((line) => `$ ${line}`).join('\n')}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy command'}
        className="absolute top-2.5 right-2.5 p-1.5 rounded-input bg-panel-raised text-panel-ink-3 hover:text-panel-ink hover:bg-panel-edge transition-colors cursor-pointer"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-syntax-string" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
      </button>
    </div>
  );
};

interface OverviewSectionProps {
  audienceLevel: AudienceLevel;
  onNavigateTab: (tab: 'search' | 'cli' | 'graph' | 'workflows' | 'config') => void;
}

export const OverviewSection: React.FC<OverviewSectionProps> = ({
  audienceLevel,
  onNavigateTab,
}) => {
  const [activeQuestion, setActiveQuestion] = useState<GuideQuestion>('why');

  return (
    <div className="space-y-6 pb-12 app-container">
      {/* Dark Hero Banner Header */}
      <div className="bg-panel text-panel-ink rounded-card p-6 sm:p-10 border border-panel-edge relative overflow-hidden">
        {/* Subtle grid background, in the panel's own edge tone rather than a
            stray brand hue, so the hero reads as one material. */}
        <div className="absolute inset-0 opacity-40 bg-[radial-gradient(var(--color-panel-edge)_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-4 max-w-2xl">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-sm text-panel-ink-2 tracking-tight">local-search</span>
              <span className="w-px h-3.5 bg-panel-edge" aria-hidden="true" />
              <span className="text-sm text-panel-ink-3">For engineers, managers &amp; AI coding agents</span>
            </div>

            {/* One idea, stated once. The Why/What/How split is navigation and
                lives in the tabs below — it is not the headline's job. */}
            <h1 className="text-3xl sm:text-5xl font-bold font-display text-panel-ink tracking-tight leading-[1.1] text-balance">
              Code search that lives in your repo, not in the cloud.
            </h1>

            <p className="text-base sm:text-lg leading-relaxed text-panel-ink-2 text-pretty">
              Git-native retrieval that works fully offline — so answers track the
              commit you have checked out instead of drifting documentation.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 shrink-0 w-full md:w-auto">
            <button
              onClick={() => onNavigateTab('search')}
              className="px-5 py-3 bg-accent hover:brightness-110 text-accent-contrast font-semibold text-sm rounded-input transition flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <Zap className="w-4 h-4" aria-hidden="true" />
              <span>Try live search</span>
            </button>
            <button
              onClick={() => onNavigateTab('cli')}
              className="px-5 py-3 bg-panel-raised hover:bg-panel-edge text-panel-ink border border-panel-edge font-semibold text-sm rounded-input transition flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <Terminal className="w-4 h-4" aria-hidden="true" />
              <span>Launch CLI simulator</span>
            </button>
          </div>
        </div>

        {/* Why / What / How. Previously three hand-written buttons in three
            different hues, which made the section look like three unrelated
            features rather than one control. Now one render, one accent:
            selection is carried by the filled number chip and the raised
            surface, so it survives being read in greyscale. */}
        <div
          role="tablist"
          aria-label="Guide sections"
          className="relative z-10 mt-10 pt-6 border-t border-panel-edge grid grid-cols-1 sm:grid-cols-3 gap-2"
        >
          {GUIDE_QUESTIONS.map(({ id, step, label, question }) => {
            const isActive = activeQuestion === id;
            return (
              <button
                key={id}
                role="tab"
                id={`guide-tab-${id}`}
                aria-selected={isActive}
                aria-controls={`guide-panel-${id}`}
                onClick={() => setActiveQuestion(id)}
                className={`p-4 rounded-input text-left border transition flex items-center gap-3 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                  isActive
                    ? 'bg-panel-raised border-panel-edge'
                    : 'bg-panel-inset border-transparent hover:bg-panel-raised/60'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`w-8 h-8 rounded-input flex items-center justify-center font-mono font-semibold text-sm shrink-0 transition ${
                    isActive ? 'bg-accent text-accent-contrast' : 'bg-panel-edge text-panel-ink-2'
                  }`}
                >
                  {step}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${isActive ? 'text-panel-ink' : 'text-panel-ink-2'}`}>
                    {label}
                  </span>
                  <span className="block text-sm text-panel-ink-3">{question}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Install, on the landing itself. The full Step 0 lives inside "How do
          I use it?", which nobody sees until they pick that question — so the
          one command that everything else depends on gets a permanent home
          here, and defers to Step 0 for archives, binaries, and source. It
          steps aside when Step 0 is already on screen rather than showing the
          same curl line twice. */}
      {activeQuestion !== 'how' && (
        <div className="bg-white border border-rule rounded-card p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-accent text-accent-contrast rounded-input flex items-center justify-center shrink-0">
                <Download className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-display font-semibold text-ink text-base">How to install</h2>
                <p className="text-sm text-ink-3">
                  One command installs the CLI, the Claude Code skill, and the local web UI.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveQuestion('how')}
              className="text-sm font-semibold px-3 py-1.5 rounded-input border border-rule text-ink-2 hover:bg-paper-3 transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <span>All install options</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <CopyableCommand
            command={
              'tmp=$(mktemp -d) && curl -fsSL https://github.com/metuur-ai/local-search/releases/latest/download/local-search-bundle.tar.gz | tar -xz -C "$tmp" && bash "$tmp/bundle/install.sh"'
            }
          />

          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-2">
            <span>
              <span className="font-semibold text-ink">No runtime dependencies</span> — SQLite
              is compiled in via pure Go
            </span>
            <span>
              Web UI needs <span className="font-mono text-ink">Node ≥ 18</span>; skipped with a
              warning without it
            </span>
            <span className="font-mono">
              local-search → ~/.local/bin
            </span>
          </div>

          <div className="border-t border-rule pt-3.5 space-y-2">
            <div className="text-sm font-semibold text-ink">Then: register a folder and search</div>
            <CopyableCommand
              command={'local-search repo add ./product-specs product\nlocal-search search refund'}
            />
          </div>
        </div>
      )}

      {/* Dynamic Content Panel based on Selected Question */}
      {activeQuestion === 'why' && (
        <div
          id="guide-panel-why"
          role="tabpanel"
          aria-labelledby="guide-tab-why"
          tabIndex={0}
          className="space-y-6 animate-fadeIn focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {/* Side-by-Side Problem vs Solution Banner */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* The Old Problem Card */}
            <div className="bg-danger-soft border border-rule rounded-card p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-danger text-white rounded-input flex items-center justify-center shrink-0">
                  <XCircle className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-semibold font-display text-danger-ink text-lg leading-snug">Without local-search</h3>
                  <span className="text-sm text-ink-2">Documentation drift &amp; context fragmentation</span>
                </div>
              </div>

              <ul className="space-y-3 text-sm text-ink leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <XCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong className="font-semibold">Documentation drift:</strong> PRDs and specs live in Notion or Google Docs, separated from the code in Git. Over time, docs become outdated and untrusted.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <XCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong className="font-semibold">Cloud AI hallucinations:</strong> AI coding assistants generate wrong code because they lack precise, grounded local specification context.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <XCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong className="font-semibold">Keyword blindspots:</strong> Standard regex or simple grep misses word stems (e.g., searching &quot;refund&quot; misses &quot;refunded&quot; or &quot;refunding&quot;).</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <XCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong className="font-semibold">Privacy &amp; speed limits:</strong> Sending internal specs to third-party cloud servers is slow, expensive, and risks IP compliance leaks.</span>
                </li>
              </ul>
            </div>

            {/* The Solution Card */}
            <div className="bg-accent-soft border border-rule rounded-card p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-accent text-accent-contrast rounded-input flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-semibold font-display text-accent-ink text-lg leading-snug">With local-search</h3>
                  <span className="text-sm text-ink-2">Fully offline, fast &amp; explainable indexing</span>
                </div>
              </div>

              <ul className="space-y-3 text-sm text-ink leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong className="font-semibold">Co-located specs in Git:</strong> Specifications live alongside code as standard Markdown files in your repositories.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong className="font-semibold">Zero-cloud privacy &amp; ~12ms speed:</strong> All index data stays strictly on your computer inside <code className="bg-paper-3 px-1.5 py-0.5 rounded-input text-ink font-mono text-[0.9em]">~/.local-search/specs.db</code>.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong className="font-semibold">Porter stemming &amp; graph boost:</strong> Automatic BM25 stem matching plus graph centrality boosts hub specifications.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong className="font-semibold">EARS requirement tracking:</strong> Parses <code className="bg-paper-3 px-1.5 py-0.5 rounded-input text-ink font-mono text-[0.9em]">@spec R-1.3</code> requirement tags directly from Markdown.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Core Why Takeaway Banner */}
          <div className="bg-info-soft border border-info/25 rounded-card p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-input bg-info text-white flex items-center justify-center font-semibold shrink-0">
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <h4 className="font-display font-semibold text-info-ink text-sm">Key Takeaway: Why local-search Matters</h4>
                <p className="text-sm text-info-ink">
                  By keeping specifications inside Git and indexing them locally in a disposable SQLite database, both humans and AI coding agents get single-source-of-truth answers in milliseconds.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveQuestion('what')}
              className="px-4 py-2 bg-info hover:brightness-110 text-white font-semibold text-sm rounded-input transition-all shrink-0 flex items-center gap-1.5"
            >
              <span>Next: What is it?</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {activeQuestion === 'what' && (
        <div
          id="guide-panel-what"
          role="tabpanel"
          aria-labelledby="guide-tab-what"
          tabIndex={0}
          className="space-y-6 animate-fadeIn focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {/* 4 Pillars Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Pillar 1 */}
            <div className="bg-white border border-rule rounded-card p-5 space-y-3 shadow-xs hover:border-info/40 transition-all">
              <div className="w-9 h-9 bg-info-soft border border-info/25 rounded-input flex items-center justify-center text-info-ink font-semibold">
                <Database className="w-5 h-5" aria-hidden="true" />
              </div>
              <h4 className="font-display font-semibold text-ink text-sm">Pillar A: Pure Go & SQLite FTS5</h4>
              <p className="text-sm text-ink-2 leading-relaxed">
                Uses SQLite&apos;s FTS5 extension with a Porter Stemmer. Matches root words (&quot;refund&quot; finds &quot;refunding&quot;) using standard BM25 Okapi relevance scoring.
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="bg-white border border-rule rounded-card p-5 space-y-3 shadow-xs hover:border-accent/40 transition-all">
              <div className="w-9 h-9 bg-accent-soft border border-accent/25 rounded-input flex items-center justify-center text-accent-ink font-semibold">
                <Share2 className="w-5 h-5" aria-hidden="true" />
              </div>
              <h4 className="font-display font-semibold text-ink text-sm">Pillar B: Knowledge Graph</h4>
              <p className="text-sm text-ink-2 leading-relaxed">
                Parses YAML frontmatter dependencies (<code className="text-accent-ink">dependsOn</code>, <code className="text-accent-ink">relationships</code>) into an in-memory node-link graph with PageRank boost.
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="bg-white border border-rule rounded-card p-5 space-y-3 shadow-xs hover:border-info/40 transition-all">
              <div className="w-9 h-9 bg-info-soft border border-info/25 rounded-input flex items-center justify-center text-info-ink font-semibold">
                <Sparkles className="w-5 h-5" aria-hidden="true" />
              </div>
              <h4 className="font-display font-semibold text-ink text-sm">Pillar C: Grounded AI Answers</h4>
              <p className="text-sm text-ink-2 leading-relaxed">
                Synthesizes clear text answers grounded strictly in retrieved local source documents with clickable provenance citations (<code className="text-info-ink">[repo:file.md]</code>).
              </p>
            </div>

            {/* Pillar 4 */}
            <div className="bg-white border border-rule rounded-card p-5 space-y-3 shadow-xs hover:border-warn/40 transition-all">
              <div className="w-9 h-9 bg-warn-soft border border-warn/25 rounded-input flex items-center justify-center text-warn-ink font-semibold">
                <Tag className="w-5 h-5" aria-hidden="true" />
              </div>
              <h4 className="font-display font-semibold text-ink text-sm">Pillar D: @spec & Media Sidecars</h4>
              <p className="text-sm text-ink-2 leading-relaxed">
                Extracts requirement tags (<code className="text-warn-ink">@spec R-1.3</code>) and pairs visual diagrams (<code className="text-warn-ink">arch.png</code> + <code className="text-warn-ink">arch.md</code>) for full text searchability.
              </p>
            </div>
          </div>

          {/* Under the hood technical architecture box */}
          <div className="bg-panel text-panel-ink-2 border border-panel-edge rounded-card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-panel-edge pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-syntax-keyword" aria-hidden="true" />
                <h4 className="font-display font-semibold text-panel-ink text-sm">Under the Hood Architecture</h4>
              </div>
              <span className="font-mono text-[10px] text-panel-ink-3 bg-panel-raised px-2 py-0.5 rounded-input">
                Reciprocal Rank Fusion (RRF)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-panel-inset p-4 rounded-card border border-panel-edge space-y-1">
                <div className="text-syntax-keyword font-mono font-semibold">1. Full-Text BM25</div>
                <p className="text-panel-ink-3 text-[11px]">
                  SQLite FTS5 scans tokenized terms, applying length normalization and term frequency weighting across title, tags, and content fields.
                </p>
              </div>

              <div className="bg-panel-inset p-4 rounded-card border border-panel-edge space-y-1">
                <div className="text-syntax-string font-mono font-semibold">2. Graph Centrality</div>
                <p className="text-panel-ink-3 text-[11px]">
                  Calculates node degree centrality from frontmatter fields. High-degree hub specs receive up to 1.5x rank multiplier.
                </p>
              </div>

              <div className="bg-panel-inset p-4 rounded-card border border-panel-edge space-y-1">
                <div className="text-syntax-number font-mono font-semibold">3. RRF Fusion Score</div>
                <p className="text-panel-ink-3 text-[11px]">
                  Merges BM25 and vector similarity ranks: <code className="text-syntax-number">score = 1 / (60 + rank_fts) + 1 / (60 + rank_vec)</code>.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-warn-soft border border-warn/25 rounded-card p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-input bg-warn text-white flex items-center justify-center font-semibold shrink-0">
                <Terminal className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <h4 className="font-display font-semibold text-warn-ink text-sm">Ready to see how to use it?</h4>
                <p className="text-sm text-warn-ink">
                  Explore how developers run local-search from terminal or connect it to Claude Code as an automated AI agent skill.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveQuestion('how')}
              className="px-4 py-2 bg-warn hover:brightness-110 text-white font-semibold text-sm rounded-input transition-all shrink-0 flex items-center gap-1.5"
            >
              <span>Next: How do I use it?</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {activeQuestion === 'how' && (
        <div
          id="guide-panel-how"
          role="tabpanel"
          aria-labelledby="guide-tab-how"
          tabIndex={0}
          className="space-y-6 animate-fadeIn focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {/* Step 0: Install — nothing below works without it */}
          <div className="bg-white border border-rule rounded-card p-6 space-y-5 shadow-xs">
            <div className="flex items-start justify-between gap-4 border-b border-rule pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-accent text-accent-contrast rounded-input flex items-center justify-center shrink-0">
                  <Download className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-ink text-base">Step 0 — Install</h3>
                  <p className="text-sm text-ink-3">
                    Installs the CLI, the Claude Code skill, and the local web UI in one shot.
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono bg-accent-soft text-accent-ink px-2.5 py-1 rounded-input border border-accent/25 font-semibold shrink-0">
                Recommended
              </span>
            </div>

            <CopyableCommand
              command={
                'tmp=$(mktemp -d) && curl -fsSL https://github.com/metuur-ai/local-search/releases/latest/download/local-search-bundle.tar.gz | tar -xz -C "$tmp" && bash "$tmp/bundle/install.sh"'
              }
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="p-3.5 bg-paper-2 rounded-card border border-rule space-y-1.5">
                <div className="font-semibold text-ink">What lands where</div>
                <ul className="text-ink-2 text-[11px] space-y-1 font-mono">
                  <li><span className="text-accent-ink">local-search</span> → ~/.local/bin</li>
                  <li><span className="text-warn-ink">skill</span> → ~/.claude/skills/local-search</li>
                  <li><span className="text-info-ink">web UI</span> → ~/.local/share/local-search/web</li>
                </ul>
              </div>

              <div className="p-3.5 bg-paper-2 rounded-card border border-rule space-y-1.5">
                <div className="font-semibold text-ink">Requirements</div>
                <p className="text-ink-2 text-[11px] leading-relaxed">
                  No runtime dependencies — SQLite is compiled in via pure Go, so there&apos;s no CGO
                  and no C toolchain. The web UI needs <strong>Node ≥ 18</strong>; without it that
                  piece is skipped with a warning and the CLI + skill still install.
                </p>
              </div>

              <div className="p-3.5 bg-paper-2 rounded-card border border-rule space-y-1.5">
                <div className="font-semibold text-ink">Override or skip parts</div>
                <p className="text-ink-2 text-[11px] leading-relaxed font-mono">
                  INSTALL_DIR · SKILLS_DIR · WEB_DIR · INSTALL_WEB=0 · INSTALL_SKILLS=0
                </p>
              </div>
            </div>

            {/* Alternatives */}
            <details className="group border border-rule rounded-card overflow-hidden">
              <summary className="px-4 py-2.5 bg-paper-2 text-sm font-semibold text-ink-2 cursor-pointer flex items-center gap-2 hover:bg-paper-3 transition-colors">
                <ChevronRight className="w-4 h-4 text-ink-3 group-open:rotate-90 transition-transform" aria-hidden="true" />
                <span>Other ways to install — offline archive, single binary, from source</span>
              </summary>

              <div className="p-4 space-y-4 border-t border-rule">
                <div className="space-y-1.5">
                  <div className="text-sm font-semibold text-ink">Offline archive (everything included)</div>
                  <p className="text-[11px] text-ink-2">
                    Grab <code className="font-mono text-ink">local-search-&lt;version&gt;.zip</code> from the{' '}
                    <a
                      href="https://github.com/metuur-ai/local-search/releases/latest"
                      target="_blank"
                      rel="noreferrer"
                      className="text-info-ink hover:underline font-semibold"
                    >
                      latest release
                    </a>
                    . Self-contained, no build step.
                  </p>
                  <CopyableCommand command={'unzip local-search-<version>.zip\ncd local-search-<version>\n./install.sh'} />
                  <div className="flex items-start gap-2 p-2.5 bg-warn-soft border border-warn/25 rounded-input">
                    <AlertTriangle className="w-3.5 h-3.5 text-warn-ink shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-[11px] text-warn-ink">
                      Don&apos;t use GitHub&apos;s auto-generated <strong>&quot;Source code (zip)&quot;</strong> asset — it omits the prebuilt <code className="font-mono">frontend/dist</code>, so the web UI 404s.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-sm font-semibold text-ink">Pre-built binary (CLI only)</div>
                  <CopyableCommand
                    command={
                      'curl -fsSL https://github.com/metuur-ai/local-search/releases/latest/download/local-search-mac-silicon-darwin-arm64 -o /usr/local/bin/local-search\nchmod +x /usr/local/bin/local-search'
                    }
                  />
                  <p className="text-[11px] text-ink-3 font-mono">
                    macOS Intel → local-search-darwin-amd64 · Linux → -linux-amd64 / -linux-arm64 · Windows → -windows-amd64.exe
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="text-sm font-semibold text-ink">Build from source</div>
                  <CopyableCommand
                    command={'git clone https://github.com/metuur-ai/local-search.git\ncd local-search/cli\ngo build -o local-search .'}
                  />
                  <p className="text-[11px] text-ink-3">Requires Go 1.25+ to build.</p>
                </div>
              </div>
            </details>

            {/* Quick start */}
            <div className="border-t border-rule pt-4 space-y-2">
              <div className="text-sm font-semibold text-ink">Then: register a folder and search</div>
              <CopyableCommand
                command={
                  'local-search repo add ./product-specs product\nlocal-search search refund'
                }
              />
              <p className="text-[11px] text-ink-3">
                Adding a repo auto-scans immediately, and the index auto-detects changed files on your next search — no manual rebuild step.
              </p>
            </div>
          </div>

          {/* 3 Entry points */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Entry 1: CLI Terminal */}
            <div className="bg-white border border-rule rounded-card p-6 space-y-4 shadow-xs">
              <div className="w-10 h-10 bg-panel-inset text-syntax-string rounded-input flex items-center justify-center font-semibold font-mono">
                $&gt;
              </div>
              <h3 className="font-display font-semibold text-ink text-base">1. Terminal CLI Commands</h3>
              <p className="text-sm text-ink-2 leading-relaxed">
                Run automated search and spec inspections directly from your terminal terminal without requiring cloud network requests.
              </p>

              <div className="bg-panel-inset text-panel-ink-2 p-3 rounded-input font-mono text-[11px] space-y-1 border border-panel-edge">
                <div className="text-syntax-string">$ local-search repo add ./docs</div>
                <div className="text-syntax-keyword">$ local-search search &quot;refund&quot;</div>
                <div className="text-panel-ink-3">$ local-search graph explain &quot;ref&quot;</div>
              </div>

              <button
                onClick={() => onNavigateTab('cli')}
                className="w-full py-2 bg-paper-3 hover:bg-paper-3/70 text-ink rounded-input text-sm font-semibold transition-all flex items-center justify-center gap-1.5"
              >
                <span>Open Terminal Explorer</span>
                <ArrowRight className="w-3.5 h-3.5 text-ink-3" aria-hidden="true" />
              </button>
            </div>

            {/* Entry 2: Agent OS Skill */}
            <div className="bg-white border border-rule rounded-card p-6 space-y-4 shadow-xs">
              <div className="w-10 h-10 bg-info-soft text-info-ink rounded-input flex items-center justify-center font-semibold">
                <Cpu className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 className="font-display font-semibold text-ink text-base">2. Claude Code AI Skill</h3>
              <p className="text-sm text-ink-2 leading-relaxed">
                Connect local-search as a custom tool via <code className="text-info-ink font-mono">.agent/local-search-config.yaml</code> so your AI agent reads specs before writing code.
              </p>

              <div className="bg-panel-inset text-syntax-fn p-3 rounded-input font-mono text-[11px] space-y-1 border border-panel-edge">
                <div className="text-panel-ink-3"># .agent/local-search-config.yaml</div>
                <div className="text-syntax-fn">name: local-search</div>
                <div className="text-syntax-fn">command: local-search search</div>
              </div>

              <button
                onClick={() => onNavigateTab('config')}
                className="w-full py-2 bg-info-soft hover:bg-info-soft/70 text-info-ink border border-info/25 rounded-input text-sm font-semibold transition-all flex items-center justify-center gap-1.5"
              >
                <span>View Config & Skill Matrix</span>
                <ArrowRight className="w-3.5 h-3.5 text-info-ink" aria-hidden="true" />
              </button>
            </div>

            {/* Entry 3: Web Console */}
            <div className="bg-white border border-rule rounded-card p-6 space-y-4 shadow-xs">
              <div className="w-10 h-10 bg-accent-soft text-accent-ink rounded-input flex items-center justify-center font-semibold">
                <BookOpen className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 className="font-display font-semibold text-ink text-base">3. Web Console Sandbox</h3>
              <p className="text-sm text-ink-2 leading-relaxed">
                Use the visual Web Console to run interactive queries, inspect knowledge graph topology, and review AI grounded answers.
              </p>

              <div className="bg-accent-soft text-accent-ink p-3 rounded-input text-[11px] space-y-1 border border-accent/25 font-sans">
                <div className="font-semibold">✓ Visual 1-Hop Graph Explorer</div>
                <div className="font-semibold">✓ Real-time AI Answer Synthesis</div>
                <div className="font-semibold">✓ Grounded Provenance Citations</div>
              </div>

              <button
                onClick={() => onNavigateTab('search')}
                className="w-full py-2 bg-accent hover:brightness-110 text-accent-contrast rounded-input text-sm font-semibold transition-all flex items-center justify-center gap-1.5 shadow-xs"
              >
                <span>Launch Search Sandbox</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Interactive Workflows Teaser */}
          <div className="bg-panel text-panel-ink rounded-card p-6 border border-panel-edge flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <h4 className="font-display font-semibold text-panel-ink text-base">Want to practice real-world team scenarios?</h4>
              <p className="text-sm text-panel-ink-3">
                Try our step-by-step Interactive Workflow Simulator to practice indexing repos, tracing requirement tags, and resolving media sidecars.
              </p>
            </div>

            <button
              onClick={() => onNavigateTab('workflows')}
              className="px-5 py-2.5 bg-info hover:brightness-110 text-white rounded-input text-sm font-semibold shadow-lg transition-all shrink-0 flex items-center gap-2"
            >
              <span>Explore Interactive Workflows</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
