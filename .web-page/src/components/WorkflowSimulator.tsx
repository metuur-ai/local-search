import React, { useState } from 'react';
import { Play, CheckCircle2, ChevronRight, CornerDownLeft, Sparkles, RotateCcw, AlertCircle, ShieldCheck } from 'lucide-react';
import confetti from 'canvas-confetti';

interface ScenarioStep {
  stepNumber: number;
  title: string;
  description: string;
  ruleWarning?: string;
  command: string;
  output: string | React.ReactNode;
}

interface Scenario {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  steps: ScenarioStep[];
}

export const WorkflowSimulator: React.FC = () => {
  const scenarios: Scenario[] = [
    {
      id: 'sc1',
      tag: 'ONBOARDING & SCAFFOLDING',
      title: 'Scenario 1: Day 1 — From Zero to Indexed Workspace',
      subtitle: 'First-time setup of local-search specs database across product-specs and platform-docs repos.',
      steps: [
        {
          stepNumber: 1,
          title: 'Register Local Specs Repositories',
          description: 'Register local workspace paths into ~/.local-search/specs.db using local-search repo add.',
          ruleWarning: 'Zero-Cloud Security: All indexes stay local. No external network connections required.',
          command: 'local-search repo add ./docs product-specs',
          output: `Added repo "product-specs" (/Users/you/work/product-specs)\nScanning markdown files...\n  product-specs: 6 files indexed in 11ms.\n\nDone. Run 'local-search search <keyword>' to verify.`,
        },
        {
          stepNumber: 2,
          title: 'Verify Full-Text BM25 Search',
          description: 'Query the SQLite FTS5 index to verify stemmer matching and keyword scoring.',
          command: 'local-search search "refund"',
          output: `[source=fts · rank=bm25 · repos=product-specs]\nFound 3 matches (~12ms):\n 1. [product-specs] payments/refund.md (score: -6.08) — @spec:r-1.3\n 2. [product-specs] payments/chargeback.md (score: -5.27)\n 3. [billing-service] integrations/stripe.md (score: -4.60)`,
        },
        {
          stepNumber: 3,
          title: 'Inspect CLI Scope Configuration',
          description: 'Check active repository boundaries defined in .agent/local-search-config.yaml.',
          command: 'local-search scope show',
          output: `Scope: product-specs, platform-docs, billing-service\nSource: /Users/you/work/.agent/local-search-config.yaml\nWeights: specs=1.00 graphify=0.70 codegraph=0.80`,
        },
      ],
    },
    {
      id: 'sc2',
      tag: 'REQUIREMENT TRACEABILITY',
      title: 'Scenario 2: Tracing @spec Requirements & EARS Tags',
      subtitle: 'Extract EARS standard requirement tags (@spec R-1.3) across monorepo documentation.',
      steps: [
        {
          stepNumber: 1,
          title: 'Scan Requirement Tag Frequencies',
          description: 'List all @spec annotations parsed from markdown files.',
          ruleWarning: 'EARS Standard: Requirements follow @spec <ID> format. Fenced code blocks are excluded automatically.',
          command: 'local-search tags',
          output: `spec:r-1.3 (4 specs) - Refund approval threshold\nspec:tasks-012 (2 specs) - Manager override\nbilling (6 specs) - Subscriptions & Invoicing\nauth (4 specs) - JWT validation`,
        },
        {
          stepNumber: 2,
          title: 'Query Specific Requirement Tag',
          description: 'Retrieve all specifications referencing requirement @spec R-1.3.',
          command: 'local-search search "@spec R-1.3"',
          output: `Found 2 specifications referencing @spec R-1.3:\n - [product-specs] payments/refund.md\n - [billing-service] integrations/stripe.md`,
        },
      ],
    },
    {
      id: 'sc3',
      tag: 'GRAPH TOPOLOGY',
      title: 'Scenario 3: Explaining Knowledge Graph 1-Hop Neighborhoods',
      subtitle: 'Analyze relationships and dependencies using local-search graph explain.',
      steps: [
        {
          stepNumber: 1,
          title: 'Explain Entity Graph Neighborhood',
          description: 'Traverse 1-hop outgoing and incoming graph edges for capability://payments/refund.',
          command: 'local-search graph explain "capability://payments/refund"',
          output: `capability://payments/refund [capability]\n defined: product-specs:payments/refund.md\n outgoing:\n  depends_on -> component://auth-api\n  depends_on -> component://stripe-integration\n  related_to -> capability://payments/chargeback`,
        },
      ],
    },
  ];

  const [activeScenarioId, setActiveScenarioId] = useState<string>('sc1');
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);
  const [executedSteps, setExecutedSteps] = useState<number[]>([]);
  const [terminalOutput, setTerminalOutput] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);

  const activeScenario = scenarios.find((s) => s.id === activeScenarioId) || scenarios[0];
  const activeStep = activeScenario.steps[currentStepIdx];

  const handleRunStep = () => {
    setIsExecuting(true);
    setTerminalOutput('Executing command...');

    setTimeout(() => {
      setIsExecuting(false);
      setTerminalOutput(typeof activeStep.output === 'string' ? activeStep.output : 'Command executed successfully.');
      if (!executedSteps.includes(currentStepIdx)) {
        setExecutedSteps([...executedSteps, currentStepIdx]);
      }

      if (currentStepIdx === activeScenario.steps.length - 1) {
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
      }
    }, 600);
  };

  const handleNextStep = () => {
    if (currentStepIdx < activeScenario.steps.length - 1) {
      setCurrentStepIdx(currentStepIdx + 1);
      setTerminalOutput(null);
    }
  };

  const handleSelectScenario = (id: string) => {
    setActiveScenarioId(id);
    setCurrentStepIdx(0);
    setExecutedSteps([]);
    setTerminalOutput(null);
  };

  return (
    <div className="space-y-6 app-container pb-12">
      {/* Header Banner */}
      <div className="bg-panel text-panel-ink rounded-card p-6 border border-panel-edge shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-syntax-keyword font-bold px-2 py-0.5 bg-panel-raised rounded-input border border-panel-edge">
              03 WORKFLOWS · LIFECYCLE SIMULATOR
            </span>
            <h2 className="text-xl sm:text-2xl font-display font-semibold text-panel-ink mt-1">
              Interactive Workflow Simulator
            </h2>
          </div>

          <button
            onClick={() => {
              setCurrentStepIdx(0);
              setExecutedSteps([]);
              setTerminalOutput(null);
            }}
            className="px-3 py-1.5 bg-panel-raised hover:bg-panel-edge text-panel-ink-2 rounded-input text-xs font-semibold flex items-center gap-1.5 transition-all border border-panel-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset Scenario</span>
          </button>
        </div>

        {/* 3 Guidance Boxes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="bg-panel-inset p-3.5 rounded-card border border-panel-edge space-y-1">
            <div className="text-[10px] font-mono font-bold text-syntax-keyword uppercase">WHY IS THIS HERE?</div>
            <p className="text-sm text-panel-ink-2 leading-relaxed">
              To practice real-world team scenarios (like indexing repos or tracing requirements) before running them in your production terminal.
            </p>
          </div>

          <div className="bg-panel-inset p-3.5 rounded-card border border-panel-edge space-y-1">
            <div className="text-[10px] font-mono font-bold text-syntax-string uppercase">WHAT AM I LOOKING AT?</div>
            <p className="text-sm text-panel-ink-2 leading-relaxed">
              Interactive scenarios below with step-by-step milestone execution and live terminal output simulation.
            </p>
          </div>

          <div className="bg-panel-inset p-3.5 rounded-card border border-panel-edge space-y-1">
            <div className="text-[10px] font-mono font-bold text-syntax-number uppercase">HOW DO I USE IT?</div>
            <p className="text-sm text-panel-ink-2 leading-relaxed">
              Select a scenario card below, click <strong className="text-syntax-keyword">Run Step Command</strong>, then click <strong className="text-syntax-string">Proceed to Next Step</strong>!
            </p>
          </div>
        </div>
      </div>

      {/* Scenario Selection Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {scenarios.map((sc) => {
          const isSelected = sc.id === activeScenarioId;
          return (
            <button
              key={sc.id}
              onClick={() => handleSelectScenario(sc.id)}
              className={`p-4 rounded-card border text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                isSelected
                  ? 'bg-info-soft border-info shadow-2xs ring-2 ring-info/20'
                  : 'bg-paper border-rule hover:border-rule-strong hover:bg-paper-2'
              }`}
            >
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-input ${
                isSelected ? 'bg-info text-white' : 'bg-paper-3 text-ink-2'
              }`}>
                {sc.tag}
              </span>
              <h3 className="font-display font-semibold text-ink text-sm mt-2">{sc.title}</h3>
              <p className="text-sm text-ink-3 mt-1 line-clamp-2">{sc.subtitle}</p>
            </button>
          );
        })}
      </div>

      {/* Interactive Execution Layout: Left Milestones Sidebar, Right Interactive Terminal Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Step Milestones Checklist (Col 4) */}
        <div className="lg:col-span-4 bg-paper border border-rule rounded-card p-5 space-y-4 shadow-2xs">
          <div>
            <h3 className="font-display font-semibold text-ink text-base">{activeScenario.title}</h3>
            <p className="text-sm text-ink-3 mt-0.5">{activeScenario.subtitle}</p>
          </div>

          <div className="space-y-2 pt-2">
            {activeScenario.steps.map((step, idx) => {
              const isCurrent = idx === currentStepIdx;
              const isDone = executedSteps.includes(idx);

              return (
                <div
                  key={step.stepNumber}
                  onClick={() => setCurrentStepIdx(idx)}
                  className={`p-3 rounded-card border text-sm transition-all cursor-pointer flex items-start gap-3 ${
                    isCurrent
                      ? 'bg-info-soft border-info text-info-ink font-medium shadow-2xs'
                      : isDone
                      ? 'bg-accent-soft border-accent/40 text-accent-ink'
                      : 'bg-paper-2 border-rule text-ink-2 hover:bg-paper-3'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                      isDone
                        ? 'bg-accent text-accent-contrast'
                        : isCurrent
                        ? 'bg-info text-white'
                        : 'bg-paper-3 text-ink-2'
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> : step.stepNumber}
                  </div>

                  <div className="space-y-0.5 flex-1">
                    <div className="font-bold text-ink">{step.title}</div>
                    <div className="text-sm text-ink-3 line-clamp-1">{step.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Stage: Interactive Command Execution & Output (Col 8) */}
        <div className="lg:col-span-8 bg-paper border border-rule rounded-card p-6 space-y-5 shadow-2xs flex flex-col justify-between">
          <div className="space-y-4">
            {/* Step Counter Badge */}
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <span className="text-[11px] font-mono font-bold text-info-ink tracking-wider">
                STEP {currentStepIdx + 1} OF {activeScenario.steps.length}
              </span>
              <span className="text-xs text-ink-3">Milestone {activeStep.stepNumber}</span>
            </div>

            <h3 className="text-lg font-display font-semibold text-ink">{activeStep.title}</h3>
            <p className="text-sm text-ink-2 leading-relaxed">{activeStep.description}</p>

            {/* Governance or Security Rule Warning */}
            {activeStep.ruleWarning && (
              <div className="bg-warn-soft border border-warn/25 rounded-card p-3.5 flex items-start gap-2.5 text-sm text-warn-ink">
                <AlertCircle className="w-4 h-4 text-warn shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span className="font-bold">Contract Rule:</span> {activeStep.ruleWarning}
                </div>
              </div>
            )}

            {/* Terminal Command Display Box */}
            <div className="bg-panel-inset rounded-card p-4 border border-panel-edge space-y-2 font-mono text-xs text-panel-ink shadow-inner">
              <div className="flex items-center justify-between text-[11px] text-panel-ink-3 border-b border-panel-edge pb-2">
                <span>Simulator Terminal Command</span>
                <span className="text-syntax-string font-bold">~/.local-search/specs.db</span>
              </div>

              <div className="flex items-center gap-2 text-syntax-string font-bold pt-1">
                <span>$</span>
                <span className="text-panel-ink">{activeStep.command}</span>
              </div>

              {/* Console Output Stream */}
              {terminalOutput && (
                <div className="mt-3 pt-3 border-t border-panel-edge text-panel-ink-2 text-[11px] whitespace-pre-wrap leading-relaxed animate-fadeIn motion-reduce:animate-none font-mono">
                  {terminalOutput}
                </div>
              )}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-rule">
            <button
              onClick={handleRunStep}
              disabled={isExecuting}
              className="min-h-11 px-5 py-2.5 bg-info hover:bg-info/90 active:bg-info text-white font-semibold text-xs rounded-input shadow-2xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
            >
              <Play className="w-4 h-4 fill-current" aria-hidden="true" />
              <span>{isExecuting ? 'Running...' : 'Run Step Command'}</span>
            </button>

            <button
              onClick={handleNextStep}
              disabled={currentStepIdx >= activeScenario.steps.length - 1 || !executedSteps.includes(currentStepIdx)}
              className="min-h-11 px-5 py-2.5 bg-accent hover:bg-accent/90 disabled:bg-paper-3 disabled:text-ink-3 text-accent-contrast font-semibold text-xs rounded-input transition-all flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
            >
              <span>Proceed to Step {currentStepIdx + 2}</span>
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
