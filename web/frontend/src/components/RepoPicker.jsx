// Presentational repo picker fed RepoRow[] from GET /api/repos (data via props,
// no fetch). Tolerant of missing fields on each row.
//
// A flat wall of pills stops scaling past a handful of repos, so once there are
// more than SEARCH_THRESHOLD the picker becomes a searchable multi-select: a
// filter box, a pinned row of selected tokens, and a capped-height scrolling
// list sorted so the repos worth searching float to the top. Below the
// threshold it degrades to a plain list.

import { useState } from 'preact/hooks';
import './RepoPicker.css';

// Above this repo count, show the filter box + count/actions footer.
const SEARCH_THRESHOLD = 6;
// In AI mode each selected repo is a separate model-grounded pass (the CLI
// scopes one repo per call), so a wide scope is slow/expensive — warn past this.
const AI_SCOPE_WARN = 8;

// Pure predicate: at least one repo must be selected to submit (R-1.5).
export function canSubmit(selectedNames) {
  return Array.isArray(selectedNames) && selectedNames.length >= 1;
}

const hasGraphOf = (r) => (r?.graph_node_count || 0) > 0;
const specCountOf = (r) => r?.spec_count || 0;

// List order: selected first (easy to unpick), then graph-backed, then
// spec-rich, then alphabetical — surfacing the highest-signal repos without
// scrolling.
function compareRepos(a, b, selectedSet) {
  const sa = selectedSet.has(a.name);
  const sb = selectedSet.has(b.name);
  if (sa !== sb) return sa ? -1 : 1;
  const ga = hasGraphOf(a);
  const gb = hasGraphOf(b);
  if (ga !== gb) return ga ? -1 : 1;
  const bySpec = specCountOf(b) - specCountOf(a);
  if (bySpec !== 0) return bySpec;
  return String(a.name).localeCompare(String(b.name));
}

export function RepoPicker({
  repos = [],
  error = null,
  selected = [],
  onToggle,
  onSelectMatching,
  onClear,
  aiMode = false,
}) {
  const [filter, setFilter] = useState('');

  // An error must never be silently shown as an empty success state (R-1.6).
  if (error) {
    const message = typeof error === 'string' ? error : error.message;
    return (
      <section class="repo-picker" data-testid="repo-picker">
        <p class="repo-picker-error" data-testid="repo-picker-error">
          {message}
        </p>
      </section>
    );
  }

  if (repos.length === 0) {
    return (
      <section class="repo-picker" data-testid="repo-picker">
        <p class="repo-picker-empty" data-testid="repo-picker-empty">
          No repositories available.
        </p>
      </section>
    );
  }

  const searchable = repos.length > SEARCH_THRESHOLD;
  const selectedSet = new Set(selected);
  const q = filter.trim().toLowerCase();

  // Filter by name/path, then order. Small lists (tens of repos) don't warrant
  // memoization — this recomputes cheaply on each render.
  const visible = repos
    .filter(
      (r) =>
        !q ||
        String(r.name).toLowerCase().includes(q) ||
        String(r.path || '').toLowerCase().includes(q)
    )
    .sort((a, b) => compareRepos(a, b, selectedSet));

  // Matches not yet selected — the target of the filter-aware "select matching"
  // action (which replaces a blind, footgun "select all").
  const unselectedMatches = visible.filter((r) => !selectedSet.has(r.name));

  // Enter in the filter adds the top unselected match (e.g. filter "os" ↵).
  const onFilterKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (unselectedMatches.length > 0) onToggle(unselectedMatches[0].name);
  };

  const overScope = aiMode && selected.length > AI_SCOPE_WARN;

  return (
    <section class="repo-picker" data-testid="repo-picker">
      {searchable && (
        <div class="repo-picker-search">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input
            type="text"
            class="repo-picker-search-input"
            placeholder="Filter repositories…"
            value={filter}
            onInput={(e) => setFilter(e.target.value)}
            onKeyDown={onFilterKeyDown}
            data-testid="repo-filter"
            aria-label="Filter repositories"
          />
          {filter && (
            <button
              type="button"
              class="repo-picker-search-clear"
              title="Clear filter"
              aria-label="Clear filter"
              onClick={() => setFilter('')}
            >
              <i class="fa-solid fa-circle-xmark" />
            </button>
          )}
        </div>
      )}

      {selected.length > 0 && (
        <div class="repo-picker-tokens" data-testid="repo-tokens">
          {selected.map((name) => (
            <button
              type="button"
              class="repo-token"
              key={name}
              data-testid={`repo-token-${name}`}
              title={`Remove ${name}`}
              onClick={() => onToggle(name)}
            >
              <span class="repo-token-name">{name}</span>
              <i class="fa-solid fa-xmark repo-token-remove" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      <ul class="repo-picker-list" role="listbox" aria-multiselectable="true">
        {visible.map((repo) => {
          const isSelected = selectedSet.has(repo.name);
          const specCount = specCountOf(repo);
          const hasGraph = hasGraphOf(repo);
          return (
            <li
              class={isSelected ? 'repo-entry selected' : 'repo-entry'}
              data-testid={`repo-entry-${repo.name}`}
              title={repo.path || repo.name}
              role="option"
              aria-selected={isSelected ? 'true' : 'false'}
              onClick={() => onToggle(repo.name)}
              key={repo.name}
            >
              <span class="repo-entry-check" aria-hidden="true">
                <i class={`fa-solid ${isSelected ? 'fa-square-check' : 'fa-square'}`} />
              </span>
              <span class="repo-entry-name">{repo.name}</span>
              <span class="repo-entry-badges">
                <span class="repo-entry-spec-count" data-testid={`repo-spec-count-${repo.name}`}>
                  {specCount} specs
                </span>
                {hasGraph && (
                  <span class="repo-entry-graph" data-testid={`repo-graph-${repo.name}`}>
                    has graph
                  </span>
                )}
              </span>
            </li>
          );
        })}
        {searchable && visible.length === 0 && (
          <li class="repo-picker-nomatch" data-testid="repo-picker-nomatch">
            No repositories match “{filter}”.
          </li>
        )}
      </ul>

      {overScope && (
        <p class="repo-picker-warn" data-testid="repo-scope-warn">
          <i class="fa-solid fa-triangle-exclamation" /> Searching {selected.length} repos
          with AI runs {selected.length} passes — consider Graph-only mode or a
          narrower scope.
        </p>
      )}

      {searchable && (
        <div class="repo-picker-foot">
          <span class="repo-picker-count">
            Showing <strong>{visible.length}</strong> of {repos.length}
          </span>
          <span class="repo-picker-actions">
            {unselectedMatches.length > 0 && onSelectMatching && (
              <button
                type="button"
                class="repo-picker-action"
                data-testid="repo-select-matching"
                onClick={() => onSelectMatching(unselectedMatches.map((r) => r.name))}
              >
                Select {unselectedMatches.length} {q ? 'matching' : 'all'}
              </button>
            )}
            {selected.length > 0 && onClear && (
              <button
                type="button"
                class="repo-picker-action"
                data-testid="repo-clear"
                onClick={onClear}
              >
                Clear
              </button>
            )}
          </span>
        </div>
      )}
    </section>
  );
}
