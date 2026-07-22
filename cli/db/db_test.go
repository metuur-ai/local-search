package db

import (
	"testing"
)

// ── splitTags ────────────────────────────────────────────────────────────────

func TestSplitTags_CommaSeparated(t *testing.T) {
	got := splitTags("go, testing, sqlite")
	want := []string{"go", "testing", "sqlite"}
	if len(got) != len(want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
	for i, w := range want {
		if got[i] != w {
			t.Errorf("index %d: expected %q, got %q", i, w, got[i])
		}
	}
}

func TestSplitTags_EmptyString(t *testing.T) {
	got := splitTags("")
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %v", got)
	}
}

func TestSplitTags_WhitespaceOnly(t *testing.T) {
	got := splitTags("  ,  ,  ")
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %v", got)
	}
}

func TestSplitTags_SingleTag(t *testing.T) {
	got := splitTags("backend")
	if len(got) != 1 || got[0] != "backend" {
		t.Errorf("expected [backend], got %v", got)
	}
}

func TestSplitTags_TrimsSpaces(t *testing.T) {
	got := splitTags("  tag1  ,  tag2  ")
	if len(got) != 2 || got[0] != "tag1" || got[1] != "tag2" {
		t.Errorf("expected [tag1, tag2], got %v", got)
	}
}

// ── chunkPaths ────────────────────────────────────────────────────────────────

func TestChunkPaths_EmptyInput(t *testing.T) {
	calls := 0
	err := chunkPaths([]string{}, func(chunk []string) error {
		calls++
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if calls != 0 {
		t.Errorf("expected 0 calls, got %d", calls)
	}
}

func TestChunkPaths_SingleBatch(t *testing.T) {
	paths := make([]string, 10)
	for i := range paths {
		paths[i] = "path"
	}
	var got [][]string
	err := chunkPaths(paths, func(chunk []string) error {
		got = append(got, chunk)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Errorf("expected 1 batch, got %d", len(got))
	}
	if len(got[0]) != 10 {
		t.Errorf("expected 10 items in batch, got %d", len(got[0]))
	}
}

func TestChunkPaths_SplitsAtBatchSize(t *testing.T) {
	// batchSize is sqliteMaxVars-1 = 998; create 999 paths to force 2 batches
	paths := make([]string, 999)
	for i := range paths {
		paths[i] = "p"
	}
	var sizes []int
	err := chunkPaths(paths, func(chunk []string) error {
		sizes = append(sizes, len(chunk))
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(sizes) != 2 {
		t.Fatalf("expected 2 batches, got %d: %v", len(sizes), sizes)
	}
	if sizes[0] != 998 {
		t.Errorf("first batch: expected 998, got %d", sizes[0])
	}
	if sizes[1] != 1 {
		t.Errorf("second batch: expected 1, got %d", sizes[1])
	}
}

// ── humanBytes ────────────────────────────────────────────────────────────────

func TestHumanBytes_Bytes(t *testing.T) {
	got := humanBytes(512)
	if got != "512 B" {
		t.Errorf("expected '512 B', got %q", got)
	}
}

func TestHumanBytes_Kilobytes(t *testing.T) {
	got := humanBytes(1024)
	if got != "1.0 KB" {
		t.Errorf("expected '1.0 KB', got %q", got)
	}
}

func TestHumanBytes_Megabytes(t *testing.T) {
	got := humanBytes(1024 * 1024)
	if got != "1.0 MB" {
		t.Errorf("expected '1.0 MB', got %q", got)
	}
}

func TestHumanBytes_Zero(t *testing.T) {
	got := humanBytes(0)
	if got != "0 B" {
		t.Errorf("expected '0 B', got %q", got)
	}
}

// ── buildRelatedQuery ─────────────────────────────────────────────────────────

func TestBuildRelatedQuery_TagsAndTitle(t *testing.T) {
	got := buildRelatedQuery("go, sqlite", "My Document Title", "mydoc")
	if got == "" {
		t.Error("expected non-empty query")
	}
	// Tags should be quoted
	if !containsSubstr(got, `"go"`) {
		t.Errorf("expected quoted tag 'go' in query: %q", got)
	}
	if !containsSubstr(got, `"sqlite"`) {
		t.Errorf("expected quoted tag 'sqlite' in query: %q", got)
	}
}

func TestBuildRelatedQuery_EmptyTagsAndTitle(t *testing.T) {
	got := buildRelatedQuery("", "", "name")
	if got != "" {
		t.Errorf("expected empty query, got %q", got)
	}
}

func TestBuildRelatedQuery_ExcludesSpecName(t *testing.T) {
	got := buildRelatedQuery("myspec, other", "My Title", "myspec")
	if containsSubstr(got, "myspec") {
		t.Errorf("expected spec name excluded from query, got %q", got)
	}
}

func TestBuildRelatedQuery_ShortTitleWordsExcluded(t *testing.T) {
	// Words ≤3 chars should be skipped
	got := buildRelatedQuery("", "The API for Go", "doc")
	// "The"(3), "API"(3), "for"(3), "Go"(2) — all ≤3 chars
	if got != "" {
		t.Errorf("expected empty query for all short words, got %q", got)
	}
}

func containsSubstr(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsAt(s, sub))
}

func containsAt(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
