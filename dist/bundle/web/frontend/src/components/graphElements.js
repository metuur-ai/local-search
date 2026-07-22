// Pure helper — turns a NetworkX node-link `graph` event plus the `sources`
// array into a Cytoscape elements array. Kept free of Cytoscape imports so it
// stays testable in jsdom (R-4.1, R-4.2).

// Collect the set of identifiers a source row exposes (path / name / id), so a
// graph node counts as a "source" node when its id OR path matches any of them.
function sourceKeys(sources) {
  const keys = new Set();
  if (!Array.isArray(sources)) return keys;
  for (const s of sources) {
    if (!s) continue;
    for (const v of [s.path, s.name, s.title, s.id]) {
      if (v != null && v !== '') keys.add(v);
    }
  }
  return keys;
}

// Coarse doc-vs-code tag from a file path, so fallback graph nodes still pick
// up the {doc,code} colors in GRAPH_STYLE (test detection is intentionally left
// out — it is too noisy to infer reliably from a path alone).
function tagFromPath(path) {
  const p = typeof path === 'string' ? path.toLowerCase() : '';
  return /\.(md|mdx|markdown|txt|rst|adoc)$/.test(p) ? 'doc' : 'code';
}

// graphFromSources(sources) → a NetworkX-style {nodes, links} star around the
// query, synthesized from the retrieved sources. Used as a fallback for the
// Neighborhood Map when the run never issued `json related` (so no explicit
// `graph` event arrived). Relevance is rank-normalized to 0..1 because raw
// source relevance is negative BM25, which the 0..1 size scale can't use.
// Returns null when there are no sources yet (GraphView shows its empty state).
export function graphFromSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return null;

  const centerId = '__query__';
  const nodes = [{ id: centerId, label: 'your query', tag: 'query', relevance: 1 }];
  const links = [];

  sources.forEach((s, idx) => {
    if (!s) return;
    const id = s.fullpath || s.path || s.name || s.title || `source-${idx}`;
    const relevance = Math.max(0.2, 0.9 - idx * 0.08);
    nodes.push({
      id,
      label: s.title || s.name || s.path || id,
      path: s.path,
      tag: tagFromPath(s.path),
      relevance,
    });
    links.push({ source: centerId, target: id, weight: relevance });
  });

  return { nodes, links };
}

// buildElements(graph, sources) → Cytoscape elements array.
// Tolerates missing fields; returns [] when there are no nodes.
export function buildElements(graph, sources) {
  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    return [];
  }

  const keys = sourceKeys(sources);
  const elements = [];

  for (const node of graph.nodes) {
    if (!node || node.id == null) continue;
    const isSource = keys.has(node.id) || (node.path != null && keys.has(node.path));
    elements.push({
      data: {
        id: node.id,
        label: node.label != null ? node.label : node.path != null ? node.path : node.id,
        relevance: node.relevance,
        tag: node.tag,
        isSource,
      },
    });
  }

  // node-link uses `links` (not `edges`); preserve source/target verbatim.
  const links = Array.isArray(graph.links) ? graph.links : [];
  for (const link of links) {
    if (!link || link.source == null || link.target == null) continue;
    elements.push({
      data: {
        id: `${link.source}-${link.target}`,
        source: link.source,
        target: link.target,
        weight: link.weight,
      },
    });
  }

  return elements;
}
