// Instant, styled tooltip for truncated filter-dropdown options — one reusable
// element on <body> (the popover clips overflow), event-delegated so it covers
// every dynamically-built dropdown, and shown ONLY when the value is cut off.
// Ported verbatim from the former standalone page; installs once, idempotently.

let installed = false;

export function ensureOptionTooltip() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  const tip = document.createElement('div');
  tip.id = 'filter-tooltip';
  document.body.appendChild(tip);
  let anchor = null;

  function place() {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const pad = 8, tw = tip.offsetWidth, th = tip.offsetHeight;
    const left = Math.min(Math.max(pad, r.left - 2), window.innerWidth - tw - pad);
    let top = r.top - th - 8;
    const below = top < pad;
    if (below) top = r.bottom + 8;
    tip.classList.toggle('below', below);
    tip.style.setProperty('--arrow-x', Math.max(8, Math.min(r.left - left + 14, tw - 16)) + 'px');
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function show(opt) {
    if (opt === anchor) return;
    const span = opt.querySelector('span');
    if (!span || span.scrollWidth <= span.clientWidth + 1) { hide(); return; }
    anchor = opt;
    tip.textContent = span.textContent;
    tip.classList.add('show');
    place();
  }
  function hide() { anchor = null; tip.classList.remove('show'); }

  document.addEventListener('mouseover', (e) => {
    const opt = e.target.closest && e.target.closest('.dropdown-option');
    if (opt) show(opt);
  });
  document.addEventListener('mouseout', (e) => {
    const opt = e.target.closest && e.target.closest('.dropdown-option');
    if (opt && opt === anchor && !opt.contains(e.relatedTarget)) hide();
  });
  // A stale position is worse than none: drop the tooltip on any scroll.
  document.addEventListener('scroll', hide, true);
}
