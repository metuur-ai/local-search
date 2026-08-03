import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft, ArrowUp, ArrowDown, X } from 'lucide-react';
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

// Category is shown as its own label above each group (or as a chip while
// searching), so the chip doesn't need a colour per category on top of that.
const CATEGORY_CHIP = 'bg-paper-3 text-ink-2 border border-rule';

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

  // Referenced by aria-activedescendant so screen readers announce the
  // keyboard-highlighted option without moving DOM focus off the input.
  const activeOptionId = flat.length > 0 ? `header-search-option-${highlight}` : undefined;

  return (
    <div ref={containerRef} className="relative w-36 sm:w-64 md:w-80 max-w-full">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-ink-3 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="header-search-panel"
          aria-activedescendant={open ? activeOptionId : undefined}
          aria-label="Search this site"
          placeholder="Search sections, commands, concepts…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          className="w-full pl-8 pr-14 py-1.5 text-sm bg-paper-2 border border-rule rounded-input text-ink placeholder:text-ink-3 focus:outline-hidden focus:bg-white focus:border-accent focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 transition-all [&::-webkit-search-cancel-button]:hidden"
        />

        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd className="hidden sm:block absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-ink-3 bg-white border border-rule rounded-input pointer-events-none">
            ⌘K
          </kbd>
        )}
      </div>

      {open && (
        <div
          id="header-search-panel"
          role="listbox"
          className="absolute right-0 mt-2 w-[min(28rem,calc(100vw-2rem))] bg-white border border-rule rounded-card shadow-2xs overflow-hidden z-50 animate-fadeIn"
        >
          <div ref={listRef} className="max-h-[22rem] overflow-y-auto p-1.5">
            {flat.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-3">
                Nothing in the directory matches <span className="font-mono text-ink">{trimmed}</span>.
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.category} className="mb-1 last:mb-0">
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-3">
                    {isSearching ? `${flat.length} result${flat.length === 1 ? '' : 's'}` : group.category}
                  </div>

                  {group.entries.map((entry) => {
                    index += 1;
                    const isHighlighted = index === highlight;
                    const position = index;

                    return (
                      <a
                        key={entry.id}
                        id={`header-search-option-${position}`}
                        href={tabHref(entry.tab)}
                        role="option"
                        aria-selected={isHighlighted}
                        data-highlighted={isHighlighted}
                        onMouseEnter={() => setHighlight(position)}
                        onClick={(event) => {
                          event.preventDefault();
                          go(entry);
                        }}
                        className={`flex items-start gap-2.5 px-2.5 py-1.5 rounded-input cursor-pointer ${
                          isHighlighted ? 'bg-info-soft' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-ink truncate">
                            {entry.title}
                          </div>
                          <div className="text-sm text-ink-3 truncate">
                            {entry.description}
                          </div>
                        </div>

                        {isSearching && (
                          <span
                            className={`shrink-0 px-1.5 py-0.5 rounded-input text-[10px] font-mono font-bold ${CATEGORY_CHIP}`}
                          >
                            {entry.category}
                          </span>
                        )}

                        {/* Keyboard highlight is marked by the CornerDownLeft
                            glyph, not the background tint alone. */}
                        {isHighlighted && (
                          <CornerDownLeft className="w-3.5 h-3.5 text-info shrink-0 mt-0.5" aria-hidden="true" />
                        )}
                      </a>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-rule px-3 py-1.5 flex items-center justify-between text-[10px] text-ink-3 font-mono bg-paper-2">
            <span>{isSearching ? 'Ranked by title, keyword, then description' : `${CONTENT_DIRECTORY.length} entries`}</span>
            <span className="hidden sm:flex items-center gap-1">
              <ArrowUp className="w-3 h-3" aria-hidden="true" />
              <ArrowDown className="w-3 h-3" aria-hidden="true" />
              navigate · <CornerDownLeft className="w-3 h-3" aria-hidden="true" /> open · esc close
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
