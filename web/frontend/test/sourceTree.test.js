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

const repoNamed = (tree, name) => tree.repos.find((r) => r.name === name);
const projectNamed = (repo, name) => repo.projects.find((p) => p.name === name);

describe('buildSourceTree — grouping (R-2.1)', () => {
  it('groups by repo at the top level and by project within each repo', () => {
    const tree = buildSourceTree(FIXTURE);

    expect(tree.repos.map((r) => r.name).sort()).toEqual(['foyer-platform', 'local-search']);

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

    const allKeys = tree.repos.flatMap((r) => [r.key, ...r.projects.map((p) => p.key)]);
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

    expect(tree.repos.map((r) => [r.name, r.count])).toEqual([
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

    expect(tree.repos.map((r) => r.name)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('sorts leaves by relevance ascending, because relevance is negative BM25', () => {
    const tree = buildSourceTree([
      { repo: 'r', project: 'p', name: 'b.md', relevance: -2.1 },
      { repo: 'r', project: 'p', name: 'a.md', relevance: -5.3 },
      { repo: 'r', project: 'p', name: 'c.md', relevance: -3.8 },
    ]);

    expect(projectNamed(repoNamed(tree, 'r'), 'p').sources.map((s) => s.relevance)).toEqual([
      -5.3, -3.8, -2.1,
    ]);
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

    expect(early.repos[0].name).toBe('foyer-platform');
    expect(late.repos[0].name).toBe('local-search');

    for (const name of ['foyer-platform', 'local-search']) {
      expect(repoNamed(late, name).key).toBe(repoNamed(early, name).key);
      expect(projectNamed(repoNamed(late, name), repoNamed(early, name).projects[0].name).key).toBe(
        repoNamed(early, name).projects[0].key,
      );
    }
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
    expect(tree.repos.reduce((n, r) => n + r.count, 0)).toBe(FIXTURE.length);
  });

  it('keeps a repo count equal to the sum of its project counts', () => {
    for (const repo of buildSourceTree(FIXTURE).repos) {
      expect(repo.projects.reduce((n, p) => n + p.count, 0)).toBe(repo.count);
    }
  });
});

describe('buildSourceTree — degenerate input', () => {
  it('returns an empty tree for no sources', () => {
    for (const input of [[], null, undefined]) {
      expect(buildSourceTree(input)).toEqual({ total: 0, repos: [] });
    }
  });

  it('skips null rows without counting them', () => {
    const tree = buildSourceTree([FIXTURE[0], null, FIXTURE[1]]);

    expect(tree.total).toBe(2);
    expect(tree.repos.reduce((n, r) => n + r.count, 0)).toBe(2);
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
