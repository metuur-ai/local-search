import { describe, it, expect } from 'vitest';
import { GRAPH_PROMPT } from '../src/graph-explorer/graphPrompt.js';
import { normalizeGraph, synthesizeGraphData, collectFilterOptions } from '../src/graph-explorer/graphData.js';

// The prompt is the machine-readable half of the Unit 6 format guide. These tests
// are the thing that keeps the two from drifting: every field the guide documents
// has to be named by the prompt, and the prompt must not name a field for a shape
// whose parser ignores it.

const section = (from, to) => {
  const start = GRAPH_PROMPT.indexOf(from);
  const end = to ? GRAPH_PROMPT.indexOf(to) : GRAPH_PROMPT.length;
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return GRAPH_PROMPT.slice(start, end);
};

const NODE_LINK_HEADING = 'Shape A — node-link';
const FLAT_HEADING = 'Shape B — flat array';

describe('GRAPH_PROMPT', () => {
  it('is a non-empty exported string constant', () => {
    expect(typeof GRAPH_PROMPT).toBe('string');
    expect(GRAPH_PROMPT.trim().length).toBeGreaterThan(0);
  });

  it('instructs the model to emit a single JSON document and nothing else', () => {
    expect(GRAPH_PROMPT).toMatch(/single JSON document/i);
    expect(GRAPH_PROMPT).toMatch(/nothing else/i);
    // No prose wrapper, no markdown fence.
    expect(GRAPH_PROMPT).toMatch(/code fence|```|markdown/i);
  });

  it('states the id requirement and that ids must be unique', () => {
    expect(GRAPH_PROMPT).toMatch(/unique/i);
    expect(GRAPH_PROMPT).toMatch(/`id`/);
  });

  it('describes both accepted shapes', () => {
    expect(GRAPH_PROMPT).toContain(NODE_LINK_HEADING);
    expect(GRAPH_PROMPT).toContain(FLAT_HEADING);
  });

  it('names every node-link field the guide documents', () => {
    const s = section(NODE_LINK_HEADING, FLAT_HEADING);
    for (const field of [
      'id', 'name', 'label', 'title', 'type', 'path',
      'repo', 'project', 'tags', 'val', 'flags',
      'nodes', 'links', 'source', 'target', 'relation',
    ]) {
      expect(s, `node-link section should name \`${field}\``).toContain(`\`${field}\``);
    }
    expect(s).toMatch(/unresolved/);
  });

  it('names every flat-array field the parser actually reads', () => {
    const s = section(FLAT_HEADING);
    for (const field of ['id', 'name', 'title', 'type', 'repo', 'project', 'tags', 'val']) {
      expect(s, `flat-array section should name \`${field}\``).toContain(`\`${field}\``);
    }
  });

  it('does not offer the flat array fields its parser ignores', () => {
    const s = section(FLAT_HEADING);
    // `path`, `label`, `flags` and `relation` are never read by synthesizeGraphData.
    for (const ignored of ['path', 'label', 'flags']) {
      expect(s, `flat-array section must not offer \`${ignored}\``).not.toContain(`\`${ignored}\``);
    }
    expect(s).toMatch(/similarity/i);
    expect(s).toMatch(/cannot|no .*relation|not .*relation/i);
  });

  it('never tells the model to author a link `family`', () => {
    expect(GRAPH_PROMPT).not.toMatch(/"family"/);
    expect(GRAPH_PROMPT).toMatch(/family[^.]*recomputed|recomputed[^.]*family/i);
  });

  it('carries examples that parse into the graph the prompt claims', () => {
    const blocks = [...GRAPH_PROMPT.matchAll(/^(\{[\s\S]*?^\})$|^(\[[\s\S]*?^\])$/gm)]
      .map((m) => m[0]);
    expect(blocks.length).toBeGreaterThanOrEqual(2);

    const nodeLink = JSON.parse(blocks.find((b) => b.startsWith('{')));
    const flat = JSON.parse(blocks.find((b) => b.startsWith('[')));

    const g = normalizeGraph(nodeLink);
    expect(g.nodes.length).toBeGreaterThan(0);
    expect(new Set(g.nodes.map((n) => n.id)).size).toBe(g.nodes.length);
    // A relation between two resolved nodes must come out declared.
    expect(g.links.some((l) => l.family === 'declared')).toBe(true);

    const s = synthesizeGraphData(flat);
    expect(s.links.length).toBeGreaterThan(0);
    expect(s.links.every((l) => l.family === 'similarity')).toBe(true);
    // Tags become hub nodes on this shape, so the Tag filter has nothing to list.
    expect(collectFilterOptions(s.nodes).tag).toEqual([]);
  });
});
