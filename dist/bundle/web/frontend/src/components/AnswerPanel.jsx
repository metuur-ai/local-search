// Presentational panel for the streamed answer. Renders markdown as HTML
// (R-3.1), shows a running indicator while streaming (R-3.2), an explicit
// "no answer" message when finished empty (R-3.3), and always reflects the
// latest markdown across partial re-renders (R-3.4). While running it shows an
// explicit "working" state (spinner + live step + skeleton) so the wait reads
// as active. When an answer exists it offers copy-to-markdown / save-as-.md.

import { useState } from 'preact/hooks';
import { marked } from 'marked';
import './AnswerPanel.css';

// A human "what's happening now" label from the current phase/activity so the
// waiting state names the work instead of a bare "Answering…".
function workingLabel({ hasAnswer, activity }) {
  if (hasAnswer) return 'Writing the answer…';
  if (activity) return 'Reading & reasoning over sources…';
  return 'Searching your repositories…';
}

export function AnswerPanel({ markdown = '', running = false, done = false, phase = '', activity = '' }) {
  const hasAnswer = markdown.trim().length > 0;
  const html = hasAnswer ? marked(markdown) : '';
  const [copied, setCopied] = useState(false);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (e.g. insecure context) — no-op */
    }
  };

  const saveMarkdown = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'answer.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section class="answer-panel" data-testid="answer-panel">
      {running && (
        <div class="answer-working" data-testid="answer-running">
          <div class="answer-working-head">
            <span class="answer-working-spinner" aria-hidden="true" />
            <span class="answer-working-label">{workingLabel({ hasAnswer, activity })}</span>
            <span class="answer-working-badge">{phase || 'working'}</span>
          </div>
          {activity && <code class="answer-working-step">{activity}</code>}
          {!hasAnswer && (
            <div class="answer-skeleton" aria-hidden="true">
              <span class="skeleton-line" />
              <span class="skeleton-line" />
              <span class="skeleton-line short" />
            </div>
          )}
        </div>
      )}

      {hasAnswer && (
        <div class="answer-toolbar" data-testid="answer-toolbar">
          <button
            type="button"
            class="answer-tool-btn"
            onClick={copyMarkdown}
            title="Copy the answer as Markdown"
          >
            <i class={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`} />
            {copied ? 'Copied' : 'Copy Markdown'}
          </button>
          <button
            type="button"
            class="answer-tool-btn"
            onClick={saveMarkdown}
            title="Save the answer as a .md file"
          >
            <i class="fa-solid fa-download" /> Save .md
          </button>
        </div>
      )}

      {hasAnswer && (
        <div
          class="answer-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}

      {done && !hasAnswer && (
        <p class="answer-none" data-testid="answer-none">
          No answer produced.
        </p>
      )}
    </section>
  );
}
