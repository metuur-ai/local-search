// Package config owns the on-disk LocalSearch configuration: one schema, one
// format (YAML), two locations.
//
//	<project>/.agents/local-search-config.yaml   project config (found by walking up)
//	~/.local-search-config.yaml                 global fallback
//
// Both the search engine (local-search/scope, driving `find`/`code`) and the
// bundled Claude skill (`local-search init`) read the SAME file and the SAME
// key. Before v0.4.0 there were three files across two formats with two
// parsers; migrate.go converts the legacy TOML.
//
// This package deliberately depends on nothing else in the module so that both
// callers can converge on it without inheriting each other's concerns. It has
// no opinion about what a repository *name* means — "graph:" prefix handling
// lives in local-search/scope.
package config

import "errors"

// ── Paths ─────────────────────────────────────────────────────────────────────

const (
	// FileName is the config's basename, identical at both locations.
	FileName = "local-search-config.yaml"

	// AgentDir is the per-project directory holding it: <project>/.agents/.
	AgentDir = ".agent"

	// GlobalRel is the global config relative to $HOME. Note it sits BESIDE
	// the ~/.local-search/ app dir (which holds specs.db and the repo
	// registry), not inside it — the config is user-editable, that dir is not.
	GlobalRel = ".local-search-config.yaml"

	// LegacyName / LegacyGlobalRel are the pre-0.4.0 TOML files. They are read
	// only by migrate.go and never written.
	LegacyName      = ".local-search.toml"
	LegacyGlobalRel = ".local-search/config.toml"

	// SupportedVersion is the highest schema version this binary understands.
	// An absent `version:` means 1; a higher one is a hard error so a future
	// format change fails loudly instead of being silently misread.
	SupportedVersion = 1
)

// ── Defaults ──────────────────────────────────────────────────────────────────

// Defaults applied when a field is absent. Unchanged from the pre-0.4.0 values
// so migration is behaviour-preserving.
const (
	DefaultLimitSpecs     = 20
	DefaultLimitGraphify  = 10
	DefaultLimitCodeGraph = 10
	DefaultBlastDepth     = 2
	DefaultBlastCap       = 50

	DefaultWeightSpecs     = 1.0
	DefaultWeightGraphify  = 0.7
	DefaultWeightCodeGraph = 0.8
)

// ── On-disk schema ────────────────────────────────────────────────────────────

// File is the on-disk schema. Every tunable is a POINTER so that "absent"
// (nil → take the default) is distinguishable from "explicitly zero" (non-nil,
// honour it).
//
// That distinction fixes two bugs at once:
//
//   - Pre-0.4.0 defaults were applied with `if x == 0 { x = Default }`, which
//     made 0 an unrepresentable value for every weight and limit. A user who
//     wrote `specs: 0` to disable a source silently got 1.0.
//   - Save can round-trip: a nil field was never in the file and must not be
//     injected into it.
type File struct {
	Version      *int     `yaml:"version,omitempty"`
	Repositories []string `yaml:"repositories"`
	Weights      *Weights `yaml:"weights,omitempty"`
	Limits       *Limits  `yaml:"limits,omitempty"`
}

// Weights controls how much each source contributes to the final 0–1 score.
type Weights struct {
	Specs     *float64 `yaml:"specs,omitempty"`
	Graphify  *float64 `yaml:"graphify,omitempty"`
	CodeGraph *float64 `yaml:"codegraph,omitempty"`
}

// Limits controls per-source result caps and BFS bounds.
type Limits struct {
	Specs      *int `yaml:"specs,omitempty"`
	Graphify   *int `yaml:"graphify,omitempty"`
	CodeGraph  *int `yaml:"codegraph,omitempty"`
	BlastDepth *int `yaml:"blast_depth,omitempty"`
	BlastCap   *int `yaml:"blast_cap,omitempty"`
}

// ── Resolved value view ───────────────────────────────────────────────────────

// EffectiveWeights is the defaults-applied view every consumer actually wants.
// local-search/scope aliases this as scope.Weights.
type EffectiveWeights struct {
	Specs     float64
	Graphify  float64
	CodeGraph float64
}

// EffectiveLimits is the defaults-applied view. Aliased as scope.Limits.
type EffectiveLimits struct {
	Specs      int
	Graphify   int
	CodeGraph  int
	BlastDepth int
	BlastCap   int
}

// Settings is a fully-resolved config: defaults folded in, source recorded.
type Settings struct {
	Version      int
	Repositories []string
	Weights      EffectiveWeights
	Limits       EffectiveLimits
	Path         string // file it came from; "" for Defaults()
}

// Defaults returns the settings used when no config file exists.
func Defaults() Settings {
	return Settings{
		Version: SupportedVersion,
		Weights: EffectiveWeights{
			Specs:     DefaultWeightSpecs,
			Graphify:  DefaultWeightGraphify,
			CodeGraph: DefaultWeightCodeGraph,
		},
		Limits: EffectiveLimits{
			Specs:      DefaultLimitSpecs,
			Graphify:   DefaultLimitGraphify,
			CodeGraph:  DefaultLimitCodeGraph,
			BlastDepth: DefaultBlastDepth,
			BlastCap:   DefaultBlastCap,
		},
	}
}

// Settings folds defaults into a parsed File. Note the deliberate absence of
// any `== 0` test: presence is carried by the pointer, never by the value, so
// an explicit 0 survives.
func (f File) Settings() Settings {
	s := Defaults()
	if f.Version != nil {
		s.Version = *f.Version
	}
	s.Repositories = append([]string(nil), f.Repositories...)

	if w := f.Weights; w != nil {
		setFloat(&s.Weights.Specs, w.Specs)
		setFloat(&s.Weights.Graphify, w.Graphify)
		setFloat(&s.Weights.CodeGraph, w.CodeGraph)
	}
	if l := f.Limits; l != nil {
		setInt(&s.Limits.Specs, l.Specs)
		setInt(&s.Limits.Graphify, l.Graphify)
		setInt(&s.Limits.CodeGraph, l.CodeGraph)
		setInt(&s.Limits.BlastDepth, l.BlastDepth)
		setInt(&s.Limits.BlastCap, l.BlastCap)
	}
	return s
}

func setFloat(dst *float64, src *float64) {
	if src != nil {
		*dst = *src
	}
}

func setInt(dst *int, src *int) {
	if src != nil {
		*dst = *src
	}
}

// ── Sentinel errors ───────────────────────────────────────────────────────────

// ErrVersionTooNew reports a config written by a newer local-search. It is the
// entire reason the `version:` key is read: without it, an old binary would
// silently misinterpret a future format instead of saying so.
var ErrVersionTooNew = errors.New("config version is newer than this local-search supports")

// Helpers for building File values in tests and in migration.
func Float(v float64) *float64 { return &v }
func Int(v int) *int           { return &v }
