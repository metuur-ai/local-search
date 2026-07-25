// Node-type legend, rebuilt from whatever render colors are on screen. `groups`
// is a pre-sorted array of { color, name, count }.
//
// Link families are NOT here — they are toggles, and they live beside the other
// filters in the topbar (see LinkTypeFilter).

export function Legend({ groups }) {
  return (
    <div class="legend">
      <div class="legend-title">Node Types</div>
      <div id="legend-items">
        {groups.map(({ color, name, count }) => (
          <div class="legend-item" key={color}>
            <span class="legend-dot" style={{ background: color }} />
            {name}
            <span class="legend-count">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
