// Pure helper — turns the accumulated `sources` array into the two-level tree the
// Source Map pane renders. Kept free of rendering-library imports so the grouping
// rules stay unit-testable without mounting a component (R-2.10), matching the
// `graphElements.js` precedent.
//
// Grouped by `repo` then `project` (R-2.1). Deliberately NOT by `kindFromPath`
// (R-2.2): registered scan roots already point at the docs directory, so paths
// arrive as `hld/mobile-app-features.md` with no `docs/` segment to match and
// every row collapses into one `doc` bucket. See docs/lld — "Grouping axis".

// Branch identity, derived from names only — never from position — so ordering
// changes during streaming cannot transfer one branch's expansion state to
// another (R-2.6a). NUL-separated because it cannot occur in a path segment, so
// no repo or project name can forge another branch's key.
function branchKey(...names) {
  return names.join('\0');
}

// Sibling branch order: biggest first, because the skew is what the pane exists
// to show; alphabetical on a tie so equal-sized branches hold a stable position
// across rebuilds (R-2.6). Names are coerced because a row may be missing `repo`
// or `project` — story 2.4 gives those branches real labels.
function byCountThenName(a, b) {
  return b.count - a.count || String(a.name ?? '').localeCompare(String(b.name ?? ''));
}

// Leaves ascend by `relevance` because it is raw negative BM25 — lower is better
// (R-2.7, LLD constraint 1). Rows carrying no relevance sort last rather than
// leading on a NaN comparison.
function byRelevance(a, b) {
  const av = typeof a?.relevance === 'number' ? a.relevance : Infinity;
  const bv = typeof b?.relevance === 'number' ? b.relevance : Infinity;
  return av - bv;
}

// buildSourceTree(sources) → { total, repoName, branches }
//
//   repoName  the single repo's name when the repo level was elided, else null.
//             The pane names it in the header instead of drawing a lone branch.
//   branches  repo branches — each with `projects` — or, when elided, the project
//             branches themselves, each with `sources`. `repoName` says which.
//
// Every branch carries the number of documents beneath it (R-2.4), and no row is
// dropped, so top-level counts always sum to the total (R-2.5).
export function buildSourceTree(sources) {
  const rows = Array.isArray(sources) ? sources : [];

  const repos = new Map();

  for (const row of rows) {
    if (!row) continue;

    const repoName = row.repo;
    const projectName = row.project;

    let repo = repos.get(repoName);
    if (!repo) {
      repo = { key: branchKey(repoName), name: repoName, count: 0, projects: new Map() };
      repos.set(repoName, repo);
    }

    let project = repo.projects.get(projectName);
    if (!project) {
      project = {
        key: branchKey(repoName, projectName),
        name: projectName,
        count: 0,
        sources: [],
      };
      repo.projects.set(projectName, project);
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
    return { total, repoName: built[0].name, branches: built[0].projects };
  }

  return { total, repoName: null, branches: built };
}
