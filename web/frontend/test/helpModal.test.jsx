import { render, screen } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { HelpModal } from '../src/graph-explorer/components/HelpModal.jsx';

// The format guide is the only place the accepted upload shapes are written
// down for a human, so these assertions guard the fields a file must carry.
describe('HelpModal graph-format section', () => {
  const body = () => screen.getByRole('dialog').textContent;

  it('documents the node-link shape and its required id', () => {
    render(<HelpModal onClose={() => {}} />);
    expect(screen.getByTestId('help-graph-format')).toBeTruthy();
    const text = body();
    expect(text).toContain('node-link graph');
    expect(text).toMatch(/only .*id.* is required/);
    expect(text).toContain('unique');
    // `edges` is a real synonym in normalizeGraph; a file using it must not
    // read as unsupported.
    expect(text).toContain('edges');
  });

  it('documents every node and link field the parser reads', () => {
    render(<HelpModal onClose={() => {}} />);
    const text = body();
    ['name', 'label', 'title', 'type', 'path', 'repo', 'project', 'tags', 'val', 'flags']
      .forEach((field) => expect(text).toContain(field));
    ['source', 'target', 'relation'].forEach((field) => expect(text).toContain(field));
  });

  it('documents the three edge families and the fresh-load selection', () => {
    render(<HelpModal onClose={() => {}} />);
    const text = body();
    expect(text).toContain('declared');
    expect(text).toContain('dangling');
    expect(text).toContain('similarity');
    expect(text).toContain('unresolved');
    expect(text).toMatch(/opens on all three families/);
  });
});
