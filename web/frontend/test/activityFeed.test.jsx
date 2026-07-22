import { render, screen } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { ActivityFeed } from '../src/components/ActivityFeed.jsx';

describe('ActivityFeed', () => {
  it('renders the activity-feed container', () => {
    render(<ActivityFeed events={[]} />);
    expect(screen.getByTestId('activity-feed')).toBeTruthy();
  });

  it('R-7.1: renders one ordered entry per activity event with command + summary', () => {
    const events = [
      { type: 'activity', data: { command: 'local-search fts "auth"', resultSummary: '3 candidates' } },
      { type: 'activity', data: { command: 'local-search embed "auth"', resultSummary: 'vectorized' } },
      { type: 'activity', data: { command: 'local-search rank', resultSummary: 'ranked 3 sources' } },
    ];
    render(<ActivityFeed events={events} />);

    const e0 = screen.getByTestId('activity-entry-0');
    const e1 = screen.getByTestId('activity-entry-1');
    const e2 = screen.getByTestId('activity-entry-2');

    expect(e0.textContent).toContain('local-search fts "auth"');
    expect(e0.textContent).toContain('3 candidates');
    expect(e1.textContent).toContain('local-search embed "auth"');
    expect(e1.textContent).toContain('vectorized');
    expect(e2.textContent).toContain('local-search rank');
    expect(e2.textContent).toContain('ranked 3 sources');
  });

  it('R-7.2: renders an assistant event as an entry showing its progress text', () => {
    const events = [
      { type: 'assistant', data: { text: 'Let me search the codebase for auth logic.' } },
    ];
    render(<ActivityFeed events={events} />);

    const entry = screen.getByTestId('activity-entry-0');
    expect(entry.textContent).toContain('Let me search the codebase for auth logic.');
  });

  it('R-7.3: while running, stays mounted and reflects newly added events on rerender', () => {
    const initial = [
      { type: 'activity', data: { command: 'local-search fts "x"', resultSummary: '1 hit' } },
    ];
    const { rerender } = render(<ActivityFeed events={initial} running={true} />);
    expect(screen.getByTestId('activity-feed')).toBeTruthy();
    expect(screen.queryByTestId('activity-entry-1')).toBeNull();

    const updated = [
      ...initial,
      { type: 'assistant', data: { text: 'Found a match, continuing.' } },
    ];
    rerender(<ActivityFeed events={updated} running={true} />);

    expect(screen.getByTestId('activity-feed')).toBeTruthy();
    const newEntry = screen.getByTestId('activity-entry-1');
    expect(newEntry.textContent).toContain('Found a match, continuing.');
  });

  it('R-7.4: reflects the current phase and updates it on rerender', () => {
    const { rerender } = render(<ActivityFeed events={[]} phase="searching" />);
    const phase = screen.getByTestId('activity-phase');
    expect(phase.textContent).toContain('searching');

    rerender(<ActivityFeed events={[]} phase="done" />);
    expect(screen.getByTestId('activity-phase').textContent).toContain('done');
  });

  it('R-7.5: preserves the full ordered log after more events arrive', () => {
    const early = [
      { type: 'activity', data: { command: 'first-command', resultSummary: 'first result' } },
      { type: 'assistant', data: { text: 'second narration' } },
    ];
    const { rerender } = render(<ActivityFeed events={early} />);
    expect(screen.getByTestId('activity-entry-0').textContent).toContain('first-command');

    const more = [
      ...early,
      { type: 'question', data: { text: 'third: which repo?' } },
      { type: 'reply', data: { text: 'fourth: the main one' } },
    ];
    rerender(<ActivityFeed events={more} />);

    // Early entries still present and in original positions.
    expect(screen.getByTestId('activity-entry-0').textContent).toContain('first-command');
    expect(screen.getByTestId('activity-entry-1').textContent).toContain('second narration');
    // Later entries appended in arrival order.
    expect(screen.getByTestId('activity-entry-2').textContent).toContain('third: which repo?');
    expect(screen.getByTestId('activity-entry-3').textContent).toContain('fourth: the main one');
    // Nothing dropped.
    expect(screen.queryByTestId('activity-entry-4')).toBeNull();
  });
});
