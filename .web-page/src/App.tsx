import React, { useState } from 'react';
import { ActiveTab, AudienceLevel, GraphNode, SpecFile, ViewMode } from './types';
import { TUTORIAL_STEPS } from './data/tutorialSteps';
import { Navigation } from './components/Navigation';
import { OverviewSection } from './components/OverviewSection';
import { WorkflowSimulator } from './components/WorkflowSimulator';
import { ConfigMatrixSection } from './components/ConfigMatrixSection';
import { SearchSandboxCard } from './components/SearchSandboxCard';
import { GraphExplorerCard } from './components/GraphExplorerCard';
import { CliTerminalCard } from './components/CliTerminalCard';
import { AiSkillSection } from './components/AiSkillSection';
import { ConceptSpotlightCard } from './components/ConceptSpotlightCard';
import { SpecDetailModal } from './components/SpecDetailModal';
import { NodeDetailModal } from './components/NodeDetailModal';
import confetti from 'canvas-confetti';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [audienceLevel, setAudienceLevel] = useState<AudienceLevel>('beginner');
  const [completedSteps, setCompletedSteps] = useState<number[]>([1]);
  const [showSidebar, setShowSidebar] = useState<boolean>(false);

  const [selectedSpec, setSelectedSpec] = useState<SpecFile | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const handleCompleteStep = (stepId: number) => {
    if (!completedSteps.includes(stepId)) {
      setCompletedSteps((prev) => [...prev, stepId]);
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.7 },
      });
    }
  };

  const handleResetProgress = () => {
    setCompletedSteps([]);
  };

  return (
    <div className="w-full h-screen bg-slate-50 text-slate-900 font-sans flex flex-col overflow-hidden select-none">
      {/* Top Header Navigation matching example layout */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        audienceLevel={audienceLevel}
        setAudienceLevel={setAudienceLevel}
        completedCount={completedSteps.length}
        totalSteps={5}
        onResetProgress={handleResetProgress}
      />

      {/* Main Content Area with Tab Switching */}
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {activeTab === 'overview' && (
          <OverviewSection
            audienceLevel={audienceLevel}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'search' && (
          <div className="max-w-[90%] w-full mx-auto space-y-3">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowSidebar(!showSidebar)}
                className="text-xs font-semibold px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <span>{showSidebar ? 'Hide Side Insights' : '💡 Show Side Insights'}</span>
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-full">
              <div className={`${showSidebar ? 'lg:col-span-8' : 'lg:col-span-12'} h-[600px] lg:h-auto transition-all`}>
                <SearchSandboxCard
                  onSpecSelect={(spec) => setSelectedSpec(spec)}
                  onTagSelect={() => handleCompleteStep(4)}
                  onTaskCompleted={() => handleCompleteStep(1)}
                />
              </div>
              {showSidebar && (
                <div className="lg:col-span-4 h-full animate-fadeIn">
                  <ConceptSpotlightCard audienceLevel={audienceLevel} currentStepId={1} />
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'cli' && (
          <div className="max-w-[90%] w-full mx-auto space-y-3">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowSidebar(!showSidebar)}
                className="text-xs font-semibold px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <span>{showSidebar ? 'Hide Side Insights' : '💡 Show Side Insights'}</span>
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-full">
              <div className={`${showSidebar ? 'lg:col-span-8' : 'lg:col-span-12'} transition-all`}>
                <CliTerminalCard onTaskCompleted={() => handleCompleteStep(2)} />
              </div>
              {showSidebar && (
                <div className="lg:col-span-4 h-full animate-fadeIn">
                  <ConceptSpotlightCard audienceLevel={audienceLevel} currentStepId={2} />
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'aiskill' && <AiSkillSection />}

        {activeTab === 'graph' && (
          <div className="max-w-[90%] w-full mx-auto space-y-3">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowSidebar(!showSidebar)}
                className="text-xs font-semibold px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <span>{showSidebar ? 'Hide Side Insights' : '💡 Show Side Insights'}</span>
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[820px] h-full">
              <div className={`${showSidebar ? 'lg:col-span-8' : 'lg:col-span-12'} min-h-[780px] lg:h-[820px] flex flex-col transition-all`}>
                <GraphExplorerCard
                  onNodeSelect={(node) => {
                    setSelectedNode(node);
                    handleCompleteStep(3);
                  }}
                  onTaskCompleted={() => handleCompleteStep(3)}
                />
              </div>
              {showSidebar && (
                <div className="lg:col-span-4 h-full min-h-[780px] animate-fadeIn">
                  <ConceptSpotlightCard audienceLevel={audienceLevel} currentStepId={3} />
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'workflows' && <WorkflowSimulator />}

        {activeTab === 'config' && <ConfigMatrixSection />}
      </main>

      {/* Modals */}
      <SpecDetailModal
        spec={selectedSpec}
        onClose={() => setSelectedSpec(null)}
        onTagClick={() => {}}
      />
      <NodeDetailModal
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onTagClick={() => {}}
      />

      {/* Footer Status Bar */}
      <footer className="h-10 bg-slate-900 text-slate-400 px-4 sm:px-8 flex items-center justify-between text-[11px] font-mono shrink-0 border-t border-slate-800 z-10">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Local Graph Index: 100% Ready (18 specs)
          </span>
          <span className="hidden sm:inline border-l border-slate-800 pl-4 text-slate-500">
            Engine: FTS5 BM25 + 256-d Vector Hybrid
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-400">Active Tab: {activeTab.toUpperCase()}</span>
          <a
            href="https://github.com/metuur-ai/local-search"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white transition-colors hidden sm:inline"
          >
            GitHub v0.3.1
          </a>
        </div>
      </footer>
    </div>
  );
}
