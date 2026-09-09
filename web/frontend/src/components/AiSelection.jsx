import './AiSelection.css';

// @spec SEARCH-AI-001, SEARCH-AI-002, SEARCH-AI-003
export function AiSelection({ providers, value, onChange, disabled = false }) {
  const available = providers.filter((p) => p.cli === value.cli);
  const provider = available.find((p) => p.id === value.provider);
  const models = provider?.models ?? [];
  const chooseProvider = (p) => onChange({ cli: p.cli, provider: p.id, model: p.models[0] ?? '' });
  return (
    <fieldset class="ai-selection" disabled={disabled} aria-label="AI execution">
      <legend class="facet-label">AI execution</legend>
      <label>
        AI CLI
        <select value={value.cli} onChange={(e) => chooseProvider(providers.find((p) => p.cli === e.currentTarget.value))}>
          <option value="claude">Claude CLI</option>
          <option value="codex">Codex CLI</option>
        </select>
      </label>
      <label>
        Provider
        <select value={value.provider} onChange={(e) => chooseProvider(available.find((p) => p.id === e.currentTarget.value))}>
          {available.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <label>
        Model
        {models.length ? (
          <select value={value.model} onChange={(e) => onChange({ ...value, model: e.currentTarget.value })}>
            {models.map((model) => <option key={model} value={model}>{model}</option>)}
          </select>
        ) : (
          <input value={value.model} maxLength={200} placeholder="CLI default" autoComplete="off"
            onInput={(e) => onChange({ ...value, model: e.currentTarget.value })} />
        )}
      </label>
      <p class="facet-hint">{models.length ? 'Models configured for this provider.' : 'Uses your CLI setup. Leave Model empty to keep its default.'} Follow-ups keep the original selection.</p>
    </fieldset>
  );
}
