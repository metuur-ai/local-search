// Help modal: how to use the page, install, and docs links. Closes on the
// close button, backdrop click, or Escape. Ported from the former help modal.

import { useEffect } from 'preact/hooks';

export function HelpModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal-panel" role="dialog" aria-modal="true" aria-label="Help">
        <div class="modal-head">
          <h2>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
              <circle cx="5" cy="6" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="19" cy="7" r="1.5" fill="currentColor" stroke="none" />
              <path d="M12 12 L5 6 M12 12 L19 7" opacity="0.6" />
            </svg>
            Agent OS Graph
          </h2>
          <button type="button" class="icon-btn" aria-label="Close help" onClick={onClose}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <p class="modal-lead">An interactive knowledge atlas of your registered repositories — files, tags, projects, and repos rendered as a force-directed graph you can search, filter, and inspect.</p>

          <div class="modal-section">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            How to use
          </div>
          <ol>
            <li><strong>Search</strong> files, tags, or projects from the top bar to spotlight matches.</li>
            <li><strong>Filter</strong> by file type, repo, directory, or tag — active filters show as removable chips.</li>
            <li><strong>Click a node</strong> to open the inspector with its properties and connections.</li>
            <li>Use the dock to <strong>zoom</strong>, <strong>fit to screen</strong>, or pause <strong>physics</strong>; toggle <strong>All labels</strong> to reveal every name.</li>
            <li><strong>Refresh from repos</strong> rebuilds the graph from selected repos, or <strong>Upload JSON</strong> to load your own export.</li>
          </ol>

          <div class="modal-section" data-testid="help-graph-format">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m-6-8h2M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
            </svg>
            Graph file format
          </div>
          <p><strong>Upload JSON</strong> takes a node-link graph: an object with a <code>nodes</code> array and a <code>links</code> array. <code>edges</code> is accepted as a synonym for <code>links</code>.</p>
          <code class="block">{`{
  "nodes": [
    { "id": "platforms/billing/README.md",
      "name": "Billing", "title": "Billing platform",
      "path": "platforms/billing/README.md",
      "repo": "company-os", "project": "billing",
      "tags": ["platform", "payments"], "val": 6 },
    { "id": "platforms/ledger/README.md", "flags": "unresolved" }
  ],
  "links": [
    { "source": "platforms/billing/README.md",
      "target": "platforms/ledger/README.md",
      "relation": "depends_on" }
  ]
}`}</code>
          <p>On a node, only <code>id</code> is required, and it must be unique — link endpoints are matched by id, and a repeated id makes the duplicates indistinguishable to every endpoint that points at it. Everything else is optional:</p>
          <ul class="modal-cmds">
            <li><code>name</code> / <code>label</code> / <code>title</code><span>The canvas label, taken from the first one present, falling back to the <code>id</code>. <code>name</code> and <code>title</code> are also what Search and the Name/Title filters match on.</span></li>
            <li><code>type</code><span>Colors the node and fills the Type filter. Without it the node is typed by OS layer from its <code>path</code>.</span></li>
            <li><code>path</code><span>Classifies an untyped node into a layer — platform, team, ontology, PRD, standard, research, doc — which is what gives it its color. Shown in the inspector.</span></li>
            <li><code>repo</code> / <code>project</code><span>Fill the Repo and Project filters. A node carrying neither is never hidden by them.</span></li>
            <li><code>tags</code><span>An array, or a <code>"a,b"</code> / <code>"[a, b]"</code> string. Fills the Tag filter. Tags on this shape stay node properties — they do not become hub nodes.</span></li>
            <li><code>val</code><span>Node radius. Defaults to 4.</span></li>
            <li><code>flags</code><span>Set to <code>"unresolved"</code> to mark a node as referenced but never declared, which is what makes links into it dangling.</span></li>
          </ul>
          <p>On a link, <code>source</code> and <code>target</code> are node <code>id</code> values, and <code>relation</code> is what promotes a link out of the grey similarity family. The viewer derives the family itself — a <code>family</code> written into the file is recomputed, not honoured:</p>
          <ul class="modal-cmds">
            <li><code>declared</code><span>Has a <code>relation</code>, and both endpoints resolve to nodes that are not flagged <code>unresolved</code>. Drawn solid teal.</span></li>
            <li><code>dangling</code><span>Has a <code>relation</code>, but an endpoint is missing from <code>nodes</code> or is flagged <code>unresolved</code>. Drawn dashed amber.</span></li>
            <li><code>similarity</code><span>No <code>relation</code> at all — a lexical resemblance rather than a claim anyone wrote down. Drawn faint grey.</span></li>
          </ul>
          <p>A freshly loaded graph opens on <strong>Declared</strong> and <strong>Unresolved</strong> whenever it has any of either, since declared structure is the point of the view. A graph with neither — every link a similarity link — opens on all three families instead of opening empty.</p>
          <p>A plain <strong>array of file records</strong> is also accepted, and is the easier shape to hand-write. It has no links of its own: the viewer synthesizes a hub node per distinct <code>repo</code>, <code>project</code>, and tag, and links each file to the hubs it belongs to.</p>
          <code class="block">{`[
  { "id": "billing-readme", "name": "README.md",
    "title": "Billing platform", "type": "file",
    "repo": "company-os", "project": "billing",
    "tags": ["platform", "payments"] }
]`}</code>
          <p>Only <code>id</code> is read as an identity — a record without one is numbered <code>file_0</code>, <code>file_1</code>, … by position. <code>name</code> is the canvas label (<code>Unknown Node</code> if absent), <code>title</code> is searchable alongside it, <code>type</code> colors the node and defaults to <code>file</code>, and <code>val</code> sets its radius. <code>tags</code> takes an array or a <code>"a,b"</code> / <code>"[a, b]"</code> string.</p>
          <p>The hub nodes are given the ids <code>repo_&lt;repo&gt;</code>, <code>proj_&lt;project&gt;</code>, and <code>tag_&lt;tag&gt;</code>. Because tags become hubs on this shape rather than staying node properties, the Tag filter has nothing to list — you narrow by tag by clicking its hub instead.</p>
          <p>What this shape cannot do is state a typed relation. There is nowhere to put a <code>relation</code>, so every link in the resulting graph is one the viewer invented from shared membership, and all of them are <strong>similarity</strong> links. A flat-array graph therefore has no declared structure at all and opens on all three families. If you want <code>depends_on</code> to mean something, use the node-link shape.</p>
          <p>Ids matter twice over if the file is to be blended with the local-search graph rather than replace it. Blending concatenates the two, so an id used by both puts two nodes on the canvas under one id, and every link naming it resolves to only one of them — not necessarily yours. Prefix your ids, and remember that a repo or tag sharing a name with one already on the canvas produces a colliding <code>repo_</code> or <code>tag_</code> hub too.</p>

          <div class="modal-section">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Install
          </div>
          <p>One command installs the CLI, the Claude skill, and this web UI:</p>
          <code class="block">tmp=$(mktemp -d) && curl -fsSL https://github.com/metuur-ai/local-search/releases/latest/download/local-search-bundle.tar.gz | tar -xz -C "$tmp" && bash "$tmp/bundle/install.sh"</code>
          <p>Then launch the UI (needs Node ≥ 18) and open the graph explorer:</p>
          <code class="block">local-search ui</code>
          <p>More install options (release bundle, prebuilt binary, build from source) on <a href="https://github.com/metuur-ai/local-search/blob/main/README.md#install" target="_blank" rel="noopener noreferrer">the install guide ↗</a>.</p>

          <div class="modal-section">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Handy CLI commands
          </div>
          <ul class="modal-cmds">
            <li><code>local-search doctor</code><span>Diagnose install, config, DB health, and stale-index drift.</span></li>
            <li><code>local-search size</code><span>DB file size and a per-repo index breakdown.</span></li>
            <li><code>local-search scan</code><span>Rebuild the graph after <code>doctor</code> reports drift.</span></li>
            <li><code>local-search config validate</code><span>Strict-check the config; reports problems with line numbers.</span></li>
          </ul>

          <div class="modal-section">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Which repos get searched
          </div>
          <p>One config file decides it, and both this UI and the CLI read the same one:</p>
          <code class="block">&lt;project&gt;/.agent/local-search-config.yaml</code>
          <p>It is found by walking up from your working directory, stopping at a git repository root. A global fallback lives at <code>~/.local-search-config.yaml</code>. Edit it with <code>local-search scope set a,b</code> or <code>local-search init --set a,b</code> — both write the same <code>repositories:</code> list, and neither disturbs any <code>weights:</code> or <code>limits:</code> you have set.</p>
          <p>Upgrading from v0.3.x? A <code>.local-search.toml</code> is converted automatically on first run. Preview it with <code>local-search config migrate --dry-run</code>, or set <code>LOCAL_SEARCH_NO_AUTO_MIGRATE=1</code> to opt out. See the <a href="https://github.com/metuur-ai/local-search/blob/main/user-guide/reference/upgrading-to-0.4.md" target="_blank" rel="noopener noreferrer">upgrade notes ↗</a>.</p>

          <div class="modal-section">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.247m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.247" />
            </svg>
            More documentation
          </div>
          <p>Full guide, search syntax, and configuration on <a href="https://github.com/metuur-ai/local-search/blob/main/user-guide/index.md" target="_blank" rel="noopener noreferrer">GitHub ↗</a>.</p>
        </div>
      </div>
    </div>
  );
}
