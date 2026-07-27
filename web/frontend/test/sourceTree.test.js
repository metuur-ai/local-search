import { describe, it, expect } from 'vitest';
import { buildSourceTree } from '../src/components/sourceTree.js';
// Read as text so the purity requirements can be asserted, not eyeballed.
import sourceTreeSrc from '../src/components/sourceTree.js?raw';

// The Source Map pane's whole value is counts the user can trust against the
// sources list, so grouping and counting are pinned here rather than through a
// mounted component (R-2.10).

// 5 rows spanning 2 repos and 4 projects, deliberately interleaved so grouping
// cannot pass by accident on a pre-sorted input.
const FIXTURE = [
  { repo: 'foyer-platform', project: 'hld', name: 'mobile-app-features.md', relevance: -5.3 },
  { repo: 'local-search', project: 'ears', name: 'source-map.md', relevance: -2.1 },
  { repo: 'foyer-platform', project: 'lld', name: 'billing.md', relevance: -3.8 },
  { repo: 'foyer-platform', project: 'hld', name: 'payments.md', relevance: -4.4 },
  { repo: 'local-search', project: 'tasks', name: 'scan-overhaul.md', relevance: -1.9 },
];

const named = (branches, name) => branches.find((b) => b.name === name);
const repoNamed = (tree, name) => named(tree.branches, name);
const projectNamed = (repo, name) => named(repo.projects, name);

describe('buildSourceTree — grouping (R-2.1)', () => {
  it('groups by repo at the top level and by project within each repo', () => {
    const tree = buildSourceTree(FIXTURE);

    expect(tree.branches.map((r) => r.name).sort()).toEqual(['foyer-platform', 'local-search']);

    expect(
      projectNamed(repoNamed(tree, 'foyer-platform'), 'hld').sources.map((s) => s.name),
    ).toEqual(['mobile-app-features.md', 'payments.md']);

    expect(
      repoNamed(tree, 'local-search')
        .projects.map((p) => p.name)
        .sort(),
    ).toEqual(['ears', 'tasks']);
  });

  it('gives every branch a key derived from its names, not its position', () => {
    const tree = buildSourceTree(FIXTURE);
    const reversed = buildSourceTree([...FIXTURE].reverse());

    const keyOf = (t, repo, project) => projectNamed(repoNamed(t, repo), project).key;

    expect(keyOf(tree, 'foyer-platform', 'hld')).toBe(keyOf(reversed, 'foyer-platform', 'hld'));
    expect(repoNamed(tree, 'local-search').key).toBe(repoNamed(reversed, 'local-search').key);

    const allKeys = tree.branches.flatMap((r) => [r.key, ...r.projects.map((p) => p.key)]);
    expect(new Set(allKeys).size).toBe(allKeys.length);
  });
});

describe('buildSourceTree — ordering (R-2.6, R-2.7)', () => {
  it('orders sibling branches by descending count', () => {
    // The smallest branch is seen FIRST at every level, so insertion order is the
    // exact opposite of the expected order — an unsorted implementation cannot pass.
    const tree = buildSourceTree([
      { repo: 'small', project: 'only' },
      { repo: 'big', project: 'thin' },
      { repo: 'big', project: 'fat' },
      { repo: 'big', project: 'fat' },
    ]);

    expect(tree.branches.map((r) => [r.name, r.count])).toEqual([
      ['big', 3],
      ['small', 1],
    ]);
    expect(repoNamed(tree, 'big').projects.map((p) => [p.name, p.count])).toEqual([
      ['fat', 2],
      ['thin', 1],
    ]);
  });

  it('breaks count ties alphabetically by branch name', () => {
    // Three repos of one row each, fed in reverse-alphabetical order so an
    // insertion-order implementation cannot pass.
    const tree = buildSourceTree([
      { repo: 'zeta', project: 'p' },
      { repo: 'mid', project: 'p' },
      { repo: 'alpha', project: 'p' },
    ]);

    expect(tree.branches.map((r) => r.name)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('sorts leaves by relevance ascending, because relevance is negative BM25', () => {
    const tree = buildSourceTree([
      { repo: 'r', project: 'p', name: 'b.md', relevance: -2.1 },
      { repo: 'r', project: 'p', name: 'a.md', relevance: -5.3 },
      { repo: 'r', project: 'p', name: 'c.md', relevance: -3.8 },
    ]);

    expect(named(tree.branches, 'p').sources.map((s) => s.relevance)).toEqual([-5.3, -3.8, -2.1]);
  });

  it('keeps branch keys unchanged when a rebuild re-orders branches (R-2.6a)', () => {
    // `local-search` starts behind, then overtakes as streamed rows arrive. Its
    // key must not change with its new position, or the user's expansion state
    // would follow a slot rather than a branch.
    const early = buildSourceTree(FIXTURE);
    const late = buildSourceTree([
      ...FIXTURE,
      { repo: 'local-search', project: 'ears', name: 'extra-a.md' },
      { repo: 'local-search', project: 'ears', name: 'extra-b.md' },
    ]);

    expect(early.branches[0].name).toBe('foyer-platform');
    expect(late.branches[0].name).toBe('local-search');

    for (const name of ['foyer-platform', 'local-search']) {
      expect(repoNamed(late, name).key).toBe(repoNamed(early, name).key);
      expect(projectNamed(repoNamed(late, name), repoNamed(early, name).projects[0].name).key).toBe(
        repoNamed(early, name).projects[0].key,
      );
    }
  });
});

describe('buildSourceTree — single-repo elision (R-2.3)', () => {
  const SINGLE_REPO = FIXTURE.filter((s) => s.repo === 'foyer-platform');

  it('omits the repo level and promotes projects when one repo is present', () => {
    const tree = buildSourceTree(SINGLE_REPO);

    expect(tree.repoName).toBe('foyer-platform');
    expect(tree.branches.map((b) => b.name)).toEqual(['hld', 'lld']);
    // Promoted branches are project branches — they carry leaves, not sub-branches.
    expect(tree.branches.every((b) => Array.isArray(b.sources))).toBe(true);
    expect(tree.branches.every((b) => b.projects === undefined)).toBe(true);
  });

  it('keeps the repo level and names no repo when more than one is present', () => {
    const tree = buildSourceTree(FIXTURE);

    expect(tree.repoName).toBe(null);
    expect(tree.branches.every((b) => Array.isArray(b.projects))).toBe(true);
  });

  it('still sums promoted branch counts to the total', () => {
    const tree = buildSourceTree(SINGLE_REPO);

    expect(tree.total).toBe(SINGLE_REPO.length);
    expect(tree.branches.reduce((n, b) => n + b.count, 0)).toBe(SINGLE_REPO.length);
  });

  it('keeps promoted branch keys identical to their un-elided form (R-2.6a)', () => {
    // A run that starts single-repo and gains a second repo mid-stream must not
    // renumber the first repo's project branches out from under the user.
    const elided = buildSourceTree(SINGLE_REPO);
    const full = buildSourceTree(FIXTURE);

    expect(named(elided.branches, 'hld').key).toBe(
      projectNamed(repoNamed(full, 'foyer-platform'), 'hld').key,
    );
  });
});

describe('buildSourceTree — degenerate tree (R-2.11)', () => {
  // A repo registered at its ROOT, not at its `docs/` directory. The first path
  // segment is then `src`/`docs`/`tests` rather than a doc type, and a query can
  // land entirely inside one of them — the one-branch tree D9 refuses to draw.
  const ONE_GROUP = [
    { repo: 'root-registered', project: 'src', name: 'index.ts', relevance: -4.1 },
    { repo: 'root-registered', project: 'src', name: 'router.ts', relevance: -2.6 },
    { repo: 'root-registered', project: 'src', name: 'server.ts', relevance: -3.3 },
  ];

  it('flags a single-branch tree as flat', () => {
    expect(buildSourceTree(ONE_GROUP).flat).toBe(true);
  });

  it('does not flag two branches as flat, because two is enough to group by', () => {
    // Same single repo as ONE_GROUP, so the repo level is still elided — the only
    // difference is a second project. Two branches is the boundary R-2.11 draws.
    const tree = buildSourceTree([
      ...ONE_GROUP,
      { repo: 'root-registered', project: 'tests', name: 'router.test.ts', relevance: -1.8 },
    ]);

    expect(tree.repoName).toBe('root-registered');
    expect(tree.branches).toHaveLength(2);
    expect(tree.flat).toBe(false);
  });

  it('does not flag a multi-repo tree as flat', () => {
    // Two or more repos can never elide, so they can never fall below 2 branches.
    expect(buildSourceTree(FIXTURE).flat).toBe(false);
  });

  it('does not flag an empty tree as flat, because nothing grouped is not one group', () => {
    // R-1.5 owns the empty pane. Reporting `flat` here would send the component
    // down the plain-list path with no list to render.
    for (const input of [[], null, undefined]) {
      expect(buildSourceTree(input).flat).toBe(false);
    }
  });

  it('leaves every row on the single branch when flat, so the plain list is complete', () => {
    // The component renders `branches[0].sources` directly in the flat case, so
    // that array — not some other level — has to hold the whole result set.
    const tree = buildSourceTree(ONE_GROUP);

    expect(tree.flat).toBe(true);
    expect(tree.branches).toHaveLength(1);
    expect(tree.branches[0].sources.map((s) => s.name).sort()).toEqual(
      ONE_GROUP.map((s) => s.name).sort(),
    );
    expect(tree.total).toBe(ONE_GROUP.length);
    expect(tree.branches[0].count).toBe(ONE_GROUP.length);
  });
});

describe('buildSourceTree — irregular rows (R-2.8, R-2.9)', () => {
  // A row with no `repo`/`project` must never silently vanish from a pane whose
  // counts are supposed to be trustworthy, and `_root` is a real value the
  // extractor writes for files sitting at a repo root — not a bug to hide.
  const IRREGULAR = [
    { repo: 'a', project: '_root', name: 'README.md' },
    { repo: 'a', project: 'hld', name: 'design.md' },
    { repo: 'b', project: undefined, name: 'orphan-project.md' },
    { repo: undefined, project: 'hld', name: 'orphan-repo.md' },
    { repo: 'b', project: '', name: 'blank-project.md' },
  ];

  it('labels a _root project readably instead of showing the raw token', () => {
    const tree = buildSourceTree(IRREGULAR);
    const labels = repoNamed(tree, 'a').projects.map((p) => p.name);

    expect(labels).not.toContain('_root');
    expect(labels.some((l) => /root/i.test(l))).toBe(true);
  });

  it('keeps the _root branch keyed on the raw value, not the label', () => {
    const tree = buildSourceTree(IRREGULAR);
    const rootBranch = repoNamed(tree, 'a').projects.find((p) => /root/i.test(p.name));

    expect(rootBranch.key).toContain('_root');
  });

  it('places rows missing repo or project under an explicit unknown branch', () => {
    const tree = buildSourceTree(IRREGULAR);

    expect(tree.branches.some((b) => /unknown/i.test(b.name))).toBe(true);
    expect(repoNamed(tree, 'b').projects.some((p) => /unknown/i.test(p.name))).toBe(true);
  });

  it('collapses every unknown-project row into one branch, not one per row', () => {
    // `undefined` and `''` are both "no project" and must share a branch.
    const unknowns = buildSourceTree(IRREGULAR)
      .branches.flatMap((b) => b.projects ?? [])
      .filter((p) => /unknown/i.test(p.name));

    expect(unknowns).toHaveLength(1);
    expect(unknowns[0].count).toBe(2);
  });

  it('drops nothing — the total still equals the number of rows', () => {
    const tree = buildSourceTree(IRREGULAR);

    expect(tree.total).toBe(IRREGULAR.length);
    expect(tree.branches.reduce((n, b) => n + b.count, 0)).toBe(IRREGULAR.length);
  });
});

describe('buildSourceTree — counts (R-2.4, R-2.5)', () => {
  it('labels every branch with the number of documents beneath it', () => {
    const tree = buildSourceTree(FIXTURE);

    expect(repoNamed(tree, 'foyer-platform').count).toBe(3);
    expect(repoNamed(tree, 'local-search').count).toBe(2);
    expect(projectNamed(repoNamed(tree, 'foyer-platform'), 'hld').count).toBe(2);
    expect(projectNamed(repoNamed(tree, 'foyer-platform'), 'lld').count).toBe(1);
  });

  it('sums top-level branch counts to the total number of sources', () => {
    const tree = buildSourceTree(FIXTURE);

    expect(tree.total).toBe(FIXTURE.length);
    expect(tree.branches.reduce((n, r) => n + r.count, 0)).toBe(FIXTURE.length);
  });

  it('keeps a repo count equal to the sum of its project counts', () => {
    for (const repo of buildSourceTree(FIXTURE).branches) {
      expect(repo.projects.reduce((n, p) => n + p.count, 0)).toBe(repo.count);
    }
  });
});

describe('buildSourceTree — degenerate input', () => {
  it('returns an empty tree for no sources', () => {
    // Exact shape on purpose: this pins the whole return value, so a field added
    // to the builder has to be declared here rather than appearing unannounced.
    for (const input of [[], null, undefined]) {
      expect(buildSourceTree(input)).toEqual({
        total: 0,
        repoName: null,
        branches: [],
        flat: false,
      });
    }
  });

  it('skips null rows without counting them', () => {
    const tree = buildSourceTree([FIXTURE[0], null, FIXTURE[1]]);

    expect(tree.total).toBe(2);
    expect(tree.branches.reduce((n, r) => n + r.count, 0)).toBe(2);
  });
});

describe('buildSourceTree — purity (R-2.2, R-2.10)', () => {
  it('imports no rendering library', () => {
    expect(sourceTreeSrc).not.toMatch(/from\s+['"]preact/);
  });

  // Prose explaining *why* the axis was rejected is welcome; a call or an import
  // it could be aliased through is not.
  it('does not use kindFromPath as a grouping axis', () => {
    expect(sourceTreeSrc).not.toMatch(/kindFromPath\s*\(/);
    expect(sourceTreeSrc).not.toMatch(/from\s+['"][^'"]*graphElements/);
  });

  it('does not mutate the sources array it is given', () => {
    const input = FIXTURE.map((s) => ({ ...s }));
    const before = JSON.stringify(input);

    buildSourceTree(input);

    expect(JSON.stringify(input)).toBe(before);
  });
});
