// Frontmatter: the single shared YAML parse (decision A1, R-2.2) feeding BOTH
// legacy extraction (tags/wikilinks/@spec reftags) and the new knowledge-graph
// extraction (canonical node identity R-1.1/R-1.2, typed edges R-2.1/R-2.4).
//
// The frontmatter block is located once and YAML-parsed once per file per scan,
// so search and graph results can never disagree about a file. Legacy tag
// extraction intentionally keeps reading the RAW tags line (verbatim, existing
// behaviour) — only the block location is shared — so inherited outputs stay
// byte-identical (R-5.4).
package extract

import (
	"regexp"
	"sort"
	"strings"

	yaml "github.com/goccy/go-yaml"
)

// frontmatter is the result of the one-and-only frontmatter parse for a file.
type frontmatter struct {
	present   bool           // a --- ... --- block exists
	malformed bool           // block exists but is not valid YAML (R-2.3)
	raw       string         // inner text of the block, "" if absent
	bodyEnd   int            // index into content where the block ends (body start)
	fields    map[string]any // parsed YAML mapping; nil if absent/malformed/non-map
}

// parseFrontmatter locates and YAML-parses the frontmatter block exactly once.
// Malformed YAML never fails extraction: the file is still indexed structurally
// and the caller emits a warning naming repo and path (R-2.3).
func parseFrontmatter(content string) frontmatter {
	loc := frontmatterRe.FindStringSubmatchIndex(content)
	if loc == nil {
		return frontmatter{}
	}
	fm := frontmatter{
		present: true,
		raw:     content[loc[2]:loc[3]],
		bodyEnd: loc[1],
	}
	var parsed map[string]any
	if err := yaml.Unmarshal([]byte(fm.raw), &parsed); err != nil {
		// Best-effort recovery for the most common authoring slip: an unquoted
		// ": " (or trailing ":") inside a plain-scalar value, e.g.
		//   description: Ingest a file. Usage: /sq-add <path>
		// YAML reads the inner ": " as a nested mapping and errors. Re-quote
		// only such top-level scalar values and retry. Genuinely broken YAML
		// (unclosed flow seqs, non-map blocks) is left untouched → still
		// malformed, preserving graceful degradation (R-2.3).
		if relaxed, changed := relaxScalarColons(fm.raw); changed {
			if err2 := yaml.Unmarshal([]byte(relaxed), &parsed); err2 == nil {
				fm.fields = parsed
				return fm
			}
		}
		fm.malformed = true
		return fm
	}
	fm.fields = parsed
	return fm
}

// topScalarLineRe matches a column-0 `key: value` frontmatter line with a
// non-empty inline value. Indented (nested) lines never match, so recovery
// stays confined to top-level scalars.
var topScalarLineRe = regexp.MustCompile(`^([A-Za-z0-9_.-]+):[ \t]+(\S.*?)[ \t]*$`)

// relaxScalarColons re-quotes top-level plain-scalar values that contain an
// unescaped ": " or end with ":", the single most common reason valid-looking
// frontmatter fails strict YAML. It only rewrites lines whose value is a plain
// scalar (not already quoted, and not the start of a flow/block/anchor/comment
// construct), so genuinely malformed YAML is left to fail. Returns the rewritten
// text and whether anything changed.
func relaxScalarColons(raw string) (string, bool) {
	lines := strings.Split(raw, "\n")
	changed := false
	for i, line := range lines {
		m := topScalarLineRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		key, val := m[1], m[2]
		// Only intervene when the value actually carries the colon that trips
		// YAML; clean values (and legit numbers/bools/IDs) are left alone.
		if !strings.Contains(val, ": ") && !strings.HasSuffix(val, ":") {
			continue
		}
		// Leave already-quoted values and non-scalar constructs to strict YAML.
		switch val[0] {
		case '"', '\'', '[', '{', '|', '>', '&', '*', '!', '#':
			continue
		}
		esc := strings.ReplaceAll(val, `\`, `\\`)
		esc = strings.ReplaceAll(esc, `"`, `\"`)
		lines[i] = key + `: "` + esc + `"`
		changed = true
	}
	if !changed {
		return raw, false
	}
	return strings.Join(lines, "\n"), true
}

// ── canonical node identity (Unit 1) ─────────────────────────────────────────

// canonicalIDRe matches the v1 canonical URL-style ID schemes (R-1.1).
var canonicalIDRe = regexp.MustCompile(`^(component|req|capability|context)://\S+$`)

// canonicalIDFrom returns the frontmatter-declared canonical ID and its kind
// (the scheme), or ("", "") when the `id` field is absent or not
// canonical-shaped (R-1.1).
func canonicalIDFrom(fields map[string]any) (id, kind string) {
	v, ok := fields["id"]
	if !ok {
		return "", ""
	}
	s, ok := v.(string)
	if !ok {
		return "", ""
	}
	s = strings.TrimSpace(s)
	m := canonicalIDRe.FindStringSubmatch(s)
	if m == nil {
		return "", ""
	}
	return s, m[1]
}

// fallbackNodeID derives the platform-stable node identity for files with no
// canonical ID: `<repo-name>:<relative-path>` with forward slashes on ALL
// platforms — a Windows separator must never leak into identity (R-1.2).
func fallbackNodeID(repoName, relPath string) string {
	return repoName + ":" + strings.ReplaceAll(relPath, `\`, "/")
}

// KindOfID reports the canonical scheme of an ID ("component", "req", …), or
// "" for non-canonical (fallback / free-form) identifiers. Exported for the
// db resolution pass, which must type phantom nodes it has no Spec for (R-1.5).
func KindOfID(id string) string {
	return kindFromID(id)
}

// kindFromID reports the canonical scheme of an ID, or "" for non-canonical
// (fallback / free-form) identifiers.
func kindFromID(id string) string {
	if m := canonicalIDRe.FindStringSubmatch(id); m != nil {
		return m[1]
	}
	return ""
}

// ── typed frontmatter edges (Unit 2) ─────────────────────────────────────────

// Edge is one typed, directed edge extracted from a recognized frontmatter
// field, carrying provenance (the declaring file supplies Repo/Path via the
// Spec; Field is the frontmatter field name) — R-2.1.
type Edge struct {
	Src   string // canonical node ID
	Dst   string // canonical node ID
	Type  string // edge type from the recognized-field table
	Field string // originating frontmatter field name (provenance)
}

// recognizedEdgeFields is the v1 recognized relationship field table
// (R-2.1, LLD "Recognized relationship fields"). Order is fixed so edge
// emission is deterministic. `reversed` fields declare the INCOMING side:
// `implementedBy: X` means X --implements--> this node.
var recognizedEdgeFields = []struct {
	field    string
	edgeType string
	reversed bool
}{
	{"relationships", "related_to", false},
	{"implementedBy", "implements", true},
	{"upstream", "upstream", false},
	{"dependsOn", "depends_on", false},
	{"components", "has_component", false},
	{"from-discovery", "from_discovery", false},
}

// nonRelationalFields are frontmatter fields with existing, known meanings that
// must never be counted as "unrecognized relational-looking" (R-2.4).
var nonRelationalFields = map[string]bool{
	"id": true, "tags": true, "title": true, "summary": true,
}

// extractEdges emits typed edges from the recognized-field table plus the
// sorted list of unrecognized field names whose values look relational
// (canonical-ID-shaped) for the scan summary (R-2.1, R-2.4). Unknown fields
// never error.
func extractEdges(nodeID string, fields map[string]any) (edges []Edge, unrecognized []string) {
	recognized := map[string]bool{}
	for _, rf := range recognizedEdgeFields {
		recognized[rf.field] = true
		refs := collectRefs(fields[rf.field])
		for _, ref := range refs {
			e := Edge{Src: nodeID, Dst: ref, Type: rf.edgeType, Field: rf.field}
			if rf.reversed {
				e.Src, e.Dst = ref, nodeID
			}
			edges = append(edges, e)
		}
	}

	for name, v := range fields {
		if recognized[name] || nonRelationalFields[name] {
			continue
		}
		for _, ref := range collectRefs(v) {
			if canonicalIDRe.MatchString(ref) {
				unrecognized = append(unrecognized, name)
				break
			}
		}
	}
	sort.Strings(unrecognized)
	return edges, unrecognized
}

// collectRefs flattens a frontmatter value into referenced-ID strings:
// scalar strings, inline lists, block lists, and nested lists all yield their
// string leaves in document order. Non-string leaves are ignored.
func collectRefs(v any) []string {
	var out []string
	var walk func(any)
	walk = func(v any) {
		switch t := v.(type) {
		case string:
			if s := strings.TrimSpace(t); s != "" {
				out = append(out, s)
			}
		case []any:
			for _, item := range t {
				walk(item)
			}
		}
	}
	walk(v)
	return out
}
