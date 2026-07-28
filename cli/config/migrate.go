package config

// Migration from the pre-0.4.0 TOML config.
//
// This is the ONLY file in the module that imports a TOML library. When
// auto-migration is retired, delete this file and drop the dependency.
//
// Old → new:
//
//	<dir>/.local-search.toml        → <dir>/.agent/local-search-config.yaml
//	~/.local-search/config.toml     → ~/.local-search-config.yaml
//
// The `scope` key becomes `repositories`. Migration is directory-scoped: a TOML
// at /a never merges into a YAML at /a/b.

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
)

// MigrateOptions tunes a migration run.
type MigrateOptions struct {
	DryRun   bool // compute the plan, write nothing
	KeepTOML bool // leave the legacy file on disk after a successful write
}

// MigrateResult describes what a migration did (or would do).
type MigrateResult struct {
	Ran         bool     // false when there was no legacy file — not an error
	TOMLPath    string   // legacy file read
	YAMLPath    string   // file written
	Merged      bool     // a YAML already existed and was merged into
	Added       []string // repos taken from the TOML that the YAML lacked
	Carried     []string // settings carried over, e.g. "weights.specs"
	Skipped     []string // settings deliberately NOT carried, with reasons
	TOMLRemoved bool
	Warnings    []string

	// Settings is the post-migration config. On a read-only filesystem the
	// write fails but this is still populated, so callers can proceed in
	// memory rather than failing a search because a write failed.
	Settings Settings
}

// legacyFile mirrors the pre-0.4.0 TOML schema.
type legacyFile struct {
	Scope   []string      `toml:"scope"`
	Weights legacyWeights `toml:"weights"`
	Limits  legacyLimits  `toml:"limits"`
}

type legacyWeights struct {
	Specs     float64 `toml:"specs"`
	Graphify  float64 `toml:"graphify"`
	CodeGraph float64 `toml:"codegraph"`
}

type legacyLimits struct {
	Specs      int `toml:"specs"`
	Graphify   int `toml:"graphify"`
	CodeGraph  int `toml:"codegraph"`
	BlastDepth int `toml:"blast_depth"`
	BlastCap   int `toml:"blast_cap"`
}

// Migrate converts <dir>/.local-search.toml into <dir>/.agent/local-search-config.yaml.
// Ran is false (with a nil error) when there is no legacy file.
func Migrate(dir string, opts MigrateOptions) (MigrateResult, error) {
	return migrate(LegacyProjectPath(dir), ProjectPath(dir), opts)
}

// MigrateGlobal converts ~/.local-search/config.toml into ~/.local-search-config.yaml.
func MigrateGlobal(home string, opts MigrateOptions) (MigrateResult, error) {
	if home == "" {
		return MigrateResult{}, nil
	}
	return migrate(LegacyGlobalPath(home), GlobalPath(home), opts)
}

func migrate(tomlPath, yamlPath string, opts MigrateOptions) (MigrateResult, error) {
	res := MigrateResult{TOMLPath: tomlPath, YAMLPath: yamlPath}

	raw, err := os.ReadFile(tomlPath)
	if errors.Is(err, fs.ErrNotExist) {
		return res, nil // nothing to do
	}
	if err != nil {
		return res, err
	}
	res.Ran = true

	// toml.Decode (not Unmarshal) so md.Undecoded() is available. The old
	// reader silently dropped unknown keys; deleting the file would make that
	// loss irreversible, so an unknown key blocks the delete below.
	var legacy legacyFile
	md, derr := toml.Decode(string(raw), &legacy)
	if derr != nil {
		// Malformed TOML: error and do NOT delete. Pre-0.4.0 this fell through
		// silently, so the user's scope would otherwise vanish with no output.
		return res, fmt.Errorf("cannot parse legacy config %s: %w\n"+
			"Fix or delete it by hand; local-search will not migrate a config it cannot read", tomlPath, derr)
	}

	var undecoded []string
	for _, k := range md.Undecoded() {
		undecoded = append(undecoded, k.String())
	}

	// Existing YAML at the destination wins; the TOML only fills gaps.
	var existing File
	existingRaw, rerr := os.ReadFile(yamlPath)
	if rerr == nil {
		existing, err = Decode(yamlPath, existingRaw)
		if err != nil {
			return res, fmt.Errorf("cannot migrate into %s: %w", yamlPath, err)
		}
		res.Merged = true
	} else if !errors.Is(rerr, fs.ErrNotExist) {
		return res, rerr
	} else {
		existingRaw = nil
	}

	merged, added := mergeLegacy(existing, legacy, &res)
	res.Added = added
	res.Settings = merged.Settings()
	res.Settings.Path = yamlPath

	if opts.DryRun {
		return res, nil
	}

	if err := Save(yamlPath, merged, existingRaw); err != nil {
		// Read-only filesystem (CI checkouts, container images). The caller
		// still has res.Settings, so a search can proceed in memory — a
		// migration must never be the reason a read-only search breaks.
		res.Warnings = append(res.Warnings,
			fmt.Sprintf("could not write %s (%v) — using the legacy config in memory for this run", yamlPath, err))
		return res, nil
	}

	// Verify before deleting. Re-read and re-decode what we just wrote; if it
	// does not round-trip, keep the legacy file so nothing is lost.
	if _, verr := Load(yamlPath); verr != nil {
		res.Warnings = append(res.Warnings,
			fmt.Sprintf("wrote %s but it did not validate (%v) — leaving %s in place", yamlPath, verr, tomlPath))
		return res, nil
	}

	switch {
	case opts.KeepTOML:
		res.Warnings = append(res.Warnings, "left "+tomlPath+" in place (--keep-toml)")
	case len(undecoded) > 0:
		// Unknown keys were dropped by the decode; deleting would make that
		// permanent and silent.
		res.Warnings = append(res.Warnings, fmt.Sprintf(
			"left %s in place: it contains setting(s) this version does not understand (%s). "+
				"Nothing was lost — review them, then delete the file by hand",
			tomlPath, strings.Join(undecoded, ", ")))
	default:
		if rmErr := os.Remove(tomlPath); rmErr != nil && !errors.Is(rmErr, fs.ErrNotExist) {
			// A stale TOML is harmless once nothing reads it — warn, don't fail.
			res.Warnings = append(res.Warnings,
				fmt.Sprintf("migrated, but could not remove %s (%v) — delete it by hand", tomlPath, rmErr))
		} else {
			res.TOMLRemoved = true
		}
	}
	return res, nil
}

// mergeLegacy folds a legacy TOML into an existing YAML config.
//
// repositories: UNION, YAML order first, TOML-only entries appended, deduped.
// Never silently lose a repo present in either file — a dropped repo changes
// search results invisibly, which is the worst failure mode here. Note that a
// YAML of `repositories: []` is what `init`'s create-if-missing produces with
// zero user intent, so union is the right reading of it.
//
// weights/limits: per-field, carried only where the YAML field is nil.
func mergeLegacy(existing File, legacy legacyFile, res *MigrateResult) (File, []string) {
	out := existing

	seen := map[string]bool{}
	for _, r := range out.Repositories {
		seen[r] = true
	}
	var added []string
	for _, r := range legacy.Scope {
		r = strings.TrimSpace(r)
		if r == "" || seen[r] {
			continue
		}
		seen[r] = true
		out.Repositories = append(out.Repositories, r)
		added = append(added, r)
	}

	carryF := func(dst **float64, val, def float64, name string) {
		if *dst != nil {
			return // the YAML already says something; it wins
		}
		switch {
		case val == 0:
			// Under the pre-0.4.0 `if x == 0 { x = Default }` rule a 0 was
			// NEVER honoured — it silently meant "default". Carrying it as an
			// explicit 0 would change runtime behaviour during a migration
			// that is supposed to preserve it.
			return
		case val == def:
			res.Skipped = append(res.Skipped, name+" (equals the default)")
			return
		}
		v := val
		*dst = &v
		res.Carried = append(res.Carried, name)
	}
	carryI := func(dst **int, val, def int, name string) {
		if *dst != nil {
			return
		}
		switch {
		case val == 0:
			return
		case val == def:
			res.Skipped = append(res.Skipped, name+" (equals the default)")
			return
		}
		v := val
		*dst = &v
		res.Carried = append(res.Carried, name)
	}

	lw := legacy.Weights
	if lw.Specs != 0 || lw.Graphify != 0 || lw.CodeGraph != 0 {
		if out.Weights == nil {
			out.Weights = &Weights{}
		}
		carryF(&out.Weights.Specs, lw.Specs, DefaultWeightSpecs, "weights.specs")
		carryF(&out.Weights.Graphify, lw.Graphify, DefaultWeightGraphify, "weights.graphify")
		carryF(&out.Weights.CodeGraph, lw.CodeGraph, DefaultWeightCodeGraph, "weights.codegraph")
		if out.Weights.Specs == nil && out.Weights.Graphify == nil && out.Weights.CodeGraph == nil {
			out.Weights = nil // everything was a default; don't emit an empty block
		}
	}

	ll := legacy.Limits
	if ll.Specs != 0 || ll.Graphify != 0 || ll.CodeGraph != 0 || ll.BlastDepth != 0 || ll.BlastCap != 0 {
		if out.Limits == nil {
			out.Limits = &Limits{}
		}
		carryI(&out.Limits.Specs, ll.Specs, DefaultLimitSpecs, "limits.specs")
		carryI(&out.Limits.Graphify, ll.Graphify, DefaultLimitGraphify, "limits.graphify")
		carryI(&out.Limits.CodeGraph, ll.CodeGraph, DefaultLimitCodeGraph, "limits.codegraph")
		carryI(&out.Limits.BlastDepth, ll.BlastDepth, DefaultBlastDepth, "limits.blast_depth")
		carryI(&out.Limits.BlastCap, ll.BlastCap, DefaultBlastCap, "limits.blast_cap")
		if out.Limits.Specs == nil && out.Limits.Graphify == nil && out.Limits.CodeGraph == nil &&
			out.Limits.BlastDepth == nil && out.Limits.BlastCap == nil {
			out.Limits = nil
		}
	}

	return out, added
}

// ── Discovery ─────────────────────────────────────────────────────────────────

// FindLegacy walks up from start looking for a .local-search.toml, using the
// same stop conditions as FindProject. Returns the directory containing it.
func FindLegacy(start, home string) (string, bool) {
	dir := start
	for {
		if st, err := os.Stat(LegacyProjectPath(dir)); err == nil && !st.IsDir() {
			return dir, true
		}
		if isHome(dir, home) || isGitRoot(dir) {
			return "", false
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", false
		}
		dir = parent
	}
}

// AutoMigrateDisabled reports whether the user has opted out of implicit
// migration. Shared CI and shared checkouts need a way to say "do not touch my
// working tree".
func AutoMigrateDisabled() bool {
	v := strings.TrimSpace(os.Getenv("LOCAL_SEARCH_NO_AUTO_MIGRATE"))
	return v != "" && v != "0" && !strings.EqualFold(v, "false")
}

// Summary renders a one-paragraph human description of a migration, for stderr.
func (r MigrateResult) Summary() string {
	if !r.Ran {
		return ""
	}
	var b strings.Builder
	fmt.Fprintf(&b, "migrated %s → %s", r.TOMLPath, r.YAMLPath)
	if r.Merged {
		b.WriteString(" (merged into the existing config)")
	}
	if len(r.Added) > 0 {
		fmt.Fprintf(&b, "\n  repositories added: %s", strings.Join(r.Added, ", "))
	}
	if len(r.Carried) > 0 {
		fmt.Fprintf(&b, "\n  carried over: %s", strings.Join(r.Carried, ", "))
	}
	if len(r.Skipped) > 0 {
		fmt.Fprintf(&b, "\n  skipped: %s", strings.Join(r.Skipped, ", "))
	}
	if r.TOMLRemoved {
		fmt.Fprintf(&b, "\n  removed %s", r.TOMLPath)
	}
	for _, w := range r.Warnings {
		fmt.Fprintf(&b, "\n  warning: %s", w)
	}
	return b.String()
}
