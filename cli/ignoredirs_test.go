package main

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"

	localdb "local-search/db"
)

// ignoreLineToSkipDir honors directory patterns and bare match-anywhere names,
// while rejecting comments, negations, globs, multi-segment paths, and
// root-anchored bare entries that may be files.
func TestIgnoreLineToSkipDir(t *testing.T) {
	cases := []struct {
		line        string
		want        string
		explicitDir bool
		ok          bool
	}{
		{"node_modules/", "node_modules", true, true},
		{"dist/                 # release bundle", "dist", true, true}, // trailing comment
		{"graphify-out/", "graphify-out", true, true},
		{"/build/", "build", true, true},              // anchored directory → basename
		{"node_modules", "node_modules", false, true}, // bare match-anywhere name
		{"__pycache__/", "__pycache__", true, true},
		{".venv/", ".venv", true, true},
		{"", "", false, false},                  // blank
		{"# a comment", "", false, false},       // comment
		{"!keep/", "", false, false},            // negation
		{"*.exe", "", false, false},             // glob
		{"local-search-*", "", false, false},    // glob
		{"web/frontend/dist", "", false, false}, // multi-segment path
		{"/cli/local-search", "", false, false}, // anchored path
		{"/local-search", "", false, false},     // anchored bare (maybe a file) → reject
		{".", "", false, false},
		{"..", "", false, false},
	}
	for _, c := range cases {
		got, explicitDir, ok := ignoreLineToSkipDir(c.line)
		if got != c.want || explicitDir != c.explicitDir || ok != c.ok {
			t.Errorf("ignoreLineToSkipDir(%q) = (%q, %v, %v), want (%q, %v, %v)",
				c.line, got, explicitDir, ok, c.want, c.explicitDir, c.ok)
		}
	}
}

// ignoredDirsForDisplay shows explicit `dir/` patterns even when nested-only,
// includes bare names that exist as a root folder, and drops no-op file patterns.
func TestIgnoredDirsForDisplay(t *testing.T) {
	dir := t.TempDir()
	// node_modules/ is explicit-dir but lives only nested; vendor is a bare name
	// present at root; .env is a bare file pattern with no folder → dropped.
	if err := os.WriteFile(filepath.Join(dir, ".gitignore"),
		[]byte("node_modules/\nvendor\n.env\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "sub", "node_modules"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "vendor"), 0o755); err != nil {
		t.Fatal(err)
	}
	got := ignoredDirsForDisplay(dir)
	want := []string{"node_modules", "vendor"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ignoredDirsForDisplay = %v, want %v", got, want)
	}
}

// deriveIgnoredDirs reads both .gitignore and .graphifyignore at the repo root
// and returns the union of directory patterns; a missing file contributes
// nothing rather than erroring.
func TestDeriveIgnoredDirs(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, ".gitignore"),
		[]byte("node_modules/\ndist/\n*.exe\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".graphifyignore"),
		[]byte("graphify-out/\n# comment\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := normalizeSkipDirectoryNames(deriveIgnoredDirs(dir))
	if err != nil {
		t.Fatalf("normalize: %v", err)
	}
	want := []string{"dist", "graphify-out", "node_modules"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("deriveIgnoredDirs = %v, want %v", got, want)
	}
}

func TestDeriveIgnoredDirs_NoFiles(t *testing.T) {
	if got := deriveIgnoredDirs(t.TempDir()); len(got) != 0 {
		t.Fatalf("expected no derived dirs for a repo with no ignore files, got %v", got)
	}
}

// effectiveSkipDirs unions explicit skip directories with ignore-file-derived
// ones, deduped and sorted.
func TestEffectiveSkipDirs_MergesExplicitAndDerived(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, ".gitignore"),
		[]byte("node_modules/\nvendor/\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	r := repoEntry{Name: "x", Path: dir, SkipDirectories: []string{"vendor", "fixtures"}}
	got := effectiveSkipDirs(r)
	sort.Strings(got)
	want := []string{"fixtures", "node_modules", "vendor"} // vendor deduped
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("effectiveSkipDirs = %v, want %v", got, want)
	}
}

// End-to-end: a scan of a repo whose .gitignore lists node_modules/ must NOT
// index specs living under node_modules, even though no --skip-directory was
// configured. This is the core behavior — ignore files applied at scan time.
func TestCmdScan_HonorsGitignoreDirs(t *testing.T) {
	setupScanEnv(t)
	dir := t.TempDir()
	writeSpec(t, filepath.Join(dir, "keep.md"), "# keep\n\nindexed spec\n")
	nested := filepath.Join(dir, "node_modules", "pkg")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	writeSpec(t, filepath.Join(nested, "junk.md"), "# junk\n\nshould be skipped\n")
	if err := os.WriteFile(filepath.Join(dir, ".gitignore"), []byte("node_modules/\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	saveRepos([]repoEntry{{Name: "r", Path: dir}})

	cmdScan([]string{"all"})

	db, err := localdb.Open(dbFile)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()
	if n := countSpecs(t, db, "r"); n != 1 {
		t.Fatalf("expected exactly 1 indexed spec (node_modules skipped), got %d", n)
	}
}
