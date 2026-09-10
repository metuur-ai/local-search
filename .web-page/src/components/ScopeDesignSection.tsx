import React, { useState } from 'react';
import {
  Target,
  FolderTree,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Terminal,
  FileCode,
  Lightbulb,
  ArrowRight,
  Blocks,
} from 'lucide-react';

/**
 * "Search Scope" — the design guidance behind `repositories:`.
 *
 * The Config section documents the file; this one answers the question that
 * comes before it: which repos belong in the list, and when one body of
 * documentation should be registered as several indexes instead of one.
 *
 * Mirrors user-guide/explanation/designing-your-search-scope.md — keep the two
 * in step when either changes.
 */

const KB_TREE = `~/work/knowledge-base/          # one git repo, one folder on disk
├── .git/
├── README.md                   # not indexed - no repo registered at the root
├── current-reality/
│   ├── payments.md
│   ├── identity.md
│   └── integrations/
│       └── stripe.md
├── components/
│   ├── payments-service.md
│   └── ledger-service.md
├── work-in-progress/
│   ├── prd-instant-payouts.md
│   └── rfc-ledger-rewrite.md
├── research/
│   └── payment-providers-comparison.md
└── scratchpad/
    └── 2026-09-02-notes.md`;

const KB_REGISTER = `cd ~/work/knowledge-base

local-search repo add ./current-reality    platform-current-reality
local-search repo add ./components         platform-components
local-search repo add ./work-in-progress   platform-work-in-progress
local-search repo add ./research           platform-research
local-search repo add ./scratchpad         platform-scratchpad`;

const KB_LIST = `$ local-search repo list
NAME                        ADDED  LAST SCAN  COMMIT   PATH
platform-current-reality    2m     2m         a1b2c3d  .../knowledge-base/current-reality
platform-components         2m     2m         a1b2c3d  .../knowledge-base/components
platform-work-in-progress   1m     1m         a1b2c3d  .../knowledge-base/work-in-progress
platform-research           1m     1m         a1b2c3d  .../knowledge-base/research
platform-scratchpad         1m     1m         a1b2c3d  .../knowledge-base/scratchpad`;

const CONFIG_SERVICE = `# ~/work/payments-service/.agents/local-search-config.yaml
repositories:
  - payments-service
  - platform-current-reality
  - platform-components`;

const CONFIG_ROADMAP = `# ~/work/roadmap/.agents/local-search-config.yaml
repositories:
  - platform-current-reality
  - platform-work-in-progress`;

const ISOLATION_PROOF = `$ local-search find "instant payouts" --scope platform-current-reality
No results.

$ local-search find "instant payouts" --scope platform-work-in-progress
work-in-progress/prd-instant-payouts.md   PRD: Instant Payouts

$ local-search find "instant payouts" --scope platform-research
research/payment-providers-comparison.md  Payment provider comparison`;

const FINER_SPLIT = `local-search repo remove platform-components   # drop the coarse index first

local-search repo add ./components/payments  platform-components-payments
local-search repo add ./components/identity  platform-components-identity
local-search repo add ./components/ledger    platform-components-ledger`;

const INDEXES = [
  {
    name: 'platform-current-reality',
    tone: 'accent',
    what: 'The operating truth: how the platform works today, what is live in production, active processes, current decisions, existing integrations.',
    ask: 'How do payments work today? Search only platform-current-reality.',
  },
  {
    name: 'platform-components',
    tone: 'info',
    what: 'Per-component detail: responsibilities, interfaces, inputs and outputs, dependencies, events produced and consumed, persistence, internal flows.',
    ask: 'Explain how the components participate in payment processing.',
  },
  {
    name: 'platform-work-in-progress',
    tone: 'warn',
    what: 'What is not reality yet: PRDs, proposals, product intent, designs under evaluation, changes in flight, undecided questions.',
    ask: 'What changes are planned for payments?',
  },
  {
    name: 'platform-research',
    tone: 'warn',
    what: 'Evaluations, comparisons, proofs of concept, external references, alternatives nobody has approved.',
    ask: 'What providers have we compared?',
  },
  {
    name: 'platform-scratchpad',
    tone: 'danger',
    what: 'Unprocessed notes that have not been validated or promoted. Treat any hit as preliminary, never as a source of truth.',
    ask: 'Name it explicitly, or leave it out.',
  },
] as const;

const TONE_CLASS: Record<string, { box: string; ink: string }> = {
  accent: { box: 'bg-accent-soft border-accent/25', ink: 'text-accent-ink' },
  info: { box: 'bg-info-soft border-info/25', ink: 'text-info-ink' },
  warn: { box: 'bg-warn-soft border-warn/25', ink: 'text-warn-ink' },
  danger: { box: 'bg-danger-soft border-danger/25', ink: 'text-danger-ink' },
};

const TIPS = [
  {
    title: 'Split on meaning, not size',
    body: 'Authority is the signal, not volume. Before splitting, ask: would a hit from here mislead someone who asked about the other? If yes, split.',
  },
  {
    title: 'Register subdirectories, not the parent',
    body: 'Registered repos may nest, but registering both the root and its children indexes every file twice - and the duplicates surface in the scopes you narrowed to avoid them.',
  },
  {
    title: 'Excluding children of a parent',
    body: 'If you must register a parent, drop the noisy folders with --skip-directory scratchpad --skip-directory research. It takes a folder name, matched at any depth - never a path.',
  },
  {
    title: 'Encode authority in the name',
    body: 'The name is what you type into a scope and what appears beside every result. platform-current-reality beats docs; platform-scratchpad warns you before you read the hit.',
  },
  {
    title: 'Smallest default that stays productive',
    body: 'Different projects want different combinations of the same indexes - that is the point of splitting. A service repo wants current reality; a roadmap wants work-in-progress.',
  },
  {
    title: 'Keep risky indexes out of every default',
    body: 'scratchpad and research earn a place in a scope only when someone explicitly asks for exploratory material. Name them in the prompt instead.',
  },
  {
    title: 'Registered graphs join a scope too',
    body: 'A graph: prefix in repositories: points at a registered external graph rather than a repo, so one scope can mix document indexes and graph sources.',
  },
  {
    title: 'Rescan per index',
    body: 'Each repo rescans independently, so a churning work-in-progress directory never forces a rebuild of stable current-reality docs. Reserve scan all for real full rebuilds.',
  },
  {
    title: 'Promotion is a file move',
    body: 'Moving a shipped proposal from work-in-progress/ to current-reality/ moves it between indexes on the next scan. No re-registration, no config edit.',
  },
];

const PRINCIPLES = [
  ['Configure the normal context', 'Every project declares the repos it actually needs during ordinary work.'],
  ['Keep the default small', 'Only repos providing recurring, directly relevant context belong in the default list.'],
  ['Add sources on demand', 'When a task needs more, name the repo in the prompt or on the command line.'],
  ['Separate reality, intent, and research', 'Shipped documentation, future proposals, and experiments should not share a scope without a reason.'],
  ['Split by usage, not folder layout', 'The boundary that matters is logical - what the content is and how it will be searched.'],
  ['Name indexes descriptively', 'The name should convey both content and authority at a glance.'],
  ['Ask for traceability', 'Have the agent report which documents it used and which repos they came from.'],
];

const Code: React.FC<{ children: string; label?: string }> = ({ children, label }) => (
  <div className="space-y-1.5">
    {label && <span className="text-xs font-mono font-bold text-ink-2">{label}</span>}
    <pre className="bg-panel-inset text-syntax-string p-4 rounded-card font-mono text-[11px] leading-relaxed overflow-x-auto border border-panel-edge">
      {children}
    </pre>
  </div>
);

export const ScopeDesignSection: React.FC = () => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  const focusRing =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

  const steps: { id: 1 | 2 | 3 | 4 | 5; label: string }[] = [
    { id: 1, label: '1 · The directory' },
    { id: 2, label: '2 · Register each part' },
    { id: 3, label: '3 · Confirm the split' },
    { id: 4, label: '4 · Scope per project' },
    { id: 5, label: '5 · See the isolation' },
  ];

  return (
    <div className="app-container space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-panel text-panel-ink rounded-card p-6 shadow-2xs border border-panel-edge relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(var(--color-accent)_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1 bg-panel-raised text-syntax-string rounded-input">
                <Target className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-syntax-string">
                Retrieval Strategy
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">
              Designing your search scope
            </h2>
            <p className="text-sm text-panel-ink-2 max-w-2xl">
              Semantic search decides which content is relevant. <strong>Scope decides the universe
              that search happens in.</strong> This is how to draw that boundary once you have more
              than a couple of indexed sources.
            </p>
          </div>
          <div className="bg-panel-inset border border-panel-edge p-2.5 rounded-input font-mono text-[11px] text-syntax-string shrink-0">
            <span className="text-panel-ink-3">Declared in:</span> .agents/local-search-config.yaml
          </div>
        </div>
      </div>

      {/* The problem */}
      <div className="bg-white border border-rule rounded-card p-6 space-y-4 shadow-2xs">
        <div className="flex items-center gap-2 border-b border-rule pb-3">
          <AlertTriangle className="w-5 h-5 text-warn" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-ink text-base">The problem: too many sources</h3>
            <p className="text-sm text-ink-3">
              With one or two repos, &quot;search everything&quot; is fine. At twenty or thirty
              indexed sources it stops being fine - and the problem is not speed, it is contextual
              accuracy.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-danger-soft rounded-card border border-danger/25 space-y-2">
            <h4 className="font-bold text-danger-ink text-sm">What a global search mixes</h4>
            <ul className="text-[13px] text-danger-ink leading-relaxed space-y-1 list-disc list-inside">
              <li>Current information with historical documentation</li>
              <li>Shipped specs with future proposals</li>
              <li>Docs belonging to different components</li>
              <li>Throwaway research with ratified decisions</li>
              <li>Content from unrelated platforms or domains</li>
            </ul>
          </div>

          <div className="p-4 bg-paper-2 rounded-card border border-rule space-y-2">
            <h4 className="font-bold text-ink text-sm">Why it is not a ranking problem</h4>
            <p className="text-[13px] text-ink-2 leading-relaxed">
              A question about how payments work today can pull back the current implementation, a
              PRD for a future one, a write-up of an alternative provider, and notes from an
              abandoned spike. Every one of those <em>is about payments</em> and scores well on
              similarity. None describe the same reality, and they do not carry the same authority.
            </p>
            <div className="bg-white p-2.5 rounded-input border border-rule text-[12px] text-ink-2 font-mono">
              1. The repo decides <strong className="text-ink">where</strong> to look
              <br />
              2. Semantic search decides <strong className="text-ink">what</strong> is relevant there
              <br />
              3. The agent opens those sources and answers from them
            </div>
          </div>
        </div>
      </div>

      {/* Default scope + on demand */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-rule rounded-card p-6 space-y-4 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-rule pb-3">
            <FileCode className="w-5 h-5 text-accent" aria-hidden="true" />
            <div>
              <h3 className="font-semibold text-ink text-base">The default scope lives in the project</h3>
              <p className="text-sm text-ink-3">
                Write it once and no prompt has to repeat it. Every session opened in the project
                starts with the same context.
              </p>
            </div>
          </div>

          <Code label="<project>/.agents/local-search-config.yaml">{`repositories:
  - payments-service
  - platform-current-reality`}</Code>

          <Code label="Two phrasings, same list">{`local-search scope set payments-service,platform-current-reality
local-search init  --set payments-service,platform-current-reality`}</Code>
        </div>

        <div className="bg-white border border-rule rounded-card p-6 space-y-4 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-rule pb-3">
            <ArrowRight className="w-5 h-5 text-info" aria-hidden="true" />
            <div>
              <h3 className="font-semibold text-ink text-base">Extending it for one task</h3>
              <p className="text-sm text-ink-3">
                The default is your normal context, not a wall. Name the extra source for that task
                only.
              </p>
            </div>
          </div>

          <div className="p-4 bg-info-soft rounded-card border border-info/25 text-[13px] text-info-ink leading-relaxed italic">
            &quot;Explain the relationship between Component A and Component B. Use the project&apos;s
            Local Search scope and also include the <span className="font-mono not-italic font-bold">component-b</span> repo.&quot;
          </div>

          <Code label="Or from the CLI">{`local-search find "retry" \\
  --scope payments-service,platform-current-reality,component-b

local-search search "retry" --repos payments-service,component-b`}</Code>

          <p className="text-[13px] text-ink-3 leading-relaxed">
            This is why you never need to pre-register every conceivable repo. The everyday context
            stays small; the occasional source shows up only when the question calls for it.
          </p>
        </div>
      </div>

      {/* One index per directory vs per context */}
      <div className="bg-white border border-rule rounded-card p-6 space-y-4 shadow-2xs">
        <div className="flex items-center gap-2 border-b border-rule pb-3">
          <Layers className="w-5 h-5 text-ink-2" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-ink text-base">
              One index per directory, or one per context?
            </h3>
            <p className="text-sm text-ink-3">
              Indexing a whole directory as a single source is right when the content is small, or
              when all of it belongs to the same context. It stops being right when one directory
              holds several <em>kinds</em> of knowledge.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {INDEXES.map((ix) => {
            const tone = TONE_CLASS[ix.tone];
            return (
              <div key={ix.name} className={`p-4 rounded-card border space-y-2 ${tone.box}`}>
                <h4 className={`font-mono font-bold text-[12px] break-words ${tone.ink}`}>
                  {ix.name}
                </h4>
                <p className={`text-[12px] leading-relaxed ${tone.ink}`}>{ix.what}</p>
                <div className="bg-white/70 p-2 rounded-input text-[11px] text-ink-2 italic">
                  {ix.ask}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-panel-inset border border-panel-edge rounded-input p-3 font-mono text-[12px] text-syntax-string">
          Local Search can index everything. It should not always search everything.
        </div>
      </div>

      {/* Granular setup, end to end */}
      <div className="bg-white border border-rule rounded-card p-6 space-y-5 shadow-2xs">
        <div className="flex items-start justify-between gap-4 border-b border-rule pb-3">
          <div className="flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-accent" aria-hidden="true" />
            <div>
              <h3 className="font-semibold text-ink text-base">A granular setup, end to end</h3>
              <p className="text-sm text-ink-3">
                Five logical indexes carved out of <strong>one physical directory</strong> - a single
                git repository at <code className="font-mono text-ink-2">~/work/knowledge-base</code>.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-paper-3 text-ink-2 px-2.5 py-1 rounded-input border border-rule font-bold shrink-0">
            1 repo · 5 indexes
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {steps.map((s) => (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              className={`px-3 py-2 rounded-input text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${focusRing} ${
                step === s.id
                  ? 'bg-accent text-accent-contrast'
                  : 'bg-paper-2 text-ink-2 hover:bg-paper-3 hover:text-ink border border-rule'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3 animate-fadeIn">
            <Code>{KB_TREE}</Code>
            <p className="text-[13px] text-ink-3 leading-relaxed">
              Each top-level folder serves a different purpose and carries a different level of
              authority. That, not size, is what makes them five sources instead of one.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 animate-fadeIn">
            <Code label="Register each subdirectory as its own index">{KB_REGISTER}</Code>
            <div className="p-4 bg-danger-soft rounded-card border border-danger/25 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 text-danger-ink shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-[13px] text-danger-ink leading-relaxed">
                There is deliberately <strong>no <code className="font-mono">local-search repo add .</code></strong> here.
                Registering the root as well would index every file a second time, and those
                duplicates would surface in scopes you narrowed specifically to exclude them.
              </p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 animate-fadeIn">
            <Code>{KB_LIST}</Code>
            <p className="text-[13px] text-ink-3 leading-relaxed">
              Same <code className="font-mono text-ink-2">COMMIT</code> on every row - they are five
              views of one git repository.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Code label="Building the service: own docs + today + contracts">{CONFIG_SERVICE}</Code>
              <Code label="Planning: today set against what is proposed">{CONFIG_ROADMAP}</Code>
            </div>
            <p className="text-[13px] text-ink-3 leading-relaxed">
              Different projects slice the same indexes differently. The service config carries no
              proposals and no research; the roadmap config carries nothing about a specific service.
            </p>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3 animate-fadeIn">
            <Code label="The same query against three scopes">{ISOLATION_PROOF}</Code>
            <div className="p-4 bg-accent-soft rounded-card border border-accent/25 flex gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-accent-ink shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-[13px] text-accent-ink leading-relaxed">
                That empty first result is <strong>the feature, not a failure</strong>. Instant
                payouts do not exist yet, and the current-reality index is the one index that will
                never claim otherwise.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Going finer */}
      <div className="bg-white border border-rule rounded-card p-6 space-y-4 shadow-2xs">
        <div className="flex items-center gap-2 border-b border-rule pb-3">
          <Blocks className="w-5 h-5 text-info" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-ink text-base">Going finer inside one section</h3>
            <p className="text-sm text-ink-3">
              The pattern nests. If <code className="font-mono text-ink-2">components/</code> grows
              past the point where one index is useful, split it by domain - still inside the same
              directory.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Code label="knowledge-base/components/ → three domain indexes">{FINER_SPLIT}</Code>
          <div className="space-y-3">
            <Code label="A project then scopes to the domains it touches">{`repositories:
  - payments-service
  - platform-current-reality
  - platform-components-payments
  - platform-components-ledger`}</Code>
            <div className="p-3 bg-warn-soft rounded-card border border-warn/25 text-[13px] text-warn-ink leading-relaxed">
              Remove the coarse index <strong>before</strong> adding the fine ones. Leaving both
              registered is the double-indexing trap again, one level down.
            </div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-white border border-rule rounded-card p-6 space-y-4 shadow-2xs">
        <div className="flex items-center gap-2 border-b border-rule pb-3">
          <Lightbulb className="w-5 h-5 text-warn" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-ink text-base">
              Tips: setting up multiple indexes to isolate context
            </h3>
            <p className="text-sm text-ink-3">
              Splitting is cheap, but a handful of choices are worth getting right the first time.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {TIPS.map((tip) => (
            <div key={tip.title} className="p-4 bg-paper-2 rounded-card border border-rule space-y-1.5">
              <h4 className="font-bold text-ink text-sm">{tip.title}</h4>
              <p className="text-[13px] text-ink-2 leading-relaxed">{tip.body}</p>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-mono font-bold text-ink-2">
            Verify the split before you rely on it
          </span>
          <pre className="bg-panel-inset text-syntax-string p-4 rounded-card font-mono text-[11px] leading-relaxed overflow-x-auto border border-panel-edge">
{`local-search repo list                    # all indexes present, sensible LAST SCAN
local-search scope show                   # the project resolves to what you expect
local-search find "payments" --scope platform-work-in-progress`}
          </pre>
          <p className="text-[13px] text-ink-3 leading-relaxed">
            That last one is the real check: a term you know appears in several indexes, scoped to
            one, should come back with hits from only that index.
          </p>
        </div>
      </div>

      {/* Principles */}
      <div className="bg-white border border-rule rounded-card p-6 space-y-4 shadow-2xs">
        <div className="flex items-center gap-2 border-b border-rule pb-3">
          <CheckCircle2 className="w-5 h-5 text-accent" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-ink text-base">Principles</h3>
            <p className="text-sm text-ink-3">
              The goal is not maximum indexes. It is preventing a search from returning similar
              documents that belong to a different reality.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PRINCIPLES.map(([title, body], i) => (
            <div key={title} className="flex gap-3 p-3 bg-paper-2 rounded-card border border-rule">
              <span className="w-6 h-6 shrink-0 rounded-input bg-accent text-accent-contrast font-mono text-[11px] font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div>
                <h4 className="font-bold text-ink text-sm">{title}</h4>
                <p className="text-[13px] text-ink-2 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Outcome */}
      <div className="bg-panel text-panel-ink rounded-card p-6 shadow-2xs border border-panel-edge space-y-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-syntax-string" aria-hidden="true" />
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-syntax-string">
            Outcome
          </span>
        </div>
        <p className="text-sm text-panel-ink-2 leading-relaxed max-w-3xl">
          Default scope plus on-demand additions turns Local Search into a per-project context
          layer: fewer irrelevant results, current documentation that never blurs into future
          proposals, distinct areas of knowledge kept distinct, work that spans related components,
          and answers you can trace back to real documents - from a handful of repos to dozens.
        </p>
        <p className="text-sm text-panel-ink border-l-2 border-accent pl-3 max-w-3xl">
          Each project defines its normal context. Each prompt can extend it when the task requires.
          Local Search searches only inside that scope, and hands the agent the sources it needs to
          understand the problem.
        </p>
      </div>
    </div>
  );
};
