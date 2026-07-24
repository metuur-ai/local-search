import { describe, it, expect } from 'vitest';
import {
  parseNodeTags,
  layerOf,
  synthesizeGraphData,
  normalizeGraph,
  toGraph,
  applyFilters,
  collectFilterOptions,
  colors,
} from '../src/graph-explorer/graphData.js';

// These pure helpers back the Agent OS Graph explorer. They were extracted from
// the former standalone page, so the tests pin the trickier parsing/filtering.

describe('parseNodeTags', () => {
  it('returns arrays unchanged (trimmed)', () => {
    expect(parseNodeTags(['a', ' b '])).toEqual(['a', 'b']);
  });
  it('splits a comma string and strips YAML flow brackets per token', () => {
    expect(parseNodeTags('[workflow, thinking]')).toEqual(['workflow', 'thinking']);
  });
  it('drops empties and is safe for null/undefined', () => {
    expect(parseNodeTags('a,,b')).toEqual(['a', 'b']);
    expect(parseNodeTags(null)).toEqual([]);
    expect(parseNodeTags(undefined)).toEqual([]);
  });
});

describe('layerOf', () => {
  it('classifies OS layers by path', () => {
    expect(layerOf('platforms/foo/spec.md')).toBe('platform');
    expect(layerOf('platforms/foo/change-records/x.md')).toBe('prd');
    expect(layerOf('teams/core/readme.md')).toBe('team');
    expect(layerOf('docs/guide.md')).toBe('doc');
    expect(layerOf('.devlocal/research/x.md')).toBe('research');
    expect(layerOf('random/path.md')).toBe('other');
    expect(layerOf('')).toBe('other');
  });
});

describe('synthesizeGraphData', () => {
  it('synthesizes repo/project/tag hub nodes and links from flat records', () => {
    const g = synthesizeGraphData([
      { id: 'f1', name: 'a.md', repo: 'r1', project: 'p1', tags: ['x', 'y'] },
      { id: 'f2', name: 'b.md', repo: 'r1', tags: 'z' },
    ]);
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toContain('f1');
    expect(ids).toContain('repo_r1');
    expect(ids).toContain('proj_p1');
    expect(ids).toContain('tag_x');
    // repo r1 is shared, so only one repo hub node exists.
    expect(g.nodes.filter((n) => n.type === 'repo')).toHaveLength(1);
    // f1: repo + project + 2 tags = 4 links; f2: repo + 1 tag = 2 links.
    expect(g.links).toHaveLength(6);
    expect(g.nodes.find((n) => n.id === 'f1').renderColor).toBe(colors.file);
  });
});

describe('normalizeGraph', () => {
  it('adds a render color and derives type from path; accepts edges or links', () => {
    const g = normalizeGraph({
      nodes: [{ id: 'n1', path: 'teams/core/x.md' }],
      edges: [{ source: 'n1', target: 'n2' }],
    });
    expect(g.nodes[0].type).toBe('team');
    expect(g.nodes[0].renderColor).toBeTruthy();
    expect(g.links).toHaveLength(1);
  });
});

describe('toGraph', () => {
  it('synthesizes from an array and normalizes from an object', () => {
    expect(toGraph([{ id: 'f1', name: 'a' }]).nodes.some((n) => n.id === 'f1')).toBe(true);
    expect(toGraph({ nodes: [{ id: 'n1' }], links: [] }).nodes).toHaveLength(1);
  });
});

describe('applyFilters', () => {
  const original = {
    nodes: [
      { id: 'a', name: 'alpha', title: 'One', type: 'file', repo: 'r1', project: 'p1', tags: ['x'] },
      { id: 'b', name: 'beta', title: 'Two', type: 'file', repo: 'r2', project: 'p2', tags: ['y'] },
      { id: 'r1', name: 'r1', type: 'repo' },
    ],
    links: [
      { source: 'a', target: 'r1' },
      { source: 'b', target: 'r2' },
    ],
  };
  const noSel = () => ({ type: new Set(), repo: new Set(), project: new Set(), tag: new Set() });

  it('search matches name or title (case-insensitive)', () => {
    const g = applyFilters(original, { search: 'alph', multiSelect: noSel() });
    expect(g.nodes.map((n) => n.id)).toEqual(['a']);
  });

  it('repo multi-select keeps nodes carrying the repo (and drops orphaned links)', () => {
    const ms = noSel();
    ms.repo.add('r1');
    const g = applyFilters(original, { multiSelect: ms });
    // 'b' has repo r2 (filtered out); 'a' and the r1 hub (no repo prop) survive.
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['a', 'r1']);
    expect(g.links).toEqual([{ source: 'a', target: 'r1' }]);
  });

  it('tag multi-select keeps only nodes with a matching tag', () => {
    const ms = noSel();
    ms.tag.add('x');
    const g = applyFilters(original, { multiSelect: ms });
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['a', 'r1']);
  });
});

describe('collectFilterOptions', () => {
  it('collects sorted distinct values across nodes', () => {
    const opts = collectFilterOptions([
      { type: 'file', repo: 'r2', project: 'p1', tags: ['b', 'a'] },
      { type: 'repo', repo: 'r1' },
    ]);
    expect(opts.type).toEqual(['file', 'repo']);
    expect(opts.repo).toEqual(['r1', 'r2']);
    expect(opts.project).toEqual(['p1']);
    expect(opts.tag).toEqual(['a', 'b']);
  });
});
