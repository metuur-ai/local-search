import React from 'react';
import { Github, Coffee } from 'lucide-react';

/** Keep in step with `Version` in cli/main.go. */
const VERSION = '0.4.0';

const GITHUB_URL = 'https://github.com/metuur-ai/local-search';
const X_URL = 'https://x.com/javierhbr';
const COFFEE_URL = 'https://buymeacoffee.com/javierhbr';

/** lucide ships the old Twitter bird, not the X mark, so this one is inline. */
const XMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
  </svg>
);

/**
 * The app's bottom bar. Wraps to two rows on narrow screens rather than
 * clipping, so it has a minimum height rather than a fixed one.
 */
export const SiteFooter: React.FC = () => {
  const linkClass =
    'text-slate-400 hover:text-white transition-colors rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400';

  return (
    <footer className="min-h-10 bg-panel text-slate-400 px-4 sm:px-8 py-2 flex flex-wrap items-center justify-center sm:justify-between gap-x-5 gap-y-1 text-[11px] font-mono shrink-0 border-t border-panel-edge z-10">
      <p>
        © 2026 local-search v{VERSION} · made by{' '}
        <a
          href={X_URL}
          target="_blank"
          rel="noreferrer"
          className="text-slate-300 hover:text-white transition-colors"
        >
          @javierhbr
        </a>
      </p>

      <div className="flex items-center gap-4">
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="GitHub repository" className={linkClass}>
          <Github className="w-4 h-4" />
        </a>

        <a href={X_URL} target="_blank" rel="noreferrer" aria-label="Author on X" className={linkClass}>
          <XMark className="w-3.5 h-3.5" />
        </a>

        <a
          href={COFFEE_URL}
          target="_blank"
          rel="noreferrer"
          className={`${linkClass} flex items-center gap-1.5`}
        >
          <Coffee className="w-4 h-4" />
          <span>Buy me a coffee</span>
        </a>
      </div>
    </footer>
  );
};
