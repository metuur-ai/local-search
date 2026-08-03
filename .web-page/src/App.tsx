import React, { useState } from 'react';
import { ActiveTab, AudienceLevel, GraphNode, SpecFile, ViewMode } from './types';
import { useHashRoute } from './hooks/useHashRoute';
import { TUTORIAL_STEPS } from './data/tutorialSteps';
import { Navigation } from './components/Navigation';
import { OverviewSection } from './components/OverviewSection';
import { WorkflowSimulator } from './components/WorkflowSimulator';
import { ConfigMatrixSection } from './components/ConfigMatrixSection';
import { SearchSandboxCard } from './components/SearchSandboxCard';
import { GraphExplorerCard } from './components/GraphExplorerCard';
import { CliTerminalCard } from './components/CliTerminalCard';
import { AiSkillSection } from './components/AiSkillSection';
import { IndexingSection } from './components/IndexingSection';
import { SiteFooter } from './components/SiteFooter';
import { ConceptSpotlightCard } from './components/ConceptSpotlightCard';
import { SpecDetailModal } from './components/SpecDetailModal';
import { NodeDetailModal } from './components/NodeDetailModal';
import confetti from 'canvas-confetti';
import { Lightbulb } from 'lucide-react';

function SideInsightsToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={shown}
      className="text-sm font-semibold px-3 min-h-11 bg-paper hover:bg-paper-2 text-ink-2 rounded-input border border-rule transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
    >
      <Lightbulb className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>{shown ? 'Hide side insights' : 'Show side insights'}</span>
    </button>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useHashRoute();
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
    <div className="app-root w-full h-screen flex flex-col overflow-hidden">
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
      <main className="app-scroll workbench-scroll flex-1 pb-4 sm:pb-6 overflow-y-auto">
        {activeTab === 'overview' && (
          <OverviewSection
            audienceLevel={audienceLevel}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'search' && (
          <div className="app-container space-y-3">
            <div className="flex items-center justify-end">
              <SideInsightsToggle shown={showSidebar} onToggle={() => setShowSidebar(!showSidebar)} />
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
          <div className="app-container space-y-3">
            <div className="flex items-center justify-end">
              <SideInsightsToggle shown={showSidebar} onToggle={() => setShowSidebar(!showSidebar)} />
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

        {activeTab === 'indexing' && <IndexingSection />}

        {activeTab === 'aiskill' && <AiSkillSection />}

        {activeTab === 'graph' && (
          <div className="app-container space-y-3">
            <div className="flex items-center justify-end">
              <SideInsightsToggle shown={showSidebar} onToggle={() => setShowSidebar(!showSidebar)} />
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

      <SiteFooter />
    </div>
  );
}
