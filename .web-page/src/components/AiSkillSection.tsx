import React, { useState } from 'react';
import {
  Bot,
  Terminal,
  Zap,
  CheckCircle2,
  FileCode,
  Sparkles,
  Copy,
  Check,
  Cpu,
  ShieldCheck,
  ChevronRight,
  HelpCircle,
  Play,
  Settings,
  FolderGit2,
  ExternalLink,
} from 'lucide-react';

export const AiSkillSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'init' | 'capabilities' | 'sandbox'>('overview');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Sandbox state
  const [sandboxQuery, setSandboxQuery] = useState('payment eligibility');
  const [sandboxScope, setSandboxScope] = useState('product-specs, billing-service');
  const [sandboxResult, setSandboxResult] = useState<any | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const runSkillSimulation = (query: string, scope: string) => {
    setIsSimulating(true);
    setTimeout(() => {
      const repos = scope.split(',').map((s) => s.trim());
      setSandboxResult({
        command: `local-search json context "${query}" --scope ${scope}`,
        scope: repos,
        extractedNouns: query.toLowerCase().split(' ').filter((w) => w.length > 2),
        readCap: 3,
        results: [
          {
            spec_id: 'capability://payments/refund',
            repo: 'product-specs',
            path: 'payments/refund.md',
            score: 0.94,
            matched_tags: ['@spec R-1.3', 'billing', 'payments'],
            snippet: 'WHEN customer submits refund request within 30 days, THE SYSTEM SHALL process refund.',
          },
          {
            spec_id: 'capability://billing/stripe',
            repo: 'billing-service',
            path: 'integrations/stripe.md',
            score: 0.82,
            matched_tags: ['stripe', 'webhooks'],
            snippet: 'Stripe API webhook handler for payment refunds and disputes.',
          },
        ],
        agentAnswer: `Based on the specification \`payments/refund.md\` in \`product-specs\`:\n\n- **Refund Processing (@spec R-1.3)**: When a customer submits a refund request within 30 days, the system shall automatically process the refund via the Stripe webhook handler (\`integrations/stripe.md\`).\n- **Manager Override (@spec TASKS-012)**: For refunds exceeding $500, manager approval is required before calling the billing API.`,
      });
      setIsSimulating(false);
    }, 400);
  };

  const skillOptions = [
    {
      num: 'Option 1',
      title: 'Configure Project Scope (init)',
      command: 'local-search init --json',
      desc: 'Declares allowed repos in .agent/local-search-config.yaml to prevent cross-project context bloat during searches.',
      why: 'Stops Claude from searching irrelevant repositories or drowning in unrelated markdown files.',
    },
    {
      num: 'Option 2',
      title: 'Search & Grounded Answering',
      command: 'local-search json search "<query>" --repos <scope>',
      desc: 'Extracts domain nouns, restricts searches to project scope, limits reads to top 2-4 matches, and cites exact requirement tags (@spec ID).',
      why: 'Guarantees answers are strictly grounded in team specs rather than hallucinated from general LLM pre-training.',
    },
    {
      num: 'Option 3',
      title: 'Read Specification Content',
      command: 'local-search json read <spec-id>',
      desc: 'Dumps complete Markdown frontmatter and body for a targeted spec file without requiring filesystem permissions.',
      why: 'Allows the AI agent to inspect exact rules and dependencies safely without risking unauthorized file edits.',
    },
    {
      num: 'Option 4',
      title: 'Browse & Inventory Discovery',
      command: 'local-search list / projects / tags / related',
      desc: 'Provides inventory discovery across all indexed specs, declared relationships, and requirement tag frequencies.',
      why: 'Allows Claude to answer orientation questions ("what specs exist for billing?") without guessing search terms.',
    },
    {
      num: 'Option 5',
      title: 'Repository Management',
      command: 'local-search repo add / list / remove',
      desc: 'Enables Claude to register local documentation directories into ~/.local-search/specs.db on user request.',
      why: 'Makes "index my docs folder" a simple conversational request rather than a manual CLI setup task.',
    },
    {
      num: 'Option 6',
      title: 'Machine-Readable Pipelines (json)',
      command: 'local-search json context "<query>"',
      desc: 'Returns pure structured JSON containing search hits plus inlined code graph blast radius in a single call.',
      why: 'Eliminates human CLI banners/chatter, keeping AI agent parsing fast, stable, and deterministic.',
    },
    {
      num: 'Option 7',
      title: 'On-Demand Reference Resources',
      command: 'resources/commands.md / troubleshooting.md',
      desc: 'Skill loads reference markdown documents on demand when asked about setup or troubleshooting.',
      why: 'Keeps main SKILL.md resident prompt compact while giving Claude access to full deep documentation when needed.',
    },
  ];

  return (
    <div className="app-container space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-purple-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md border border-purple-800/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-purple-500/20 text-purple-300 rounded-lg border border-purple-500/30">
                <Bot className="w-5 h-5" />
              </span>
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-purple-300">
                Claude Code Integration
              </span>
              <span className="px-2 py-0.5 bg-purple-500/30 text-purple-200 text-[10px] font-mono rounded border border-purple-400/30">
                /local-search skill
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white font-sans">
              The Claude Code Skill Guide & Contract
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Local Search ships a bundled skill that enables Claude Code to autonomously query specifications, enforce requirement traceability (<code className="text-purple-300 font-mono">@spec ID</code>), and ground AI responses without context bloat or cloud secrets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-panel-inset border border-purple-500/30 p-3 rounded-xl font-mono text-[11px] text-purple-200 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Installed via CLI</span>
              </div>
              <div className="text-slate-400">$ local-search install-skill</div>
              <div className="text-[10px] text-slate-400">Target: ~/.claude/skills/local-search</div>
            </div>
          </div>
        </div>

        {/* Sub-tab Navigation Buttons */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-purple-800/40 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'overview'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-panel-inset text-slate-300 hover:bg-panel-raised'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Skill Overview & Discovery</span>
          </button>

          <button
            onClick={() => setActiveTab('init')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'init'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-panel-inset text-slate-300 hover:bg-panel-raised'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Project Scope (.agent/config)</span>
          </button>

          <button
            onClick={() => setActiveTab('capabilities')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'capabilities'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-panel-inset text-slate-300 hover:bg-panel-raised'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>7 Skill Options (What, How, Why)</span>
          </button>

          <button
            onClick={() => setActiveTab('sandbox')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'sandbox'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-panel-inset text-slate-300 hover:bg-panel-raised'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Skill Agent Simulator</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Overview & Discovery */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Installation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-purple-600" />
                  Global Skill Installation
                </span>
                <span className="text-[10px] bg-purple-100 text-purple-800 font-mono px-2 py-0.5 rounded font-bold">
                  DEFAULT
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Installs the bundled skill into Claude Code's global skill directory so it is available across all workspaces on your machine.
              </p>
              <div className="bg-panel-inset p-3 rounded-xl font-mono text-[11px] text-purple-200 flex items-center justify-between">
                <span>$ local-search install-skill</span>
                <button
                  onClick={() => handleCopy('local-search install-skill', 101)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  {copiedIndex === 101 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Destination: <code className="font-mono text-slate-700">~/.claude/skills/local-search</code>
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <FolderGit2 className="w-4 h-4 text-blue-600" />
                  Local Project Skill Installation
                </span>
                <span className="text-[10px] bg-blue-100 text-blue-800 font-mono px-2 py-0.5 rounded font-bold">
                  TEAM / REPO
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Lands the skill at <code className="font-mono text-slate-800">./.claude/skills/local-search</code> so everyone cloning the repository gets skill capabilities without extra setup.
              </p>
              <div className="bg-panel-inset p-3 rounded-xl font-mono text-[11px] text-blue-200 flex items-center justify-between">
                <span>$ local-search install-skill --local</span>
                <button
                  onClick={() => handleCopy('local-search install-skill --local', 102)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  {copiedIndex === 102 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Destination: <code className="font-mono text-slate-700">./.claude/skills/local-search</code>
              </p>
            </div>
          </div>

          {/* Invocation Mechanics */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              How Claude Invokes the Skill
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 bg-purple-50/80 border border-purple-200 rounded-xl space-y-2">
                <div className="font-bold text-purple-950 text-sm flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-purple-700" />
                  <span>1. Automatic Intent Triggering</span>
                </div>
                <p className="text-purple-900 leading-relaxed">
                  The skill's description acts as a broad trigger list. Claude Code automatically loads the skill whenever a prompt involves specifications, requirements, policies, or architecture.
                </p>
                <div className="bg-white p-2.5 rounded border border-purple-200 font-mono text-[10px] text-slate-800">
                  Example Prompts:<br/>
                  - &quot;What is our refund policy?&quot;<br/>
                  - &quot;How does payment eligibility work in payments.md?&quot;<br/>
                  - &quot;Set up local search for this project.&quot;
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-slate-700" />
                  <span>2. Explicit Command Triggering</span>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  You can explicitly type <code className="font-mono bg-white px-1 border rounded text-purple-700 font-bold">/local-search</code> in Claude Code to force skill execution directly.
                </p>
                <div className="bg-white p-2.5 rounded border border-slate-200 font-mono text-[10px] text-slate-800">
                  Explicit Usage:<br/>
                  /local-search what specifications cover Stripe webhook failures?
                </div>
              </div>
            </div>
          </div>

          {/* Core Principles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-2 shadow-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                <Cpu className="w-4 h-4 text-purple-600" />
                <span>Search First, Ground Always</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Standing instruction obligates Claude to search specifications before answering. Claude must ground every statement in retrieved spec markdown.
              </p>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-2 shadow-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Mandatory Citations</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Every code snippet or architectural answer produced by Claude explicitly cites target markdown files and requirement IDs (<code className="font-mono text-purple-700">@spec R-1.3</code>).
              </p>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-2 shadow-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                <Zap className="w-4 h-4 text-blue-600" />
                <span>Strict Context Limits</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Skill limits document reading to the top 2-4 matches. This prevents context flooding and guarantees rapid LLM response times.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Project Scope (.agent/local-search-config.yaml) */}
      {activeTab === 'init' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Project Scope Config: local-search init</h3>
                <p className="text-xs text-slate-500">Manages <code className="font-mono text-purple-700">.agent/local-search-config.yaml</code> to restrict AI searches to relevant project repos.</p>
              </div>
              <span className="font-mono text-[11px] bg-slate-100 px-2.5 py-1 rounded border border-slate-200 text-slate-700">
                Non-Interactive Contract
              </span>
            </div>

            {/* Code YAML Block */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-slate-600">
                <span>Sample <code className="text-purple-700">.agent/local-search-config.yaml</code></span>
                <button
                  onClick={() => handleCopy(`repositories:\n  - product-specs\n  - platform-docs\n  - graph:legacy-ontology`, 103)}
                  className="text-purple-600 hover:text-purple-800 flex items-center gap-1"
                >
                  {copiedIndex === 103 ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy YAML</span>
                </button>
              </div>
              <pre className="bg-panel-inset text-purple-200 p-4 rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto border border-panel-edge">
{`# LocalSearch project scope — repositories searched when running from this project.
# Names must match \`local-search repo list\`. Managed by \`local-search init\`.
repositories:
  - product-specs
  - platform-docs
  - graph:legacy-ontology`}
              </pre>
            </div>

            {/* 5 Rules Table */}
            <div className="space-y-3 pt-2">
              <h4 className="font-bold text-slate-900 text-sm">5 Non-Obvious Execution Rules</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="font-bold text-purple-900">1. Flag Precedence</div>
                  <p className="text-slate-600 text-[11px]">
                    Flags compose in strict order: <code className="font-mono">--set</code> → <code className="font-mono">--add</code> → <code className="font-mono">--remove</code>.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="font-bold text-purple-900">2. Validation Before Write</div>
                  <p className="text-slate-600 text-[11px]">
                    <code className="font-mono">--add</code> validates against registered repos. Invalid names reject the write entirely—zero partial writes.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="font-bold text-purple-900">3. File Auto-Creation</div>
                  <p className="text-slate-600 text-[11px]">
                    Running <code className="font-mono">local-search init --json</code> creates <code className="font-mono">.agent/local-search-config.yaml</code> automatically if missing.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="font-bold text-purple-900">4. Stale Entry Reporting</div>
                  <p className="text-slate-600 text-[11px]">
                    Dangling entries appear in the <code className="font-mono text-amber-700">&quot;unknown&quot;</code> array without being auto-deleted, avoiding git merge churn.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 col-span-1 md:col-span-2">
                  <div className="font-bold text-purple-900">5. Zero-Scan Speed Guarantee</div>
                  <p className="text-slate-600 text-[11px]">
                    <code className="font-mono">local-search init</code> opens the DB and verifies schema but <strong>never triggers a scan</strong>, guaranteeing sub-10ms response.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: 7 Skill Capabilities */}
      {activeTab === 'capabilities' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-base">The 7 Skill Options & Capabilities</h3>
            <span className="text-xs text-slate-500 font-mono">SKILL.md Contract</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {skillOptions.map((opt, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs hover:border-purple-300 transition-all">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                    {opt.num}
                  </span>
                  <span className="font-bold text-slate-900 text-sm">{opt.title}</span>
                </div>

                <div className="bg-panel-inset p-2.5 rounded-lg font-mono text-[11px] text-purple-200">
                  $ {opt.command}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {opt.desc}
                </p>

                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-700">
                  <span className="font-bold text-slate-900">Why it matters:</span> {opt.why}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Agent Simulator */}
      {activeTab === 'sandbox' && (
        <div className="bg-panel border border-panel-edge rounded-2xl p-6 text-slate-100 space-y-5 shadow-xl animate-fadeIn font-mono text-xs">
          <div className="flex items-center justify-between border-b border-panel-edge pb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-400" />
              <span className="font-bold text-sm text-purple-200">Claude Code Skill Execution Simulator</span>
            </div>
            <span className="text-[10px] text-slate-400 bg-panel-raised px-2 py-1 rounded border border-panel-edge">
              Contract: json context
            </span>
          </div>

          {/* Controls Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-panel-inset p-4 rounded-xl border border-panel-edge">
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-semibold">User Prompt / Query:</label>
              <input
                type="text"
                value={sandboxQuery}
                onChange={(e) => setSandboxQuery(e.target.value)}
                className="w-full bg-panel border border-panel-edge rounded-lg px-3 py-1.5 text-xs text-purple-200 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-semibold">Project Scope (--scope):</label>
              <input
                type="text"
                value={sandboxScope}
                onChange={(e) => setSandboxScope(e.target.value)}
                className="w-full bg-panel border border-panel-edge rounded-lg px-3 py-1.5 text-xs text-blue-200 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <button
                onClick={() => runSkillSimulation(sandboxQuery, sandboxScope)}
                disabled={isSimulating}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-2 transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Simulate Claude Agent Skill Execution</span>
              </button>
            </div>
          </div>

          {/* Simulation Results Output */}
          {sandboxResult && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-3 bg-panel-inset rounded-xl border border-purple-900/60 space-y-1">
                <div className="text-[11px] text-slate-400 font-bold">1. Skill Command Dispatched:</div>
                <div className="text-emerald-400 font-bold">$ {sandboxResult.command}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-400 font-bold">2. JSON Payload Returned to Claude:</div>
                  <pre className="bg-panel-inset p-3 rounded-xl text-[10px] text-slate-300 overflow-x-auto max-h-56 border border-panel-edge">
{JSON.stringify(
  {
    query: sandboxQuery,
    scope: sandboxResult.scope,
    read_cap: sandboxResult.readCap,
    results: sandboxResult.results,
  },
  null,
  2
)}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] text-purple-300 font-bold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>3. Grounded Claude Agent Answer:</span>
                  </div>
                  <div className="bg-purple-950/40 p-4 rounded-xl border border-purple-800/60 text-slate-200 text-[11px] leading-relaxed whitespace-pre-line font-sans">
                    {sandboxResult.agentAnswer}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
