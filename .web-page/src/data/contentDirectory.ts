import { ActiveTab } from '../types';

/**
 * The static content directory behind the header search.
 *
 * Every entry points at a section that exists on this page. Nothing here is
 * fetched or indexed at runtime: the site is a static build, so the directory
 * is the index, and search is a plain scan over it. Keep entries grounded in
 * content that is actually rendered — a hit that navigates to a section with no
 * matching content is worse than no hit at all.
 */

export type DirectoryCategory =
  | 'Section'
  | 'Concept'
  | 'CLI command'
  | 'Config'
  | 'AI skill'
  | 'Workflow';

export interface DirectoryEntry {
  id: string;
  title: string;
  description: string;
  tab: ActiveTab;
  category: DirectoryCategory;
  keywords: string[];
}

export const CATEGORY_ORDER: DirectoryCategory[] = [
  'Section',
  'Concept',
  'CLI command',
  'AI skill',
  'Config',
  'Workflow',
];

export const CONTENT_DIRECTORY: DirectoryEntry[] = [
  /* ---------------------------------------------------------------- Sections */
  {
    id: 'section-overview',
    title: 'Index & Overview',
    description: 'Why local-search exists, what it does, and how to install it.',
    tab: 'overview',
    category: 'Section',
    keywords: ['why', 'what', 'how', 'intro', 'start', 'home', 'getting started'],
  },
  {
    id: 'section-search',
    title: 'Local Search & BM25 Sandbox',
    description: 'Run queries against a sample corpus and inspect how results are scored.',
    tab: 'search',
    category: 'Section',
    keywords: ['sandbox', 'query', 'results', 'ranking', 'playground'],
  },
  {
    id: 'section-indexing',
    title: 'How we Index',
    description: 'Engine internals: tokenizing, scoring, and the links that become graph edges.',
    tab: 'indexing',
    category: 'Section',
    keywords: ['internals', 'engine', 'pipeline', 'sqlite', 'fts5', 'index'],
  },
  {
    id: 'section-cli',
    title: 'CLI Terminal Explorer',
    description: 'Interactive terminal simulator for the local-search command line.',
    tab: 'cli',
    category: 'Section',
    keywords: ['terminal', 'shell', 'command line', 'console', 'interactive'],
  },
  {
    id: 'section-aiskill',
    title: 'AI Skill',
    description: 'How the Claude Code skill wraps local-search for grounded answers.',
    tab: 'aiskill',
    category: 'Section',
    keywords: ['claude code', 'agent', 'skill', 'llm', 'assistant'],
  },
  {
    id: 'section-graph',
    title: 'Knowledge Graph',
    description: 'Explore the 1-hop neighborhood map of specs and their relationships.',
    tab: 'graph',
    category: 'Section',
    keywords: ['graph', 'nodes', 'edges', 'neighborhood', 'map', 'relationships'],
  },
  {
    id: 'section-workflows',
    title: 'Interactive Workflows',
    description: 'Step-through scenarios covering real team situations end to end.',
    tab: 'workflows',
    category: 'Section',
    keywords: ['scenarios', 'walkthrough', 'simulator', 'demo'],
  },
  {
    id: 'section-config',
    title: 'Config & Matrix',
    description: 'Configuration keys, defaults, file locations, and syntax reference.',
    tab: 'config',
    category: 'Section',
    keywords: ['settings', 'toml', 'reference', 'defaults'],
  },

  /* ---------------------------------------------------------------- Concepts */
  {
    id: 'concept-install',
    title: 'How to install',
    description: 'The one-line installer, what it puts where, and the offline / binary / source alternatives.',
    tab: 'overview',
    category: 'Concept',
    keywords: [
      'install',
      'installation',
      'setup',
      'curl',
      'install.sh',
      'download',
      'binary',
      'source',
      'getting started',
      'node',
    ],
  },
  {
    id: 'concept-pillars',
    title: 'The Four Pillars',
    description: 'Pure Go & SQLite FTS5, knowledge graph, grounded AI answers, @spec & media sidecars.',
    tab: 'overview',
    category: 'Concept',
    keywords: ['pillars', 'go', 'architecture', 'design', 'principles'],
  },
  {
    id: 'concept-architecture',
    title: 'Under the Hood Architecture',
    description: 'How the pieces fit together from markdown on disk to a ranked answer.',
    tab: 'overview',
    category: 'Concept',
    keywords: ['architecture', 'diagram', 'internals', 'flow'],
  },
  {
    id: 'concept-three-ways',
    title: 'Three ways to use it',
    description: 'Terminal CLI commands, the Claude Code AI skill, and this web console sandbox.',
    tab: 'overview',
    category: 'Concept',
    keywords: ['cli', 'skill', 'web console', 'interfaces', 'usage'],
  },
  {
    id: 'concept-porter-stemming',
    title: 'Porter Stemming & unicode61',
    description: 'Tokenizing so "refunding" and "refunds" both match "refund".',
    tab: 'indexing',
    category: 'Concept',
    keywords: ['stemming', 'porter', 'tokenizer', 'unicode61', 'stem', 'morphology'],
  },
  {
    id: 'concept-bm25',
    title: 'BM25 Scoring',
    description: 'Term frequency and document length ranking that produces the candidate list.',
    tab: 'indexing',
    category: 'Concept',
    keywords: ['bm25', 'scoring', 'ranking', 'relevance', 'tf-idf'],
  },
  {
    id: 'concept-rrf',
    title: 'RRF fusion & --semantic',
    description: 'BM25 and 256-d cosine rankings fused by position with Reciprocal Rank Fusion.',
    tab: 'indexing',
    category: 'Concept',
    keywords: ['rrf', 'reciprocal rank fusion', 'semantic', 'vector', 'cosine', 'embedding', 'hybrid'],
  },
  {
    id: 'concept-source-auto',
    title: '--source auto',
    description: 'How the engine picks which sources to draw candidates from.',
    tab: 'indexing',
    category: 'Concept',
    keywords: ['source', 'auto', 'flag', 'selection'],
  },
  {
    id: 'concept-rank-auto',
    title: '--rank auto',
    description: 'How the ranking strategy is chosen, and why the two flags do not combine.',
    tab: 'indexing',
    category: 'Concept',
    keywords: ['rank', 'auto', 'flag', 'strategy'],
  },
  {
    id: 'concept-specs-db',
    title: 'The disposable index (specs.db)',
    description: 'Markdown on disk is the truth; ~/.local-search/specs.db is a rebuildable cache.',
    tab: 'indexing',
    category: 'Concept',
    keywords: ['specs.db', 'sqlite', 'cache', 'database', 'rebuild', 'disposable', 'store'],
  },
  {
    id: 'concept-declared-links',
    title: 'Declared links',
    description: 'Explicit edges from frontmatter (dependsOn, relationships, upstream) and markdown links.',
    tab: 'graph',
    category: 'Concept',
    keywords: ['declared', 'frontmatter', 'dependson', 'upstream', 'edges', 'links'],
  },
  {
    id: 'concept-unresolved-links',
    title: 'Unresolved links',
    description: 'Links pointing at IDs that do not exist on disk yet — broken refs and planned work.',
    tab: 'graph',
    category: 'Concept',
    keywords: ['unresolved', 'broken', 'dangling', 'missing', 'amber'],
  },
  {
    id: 'concept-similarity-links',
    title: 'Similarity links',
    description: 'Inferred edges from shared 256-dimensional vector vocabulary overlap.',
    tab: 'graph',
    category: 'Concept',
    keywords: ['similarity', 'inferred', 'vector', 'overlap', 'derived'],
  },
  {
    id: 'concept-answer-modes',
    title: 'Graph-only vs AI Answer mode',
    description: 'Instant zero-LLM lookups versus a synthesized, cited natural language answer.',
    tab: 'search',
    category: 'Concept',
    keywords: ['ai answer', 'graph only', 'mode', 'llm', 'latency', 'synthesis'],
  },
  {
    id: 'concept-provenance',
    title: 'Provenance & citations',
    description: 'Every claim in an AI answer links back to a source file, line, or requirement tag.',
    tab: 'search',
    category: 'Concept',
    keywords: ['provenance', 'citation', 'grounded', 'sources', 'traceability'],
  },
  {
    id: 'concept-media-sidecars',
    title: 'Media sidecars',
    description: 'Pairing refund-diagram.png with a .md sidecar makes images searchable by content.',
    tab: 'search',
    category: 'Concept',
    keywords: ['sidecar', 'media', 'png', 'pdf', 'image', 'diagram', 'attachment'],
  },

  /* ------------------------------------------------------------ CLI commands */
  {
    id: 'cli-search',
    title: 'local-search search',
    description: 'Full-text BM25 search across indexed repositories.',
    tab: 'cli',
    category: 'CLI command',
    keywords: ['search', 'query', 'find text', 'bm25', 'repos'],
  },
  {
    id: 'cli-find',
    title: 'local-search find',
    description: 'Scope-aware lookup that resolves the project configuration.',
    tab: 'cli',
    category: 'CLI command',
    keywords: ['find', 'scope', 'lookup'],
  },
  {
    id: 'cli-read',
    title: 'local-search read',
    description: 'Print the full content of a specification by id.',
    tab: 'cli',
    category: 'CLI command',
    keywords: ['read', 'open', 'show', 'cat', 'content'],
  },
  {
    id: 'cli-tags',
    title: 'local-search tags',
    description: 'List requirement tag facets and their frequencies.',
    tab: 'cli',
    category: 'CLI command',
    keywords: ['tags', 'facets', 'spec', 'requirements', 'ears'],
  },
  {
    id: 'cli-repo',
    title: 'local-search repo add / list / remove',
    description: 'Register, inspect, and unregister the repositories that get indexed.',
    tab: 'cli',
    category: 'CLI command',
    keywords: ['repo', 'add', 'remove', 'list', 'register', 'repository'],
  },
  {
    id: 'cli-scope',
    title: 'local-search scope show / set / clear',
    description: 'Inspect and change which repositories the current project searches.',
    tab: 'cli',
    category: 'CLI command',
    keywords: ['scope', 'project', 'show', 'set', 'clear', 'limit'],
  },
  {
    id: 'cli-graph-explain',
    title: 'local-search graph explain',
    description: 'Explain the 1-hop neighborhood around an entity id.',
    tab: 'cli',
    category: 'CLI command',
    keywords: ['graph', 'explain', 'neighborhood', 'entity', 'capability'],
  },
  {
    id: 'cli-graph-export-view',
    title: 'local-search graph export-view',
    description: 'Export a graph view for external rendering or inspection.',
    tab: 'cli',
    category: 'CLI command',
    keywords: ['graph', 'export', 'view', 'json', 'render'],
  },
  {
    id: 'cli-init',
    title: 'local-search init / setup',
    description: 'Create the project configuration and pick the repositories in scope.',
    tab: 'cli',
    category: 'CLI command',
    keywords: ['init', 'setup', 'bootstrap', 'configure', 'new project'],
  },
  {
    id: 'cli-doctor',
    title: 'local-search doctor / stats / size',
    description: 'Diagnose the install and report index statistics and on-disk size.',
    tab: 'cli',
    category: 'CLI command',
    keywords: ['doctor', 'stats', 'size', 'diagnose', 'health', 'troubleshoot', 'debug'],
  },
  {
    id: 'cli-scan-hooks',
    title: 'local-search scan-hooks install',
    description: 'Install hooks that keep the index current as files change.',
    tab: 'cli',
    category: 'CLI command',
    keywords: ['hooks', 'scan', 'install', 'watch', 'reindex', 'sync'],
  },
  {
    id: 'cli-help',
    title: 'local-search help',
    description: 'List every available command and flag.',
    tab: 'cli',
    category: 'CLI command',
    keywords: ['help', 'usage', 'commands', 'man'],
  },

  /* --------------------------------------------------------------- AI skill */
  {
    id: 'skill-init',
    title: 'Configure Project Scope (init)',
    description: 'local-search init --json — the skill pins which repos a project searches.',
    tab: 'aiskill',
    category: 'AI skill',
    keywords: ['init', 'scope', 'json', 'configure', 'project'],
  },
  {
    id: 'skill-search',
    title: 'Search & Grounded Answering',
    description: 'local-search json search "<query>" --repos <scope>.',
    tab: 'aiskill',
    category: 'AI skill',
    keywords: ['search', 'grounded', 'answer', 'json', 'repos'],
  },
  {
    id: 'skill-read',
    title: 'Read Specification Content',
    description: 'local-search json read <spec-id> for the full document body.',
    tab: 'aiskill',
    category: 'AI skill',
    keywords: ['read', 'spec', 'content', 'json'],
  },
  {
    id: 'skill-browse',
    title: 'Browse & Inventory Discovery',
    description: 'local-search list / projects / tags / related for discovery.',
    tab: 'aiskill',
    category: 'AI skill',
    keywords: ['list', 'projects', 'tags', 'related', 'browse', 'inventory', 'discovery'],
  },
  {
    id: 'skill-repo',
    title: 'Repository Management',
    description: 'local-search repo add / list / remove from inside the skill.',
    tab: 'aiskill',
    category: 'AI skill',
    keywords: ['repo', 'manage', 'add', 'remove'],
  },
  {
    id: 'skill-json',
    title: 'Machine-Readable Pipelines (json)',
    description: 'local-search json context "<query>" for structured agent consumption.',
    tab: 'aiskill',
    category: 'AI skill',
    keywords: ['json', 'context', 'pipeline', 'machine readable', 'structured'],
  },
  {
    id: 'skill-resources',
    title: 'On-Demand Reference Resources',
    description: 'resources/commands.md and troubleshooting.md loaded only when needed.',
    tab: 'aiskill',
    category: 'AI skill',
    keywords: ['resources', 'reference', 'commands', 'troubleshooting', 'docs'],
  },
  {
    id: 'skill-rules',
    title: '5 Non-Obvious Execution Rules',
    description: 'The constraints the skill follows when calling local-search.',
    tab: 'aiskill',
    category: 'AI skill',
    keywords: ['rules', 'execution', 'constraints', 'behavior', 'gotchas'],
  },

  /* ----------------------------------------------------------------- Config */
  {
    id: 'config-keys',
    title: 'Keys & Defaults',
    description: 'Ranking weights and limits: specs 1.0, graphify 0.7, codegraph 0.8, blast_depth 2, blast_cap 50.',
    tab: 'config',
    category: 'Config',
    keywords: ['keys', 'defaults', 'weights', 'limits', 'blast_depth', 'blast_cap', 'graphify', 'codegraph'],
  },
  {
    id: 'config-locations',
    title: 'File Locations & Directory Paths',
    description: 'Where the config, index, and project files live on disk.',
    tab: 'config',
    category: 'Config',
    keywords: ['paths', 'locations', 'files', 'directory', 'where', 'home'],
  },
  {
    id: 'config-ears',
    title: 'EARS Requirements & Wikilinks',
    description: '@spec IDs and [[target-doc]] wikilinks extracted into FTS5 and graph edges.',
    tab: 'config',
    category: 'Config',
    keywords: ['ears', 'spec', 'requirements', 'wikilinks', 'annotations', 'r-1.3', 'tags'],
  },
  {
    id: 'config-migration',
    title: 'Migrating from .local-search.toml (v0.3.x)',
    description: 'Three files became one in v0.4.0; migration runs on first config read.',
    tab: 'config',
    category: 'Config',
    keywords: ['migrate', 'migration', 'toml', 'v0.4.0', 'upgrade', 'dry-run', 'legacy'],
  },
  {
    id: 'config-repos-gotcha',
    title: 'search reads neither config file',
    description: 'Only find and code resolve scope; search takes --repos and defaults to all.',
    tab: 'config',
    category: 'Config',
    keywords: ['gotcha', 'repos', 'scope', 'default', 'all', 'warning'],
  },

  /* --------------------------------------------------------------- Workflows */
  {
    id: 'workflow-day-1',
    title: 'Scenario 1: Day 1 — From Zero to Indexed Workspace',
    description: 'First-time setup across product-specs and platform-docs repositories.',
    tab: 'workflows',
    category: 'Workflow',
    keywords: ['day 1', 'setup', 'first time', 'onboarding', 'zero', 'indexed'],
  },
  {
    id: 'workflow-spec-tracing',
    title: 'Scenario 2: Tracing @spec Requirements & EARS Tags',
    description: 'Extract EARS requirement tags such as @spec R-1.3 across a monorepo.',
    tab: 'workflows',
    category: 'Workflow',
    keywords: ['tracing', 'spec', 'ears', 'requirements', 'r-1.3', 'monorepo', 'tags'],
  },
  {
    id: 'workflow-graph-explain',
    title: 'Scenario 3: Explaining Knowledge Graph 1-Hop Neighborhoods',
    description: 'Analyze relationships and dependencies with local-search graph explain.',
    tab: 'workflows',
    category: 'Workflow',
    keywords: ['graph', 'explain', 'neighborhood', 'dependencies', '1-hop', 'relationships'],
  },
];

export interface DirectoryMatch {
  entry: DirectoryEntry;
  score: number;
}

/**
 * Scores an entry against the already-lowercased query tokens. Every token has
 * to land somewhere (AND), so adding a word narrows the list instead of
 * widening it. Field weights put a title hit above a keyword hit above a
 * description hit, which is what makes short queries land on the obvious entry.
 */
const scoreEntry = (entry: DirectoryEntry, tokens: string[]): number => {
  const title = entry.title.toLowerCase();
  const description = entry.description.toLowerCase();
  const category = entry.category.toLowerCase();
  const keywords = entry.keywords;

  let total = 0;

  for (const token of tokens) {
    let best = 0;

    if (title.startsWith(token)) best = 8;
    else if (title.includes(token)) best = 5;

    for (const keyword of keywords) {
      if (keyword === token) best = Math.max(best, 6);
      else if (keyword.includes(token)) best = Math.max(best, 3);
    }

    if (description.includes(token)) best = Math.max(best, 2);
    if (category.includes(token)) best = Math.max(best, 1);

    if (best === 0) return 0;
    total += best;
  }

  return total;
};

export const searchDirectory = (query: string, limit = 12): DirectoryMatch[] => {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  return CONTENT_DIRECTORY.map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit);
};
