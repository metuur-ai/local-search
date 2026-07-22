// Presentational repo picker fed RepoRow[] from GET /api/repos (data via props,
// no fetch). Tolerant of missing fields on each row.

import './RepoPicker.css';

// Pure predicate: at least one repo must be selected to submit (R-1.5).
export function canSubmit(selectedNames) {
  return Array.isArray(selectedNames) && selectedNames.length >= 1;
}

export function RepoPicker({ repos = [], error = null, selected = [], onToggle }) {
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

  return (
    <section class="repo-picker" data-testid="repo-picker">
      <ul class="repo-picker-list">
        {repos.map((repo) => {
          const isSelected = selected.includes(repo.name);
          const specCount = repo.spec_count || 0;
          const hasGraph = (repo.graph_node_count || 0) > 0;
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
              <span class="repo-entry-name">{repo.name}</span>
              <span class="repo-entry-spec-count" data-testid={`repo-spec-count-${repo.name}`}>
                {specCount} specs
              </span>
              {hasGraph && (
                <span class="repo-entry-graph" data-testid={`repo-graph-${repo.name}`}>
                  has graph
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
