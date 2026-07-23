package main

// Requirement-traced companions to the golden harness (golden_test.go).
//
// TestGoldenOutputs already pins the inherited commands byte-exactly against
// testdata/golden/. These tests give R-4.6 and R-5.4 named tracing gates on
// top of that: the pinned outputs of the inherited `graph export|tag|search`
// surfaces must not have grown the typed-link-only fields (R-5.2 adds them
// `omitempty`, so untyped output stays byte-identical), and every pre-captured
// golden file must still exist so the byte-exact harness cannot silently
// weaken.

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// typedOnlyKeys are the four graphify link-schema fields R-5.2 introduces.
// They may appear ONLY on typed knowledge-graph links, never in the inherited
// untyped outputs the goldens pin.
var typedOnlyKeys = []string{`"relation"`, `"confidence"`, `"source_file"`, `"source_location"`}

// R-4.6: `graph export|tag|search` behavior/output unchanged — the pinned
// outputs contain none of the typed-only fields (the golden fixture declares
// no canonical IDs, so any occurrence means the untyped surface changed).
func TestGraphInherited_R46_NoTypedFieldsInPinnedOutputs(t *testing.T) {
	for _, name := range []string{
		"graph-export-file.golden",
		"graph-export-stdout.golden",
		"graph-tag.golden",
		"graph-search.golden",
	} {
		raw, err := os.ReadFile(filepath.Join("testdata", "golden", name))
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		for _, k := range typedOnlyKeys {
			if strings.Contains(string(raw), k) {
				t.Errorf("%s contains typed-only key %s — inherited output changed (R-4.6)", name, k)
			}
		}
	}
}

// R-5.4: the pre-captured golden set for the top inherited commands is intact,
// so TestGoldenOutputs keeps enforcing byte-exact compatibility. (The only
// sanctioned addition is the R-5.1 scan summary line in scan.golden.)
func TestInheritedGoldens_R54_PreCapturedSetIntact(t *testing.T) {
	want := []string{
		"graph-export-file.golden",
		"graph-export-stdout.golden",
		"graph-search.golden",
		"graph-tag.golden",
		"json-search.golden",
		"repo-list.golden",
		"scan.golden",
		"search.golden",
	}
	for _, name := range want {
		if _, err := os.Stat(filepath.Join("testdata", "golden", name)); err != nil {
			t.Errorf("golden file missing: %s (%v) — R-5.4 harness weakened", name, err)
		}
	}
	scan, err := os.ReadFile(filepath.Join("testdata", "golden", "scan.golden"))
	if err != nil {
		t.Fatalf("read scan.golden: %v", err)
	}
	if !strings.Contains(string(scan), "kg: structural") {
		t.Errorf("scan.golden lacks the R-5.1 summary line — scan output regressed")
	}
}
