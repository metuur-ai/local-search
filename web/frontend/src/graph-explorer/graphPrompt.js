// The prompt a user hands to a model to get a graph file the Upload control accepts.
//
// It lives here rather than inline in `HelpModal.jsx` so that it is unit-testable
// without rendering the modal, and so that the fields the guide documents and the
// fields the prompt asks for stay one source of truth (see graphPrompt.test.js).
//
// Every field named below is one `normalizeGraph` or `synthesizeGraphData` actually
// reads. Notably absent: a link `family`. The viewer recomputes it from `relation`
// and the endpoints, so asking a model to author one would produce a field that is
// silently overwritten.
export const GRAPH_PROMPT = `Produce a graph file for the local-search Graph Explorer.

Output a single JSON document and nothing else: no explanation, no preamble, no
markdown code fence around it. The first character must be \`{\` or \`[\`.

Pick one of the two shapes below.

Shape A — node-link (preferred: it is the only shape that can state typed relations)

An object with a \`nodes\` array and a \`links\` array (\`edges\` is accepted as a
synonym for \`links\`).

{
  "nodes": [
    { "id": "platforms/billing/README.md",
      "name": "Billing", "title": "Billing platform",
      "path": "platforms/billing/README.md",
      "repo": "company-os", "project": "billing",
      "tags": ["platform", "payments"], "val": 6 },
    { "id": "platforms/ledger/README.md",
      "name": "Ledger", "path": "platforms/ledger/README.md",
      "repo": "company-os", "project": "ledger" },
    { "id": "platforms/pricing/README.md", "flags": "unresolved" }
  ],
  "links": [
    { "source": "platforms/billing/README.md",
      "target": "platforms/ledger/README.md",
      "relation": "depends_on" },
    { "source": "platforms/billing/README.md",
      "target": "platforms/pricing/README.md",
      "relation": "depends_on" }
  ]
}

On a node, only \`id\` is required, and every \`id\` must be unique across \`nodes\`.
Link endpoints are matched by \`id\`, so a repeated \`id\` makes the duplicates
indistinguishable to everything that points at them. Every other field is optional:

- \`name\` / \`label\` / \`title\` — the canvas label, taken from the first one present
  and otherwise falling back to the \`id\`. \`name\` and \`title\` are also what search
  and the Name/Title filters match on.
- \`type\` — colors the node and fills the Type filter.
- \`path\` — repo-relative path. When \`type\` is absent the node is typed by the layer
  derived from this path (platform, team, ontology, prd, standard, research, doc).
- \`repo\` / \`project\` — fill the Repo and Project filters.
- \`tags\` — an array of strings, or a "a,b" / "[a, b]" string. Fills the Tag filter;
  on this shape tags stay node properties and do not become extra nodes.
- \`val\` — node radius. Defaults to 4.
- \`flags\` — set to "unresolved" to mark a node as referenced but never declared.

On a link, \`source\` and \`target\` are node \`id\` values and \`relation\` names the
relationship (for example "depends_on"). Do not write a \`family\` onto a link: the
viewer derives it, so a family written into the file is recomputed, not honoured. A link
with a \`relation\` whose endpoints both resolve to nodes that are not flagged
"unresolved" is declared; a link with a \`relation\` whose endpoint is missing from
\`nodes\` or is flagged "unresolved" is dangling; a link with no \`relation\` is
similarity.

Shape B — flat array of file records (easier to hand-write, strictly less expressive)

A plain array of records with no links of its own. The viewer synthesizes one hub
node per distinct \`repo\`, \`project\` and tag, and links each record to the hubs it
belongs to.

[
  { "id": "billing-readme", "name": "README.md",
    "title": "Billing platform", "type": "file",
    "repo": "company-os", "project": "billing",
    "tags": ["platform", "payments"], "val": 4 }
]

Only these fields are read on this shape:

- \`id\` — the record identity, and it must be unique. A record without one is
  numbered by position instead (file_0, file_1, …).
- \`name\` — the canvas label ("Unknown Node" if absent).
- \`title\` — searchable alongside the name.
- \`type\` — colors the node. Defaults to "file".
- \`repo\` / \`project\` — fill the Repo and Project filters and become hub nodes with
  the ids repo_<repo> and proj_<project>.
- \`tags\` — an array of strings, or a "a,b" / "[a, b]" string. Each tag becomes a hub
  node with the id tag_<tag> rather than staying a node property, so the Tag filter
  has nothing to list on this shape.
- \`val\` — node radius. Defaults to 4.

Anything else in a record is preserved on the node but never read. This shape cannot express a
typed relation — there is nowhere to put one, so every synthesized link is a
similarity link and the graph has no declared structure. Use shape A if the
relationships matter.

Whichever shape you choose, keep ids stable and unique, and prefix them with
something specific to this graph if it may be blended with an existing one — two
nodes sharing an id collapse into one on the canvas.`;
