package db

import "testing"

func TestShouldSkipDir(t *testing.T) {
	skipSet := toSkipDirSet([]string{".skills", "vendor"})

	if shouldSkipDir("/repo", "/repo", skipSet) {
		t.Fatalf("repo root must not be skipped")
	}
	if !shouldSkipDir("/repo/docs/.skills", "/repo", skipSet) {
		t.Fatalf("expected .skills directory to be skipped")
	}
	if shouldSkipDir("/repo/docs/.skills-old", "/repo", skipSet) {
		t.Fatalf("partial directory name must not be skipped")
	}
}

func TestPathHasSkippedDir(t *testing.T) {
	skipSet := toSkipDirSet([]string{".skills"})
	if !pathHasSkippedDir("docs/.skills/file.md", skipSet) {
		t.Fatalf("expected path to be filtered")
	}
	if pathHasSkippedDir("docs/skills/file.md", skipSet) {
		t.Fatalf("non-matching segment must not be filtered")
	}
}

func TestFilterSkippedPaths(t *testing.T) {
	in := []string{
		"docs/a.md",
		"docs/.skills/hidden.md",
		"guides/b.md",
	}
	got := filterSkippedPaths(in, []string{".skills"})
	if len(got) != 2 {
		t.Fatalf("expected 2 paths after filtering, got %d", len(got))
	}
	if got[0] != "docs/a.md" || got[1] != "guides/b.md" {
		t.Fatalf("unexpected filter result: %v", got)
	}
}
