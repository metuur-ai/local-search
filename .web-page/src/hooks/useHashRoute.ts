import { useCallback, useEffect, useState } from 'react';
import { ActiveTab } from '../types';

/**
 * Hash-based routing for the section tabs.
 *
 * The site is published to GitHub Pages, which serves static files with no SPA
 * fallback and from a project subpath. A real path route (`/graph`) would 404 on
 * refresh and on any shared deep link, so the route lives in the hash instead:
 * it survives reload, works under any base path, and needs no server config.
 */

const TABS: ActiveTab[] = [
  'overview',
  'search',
  'indexing',
  'cli',
  'aiskill',
  'graph',
  'workflows',
  'config',
];

export const DEFAULT_TAB: ActiveTab = 'overview';

export const tabHref = (tab: ActiveTab): string => `#/${tab}`;

const parseHash = (hash: string): ActiveTab | null => {
  const value = hash.replace(/^#\/?/, '');
  return (TABS as string[]).includes(value) ? (value as ActiveTab) : null;
};

export function useHashRoute(): [ActiveTab, (tab: ActiveTab) => void] {
  const [tab, setTab] = useState<ActiveTab>(
    () => parseHash(window.location.hash) ?? DEFAULT_TAB,
  );

  useEffect(() => {
    const syncFromHash = () => {
      const parsed = parseHash(window.location.hash);

      if (parsed === null) {
        // An absent or unrecognised route falls back to the default, and the
        // address bar is corrected to match so the two never disagree. The
        // rewrite replaces rather than pushes, so the first Back press leaves
        // the site instead of spending itself tidying up the URL. replaceState
        // does not emit hashchange, so this cannot loop.
        window.history.replaceState(null, '', tabHref(DEFAULT_TAB));
        setTab(DEFAULT_TAB);
        return;
      }

      setTab(parsed);
    };

    // Runs on mount for deep links and reloads, then on every hash change,
    // including the ones Back and Forward produce.
    syncFromHash();

    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  // The URL is the single source of truth: navigating only writes the hash, and
  // the resulting hashchange is what moves the state. Back and forward travel
  // the same path, so they cannot drift apart.
  const navigate = useCallback((next: ActiveTab) => {
    if (parseHash(window.location.hash) === next) return;
    window.location.hash = tabHref(next);
  }, []);

  return [tab, navigate];
}
