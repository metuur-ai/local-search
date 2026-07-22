import { describe, it, expect } from 'vitest';
import { normalizeTags } from '../src/app.jsx';

// Regression: the graph-DB (no-AI) path emits `tags` as a STRING (either "" or a
// bracketed list like "[a, b]"), which used to crash the render at `tags.map(...)`.
// normalizeTags must always return an array so every consumer is safe.
describe('normalizeTags', () => {
  it('returns arrays unchanged (stringified)', () => {
    expect(normalizeTags(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('parses a bracketed comma-separated string into a trimmed array', () => {
    expect(normalizeTags('[research, codebase, installer]')).toEqual([
      'research',
      'codebase',
      'installer',
    ]);
  });

  it('treats an empty string as no tags', () => {
    expect(normalizeTags('')).toEqual([]);
  });

  it('is safe for null/undefined', () => {
    expect(normalizeTags(null)).toEqual([]);
    expect(normalizeTags(undefined)).toEqual([]);
  });
});
