import './AiSelection.css';

// @spec SEARCH-AI-001, SEARCH-AI-002, SEARCH-AI-003
export function AiSelection({ providers, value, onChange, disabled = false }) {
  const available = providers.filter((p) => p.cli === value.cli);
  const provider = available.find((p) => p.id === value.provider);
  const models = provider?.models ?? [];
  // Built-in CLI defaults have no fixed model list, only suggestions the user can override.
  const suggestions = provider?.suggestions ?? [];
  const chooseProvider = (p) => onChange({ cli: p.cli, provider: p.id, model: p.models[0] ?? '' });
  const hint = models.length
    ? 'Models configured for this provider. Follow-ups keep the original selection.'
    : 'Choose a model for this CLI, or CLI default to keep its own. Follow-ups keep the original selection.';
  return (
    <fieldset class="ai-selection" disabled={disabled} aria-label="AI execution" title={hint}>
      <legend class="ai-selection-legend">AI execution</legend>
      <i class="fa-solid fa-wand-magic-sparkles ai-selection-icon" aria-hidden="true" />
      <label class="ai-field">
        <span class="ai-field-label">AI CLI</span>
        <select value={value.cli} onChange={(e) => chooseProvider(providers.find((p) => p.cli === e.currentTarget.value))}>
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
        </select>
      </label>
      {/* Only surface the endpoint choice when the user configured more than the CLI default. */}
      {available.length > 1 && (
        <label class="ai-field">
          <span class="ai-field-label">Provider</span>
          <select value={value.provider} onChange={(e) => chooseProvider(available.find((p) => p.id === e.currentTarget.value))}>
            {available.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      )}
      <label class="ai-field">
        <span class="ai-field-label">Model</span>
        {models.length ? (
          <select value={value.model} onChange={(e) => onChange({ ...value, model: e.currentTarget.value })}>
            {models.map((model) => <option key={model} value={model}>{model}</option>)}
          </select>
        ) : (
          suggestions.length ? (
            <select value={value.model} onChange={(e) => onChange({ ...value, model: e.currentTarget.value })}>
              <option value="">CLI default</option>
              {suggestions.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          ) : (
            <input value={value.model} maxLength={200} placeholder="CLI default" autoComplete="off"
              onInput={(e) => onChange({ ...value, model: e.currentTarget.value })} />
          )
        )}
      </label>
    </fieldset>
  );
}
