import type React from 'react';

export type ViewMode = 'tutorial' | 'playground';
export type AudienceLevel = 'beginner' | 'technical';
export type ActiveTab =
  | 'overview'
  | 'search'
  | 'indexing'
  | 'cli'
  | 'aiskill'
  | 'graph'
  | 'workflows'
  | 'config';

export type SearchMode = 'ai' | 'graph';
export type RankingStrategy = 'bm25' | 'graph-aware' | 'semantic';
export type SourceOrigin = 'fts' | 'graph' | 'both';

export interface SpecFile {
  id: string;
  repo: string;
  path: string;
  title: string;
  content: string;
  tags: string[];
  docType?: string;
  status?: string;
  dependsOn?: string[];
  relationships?: string[];
  upstream?: string[];
  downstream?: string[];
  components?: string[];
  implementedBy?: string[];
  linkedSpecs?: string[];
  lastModified?: string;
  isMediaSidecar?: boolean;
  mediaFile?: string;
}

export interface RepoInfo {
  name: string;
  path: string;
  specCount: number;
  hasGraph: boolean;
  color: string;
  description: string;
}

export type LinkFamily = 'declared' | 'unresolved' | 'similarity';

export interface GraphNode {
  id: string; // e.g. "product-specs:capability://payments/refund"
  name: string;
  title: string;
  repo: string;
  path: string;
  docType: string; // 'prd' | 'architecture' | 'api' | 'guide' | 'capability' | 'component'
  osLayer: string; // 'Docs' | 'Platform' | 'Ontology' | 'Research' | 'Team'
  tags: string[];
  status?: string;
  flags?: ('unresolved' | 'conflict')[];
  relevanceScore?: number;
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  weight: number; // 0..1
  family: LinkFamily;
  relation?: string; // e.g. 'depends_on', 'relationships', 'upstream', 'implements', 'links_to'
  confidence?: number;
  sourceFile?: string;
  sourceLocation?: string;
}

export interface SearchResultItem {
  spec: SpecFile;
  score: number;
  bm25Score: number;
  vectorSimilarity: number;
  graphCentralityBoost: number;
  matchedSnippets: string[];
  matchType: 'fts' | 'graph' | 'semantic';
}

export interface SearchSessionState {
  id: string;
  query: string;
  repos: string[];
  mode: SearchMode;
  ranking: RankingStrategy;
  sourceOrigin: SourceOrigin;
  useSemantic: boolean;
  results: SearchResultItem[];
  aiAnswer?: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  elapsedMs: number;
  sourcesCount: number;
  question?: string;
}

export interface TutorialStep {
  id: number;
  title: string;
  subtitle: string;
  estimatedMinutes: number;
  keyConcepts: { term: string; explanation: string }[];
  taskDescription: string;
  targetObjective: string;
  completed: boolean;
}

export interface CliCommandHistory {
  command: string;
  output: string | React.ReactNode;
  timestamp: string;
  isError?: boolean;
}
