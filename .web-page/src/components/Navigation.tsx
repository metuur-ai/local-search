import React from 'react';
import { ActiveTab, AudienceLevel, ViewMode } from '../types';
import { tabHref } from '../hooks/useHashRoute';
import { HeaderSearch } from './HeaderSearch';
import {
  BookOpen,
  Search,
  Terminal,
  Share2,
  PlayCircle,
  Settings,
  Bot,
  Layers,
} from 'lucide-react';

interface NavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  audienceLevel: AudienceLevel;
  setAudienceLevel: (level: AudienceLevel) => void;
  completedCount: number;
  totalSteps: number;
  onResetProgress: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  audienceLevel,
  setAudienceLevel,
  completedCount,
  totalSteps,
  onResetProgress,
}) => {
  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'overview',
      label: 'Index & Overview',
      icon: <BookOpen className="w-4 h-4" />,
      badge: 'WHY·WHAT·HOW',
    },
    {
      id: 'search',
      label: 'Local Search & BM25',
      icon: <Search className="w-4 h-4" />,
      badge: 'Sandbox',
    },
    {
      id: 'indexing',
      label: 'How we Index',
      icon: <Layers className="w-4 h-4" />,
      badge: 'Internals',
    },
    {
      id: 'cli',
      label: 'CLI Terminal Explorer',
      icon: <Terminal className="w-4 h-4" />,
      badge: 'Interactive',
    },
    {
      id: 'aiskill',
      label: 'AI Skill',
      icon: <Bot className="w-4 h-4" />,
      badge: 'Claude Code',
    },
    {
      id: 'graph',
      label: 'Knowledge Graph',
      icon: <Share2 className="w-4 h-4" />,
      badge: '1-Hop Map',
    },
    {
      id: 'workflows',
      label: 'Interactive Workflows',
      icon: <PlayCircle className="w-4 h-4" />,
      badge: 'Scenarios',
    },
    {
      id: 'config',
      label: 'Config & Matrix',
      icon: <Settings className="w-4 h-4" />,
      badge: '',
    },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      {/* Top Banner Header */}
      <div className="app-container py-2.5 flex items-center justify-between gap-4">
        {/* Brand identity */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
            <Search className="w-4 h-4 text-emerald-100" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-900 tracking-tight text-base font-mono">
                local-search
              </span>
              <span className="hidden sm:inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase rounded-md tracking-wider">
                EXPLAINABLE RETRIEVAL ENGINE
              </span>
              <span className="hidden md:inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-mono rounded">
                Local Directory Graph →
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium hidden sm:block">
              Fast, zero-cloud search engine &amp; knowledge graph for local codebase specifications
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end shrink-0">
          <HeaderSearch />
        </div>
      </div>

      {/* Navigation Pills Bar */}
      <nav aria-label="Sections" className="nav-scroller bg-slate-50 border-t border-slate-200">
        <div className="app-container py-1.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              // A real href, so the section is linkable, opens in a new tab on
              // cmd-click, and records a history entry the browser can go back
              // through. The hashchange listener in useHashRoute does the rest.
              <a
                key={tab.id}
                href={tabHref(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <span className={isActive ? 'text-white' : 'text-slate-500'}>{tab.icon}</span>
                <span>{tab.label}</span>
                {/* The badge is context for the section you are in, so only the
                    active pill carries one. Showing all seven at once doubled the
                    bar's width past the container and pushed tabs out of reach. */}
                {tab.badge && isActive && (
                  <span className="hidden sm:inline px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/80 text-blue-50">
                    {tab.badge}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      </nav>
    </header>
  );
};
