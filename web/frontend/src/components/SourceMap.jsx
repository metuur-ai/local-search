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
import './SourceMap.css';

// Header copy is a requirement, not decoration (R-1.6), so it lives next to the
// component rather than inline in the markup where it reads as filler.
const GROUPING_NOTE =
  'Branches group the retrieved sources by where their files live — repository, then project folder. Counts are documents beneath each branch.';

function Leaf({ row }) {
  const label = row.title || row.name || row.path || '(untitled)';
  return (
    <li class="source-map-leaf" data-testid="source-map-leaf">
      <span class="source-map-leaf-label">{label}</span>
    </li>
  );
}

function ProjectBranch({ branch }) {
  return (
    <li class="source-map-branch" data-testid={`branch-${branch.name}`}>
      <details open>
        <summary class="source-map-summary">
          <span class="source-map-branch-name">{branch.name}</span>
          <span class="source-map-count">{branch.count}</span>
        </summary>
        <ul class="source-map-leaves">
          {branch.sources.map((row) => (
            <Leaf row={row} key={row.path || row.name} />
          ))}
        </ul>
      </details>
    </li>
  );
}

function RepoBranch({ branch }) {
  return (
    <li class="source-map-branch" data-testid={`branch-${branch.name}`}>
      <details open>
        <summary class="source-map-summary">
          <span class="source-map-branch-name">{branch.name}</span>
          <span class="source-map-count">{branch.count}</span>
        </summary>
        <ul class="source-map-branches">
          {branch.projects.map((project) => (
            <ProjectBranch branch={project} key={project.key} />
          ))}
        </ul>
      </details>
    </li>
  );
}

/**
 * <SourceMap sources active />
 *
 * `active` is the selected-tab flag. Every inspector pane stays mounted and is
 * toggled by `hidden`, so without this gate the tree would rebuild on every
 * `sources` event of every run while the user reads another tab — the problem
 * documented at GraphView.jsx:170-174 (R-1.3).
 */
export function SourceMap({ sources = [], active = false }) {
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
        {GROUPING_NOTE}
      </p>
      <ul class="source-map-branches source-map-root" data-testid="source-tree">
        {tree.repoName === null
          ? tree.branches.map((repo) => <RepoBranch branch={repo} key={repo.key} />)
          : tree.branches.map((project) => <ProjectBranch branch={project} key={project.key} />)}
      </ul>
    </div>
  );
}
