import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { LinkTypeFilter } from '../src/graph-explorer/components/LinkTypeFilter.jsx';

const COUNTS = { declared: 378, dangling: 23, similarity: 0 };

const btn = (fam) => screen.getByTestId(`link-family-${fam}`);

describe('LinkTypeFilter', () => {
  it('renders nothing when the family props are missing', () => {
    const { container } = render(<LinkTypeFilter />);
    expect(container.innerHTML).toBe('');
  });

  it('lists every family with its count, including empty ones', () => {
    render(
      <LinkTypeFilter
        families={new Set(['declared', 'dangling'])}
        counts={COUNTS}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByTestId('link-type-filter')).toBeTruthy();
    expect(btn('declared').textContent).toContain('378');
    expect(btn('dangling').textContent).toContain('23');
    // A zero-count family stays visible — its absence is itself a finding.
    expect(btn('similarity').textContent).toContain('0');
  });

  it('marks selected families pressed and leaves unselected ones unstyled', () => {
    render(
      <LinkTypeFilter
        families={new Set(['declared'])}
        counts={{ declared: 378, dangling: 23, similarity: 2966 }}
        onToggle={() => {}}
      />,
    );
    expect(btn('declared').getAttribute('aria-pressed')).toBe('true');
    expect(btn('declared').className).toContain('is-on');

    expect(btn('dangling').getAttribute('aria-pressed')).toBe('false');
    expect(btn('dangling').className).not.toContain('is-on');
  });

  it('toggles a family on click and disables families with no links', () => {
    const onToggle = vi.fn();
    render(
      <LinkTypeFilter
        families={new Set(['declared', 'dangling'])}
        counts={COUNTS}
        onToggle={onToggle}
      />,
    );

    fireEvent.click(btn('declared'));
    expect(onToggle).toHaveBeenCalledWith('declared');

    // similarity has 0 links, so toggling it could not change the canvas.
    // `disabled` is the real guard: a browser fires no click on a disabled
    // control at all. (fireEvent dispatches directly and bypasses that gate,
    // so asserting the handler never runs would only be testing jsdom.)
    expect(btn('similarity').disabled).toBe(true);
  });

  it('uses short labels so the chips do not truncate in the filter row', () => {
    render(
      <LinkTypeFilter
        families={new Set(['declared'])}
        counts={{ declared: 1, dangling: 1, similarity: 1 }}
        onToggle={() => {}}
      />,
    );
    // The full label ("Declared · unresolved target") is the tooltip, not the chip.
    expect(btn('dangling').textContent).toContain('Unresolved');
    expect(btn('dangling').textContent).not.toContain('unresolved target');
    expect(btn('dangling').getAttribute('title')).toBe('Declared · unresolved target');
  });
});
