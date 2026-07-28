package config

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func writeTOML(t *testing.T, dir, body string) string {
	t.Helper()
	p := LegacyProjectPath(dir)
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestMigrate_NoLegacyIsNoOp(t *testing.T) {
	res, err := Migrate(t.TempDir(), MigrateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if res.Ran {
		t.Error("Ran should be false when there is no legacy file")
	}
}

func TestMigrate_BasicConversion(t *testing.T) {
	dir := t.TempDir()
	tomlPath := writeTOML(t, dir, `scope = ["alpha", "graph:legacy"]`)

	res, err := Migrate(dir, MigrateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if !res.Ran || !res.TOMLRemoved {
		t.Fatalf("Ran=%v TOMLRemoved=%v", res.Ran, res.TOMLRemoved)
	}
	if _, err := os.Stat(tomlPath); !os.IsNotExist(err) {
		t.Error("legacy TOML should have been removed")
	}
	got, err := Load(ProjectPath(dir))
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"alpha", "graph:legacy"}; !reflect.DeepEqual(got.Repositories, want) {
		t.Errorf("repositories = %v, want %v", got.Repositories, want)
	}
}

// Losslessness stated as a property: the resolved settings before and after
// migration must be identical. This is what catches default-substitution bugs,
// which a golden-file comparison would miss.
func TestMigrate_IsLossless(t *testing.T) {
	dir := t.TempDir()
	writeTOML(t, dir, `scope = ["alpha"]

[weights]
specs = 2.5
codegraph = 1.5

[limits]
blast_depth = 7
`)
	res, err := Migrate(dir, MigrateOptions{DryRun: true})
	if err != nil {
		t.Fatal(err)
	}
	// Values the legacy reader would have resolved, per its own defaulting rules.
	want := Defaults()
	want.Repositories = []string{"alpha"}
	want.Weights.Specs = 2.5
	want.Weights.CodeGraph = 1.5
	want.Limits.BlastDepth = 7

	got := res.Settings
	got.Path = ""
	want.Path = ""
	if !reflect.DeepEqual(got, want) {
		t.Errorf("resolved settings changed across migration:\n got %+v\nwant %+v", got, want)
	}
}

// A TOML 0 was NEVER honoured pre-0.4.0 (`if x == 0 { x = Default }`). Carrying
// it as an explicit 0 would change behaviour during a migration that must
// preserve it.
func TestMigrate_DropsLegacyZero(t *testing.T) {
	dir := t.TempDir()
	writeTOML(t, dir, "scope = [\"alpha\"]\n\n[weights]\nspecs = 0\ngraphify = 0.9\n")
	res, err := Migrate(dir, MigrateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if res.Settings.Weights.Specs != DefaultWeightSpecs {
		t.Errorf("legacy 0 should resolve to the default (%v), got %v",
			DefaultWeightSpecs, res.Settings.Weights.Specs)
	}
	if res.Settings.Weights.Graphify != 0.9 {
		t.Errorf("graphify = %v, want 0.9 carried", res.Settings.Weights.Graphify)
	}
	raw, _ := os.ReadFile(ProjectPath(dir))
	if strings.Contains(string(raw), "specs: 0") {
		t.Errorf("an explicit 0 was written, changing behaviour:\n%s", raw)
	}
}

func TestMigrate_MergesWithExistingYAML(t *testing.T) {
	dir := t.TempDir()
	// The empty YAML `init` used to create with zero user intent.
	if err := SetRepositories(ProjectPath(dir), nil); err != nil {
		t.Fatal(err)
	}
	writeTOML(t, dir, `scope = ["fromtoml"]`)

	res, err := Migrate(dir, MigrateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if !res.Merged {
		t.Error("Merged should be true when a YAML already existed")
	}
	got, err := Load(ProjectPath(dir))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Repositories, []string{"fromtoml"}) {
		t.Errorf("repositories = %v, want [fromtoml] — union must not lose the TOML's entry", got.Repositories)
	}
}

func TestMigrate_UnionKeepsBothSides(t *testing.T) {
	dir := t.TempDir()
	if err := SetRepositories(ProjectPath(dir), []string{"fromyaml"}); err != nil {
		t.Fatal(err)
	}
	writeTOML(t, dir, `scope = ["fromtoml", "fromyaml"]`)
	if _, err := Migrate(dir, MigrateOptions{}); err != nil {
		t.Fatal(err)
	}
	got, _ := Load(ProjectPath(dir))
	want := []string{"fromyaml", "fromtoml"} // YAML order first, deduped
	if !reflect.DeepEqual(got.Repositories, want) {
		t.Errorf("repositories = %v, want %v", got.Repositories, want)
	}
}

// Unknown TOML keys were silently dropped by the old reader; deleting the file
// would make that loss permanent.
func TestMigrate_KeepsTOMLWithUnknownKeys(t *testing.T) {
	dir := t.TempDir()
	tomlPath := writeTOML(t, dir, "scope = [\"alpha\"]\nmystery_setting = 42\n")
	res, err := Migrate(dir, MigrateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if res.TOMLRemoved {
		t.Error("must not delete a TOML carrying settings it did not understand")
	}
	if _, err := os.Stat(tomlPath); err != nil {
		t.Error("TOML should still be on disk")
	}
	if len(res.Warnings) == 0 || !strings.Contains(strings.Join(res.Warnings, " "), "mystery_setting") {
		t.Errorf("warning should name the unknown key, got %v", res.Warnings)
	}
}

// Malformed TOML pre-0.4.0 fell through silently, so the scope vanished with no
// output. Now it must be loud and non-destructive.
func TestMigrate_MalformedTOMLErrorsAndKeepsFile(t *testing.T) {
	dir := t.TempDir()
	tomlPath := writeTOML(t, dir, "scope = [unclosed\n")
	if _, err := Migrate(dir, MigrateOptions{}); err == nil {
		t.Fatal("expected an error for malformed TOML")
	}
	if _, err := os.Stat(tomlPath); err != nil {
		t.Error("must not delete a TOML it could not parse")
	}
	if _, err := os.Stat(ProjectPath(dir)); err == nil {
		t.Error("must not write a YAML from a config it could not read")
	}
}

func TestMigrate_DryRunWritesNothing(t *testing.T) {
	dir := t.TempDir()
	tomlPath := writeTOML(t, dir, `scope = ["alpha"]`)
	res, err := Migrate(dir, MigrateOptions{DryRun: true})
	if err != nil {
		t.Fatal(err)
	}
	if !res.Ran {
		t.Error("dry run should still report what it would do")
	}
	if _, err := os.Stat(tomlPath); err != nil {
		t.Error("dry run deleted the TOML")
	}
	if _, err := os.Stat(ProjectPath(dir)); err == nil {
		t.Error("dry run wrote a YAML")
	}
}

func TestMigrate_KeepTOMLOption(t *testing.T) {
	dir := t.TempDir()
	tomlPath := writeTOML(t, dir, `scope = ["alpha"]`)
	res, err := Migrate(dir, MigrateOptions{KeepTOML: true})
	if err != nil {
		t.Fatal(err)
	}
	if res.TOMLRemoved {
		t.Error("--keep-toml should leave the file")
	}
	if _, err := os.Stat(tomlPath); err != nil {
		t.Error("TOML should still exist")
	}
	if _, err := Load(ProjectPath(dir)); err != nil {
		t.Errorf("YAML should still be written: %v", err)
	}
}

func TestMigrate_IsIdempotent(t *testing.T) {
	dir := t.TempDir()
	writeTOML(t, dir, "scope = [\"alpha\"]\n\n[limits]\nblast_cap = 9\n")
	if _, err := Migrate(dir, MigrateOptions{}); err != nil {
		t.Fatal(err)
	}
	first, err := os.ReadFile(ProjectPath(dir))
	if err != nil {
		t.Fatal(err)
	}
	// Second run: nothing left to migrate, file untouched.
	res, err := Migrate(dir, MigrateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if res.Ran {
		t.Error("second run should find nothing to do")
	}
	second, _ := os.ReadFile(ProjectPath(dir))
	if string(first) != string(second) {
		t.Errorf("not idempotent:\n--- first ---\n%s\n--- second ---\n%s", first, second)
	}
}

func TestMigrateGlobal(t *testing.T) {
	home := t.TempDir()
	legacyDir := filepath.Join(home, ".local-search")
	if err := os.MkdirAll(legacyDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(LegacyGlobalPath(home), []byte(`scope = ["alpha"]`), 0o644); err != nil {
		t.Fatal(err)
	}
	res, err := MigrateGlobal(home, MigrateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if !res.Ran {
		t.Fatal("should have migrated the global config")
	}
	got, err := Load(GlobalPath(home))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Repositories, []string{"alpha"}) {
		t.Errorf("repositories = %v", got.Repositories)
	}
}

func TestFindLegacy_WalksUp(t *testing.T) {
	root := t.TempDir()
	writeTOML(t, root, `scope = []`)
	deep := filepath.Join(root, "a", "b")
	if err := os.MkdirAll(deep, 0o755); err != nil {
		t.Fatal(err)
	}
	dir, ok := FindLegacy(deep, "")
	if !ok || dir != root {
		t.Errorf("FindLegacy = %q ok=%v, want %q", dir, ok, root)
	}
}

func TestAutoMigrateDisabled(t *testing.T) {
	for _, tc := range []struct {
		val  string
		want bool
	}{{"", false}, {"0", false}, {"false", false}, {"1", true}, {"yes", true}} {
		t.Setenv("LOCAL_SEARCH_NO_AUTO_MIGRATE", tc.val)
		if got := AutoMigrateDisabled(); got != tc.want {
			t.Errorf("%q → %v, want %v", tc.val, got, tc.want)
		}
	}
}
