// Static, documentary diagram of the fixed `local-search` retrieval pipeline
// (R-6.1). These stages are the architecture as designed — they are NOT
// reconstructed per-run from stream events.

import './RetrievalPath.css';

const STAGES = [
  { key: 'query', label: 'query', note: 'user question' },
  { key: 'fts', label: 'FTS/BM25 candidates', note: 'lexical match' },
  { key: 'embed', label: 'embed (256-d)', note: 'vectorize query' },
  { key: 'cosine', label: 'cosine over vectors', note: 'semantic match' },
  { key: 'rrf', label: 'RRF fusion', note: 'reciprocal-rank fuse' },
  { key: 'ranked', label: 'ranked sources', note: 'ordered results' },
  { key: 'answer', label: 'answer', note: 'grounded response' },
];

export default function RetrievalPath() {
  return (
    <section class="retrieval-path" data-testid="retrieval-path">
      <h2 class="retrieval-path-title">Retrieval pipeline (local-search)</h2>

      <ol class="retrieval-path-stages">
        {STAGES.map((stage, i) => (
          <li class="retrieval-stage" data-testid={`stage-${stage.key}`} key={stage.key}>
            <div class="retrieval-stage-box">
              <span class="retrieval-stage-label">{stage.label}</span>
              <span class="retrieval-stage-note">{stage.note}</span>
            </div>
            {i < STAGES.length - 1 && (
              <span class="retrieval-stage-connector" aria-hidden="true">
                →
              </span>
            )}
          </li>
        ))}
      </ol>

      <p class="retrieval-path-caption" data-testid="retrieval-path-caption">
        Fixed local-search retrieval architecture (documentary — not
        reconstructed per run).
      </p>
    </section>
  );
}
