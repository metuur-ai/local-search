// Body markdown-link edges: one `links_to` edge per distinct link that resolves
// to a file existing on disk. Resolution is by filesystem path, so these tests
// write real files into t.TempDir() rather than driving extractLinkEdges with
// synthetic paths.
package extract

import (
	"os"
	"path/filepath"
	"testing"
)

// writeRepo materializes files under a temp "repo" root and returns the root.
// Keys are repo-relative slash paths.
func writeRepo(t *testing.T, files map[string]string) string {
	t.Helper()
	root := t.TempDir()
	for rel, body := range files {
		abs := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(abs, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

// linkEdges runs the extractor for one document in a written repo.
func linkEdges(t *testing.T, root, docRel string) []Edge {
	t.Helper()
	abs := filepath.Join(root, filepath.FromSlash(docRel))
	b, err := os.ReadFile(abs)
	if err != nil {
		t.Fatal(err)
	}
	return extractLinkEdges(fallbackNodeID("r", docRel), "r", root, abs, string(b))
}

// TestLinkEdges_ResolvableRelativeLink is the base case: a sibling link that
// exists on disk becomes one links_to edge carrying a body:<line> locator.
func TestLinkEdges_ResolvableRelativeLink(t *testing.T) {
	root := writeRepo(t, map[string]string{
		"docs/a.md": "# A\n\nSee [B](b.md) for details.\n",
		"docs/b.md": "# B\n",
	})
	edges := linkEdges(t, root, "docs/a.md")
	want := Edge{Src: "r:docs/a.md", Dst: "r:docs/b.md", Type: LinkEdgeType, Field: "body:3"}
	if len(edges) != 1 || edges[0] != want {
		t.Fatalf("got %+v, want [%+v]", edges, want)
	}
}

// TestLinkEdges_ParentAndNestedPaths: `../` and subdirectory links resolve and
// normalize to repo-relative slash paths.
func TestLinkEdges_ParentAndNestedPaths(t *testing.T) {
	root := writeRepo(t, map[string]string{
		"docs/guides/g.md":     "[up](../a.md) and [down](sub/c.md)\n",
		"docs/a.md":            "# A\n",
		"docs/guides/sub/c.md": "# C\n",
	})
	edges := linkEdges(t, root, "docs/guides/g.md")
	if len(edges) != 2 {
		t.Fatalf("got %d edges, want 2: %+v", len(edges), edges)
	}
	if edges[0].Dst != "r:docs/a.md" {
		t.Errorf("edges[0].Dst = %q, want r:docs/a.md", edges[0].Dst)
	}
	if edges[1].Dst != "r:docs/guides/sub/c.md" {
		t.Errorf("edges[1].Dst = %q, want r:docs/guides/sub/c.md", edges[1].Dst)
	}
}

// TestLinkEdges_RepoAbsoluteLink: a leading `/` resolves against the repo root,
// not the document's directory. OKF calls this the recommended link form, and
// its own generator drops these — handling both forms in one place is the point.
func TestLinkEdges_RepoAbsoluteLink(t *testing.T) {
	root := writeRepo(t, map[string]string{
		"docs/deep/a.md": "[policy](/policies/p.md)\n",
		"policies/p.md":  "# P\n",
	})
	edges := linkEdges(t, root, "docs/deep/a.md")
	if len(edges) != 1 || edges[0].Dst != "r:policies/p.md" {
		t.Fatalf("got %+v, want one edge to r:policies/p.md", edges)
	}
}

// TestLinkEdges_DanglingTargetSkipped: on-disk existence is the gate, so a link
// to a not-yet-written doc produces nothing (no speculative phantom).
func TestLinkEdges_DanglingTargetSkipped(t *testing.T) {
	root := writeRepo(t, map[string]string{
		"a.md": "[missing](nope.md) [real](b.md)\n",
		"b.md": "# B\n",
	})
	edges := linkEdges(t, root, "a.md")
	if len(edges) != 1 || edges[0].Dst != "r:b.md" {
		t.Fatalf("got %+v, want only the resolvable link", edges)
	}
}

// TestLinkEdges_FencedCodeIgnoredAndLinesPreserved pins both halves of the
// fence handling: links inside fences never become edges, AND blanking the
// fence must not shift the reported line number of a later real link.
func TestLinkEdges_FencedCodeIgnoredAndLinesPreserved(t *testing.T) {
	root := writeRepo(t, map[string]string{
		"a.md": "# A\n\n```md\n[fake](b.md)\nmore\n```\n\nreal [B](b.md)\n",
		"b.md": "# B\n",
	})
	edges := linkEdges(t, root, "a.md")
	if len(edges) != 1 {
		t.Fatalf("got %d edges, want 1: %+v", len(edges), edges)
	}
	// The real link is on line 8; a naive fence strip would report line 4.
	if edges[0].Field != "body:8" {
		t.Fatalf("Field = %q, want body:8 (line numbers must survive fence blanking)", edges[0].Field)
	}
}

// TestLinkEdges_DedupKeepsFirstLine: repeated links to one target yield a single
// edge, and its locator is the first occurrence in document order.
func TestLinkEdges_DedupKeepsFirstLine(t *testing.T) {
	root := writeRepo(t, map[string]string{
		"a.md": "one\n[B](b.md)\nthree\n[B again](b.md)\n",
		"b.md": "# B\n",
	})
	edges := linkEdges(t, root, "a.md")
	if len(edges) != 1 {
		t.Fatalf("got %d edges, want 1 (deduped): %+v", len(edges), edges)
	}
	if edges[0].Field != "body:2" {
		t.Errorf("Field = %q, want body:2 (first occurrence)", edges[0].Field)
	}
}

// TestLinkEdges_SelfLinkSkipped: a document linking to itself is not an edge.
func TestLinkEdges_SelfLinkSkipped(t *testing.T) {
	root := writeRepo(t, map[string]string{"a.md": "[me](a.md)\n"})
	if edges := linkEdges(t, root, "a.md"); len(edges) != 0 {
		t.Fatalf("got %+v, want no self-edge", edges)
	}
}

// TestLinkEdges_EscapingRepoRootSkipped: a link climbing above the repo root
// must never produce an edge, however many `../` it uses.
func TestLinkEdges_EscapingRepoRootSkipped(t *testing.T) {
	root := writeRepo(t, map[string]string{"docs/a.md": "[out](../../../etc/passwd.md)\n"})
	if edges := linkEdges(t, root, "docs/a.md"); len(edges) != 0 {
		t.Fatalf("got %+v, want no escaping edge", edges)
	}
}

// TestLinkEdges_AnchorsAndTitlesAndURLs covers the shapes that must not match or
// must be normalized: `#anchor` is stripped, a link title is not a target, and
// absolute URLs are never filesystem paths.
func TestLinkEdges_AnchorsAndTitlesAndURLs(t *testing.T) {
	root := writeRepo(t, map[string]string{
		"a.md": "[anchored](b.md#section)\n[url](https://example.com/x.md)\n[titled](b.md \"T\")\n",
		"b.md": "# B\n",
	})
	edges := linkEdges(t, root, "a.md")
	if len(edges) != 1 {
		t.Fatalf("got %d edges, want 1: %+v", len(edges), edges)
	}
	if edges[0].Dst != "r:b.md" || edges[0].Field != "body:1" {
		t.Fatalf("got %+v, want anchored link on line 1 -> r:b.md", edges[0])
	}
}

// TestLinkEdges_PlaceholderTargetSkipped: template scaffolding ships links with
// placeholder segments; those must not become edges even if a file happens to
// exist at the literal path.
func TestLinkEdges_PlaceholderTargetSkipped(t *testing.T) {
	root := writeRepo(t, map[string]string{"a.md": "[t](<slug>/doc.md)\n"})
	if edges := linkEdges(t, root, "a.md"); len(edges) != 0 {
		t.Fatalf("got %+v, want no placeholder edge", edges)
	}
}

// TestLinkEdges_MalformedFrontmatterStillYieldsLinks: body links do not depend
// on frontmatter, so a file whose YAML is broken still contributes link edges
// even though it loses its identity and all frontmatter edges (R-2.3).
func TestLinkEdges_MalformedFrontmatterStillYieldsLinks(t *testing.T) {
	root := writeRepo(t, map[string]string{
		"a.md": "---\nid: component://a\nbroken: {oops: no close\n---\n\n[B](b.md)\n",
		"b.md": "# B\n",
	})
	sp, err := FromFile("r", root, filepath.Join(root, "a.md"))
	if err != nil || sp == nil {
		t.Fatalf("FromFile: %v", err)
	}
	if !sp.FrontmatterMalformed {
		t.Fatal("expected malformed frontmatter")
	}
	if sp.NodeID != "r:a.md" {
		t.Errorf("NodeID = %q, want the r:a.md fallback", sp.NodeID)
	}
	var links int
	for _, e := range sp.Edges {
		if e.Type == LinkEdgeType {
			links++
		}
	}
	if links != 1 {
		t.Fatalf("got %d link edges, want 1 despite malformed frontmatter: %+v", links, sp.Edges)
	}
}

// TestLinkEdges_AppendedAfterFrontmatterEdges: emission order is frontmatter
// edges first, then body links, so existing per-file edge order is unchanged.
func TestLinkEdges_AppendedAfterFrontmatterEdges(t *testing.T) {
	root := writeRepo(t, map[string]string{
		"a.md": "---\ndependsOn: component://x\n---\n\n[B](b.md)\n",
		"b.md": "# B\n",
	})
	sp, err := FromFile("r", root, filepath.Join(root, "a.md"))
	if err != nil || sp == nil {
		t.Fatalf("FromFile: %v", err)
	}
	if len(sp.Edges) != 2 {
		t.Fatalf("got %d edges, want 2: %+v", len(sp.Edges), sp.Edges)
	}
	if sp.Edges[0].Type != "depends_on" {
		t.Errorf("edges[0].Type = %q, want depends_on first", sp.Edges[0].Type)
	}
	if sp.Edges[1].Type != LinkEdgeType {
		t.Errorf("edges[1].Type = %q, want %s second", sp.Edges[1].Type, LinkEdgeType)
	}
}

// TestBodyLinkField distinguishes a body locator from a frontmatter field name,
// which is what the db layer keys `source_location` off.
func TestBodyLinkField(t *testing.T) {
	if !BodyLinkField("body:12") {
		t.Error("body:12 should be a body locator")
	}
	for _, f := range []string{"dependsOn", "components", "", "bodyguard"} {
		if BodyLinkField(f) {
			t.Errorf("%q should not be a body locator", f)
		}
	}
}

// ── declared classification: frontmatter `type:` / `status:` ────────────────

// TestDeclaredClassification_ReadVerbatim: both fields are stored exactly as
// written — no case folding, no synonym merging, no enum validation. The corpus
// uses 23 `type` values and 13 `status` values, including one whose status is a
// whole sentence, so any closed vocabulary would misclassify.
func TestDeclaredClassification_ReadVerbatim(t *testing.T) {
	cases := []struct{ raw, wantType, wantStatus string }{
		{"---\ntype: prd\nstatus: validated\n---\n", "prd", "validated"},
		{"---\ntype: team-standard\nstatus: WIP\n---\n", "team-standard", "WIP"},
		{"---\ntype: dashboard\n---\n", "dashboard", ""},
		{"---\nstatus: complete\n---\n", "", "complete"},
		{"---\ntitle: none here\n---\n", "", ""},
		// Case is preserved, not folded — folding is a query-time concern.
		{"---\ntype: PRD\nstatus: Draft\n---\n", "PRD", "Draft"},
		// A scheme-shaped type is still just a string.
		{"---\ntype: concept://component\n---\n", "concept://component", ""},
	}
	for _, tc := range cases {
		root := writeRepo(t, map[string]string{"a.md": tc.raw})
		sp, err := FromFile("r", root, filepath.Join(root, "a.md"))
		if err != nil || sp == nil {
			t.Fatalf("FromFile: %v", err)
		}
		if sp.DocType != tc.wantType {
			t.Errorf("%q: DocType = %q, want %q", tc.raw, sp.DocType, tc.wantType)
		}
		if sp.Status != tc.wantStatus {
			t.Errorf("%q: Status = %q, want %q", tc.raw, sp.Status, tc.wantStatus)
		}
	}
}

// TestDeclaredClassification_NonScalarIgnored: a list or map value is not a
// classification. Stringifying it would put YAML syntax into a facet.
func TestDeclaredClassification_NonScalarIgnored(t *testing.T) {
	root := writeRepo(t, map[string]string{
		"a.md": "---\ntype: [a, b]\nstatus:\n  phase: done\n---\n",
	})
	sp, err := FromFile("r", root, filepath.Join(root, "a.md"))
	if err != nil || sp == nil {
		t.Fatalf("FromFile: %v", err)
	}
	if sp.DocType != "" || sp.Status != "" {
		t.Fatalf("DocType=%q Status=%q, want both empty for non-scalar values", sp.DocType, sp.Status)
	}
}

// TestDeclaredClassification_NotReportedAsUnrecognized: `type`/`status` now have
// known meanings, so a scheme-shaped value must not also surface in the R-2.4
// unrecognized-relational-field report.
func TestDeclaredClassification_NotReportedAsUnrecognized(t *testing.T) {
	edges, unrec := extractEdges(self, map[string]any{
		"type":   "concept://component",
		"status": "context://weird-but-scalar",
	})
	if len(edges) != 0 {
		t.Errorf("got %d edges, want 0", len(edges))
	}
	if len(unrec) != 0 {
		t.Errorf("unrecognized = %v, want empty (type/status are known fields)", unrec)
	}
}

// TestDeclaredClassification_MalformedFrontmatterYieldsEmpty: no identity, no
// edges, and no classification either (R-2.3 degradation).
func TestDeclaredClassification_MalformedFrontmatterYieldsEmpty(t *testing.T) {
	root := writeRepo(t, map[string]string{
		"a.md": "---\ntype: prd\nbroken: {oops: no close\n---\n",
	})
	sp, err := FromFile("r", root, filepath.Join(root, "a.md"))
	if err != nil || sp == nil {
		t.Fatalf("FromFile: %v", err)
	}
	if !sp.FrontmatterMalformed {
		t.Fatal("expected malformed frontmatter")
	}
	if sp.DocType != "" || sp.Status != "" {
		t.Fatalf("DocType=%q Status=%q, want empty when frontmatter is malformed", sp.DocType, sp.Status)
	}
}
