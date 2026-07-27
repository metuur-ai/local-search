import React from 'react';
import { AudienceLevel, ViewMode } from '../types';
import { Sparkles, Terminal, BookOpen, RotateCcw, CheckCircle2, HelpCircle } from 'lucide-react';

interface HeaderProps {
  currentStep: number;
  totalSteps: number;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  audienceLevel: AudienceLevel;
  setAudienceLevel: (level: AudienceLevel) => void;
  completedSteps: number[];
  onResetProgress: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentStep,
  totalSteps,
  viewMode,
  setViewMode,
  audienceLevel,
  setAudienceLevel,
  completedSteps,
  onResetProgress,
}) => {
  const progressPercent = Math.round((completedSteps.length / totalSteps) * 100);

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between shrink-0 shadow-xs z-20">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-slate-200">
          <Terminal className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-slate-900 text-base sm:text-lg tracking-tight">
              local-search <span className="text-blue-600 font-normal text-xs sm:text-sm">Academy</span>
            </h1>
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-mono font-medium rounded-full border border-blue-200/60 hidden md:inline-block">
              v0.3.1 Guide
            </span>
          </div>
          <p className="text-[11px] text-slate-500 hidden sm:block">
            Interactive guide to local search, FTS5 BM25, and knowledge graphs
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-6">
        {/* Step Progress Pill */}
        <div className="hidden lg:flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>{completedSteps.length} of {totalSteps} Completed</span>
          </div>
          <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-500 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Audience Level Toggle */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-medium border border-slate-200">
          <button
            onClick={() => setAudienceLevel('beginner')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              audienceLevel === 'beginner'
                ? 'bg-white text-blue-700 font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🌱 Non-Technical
          </button>
          <button
            onClick={() => setAudienceLevel('technical')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              audienceLevel === 'technical'
                ? 'bg-slate-900 text-white font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ⚡ Technical
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setViewMode(viewMode === 'tutorial' ? 'playground' : 'tutorial')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all border ${
              viewMode === 'tutorial'
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm hover:bg-blue-700'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {viewMode === 'tutorial' ? (
              <>
                <BookOpen className="w-3.5 h-3.5" />
                <span>Tutorial Mode</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Free Playground</span>
              </>
            )}
          </button>

          <button
            onClick={onResetProgress}
            title="Reset Tutorial Progress"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
