import { describe, it, expect } from 'vitest';
import { mergeGraphs } from '../src/graph-explorer/graphData.js';

describe('mergeGraphs after force-graph has mutated endpoints', () => {
  it('keeps every link endpoint resolvable within the merged nodes', () => {
    const base = { nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b' }] };
    const up   = { nodes: [{ id: 'x' }, { id: 'y' }], links: [{ source: 'x', target: 'y' }] };
    // force-graph rewrites string ids into live node object references in place:
    base.links[0].source = base.nodes[0];
    base.links[0].target = base.nodes[1];

    const merged = mergeGraphs(base, up);
    const ids = new Set(merged.nodes.map((n) => n.id));
    for (const l of merged.links) {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      expect(ids.has(s)).toBe(true);
      expect(ids.has(t)).toBe(true);
      // the endpoint must not be a stale object from a previous render
      expect(typeof l.source === 'object' && !merged.nodes.includes(l.source)).toBe(false);
    }
  });
});
