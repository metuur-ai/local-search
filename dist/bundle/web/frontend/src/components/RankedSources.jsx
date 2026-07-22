// Presentational fused-ranking illustration (R-6.2). Renders the search hits in
// descending fused-relevance order so the ranking is legible. Data via props.

import './small.css';

// Pure helper: return a new array sorted by relevance descending. Sources
// without a relevance value sort last. Does not mutate the input.
export function rankByRelevance(sources = []) {
  const score = (s) => (typeof s.relevance === 'number' ? s.relevance : -Infinity);
  return [...sources].sort((a, b) => score(b) - score(a));
}

export function RankedSources({ sources = [] }) {
  if (!sources || sources.length === 0) {
    return (
      <p class="ranked-empty" data-testid="ranked-empty">
        No ranked sources.
      </p>
    );
  }

  const ranked = rankByRelevance(sources);

  return (
    <ol class="ranked-sources" data-testid="ranked-sources">
      {ranked.map((row, i) => {
        const label = row.title || row.name || '(untitled)';
        return (
          <li class="ranked-source" data-testid={`ranked-source-${i}`} key={i}>
            <span class="ranked-position">{i + 1}</span>
            <span class="ranked-label">{label}</span>
            {row.relevance != null && (
              <span class="ranked-relevance">{row.relevance}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
