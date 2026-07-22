package main

import (
	"path/filepath"
	"reflect"
	"testing"
)

// The minimal YAML helpers are pure (no DB), so they're unit-tested directly.
// The command wiring (--add/--remove/--json validation) goes through openDBForResolve
// and is exercised by the manual CLI smoke test in the plan's verification section.

func TestParseProjectYAML_BlockList(t *testing.T) {
	in := []byte("# comment\nrepositories:\n  - platform\n  - docs\n")
	got := parseProjectYAML(in)
	if want := []string{"platform", "docs"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("parseProjectYAML = %v, want %v", got, want)
	}
}

func TestParseProjectYAML_EmptyForms(t *testing.T) {
	for _, in := range []string{"repositories: []\n", "repositories:\n", "# only a comment\n", ""} {
		if got := parseProjectYAML([]byte(in)); len(got) != 0 {
			t.Fatalf("parseProjectYAML(%q) = %v, want empty", in, got)
		}
	}
}

func TestParseProjectYAML_InlineFlowAndQuotes(t *testing.T) {
	got := parseProjectYAML([]byte(`repositories: ["platform", 'docs']`))
	if want := []string{"platform", "docs"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("inline flow parse = %v, want %v", got, want)
	}
}

func TestParseProjectYAML_StopsAtNextKey(t *testing.T) {
	in := []byte("repositories:\n  - a\nother: value\n  - not-a-repo\n")
	if got := parseProjectYAML(in); !reflect.DeepEqual(got, []string{"a"}) {
		t.Fatalf("parse stopped wrong: got %v, want [a]", got)
	}
}

func TestRenderParseRoundTrip(t *testing.T) {
	for _, repos := range [][]string{nil, {"platform"}, {"platform", "docs", "graph:external"}} {
		got := parseProjectYAML(renderProjectYAML(repos))
		want := repos
		if len(repos) == 0 {
			want = nil
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("round-trip %v -> %v", repos, got)
		}
	}
}

func TestWriteReadProjectConfig(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, agentDir, projectConfigName)

	// Missing file → not exists.
	if _, ok := readProjectConfig(path); ok {
		t.Fatal("readProjectConfig should report not-exists for a missing file")
	}
	// Write creates the .agent/ dir and the file.
	if err := writeProjectConfig(path, []string{"platform", "docs"}); err != nil {
		t.Fatalf("writeProjectConfig: %v", err)
	}
	got, ok := readProjectConfig(path)
	if !ok {
		t.Fatal("readProjectConfig should find the written file")
	}
	if want := []string{"platform", "docs"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("read back = %v, want %v", got, want)
	}
}

func TestDedupe(t *testing.T) {
	got := dedupe([]string{"a", "b", "a", "", "  ", "b", "c"})
	if want := []string{"a", "b", "c"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("dedupe = %v, want %v", got, want)
	}
}

func TestRemoveNames(t *testing.T) {
	got := removeNames([]string{"a", "b", "c"}, []string{"b", "missing"})
	if want := []string{"a", "c"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("removeNames = %v, want %v", got, want)
	}
}

func TestValidateNames_KeepsKnown(t *testing.T) {
	valid := map[string]bool{"platform": true, "graph:ext": true}
	got := validateNames([]string{" platform ", "graph:ext", ""}, valid)
	if want := []string{"platform", "graph:ext"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("validateNames = %v, want %v", got, want)
	}
}

func TestUnknownEntries(t *testing.T) {
	valid := map[string]bool{"platform": true}
	got := unknownEntries([]string{"platform", "gone"}, valid)
	if want := []string{"gone"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unknownEntries = %v, want %v", got, want)
	}
}

func TestSplitList(t *testing.T) {
	got := splitList(" a , b ,, c ")
	if want := []string{"a", "b", "c"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("splitList = %v, want %v", got, want)
	}
}
