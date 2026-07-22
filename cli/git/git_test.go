package git

import "testing"

// ── isSpecFile ────────────────────────────────────────────────────────────────

func TestIsSpecFile_MarkdownExtensions(t *testing.T) {
	for _, ext := range []string{".md", ".mdx", ".txt"} {
		if !isSpecFile("file" + ext) {
			t.Errorf("expected %s to be a spec file", ext)
		}
	}
}

func TestIsSpecFile_MediaExtensions(t *testing.T) {
	for _, ext := range []string{".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".pdf"} {
		if !isSpecFile("file" + ext) {
			t.Errorf("expected %s to be a spec file", ext)
		}
	}
}

func TestIsSpecFile_NonSpecExtensions(t *testing.T) {
	for _, name := range []string{"file.go", "file.ts", "file.json", "file.yaml", "file"} {
		if isSpecFile(name) {
			t.Errorf("expected %s NOT to be a spec file", name)
		}
	}
}

func TestIsSpecFile_CaseInsensitive(t *testing.T) {
	for _, name := range []string{"FILE.MD", "photo.JPG", "doc.PDF"} {
		if !isSpecFile(name) {
			t.Errorf("expected case-insensitive match for %s", name)
		}
	}
}

func TestIsSpecFile_PathWithDirectory(t *testing.T) {
	if !isSpecFile("docs/api/reference.md") {
		t.Error("expected path with directory to match .md")
	}
	if isSpecFile("src/main.go") {
		t.Error("expected src/main.go NOT to be a spec file")
	}
}
