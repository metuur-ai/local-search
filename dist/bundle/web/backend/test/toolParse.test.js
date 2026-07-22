import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCommand, stripAndParse, deriveEvents } from '../src/toolParse.js';

test('R-2b.1: classifyCommand maps command strings to the real subcommands', () => {
  const cases = [
    ['local-search json search "auth" foyer-platform', 'json search'],
    ['local-search json read billing foyer-platform', 'json read'],
    ['local-search json related billing', 'json related'],
    ['local-search json repos', 'json repos'],
    ['/usr/local/bin/local-search json search "q"', 'json search'],
    ['  local-search   json   search   "q"  ', 'json search'],
    ['ls -la', 'other'],
    ['local-search json help', 'other'],
    // `graph`/`context` are not real subcommands -> other.
    ['local-search graph search "q"', 'other'],
    ['local-search json context "q"', 'other'],
    ['echo hi', 'other'],
  ];
  for (const [cmd, expected] of cases) {
    assert.equal(classifyCommand(cmd), expected, cmd);
  }
});

test('R-2b.2: stripAndParse strips progress prefix/suffix and parses object', () => {
  const stdout = 'Searching...\nfound 2 candidates\n{"content":"hello"}\nDone.\n';
  assert.deepEqual(stripAndParse(stdout), { content: 'hello' });
});

test('R-2b.2: stripAndParse parses a top-level array with noise around it', () => {
  const stdout = 'progress line\n[{"name":"x"},{"name":"y"}]\ntrailer';
  assert.deepEqual(stripAndParse(stdout), [{ name: 'x' }, { name: 'y' }]);
});

test('stripAndParse returns null when there is no JSON', () => {
  assert.equal(stripAndParse('no json here at all'), null);
  assert.equal(stripAndParse('{ not valid'), null);
});

test('R-2b.3: json search with a repo -> sources + provenance(scope=[repo]) + activity', () => {
  const stdout = 'progress\n[{"repo":"foyer-platform","name":"billing","relevance":-8.9}]\n';
  const evs = deriveEvents({
    command: 'local-search json search "billing" foyer-platform',
    stdout,
  });
  const types = evs.map((e) => e.type);
  assert.deepEqual(types, ['sources', 'provenance', 'activity']);
  assert.deepEqual(evs[0].data, [
    { repo: 'foyer-platform', name: 'billing', relevance: -8.9 },
  ]);
  assert.deepEqual(evs[1].data, { scope: ['foyer-platform'], missing: [] });
});

test('R-2b.3: json search without a repo -> scope derived from result rows', () => {
  const stdout = '[{"repo":"a","name":"x"},{"repo":"b","name":"y"},{"repo":"a","name":"z"}]';
  const evs = deriveEvents({ command: 'local-search json search "q"', stdout });
  const prov = evs.find((e) => e.type === 'provenance');
  assert.deepEqual(prov.data, { scope: ['a', 'b'], missing: [] });
});

test('R-2b.3: json related -> synthesized graph + activity', () => {
  const stdout = 'building\n[{"repo":"foyer-platform","name":"auth","path":"arrows/auth","relevance":-7.4}]\n';
  const evs = deriveEvents({ command: 'local-search json related billing', stdout });
  const types = evs.map((e) => e.type);
  assert.deepEqual(types, ['graph', 'activity']);
  const graph = evs[0].data;
  // Center node is the queried spec; each related row is a satellite with a link.
  assert.equal(graph.nodes[0].id, 'billing');
  assert.equal(graph.nodes[0].relevance, 1);
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.links.length, 1);
  assert.equal(graph.links[0].source, 'billing');
  assert.equal(graph.links[0].target, 'foyer-platform/auth');
});

test('R-2b.3: json read -> activity only (no sources/graph)', () => {
  const evs = deriveEvents({
    command: 'local-search json read billing foyer-platform',
    stdout: '{"content":"# Billing\\n..."}',
  });
  assert.deepEqual(evs.map((e) => e.type), ['activity']);
});

test('R-2b.4: recognized command with unparseable result -> activity only, no throw', () => {
  const stdout = 'error: something went wrong, no json';
  let evs;
  assert.doesNotThrow(() => {
    evs = deriveEvents({ command: 'local-search json search "q"', stdout });
  });
  assert.deepEqual(evs.map((e) => e.type), ['activity']);
  assert.equal(evs[0].data.unparseable, true);
});

test('R-2b.5: other command -> activity only, no parse attempt', () => {
  const evs = deriveEvents({ command: 'ls -la', stdout: '{"should":"not parse"}' });
  assert.deepEqual(evs.map((e) => e.type), ['activity']);
});
