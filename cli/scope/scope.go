// Package scope resolves which registered repos a `find` query should hit.
//
// Resolution order (highest precedence first):
//  1. --scope CLI flag (comma-separated)
//  2. <cwd>/.local-search.toml, walking up to root
//  3. ~/.local-search/config.toml
//  4. CWD walk-up: nearest registered repo whose path is a prefix of cwd
//  5. Hard error — refuse to fan out across all repos by accident
//
// The error in case 5 is deliberate. Silently searching every registered repo
// turns local-search into a noisy global tool; users explicitly asked for the
// search to focus on the project they are working in.
package scope

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/BurntSushi/toml"
)

// ConfigFileName is the filename of the per-project config.
const ConfigFileName = ".local-search.toml"

// GlobalConfigRel is the path of the optional global config under $HOME.
const GlobalConfigRel = ".local-search/config.toml"

// GraphPrefix tags an external-graph entry inside the scope list. A scope
// entry "graph:foyer-app-api" resolves to the external_graphs row named
// "foyer-app-api"; an unprefixed entry resolves to a registered repo.
//
// Two reasons for the prefix instead of overloading the name space:
//   - Avoids collisions when a user has both a registered repo and an
//     external graph with the same name.
//   - Makes the .local-search.toml self-documenting — the user reading the
//     file can see at a glance which entries are repos vs. graphs.
const GraphPrefix = "graph:"

// HasGraphPrefix reports whether s is a scope entry referring to an external
// graph (i.e. starts with "graph:"). The unprefixed name is the second return.
func HasGraphPrefix(s string) (string, bool) {
	if rest, ok := strings.CutPrefix(s, GraphPrefix); ok {
		return rest, true
	}
	return s, false
}

// Defaults exposed for callers (e.g. main.go --limit) and reused by Resolve
// when fields are unset.
const (
	DefaultLimitSpecs    = 20
	DefaultLimitGraphify = 10
	DefaultLimitCodeGraph = 10
	DefaultBlastDepth    = 2
	DefaultBlastCap      = 50

	DefaultWeightSpecs    = 1.0
	DefaultWeightGraphify = 0.7
	DefaultWeightCodeGraph = 0.8
)

// Weights controls how each source contributes to the final 0–1 score.
// Higher weight = source contributes more.
type Weights struct {
	Specs     float64 `toml:"specs"`
	Graphify  float64 `toml:"graphify"`
	CodeGraph float64 `toml:"codegraph"`
}

// Limits controls per-source result caps and BFS bounds.
type Limits struct {
	Specs      int `toml:"specs"`
	Graphify   int `toml:"graphify"`
	CodeGraph  int `toml:"codegraph"`
	BlastDepth int `toml:"blast_depth"`
	BlastCap   int `toml:"blast_cap"`
}

// File mirrors the on-disk TOML structure.
type File struct {
	Scope   []string `toml:"scope"`
	Weights Weights  `toml:"weights"`
	Limits  Limits   `toml:"limits"`
}

// Scope is the resolved set of repos a query should hit, plus the source of
// truth so the user can see where the scope came from.
type Scope struct {
	Repos   []string // repo names to search
	Source  string   // "--scope flag" | "<path>/.local-search.toml" | "~/.local-search/config.toml" | "cwd-walk" | ""
	Weights Weights
	Limits  Limits
}

// Repo is the minimal info Resolve needs about a registered repo: its name
// and absolute path. db.RepoRow can be converted directly via FromRepoRow.
type Repo struct {
	Name string
	Path string
}

// Resolver wires the resolution inputs together. cwd, flagValue, the list of
// registered repos, and the list of registered external-graph names are
// passed in explicitly so tests can drive every branch without touching the
// real filesystem layout.
//
// ExternalGraphs holds just the names (no paths) — they're enough for scope
// validation. The find pipeline looks paths up separately when querying.
type Resolver struct {
	CWD            string
	FlagValue      string   // raw --scope value, "" when not passed
	Repos          []Repo   // all registered repos
	ExternalGraphs []string // names of registered external graphs
	HomeDir        string   // base for global config; "" disables it
}

// ErrNoScope is returned when no scope can be resolved by any path. Callers
// should turn this into a user-facing error suggesting how to fix it.
var ErrNoScope = errors.New("no scope configured")

// Resolve walks the precedence chain and returns the resolved Scope.
// Returns ErrNoScope when nothing can be resolved (cases 1–4 all fail).
//
// Each entry in the resolved Scope.Repos is validated against either the
// registered-repos list or the registered-external-graphs list (entries
// prefixed with "graph:" go to the latter). Unrecognized entries are dropped.
func (r Resolver) Resolve() (Scope, error) {
	repoNames := repoNameSet(r.Repos)
	graphNames := stringSet(r.ExternalGraphs)

	// 1. CLI flag — explicit, always wins.
	if r.FlagValue != "" {
		s := Scope{
			Source:  "--scope flag",
			Repos:   parseScopeList(r.FlagValue),
			Weights: defaultWeights(),
			Limits:  defaultLimits(),
		}
		s.Repos = filterToRegistered(s.Repos, repoNames, graphNames)
		if len(s.Repos) == 0 {
			return Scope{}, fmt.Errorf("--scope %q matched no registered repos or graphs (see `local-search repo list` and `local-search graphs list`)", r.FlagValue)
		}
		return s, nil
	}

	// 2. Walk up from CWD looking for .local-search.toml.
	if r.CWD != "" {
		if path, file, ok := findProjectConfig(r.CWD); ok {
			s := scopeFromFile(file)
			s.Source = path
			s.Repos = filterToRegistered(s.Repos, repoNames, graphNames)
			if len(s.Repos) == 0 {
				return Scope{}, fmt.Errorf("config %s lists scope %v but none are registered repos or graphs", path, file.Scope)
			}
			return s, nil
		}
	}

	// 3. Global config under $HOME.
	if r.HomeDir != "" {
		path := filepath.Join(r.HomeDir, GlobalConfigRel)
		if file, ok := readConfig(path); ok {
			s := scopeFromFile(file)
			s.Source = path
			s.Repos = filterToRegistered(s.Repos, repoNames, graphNames)
			if len(s.Repos) == 0 {
				return Scope{}, fmt.Errorf("global config %s lists scope %v but none are registered repos or graphs", path, file.Scope)
			}
			return s, nil
		}
	}

	// 4. CWD walk-up: deepest registered repo whose path is a prefix of CWD.
	if r.CWD != "" {
		if name, ok := nearestRepoForCWD(r.CWD, r.Repos); ok {
			return Scope{
				Repos:   []string{name},
				Source:  "cwd-walk (" + name + ")",
				Weights: defaultWeights(),
				Limits:  defaultLimits(),
			}, nil
		}
	}

	return Scope{}, ErrNoScope
}

// FindProjectConfig walks up from start looking for .local-search.toml.
// Returns the absolute path, parsed file, and ok=true when found.
//
// Exported so callers (e.g. the auto-init flow in main.go) can check whether
// a config already exists without going through Resolve(), which has its own
// fallback chain that would mask "no config" with walk-up matches.
func FindProjectConfig(start string) (string, File, bool) {
	return findProjectConfig(start)
}

// findProjectConfig is the internal implementation. Kept lowercase so the
// other call site (Resolve) reads identically to before.
func findProjectConfig(start string) (string, File, bool) {
	dir := start
	for {
		path := filepath.Join(dir, ConfigFileName)
		if file, ok := readConfig(path); ok {
			return path, file, true
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", File{}, false
		}
		dir = parent
	}
}

// readConfig reads and parses a TOML config file. Returns ok=false on any
// error (file missing, parse failure) so callers can fall through to the
// next precedence rule without distinguishing.
func readConfig(path string) (File, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return File{}, false
	}
	var f File
	if err := toml.Unmarshal(data, &f); err != nil {
		return File{}, false
	}
	return f, true
}

// scopeFromFile builds a Scope from a parsed File, applying defaults for any
// zero-valued fields. The Repos list is the file's scope verbatim — the
// caller filters it against the registered repo set.
func scopeFromFile(f File) Scope {
	w := f.Weights
	if w.Specs == 0 {
		w.Specs = DefaultWeightSpecs
	}
	if w.Graphify == 0 {
		w.Graphify = DefaultWeightGraphify
	}
	if w.CodeGraph == 0 {
		w.CodeGraph = DefaultWeightCodeGraph
	}

	l := f.Limits
	if l.Specs == 0 {
		l.Specs = DefaultLimitSpecs
	}
	if l.Graphify == 0 {
		l.Graphify = DefaultLimitGraphify
	}
	if l.CodeGraph == 0 {
		l.CodeGraph = DefaultLimitCodeGraph
	}
	if l.BlastDepth == 0 {
		l.BlastDepth = DefaultBlastDepth
	}
	if l.BlastCap == 0 {
		l.BlastCap = DefaultBlastCap
	}

	return Scope{
		Repos:   append([]string(nil), f.Scope...),
		Weights: w,
		Limits:  l,
	}
}

func defaultWeights() Weights {
	return Weights{
		Specs:     DefaultWeightSpecs,
		Graphify:  DefaultWeightGraphify,
		CodeGraph: DefaultWeightCodeGraph,
	}
}

func defaultLimits() Limits {
	return Limits{
		Specs:      DefaultLimitSpecs,
		Graphify:   DefaultLimitGraphify,
		CodeGraph:  DefaultLimitCodeGraph,
		BlastDepth: DefaultBlastDepth,
		BlastCap:   DefaultBlastCap,
	}
}

// parseScopeList splits a comma-separated --scope value, trimming whitespace
// and dropping empties.
func parseScopeList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// repoNameSet builds a quick-lookup set of registered repo names.
func repoNameSet(repos []Repo) map[string]bool {
	m := make(map[string]bool, len(repos))
	for _, r := range repos {
		m[r.Name] = true
	}
	return m
}

// filterToRegistered drops scope entries that don't resolve to anything
// registered. Order is preserved.
//
// Two kinds of entries are accepted:
//   - Plain names → kept when present in repos.
//   - "graph:<name>" entries → kept when <name> is present in graphs.
//
// The result may be empty — callers handle that as an error.
func filterToRegistered(names []string, repos, graphs map[string]bool) []string {
	out := names[:0]
	for _, n := range names {
		if rest, isGraph := HasGraphPrefix(n); isGraph {
			if graphs[rest] {
				out = append(out, n)
			}
			continue
		}
		if repos[n] {
			out = append(out, n)
		}
	}
	cp := make([]string, len(out))
	copy(cp, out)
	return cp
}

// stringSet builds a set from a slice for O(1) membership lookups.
func stringSet(s []string) map[string]bool {
	m := make(map[string]bool, len(s))
	for _, v := range s {
		m[v] = true
	}
	return m
}

// NearestRepoForCWD returns the name of the registered repo whose path is the
// longest prefix of cwd. Returns ok=false when no repo encloses cwd.
//
// Both cwd and repo paths are absolute-ized + slash-cleaned before comparison
// so /a/b/ and /a/b match correctly.
//
// Exported so callers (e.g. the auto-init-config flow in main.go) can pick a
// sensible default scope without going through Resolve(), which would error
// when no config file exists yet.
func NearestRepoForCWD(cwd string, repos []Repo) (string, bool) {
	return nearestRepoForCWD(cwd, repos)
}

// nearestRepoForCWD is the internal implementation. Kept lowercase so the
// package's other call sites (Resolve) read identically to before.
func nearestRepoForCWD(cwd string, repos []Repo) (string, bool) {
	cwd = cleanForPrefix(cwd)
	type cand struct {
		name string
		path string
	}
	var candidates []cand
	for _, r := range repos {
		rp := cleanForPrefix(r.Path)
		if rp == "" {
			continue
		}
		if cwd == rp || strings.HasPrefix(cwd, rp+string(filepath.Separator)) {
			candidates = append(candidates, cand{r.Name, rp})
		}
	}
	if len(candidates) == 0 {
		return "", false
	}
	// Longest path wins (deepest enclosing repo).
	sort.Slice(candidates, func(i, j int) bool {
		return len(candidates[i].path) > len(candidates[j].path)
	})
	return candidates[0].name, true
}

// cleanForPrefix returns a cleaned absolute path with no trailing separator.
// "" in returns "" out so the caller can skip silently.
func cleanForPrefix(p string) string {
	if p == "" {
		return ""
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		return ""
	}
	return filepath.Clean(abs)
}

// WriteProjectConfig writes a .local-search.toml at dir with the given scope
// list. Other fields stay unset so consumers see defaults. Existing files are
// overwritten.
func WriteProjectConfig(dir string, scopeList []string) (string, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, ConfigFileName)
	var b strings.Builder
	b.WriteString("# Repos this project searches. Names must match `local-search repo add <path> <NAME>`.\n")
	b.WriteString("scope = [")
	for i, s := range scopeList {
		if i > 0 {
			b.WriteString(", ")
		}
		fmt.Fprintf(&b, "%q", s)
	}
	b.WriteString("]\n")
	if err := os.WriteFile(path, []byte(b.String()), 0644); err != nil {
		return "", err
	}
	return path, nil
}

// RemoveProjectConfig deletes .local-search.toml at dir. Returns nil when the
// file is already absent.
func RemoveProjectConfig(dir string) error {
	path := filepath.Join(dir, ConfigFileName)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
