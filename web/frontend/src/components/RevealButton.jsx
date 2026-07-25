// Per-source "Reveal in Finder" action. Shared by the search console and the
// graph explorer, which have separate stylesheets and separate icon stacks —
// hence the self-contained CSS and the inline SVG (Font Awesome is only loaded
// on the console page).

import { useState } from 'preact/hooks';
import { revealSource } from '../api.js';
import './RevealButton.css';

/**
 * revealLabel(platform) -> the file manager's name on that platform.
 * `platform` is a navigator.platform-style string.
 */
export function revealLabel(platform = '') {
  const p = String(platform);
  if (/Mac/i.test(p)) return 'Reveal in Finder';
  if (/Win/i.test(p)) return 'Show in File Explorer';
  return 'Open containing folder';
}

/**
 * <RevealButton repo path fullpath />
 * Renders nothing when there is no file to point at (synthetic graph hubs, a
 * source row with no path). Stops click propagation so it can sit inside an
 * already-clickable result card without also selecting it.
 */
export function RevealButton({ repo, path, fullpath, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!path && !fullpath) return null;

  const label = revealLabel(
    typeof navigator !== 'undefined' ? navigator.platform || navigator.userAgent : ''
  );

  const onClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setError('');
    try {
      await revealSource({ repo, path, fullpath });
    } catch (err) {
      setError(err?.message ?? 'reveal failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      class={`reveal-btn${compact ? ' reveal-btn-compact' : ''}${error ? ' is-error' : ''}`}
      data-testid="reveal-btn"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={error ? `${label} — ${error}` : label}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
        />
      </svg>
      {!compact && <span class="reveal-btn-label">{label}</span>}
    </button>
  );
}
