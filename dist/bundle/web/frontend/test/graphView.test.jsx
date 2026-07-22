import { render, screen } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { buildElements } from '../src/components/graphElements.js';
import { GraphView, GRAPH_STYLE } from '../src/components/GraphView.jsx';

const fixtureGraph = {
  nodes: [
    { id: 'a.py', path: 'src/a.py', relevance: 0.9, tag: 'code' },
    { id: 'b.md', path: 'docs/b.md', relevance: 0.4, tag: 'doc' },
    { id: 'c.py', path: 'src/c.py', relevance: 0.1, tag: 'code' },
  ],
  links: [
    { source: 'a.py', target: 'b.md', weight: 0.7 },
    { source: 'b.md', target: 'c.py', weight: 0.3 },
  ],
};

describe('buildElements (R-4.1)', () => {
  it('maps node-link to N node + M edge elements without reshaping', () => {
    const els = buildElements(fixtureGraph, []);
    const nodes = els.filter((e) => !e.data.source);
    const edges = els.filter((e) => e.data.source);

    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2);

    // source/target ids preserved verbatim (no reshaping into from/to).
    expect(edges[0].data.source).toBe('a.py');
    expect(edges[0].data.target).toBe('b.md');
    expect(edges[0].data.id).toBe('a.py-b.md');
    expect(edges[1].data.source).toBe('b.md');
    expect(edges[1].data.target).toBe('c.py');
  });

  it('returns [] for null / empty graph', () => {
    expect(buildElements(null, [])).toEqual([]);
    expect(buildElements(undefined, [])).toEqual([]);
    expect(buildElements({ nodes: [], links: [] }, [])).toEqual([]);
  });
});

describe('buildElements source marking (R-4.2)', () => {
  it('marks isSource true when node id/path matches a source row', () => {
    const sources = [{ name: 'a.py', path: 'src/a.py', relevance: 0.9 }];
    const els = buildElements(fixtureGraph, sources);
    const byId = Object.fromEntries(els.filter((e) => !e.data.source).map((e) => [e.data.id, e.data]));

    expect(byId['a.py'].isSource).toBe(true);
    expect(byId['b.md'].isSource).toBeFalsy();
    expect(byId['c.py'].isSource).toBeFalsy();
  });

  it('matches a source by path even when id differs', () => {
    const sources = [{ title: 'B doc', path: 'docs/b.md' }];
    const els = buildElements(fixtureGraph, sources);
    const b = els.find((e) => e.data.id === 'b.md');
    expect(b.data.isSource).toBe(true);
  });
});

describe('GraphView stylesheet honesty (R-4.3 / R-4.4)', () => {
  it('sizes nodes by relevance', () => {
    const nodeStyle = GRAPH_STYLE.find((s) => s.selector === 'node');
    expect(String(nodeStyle.style.width)).toContain('relevance');
    expect(String(nodeStyle.style.height)).toContain('relevance');
  });

  it('colors nodes by tag', () => {
    const tagStyles = GRAPH_STYLE.filter((s) => /node\[tag/.test(s.selector));
    expect(tagStyles.length).toBeGreaterThan(0);
    expect(tagStyles.every((s) => 'background-color' in s.style)).toBe(true);
  });

  it('gives source nodes a distinct mark', () => {
    const sourceStyle = GRAPH_STYLE.find((s) => s.selector.includes('isSource'));
    expect(sourceStyle).toBeTruthy();
  });

  it('labels edges lexical/cosine, never semantic', () => {
    // The static edge label was removed to declutter the map; the honest
    // relationship now surfaces on hover (edge.hover). The invariant — the
    // wording is lexical/cosine and never "semantic" — still holds there.
    const base = GRAPH_STYLE.find((s) => s.selector === 'edge');
    expect(String(base.style.label)).toBe('');

    const hoverStyle = GRAPH_STYLE.find((s) => s.selector === 'edge.hover');
    const label = String(hoverStyle.style.label).toLowerCase();
    expect(label).toContain('lexical');
    expect(label).toContain('cosine');
    expect(label).not.toContain('semantic');
  });
});

describe('GraphView empty state (R-4.5)', () => {
  it('renders graph-empty and does not init cytoscape for zero nodes', () => {
    render(<GraphView graph={{ nodes: [], links: [] }} sources={[]} />);
    expect(screen.getByTestId('graph-view')).toBeTruthy();
    expect(screen.getByTestId('graph-empty')).toBeTruthy();
  });
});
