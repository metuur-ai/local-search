/**
 * Tool-event parsing (Bash -> local-search). EARS Unit 2b.
 *
 * Claude runs `local-search` through the Bash tool, so stream-json carries the
 * command as a shell string in tool_use.input.command and the output as an
 * opaque stdout string in the matching tool_result.content. This module
 * classifies the command, strips progress noise from stdout, JSON.parses it,
 * and derives normalized events.
 *
 * The real CLI scopes by a single positional repo argument and exposes only the
 * `json` subcommands `search <query> [repo]`, `read <name> [repo]`,
 * `related <name>`, and `repos`. There is no `--scope` flag and no `context`/
 * `graph` subcommand, so provenance is derived from the search command's repo
 * argument and the knowledge graph is synthesized from `json related` output.
 */

// Split a shell command into tokens, unwrapping single/double quotes so a
// quoted multi-word query stays one token (e.g. `"payment flow"`).
function shellTokens(cmdString) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(cmdString)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

// Positional (non-flag) words after the `local-search` binary, or null if the
// binary isn't present. Tolerant of a leading path or `local-search.sh`.
function positionalsAfterBinary(cmdString) {
  if (typeof cmdString !== 'string') return null;
  const tokens = shellTokens(cmdString);
  const i = tokens.findIndex((t) => /(^|\/)local-search(\.sh)?$/.test(t));
  if (i === -1) return null;
  return tokens.slice(i + 1).filter((t) => !t.startsWith('-'));
}

/**
 * classifyCommand(cmdString) -> 'json search' | 'json read' | 'json related'
 *                              | 'json repos' | 'other'.
 * R-2b.1: tolerant to extra flags, quoting, whitespace, and a leading path or
 * `local-search`/`local-search.sh` prefix.
 */
export function classifyCommand(cmdString) {
  const words = positionalsAfterBinary(cmdString);
  if (!words || words.length === 0) return 'other';
  if (words[0] !== 'json') return 'other';
  const sub = words[1];
  if (sub === 'search') return 'json search';
  if (sub === 'read') return 'json read';
  if (sub === 'related') return 'json related';
  if (sub === 'repos') return 'json repos';
  return 'other';
}

/**
 * stripAndParse(stdout) -> parsed object/array, or null if no JSON found.
 * R-2b.2: strip leading/trailing non-JSON progress lines, then JSON.parse the
 * remaining payload. Finds the first `{`/`[` that begins valid JSON through the
 * last matching `}`/`]`.
 */
export function stripAndParse(stdout) {
  if (typeof stdout !== 'string') return null;

  const firstObj = stdout.indexOf('{');
  const firstArr = stdout.indexOf('[');
  const candidates = [firstObj, firstArr].filter((x) => x !== -1);
  if (candidates.length === 0) return null;
  const start = Math.min(...candidates);
  const opener = stdout[start];
  const closer = opener === '{' ? '}' : ']';
  const end = stdout.lastIndexOf(closer);
  if (end <= start) return null;

  const slice = stdout.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

// Rows shaped like `json search`/`json related` output ([{repo,name,...}]).
function asRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.results)) return parsed.results;
  if (Array.isArray(parsed?.sources)) return parsed.sources;
  return [];
}

// Rank-normalized relevance for graph sizing (CLI relevance is raw negative
// BM25, which the Cytoscape 0..1 size scale can't use directly).
function rankRelevance(idx) {
  const r = 0.9 - idx * 0.08;
  return r < 0.2 ? 0.2 : r;
}

// Build a NetworkX node-link graph (nodes/links) as a star around the queried
// spec, from `json related` rows. `centerName` is the spec passed to `related`.
function synthesizeGraph(centerName, rows) {
  const centerId = centerName || 'query';
  const nodes = [
    { id: centerId, label: centerName || 'query', tag: 'doc', relevance: 1 },
  ];
  const links = [];
  rows.forEach((row, idx) => {
    if (!row) return;
    const id = `${row.repo ?? ''}/${row.name ?? row.path ?? idx}`;
    nodes.push({
      id,
      label: row.name ?? row.title ?? id,
      path: row.path,
      tag: 'doc',
      relevance: rankRelevance(idx),
    });
    links.push({ source: centerId, target: id, weight: rankRelevance(idx) });
  });
  return { nodes, links };
}

/**
 * deriveEvents({ command, stdout }) -> normalized event array.
 * R-2b.3: `json search` -> `sources` (+ `provenance` for the searched repo);
 *   `json related` -> a synthesized `graph`. Every recognized command also
 *   yields an `activity` event.
 * R-2b.4: if stripAndParse returns null for a recognized command, yield an
 *   `activity` event flagging "unparseable result" and NO sources/graph (never throw).
 * R-2b.5: for `other`, yield only an `activity` event, no parse attempt.
 */
export function deriveEvents({ command, stdout } = {}) {
  const kind = classifyCommand(command);

  if (kind === 'other') {
    return [{ type: 'activity', data: { command, resultSummary: 'other command' } }];
  }

  const parsed = stripAndParse(stdout);

  if (parsed === null) {
    return [
      {
        type: 'activity',
        data: { command, resultSummary: 'unparseable result', unparseable: true },
      },
    ];
  }

  const events = [];
  const words = positionalsAfterBinary(command) || [];

  if (kind === 'json search') {
    const rows = asRows(parsed);
    events.push({ type: 'sources', data: rows });
    // Provenance scope: the repo positional if given (definitively reached),
    // else the distinct repos present in the returned rows.
    // words = ['json','search',<query>,<repo?>]; the repo is the 4th positional.
    const repoArg = words[3] === undefined ? null : words[3];
    const scope = repoArg
      ? [repoArg]
      : [...new Set(rows.map((r) => r?.repo).filter(Boolean))];
    events.push({ type: 'provenance', data: { scope, missing: [] } });
    events.push({
      type: 'activity',
      data: { command, resultSummary: `${rows.length} source(s)` },
    });
    return events;
  }

  if (kind === 'json related') {
    const rows = asRows(parsed);
    const centerName = words[2]; // `json related <name>`
    const graph = synthesizeGraph(centerName, rows);
    events.push({ type: 'graph', data: graph });
    events.push({
      type: 'activity',
      data: { command, resultSummary: `graph: ${graph.nodes.length} node(s)` },
    });
    return events;
  }

  if (kind === 'json read') {
    events.push({ type: 'activity', data: { command, resultSummary: 'spec read' } });
    return events;
  }

  if (kind === 'json repos') {
    events.push({ type: 'activity', data: { command, resultSummary: 'repos listed' } });
    return events;
  }

  return events;
}
