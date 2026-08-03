package main

// local-search init | setup — manage the project config at
// <project>/.agents/local-search-config.yaml, which declares the repositories
// this project searches.
//
// Since v0.4.0 that file is THE config: the same file and the same
// `repositories:` key are read by the search engine (via local-search/scope)
// and by the bundled Claude skill. Parsing, validation, and writing live in
// local-search/config — this file owns only the CLI surface and the validation
// of names against the registered repo set.
//
// The command is deliberately NON-interactive: it exposes scriptable primitives
// (--json to read state, --add/--remove/--set to mutate) that the skill drives
// conversationally.

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"local-search/config"
	localdb "local-search/db"
	"local-search/scope"
)

// initRepo is one registered repo as reported in the --json `available` list.
type initRepo struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	SpecCount int    `json:"spec_count"`
}

// initState is the machine-readable state emitted by `init --json`. The skill
// branches on `exists`/`empty` and presents `available` for selection.
type initState struct {
	Path         string     `json:"path"`
	Exists       bool       `json:"exists"`
	Empty        bool       `json:"empty"`
	Repositories []string   `json:"repositories"`
	Available    []initRepo `json:"available"`
	Unknown      []string   `json:"unknown"` // configured entries not currently registered

	// Error carries a config-validation failure so `init --json` stays valid
	// JSON even when the config is broken. The web backend and the skill both
	// parse this stream; dying with plain text on stderr would leave them
	// guessing. Exit status is 1 when set.
	Error string `json:"error,omitempty"`
}

// cmdInit implements `local-search init` and its alias `setup`.
func cmdInit(args []string) {
	var (
		jsonOut  bool
		dir      string
		addList  []string
		remList  []string
		setList  []string
		setGiven bool
	)

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--json":
			jsonOut = true
		case "--dir":
			if i+1 >= len(args) {
				die("--dir needs a path")
			}
			dir = args[i+1]
			i++
		case "--add":
			if i+1 >= len(args) {
				die("--add needs a repo name (comma-separated)")
			}
			addList = append(addList, splitList(args[i+1])...)
			i++
		case "--remove", "--rm":
			if i+1 >= len(args) {
				die("--remove needs a repo name (comma-separated)")
			}
			remList = append(remList, splitList(args[i+1])...)
			i++
		case "--set":
			if i+1 >= len(args) {
				die(`--set needs repo names (comma-separated, or "" to clear)`)
			}
			setList = splitList(args[i+1])
			setGiven = true
			i++
		default:
			die("unknown flag for init: " + args[i] +
				"\nUsage: local-search init [--json] [--dir <path>] [--add a,b] [--remove a,b] [--set a,b]")
		}
	}

	if dir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			die("cannot determine current directory: " + err.Error())
		}
		dir = cwd
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		die("cannot resolve dir: " + err.Error())
	}
	// --dir and every write are EXACT-PATH, always. Walk-up applies only to
	// resolution reads (scope.Resolve). If writes walked up, `init --dir
	// packages/api --add x` would mutate the monorepo root instead of the
	// subdirectory the user named.
	path := config.ProjectPath(abs)

	// Registered repos + external graphs define the set of valid entries.
	db := openDBForResolve()
	defer db.Close()
	repos, err := localdb.Repos(db)
	if err != nil {
		die(err.Error())
	}
	externals, _ := localdb.ExternalGraphs(db)
	valid := validNameSet(repos, externals)

	existing, loadErr := config.LoadFile(path)
	exists := loadErr == nil
	switch {
	case loadErr == nil, config.IsNotExist(loadErr):
		// fine: present-and-valid, or absent
	default:
		// Present but broken. Report it rather than silently overwriting the
		// file the user is mid-edit — that overwrite was a real pre-0.4.0 bug.
		if jsonOut {
			emitInitJSONError(path, loadErr)
			return
		}
		die(loadErr.Error())
	}

	current := append([]string(nil), existing.Repositories...)
	mutated := false

	// --set replaces the whole list; --add/--remove adjust it. Order is fixed
	// (set → add → remove) regardless of flag order. Validation dies before any
	// write, so a bad name never leaves a half-applied file.
	if setGiven {
		current = dedupe(validateNames(setList, valid))
		mutated = true
	}
	if len(addList) > 0 {
		current = dedupe(append(current, validateNames(addList, valid)...))
		mutated = true
	}
	if len(remList) > 0 {
		current = removeNames(current, remList)
		mutated = true
	}

	// Only an explicit mutation writes. `init` and `init --json` are pure
	// READS as of v0.4.0.
	//
	// The old create-if-missing was how a stray config ended up shipped in
	// every release bundle (the web server runs `init --json` from its own
	// cwd), and — now that resolution walks up — one such run from $HOME would
	// have captured the scope of every project on the machine.
	if mutated {
		if err := config.SetRepositories(path, current); err != nil {
			if jsonOut {
				emitInitJSONError(path, err)
				return
			}
			die("cannot write " + path + ": " + err.Error())
		}
		exists = true
	}

	if jsonOut {
		printInitJSON(path, current, exists, repos, valid)
		return
	}
	printInitHuman(path, current, exists, repos)
}

// emitInitJSONError keeps `init --json` emitting valid JSON on failure, so the
// skill and the web backend can surface the problem instead of guessing.
func emitInitJSONError(path string, err error) {
	st := initState{
		Path:         path,
		Repositories: []string{},
		Available:    []initRepo{},
		Unknown:      []string{},
		Error:        err.Error(),
	}
	b, _ := json.MarshalIndent(st, "", "  ")
	fmt.Println(string(b))
	os.Exit(1)
}

// printInitJSON emits the machine-readable state the skill consumes.
func printInitJSON(path string, current []string, exists bool, repos []localdb.RepoRow, valid map[string]bool) {
	st := initState{
		Path:         path,
		Exists:       exists, // truthful now that reads no longer create the file
		Empty:        len(current) == 0,
		Repositories: current,
		Unknown:      unknownEntries(current, valid),
	}
	for _, r := range repos {
		st.Available = append(st.Available, initRepo{Name: r.Name, Path: r.Path, SpecCount: r.Count})
	}
	if st.Repositories == nil {
		st.Repositories = []string{}
	}
	if st.Available == nil {
		st.Available = []initRepo{}
	}
	if st.Unknown == nil {
		st.Unknown = []string{}
	}
	b, _ := json.MarshalIndent(st, "", "  ")
	fmt.Println(string(b))
}

// printInitHuman prints a readable summary of the current scope + what's available.
func printInitHuman(path string, current []string, exists bool, repos []localdb.RepoRow) {
	fmt.Printf("Project config: %s\n", path)
	if !exists {
		fmt.Println("(not created yet — run with --set/--add to create it)")
	}
	fmt.Println()
	if len(current) == 0 {
		fmt.Println("Included repositories: (none yet)")
	} else {
		fmt.Println("Included repositories:")
		for _, r := range current {
			fmt.Printf("  - %s\n", r)
		}
	}
	fmt.Println()
	fmt.Println("Available repositories (local-search repo list):")
	if len(repos) == 0 {
		fmt.Println("  (none registered — run `local-search repo add <path> <name>`)")
	} else {
		for _, r := range repos {
			fmt.Printf("  - %-24s %d specs\n", r.Name, r.Count)
		}
	}
	fmt.Println()
	fmt.Println("Edit with: local-search init --add <a,b> | --remove <a> | --set <a,b>")
}

// ── Small helpers ─────────────────────────────────────────────────────────────

// validNameSet is the set of accepted scope entries: registered repo names, plus
// "graph:"-prefixed external-graph names (mirrors scope.filterToRegistered).
func validNameSet(repos []localdb.RepoRow, externals []localdb.ExternalGraphRow) map[string]bool {
	m := make(map[string]bool, len(repos)+len(externals))
	for _, r := range repos {
		m[r.Name] = true
	}
	for _, e := range externals {
		m[scope.GraphPrefix+e.Name] = true
	}
	return m
}

// validateNames keeps entries present in `valid`, in order; dies (before any
// write) listing the valid names if any entry is unknown.
func validateNames(names []string, valid map[string]bool) []string {
	var out, bad []string
	for _, n := range names {
		n = strings.TrimSpace(n)
		if n == "" {
			continue
		}
		if valid[n] {
			out = append(out, n)
			continue
		}
		bad = append(bad, n)
	}
	if len(bad) > 0 {
		die("unknown repo(s): " + strings.Join(bad, ", ") +
			"\nValid entries: " + strings.Join(sortedKeys(valid), ", ") +
			"\n(See `local-search repo list` and `local-search graphs list`.)")
	}
	return out
}

// removeNames returns current with every entry in rem dropped.
func removeNames(current, rem []string) []string {
	drop := make(map[string]bool, len(rem))
	for _, n := range rem {
		drop[strings.TrimSpace(n)] = true
	}
	out := current[:0]
	for _, n := range current {
		if !drop[n] {
			out = append(out, n)
		}
	}
	cp := make([]string, len(out))
	copy(cp, out)
	return cp
}

// unknownEntries lists configured entries that are not currently valid.
func unknownEntries(current []string, valid map[string]bool) []string {
	var out []string
	for _, n := range current {
		if !valid[n] {
			out = append(out, n)
		}
	}
	return out
}

// dedupe preserves first-seen order and drops duplicates/empties.
func dedupe(in []string) []string {
	seen := make(map[string]bool, len(in))
	var out []string
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

// splitList splits a comma-separated flag value, trimming and dropping empties.
func splitList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// sortedKeys returns the map keys sorted, for stable user-facing messages.
func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
