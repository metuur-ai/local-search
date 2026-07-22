package main

import (
	"fmt"

	"local-search/scope"
)

// scanMode selects how a scan invocation acts on the registered repos.
type scanMode int

const (
	// modeFullRebuild deletes the DB file and re-indexes every repo (`scan all`).
	modeFullRebuild scanMode = iota
	// modeSurgical re-indexes a single target repo without touching others.
	modeSurgical
)

// resolveScanTarget maps a scan invocation to a concrete mode + target list.
//
// It is pure: no DB or filesystem access. Enclosing-repo resolution for the
// no-argument case is delegated to scope.NearestRepoForCWD (deepest/longest
// enclosing path wins).
//
//	args == ["all"]                     -> (modeFullRebuild, all repos, nil)   [R-1.6]
//	args == ["<name>"] name known       -> (modeSurgical,   [named repo], nil) [R-1.4]
//	args == ["<name>"] name unknown     -> error "unknown repo <name>"         [R-1.5]
//	args == [] cwd inside one repo      -> (modeSurgical,   [that repo], nil)  [R-1.1]
//	args == [] cwd under several repos  -> deepest enclosing wins              [R-1.2]
//	args == [] cwd outside any repo     -> error "not inside a registered repo"[R-1.3]
//	len(repos) == 0                     -> error with "no repos added yet"     [R-1.8]
func resolveScanTarget(args []string, cwd string, repos []repoEntry) (scanMode, []repoEntry, error) {
	// R-1.8: no repos registered at all — existing guidance, resolve nothing.
	if len(repos) == 0 {
		return 0, nil, fmt.Errorf("no repos added yet. Run: local-search repo add /path/to/specs")
	}

	// Explicit target argument (`scan all` or `scan <name>`).
	if len(args) > 0 {
		target := args[0]
		if target == "all" {
			return modeFullRebuild, repos, nil // R-1.6
		}
		for _, r := range repos {
			if r.Name == target {
				return modeSurgical, []repoEntry{r}, nil // R-1.4
			}
		}
		return 0, nil, fmt.Errorf("unknown repo %s", target) // R-1.5
	}

	// No argument: resolve the repo enclosing the current working directory.
	scopeRepos := make([]scope.Repo, len(repos))
	for i, r := range repos {
		scopeRepos[i] = scope.Repo{Name: r.Name, Path: r.Path}
	}
	name, ok := scope.NearestRepoForCWD(cwd, scopeRepos) // R-1.1, R-1.2
	if !ok {
		// R-1.3: non-destructive default — caller must not mutate on this error.
		return 0, nil, fmt.Errorf("not inside a registered repo; cd into one or run 'scan all'")
	}
	for _, r := range repos {
		if r.Name == name {
			return modeSurgical, []repoEntry{r}, nil
		}
	}
	// NearestRepoForCWD returned a name not in repos — should be unreachable.
	return 0, nil, fmt.Errorf("not inside a registered repo; cd into one or run 'scan all'")
}
