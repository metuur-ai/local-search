import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReposStdout, handleRepos } from '../src/repos.js';

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
