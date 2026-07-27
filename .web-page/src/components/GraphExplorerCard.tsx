import React, { useState } from 'react';
import { GraphNode, GraphLink, LinkFamily } from '../types';
import { SAMPLE_GRAPH_NODES, SAMPLE_GRAPH_LINKS } from '../data/sampleCorpus';
import {
  Search,
  RotateCcw,
  Upload,
  RefreshCw,
  Folder,
  X,
  ExternalLink,
  ChevronDown,
  Info,
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  SlidersHorizontal,
  Check,
} from 'lucide-react';

interface GraphExplorerCardProps {
  onNodeSelect: (node: GraphNode) => void;
  onTaskCompleted?: () => void;
}

interface UiBreakdownItem {
  id: number;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  benefits: string[];
  icon: string;
}

const UI_BREAKDOWN_ITEMS: UiBreakdownItem[] = [
  {
    id: 1,
    badge: '1',
    title: 'Header & Context Badge',
    subtitle: 'Workspace & Atlas Identifier',
    description: 'Shows active project repo (`local-search`) and system mode (`KNOWLEDGE ATLAS`). Confirms which codebase subgraph is active.',
    benefits: ['Confirms active repository scope', 'Identifies Knowledge Atlas mode'],
    icon: '🧭',
  },
  {
    id: 2,
    badge: '2',
    title: 'Global Search Bar',
    subtitle: 'Real-time Fuzzy Entity Search',
    description: 'Filters and highlights graph nodes in real-time. Matches node IDs, document titles, YAML tags, or path names.',
    benefits: ['Instant node pinpointing', 'Cross-repo keyword searching'],
    icon: '🔍',
  },
  {
    id: 3,
    badge: '3',
    title: 'Action Controls Cluster',
    subtitle: 'Visibility & Topology Refresher',
    description: 'Houses guide toggle, "All labels" clutter checkbox, "Upload JSON" importer, and "Refresh from repos" topology rebuild launcher.',
    benefits: ['Toggle text label clutter', 'Re-index git commits & frontmatter'],
    icon: '⚡',
  },
  {
    id: 4,
    badge: '4',
    title: 'Sub-Filters Toolbar',
    subtitle: 'Multi-Facet Scope Granularity',
    description: 'Slices graph by File Type (Docs, PRD, API), Repository (`uncle-os`, `billing-service`), Directory (`/docs`, `/payments`), or Tag.',
    benefits: ['Isolate specific microservices', 'Filter by document domain'],
    icon: '🎛️',
  },
  {
    id: 5,
    badge: '5',
    title: 'Connection Legend & Tally',
    subtitle: 'Edge Relationship Classifier',
    description: 'Color-coded link family toggles: Declared (solid teal = explicit links), Unresolved (dashed amber = missing targets), and Similarity (dotted purple = AI vector affinity).',
    benefits: ['Audit broken dependencies', 'Live entity & link tally'],
    icon: '🔗',
  },
  {
    id: 6,
    badge: '6',
    title: 'Interactive Topology Canvas',
    subtitle: 'Force-Directed Graph Visualization',
    description: 'Interactive map with color-coded nodes (Orange = Docs, Purple = Ontology/EARS, Red = Teams, Teal = Code) connected by directional arrow links.',
    benefits: ['Drag nodes & inspect topology', 'Visual directional flow'],
    icon: '🗺️',
  },
  {
    id: 7,
    badge: '7',
    title: 'Entity Distribution Tally',
    subtitle: 'Monorepo Composition Summary',
    description: 'Floating bottom-left legend card tallying the exact breakdown of entity categories (124 Other, 74 Docs, 20 Team, 14 Ontology).',
    benefits: ['Repository composition audit', 'Quick color-coded legend'],
    icon: '📊',
  },
  {
    id: 8,
    badge: '8',
    title: 'Node Inspector Drawer',
    subtitle: 'Deep Inspector & File Finder',
    description: 'Sliding right drawer displaying title, file path, repository, YAML tags, AI summary, "Reveal in Finder" button, and 1-hop dependency tree.',
    benefits: ['Inspect document frontmatter', 'Jump to file in workspace'],
    icon: '🔍',
  },
];

export const GraphExplorerCard: React.FC<GraphExplorerCardProps> = ({
  onNodeSelect,
  onTaskCompleted,
}) => {
  const [nodes] = useState<GraphNode[]>(SAMPLE_GRAPH_NODES);
  const [links] = useState<GraphLink[]>(SAMPLE_GRAPH_LINKS);

  // Link family toggles
  const [activeFamilies, setActiveFamilies] = useState<Record<LinkFamily, boolean>>({
    declared: true,
    unresolved: true,
    similarity: false,
  });

  // Filters
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all');
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [directoryFilter, setDirectoryFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [nameContains, setNameContains] = useState<string>('');
  const [titleContains, setTitleContains] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAllLabels, setShowAllLabels] = useState<boolean>(true);

  // Rebuild modal / popover
  const [showRebuildPopover, setShowRebuildPopover] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(true);
  const [selectedRebuildRepos, setSelectedRebuildRepos] = useState<string[]>([
    'team-os-example-repo',
    'uncle-os',
  ]);

  // Selected Node state for the Right Slide-over Inspector Drawer
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('GOLDEN-PATH');

  // UI Breakdown Tour state
  const [guideTab, setGuideTab] = useState<'concept' | 'ui_breakdown'>('ui_breakdown');
  const [activeUiBadge, setActiveUiBadge] = useState<number | null>(null);

  const toggleFamily = (family: LinkFamily) => {
    setActiveFamilies((prev) => ({ ...prev, [family]: !prev[family] }));
    if (onTaskCompleted) onTaskCompleted();
  };

  // Filter nodes
  const filteredNodes = nodes.filter((node) => {
    if (selectedRepo !== 'all' && node.repo !== selectedRepo) return false;
    if (fileTypeFilter !== 'all' && node.docType !== fileTypeFilter) return false;
    if (tagFilter !== 'all' && !node.tags.includes(tagFilter)) return false;
    if (nameContains && !node.name.toLowerCase().includes(nameContains.toLowerCase())) return false;
    if (titleContains && !node.title.toLowerCase().includes(titleContains.toLowerCase())) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        node.name.toLowerCase().includes(q) ||
        node.title.toLowerCase().includes(q) ||
        node.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }
    return true;
  });

  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

  // Filter links
  const filteredLinks = links.filter((link) => {
    if (!activeFamilies[link.family]) return false;
    if (!filteredNodeIds.has(link.source) || !filteredNodeIds.has(link.target)) return false;
    return true;
  });

  // Color mapping matching screenshot
  const getNodeColor = (osLayer: string, docType: string) => {
    if (docType === 'unresolved') return '#64748b'; // Slate / Grey
    switch (osLayer) {
      case 'Docs':
        return '#d97706'; // Gold / Amber
      case 'Team':
        return '#ea580c'; // Orange / Red
      case 'Ontology':
        return '#9333ea'; // Purple
      case 'Platform':
        return '#0d9488'; // Teal / Green
      default:
        return '#475569'; // Slate
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];

  // Calculate incoming and outgoing connections for selected node
  const outgoingConnections = links.filter((l) => l.source === selectedNode?.id);
  const incomingConnections = links.filter((l) => l.target === selectedNode?.id);

  // Render contextual popover modal close to element when chip badge is clicked
  const renderChipPopover = (
    id: number,
    position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' = 'bottom-left'
  ) => {
    if (activeUiBadge !== id) return null;
    const item = UI_BREAKDOWN_ITEMS.find((it) => it.id === id);
    if (!item) return null;

    const prevId = id > 1 ? id - 1 : 8;
    const nextId = id < 8 ? id + 1 : 1;

    let posClasses = 'top-full mt-2 left-0';
    if (position === 'bottom-right') posClasses = 'top-full mt-2 right-0 left-auto';
    if (position === 'top-left') posClasses = 'bottom-full mb-2 left-0 top-auto';
    if (position === 'top-right') posClasses = 'bottom-full mb-2 right-0 left-auto';

    return (
      <div
        className={`absolute ${posClasses} z-[100] w-72 sm:w-80 max-w-[calc(100vw-2.5rem)] bg-slate-900/95 text-white backdrop-blur-md rounded-2xl border border-teal-500/60 shadow-2xl p-4 text-xs space-y-3 animate-fadeIn ring-2 ring-amber-400/50`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pointer Triangle */}
        <div
          className={`absolute w-3 h-3 bg-slate-900 border-teal-500/60 rotate-45 ${
            position.startsWith('top')
              ? 'bottom-[-6px] border-b border-r'
              : 'top-[-6px] border-t border-l'
          } ${position.endsWith('right') ? 'right-4' : 'left-4'}`}
        />

        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-mono font-bold text-xs flex items-center justify-center shadow-xs">
              {item.id}
            </span>
            <div>
              <h4 className="font-extrabold text-white text-xs sm:text-sm leading-tight flex items-center gap-1.5">
                <span>{item.title}</span>
                <span className="text-base">{item.icon}</span>
              </h4>
              <p className="text-[10px] text-teal-300 font-mono">{item.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveUiBadge(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Description */}
        <p className="text-[11px] text-slate-200 leading-relaxed bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
          {item.description}
        </p>

        {/* Key Benefits */}
        <div className="space-y-1">
          <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
            Key Benefits:
          </span>
          <ul className="space-y-1 text-[10px] text-slate-300">
            {item.benefits.map((b, idx) => (
              <li key={idx} className="flex items-center gap-1.5">
                <Check className="w-3 h-3 text-teal-400 shrink-0" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer Navigation */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
          <span className="text-[10px] text-slate-400 font-mono">
            Item {id} of 8
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveUiBadge(prevId)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1"
            >
              <span>← Prev</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveUiBadge(nextId)}
              className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
            >
              <span>Next →</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Knowledge Graph Explainer Banner (Above Graph Explorer Card) */}
      {showGuide && (
        <div className="bg-gradient-to-r from-teal-50/90 via-slate-50 to-emerald-50/90 text-slate-900 p-4 sm:p-5 rounded-2xl border border-teal-200/90 z-20 relative animate-fadeIn shadow-md shrink-0">
          <button
            onClick={() => setShowGuide(false)}
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200/60 transition-all cursor-pointer"
            title="Close Explanation Banner"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="max-w-6xl mx-auto space-y-4">
            {/* Header & Tab Selector */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-200/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-teal-100 text-teal-800 border border-teal-200 font-mono text-[10px] font-bold uppercase rounded">
                  Knowledge Graph Guide
                </span>
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                  Knowledge Graph Concept &amp; UI Explorer Guide
                </h3>
              </div>

              {/* Guide Mode Tabs */}
              <div className="flex items-center gap-1.5 bg-slate-200/70 p-1 rounded-xl border border-slate-300/80">
                <button
                  type="button"
                  onClick={() => setGuideTab('concept')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    guideTab === 'concept'
                      ? 'bg-teal-700 text-white shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>Concept &amp; Purpose</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGuideTab('ui_breakdown')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    guideTab === 'ui_breakdown'
                      ? 'bg-teal-700 text-white shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>UI Element Breakdown (1–8)</span>
                </button>
              </div>
            </div>

            {/* TAB 1: CONCEPT & PURPOSE */}
            {guideTab === 'concept' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs animate-fadeIn">
                {/* Card 1: What is it? */}
                <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 space-y-2 shadow-2xs">
                  <div className="font-bold text-teal-900 flex items-center gap-1.5 text-xs">
                    <Info className="w-4 h-4 text-teal-600" />
                    <span>1. What is the Knowledge Graph?</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    A structured, interactive topology map linking specifications, architecture decisions, microservices, and code entities across your workspace repositories into an interconnected semantic atlas.
                  </p>
                  <div className="space-y-1 text-[11px] font-mono text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <div>• <strong className="text-amber-800">Nodes:</strong> Spec files, PRDs, component modules, and EARS requirements.</div>
                    <div>• <strong className="text-teal-800">Edges:</strong> Directional links declared via YAML frontmatter (<code className="text-slate-800 bg-slate-200/60 px-1 py-0.5 rounded">dependsOn</code>), inline Wikilinks (<code className="text-slate-800 bg-slate-200/60 px-1 py-0.5 rounded">[[doc]]</code>), and vector embeddings.</div>
                    <div>• <strong className="text-slate-700">Families:</strong> <span className="text-teal-700 font-bold">Declared</span> (explicit links), <span className="text-amber-700 font-bold">Unresolved</span> (missing targets), <span className="text-purple-700 font-bold">Similarity</span> (semantic affinity).</div>
                  </div>
                </div>

                {/* Card 2: What is it useful for? */}
                <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 space-y-2 shadow-2xs">
                  <div className="font-bold text-emerald-900 flex items-center gap-1.5 text-xs">
                    <HelpCircle className="w-4 h-4 text-emerald-600" />
                    <span>2. What is it useful for?</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="font-bold text-amber-900">💥 Blast Radius Analysis</div>
                      <p className="text-slate-600 text-[10px] mt-0.5">
                        Instantly see downstream microservices or specs that break when modifying a core API or requirement.
                      </p>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="font-bold text-teal-900">🗺️ Monorepo Discovery</div>
                      <p className="text-slate-600 text-[10px] mt-0.5">
                        Traverse cross-repository linkages visually without memorizing multi-repo directory hierarchies.
                      </p>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="font-bold text-purple-900">🤖 AI Agent Grounding</div>
                      <p className="text-slate-600 text-[10px] mt-0.5">
                        Feeds deterministic 1-hop subgraphs to LLMs (Claude Code) so AI coding agents respect architectural rules.
                      </p>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="font-bold text-emerald-900">🎯 Spec Traceability</div>
                      <p className="text-slate-600 text-[10px] mt-0.5">
                        Trace EARS requirements (<code className="text-emerald-800 bg-emerald-100 px-1 py-0.5 rounded">@spec</code>) and Wikilinks (<code className="text-teal-800 bg-teal-100 px-1 py-0.5 rounded">[[doc]]</code>) to audit compliance.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: UI ELEMENTS BREAKDOWN (1-8) */}
            {guideTab === 'ui_breakdown' && (
              <div className="space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <p className="text-[11px] text-slate-600 font-medium">
                    Click any title below to highlight its exact UI control location and open its details modal in the Graph Explorer mock:
                  </p>
                  {activeUiBadge !== null && (
                    <button
                      type="button"
                      onClick={() => setActiveUiBadge(null)}
                      className="text-[10px] text-teal-700 hover:text-teal-900 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Clear selection</span>
                    </button>
                  )}
                </div>

                {/* Compact Title Buttons Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {UI_BREAKDOWN_ITEMS.map((item) => {
                    const isSelected = activeUiBadge === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveUiBadge(isSelected ? null : item.id)}
                        className={`px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                          isSelected
                            ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-md font-bold ring-2 ring-amber-300/80 scale-[1.02]'
                            : 'bg-white hover:bg-teal-50/60 border-slate-200 hover:border-teal-400/80 text-slate-800 shadow-2xs'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-full text-[10px] font-mono font-bold flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-slate-950 text-amber-400' : 'bg-teal-100 text-teal-800 border border-teal-200'
                          }`}
                        >
                          {item.id}
                        </span>
                        <span className="text-xs font-semibold leading-tight line-clamp-1 flex-1">
                          {item.title}
                        </span>
                        <span className="text-xs shrink-0">{item.icon}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Graph Explorer Card */}
      <div className="bg-slate-50 text-slate-900 rounded-3xl flex flex-col shadow-xl relative flex-1 border border-slate-200 select-none min-h-[680px]">
        {/* 1. Header Bar matching screenshot */}
      <div
        className={`bg-white px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 transition-all ${
          activeUiBadge === 1 || activeUiBadge === 2 || activeUiBadge === 3
            ? 'z-[90] relative ring-2 ring-amber-400 bg-amber-50/20'
            : 'z-20 relative'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold shadow-xs">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-slate-900 text-sm sm:text-base tracking-tight">Agent OS Graph</h2>
              <span className="text-[10px] font-mono text-slate-400">← local-search</span>
              {/* Badge 1 */}
              <div className="relative inline-flex items-center ml-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveUiBadge(activeUiBadge === 1 ? null : 1);
                    setShowGuide(true);
                    setGuideTab('ui_breakdown');
                  }}
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold transition-all shadow-xs cursor-pointer ${
                    activeUiBadge === 1 ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 scale-110' : 'bg-teal-700 text-white hover:bg-teal-600'
                  }`}
                  title="Item #1: Header & Workspace Identity"
                >
                  #1 Header
                </button>
                {renderChipPopover(1, 'bottom-left')}
              </div>
            </div>
            <p className="text-[10px] text-slate-400 uppercase font-mono tracking-wider font-semibold">
              KNOWLEDGE ATLAS
            </p>
          </div>
        </div>

        {/* Global Search Bar */}
        <div
          className={`flex-1 max-w-md mx-2 relative hidden md:flex items-center gap-1 p-0.5 rounded-xl transition-all ${
            activeUiBadge === 2 ? 'ring-2 ring-amber-400 bg-amber-100/50' : ''
          }`}
        >
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files, tags, or projects..."
              className="w-full bg-slate-100 hover:bg-slate-200/60 focus:bg-white text-slate-800 text-xs rounded-lg pl-8 pr-3 py-1.5 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-all font-sans"
            />
          </div>
          {/* Badge 2 */}
          <div className="relative inline-flex items-center">
            <button
              type="button"
              onClick={() => {
                setActiveUiBadge(activeUiBadge === 2 ? null : 2);
                setShowGuide(true);
                setGuideTab('ui_breakdown');
              }}
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold transition-all shadow-xs cursor-pointer ${
                activeUiBadge === 2 ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 scale-110' : 'bg-teal-700 text-white hover:bg-teal-600'
              }`}
              title="Item #2: Global Search Input"
            >
              #2 Search
            </button>
            {renderChipPopover(2, 'bottom-right')}
          </div>
        </div>

        {/* Action Controls & Rebuild Popover */}
        <div
          className={`flex items-center gap-3 p-1 rounded-xl transition-all ${
            activeUiBadge === 3 ? 'ring-2 ring-amber-400 bg-amber-100/50' : ''
          }`}
        >
          {/* Badge 3 */}
          <div className="relative inline-flex items-center">
            <button
              type="button"
              onClick={() => {
                setActiveUiBadge(activeUiBadge === 3 ? null : 3);
                setShowGuide(true);
                setGuideTab('ui_breakdown');
              }}
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold transition-all shadow-xs cursor-pointer ${
                activeUiBadge === 3 ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 scale-110' : 'bg-teal-700 text-white hover:bg-teal-600'
              }`}
              title="Item #3: Action Controls Cluster"
            >
              #3 Actions
            </button>
            {renderChipPopover(3, 'bottom-right')}
          </div>

          <button
            onClick={() => setShowGuide(!showGuide)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              showGuide
                ? 'bg-teal-50 text-teal-800 border border-teal-300 shadow-2xs'
                : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-teal-600" />
            <span>What is Knowledge Graph?</span>
          </button>

          {/* All Labels Toggle */}
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showAllLabels}
              onChange={(e) => setShowAllLabels(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-3.5 h-3.5"
            />
            <span>All labels</span>
          </label>

          <button className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 flex items-center gap-1.5 shadow-2xs transition-all">
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Upload JSON</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setShowRebuildPopover(!showRebuildPopover)}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh from repos</span>
            </button>

            {/* Rebuild Popover Modal */}
            {showRebuildPopover && (
              <div className="absolute right-0 top-10 w-72 bg-white rounded-2xl p-4 shadow-2xl border border-slate-200 z-50 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="font-bold text-slate-900 text-xs">Rebuild graph from repos</h4>
                  <button onClick={() => setShowRebuildPopover(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-2 text-xs text-slate-700">
                  {[
                    { id: 'team-os-example-repo', specs: 195 },
                    { id: 'uncle-os', specs: 161 },
                    { id: 'squirrel', specs: 361 },
                    { id: 'foyer-platform', specs: 120 },
                  ].map((repo) => {
                    const isChecked = selectedRebuildRepos.includes(repo.id);
                    return (
                      <label key={repo.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedRebuildRepos(selectedRebuildRepos.filter((r) => r !== repo.id));
                            } else {
                              setSelectedRebuildRepos([...selectedRebuildRepos, repo.id]);
                            }
                          }}
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="font-mono text-[11px]">{repo.id}</span>
                        <span className="text-[10px] text-slate-400 ml-auto">({repo.specs} specs)</span>
                      </label>
                    );
                  })}
                </div>

                <button
                  onClick={() => {
                    setShowRebuildPopover(false);
                    if (onTaskCompleted) onTaskCompleted();
                  }}
                  className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all"
                >
                  Rebuild graph
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Sub-Filter Toolbar matching screenshot */}
      <div
        className={`bg-slate-100/80 px-5 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs transition-all ${
          activeUiBadge === 4 || activeUiBadge === 5
            ? 'z-[90] relative ring-2 ring-amber-400 bg-amber-50/30'
            : 'z-10 relative'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              FILTERS
            </span>
            {/* Badge 4 */}
            <div className="relative inline-flex items-center">
              <button
                type="button"
                onClick={() => {
                  setActiveUiBadge(activeUiBadge === 4 ? null : 4);
                  setShowGuide(true);
                  setGuideTab('ui_breakdown');
                }}
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold transition-all shadow-xs cursor-pointer ${
                  activeUiBadge === 4 ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 scale-110' : 'bg-teal-700 text-white hover:bg-teal-600'
                }`}
                title="Item #4: Sub-Filters Toolbar"
              >
                #4 Filters
              </button>
              {renderChipPopover(4, 'bottom-left')}
            </div>
          </div>

          <select
            value={fileTypeFilter}
            onChange={(e) => setFileTypeFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 text-xs font-medium focus:outline-none shadow-2xs"
          >
            <option value="all">All Files Types</option>
            <option value="doc">Docs</option>
            <option value="prd">PRDs</option>
            <option value="architecture">Architecture</option>
            <option value="api">API Specs</option>
          </select>

          <select
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 text-xs font-medium focus:outline-none shadow-2xs"
          >
            <option value="all">All Repos</option>
            <option value="uncle-os">uncle-os</option>
            <option value="product-specs">product-specs</option>
            <option value="platform-docs">platform-docs</option>
            <option value="billing-service">billing-service</option>
            <option value="team-os">team-os</option>
          </select>

          <select
            value={directoryFilter}
            onChange={(e) => setDirectoryFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 text-xs font-medium focus:outline-none shadow-2xs"
          >
            <option value="all">All Directories</option>
            <option value="docs">/docs</option>
            <option value="payments">/payments</option>
            <option value="services">/services</option>
          </select>

          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 text-xs font-medium focus:outline-none shadow-2xs"
          >
            <option value="all">All Tags</option>
            <option value="billing">billing</option>
            <option value="security">security</option>
            <option value="onboarding">onboarding</option>
          </select>

          <input
            type="text"
            value={nameContains}
            onChange={(e) => setNameContains(e.target.value)}
            placeholder="Name contains..."
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 text-xs placeholder:text-slate-400 focus:outline-none w-28 shadow-2xs"
          />

          <input
            type="text"
            value={titleContains}
            onChange={(e) => setTitleContains(e.target.value)}
            placeholder="Title contains..."
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 text-xs placeholder:text-slate-400 focus:outline-none w-28 shadow-2xs"
          />
        </div>

        {/* Connection Filters & Stats Summary */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
            <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">
              CONNECTIONS
            </span>
            {/* Badge 5 */}
            <div className="relative inline-flex items-center">
              <button
                type="button"
                onClick={() => {
                  setActiveUiBadge(activeUiBadge === 5 ? null : 5);
                  setShowGuide(true);
                  setGuideTab('ui_breakdown');
                }}
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold transition-all shadow-xs cursor-pointer ${
                  activeUiBadge === 5 ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 scale-110' : 'bg-teal-700 text-white hover:bg-teal-600'
                }`}
                title="Item #5: Connections Classifier & Stats"
              >
                #5 Connections
              </button>
              {renderChipPopover(5, 'bottom-right')}
            </div>

            <button
              onClick={() => toggleFamily('declared')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                activeFamilies.declared
                  ? 'bg-teal-50 text-teal-800 border-teal-600 shadow-2xs'
                  : 'bg-white text-slate-400 border-slate-200'
              }`}
            >
              <span className="w-3 h-0.5 bg-teal-600 inline-block rounded"></span>
              <span>Declared</span>
              <span className="text-[10px] opacity-80">{links.filter((l) => l.family === 'declared').length}</span>
            </button>

            <button
              onClick={() => toggleFamily('unresolved')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                activeFamilies.unresolved
                  ? 'bg-amber-50 text-amber-800 border-amber-500 shadow-2xs'
                  : 'bg-white text-slate-400 border-slate-200'
              }`}
            >
              <span className="w-3 h-0.5 border-b-2 border-dashed border-amber-600 inline-block"></span>
              <span>Unresolved</span>
              <span className="text-[10px] opacity-80">{links.filter((l) => l.family === 'unresolved').length}</span>
            </button>

            <button
              onClick={() => toggleFamily('similarity')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                activeFamilies.similarity
                  ? 'bg-slate-200 text-slate-800 border-slate-400'
                  : 'bg-white text-slate-400 border-slate-200'
              }`}
            >
              <span className="w-3 h-0.5 bg-slate-400 inline-block"></span>
              <span>Similarity</span>
              <span className="text-[10px] opacity-80">{links.filter((l) => l.family === 'similarity').length}</span>
            </button>
          </div>

          {/* Counts pill from screenshot */}
          <div className="flex items-center gap-3 font-mono text-[10px] text-slate-500 border-l border-slate-200 pl-3">
            <div>
              <strong className="text-slate-800 font-bold">{filteredNodes.length}</strong> NODES
            </div>
            <div>
              <strong className="text-slate-800 font-bold">{filteredLinks.length}</strong> LINKS
            </div>
            <div>
              <strong className="text-slate-800 font-bold">0</strong> PROJECTS
            </div>
            <div>
              <strong className="text-slate-800 font-bold">0</strong> TAGS
            </div>
          </div>
        </div>
      </div>

      {/* 3. Interactive Graph Canvas Stage */}
      <div
        className={`relative flex-1 bg-slate-100/50 overflow-hidden flex items-center justify-center transition-all ${
          activeUiBadge === 6 ? 'ring-4 ring-amber-400/80 bg-amber-50/20' : ''
        }`}
      >
        {/* Floating Badge 6 on Canvas */}
        <div className={`absolute top-3 left-3 ${activeUiBadge === 6 ? 'z-[90]' : 'z-20'}`}>
          <div className="relative inline-flex items-center">
            <button
              type="button"
              onClick={() => {
                setActiveUiBadge(activeUiBadge === 6 ? null : 6);
                setShowGuide(true);
                setGuideTab('ui_breakdown');
              }}
              className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-all shadow-md cursor-pointer flex items-center gap-1 ${
                activeUiBadge === 6 ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 scale-105' : 'bg-teal-800 text-white hover:bg-teal-700'
              }`}
              title="Item #6: Interactive Topology Map"
            >
              <span>#6 Interactive Topology Map</span>
            </button>
            {renderChipPopover(6, 'bottom-left')}
          </div>
        </div>
        {/* Faint Dotted Grid Pattern matching screenshot */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage: `radial-gradient(#94a3b8 0.75px, transparent 0.75px)`,
            backgroundSize: `16px 16px`,
          }}
        />

        <svg className="w-full h-full cursor-grab active:cursor-grabbing" viewBox="0 0 500 380">
          <defs>
            <marker
              id="arrow-teal"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#0d9488" />
            </marker>
            <marker
              id="arrow-amber"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#ea580c" />
            </marker>
          </defs>

          {/* Links */}
          {filteredLinks.map((link, idx) => {
            const srcNode = filteredNodes.find((n) => n.id === link.source);
            const tgtNode = filteredNodes.find((n) => n.id === link.target);
            if (!srcNode || !tgtNode) return null;

            let strokeColor = '#94a3b8';
            let strokeDash = 'none';
            let strokeWidth = 1.2;
            let marker = undefined;

            if (link.family === 'declared') {
              strokeColor = '#0d9488'; // Teal
              strokeWidth = 1.8;
              marker = 'url(#arrow-teal)';
            } else if (link.family === 'unresolved') {
              strokeColor = '#ea580c'; // Orange / Amber
              strokeDash = '4,3';
              strokeWidth = 1.8;
              marker = 'url(#arrow-amber)';
            }

            return (
              <line
                key={idx}
                x1={srcNode.x}
                y1={srcNode.y}
                x2={tgtNode.x}
                y2={tgtNode.y}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDash}
                markerEnd={marker}
                opacity={link.family === 'similarity' ? 0.3 : 0.85}
              />
            );
          })}

          {/* Nodes */}
          {filteredNodes.map((node) => {
            const color = getNodeColor(node.osLayer, node.docType);
            const isSelected = selectedNodeId === node.id;
            const isUnresolved = node.docType === 'unresolved' || node.flags?.includes('unresolved');

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => {
                  setSelectedNodeId(node.id);
                  onNodeSelect(node);
                  if (onTaskCompleted) onTaskCompleted();
                }}
                className="cursor-pointer group"
              >
                {/* Outer Glow Halo Ring */}
                <circle
                  r={isSelected ? '24' : '16'}
                  fill={color}
                  fillOpacity={isSelected ? '0.35' : '0.15'}
                  stroke={color}
                  strokeWidth={isSelected ? '3' : '1.5'}
                  className="transition-all duration-200 group-hover:fill-opacity-30"
                />

                {/* Core Circle */}
                <circle
                  r="11"
                  fill={isUnresolved ? '#475569' : color}
                  stroke="#ffffff"
                  strokeWidth="2"
                  strokeDasharray={isUnresolved ? '3,3' : 'none'}
                />

                {/* Node Label Text */}
                {showAllLabels && (
                  <text
                    x="0"
                    y="22"
                    fill="#1e293b"
                    fontSize="8"
                    fontWeight="700"
                    fontFamily="sans-serif"
                    textAnchor="middle"
                    className="select-none pointer-events-none drop-shadow-xs"
                  >
                    {node.name.length > 22 ? node.name.substring(0, 20) + '...' : node.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Bottom Left NODE TYPES Overlay Card from screenshot */}
        <div
          className={`absolute bottom-4 left-4 bg-white/90 backdrop-blur-md border border-slate-200 p-3 rounded-2xl shadow-lg space-y-1.5 text-xs w-44 transition-all ${
            activeUiBadge === 7 ? 'z-[90] ring-2 ring-amber-400 bg-amber-50/90 scale-105' : 'z-10'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              NODE TYPES
            </span>
            {/* Badge 7 */}
            <div className="relative inline-flex items-center">
              <button
                type="button"
                onClick={() => {
                  setActiveUiBadge(activeUiBadge === 7 ? null : 7);
                  setShowGuide(true);
                  setGuideTab('ui_breakdown');
                }}
                className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold transition-all shadow-xs cursor-pointer ${
                  activeUiBadge === 7 ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 scale-110' : 'bg-teal-700 text-white hover:bg-teal-600'
                }`}
                title="Item #7: Entity Distribution Tally"
              >
                #7 Tally
              </button>
              {renderChipPopover(7, 'top-left')}
            </div>
          </div>
          <div className="space-y-1 font-medium text-[11px]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
                <span className="text-slate-700">Other</span>
              </span>
              <span className="font-mono text-slate-400">124</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                <span className="text-slate-700">Docs</span>
              </span>
              <span className="font-mono text-slate-400">74</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-600"></span>
                <span className="text-slate-700">Team</span>
              </span>
              <span className="font-mono text-slate-400">20</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                <span className="text-slate-700">Ontology</span>
              </span>
              <span className="font-mono text-slate-400">14</span>
            </div>
          </div>
        </div>

        {/* 4. Right Side Slide-over Inspector Drawer matching screenshot */}
        {selectedNode && (
          <div
            className={`absolute top-4 right-4 bottom-4 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col animate-slideLeft transition-all ${
              activeUiBadge === 8 ? 'z-[90] ring-4 ring-amber-400 bg-amber-50/20' : 'z-30'
            }`}
          >
            {/* Header Badge */}
            <div className="p-5 pb-3 border-b border-slate-100 flex items-start justify-between shrink-0 relative z-50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                    {selectedNode.docType.toUpperCase()}DOC
                  </span>
                  {/* Badge 8 */}
                  <div className="relative inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveUiBadge(activeUiBadge === 8 ? null : 8);
                        setShowGuide(true);
                        setGuideTab('ui_breakdown');
                      }}
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold transition-all shadow-xs cursor-pointer ${
                        activeUiBadge === 8 ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 scale-110' : 'bg-teal-700 text-white hover:bg-teal-600'
                      }`}
                      title="Item #8: Node Inspector Drawer"
                    >
                      #8 Drawer
                    </button>
                    {renderChipPopover(8, 'bottom-right')}
                  </div>
                </div>
                <h3 className="text-base font-extrabold text-slate-900 mt-1.5 tracking-tight">
                  {selectedNode.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-5 pt-3 overflow-y-auto flex-1 space-y-4">
              {/* PROPERTIES Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                PROPERTIES
              </div>

              <div className="space-y-1.5 font-mono text-[11px]">
                <div>
                  <span className="text-slate-400 uppercase text-[10px] block">TITLE</span>
                  <span className="font-sans font-semibold text-slate-800">{selectedNode.title}</span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <span className="text-slate-400 uppercase text-[10px] block">TYPE</span>
                    <span className="text-slate-800 font-bold">{selectedNode.docType}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase text-[10px] block">REPO</span>
                    <span className="text-slate-800 font-bold">{selectedNode.repo}</span>
                  </div>
                </div>

                <div className="pt-1">
                  <span className="text-slate-400 uppercase text-[10px] block">PATH</span>
                  <span className="text-slate-600 break-all">{selectedNode.path}</span>
                </div>
              </div>

              {/* Reveal in Finder Button */}
              <button className="w-full py-1.5 bg-white hover:bg-slate-100 border border-teal-600 text-teal-700 rounded-lg font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shadow-2xs">
                <Folder className="w-3.5 h-3.5 text-teal-600" />
                <span>Reveal in Finder</span>
              </button>

              {/* TAGS */}
              <div className="pt-2 border-t border-slate-200/80">
                <span className="text-slate-400 uppercase text-[10px] block font-mono font-bold mb-1">
                  TAGS
                </span>
                <div className="flex flex-wrap gap-1">
                  {selectedNode.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 bg-purple-100 text-purple-800 font-mono text-[10px] rounded border border-purple-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* SUMMARY Box */}
            <div className="space-y-1 text-xs">
              <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                SUMMARY
              </div>
              <p className="text-slate-600 leading-relaxed text-[11px] bg-slate-50 p-3 rounded-xl border border-slate-200">
                This is the primary specification component for <strong className="text-slate-800">{selectedNode.title}</strong>, mapping 1-hop dependencies across the local-search knowledge topology.
              </p>
            </div>

            {/* CONNECTIONS Box */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                <span>CONNECTIONS</span>
                <span className="text-teal-700">{outgoingConnections.length + incomingConnections.length} DECLARED</span>
              </div>

              <div className="space-y-1.5">
                {outgoingConnections.map((conn, idx) => {
                  const targetNode = nodes.find((n) => n.id === conn.target);
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedNodeId(conn.target)}
                      className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-[11px] cursor-pointer transition-all shadow-2xs"
                    >
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                        <span className="text-teal-700 font-bold">→ {conn.relation || 'links_to'}</span>
                      </div>
                      <span className="font-semibold text-slate-800 truncate max-w-[140px]">
                        {targetNode?.name || conn.target}
                      </span>
                    </div>
                  );
                })}

                {incomingConnections.map((conn, idx) => {
                  const srcNode = nodes.find((n) => n.id === conn.source);
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedNodeId(conn.source)}
                      className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-[11px] cursor-pointer transition-all shadow-2xs"
                    >
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                        <span className="text-teal-700 font-bold">← {conn.relation || 'links_to'}</span>
                      </div>
                      <span className="font-semibold text-slate-800 truncate max-w-[140px]">
                        {srcNode?.name || conn.source}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);
};
