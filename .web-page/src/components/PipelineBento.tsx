import React, { useState } from 'react';
import { AudienceLevel } from '../types';
import { Cpu, Zap, GitCommit, Layers, ArrowRight, ShieldCheck, CheckCircle2, Sliders } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface PipelineBentoProps {
  audienceLevel: AudienceLevel;
  useSemantic: boolean;
  rankingStrategy: string;
}

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
      icon: '🔍',
    },
    {
      id: 2,
      name: '2. 256-d Embed',
      techName: '256-d Hash Cosine',
      simpleDesc: 'Concept Vectorizer',
      simpleDetail: 'Turns text into 256 numeric coordinates offline without heavy AI models.',
      techDetail: 'Deterministic feature-hashing vectorizer generating L2-normalized 256-d vectors.',
      icon: '⚡',
    },
    {
      id: 3,
      name: '3. RRF Fusion',
      techName: 'Reciprocal Rank Fusion',
      simpleDesc: 'Smart Rank Blender',
      simpleDetail: 'Merges keyword score and concept similarity score fairly.',
      techDetail: 'RRF formula: Score = 1 / (60 + BM25_Rank) + 1 / (60 + Vector_Rank).',
      icon: '🔀',
    },
    {
      id: 4,
      name: '4. Graph Boost',
      techName: 'Graph Centrality Re-rank',
      simpleDesc: 'Importance Boost',
      simpleDetail: 'Gives extra weight to specs that many other files link to or depend on.',
      techDetail: 'Multiplies FTS/RRF rank by PageRank / centrality degree derived from frontmatter links.',
      icon: '🕸️',
    },
    {
      id: 5,
      name: '5. Grounded Output',
      techName: 'Synthesized / Fast Result',
      simpleDesc: 'Final Answer & Cites',
      simpleDetail: 'Presents verified specs with direct citations to original files.',
      techDetail: 'Formatted JSON stream with full provenance accounting (zero hallucination).',
      icon: '✅',
    },
  ];

  return (
    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 text-emerald-950 flex flex-col justify-between shadow-xs h-full relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center text-white shadow-xs">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-emerald-900 text-base leading-tight">
              Local Search Retrieval Pipeline
            </h3>
            <p className="text-[11px] text-emerald-700 font-medium">
              Offline Hybrid Architecture (Zero API keys needed for search)
            </p>
          </div>
        </div>

        <span className="text-[10px] font-mono font-bold bg-emerald-200/60 text-emerald-800 px-2.5 py-1 rounded-md border border-emerald-300">
          LATENCY: ~12ms
        </span>
      </div>

      {/* Interactive Pipeline Stages Flow */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 my-2">
        {stages.map((stage, idx) => {
          const isActive = activeStage === idx;
          return (
            <button
              key={stage.id}
              onClick={() => setActiveStage(idx)}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                isActive
                  ? 'bg-white border-emerald-400 shadow-sm ring-2 ring-emerald-500/20'
                  : 'bg-emerald-100/50 hover:bg-white/80 border-emerald-200/80 text-emerald-800'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-base">{stage.icon}</span>
                <span className="text-[10px] font-mono text-emerald-600 font-bold">0{stage.id}</span>
              </div>
              <div className="font-bold text-xs truncate text-emerald-950">
                {audienceLevel === 'technical' ? stage.techName : stage.simpleDesc}
              </div>
            </button>
          );
        })}
      </div>

      {/* Stage Detail Card */}
      <div className="p-3.5 bg-white rounded-xl border border-emerald-200/80 shadow-xs mb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
            {stages[activeStage].name}:
          </span>
          <span className="text-xs font-bold text-slate-800">
            {audienceLevel === 'technical' ? stages[activeStage].techName : stages[activeStage].simpleDesc}
          </span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          {audienceLevel === 'technical'
            ? stages[activeStage].techDetail
            : stages[activeStage].simpleDetail}
        </p>
      </div>

      {/* Key Advantages Footer */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-emerald-800 font-medium pt-2 border-t border-emerald-200/60">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>100% Private & On-Device</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px]">
          <span>ENCRYPTION: Local SQLite</span>
          <span>MEMORY: Memory-Mapped FTS5</span>
        </div>
      </div>
    </div>
  );
};
