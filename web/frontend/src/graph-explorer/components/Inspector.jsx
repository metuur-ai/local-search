// Node detail panel. Shown when a node is selected; renders its properties,
// namespaced tag groups (plain / spec: / link:), and up to 100 connections.
// Ported from the former populateInspector().

import { colors, EDGE_FAMILY_META } from '../graphData.js';
import { RevealButton } from '../../components/RevealButton.jsx';

const cleanTag = (t) => String(t).replace(/[\[\]]/g, '').trim();

// Split a node's tags into plain / spec: / link: groups, stripping the namespace.
function groupTags(node) {
  const rawTags = (node.raw && node.raw.tags) || node.tags;
  let tagList = [];
  if (typeof rawTags === 'string') tagList = rawTags.split(',').map(cleanTag).filter(Boolean);
  else if (Array.isArray(rawTags)) tagList = rawTags.map(cleanTag).filter(Boolean);
  const groups = { spec: [], link: [], plain: [] };
  tagList.forEach((t) => {
    const m = /^(spec|link):(.+)$/i.exec(t);
    if (m) groups[m[1].toLowerCase()].push(m[2].trim());
    else groups.plain.push(t);
  });
  return groups;
}

function TagRow({ label, cls, list }) {
  if (!list.length) return null;
  return (
    <div class="prop">
      <span class="prop-key">{label}</span>
      <span class="prop-tags">
        {list.map((t, i) => (
          <span class={`tag-chip ${cls}`.trim()} key={`${t}-${i}`}>{t}</span>
        ))}
      </span>
    </div>
  );
}

export function Inspector({ node, getConnections, onSelectId, onClose }) {
  if (!node) return null;

  const typeColor = node.renderColor || colors[node.type] || 'var(--accent)';
  const path = (node.raw && node.raw.path) || node.path;
  const repo = node.repo || (node.raw && node.raw.repo) || '';
  const groups = groupTags(node);
  const hasTags = groups.plain.length || groups.spec.length || groups.link.length;
  // Declared frontmatter classification, exported as doc_type/status.
  const docType = node.doc_type || (node.raw && node.raw.doc_type) || '';
  const status = node.status || (node.raw && node.raw.status) || '';
  const summary = node.summary || (node.raw && node.raw.summary) || '';
  const unresolved = node.flags === 'unresolved';
  const conflict = node.flags === 'conflict';
  const hasProps = node.title || node.repo || node.project || path || hasTags || docType || status;

  const connections = getConnections(node);
  const shownConns = connections.slice(0, 100);
  const declaredCount = connections.filter((c) => c.relation).length;

  return (
    <div class="inspector">
      <div class="inspector-head">
        <div style="min-width:0">
          <div id="inspector-type" style={{ color: typeColor }}>
            {node.type}
            {docType && <span class="badge badge-doctype">{docType}</span>}
            {status && <span class="badge badge-status">{status}</span>}
            {unresolved && <span class="badge badge-unresolved" title="Referenced by an edge but declared in no indexed file">unresolved</span>}
            {conflict && <span class="badge badge-conflict" title="This canonical ID is declared by more than one file">conflict</span>}
          </div>
          <h3 id="inspector-title">{node.name || node.id}</h3>
        </div>
        <button type="button" class="icon-btn" onClick={onClose} aria-label="Close inspector">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="inspector-body">
        <div style="margin-bottom:20px">
          <div class="section-label">Properties</div>
          <div class="props">
            {hasProps ? (
              <>
                {node.title && <div class="prop"><span class="prop-key">Title</span>{node.title}</div>}
                {docType && <div class="prop"><span class="prop-key">Type</span>{docType}</div>}
                {status && <div class="prop"><span class="prop-key">Status</span>{status}</div>}
                {node.repo && <div class="prop"><span class="prop-key">Repo</span>{node.repo}</div>}
                {node.project && <div class="prop"><span class="prop-key">Project</span>{node.project}</div>}
                {path && (
                  <div class="prop">
                    <span class="prop-key">Path</span>
                    <span class="prop-path">{path}</span>
                    {/* Graph nodes carry no absolute path — the server joins this
                        repo-relative one onto the registered repo root. */}
                    <RevealButton repo={repo} path={path} />
                  </div>
                )}
                <TagRow label="Tags" cls="" list={groups.plain} />
                <TagRow label="Specs" cls="tag-chip-spec" list={groups.spec} />
                <TagRow label="Links" cls="tag-chip-link" list={groups.link} />
              </>
            ) : (
              <div class="empty">No extra properties</div>
            )}
          </div>
        </div>
        {summary && (
          <div style="margin-bottom:20px">
            <div class="section-label">Summary</div>
            <div class="prop-summary">{summary}</div>
          </div>
        )}
        <div>
          <div class="section-label">
            Connections · <span>{connections.length}</span>
            {declaredCount > 0 && (
              <span class="section-note">{declaredCount} declared</span>
            )}
          </div>
          <div class="conns">
            {shownConns.map((c, i) => (
              <button
                type="button"
                class={`conn conn-nav${c.relation ? ' conn-declared' : ''}`}
                key={`${c.relation}-${c.outgoing ? 'o' : 'i'}-${c.id}-${i}`}
                onClick={() => onSelectId && onSelectId(c.id)}
                title={[
                  c.name,
                  c.relation ? `${c.outgoing ? '→' : '←'} ${c.relation}` : 'lexical similarity',
                  c.location || '',
                  c.unresolved ? 'target declared in no indexed file' : '',
                ].filter(Boolean).join('\n')}
              >
                <span class="conn-dot" style={{ background: c.color }} />
                {c.relation && (
                  <span
                    class="conn-rel"
                    style={{ color: (EDGE_FAMILY_META[c.family] || {}).color }}
                  >
                    {c.outgoing ? '→' : '←'} {c.relation}
                  </span>
                )}
                <span class="conn-name">{c.name}</span>
                {c.unresolved && <span class="conn-flag">?</span>}
              </button>
            ))}
            {connections.length > 100 && <div class="conn-more">…and more</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
