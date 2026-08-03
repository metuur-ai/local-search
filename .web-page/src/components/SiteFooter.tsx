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
  return (
    <footer className="foot-mast shrink-0">
      <p className="foot-mast__wordmark">local-search</p>
      <p className="foot-mast__tagline hidden sm:block">
        Search your specs where they already live.
      </p>

      <div className="foot-mast__links">
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub repository"
          className="foot-mast__link"
        >
          <Github className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Source</span>
        </a>

        <a
          href={X_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Author on X"
          className="foot-mast__link"
        >
          <XMark className="w-3 h-3" />
          <span className="hidden sm:inline">@javierhbr</span>
        </a>

        <a
          href={COFFEE_URL}
          target="_blank"
          rel="noreferrer"
          className="foot-mast__link"
        >
          <Coffee className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Buy me a coffee</span>
        </a>
      </div>

      <p className="foot-mast__licence">© 2026 local-search v{VERSION}</p>
    </footer>
  );
};
