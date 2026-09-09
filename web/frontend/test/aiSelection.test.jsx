import { render, screen, fireEvent } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { it, expect, vi } from 'vitest';
import { AiSelection } from '../src/components/AiSelection.jsx';
import { postQuery } from '../src/api.js';

const providers = [
  { id: 'claude-default', cli: 'claude', label: 'CLI default', models: [] },
  { id: 'codex-default', cli: 'codex', label: 'CLI default', models: [] },
  { id: 'gateway', cli: 'codex', label: 'My gateway', models: ['model-a', 'model-b'] },
];

// @spec SEARCH-AI-001, SEARCH-AI-002, SEARCH-AI-003
it('changes CLI, filters providers, and sends the selected provider/model in the query', async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ sessionId: 's' }) }));
  vi.stubGlobal('fetch', fetchMock);
  function Harness() {
    const [value, onChange] = useState({ cli: 'claude', provider: 'claude-default', model: '' });
    return <><AiSelection providers={providers} value={value} onChange={onChange} />
      <button onClick={() => postQuery({ q: 'q', repos: ['docs'], mode: 'ai', ai: value })}>Run</button></>;
  }
  try {
    render(<Harness />);
    expect(screen.queryByRole('option', { name: 'My gateway' })).toBeNull();
    fireEvent.change(screen.getByLabelText('AI CLI'), { target: { value: 'codex' } });
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'gateway' } });
    expect(screen.getByLabelText('Model').value).toBe('model-a');
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'model-b' } });
    fireEvent.click(screen.getByText('Run'));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).ai).toEqual({ cli: 'codex', provider: 'gateway', model: 'model-b' });
  } finally { vi.unstubAllGlobals(); }
});

// @spec SEARCH-AI-001, SEARCH-AI-002, SEARCH-AI-003
it('locks the choices while a run is active and supports an explicit model with CLI defaults', () => {
  const onChange = vi.fn();
  const value = { cli: 'codex', provider: 'codex-default', model: '' };
  const { rerender } = render(<AiSelection providers={providers} value={value} onChange={onChange} />);
  fireEvent.input(screen.getByLabelText('Model'), { target: { value: 'model-c' } });
  expect(onChange).toHaveBeenCalledWith({ ...value, model: 'model-c' });
  rerender(<AiSelection providers={providers} value={value} onChange={onChange} disabled />);
  expect(screen.getByRole('group', { name: 'AI execution' }).disabled).toBe(true);
});
