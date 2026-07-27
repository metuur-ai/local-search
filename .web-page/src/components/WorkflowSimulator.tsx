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
          description: 'Check active repository boundaries defined in .local-search.toml.',
          command: 'local-search scope show',
          output: `Scope: product-specs, platform-docs, billing-service\nSource: /Users/you/work/.local-search.toml\nWeights: specs=1.00 graphify=0.70 codegraph=0.80`,
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
    <div className="space-y-6 max-w-[90%] w-full mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-slate-900 text-slate-100 rounded-3xl p-6 border border-slate-800 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 font-bold px-2 py-0.5 bg-blue-500/10 rounded border border-blue-500/20">
              03 WORKFLOWS · LIFECYCLE SIMULATOR
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-1">
              Interactive Workflow Simulator
            </h2>
          </div>

          <button
            onClick={() => {
              setCurrentStepIdx(0);
              setExecutedSteps([]);
              setTerminalOutput(null);
            }}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Scenario</span>
          </button>
        </div>

        {/* 3 Guidance Boxes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <div className="text-[10px] font-mono font-bold text-blue-400 uppercase">WHY IS THIS HERE?</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              To practice real-world team scenarios (like indexing repos or tracing requirements) before running them in your production terminal.
            </p>
          </div>

          <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <div className="text-[10px] font-mono font-bold text-emerald-400 uppercase">WHAT AM I LOOKING AT?</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Interactive scenarios below with step-by-step milestone execution and live terminal output simulation.
            </p>
          </div>

          <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <div className="text-[10px] font-mono font-bold text-amber-400 uppercase">HOW DO I USE IT?</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Select a scenario card below, click <strong className="text-blue-300">Run Step Command</strong>, then click <strong className="text-emerald-300">Proceed to Next Step</strong>!
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
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-50 border-blue-500 shadow-md ring-2 ring-blue-500/20'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {sc.tag}
              </span>
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm mt-2">{sc.title}</h3>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{sc.subtitle}</p>
            </button>
          );
        })}
      </div>

      {/* Interactive Execution Layout: Left Milestones Sidebar, Right Interactive Terminal Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Step Milestones Checklist (Col 4) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">{activeScenario.title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{activeScenario.subtitle}</p>
          </div>

          <div className="space-y-2 pt-2">
            {activeScenario.steps.map((step, idx) => {
              const isCurrent = idx === currentStepIdx;
              const isDone = executedSteps.includes(idx);

              return (
                <div
                  key={step.stepNumber}
                  onClick={() => setCurrentStepIdx(idx)}
                  className={`p-3 rounded-xl border text-xs transition-all cursor-pointer flex items-start gap-3 ${
                    isCurrent
                      ? 'bg-blue-50/80 border-blue-400 text-blue-950 font-medium shadow-xs'
                      : isDone
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      isDone
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : step.stepNumber}
                  </div>

                  <div className="space-y-0.5 flex-1">
                    <div className="font-bold text-slate-900">{step.title}</div>
                    <div className="text-[11px] text-slate-500 line-clamp-1">{step.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Stage: Interactive Command Execution & Output (Col 8) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            {/* Step Counter Badge */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-[11px] font-mono font-bold text-blue-600 tracking-wider">
                STEP {currentStepIdx + 1} OF {activeScenario.steps.length}
              </span>
              <span className="text-xs text-slate-400">Milestone {activeStep.stepNumber}</span>
            </div>

            <h3 className="text-lg font-bold text-slate-900">{activeStep.title}</h3>
            <p className="text-xs text-slate-600 leading-relaxed">{activeStep.description}</p>

            {/* Governance or Security Rule Warning */}
            {activeStep.ruleWarning && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Contract Rule:</span> {activeStep.ruleWarning}
                </div>
              </div>
            )}

            {/* Terminal Command Display Box */}
            <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 space-y-2 font-mono text-xs text-slate-100 shadow-inner">
              <div className="flex items-center justify-between text-[11px] text-slate-500 border-b border-slate-800 pb-2">
                <span>Simulator Terminal Command</span>
                <span className="text-emerald-400 font-bold">~/.local-search/specs.db</span>
              </div>

              <div className="flex items-center gap-2 text-emerald-400 font-bold pt-1">
                <span>$</span>
                <span className="text-slate-100">{activeStep.command}</span>
              </div>

              {/* Console Output Stream */}
              {terminalOutput && (
                <div className="mt-3 pt-3 border-t border-slate-800 text-slate-300 text-[11px] whitespace-pre-wrap leading-relaxed animate-fadeIn font-mono">
                  {terminalOutput}
                </div>
              )}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <button
              onClick={handleRunStep}
              disabled={isExecuting}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current text-white" />
              <span>{isExecuting ? 'Running...' : 'Run Step Command'}</span>
            </button>

            <button
              onClick={handleNextStep}
              disabled={currentStepIdx >= activeScenario.steps.length - 1 || !executedSteps.includes(currentStepIdx)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 text-white font-semibold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Proceed to Step {currentStepIdx + 2}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
