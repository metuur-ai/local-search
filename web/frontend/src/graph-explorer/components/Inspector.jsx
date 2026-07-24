// Node detail panel. Shown when a node is selected; renders its properties,
// namespaced tag groups (plain / spec: / link:), and up to 100 connections.
// Ported from the former populateInspector().

import { colors } from '../graphData.js';

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

export function Inspector({ node, getConnections, onClose }) {
  if (!node) return null;

  const typeColor = node.renderColor || colors[node.type] || 'var(--accent)';
  const path = (node.raw && node.raw.path) || node.path;
  const groups = groupTags(node);
  const hasTags = groups.plain.length || groups.spec.length || groups.link.length;
  const hasProps = node.title || node.repo || node.project || path || hasTags;

  const connections = getConnections(node);
  const shownConns = connections.slice(0, 100);

  return (
    <div class="inspector">
      <div class="inspector-head">
        <div style="min-width:0">
          <div id="inspector-type" style={{ color: typeColor }}>{node.type}</div>
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
                {node.repo && <div class="prop"><span class="prop-key">Repo</span>{node.repo}</div>}
                {node.project && <div class="prop"><span class="prop-key">Project</span>{node.project}</div>}
                {path && (
                  <div class="prop"><span class="prop-key">Path</span><span class="prop-path">{path}</span></div>
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
        <div>
          <div class="section-label">Connections · <span>{connections.length}</span></div>
          <div class="conns">
            {shownConns.map((c, i) => (
              <div class="conn" key={`${c.name}-${i}`}>
                <span class="conn-dot" style={{ background: c.color }} />
                <span title={c.name}>{c.name}</span>
              </div>
            ))}
            {connections.length > 100 && <div class="conn-more">…and more</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
