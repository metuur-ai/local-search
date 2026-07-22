/**
 * buildPrompt({ query, repos }) -> a self-contained, scope-pinned prompt string.
 *
 * R-2.4: the scope must be explicit, never resolved from the server CWD or a
 * .local-search.toml. The real `local-search` CLI scopes by a single positional
 * repo argument (it has no `--scope` flag and no `context`/`graph` subcommands),
 * so the prompt instructs Claude to search EACH selected repo by name, read the
 * best specs, and optionally pull related specs — then reason and answer, or ask
 * ONE clarifying question when it lacks what it needs.
 */
export function buildPrompt({ query, repos } = {}) {
  const repoList = Array.isArray(repos) ? repos : [];
  const scope = repoList.join(', ');
  const perRepo = repoList
    .map((r) => `   local-search json search "<terms>" ${r}`)
    .join('\n');

  return [
    'You are answering a question about indexed spec/doc repositories using the',
    '`local-search` CLI, invoked through the Bash tool. Follow a search -> read -> reason loop.',
    '',
    `Scope: the ONLY repos in scope are: ${scope}`,
    'The CLI scopes by a single positional repo argument — there is NO `--scope` flag,',
    'and NO `context` or `graph` subcommands. Search each repo by name; do not invent flags,',
    'and do not rely on the current working directory or any .local-search.toml.',
    '',
    'Commands (all emit JSON for machine parsing):',
    '- Search one repo:   local-search json search "<terms>" <repo>',
    '- Read a spec:       local-search json read <name> <repo>',
    '- Related specs:     local-search json related <name>',
    '',
    'Steps:',
    '1. Search EACH repo in scope for candidate specs (results are ranked; a lower/more',
    '   negative relevance means a better BM25 match):',
    perRepo || '   (no repos in scope)',
    '2. Read the most relevant specs with `json read <name> <repo>`.',
    '3. Optionally run `json related <name>` on the top spec to surface related specs.',
    '4. Reason over what you read and produce a clear natural-language answer in markdown.',
    'If you lack what you need to answer well, ask ONE concise clarifying question instead of guessing.',
    '',
    `Question: ${query ?? ''}`,
  ].join('\n');
}
