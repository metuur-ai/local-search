import React from 'react';
import {
  SearchMode,
  RankingStrategy,
  SourceOrigin,
  SearchResultItem,
  AudienceLevel,
  SpecFile,
} from '../types';
import { Search, Sparkles, Zap, Layers, Filter, CheckSquare, Square, ChevronRight, FileText, Info } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface SearchBentoProps {
  query: string;
  setQuery: (q: string) => void;
  selectedRepos: string[];
  toggleRepo: (repoName: string) => void;
  allRepos: { name: string; specCount: number; hasGraph: boolean; color: string }[];
  searchMode: SearchMode;
  setSearchMode: (mode: SearchMode) => void;
  rankingStrategy: RankingStrategy;
  setRankingStrategy: (r: RankingStrategy) => void;
  useSemantic: boolean;
  setUseSemantic: (s: boolean) => void;
  results: SearchResultItem[];
  isSearching: boolean;
  onExecuteSearch: () => void;
  onInspectSpec: (spec: SpecFile) => void;
  audienceLevel: AudienceLevel;
  presetQueries: string[];
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

export const SearchBento: React.FC<SearchBentoProps> = ({
  query,
  setQuery,
  selectedRepos,
  toggleRepo,
  allRepos,
  searchMode,
  setSearchMode,
  rankingStrategy,
  setRankingStrategy,
  useSemantic,
  setUseSemantic,
  results,
  isSearching,
  onExecuteSearch,
  onInspectSpec,
  audienceLevel,
  presetQueries,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onExecuteSearch();
    }
  };

  return (
    <div className="bg-white rounded-card border border-rule p-5 flex flex-col shadow-2xs h-full relative">
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-accent" aria-hidden="true" />
          <div>
            <h3 className="font-display font-semibold text-ink text-base leading-tight">Local Search Console</h3>
            <p className="text-sm text-ink-2">Offline BM25 + semantic hybrid search over your specs</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono bg-paper-3 text-ink-2 px-2.5 py-1 rounded-input border border-rule">
            ~30ms SQLite FTS
          </span>
          <Tooltip
            content="Local Search runs 100% offline using FTS5 BM25 and 256-dimensional feature hash vectors."
            position="bottom"
          />
        </div>
      </div>

      {/* Mode Switcher: AI Answer vs Graph Only · Fast */}
      <div className="grid grid-cols-2 gap-2 p-1.5 bg-paper-3 rounded-card mb-4 border border-rule">
        <button
          onClick={() => setSearchMode('graph')}
          className={`py-2 px-3 rounded-input text-xs font-bold flex items-center justify-center gap-1.5 transition-all min-h-11 ${FOCUS_RING} ${
            searchMode === 'graph'
              ? 'bg-white text-ink shadow-2xs border border-rule'
              : 'text-ink-3 hover:text-ink-2'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-warn" aria-hidden="true" />
          <span>Graph only · Fast (~12ms)</span>
        </button>

        <button
          onClick={() => setSearchMode('ai')}
          className={`py-2 px-3 rounded-input text-xs font-bold flex items-center justify-center gap-1.5 transition-all min-h-11 ${FOCUS_RING} ${
            searchMode === 'ai'
              ? 'bg-accent text-accent-contrast shadow-2xs'
              : 'text-ink-3 hover:text-ink-2'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          <span>AI Answer Synthesis</span>
        </button>
      </div>

      {/* Main Search Bar & Execute Button */}
      <div className="relative mb-3 flex gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-ink-3" aria-hidden="true" />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Type a query or requirement tag e.g. "refund", "@spec R-1.3", "auth API"...'
            className={`w-full pl-9 pr-4 py-2.5 bg-paper-2 border border-rule rounded-card text-sm text-ink placeholder:text-ink-3 focus:bg-white transition-all ${FOCUS_RING}`}
          />
        </div>
        <button
          onClick={onExecuteSearch}
          disabled={isSearching}
          className={`px-5 py-2.5 bg-ink text-white text-sm font-semibold rounded-card hover:bg-ink-2 transition-all shadow-2xs flex items-center gap-1.5 shrink-0 min-h-11 ${FOCUS_RING}`}
        >
          {isSearching ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin motion-reduce:animate-none" />
          ) : (
            <Search className="w-4 h-4" aria-hidden="true" />
          )}
          <span>{searchMode === 'ai' ? 'Synthesize' : 'Search'}</span>
        </button>
      </div>

      {/* Preset Query Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 no-scrollbar text-xs">
        <span className="text-ink-3 font-medium shrink-0">Presets:</span>
        {presetQueries.map((preset, idx) => (
          <button
            key={idx}
            onClick={() => {
              setQuery(preset);
              setTimeout(() => onExecuteSearch(), 50);
            }}
            className={`px-2.5 py-1 bg-paper-3 hover:bg-info-soft hover:text-info-ink hover:border-info/30 border border-rule rounded-input text-ink-2 font-medium transition-colors shrink-0 whitespace-nowrap ${FOCUS_RING}`}
          >
            {preset}
          </button>
        ))}
      </div>

      {/* Controls Bar: Repo Selectors & Hybrid Toggle */}
      <div className="p-3 bg-paper-2 border border-rule rounded-card mb-4 space-y-3">
        {/* Repo Picker Checkboxes */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-ink-2 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-ink-3" aria-hidden="true" />
            Repos:
          </span>
          {allRepos.map((repo) => {
            const isSelected = selectedRepos.includes(repo.name);
            return (
              <button
                key={repo.name}
                onClick={() => toggleRepo(repo.name)}
                className={`px-2.5 py-1 rounded-input text-xs font-semibold border flex items-center gap-1.5 transition-all ${FOCUS_RING} ${
                  isSelected
                    ? 'bg-white text-ink border-rule-strong shadow-2xs'
                    : 'bg-paper-3 text-ink-3 border-rule line-through'
                }`}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: repo.color }}
                />
                <span>{repo.name}</span>
                <span className="text-xs text-ink-3">({repo.specCount})</span>
              </button>
            );
          })}
        </div>

        {/* Strategy Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-rule text-xs">
          {/* Semantic Toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useSemantic}
              onChange={(e) => {
                setUseSemantic(e.target.checked);
                if (e.target.checked) setRankingStrategy('semantic');
                else setRankingStrategy('bm25');
              }}
              className={`w-4 h-4 text-accent rounded-input border-rule-strong ${FOCUS_RING}`}
            />
            <span className="font-semibold text-ink-2">
              Semantic Hybrid Mode
            </span>
            <span className="text-xs text-info-ink bg-info-soft px-1.5 py-0.5 rounded-input font-bold">
              256-d Hash + RRF
            </span>
          </label>

          {/* Ranking Strategy Picker */}
          <div className="flex items-center gap-1.5">
            <span className="text-ink-3 font-medium text-xs">Rank Strategy:</span>
            <select
              value={rankingStrategy}
              onChange={(e) => setRankingStrategy(e.target.value as RankingStrategy)}
              className={`bg-white border border-rule text-ink text-xs font-semibold rounded-input px-2 py-1 ${FOCUS_RING}`}
            >
              <option value="bm25">BM25 Keyword</option>
              <option value="graph-aware">Graph-Aware Hub Boost</option>
              <option value="semantic">Semantic (RRF Vector)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Search Results Container */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-[220px] max-h-[360px]">
        {results.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-paper-2 border border-dashed border-rule rounded-card">
            <Search className="w-8 h-8 text-ink-3 mb-2" aria-hidden="true" />
            <p className="text-sm font-semibold text-ink-2">No specs matched your search</p>
            <p className="text-sm text-ink-3 mt-1">
              Try searching for "refund", "@spec R-1.3", or selecting more target repos.
            </p>
          </div>
        ) : (
          results.map((item, idx) => (
            <button
              key={item.spec.id || idx}
              onClick={() => onInspectSpec(item.spec)}
              className={`w-full text-left p-3.5 bg-white border border-rule rounded-card hover:border-info hover:shadow-2xs transition-all cursor-pointer group ${FOCUS_RING}`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-info-ink group-hover:underline flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                    {item.spec.title}
                  </span>
                  <span className="text-xs font-mono bg-paper-3 text-ink-2 px-1.5 py-0.5 rounded-input">
                    {item.spec.repo}/{item.spec.path}
                  </span>
                </div>
                {/* Score badge */}
                <span className="text-xs font-mono font-bold text-accent-ink bg-accent-soft border border-accent/25 px-2 py-0.5 rounded-input shrink-0">
                  {(item.score * 100).toFixed(0)}% match
                </span>
              </div>

              {/* Snippet */}
              <p className="text-sm text-ink-2 line-clamp-2 mb-2 font-body">
                {item.matchedSnippets[0] || item.spec.content.slice(0, 120)}
              </p>

              {/* Tags & Metadata Footer */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-rule text-xs">
                <div className="flex flex-wrap gap-1">
                  {item.spec.tags.map((tag, tIdx) => (
                    <span
                      key={tIdx}
                      className={`px-1.5 py-0.5 rounded-input ${
                        tag.startsWith('spec:')
                          ? 'bg-warn-soft text-warn-ink font-bold'
                          : 'bg-paper-3 text-ink-2'
                      }`}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-ink-3 font-mono">
                  {audienceLevel === 'technical' && (
                    <>
                      <span>BM25: {item.bm25Score.toFixed(2)}</span>
                      <span>Vec: {(item.vectorSimilarity * 100).toFixed(0)}%</span>
                      {item.graphCentralityBoost > 1 && (
                        <span className="text-info-ink font-bold">
                          GraphBoost x{item.graphCentralityBoost.toFixed(1)}
                        </span>
                      )}
                    </>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-ink-3 group-hover:text-info-ink transition-colors" aria-hidden="true" />
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
