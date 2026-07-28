// Edge-family toggles for the filter bar. Node filters (Types / Repos /
// Projects / Tags) select which NODES are drawn; this selects which LINKS are,
// and the two combine — so it belongs beside them rather than in the legend,
// where the control was easy to miss entirely.

import { EDGE_FAMILY_ORDER, EDGE_FAMILY_META } from '../graphData.js';

// A short line drawn with the family's own stroke, so the swatch is the same
// mark the canvas draws rather than a dot standing in for it.
function LineSwatch({ meta, dim }) {
  return (
    <svg class="linkfam-line" viewBox="0 0 22 6" aria-hidden="true">
      <line
        x1="1" y1="3" x2="21" y2="3"
        stroke={meta.color}
        stroke-width={Math.max(meta.width, 1.8)}
        stroke-linecap="round"
        stroke-dasharray={meta.dash ? meta.dash.join(' ') : undefined}
        opacity={dim ? 0.4 : 1}
      />
    </svg>
  );
}

export function LinkTypeFilter({ families, counts, onToggle }) {
  if (!families || !counts || !onToggle) return null;

  return (
    <div class="linkfams" data-testid="link-type-filter">
      <span class="filters-label">Connections</span>
      {EDGE_FAMILY_ORDER.map((fam) => {
        const meta = EDGE_FAMILY_META[fam];
        const count = counts[fam] || 0;
        const on = families.has(fam);
        // A family with no links is shown anyway — its absence is itself a
        // finding (no declared edges means nothing was wired up) — but it
        // cannot be toggled, since toggling it changes nothing.
        const empty = count === 0;
        return (
          <button
            type="button"
            key={fam}
            data-testid={`link-family-${fam}`}
            class={`linkfam${on ? ' is-on' : ''}`}
            disabled={empty}
            aria-pressed={on}
            title={empty ? `No ${meta.label.toLowerCase()} links in this graph` : meta.label}
            onClick={() => onToggle(fam)}
          >
            <LineSwatch meta={meta} dim={!on || empty} />
            <span class="linkfam-label">{meta.short}</span>
            <span class="linkfam-count">{count.toLocaleString()}</span>
          </button>
        );
      })}
    </div>
  );
}
