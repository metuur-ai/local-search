import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HelpModal } from '../src/graph-explorer/components/HelpModal.jsx';
import { GRAPH_PROMPT, NODE_LINK_PROMPT, FLAT_ARRAY_PROMPT } from '../src/graph-explorer/graphPrompt.js';

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

  it('documents the flat-array shape, its hub ids, and its limits', () => {
    render(<HelpModal onClose={() => {}} />);
    const text = body();
    expect(text).toContain('array of file records');
    // The hub id prefixes synthesizeGraphData actually mints.
    ['repo_', 'proj_', 'tag_'].forEach((p) => expect(text).toContain(p));
    // The limitation that is invisible until the graph comes out wrong.
    expect(text).toContain('cannot do is state a typed relation');
    expect(text).toMatch(/all of them are/);
    expect(text).toContain('blended');
  });
});

// The copy path is the only part of the guide with a failure mode: a clipboard
// that is absent (non-secure context) or that rejects. Both paths must leave the
// user with the prompt and the modal open.
describe('HelpModal Paste Prompt', () => {
  // R-7.4. Two things about the control are load-bearing and neither is implied
  // by the copy behaviour: it is labelled "Paste Prompt", and it lives in the
  // graph-format section — the section a parse failure scrolls the user to. Put
  // it anywhere else and the user who just had a file rejected never sees it.
  //
  // The assertion is on document order rather than DOM containment on purpose:
  // `help-graph-format` marks the section *header*, and every body element of
  // that section — prose, code blocks, this control — is a sibling of it, not a
  // child. So "in the section" means "after this header and before the next
  // section header", which is what the reader sees.
  it('renders a control labelled "Paste Prompt" inside the graph-format section', () => {
    const { container } = render(<HelpModal onClose={() => {}} />);

    const button = screen.getByTestId('copy-prompt');
    expect(button.textContent.trim()).toBe('Paste Prompt');

    const sections = [...container.querySelectorAll('.modal-section')];
    const header = screen.getByTestId('help-graph-format');
    const next = sections[sections.indexOf(header) + 1];

    // After the graph-format header…
    expect(header.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    // …and before whatever section comes next, so it is not stranded further
    // down the modal under an unrelated heading.
    expect(next.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_PRECEDING)
      .toBeTruthy();
  });

  const stubClipboard = (writeText) => {
    Object.defineProperty(navigator, 'clipboard', {
      value: writeText ? { writeText } : undefined, configurable: true,
    });
  };

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });

  it('copies the prompt and confirms without closing the modal', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const onClose = vi.fn();
    render(<HelpModal onClose={onClose} />);

    fireEvent.click(screen.getByTestId('copy-prompt'));

    await waitFor(() => expect(screen.getByTestId('copy-prompt-status').textContent).toContain('Copied'));
    expect(writeText).toHaveBeenCalledWith(GRAPH_PROMPT);
    // Nothing to select by hand when the copy worked.
    expect(screen.queryByTestId('prompt-fallback')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('reveals the prompt in a read-only field when the write rejects', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    const onClose = vi.fn();
    render(<HelpModal onClose={onClose} />);

    fireEvent.click(screen.getByTestId('copy-prompt'));

    const field = await screen.findByTestId('prompt-fallback');
    expect(field.value).toBe(GRAPH_PROMPT);
    expect(field.readOnly).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('reveals the prompt when there is no clipboard at all', async () => {
    stubClipboard(null);
    const onClose = vi.fn();
    render(<HelpModal onClose={onClose} />);

    fireEvent.click(screen.getByTestId('copy-prompt'));

    const field = await screen.findByTestId('prompt-fallback');
    expect(field.value).toBe(GRAPH_PROMPT);
    // R-7.6 says "selectable", which is what separates a read-only field from a
    // disabled one: a disabled textarea cannot be selected, so revealing the
    // text into one would still leave the user with no way to take it.
    expect(field.readOnly).toBe(true);
    expect(field.disabled).toBe(false);
    // R-7.7 on the third path too — the modal survives a missing clipboard.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

// Three copy buttons share one component, so the state that makes a button say
// "Copied" (or spill a fallback textarea) has to live per instance. If it were
// hoisted to the modal, pressing one button would answer for all three and the
// fallback would show the wrong prompt.
describe('HelpModal per-shape prompt buttons', () => {
  const stubClipboard = (writeText) => {
    Object.defineProperty(navigator, 'clipboard', {
      value: writeText ? { writeText } : undefined, configurable: true,
    });
  };

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });

  const BUTTONS = [
    ['copy-prompt', GRAPH_PROMPT],
    ['copy-prompt-node-link', NODE_LINK_PROMPT],
    ['copy-prompt-flat-array', FLAT_ARRAY_PROMPT],
  ];

  it('offers one button per prompt, each copying its own text', async () => {
    for (const [testid, prompt] of BUTTONS) {
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard(writeText);
      const { unmount } = render(<HelpModal onClose={() => {}} />);

      fireEvent.click(screen.getByTestId(testid));

      await waitFor(() => expect(screen.getByTestId(`${testid}-status`).textContent).toContain('Copied'));
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith(prompt);
      unmount();
    }
  });

  it('confirms only on the button that was pressed', async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    render(<HelpModal onClose={() => {}} />);

    fireEvent.click(screen.getByTestId('copy-prompt-node-link'));

    await screen.findByTestId('copy-prompt-node-link-status');
    expect(screen.queryByTestId('copy-prompt-status')).toBeNull();
    expect(screen.queryByTestId('copy-prompt-flat-array-status')).toBeNull();
  });

  it('reveals only the pressed button\'s prompt when the clipboard is unavailable', async () => {
    stubClipboard(null);
    render(<HelpModal onClose={() => {}} />);

    fireEvent.click(screen.getByTestId('copy-prompt-flat-array'));

    const field = await screen.findByTestId('prompt-fallback-flat-array');
    expect(field.value).toBe(FLAT_ARRAY_PROMPT);
    expect(field.readOnly).toBe(true);
    expect(screen.queryByTestId('prompt-fallback')).toBeNull();
    expect(screen.queryByTestId('prompt-fallback-node-link')).toBeNull();
  });
});
