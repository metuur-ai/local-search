import React, { useState } from 'react';
import { AudienceLevel } from '../types';
import { Cpu, Zap, GitCommit, Layers, ArrowRight, ShieldCheck, CheckCircle2, Sliders, Search, Shuffle, Network } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface PipelineBentoProps {
  audienceLevel: AudienceLevel;
  useSemantic: boolean;
  rankingStrategy: string;
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

export const PipelineBento: React.FC<PipelineBentoProps> = ({
  audienceLevel,
  useSemantic,
  rankingStrategy,
}) => {
  const [activeStage, setActiveStage] = useState<number>(0);

  const stages = [
    {
      id: 1,
      name: '1. FTS5 BM25',
      techName: 'Porter Stemming + BM25',
      simpleDesc: 'Keyword Matcher',
      simpleDetail: 'Parses your query and matches words even if they end in -ing or -s.',
      techDetail: 'SQLite FTS5 virtual table with Porter stemming & term-frequency document length normalization.',
      icon: Search,
    },
    {
      id: 2,
      name: '2. 256-d Embed',
      techName: '256-d Hash Cosine',
      simpleDesc: 'Concept Vectorizer',
      simpleDetail: 'Turns text into 256 numeric coordinates offline without heavy AI models.',
      techDetail: 'Deterministic feature-hashing vectorizer generating L2-normalized 256-d vectors.',
      icon: Zap,
    },
    {
      id: 3,
      name: '3. RRF Fusion',
      techName: 'Reciprocal Rank Fusion',
      simpleDesc: 'Smart Rank Blender',
      simpleDetail: 'Merges keyword score and concept similarity score fairly.',
      techDetail: 'RRF formula: Score = 1 / (60 + BM25_Rank) + 1 / (60 + Vector_Rank).',
      icon: Shuffle,
    },
    {
      id: 4,
      name: '4. Graph Boost',
      techName: 'Graph Centrality Re-rank',
      simpleDesc: 'Importance Boost',
      simpleDetail: 'Gives extra weight to specs that many other files link to or depend on.',
      techDetail: 'Multiplies FTS/RRF rank by PageRank / centrality degree derived from frontmatter links.',
      icon: Network,
    },
    {
      id: 5,
      name: '5. Grounded Output',
      techName: 'Synthesized / Fast Result',
      simpleDesc: 'Final Answer & Cites',
      simpleDetail: 'Presents verified specs with direct citations to original files.',
      techDetail: 'Formatted JSON stream with full provenance accounting (zero hallucination).',
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="bg-white border border-rule rounded-card p-5 text-ink flex flex-col justify-between shadow-2xs h-full relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent" aria-hidden="true" />
          <div>
            <h3 className="font-display font-semibold text-ink text-base leading-tight">
              Local Search Retrieval Pipeline
            </h3>
            <p className="text-sm text-ink-2">
              Offline hybrid architecture — zero API keys needed for search
            </p>
          </div>
        </div>

        <span className="text-xs font-mono font-bold bg-paper-3 text-ink-2 px-2.5 py-1 rounded-input border border-rule">
          LATENCY: ~12ms
        </span>
      </div>

      {/* Interactive Pipeline Stages Flow */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 my-2">
        {stages.map((stage, idx) => {
          const isActive = activeStage === idx;
          const StageIcon = stage.icon;
          return (
            <button
              key={stage.id}
              onClick={() => setActiveStage(idx)}
              className={`p-2.5 rounded-card border text-left transition-all min-h-11 ${FOCUS_RING} ${
                isActive
                  ? 'bg-white border-accent shadow-2xs ring-2 ring-accent/20'
                  : 'bg-paper-2 hover:bg-white border-rule text-ink-2'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <StageIcon className="w-4 h-4 text-ink-2" aria-hidden="true" />
                <span className="text-xs font-mono text-ink-3 font-bold">0{stage.id}</span>
              </div>
              <div className="font-bold text-xs truncate text-ink">
                {audienceLevel === 'technical' ? stage.techName : stage.simpleDesc}
              </div>
            </button>
          );
        })}
      </div>

      {/* Stage Detail Card */}
      <div className="p-3.5 bg-paper-2 rounded-card border border-rule shadow-2xs mb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-ink-3 uppercase tracking-wide">
            {stages[activeStage].name}:
          </span>
          <span className="text-xs font-bold text-ink">
            {audienceLevel === 'technical' ? stages[activeStage].techName : stages[activeStage].simpleDesc}
          </span>
        </div>
        <p className="text-sm text-ink-2 leading-relaxed">
          {audienceLevel === 'technical'
            ? stages[activeStage].techDetail
            : stages[activeStage].simpleDetail}
        </p>
      </div>

      {/* Key Advantages Footer */}
      <div className="flex flex-wrap items-center justify-between text-xs text-ink-2 font-medium pt-2 border-t border-rule">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-accent" aria-hidden="true" />
          <span>100% Private &amp; On-Device</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs text-ink-3">
          <span>ENCRYPTION: Local SQLite</span>
          <span>MEMORY: Memory-Mapped FTS5</span>
        </div>
      </div>
    </div>
  );
};
