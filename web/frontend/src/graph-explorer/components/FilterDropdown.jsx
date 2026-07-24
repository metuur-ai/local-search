// Reusable multi-select filter dropdown (used for type / repo / project / tag).
// Open state is controlled by the parent so only one dropdown is open at a time
// (matching the original single-popover behavior); the option search term is
// local. Truncated option values get the shared styled tooltip.

import { useEffect, useState } from 'preact/hooks';
import { ensureOptionTooltip } from './optionTooltip.js';

export function FilterDropdown({ emptyLabel, searchLabel, options, selected, onToggle, open, onOpenChange }) {
  const [term, setTerm] = useState('');

  useEffect(() => { ensureOptionTooltip(); }, []);

  const count = selected.size;
  const shown = term ? options.filter((o) => o.toLowerCase().includes(term.toLowerCase())) : options;

  return (
    <div class="select-wrap" data-dd>
      <button
        type="button"
        class={`dropdown-trigger${count > 0 ? ' is-active' : ''}`}
        onClick={(e) => { e.stopPropagation(); onOpenChange(!open); }}
      >
        <span>{count === 0 ? emptyLabel : `${count} Selected`}</span>
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div class="popover popover-enter">
          <div class="popover-search">
            <input
              type="text"
              placeholder={`Search ${searchLabel}…`}
              value={term}
              onInput={(e) => setTerm(e.currentTarget.value)}
            />
          </div>
          <div class="popover-list">
            {shown.map((opt) => (
              <label class="opt dropdown-option" key={opt}>
                <input
                  type="checkbox"
                  checked={selected.has(opt)}
                  onChange={(e) => onToggle(opt, e.currentTarget.checked)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
