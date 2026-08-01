// Pure, DOM-free graph helpers for the Agent OS Graph explorer. Extracted
// verbatim (behavior-preserving) from the former standalone graph-explorer.html
// so they can be unit-tested and shared across the Preact components.

// Light-theme palette, keyed by node.type.
export const colors = {
  file: '#64748b',
  project: '#d97706',
  tag: '#7c3aed',
  repo: '#0369a1',
};

// Hub node types that get labels earlier + a shadow.
export const COMMUNITY = new Set(['repo', 'project', 'tag']);

// ── Edge families ───────────────────────────────────────────────────────────
//
// The export mixes two fundamentally different kinds of link, and rendering
// them identically is a lie: a `depends_on` written by hand in frontmatter and
// a 0.38-cosine lexical coincidence are not the same claim. Declared links
// carry `relation` (+ `confidence`, `source_file`, `source_location`);
// similarity links carry only `weight`.
//
// Declared links are split again by whether their endpoints actually resolve.
// An endpoint flagged `unresolved` is a phantom — referenced but declared
// nowhere — and that is the single most diagnostic thing the graph knows, so it
// gets its own family rather than being blended into DECLARED.
export const EDGE_FAMILY = {
  DECLARED: 'declared',
  DANGLING: 'dangling',
  SIMILARITY: 'similarity',
};

export const EDGE_FAMILY_ORDER = [
  EDGE_FAMILY.DECLARED,
  EDGE_FAMILY.DANGLING,
  EDGE_FAMILY.SIMILARITY,
];

// `label` is the full name (inspector, tooltips); `short` is the filter-bar
// chip, which sits in a horizontal row and cannot afford to truncate.
export const EDGE_FAMILY_META = {
  [EDGE_FAMILY.DECLARED]: {
    label: 'Declared', short: 'Declared', color: 'rgba(15,118,110,0.85)', width: 1.9, dash: null,
  },
  [EDGE_FAMILY.DANGLING]: {
    label: 'Declared · unresolved target', short: 'Unresolved', color: 'rgba(180,83,9,0.85)', width: 1.6, dash: [4, 3],
  },
  [EDGE_FAMILY.SIMILARITY]: {
    label: 'Similarity (lexical)', short: 'Similarity', color: 'rgba(23,27,38,0.18)', width: 1.1, dash: null,
  },
};

// Link endpoints are ids before the force layout runs and node objects after.
export const linkEndId = (e) => (e && typeof e === 'object' ? e.id : e);

// Classify one link. `nodeById` is a Map; a missing endpoint counts as
// unresolved, since a link to a node that isn't in the graph is dangling too.
export function edgeFamilyOf(link, nodeById) {
  if (!link || !link.relation) return EDGE_FAMILY.SIMILARITY;
  const unresolved = (id) => {
    const n = nodeById && nodeById.get(id);
    return !n || n.flags === 'unresolved';
  };
  return unresolved(linkEndId(link.source)) || unresolved(linkEndId(link.target))
    ? EDGE_FAMILY.DANGLING
    : EDGE_FAMILY.DECLARED;
}

// Colors for graph-export nodes, keyed by the OS layer derived from their path.
export const LAYER_COLORS = {
  platform: '#2563eb', team: '#ea580c', ontology: '#9333ea', prd: '#db2777',
  standard: '#0d9488', research: '#16a34a', doc: '#ca8a04', other: '#94a3b8',
};

// renderColor -> human label, drives the dynamic legend for both data shapes.
export const COLOR_NAMES = {
  '#64748b': 'Files', '#d97706': 'Projects', '#7c3aed': 'Tags', '#0369a1': 'Repos',
  '#2563eb': 'Platform', '#ea580c': 'Team', '#9333ea': 'Ontology', '#db2777': 'PRD',
  '#0d9488': 'Standards', '#16a34a': 'Research', '#ca8a04': 'Docs', '#94a3b8': 'Other',
};

// Map a graph-export node's repo-relative path to an OS layer bucket.
export function layerOf(p) {
  p = p || '';
  const has = (s) => p.indexOf(s) !== -1;
  if (has('/platforms/') || p.indexOf('platforms/') === 0) {
    return (has('change-records') || has('archive/prds')) ? 'prd' : 'platform';
  }
  if (has('/teams/') || p.indexOf('teams/') === 0) return 'team';
  if (has('company-ontology')) return 'ontology';
  if (has('company-os/') || has('company-os-starter/company-os')) return 'standard';
  if (p.indexOf('docs/') === 0 || has('company-os-starter/docs')) return 'doc';
  if (p.indexOf('.devlocal') === 0) return 'research';
  return 'other';
}

// Node tags arrive as an array or a "[a, b]" / "a,b" string. Some exports leave
// YAML flow-sequence brackets on the first/last token ("[workflow" … "thinking]"),
// so strip a leading '[' and trailing ']' per token and drop empties.
export function parseNodeTags(raw) {
  let arr;
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string') arr = raw.split(',');
  else return [];
  return arr
    .map((t) => String(t).trim().replace(/^\[/, '').replace(/\]$/, '').trim())
    .filter(Boolean);
}

// Build a graph ({nodes, links}) from a flat array of file records (hub export):
// synthesize repo/project/tag hub nodes and the links from each file to them.
//
// Synthesized links carry no `relation`, so they are similarity links by the
// same rule `edgeFamilyOf` applies. Tag them explicitly rather than leaning on
// the `undefined` fallback in `countEdgeFamilies`: the fallback makes them
// *render* as similarity but leaves `link.family` undefined, so the family
// filter — which tests `families.has(link.family)` — drops every one of them and
// selecting "Similarity" on a flat-array graph yields a blank canvas.
export function synthesizeGraphData(rawData) {
  const nodes = [], links = [];
  const projects = new Map(), tags = new Map(), repos = new Map();

  rawData.forEach((item, index) => {
    const nodeId = item.id || `file_${index}`;
    nodes.push({
      id: nodeId, name: item.name || 'Unknown Node', title: item.title,
      type: item.type || 'file', repo: item.repo, project: item.project,
      val: item.val || 4, raw: item,
      renderColor: colors[item.type || 'file'] || colors.file,
    });

    if (item.repo) {
      if (!repos.has(item.repo)) repos.set(item.repo, { id: `repo_${item.repo}`, name: item.repo, type: 'repo', val: 12, renderColor: colors.repo });
      links.push({ source: nodeId, target: `repo_${item.repo}`, family: EDGE_FAMILY.SIMILARITY });
    }
    if (item.project) {
      if (!projects.has(item.project)) projects.set(item.project, { id: `proj_${item.project}`, name: item.project, type: 'project', val: 8, renderColor: colors.project });
      links.push({ source: nodeId, target: `proj_${item.project}`, family: EDGE_FAMILY.SIMILARITY });
    }
    if (item.tags) {
      let cleanTags = [];
      if (typeof item.tags === 'string') cleanTags = item.tags.replace(/\[|\]/g, '').split(',').map((t) => t.trim()).filter((t) => t.length > 0);
      else if (Array.isArray(item.tags)) cleanTags = item.tags;
      cleanTags.forEach((tag) => {
        if (!tags.has(tag)) tags.set(tag, { id: `tag_${tag}`, name: `#${tag}`, type: 'tag', val: 6, renderColor: colors.tag });
        links.push({ source: nodeId, target: `tag_${tag}`, family: EDGE_FAMILY.SIMILARITY });
      });
    }
  });
  return { nodes: [...nodes, ...repos.values(), ...projects.values(), ...tags.values()], links };
}

// Accept a pre-built {nodes, links|edges} graph and give every node a render
// color so exporter output (which lacks node.type) still renders on the canvas.
export function normalizeGraph(json) {
  const nodes = (json.nodes || []).map((n) => {
    // Prefer an explicit type; otherwise classify by OS layer from the path.
    // NOTE: the exporter emits declared frontmatter `type:` as `doc_type`, not
    // `type`, precisely so it does NOT hijack this OS-layer classification.
    const type = n.type || layerOf(n.path || '');
    return {
      ...n,
      type,
      name: n.name || n.label || n.title || n.id,
      renderColor: n.renderColor || colors[type] || LAYER_COLORS[type] || colors.file,
    };
  });
  // Annotate every link with its family once, here, so styling/filtering/legend
  // all read the same classification instead of each re-deriving it.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = (json.links || json.edges || []).map((l) => ({
    ...l,
    family: edgeFamilyOf(l, byId),
  }));
  return { nodes, links };
}

// Normalize either data shape into a renderable graph: a flat array (hub export)
// is synthesized; a {nodes, links|edges} object is normalized.
export function toGraph(data) {
  return Array.isArray(data) ? synthesizeGraphData(data) : normalizeGraph(data);
}

// Label every node with the origin the viewer assigns it. The `__origin` name is
// deliberate: an uploaded file may carry its own `origin` field, which this must
// neither read nor clobber. Ids and link endpoints are left exactly as they are.
export function tagOrigin(graph, origin) {
  return {
    ...graph,
    nodes: (graph.nodes || []).map((n) => ({ ...n, __origin: origin })),
  };
}

// Combine two already-tagged graphs into one. The nodes and links are structural
// copies, never the inputs' own objects: the force layout rewrites `link.source`
// and `link.target` in place, and `applyFilters` aliases rather than copies, so
// concatenating references would hand the layout the very objects the sources are
// re-derived from — and leave them circular.
//
// Endpoints are normalized back to ids for the same reason. Once the layout has
// run, `link.source` holds a node *object*; copying it verbatim while the nodes
// beside it are fresh copies yields links bound to nodes that are not in this
// graph's own `nodes` array, which draws them against orphans.
export function mergeGraphs(a, b) {
  const endpointId = (e) => (e && typeof e === 'object' ? e.id : e);
  const nodesOf = (g) => (g.nodes || []).map((n) => ({ ...n }));
  const linksOf = (g) => (g.links || []).map((l) => ({
    ...l,
    source: endpointId(l.source),
    target: endpointId(l.target),
  }));
  return {
    nodes: [...nodesOf(a), ...nodesOf(b)],
    links: [...linksOf(a), ...linksOf(b)],
  };
}

// Count the node ids present in both graphs. Ids alone decide a collision — two
// nodes sharing an id are a conflict however different the rest of them is.
export function detectIdCollisions(a, b) {
  const aIds = new Set((a.nodes || []).map((n) => n.id));
  const bIds = new Set((b.nodes || []).map((n) => n.id));
  let count = 0;
  bIds.forEach((id) => { if (aIds.has(id)) count += 1; });
  return count;
}

// Build O(1) lookup maps for a graph. Returns fresh maps rather than mutating
// module state, so callers own their lifetime.
export function buildPerformanceMaps(data) {
  const neighborNodesMap = new Map();
  const nodeLinksMap = new Map();
  const nodeByIdMap = new Map();
  data.nodes.forEach((n) => {
    nodeByIdMap.set(n.id, n);
    neighborNodesMap.set(n.id, new Set());
    nodeLinksMap.set(n.id, []);
  });
  data.links.forEach((l) => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    if (neighborNodesMap.has(s)) neighborNodesMap.get(s).add(t);
    if (neighborNodesMap.has(t)) neighborNodesMap.get(t).add(s);
    if (nodeLinksMap.has(s)) nodeLinksMap.get(s).push(l);
    if (nodeLinksMap.has(t)) nodeLinksMap.get(t).push(l);
  });
  return { neighborNodesMap, nodeLinksMap, nodeByIdMap };
}

// Filter an original graph down to the nodes/links matching the current filter
// state, and re-derive the links that connect surviving nodes. `multiSelect` is
// { type, repo, project, tag } of Sets. Text filters are matched case-insensitively.
export function applyFilters(originalData, {
  search = '', name = '', title = '', multiSelect, families = null,
}) {
  const searchTerm = search.toLowerCase();
  const nameFilter = name.toLowerCase();
  const titleFilter = title.toLowerCase();

  const filteredNodes = originalData.nodes.filter((node) => {
    if (searchTerm) {
      const nameMatch = (node.name || '').toLowerCase().includes(searchTerm);
      const titleMatch = (node.title || '').toLowerCase().includes(searchTerm);
      if (!nameMatch && !titleMatch) return false;
    }
    if (nameFilter && !(node.name || '').toLowerCase().includes(nameFilter)) return false;
    if (titleFilter && !(node.title || '').toLowerCase().includes(titleFilter)) return false;
    if (multiSelect.type.size > 0 && !multiSelect.type.has(node.type)) return false;
    // repo/project are node PROPERTIES here (nodes are colored by OS layer from
    // `path`, not a synthetic 'file' node type). Filter any node that carries the
    // property; nodes without it are left unaffected.
    if (multiSelect.repo.size > 0 && node.repo && !multiSelect.repo.has(node.repo)) return false;
    if (multiSelect.project.size > 0 && node.project && !multiSelect.project.has(node.project)) return false;
    return true;
  });

  const validNodeIds = new Set(filteredNodes.map((n) => n.id));

  if (multiSelect.tag.size > 0) {
    // Tags are a node property (array, or a "[a, b]"/"a,b" string), not synthetic tag_* nodes.
    for (const id of [...validNodeIds]) {
      const n = filteredNodes.find((x) => x.id === id);
      if (!n) continue;
      const tags = parseNodeTags(n.tags);
      if (tags.length > 0 && !tags.some((t) => multiSelect.tag.has(t))) validNodeIds.delete(id);
    }
  }

  const narrowing = families instanceof Set
    && families.size > 0
    && families.size < EDGE_FAMILY_ORDER.length;

  const filteredLinks = originalData.links.filter((link) => {
    if (narrowing && !families.has(link.family)) return false;
    return validNodeIds.has(linkEndId(link.source)) && validNodeIds.has(linkEndId(link.target));
  });

  // When the family filter narrows, drop nodes left with no surviving link.
  // Otherwise "Declared only" renders 800 isolated dots around 385 edges and
  // the structure it exists to reveal is buried in noise.
  let keep = validNodeIds;
  if (narrowing) {
    keep = new Set();
    filteredLinks.forEach((l) => {
      keep.add(linkEndId(l.source));
      keep.add(linkEndId(l.target));
    });
  }

  return { nodes: originalData.nodes.filter((n) => keep.has(n.id)), links: filteredLinks };
}

// Count links per family across a graph, for the legend and the default choice.
export function countEdgeFamilies(links) {
  const counts = { declared: 0, dangling: 0, similarity: 0 };
  (links || []).forEach((l) => {
    const f = l.family || EDGE_FAMILY.SIMILARITY;
    if (counts[f] !== undefined) counts[f] += 1;
  });
  return counts;
}

// The family selection a freshly-loaded graph should open with. Declared
// structure is the point of the view, so it wins whenever any exists; a graph
// with none (a pure similarity export) still shows something rather than
// opening empty.
export function defaultFamilies(links) {
  const c = countEdgeFamilies(links);
  if (c.declared + c.dangling === 0) return new Set(EDGE_FAMILY_ORDER);
  return new Set([EDGE_FAMILY.DECLARED, EDGE_FAMILY.DANGLING]);
}

// Collect the distinct filter option values present across a graph's nodes.
export function collectFilterOptions(nodes) {
  const repos = new Set(), projects = new Set(), tags = new Set(), types = new Set();
  nodes.forEach((n) => {
    if (n.repo) repos.add(n.repo);
    if (n.project) projects.add(n.project);
    parseNodeTags(n.tags).forEach((t) => tags.add(t));
    if (n.type) types.add(n.type);
  });
  return {
    type: Array.from(types).sort(),
    repo: Array.from(repos).sort(),
    project: Array.from(projects).sort(),
    tag: Array.from(tags).sort(),
  };
}
