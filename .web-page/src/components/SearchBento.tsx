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
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col shadow-xs h-full relative">
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700">
            <Search className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-slate-900 text-base">Local Search Console</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md border border-slate-200">
            ~30ms SQLite FTS
          </span>
          <Tooltip
            content="Local Search runs 100% offline using FTS5 BM25 and 256-dimensional feature hash vectors."
            position="bottom"
          />
        </div>
      </div>

      {/* Mode Switcher: AI Answer vs Graph Only · Fast */}
      <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-xl mb-4 border border-slate-200">
        <button
          onClick={() => setSearchMode('graph')}
          className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            searchMode === 'graph'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          <span>Graph only · Fast (~12ms)</span>
        </button>

        <button
          onClick={() => setSearchMode('ai')}
          className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            searchMode === 'ai'
              ? 'bg-blue-600 text-white shadow-xs shadow-blue-200'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-200" />
          <span>AI Answer Synthesis</span>
        </button>
      </div>

      {/* Main Search Bar & Execute Button */}
      <div className="relative mb-3 flex gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Type a query or requirement tag e.g. "refund", "@spec R-1.3", "auth API"...'
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
          />
        </div>
        <button
          onClick={onExecuteSearch}
          disabled={isSearching}
          className="px-5 py-2.5 bg-slate-900 text-white text-xs sm:text-sm font-semibold rounded-xl hover:bg-slate-800 transition-all shadow-sm flex items-center gap-1.5 shrink-0"
        >
          {isSearching ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          <span>{searchMode === 'ai' ? 'Synthesize' : 'Search'}</span>
        </button>
      </div>

      {/* Preset Query Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none text-[11px]">
        <span className="text-slate-400 font-medium shrink-0">Presets:</span>
        {presetQueries.map((preset, idx) => (
          <button
            key={idx}
            onClick={() => {
              setQuery(preset);
              setTimeout(() => onExecuteSearch(), 50);
            }}
            className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-slate-200 rounded-lg text-slate-600 font-medium transition-colors shrink-0 whitespace-nowrap"
          >
            {preset}
          </button>
        ))}
      </div>

      {/* Controls Bar: Repo Selectors & Hybrid Toggle */}
      <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl mb-4 space-y-3">
        {/* Repo Picker Checkboxes */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-slate-600 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-slate-400" />
            Repos:
          </span>
          {allRepos.map((repo) => {
            const isSelected = selectedRepos.includes(repo.name);
            return (
              <button
                key={repo.name}
                onClick={() => toggleRepo(repo.name)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1.5 transition-all ${
                  isSelected
                    ? 'bg-white text-slate-900 border-slate-300 shadow-2xs'
                    : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                }`}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: repo.color }}
                />
                <span>{repo.name}</span>
                <span className="text-[10px] text-slate-400">({repo.specCount})</span>
              </button>
            );
          })}
        </div>

        {/* Strategy Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/60 text-xs">
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
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
            />
            <span className="font-semibold text-slate-700">
              Semantic Hybrid Mode
            </span>
            <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-bold">
              256-d Hash + RRF
            </span>
          </label>

          {/* Ranking Strategy Picker */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium text-[11px]">Rank Strategy:</span>
            <select
              value={rankingStrategy}
              onChange={(e) => setRankingStrategy(e.target.value as RankingStrategy)}
              className="bg-white border border-slate-200 text-slate-800 text-[11px] font-semibold rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
            <Search className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-600">No specs matched your search</p>
            <p className="text-xs text-slate-400 mt-1">
              Try searching for "refund", "@spec R-1.3", or selecting more target repos.
            </p>
          </div>
        ) : (
          results.map((item, idx) => (
            <div
              key={item.spec.id || idx}
              onClick={() => onInspectSpec(item.spec)}
              className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-blue-600 group-hover:underline flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    {item.spec.title}
                  </span>
                  <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                    {item.spec.repo}/{item.spec.path}
                  </span>
                </div>
                {/* Score badge */}
                <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md shrink-0">
                  {(item.score * 100).toFixed(0)}% match
                </span>
              </div>

              {/* Snippet */}
              <p className="text-xs text-slate-600 line-clamp-2 mb-2 font-sans">
                {item.matchedSnippets[0] || item.spec.content.slice(0, 120)}
              </p>

              {/* Tags & Metadata Footer */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[10px]">
                <div className="flex flex-wrap gap-1">
                  {item.spec.tags.map((tag, tIdx) => (
                    <span
                      key={tIdx}
                      className={`px-1.5 py-0.5 rounded ${
                        tag.startsWith('spec:')
                          ? 'bg-amber-100 text-amber-800 font-bold'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-slate-400 font-mono">
                  {audienceLevel === 'technical' && (
                    <>
                      <span>BM25: {item.bm25Score.toFixed(2)}</span>
                      <span>Vec: {(item.vectorSimilarity * 100).toFixed(0)}%</span>
                      {item.graphCentralityBoost > 1 && (
                        <span className="text-blue-600 font-bold">
                          GraphBoost x{item.graphCentralityBoost.toFixed(1)}
                        </span>
                      )}
                    </>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
