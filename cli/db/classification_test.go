// Declared frontmatter classification (schema v3): specs.doc_type / specs.status
// round-trip through a real scan and surface on the graph export.
package db

import (
	"path/filepath"
	"testing"
)

// TestClassification_RoundTripsThroughFullScan: values written in frontmatter
// land in specs verbatim, and a document declaring neither stores empty strings
// rather than NULL (the columns are NOT NULL DEFAULT ”).
func TestClassification_RoundTripsThroughFullScan(t *testing.T) {
	d := kgdOpen(t)
	dir := t.TempDir()
	kgdWrite(t, filepath.Join(dir, "prd.md"), "---\ntype: prd\nstatus: validated\n---\n# PRD\n")
	kgdWrite(t, filepath.Join(dir, "loud.md"), "---\ntype: dashboard\nstatus: WIP\n---\n# Loud\n")
	kgdWrite(t, filepath.Join(dir, "plain.md"), "# Plain, no frontmatter\n")
	if _, err := FullScan(d, "r", dir, nil, nil); err != nil {
		t.Fatalf("FullScan: %v", err)
	}

	get := func(path string) (string, string) {
		t.Helper()
		var dt, st string
		if err := d.QueryRow("SELECT doc_type, status FROM specs WHERE repo='r' AND path=?", path).
			Scan(&dt, &st); err != nil {
			t.Fatalf("query %s: %v", path, err)
		}
		return dt, st
	}

	if dt, st := get("prd.md"); dt != "prd" || st != "validated" {
		t.Errorf("prd.md: doc_type=%q status=%q, want prd/validated", dt, st)
	}
	// Case must survive the round trip; folding belongs at query time.
	if dt, st := get("loud.md"); dt != "dashboard" || st != "WIP" {
		t.Errorf("loud.md: doc_type=%q status=%q, want dashboard/WIP", dt, st)
	}
	if dt, st := get("plain.md"); dt != "" || st != "" {
		t.Errorf("plain.md: doc_type=%q status=%q, want both empty", dt, st)
	}
}

// TestClassification_SurfacesOnGraphExport pins the JSON contract: the keys are
// `doc_type`/`status`, both omitempty. `doc_type` is deliberately NOT `type` —
// the explorer resolves node color as `n.type || layerOf(n.path)`, so emitting
// `type` would override OS-layer coloring for every classified node.
func TestClassification_SurfacesOnGraphExport(t *testing.T) {
	d := kgdOpen(t)
	dir := t.TempDir()
	kgdWrite(t, filepath.Join(dir, "prd.md"), "---\ntype: prd\nstatus: validated\n---\n# PRD\n")
	kgdWrite(t, filepath.Join(dir, "plain.md"), "# Plain\n")
	if _, err := FullScan(d, "r", dir, nil, nil); err != nil {
		t.Fatalf("FullScan: %v", err)
	}

	g, err := RepoGraph(d, "r", "nodes", false, 0.3, 8)
	if err != nil {
		t.Fatalf("RepoGraph: %v", err)
	}
	var seen int
	for _, n := range g.Nodes {
		switch n.Name {
		case "prd":
			seen++
			if n.DocType != "prd" || n.Status != "validated" {
				t.Errorf("prd node: DocType=%q Status=%q, want prd/validated", n.DocType, n.Status)
			}
			// The node must never carry a `type` key that would hijack coloring.
			if n.Kind != "" {
				t.Errorf("prd node: Kind=%q, want empty (no canonical id declared)", n.Kind)
			}
		case "plain":
			seen++
			if n.DocType != "" || n.Status != "" {
				t.Errorf("plain node: DocType=%q Status=%q, want both empty (omitempty)", n.DocType, n.Status)
			}
		}
	}
	if seen != 2 {
		t.Fatalf("matched %d of 2 expected nodes in export", seen)
	}
}
