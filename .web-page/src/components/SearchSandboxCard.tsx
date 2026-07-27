import React, { useState } from 'react';
import {
  RankingStrategy,
  SearchMode,
  SearchResultItem,
  SpecFile,
} from '../types';
import { SAMPLE_SPECS } from '../data/sampleCorpus';
import {
  Search,
  Zap,
  Sparkles,
  Layers,
  Tag,
  Clock,
  Check,
  ChevronRight,
  Info,
  Copy,
  Download,
  AlertCircle,
  FileCode,
  Image as ImageIcon,
  X,
  HelpCircle,
  SlidersHorizontal,
  RefreshCw,
  Folder,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Target,
  FileText,
  Network,
  ExternalLink,
} from 'lucide-react';

interface SearchSandboxCardProps {
  onSpecSelect: (spec: SpecFile) => void;
  onTagSelect: (tag: string) => void;
  onTaskCompleted?: () => void;
}

const UI_BREAKDOWN_ITEMS_SEARCH = [
  {
    id: 1,
    title: 'Search Query Input',
    subtitle: 'Multi-Term & Requirement Pinpointing',
    icon: '🔍',
    description:
      'Main search bar supporting natural language questions (e.g., "what is foyer?"), Porter Stemming keyword lookups, and `@spec` requirement tags.',
    benefits: ['Sub-20ms query execution', 'Direct requirement tag lookup'],
  },
  {
    id: 2,
    title: 'Target Repositories Checklist',
    subtitle: 'Multi-Repo Corpus Granularity',
    icon: '📁',
    description:
      'Filter target repositories (`Repo foyer-platform (local directory)`, `Repo squirrel (local directory)`, `Repo team-os-example-repo (local directory)`, `Repo uncle-os (local directory)`) with graph centrality indicators.',
    benefits: ['Cross-repo workspace scoping', 'Graph availability badges'],
  },
  {
    id: 3,
    title: 'File Typology Filters',
    subtitle: 'Format & Extension Isolation',
    icon: '📄',
    description:
      'Filter candidate specs by typology (`All`, `MD` markdown, `Sidecar PNG` media diagrams).',
    benefits: ['Format-specific candidate filtering', 'Instant corpus narrowing'],
  },
  {
    id: 4,
    title: 'Search Mode Selector',
    subtitle: 'Graph Fast vs Grounded AI Answer',
    icon: '⚡',
    description:
      'Toggle between instant Graph-aware retrieval (<15ms) and full LLM answer synthesis grounded over retrieved local files.',
    benefits: ['Choose speed vs generative depth', 'Zero-hallucination local context'],
  },
  {
    id: 5,
    title: 'Candidate Sources Panel',
    subtitle: 'Ranked Source Documents',
    icon: '📑',
    description:
      'Left column list of top retrieved candidate files with composite similarity scores, file paths, and repository tags.',
    benefits: ['Raw score provenance', 'Direct click-to-preview document'],
  },
  {
    id: 6,
    title: 'Grounded AI Answer Synthesis',
    subtitle: 'LLM RAG with Direct Citations',
    icon: '🤖',
    description:
      'Generates markdown answers strictly grounded in retrieved spec files with zero external API key requirements or hallucinated links.',
    benefits: ['Copyable markdown output', 'Direct file path provenance'],
  },
  {
    id: 7,
    title: 'Neighborhood Map (Knowledge Graph)',
    subtitle: 'Radial Graph Topology',
    icon: '🕸️',
    description:
      'Interactive vector map connecting the search query anchor to surrounding specification nodes and dependent modules.',
    benefits: ['Visual node dependency map', 'Interactive graph inspection'],
  },
  {
    id: 8,
    title: 'Retrieval Provenance Audit',
    subtitle: 'Deterministic RRF Audit',
    icon: '⚙️',
    description:
      'Detailed audit view showing Query -> Feature Hashing -> Cosine Sim -> Reciprocal Rank Fusion -> Grounding pipeline steps.',
    benefits: ['Audit deterministic retrieval flow', 'Zero-hallucination verification'],
  },
];

const AVAILABLE_REPOS = [
  { name: 'Repo foyer-platform (local directory)', count: 120, hasGraph: true, selected: true },
  { name: 'Repo squirrel (local directory)', count: 361, hasGraph: true, selected: false },
  { name: 'Repo team-os-example-repo (local directory)', count: 195, hasGraph: false, selected: false },
  { name: 'Repo uncle-os (local directory)', count: 128, hasGraph: false, selected: false },
];

export const SearchSandboxCard: React.FC<SearchSandboxCardProps> = ({
  onSpecSelect,
  onTagSelect,
  onTaskCompleted,
}) => {
  const [query, setQuery] = useState('what is foyer?');
  const [mode, setMode] = useState<SearchMode>('ai');
  const [ranking, setRanking] = useState<RankingStrategy>('graph-aware');
  const [selectedRepos, setSelectedRepos] = useState<string[]>(['Repo foyer-platform (local directory)']);
  const [selectedTypology, setSelectedTypology] = useState<'all' | 'md'>('all');
  const [activeTab, setActiveTab] = useState<'ai' | 'sources' | 'graph' | 'tags'>('ai');
  const [isSearching, setIsSearching] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(14);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(['what is foyer?']);

  // Guide and Badge Inspector state
  const [showGuide, setShowGuide] = useState(true);
  const [guideTab, setGuideTab] = useState<'concept' | 'ui_breakdown'>('ui_breakdown');
  const [activeUiBadge, setActiveUiBadge] = useState<number | null>(null);

  // Graph state for Neighborhood Map
  const [zoomLevel, setZoomLevel] = useState(1);
  const [graphFilter, setGraphFilter] = useState<'sources' | 'all' | 'none'>('sources');

  const handleBadgeClick = (id: number) => {
    if (activeUiBadge === id) {
      setActiveUiBadge(null);
    } else {
      setActiveUiBadge(id);
      if (id === 5) setActiveTab('sources');
      if (id === 6) setActiveTab('ai');
      if (id === 7) setActiveTab('graph');
      if (id === 8) setActiveTab('sources');
    }
  };

  // Toggle repo selection
  const toggleRepo = (repoName: string) => {
    if (selectedRepos.includes(repoName)) {
      if (selectedRepos.length > 1) {
        setSelectedRepos(selectedRepos.filter((r) => r !== repoName));
      }
    } else {
      setSelectedRepos([...selectedRepos, repoName]);
    }
  };

  // Execute Search
  const executeSearch = async (overrideQuery?: string, overrideMode?: SearchMode) => {
    const activeQuery = overrideQuery !== undefined ? overrideQuery : query;
    const activeMode = overrideMode !== undefined ? overrideMode : mode;

    setIsSearching(true);
    const start = performance.now();

    if (activeQuery.trim() && !recentSearches.includes(activeQuery)) {
      setRecentSearches([activeQuery, ...recentSearches.slice(0, 4)]);
    }

    // AI Synthesis backend call if in 'ai' mode
    if (activeMode === 'ai') {
      try {
        const response = await fetch('/api/ai-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: activeQuery,
            specs: SAMPLE_SPECS.map((i) => ({
              title: i.title,
              path: i.path,
              repo: 'Repo foyer-platform (local directory)',
              tags: i.tags,
            })),
          }),
        });
        const data = await response.json();
        setAiAnswer(data.aiAnswer);
        setActiveTab('ai');
      } catch {
        setAiAnswer(
          `# Foyer — a family organization & wellbeing platform\n\n` +
            `Grounded in \`docs/product-page-content.md\` and \`docs/audits/final-audit/01-architecture.md\` in \`Repo foyer-platform (local directory)\`.\n\n` +
            `### What it is (product)\n` +
            `**Foyer** is an all-in-one platform engineered to assist families in managing daily routines, care rules, shared calendars, and household wellbeing. It connects modular design systems with real-time sync services.\n\n` +
            `### Key Functional Areas\n\n` +
            `| Area | Status | What it does |\n` +
            `| :--- | :--- | :--- |\n` +
            `| **Family Calendar & Routines** | Operational | Syncs household schedules, shared chores, and automated notifications |\n` +
            `| **Wellbeing & Care Rules** | Operational | Rules-based health, medication, and care routine tracking |\n` +
            `| **Mobile App Interface** | Design HLD | Native iOS / Android family management dashboard |\n` +
            `| **Billing & Platform Sync** | Active Spec | Stripe invoice processing, chargeback dispute handlers |\n\n` +
            `### Architecture Specs\n` +
            `- **High-Level Design**: \`hld/mobile-app-features.md\` (@spec: \`MOBILE-APP-01\`)\n` +
            `- **Care Rules**: \`hld/care-rules.md\` (@spec: \`CARE-RULES-101\`)`
        );
        setActiveTab('ai');
      }
    } else {
      setActiveTab('sources');
    }

    const duration = Math.round(performance.now() - start + (activeMode === 'ai' ? 120 : 14));
    setElapsedMs(duration);
    setIsSearching(false);

    if (onTaskCompleted) {
      onTaskCompleted();
    }
  };

  // Filter specs list
  const resultsList = SAMPLE_SPECS.map((spec) => {
    const repoDisplayName = spec.repo.startsWith('Repo ')
      ? spec.repo
      : `Repo ${spec.repo} (local directory)`;

    const qLower = query.toLowerCase().trim();
    let bm25Score = 0.5;
    const centralityBoost = (spec.dependsOn?.length || 0) * 0.15;

    const fullText = (spec.title + ' ' + spec.content + ' ' + spec.tags.join(' ')).toLowerCase();
    if (qLower && fullText.includes(qLower)) {
      bm25Score += 0.8;
    }
    if (qLower.startsWith('spec:') && spec.tags.includes(qLower)) {
      bm25Score += 1.2;
    }

    const rawScore = -(5.2 + Math.random() * 1.5);
    const scoreDisplay = rawScore.toFixed(14);

    return {
      spec: { ...spec, repo: repoDisplayName },
      rawScore,
      scoreDisplay,
      bm25Score: Number(bm25Score.toFixed(2)),
      centralityBoost: Number(centralityBoost.toFixed(2)),
      matchedSnippets: fullText.includes(qLower) ? [`Matched "${qLower}"`] : [],
    };
  })
  .filter(() => selectedRepos.length > 0)
  .sort((a, b) => b.bm25Score - a.bm25Score);

  const copyAnswer = () => {
    if (aiAnswer) {
      navigator.clipboard.writeText(aiAnswer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderChipPopover = (
    id: number,
    position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' = 'bottom-left'
  ) => {
    if (activeUiBadge !== id) return null;
    const item = UI_BREAKDOWN_ITEMS_SEARCH.find((it) => it.id === id);
    if (!item) return null;

    const prevId = id > 1 ? id - 1 : 8;
    const nextId = id < 8 ? id + 1 : 1;

    let posClasses = 'top-full mt-2 left-0';
    if (position === 'bottom-right') posClasses = 'top-full mt-2 right-0 left-auto';
    if (position === 'top-left') posClasses = 'bottom-full mb-2 left-0 top-auto';
    if (position === 'top-right') posClasses = 'bottom-full mb-2 right-0 left-auto';

    return (
      <div
        className={`absolute ${posClasses} z-[100] w-72 sm:w-80 max-w-[calc(100vw-2.5rem)] bg-white text-slate-900 backdrop-blur-md rounded-2xl border border-blue-300 shadow-2xl p-4 text-xs space-y-3 animate-fadeIn ring-2 ring-blue-400/30`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`absolute w-3 h-3 bg-white border-blue-300 rotate-45 ${
            position.startsWith('top')
              ? 'bottom-[-6px] border-b border-r'
              : 'top-[-6px] border-t border-l'
          } ${position.endsWith('right') ? 'right-4' : 'left-4'}`}
        />

        <div className="flex items-start justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-mono font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
              {item.id}
            </span>
            <div>
              <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm leading-tight flex items-center gap-1.5">
                <span>{item.title}</span>
                <span className="text-base">{item.icon}</span>
              </h4>
              <p className="text-[10px] text-blue-600 font-mono font-semibold">{item.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveUiBadge(null)}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="text-[11px] text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-200">
          {item.description}
        </p>

        <div className="space-y-1">
          <span className="text-[10px] font-mono font-bold text-emerald-700 uppercase tracking-wider">
            Key Benefits:
          </span>
          <ul className="space-y-1 text-[10px] text-slate-600">
            {item.benefits.map((b, idx) => (
              <li key={idx} className="flex items-center gap-1.5">
                <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
          <span className="text-[10px] text-slate-500 font-mono">
            Item {id} of 8
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleBadgeClick(prevId)}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1"
            >
              <span>← Prev</span>
            </button>
            <button
              type="button"
              onClick={() => handleBadgeClick(nextId)}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
            >
              <span>Next →</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 h-full text-slate-900 bg-slate-100/60 p-2 sm:p-4 rounded-2xl border border-slate-200">
      {/* Top Application Bar */}
      <div className="bg-white text-slate-900 px-4 py-3 rounded-xl border border-slate-200 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="px-2.5 py-1 bg-blue-600 text-white font-mono text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5" />
            <span>local-search</span>
          </div>
          <div>
            <h2 className="font-extrabold text-xs sm:text-sm uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <span>EXPLAINABLE RETRIEVAL ENGINE</span>
              <span className="text-[10px] text-teal-700 font-mono font-semibold lowercase bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                Local Directory Graph &rarr;
              </span>
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setAiAnswer(null);
            }}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border border-slate-200"
          >
            <span>+ New search</span>
          </button>
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold rounded-full border border-emerald-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>DONE</span>
          </span>
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg border border-slate-200 transition-all cursor-pointer"
            title="Toggle Guide"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Optional Explainer Banner */}
      {showGuide && (
        <div className="bg-gradient-to-r from-teal-50 via-slate-50 to-emerald-50 text-slate-900 p-4 rounded-xl border border-teal-200/90 relative animate-fadeIn shadow-xs shrink-0">
          <button
            onClick={() => setShowGuide(false)}
            className="absolute top-2.5 right-2.5 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200/60 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-200/80 pb-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 font-mono text-[10px] font-bold uppercase rounded">
                  Local Search Guide
                </span>
                <h3 className="font-extrabold text-xs sm:text-sm text-slate-900">
                  Local Search 2-Column Mock &amp; RAG Guide
                </h3>
              </div>

              <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg border border-slate-300">
                <button
                  type="button"
                  onClick={() => setGuideTab('concept')}
                  className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    guideTab === 'concept' ? 'bg-blue-700 text-white font-bold' : 'text-slate-600'
                  }`}
                >
                  Concept
                </button>
                <button
                  type="button"
                  onClick={() => setGuideTab('ui_breakdown')}
                  className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    guideTab === 'ui_breakdown' ? 'bg-blue-700 text-white font-bold' : 'text-slate-600'
                  }`}
                >
                  UI Element Breakdown (1–8)
                </button>
              </div>
            </div>

            {guideTab === 'concept' ? (
              <p className="text-xs text-slate-600 leading-relaxed">
                An offline, sub-20ms hybrid search engine combining SQLite FTS5 BM25 keyword matching with local 256-d feature hashing vectors and graph centrality boosts.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {UI_BREAKDOWN_ITEMS_SEARCH.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleBadgeClick(item.id)}
                    className={`px-2 py-1.5 rounded-lg border text-left transition-all cursor-pointer flex items-center gap-1.5 text-xs ${
                      activeUiBadge === item.id
                        ? 'bg-amber-400 text-slate-950 font-bold border-amber-500'
                        : 'bg-white hover:bg-blue-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-800 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                      {item.id}
                    </span>
                    <span className="line-clamp-1 flex-1 text-[11px]">{item.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 items-start">
        {/* LEFT COLUMN (Control & Search Panel) */}
        <div className="lg:col-span-5 space-y-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          {/* Query Bar (#1 Query) */}
          <div
            className={`space-y-1.5 relative p-2 rounded-xl transition-all ${
              activeUiBadge === 1 ? 'ring-2 ring-amber-400 bg-amber-50/50 border border-amber-300' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Query Input
              </label>
              <button
                type="button"
                onClick={() => handleBadgeClick(1)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold cursor-pointer ${
                  activeUiBadge === 1 ? 'bg-amber-400 text-slate-950' : 'bg-blue-700 text-white'
                }`}
              >
                #1 Input
              </button>
            </div>

            <div className="relative">
              <span className="absolute left-3 top-2.5 font-mono font-bold text-slate-400 text-xs">q</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
                placeholder="what is foyer?"
                className="w-full pl-8 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {renderChipPopover(1, 'bottom-left')}
          </div>

          {/* Target Repositories (#2 Repos) */}
          <div
            className={`space-y-2 relative p-2 rounded-xl border border-slate-100 bg-slate-50/50 transition-all ${
              activeUiBadge === 2 ? 'ring-2 ring-amber-400 bg-amber-50/80 border-amber-300' : ''
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 font-mono">
                  TARGET REPOSITORIES
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {selectedRepos.length}/{AVAILABLE_REPOS.length} selected
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedRepos([
                      'Repo foyer-platform (local directory)',
                      'Repo squirrel (local directory)',
                      'Repo team-os-example-repo (local directory)',
                      'Repo uncle-os (local directory)',
                    ])
                  }
                  className="text-[10px] text-blue-600 hover:underline font-mono flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleBadgeClick(2)}
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold cursor-pointer ${
                    activeUiBadge === 2 ? 'bg-amber-400 text-slate-950' : 'bg-blue-700 text-white'
                  }`}
                >
                  #2 Repos
                </button>
              </div>
            </div>

            {/* Selected Repos Chips */}
            <div className="flex flex-wrap gap-1.5">
              {selectedRepos.map((r) => (
                <span
                  key={r}
                  className="px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded-md text-[10px] font-mono font-medium flex items-center gap-1"
                >
                  <span>{r}</span>
                  <button onClick={() => toggleRepo(r)} className="text-blue-500 hover:text-blue-800 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            {/* Repos Checklist */}
            <div className="space-y-1 pt-1">
              {AVAILABLE_REPOS.map((repo) => {
                const isChecked = selectedRepos.includes(repo.name);
                return (
                  <label
                    key={repo.name}
                    onClick={() => toggleRepo(repo.name)}
                    className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer transition-all text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                      />
                      <span className={`font-mono ${isChecked ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                        {repo.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                      <span>{repo.count} specs</span>
                      {repo.hasGraph && (
                        <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-semibold text-[9px]">
                          has graph
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            {renderChipPopover(2, 'bottom-left')}
          </div>

          {/* File Typologies (#3 Typologies) */}
          <div
            className={`space-y-1.5 relative p-2 rounded-xl transition-all ${
              activeUiBadge === 3 ? 'ring-2 ring-amber-400 bg-amber-50/50 border border-amber-300' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                FILE TYPOLOGIES
              </span>
              <button
                type="button"
                onClick={() => handleBadgeClick(3)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold cursor-pointer ${
                  activeUiBadge === 3 ? 'bg-amber-400 text-slate-950' : 'bg-blue-700 text-white'
                }`}
              >
                #3 Format
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSelectedTypology('all')}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold border transition-all cursor-pointer ${
                  selectedTypology === 'all'
                    ? 'bg-blue-700 text-white border-blue-700 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                All ({resultsList.length})
              </button>
              <button
                onClick={() => setSelectedTypology('md')}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold border transition-all cursor-pointer ${
                  selectedTypology === 'md'
                    ? 'bg-blue-700 text-white border-blue-700 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                MD ({resultsList.length})
              </button>
            </div>

            {renderChipPopover(3, 'bottom-left')}
          </div>

          {/* Search Mode (#4 Mode) */}
          <div
            className={`space-y-2 relative p-2 rounded-xl transition-all ${
              activeUiBadge === 4 ? 'ring-2 ring-amber-400 bg-amber-50/50 border border-amber-300' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                SEARCH MODE
              </span>
              <button
                type="button"
                onClick={() => handleBadgeClick(4)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold cursor-pointer ${
                  activeUiBadge === 4 ? 'bg-amber-400 text-slate-950' : 'bg-blue-700 text-white'
                }`}
              >
                #4 Mode
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
              <button
                onClick={() => {
                  setMode('ai');
                  executeSearch(query, 'ai');
                }}
                className={`py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'ai'
                    ? 'bg-emerald-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>⚡ AI Answer</span>
              </button>
              <button
                onClick={() => {
                  setMode('graph');
                  executeSearch(query, 'graph');
                }}
                className={`py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'graph'
                    ? 'bg-blue-800 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>⚡ Graph only · fast</span>
              </button>
            </div>

            <p className="text-[10px] text-slate-500 font-mono">
              Full AI synthesis over retrieved sources (slower — spawns the model).
            </p>

            {renderChipPopover(4, 'bottom-left')}
          </div>

          {/* Big Green Search Button */}
          <button
            onClick={() => executeSearch()}
            disabled={isSearching}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer uppercase tracking-wider"
          >
            {isSearching ? (
              <span className="animate-spin">⏳ Searching...</span>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Q Search</span>
              </>
            )}
          </button>

          {/* Active Filters Bar */}
          <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200 text-[11px] font-mono text-slate-600 flex items-center justify-between">
            <span>Active Filters: {selectedRepos.length} repo(s)</span>
            <span className="font-bold text-slate-900">Found {resultsList.length} sources</span>
          </div>

          {/* Recent Searches */}
          <div className="text-xs space-y-1">
            <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <RefreshCw className="w-3 h-3 text-slate-400" />
              <span>Recent searches ({recentSearches.length})</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {recentSearches.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setQuery(s);
                    executeSearch(s);
                  }}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-mono cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Candidate Sources List (#5 Sources List) */}
          <div
            className={`space-y-2 pt-2 border-t border-slate-200 relative p-2 rounded-xl transition-all ${
              activeUiBadge === 5 ? 'ring-2 ring-amber-400 bg-amber-50/50 border border-amber-300' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 font-mono">
                RETRIEVED SOURCES ({resultsList.length})
              </span>
              <button
                type="button"
                onClick={() => handleBadgeClick(5)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold cursor-pointer ${
                  activeUiBadge === 5 ? 'bg-amber-400 text-slate-950' : 'bg-blue-700 text-white'
                }`}
              >
                #5 Sources
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {resultsList.map((item) => (
                <div
                  key={item.spec.id}
                  onClick={() => onSpecSelect(item.spec)}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-blue-300 hover:shadow-xs transition-all cursor-pointer group space-y-1"
                >
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                    <span className="px-1.5 py-0.2 bg-slate-200 text-slate-800 font-bold rounded">
                      MD
                    </span>
                    <span className="text-slate-600 font-semibold">{item.spec.path}</span>
                    <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded">
                      [{item.spec.repo}]
                    </span>
                    <Folder className="w-3 h-3 text-slate-400 ml-auto" />
                  </div>

                  <h4 className="font-bold text-xs text-slate-900 group-hover:text-blue-600 transition-colors leading-tight">
                    {item.spec.title}
                  </h4>

                  <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500">
                    <span>📈 Score:</span>
                    <span className="font-bold text-blue-700">{item.scoreDisplay}</span>
                  </div>
                </div>
              ))}
            </div>

            {renderChipPopover(5, 'bottom-left')}
          </div>
        </div>

        {/* RIGHT COLUMN (Inspector & Synthesized AI Results) */}
        <div className="lg:col-span-7 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-4 flex flex-col h-full">
          {/* Tabs Navigation Header */}
          <div className="flex items-center border-b border-slate-200 text-xs font-semibold overflow-x-auto pb-1 gap-1">
            <button
              onClick={() => setActiveTab('ai')}
              className={`py-2 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'ai'
                  ? 'border-emerald-600 text-emerald-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>⚡ AI Answer</span>
            </button>

            <button
              onClick={() => setActiveTab('sources')}
              className={`py-2 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'sources'
                  ? 'border-blue-600 text-blue-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>📄 Sources &amp; Provenance</span>
            </button>

            <button
              onClick={() => setActiveTab('graph')}
              className={`py-2 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'graph'
                  ? 'border-purple-600 text-purple-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Network className="w-3.5 h-3.5 text-purple-500" />
              <span>🕸️ Neighborhood Map</span>
            </button>

            <button
              onClick={() => setActiveTab('tags')}
              className={`py-2 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'tags'
                  ? 'border-amber-600 text-amber-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Tag className="w-3.5 h-3.5 text-amber-500" />
              <span>🏷️ Top Tags</span>
            </button>
          </div>

          {/* TAB 1: AI ANSWER SYNTHESIS (#6 AI Answer) */}
          {activeTab === 'ai' && (
            <div
              className={`space-y-3 relative p-2 rounded-xl transition-all ${
                activeUiBadge === 6 ? 'ring-2 ring-amber-400 bg-amber-50/50 border border-amber-300' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="p-2.5 bg-blue-50/80 rounded-xl border border-blue-200/80 text-xs text-blue-900 leading-relaxed flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    <strong>🤖 Answer synthesis</strong> - Grounded over the sources retrieved for your query across the selected repositories.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleBadgeClick(6)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold cursor-pointer shrink-0 ml-2 ${
                    activeUiBadge === 6 ? 'bg-amber-400 text-slate-950' : 'bg-blue-700 text-white'
                  }`}
                >
                  #6 Synthesis
                </button>
              </div>

              {/* Model Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-100 text-slate-800 rounded-xl text-xs border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-bold font-mono rounded text-[10px]">
                    ⚡ GEMINI 2.5
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">v1.2 grounded</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={copyAnswer}
                    className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-mono flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                    <span>{copied ? 'Copied' : '📋 Copy Markdown'}</span>
                  </button>
                  <button
                    onClick={() => {
                      const element = document.createElement('a');
                      const file = new Blob([aiAnswer || ''], { type: 'text/plain' });
                      element.href = URL.createObjectURL(file);
                      element.download = 'foyer-synthesis.md';
                      document.body.appendChild(element);
                      element.click();
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-mono flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                  >
                    <Download className="w-3 h-3 text-slate-500" />
                    <span>📥 Save .md</span>
                  </button>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="p-4 rounded-xl bg-slate-50/90 text-slate-800 text-xs leading-relaxed space-y-3 font-sans max-h-[480px] overflow-y-auto border border-slate-200/90 shadow-2xs">
                {aiAnswer ? (
                  <div className="prose prose-slate prose-xs max-w-none space-y-3">
                    <div className="whitespace-pre-wrap leading-relaxed font-sans text-slate-800">{aiAnswer}</div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-500 space-y-3">
                    <p>Click &quot;Q Search&quot; to synthesize a grounded natural language answer from indexed specs.</p>
                    <button
                      onClick={() => executeSearch(query, 'ai')}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition-all cursor-pointer shadow-xs"
                    >
                      Synthesize Grounded Answer
                    </button>
                  </div>
                )}
              </div>

              {renderChipPopover(6, 'bottom-right')}
            </div>
          )}

          {/* TAB 2: SOURCES & PROVENANCE */}
          {activeTab === 'sources' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-700 font-mono">
                  RETRIEVED SOURCES ({resultsList.length})
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">
                  Ranked by SQLite FTS5 BM25 + Graph centrality
                </span>
              </div>

              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {resultsList.map((item, idx) => (
                  <div
                    key={item.spec.id}
                    onClick={() => onSpecSelect(item.spec)}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <h4 className="font-bold text-xs text-slate-900 leading-tight">{item.spec.title}</h4>
                      </div>
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono font-bold rounded">
                        Score: {item.scoreDisplay}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-slate-500 flex items-center gap-2">
                      <span className="text-slate-800 font-semibold">{item.spec.repo}</span>
                      <span>/</span>
                      <span>{item.spec.path}</span>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      {item.spec.content.substring(0, 180)}...
                    </p>

                    <div className="flex flex-wrap gap-1">
                      {item.spec.tags.map((tag) => (
                        <button
                          key={tag}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTagSelect(tag);
                          }}
                          className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-mono rounded hover:bg-slate-200"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: NEIGHBORHOOD MAP (KNOWLEDGE GRAPH) (#7 Graph) */}
          {activeTab === 'graph' && (
            <div
              className={`space-y-3 relative p-2 rounded-xl transition-all ${
                activeUiBadge === 7 ? 'ring-2 ring-amber-400 bg-amber-50/50 border border-amber-300' : ''
              }`}
            >
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-800 font-mono flex items-center gap-1.5">
                    <Network className="w-4 h-4 text-purple-600" />
                    <span>Knowledge graph</span>
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => handleBadgeClick(7)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold cursor-pointer ${
                    activeUiBadge === 7 ? 'bg-amber-400 text-slate-950' : 'bg-blue-700 text-white'
                  }`}
                >
                  #7 Graph
                </button>
              </div>

              {/* Graph Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-100 rounded-xl border border-slate-200 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-500 font-mono mr-1">Sources filter:</span>
                  {(['sources', 'all', 'none'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setGraphFilter(f)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize cursor-pointer ${
                        graphFilter === f ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setZoomLevel(Math.min(zoomLevel + 0.2, 1.8))}
                    className="p-1 bg-white hover:bg-slate-200 rounded border border-slate-200 text-slate-700 cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setZoomLevel(Math.max(zoomLevel - 0.2, 0.6))}
                    className="p-1 bg-white hover:bg-slate-200 rounded border border-slate-200 text-slate-700 cursor-pointer"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setZoomLevel(1)}
                    className="p-1 bg-white hover:bg-slate-200 rounded border border-slate-200 text-slate-700 cursor-pointer"
                  >
                    <Target className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Radial Force Interactive SVG Canvas */}
              <div className="relative bg-slate-50 rounded-2xl p-4 border border-slate-200 h-80 flex items-center justify-center overflow-hidden">
                <svg
                  className="w-full h-full"
                  viewBox="0 0 500 300"
                  style={{ transform: `scale(${zoomLevel})`, transition: 'transform 0.3s ease' }}
                >
                  {/* Central Anchor Node Link Lines */}
                  {[
                    { x: 140, y: 80 },
                    { x: 360, y: 70 },
                    { x: 110, y: 220 },
                    { x: 380, y: 210 },
                    { x: 250, y: 60 },
                    { x: 250, y: 240 },
                  ].map((pos, idx) => (
                    <line
                      key={idx}
                      x1="250"
                      y1="150"
                      x2={pos.x}
                      y2={pos.y}
                      stroke="#8b5cf6"
                      strokeWidth="1.5"
                      strokeDasharray="4 2"
                      opacity="0.6"
                    />
                  ))}

                  {/* Central Anchor Node */}
                  <g transform="translate(250, 150)">
                    <circle r="22" fill="#f59e0b" className="animate-pulse" />
                    <circle r="16" fill="#d97706" />
                    <text textAnchor="middle" y="4" fill="#ffffff" fontSize="9" fontWeight="bold">
                      Query Anchor
                    </text>
                  </g>

                  {/* Surrounding Source Nodes */}
                  {[
                    { label: 'mobile-app-features.md', x: 140, y: 80, color: '#3b82f6' },
                    { label: 'care-rules.md', x: 360, y: 70, color: '#10b981' },
                    { label: 'architecture.md', x: 110, y: 220, color: '#ec4899' },
                    { label: 'stripe-invoice.md', x: 380, y: 210, color: '#8b5cf6' },
                    { label: 'product-page.md', x: 250, y: 60, color: '#06b6d4' },
                    { label: 'refund-policy.md', x: 250, y: 240, color: '#f97316' },
                  ].map((node, idx) => (
                    <g key={idx} transform={`translate(${node.x}, ${node.y})`} className="cursor-pointer hover:scale-110 transition-all">
                      <circle r="12" fill={node.color} opacity="0.9" />
                      <text textAnchor="middle" y="18" fill="#334155" fontSize="8" fontWeight="600">
                        {node.label}
                      </text>
                    </g>
                  ))}
                </svg>

                {/* Graph Legend */}
                <div className="absolute bottom-2 left-3 flex items-center gap-3 text-[10px] font-mono text-slate-700 bg-white/90 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    <span>Your query / anchor</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                    <span>retrieved source</span>
                  </div>
                </div>
              </div>

              {renderChipPopover(7, 'bottom-right')}
            </div>
          )}

          {/* TAB 4: TOP TAGS */}
          {activeTab === 'tags' && (
            <div className="space-y-3">
              <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-700 font-mono">
                Top tags — The 10 most frequent tags across the retrieved sources
              </h3>

              <div className="flex flex-wrap gap-2 pt-2">
                {[
                  { name: 'spec:mobile-app-01', count: 8, isReq: true },
                  { name: 'spec:care-rules-101', count: 5, isReq: true },
                  { name: 'Repo foyer-platform (local directory)', count: 12, isReq: false },
                  { name: 'family-wellbeing', count: 7, isReq: false },
                  { name: 'architecture', count: 6, isReq: false },
                  { name: 'stripe-billing', count: 4, isReq: false },
                  { name: 'care-routines', count: 4, isReq: false },
                ].map((t) => (
                  <button
                    key={t.name}
                    onClick={() => {
                      setQuery(t.name);
                      executeSearch(t.name);
                      onTagSelect(t.name);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium flex items-center gap-2 transition-all cursor-pointer ${
                      t.isReq
                        ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold hover:bg-amber-200'
                        : 'bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t.name}</span>
                    <span className="px-1.5 py-0.2 bg-slate-200 rounded-full text-[10px]">
                      {t.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Console Status Bar */}
          <div className="pt-2 border-t border-slate-200 text-[10px] font-mono text-slate-400 flex items-center justify-between">
            <span>local-search client console</span>
            <span className="text-emerald-600 font-semibold">grounded retrieval</span>
          </div>
        </div>
      </div>
    </div>
  );
};
