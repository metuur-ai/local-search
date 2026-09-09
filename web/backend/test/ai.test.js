import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAiCatalog, spawnAi, publicCatalog } from '../src/ai.js';

const providers = [
  { id: 'gateway-c', cli: 'claude', label: 'Claude gateway', baseUrl: 'https://gateway.example/anthropic', apiKeyEnv: 'TEST_GATEWAY_KEY', models: ['model-c'] },
  { id: 'gateway-x', cli: 'codex', label: 'Codex gateway', baseUrl: 'https://gateway.example/v1', apiKeyEnv: 'TEST_GATEWAY_KEY', models: ['model-x'] },
];

// @spec SEARCH-AI-001, SEARCH-AI-002, SEARCH-AI-003
test('selected provider and model reach the chosen executable without leaking secrets into argv or catalog', () => {
  const catalog = createAiCatalog({ providers });
  for (const p of providers) {
    let call;
    const execution = catalog.resolve({ cli: p.cli, provider: p.id, model: p.models[0] });
    spawnAi({ prompt: 'question', execution, env: { TEST_GATEWAY_KEY: 'test-secret', ANTHROPIC_API_KEY: 'old-key' },
      spawn: (cli, args, options) => { call = { cli, args, options }; return {}; } });
    assert.equal(call.cli, p.cli);
    assert.equal(call.args[call.args.indexOf('--model') + 1], p.models[0]);
    assert.ok(!JSON.stringify(call.args).includes('test-secret'));
    if (p.cli === 'claude') {
      assert.equal(call.options.env.ANTHROPIC_BASE_URL, p.baseUrl);
      assert.equal(call.options.env.ANTHROPIC_AUTH_TOKEN, 'test-secret');
      assert.equal(call.options.env.ANTHROPIC_API_KEY, undefined);
    } else {
      assert.ok(call.args.some((a) => a.includes(p.baseUrl)));
      assert.ok(call.args.some((a) => a.includes('env_key="TEST_GATEWAY_KEY"')));
    }
  }
  const exposed = JSON.stringify(publicCatalog(catalog));
  assert.ok(!exposed.includes('apiKeyEnv'));
  assert.ok(!exposed.includes('baseUrl'));
});

// @spec SEARCH-AI-001, SEARCH-AI-002, SEARCH-AI-003
test('unknown CLI, provider mismatch and unsupported models fail before spawning', () => {
  const catalog = createAiCatalog({ providers });
  for (const selection of [
    { cli: 'bash' }, { cli: 'codex', provider: 'gateway-c' },
    { cli: 'claude', provider: 'missing' },
    { cli: 'claude', provider: 'gateway-c', model: 'unsupported' },
    { cli: 'claude', model: '--help' },
  ]) assert.throws(() => catalog.resolve(selection));
  const execution = catalog.resolve({ cli: 'codex', provider: 'gateway-x', model: 'model-x' });
  assert.throws(() => spawnAi({ execution, env: {}, spawn: () => assert.fail('must not spawn') }), /TEST_GATEWAY_KEY/);
});

// @spec SEARCH-AI-001, SEARCH-AI-003
test('omitted selection preserves Claude defaults and default providers accept explicit model IDs', () => {
  const catalog = createAiCatalog();
  assert.equal(catalog.resolve().cli, 'claude');
  assert.equal(catalog.resolve().model, '');
  assert.equal(catalog.resolve({ cli: 'codex', model: 'custom/model-v1' }).model, 'custom/model-v1');
});

// @spec SEARCH-AI-002
test('invalid provider definitions and duplicate IDs fail configuration validation', () => {
  assert.throws(() => createAiCatalog({ providers: [providers[0], providers[0]] }));
  assert.throws(() => createAiCatalog({ providers: [{ ...providers[0], baseUrl: 'file:///tmp/key' }] }));
  assert.throws(() => createAiCatalog({ providers: [{ ...providers[0], apiKeyEnv: 'not a variable' }] }));
  assert.throws(() => createAiCatalog({ providers: [{ ...providers[0], id: undefined }] }));
  assert.throws(() => createAiCatalog({ providers: [{ ...providers[0], apiKeyEnv: true }] }));
});

// @spec SEARCH-AI-002
test('Codex rejects unsupported API-key header authentication', () => {
  assert.throws(() => createAiCatalog({ providers: [{ ...providers[1], auth: 'api-key' }] }), /Codex.*bearer/);
});
