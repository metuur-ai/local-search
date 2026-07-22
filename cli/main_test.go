package main

import "testing"

func TestParseRepoAddArgs_Basic(t *testing.T) {
	dir, name, skips, err := parseRepoAddArgs([]string{"./specs", "prod", "--skip-directory", ".skills", "--skip-directory=vendor"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if dir != "./specs" {
		t.Fatalf("expected dir ./specs, got %q", dir)
	}
	if name != "prod" {
		t.Fatalf("expected name prod, got %q", name)
	}
	if len(skips) != 2 || skips[0] != ".skills" || skips[1] != "vendor" {
		t.Fatalf("unexpected skips: %v", skips)
	}
}

func TestParseRepoAddArgs_FlagsBeforePositionals(t *testing.T) {
	dir, name, skips, err := parseRepoAddArgs([]string{"--skip-directory", ".skills", "./specs"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if dir != "./specs" || name != "" {
		t.Fatalf("unexpected parsed values: dir=%q name=%q", dir, name)
	}
	if len(skips) != 1 || skips[0] != ".skills" {
		t.Fatalf("unexpected skips: %v", skips)
	}
}

func TestParseRepoAddArgs_RejectsPathForSkipDirectory(t *testing.T) {
	_, _, _, err := parseRepoAddArgs([]string{"./specs", "--skip-directory", "dir/subdir"})
	if err == nil {
		t.Fatalf("expected error for path-like skip-directory")
	}
}

func TestParseRepoEntryLine_BackwardCompatible(t *testing.T) {
	r, ok := parseRepoEntryLine("docs|/tmp/docs")
	if !ok {
		t.Fatalf("expected line to parse")
	}
	if r.Name != "docs" || r.Path != "/tmp/docs" {
		t.Fatalf("unexpected repo entry: %+v", r)
	}
	if len(r.SkipDirectories) != 0 {
		t.Fatalf("expected no skip directories, got %v", r.SkipDirectories)
	}
}

func TestParseAndFormatRepoEntryLine_WithSkipDirectories(t *testing.T) {
	orig := repoEntry{Name: "docs", Path: "/tmp/docs", SkipDirectories: []string{"vendor", ".skills", "vendor"}}
	line := formatRepoEntryLine(orig)
	r, ok := parseRepoEntryLine(line)
	if !ok {
		t.Fatalf("expected formatted line to parse")
	}
	if r.Name != "docs" || r.Path != "/tmp/docs" {
		t.Fatalf("unexpected repo values: %+v", r)
	}
	if len(r.SkipDirectories) != 2 || r.SkipDirectories[0] != ".skills" || r.SkipDirectories[1] != "vendor" {
		t.Fatalf("unexpected skip directories: %v", r.SkipDirectories)
	}
}

// Round-trip write→parse for all four flat-file line shapes (R-6.1, R-6.2, R-6.6).
func TestRepoEntryLine_RoundTrip_AllShapes(t *testing.T) {
	const ts = "2026-07-20T10:00:00Z"
	cases := []struct {
		name     string
		entry    repoEntry
		wantLine string
	}{
		{
			name:     "2-field legacy",
			entry:    repoEntry{Name: "docs", Path: "/tmp/docs"},
			wantLine: "docs|/tmp/docs",
		},
		{
			name:     "3-field legacy skip-dirs",
			entry:    repoEntry{Name: "docs", Path: "/tmp/docs", SkipDirectories: []string{"vendor"}},
			wantLine: "docs|/tmp/docs|vendor",
		},
		{
			// The single highest-risk shape: added_at with empty skip-dirs must
			// emit the empty 3rd-field placeholder and survive round-trip (R-6.6).
			name:     "added_at, no skip-dirs",
			entry:    repoEntry{Name: "docs", Path: "/tmp/docs", AddedAt: ts},
			wantLine: "docs|/tmp/docs||" + ts,
		},
		{
			name:     "both skip-dirs and added_at",
			entry:    repoEntry{Name: "docs", Path: "/tmp/docs", SkipDirectories: []string{"vendor"}, AddedAt: ts},
			wantLine: "docs|/tmp/docs|vendor|" + ts,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			line := formatRepoEntryLine(tc.entry)
			if line != tc.wantLine {
				t.Fatalf("formatRepoEntryLine = %q, want %q", line, tc.wantLine)
			}
			r, ok := parseRepoEntryLine(line)
			if !ok {
				t.Fatalf("line %q was dropped (parse returned ok=false)", line)
			}
			if r.Name != tc.entry.Name || r.Path != tc.entry.Path {
				t.Fatalf("name/path mismatch: got %+v, want %+v", r, tc.entry)
			}
			if r.AddedAt != tc.entry.AddedAt {
				t.Fatalf("AddedAt mismatch: got %q, want %q", r.AddedAt, tc.entry.AddedAt)
			}
			if len(r.SkipDirectories) != len(tc.entry.SkipDirectories) {
				t.Fatalf("skip-dirs mismatch: got %v, want %v", r.SkipDirectories, tc.entry.SkipDirectories)
			}
		})
	}
}

// A repo with added_at and no skip-dirs must survive a save/load cycle intact.
func TestRepoEntryLine_AddedAtNoSkip_SurvivesSaveLoad(t *testing.T) {
	orig := repoEntry{Name: "docs", Path: "/tmp/docs", AddedAt: "2026-07-20T10:00:00Z"}
	r, ok := parseRepoEntryLine(formatRepoEntryLine(orig))
	if !ok {
		t.Fatalf("repo with added_at and no skip-dirs was silently dropped")
	}
	if r.Name != orig.Name || r.Path != orig.Path || r.AddedAt != orig.AddedAt {
		t.Fatalf("round-trip lost data: got %+v, want %+v", r, orig)
	}
	if len(r.SkipDirectories) != 0 {
		t.Fatalf("expected empty skip-dirs, got %v", r.SkipDirectories)
	}
}
