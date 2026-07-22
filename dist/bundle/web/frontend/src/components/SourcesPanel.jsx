// Presentational panel listing the sources returned by a search run (R-5.1).
// Data arrives via props (the `sources` stream event); tolerate missing fields.

import './panels.css';

export function SourcesPanel({ sources = [] }) {
  return (
    <section class="panel sources-panel" data-testid="sources-panel">
      <h2 class="panel-title">Sources</h2>

      {sources.map((row, i) => {
        const label = row.title || row.name || '(untitled)';
        const tags = row.tags || [];
        return (
          <div class="source-row" data-testid={`source-row-${i}`} key={i}>
            <div class="source-title">{label}</div>
            <div class="source-meta">
              {row.repo != null && <span class="source-repo">{row.repo}</span>}
              {row.path != null && <span class="source-path"> {row.path}</span>}
              {row.relevance != null && (
                <span class="source-relevance"> {row.relevance}</span>
              )}
            </div>
            {tags.length > 0 && (
              <div class="source-tags">
                {tags.map((tag) => (
                  <span class="source-tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
