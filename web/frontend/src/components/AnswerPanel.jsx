// Presentational panel for the streamed answer. Renders markdown as HTML
// (R-3.1), shows a running indicator while streaming (R-3.2), an explicit
// "no answer" message when finished empty (R-3.3), and always reflects the
// latest markdown across partial re-renders (R-3.4). While running it shows an
// explicit "working" state (spinner + live step + skeleton) so the wait reads
// as active. When an answer exists it offers copy-to-markdown / save-as-.md and
// an "expand" button that opens the answer full-screen.
//
// When a `turns` transcript is provided it renders the whole conversation
// (the original answer plus each user follow-up and Claude's grounded reply)
// and, when `canFollowUp` is set, a composer so the user can comment on the
// result with Claude. With no `turns` it falls back to the single `markdown`.
//
// Fenced ```mermaid code blocks are rendered as diagrams (mermaid is loaded
// lazily, only when a diagram is present, so the bundle and test env stay clear).

import { useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { marked } from 'marked';
import './AnswerPanel.css';

// Lazy, one-time mermaid loader — imported only when a diagram actually appears.
let mermaidPromise = null;
let mermaidSeq = 0;
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default;
      // 'loose' lets node labels use <br/> etc.; content is the user's own answer.
      mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' });
      return mermaid;
    });
  }
  return mermaidPromise;
}

// Turn every ```mermaid fenced block inside `root` into an SVG diagram, in place.
// Returns a cleanup that cancels pending async writes if the content re-renders.
function renderMermaid(root) {
  const blocks = Array.from(root.querySelectorAll('code.language-mermaid'));
  if (blocks.length === 0) return undefined;
  let cancelled = false;
  loadMermaid().then(async (mermaid) => {
    for (const code of blocks) {
      const pre = code.closest('pre') || code;
      if (cancelled || pre.dataset.mermaidState) continue;
      pre.dataset.mermaidState = 'rendering';
      try {
        const { svg } = await mermaid.render(`mermaid-svg-${mermaidSeq++}`, code.textContent || '');
        if (cancelled) return;
        const figure = document.createElement('figure');
        figure.className = 'answer-mermaid';
        figure.innerHTML = svg;
        pre.replaceWith(figure);
      } catch {
        // Rendering failed — leave the original source block visible.
        pre.dataset.mermaidState = 'error';
      }
    }
  });
  return () => {
    cancelled = true;
  };
}

// Copy text to the clipboard; resolves true on success, false if blocked
// (e.g. an insecure context where the Clipboard API is unavailable).
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Trigger a browser download of `text` as a .md file.
function downloadMarkdown(text, filename) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Per-iteration copy/export controls. Each answer version carries its own tools
// so the user can copy or save that specific iteration, not just the latest.
function TurnTools({ markdown = '', version }) {
  const [copied, setCopied] = useState(false);
  if (!markdown.trim()) return null;

  const onCopy = async () => {
    if (await copyText(markdown)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  const filename = version ? `answer-v${version}.md` : 'answer.md';

  return (
    <div class="answer-turn-tools" data-testid="answer-turn-tools">
      <button
        type="button"
        class="answer-tool-btn"
        onClick={onCopy}
        title="Copy this answer as Markdown"
      >
        <i class={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`} />
        {copied ? 'Copied' : 'Copy Markdown'}
      </button>
      <button
        type="button"
        class="answer-tool-btn"
        onClick={() => downloadMarkdown(markdown, filename)}
        title="Save this answer as a .md file"
      >
        <i class="fa-solid fa-download" /> Save .md
      </button>
    </div>
  );
}

// The rendered answer content — the whole transcript when `turns` is present,
// otherwise the single `markdown`. Owns a ref so mermaid blocks inside it get
// turned into diagrams (each mount, e.g. inline vs. the expand modal, renders
// its own copy). Returns null when there's nothing to show.
function AnswerContent({ markdown = '', turns = [] }) {
  const ref = useRef(null);
  const hasThread = Array.isArray(turns) && turns.length > 0;
  const hasAnswer = markdown.trim().length > 0;

  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    return renderMermaid(root);
  }, [markdown, turns]);

  if (!hasThread && !hasAnswer) return null;

  return (
    <div class="answer-content" ref={ref}>
      {hasThread ? (
        <div class="answer-thread" data-testid="answer-thread">
          {turns.map((turn, i) =>
            turn.role === 'user' ? (
              <div class="answer-turn answer-turn-user" data-testid="answer-turn-user" key={i}>
                <span class="answer-turn-who">
                  <i class="fa-solid fa-user" /> You
                </span>
                <div class="answer-turn-bubble">{turn.markdown}</div>
              </div>
            ) : (
              <div class="answer-turn answer-turn-assistant" key={i}>
                <div class="answer-turn-head">
                  <span class="answer-turn-who">
                    <i class="fa-solid fa-wand-magic-sparkles" /> Claude
                    {turn.version ? <span class="answer-turn-version">v{turn.version}</span> : null}
                  </span>
                  {/* Copy / export are per iteration — this version's tools. */}
                  <TurnTools markdown={turn.markdown} version={turn.version} />
                </div>
                <div
                  class="answer-body"
                  dangerouslySetInnerHTML={{ __html: marked(turn.markdown || '') }}
                />
              </div>
            )
          )}
        </div>
      ) : (
        <>
          <div class="answer-turn-head">
            <TurnTools markdown={markdown} />
          </div>
          <div class="answer-body" dangerouslySetInnerHTML={{ __html: marked(markdown) }} />
        </>
      )}
    </div>
  );
}

// Follow-up composer — comment on / discuss the result with Claude. Reused by
// both the inline panel and the expand modal; renders nothing when follow-up
// isn't available (no live session yet, still running, etc.).
function FollowUpForm({ onFollowUp, canFollowUp }) {
  const [followUp, setFollowUp] = useState('');
  if (!canFollowUp) return null;

  const send = (event) => {
    event.preventDefault();
    const text = followUp.trim();
    if (!text || typeof onFollowUp !== 'function') return;
    onFollowUp(text);
    setFollowUp('');
  };

  return (
    <form class="answer-followup" data-testid="answer-followup" onSubmit={send}>
      <label class="answer-followup-label" for="answer-followup-input">
        Ask a follow-up
      </label>
      <div class="answer-followup-row">
        <textarea
          id="answer-followup-input"
          class="answer-followup-textarea"
          data-testid="answer-followup-input"
          placeholder="Comment on the result, ask Claude to refine or dig deeper…"
          value={followUp}
          onInput={(e) => setFollowUp(e.target.value)}
          onKeyDown={(e) => {
            // ⌘/Ctrl+Enter sends without leaving the textarea.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e);
          }}
        />
        <button
          type="submit"
          class="answer-followup-send"
          data-testid="answer-followup-send"
          disabled={followUp.trim().length === 0}
        >
          <i class="fa-solid fa-paper-plane" /> Send
        </button>
      </div>
    </form>
  );
}

export function AnswerPanel({
  markdown = '',
  turns = [],
  running = false,
  done = false,
  phase = '',
  activity = '',
  onFollowUp,
  canFollowUp = false,
}) {
  const hasAnswer = markdown.trim().length > 0;
  const hasThread = Array.isArray(turns) && turns.length > 0;
  const hasContent = hasAnswer || hasThread;
  const [expanded, setExpanded] = useState(false);

  // Esc closes the expand modal and the page underneath doesn't scroll behind it.
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  return (
    <section class="answer-panel" data-testid="answer-panel">
      {hasContent && (
        <div class="answer-toolbar" data-testid="answer-toolbar">
          {/* Copy / export live on each answer version below; the panel toolbar
              only carries the panel-level Expand action. */}
          <button
            type="button"
            class="answer-tool-btn answer-tool-expand"
            data-testid="answer-expand"
            onClick={() => setExpanded(true)}
            title="Expand the answer to full screen"
          >
            <i class="fa-solid fa-expand" /> Expand
          </button>
        </div>
      )}

      <AnswerContent markdown={markdown} turns={turns} />

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

      {done && !hasContent && (
        <p class="answer-none" data-testid="answer-none">
          No answer produced.
        </p>
      )}

      {/* Inline follow-up composer — comment on / discuss the result with Claude. */}
      <FollowUpForm onFollowUp={onFollowUp} canFollowUp={canFollowUp} />

      {/* Full-screen view of the answer content. Portalled to <body> so it
          escapes the sticky, overflow-hidden inspector pane and covers the
          whole viewport (topbar included) instead of being clipped inside it. */}
      {expanded && createPortal(
        <div
          class="answer-modal"
          data-testid="answer-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setExpanded(false);
          }}
        >
          <div class="answer-modal-panel" role="dialog" aria-modal="true" aria-label="AI answer">
            <header class="answer-modal-head">
              <span class="answer-modal-title">
                <i class="fa-solid fa-wand-magic-sparkles" /> AI Answer
              </span>
              <div class="answer-modal-actions">
                <button
                  type="button"
                  class="answer-tool-btn answer-modal-close"
                  data-testid="answer-modal-close"
                  onClick={() => setExpanded(false)}
                  title="Close full screen (Esc)"
                >
                  <i class="fa-solid fa-compress" /> Close
                </button>
              </div>
            </header>
            <div class="answer-modal-body">
              <AnswerContent markdown={markdown} turns={turns} />
            </div>
            <FollowUpForm onFollowUp={onFollowUp} canFollowUp={canFollowUp} />
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}

// A human "what's happening now" label from the current phase/activity so the
// waiting state names the work instead of a bare "Answering…".
function workingLabel({ hasAnswer, activity }) {
  if (hasAnswer) return 'Writing the answer…';
  if (activity) return 'Reading & reasoning over sources…';
  return 'Searching your repositories…';
}
