// Task 2.1 — typed frontmatter edges (R-2.1) and unrecognized relational-
// looking field detection (R-2.4). Table-driven per recognized field, per the
// task doc's acceptance criteria.
package extract

import (
	"reflect"
	"testing"
)

const self = "component://auth-service"

// TestExtractEdges_R21_RecognizedFieldTable drives every entry of the v1
// recognized-field table: field name → edge type and direction (R-2.1).
func TestExtractEdges_R21_RecognizedFieldTable(t *testing.T) {
	const other = "component://billing"
	cases := []struct {
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
		{"downstream", "downstream", false},
		{"boundedContext", "in_context", false},
		{"fromDiscovery", "from_discovery", false},
	}
	for _, tc := range cases {
		t.Run(tc.field, func(t *testing.T) {
			edges, unrec := extractEdges(self, map[string]any{tc.field: other})
			if len(unrec) != 0 {
				t.Fatalf("recognized field %q reported as unrecognized: %v", tc.field, unrec)
			}
			want := Edge{Src: self, Dst: other, Type: tc.edgeType, Field: tc.field}
			if tc.reversed {
				want.Src, want.Dst = other, self
			}
			if len(edges) != 1 || edges[0] != want {
				t.Fatalf("field %q: got %+v, want [%+v]", tc.field, edges, want)
			}
		})
	}
}

// TestExtractEdges_UpstreamDownstreamDistinct pins that a context map
// declaring both directions yields two edges pointing AWAY from the map, with
// distinct types — the failure mode is modelling `downstream` as `upstream`
// reversed, which makes both edges point the same way.
func TestExtractEdges_UpstreamDownstreamDistinct(t *testing.T) {
	const mapNode = "map://crm--communications"
	edges, unrec := extractEdges(mapNode, map[string]any{
		"upstream":   "context://crm",
		"downstream": "context://communications",
	})
	if len(unrec) != 0 {
		t.Fatalf("unexpected unrecognized fields: %v", unrec)
	}
	want := []Edge{
		{Src: mapNode, Dst: "context://crm", Type: "upstream", Field: "upstream"},
		{Src: mapNode, Dst: "context://communications", Type: "downstream", Field: "downstream"},
	}
	if !reflect.DeepEqual(edges, want) {
		t.Fatalf("got %+v, want %+v", edges, want)
	}
}

// TestExtractEdges_BothDiscoverySpellingsShareType: the kebab and camelCase
// spellings are both accepted and produce the same edge type, so a corpus
// using either gets traceability edges. Field provenance stays distinct.
func TestExtractEdges_BothDiscoverySpellingsShareType(t *testing.T) {
	for _, field := range []string{"from-discovery", "fromDiscovery"} {
		edges, _ := extractEdges(self, map[string]any{field: "2026-faster-webhooks"})
		if len(edges) != 1 {
			t.Fatalf("%s: got %d edges, want 1", field, len(edges))
		}
		if edges[0].Type != "from_discovery" {
			t.Errorf("%s: type = %q, want from_discovery", field, edges[0].Type)
		}
		if edges[0].Field != field {
			t.Errorf("%s: field provenance = %q, want %q", field, edges[0].Field, field)
		}
	}
}

// TestExtractEdges_PlaceholderRefsSkipped: scaffolding templates ship literal
// placeholder values; each would otherwise materialize as a phantom node.
func TestExtractEdges_PlaceholderRefsSkipped(t *testing.T) {
	edges, _ := extractEdges(self, map[string]any{
		"components": []any{"<component-id>", "component://real", "component://<id>"},
		"upstream":   "<discovery-id | none>",
	})
	if len(edges) != 1 {
		t.Fatalf("got %d edges, want 1: %+v", len(edges), edges)
	}
	if edges[0].Dst != "component://real" {
		t.Fatalf("Dst = %q, want component://real", edges[0].Dst)
	}
}

// TestExtractEdges_R21_ListValuesFlattened covers inline, block-style and
// nested list values: every string leaf yields one edge, in document order.
func TestExtractEdges_R21_ListValuesFlattened(t *testing.T) {
	fields := map[string]any{
		"dependsOn": []any{
			"component://a",
			[]any{"component://b", "req://c"},
		},
	}
	edges, _ := extractEdges(self, fields)
	var dsts []string
	for _, e := range edges {
		if e.Type != "depends_on" || e.Src != self || e.Field != "dependsOn" {
			t.Fatalf("unexpected edge shape: %+v", e)
		}
		dsts = append(dsts, e.Dst)
	}
	want := []string{"component://a", "component://b", "req://c"}
	if !reflect.DeepEqual(dsts, want) {
		t.Fatalf("dsts = %v, want %v", dsts, want)
	}
}

// TestExtractEdges_R24_UnrecognizedRelationalLooking: unknown fields whose
// values are canonical-ID-shaped are reported (sorted) for the scan summary;
// unknown fields never error and never emit edges (R-2.4).
func TestExtractEdges_R24_UnrecognizedRelationalLooking(t *testing.T) {
	fields := map[string]any{
		"zRelated":  "component://x",           // relational-looking → reported
		"authoredIn": []any{"context://legacy"}, // relational-looking in a list → reported
		"notes":     "free prose, no scheme",    // not relational-looking → ignored
		"tags":      "component://not-counted",  // known non-relational field → ignored
	}
	edges, unrec := extractEdges(self, fields)
	if len(edges) != 0 {
		t.Fatalf("unrecognized fields must not emit edges, got %+v", edges)
	}
	want := []string{"authoredIn", "zRelated"}
	if !reflect.DeepEqual(unrec, want) {
		t.Fatalf("unrecognized = %v, want %v (sorted)", unrec, want)
	}
}

// TestExtractEdges_R21_NonStringLeavesIgnored: numeric / bool leaves in a
// recognized field are skipped rather than erroring.
func TestExtractEdges_R21_NonStringLeavesIgnored(t *testing.T) {
	edges, unrec := extractEdges(self, map[string]any{
		"upstream": []any{42, true, "component://real"},
	})
	if len(unrec) != 0 {
		t.Fatalf("unexpected unrecognized: %v", unrec)
	}
	if len(edges) != 1 || edges[0].Dst != "component://real" {
		t.Fatalf("edges = %+v, want single edge to component://real", edges)
	}
}
