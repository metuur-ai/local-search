import React, { useState } from 'react';
import { GraphNode, GraphLink, LinkFamily } from '../types';
import { SAMPLE_GRAPH_NODES, SAMPLE_GRAPH_LINKS } from '../data/sampleCorpus';
import {
  Search,
  Upload,
  RefreshCw,
  Folder,
  X,
  Info,
  HelpCircle,
  SlidersHorizontal,
  Check,
  Compass,
  Zap,
  Link2,
  Map as MapIcon,
  BarChart3,
  Bot,
  Target,
  ArrowLeft,
  ArrowRight,
  type LucideIcon,
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
  icon: LucideIcon;
}

// Node type -> categorical token. Defined once here and reused by
// NodeDetailModal so the legend, node fills, and inspector drawer can never
// drift from each other.
export const NODE_TYPE_STYLES: Record<
  string,
  { label: string; swatch: string; soft: string; fillVar: string }
> = {
  Platform: { label: 'Platform', swatch: 'bg-cat-1', soft: 'bg-cat-1-soft', fillVar: 'var(--color-cat-1)' },
  Docs: { label: 'Docs', swatch: 'bg-cat-4', soft: 'bg-cat-4-soft', fillVar: 'var(--color-cat-4)' },
  Team: { label: 'Team', swatch: 'bg-cat-5', soft: 'bg-cat-5-soft', fillVar: 'var(--color-cat-5)' },
  Ontology: { label: 'Ontology', swatch: 'bg-cat-3', soft: 'bg-cat-3-soft', fillVar: 'var(--color-cat-3)' },
};
export const DEFAULT_NODE_TYPE_STYLE = {
  label: 'Other',
  swatch: 'bg-ink-3',
  soft: 'bg-paper-3',
  fillVar: 'var(--color-ink-3)',
};
export const getNodeTypeStyle = (osLayer: string) => NODE_TYPE_STYLES[osLayer] ?? DEFAULT_NODE_TYPE_STYLE;

// Link family -> state token, reused by NodeDetailModal's connection badges.
export const LINK_FAMILY_STYLES: Record<LinkFamily, { label: string; badge: string; fillVar: string }> = {
  declared: { label: 'Declared', badge: 'bg-accent-soft text-accent-ink', fillVar: 'var(--color-accent)' },
  unresolved: { label: 'Unresolved', badge: 'bg-warn-soft text-warn-ink border border-warn/25', fillVar: 'var(--color-warn)' },
  similarity: { label: 'Similarity', badge: 'bg-paper-3 text-ink-2', fillVar: 'var(--color-ink-3)' },
};

const UI_BREAKDOWN_ITEMS: UiBreakdownItem[] = [
  {
    id: 1,
    badge: '1',
    title: 'Header & Context Badge',
    subtitle: 'Workspace & Atlas Identifier',
    description: 'Shows active project repo (`local-search`) and system mode (`KNOWLEDGE ATLAS`). Confirms which codebase subgraph is active.',
    benefits: ['Confirms active repository scope', 'Identifies Knowledge Atlas mode'],
    icon: Compass,
  },
  {
    id: 2,
    badge: '2',
    title: 'Global Search Bar',
    subtitle: 'Real-time Fuzzy Entity Search',
    description: 'Filters and highlights graph nodes in real-time. Matches node IDs, document titles, YAML tags, or path names.',
    benefits: ['Instant node pinpointing', 'Cross-repo keyword searching'],
    icon: Search,
  },
  {
    id: 3,
    badge: '3',
    title: 'Action Controls Cluster',
    subtitle: 'Visibility & Topology Refresher',
    description: 'Houses guide toggle, "All labels" clutter checkbox, "Upload JSON" importer, and "Refresh from repos" topology rebuild launcher.',
    benefits: ['Toggle text label clutter', 'Re-index git commits & frontmatter'],
    icon: Zap,
  },
  {
    id: 4,
    badge: '4',
    title: 'Sub-Filters Toolbar',
    subtitle: 'Multi-Facet Scope Granularity',
    description: 'Slices graph by File Type (Docs, PRD, API), Repository (`uncle-os`, `billing-service`), Directory (`/docs`, `/payments`), or Tag.',
    benefits: ['Isolate specific microservices', 'Filter by document domain'],
    icon: SlidersHorizontal,
  },
  {
    id: 5,
    badge: '5',
    title: 'Connection Legend & Tally',
    subtitle: 'Edge Relationship Classifier',
    description: 'Color-coded link family toggles: Declared (solid accent = explicit links), Unresolved (dashed warn = missing targets), and Similarity (dotted neutral = AI vector affinity).',
    benefits: ['Audit broken dependencies', 'Live entity & link tally'],
    icon: Link2,
  },
  {
    id: 6,
    badge: '6',
    title: 'Interactive Topology Canvas',
    subtitle: 'Force-Directed Graph Visualization',
    description: 'Interactive map with color-coded nodes (Docs, Ontology, Team, Platform each a distinct category) connected by directional arrow links.',
    benefits: ['Drag nodes & inspect topology', 'Visual directional flow'],
    icon: MapIcon,
  },
  {
    id: 7,
    badge: '7',
    title: 'Entity Distribution Tally',
    subtitle: 'Monorepo Composition Summary',
    description: 'Floating bottom-left legend card tallying the exact breakdown of entity categories (124 Other, 74 Docs, 20 Team, 14 Ontology).',
    benefits: ['Repository composition audit', 'Quick color-coded legend'],
    icon: BarChart3,
  },
  {
    id: 8,
    badge: '8',
    title: 'Node Inspector Drawer',
    subtitle: 'Deep Inspector & File Finder',
    description: 'Sliding right drawer displaying title, file path, repository, YAML tags, AI summary, "Reveal in Finder" button, and 1-hop dependency tree.',
    benefits: ['Inspect document frontmatter', 'Jump to file in workspace'],
    icon: Search,
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

  // Color mapping: one categorical token per node type (see NODE_TYPE_STYLES).
  const getNodeColor = (osLayer: string, docType: string) => {
    if (docType === 'unresolved') return DEFAULT_NODE_TYPE_STYLE.fillVar;
    return getNodeTypeStyle(osLayer).fillVar;
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

    const ItemIcon = item.icon;

    return (
      <div
        className={`absolute ${posClasses} z-[100] w-72 sm:w-80 max-w-[calc(100vw-2.5rem)] bg-panel/95 text-panel-ink backdrop-blur-md rounded-card border border-panel-edge shadow-2xs p-4 text-xs space-y-3 animate-fadeIn ring-2 ring-focus/50`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pointer Triangle */}
        <div
          className={`absolute w-3 h-3 bg-panel border-panel-edge rotate-45 ${
            position.startsWith('top')
              ? 'bottom-[-6px] border-b border-r'
              : 'top-[-6px] border-t border-l'
          } ${position.endsWith('right') ? 'right-4' : 'left-4'}`}
        />

        {/* Header */}
        <div className="flex items-start justify-between border-b border-panel-edge pb-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-pill bg-accent text-accent-contrast font-mono font-bold text-xs flex items-center justify-center shadow-2xs">
              {item.id}
            </span>
            <div>
              <h4 className="font-extrabold text-panel-ink text-xs sm:text-sm leading-tight flex items-center gap-1.5">
                <span>{item.title}</span>
                <ItemIcon className="w-4 h-4" aria-hidden="true" />
              </h4>
              <p className="text-[10px] text-panel-ink-3 font-mono">{item.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveUiBadge(null)}
            aria-label="Close item details"
            className="text-panel-ink-3 hover:text-panel-ink p-1 rounded-input hover:bg-panel-raised transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Description */}
        <p className="text-[11px] text-panel-ink-2 leading-relaxed bg-panel-inset p-2.5 rounded-card border border-panel-edge">
          {item.description}
        </p>

        {/* Key Benefits */}
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

        {/* Footer Navigation */}
        <div className="pt-2 border-t border-panel-edge flex items-center justify-between text-[11px]">
          <span className="text-[10px] text-panel-ink-3 font-mono">
            Item {id} of 8
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveUiBadge(prevId)}
              className="px-2.5 py-1 bg-panel-raised hover:bg-panel-edge text-panel-ink-2 rounded-input text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
            >
              <ArrowLeft className="w-3 h-3" aria-hidden="true" />
              <span>Prev</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveUiBadge(nextId)}
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
    <div className="flex flex-col gap-4 h-full">
      {/* Knowledge Graph Explainer Banner (Above Graph Explorer Card) */}
      {showGuide && (
        <div className="bg-paper text-ink p-4 sm:p-5 rounded-card border border-rule z-20 relative animate-fadeIn shadow-2xs shrink-0">
          <button
            onClick={() => setShowGuide(false)}
            aria-label="Close explanation banner"
            className="absolute top-3 right-3 text-ink-3 hover:text-ink p-1 rounded-input hover:bg-paper-3 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
            title="Close Explanation Banner"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="max-w-6xl mx-auto space-y-4">
            {/* Header & Tab Selector */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-accent-soft text-accent-ink border border-accent/25 font-mono text-xs font-bold uppercase rounded-input">
                  Knowledge Graph Guide
                </span>
                <h3 className="font-display font-semibold text-base sm:text-lg text-ink">
                  Knowledge Graph Concept &amp; UI Explorer Guide
                </h3>
              </div>

              {/* Guide Mode Tabs */}
              <div className="flex items-center gap-1.5 bg-paper-3 p-1 rounded-card border border-rule">
                <button
                  type="button"
                  onClick={() => setGuideTab('concept')}
                  className={`px-3 py-1 rounded-input text-sm font-semibold transition-all cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                    guideTab === 'concept'
                      ? 'bg-ink text-paper shadow-2xs font-bold'
                      : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  <Info className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Concept &amp; Purpose</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGuideTab('ui_breakdown')}
                  className={`px-3 py-1 rounded-input text-sm font-semibold transition-all cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                    guideTab === 'ui_breakdown'
                      ? 'bg-ink text-paper shadow-2xs font-bold'
                      : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>UI Element Breakdown (1–8)</span>
                </button>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-ink-2 leading-relaxed bg-paper-3 border border-rule rounded-input px-3 py-2">
              <strong className="text-ink">Heads up — this is a mock.</strong> The explorer below reproduces the
              look and feel of the real <code className="font-mono text-ink bg-paper px-1 py-0.5 rounded-input">local-search</code> graph
              UI so you can learn how to drive it. The nodes and edges are sample data, not your indexed repos. Click
              the numbered badges to walk through each control, then run the real thing locally.
            </p>

            {/* TAB 1: CONCEPT & PURPOSE */}
            {guideTab === 'concept' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm animate-fadeIn">
                {/* Card 1: What is it? */}
                <div className="bg-white border border-rule rounded-card p-3.5 space-y-2 shadow-2xs">
                  <div className="font-bold text-ink flex items-center gap-1.5 text-sm">
                    <Info className="w-4 h-4" aria-hidden="true" />
                    <span>1. What is the Knowledge Graph?</span>
                  </div>
                  <p className="text-ink-2 leading-relaxed text-sm">
                    A structured, interactive topology map linking specifications, architecture decisions, microservices, and code entities across your workspace repositories into an interconnected semantic atlas.
                  </p>
                  <div className="space-y-1 text-xs font-mono text-ink-2 bg-paper-2 p-2.5 rounded-input border border-rule">
                    <div>• <strong className="text-ink">Nodes:</strong> Spec files, PRDs, component modules, and EARS requirements.</div>
                    <div>• <strong className="text-ink">Edges:</strong> Directional links declared via YAML frontmatter (<code className="text-ink bg-paper-3 px-1 py-0.5 rounded-input">dependsOn</code>), inline Wikilinks (<code className="text-ink bg-paper-3 px-1 py-0.5 rounded-input">[[doc]]</code>), and vector embeddings.</div>
                    <div>• <strong className="text-ink">Families:</strong> <span className="text-accent-ink font-bold">Declared</span> (explicit links), <span className="text-warn-ink font-bold">Unresolved</span> (missing targets), <span className="text-ink-2 font-bold">Similarity</span> (semantic affinity).</div>
                  </div>
                </div>

                {/* Card 2: What is it useful for? */}
                <div className="bg-white border border-rule rounded-card p-3.5 space-y-2 shadow-2xs">
                  <div className="font-bold text-ink flex items-center gap-1.5 text-sm">
                    <HelpCircle className="w-4 h-4" aria-hidden="true" />
                    <span>2. What is it useful for?</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-paper-2 rounded-input border border-rule">
                      <div className="font-bold text-ink flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Blast Radius Analysis</span>
                      </div>
                      <p className="text-ink-2 text-xs mt-0.5">
                        Instantly see downstream microservices or specs that break when modifying a core API or requirement.
                      </p>
                    </div>
                    <div className="p-2 bg-paper-2 rounded-input border border-rule">
                      <div className="font-bold text-ink flex items-center gap-1.5">
                        <MapIcon className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Monorepo Discovery</span>
                      </div>
                      <p className="text-ink-2 text-xs mt-0.5">
                        Traverse cross-repository linkages visually without memorizing multi-repo directory hierarchies.
                      </p>
                    </div>
                    <div className="p-2 bg-paper-2 rounded-input border border-rule">
                      <div className="font-bold text-ink flex items-center gap-1.5">
                        <Bot className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>AI Agent Grounding</span>
                      </div>
                      <p className="text-ink-2 text-xs mt-0.5">
                        Feeds deterministic 1-hop subgraphs to LLMs (Claude Code) so AI coding agents respect architectural rules.
                      </p>
                    </div>
                    <div className="p-2 bg-paper-2 rounded-input border border-rule">
                      <div className="font-bold text-ink flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Spec Traceability</span>
                      </div>
                      <p className="text-ink-2 text-xs mt-0.5">
                        Trace EARS requirements (<code className="text-ink bg-paper-3 px-1 py-0.5 rounded-input">@spec</code>) and Wikilinks (<code className="text-ink bg-paper-3 px-1 py-0.5 rounded-input">[[doc]]</code>) to audit compliance.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: UI ELEMENTS BREAKDOWN (1-8) */}
            {guideTab === 'ui_breakdown' && (
              <div className="space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between text-sm text-ink-2">
                  <p className="text-sm text-ink-2 font-medium">
                    Click any title below to highlight its exact UI control location and open its details modal in the Graph Explorer mock:
                  </p>
                  {activeUiBadge !== null && (
                    <button
                      type="button"
                      onClick={() => setActiveUiBadge(null)}
                      className="text-xs text-accent-ink hover:underline font-semibold flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                    >
                      <span>Clear selection</span>
                    </button>
                  )}
                </div>

                {/* Compact Title Buttons Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {UI_BREAKDOWN_ITEMS.map((item) => {
                    const isSelected = activeUiBadge === item.id;
                    const ItemIcon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveUiBadge(isSelected ? null : item.id)}
                        className={`px-3 py-2.5 rounded-card border text-left transition-all cursor-pointer flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                          isSelected
                            ? 'bg-accent text-accent-contrast border-accent shadow-2xs font-bold ring-2 ring-focus/80'
                            : 'bg-white hover:bg-paper-2 border-rule hover:border-rule-strong text-ink shadow-2xs'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-pill text-[10px] font-mono font-bold flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-panel-inset text-accent-contrast' : 'bg-accent-soft text-accent-ink border border-accent/25'
                          }`}
                        >
                          {item.id}
                        </span>
                        <span className="text-sm font-semibold leading-tight line-clamp-1 flex-1">
                          {item.title}
                        </span>
                        <ItemIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
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
      <div className="bg-paper text-ink rounded-card flex flex-col shadow-2xs relative flex-1 border border-rule min-h-[680px]">
        {/* 1. Header Bar matching screenshot */}
      <div
        className={`bg-white px-5 py-3 border-b border-rule flex flex-wrap items-center justify-between gap-3 transition-all ${
          activeUiBadge === 1 || activeUiBadge === 2 || activeUiBadge === 3
            ? 'z-[90] relative ring-2 ring-focus bg-accent-soft/40'
            : 'z-20 relative'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-input bg-accent text-accent-contrast flex items-center justify-center font-bold shadow-2xs">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-semibold text-ink text-base sm:text-lg tracking-tight">Agent OS Graph</h2>
              <span className="text-xs font-mono text-ink-3">local-search</span>
              {/* Badge 1 */}
              <div className="relative inline-flex items-center ml-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveUiBadge(activeUiBadge === 1 ? null : 1);
                    setShowGuide(true);
                    setGuideTab('ui_breakdown');
                  }}
                  className={`px-1.5 py-0.5 rounded-pill text-[10px] font-mono font-bold transition-all shadow-2xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                    activeUiBadge === 1 ? 'bg-accent text-accent-contrast ring-2 ring-focus scale-110' : 'bg-ink text-paper hover:bg-ink-2'
                  }`}
                  title="Item #1: Header & Workspace Identity"
                >
                  #1 Header
                </button>
                {renderChipPopover(1, 'bottom-left')}
              </div>
            </div>
            <p className="text-[10px] text-ink-3 uppercase font-mono tracking-wider font-semibold">
              KNOWLEDGE ATLAS
            </p>
          </div>
        </div>

        {/* Global Search Bar */}
        <div
          className={`flex-1 min-w-[16rem] max-w-md mx-2 relative hidden md:flex items-center gap-1 p-0.5 rounded-card transition-all ${
            activeUiBadge === 2 ? 'ring-2 ring-focus bg-accent-soft/40' : ''
          }`}
        >
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files, tags, or projects..."
              className="w-full bg-paper-3 hover:bg-paper-3 focus:bg-white text-ink text-sm rounded-input pl-8 pr-3 py-1.5 border border-rule focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 transition-all font-body"
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
              className={`px-1.5 py-0.5 rounded-pill text-[10px] font-mono font-bold transition-all shadow-2xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                activeUiBadge === 2 ? 'bg-accent text-accent-contrast ring-2 ring-focus scale-110' : 'bg-ink text-paper hover:bg-ink-2'
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
          className={`flex flex-wrap items-center justify-end gap-2 sm:gap-3 p-1 rounded-card transition-all ${
            activeUiBadge === 3 ? 'ring-2 ring-focus bg-accent-soft/40' : ''
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
              className={`px-1.5 py-0.5 rounded-pill text-[10px] font-mono font-bold transition-all shadow-2xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                activeUiBadge === 3 ? 'bg-accent text-accent-contrast ring-2 ring-focus scale-110' : 'bg-ink text-paper hover:bg-ink-2'
              }`}
              title="Item #3: Action Controls Cluster"
            >
              #3 Actions
            </button>
            {renderChipPopover(3, 'bottom-right')}
          </div>

          <button
            onClick={() => setShowGuide(!showGuide)}
            className={`px-3 py-1.5 rounded-input text-sm font-semibold flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
              showGuide
                ? 'bg-accent-soft text-accent-ink border border-accent/25 shadow-2xs'
                : 'bg-white hover:bg-paper-2 text-ink-2 border border-rule'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
            <span>What is Knowledge Graph?</span>
          </button>

          {/* All Labels Toggle */}
          <label className="flex items-center gap-2 text-sm font-medium text-ink-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showAllLabels}
              onChange={(e) => setShowAllLabels(e.target.checked)}
              className="rounded-input border-rule-strong text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 w-3.5 h-3.5"
            />
            <span>All labels</span>
          </label>

          <button className="px-3 py-1.5 bg-white hover:bg-paper-2 text-ink-2 rounded-input text-sm font-semibold border border-rule flex items-center gap-1.5 shadow-2xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2">
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Upload JSON</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setShowRebuildPopover(!showRebuildPopover)}
              className="px-3 py-1.5 bg-accent hover:bg-accent-ink active:bg-accent-ink text-accent-contrast rounded-input text-sm font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Refresh from repos</span>
            </button>

            {/* Rebuild Popover Modal */}
            {showRebuildPopover && (
              <div className="absolute right-0 top-10 w-72 bg-white rounded-card p-4 shadow-2xs border border-rule z-50 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-rule pb-2">
                  <h4 className="font-bold text-ink text-sm">Rebuild graph from repos</h4>
                  <button
                    onClick={() => setShowRebuildPopover(false)}
                    aria-label="Close rebuild dialog"
                    className="text-ink-3 hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 rounded-input"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-2 text-sm text-ink-2">
                  {[
                    { id: 'team-os-example-repo', specs: 195 },
                    { id: 'uncle-os', specs: 161 },
                    { id: 'squirrel', specs: 361 },
                    { id: 'foyer-platform', specs: 120 },
                  ].map((repo) => {
                    const isChecked = selectedRebuildRepos.includes(repo.id);
                    return (
                      <label key={repo.id} className="flex items-center gap-2 cursor-pointer hover:bg-paper-2 p-1 rounded-input">
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
                          className="rounded-input border-rule-strong text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                        />
                        <span className="font-mono text-xs">{repo.id}</span>
                        <span className="text-xs text-ink-3 ml-auto">({repo.specs} specs)</span>
                      </label>
                    );
                  })}
                </div>

                <button
                  onClick={() => {
                    setShowRebuildPopover(false);
                    if (onTaskCompleted) onTaskCompleted();
                  }}
                  className="w-full py-2 bg-accent hover:bg-accent-ink text-accent-contrast rounded-input text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
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
        className={`bg-paper-2 px-5 py-2.5 border-b border-rule flex flex-wrap items-center justify-between gap-3 text-sm transition-all ${
          activeUiBadge === 4 || activeUiBadge === 5
            ? 'z-[90] relative ring-2 ring-focus bg-accent-soft/30'
            : 'z-10 relative'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono font-bold text-ink-3 uppercase tracking-wider">
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
                className={`px-1.5 py-0.5 rounded-pill text-[10px] font-mono font-bold transition-all shadow-2xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                  activeUiBadge === 4 ? 'bg-accent text-accent-contrast ring-2 ring-focus scale-110' : 'bg-ink text-paper hover:bg-ink-2'
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
            className="bg-white border border-rule rounded-input px-2.5 py-1 text-ink-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 shadow-2xs"
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
            className="bg-white border border-rule rounded-input px-2.5 py-1 text-ink-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 shadow-2xs"
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
            className="bg-white border border-rule rounded-input px-2.5 py-1 text-ink-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 shadow-2xs"
          >
            <option value="all">All Directories</option>
            <option value="docs">/docs</option>
            <option value="payments">/payments</option>
            <option value="services">/services</option>
          </select>

          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="bg-white border border-rule rounded-input px-2.5 py-1 text-ink-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 shadow-2xs"
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
            className="bg-white border border-rule rounded-input px-2.5 py-1 text-ink-2 text-sm placeholder:text-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 w-28 shadow-2xs"
          />

          <input
            type="text"
            value={titleContains}
            onChange={(e) => setTitleContains(e.target.value)}
            placeholder="Title contains..."
            className="bg-white border border-rule rounded-input px-2.5 py-1 text-ink-2 text-sm placeholder:text-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 w-28 shadow-2xs"
          />
        </div>

        {/* Connection Filters & Stats Summary */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5 border-l border-rule pl-3">
            <span className="text-xs font-mono text-ink-3 font-bold uppercase tracking-wider">
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
                className={`px-1.5 py-0.5 rounded-pill text-[10px] font-mono font-bold transition-all shadow-2xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                  activeUiBadge === 5 ? 'bg-accent text-accent-contrast ring-2 ring-focus scale-110' : 'bg-ink text-paper hover:bg-ink-2'
                }`}
                title="Item #5: Connections Classifier & Stats"
              >
                #5 Connections
              </button>
              {renderChipPopover(5, 'bottom-right')}
            </div>

            <button
              onClick={() => toggleFamily('declared')}
              className={`px-2.5 py-1 rounded-input text-xs font-bold border transition-all flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                activeFamilies.declared
                  ? `${LINK_FAMILY_STYLES.declared.badge} border-accent shadow-2xs`
                  : 'bg-white text-ink-3 border-rule'
              }`}
            >
              <span className="w-3 h-0.5 bg-accent inline-block rounded-input"></span>
              <span>{LINK_FAMILY_STYLES.declared.label}</span>
              <span className="text-[10px] opacity-80">{links.filter((l) => l.family === 'declared').length}</span>
            </button>

            <button
              onClick={() => toggleFamily('unresolved')}
              className={`px-2.5 py-1 rounded-input text-xs font-bold border transition-all flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                activeFamilies.unresolved
                  ? `${LINK_FAMILY_STYLES.unresolved.badge} shadow-2xs`
                  : 'bg-white text-ink-3 border-rule'
              }`}
            >
              <span className="w-3 h-0.5 border-b-2 border-dashed border-warn inline-block"></span>
              <span>{LINK_FAMILY_STYLES.unresolved.label}</span>
              <span className="text-[10px] opacity-80">{links.filter((l) => l.family === 'unresolved').length}</span>
            </button>

            <button
              onClick={() => toggleFamily('similarity')}
              className={`px-2.5 py-1 rounded-input text-xs font-bold border transition-all flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                activeFamilies.similarity
                  ? `${LINK_FAMILY_STYLES.similarity.badge} border-rule-strong`
                  : 'bg-white text-ink-3 border-rule'
              }`}
            >
              <span className="w-3 h-0.5 bg-ink-3 inline-block"></span>
              <span>{LINK_FAMILY_STYLES.similarity.label}</span>
              <span className="text-[10px] opacity-80">{links.filter((l) => l.family === 'similarity').length}</span>
            </button>
          </div>

          {/* Counts pill from screenshot */}
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-ink-3 border-l border-rule pl-3">
            <div>
              <strong className="text-ink font-bold">{filteredNodes.length}</strong> NODES
            </div>
            <div>
              <strong className="text-ink font-bold">{filteredLinks.length}</strong> LINKS
            </div>
            <div>
              <strong className="text-ink font-bold">0</strong> PROJECTS
            </div>
            <div>
              <strong className="text-ink font-bold">0</strong> TAGS
            </div>
          </div>
        </div>
      </div>

      {/* 3. Interactive Graph Canvas Stage */}
      <div
        className={`relative flex-1 bg-paper-2 overflow-hidden flex items-center justify-center transition-all ${
          activeUiBadge === 6 ? 'ring-4 ring-focus/80 bg-accent-soft/20' : ''
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
              className={`px-2 py-1 rounded-input text-[10px] font-mono font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                activeUiBadge === 6 ? 'bg-accent text-accent-contrast ring-2 ring-focus scale-105' : 'bg-ink text-paper hover:bg-ink-2'
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
            backgroundImage: `radial-gradient(var(--color-rule-strong) 0.75px, transparent 0.75px)`,
            backgroundSize: `16px 16px`,
          }}
        />

        <svg className="w-full h-full cursor-grab active:cursor-grabbing" viewBox="0 0 500 380">
          <defs>
            <marker
              id="arrow-declared"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={LINK_FAMILY_STYLES.declared.fillVar} />
            </marker>
            <marker
              id="arrow-unresolved"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={LINK_FAMILY_STYLES.unresolved.fillVar} />
            </marker>
          </defs>

          {/* Links */}
          {filteredLinks.map((link, idx) => {
            const srcNode = filteredNodes.find((n) => n.id === link.source);
            const tgtNode = filteredNodes.find((n) => n.id === link.target);
            if (!srcNode || !tgtNode) return null;

            let strokeColor = LINK_FAMILY_STYLES.similarity.fillVar;
            let strokeDash = 'none';
            let strokeWidth = 1.2;
            let marker = undefined;

            if (link.family === 'declared') {
              strokeColor = LINK_FAMILY_STYLES.declared.fillVar;
              strokeWidth = 1.8;
              marker = 'url(#arrow-declared)';
            } else if (link.family === 'unresolved') {
              strokeColor = LINK_FAMILY_STYLES.unresolved.fillVar;
              strokeDash = '4,3';
              strokeWidth = 1.8;
              marker = 'url(#arrow-unresolved)';
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
                  fill={isUnresolved ? DEFAULT_NODE_TYPE_STYLE.fillVar : color}
                  stroke="var(--color-paper)"
                  strokeWidth="2"
                  strokeDasharray={isUnresolved ? '3,3' : 'none'}
                />

                {/* Node Label Text */}
                {showAllLabels && (
                  <text
                    x="0"
                    y="22"
                    fill="var(--color-ink)"
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
          className={`absolute bottom-4 left-4 bg-white/90 backdrop-blur-md border border-rule p-3 rounded-card shadow-2xs space-y-1.5 text-xs w-44 transition-all ${
            activeUiBadge === 7 ? 'z-[90] ring-2 ring-focus bg-accent-soft/90 scale-105' : 'z-10'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono font-bold text-ink-3 uppercase tracking-wider">
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
                className={`px-1.5 py-0.5 rounded-pill text-[9px] font-mono font-bold transition-all shadow-2xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                  activeUiBadge === 7 ? 'bg-accent text-accent-contrast ring-2 ring-focus scale-110' : 'bg-ink text-paper hover:bg-ink-2'
                }`}
                title="Item #7: Entity Distribution Tally"
              >
                #7 Tally
              </button>
              {renderChipPopover(7, 'top-left')}
            </div>
          </div>
          <div className="space-y-1 font-medium text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-pill ${DEFAULT_NODE_TYPE_STYLE.swatch}`}></span>
                <span className="text-ink-2">{DEFAULT_NODE_TYPE_STYLE.label}</span>
              </span>
              <span className="font-mono text-ink-3">124</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-pill ${NODE_TYPE_STYLES.Docs.swatch}`}></span>
                <span className="text-ink-2">{NODE_TYPE_STYLES.Docs.label}</span>
              </span>
              <span className="font-mono text-ink-3">74</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-pill ${NODE_TYPE_STYLES.Team.swatch}`}></span>
                <span className="text-ink-2">{NODE_TYPE_STYLES.Team.label}</span>
              </span>
              <span className="font-mono text-ink-3">20</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-pill ${NODE_TYPE_STYLES.Ontology.swatch}`}></span>
                <span className="text-ink-2">{NODE_TYPE_STYLES.Ontology.label}</span>
              </span>
              <span className="font-mono text-ink-3">14</span>
            </div>
          </div>
        </div>

        {/* 4. Right Side Slide-over Inspector Drawer matching screenshot */}
        {selectedNode && (
          <div
            className={`absolute top-4 right-4 bottom-4 w-80 sm:w-96 bg-white rounded-card shadow-2xs border border-rule flex flex-col animate-slideLeft transition-all ${
              activeUiBadge === 8 ? 'z-[90] ring-4 ring-focus bg-accent-soft/20' : 'z-30'
            }`}
          >
            {/* Header Badge */}
            <div className="p-5 pb-3 border-b border-rule flex items-start justify-between shrink-0 relative z-50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-ink-2 bg-paper-2 px-2 py-0.5 rounded-input border border-rule">
                    {selectedNode.docType.toUpperCase()}DOC
                  </span>
                  <span className="flex items-center gap-1 text-xs font-mono font-bold text-ink-2">
                    <span className={`w-2 h-2 rounded-pill ${getNodeTypeStyle(selectedNode.osLayer).swatch}`}></span>
                    {getNodeTypeStyle(selectedNode.osLayer).label}
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
                      className={`px-1.5 py-0.5 rounded-pill text-[10px] font-mono font-bold transition-all shadow-2xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                        activeUiBadge === 8 ? 'bg-accent text-accent-contrast ring-2 ring-focus scale-110' : 'bg-ink text-paper hover:bg-ink-2'
                      }`}
                      title="Item #8: Node Inspector Drawer"
                    >
                      #8 Drawer
                    </button>
                    {renderChipPopover(8, 'bottom-right')}
                  </div>
                </div>
                <h3 className="text-base font-display font-semibold text-ink mt-1.5 tracking-tight">
                  {selectedNode.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                aria-label="Close node inspector"
                className="text-ink-3 hover:text-ink-2 p-1 hover:bg-paper-2 rounded-input transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-5 pt-3 overflow-y-auto flex-1 space-y-4">
              {/* PROPERTIES Box */}
            <div className="bg-paper-2 border border-rule rounded-card p-3.5 space-y-2.5 text-sm">
              <div className="text-xs font-mono font-bold text-ink-3 uppercase tracking-wider">
                PROPERTIES
              </div>

              <div className="space-y-1.5 font-mono text-xs">
                <div>
                  <span className="text-ink-3 uppercase text-[10px] block">TITLE</span>
                  <span className="font-body font-semibold text-ink">{selectedNode.title}</span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <span className="text-ink-3 uppercase text-[10px] block">TYPE</span>
                    <span className="text-ink font-bold">{selectedNode.docType}</span>
                  </div>
                  <div>
                    <span className="text-ink-3 uppercase text-[10px] block">REPO</span>
                    <span className="text-ink font-bold">{selectedNode.repo}</span>
                  </div>
                </div>

                <div className="pt-1">
                  <span className="text-ink-3 uppercase text-[10px] block">PATH</span>
                  <span className="text-ink-2 break-all">{selectedNode.path}</span>
                </div>
              </div>

              {/* Reveal in Finder Button */}
              <button className="w-full py-1.5 bg-white hover:bg-paper-3 border border-rule-strong text-ink rounded-input font-semibold text-sm transition-all flex items-center justify-center gap-1.5 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2">
                <Folder className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Reveal in Finder</span>
              </button>

              {/* TAGS */}
              <div className="pt-2 border-t border-rule">
                <span className="text-ink-3 uppercase text-[10px] block font-mono font-bold mb-1">
                  TAGS
                </span>
                <div className="flex flex-wrap gap-1">
                  {selectedNode.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 bg-paper-3 text-ink-2 font-mono text-[10px] rounded-input border border-rule"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* SUMMARY Box */}
            <div className="space-y-1 text-sm">
              <div className="text-xs font-mono font-bold text-ink-3 uppercase tracking-wider">
                SUMMARY
              </div>
              <p className="text-ink-2 leading-relaxed text-sm bg-paper-2 p-3 rounded-card border border-rule">
                This is the primary specification component for <strong className="text-ink">{selectedNode.title}</strong>, mapping 1-hop dependencies across the local-search knowledge topology.
              </p>
            </div>

            {/* CONNECTIONS Box */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-ink-3 uppercase tracking-wider">
                <span>CONNECTIONS</span>
                <span className="text-accent-ink">{outgoingConnections.length + incomingConnections.length} DECLARED</span>
              </div>

              <div className="space-y-1.5">
                {outgoingConnections.map((conn, idx) => {
                  const targetNode = nodes.find((n) => n.id === conn.target);
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedNodeId(conn.target)}
                      className="p-2 bg-white hover:bg-paper-2 border border-rule rounded-card flex items-center justify-between text-xs cursor-pointer transition-all shadow-2xs"
                    >
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="w-2 h-2 rounded-pill bg-accent"></span>
                        <span className="text-accent-ink font-bold">Out - {conn.relation || 'links_to'}</span>
                      </div>
                      <span className="font-semibold text-ink truncate max-w-[140px]">
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
                      className="p-2 bg-white hover:bg-paper-2 border border-rule rounded-card flex items-center justify-between text-xs cursor-pointer transition-all shadow-2xs"
                    >
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="w-2 h-2 rounded-pill bg-accent"></span>
                        <span className="text-accent-ink font-bold">In - {conn.relation || 'links_to'}</span>
                      </div>
                      <span className="font-semibold text-ink truncate max-w-[140px]">
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
