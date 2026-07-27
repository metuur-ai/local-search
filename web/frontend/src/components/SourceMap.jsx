// Source Map pane — where the retrieved sources came from, grouped by file
// location. Answers "is this mix of documents defensible" at a glance, which the
// ranked list cannot: a flat list of 28 rows hides that 24 of them came from one
// project.
//
// Branch edges here are CONTAINMENT (this file lives under that project, in that
// repo) — a fact read straight off `repo` and `path`. They are deliberately not
// described as relationship, similarity, or relevance links (R-1.6), per the
// honesty doctrine in docs/ears/explainable-search-web-ui.md R-4.4.

import { useMemo } from 'preact/hooks';
import { buildSourceTree } from './sourceTree.js';
// Shared, not re-derived here. Tags arrive as a string on the AI path
// (cli/db/query.go:24) and as "" or "[a, b, c]" from the graph DB, so a second
// parser would eventually disagree with the one `mergeSources` uses; and
// `sourceKey` is the identity `mergeSources` dedupes on, which is exactly the
// identity a leaf must carry (R-3.2, R-3.6).
import { normalizeTags, sourceKey } from '../sourceIdentity.js';
import { RevealButton } from './RevealButton.jsx';
import './SourceMap.css';

// Header copy is a requirement, not decoration (R-1.6, R-2.12), so it lives next
// to the component rather than inline in the markup where it reads as filler.
const GROUPING_NOTE =
  'Branches group the retrieved sources by where their files live — repository, then project folder. Counts are documents beneath each branch.';

// R-2.11/D9: below 2 groups there is nothing to group by, so the pane says so
// rather than drawing one box around the whole result set.
const FLAT_NOTE =
  'These sources all sit in the same place, so there was nothing to group by — listed flat instead.';

// R-2.12/D8: the tree counts every retrieved source, matching Sources & Provenance
// and Top Tags. The left console shows the filtered view, so those two numbers can
// legitimately differ and the header has to say which one this is.
function scopeNote(total) {
  return `Covers all ${total} retrieved ${total === 1 ? 'source' : 'sources'}, not the filtered view.`;
}

function Leaf({ row, onSelect }) {
  const label = row.title || row.name || row.path || '(untitled)';
  const tags = normalizeTags(row.tags);
  const select = () => onSelect?.(row);

  return (
    <li class="source-map-leaf" data-testid="source-map-leaf">
      {/* The <li> stays a listitem and the activation target is an inner div, not
          a <button>: the leaf nests its own reveal action, and a button inside a
          button is invalid. role/tabIndex/onKeyDown restore what a <button> would
          have given us — the same trade the result cards make (app.jsx:1027-1029).
          RevealButton stops click propagation, so it can sit inside this row
          without also selecting it (RevealButton.jsx:37-39). */}
      <div
        role="button"
        tabIndex={0}
        class="source-map-leaf-row"
        data-testid="source-map-leaf-activate"
        onClick={select}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            select();
          }
        }}
      >
        <span class="source-map-leaf-label" title={row.path || row.fullpath || label}>
          {label}
        </span>
        {tags.length > 0 && (
          <span class="source-map-leaf-tags">
            {tags.map((t) => (
              <span class="source-map-leaf-tag" data-testid="source-map-leaf-tag" key={t}>
                #{t}
              </span>
            ))}
          </span>
        )}
        {/* R-3.5: `json related` rows carry a synthetic `path` and an EMPTY
            `fullpath` (cli/db/query.go:501-510), so both are handed over and the
            server resolves whichever it got. RevealButton renders nothing at all
            when neither is present, so no no-op control ships. */}
        <RevealButton repo={row.repo} path={row.path} fullpath={row.fullpath} compact />
      </div>
    </li>
  );
}

// Leaves are keyed by `sourceKey`, the same identity `mergeSources` dedupes on
// (R-3.6) — `name` alone collides across repos.
function Leaves({ rows, onSelect }) {
  return rows.map((row) => <Leaf row={row} onSelect={onSelect} key={sourceKey(row)} />);
}

function ProjectBranch({ branch, onSelect }) {
  return (
    <li class="source-map-branch" data-testid={`branch-${branch.name}`}>
      <details open>
        <summary class="source-map-summary">
          <span class="source-map-branch-name">{branch.name}</span>
          <span class="source-map-count">{branch.count}</span>
        </summary>
        <ul class="source-map-leaves">
          <Leaves rows={branch.sources} onSelect={onSelect} />
        </ul>
      </details>
    </li>
  );
}

function RepoBranch({ branch, onSelect }) {
  return (
    <li class="source-map-branch" data-testid={`branch-${branch.name}`}>
      <details open>
        <summary class="source-map-summary">
          <span class="source-map-branch-name">{branch.name}</span>
          <span class="source-map-count">{branch.count}</span>
        </summary>
        <ul class="source-map-branches">
          {branch.projects.map((project) => (
            <ProjectBranch branch={project} onSelect={onSelect} key={project.key} />
          ))}
        </ul>
      </details>
    </li>
  );
}

/**
 * <SourceMap sources active onSelectSource />
 *
 * `active` is the selected-tab flag. Every inspector pane stays mounted and is
 * toggled by `hidden`, so without this gate the tree would rebuild on every
 * `sources` event of every run while the user reads another tab — the problem
 * documented at GraphView.jsx:170-174 (R-1.3).
 *
 * `onSelectSource(row)` is the app's shared source-selection handler, so a leaf
 * lands the user on the same detail block its result card would (R-3.3).
 */
export function SourceMap({ sources = [], active = false, onSelectSource }) {
  // Gated inside the memo, so an inactive pane performs no grouping at all.
  const tree = useMemo(() => (active ? buildSourceTree(sources) : null), [active, sources]);

  if (!active) return null;

  if (tree.total === 0) {
    return (
      <p class="source-map-empty" data-testid="source-map-empty">
        No sources retrieved yet. Run a query and the documents behind the answer will appear here,
        grouped by where their files live.
      </p>
    );
  }

  return (
    <div class="source-map" data-testid="source-map">
      <p class="source-map-header" data-testid="source-map-header">
        {tree.flat ? FLAT_NOTE : GROUPING_NOTE} {scopeNote(tree.total)}
      </p>

      {tree.flat ? (
        // No disclosure elements at all — a lone <details> would be the "flat list
        // with boxes drawn around it" D9 refuses to ship.
        <ul class="source-map-leaves source-map-root" data-testid="source-list">
          <Leaves rows={tree.branches[0].sources} onSelect={onSelectSource} />
        </ul>
      ) : (
        <ul class="source-map-branches source-map-root" data-testid="source-tree">
          {tree.repoName === null
            ? tree.branches.map((repo) => (
                <RepoBranch branch={repo} onSelect={onSelectSource} key={repo.key} />
              ))
            : tree.branches.map((project) => (
                <ProjectBranch branch={project} onSelect={onSelectSource} key={project.key} />
              ))}
        </ul>
      )}
    </div>
  );
}
