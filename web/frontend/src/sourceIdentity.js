// The app's one definition of "same document", and its one tag-shape coercion.
//
// These live in their own module rather than in app.jsx because components need
// them: the Source Map identifies its leaves by `sourceKey` (R-3.6) and reads tags
// through `normalizeTags` (R-3.2). Importing them from app.jsx would make a
// component depend on the app shell that renders it — a circular import that
// happens to resolve today only because both were hoisted function declarations,
// and that drags app.jsx's whole dependency graph (marked, mermaid, cytoscape)
// into every component test.
//
// A second copy of either rule is the real hazard: two identity rules would let a
// leaf and its list row drift apart, and two tag parsers would eventually disagree
// with the one `mergeSources` applies on the way in.

// Stable identity for a source row (fullpath is unique; fall back to repo/name).
// `mergeSources` dedupes on it, source selection is keyed by it, and the Source Map
// identifies its leaves with it (R-3.6).
export function sourceKey(s) {
  return s?.fullpath || `${s?.repo ?? ''}/${s?.name ?? s?.path ?? ''}`;
}

// Normalize a source's `tags` to a string array. The graph-DB (no-AI) path emits
// `tags` as a string — either "" or a bracketed list like "[a, b, c]" — while
// consumers (facets, filters, render) all expect an array. Coerce here so the
// whole app sees one shape.
export function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.filter((t) => t != null).map(String);
  if (typeof tags === 'string') {
    return tags
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}
