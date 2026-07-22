// Presentational elapsed-time indicator (R-9.2). Renders elapsed wall-clock time
// as mm:ss from startedAt, ticking ~1s while running and freezing when stopped.

import { useEffect, useState } from 'preact/hooks';
import './small.css';

// Pure helper: format a millisecond duration as mm:ss (clamped at zero).
export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function ElapsedTimer({ startedAt, running, currentActivity }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!running) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);

  const elapsed = running ? now - startedAt : Date.now() - startedAt;

  return (
    <span class="elapsed-timer-wrap">
      <span class="elapsed-timer" data-testid="elapsed-timer">
        {formatElapsed(elapsed)}
      </span>
      {currentActivity && (
        <span class="elapsed-activity" data-testid="elapsed-activity">
          {currentActivity}
        </span>
      )}
    </span>
  );
}
