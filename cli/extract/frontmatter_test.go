package extract

import (
	"os"
	"path/filepath"
	"testing"
)

// Task 0.2 tests: the single shared YAML frontmatter parse (R-2.2) feeds both
// legacy tag extraction and later typed-edge extraction, and malformed YAML
// degrades to structural-only indexing without failing the scan (R-2.3).

// ── parseFrontmatter: the one shared parse (R-2.2) ───────────────────────────

func TestSharedFrontmatterParse_R22_AbsentBlock(t *testing.T) {
	fm := parseFrontmatter("# Title\n\nBody.\n")
	if fm.present || fm.malformed || fm.raw != "" || fm.bodyEnd != 0 || fm.fields != nil {
		t.Fatalf("expected zero-value frontmatter for no block, got %+v", fm)
	}
}

func TestSharedFrontmatterParse_R22_InlineList(t *testing.T) {
	fm := parseFrontmatter("---\ntags: [go, sqlite]\n---\nBody.\n")
	if !fm.present || fm.malformed {
		t.Fatalf("expected valid frontmatter, got %+v", fm)
	}
	v, ok := fm.fields["tags"].([]any)
	if !ok || len(v) != 2 || v[0] != "go" || v[1] != "sqlite" {
		t.Fatalf("inline list not parsed: %#v", fm.fields["tags"])
	}
}

func TestSharedFrontmatterParse_R22_BlockList(t *testing.T) {
	fm := parseFrontmatter("---\nrelationships:\n  - component://a\n  - component://b\n---\nBody.\n")
	if !fm.present || fm.malformed {
		t.Fatalf("expected valid frontmatter, got %+v", fm)
	}
	got := collectRefs(fm.fields["relationships"])
	if len(got) != 2 || got[0] != "component://a" || got[1] != "component://b" {
		t.Fatalf("block list not parsed: %v", got)
	}
}

func TestSharedFrontmatterParse_R22_NestedLists(t *testing.T) {
	content := "---\nrelationships:\n  - component://a\n  - - component://b\n    - component://c\n---\nBody.\n"
	fm := parseFrontmatter(content)
	if !fm.present || fm.malformed {
		t.Fatalf("expected valid frontmatter, got %+v", fm)
	}
	got := collectRefs(fm.fields["relationships"])
	want := []string{"component://a", "component://b", "component://c"}
	if len(got) != len(want) {
		t.Fatalf("nested lists not flattened: got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("nested lists not flattened in order: got %v, want %v", got, want)
		}
	}
}

func TestSharedFrontmatterParse_R22_QuotedScalars(t *testing.T) {
	fm := parseFrontmatter("---\ntitle: \"Colon: separated\"\nid: 'component://x'\n---\nBody.\n")
	if !fm.present || fm.malformed {
		t.Fatalf("expected valid frontmatter, got %+v", fm)
	}
	if got := fm.fields["title"]; got != "Colon: separated" {
		t.Errorf("double-quoted scalar: got %#v", got)
	}
	if got := fm.fields["id"]; got != "component://x" {
		t.Errorf("single-quoted scalar: got %#v", got)
	}
}

// ── malformed / non-map frontmatter degrades gracefully (R-2.3) ──────────────

func TestSharedFrontmatterParse_R23_MalformedYAML(t *testing.T) {
	fm := parseFrontmatter("---\ntags: go, testing\nbadyaml: [unclosed\n---\nBody.\n")
	if !fm.present || !fm.malformed {
		t.Fatalf("expected present+malformed, got %+v", fm)
	}
	if fm.fields != nil {
		t.Errorf("malformed frontmatter must yield nil fields, got %#v", fm.fields)
	}
	// Raw block is preserved so legacy tag extraction does not regress.
	if got := legacyTagsFromRaw(fm.raw); got != "go, testing" {
		t.Errorf("legacy tags line lost on malformed YAML: got %q", got)
	}
}

func TestSharedFrontmatterParse_R23_NonMapFrontmatter(t *testing.T) {
	fm := parseFrontmatter("---\n- just\n- a list\n---\nBody.\n")
	if !fm.present {
		t.Fatalf("expected block detected, got %+v", fm)
	}
	if fm.fields != nil {
		t.Errorf("non-map frontmatter must yield nil fields, got %#v", fm.fields)
	}
	// Must not panic downstream: no refs, no canonical ID.
	if id, kind := canonicalIDFrom(fm.fields); id != "" || kind != "" {
		t.Errorf("non-map frontmatter produced canonical ID %q/%q", id, kind)
	}
}

// ── the shared parse feeds legacy extraction unchanged (R-2.2, R-5.4) ────────

func TestCombinedTags_R22_SharedParseMatchesLegacy(t *testing.T) {
	cases := []string{
		"---\ntags: go, http\n---\n# T\n\nBody [[Link]] @spec req://a/b@1#R1\n",
		"---\ntitle: no tags here\n---\nBody.\n",
		"# no frontmatter\n\nBody.\n",
		"---\ntags: [unclosed\n---\nBody.\n",
		"---\n---\n# T\n\nBody.\n",
		"",
	}
	for _, c := range cases {
		fm := parseFrontmatter(c)
		if got, want := legacyTagsFromRaw(fm.raw), extractTags(c); got != want {
			t.Errorf("tags diverged for %q: shared=%q legacy=%q", c, got, want)
		}
		if got, want := summaryFromBody(c[fm.bodyEnd:]), extractSummary(c); got != want {
			t.Errorf("summary diverged for %q: shared=%q legacy=%q", c, got, want)
		}
	}
}

func TestFromFile_R23_MalformedFrontmatterIndexesStructurally(t *testing.T) {
	dir := t.TempDir()
	abs := filepath.Join(dir, "note.md")
	content := "---\ntags: go, testing\nbadyaml: [unclosed\n---\n# Doc Title\n\nFirst paragraph body.\n"
	if err := os.WriteFile(abs, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	sp, err := FromFile("testrepo", dir, abs)
	if err != nil {
		t.Fatalf("malformed frontmatter must not fail extraction (R-2.3): %v", err)
	}
	if !sp.FrontmatterMalformed {
		t.Error("expected FrontmatterMalformed=true")
	}
	// Structural indexing and legacy fields must not regress.
	if sp.Title != "Doc Title" {
		t.Errorf("Title: got %q", sp.Title)
	}
	if sp.Tags != "go, testing" {
		t.Errorf("Tags: got %q", sp.Tags)
	}
	if sp.Summary != "First paragraph body." {
		t.Errorf("Summary: got %q", sp.Summary)
	}
	// Degrades to fallback identity with no edges.
	if sp.NodeID != "testrepo:note.md" || sp.Kind != "file" {
		t.Errorf("fallback identity: got %q/%q", sp.NodeID, sp.Kind)
	}
	if len(sp.Edges) != 0 {
		t.Errorf("malformed frontmatter must emit no edges, got %v", sp.Edges)
	}
}

func TestFromFile_R22_SingleParseFeedsLegacyTags(t *testing.T) {
	dir := t.TempDir()
	abs := filepath.Join(dir, "spec.md")
	content := "---\ntags: alpha, beta\n---\n# S\n\nBody with [[Refund Policy]].\n"
	if err := os.WriteFile(abs, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	sp, err := FromFile("testrepo", dir, abs)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"alpha", "beta", "link:refund-policy"} {
		if !hasTag(sp.Tags, want) {
			t.Errorf("Tags %q missing %q", sp.Tags, want)
		}
	}
	if sp.FrontmatterMalformed {
		t.Error("valid frontmatter flagged malformed")
	}
}
