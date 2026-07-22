// Presentational reply input (R-8.1). The reply UI only appears once Claude has
// asked a clarification question; submitting non-empty text hands it to onReply.
// Data via props, no fetch.

import { useState } from 'preact/hooks';
import './small.css';

export function ReplyInput({ question = '', onReply, disabled = false }) {
  const [text, setText] = useState('');

  // The reply UI only appears when Claude has asked something.
  if (!question) {
    return null;
  }

  const canSend = !disabled && text.trim().length > 0;

  const submit = (event) => {
    event.preventDefault();
    if (!canSend) return;
    onReply(text);
  };

  return (
    <section class="reply-input" data-testid="reply-input">
      <p class="reply-question" data-testid="reply-question">
        {question}
      </p>
      <form class="reply-form" data-testid="reply-form" onSubmit={submit}>
        <textarea
          class="reply-textarea"
          data-testid="reply-textarea"
          value={text}
          onInput={(e) => setText(e.target.value)}
        />
        <button
          class="reply-send"
          data-testid="reply-send"
          type="submit"
          disabled={!canSend}
        >
          Send
        </button>
      </form>
    </section>
  );
}
