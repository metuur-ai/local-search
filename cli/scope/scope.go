// Package scope resolves which registered repos a `find` query should hit.
//
// Resolution order (highest precedence first):
//  1. --scope CLI flag (comma-separated)
//  2. <cwd>/.agents/local-search-config.yaml, walking up (stops at a git root
//     and below $HOME)
//  3. ~/.local-search-config.yaml
//  4. CWD walk-up: nearest registered repo whose path is a prefix of cwd
//  5. Hard error — refuse to fan out across all repos by accident
//
// The error in case 5 is deliberate. Silently searching every registered repo
// turns local-search into a noisy global tool; users explicitly asked for the
// search to focus on the project they are working in.
//
// This package owns PRECEDENCE and the filtering of entries against the
// registered repo/graph sets. The file format, parsing, validation, writing,
// and migration all live in local-search/config, which the bundled Claude skill
// (`local-search init`) also uses — one file, one schema, both readers.
package scope

import (
	"errors"
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"local-search/config"
)

// ConfigFileName is the config's basename, at both locations.
const ConfigFileName = config.FileName

// GraphPrefix tags an external-graph entry inside the repositories list. An
// entry "graph:foyer-app-api" resolves to the external_graphs row named
// "foyer-app-api"; an unprefixed entry resolves to a registered repo.
//
// Two reasons for the prefix instead of overloading the name space:
//   - Avoids collisions when a user has both a registered repo and an
//     external graph with the same name.
//   - Makes the config self-documenting — the user reading the file can see at
//     a glance which entries are repos vs. graphs.
const GraphPrefix = "graph:"

// HasGraphPrefix reports whether s is a scope entry referring to an external
// graph (i.e. starts with "graph:"). The unprefixed name is the second return.
func HasGraphPrefix(s string) (string, bool) {
	if rest, ok := strings.CutPrefix(s, GraphPrefix); ok {
		return rest, true
	}
	return s, false
}

// Defaults, re-exported from local-search/config so callers keep a single
// import. config owns the values.
const (
	DefaultLimitSpecs     = config.DefaultLimitSpecs
	DefaultLimitGraphify  = config.DefaultLimitGraphify
	DefaultLimitCodeGraph = config.DefaultLimitCodeGraph
	DefaultBlastDepth     = config.DefaultBlastDepth
	DefaultBlastCap       = config.DefaultBlastCap

	DefaultWeightSpecs     = config.DefaultWeightSpecs
	DefaultWeightGraphify  = config.DefaultWeightGraphify
	DefaultWeightCodeGraph = config.DefaultWeightCodeGraph
)

// Weights and Limits are ALIASES (not new types) for the resolved views in
// local-search/config, so every existing consumer — find.go's seven call sites
// and main.go's composite literals — keeps compiling unchanged.
type (
	// Weights controls how much each source contributes to the final 0–1 score.
	Weights = config.EffectiveWeights
	// Limits controls per-source result caps and BFS bounds.
	Limits = config.EffectiveLimits
)

// Scope is the resolved set of repos a query should hit, plus the source of
// truth so the user can see where the scope came from.
type Scope struct {
	Repos   []string // repo names to search
	Source  string   // "--scope flag" | "<path>/.agents/local-search-config.yaml" | "~/.local-search-config.yaml" | "cwd-walk (<name>)" | ""
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

// ErrEmptyScope reports a config that parsed fine but lists no entries that
// resolve to a registered repo or graph.
//
// A sentinel rather than a message substring: callers (main.go's resolveScope)
// turn this into a friendly "here's your empty scope, here's how to fix it"
// banner instead of a hard exit, and the previous strings.Contains check broke
// the moment the wording changed.
var ErrEmptyScope = errors.New("config lists no registered repositories")

// emptyScopeError builds an ErrEmptyScope-wrapping error naming the file.
func emptyScopeError(path string, listed []string) error {
	return fmt.Errorf("%w: %s lists %v", ErrEmptyScope, path, listed)
}

// Resolve walks the precedence chain and returns the resolved Scope.
// Returns ErrNoScope when nothing can be resolved (cases 1–4 all fail).
//
// Each entry in the resolved Scope.Repos is validated against either the
// registered-repos list or the registered-external-graphs list (entries
// prefixed with "graph:" go to the latter). Unrecognized entries are dropped.
//
// A config that EXISTS but does not parse or validate is a hard error that
// stops the chain — it is never treated as "absent". Before v0.4.0 such a file
// silently fell through to the next rule, which also let the auto-init path
// overwrite a config the user was midway through editing.
func (r Resolver) Resolve() (Scope, error) {
	repoNames := repoNameSet(r.Repos)
	graphNames := stringSet(r.ExternalGraphs)

	// 1. CLI flag — explicit, always wins.
	if r.FlagValue != "" {
		s := Scope{
			Source:  "--scope flag",
			Repos:   parseScopeList(r.FlagValue),
			Weights: config.Defaults().Weights,
			Limits:  config.Defaults().Limits,
		}
		s.Repos = filterToRegistered(s.Repos, repoNames, graphNames)
		if len(s.Repos) == 0 {
			return Scope{}, fmt.Errorf("--scope %q matched no registered repos or graphs (see `local-search repo list` and `local-search graphs list`)", r.FlagValue)
		}
		return s, nil
	}

	// 2. Walk up from CWD looking for .agents/local-search-config.yaml.
	if r.CWD != "" {
		settings, err := config.FindProject(r.CWD, r.HomeDir)
		switch {
		case err == nil:
			return r.fromSettings(settings, repoNames, graphNames)
		case !config.IsNotExist(err):
			return Scope{}, err // broken config — stop, do not fall through
		}
	}

	// 3. Global config at ~/.local-search-config.yaml.
	if r.HomeDir != "" {
		settings, err := config.LoadGlobal(r.HomeDir)
		switch {
		case err == nil:
			return r.fromSettings(settings, repoNames, graphNames)
		case !config.IsNotExist(err):
			return Scope{}, err
		}
	}

	// 4. CWD walk-up: deepest registered repo whose path is a prefix of CWD.
	if r.CWD != "" {
		if name, ok := nearestRepoForCWD(r.CWD, r.Repos); ok {
			return Scope{
				Repos:   []string{name},
				Source:  "cwd-walk (" + name + ")",
				Weights: config.Defaults().Weights,
				Limits:  config.Defaults().Limits,
			}, nil
		}
	}

	return Scope{}, ErrNoScope
}

// fromSettings converts a loaded config into a filtered Scope.
func (r Resolver) fromSettings(s config.Settings, repoNames, graphNames map[string]bool) (Scope, error) {
	out := Scope{
		Repos:   filterToRegistered(append([]string(nil), s.Repositories...), repoNames, graphNames),
		Source:  s.Path,
		Weights: s.Weights,
		Limits:  s.Limits,
	}
	if len(out.Repos) == 0 {
		return Scope{}, emptyScopeError(s.Path, s.Repositories)
	}
	return out, nil
}

// FindProjectConfig reports the path of the project config that would be used
// from start, walking up. ok=false means no config exists anywhere on the path.
//
// Exported so callers (the auto-init flow in main.go) can check for an existing
// config without going through Resolve(), whose fallback chain would mask
// "no config" with a cwd-walk match.
//
// Note this only STATS — it does not parse. Callers deciding whether to create
// a config must not treat an unparseable file as absent, which is exactly the
// bug that let auto-init overwrite a user's broken config.
func FindProjectConfig(start, home string) (string, bool) {
	return config.FindProjectConfigPath(start, home)
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

// WriteProjectConfig sets the repository list in dir's project config,
// creating it if absent, and returns the path written.
//
// Unlike its pre-0.4.0 namesake this is NON-DESTRUCTIVE: any weights, limits,
// and comments already in the file survive. The old version emitted only the
// scope list, so every `scope set` silently wiped the user's tuning.
func WriteProjectConfig(dir string, repos []string) (string, error) {
	path := config.ProjectPath(dir)
	if err := config.SetRepositories(path, repos); err != nil {
		return "", err
	}
	return path, nil
}

// ClearProjectConfig empties the repository list in dir's project config,
// keeping the file (and its weights/limits) in place. Returns the path.
//
// Deleting the file would also discard the user's tuning now that there is one
// unified config, so `scope clear` empties rather than removes.
func ClearProjectConfig(dir string) (string, error) {
	return WriteProjectConfig(dir, nil)
}

// RemoveProjectConfig deletes dir's project config outright. Returns nil when
// the file is already absent. This is the `scope clear --delete` path.
func RemoveProjectConfig(dir string) error {
	return config.Remove(config.ProjectPath(dir))
}
