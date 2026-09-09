import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { buildClaudeArgs } from './claude.js';
import { createNormalizer } from './normalize.js';
import { buildCodexArgs, createCodexNormalizer } from './codex.js';

const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const ENV = /^[A-Za-z_][A-Za-z0-9_]*$/;

// The CLIs expose no "list models" command, so the built-in defaults ship a
// suggestion list. These are hints only — any model ID stays typeable.
const CLI_SUGGESTIONS = {
  claude: ['opus', 'sonnet', 'haiku'],
  codex: ['gpt-5.4-codex', 'gpt-5.4', 'gpt-5.4-codex-mini'],
};

export function createAiCatalog(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      (config.providers !== undefined && !Array.isArray(config.providers))) {
    throw new Error('AI configuration must contain a providers array');
  }
  const providers = ['claude', 'codex'].map((cli) => ({
    id: `${cli}-default`, cli, label: 'CLI default', models: [], suggestions: CLI_SUGGESTIONS[cli],
  }));
  for (const entry of config.providers ?? []) {
    if (!entry || typeof entry.id !== 'string' || !ID.test(entry.id) || !['claude', 'codex'].includes(entry.cli) ||
        providers.some((p) => p.id === entry.id)) throw new Error('Invalid or duplicate AI provider');
    const url = new URL(entry.baseUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error(`Invalid baseUrl for provider ${entry.id}`);
    }
    if (entry.apiKeyEnv !== undefined && (typeof entry.apiKeyEnv !== 'string' || !ENV.test(entry.apiKeyEnv))) throw new Error('Invalid apiKeyEnv');
    if (entry.auth !== undefined && !['bearer', 'api-key'].includes(entry.auth)) throw new Error('Invalid auth mode');
    if (entry.cli === 'codex' && entry.auth === 'api-key') throw new Error('Codex providers support bearer authentication only');
    if (!Array.isArray(entry.models) || !entry.models.length ||
        entry.models.some((m) => typeof m !== 'string' || !MODEL.test(m))) throw new Error('Provider models must be a nonempty list of model IDs');
    providers.push(Object.freeze({
      id: entry.id, cli: entry.cli, label: typeof entry.label === 'string' ? entry.label : entry.id,
      baseUrl: url.href.replace(/\/$/, ''), apiKeyEnv: entry.apiKeyEnv,
      auth: entry.auth ?? 'bearer', models: Object.freeze([...new Set(entry.models)]),
    }));
  }
  return {
    providers,
    resolve(selection = {}) {
      if (!selection || typeof selection !== 'object' || Array.isArray(selection)) throw new Error('Invalid AI selection');
      const cli = selection.cli ?? 'claude';
      const providerId = selection.provider ?? `${cli}-default`;
      const provider = providers.find((p) => p.id === providerId && p.cli === cli);
      if (!provider) throw new Error('Unknown CLI or provider selection');
      const model = selection.model ?? provider.models[0] ?? '';
      if (typeof model !== 'string' || (model && !MODEL.test(model)) ||
          (provider.models.length && !provider.models.includes(model))) throw new Error('Unsupported model selection');
      return Object.freeze({ cli, provider, model });
    },
  };
}

export function loadAiCatalog(env = process.env) {
  const file = env.LOCAL_SEARCH_AI_CONFIG || path.join(os.homedir(), '.local-search', 'ai-providers.json');
  try {
    return createAiCatalog(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    if (err.code === 'ENOENT' && !env.LOCAL_SEARCH_AI_CONFIG) return createAiCatalog();
    // Do not expose JSON parse excerpts: a malformed local file may contain credentials.
    throw new Error('Unable to load AI provider configuration; check LOCAL_SEARCH_AI_CONFIG or ~/.local-search/ai-providers.json');
  }
}

export const defaultCatalog = createAiCatalog();

export function publicCatalog(catalog = defaultCatalog) {
  return {
    providers: catalog.providers.map(({ id, cli, label, models, suggestions }) => ({
      id, cli, label, models, suggestions: suggestions ?? [],
    })),
  };
}

export function aiArgs({ execution, resumeSessionId }) {
  const { cli, model, provider } = execution;
  if (cli === 'codex') return buildCodexArgs({ model, provider, resumeSessionId });
  const args = buildClaudeArgs({ resumeSessionId });
  if (model) args.push('--model', model);
  return args;
}

// @spec SEARCH-AI-001, SEARCH-AI-002, SEARCH-AI-003
export function spawnAi({ prompt, execution, resumeSessionId, spawn = nodeSpawn, env = process.env }) {
  const { cli, provider } = execution;
  const childEnv = { ...env };
  if (provider.apiKeyEnv && !childEnv[provider.apiKeyEnv]) throw new Error(`Set ${provider.apiKeyEnv} before using this provider`);
  if (cli === 'claude' && provider.baseUrl) {
    for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK',
      'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) delete childEnv[key];
    childEnv.ANTHROPIC_BASE_URL = provider.baseUrl;
    if (provider.apiKeyEnv) childEnv[provider.auth === 'api-key' ? 'ANTHROPIC_API_KEY' : 'ANTHROPIC_AUTH_TOKEN'] = env[provider.apiKeyEnv];
  }
  return spawn(cli, [...aiArgs({ execution, resumeSessionId }), '--', prompt], {
    detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: childEnv,
  });
}

export function aiNormalizer(execution) {
  const normalizer = execution.cli === 'codex'
    ? createCodexNormalizer({ model: execution.model || null }) : createNormalizer();
  return {
    push(obj) {
      return normalizer.push(obj).map((event) => {
        const selection = { cli: execution.cli, provider: execution.provider.id, requestedModel: execution.model || null };
        if (event.type === 'status') return { ...event, data: { ...event.data, ...selection } };
        if (event.type === 'answer') return { ...event, data: { ...event.data, meta: { ...event.data.meta, ...selection } } };
        return event;
      });
    },
  };
}
