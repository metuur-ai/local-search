import { TutorialStep } from '../types';

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 1,
    title: '1. Indexing & FTS5 BM25 Search',
    subtitle: 'Learn how Local Search indexes markdown files into a lightweight, offline SQLite cache.',
    estimatedMinutes: 2,
    keyConcepts: [
      {
        term: 'Porter Stemming',
        explanation: 'Reduces words to their root form so searching "refunding" automatically matches "refund" and "refunded".',
      },
      {
        term: 'BM25 Scoring',
        explanation: 'Ranks search results mathematically based on term frequency and document length in ~30ms.',
      },
      {
        term: 'Disposable Index',
        explanation: 'Your markdown files on disk are the ultimate truth; the local index specs.db is just a safe, rebuildable cache.',
      },
    ],
    taskDescription: 'Execute a search for "refund" using FTS5 keyword matching or run `local-search search "refund"` in the CLI terminal.',
    targetObjective: 'Run a search query for "refund" or click the task button to complete Step 1.',
    completed: false,
  },
  {
    id: 2,
    title: '2. AI Synthesis vs. Graph Only Mode',
    subtitle: 'Understand the difference between instant direct graph lookups and AI-driven answer synthesis.',
    estimatedMinutes: 3,
    keyConcepts: [
      {
        term: 'Graph Only Mode (~1s)',
        explanation: 'Directly queries FTS5 and the local knowledge graph with zero LLM API calls for instant CLI-speed answers.',
      },
      {
        term: 'AI Answer Mode',
        explanation: 'Spawns an LLM process to read retrieved specs and compose a grounded, cited natural language response.',
      },
      {
        term: 'Provenance Guarantee',
        explanation: 'Every claim in an AI answer links back directly to a specific source file, line number, or requirement tag.',
      },
    ],
    taskDescription: 'Toggle the Search Mode to "AI Answer" and run a search, or test "Graph only" mode to feel the latency difference.',
    targetObjective: 'Run at least one search in AI Answer mode or toggle execution mode.',
    completed: false,
  },
  {
    id: 3,
    title: '3. Knowledge Graph & Edge Families',
    subtitle: 'Explore how files connect via human-declared relationships and algorithm-derived similarity.',
    estimatedMinutes: 3,
    keyConcepts: [
      {
        term: 'Declared Links (Solid Teal)',
        explanation: 'Explicit relationships declared in frontmatter (dependsOn, relationships, upstream) or markdown links.',
      },
      {
        term: 'Unresolved Links (Dashed Amber)',
        explanation: 'Links pointing to IDs that do not exist yet on disk — invaluable for identifying broken references or planned features.',
      },
      {
        term: 'Similarity Links (Faint Gray)',
        explanation: 'Inferred edges calculated when the indexer notices shared 256-dimensional vector vocabulary overlap.',
      },
    ],
    taskDescription: 'Switch to the Knowledge Graph view and click on a node or filter links by "Declared" vs "Unresolved".',
    targetObjective: 'Click a graph node or toggle link family filters in the Graph Explorer.',
    completed: false,
  },
  {
    id: 4,
    title: '4. Requirement Tracing with @spec Tags',
    subtitle: 'Discover how EARS spec annotations automatically convert requirement IDs into browsable tags.',
    estimatedMinutes: 2,
    keyConcepts: [
      {
        term: '@spec Annotations',
        explanation: 'Writing @spec R-1.3 in any markdown file automatically generates a browsable spec:r-1.3 tag facet.',
      },
      {
        term: 'Requirement Matrix',
        explanation: 'Instantly view all architecture docs, PRDs, and tests implementing a given requirement ID.',
      },
    ],
    taskDescription: 'Search for "spec:r-1.3" or click the requirement tag badge in the result card.',
    targetObjective: 'Filter results or search by a requirement tag like "spec:r-1.3".',
    completed: false,
  },
  {
    id: 5,
    title: '5. Media Sidecars & Config Scoping',
    subtitle: 'Learn how non-text files (.png, .pdf) are indexed and how .local-search.toml scopes project searches.',
    estimatedMinutes: 3,
    keyConcepts: [
      {
        term: 'Markdown Sidecars',
        explanation: 'Pairing refund-diagram.png with refund-diagram.md makes image diagrams fully searchable by content.',
      },
      {
        term: 'Project Scoping (.local-search.toml)',
        explanation: 'Pins search operations strictly to a project\'s relevant repositories so queries don\'t fan out across unrelated repos.',
      },
    ],
    taskDescription: 'Inspect the refund-diagram.png media sidecar or run `local-search scope show` in the CLI simulator.',
    targetObjective: 'View the media sidecar spec or inspect scope settings.',
    completed: false,
  },
];
