package main

// local-search init | setup — manage the per-project search-scope file at
// <project>/.agent/local-search-config.yaml. This file declares which registered
// repositories the LocalSearch skill includes when searching from that project.
//
// The command is deliberately NON-interactive: it exposes scriptable primitives
// (--json to read state, --add/--remove/--set to mutate) that the LocalSearch
// skill drives conversationally. The Go search engine (scope package) is not
// changed — the skill reads this file and passes `--scope repo1,repo2` to
// `local-search search`/`find`.
//
// The on-disk schema is intentionally tiny (a single `repositories:` list), so
// it is read/written with a purpose-built minimal YAML helper rather than a new
// third-party dependency.

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	localdb "local-search/db"
	"local-search/scope"
)

const (
	agentDir          = ".agent"
	projectConfigName = "local-search-config.yaml"
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
	path := filepath.Join(abs, agentDir, projectConfigName)

	// Registered repos + external graphs define the set of valid scope entries.
	db := openDBForResolve()
	defer db.Close()
	repos, err := localdb.Repos(db)
	if err != nil {
		die(err.Error())
	}
	externals, _ := localdb.ExternalGraphs(db)
	valid := validNameSet(repos, externals)

	current, exists := readProjectConfig(path)
	mutated := false

	// --set replaces the whole list; --add/--remove adjust it. Validation dies
	// before any write, so a bad name never leaves a half-applied file.
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

	// `init` always leaves a real file behind (create-if-missing), so the user
	// ends up with something tangible to inspect and the skill can rely on it.
	if mutated || !exists {
		if err := writeProjectConfig(path, current); err != nil {
			die("cannot write " + path + ": " + err.Error())
		}
	}

	if jsonOut {
		printInitJSON(path, current, repos, valid)
		return
	}
	printInitHuman(path, current, repos)
}

// printInitJSON emits the machine-readable state the skill consumes.
func printInitJSON(path string, current []string, repos []localdb.RepoRow, valid map[string]bool) {
	st := initState{
		Path:         path,
		Exists:       true, // we always create-if-missing before reaching here
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
func printInitHuman(path string, current []string, repos []localdb.RepoRow) {
	fmt.Printf("Project scope config: %s\n\n", path)
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

// ── Config file I/O (minimal YAML for the `repositories:` list) ───────────────

// readProjectConfig reads the repositories list; ok=false when the file is absent.
func readProjectConfig(path string) ([]string, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, false
	}
	return parseProjectYAML(data), true
}

// writeProjectConfig writes the .agent/local-search-config.yaml, creating the
// .agent/ directory if needed. Existing files are overwritten.
func writeProjectConfig(path string, repos []string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, renderProjectYAML(repos), 0o644)
}

// parseProjectYAML extracts the `repositories:` string list from our own tiny
// schema. It tolerates block lists (`- name`), the empty inline form
// (`repositories: []`), a simple inline flow list (`repositories: [a, b]`),
// comments, and blank lines. It is not a general YAML parser — the file is
// tool-owned.
func parseProjectYAML(data []byte) []string {
	var repos []string
	inList := false
	for _, raw := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		if !inList {
			if trimmed == "repositories:" {
				inList = true
				continue
			}
			if rest, ok := strings.CutPrefix(trimmed, "repositories:"); ok {
				rest = strings.TrimSpace(rest)
				if strings.HasPrefix(rest, "[") && strings.HasSuffix(rest, "]") {
					inner := strings.TrimSuffix(strings.TrimPrefix(rest, "["), "]")
					for _, p := range strings.Split(inner, ",") {
						if v := unquote(strings.TrimSpace(p)); v != "" {
							repos = append(repos, v)
						}
					}
					return repos
				}
				inList = true // "repositories:" followed by a block list below
				continue
			}
			continue
		}
		// Inside the list: consume `- name` items; any other line ends the block.
		if item, ok := strings.CutPrefix(trimmed, "-"); ok {
			if v := unquote(strings.TrimSpace(item)); v != "" {
				repos = append(repos, v)
			}
			continue
		}
		break
	}
	return repos
}

// renderProjectYAML writes the header comment plus the repositories list.
func renderProjectYAML(repos []string) []byte {
	var b strings.Builder
	b.WriteString("# LocalSearch project scope — repositories searched when running from this project.\n")
	b.WriteString("# Names must match `local-search repo list`. Managed by `local-search init`.\n")
	if len(repos) == 0 {
		b.WriteString("repositories: []\n")
		return []byte(b.String())
	}
	b.WriteString("repositories:\n")
	for _, r := range repos {
		fmt.Fprintf(&b, "  - %s\n", r)
	}
	return []byte(b.String())
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

// unquote strips surrounding single/double quotes from a scalar.
func unquote(s string) string {
	if len(s) >= 2 {
		if (s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'') {
			return s[1 : len(s)-1]
		}
	}
	return s
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
