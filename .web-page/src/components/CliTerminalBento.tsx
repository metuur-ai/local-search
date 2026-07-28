import React, { useState } from 'react';
import { Terminal, Copy, Check, Play, RefreshCw } from 'lucide-react';

interface CliTerminalBentoProps {
  onRunQueryFromCli?: (query: string) => void;
}

export const CliTerminalBento: React.FC<CliTerminalBentoProps> = ({
  onRunQueryFromCli,
}) => {
  const [inputCmd, setInputCmd] = useState('local-search search "refund" --repos product-specs');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<
    { command: string; output: string; time: string }[]
  >([
    {
      command: 'local-search repo list',
      output: `NAME            ADDED  LAST SCAN  PATH
product-specs   2h     12m        /Users/you/work/product-specs
platform-docs   1d     1h         /Users/you/work/platform-docs
billing-service 3d     2h         /Users/you/work/billing-service
team-os         5d     1d         /Users/you/work/team-os`,
      time: '05:52:10',
    },
    {
      command: 'local-search search "refund"',
      output: `[source=fts · rank=bm25 · repos=4 (3 with graphs)]

Specs (3):
  [product-specs · FTS] payments/refund.md
    Refund Flow & Policy  (billing, payments, @spec:r-1.3)  .md
  [billing-service · FTS] integrations/stripe.md
    Stripe Integration Spec  (billing, stripe, webhooks)  .md
  [billing-service · FTS] engine/refund-processor.md
    Refund Processing Engine  (billing, payouts, ledger)  .md`,
      time: '05:53:01',
    },
  ]);

  const presetCmds = [
    'local-search search "refund" --semantic',
    'local-search graph explain capability://payments/refund',
    'local-search tags spec:r-1.3',
    'local-search read refund',
    'local-search scope show',
  ];

  const handleExecute = (cmdToRun?: string) => {
    const cmd = cmdToRun || inputCmd;
    if (!cmd.trim()) return;

    let outputStr = '';
    const now = new Date().toLocaleTimeString([], { hour12: false });

    if (cmd.includes('search')) {
      outputStr = `[source=fts · rank=bm25 · repos=4 (3 with graphs)]\n\nSpecs (3):\n  [product-specs · FTS] payments/refund.md\n    Refund Flow & Policy  (billing, payments, @spec:r-1.3)  .md\n  [billing-service · FTS] integrations/stripe.md\n    Stripe Integration Spec  (billing, stripe, webhooks)  .md`;
      if (onRunQueryFromCli) {
        onRunQueryFromCli('refund');
      }
    } else if (cmd.includes('explain')) {
      outputStr = `capability://payments/refund  [capability]\n  title:   Refund Flow & Policy\n  defined: product-specs:payments/refund.md\n\noutgoing:\n  depends_on:\n    -> component://auth-api (platform-docs:services/auth-api.md)\n    -> component://stripe-integration (billing-service:integrations/stripe.md)`;
    } else if (cmd.includes('tags')) {
      outputStr = `TAGS (8):\n  spec:r-1.3 (3 specs)\n  billing (5 specs)\n  payments (4 specs)\n  auth (2 specs)`;
    } else if (cmd.includes('read')) {
      outputStr = `--- \nid: capability://payments/refund\ntags: billing, payments, customer-support\n---\n# Refund Flow & Policy\nWhen a customer requests a refund within 30 days...`;
    } else if (cmd.includes('scope')) {
      outputStr = `Scope:   product-specs, platform-docs, billing-service\nSource:  /Users/you/work/.local-search.toml\nWeights: specs=1.00 graphify=0.70 codegraph=0.80`;
    } else {
      outputStr = `Done. Command executed successfully.`;
    }

    setHistory((prev) => [...prev, { command: cmd, output: outputStr, time: now }]);
    setInputCmd('');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(inputCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 rounded-2xl p-5 text-white flex flex-col justify-between shadow-md h-full relative font-mono text-xs overflow-hidden">
      {/* Terminal Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          </div>
          <span className="font-bold text-slate-300 ml-2 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-blue-400" />
            local-search CLI Simulator
          </span>
        </div>

        <button
          onClick={handleCopy}
          className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-[11px]"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* Preset Command Shortcuts */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-none shrink-0 text-[10px]">
        <span className="text-slate-500 font-bold shrink-0">CLI Quick Presets:</span>
        {presetCmds.map((preset, idx) => (
          <button
            key={idx}
            onClick={() => {
              setInputCmd(preset);
              handleExecute(preset);
            }}
            className="px-2 py-0.5 bg-slate-800 hover:bg-blue-900/60 hover:text-blue-200 border border-slate-700/80 rounded text-slate-300 transition-all shrink-0 whitespace-nowrap"
          >
            {preset}
          </button>
        ))}
      </div>

      {/* Output Console History */}
      <div className="flex-1 overflow-y-auto space-y-3 bg-slate-950 p-3 rounded-xl border border-slate-800/80 text-[11px] mb-3 min-h-[160px] max-h-[240px]">
        {history.map((item, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex items-center justify-between text-blue-400">
              <span className="font-bold">$ {item.command}</span>
              <span className="text-[10px] text-slate-500">{item.time}</span>
            </div>
            <pre className="text-slate-300 whitespace-pre-wrap font-mono leading-relaxed pl-2 border-l border-slate-800">
              {item.output}
            </pre>
          </div>
        ))}
      </div>

      {/* Terminal Command Input */}
      <div className="flex gap-2 shrink-0">
        <div className="relative flex-1">
          <span className="absolute left-3 top-2.5 text-blue-400 font-bold">$</span>
          <input
            type="text"
            value={inputCmd}
            onChange={(e) => setInputCmd(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
            placeholder="Type local-search command..."
            className="w-full pl-7 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-blue-500"
          />
        </div>
        <button
          onClick={() => handleExecute()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1 transition-all shrink-0"
        >
          <Play className="w-3.5 h-3.5" />
          <span>Run</span>
        </button>
      </div>
    </div>
  );
};
