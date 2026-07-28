import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReposStdout,
  handleRepos,
  parseRepoListTable,
  specCountsFromInit,
  mergeRepoRows,
  configErrorFromInit,
} from '../src/repos.js';

function fakeRes() {
  return {
    statusCode: null,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}

test('R-1.2: parseReposStdout skips a progress prefix and extracts rows', () => {
  const stdout = 'Loading registry...\nscanning\n[{"repo":"a","spec_count":3},{"repo":"b"}]\n';
  assert.deepEqual(parseReposStdout(stdout), [
    { repo: 'a', spec_count: 3 },
    { repo: 'b' },
  ]);
});

test('handleRepos: fake runRepos resolving stdout -> 200 rows', async () => {
  const res = fakeRes();
  const runRepos = async () => 'noise\n[{"repo":"a"}]';
  await handleRepos({}, res, { runRepos });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), [{ repo: 'a' }]);
});

test('R-1.6: handleRepos with rejecting runRepos -> 500 explicit error JSON', async () => {
  const res = fakeRes();
  const runRepos = async () => {
    throw new Error('local-search not found');
  };
  await handleRepos({}, res, { runRepos });
  assert.equal(res.statusCode, 500);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'repos_failed');
  assert.match(body.message, /local-search not found/);
});

// `repo list` columnar output (2+ spaces between columns; "—" = no graph).
const REPO_LIST_TABLE = [
  'NAME                  ADDED       LAST SCAN    LAST UPDATE  COMMIT    GRAPH         PATH',
  'team-os-example-repo  2d          1d           —            —         —             /Users/x/team-os-example-repo',
  'squirrel              14h         14h          2h           ec80049   graphify+crg  /Users/x/squirrel',
  '',
].join('\n');

test('parseRepoListTable: extracts name/path and graph presence, skips header', () => {
  assert.deepEqual(parseRepoListTable(REPO_LIST_TABLE), [
    { name: 'team-os-example-repo', path: '/Users/x/team-os-example-repo', has_graph: false },
    { name: 'squirrel', path: '/Users/x/squirrel', has_graph: true },
  ]);
});

test('parseRepoListTable: drops CLI progress noise lines', () => {
  const noisy = '(squirrel: git changes detected — incremental update…)\n\n' + REPO_LIST_TABLE;
  assert.equal(parseRepoListTable(noisy).length, 2);
});

test('specCountsFromInit: unions repositories + available by name', () => {
  const init = JSON.stringify({
    repositories: [{ name: 'squirrel', spec_count: 361 }],
    available: [{ name: 'team-os-example-repo', spec_count: 195 }],
  });
  const map = specCountsFromInit(init);
  assert.equal(map.get('squirrel'), 361);
  assert.equal(map.get('team-os-example-repo'), 195);
});

test('specCountsFromInit: malformed JSON -> empty map (no throw)', () => {
  assert.equal(specCountsFromInit('{not json').size, 0);
});

test('mergeRepoRows: enriches repo-list rows with init spec counts', () => {
  const init = JSON.stringify({
    repositories: [],
    available: [{ name: 'squirrel', spec_count: 361 }],
  });
  assert.deepEqual(mergeRepoRows(REPO_LIST_TABLE, init), [
    { name: 'team-os-example-repo', path: '/Users/x/team-os-example-repo', spec_count: 0, has_graph: false },
    { name: 'squirrel', path: '/Users/x/squirrel', spec_count: 361, has_graph: true },
  ]);
});

// CLI v0.4.0: a malformed .agent/local-search-config.yaml makes `init --json`
// exit 1 while still printing valid JSON carrying the line-numbered error.
// Without extracting it, the failure surfaces only as every spec count being 0.
test('configErrorFromInit: extracts the error field', () => {
  const init = JSON.stringify({
    path: '/p/.agent/local-search-config.yaml',
    repositories: [],
    available: [],
    unknown: [],
    error: '/p/.agent/local-search-config.yaml:4:1: unknown key "repositorys"',
  });
  assert.match(configErrorFromInit(init), /unknown key "repositorys"/);
});

test('configErrorFromInit: healthy payload -> null', () => {
  const init = JSON.stringify({ repositories: ['a'], available: [], unknown: [] });
  assert.equal(configErrorFromInit(init), null);
});

test('configErrorFromInit: empty error string -> null', () => {
  assert.equal(configErrorFromInit(JSON.stringify({ error: '   ' })), null);
});

test('configErrorFromInit: malformed JSON -> null (no throw)', () => {
  assert.equal(configErrorFromInit('{not json'), null);
  assert.equal(configErrorFromInit(''), null);
  assert.equal(configErrorFromInit(undefined), null);
});
