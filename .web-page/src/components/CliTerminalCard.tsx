import React, { useState, useRef, useEffect } from 'react';
import { CliCommandHistory } from '../types';
import {
  Terminal,
  Play,
  Copy,
  Check,
  CornerDownLeft,
  Sparkles,
  Search,
  BookOpen,
  Filter,
  CheckCircle2,
  Database,
  Cpu,
  Zap,
  Tag,
  ShieldCheck,
} from 'lucide-react';

interface CliTerminalCardProps {
  onTaskCompleted?: () => void;
}

export const CliTerminalCard: React.FC<CliTerminalCardProps> = ({ onTaskCompleted }) => {
  const [activeSection, setActiveSection] = useState<'terminal' | 'commands' | 'mechanics'>('terminal');
  const [inputVal, setInputVal] = useState('local-search search "refund"');
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [history, setHistory] = useState<CliCommandHistory[]>([
    {
      command: 'local-search repo add ./docs product-specs',
      output: `Added repo "product-specs" (/Users/you/work/product-specs)\nScanning…\n  product-specs: 6 files indexed\n\nDone. 6 specs indexed. Run 'local-search search <keyword>' to find specs.`,
      timestamp: '05:50:12',
    },
  ]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const handleRunCommand = (cmdStr?: string) => {
    const rawCmd = cmdStr !== undefined ? cmdStr : inputVal;
    if (!rawCmd.trim()) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let outputNode: React.ReactNode = '';

    const lower = rawCmd.trim().toLowerCase();

    if (lower.startsWith('local-search search') || lower.startsWith('search')) {
      outputNode = (
        <div className="space-y-1 font-mono text-[11px] text-slate-200">
          <div className="text-blue-400 font-semibold">[source=fts · rank=bm25 · repos=3 (2 with graphs)]</div>
          <div className="text-slate-400 mt-1">Specs (3):</div>
          <div className="pl-2 border-l-2 border-blue-500 my-1">
            <div className="text-emerald-400 font-bold">[product-specs · FTS] payments/refund.md</div>
            <div className="text-slate-300">Refund Flow & Policy (billing, payments, @spec:r-1.3, @spec:tasks-012)</div>
          </div>
          <div className="pl-2 border-l-2 border-slate-700 my-1">
            <div className="text-slate-300">[billing-service · FTS] integrations/stripe.md</div>
            <div className="text-slate-400">Stripe Integration Spec (billing, stripe, webhooks)</div>
          </div>
          <div className="pl-2 border-l-2 border-slate-700 my-1">
            <div className="text-slate-300">[product-specs · FTS] payments/chargeback.md</div>
            <div className="text-slate-400">Chargeback & Dispute Management (billing, fraud, disputes)</div>
          </div>
        </div>
      );
    } else if (lower.startsWith('local-search read') || lower.startsWith('read')) {
      outputNode = (
        <pre className="font-mono text-[11px] text-slate-300 bg-slate-950 p-2 rounded border border-slate-800 overflow-x-auto">
{`---
id: capability://payments/refund
tags: billing, payments, customer-support
dependsOn: platform-docs:auth-api, billing-service:stripe-integration
relationships: product-specs:chargeback
---

# Refund Flow & Policy

- @spec R-1.3 — WHEN customer submits refund request within 30 days, THE SYSTEM SHALL process refund.
- @spec TASKS-012 — WHEN refund exceeds $500, THE SYSTEM SHALL require manager approval.`}
        </pre>
      );
    } else if (lower.startsWith('local-search scope') || lower.startsWith('scope')) {
      outputNode = (
        <div className="font-mono text-[11px] text-slate-300 space-y-1">
          <div><span className="text-blue-400">Scope:</span>   product-specs, platform-docs, billing-service</div>
          <div><span className="text-blue-400">Source:</span>  /Users/you/work/.local-search.toml</div>
          <div><span className="text-blue-400">Weights:</span> specs=1.00 graphify=0.70 codegraph=0.80</div>
          <div><span className="text-blue-400">Limits:</span>  specs=20 graphify=10 codegraph=10 blast_depth=2</div>
        </div>
      );
    } else if (lower.startsWith('local-search tags') || lower.startsWith('tags')) {
      outputNode = (
        <div className="font-mono text-[11px] text-slate-300 grid grid-cols-2 gap-1">
          <div><span className="text-amber-400">spec:r-1.3</span> (4 specs)</div>
          <div><span className="text-amber-400">spec:tasks-012</span> (2 specs)</div>
          <div><span className="text-blue-400">billing</span> (6 specs)</div>
          <div><span className="text-blue-400">auth</span> (4 specs)</div>
          <div><span className="text-blue-400">jwt</span> (3 specs)</div>
          <div><span className="text-emerald-400">link:chargeback-doc</span> (2 specs)</div>
        </div>
      );
    } else if (lower.startsWith('local-search graph explain') || lower.startsWith('graph explain')) {
      outputNode = (
        <div className="font-mono text-[11px] text-slate-300 space-y-1">
          <div className="text-blue-400 font-bold">capability://payments/refund [capability]</div>
          <div className="text-slate-400 pl-2">defined: product-specs:payments/refund.md</div>
          <div className="text-emerald-400 font-semibold mt-1">outgoing:</div>
          <div className="pl-4 text-slate-300">depends_on -&gt; component://auth-api (field dependsOn)</div>
          <div className="pl-4 text-slate-300">depends_on -&gt; component://stripe-integration (field dependsOn)</div>
          <div className="pl-4 text-slate-300">related_to -&gt; capability://payments/chargeback (field relationships)</div>
        </div>
      );
    } else if (lower.startsWith('local-search doctor') || lower.startsWith('doctor')) {
      outputNode = (
        <div className="font-mono text-[11px] text-slate-300 space-y-1">
          <div className="text-emerald-400 font-bold">local-search doctor — v0.3.15</div>
          <div className="text-slate-400">✓ Database file: ~/.local-search/specs.db (81.9 MB)</div>
          <div className="text-slate-400">✓ Integrity: ok</div>
          <div className="text-slate-400">✓ Schema version: v3</div>
          <div className="text-amber-400">⚠ Repository &quot;squirrel&quot; changed since last scan</div>
          <div className="text-emerald-400 font-bold mt-1">Result: healthy with 1 warning.</div>
        </div>
      );
    } else if (lower === 'help' || lower === 'local-search help') {
      outputNode = (
        <div className="font-mono text-[11px] text-slate-300 space-y-1">
          <div className="text-blue-400 font-bold">Available local-search CLI commands:</div>
          <div>• <span className="text-emerald-400">search &lt;query&gt;</span> [--repos a,b] [--semantic] [--source auto|fts|graph]</div>
          <div>• <span className="text-emerald-400">find &lt;query&gt;</span> [--scope repo1,repo2]</div>
          <div>• <span className="text-emerald-400">read &lt;name&gt;</span> — Print full spec file content</div>
          <div>• <span className="text-emerald-400">repo add &lt;path&gt; &lt;name&gt;</span> — Register folder</div>
          <div>• <span className="text-emerald-400">scope show / set / clear</span> — Manage CLI scope (.local-search.toml)</div>
          <div>• <span className="text-emerald-400">tags</span> — View requirement @spec tags and frequencies</div>
          <div>• <span className="text-emerald-400">graph explain &lt;entity&gt;</span> — 1-hop neighborhood walkthrough</div>
          <div>• <span className="text-emerald-400">doctor</span> — Comprehensive health &amp; index diagnostic check</div>
        </div>
      );
    } else {
      outputNode = (
        <div className="text-slate-400 font-mono text-[11px]">
          Executed &quot;{rawCmd}&quot; successfully against local specs cache (~12ms).
        </div>
      );
    }

    setHistory((prev) => [
      ...prev,
      {
        command: rawCmd,
        output: outputNode,
        timestamp,
      },
    ]);

    if (onTaskCompleted) {
      onTaskCompleted();
    }
  };

  const presetButtons = [
    { label: 'Search "refund"', cmd: 'local-search search "refund"' },
    { label: 'Find "refund"', cmd: 'local-search find "refund"' },
    { label: 'Read Spec', cmd: 'local-search read refund' },
    { label: 'Show Scope', cmd: 'local-search scope show' },
    { label: 'List Tags', cmd: 'local-search tags' },
    { label: 'Graph Explain', cmd: 'local-search graph explain "capability://payments/refund"' },
    { label: 'Run Doctor', cmd: 'local-search doctor' },
  ];

  const commandDirectory = [
    {
      cmd: 'local-search repo add <path> <name>',
      flags: ['--skip-directory <name>', '--list', '--remove <name>'],
      category: '01 Repository Registration',
      what: 'Registers a local directory as a searchable workspace repository and immediately indexes all markdown files.',
      how: 'Traverses markdown files in the target directory (honoring .gitignore & .graphifyignore), extracts YAML frontmatter, @spec tags, and term frequencies, writing them directly into ~/.local-search/specs.db.',
      why: 'Establishes precise workspace boundaries for local-search while ensuring 100% Zero-Cloud privacy—no file content or embeddings ever leave your machine.',
    },
    {
      cmd: 'local-search search <query>',
      flags: ['--repos <a,b>', '--semantic', '--source <auto|fts|graph>', '--rank <auto|bm25|graph-aware>', '--json'],
      category: '02 Retrieval & Querying',
      what: 'Executes full-text BM25 search, vector similarity, or knowledge graph lookup across indexed markdown specification files.',
      how: 'Queries SQLite FTS5 with Porter Stemming normalization ("refunding" matches "refund"). Under --semantic, fuses BM25 + 256-d vector embeddings using Reciprocal Rank Fusion (RRF).',
      why: 'Allows engineers and AI agents to instantly retrieve pertinent PRDs, specs, and architecture decisions in under 15ms.',
    },
    {
      cmd: 'local-search find <query>',
      flags: ['--scope <repo1,repo2>', '--json'],
      category: '03 Unified Multi-Source Search',
      what: 'Runs unified scoped search across 3 distinct sources simultaneously: indexed specs, Graphify knowledge graphs, and code-review call graphs.',
      how: 'Reads project scope from .local-search.toml, executes sub-queries against all three sources, normalizes scores with configured weight multipliers, and outputs a merged table.',
      why: 'Answers "Where is refund logic implemented and specified?" in a single query by linking specification documents directly to code symbols.',
    },
    {
      cmd: 'local-search read <spec-id|path>',
      flags: ['--directory <path>', '--raw', '--format <md|json>'],
      category: '04 Content Extraction',
      what: 'Dumps the complete Markdown specification content, including full YAML frontmatter, directly to standard output.',
      how: 'Resolves canonical spec IDs (e.g., "payments/refund" or "capability://payments/refund") to absolute disk paths and streams the contents.',
      why: 'Enables developers and LLM agents to read full specification context without leaving the terminal or requesting extra filesystem permissions.',
    },
    {
      cmd: 'local-search scope show / set / clear',
      flags: ['--set <repo1,repo2>', '--config <path>'],
      category: '05 Configuration Scoping',
      what: 'Inspects, sets, or clears repository boundaries, BM25 weight multipliers, and blast radius query limits in .local-search.toml.',
      how: 'Walks up parent directories from CWD to find .local-search.toml and pins search operations to specific repos in monorepos.',
      why: 'Prevents query noise in massive monorepos by restricting search operations strictly to the microservices or spec repositories relevant to your current project.',
    },
    {
      cmd: 'local-search tags / tags <tag>',
      flags: ['--filter <prefix>', '--count-only'],
      category: '06 Requirement & Tag Extraction',
      what: 'Lists all requirement tags (@spec ID), frontmatter tags, and body wikilinks along with their global occurrence frequencies.',
      how: 'Parses markdown text for Easy Approach to Requirements Syntax (EARS) tags like @spec R-1.3 and generates browsable tag facets (e.g. spec:r-1.3).',
      why: 'Provides a complete requirement coverage map for compliance auditing, test traceability, and requirement verification.',
    },
    {
      cmd: 'local-search graph explain <entity>',
      flags: ['--depth <1|2>', '--format <tree|json>', '--json'],
      category: '07 Knowledge Graph Topology',
      what: 'Explains 1-hop and 2-hop outgoing/incoming knowledge graph dependencies for any specification or code entity.',
      how: 'Traverses declared frontmatter links (dependsOn, relationships), unresolved links, and vector similarity edges with strict file provenance.',
      why: 'Gives developers instant visibility into blast radius and dependent components before making breaking software or schema changes.',
    },
    {
      cmd: 'local-search graph export-view',
      flags: ['--repos <a,b>', '--edges <auto|vector|tags>', '--out <file>'],
      category: '08 Knowledge Graph Export',
      what: 'Exports and merges multiple repository knowledge graphs into a single, deterministic node-link JSON file for visualizers.',
      how: 'Namespaces all node IDs by repo (<repo>:<id>) to eliminate collisions and outputs stably sorted JSON suitable for D3 or NetworkX viewers.',
      why: 'Allows teams to visualize multi-repo topology and commit graph diffs directly into version control for architectural reviews.',
    },
    {
      cmd: 'local-search code <query> / hubs / blast',
      flags: ['--scope <a,b>', '--depth <n>', '--cap <n>'],
      category: '09 Source Code Call Graph',
      what: 'Searches code-review-graph call nodes, identifies top architectural hub classes/functions, and calculates code blast radius.',
      how: 'Queries pre-built code call graphs (.code-review-graph/) to trace caller/callee relationships across language boundaries.',
      why: 'Answers "What functions call processRefund()?" and "If I refactor this method, what breaks?" without relying on heavy IDE LSPs.',
    },
    {
      cmd: 'local-search init / setup',
      flags: ['--json', '--add <a,b>', '--remove <a,b>', '--set <a,b>', '--dir <path>'],
      category: '10 Agent Skill Scope Setup',
      what: 'Configures project scope for the bundled Claude Code skill by editing .agent/local-search-config.yaml.',
      how: 'Validates repository names against the local registry and writes structured YAML declaring allowed search targets for AI agents.',
      why: 'Prevents AI agents from searching irrelevant repos or drowning in context bloat when answering specification queries.',
    },
    {
      cmd: 'local-search doctor / stats / size',
      flags: ['--json', '--by <repo|project>'],
      category: '11 Health & Index Diagnostics',
      what: 'Executes a comprehensive health check across database integrity, stale git commits, binary path shadows, and disk space usage.',
      how: 'Inspects SQLite FTS tables, compares last scan git commit hashes against HEAD, checks pidfiles, and breaks down disk cost per repo.',
      why: 'Instantly diagnoses why a search result feels stale, why the web UI daemon failed to boot, or why index size grew unexpectedly.',
    },
    {
      cmd: 'local-search scan-hooks install',
      flags: ['--mechanism <git-hooks|shell>', '--force'],
      category: '12 Automatic Scanning Hooks',
      what: 'Installs background git hooks (post-merge, post-checkout, post-rewrite) or shell chpwd hooks to keep the index fresh.',
      how: 'Writes sentinel-delimited background scripts that trigger background incremental rescans whenever git branches change or directory is entered.',
      why: 'Eliminates the risk of stale search results without blocking git operations or requiring manual rebuild commands.',
    },
  ];

  const filteredCommands = commandDirectory.filter((item) => {
    const matchesQuery =
      item.cmd.toLowerCase().includes(filterQuery.toLowerCase()) ||
      item.what.toLowerCase().includes(filterQuery.toLowerCase()) ||
      item.flags.some((f) => f.toLowerCase().includes(filterQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesQuery && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Top Section Switching Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
            <Terminal className="w-5 h-5 text-blue-100" />
          </div>
          <div>
            <h2 className="font-extrabold text-slate-900 text-lg">CLI Terminal Explorer & Complete Command Guide</h2>
            <p className="text-xs text-slate-500">
              Interactive terminal simulator and complete reference for all 12 <code className="font-mono text-slate-700">local-search</code> command groups.
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex items-center gap-1 text-xs font-semibold">
          <button
            onClick={() => setActiveSection('terminal')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              activeSection === 'terminal'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-blue-600" />
            <span>Interactive Terminal</span>
          </button>

          <button
            onClick={() => setActiveSection('commands')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              activeSection === 'commands'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-600" />
            <span>12 Commands Directory</span>
            <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 text-[10px] font-mono rounded">
              12
            </span>
          </button>

          <button
            onClick={() => setActiveSection('mechanics')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              activeSection === 'mechanics'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-emerald-600" />
            <span>Index Mechanics</span>
          </button>
        </div>
      </div>

      {/* Section 1: Terminal Simulator */}
      {activeSection === 'terminal' && (
        <div className="bg-slate-950 text-slate-100 rounded-2xl p-5 flex flex-col shadow-lg border border-slate-800 font-sans h-[520px]">
          {/* Terminal Titlebar */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block"></span>
                <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
                <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
              </div>
              <span className="font-mono font-bold text-slate-300 ml-2 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-blue-400" />
                local-search CLI Simulator (~/.local-search/specs.db)
              </span>
            </div>

            <button
              onClick={() => setHistory([])}
              className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear Screen
            </button>
          </div>

          {/* Quick Run Buttons for Non-Technical Users */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[10px] font-semibold text-slate-500">Quick Commands:</span>
            {presetButtons.map((btn, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setInputVal(btn.cmd);
                  handleRunCommand(btn.cmd);
                }}
                className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-blue-300 border border-slate-800 hover:border-slate-700 rounded-lg text-[11px] font-mono transition-all flex items-center gap-1 cursor-pointer"
              >
                <Play className="w-2.5 h-2.5 fill-current text-blue-400" />
                <span>{btn.label}</span>
              </button>
            ))}
          </div>

          {/* Terminal Output Stream */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 mb-3 font-mono text-xs">
            {history.map((item, idx) => (
              <div key={idx} className="space-y-1 border-b border-slate-900 pb-2.5 last:border-0">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-400 font-bold">$</span>
                    <span className="text-slate-100 font-semibold">{item.command}</span>
                  </div>
                  <span className="text-slate-600 text-[10px]">{item.timestamp}</span>
                </div>
                <div className="pl-3 text-slate-300">{item.output}</div>
              </div>
            ))}
            <div ref={terminalEndRef} />
          </div>

          {/* Terminal Input Row */}
          <div className="relative flex items-center">
            <span className="absolute left-3 text-emerald-400 font-mono font-bold text-xs pointer-events-none">
              $
            </span>
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRunCommand()}
              placeholder="type local-search command or 'help'..."
              className="w-full pl-7 pr-20 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
            <button
              onClick={() => handleRunCommand()}
              className="absolute right-1.5 py-1 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
            >
              <span>Run</span>
              <CornerDownLeft className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Section 2: 12 CLI Commands Directory (What, How, Why) */}
      {activeSection === 'commands' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Filter and Search Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Search commands, flags, or descriptions..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none font-sans cursor-pointer"
              >
                <option value="all">All 12 Command Categories</option>
                {Array.from(new Set(commandDirectory.map((c) => c.category))).map((cat, idx) => (
                  <option key={idx} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="space-y-4">
            {filteredCommands.map((item, idx) => (
              <div
                key={idx}
                className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs hover:border-blue-300 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-bold uppercase">
                      {item.category}
                    </span>
                    <span className="font-mono font-bold text-slate-900 text-sm">{item.cmd}</span>
                  </div>

                  <button
                    onClick={() => {
                      const cleanCmd = item.cmd.replace(' <query>', ' "refund"').replace(' <spec-id|path>', ' refund').replace(' <entity>', ' "capability://payments/refund"');
                      setInputVal(cleanCmd);
                      setActiveSection('terminal');
                      handleRunCommand(cleanCmd);
                    }}
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1 self-start sm:self-auto cursor-pointer transition-all"
                  >
                    <Play className="w-3 h-3 fill-current text-blue-600" />
                    <span>Run in Terminal</span>
                  </button>
                </div>

                {/* Flags Row */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                  <span className="text-slate-400 font-sans text-xs">Supported Flags:</span>
                  {item.flags.map((flag, fIdx) => (
                    <span key={fIdx} className="bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded">
                      {flag}
                    </span>
                  ))}
                </div>

                {/* What / How / Why Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
                  <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-1">
                    <div className="font-bold text-blue-900 text-[11px] uppercase tracking-wider">What it does</div>
                    <p className="text-blue-950 leading-relaxed text-[11px]">{item.what}</p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <div className="font-bold text-slate-900 text-[11px] uppercase tracking-wider">How it executes</div>
                    <p className="text-slate-700 leading-relaxed text-[11px]">{item.how}</p>
                  </div>

                  <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-1">
                    <div className="font-bold text-emerald-900 text-[11px] uppercase tracking-wider">Why it exists</div>
                    <p className="text-emerald-950 leading-relaxed text-[11px]">{item.why}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Index Mechanics & Requirements Tags */}
      {activeSection === 'mechanics' && (
        <div className="space-y-6 animate-fadeIn">
          {/* SQLite FTS5 Mechanics */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Database className="w-5 h-5 text-emerald-600" />
              <div>
                <h3 className="font-bold text-slate-900 text-base">How the Local Index Works</h3>
                <p className="text-xs text-slate-500">
                  Fast, fully offline SQLite FTS5 engine storing specifications in <code className="font-mono text-slate-700">~/.local-search/specs.db</code>.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                  <Cpu className="w-4 h-4" />
                  <span>1. SQLite FTS5 &amp; Porter Stemmer</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  The local engine parses markdown documents into <code className="font-mono text-emerald-700">~/.local-search/specs.db</code>. Words are tokenized with <code className="font-mono">unicode61</code> and Porter Stemming, so queries for &quot;refunding&quot; or &quot;refunds&quot; automatically match &quot;refund&quot;.
                </p>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[10px] text-slate-700">
                  Stemming Rule: &quot;processing&quot; → &quot;process&quot;<br />
                  Fallback: Punctuation syntax errors are auto-quoted &amp; retried.
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-1.5 text-blue-700 font-bold">
                  <Zap className="w-4 h-4" />
                  <span>2. BM25 + Hybrid Vector Scoring</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Results are scored using BM25 frequency-density logic. When <code className="font-mono text-blue-700">--semantic</code> is passed, local 256-dimensional embeddings re-rank results using Reciprocal Rank Fusion (RRF) for semantic matches.
                </p>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[10px] text-slate-700">
                  Score = (0.6 * BM25) + (0.4 * Vector Cosine)<br />
                  Ranking Time: ~12ms for 1,000 documents
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-1.5 text-purple-700 font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>3. Disposable &amp; Rebuildable Cache</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Markdown files on disk remain the absolute source of truth. The SQLite database is 100% disposable and can be deleted or rebuilt anytime using <code className="font-mono text-purple-700">local-search rebuild</code> without data loss.
                </p>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[10px] text-slate-700">
                  Safety: Deleting specs.db loses zero source data.<br />
                  Incremental: Auto-detects git HEAD changes on search.
                </div>
              </div>
            </div>
          </div>

          {/* EARS Tag & Wikilinks Mechanics */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Tag className="w-5 h-5 text-purple-600" />
              <div>
                <h3 className="font-bold text-slate-900 text-base">Requirement Tags (@spec) &amp; Wikilinks ([[doc]]) Mechanics</h3>
                <p className="text-xs text-slate-500">
                  How inline requirement annotations and cross-document Wikilinks become searchable facets and knowledge graph edges across all repositories.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 bg-amber-50/80 rounded-xl border border-amber-200 space-y-2">
                <h4 className="font-bold text-amber-900 text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-amber-700" />
                  <span>1. EARS Requirement Extraction</span>
                </h4>
                <p className="text-amber-950 leading-relaxed">
                  When scanning markdown files, <code className="font-mono font-bold">local-search</code> parses inline Easy Approach to Requirements Syntax (EARS) tags formatted as <code className="font-mono bg-white px-1 py-0.5 rounded text-amber-800">@spec &lt;ID&gt;</code>.
                </p>
                <div className="bg-white p-3 rounded-lg border border-amber-200 font-mono text-[11px] text-slate-800 space-y-1">
                  <div>- <span className="text-amber-700 font-bold">@spec R-1.3</span> — WHEN customer submits refund request within 30 days, THE SYSTEM SHALL process refund.</div>
                  <div>- <span className="text-amber-700 font-bold">@spec TASKS-012</span> — WHEN refund exceeds $500, THE SYSTEM SHALL require manager approval.</div>
                </div>
              </div>

              <div className="p-4 bg-purple-50/80 rounded-xl border border-purple-200 space-y-2">
                <h4 className="font-bold text-purple-900 text-sm flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-purple-700" />
                  <span>2. Traceability &amp; Facet Filtering</span>
                </h4>
                <p className="text-purple-950 leading-relaxed">
                  Extracted requirement IDs automatically create searchable tag facets (<code className="font-mono text-purple-800 bg-white px-1 rounded">spec:r-1.3</code>). Developers and automated test runners can query tags to verify compliance.
                </p>
                <div className="bg-white p-3 rounded-lg border border-purple-200 font-mono text-[11px] text-slate-800 space-y-1">
                  <div><span className="text-purple-700 font-bold">$ local-search tags spec:r-1.3</span></div>
                  <div className="text-slate-500">payments/refund.md (spec)</div>
                  <div className="text-slate-500">billing/override.md (architecture decision)</div>
                </div>
              </div>

              <div className="p-4 bg-blue-50/80 rounded-xl border border-blue-200 space-y-2">
                <h4 className="font-bold text-blue-900 text-sm flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-blue-700" />
                  <span>3. Wikilinks Indexing ([[target]])</span>
                </h4>
                <p className="text-blue-950 leading-relaxed">
                  Inline <code className="font-mono font-bold text-blue-800">[[target-page]]</code> links are indexed as document relationship edges and searchable tag facets (<code className="font-mono text-blue-800 bg-white px-1 rounded">link:target-page</code>).
                </p>
                <div className="bg-white p-3 rounded-lg border border-blue-200 font-mono text-[11px] text-slate-800 space-y-1">
                  <div><span className="text-blue-700 font-bold">$ local-search tags link:chargeback-doc</span></div>
                  <div className="text-slate-500">payments/refund.md → chargeback.md</div>
                  <div className="text-slate-500">Indexed in graph &amp; FTS5 text tables</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
