import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { RepoPicker, canSubmit } from '../src/components/RepoPicker.jsx';

const REPOS = [
  { name: 'alpha', spec_count: 3, graph_node_count: 12 },
  { name: 'beta', spec_count: 5, graph_node_count: 0 },
];

describe('RepoPicker 1.2 (R-1.1) — one selectable entry per repo', () => {
  it('renders one entry per repo showing its name', () => {
    render(<RepoPicker repos={REPOS} selected={[]} onToggle={() => {}} />);
    for (const repo of REPOS) {
      const entry = screen.getByTestId(`repo-entry-${repo.name}`);
      expect(entry).toBeTruthy();
      expect(entry.textContent).toContain(repo.name);
    }
  });

  it('calls onToggle(name) when an entry is clicked', () => {
    const onToggle = vi.fn();
    render(<RepoPicker repos={REPOS} selected={[]} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('repo-entry-alpha'));
    expect(onToggle).toHaveBeenCalledWith('alpha');
  });

  it('reflects selected state based on the selected prop', () => {
    render(<RepoPicker repos={REPOS} selected={['alpha']} onToggle={() => {}} />);
    const selectedEntry = screen.getByTestId('repo-entry-alpha');
    const unselectedEntry = screen.getByTestId('repo-entry-beta');
    expect(selectedEntry.getAttribute('aria-selected')).toBe('true');
    expect(unselectedEntry.getAttribute('aria-selected')).toBe('false');
  });
});

describe('RepoPicker 1.3 (R-1.3, R-1.4) — graph indicator + spec badge', () => {
  it('shows a "has graph" indicator only where graph_node_count > 0', () => {
    render(<RepoPicker repos={REPOS} selected={[]} onToggle={() => {}} />);
    expect(screen.getByTestId('repo-graph-alpha')).toBeTruthy();
    expect(screen.queryByTestId('repo-graph-beta')).toBeNull();
  });

  it('always shows spec_count as a badge for every repo', () => {
    render(<RepoPicker repos={REPOS} selected={[]} onToggle={() => {}} />);
    expect(screen.getByTestId('repo-spec-count-alpha').textContent).toContain('3');
    expect(screen.getByTestId('repo-spec-count-beta').textContent).toContain('5');
  });

  it('is tolerant of missing fields', () => {
    render(<RepoPicker repos={[{ name: 'gamma' }]} selected={[]} onToggle={() => {}} />);
    expect(screen.getByTestId('repo-entry-gamma')).toBeTruthy();
    expect(screen.getByTestId('repo-spec-count-gamma').textContent).toContain('0');
    expect(screen.queryByTestId('repo-graph-gamma')).toBeNull();
  });
});

describe('RepoPicker 1.4 (R-1.5) — canSubmit predicate', () => {
  it('returns false when nothing is selected', () => {
    expect(canSubmit([])).toBe(false);
  });

  it('returns true when at least one repo is selected', () => {
    expect(canSubmit(['alpha'])).toBe(true);
    expect(canSubmit(['alpha', 'beta'])).toBe(true);
  });
});

describe('RepoPicker 1.5 (R-1.6) — error state', () => {
  it('renders an explicit error with its message when error is set', () => {
    render(
      <RepoPicker repos={[]} error={{ message: 'boom' }} selected={[]} onToggle={() => {}} />,
    );
    const err = screen.getByTestId('repo-picker-error');
    expect(err).toBeTruthy();
    expect(err.textContent).toContain('boom');
  });

  it('accepts a plain string error', () => {
    render(<RepoPicker repos={[]} error="kaboom" selected={[]} onToggle={() => {}} />);
    expect(screen.getByTestId('repo-picker-error').textContent).toContain('kaboom');
  });

  it('does not render an empty "no repos" success state when error is set', () => {
    render(
      <RepoPicker repos={[]} error={{ message: 'boom' }} selected={[]} onToggle={() => {}} />,
    );
    expect(screen.queryByTestId('repo-picker-empty')).toBeNull();
  });

  it('renders the empty-but-ok state when error is null and repos is empty', () => {
    render(<RepoPicker repos={[]} error={null} selected={[]} onToggle={() => {}} />);
    expect(screen.getByTestId('repo-picker-empty')).toBeTruthy();
    expect(screen.queryByTestId('repo-picker-error')).toBeNull();
  });
});
