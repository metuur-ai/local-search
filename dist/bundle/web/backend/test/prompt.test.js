import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../src/prompt.js';

test('R-2.4: prompt scopes each repo with an explicit per-repo search command', () => {
  const p = buildPrompt({ query: 'how does auth work', repos: ['a', 'b'] });
  assert.match(p, /json search "<terms>" a/);
  assert.match(p, /json search "<terms>" b/);
});

test('prompt embeds the query verbatim', () => {
  const p = buildPrompt({ query: 'how does auth work', repos: ['a', 'b'] });
  assert.match(p, /how does auth work/);
});

test('R-2.4: prompt tells Claude not to rely on CWD and lists the real commands', () => {
  const p = buildPrompt({ query: 'q', repos: ['x'] });
  assert.match(p, /working directory|CWD|\.local-search\.toml/i);
  assert.match(p, /json read <name> <repo>/);
  assert.match(p, /json related <name>/);
});

test('prompt instructs a clarifying question when info is missing', () => {
  const p = buildPrompt({ query: 'q', repos: ['x'] });
  assert.match(p, /clarifying question/i);
});
