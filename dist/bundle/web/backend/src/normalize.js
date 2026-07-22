import { deriveEvents } from './toolParse.js';

/**
 * createNormalizer() -> { push(ndjsonObj) -> normalized SSE events[], sessionId getter }.
 *
 * Translates parsed claude stream-json objects into normalized SSE events.
 * Handles:
 *  - system/init            -> status{phase:'started', model?}; captures session_id  (R-2.1)
 *  - assistant text block   -> assistant{text}
 *  - assistant tool_use Bash-> remembers {tool_use_id, command}
 *  - user/tool_result       -> toolParse.deriveEvents (R-2.7 sources/graph only from here)
 *  - result (answer)        -> answer{markdown} + done{ok:true}
 *  - result (question)      -> question{text}                                          (R-8.1)
 *  - result (is_error) / unparsable -> error{message,kind}, never fabricate an answer  (R-2.5)
 */
export function createNormalizer() {
  let sessionId = null;
  // tool_use_id -> command string, so tool_result can be classified/parsed.
  const pendingTools = new Map();

  function push(obj) {
    if (!obj || typeof obj !== 'object') {
      return [{ type: 'error', data: { message: 'unparsable stream object', kind: 'stream' } }];
    }

    switch (obj.type) {
      case 'system':
        return handleSystem(obj);
      case 'assistant':
        return handleAssistant(obj);
      case 'user':
        return handleUser(obj);
      case 'result':
        return handleResult(obj);
      default:
        return [];
    }
  }

  function handleSystem(obj) {
    if (obj.subtype && obj.subtype !== 'init') return [];
    if (obj.session_id) sessionId = obj.session_id;
    const data = { phase: 'started', sessionId };
    if (obj.model) data.model = obj.model;
    return [{ type: 'status', data }];
  }

  function handleAssistant(obj) {
    const blocks = obj.message?.content ?? [];
    const events = [];
    for (const block of blocks) {
      if (block.type === 'text' && typeof block.text === 'string') {
        events.push({ type: 'assistant', data: { text: block.text } });
      } else if (block.type === 'tool_use' && block.name === 'Bash') {
        const command = block.input?.command;
        if (block.id) pendingTools.set(block.id, command);
      }
    }
    return events;
  }

  function handleUser(obj) {
    const blocks = obj.message?.content ?? [];
    const events = [];
    for (const block of blocks) {
      if (block.type !== 'tool_result') continue;
      const command = pendingTools.get(block.tool_use_id);
      if (command === undefined) continue;
      pendingTools.delete(block.tool_use_id);
      const stdout = extractToolResultText(block.content);
      for (const ev of deriveEvents({ command, stdout })) events.push(ev);
    }
    return events;
  }

  function handleResult(obj) {
    // R-2.5: explicit error result -> error, never fabricate an answer.
    if (obj.is_error || obj.subtype === 'error' || obj.subtype === 'error_during_execution') {
      return [
        {
          type: 'error',
          data: { message: obj.result ?? obj.error ?? 'claude reported an error', kind: 'result' },
        },
      ];
    }

    const answer = typeof obj.result === 'string' ? obj.result : '';

    // R-8.1: a result that poses a question with no real answer -> question event.
    if (!answer.trim()) {
      return [{ type: 'error', data: { message: 'no answer produced', kind: 'empty' } }];
    }
    if (endsWithQuestion(answer)) {
      return [{ type: 'question', data: { text: answer } }];
    }

    return [
      { type: 'answer', data: { markdown: answer } },
      { type: 'done', data: { ok: true } },
    ];
  }

  return {
    push,
    get sessionId() {
      return sessionId;
    },
  };
}

/** A tool_result `content` may be a string or an array of {type:'text', text} blocks. */
function extractToolResultText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('');
  }
  return '';
}

/** True when the assistant's final message reads as a clarifying question and no answer. */
function endsWithQuestion(text) {
  const trimmed = text.trimEnd();
  return trimmed.endsWith('?');
}
