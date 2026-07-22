package extract

import (
	"os"
	"path/filepath"
	"testing"
)

// ── projectFromRel ────────────────────────────────────────────────────────────

func TestProjectFromRel_TopLevelFile(t *testing.T) {
	got := projectFromRel("readme.md")
	if got != "_root" {
		t.Errorf("expected _root, got %q", got)
	}
}

func TestProjectFromRel_NestedFile(t *testing.T) {
	got := projectFromRel("docs/intro.md")
	if got != "docs" {
		t.Errorf("expected docs, got %q", got)
	}
}

func TestProjectFromRel_DeeplyNested(t *testing.T) {
	got := projectFromRel("docs/api/reference.md")
	if got != "docs" {
		t.Errorf("expected docs, got %q", got)
	}
}

// ── extractTitle ─────────────────────────────────────────────────────────────

func TestExtractTitle_H1Heading(t *testing.T) {
	content := "# My Document\n\nSome body text."
	got := extractTitle(content, "fallback")
	if got != "My Document" {
		t.Errorf("expected 'My Document', got %q", got)
	}
}

func TestExtractTitle_NoHeading_UsesFallback(t *testing.T) {
	content := "Just some text without a heading."
	got := extractTitle(content, "fallback-name")
	if got != "fallback-name" {
		t.Errorf("expected 'fallback-name', got %q", got)
	}
}

func TestExtractTitle_H2NotMatched(t *testing.T) {
	content := "## Not an H1\n\nBody."
	got := extractTitle(content, "fallback")
	if got != "fallback" {
		t.Errorf("expected fallback for H2, got %q", got)
	}
}

func TestExtractTitle_HeadingWithLeadingSpaces(t *testing.T) {
	content := "#   Spaced Title  \n\nBody."
	got := extractTitle(content, "fallback")
	if got != "Spaced Title" {
		t.Errorf("expected 'Spaced Title', got %q", got)
	}
}

// ── extractTags ───────────────────────────────────────────────────────────────

func TestExtractTags_WithFrontmatterTags(t *testing.T) {
	content := "---\ntags: go, testing, sqlite\n---\n# Title\n\nBody."
	got := extractTags(content)
	if got != "go, testing, sqlite" {
		t.Errorf("expected 'go, testing, sqlite', got %q", got)
	}
}

func TestExtractTags_NoFrontmatter(t *testing.T) {
	content := "# Title\n\nBody without frontmatter."
	got := extractTags(content)
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestExtractTags_FrontmatterNoTagsField(t *testing.T) {
	content := "---\ntitle: My Doc\nauthor: Jane\n---\n# Title\n\nBody."
	got := extractTags(content)
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestExtractTags_EmptyFrontmatter(t *testing.T) {
	content := "---\n---\n# Title\n\nBody."
	got := extractTags(content)
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

// ── extractSummary ────────────────────────────────────────────────────────────

func TestExtractSummary_FirstParagraph(t *testing.T) {
	content := "# Heading\n\nThis is the first paragraph.\n\nThis is the second paragraph."
	got := extractSummary(content)
	if got != "This is the first paragraph." {
		t.Errorf("expected first paragraph, got %q", got)
	}
}

func TestExtractSummary_SkipsFrontmatter(t *testing.T) {
	content := "---\ntags: foo\n---\n# Heading\n\nReal summary here."
	got := extractSummary(content)
	if got != "Real summary here." {
		t.Errorf("expected 'Real summary here.', got %q", got)
	}
}

func TestExtractSummary_SkipsHeadings(t *testing.T) {
	content := "# Main Title\n## Subtitle\n\nFirst real paragraph."
	got := extractSummary(content)
	if got != "First real paragraph." {
		t.Errorf("expected 'First real paragraph.', got %q", got)
	}
}

func TestExtractSummary_TruncatesAt300Runes(t *testing.T) {
	long := ""
	for len([]rune(long)) <= maxSummaryChars {
		long += "word "
	}
	got := extractSummary(long)
	if len([]rune(got)) > maxSummaryChars {
		t.Errorf("expected at most %d runes, got %d", maxSummaryChars, len([]rune(got)))
	}
}

func TestExtractSummary_EmptyContent(t *testing.T) {
	got := extractSummary("")
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestExtractSummary_MultiLineFirstParagraph(t *testing.T) {
	content := "Line one.\nLine two.\nLine three.\n\nSecond paragraph."
	got := extractSummary(content)
	want := "Line one. Line two. Line three."
	if got != want {
		t.Errorf("expected %q, got %q", want, got)
	}
}

// ── CompanionPath ─────────────────────────────────────────────────────────────

func TestCompanionPath(t *testing.T) {
	got := CompanionPath("/repo/images/photo.jpg")
	want := "/repo/images/photo.md"
	if got != want {
		t.Errorf("expected %q, got %q", want, got)
	}
}

// ── HasMediaCompanionInDir ────────────────────────────────────────────────────

func TestHasMediaCompanionInDir_Found(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "photo.jpg"), []byte{}, 0644); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if !HasMediaCompanionInDir("photo", entries) {
		t.Error("expected companion found for 'photo' stem")
	}
}

func TestHasMediaCompanionInDir_NotFound(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "other.jpg"), []byte{}, 0644); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if HasMediaCompanionInDir("photo", entries) {
		t.Error("expected no companion for 'photo' stem when only 'other.jpg' exists")
	}
}

func TestHasMediaCompanionInDir_IgnoresNonMedia(t *testing.T) {
	dir := t.TempDir()
	// .go file should not count as media
	if err := os.WriteFile(filepath.Join(dir, "photo.go"), []byte{}, 0644); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if HasMediaCompanionInDir("photo", entries) {
		t.Error("expected no companion for .go file")
	}
}

// ── BuildMediaStems ───────────────────────────────────────────────────────────

func TestBuildMediaStems_CollectsMediaExtensions(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"photo.jpg", "diagram.png", "doc.md", "readme.txt"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte{}, 0644); err != nil {
			t.Fatal(err)
		}
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	stems := BuildMediaStems(entries)
	if !stems["photo"] {
		t.Error("expected 'photo' stem from photo.jpg")
	}
	if !stems["diagram"] {
		t.Error("expected 'diagram' stem from diagram.png")
	}
	if stems["doc"] {
		t.Error("'doc' from doc.md should not be a media stem")
	}
	if stems["readme"] {
		t.Error("'readme' from readme.txt should not be a media stem")
	}
}
