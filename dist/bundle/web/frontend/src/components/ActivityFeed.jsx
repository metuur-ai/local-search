// Presentational live-session activity feed. Renders the full ordered log of
// normalized stream events, one timeline entry per event in arrival order
// (R-7.1, R-7.5). Handles `activity` (a local-search command + short result
// summary), `assistant` progress narration (R-7.2), and clarification
// `question`/`reply` events generically. Stays mounted while running and
// reflects new events on rerender (R-7.3); shows the current phase (R-7.4).

import './ActivityFeed.css';

function renderEntry(event) {
  const { type, data = {} } = event;

  if (type === 'activity') {
    return (
      <>
        <span class="activity-entry-kind">{data.unparseable ? 'command (unparsed)' : 'command'}</span>
        <code class="activity-entry-command">{data.command}</code>
        {data.resultSummary && (
          <span class="activity-entry-summary">{data.resultSummary}</span>
        )}
      </>
    );
  }

  // assistant / question / reply — all carry a plain `text` payload.
  return (
    <>
      <span class="activity-entry-kind">{type}</span>
      <span class="activity-entry-text">{data.text}</span>
    </>
  );
}

export function ActivityFeed({ events = [], phase, running = false }) {
  return (
    <section class="activity-feed" data-testid="activity-feed">
      <div class="activity-feed-header">
        <span class="activity-phase" data-testid="activity-phase">
          {phase || 'idle'}
        </span>
        {running && (
          <span class="activity-running" data-testid="activity-running" aria-hidden="true" />
        )}
      </div>

      <ol class="activity-feed-list">
        {events.map((event, i) => (
          <li class="activity-entry" data-testid={`activity-entry-${i}`} key={i}>
            {renderEntry(event)}
          </li>
        ))}
      </ol>
    </section>
  );
}
