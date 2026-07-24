// "Refresh from repos" control: a button + popover that lists the registered
// repos with per-repo spec counts, and rebuilds + persists the graph from the
// selected subset (empty selection rebuilds from all). Owns its open/loading
// state; hands the freshly normalized graph back to the parent via onRebuilt.

import { useEffect, useRef, useState } from 'preact/hooks';
import { fetchRepos, refreshGraph } from '../../api.js';
import { toGraph } from '../graphData.js';

export function RefreshReposPanel({ onRebuilt }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null); // null = not loaded yet
  const [loadError, setLoadError] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const [status, setStatus] = useState({ text: '', error: false });
  const [rebuilding, setRebuilding] = useState(false);
  const wrapRef = useRef(null);

  // Close on any click outside the wrap.
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  async function loadRepoCheckboxes() {
    setRows(null);
    setLoadError(null);
    try {
      const data = await fetchRepos();
      setRows(Array.isArray(data) ? data : (data.repos || []));
    } catch (err) {
      setLoadError('Failed to load repos: ' + (err?.message || String(err)));
    }
  }

  function onOpenClick(e) {
    e.stopPropagation();
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) {
      setStatus({ text: '', error: false });
      loadRepoCheckboxes();
    }
  }

  function toggleRepo(name, isChecked) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (isChecked) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  async function onRebuild() {
    setRebuilding(true);
    setStatus({ text: 'Rebuilding…', error: false });
    try {
      const data = await refreshGraph([...checked]);
      const g = toGraph(data);
      onRebuilt(g);
      setStatus(
        g.nodes.length
          ? { text: `Loaded ${g.nodes.length} nodes.`, error: false }
          : { text: 'Graph is empty.', error: false }
      );
    } catch (err) {
      setStatus({ text: 'Rebuild failed: ' + (err?.message || String(err)), error: true });
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <div class="select-wrap" ref={wrapRef}>
      <button type="button" class="btn" onClick={onOpenClick}>
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Refresh from repos
      </button>
      {open && (
        <div class="popover" style="left:auto; right:0; width:280px;">
          <div class="popover-search" style="font-weight:700; color:var(--ink); font-family:var(--font-sans); font-size:12.5px;">
            Rebuild graph from repos
          </div>
          <div style="max-height:240px; overflow:auto; padding:8px 11px; display:flex; flex-direction:column; gap:6px; font-family:var(--font-sans); font-size:12.5px; color:var(--ink);">
            {loadError ? (
              <span style="color:#c0392b;">{loadError}</span>
            ) : rows === null ? (
              <span style="color:var(--ink-faint);">Loading repos…</span>
            ) : rows.length === 0 ? (
              <span style="color:var(--ink-faint);">No repos found. Rebuild will use all repos.</span>
            ) : (
              rows.map((row) => {
                const name = row.name ?? row.repo;
                const count = row.spec_count != null ? row.spec_count : 0;
                return (
                  <label key={name} style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input
                      type="checkbox"
                      checked={checked.has(name)}
                      onChange={(e) => toggleRepo(name, e.currentTarget.checked)}
                    />
                    <span>{`${name}  (${count} specs)`}</span>
                  </label>
                );
              })
            )}
          </div>
          <div style="padding:9px 11px; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:8px;">
            <span style={`font-family:var(--font-sans); font-size:11.5px; color:${status.error ? '#c0392b' : 'var(--ink-faint)'};`}>
              {status.text}
            </span>
            <button type="button" class="btn btn-primary" disabled={rebuilding} onClick={onRebuild}>
              Rebuild graph
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
