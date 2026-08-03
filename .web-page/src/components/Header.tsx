import React from 'react';
import { AudienceLevel, ViewMode } from '../types';
import { Sparkles, Terminal, BookOpen, RotateCcw, CheckCircle2, Sprout, Zap } from 'lucide-react';

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
    <header className="h-16 bg-white border-b border-rule px-4 sm:px-8 flex items-center justify-between shrink-0 shadow-2xs z-20">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-ink rounded-card flex items-center justify-center text-white font-bold">
          <Terminal className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-semibold text-ink text-lg sm:text-xl tracking-tight">
              local-search <span className="text-ink-2 font-normal text-sm sm:text-base">Academy</span>
            </h1>
            <span className="px-2 py-0.5 bg-info-soft text-info-ink text-[11px] font-mono font-medium rounded-pill border border-info/25 hidden md:inline-block">
              v0.3.1 Guide
            </span>
          </div>
          <p className="text-sm text-ink-3 hidden sm:block">
            Interactive guide to local search, FTS5 BM25, and knowledge graphs
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-6">
        {/* Step Progress Pill */}
        <div className="hidden lg:flex items-center gap-3 bg-paper-2 px-3 py-1.5 rounded-pill border border-rule">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-2">
            <CheckCircle2 className="w-4 h-4 text-accent" aria-hidden="true" />
            <span>{completedSteps.length} of {totalSteps} Completed</span>
          </div>
          <div className="w-24 h-2 bg-paper-3 rounded-pill overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-500 motion-reduce:transition-none rounded-pill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Audience Level Toggle */}
        <div className="flex items-center bg-paper-3 p-1 rounded-input text-sm font-medium border border-rule">
          <button
            onClick={() => setAudienceLevel('beginner')}
            className={`px-2.5 py-1 rounded-input transition-all flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
              audienceLevel === 'beginner'
                ? 'bg-white text-ink font-semibold shadow-2xs'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            <Sprout className="w-3.5 h-3.5" aria-hidden="true" />
            Non-Technical
          </button>
          <button
            onClick={() => setAudienceLevel('technical')}
            className={`px-2.5 py-1 rounded-input transition-all flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
              audienceLevel === 'technical'
                ? 'bg-ink text-white font-semibold shadow-2xs'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            <Zap className="w-3.5 h-3.5" aria-hidden="true" />
            Technical
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setViewMode(viewMode === 'tutorial' ? 'playground' : 'tutorial')}
            className={`px-3 py-1.5 text-sm font-semibold rounded-input flex items-center gap-1.5 transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
              viewMode === 'tutorial'
                ? 'bg-accent text-accent-contrast border-accent shadow-2xs hover:bg-accent-ink'
                : 'bg-white text-ink-2 border-rule-strong hover:bg-paper-2'
            }`}
          >
            {viewMode === 'tutorial' ? (
              <>
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Tutorial Mode</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Free Playground</span>
              </>
            )}
          </button>

          <button
            onClick={onResetProgress}
            aria-label="Reset Tutorial Progress"
            title="Reset Tutorial Progress"
            className="p-2 text-ink-3 hover:text-ink hover:bg-paper-2 rounded-input transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
};
