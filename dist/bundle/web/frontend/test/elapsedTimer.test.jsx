import { render, screen, act } from '@testing-library/preact';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ElapsedTimer, formatElapsed } from '../src/components/ElapsedTimer.jsx';

afterEach(() => {
  vi.useRealTimers();
});

describe('formatElapsed (R-9.2) — mm:ss pure helper', () => {
  it('formats zero as 00:00', () => {
    expect(formatElapsed(0)).toBe('00:00');
  });

  it('formats 65000ms as 01:05', () => {
    expect(formatElapsed(65000)).toBe('01:05');
  });

  it('clamps negative input to 00:00', () => {
    expect(formatElapsed(-500)).toBe('00:00');
  });

  it('formats sub-second as 00:00 and rounds down seconds', () => {
    expect(formatElapsed(1999)).toBe('00:01');
    expect(formatElapsed(600000)).toBe('10:00');
  });
});

describe('ElapsedTimer 9.2 (R-9.2)', () => {
  it('renders mm:ss computed from Date.now() - startedAt', () => {
    vi.useFakeTimers();
    const now = 1_000_000_000_000;
    vi.setSystemTime(now);
    render(<ElapsedTimer startedAt={now - 65000} running={false} />);
    expect(screen.getByTestId('elapsed-timer').textContent).toContain('01:05');
  });

  it('ticks while running as timers advance', () => {
    vi.useFakeTimers();
    const now = 1_000_000_000_000;
    vi.setSystemTime(now);
    render(<ElapsedTimer startedAt={now} running={true} />);
    expect(screen.getByTestId('elapsed-timer').textContent).toContain('00:00');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByTestId('elapsed-timer').textContent).toContain('00:03');
  });

  it('does not tick when not running', () => {
    vi.useFakeTimers();
    const now = 1_000_000_000_000;
    vi.setSystemTime(now);
    render(<ElapsedTimer startedAt={now - 10000} running={false} />);
    expect(screen.getByTestId('elapsed-timer').textContent).toContain('00:10');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId('elapsed-timer').textContent).toContain('00:10');
  });

  it('renders the current activity label when provided', () => {
    vi.useFakeTimers();
    const now = 1_000_000_000_000;
    vi.setSystemTime(now);
    render(<ElapsedTimer startedAt={now} running={true} currentActivity="searching" />);
    expect(screen.getByTestId('elapsed-activity').textContent).toContain('searching');
  });

  it('omits the activity label when not provided', () => {
    vi.useFakeTimers();
    const now = 1_000_000_000_000;
    vi.setSystemTime(now);
    render(<ElapsedTimer startedAt={now} running={true} />);
    expect(screen.queryByTestId('elapsed-activity')).toBeNull();
  });
});
