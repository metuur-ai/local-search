// Unit 5 acceptance gates: per-repo scan summary (task 5.1 / R-5.1) and typed
// links in the existing graph export (task 5.2 / R-5.2, R-5.3, R-5.4).
// Reuses the kgd* fixture helpers from kg_determinism_test.go.
package db

import (
	"database/sql"
	"encoding/json"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// kgsFixture builds two repos and scans both:
//
//	repoA: a.md      id component://a, dependsOn → component://b + req://missing
//	       b.md      id component://b (also declared by repoB → conflict, R-1.4)
//	       bad.md    malformed frontmatter (R-2.3 warning)
//	       unrec.md  unrecognized relational-looking field `linked-to` (R-2.4)
//	repoB: bconflict.md  id component://b
func kgsFixture(t *testing.T) (dbh *sql.DB, dirA string) {
	t.Helper()
	d := kgdOpen(t)
	dirA = t.TempDir()
	dirB := t.TempDir()

	kgdWrite(t, filepath.Join(dirA, "a.md"),
		"---\nid: component://a\ntags:\n  - alpha\ndependsOn:\n  - component://b\n  - req://missing\n---\n# A\n")
	kgdWrite(t, filepath.Join(dirA, "b.md"),
		"---\nid: component://b\ntags:\n  - alpha\n---\n# B\n")
	kgdWrite(t, filepath.Join(dirA, "bad.md"),
		"---\n{ broken\n---\n# Bad\n")
	kgdWrite(t, filepath.Join(dirA, "unrec.md"),
		"---\nlinked-to: component://a\n---\n# Unrec\n")
	kgdWrite(t, filepath.Join(dirB, "bconflict.md"),
		"---\nid: component://b\n---\n# B conflict\n")

	if _, err := FullScan(d, "repoA", dirA, nil); err != nil {
		t.Fatalf("FullScan repoA: %v", err)
	}
	if _, err := FullScan(d, "repoB", dirB, nil); err != nil {
		t.Fatalf("FullScan repoB: %v", err)
	}
	return d, dirA
}

// kgsSummary is a fatal-on-error KGScanSummary wrapper.
func kgsSummary(t *testing.T, d *sql.DB, repo string) KGRepoSummary {
	t.Helper()
	s, err := KGScanSummary(d, repo)
	if err != nil {
		t.Fatalf("KGScanSummary(%s): %v", repo, err)
	}
	return s
}

// R-5.1: the post-scan summary reports structural vs typed node counts, typed
// edge counts, conflicts, unresolved references, malformed files, and the top
// unrecognized relational-looking fields — all deterministically ordered.
func TestScanSummary_R51_CountsMalformedAndUnrecognized(t *testing.T) {
	d, _ := kgsFixture(t)

	got := kgsSummary(t, d, "repoA")
	want := KGRepoSummary{
		StructuralNodes: 2, // bad.md (malformed → fallback), unrec.md (no id)
		TypedNodes:      2, // component://a, component://b
		TypedEdges:      2, // a.md dependsOn × 2
		Conflicts:       1, // component://b also declared by repoB
		Unresolved:      1, // req://missing phantom
		MalformedFiles:  []string{"bad.md"},
		TopUnrecognized: []KGFieldCount{{Field: "linked-to", Count: 1}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("repoA summary:\n got %+v\nwant %+v", got, want)
	}

	gotB := kgsSummary(t, d, "repoB")
	wantB := KGRepoSummary{TypedNodes: 1, Conflicts: 1}
	if !reflect.DeepEqual(gotB, wantB) {
		t.Fatalf("repoB summary:\n got %+v\nwant %+v", gotB, wantB)
	}
}

// R-5.1 (+R-3.3 discipline): rescanning the same tree changes neither the
// summary nor the canonical export — the summary is derived state, not a
// scan-order artifact.
func TestScanSummary_R51_DeterministicAcrossRescan(t *testing.T) {
	d, dirA := kgsFixture(t)

	before := kgsSummary(t, d, "repoA")
	exportBefore, err := KGExport(d)
	if err != nil {
		t.Fatalf("KGExport: %v", err)
	}

	if _, err := FullScan(d, "repoA", dirA, nil); err != nil {
		t.Fatalf("rescan repoA: %v", err)
	}

	after := kgsSummary(t, d, "repoA")
	if !reflect.DeepEqual(before, after) {
		t.Fatalf("summary drifted across rescan:\n before %+v\n after  %+v", before, after)
	}
	exportAfter, err := KGExport(d)
	if err != nil {
		t.Fatalf("KGExport after rescan: %v", err)
	}
	if exportBefore != exportAfter {
		t.Fatalf("canonical export drifted across rescan")
	}
}

// R-5.1 / R-1.4: removing the conflicting repo clears the conflict from the
// surviving repo's summary, and the removed repo summarizes to zero.
func TestScanSummary_R51_DeleteRepoClearsConflict(t *testing.T) {
	d, _ := kgsFixture(t)

	if err := DeleteRepo(d, "repoB"); err != nil {
		t.Fatalf("DeleteRepo(repoB): %v", err)
	}

	a := kgsSummary(t, d, "repoA")
	if a.Conflicts != 0 {
		t.Fatalf("repoA conflicts after DeleteRepo(repoB) = %d, want 0", a.Conflicts)
	}
	if a.TypedNodes != 2 || a.TypedEdges != 2 || a.Unresolved != 1 {
		t.Fatalf("repoA counts disturbed by DeleteRepo(repoB): %+v", a)
	}
	b := kgsSummary(t, d, "repoB")
	if !reflect.DeepEqual(b, KGRepoSummary{}) {
		t.Fatalf("repoB summary after delete = %+v, want zero", b)
	}
}

// kgsNodeID returns the graph node ID for a repo-relative path (the spec
// rowid ID — typed links share the node-ID namespace since the unification).
func kgsNodeID(t *testing.T, g NodeLinkGraph, path string) string {
	t.Helper()
	for _, n := range g.Nodes {
		if n.Path == path {
			return n.ID
		}
	}
	t.Fatalf("no graph node with path %q", path)
	return ""
}

// R-5.2: the existing export carries the repo's typed edges as links with the
// four graphify fields (relation/confidence/source_file/source_location).
// Resolved endpoints share the node-ID namespace (spec rowid IDs); only
// unresolved endpoints keep their canonical string form. Links appear in
// canonical (src,dst,type,…) order.
func TestExportTypedLinks_R52_CanonicalOrderAndProvenance(t *testing.T) {
	d, _ := kgsFixture(t)

	g, err := RepoGraph(d, "repoA", "tags", false, 0, 0)
	if err != nil {
		t.Fatalf("RepoGraph: %v", err)
	}
	var typed []GraphLink
	for _, l := range g.Links {
		if l.Relation != "" {
			typed = append(typed, l)
		}
	}
	aID := kgsNodeID(t, g, "a.md")
	bID := kgsNodeID(t, g, "b.md")
	want := []GraphLink{
		{Source: aID, Target: bID, Weight: 1,
			Relation: "depends_on", Confidence: 1,
			SourceFile: "a.md", SourceLocation: "frontmatter:dependsOn"},
		{Source: aID, Target: "req://missing", Weight: 1,
			Relation: "depends_on", Confidence: 1,
			SourceFile: "a.md", SourceLocation: "frontmatter:dependsOn"},
	}
	if !reflect.DeepEqual(typed, want) {
		t.Fatalf("typed links:\n got %+v\nwant %+v", typed, want)
	}
	// Typed links are appended AFTER every untyped family (R-5.4 ordering).
	n := len(g.Links)
	if n < 2 || g.Links[n-2].Relation == "" || g.Links[n-1].Relation == "" {
		t.Fatalf("typed links are not the trailing links: %+v", g.Links)
	}
}

// R-5.4: pre-existing untyped links serialize byte-identically — the four new
// fields are omitempty and zero on similarity links — and `--edges nodes`
// still means "no links at all".
func TestExportTypedLinks_R52_UntypedSerializationUnchanged(t *testing.T) {
	d, _ := kgsFixture(t)

	raw, err := json.Marshal(GraphLink{Source: "x", Target: "y", Weight: 0.25})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	for _, k := range []string{"relation", "confidence", "source_file", "source_location"} {
		if strings.Contains(string(raw), k) {
			t.Fatalf("untyped link JSON leaks %q: %s", k, raw)
		}
	}

	g, err := RepoGraph(d, "repoA", "nodes", false, 0, 0)
	if err != nil {
		t.Fatalf("RepoGraph nodes: %v", err)
	}
	if len(g.Links) != 0 {
		t.Fatalf("--edges nodes emitted %d links, want 0", len(g.Links))
	}
}

// R-5.3: the export is regenerated from the tables — editing a file and
// rescanning drops the stale typed link instead of accumulating it.
func TestExportTypedLinks_R53_RegeneratedAfterRescan(t *testing.T) {
	d, dirA := kgsFixture(t)

	// Drop the req://missing reference from a.md and rescan.
	kgdWrite(t, filepath.Join(dirA, "a.md"),
		"---\nid: component://a\ntags:\n  - alpha\ndependsOn:\n  - component://b\n---\n# A\n")
	if _, err := FullScan(d, "repoA", dirA, nil); err != nil {
		t.Fatalf("rescan repoA: %v", err)
	}

	g, err := RepoGraph(d, "repoA", "tags", false, 0, 0)
	if err != nil {
		t.Fatalf("RepoGraph: %v", err)
	}
	var typed []GraphLink
	for _, l := range g.Links {
		if l.Relation != "" {
			typed = append(typed, l)
		}
	}
	aID := kgsNodeID(t, g, "a.md")
	bID := kgsNodeID(t, g, "b.md")
	if len(typed) != 1 || typed[0].Source != aID || typed[0].Target != bID {
		t.Fatalf("typed links after rescan = %+v, want single %s→%s (a.md→b.md)", typed, aID, bID)
	}
	if s := kgsSummary(t, d, "repoA"); s.TypedEdges != 1 || s.Unresolved != 0 {
		t.Fatalf("summary after rescan = %+v, want TypedEdges=1 Unresolved=0", s)
	}
}
