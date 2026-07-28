// Pure helper — turns the accumulated `sources` array into the two-level tree the
// Source Map pane renders. Kept free of rendering-library imports so the grouping
// rules stay unit-testable without mounting a component (R-2.10), matching the
// `graphElements.js` precedent.
//
// Grouped by `repo` then `project` (R-2.1). Deliberately NOT by `kindFromPath`
// (R-2.2): registered scan roots already point at the docs directory, so paths
// arrive as `hld/mobile-app-features.md` with no `docs/` segment to match and
// every row collapses into one `doc` bucket. See docs/lld — "Grouping axis".

// The extractor writes "_root" as the `project` of any file sitting at a repo
// root (`cli/extract/extract.go:443-450`). It is a real value, not a bug — but it
// is an internal token, so it gets a readable label (R-2.8).
const ROOT_PROJECT = '_root';

// Stands in for a missing `repo` or `project` in a branch key. NUL-prefixed so no
// real repo or project name can collide with it, which keeps every row with an
// absent field in ONE explicit branch rather than one branch per row (R-2.9).
const UNKNOWN = '\0?';

// A usable field value, or null when the row simply doesn't have one. Blank and
// whitespace-only count as absent: they would otherwise render as a nameless
// branch, which reads as a rendering bug rather than as missing data.
function fieldOrNull(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

// Branch identity, derived from field values only — never from position — so
// ordering changes during streaming cannot transfer one branch's expansion state
// to another (R-2.6a). NUL-separated because NUL cannot occur in a path segment,
// so no repo or project name can forge another branch's key. Keys carry the RAW
// values, never the display label, so relabeling can never merge two branches.
function branchKey(...parts) {
  return parts.map((p) => p ?? UNKNOWN).join('\0');
}

// What a project branch is called on screen (R-2.8, R-2.9). The raw value stays in
// the key; only this changes.
function projectLabel(projectName) {
  if (projectName === null) return 'unknown project';
  return projectName === ROOT_PROJECT ? 'repo root' : projectName;
}

// Sibling branch order: biggest first, because the skew is what the pane exists
// to show; alphabetical on a tie so equal-sized branches hold a stable position
// across rebuilds (R-2.6). Compared on the displayed label, so the order the user
// sees is the order the rule describes.
function byCountThenName(a, b) {
  return b.count - a.count || a.name.localeCompare(b.name);
}

// Leaves ascend by `relevance` because it is raw negative BM25 — lower is better
// (R-2.7, LLD constraint 1). Rows carrying no relevance sort last rather than
// leading on a NaN comparison.
function byRelevance(a, b) {
  const av = typeof a?.relevance === 'number' ? a.relevance : Infinity;
  const bv = typeof b?.relevance === 'number' ? b.relevance : Infinity;
  return av - bv;
}

// buildSourceTree(sources) → { total, repoName, branches, flat }
//
//   repoName  the single repo's name when the repo level was elided, else null.
//             The pane names it in the header instead of drawing a lone branch.
//   branches  repo branches — each with `projects` — or, when elided, the project
//             branches themselves, each with `sources`. `repoName` says which.
//   flat      true when the tree came out with fewer than 2 top-level branches
//             while still holding rows — the pane then renders `branches[0].sources`
//             as a plain list and says there was nothing to group by (R-2.11, D9).
//
// Every branch carries the number of documents beneath it (R-2.4), and no row is
// dropped, so top-level counts always sum to the total (R-2.5).
export function buildSourceTree(sources) {
  const rows = Array.isArray(sources) ? sources : [];

  const repos = new Map();

  for (const row of rows) {
    if (!row) continue;

    const repoName = fieldOrNull(row.repo);
    const projectName = fieldOrNull(row.project);

    const repoId = repoName ?? UNKNOWN;
    let repo = repos.get(repoId);
    if (!repo) {
      repo = {
        key: branchKey(repoName),
        name: repoName ?? 'unknown repo',
        count: 0,
        projects: new Map(),
      };
      repos.set(repoId, repo);
    }

    const projectId = projectName ?? UNKNOWN;
    let project = repo.projects.get(projectId);
    if (!project) {
      project = {
        key: branchKey(repoName, projectName),
        name: projectLabel(projectName),
        count: 0,
        sources: [],
      };
      repo.projects.set(projectId, project);
    }

    project.sources.push(row);
    project.count += 1;
    repo.count += 1;
  }

  const built = [...repos.values()]
    .map((repo) => ({
      ...repo,
      projects: [...repo.projects.values()]
        .map((project) => ({ ...project, sources: project.sources.sort(byRelevance) }))
        .sort(byCountThenName),
    }))
    .sort(byCountThenName);

  const total = built.reduce((n, repo) => n + repo.count, 0);

  // Runs frequently return a single repo. A lone root branch wrapping everything
  // costs a click and conveys nothing, so the repo level is dropped and its name
  // moves to the pane header (R-2.3, D4). Project keys are unaffected — they
  // already encode the repo — so a run that gains a second repo mid-stream does
  // not renumber branches out from under the user.
  if (built.length === 1) {
    return withFlatness({ total, repoName: built[0].name, branches: built[0].projects });
  }

  return withFlatness({ total, repoName: null, branches: built });
}

// Below 2 top-level branches there is no grouping to show, and drawing one box
// around the whole result set performs structure the data does not have — so the
// tree reports itself flat and the pane degrades to a plain list (R-2.11, D9).
//
// Zero sources is NOT flat. That is the empty state, which R-1.5 owns; calling it
// flat would point the pane at a `branches[0]` that does not exist.
//
// Applied on both return paths, because `flat` describes `branches` as returned —
// after any elision, not before. Post-elision `branches.length < 2` can only mean
// one project under one repo: two or more repos never elide, so they never drop
// below 2 branches, and a single repo always holds at least one project. `flat`
// therefore guarantees `branches[0].sources` exists and holds every counted row.
function withFlatness(tree) {
  return { ...tree, flat: tree.branches.length < 2 && tree.total > 0 };
}
