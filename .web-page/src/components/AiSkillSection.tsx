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
      desc: 'Declares allowed repos in .agents/local-search-config.yaml to prevent cross-project context bloat during searches.',
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

  const focusRing =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

  return (
    <div className="app-container space-y-6">
      {/* Header Banner */}
      <div className="bg-panel text-panel-ink rounded-card p-6 shadow-2xs border border-panel-edge">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-accent-soft text-accent-ink rounded-input border border-accent/25">
                <Bot className="w-5 h-5" aria-hidden="true" />
              </span>
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-panel-ink-2">
                Claude Code Integration
              </span>
              <span className="px-2 py-0.5 bg-panel-raised text-panel-ink-2 text-[10px] font-mono rounded-input border border-panel-edge">
                /local-search skill
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-semibold tracking-tight text-panel-ink">
              The Claude Code Skill Guide &amp; Contract
            </h2>
            <p className="text-sm text-panel-ink-2 leading-relaxed">
              Local Search ships a bundled skill that enables Claude Code to autonomously query specifications, enforce requirement traceability (<code className="text-panel-ink font-mono">@spec ID</code>), and ground AI responses without context bloat or cloud secrets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-panel-inset border border-panel-edge p-3 rounded-card font-mono text-[11px] text-panel-ink-2 space-y-1">
              <div className="flex items-center gap-1.5 text-accent-ink font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Installed via CLI</span>
              </div>
              <div className="text-panel-ink-3">$ local-search install-skill</div>
              <div className="text-[10px] text-panel-ink-3">Target: ~/.claude/skills/local-search</div>
            </div>
          </div>
        </div>

        {/* Sub-tab Navigation Buttons */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-panel-edge overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-2.5 rounded-input text-xs font-semibold flex items-center gap-1.5 transition-all ${focusRing} ${
              activeTab === 'overview'
                ? 'bg-accent text-accent-contrast'
                : 'bg-panel-inset text-panel-ink-2 hover:bg-panel-raised hover:text-panel-ink'
            }`}
          >
            <Bot className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Skill Overview &amp; Discovery</span>
          </button>

          <button
            onClick={() => setActiveTab('init')}
            className={`px-3 py-2.5 rounded-input text-xs font-semibold flex items-center gap-1.5 transition-all ${focusRing} ${
              activeTab === 'init'
                ? 'bg-accent text-accent-contrast'
                : 'bg-panel-inset text-panel-ink-2 hover:bg-panel-raised hover:text-panel-ink'
            }`}
          >
            <Settings className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Project Scope (.agents/config)</span>
          </button>

          <button
            onClick={() => setActiveTab('capabilities')}
            className={`px-3 py-2.5 rounded-input text-xs font-semibold flex items-center gap-1.5 transition-all ${focusRing} ${
              activeTab === 'capabilities'
                ? 'bg-accent text-accent-contrast'
                : 'bg-panel-inset text-panel-ink-2 hover:bg-panel-raised hover:text-panel-ink'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>7 Skill Options (What, How, Why)</span>
          </button>

          <button
            onClick={() => setActiveTab('sandbox')}
            className={`px-3 py-2.5 rounded-input text-xs font-semibold flex items-center gap-1.5 transition-all ${focusRing} ${
              activeTab === 'sandbox'
                ? 'bg-accent text-accent-contrast'
                : 'bg-panel-inset text-panel-ink-2 hover:bg-panel-raised hover:text-panel-ink'
            }`}
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Skill Agent Simulator</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Overview & Discovery */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Installation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-rule rounded-card p-5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-rule pb-2">
                <span className="font-bold text-ink text-sm flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-ink-3" aria-hidden="true" />
                  Global Skill Installation
                </span>
                <span className="text-[10px] bg-paper-3 text-ink-2 font-mono px-2 py-0.5 rounded-input font-bold">
                  DEFAULT
                </span>
              </div>
              <p className="text-sm text-ink-2 leading-relaxed">
                Installs the bundled skill into Claude Code's global skill directory so it is available across all workspaces on your machine.
              </p>
              <div className="bg-panel-inset p-3 rounded-input font-mono text-[11px] text-panel-ink-2 flex items-center justify-between">
                <span>$ local-search install-skill</span>
                <button
                  onClick={() => handleCopy('local-search install-skill', 101)}
                  aria-label="Copy install command"
                  className={`text-panel-ink-3 hover:text-panel-ink p-2 rounded-input transition-colors ${focusRing}`}
                >
                  {copiedIndex === 101 ? <Check className="w-3.5 h-3.5 text-accent-ink" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                </button>
              </div>
              <p className="text-[11px] text-ink-3">
                Destination: <code className="font-mono text-ink-2">~/.claude/skills/local-search</code>
              </p>
            </div>

            <div className="bg-white border border-rule rounded-card p-5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-rule pb-2">
                <span className="font-bold text-ink text-sm flex items-center gap-2">
                  <FolderGit2 className="w-4 h-4 text-ink-3" aria-hidden="true" />
                  Local Project Skill Installation
                </span>
                <span className="text-[10px] bg-paper-3 text-ink-2 font-mono px-2 py-0.5 rounded-input font-bold">
                  TEAM / REPO
                </span>
              </div>
              <p className="text-sm text-ink-2 leading-relaxed">
                Lands the skill at <code className="font-mono text-ink-2">./.claude/skills/local-search</code> so everyone cloning the repository gets skill capabilities without extra setup.
              </p>
              <div className="bg-panel-inset p-3 rounded-input font-mono text-[11px] text-panel-ink-2 flex items-center justify-between">
                <span>$ local-search install-skill --local</span>
                <button
                  onClick={() => handleCopy('local-search install-skill --local', 102)}
                  aria-label="Copy local install command"
                  className={`text-panel-ink-3 hover:text-panel-ink p-2 rounded-input transition-colors ${focusRing}`}
                >
                  {copiedIndex === 102 ? <Check className="w-3.5 h-3.5 text-accent-ink" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                </button>
              </div>
              <p className="text-[11px] text-ink-3">
                Destination: <code className="font-mono text-ink-2">./.claude/skills/local-search</code>
              </p>
            </div>
          </div>

          {/* Invocation Mechanics */}
          <div className="bg-white border border-rule rounded-card p-6 space-y-4 shadow-2xs">
            <h3 className="font-display font-semibold text-ink text-base flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-ink-3" aria-hidden="true" />
              How Claude Invokes the Skill
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="p-4 bg-accent-soft border border-accent/25 rounded-card space-y-2">
                <div className="font-bold text-accent-ink text-sm flex items-center gap-1.5">
                  <Zap className="w-4 h-4" aria-hidden="true" />
                  <span>1. Automatic Intent Triggering</span>
                </div>
                <p className="text-ink-2 leading-relaxed">
                  The skill's description acts as a broad trigger list. Claude Code automatically loads the skill whenever a prompt involves specifications, requirements, policies, or architecture.
                </p>
                <div className="bg-white p-2.5 rounded-input border border-rule font-mono text-[11px] text-ink-2">
                  Example Prompts:<br/>
                  - &quot;What is our refund policy?&quot;<br/>
                  - &quot;How does payment eligibility work in payments.md?&quot;<br/>
                  - &quot;Set up local search for this project.&quot;
                </div>
              </div>

              <div className="p-4 bg-paper-2 border border-rule rounded-card space-y-2">
                <div className="font-bold text-ink text-sm flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-ink-3" aria-hidden="true" />
                  <span>2. Explicit Command Triggering</span>
                </div>
                <p className="text-ink-2 leading-relaxed">
                  You can explicitly type <code className="font-mono bg-white px-1 border border-rule rounded-input text-ink font-bold">/local-search</code> in Claude Code to force skill execution directly.
                </p>
                <div className="bg-white p-2.5 rounded-input border border-rule font-mono text-[11px] text-ink-2">
                  Explicit Usage:<br/>
                  /local-search what specifications cover Stripe webhook failures?
                </div>
              </div>
            </div>
          </div>

          {/* Core Principles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-white border border-rule p-4 rounded-card space-y-2 shadow-2xs">
              <div className="flex items-center gap-1.5 font-bold text-ink text-sm">
                <Cpu className="w-4 h-4 text-ink-3" aria-hidden="true" />
                <span>Search First, Ground Always</span>
              </div>
              <p className="text-ink-2 leading-relaxed">
                Standing instruction obligates Claude to search specifications before answering. Claude must ground every statement in retrieved spec markdown.
              </p>
            </div>

            <div className="bg-white border border-rule p-4 rounded-card space-y-2 shadow-2xs">
              <div className="flex items-center gap-1.5 font-bold text-ink text-sm">
                <ShieldCheck className="w-4 h-4 text-accent-ink" aria-hidden="true" />
                <span>Mandatory Citations</span>
              </div>
              <p className="text-ink-2 leading-relaxed">
                Every code snippet or architectural answer produced by Claude explicitly cites target markdown files and requirement IDs (<code className="font-mono text-ink">@spec R-1.3</code>).
              </p>
            </div>

            <div className="bg-white border border-rule p-4 rounded-card space-y-2 shadow-2xs">
              <div className="flex items-center gap-1.5 font-bold text-ink text-sm">
                <Zap className="w-4 h-4 text-ink-3" aria-hidden="true" />
                <span>Strict Context Limits</span>
              </div>
              <p className="text-ink-2 leading-relaxed">
                Skill limits document reading to the top 2-4 matches. This prevents context flooding and guarantees rapid LLM response times.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Project Scope (.agents/local-search-config.yaml) */}
      {activeTab === 'init' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white border border-rule rounded-card p-6 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div>
                <h3 className="font-display font-semibold text-ink text-base">Project Scope Config: local-search init</h3>
                <p className="text-sm text-ink-3">Manages <code className="font-mono text-ink">.agents/local-search-config.yaml</code> to restrict AI searches to relevant project repos.</p>
              </div>
              <span className="font-mono text-[11px] bg-paper-3 px-2.5 py-1 rounded-input border border-rule text-ink-2">
                Non-Interactive Contract
              </span>
            </div>

            {/* Code YAML Block */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-ink-2">
                <span>Sample <code className="text-ink">.agents/local-search-config.yaml</code></span>
                <button
                  onClick={() => handleCopy(`repositories:\n  - product-specs\n  - platform-docs\n  - graph:legacy-ontology`, 103)}
                  className={`text-accent-ink hover:opacity-80 flex items-center gap-1 p-1.5 rounded-input transition-colors ${focusRing}`}
                >
                  {copiedIndex === 103 ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                  <span>{copiedIndex === 103 ? 'Copied' : 'Copy YAML'}</span>
                </button>
              </div>
              <pre className="bg-panel-inset text-syntax-string p-4 rounded-card font-mono text-[11px] leading-relaxed overflow-x-auto border border-panel-edge">
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
              <h4 className="font-display font-semibold text-ink text-sm">5 Non-Obvious Execution Rules</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-paper-2 rounded-card border border-rule space-y-1">
                  <div className="font-bold text-ink">1. Flag Precedence</div>
                  <p className="text-ink-2 text-[13px]">
                    Flags compose in strict order: <code className="font-mono">--set</code> → <code className="font-mono">--add</code> → <code className="font-mono">--remove</code>.
                  </p>
                </div>

                <div className="p-3 bg-paper-2 rounded-card border border-rule space-y-1">
                  <div className="font-bold text-ink">2. Validation Before Write</div>
                  <p className="text-ink-2 text-[13px]">
                    <code className="font-mono">--add</code> validates against registered repos. Invalid names reject the write entirely—zero partial writes.
                  </p>
                </div>

                <div className="p-3 bg-paper-2 rounded-card border border-rule space-y-1">
                  <div className="font-bold text-ink">3. File Auto-Creation</div>
                  <p className="text-ink-2 text-[13px]">
                    Running <code className="font-mono">local-search init --json</code> creates <code className="font-mono">.agents/local-search-config.yaml</code> automatically if missing.
                  </p>
                </div>

                <div className="p-3 bg-paper-2 rounded-card border border-rule space-y-1">
                  <div className="font-bold text-ink">4. Stale Entry Reporting</div>
                  <p className="text-ink-2 text-[13px]">
                    Dangling entries appear in the <code className="font-mono text-warn-ink">&quot;unknown&quot;</code> array without being auto-deleted, avoiding git merge churn.
                  </p>
                </div>

                <div className="p-3 bg-paper-2 rounded-card border border-rule space-y-1 col-span-1 md:col-span-2">
                  <div className="font-bold text-ink">5. Zero-Scan Speed Guarantee</div>
                  <p className="text-ink-2 text-[13px]">
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
            <h3 className="font-display font-semibold text-ink text-base">The 7 Skill Options &amp; Capabilities</h3>
            <span className="text-xs text-ink-3 font-mono">SKILL.md Contract</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {skillOptions.map((opt, idx) => (
              <div key={idx} className="bg-white border border-rule rounded-card p-5 space-y-3 shadow-2xs hover:border-rule-strong transition-all">
                <div className="flex items-center justify-between border-b border-rule pb-2">
                  <span className="text-xs font-mono font-bold text-accent-ink bg-accent-soft px-2 py-0.5 rounded-input border border-accent/25">
                    {opt.num}
                  </span>
                  <span className="font-bold text-ink text-sm">{opt.title}</span>
                </div>

                <div className="bg-panel-inset p-2.5 rounded-input font-mono text-[11px] text-syntax-string">
                  $ {opt.command}
                </div>

                <p className="text-sm text-ink-2 leading-relaxed">
                  {opt.desc}
                </p>

                <div className="p-2.5 bg-paper-2 rounded-input border border-rule text-[13px] text-ink-2">
                  <span className="font-bold text-ink">Why it matters:</span> {opt.why}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Agent Simulator */}
      {activeTab === 'sandbox' && (
        <div className="bg-panel border border-panel-edge rounded-card p-6 text-panel-ink space-y-5 shadow-lg animate-fadeIn font-mono text-xs">
          <div className="flex items-center justify-between border-b border-panel-edge pb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-panel-ink-2" aria-hidden="true" />
              <span className="font-bold text-sm text-panel-ink">Claude Code Skill Execution Simulator</span>
            </div>
            <span className="text-[10px] text-panel-ink-3 bg-panel-raised px-2 py-1 rounded-input border border-panel-edge">
              Contract: json context
            </span>
          </div>

          {/* Controls Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-panel-inset p-4 rounded-card border border-panel-edge">
            <div className="space-y-1">
              <label className="text-[11px] text-panel-ink-3 font-semibold">User Prompt / Query:</label>
              <input
                type="text"
                value={sandboxQuery}
                onChange={(e) => setSandboxQuery(e.target.value)}
                className={`w-full bg-panel border border-panel-edge rounded-input px-3 py-1.5 text-xs text-panel-ink ${focusRing}`}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-panel-ink-3 font-semibold">Project Scope (--scope):</label>
              <input
                type="text"
                value={sandboxScope}
                onChange={(e) => setSandboxScope(e.target.value)}
                className={`w-full bg-panel border border-panel-edge rounded-input px-3 py-1.5 text-xs text-panel-ink ${focusRing}`}
              />
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <button
                onClick={() => runSkillSimulation(sandboxQuery, sandboxScope)}
                disabled={isSimulating}
                className={`min-h-11 px-4 py-2 bg-accent text-accent-contrast hover:opacity-90 disabled:opacity-50 font-bold rounded-input text-xs flex items-center gap-2 transition-all cursor-pointer ${focusRing}`}
              >
                <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                <span>Simulate Claude Agent Skill Execution</span>
              </button>
            </div>
          </div>

          {/* Simulation Results Output */}
          {sandboxResult && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-3 bg-panel-inset rounded-card border border-panel-edge space-y-1">
                <div className="text-[11px] text-panel-ink-3 font-bold">1. Skill Command Dispatched:</div>
                <div className="text-syntax-string font-bold">$ {sandboxResult.command}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-[11px] text-panel-ink-3 font-bold">2. JSON Payload Returned to Claude:</div>
                  <pre className="bg-panel-inset p-3 rounded-card text-[10px] text-panel-ink-2 overflow-x-auto max-h-56 border border-panel-edge">
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
                  <div className="text-[11px] text-panel-ink-2 font-bold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-panel-ink-2" aria-hidden="true" />
                    <span>3. Grounded Claude Agent Answer:</span>
                  </div>
                  <div className="bg-panel-raised p-4 rounded-card border border-panel-edge text-panel-ink text-[11px] leading-relaxed whitespace-pre-line font-body">
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
