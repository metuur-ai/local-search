package config

// Strict validation for the config file.
//
// Policy change from pre-0.4.0: a config that exists but does not parse or
// validate is a HARD ERROR. Previously scope.readConfig swallowed every parse
// error and returned "not found", so a typo'd config silently fell through to
// the next precedence rule — and, worse, the auto-init path then overwrote the
// file the user was mid-edit.
//
// Validation runs in four phases so the user sees EVERY problem at once rather
// than one per run. Phase 2 (the key audit) exists because goccy's
// DisallowUnknownField stops at the first unknown key and offers no
// suggestion; we want line numbers and "did you mean" for all of them.

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/goccy/go-yaml/ast"
	"github.com/goccy/go-yaml/token"
)

// knownKeys is the SINGLE SOURCE OF TRUTH for both the runtime key audit and
// the published JSON Schema. schema_test.go asserts the two agree, so the
// schema cannot drift away from the struct.
var knownKeys = map[string]bool{
	"version":            true,
	"repositories":       true,
	"weights":            true,
	"weights.specs":      true,
	"weights.graphify":   true,
	"weights.codegraph":  true,
	"limits":             true,
	"limits.specs":       true,
	"limits.graphify":    true,
	"limits.codegraph":   true,
	"limits.blast_depth": true,
	"limits.blast_cap":   true,
}

// renamedKeys turns the likeliest mistakes into a precise instruction rather
// than a generic near-miss guess. "scope" is the pre-0.4.0 TOML name, so it is
// exactly what a hand-migrated file will contain.
var renamedKeys = map[string]string{
	"scope":        "repositories",
	"repos":        "repositories",
	"repositorie":  "repositories",
	"blast_radius": "limits.blast_depth",
}

// allowedPrefix lets third-party tooling annotate the file without tripping
// strict mode. Keys starting with "x-" are ignored by both the audit and the
// decoder.
const allowedPrefix = "x-"

// ── Problem / Error ───────────────────────────────────────────────────────────

// Problem is one validation failure, located in the source when possible.
type Problem struct {
	Path string // dotted key path, "" for whole-file problems
	Line int
	Col  int
	Msg  string
	Hint string
	// Rendered holds a pre-formatted message (from yaml.FormatError) that
	// already contains its own source snippet; when set, Msg/Line/Col are
	// ignored so we never double-render.
	Rendered string
}

// Error is the aggregate returned for an invalid config.
type Error struct {
	File     string
	Source   []byte
	Problems []Problem
}

func (e *Error) Error() string {
	var b strings.Builder
	for i, p := range e.Problems {
		if i > 0 {
			b.WriteString("\n")
		}
		if p.Rendered != "" {
			b.WriteString(p.Rendered)
			continue
		}
		fmt.Fprintf(&b, "%s:%d:%d: %s", e.File, p.Line, p.Col, p.Msg)
		if snip := snippet(e.Source, p.Line, p.Col); snip != "" {
			b.WriteString("\n")
			b.WriteString(snip)
		}
		if p.Hint != "" {
			fmt.Fprintf(&b, "\n   %s", p.Hint)
		}
	}
	return b.String()
}

// snippet renders the offending line with a caret under the column, matching
// the shape of goccy's own FormatError output so mixed error sets look uniform.
func snippet(src []byte, line, col int) string {
	if line <= 0 || len(src) == 0 {
		return ""
	}
	lines := strings.Split(string(src), "\n")
	if line > len(lines) {
		return ""
	}
	text := strings.TrimRight(lines[line-1], "\r")
	var b strings.Builder
	fmt.Fprintf(&b, "%4d | %s", line, text)
	if col > 0 {
		b.WriteString("\n     | ")
		b.WriteString(strings.Repeat(" ", col-1))
		b.WriteString("^")
	}
	return b.String()
}

// ── Key index ─────────────────────────────────────────────────────────────────

// keyIndex maps a dotted key path to the position of its KEY token, so both
// unknown-key and semantic errors can be reported with a line number.
type keyIndex map[string]token.Position

// indexKeys walks the AST collecting every mapping key. Sequence items are not
// MappingValueNodes, so entries of `repositories:` never pollute the key space
// — which is what makes "- graph:legacy" safe to index (it is a scalar).
func indexKeys(f *ast.File) keyIndex {
	idx := keyIndex{}
	if f == nil || len(f.Docs) == 0 {
		return idx
	}
	var walk func(prefix string, n ast.Node)
	walk = func(prefix string, n ast.Node) {
		switch t := n.(type) {
		case *ast.MappingNode:
			for _, v := range t.Values {
				walk(prefix, v)
			}
		case *ast.MappingValueNode:
			key := strings.Trim(t.Key.String(), `"'`)
			path := key
			if prefix != "" {
				path = prefix + "." + key
			}
			if tok := t.Key.GetToken(); tok != nil && tok.Position != nil {
				idx[path] = *tok.Position
			} else {
				idx[path] = token.Position{}
			}
			walk(path, t.Value)
		}
	}
	for _, doc := range f.Docs {
		if doc.Body != nil {
			walk("", doc.Body)
		}
	}
	return idx
}

// auditKeys reports every key not in knownKeys, with a suggestion.
func auditKeys(idx keyIndex) []Problem {
	var paths []string
	for p := range idx {
		paths = append(paths, p)
	}
	sort.Strings(paths) // deterministic error order

	var probs []Problem
	for _, p := range paths {
		if knownKeys[p] || strings.HasPrefix(lastSegment(p), allowedPrefix) {
			continue
		}
		// A child of an unknown parent would produce a cascade; report the
		// parent only.
		if parent := parentOf(p); parent != "" && !knownKeys[parent] {
			continue
		}
		pos := idx[p]
		probs = append(probs, Problem{
			Path: p,
			Line: pos.Line,
			Col:  pos.Column,
			Msg:  fmt.Sprintf("unknown key %q", lastSegment(p)),
			Hint: suggest(p),
		})
	}
	return probs
}

// suggest produces the "did you mean" line. Rename hints win over fuzzy
// matching because they can name the exact remedy.
func suggest(path string) string {
	last := lastSegment(path)
	if to, ok := renamedKeys[last]; ok {
		return fmt.Sprintf("%q was renamed to %q — run `local-search config migrate`", last, to)
	}
	if to, ok := renamedKeys[path]; ok {
		return fmt.Sprintf("%q was renamed to %q — run `local-search config migrate`", path, to)
	}

	parent := parentOf(path)
	var siblings []string
	for k := range knownKeys {
		if parentOf(k) == parent {
			siblings = append(siblings, k)
		}
	}
	sort.Strings(siblings)

	// 1. Normalized exact match catches case and separator slips:
	//    blastDepth → blast_depth, Repositories → repositories, code-graph → codegraph.
	for _, s := range siblings {
		if normalize(lastSegment(s)) == normalize(last) {
			return fmt.Sprintf("did you mean %q?", lastSegment(s))
		}
	}
	// 2. Near-miss among siblings under the same parent.
	if best := closest(last, siblings, 2); best != "" {
		return fmt.Sprintf("did you mean %q?", lastSegment(best))
	}
	// 3. Widen to every known key, reporting FULL dotted paths — a top-level
	//    `specs:` legitimately matches both weights.specs and limits.specs, so
	//    naming one arbitrarily would be a worse hint than naming both.
	var all []string
	for k := range knownKeys {
		if normalize(lastSegment(k)) == normalize(last) {
			all = append(all, k)
		}
	}
	sort.Strings(all)
	if len(all) > 0 {
		return "did you mean " + quoteJoin(all) + "?"
	}
	return ""
}

func normalize(s string) string {
	return strings.ToLower(strings.NewReplacer("_", "", "-", "", " ", "").Replace(s))
}

func lastSegment(p string) string {
	if i := strings.LastIndex(p, "."); i >= 0 {
		return p[i+1:]
	}
	return p
}

func parentOf(p string) string {
	if i := strings.LastIndex(p, "."); i >= 0 {
		return p[:i]
	}
	return ""
}

func quoteJoin(items []string) string {
	q := make([]string, len(items))
	for i, s := range items {
		q[i] = fmt.Sprintf("%q", s)
	}
	if len(q) == 1 {
		return q[0]
	}
	return strings.Join(q[:len(q)-1], ", ") + " or " + q[len(q)-1]
}

// closest returns the candidate within maxDist edits, or "".
func closest(want string, candidates []string, maxDist int) string {
	best, bestD := "", maxDist+1
	for _, c := range candidates {
		d := levenshtein(strings.ToLower(want), strings.ToLower(lastSegment(c)))
		if d < bestD {
			best, bestD = c, d
		}
	}
	if bestD <= maxDist {
		return best
	}
	return ""
}

func levenshtein(a, b string) int {
	ra, rb := []rune(a), []rune(b)
	prev := make([]int, len(rb)+1)
	cur := make([]int, len(rb)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ra); i++ {
		cur[0] = i
		for j := 1; j <= len(rb); j++ {
			cost := 1
			if ra[i-1] == rb[j-1] {
				cost = 0
			}
			cur[j] = min3(cur[j-1]+1, prev[j]+1, prev[j-1]+cost)
		}
		prev, cur = cur, prev
	}
	return prev[len(rb)]
}

func min3(a, b, c int) int {
	m := a
	if b < m {
		m = b
	}
	if c < m {
		m = c
	}
	return m
}

// ── Semantic checks ───────────────────────────────────────────────────────────

// validate runs the value-level rules, line-numbered from the key index.
func validate(f File, idx keyIndex) []Problem {
	var probs []Problem

	add := func(path, msg, hint string) {
		pos := idx[path]
		probs = append(probs, Problem{Path: path, Line: pos.Line, Col: pos.Column, Msg: msg, Hint: hint})
	}

	if f.Version != nil {
		switch {
		case *f.Version > SupportedVersion:
			add("version",
				fmt.Sprintf("config version %d is newer than this local-search supports (max %d)", *f.Version, SupportedVersion),
				"upgrade local-search, or remove the `version:` key")
		case *f.Version < 1:
			add("version", fmt.Sprintf("version must be >= 1, got %d", *f.Version), "")
		}
	}

	if w := f.Weights; w != nil {
		checkWeight(add, "weights.specs", w.Specs)
		checkWeight(add, "weights.graphify", w.Graphify)
		checkWeight(add, "weights.codegraph", w.CodeGraph)
	}
	if l := f.Limits; l != nil {
		checkLimit(add, "limits.specs", l.Specs)
		checkLimit(add, "limits.graphify", l.Graphify)
		checkLimit(add, "limits.codegraph", l.CodeGraph)
		checkLimit(add, "limits.blast_depth", l.BlastDepth)
		checkLimit(add, "limits.blast_cap", l.BlastCap)
	}

	seen := map[string]bool{}
	for _, r := range f.Repositories {
		trimmed := strings.TrimSpace(r)
		switch {
		case trimmed == "":
			add("repositories", "repositories contains an empty entry", "remove the blank list item")
		case trimmed != r:
			add("repositories", fmt.Sprintf("repository %q has leading or trailing whitespace", r), "")
		case seen[r]:
			add("repositories", fmt.Sprintf("duplicate repository %q", r), "remove the repeated entry")
		}
		seen[trimmed] = true
	}

	return probs
}

func checkWeight(add func(path, msg, hint string), path string, v *float64) {
	if v == nil {
		return
	}
	switch {
	case math.IsNaN(*v) || math.IsInf(*v, 0):
		add(path, fmt.Sprintf("%s must be a finite number", path), "")
	case *v < 0:
		add(path, fmt.Sprintf("%s must be >= 0, got %g", path, *v),
			"use 0 to disable this source entirely")
	}
}

func checkLimit(add func(path, msg, hint string), path string, v *int) {
	if v != nil && *v < 0 {
		add(path, fmt.Sprintf("%s must be >= 0, got %d", path, *v), "")
	}
}
