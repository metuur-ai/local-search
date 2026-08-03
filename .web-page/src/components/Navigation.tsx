import React from 'react';
import { ActiveTab, AudienceLevel } from '../types';
import { tabHref } from '../hooks/useHashRoute';
import { HeaderSearch } from './HeaderSearch';
import { Search } from 'lucide-react';

interface NavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  audienceLevel: AudienceLevel;
  setAudienceLevel: (level: AudienceLevel) => void;
  completedCount: number;
  totalSteps: number;
  onResetProgress: () => void;
}

/**
 * `label` is what the pill shows; `name` is the full section title, kept for
 * the accessible name. N5 only works while the pill stays content-sized — a
 * pill wide enough for "CLI Terminal Explorer" eight times over is just a
 * full-width bar with rounded ends, which is the archetype's stated failure.
 */
const TABS: { id: ActiveTab; label: string; name: string }[] = [
  { id: 'overview', label: 'Overview', name: 'Index & Overview' },
  { id: 'search', label: 'Search', name: 'Local Search & BM25' },
  { id: 'indexing', label: 'Indexing', name: 'How we Index' },
  { id: 'cli', label: 'CLI', name: 'CLI Terminal Explorer' },
  { id: 'aiskill', label: 'AI Skill', name: 'AI Skill for Claude Code' },
  { id: 'graph', label: 'Graph', name: 'Knowledge Graph' },
  { id: 'workflows', label: 'Workflows', name: 'Interactive Workflows' },
  { id: 'config', label: 'Config', name: 'Config & Matrix' },
];

export const Navigation: React.FC<NavigationProps> = ({ activeTab }) => {
  return (
    <>
      <header className="mast">
        <div className="app-container flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span
              aria-hidden="true"
              className="w-8 h-8 shrink-0 flex items-center justify-center"
              style={{
                background: 'var(--color-accent)',
                borderRadius: 'var(--radius-card)',
                color: 'var(--color-accent-contrast)',
              }}
            >
              <Search className="w-4 h-4" />
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="mast__wordmark">local-search</span>
                <span className="mast__badge hidden sm:inline-block">
                  Explainable retrieval
                </span>
              </div>
              <p className="mast__tagline hidden sm:block">
                Zero-cloud search and knowledge graph over your local specs.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end shrink-0">
            <HeaderSearch />
          </div>
        </div>
      </header>

      {/* N5 · Floating pill. Detached from the mast, blurred over the
          workbench beneath it. Docks to the bottom edge below 640px. */}
      <nav className="nav-pill" aria-label="Sections">
        <div className="nav-pill__track">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              // A real href, so the section is linkable, opens in a new tab on
              // cmd-click, and records a history entry the browser can go back
              // through. The hashchange listener in useHashRoute does the rest.
              <a
                key={tab.id}
                href={tabHref(tab.id)}
                aria-label={tab.name}
                aria-current={isActive ? 'page' : undefined}
                className="nav-pill__link"
              >
                {tab.label}
              </a>
            );
          })}
        </div>
      </nav>
    </>
  );
};
