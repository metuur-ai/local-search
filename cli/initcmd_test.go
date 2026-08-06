package main

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"local-search/config"
)

// The pure helpers (no DB) are unit-tested directly. Config parsing, rendering,
// and round-tripping moved to local-search/config when the hand-rolled YAML
// parser was deleted — see cli/config/config_test.go.
//
// The command wiring (--add/--remove/--json validation) goes through
// openDBForResolve and is exercised by the CLI golden tests.

func TestWriteReadProjectConfig(t *testing.T) {
	dir := t.TempDir()
	path := config.ProjectPath(dir)

	// Missing file → not exists.
	if _, err := config.LoadFile(path); !config.IsNotExist(err) {
		t.Fatalf("want not-exists for a missing file, got %v", err)
	}
	// Write creates the .agents/ dir and the file.
	if err := config.SetRepositories(path, []string{"platform", "docs"}); err != nil {
		t.Fatalf("SetRepositories: %v", err)
	}
	got, err := config.Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if want := []string{"platform", "docs"}; !reflect.DeepEqual(got.Repositories, want) {
		t.Fatalf("read back = %v, want %v", got.Repositories, want)
	}
}

// The headline regression: `scope set` / `init --set` used to wipe a user's
// weights and limits because the writer emitted only the repo list.
func TestWriteProjectConfig_KeepsWeights(t *testing.T) {
	dir := t.TempDir()
	path := config.ProjectPath(dir)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	original := "repositories:\n  - old\n\nweights:\n  specs: 3.5\n\nlimits:\n  blast_cap: 9\n"
	if err := os.WriteFile(path, []byte(original), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := config.SetRepositories(path, []string{"new"}); err != nil {
		t.Fatalf("SetRepositories: %v", err)
	}
	got, err := config.Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got.Weights.Specs != 3.5 {
		t.Errorf("weights.specs = %v, want 3.5 preserved", got.Weights.Specs)
	}
	if got.Limits.BlastCap != 9 {
		t.Errorf("limits.blast_cap = %v, want 9 preserved", got.Limits.BlastCap)
	}
	if !reflect.DeepEqual(got.Repositories, []string{"new"}) {
		t.Errorf("repositories = %v, want [new]", got.Repositories)
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
