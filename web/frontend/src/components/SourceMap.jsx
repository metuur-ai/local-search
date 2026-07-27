// Source Map pane — where the retrieved sources came from, grouped by file
// location. Answers "is this mix of documents defensible" at a glance, which the
// ranked list cannot: a flat list of 28 rows hides that 24 of them came from one
// project.
//
// Branch edges here are CONTAINMENT (this file lives under that project, in that
// repo) — a fact read straight off `repo` and `path`. They are deliberately not
// described as relationship, similarity, or relevance links (R-1.6), per the
// honesty doctrine in docs/ears/explainable-search-web-ui.md R-4.4.

import { useCallback, useMemo, useState } from 'preact/hooks';
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

// Branch expansion is held as the set of COLLAPSED keys, not expanded ones (R-4.5,
// D6). Every branch defaults open, and a branch that first appears mid-stream is
// absent from the set, so it opens without anyone having to remember to add it.
//
// `rows` is the `sources` array as it stood when the user last collapsed something
// — see `sameRun` for what it is for.
const NOTHING_COLLAPSED = { rows: [], keys: new Set() };

// Is `rows` the same run's `sources` array, grown, as `prevRows` was?
//
// Within a run `sources` only ever grows and REUSES its existing row objects:
// `mergeSources` slices the previous array and pushes only the rows it has not
// seen (app.jsx:60-70), and the handler accumulates one event per searched repo
// (app.jsx:257-258, LLD constraint 4). So an unchanged object-identity prefix means
// "same run, more rows" and the user's collapse still refers to this tree.
//
// Every other writer of `sources` replaces it outright with freshly built rows: a
// new run clears it (`setSources([])`, app.jsx:304) and a restored run rebuilds it
// (`setSources(mergeSources([], run.sources))`, app.jsx:629) — both mint new
// objects via `{ ...r, tags }` (app.jsx:67). The prefix check therefore fails and
// the tree comes back fully expanded (R-4.3, R-4.4, R-4.5).
//
// Identity rather than `sourceKey` on purpose. Re-running the same query returns
// the same DOCUMENTS under the same branch keys — nothing about the tree's shape
// says "new run" — but never the same objects. Comparing keys would resurrect the
// previous run's collapse there; comparing references cannot.
function sameRun(prevRows, rows) {
  if (rows.length < prevRows.length) return false;
  for (let i = 0; i < prevRows.length; i++) {
    if (prevRows[i] !== rows[i]) return false;
  }
  return true;
}

// The collapsed keys that still apply to `rows`, or none. Skips the prefix walk
// entirely on the common path, where the user has collapsed nothing.
function collapsedFor(state, rows) {
  return state.keys.size > 0 && sameRun(state.rows, rows) ? state.keys : NOTHING_COLLAPSED.keys;
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

// One branch row, for both levels. Native <details>/<summary> (R-5.2) — keyboard
// operation and the roles assistive technology reads come from the elements, so no
// disclosure widget is hand-rolled here. Only `open` changes hands.
function Branch({ branch, collapsed, onToggle, children }) {
  return (
    <li class="source-map-branch" data-testid={`branch-${branch.name}`}>
      {/* `open` is driven from state, and the summary's default action is
          CANCELLED so the browser never writes `open` itself (R-4.2a, D5). That
          leaves exactly one writer: without it, `<details>` would flip `open` on
          its own and Preact — which diffs props against the PREVIOUS vnode, not
          against the DOM — would skip re-asserting a value it believes unchanged,
          leaving the element open while state says collapsed.

          Cancelling covers the keyboard too: activating a focused <summary> with
          Enter or Space dispatches this same click event. */}
      <details open={!collapsed}>
        <summary
          class="source-map-summary"
          onClick={(e) => {
            e.preventDefault();
            onToggle(branch.key);
          }}
        >
          <span class="source-map-branch-name">{branch.name}</span>
          <span class="source-map-count">{branch.count}</span>
        </summary>
        {children}
      </details>
    </li>
  );
}

function ProjectBranch({ branch, collapsed, onToggle, onSelect }) {
  return (
    <Branch branch={branch} collapsed={collapsed.has(branch.key)} onToggle={onToggle}>
      <ul class="source-map-leaves">
        <Leaves rows={branch.sources} onSelect={onSelect} />
      </ul>
    </Branch>
  );
}

function RepoBranch({ branch, collapsed, onToggle, onSelect }) {
  return (
    <Branch branch={branch} collapsed={collapsed.has(branch.key)} onToggle={onToggle}>
      <ul class="source-map-branches">
        {branch.projects.map((project) => (
          <ProjectBranch
            branch={project}
            collapsed={collapsed}
            onToggle={onToggle}
            onSelect={onSelect}
            key={project.key}
          />
        ))}
      </ul>
    </Branch>
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
  // Gated inside the memo, so an inactive pane performs no grouping at all. The
  // dependency on `sources` is what satisfies R-4.1: a run merges rows in batches
  // (LLD constraint 4), each merge hands down a new array, and the tree rebuilds.
  const tree = useMemo(() => (active ? buildSourceTree(sources) : null), [active, sources]);

  // R-4.2a/D5: expansion lives here rather than in the DOM, because R-2.6 orders
  // branches by descending count and counts change as rows stream in — so branches
  // re-order mid-run, and a tree that gains a second repo re-nests them entirely.
  // Keyed by `branch.key`, which is derived from repo and project names and never
  // from position (R-2.6a, sourceTree.js:33-35).
  const [collapsedState, setCollapsedState] = useState(NOTHING_COLLAPSED);
  const collapsed = collapsedFor(collapsedState, sources);

  // Re-derived inside the updater rather than closed over, so a toggle can never
  // extend a set that belongs to a run already gone.
  const onToggle = useCallback(
    (key) => {
      setCollapsedState((prev) => {
        const keys = new Set(collapsedFor(prev, sources));
        if (!keys.delete(key)) keys.add(key);
        return { rows: sources, keys };
      });
    },
    [sources],
  );

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
                <RepoBranch
                  branch={repo}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  onSelect={onSelectSource}
                  key={repo.key}
                />
              ))
            : tree.branches.map((project) => (
                <ProjectBranch
                  branch={project}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  onSelect={onSelectSource}
                  key={project.key}
                />
              ))}
        </ul>
      )}
    </div>
  );
}
