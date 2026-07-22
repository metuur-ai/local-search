import { render, screen } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { ProvenancePanel } from '../src/components/ProvenancePanel.jsx';

describe('ProvenancePanel', () => {
  it('renders the provenance-panel container', () => {
    render(<ProvenancePanel provenance={{ scope: [], missing: [] }} selected={[]} />);
    expect(screen.getByTestId('provenance-panel')).toBeTruthy();
  });

  it('R-5.2: renders the scope set of repos actually searched', () => {
    render(
      <ProvenancePanel
        provenance={{ scope: ['core', 'gateway'], missing: [] }}
        selected={['core', 'gateway']}
      />
    );
    const scope = screen.getByTestId('prov-scope');
    expect(scope.textContent).toContain('core');
    expect(scope.textContent).toContain('gateway');
    expect(screen.getByTestId('prov-scope-core')).toBeTruthy();
    expect(screen.getByTestId('prov-scope-gateway')).toBeTruthy();
  });

  it('R-5.3: shows each missing repo with reason and fix', () => {
    render(
      <ProvenancePanel
        provenance={{
          scope: ['core'],
          missing: [
            { repo: 'legacy', reason: 'no index built', fix: 'run local-search index legacy' },
          ],
        }}
        selected={['core', 'legacy']}
      />
    );
    const entry = screen.getByTestId('prov-missing-legacy');
    expect(entry.textContent).toContain('no index built');
    expect(entry.textContent).toContain('run local-search index legacy');
  });

  it('R-5.4: renders an explicit unreached note for a selected repo not in scope or missing', () => {
    render(
      <ProvenancePanel
        provenance={{ scope: ['a'], missing: [] }}
        selected={['a', 'b']}
      />
    );
    const unreached = screen.getByTestId('prov-unreached-b');
    expect(unreached).toBeTruthy();
    expect(unreached.textContent).toContain('b');
    // "a" was searched, so it must NOT be flagged unreached.
    expect(screen.queryByTestId('prov-unreached-a')).toBeNull();
  });
});
