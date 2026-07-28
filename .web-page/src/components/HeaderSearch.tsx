import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft, X } from 'lucide-react';
import { tabHref } from '../hooks/useHashRoute';
import {
  CATEGORY_ORDER,
  CONTENT_DIRECTORY,
  DirectoryCategory,
  DirectoryEntry,
  searchDirectory,
} from '../data/contentDirectory';

/**
 * Search over this page's own content directory.
 *
 * With no query the panel is a directory: every entry, grouped by category, so
 * the field doubles as a table of contents for people who don't know what to
 * type. Typing switches it to a ranked list. Both render the same flat item
 * sequence, so one highlight index drives keyboard navigation in either mode.
 */

const CATEGORY_STYLES: Record<DirectoryCategory, string> = {
  Section: 'bg-blue-100 text-blue-700',
  Concept: 'bg-emerald-100 text-emerald-700',
  'CLI command': 'bg-slate-200 text-slate-700',
  'AI skill': 'bg-purple-100 text-purple-700',
  Config: 'bg-amber-100 text-amber-800',
  Workflow: 'bg-rose-100 text-rose-700',
};

interface Group {
  category: DirectoryCategory;
  entries: DirectoryEntry[];
}

export const HeaderSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();

  // Groups drive the rendering; `flat` is the same items in display order and
  // is what the highlight index points into.
  const groups = useMemo<Group[]>(() => {
    if (trimmed) {
      const entries = searchDirectory(trimmed).map((match) => match.entry);
      return entries.length ? [{ category: 'Section', entries }] : [];
    }

    return CATEGORY_ORDER.map((category) => ({
      category,
      entries: CONTENT_DIRECTORY.filter((entry) => entry.category === category),
    })).filter((group) => group.entries.length > 0);
  }, [trimmed]);

  const flat = useMemo(() => groups.flatMap((group) => group.entries), [groups]);
  const isSearching = trimmed.length > 0;

  useEffect(() => setHighlight(0), [trimmed]);

  const close = useCallback(() => {
    setOpen(false);
    setHighlight(0);
  }, []);

  const go = useCallback(
    (entry: DirectoryEntry) => {
      // Writing the hash is the whole navigation: useHashRoute listens for
      // hashchange, so this takes the same path as clicking a nav pill.
      window.location.hash = tabHref(entry.tab);
      setQuery('');
      close();
      inputRef.current?.blur();
    },
    [close],
  );

  // ⌘K / Ctrl-K from anywhere on the page, Escape to get back out.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close();
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, close]);

  // Keep the highlighted row inside the scroll box when arrowing past its edge.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-highlighted="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      close();
      inputRef.current?.blur();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (flat.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
        return (next + flat.length) % flat.length;
      });
      return;
    }

    if (event.key === 'Enter') {
      const entry = flat[highlight];
      if (entry) {
        event.preventDefault();
        go(entry);
      }
    }
  };

  let index = -1;

  return (
    <div ref={containerRef} className="relative w-36 sm:w-64 md:w-80 max-w-full">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="header-search-panel"
          aria-label="Search this site"
          placeholder="Search sections, commands, concepts…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          className="w-full pl-8 pr-14 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all [&::-webkit-search-cancel-button]:hidden"
        />

        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd className="hidden sm:block absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 bg-white border border-slate-200 rounded pointer-events-none">
            ⌘K
          </kbd>
        )}
      </div>

      {open && (
        <div
          id="header-search-panel"
          role="listbox"
          className="absolute right-0 mt-2 w-[min(28rem,calc(100vw-2rem))] bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden z-50 animate-fadeIn"
        >
          <div ref={listRef} className="max-h-[22rem] overflow-y-auto p-1.5">
            {flat.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-500">
                Nothing in the directory matches <span className="font-mono text-slate-700">{trimmed}</span>.
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.category} className="mb-1 last:mb-0">
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {isSearching ? `${flat.length} result${flat.length === 1 ? '' : 's'}` : group.category}
                  </div>

                  {group.entries.map((entry) => {
                    index += 1;
                    const isHighlighted = index === highlight;
                    const position = index;

                    return (
                      <a
                        key={entry.id}
                        href={tabHref(entry.tab)}
                        role="option"
                        aria-selected={isHighlighted}
                        data-highlighted={isHighlighted}
                        onMouseEnter={() => setHighlight(position)}
                        onClick={(event) => {
                          event.preventDefault();
                          go(entry);
                        }}
                        className={`flex items-start gap-2.5 px-2.5 py-1.5 rounded-xl cursor-pointer ${
                          isHighlighted ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {entry.title}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {entry.description}
                          </div>
                        </div>

                        {isSearching && (
                          <span
                            className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${CATEGORY_STYLES[entry.category]}`}
                          >
                            {entry.category}
                          </span>
                        )}

                        {isHighlighted && (
                          <CornerDownLeft className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                        )}
                      </a>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-100 px-3 py-1.5 flex items-center justify-between text-[10px] text-slate-400 font-mono bg-slate-50">
            <span>{isSearching ? 'Ranked by title, keyword, then description' : `${CONTENT_DIRECTORY.length} entries`}</span>
            <span className="hidden sm:inline">↑↓ navigate · ↵ open · esc close</span>
          </div>
        </div>
      )}
    </div>
  );
};
