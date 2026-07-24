// Node-type legend, rebuilt from whatever render colors are on screen. `groups`
// is a pre-sorted array of { color, name, count }.

export function Legend({ groups }) {
  return (
    <div class="legend">
      <div class="legend-title">Node Types</div>
      <div id="legend-items">
        {groups.map(({ color, name, count }) => (
          <div class="legend-item" key={color}>
            <span class="legend-dot" style={{ background: color }} />
            {name}
            <span style="color:var(--ink-faint);font-family:var(--font-mono);font-size:10px;margin-left:auto">
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
