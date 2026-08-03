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
  Bot,
  Loader2,
  TrendingUp,
  ArrowLeft,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';

interface SearchSandboxCardProps {
  onSpecSelect: (spec: SpecFile) => void;
  onTagSelect: (tag: string) => void;
  onTaskCompleted?: () => void;
}

interface UiBreakdownItem {
  id: number;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  description: string;
  benefits: string[];
}

const UI_BREAKDOWN_ITEMS_SEARCH: UiBreakdownItem[] = [
  {
    id: 1,
    title: 'Search Query Input',
    subtitle: 'Multi-Term & Requirement Pinpointing',
    icon: Search,
    description:
      'Main search bar supporting natural language questions (e.g., "what is foyer?"), Porter Stemming keyword lookups, and `@spec` requirement tags.',
    benefits: ['Sub-20ms query execution', 'Direct requirement tag lookup'],
  },
  {
    id: 2,
    title: 'Target Repositories Checklist',
    subtitle: 'Multi-Repo Corpus Granularity',
    icon: Folder,
    description:
      'Filter target repositories (`Repo foyer-platform (local directory)`, `Repo squirrel (local directory)`, `Repo team-os-example-repo (local directory)`, `Repo uncle-os (local directory)`) with graph centrality indicators.',
    benefits: ['Cross-repo workspace scoping', 'Graph availability badges'],
  },
  {
    id: 3,
    title: 'File Typology Filters',
    subtitle: 'Format & Extension Isolation',
    icon: FileText,
    description:
      'Filter candidate specs by typology (`All`, `MD` markdown, `Sidecar PNG` media diagrams).',
    benefits: ['Format-specific candidate filtering', 'Instant corpus narrowing'],
  },
  {
    id: 4,
    title: 'Search Mode Selector',
    subtitle: 'Graph Fast vs Grounded AI Answer',
    icon: Zap,
    description:
      'Toggle between instant Graph-aware retrieval (<15ms) and full LLM answer synthesis grounded over retrieved local files.',
    benefits: ['Choose speed vs generative depth', 'Zero-hallucination local context'],
  },
  {
    id: 5,
    title: 'Candidate Sources Panel',
    subtitle: 'Ranked Source Documents',
    icon: Layers,
    description:
      'Left column list of top retrieved candidate files with composite similarity scores, file paths, and repository tags.',
    benefits: ['Raw score provenance', 'Direct click-to-preview document'],
  },
  {
    id: 6,
    title: 'Grounded AI Answer Synthesis',
    subtitle: 'LLM RAG with Direct Citations',
    icon: Bot,
    description:
      'Generates markdown answers strictly grounded in retrieved spec files with zero external API key requirements or hallucinated links.',
    benefits: ['Copyable markdown output', 'Direct file path provenance'],
  },
  {
    id: 7,
    title: 'Neighborhood Map (Knowledge Graph)',
    subtitle: 'Radial Graph Topology',
    icon: Network,
    description:
      'Interactive vector map connecting the search query anchor to surrounding specification nodes and dependent modules.',
    benefits: ['Visual node dependency map', 'Interactive graph inspection'],
  },
  {
    id: 8,
    title: 'Retrieval Provenance Audit',
    subtitle: 'Deterministic RRF Audit',
    icon: SlidersHorizontal,
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

// Cycle through the five categorical tokens for the graph's source nodes —
// unordered document classes, so hue is the sanctioned encoding here.
const NODE_CAT_VARS = [
  'var(--color-cat-1)',
  'var(--color-cat-2)',
  'var(--color-cat-3)',
  'var(--color-cat-4)',
  'var(--color-cat-5)',
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

    const ItemIcon = item.icon;

    return (
      <div
        className={`absolute ${posClasses} z-[100] w-72 sm:w-80 max-w-[calc(100vw-2.5rem)] bg-panel/95 text-panel-ink backdrop-blur-md rounded-card border border-panel-edge shadow-2xs p-4 text-xs space-y-3 animate-fadeIn ring-2 ring-focus/50`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`absolute w-3 h-3 bg-panel border-panel-edge rotate-45 ${
            position.startsWith('top')
              ? 'bottom-[-6px] border-b border-r'
              : 'top-[-6px] border-t border-l'
          } ${position.endsWith('right') ? 'right-4' : 'left-4'}`}
        />

        <div className="flex items-start justify-between border-b border-panel-edge pb-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-pill bg-accent text-accent-contrast font-mono font-bold text-xs flex items-center justify-center shadow-2xs shrink-0">
              {item.id}
            </span>
            <div>
              <h4 className="font-display font-semibold text-panel-ink text-sm leading-tight flex items-center gap-1.5">
                <span>{item.title}</span>
                <ItemIcon className="w-4 h-4" aria-hidden="true" />
              </h4>
              <p className="text-[10px] text-panel-ink-3 font-mono font-semibold">{item.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveUiBadge(null)}
            aria-label="Close item details"
            className="text-panel-ink-3 hover:text-panel-ink p-1 rounded-input hover:bg-panel-raised transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm text-panel-ink-2 leading-relaxed bg-panel-inset p-2.5 rounded-card border border-panel-edge">
          {item.description}
        </p>

        <div className="space-y-1">
          <span className="text-[10px] font-mono font-bold text-syntax-string uppercase tracking-wider">
            Key Benefits:
          </span>
          <ul className="space-y-1 text-[10px] text-panel-ink-2">
            {item.benefits.map((b, idx) => (
              <li key={idx} className="flex items-center gap-1.5">
                <Check className="w-3 h-3 text-syntax-string shrink-0" aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-2 border-t border-panel-edge flex items-center justify-between text-[11px]">
          <span className="text-[10px] text-panel-ink-3 font-mono">
            Item {id} of 8
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleBadgeClick(prevId)}
              className="px-2.5 py-1 bg-panel-raised hover:bg-panel-edge text-panel-ink-2 rounded-input text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
            >
              <ArrowLeft className="w-3 h-3" aria-hidden="true" />
              <span>Prev</span>
            </button>
            <button
              type="button"
              onClick={() => handleBadgeClick(nextId)}
              className="px-2.5 py-1 bg-accent hover:bg-accent-ink text-accent-contrast rounded-input text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
            >
              <span>Next</span>
              <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 h-full text-ink bg-paper-3 p-2 sm:p-4 rounded-card border border-rule">
      {/* Top Application Bar */}
      <div className="bg-paper text-ink px-4 py-3 rounded-card border border-rule flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-2.5 py-1 bg-ink text-paper font-mono text-xs font-bold rounded-input flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5" aria-hidden="true" />
            <span>local-search</span>
          </div>
          <div>
            <h2 className="font-display font-semibold text-sm text-ink-2 flex items-center gap-2">
              <span>Explainable retrieval engine</span>
              <span className="text-[10px] text-ink-2 font-mono font-semibold lowercase bg-paper-3 px-2 py-0.5 rounded-pill border border-rule flex items-center gap-1">
                <span>Local Directory Graph</span>
                <ArrowRight className="w-2.5 h-2.5" aria-hidden="true" />
              </span>
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setAiAnswer(null);
            }}
            className="px-2.5 py-1 bg-paper-3 hover:bg-rule text-ink-2 rounded-input text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border border-rule focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <span>+ New search</span>
          </button>
          <span className="px-2 py-0.5 bg-accent-soft text-accent-ink font-mono text-[10px] font-bold rounded-pill border border-accent/25 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-pill bg-accent animate-pulse motion-reduce:animate-none"></span>
            <span>DONE</span>
          </span>
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            aria-label="Toggle guide"
            className="p-1.5 bg-paper-3 hover:bg-rule text-ink-2 rounded-input border border-rule transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
            title="Toggle Guide"
          >
            <HelpCircle className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Optional Explainer Banner */}
      {showGuide && (
        <div className="bg-paper-2 text-ink p-4 rounded-card border border-rule relative animate-fadeIn shadow-2xs shrink-0">
          <button
            onClick={() => setShowGuide(false)}
            aria-label="Dismiss guide"
            className="absolute top-2.5 right-2.5 text-ink-3 hover:text-ink p-1 rounded-input hover:bg-rule transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-info-soft text-info-ink border border-info/25 font-mono text-[10px] font-bold uppercase rounded-input">
                  Local Search Guide
                </span>
                <h3 className="font-display font-semibold text-sm text-ink">
                  Local search 2-column mock &amp; RAG guide
                </h3>
              </div>

              <div className="flex items-center gap-1 bg-paper-3 p-0.5 rounded-card border border-rule-strong">
                <button
                  type="button"
                  onClick={() => setGuideTab('concept')}
                  className={`px-2.5 py-0.5 rounded-input text-[11px] font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                    guideTab === 'concept' ? 'bg-ink text-paper font-bold' : 'text-ink-2'
                  }`}
                >
                  Concept
                </button>
                <button
                  type="button"
                  onClick={() => setGuideTab('ui_breakdown')}
                  className={`px-2.5 py-0.5 rounded-input text-[11px] font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                    guideTab === 'ui_breakdown' ? 'bg-ink text-paper font-bold' : 'text-ink-2'
                  }`}
                >
                  UI Element Breakdown (1–8)
                </button>
              </div>
            </div>

            {guideTab === 'concept' ? (
              <p className="text-sm text-ink-2 leading-relaxed">
                An offline, sub-20ms hybrid search engine combining SQLite FTS5 BM25 keyword matching with local 256-d feature hashing vectors and graph centrality boosts.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {UI_BREAKDOWN_ITEMS_SEARCH.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleBadgeClick(item.id)}
                    className={`px-2 py-1.5 rounded-input border text-left transition-all cursor-pointer flex items-center gap-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                      activeUiBadge === item.id
                        ? 'bg-warn-soft text-ink font-bold border-warn'
                        : 'bg-paper hover:bg-paper-3 border-rule text-ink-2'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-pill bg-info-soft text-info-ink text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
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
        <div className="lg:col-span-5 space-y-4 bg-paper p-4 rounded-card border border-rule shadow-2xs">
          {/* Query Bar (#1 Query) */}
          <div
            className={`space-y-1.5 relative p-2 rounded-card transition-all ${
              activeUiBadge === 1 ? 'ring-2 ring-warn bg-warn-soft border border-warn/40' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-ink-3 font-mono">
                Query Input
              </label>
              <button
                type="button"
                onClick={() => handleBadgeClick(1)}
                className={`px-2 py-0.5 rounded-pill text-[10px] font-mono font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                  activeUiBadge === 1 ? 'bg-warn-soft text-warn-ink border border-warn/40' : 'bg-accent-soft text-accent-ink border border-accent/25'
                }`}
              >
                #1 Input
              </button>
            </div>

            <div className="relative">
              <span className="absolute left-3 top-2.5 font-mono font-bold text-ink-3 text-xs">q</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
                placeholder="what is foyer?"
                className="w-full pl-8 pr-8 py-2 bg-paper-2 border border-rule rounded-input text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-focus focus:border-accent"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  aria-label="Clear query"
                  className="absolute right-2.5 top-2.5 text-ink-3 hover:text-ink-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 rounded-input"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>

            {renderChipPopover(1, 'bottom-left')}
          </div>

          {/* Target Repositories (#2 Repos) */}
          <div
            className={`space-y-2 relative p-2 rounded-card border border-rule bg-paper-2 transition-all ${
              activeUiBadge === 2 ? 'ring-2 ring-warn bg-warn-soft border-warn/40' : ''
            }`}
          >
            <div className="flex items-center justify-between border-b border-rule pb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-2 font-mono">
                  TARGET REPOSITORIES
                </span>
                <span className="text-[10px] text-ink-3 font-mono">
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
                  className="text-[10px] text-info-ink hover:underline font-mono flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 rounded-input"
                >
                  <RefreshCw className="w-2.5 h-2.5" aria-hidden="true" />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleBadgeClick(2)}
                  className={`px-1.5 py-0.5 rounded-pill text-[10px] font-mono font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                    activeUiBadge === 2 ? 'bg-warn-soft text-warn-ink border border-warn/40' : 'bg-accent-soft text-accent-ink border border-accent/25'
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
                  className="px-2 py-0.5 bg-info-soft text-info-ink border border-info/25 rounded-input text-[10px] font-mono font-medium flex items-center gap-1"
                >
                  <span>{r}</span>
                  <button
                    onClick={() => toggleRepo(r)}
                    aria-label={`Remove ${r}`}
                    className="text-info-ink hover:opacity-70 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 rounded-input"
                  >
                    <X className="w-3 h-3" aria-hidden="true" />
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
                    className="flex items-center justify-between p-1.5 rounded-input hover:bg-paper-3 cursor-pointer transition-all text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="rounded-input text-accent focus:ring-2 focus:ring-focus w-3.5 h-3.5"
                      />
                      <span className={`font-mono ${isChecked ? 'font-bold text-ink' : 'text-ink-2'}`}>
                        {repo.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-ink-3">
                      <span>{repo.count} specs</span>
                      {repo.hasGraph && (
                        <span className="px-1.5 py-0.2 bg-accent-soft text-accent-ink rounded-input font-semibold text-[9px]">
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
            className={`space-y-1.5 relative p-2 rounded-card transition-all ${
              activeUiBadge === 3 ? 'ring-2 ring-warn bg-warn-soft border border-warn/40' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-3 font-mono">
                FILE TYPOLOGIES
              </span>
              <button
                type="button"
                onClick={() => handleBadgeClick(3)}
                className={`px-2 py-0.5 rounded-pill text-[10px] font-mono font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                  activeUiBadge === 3 ? 'bg-warn-soft text-warn-ink border border-warn/40' : 'bg-accent-soft text-accent-ink border border-accent/25'
                }`}
              >
                #3 Format
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSelectedTypology('all')}
                className={`px-3 py-1 rounded-input text-xs font-mono font-semibold border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                  selectedTypology === 'all'
                    ? 'bg-ink text-paper border-ink shadow-2xs'
                    : 'bg-paper text-ink-2 border-rule hover:bg-paper-3'
                }`}
              >
                All ({resultsList.length})
              </button>
              <button
                onClick={() => setSelectedTypology('md')}
                className={`px-3 py-1 rounded-input text-xs font-mono font-semibold border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                  selectedTypology === 'md'
                    ? 'bg-ink text-paper border-ink shadow-2xs'
                    : 'bg-paper text-ink-2 border-rule hover:bg-paper-3'
                }`}
              >
                MD ({resultsList.length})
              </button>
            </div>

            {renderChipPopover(3, 'bottom-left')}
          </div>

          {/* Search Mode (#4 Mode) */}
          <div
            className={`space-y-2 relative p-2 rounded-card transition-all ${
              activeUiBadge === 4 ? 'ring-2 ring-warn bg-warn-soft border border-warn/40' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-3 font-mono">
                SEARCH MODE
              </span>
              <button
                type="button"
                onClick={() => handleBadgeClick(4)}
                className={`px-2 py-0.5 rounded-pill text-[10px] font-mono font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                  activeUiBadge === 4 ? 'bg-warn-soft text-warn-ink border border-warn/40' : 'bg-accent-soft text-accent-ink border border-accent/25'
                }`}
              >
                #4 Mode
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 bg-paper-3 p-1 rounded-card border border-rule text-xs font-semibold">
              <button
                onClick={() => {
                  setMode('ai');
                  executeSearch(query, 'ai');
                }}
                className={`py-2 px-2 rounded-input transition-all flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                  mode === 'ai'
                    ? 'bg-accent text-accent-contrast shadow-2xs font-bold'
                    : 'text-ink-2 hover:bg-rule'
                }`}
              >
                <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                <span>AI Answer</span>
              </button>
              <button
                onClick={() => {
                  setMode('graph');
                  executeSearch(query, 'graph');
                }}
                className={`py-2 px-2 rounded-input transition-all flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                  mode === 'graph'
                    ? 'bg-info text-accent-contrast shadow-2xs font-bold'
                    : 'text-ink-2 hover:bg-rule'
                }`}
              >
                <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Graph only · fast</span>
              </button>
            </div>

            <p className="text-sm text-ink-3 font-mono">
              Full AI synthesis over retrieved sources (slower — spawns the model).
            </p>

            {renderChipPopover(4, 'bottom-left')}
          </div>

          {/* Big Green Search Button */}
          <button
            onClick={() => executeSearch()}
            disabled={isSearching}
            className="w-full min-h-11 py-3 bg-accent hover:bg-accent-ink text-accent-contrast text-sm font-extrabold rounded-input shadow-2xs flex items-center justify-center gap-2 transition-all cursor-pointer uppercase tracking-wider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            {isSearching ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                <span>Searching...</span>
              </span>
            ) : (
              <>
                <Search className="w-4 h-4" aria-hidden="true" />
                <span>Search</span>
              </>
            )}
          </button>

          {/* Active Filters Bar */}
          <div className="p-2.5 bg-paper-3 rounded-card border border-rule text-[11px] font-mono text-ink-2 flex items-center justify-between">
            <span>Active Filters: {selectedRepos.length} repo(s)</span>
            <span className="font-bold text-ink">Found {resultsList.length} sources</span>
          </div>

          {/* Recent Searches */}
          <div className="text-xs space-y-1">
            <div className="text-[10px] font-mono font-bold text-ink-3 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3 text-ink-3" aria-hidden="true" />
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
                  className="px-2 py-0.5 bg-paper-3 hover:bg-rule text-ink-2 rounded-input text-[11px] font-mono cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Candidate Sources List (#5 Sources List) */}
          <div
            className={`space-y-2 pt-2 border-t border-rule relative p-2 rounded-card transition-all ${
              activeUiBadge === 5 ? 'ring-2 ring-warn bg-warn-soft border border-warn/40' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-2 font-mono">
                RETRIEVED SOURCES ({resultsList.length})
              </span>
              <button
                type="button"
                onClick={() => handleBadgeClick(5)}
                className={`px-2 py-0.5 rounded-pill text-[10px] font-mono font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                  activeUiBadge === 5 ? 'bg-warn-soft text-warn-ink border border-warn/40' : 'bg-accent-soft text-accent-ink border border-accent/25'
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
                  className="p-3 rounded-card border border-rule bg-paper-2 hover:bg-paper hover:border-rule-strong hover:shadow-2xs transition-all cursor-pointer group space-y-1"
                >
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                    <span className="px-1.5 py-0.2 bg-paper-3 text-ink-2 font-bold rounded-input">
                      MD
                    </span>
                    <span className="text-ink-2 font-semibold font-mono">{item.spec.path}</span>
                    <span className="px-1.5 py-0.2 bg-info-soft text-info-ink rounded-input">
                      [{item.spec.repo}]
                    </span>
                    <Folder className="w-3 h-3 text-ink-3 ml-auto" aria-hidden="true" />
                  </div>

                  <h4 className="font-display font-semibold text-sm text-ink group-hover:text-accent-ink transition-colors leading-tight">
                    {item.spec.title}
                  </h4>

                  <div className="flex items-center gap-1 text-[10px] font-mono text-ink-3">
                    <TrendingUp className="w-3 h-3" aria-hidden="true" />
                    <span>Score:</span>
                    <span className="font-bold text-info-ink">{item.scoreDisplay}</span>
                  </div>
                </div>
              ))}
            </div>

            {renderChipPopover(5, 'bottom-left')}
          </div>
        </div>

        {/* RIGHT COLUMN (Inspector & Synthesized AI Results) */}
        <div className="lg:col-span-7 bg-paper p-4 rounded-card border border-rule shadow-2xs space-y-4 flex flex-col h-full">
          {/* Tabs Navigation Header */}
          <div className="flex items-center border-b border-rule text-xs font-semibold overflow-x-auto pb-1 gap-1">
            <button
              onClick={() => setActiveTab('ai')}
              className={`py-2 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                activeTab === 'ai'
                  ? 'border-ink text-ink font-bold'
                  : 'border-transparent text-ink-3 hover:text-ink-2'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>AI Answer</span>
            </button>

            <button
              onClick={() => setActiveTab('sources')}
              className={`py-2 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                activeTab === 'sources'
                  ? 'border-ink text-ink font-bold'
                  : 'border-transparent text-ink-3 hover:text-ink-2'
              }`}
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sources &amp; Provenance</span>
            </button>

            <button
              onClick={() => setActiveTab('graph')}
              className={`py-2 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                activeTab === 'graph'
                  ? 'border-ink text-ink font-bold'
                  : 'border-transparent text-ink-3 hover:text-ink-2'
              }`}
            >
              <Network className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Neighborhood Map</span>
            </button>

            <button
              onClick={() => setActiveTab('tags')}
              className={`py-2 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                activeTab === 'tags'
                  ? 'border-ink text-ink font-bold'
                  : 'border-transparent text-ink-3 hover:text-ink-2'
              }`}
            >
              <Tag className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Top Tags</span>
            </button>
          </div>

          {/* TAB 1: AI ANSWER SYNTHESIS (#6 AI Answer) */}
          {activeTab === 'ai' && (
            <div
              className={`space-y-3 relative p-2 rounded-card transition-all ${
                activeUiBadge === 6 ? 'ring-2 ring-warn bg-warn-soft border border-warn/40' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="p-2.5 bg-info-soft border border-info/25 rounded-card text-sm text-info-ink leading-relaxed flex items-center gap-2">
                  <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>Answer synthesis</strong> — Grounded over the sources retrieved for your query across the selected repositories.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleBadgeClick(6)}
                  className={`px-2 py-0.5 rounded-pill text-[10px] font-mono font-bold cursor-pointer shrink-0 ml-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                    activeUiBadge === 6 ? 'bg-warn-soft text-warn-ink border border-warn/40' : 'bg-accent-soft text-accent-ink border border-accent/25'
                  }`}
                >
                  #6 Synthesis
                </button>
              </div>

              {/* Model Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-paper-3 text-ink-2 rounded-card text-xs border border-rule">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-paper text-ink-2 border border-rule-strong font-bold font-mono rounded-input text-[10px] flex items-center gap-1">
                    <Zap className="w-2.5 h-2.5" aria-hidden="true" />
                    <span>AI Agent</span>
                  </span>
                  <span className="text-[10px] text-ink-3 font-mono">v1.2 grounded</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={copyAnswer}
                    className="px-2.5 py-1 bg-paper hover:bg-paper-2 text-ink-2 border border-rule rounded-input text-sm font-mono flex items-center gap-1 transition-all cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                  >
                    {copied ? <Check className="w-3 h-3 text-accent-ink" aria-hidden="true" /> : <Copy className="w-3 h-3 text-ink-3" aria-hidden="true" />}
                    <span>{copied ? 'Copied' : 'Copy Markdown'}</span>
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
                    className="px-2.5 py-1 bg-paper hover:bg-paper-2 text-ink-2 border border-rule rounded-input text-sm font-mono flex items-center gap-1 transition-all cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                  >
                    <Download className="w-3 h-3 text-ink-3" aria-hidden="true" />
                    <span>Save .md</span>
                  </button>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="p-4 rounded-card bg-paper-2 text-ink-2 text-sm leading-relaxed space-y-3 font-sans max-h-[480px] overflow-y-auto border border-rule shadow-2xs">
                {aiAnswer ? (
                  <div className="prose prose-slate prose-sm max-w-none space-y-3">
                    <div className="whitespace-pre-wrap leading-relaxed font-sans text-ink-2">{aiAnswer}</div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-ink-2 space-y-3">
                    <p>Click &quot;Search&quot; to synthesize a grounded natural language answer from indexed specs.</p>
                    <button
                      onClick={() => executeSearch(query, 'ai')}
                      className="px-4 py-2 bg-accent hover:bg-accent-ink text-accent-contrast rounded-input font-bold text-xs transition-all cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
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
              <div className="flex items-center justify-between border-b border-rule pb-2">
                <h3 className="font-display font-semibold text-sm text-ink-2">
                  Retrieved sources ({resultsList.length})
                </h3>
                <span className="text-[10px] text-ink-3 font-mono">
                  Ranked by SQLite FTS5 BM25 + Graph centrality
                </span>
              </div>

              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {resultsList.map((item, idx) => (
                  <div
                    key={item.spec.id}
                    onClick={() => onSpecSelect(item.spec)}
                    className="p-3.5 rounded-card border border-rule bg-paper hover:border-rule-strong hover:shadow-2xs transition-all cursor-pointer space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-pill bg-paper-3 text-ink-2 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <h4 className="font-display font-semibold text-sm text-ink leading-tight">{item.spec.title}</h4>
                      </div>
                      <span className="px-2 py-0.5 bg-info-soft text-info-ink border border-info/25 text-[10px] font-mono font-bold rounded-input flex items-center gap-1 shrink-0">
                        <TrendingUp className="w-2.5 h-2.5" aria-hidden="true" />
                        <span>Score: {item.scoreDisplay}</span>
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-ink-3 flex items-center gap-2">
                      <span className="text-ink-2 font-semibold">{item.spec.repo}</span>
                      <span>/</span>
                      <span>{item.spec.path}</span>
                    </div>

                    <p className="text-sm text-ink-2 line-clamp-2 bg-paper-2 p-2 rounded-input border border-rule">
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
                          className="px-1.5 py-0.5 bg-paper-3 text-ink-2 text-[10px] font-mono rounded-input hover:bg-rule focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
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
              className={`space-y-3 relative p-2 rounded-card transition-all ${
                activeUiBadge === 7 ? 'ring-2 ring-warn bg-warn-soft border border-warn/40' : ''
              }`}
            >
              <div className="flex items-center justify-between border-b border-rule pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-semibold text-sm text-ink-2 flex items-center gap-1.5">
                    <Network className="w-4 h-4" aria-hidden="true" />
                    <span>Knowledge graph</span>
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => handleBadgeClick(7)}
                  className={`px-2 py-0.5 rounded-pill text-[10px] font-mono font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                    activeUiBadge === 7 ? 'bg-warn-soft text-warn-ink border border-warn/40' : 'bg-accent-soft text-accent-ink border border-accent/25'
                  }`}
                >
                  #7 Graph
                </button>
              </div>

              {/* Graph Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-paper-3 rounded-card border border-rule text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-ink-3 font-mono mr-1">Sources filter:</span>
                  {(['sources', 'all', 'none'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setGraphFilter(f)}
                      className={`px-2 py-0.5 rounded-input text-[10px] font-semibold capitalize cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                        graphFilter === f ? 'bg-ink text-paper' : 'bg-paper text-ink-2 border border-rule'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setZoomLevel(Math.min(zoomLevel + 0.2, 1.8))}
                    aria-label="Zoom in"
                    className="p-1 bg-paper hover:bg-paper-3 rounded-input border border-rule text-ink-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                  >
                    <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setZoomLevel(Math.max(zoomLevel - 0.2, 0.6))}
                    aria-label="Zoom out"
                    className="p-1 bg-paper hover:bg-paper-3 rounded-input border border-rule text-ink-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                  >
                    <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setZoomLevel(1)}
                    aria-label="Reset zoom"
                    className="p-1 bg-paper hover:bg-paper-3 rounded-input border border-rule text-ink-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                  >
                    <Target className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Radial Force Interactive SVG Canvas */}
              <div className="relative bg-paper-2 rounded-card p-4 border border-rule h-80 flex items-center justify-center overflow-hidden">
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
                      stroke="var(--color-rule-strong)"
                      strokeWidth="1.5"
                      strokeDasharray="4 2"
                      opacity="0.8"
                    />
                  ))}

                  {/* Central Anchor Node */}
                  <g transform="translate(250, 150)">
                    <circle r="22" fill="var(--color-accent)" className="animate-pulse motion-reduce:animate-none" />
                    <circle r="16" fill="var(--color-accent-ink)" />
                    <text textAnchor="middle" y="4" fill="var(--color-accent-contrast)" fontSize="9" fontWeight="bold">
                      Query Anchor
                    </text>
                  </g>

                  {/* Surrounding Source Nodes — categorical: one hue per node type (cat-1..cat-5) */}
                  {[
                    { label: 'mobile-app-features.md', x: 140, y: 80 },
                    { label: 'care-rules.md', x: 360, y: 70 },
                    { label: 'architecture.md', x: 110, y: 220 },
                    { label: 'stripe-invoice.md', x: 380, y: 210 },
                    { label: 'product-page.md', x: 250, y: 60 },
                    { label: 'refund-policy.md', x: 250, y: 240 },
                  ].map((node, idx) => (
                    <g key={idx} transform={`translate(${node.x}, ${node.y})`} className="cursor-pointer hover:scale-110 transition-all">
                      <circle r="12" fill={NODE_CAT_VARS[idx % NODE_CAT_VARS.length]} opacity="0.9" />
                      <text textAnchor="middle" y="18" fill="var(--color-ink-2)" fontSize="8" fontWeight="600">
                        {node.label}
                      </text>
                    </g>
                  ))}
                </svg>

                {/* Graph Legend */}
                <div className="absolute bottom-2 left-3 flex items-center gap-3 text-[10px] font-mono text-ink-2 bg-paper/90 px-2.5 py-1 rounded-input border border-rule shadow-2xs">
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-pill bg-accent"></span>
                    <span>Your query / anchor</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-pill bg-cat-2"></span>
                    <span>retrieved source (colour by type)</span>
                  </div>
                </div>
              </div>

              {renderChipPopover(7, 'bottom-right')}
            </div>
          )}

          {/* TAB 4: TOP TAGS */}
          {activeTab === 'tags' && (
            <div className="space-y-3">
              <h3 className="font-display font-semibold text-sm text-ink-2">
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
                    className={`px-3 py-1.5 rounded-input text-xs font-mono font-medium flex items-center gap-2 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                      t.isReq
                        ? 'bg-warn-soft text-warn-ink border border-warn/25 font-bold hover:bg-warn-soft/70'
                        : 'bg-paper-3 text-ink-2 border border-rule hover:bg-rule'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.name}</span>
                    <span className="px-1.5 py-0.2 bg-paper text-ink-2 rounded-pill text-[10px]">
                      {t.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Console Status Bar */}
          <div className="pt-2 border-t border-rule text-[10px] font-mono text-ink-3 flex items-center justify-between">
            <span>local-search client console</span>
            <span className="text-accent-ink font-semibold">grounded retrieval</span>
          </div>
        </div>
      </div>
    </div>
  );
};
