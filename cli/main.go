// local-search — multi-repo spec registry with full-text search.
// Single Go binary replacement for the bash local-search.sh script.
package main

import (
	"bufio"
	"database/sql"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"local-search/codegraph"
	localdb "local-search/db"
	"local-search/extract"
	"local-search/find"
	"local-search/git"
	"local-search/graph"
	"local-search/scope"
)

// ── Config ────────────────────────────────────────────────────────────────────

const Version = "0.3.4"

var (
	appDir    = filepath.Join(homeDir(), ".local-search")
	reposFile = filepath.Join(appDir, "repos")
	dbFile    = filepath.Join(appDir, "specs.db")
)

func homeDir() string {
	if h, err := os.UserHomeDir(); err == nil {
		return h
	}
	return "."
}

// ── Entry point ───────────────────────────────────────────────────────────────

func main() {
	if len(os.Args) < 2 {
		cmdHelp()
		return
	}

	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "repo", "repos":
		cmdRepo(args)
	case "graphs":
		cmdGraphs(args)
	case "graph", "vgraph":
		cmdVectorGraph(args)
	case "scan", "rebuild", "index":
		// `rebuild`/`index` are exact aliases of `scan`; all pass identical raw
		// args so target resolution is uniform (R-1.7).
		cmdScan(args)
	case "search", "s":
		cmdSearch(args)
	case "find", "f":
		cmdFind(args)
	case "code":
		cmdCode(args)
	case "scope":
		cmdScope(args)
	case "ui":
		cmdUI(args)
	case "read", "r", "get", "show":
		cmdRead(args)
	case "list", "ls":
		cmdList(args)
	case "projects", "p":
		cmdProjects()
	case "related", "rel":
		cmdRelated(args)
	case "recent":
		cmdRecent(args)
	case "tags", "t":
		cmdTags(args)
	case "stats":
		cmdStats()
	case "db":
		fmt.Println(dbFile)
	case "inspect", "dump", "debug":
		cmdInspect()
	case "json", "j":
		cmdJSON(args)
	case "reset":
		cmdReset()
	case "init", "setup":
		// Manage the per-project search-scope file (.agent/local-search-config.yaml).
		// `setup` is an exact alias.
		cmdInit(args)
	case "install-skill":
		cmdInstallSkill(args)
	case "scan-hooks":
		cmdScanHooks(args)
	case "scan-hook-run":
		// Internal (undocumented) trigger entry the generated git hooks / shell
		// snippet invoke: change-gated, per-repo-locked, surgical single-repo scan.
		cmdScanHookRun(args)
	case "-v", "--version":
		fmt.Println("local-search version " + Version)
		return
	case "help", "--help", "-h":
		cmdHelp()
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", cmd)
		cmdHelp()
		os.Exit(1)
	}
}

// ── Repo management ───────────────────────────────────────────────────────────

func cmdRepo(args []string) {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "Usage: local-search repo <add|remove|list>")
		os.Exit(1)
	}
	sub := args[0]
	rest := args[1:]
	switch sub {
	case "add":
		repoAdd(rest)
	case "remove", "rm":
		repoRemove(rest)
	case "list", "ls":
		repoList()
	default:
		fmt.Fprintf(os.Stderr, "Usage: local-search repo <add|remove|list>\n")
		os.Exit(1)
	}
}

func repoAdd(args []string) {
	dirArg, nameArg, skipDirs, err := parseRepoAddArgs(args)
	if err != nil {
		die(err.Error())
	}

	dir, err := filepath.Abs(dirArg)
	if err != nil {
		die("Cannot resolve path: " + dirArg)
	}
	if _, err := os.Stat(dir); err != nil {
		die("Directory not found: " + dir)
	}

	name := filepath.Base(dir)
	if nameArg != "" {
		name = nameArg
	}

	if err := os.MkdirAll(appDir, 0755); err != nil {
		die(err.Error())
	}

	// Check duplicate
	if repos := loadRepos(); repoExists(repos, name, dir) {
		die(fmt.Sprintf("Repo %q already registered", name))
	}

	// R-3.1: stamp the registration time; it flows through formatRepoEntryLine's
	// 4th positional field when saveRepos persists the repos file below.
	newEntry := repoEntry{
		Name:            name,
		Path:            dir,
		SkipDirectories: skipDirs,
		AddedAt:         time.Now().UTC().Format(time.RFC3339),
	}
	repos := loadRepos()
	repos = append(repos, newEntry)
	saveRepos(repos)

	fmt.Printf("Added repo %q (%s)\n", name, dir)
	if len(skipDirs) > 0 {
		fmt.Printf("Skipping directories by name: %s\n", strings.Join(skipDirs, ", "))
	}
	// Surface the folders the scan will skip by default because .gitignore /
	// .graphifyignore already exclude them (applied at scan time, not persisted).
	// Show only names that are real top-level directories here, so harmless
	// file-pattern entries (.env, .DS_Store) don't read as "directories".
	if shown := ignoredDirsForDisplay(dir); len(shown) > 0 {
		fmt.Printf("Ignoring directories from .gitignore/.graphifyignore: %s\n", strings.Join(shown, ", "))
	}
	fmt.Println("Scanning…")
	// R-6.3: surgically index ONLY the newly added repo — no DB deletion and no
	// re-scan of the other registered repos.
	scanSurgical([]repoEntry{newEntry})
}

func parseRepoAddArgs(args []string) (dir, name string, skipDirs []string, err error) {
	if len(args) == 0 {
		return "", "", nil, fmt.Errorf("Usage: local-search repo add <folder> [name] [--skip-directory <folder-name>]...")
	}

	var positional []string
	for i := 0; i < len(args); i++ {
		a := args[i]
		switch {
		case a == "--skip-directory":
			if i+1 >= len(args) {
				return "", "", nil, fmt.Errorf("--skip-directory requires a folder name")
			}
			i++
			skipDirs = append(skipDirs, args[i])
		case strings.HasPrefix(a, "--skip-directory="):
			skipDirs = append(skipDirs, strings.TrimPrefix(a, "--skip-directory="))
		case strings.HasPrefix(a, "-"):
			return "", "", nil, fmt.Errorf("unknown flag: %s", a)
		default:
			positional = append(positional, a)
		}
	}

	if len(positional) == 0 {
		return "", "", nil, fmt.Errorf("Usage: local-search repo add <folder> [name] [--skip-directory <folder-name>]...")
	}
	if len(positional) > 2 {
		return "", "", nil, fmt.Errorf("Usage: local-search repo add <folder> [name] [--skip-directory <folder-name>]...")
	}

	normalized, err := normalizeSkipDirectoryNames(skipDirs)
	if err != nil {
		return "", "", nil, err
	}

	dir = positional[0]
	if len(positional) == 2 {
		name = positional[1]
	}
	return dir, name, normalized, nil
}

func normalizeSkipDirectoryNames(values []string) ([]string, error) {
	seen := make(map[string]bool)
	out := make([]string, 0, len(values))
	for _, raw := range values {
		v := strings.TrimSpace(raw)
		if v == "" {
			return nil, fmt.Errorf("--skip-directory requires a non-empty folder name")
		}
		if v == "." || v == ".." {
			return nil, fmt.Errorf("invalid --skip-directory value %q: use a folder name", v)
		}
		if strings.Contains(v, "/") || strings.Contains(v, "\\") {
			return nil, fmt.Errorf("invalid --skip-directory value %q: expected folder name, not path", v)
		}
		if strings.Contains(v, "|") || strings.Contains(v, ",") {
			return nil, fmt.Errorf("invalid --skip-directory value %q: characters '|' and ',' are not allowed", v)
		}
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	sort.Strings(out)
	return out, nil
}

// ignoreFileNames are the repo-root ignore files whose directory patterns are
// honored as default scan skips, so a repo is indexed with the same folders git
// and graphify already exclude — without the user re-declaring them.
var ignoreFileNames = []string{".gitignore", ".graphifyignore"}

// deriveIgnoredDirs reads the repo-root ignore files and returns the directory
// names they imply, reduced to basenames the scan skip mechanism can match
// (shouldSkipDir matches a directory's base name at any depth). Missing or
// unreadable ignore files contribute nothing. The result is unnormalized and
// may contain duplicates — callers pass it through normalizeSkipDirectoryNames.
func deriveIgnoredDirs(repoPath string) []string {
	var out []string
	for _, name := range ignoreFileNames {
		data, err := os.ReadFile(filepath.Join(repoPath, name))
		if err != nil {
			continue
		}
		for _, raw := range strings.Split(string(data), "\n") {
			if d, _, ok := ignoreLineToSkipDir(raw); ok {
				out = append(out, d)
			}
		}
	}
	return out
}

// ignoreLineToSkipDir maps one gitignore-style line to a single directory name
// for basename skip-matching, or ("", false) when the line can't be represented
// that way. The skip mechanism matches one directory name at any depth — not
// globs, not anchored paths — so we only honor:
//   - explicit directory patterns:  node_modules/  build/  .venv/
//   - bare match-anywhere names:     node_modules   target   vendor
//
// and reject comments, negations, globs (*.exe), multi-segment paths
// (web/frontend/dist), and root-anchored bare entries (/local-search) that may
// be files and would over-skip same-named directories elsewhere.
//
// explicitDir reports whether the pattern was written as an unambiguous
// directory (a trailing-slash `dir/`), which callers use to distinguish it from
// a bare name (`node_modules`) that may actually denote a file.
func ignoreLineToSkipDir(raw string) (name string, explicitDir bool, ok bool) {
	line := strings.TrimSpace(raw)
	if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "!") {
		return "", false, false
	}
	// This repo's own .gitignore uses (non-standard) trailing "# comments"; take
	// the first whitespace-delimited field so `dist/   # note` yields `dist`.
	if i := strings.IndexAny(line, " \t"); i >= 0 {
		line = line[:i]
	}
	anchored := strings.HasPrefix(line, "/")
	isDir := strings.HasSuffix(line, "/")
	line = strings.TrimPrefix(line, "/")
	line = strings.TrimSuffix(line, "/")
	if line == "" || line == "." || line == ".." {
		return "", false, false
	}
	// A remaining separator means a path (web/frontend/dist), not a bare name.
	if strings.ContainsAny(line, "/\\") {
		return "", false, false
	}
	// Glob/alternation can't be expressed as a single directory name.
	if strings.ContainsAny(line, "*?[]|,") {
		return "", false, false
	}
	// A root-anchored bare entry (`/local-search`) targets one specific root
	// entry that may be a file; skipping that name everywhere would over-skip.
	if anchored && !isDir {
		return "", false, false
	}
	return line, isDir, true
}

// effectiveSkipDirs merges a repo's explicitly configured skip directories with
// those derived from its ignore files at scan time. Computing this per scan
// (rather than persisting it at `repo add`) means edits to .gitignore /
// .graphifyignore take effect on the next scan, and repos registered before this
// behavior existed gain it automatically. Ignore-file parsing must never fail a
// scan, so a normalization error falls back to the explicit list.
// ignoredDirsForDisplay returns the ignore-file-derived skip names worth showing
// in the `repo add` message, sorted and deduped. The scan-time skip set
// (effectiveSkipDirs) still matches every derived name at any depth; this is
// purely cosmetic — it keeps no-op file patterns (`.env`, `.DS_Store`) out of a
// message that calls them "directories" by including a bare name only when a
// same-named folder actually exists at the repo root. Explicit `dir/` patterns
// are always shown: the user wrote them as directories, and they may live nested
// (e.g. a monorepo's `node_modules/` under a subpackage).
func ignoredDirsForDisplay(repoPath string) []string {
	rootDirs := make(map[string]bool)
	if entries, err := os.ReadDir(repoPath); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				rootDirs[e.Name()] = true
			}
		}
	}
	seen := make(map[string]bool)
	var show []string
	for _, name := range ignoreFileNames {
		data, err := os.ReadFile(filepath.Join(repoPath, name))
		if err != nil {
			continue
		}
		for _, raw := range strings.Split(string(data), "\n") {
			d, explicitDir, ok := ignoreLineToSkipDir(raw)
			if !ok || seen[d] {
				continue
			}
			if explicitDir || rootDirs[d] {
				seen[d] = true
				show = append(show, d)
			}
		}
	}
	sort.Strings(show)
	return show
}

func effectiveSkipDirs(r repoEntry) []string {
	derived := deriveIgnoredDirs(r.Path)
	if len(derived) == 0 {
		return r.SkipDirectories
	}
	merged := make([]string, 0, len(r.SkipDirectories)+len(derived))
	merged = append(merged, r.SkipDirectories...)
	merged = append(merged, derived...)
	norm, err := normalizeSkipDirectoryNames(merged)
	if err != nil {
		return r.SkipDirectories
	}
	return norm
}

func repoRemove(args []string) {
	if len(args) == 0 {
		die("Usage: local-search repo remove <name>")
	}
	name := args[0]
	repos := loadRepos()
	var found bool
	var kept []repoEntry
	for _, r := range repos {
		if r.Name == name {
			found = true
		} else {
			kept = append(kept, r)
		}
	}
	if !found {
		die(fmt.Sprintf("Repo %q not found", name))
	}
	saveRepos(kept)
	fmt.Printf("Removed repo %q\n", name)

	if len(kept) == 0 {
		os.Remove(dbFile)
		fmt.Println("No repos left. Index deleted.")
		return
	}

	// R-6.4: surgically delete only this repo's rows. Best-effort — if the DB
	// file is absent there is nothing to purge, so we just return. No DB-file
	// deletion and no re-scan of the other repos.
	if _, err := os.Stat(dbFile); err == nil {
		db := openDB()
		defer db.Close()
		if err := localdb.DeleteRepo(db, name); err != nil {
			fmt.Fprintf(os.Stderr, "warning: %v\n", err)
		}
	}
}

func repoList() {
	repos := loadRepos()
	if len(repos) == 0 {
		fmt.Println("No repos registered. Use: local-search repo add /path/to/specs")
		return
	}
	// R-4.4: open the DB best-effort/read-only. If it is absent we skip opening
	// entirely (so a plain list never recreates it); if it is present but fails
	// to open we fall back to a nil handle. Either way DB-derived columns render
	// as "—" and we still list name/path/added, exiting zero.
	var db *sql.DB
	if _, err := os.Stat(dbFile); err == nil {
		if d, err := localdb.Open(dbFile); err == nil {
			db = d
			defer db.Close()
		}
	}
	fmt.Print(formatRepoList(repos, db))
}

// formatRepoList renders the columnar `repo list` table (R-4.1). db may be nil
// (absent/unreadable); in that case every DB-derived column (last-scan,
// last-update, commit) renders as "—" (R-4.4). Timestamps are shown as
// human-relative ages via humanAge (R-4.3); missing values as "—" (R-4.2).
func formatRepoList(repos []repoEntry, db *sql.DB) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%-20s  %-10s  %-11s  %-11s  %-8s  %s\n",
		"NAME", "ADDED", "LAST SCAN", "LAST UPDATE", "COMMIT", "PATH")
	for _, r := range repos {
		lastScan, lastUpdate, commit := "—", "—", "—"
		if db != nil {
			lastScan = ageOrDash(localdb.GetMeta(db, "last_scan_"+r.Name))
			lastUpdate = ageOrDash(localdb.GetMeta(db, "last_index_update_"+r.Name))
			commit = shortCommitOrDash(localdb.GetMeta(db, "git_commit_"+r.Name))
		}
		fmt.Fprintf(&b, "%-20s  %-10s  %-11s  %-11s  %-8s  %s\n",
			r.Name, ageOrDash(r.AddedAt), lastScan, lastUpdate, commit, r.Path)
	}
	return b.String()
}

// ageOrDash parses an RFC3339 timestamp and renders it as a human-relative age;
// empty or unparseable input renders as "—" (R-4.2/4.3/3.6).
func ageOrDash(rfc3339 string) string {
	if rfc3339 == "" {
		return "—"
	}
	t, err := time.Parse(time.RFC3339, rfc3339)
	if err != nil {
		return "—"
	}
	return humanAge(time.Now().Unix() - t.Unix())
}

// shortCommitOrDash renders a commit hash in short 7-char form; empty renders
// as "—" (R-4.2/4.3).
func shortCommitOrDash(commit string) string {
	if commit == "" {
		return "—"
	}
	if len(commit) >= 7 {
		return commit[:7]
	}
	return commit
}

// ── Graphs (graphify integration) ─────────────────────────────────────────────

func cmdGraphs(args []string) {
	if len(args) == 0 {
		graphsList()
		return
	}
	switch args[0] {
	case "list", "ls":
		graphsList()
	case "add":
		graphsAdd(args[1:])
	case "remove", "rm":
		graphsRemove(args[1:])
	case "prune":
		graphsPrune()
	default:
		fmt.Fprintln(os.Stderr, "Usage: local-search graphs [list|add|remove|prune]")
		os.Exit(1)
	}
}

func graphsList() {
	db := ensureDB()
	defer db.Close()

	repos, err := localdb.Repos(db)
	if err != nil {
		die(err.Error())
	}
	externals, err := localdb.ExternalGraphs(db)
	if err != nil {
		die(err.Error())
	}

	now := time.Now().Unix()
	fmt.Printf("%-22s  %-18s  %7s  %s\n", "REPO", "KIND", "NODES", "AGE")
	enabled := 0
	for _, r := range repos {
		// Print one line per kind present on this repo.
		if r.GraphPath != "" {
			fmt.Printf("%-22s  %-18s  %7d  %s\n", r.Name, "graphify",
				r.GraphNodeCount, humanAge(now-r.GraphMTime))
			enabled++
		}
		if r.CodeGraphPath != "" {
			fmt.Printf("%-22s  %-18s  %7d  %s\n", r.Name, "code-review-graph",
				r.CodeGraphNodeCount, humanAge(now-r.CodeGraphMTime))
			enabled++
		}
		if r.GraphPath == "" && r.CodeGraphPath == "" {
			fmt.Printf("%-22s  %-18s  %7s  %s\n", r.Name, "—", "—", "—")
		}
	}

	if len(externals) > 0 {
		fmt.Println()
		fmt.Println("External graphs:")
		fmt.Printf("%-22s  %-18s  %7s  %s\n", "NAME", "KIND", "NODES", "AGE")
		for _, e := range externals {
			age := "—"
			if e.GraphMTime > 0 {
				age = humanAge(now - e.GraphMTime)
			}
			fmt.Printf("%-22s  %-18s  %7d  %s\n", e.Name, e.Kind, e.NodeCount, age)
		}
	}

	if enabled == 0 && len(externals) == 0 {
		fmt.Println()
		if !graph.BinaryAvailable() {
			fmt.Println("Tip: no graphify or code-review-graph artifacts detected.")
			fmt.Println("  graphify:          run `graphify .` in a registered repo")
			fmt.Println("  code-review-graph: run `code-review-graph build` in a registered repo")
			fmt.Println("Then re-run `local-search scan`.")
		} else {
			fmt.Println("No graphify-out/graph.json or .code-review-graph/graph.sqlite found in any registered repo.")
			fmt.Println("Run `graphify .` or `code-review-graph build` in a repo, then `local-search scan`.")
		}
	}
}

func graphsAdd(args []string) {
	// Parse out an optional --kind flag from anywhere in args.
	var rest []string
	kindOverride := ""
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--kind":
			if i+1 >= len(args) {
				die("--kind needs a value (graphify | code-review-graph)")
			}
			kindOverride = args[i+1]
			i++
		default:
			rest = append(rest, args[i])
		}
	}
	if len(rest) < 2 {
		die("Usage: local-search graphs add <name> <path> [--kind graphify|code-review-graph]")
	}
	name := rest[0]
	abs, err := filepath.Abs(rest[1])
	if err != nil {
		die("Cannot resolve path: " + rest[1])
	}
	st, err := os.Stat(abs)
	if err != nil || st.IsDir() {
		die("Graph file not found: " + abs)
	}

	kind := detectGraphKind(abs, kindOverride)

	db := ensureDB()
	defer db.Close()

	switch kind {
	case localdb.GraphKindCodeReviewGraph:
		mtime := st.ModTime().Unix()
		nodes := codegraph.CountNodes(abs)
		if err := localdb.AddExternalGraph(db, name, abs, mtime, nodes, localdb.GraphKindCodeReviewGraph); err != nil {
			die("Cannot add external graph: " + err.Error())
		}
		fmt.Printf("Added external code-review-graph %q  (%d nodes)\n", name, nodes)

	default: // graphify (or unknown → default)
		info := graph.Info{Path: abs, MTime: st.ModTime().Unix()}
		if parent := filepath.Dir(filepath.Dir(abs)); filepath.Base(filepath.Dir(abs)) == "graphify-out" {
			info = graph.Detect(parent)
			if info.Path == "" {
				info = graph.Info{Path: abs, MTime: st.ModTime().Unix()}
			}
		}
		if info.NodeCount == 0 {
			info = graph.Info{Path: abs, MTime: st.ModTime().Unix(), NodeCount: graph.CountNodes(abs)}
		}
		if err := localdb.AddExternalGraph(db, name, abs, info.MTime, info.NodeCount, localdb.GraphKindGraphify); err != nil {
			die("Cannot add external graph: " + err.Error())
		}
		fmt.Printf("Added external graph %q  (%d nodes)\n", name, info.NodeCount)
	}
}

// detectGraphKind chooses between graphify and code-review-graph for the file
// at path. An explicit override (from --kind) always wins. Otherwise the
// extension is the primary signal; for SQLite extensions we additionally
// verify the schema looks like code-review-graph.
func detectGraphKind(path, override string) string {
	switch override {
	case localdb.GraphKindGraphify, localdb.GraphKindCodeReviewGraph:
		return override
	case "":
		// fall through
	default:
		die("--kind must be 'graphify' or 'code-review-graph', got: " + override)
	}
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".json":
		return localdb.GraphKindGraphify
	case ".sqlite", ".db":
		if codegraph.LooksLikeCodeReviewGraph(path) {
			return localdb.GraphKindCodeReviewGraph
		}
		return localdb.GraphKindGraphify
	}
	// Unknown extension: probe content.
	if codegraph.LooksLikeCodeReviewGraph(path) {
		return localdb.GraphKindCodeReviewGraph
	}
	return localdb.GraphKindGraphify
}

func graphsRemove(args []string) {
	if len(args) == 0 {
		die("Usage: local-search graphs remove <name>")
	}
	db := ensureDB()
	defer db.Close()

	if err := localdb.RemoveExternalGraph(db, args[0]); err != nil {
		if err == sql.ErrNoRows {
			die(fmt.Sprintf("External graph %q not found", args[0]))
		}
		die(err.Error())
	}
	fmt.Printf("Removed external graph %q\n", args[0])
}

func graphsPrune() {
	db := ensureDB()
	defer db.Close()

	externals, err := localdb.ExternalGraphs(db)
	if err != nil {
		die(err.Error())
	}
	pruned := 0
	for _, e := range externals {
		if _, err := os.Stat(e.GraphPath); os.IsNotExist(err) {
			if err := localdb.RemoveExternalGraph(db, e.Name); err == nil {
				fmt.Printf("Pruned %q (file no longer exists: %s)\n", e.Name, e.GraphPath)
				pruned++
			}
		}
	}
	if pruned == 0 {
		fmt.Println("Nothing to prune.")
	}
}

// humanAge formats a duration in seconds as a short relative-time string.
// Returns "—" for negative or zero ages.
func humanAge(secs int64) string {
	if secs <= 0 {
		return "—"
	}
	switch {
	case secs < 60:
		return fmt.Sprintf("%ds", secs)
	case secs < 3600:
		return fmt.Sprintf("%dm", secs/60)
	case secs < 86400:
		return fmt.Sprintf("%dh", secs/3600)
	default:
		return fmt.Sprintf("%dd", secs/86400)
	}
}

// ── Scan ──────────────────────────────────────────────────────────────────────

// cmdScan resolves the invocation to a mode + target(s) BEFORE mutating anything,
// then dispatches to a full rebuild (`scan all`) or a surgical single-repo scan
// (default / `scan <name>`). Resolving first means an error (outside any repo,
// unknown name) returns without deleting the DB or touching any file.
func cmdScan(args []string) {
	repos := loadReposOrDie()
	cwd, _ := os.Getwd()
	if err := runScan(args, cwd, repos); err != nil {
		die(err.Error())
	}
}

// runScan is the testable seam for the resolve-before-mutate guarantee. It
// resolves the scan target (pure: args+cwd+repos, no DB/FS) BEFORE any mutation
// and returns the error on failure having touched nothing — no os.Remove, no DB
// open/create, no schema write (R-1.3 outside any repo; R-1.5 unknown name). Only
// after resolution succeeds does it dispatch to a mutating scan. cmdScan is a
// thin wrapper that die()s on the returned error.
func runScan(args []string, cwd string, repos []repoEntry) error {
	mode, targets, err := resolveScanTarget(args, cwd, repos)
	if err != nil {
		return err
	}

	switch mode {
	case modeFullRebuild:
		scanFullRebuild(targets) // targets == every repo (R-2.6)
	case modeSurgical:
		scanSurgical(targets) // single target repo (R-2.1–R-2.5)
	}
	return nil
}

// scanFullRebuild is the ONLY DB-file-deleting path (R-2.6): remove the DB,
// recreate the schema, re-index every repo, record each repo's HEAD commit, and
// write the global last_scan value consumed by `stats`. Behavior is unchanged
// from the pre-overhaul `scan all`.
func scanFullRebuild(repos []repoEntry) {
	// Remove old DB
	os.Remove(dbFile)

	db := openDB()
	defer db.Close()

	fmt.Println("Scanning repos…")
	// One coherent timestamp for the whole rebuild, shared by the global value
	// and every per-repo last_scan_<name> written below (R-3.3).
	now := time.Now().UTC().Format(time.RFC3339)
	total := 0
	for _, r := range repos {
		fmt.Printf("  %s: indexing %s…\n", r.Name, r.Path)
		n, err := localdb.FullScan(db, r.Name, r.Path, effectiveSkipDirs(r))
		if err != nil {
			fmt.Fprintf(os.Stderr, "  %s: error — %v\n", r.Name, err)
			continue
		}
		fmt.Printf("  %s: %d files indexed\n", r.Name, n)
		total += n

		// Per-repo knowledge-graph feedback (task 5.1, R-5.1).
		printKGScanSummary(db, r.Name)

		// Store git commit for incremental detection
		if git.IsRepo(r.Path) {
			if commit := git.CurrentCommit(r.Path); commit != "" {
				localdb.SetMeta(db, "git_commit_"+r.Name, commit) //nolint:errcheck
			}
		}

		// R-3.3: record the per-repo last-scan timestamp for every repo indexed
		// in full-rebuild mode, so a just-rebuilt repo shows a real time rather
		// than a placeholder — not only the global value written below.
		localdb.SetMeta(db, "last_scan_"+r.Name, now) //nolint:errcheck
	}

	// R-3.7: retain the global last_scan value consumed by `stats`.
	localdb.SetMeta(db, "last_scan", now) //nolint:errcheck
	fmt.Printf("\nDone. %d specs indexed. Run 'local-search search <keyword>' to find specs.\n", total)
}

// scanSurgical re-indexes only the target repo(s) without deleting the DB file
// (R-2.2) and without touching any other repo's rows (R-2.3). openDB bootstraps
// the schema when the DB file is absent, so a fresh surgical scan creates the
// schema and indexes only the target — it never fans out to all repos (R-2.4).
func scanSurgical(targets []repoEntry) {
	db := openDB()
	defer db.Close()

	// One coherent timestamp for this scan invocation, shared by all targets.
	now := time.Now().UTC().Format(time.RFC3339)
	total := 0
	for _, r := range targets {
		fmt.Printf("  %s: indexing %s…\n", r.Name, r.Path)

		// R-2.1 + R-2.8: delete this repo's rows and re-index it as one atomic
		// unit. ReplaceRepo commits the delete and the re-insert in a single
		// transaction, so a concurrent reader (a racing `search`/`find`, which
		// automation makes frequent) sees either the pre- or post-scan index for
		// this repo, never the empty window. A prior DeleteRepo here would commit
		// an empty state first and reintroduce that window — hence it is gone.
		n, err := localdb.ReplaceRepo(db, r.Name, r.Path, effectiveSkipDirs(r))
		if err != nil {
			fmt.Fprintf(os.Stderr, "  %s: error — %v\n", r.Name, err)
			continue
		}
		fmt.Printf("  %s: %d files indexed\n", r.Name, n)
		total += n

		// Per-repo knowledge-graph feedback (task 5.1, R-5.1).
		printKGScanSummary(db, r.Name)

		// R-2.5 + R-3.5: record HEAD for git repos so incremental detection has a
		// baseline, and so the recorded git_commit_<name> stays consistent with the
		// HEAD that ReplaceRepo just indexed above.
		if git.IsRepo(r.Path) {
			if commit := git.CurrentCommit(r.Path); commit != "" {
				localdb.SetMeta(db, "git_commit_"+r.Name, commit) //nolint:errcheck
			}
		}

		// R-3.3: record this repo's per-repo last-scan timestamp after it was
		// successfully re-indexed.
		localdb.SetMeta(db, "last_scan_"+r.Name, now) //nolint:errcheck
	}

	fmt.Printf("\nDone. %d specs indexed. Run 'local-search search <keyword>' to find specs.\n", total)
}

// ensureDB opens the DB (creating it if needed) and reconciles three states:
//
//  1. DB file missing → cmdScan("all") builds it from scratch.
//  2. Repo present in repos file but missing from the SQLite repos table →
//     FullScan that one repo so its row (with code_graph_* metadata) appears.
//     This covers the auto-bootstrap path where autoBootstrapFromCWD just
//     appended a new entry, plus any manual edit / backup restore that adds
//     a repo behind the binary's back.
//  3. Already-known git repo with new commits → IncrementalScan to pick up
//     the changes.
func ensureDB() *sql.DB {
	if _, err := os.Stat(dbFile); os.IsNotExist(err) {
		cmdScan([]string{"all"})
	}

	db := openDB()

	known, err := localdb.Repos(db)
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: could not read repos table: %v\n", err)
	}
	knownNames := make(map[string]bool, len(known))
	for _, r := range known {
		knownNames[r.Name] = true
	}

	repos := loadRepos()
	for _, r := range repos {
		// Catch up newly-added repos (file says yes, table says no) with a
		// FullScan so the repos row + code_graph_* metadata get created. We
		// fall through to IncrementalScan after — but IncrementalScan is a
		// no-op when there's nothing to do, so the order is harmless.
		if !knownNames[r.Name] {
			fmt.Fprintf(os.Stderr, "(%s: new repo — running first scan…)\n", r.Name)
			if _, err := localdb.FullScan(db, r.Name, r.Path, effectiveSkipDirs(r)); err != nil {
				fmt.Fprintf(os.Stderr, "warning: scan of %s failed: %v\n", r.Name, err)
				continue
			}
			if git.IsRepo(r.Path) {
				if commit := git.CurrentCommit(r.Path); commit != "" {
					localdb.SetMeta(db, "git_commit_"+r.Name, commit) //nolint:errcheck
				}
			}
			continue
		}

		if _, err := applyIncrementalUpdate(db, r); err != nil {
			fmt.Fprintf(os.Stderr, "warning: incremental scan failed: %v\n", err)
		}
	}
	return db
}

// ── Search ────────────────────────────────────────────────────────────────────

// stringSliceFlag implements flag.Value for a repeatable string flag.
type stringSliceFlag []string

func (s *stringSliceFlag) String() string     { return strings.Join(*s, ", ") }
func (s *stringSliceFlag) Set(v string) error { *s = append(*s, v); return nil }

// filterByLocation removes results whose Path contains any of the given patterns.
func filterByLocation(results []localdb.SearchResult, patterns []string) []localdb.SearchResult {
	if len(patterns) == 0 {
		return results
	}
	out := results[:0]
	for _, r := range results {
		exclude := false
		for _, p := range patterns {
			if strings.Contains(r.Path, p) {
				exclude = true
				break
			}
		}
		if !exclude {
			out = append(out, r)
		}
	}
	return out
}

func cmdSearch(args []string) {
	fs := flag.NewFlagSet("search", flag.ExitOnError)
	repoFlag := fs.String("repo", "", "Filter results to this repo (legacy; prefer --repos)")
	reposFlag := fs.String("repos", "all", "Which repos to search: all | graph-only | name1,name2")
	sourceFlag := fs.String("source", "auto", "Where results come from: auto | fts | graph | both")
	rankFlag := fs.String("rank", "auto", "Ranking strategy: auto | bm25 | graph-aware")
	semanticFlag := fs.Bool("semantic", false, "Hybrid FTS+vector re-ranking (RRF fusion)")
	hybridFlag := fs.Bool("hybrid", false, "Alias for --semantic")
	var excludeLocations stringSliceFlag
	fs.Var(&excludeLocations, "exclude-location", "Exclude results whose path contains this string (repeatable)")

	// Bool flags take no value; they must not swallow the following positional
	// token (otherwise `search --semantic "query"` would eat the query).
	boolFlags := map[string]bool{"--semantic": true, "-semantic": true, "--hybrid": true, "-hybrid": true}

	// Go's flag package stops at the first non-flag argument, so flags after
	// the query term are silently ignored. Split positional args from flags
	// before parsing so --repo / --exclude-location work in any position.
	var positional, flagArgs []string
	for i := 0; i < len(args); i++ {
		a := args[i]
		if strings.HasPrefix(a, "-") {
			flagArgs = append(flagArgs, a)
			// Consume the next token if the flag uses "= value" or separate value.
			// flag.Parse handles "--flag value" by consuming the next arg itself,
			// but we must keep them together in flagArgs. Bool flags never
			// consume the next token.
			if !strings.Contains(a, "=") && !boolFlags[a] && i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
				i++
				flagArgs = append(flagArgs, args[i])
			}
		} else {
			positional = append(positional, a)
		}
	}
	fs.Parse(flagArgs) //nolint:errcheck
	semantic := *semanticFlag || *hybridFlag

	if len(positional) == 0 {
		die("Usage: local-search search <query> [--repos <spec>] [--source <fts|graph|both>] [--rank <bm25|graph-aware>] [--exclude-location <pattern>]...")
	}
	query := positional[0]

	// Backward-compat: positional repo arg, then --repo flag, both override --repos.
	legacyRepo := ""
	if len(positional) > 1 {
		legacyRepo = positional[1]
	}
	if *repoFlag != "" {
		legacyRepo = *repoFlag
	}

	db := ensureDB()
	defer db.Close()

	allRepos, err := localdb.Repos(db)
	if err != nil {
		die(err.Error())
	}

	// Resolve the three flags (auto → concrete) given the repos available now.
	plan := resolveSearchPlan(allRepos, legacyRepo, *reposFlag, *sourceFlag, *rankFlag)
	if semantic {
		plan.autoNotes = append(plan.autoNotes, "semantic=on")
	}

	// Print the status header so the user always knows what backend ran.
	printSearchHeader(plan)

	// Run FTS (or hybrid semantic) search if the plan asks for it.
	var ftsResults []localdb.SearchResult
	if plan.runFTS {
		// One call per repo when plan.repos is a subset; one call with
		// repoFilter="" when plan.repos covers every registered repo.
		if plan.allRepos {
			if semantic {
				ftsResults, err = localdb.SemanticSearch(db, query, "", "", 50)
			} else {
				ftsResults, err = localdb.Search(db, query, "", "")
			}
			if err != nil {
				die(err.Error())
			}
		} else {
			for _, name := range plan.repos {
				var rs []localdb.SearchResult
				if semantic {
					rs, err = localdb.SemanticSearch(db, query, name, "", 50)
				} else {
					rs, err = localdb.Search(db, query, name, "")
				}
				if err != nil {
					die(err.Error())
				}
				ftsResults = append(ftsResults, rs...)
			}
			// Semantic Relevance is higher-is-better; merge the per-repo lists
			// into one best-first order. Plain FTS keeps its native order.
			if semantic {
				sort.Slice(ftsResults, func(i, j int) bool {
					return ftsResults[i].Relevance > ftsResults[j].Relevance
				})
			}
		}
		ftsResults = filterByLocation(ftsResults, excludeLocations)
	}

	// Run graph-node label search if the plan asks for it.
	var graphHits []graph.LabelMatch
	if plan.runGraph {
		graphHits = collectGraphHits(query, plan.repos, allRepos)
	}

	// Apply graph-aware re-ranking to FTS results if requested. Skipped in
	// semantic mode: RRF fusion already ordered the results best-first, and the
	// graph-aware pass assumes lower-is-better FTS5 rank semantics.
	if plan.rank == "graph-aware" && len(ftsResults) > 0 && !semantic {
		applyGraphAwareRanking(ftsResults, allRepos)
	}

	printSearchResults(ftsResults, graphHits, query, plan)
}

// cmdVectorGraph emits a kNN vector graph as NetworkX node-link JSON, either
// over the specs carrying a tag ("graph tag <tag>") or as an ego graph seeded
// by a semantic query ("graph search <query> [--repo <name>]").
func cmdVectorGraph(args []string) {
	const usage = "Usage: local-search graph <explain <entity> [--json] | tag <tag> | search <query> [--repo <name>] | export <repo> [--edges auto|vector|tags|nodes] [--include-content] [--out <file>] | export-view [--repos a,b | --all] [--edges auto|vector|tags|nodes] [--out <file>]>"
	if len(args) == 0 {
		die(usage)
	}

	// `graph explain` must never scan implicitly (R-4.5), so it cannot go
	// through ensureDB below (which auto-scans a missing DB). Dispatch to
	// graphcmd.go before any DB is opened; all logic lives there.
	if args[0] == "explain" {
		cmdGraphExplain(args[1:])
		return
	}

	db := ensureDB()
	defer db.Close()

	switch args[0] {
	case "export":
		cmdGraphExport(db, args[1:])

	case "export-view":
		cmdGraphExportView(db, args[1:])

	case "tag":
		if len(args) < 2 || args[1] == "" {
			die(usage)
		}
		g, err := localdb.VectorGraphByTag(db, args[1], 0.3, 8)
		if err != nil {
			die(err.Error())
		}
		localdb.PrintJSON(g)

	case "search":
		if len(args) < 2 || args[1] == "" {
			die(usage)
		}
		query := args[1]
		repo := ""
		for i := 2; i < len(args); i++ {
			if (args[i] == "--repo" || args[i] == "-repo") && i+1 < len(args) {
				repo = args[i+1]
				i++
			}
		}
		g, err := localdb.VectorGraphBySearch(db, query, repo, 10, 8, 0.3)
		if err != nil {
			die(err.Error())
		}
		localdb.PrintJSON(g)

	default:
		die(usage)
	}
}

// cmdGraphExport implements `graph export <repo> [--edges auto|vector|tags|nodes]
// [--include-content] [--out <file>]`: emit a registered repo's indexed specs as
// a rich NetworkX node-link JSON graph, importable via `graphs add` (round-trip).
func cmdGraphExport(db *sql.DB, args []string) {
	const usage = "Usage: local-search graph export <repo> [--edges auto|vector|tags|nodes] [--include-content] [--out <file>]"
	var (
		repo           string
		edges          = "auto"
		includeContent bool
		outPath        string
	)
	for i := 0; i < len(args); i++ {
		switch a := args[i]; a {
		case "--edges":
			if i+1 >= len(args) {
				die("--edges needs a value (auto|vector|tags|nodes)")
			}
			edges = args[i+1]
			i++
		case "--include-content":
			includeContent = true
		case "--out", "-o":
			if i+1 >= len(args) {
				die("--out needs a file path")
			}
			outPath = args[i+1]
			i++
		default:
			if strings.HasPrefix(a, "-") {
				die("unknown flag for graph export: " + a + "\n" + usage)
			}
			if repo != "" {
				die("graph export takes a single <repo>\n" + usage)
			}
			repo = a
		}
	}
	if repo == "" {
		die(usage)
	}

	// Validate the repo name against the registry (mirrors init's behaviour).
	repos, err := localdb.Repos(db)
	if err != nil {
		die(err.Error())
	}
	known := false
	names := make([]string, 0, len(repos))
	for _, r := range repos {
		names = append(names, r.Name)
		if r.Name == repo {
			known = true
		}
	}
	if !known {
		die("unknown repo: " + repo + "\nRegistered repos: " + strings.Join(names, ", ") +
			"\n(See `local-search repo list`.)")
	}

	// Resolve auto → a concrete edge source; note the choice on stderr so stdout
	// stays clean JSON.
	switch edges {
	case "auto":
		hasVec, err := localdb.RepoHasVectors(db, repo)
		if err != nil {
			die(err.Error())
		}
		if hasVec {
			edges = "vector"
		} else {
			edges = "tags"
		}
		fmt.Fprintf(os.Stderr, "graph export: edges=%s (auto)\n", edges)
	case "vector", "tags", "nodes":
		// explicit — nothing to resolve
	default:
		die("unknown --edges value: " + edges + " (want auto|vector|tags|nodes)")
	}

	// minWeight 0.3 / perNodeTopK 8 match the existing `graph tag`/`search` defaults.
	g, err := localdb.RepoGraph(db, repo, edges, includeContent, 0.3, 8)
	if err != nil {
		die(err.Error())
	}

	if outPath == "" {
		localdb.PrintJSON(g)
		return
	}
	if err := localdb.WriteJSONFile(outPath, g); err != nil {
		die("cannot write " + outPath + ": " + err.Error())
	}
	fmt.Fprintf(os.Stderr, "wrote %d nodes, %d links → %s\n", len(g.Nodes), len(g.Links), outPath)
}

// ── Search-plan resolution & helpers ──────────────────────────────────────────

// searchPlan is the resolved (post-auto) configuration for one search call.
type searchPlan struct {
	repos      []string // repo names to search (always concrete)
	allRepos   bool     // true when repos covers every registered repo
	graphRepos int      // count of repos in `repos` that have graph_path
	totalRepos int      // count of all registered repos
	source     string   // fts | graph | both
	rank       string   // bm25 | graph-aware
	runFTS     bool     // shortcut: source == fts || both
	runGraph   bool     // shortcut: source == graph || both
	autoNotes  []string // human notes for header (e.g. "graphs available but unused")
}

// resolveSearchPlan turns the three auto-able flags into concrete values.
// Precedence: legacyRepo > --repos.
func resolveSearchPlan(all []localdb.RepoRow, legacyRepo, reposFlag, sourceFlag, rankFlag string) searchPlan {
	// Step 1: pick the repo set.
	var picked []string
	allRepos := false
	switch {
	case legacyRepo != "":
		picked = []string{legacyRepo}
	case reposFlag == "" || reposFlag == "all":
		for _, r := range all {
			picked = append(picked, r.Name)
		}
		allRepos = true
	case reposFlag == "graph-only":
		for _, r := range all {
			if r.GraphPath != "" {
				picked = append(picked, r.Name)
			}
		}
	default:
		for _, name := range strings.Split(reposFlag, ",") {
			picked = append(picked, strings.TrimSpace(name))
		}
	}

	// Step 2: count graph-enabled repos in the picked set.
	graphInPicked := 0
	pickedSet := map[string]bool{}
	for _, n := range picked {
		pickedSet[n] = true
	}
	for _, r := range all {
		if pickedSet[r.Name] && r.GraphPath != "" {
			graphInPicked++
		}
	}

	// Step 3: resolve --source.
	source := sourceFlag
	if source == "auto" {
		if graphInPicked > 0 {
			source = "both"
		} else {
			source = "fts"
		}
	}

	// Step 4: resolve --rank.
	rank := rankFlag
	if rank == "auto" {
		if graphInPicked > 0 {
			rank = "graph-aware"
		} else {
			rank = "bm25"
		}
	}

	plan := searchPlan{
		repos:      picked,
		allRepos:   allRepos,
		graphRepos: graphInPicked,
		totalRepos: len(all),
		source:     source,
		rank:       rank,
		runFTS:     source == "fts" || source == "both",
		runGraph:   source == "graph" || source == "both",
	}

	// Helpful note: graphs exist but the user explicitly opted out.
	if graphInPicked > 0 && source == "fts" {
		plan.autoNotes = append(plan.autoNotes, "graphs available but unused (--source=fts)")
	}
	if graphInPicked == 0 && (sourceFlag == "graph" || sourceFlag == "both") {
		plan.autoNotes = append(plan.autoNotes, "no graphs in selected repos — graph results will be empty")
	}
	return plan
}

func printSearchHeader(p searchPlan) {
	parts := []string{
		"source=" + p.source,
		"rank=" + p.rank,
	}
	if p.allRepos {
		parts = append(parts, fmt.Sprintf("repos=%d (%d with graphs)", p.totalRepos, p.graphRepos))
	} else {
		parts = append(parts, fmt.Sprintf("repos=%d (%d with graphs)", len(p.repos), p.graphRepos))
	}
	for _, n := range p.autoNotes {
		parts = append(parts, n)
	}
	fmt.Printf("[%s]\n", strings.Join(parts, " · "))
}

func collectGraphHits(query string, repoNames []string, allRepos []localdb.RepoRow) []graph.LabelMatch {
	byName := map[string]localdb.RepoRow{}
	for _, r := range allRepos {
		byName[r.Name] = r
	}
	const perRepoLimit = 20
	var hits []graph.LabelMatch
	for _, name := range repoNames {
		r, ok := byName[name]
		if !ok || r.GraphPath == "" {
			continue
		}
		g, err := graph.Load(r.Name, r.GraphPath, r.GraphMTime)
		if err != nil || g == nil {
			continue
		}
		for _, n := range g.SearchLabels(query, perRepoLimit) {
			hits = append(hits, graph.LabelMatch{Repo: r.Name, Node: n, GraphPath: r.GraphPath})
		}
	}
	return hits
}

// applyGraphAwareRanking multiplies FTS Relevance by a centrality boost for
// specs whose name matches a node in the same repo's graph. Higher Relevance
// in FTS means lower BM25 score (rank), so we DIVIDE by the boost to surface
// graph-central specs. (FTS5's f.rank is "lower is better".)
func applyGraphAwareRanking(results []localdb.SearchResult, allRepos []localdb.RepoRow) {
	byName := map[string]localdb.RepoRow{}
	for _, r := range allRepos {
		byName[r.Name] = r
	}
	for i := range results {
		r, ok := byName[results[i].Repo]
		if !ok || r.GraphPath == "" {
			continue
		}
		g, err := graph.Load(r.Name, r.GraphPath, r.GraphMTime)
		if err != nil || g == nil {
			continue
		}
		boost := g.CentralityBoost(results[i].Name)
		if boost > 1.0 {
			// FTS5 rank: more negative = better. Multiply (toward more negative)
			// to elevate boosted results; positive ranks divide instead.
			if results[i].Relevance < 0 {
				results[i].Relevance *= boost
			} else {
				results[i].Relevance /= boost
			}
		}
	}
	// Re-sort by Relevance ascending (FTS5 rank semantics).
	for i := 1; i < len(results); i++ {
		for j := i; j > 0 && results[j].Relevance < results[j-1].Relevance; j-- {
			results[j], results[j-1] = results[j-1], results[j]
		}
	}
}

func printSearchResults(ftsResults []localdb.SearchResult, graphHits []graph.LabelMatch, query string, p searchPlan) {
	if len(ftsResults) == 0 && len(graphHits) == 0 {
		fmt.Println("No results for: " + query)
		fmt.Println()
		fmt.Println("  Broader term, or prefix: local-search search \"" + query + "*\"")
		fmt.Println("  Boolean: local-search search \"" + query + " OR <other>\"")
		fmt.Println("  Browse: local-search list")
		return
	}

	if len(graphHits) > 0 {
		fmt.Printf("\nGraph nodes (%d):\n", len(graphHits))
		for _, h := range graphHits {
			fmt.Printf("  [%s · graph] %s  (deg=%d, community=%d)\n",
				h.Repo, h.Node.Label, h.Node.Degree, h.Node.Community)
		}
	}

	if len(ftsResults) > 0 {
		fmt.Printf("\nSpecs (%d):\n", len(ftsResults))
		for _, r := range ftsResults {
			origin := "FTS"
			if p.rank == "graph-aware" && hasGraphForRepo(r.Repo, p) {
				origin = "FTS+graph"
			}
			fmt.Printf("  [%s · %s] %s\n", r.Repo, origin, r.Path)
			fmt.Printf("    %s", r.Title)
			if r.Tags != "" {
				fmt.Printf("  (%s)", r.Tags)
			}
			fmt.Printf("  .%s\n", r.Ext)
		}
	}
}

func hasGraphForRepo(repoName string, p searchPlan) bool {
	// Cheap path check — we only know graphRepos as a count in the plan, so
	// we re-resolve via the cached graph load. False is a safe fallback.
	return p.graphRepos > 0
}

// ── Read ──────────────────────────────────────────────────────────────────────

func cmdRead(args []string) {
	fs := flag.NewFlagSet("read", flag.ExitOnError)
	repoFlag := fs.String("repo", "", "Read from specific repo")
	directoryFlag := fs.String("directory", "", "Filter to paths starting with this directory")

	// Split positional args from flags
	var positional, flagArgs []string
	for i := 0; i < len(args); i++ {
		a := args[i]
		if strings.HasPrefix(a, "-") {
			flagArgs = append(flagArgs, a)
			if !strings.Contains(a, "=") && i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
				i++
				flagArgs = append(flagArgs, args[i])
			}
		} else {
			positional = append(positional, a)
		}
	}
	fs.Parse(flagArgs) //nolint:errcheck

	if len(positional) == 0 {
		die("Usage: local-search read <name> [repo] [--directory <path>]")
	}
	name := positional[0]
	repo := ""
	if len(positional) > 1 {
		repo = positional[1]
	}
	if *repoFlag != "" {
		repo = *repoFlag
	}

	db := ensureDB()
	defer db.Close()

	fullpath, err := localdb.ReadSpec(db, name, repo, *directoryFlag)
	if err != nil {
		die(err.Error())
	}
	if fullpath == "" {
		return // multiple matches were listed
	}

	data, err := os.ReadFile(fullpath)
	if err != nil {
		die(err.Error())
	}
	fmt.Print(string(data))
}

// ── List ──────────────────────────────────────────────────────────────────────

func cmdList(args []string) {
	filter := ""
	if len(args) > 0 {
		filter = args[0]
	}

	db := ensureDB()
	defer db.Close()

	if err := localdb.StreamList(db, filter); err != nil {
		die(err.Error())
	}
}

// ── Projects ──────────────────────────────────────────────────────────────────

func cmdProjects() {
	db := ensureDB()
	defer db.Close()

	projects, err := localdb.Projects(db)
	if err != nil {
		die(err.Error())
	}
	for _, p := range projects {
		fmt.Printf("  [%s] %s  (%d specs)\n", p.Repo, p.Project, p.Count)
	}
}

// ── Related ───────────────────────────────────────────────────────────────────

func cmdRelated(args []string) {
	if len(args) == 0 {
		die("Usage: local-search related <name>")
	}
	name := args[0]

	db := ensureDB()
	defer db.Close()

	results, err := localdb.Related(db, name)
	if err != nil {
		die(err.Error())
	}
	if len(results) == 0 {
		fmt.Println("No related specs found.")
		return
	}
	localdb.PrintSearch(results, name)
}

// ── Recent ────────────────────────────────────────────────────────────────────

func cmdRecent(args []string) {
	n := 10
	if len(args) > 0 {
		if v, err := strconv.Atoi(args[0]); err == nil && v > 0 {
			n = v
		}
	}

	db := ensureDB()
	defer db.Close()

	rows, err := localdb.Recent(db, n)
	if err != nil {
		die(err.Error())
	}
	for _, r := range rows {
		fmt.Printf("  [%s] %s/%s  %s\n", r.Repo, r.Project, r.Name, r.Title)
	}
}

// ── Tags ──────────────────────────────────────────────────────────────────────

func cmdTags(args []string) {
	db := ensureDB()
	defer db.Close()

	if len(args) > 0 {
		rows, err := localdb.SpecsByTag(db, args[0])
		if err != nil {
			die(err.Error())
		}
		localdb.PrintList(rows)
		return
	}

	tags, err := localdb.Tags(db)
	if err != nil {
		die(err.Error())
	}
	for _, t := range tags {
		fmt.Printf("  %-30s %d\n", t.Tag, t.Count)
	}
}

// ── Stats ─────────────────────────────────────────────────────────────────────

func cmdStats() {
	db := ensureDB()
	defer db.Close()

	s, err := localdb.Stats(db)
	if err != nil {
		die(err.Error())
	}
	localdb.PrintStats(s, dbFile)
}

// ── Inspect ───────────────────────────────────────────────────────────────────

func cmdInspect() {
	db := ensureDB()
	defer db.Close()

	if err := localdb.Inspect(db, dbFile); err != nil {
		die(err.Error())
	}
}

// ── Reset ─────────────────────────────────────────────────────────────────────

func cmdReset() {
	fmt.Print("This will delete all repos and the index. Continue? [y/N] ")
	reader := bufio.NewReader(os.Stdin)
	answer, _ := reader.ReadString('\n')
	if strings.ToLower(strings.TrimSpace(answer)) != "y" {
		fmt.Println("Cancelled.")
		return
	}
	os.Remove(dbFile)
	os.Remove(reposFile)
	fmt.Println("Reset complete. Start fresh with: local-search repo add /path/to/specs")
}

// ── JSON ──────────────────────────────────────────────────────────────────────

func cmdJSON(args []string) {
	if len(args) == 0 {
		die("Usage: local-search json <search|read|list|repos|related|tags|stats> [args...]")
	}
	sub := args[0]
	rest := args[1:]

	db := ensureDB()
	defer db.Close()

	switch sub {
	case "search":
		// Strip an optional --semantic/--hybrid flag from anywhere in rest.
		semantic := false
		var pos []string
		for _, a := range rest {
			switch a {
			case "--semantic", "-semantic", "--hybrid", "-hybrid":
				semantic = true
			default:
				pos = append(pos, a)
			}
		}
		if len(pos) == 0 {
			die("Usage: local-search json search <query> [repo] [--semantic]")
		}
		repo := ""
		if len(pos) > 1 {
			repo = pos[1]
		}
		var results []localdb.SearchResult
		var err error
		if semantic {
			results, err = localdb.SemanticSearch(db, pos[0], repo, "", 50)
		} else {
			results, err = localdb.Search(db, pos[0], repo, "")
		}
		if err != nil {
			die(err.Error())
		}
		localdb.PrintJSON(results)

	case "read":
		if len(rest) == 0 {
			die("Usage: local-search json read <name> [repo]")
		}
		repo := ""
		if len(rest) > 1 {
			repo = rest[1]
		}
		fullpath, err := localdb.ReadSpec(db, rest[0], repo, "")
		if err != nil {
			die(err.Error())
		}
		if fullpath == "" {
			return
		}
		data, err := os.ReadFile(fullpath)
		if err != nil {
			die(err.Error())
		}
		localdb.PrintJSON(map[string]string{
			"path":    fullpath,
			"content": string(data),
		})

	case "list":
		filter := ""
		if len(rest) > 0 {
			filter = rest[0]
		}
		rows, err := localdb.List(db, filter)
		if err != nil {
			die(err.Error())
		}
		localdb.PrintJSON(rows)

	case "repos":
		repos, err := localdb.Repos(db)
		if err != nil {
			die(err.Error())
		}
		localdb.PrintJSON(repos)

	case "related":
		if len(rest) == 0 {
			die("Usage: local-search json related <name>")
		}
		results, err := localdb.Related(db, rest[0])
		if err != nil {
			die(err.Error())
		}
		localdb.PrintJSON(results)

	case "tags":
		tags, err := localdb.Tags(db)
		if err != nil {
			die(err.Error())
		}
		localdb.PrintJSON(tags)

	case "stats":
		s, err := localdb.Stats(db)
		if err != nil {
			die(err.Error())
		}
		localdb.PrintJSON(s)

	case "find":
		// json find delegates to the same scope-resolved find pipeline as the
		// CLI command, but never prints non-JSON to stdout. ensureDB() above
		// already opened a connection; close it and let resolveScope reopen
		// (it owns the lifetime via the same pattern as the CLI handlers).
		db.Close()
		flagScope, jrest := extractScopeFlag(rest)
		if len(jrest) == 0 {
			die("Usage: local-search json find <query> [--scope repo1,repo2]")
		}
		sc, repos, jdb := resolveScope(flagScope)
		defer jdb.Close()
		exts, _ := localdb.ExternalGraphs(jdb)
		resp, err := find.Find(find.Inputs{
			Query: jrest[0], DB: jdb, Scope: sc,
			Repos: repos, ExternalGraphs: exts,
		})
		if err != nil {
			die(err.Error())
		}
		localdb.PrintJSON(resp)

	case "context":
		// json context is the agent payload — find + inlined blast radius for
		// the top codegraph hit. Same scope rules as json find.
		db.Close()
		flagScope, jrest := extractScopeFlag(rest)
		if len(jrest) == 0 {
			die("Usage: local-search json context <query> [--scope repo1,repo2]")
		}
		sc, repos, jdb := resolveScope(flagScope)
		defer jdb.Close()
		exts, _ := localdb.ExternalGraphs(jdb)
		resp, err := find.Context(find.Inputs{
			Query: jrest[0], DB: jdb, Scope: sc,
			Repos: repos, ExternalGraphs: exts,
		})
		if err != nil {
			die(err.Error())
		}
		localdb.PrintJSON(resp)

	default:
		die("Unknown json subcommand: " + sub)
	}
}

// ── Find / Code / Scope (unified scoped search) ──────────────────────────────

// extractScopeFlag pulls --scope <value> out of args, returning the value and
// the remaining args. Empty string when not present.
func extractScopeFlag(args []string) (string, []string) {
	var rest []string
	value := ""
	for i := 0; i < len(args); i++ {
		a := args[i]
		if a == "--scope" {
			if i+1 < len(args) {
				value = args[i+1]
				i++
			}
			continue
		}
		if strings.HasPrefix(a, "--scope=") {
			value = strings.TrimPrefix(a, "--scope=")
			continue
		}
		rest = append(rest, a)
	}
	return value, rest
}

// resolveScope is the common entry used by find/code/scope. Returns the
// resolved scope, opening the DB along the way.
//
// Auto-init policy: if --scope was not passed AND there is no
// .local-search.toml in CWD (nor in any parent dir), create one in CWD seeded
// from CWD walk-up:
//
//   - If a registered repo encloses CWD, write `scope = ["that-repo"]`.
//   - Otherwise write empty `scope = []` and warn — the search will return
//     no results, but the user gets a tangible config file to edit.
//
// This guarantees the user always ends up with a real .local-search.toml in
// the directory they ran the command from, which is what they asked for. The
// notice is printed to stderr so JSON output on stdout stays clean.
func resolveScope(flagValue string) (scope.Scope, []localdb.RepoRow, *sql.DB) {
	cwd, _ := os.Getwd()

	// Open DB up front. ensureDB used to die on a fresh install with no
	// repos because cmdScan("all") calls loadReposOrDie. We avoid that path
	// by opening the DB directly when no repos are registered yet — there's
	// nothing to scan and ensureDB's incremental-update loop is a no-op
	// when the repos table is empty.
	db := openDBForResolve()
	repos, err := localdb.Repos(db)
	if err != nil {
		db.Close()
		die(err.Error())
	}

	// Auto-register a .code-review-graph/ artifact in CWD as an external
	// graph (NOT a repo — no filesystem walk, no markdown indexing). The
	// returned name is the "graph:"-prefixed scope entry to seed the config.
	autoSeed := ""
	if flagValue == "" {
		if _, _, found := scope.FindProjectConfig(cwd); !found {
			autoSeed = autoBootstrapFromCWD(cwd, db)
		}
	}

	scopeRepos := make([]scope.Repo, 0, len(repos))
	for _, r := range repos {
		scopeRepos = append(scopeRepos, scope.Repo{Name: r.Name, Path: r.Path})
	}
	externals, _ := localdb.ExternalGraphs(db)
	externalNames := make([]string, 0, len(externals))
	for _, e := range externals {
		externalNames = append(externalNames, e.Name)
	}

	// Create .local-search.toml if missing. Seeding precedence:
	//   1. autoSeed (newly-registered external graph) if any
	//   2. CWD walk-up to a registered repo
	//   3. Empty
	if flagValue == "" {
		if _, _, found := scope.FindProjectConfig(cwd); !found {
			autoInitLocalConfig(cwd, scopeRepos, autoSeed)
		}
	}

	// Now run ensureDB's incremental-update pass for already-known git repos.
	// We deferred this until after auto-bootstrap so a freshly-registered
	// external graph doesn't trigger any scans.
	runIncrementalUpdates(db, repos)

	res := scope.Resolver{
		CWD:            cwd,
		ExternalGraphs: externalNames,
		FlagValue:      flagValue,
		Repos:          scopeRepos,
		HomeDir:        homeDir(),
	}
	sc, err := res.Resolve()
	if err == nil {
		return sc, repos, db
	}
	if err == scope.ErrNoScope {
		// Should not happen now that auto-init always writes a config — but
		// belt-and-braces in case the flag was passed and no config exists.
		db.Close()
		die("no scope configured. Pass --scope or remove the flag to auto-init " + scope.ConfigFileName)
	}
	// Empty scope config (scope = []) → Resolve returns "config lists scope
	// but none are registered". Treat that as a usable empty-result Scope so
	// the user sees the banner + footer instead of a crash.
	if isEmptyScopeError(err) {
		cfgPath := filepath.Join(cwd, scope.ConfigFileName)
		return scope.Scope{
			Repos:   nil,
			Source:  cfgPath,
			Weights: defaultScopeWeights(),
			Limits:  defaultScopeLimits(),
		}, repos, db
	}
	db.Close()
	die(err.Error())
	return scope.Scope{}, nil, nil // unreachable; die exits
}

// autoBootstrapFromCWD registers a code-graph artifact (.code-review-graph/)
// found in cwd as an EXTERNAL GRAPH — never as a repo. No filesystem walk,
// no markdown indexing. Returns the registered name (with the "graph:" prefix
// already attached) when registration happened, "" otherwise.
//
// Why external-graph and not repo: registering as a repo would trigger a
// FullScan that walks the whole project looking for .md/.mdx/.txt files,
// generating warnings for every image without a companion .md and indexing
// thousands of unrelated files. The user explicitly does NOT want that —
// the integration's whole point is to use the code-graph the upstream tool
// already built.
//
// If the user also wants markdown indexing, they run `local-search repo add .`
// explicitly. We surface that hint in the registration notice.
func autoBootstrapFromCWD(cwd string, db *sql.DB) string {
	// Skip when cwd is already inside a registered repo — that repo's own
	// scan already picked up its .code-review-graph/ via FullScan.
	for _, r := range loadRepos() {
		if pathContainsOrEquals(r.Path, cwd) {
			return ""
		}
	}

	// Need a code-review-graph artifact to justify auto-registration.
	cgi := codegraph.Detect(cwd)
	if cgi.Path == "" {
		return ""
	}

	// Skip when this exact graph file is already registered (re-running
	// `find` from the same dir shouldn't re-register on every invocation).
	existing, err := localdb.ExternalGraphs(db)
	if err == nil {
		for _, e := range existing {
			if e.GraphPath == cgi.Path {
				return e.Name
			}
		}
	}

	name := filepath.Base(cwd)
	// Guard against name collisions across BOTH repos and external graphs —
	// the scope `graph:` prefix keeps them apart in resolution but the
	// external_graphs table still requires unique names.
	taken := map[string]bool{}
	if existing != nil {
		for _, e := range existing {
			taken[e.Name] = true
		}
	}
	for _, r := range loadRepos() {
		taken[r.Name] = true
	}
	base := name
	for i := 2; taken[name]; i++ {
		name = fmt.Sprintf("%s-%d", base, i)
	}

	if err := localdb.AddExternalGraph(db, name, cgi.Path, cgi.MTime, cgi.NodeCount, localdb.GraphKindCodeReviewGraph); err != nil {
		fmt.Fprintf(os.Stderr, "warning: could not register code-graph %q: %v\n", name, err)
		return ""
	}

	fmt.Fprintf(os.Stderr,
		"Detected %s in CWD — registered code-graph %q (%d nodes). No source files indexed.\n",
		filepath.Join(codegraph.DirName, filepath.Base(cgi.Path)), name, cgi.NodeCount)
	fmt.Fprintf(os.Stderr,
		"To also index this project's markdown specs, run:  local-search repo add %s\n",
		cwd)
	return scope.GraphPrefix + name
}

// pathContainsOrEquals reports whether parent is either equal to child or an
// ancestor of it. Used to skip auto-bootstrap when cwd is inside an already-
// registered repo.
func pathContainsOrEquals(parent, child string) bool {
	if parent == "" || child == "" {
		return false
	}
	pa, err1 := filepath.Abs(parent)
	ca, err2 := filepath.Abs(child)
	if err1 != nil || err2 != nil {
		return false
	}
	pa = filepath.Clean(pa)
	ca = filepath.Clean(ca)
	if pa == ca {
		return true
	}
	return strings.HasPrefix(ca, pa+string(filepath.Separator))
}

// openDBForResolve opens the DB without ensureDB's "die when no repos exist"
// failure mode. Used by resolveScope so a fresh install can register its
// first external graph before any repo is registered.
//
// Side effect: creates the DB file if missing and runs schema migrations.
// Does NOT trigger any scans.
func openDBForResolve() *sql.DB {
	db, err := localdb.Open(dbFile)
	if err != nil {
		die("Cannot open database: " + err.Error())
	}
	if err := localdb.CreateSchema(db); err != nil {
		die("Cannot create schema: " + err.Error())
	}
	return db
}

// runIncrementalUpdates is the post-bootstrap half of what ensureDB used to
// do: walk every registered git repo, detect commits since the last scan,
// run IncrementalScan. Called explicitly by resolveScope after auto-bootstrap
// so a freshly-registered external graph doesn't accidentally trigger an
// indexing pass.
func runIncrementalUpdates(db *sql.DB, repos []localdb.RepoRow) {
	knownNames := make(map[string]bool, len(repos))
	for _, r := range repos {
		knownNames[r.Name] = true
	}
	for _, r := range loadRepos() {
		// New repos in the file (not yet in the table) get a FullScan first
		// so their row appears with code_graph_* metadata.
		if !knownNames[r.Name] {
			fmt.Fprintf(os.Stderr, "(%s: new repo — running first scan…)\n", r.Name)
			if _, err := localdb.FullScan(db, r.Name, r.Path, effectiveSkipDirs(r)); err != nil {
				fmt.Fprintf(os.Stderr, "warning: scan of %s failed: %v\n", r.Name, err)
				continue
			}
			if git.IsRepo(r.Path) {
				if commit := git.CurrentCommit(r.Path); commit != "" {
					localdb.SetMeta(db, "git_commit_"+r.Name, commit) //nolint:errcheck
				}
			}
			continue
		}
		if _, err := applyIncrementalUpdate(db, r); err != nil {
			fmt.Fprintf(os.Stderr, "warning: incremental scan failed: %v\n", err)
		}
	}
}

// applyIncrementalUpdate runs an incremental index update for a single already-
// known repo. It is the shared body previously duplicated in ensureDB and
// runIncrementalUpdates, so both incremental sites behave identically.
//
// Behavior (unchanged from the old inline code): non-git repos and git repos
// with no new/changed spec files are no-ops. When files actually change it runs
// localdb.IncrementalScan, rewrites git_commit_<name> to the new HEAD (R-6.5),
// and additionally stamps last_index_update_<name> with the current UTC time
// (R-3.4). The timestamp is written ONLY when an update changed files — never on
// a no-op query. Returns whether any files changed.
func applyIncrementalUpdate(db *sql.DB, repo repoEntry) (changed bool, err error) {
	if !git.IsRepo(repo.Path) {
		return false, nil
	}
	lastCommit := localdb.GetMeta(db, "git_commit_"+repo.Name)
	changedFiles, err := git.ChangedFiles(repo.Path, lastCommit)
	if err != nil || len(changedFiles) == 0 {
		// Preserve the original silent skip on ChangedFiles errors.
		return false, nil
	}
	fmt.Fprintf(os.Stderr, "(%s: git changes detected — incremental update…)\n\n", repo.Name)
	n, newCommit, err := localdb.IncrementalScan(db, repo.Name, repo.Path, lastCommit, effectiveSkipDirs(repo))
	if err != nil {
		return false, err
	}
	if n > 0 {
		fmt.Fprintf(os.Stderr, "(%s: %d file(s) updated)\n\n", repo.Name, n)
	}
	if newCommit != "" {
		localdb.SetMeta(db, "git_commit_"+repo.Name, newCommit) //nolint:errcheck
	}
	if n > 0 {
		localdb.SetMeta(db, "last_index_update_"+repo.Name, time.Now().UTC().Format(time.RFC3339)) //nolint:errcheck
	}
	return n > 0, nil
}

// autoInitLocalConfig writes .local-search.toml in cwd. Seeding precedence:
//
//  1. autoSeed (e.g. a "graph:foo" entry just produced by autoBootstrapFromCWD)
//  2. CWD walk-up to a registered repo
//  3. Empty (with a friendly warning + remediation hint)
//
// Prints a one-line notice to stderr so the user knows what just happened.
func autoInitLocalConfig(cwd string, scopeRepos []scope.Repo, autoSeed string) {
	var seed []string
	switch {
	case autoSeed != "":
		seed = []string{autoSeed}
	default:
		if name, ok := scope.NearestRepoForCWD(cwd, scopeRepos); ok {
			seed = []string{name}
		}
	}
	cfgPath, werr := scope.WriteProjectConfig(cwd, seed)
	if werr != nil {
		die("could not auto-init " + scope.ConfigFileName + ": " + werr.Error())
	}
	switch {
	case autoSeed != "":
		fmt.Fprintf(os.Stderr, "Created %s with scope = %v (using detected code-graph).\n",
			cfgPath, seed)
	case len(seed) > 0:
		fmt.Fprintf(os.Stderr, "Created %s with scope = %v (CWD is inside registered repo %q).\n",
			cfgPath, seed, seed[0])
	default:
		fmt.Fprintf(os.Stderr,
			"Created empty %s — CWD is not inside any registered repo.\n"+
				"Edit it to add scope, e.g.:  scope = [\"repo1\", \"repo2\"]\n"+
				"See available repos: local-search repo list\n",
			cfgPath)
	}
}

// isEmptyScopeError reports whether err is the "config lists scope but none
// are registered" error from scope.Resolve when the config has scope = [].
// Match is by message substring because scope.Resolve uses fmt.Errorf, not
// a sentinel error.
func isEmptyScopeError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "lists scope")
}

// defaultScopeWeights / defaultScopeLimits mirror the package-level defaults
// in scope/. Used by resolveScope's empty-scope fall-through so the returned
// Scope has the same defaults a parsed config would have.
func defaultScopeWeights() scope.Weights {
	return scope.Weights{
		Specs:     scope.DefaultWeightSpecs,
		Graphify:  scope.DefaultWeightGraphify,
		CodeGraph: scope.DefaultWeightCodeGraph,
	}
}

func defaultScopeLimits() scope.Limits {
	return scope.Limits{
		Specs:      scope.DefaultLimitSpecs,
		Graphify:   scope.DefaultLimitGraphify,
		CodeGraph:  scope.DefaultLimitCodeGraph,
		BlastDepth: scope.DefaultBlastDepth,
		BlastCap:   scope.DefaultBlastCap,
	}
}

func cmdFind(args []string) {
	flagScope, rest := extractScopeFlag(args)
	if len(rest) == 0 {
		die("Usage: local-search find <query> [--scope repo1,repo2]")
	}
	query := rest[0]

	sc, repos, db := resolveScope(flagScope)
	defer db.Close()
	exts, _ := localdb.ExternalGraphs(db)

	resp, err := find.Find(find.Inputs{
		Query:          query,
		DB:             db,
		Scope:          sc,
		Repos:          repos,
		ExternalGraphs: exts,
	})
	if err != nil {
		die(err.Error())
	}
	printFindResponse(resp, query)
}

func cmdCode(args []string) {
	if len(args) == 0 {
		die("Usage: local-search code <query|hubs|blast|callers|callees> [args...]")
	}
	switch args[0] {
	case "hubs":
		cmdCodeHubs(args[1:])
	case "blast":
		cmdCodeBlast(args[1:])
	case "callers":
		cmdCodeRelated(args[1:], "callers")
	case "callees":
		cmdCodeRelated(args[1:], "callees")
	default:
		// Treat as a node-name query.
		cmdCodeQuery(args)
	}
}

func cmdCodeQuery(args []string) {
	flagScope, rest := extractScopeFlag(args)
	if len(rest) == 0 {
		die("Usage: local-search code <query> [--scope repo1,repo2]")
	}
	query := rest[0]

	sc, repos, db := resolveScope(flagScope)
	defer db.Close()

	any := false
	for _, r := range filterScopeRepos(repos, sc.Repos) {
		if r.CodeGraphPath == "" {
			fmt.Printf("[%s] no .code-review-graph/ — fix: %s\n", r.Name, codegraph.MissingInstructions(r.Path))
			continue
		}
		d, err := codegraph.Open(r.Name, r.CodeGraphPath, r.CodeGraphMTime)
		if err != nil || d == nil {
			fmt.Printf("[%s] code-graph unreadable\n", r.Name)
			continue
		}
		nodes, err := d.FindNodes(query, sc.Limits.CodeGraph)
		if err != nil {
			fmt.Printf("[%s] error: %v\n", r.Name, err)
			continue
		}
		if len(nodes) == 0 {
			continue
		}
		fmt.Printf("\n[%s] %d match(es):\n", r.Name, len(nodes))
		for _, n := range nodes {
			loc := n.FilePath
			if n.LineStart > 0 {
				loc = fmt.Sprintf("%s:%d", n.FilePath, n.LineStart)
			}
			fmt.Printf("  %-9s %-50s  %s\n", n.Kind, n.QualifiedName, loc)
		}
		any = true
	}
	if !any {
		fmt.Println("No code-graph matches in scope.")
	}
}

func cmdCodeHubs(args []string) {
	flagScope, _ := extractScopeFlag(args)
	sc, repos, db := resolveScope(flagScope)
	defer db.Close()

	for _, r := range filterScopeRepos(repos, sc.Repos) {
		if r.CodeGraphPath == "" {
			continue
		}
		d, err := codegraph.Open(r.Name, r.CodeGraphPath, r.CodeGraphMTime)
		if err != nil || d == nil {
			continue
		}
		hubs, err := d.HubNodes(10)
		if err != nil || len(hubs) == 0 {
			continue
		}
		fmt.Printf("\n[%s] top hubs:\n", r.Name)
		for _, h := range hubs {
			fmt.Printf("  %-9s %-50s  out=%d\n", h.Node.Kind, h.Node.QualifiedName, h.OutDegree)
		}
	}
}

func cmdCodeBlast(args []string) {
	flagScope, rest := extractScopeFlag(args)
	if len(rest) == 0 {
		die("Usage: local-search code blast <qualified-name> [--scope repo1,repo2]")
	}
	target := rest[0]
	sc, repos, db := resolveScope(flagScope)
	defer db.Close()

	for _, r := range filterScopeRepos(repos, sc.Repos) {
		if r.CodeGraphPath == "" {
			continue
		}
		d, err := codegraph.Open(r.Name, r.CodeGraphPath, r.CodeGraphMTime)
		if err != nil || d == nil {
			continue
		}
		nodes, err := d.BlastRadius(target, sc.Limits.BlastDepth, sc.Limits.BlastCap)
		if err != nil || len(nodes) == 0 {
			continue
		}
		fmt.Printf("\n[%s] blast radius of %s (depth=%d, cap=%d):\n",
			r.Name, target, sc.Limits.BlastDepth, sc.Limits.BlastCap)
		for _, n := range nodes {
			loc := n.FilePath
			if n.LineStart > 0 {
				loc = fmt.Sprintf("%s:%d", n.FilePath, n.LineStart)
			}
			fmt.Printf("  %-9s %-50s  %s\n", n.Kind, n.QualifiedName, loc)
		}
	}
}

func cmdCodeRelated(args []string, mode string) {
	flagScope, rest := extractScopeFlag(args)
	if len(rest) == 0 {
		die("Usage: local-search code " + mode + " <qualified-name> [--scope repo1,repo2]")
	}
	target := rest[0]
	sc, repos, db := resolveScope(flagScope)
	defer db.Close()

	for _, r := range filterScopeRepos(repos, sc.Repos) {
		if r.CodeGraphPath == "" {
			continue
		}
		d, err := codegraph.Open(r.Name, r.CodeGraphPath, r.CodeGraphMTime)
		if err != nil || d == nil {
			continue
		}
		var nodes []codegraph.Node
		if mode == "callers" {
			nodes, err = d.CallersOf(target)
		} else {
			nodes, err = d.CalleesOf(target)
		}
		if err != nil || len(nodes) == 0 {
			continue
		}
		fmt.Printf("\n[%s] %s of %s:\n", r.Name, mode, target)
		for _, n := range nodes {
			loc := n.FilePath
			if n.LineStart > 0 {
				loc = fmt.Sprintf("%s:%d", n.FilePath, n.LineStart)
			}
			fmt.Printf("  %-9s %-50s  %s\n", n.Kind, n.QualifiedName, loc)
		}
	}
}

func cmdScope(args []string) {
	if len(args) == 0 {
		args = []string{"show"}
	}
	switch args[0] {
	case "show":
		cmdScopeShow()
	case "set":
		cmdScopeSet(args[1:])
	case "clear":
		cmdScopeClear()
	case "init":
		cmdScopeInit()
	default:
		die("Usage: local-search scope <show|set|clear|init>")
	}
}

func cmdScopeShow() {
	flagScope := ""
	sc, _, db := resolveScope(flagScope)
	defer db.Close()
	fmt.Printf("Scope:   %s\n", strings.Join(sc.Repos, ", "))
	fmt.Printf("Source:  %s\n", sc.Source)
	fmt.Printf("Weights: specs=%.2f graphify=%.2f codegraph=%.2f\n",
		sc.Weights.Specs, sc.Weights.Graphify, sc.Weights.CodeGraph)
	fmt.Printf("Limits:  specs=%d graphify=%d codegraph=%d blast_depth=%d blast_cap=%d\n",
		sc.Limits.Specs, sc.Limits.Graphify, sc.Limits.CodeGraph,
		sc.Limits.BlastDepth, sc.Limits.BlastCap)
}

func cmdScopeSet(args []string) {
	if len(args) == 0 {
		die("Usage: local-search scope set repo1,repo2,...")
	}
	cwd, err := os.Getwd()
	if err != nil {
		die(err.Error())
	}
	scopeList := splitComma(args[0])
	if len(scopeList) == 0 {
		die("scope list is empty")
	}
	path, err := scope.WriteProjectConfig(cwd, scopeList)
	if err != nil {
		die(err.Error())
	}
	fmt.Printf("Wrote %s with scope = %v\n", path, scopeList)
}

func cmdScopeClear() {
	cwd, err := os.Getwd()
	if err != nil {
		die(err.Error())
	}
	if err := scope.RemoveProjectConfig(cwd); err != nil {
		die(err.Error())
	}
	fmt.Printf("Removed %s/%s (or it did not exist)\n", cwd, scope.ConfigFileName)
}

func cmdScopeInit() {
	cwd, err := os.Getwd()
	if err != nil {
		die(err.Error())
	}
	db := ensureDB()
	defer db.Close()
	repos, err := localdb.Repos(db)
	if err != nil {
		die(err.Error())
	}
	scopeRepos := make([]scope.Repo, 0, len(repos))
	for _, r := range repos {
		scopeRepos = append(scopeRepos, scope.Repo{Name: r.Name, Path: r.Path})
	}
	res := scope.Resolver{CWD: cwd, Repos: scopeRepos, HomeDir: homeDir()}
	sc, err := res.Resolve()
	if err != nil {
		die("could not auto-detect a scope from CWD. Pass `local-search scope set repo1,repo2` instead.")
	}
	path, err := scope.WriteProjectConfig(cwd, sc.Repos)
	if err != nil {
		die(err.Error())
	}
	fmt.Printf("Wrote %s with scope = %v (auto-detected from %s)\n", path, sc.Repos, sc.Source)
}

// printFindResponse renders a Response as a human-readable table with a
// prominent banner naming the searched repos, the table itself, a missing-
// sources block (if any), and a footer reminding the user where the scope
// config lives so they know what to edit to change it.
func printFindResponse(resp find.Response, query string) {
	// ── Banner: always show which repos were searched ──
	repoList := strings.Join(resp.Scope, ", ")
	if repoList == "" {
		repoList = "(none — empty scope)"
	}
	fmt.Println("─────────────────────────────────────────────────────────────")
	fmt.Printf("Searched repos: %s\n", repoList)
	fmt.Printf("Scope source:   %s\n", resp.ScopeSource)
	fmt.Printf("Results:        %d\n", len(resp.Results))
	fmt.Println("─────────────────────────────────────────────────────────────")

	if len(resp.Results) == 0 {
		fmt.Println("No results for: " + query)
		if len(resp.Scope) == 0 {
			fmt.Println()
			fmt.Println("Scope is empty. Edit .local-search.toml to add repos:")
			fmt.Println("  scope = [\"repo1\", \"repo2\"]")
			fmt.Println("Available repos: local-search repo list")
		}
	} else {
		fmt.Printf("\n%-6s  %-10s  %-22s  %-50s  %s\n",
			"SCORE", "TYPE", "REPO", "NAME", "LOCATION")
		for _, r := range resp.Results {
			loc := r.Path
			if r.Type == find.SourceCodeGraph && r.CodeGraph != nil && r.CodeGraph.LineStart > 0 {
				loc = fmt.Sprintf("%s:%d", r.CodeGraph.FilePath, r.CodeGraph.LineStart)
			}
			fmt.Printf("%-6.2f  %-10s  %-22s  %-50s  %s\n",
				r.Score, r.Type, r.Repo, truncate(r.Name, 50), loc)
		}
	}

	if len(resp.Missing) > 0 {
		fmt.Println("\nMissing sources:")
		for _, m := range resp.Missing {
			fmt.Printf("  [%s] %s\n        fix: %s\n", m.Repo, m.Reason, m.Fix)
		}
	}

	// ── Footer: tell the user where the scope config is ──
	fmt.Println()
	if strings.HasPrefix(resp.ScopeSource, "/") {
		// File-path source — point the user at it.
		fmt.Printf("(scope: %s — edit to change which repos are searched)\n", resp.ScopeSource)
	} else {
		// Non-file source (--scope flag, cwd-walk). Tell the user how to make
		// it permanent if they want to.
		fmt.Printf("(scope source: %s — run `local-search scope set repo1,repo2` to write a permanent .local-search.toml)\n", resp.ScopeSource)
	}
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-1] + "…"
}

func splitComma(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func filterScopeRepos(repos []localdb.RepoRow, names []string) []localdb.RepoRow {
	keep := map[string]bool{}
	for _, n := range names {
		keep[n] = true
	}
	out := make([]localdb.RepoRow, 0, len(names))
	for _, r := range repos {
		if keep[r.Name] {
			out = append(out, r)
		}
	}
	return out
}

// ── Help ──────────────────────────────────────────────────────────────────────

func cmdHelp() {
	fmt.Print(`local-search — search your project specs across multiple repos

Usage:
	local-search repo add <folder> [name] [--skip-directory <folder-name>]   Register a spec repo
  local-search repo remove <name>         Remove a repo
  local-search repo list                  Show all repos

  local-search graphs                                 List graph status (graphify + code-review-graph)
  local-search graphs add <name> <path> [--kind K]    Register a standalone graph (K = graphify | code-review-graph)
  local-search graphs remove <name>                   Unregister a standalone graph
  local-search graphs prune                           Forget standalone graphs whose files vanished
  local-search graph export <repo> [--edges M] [--out F]  Export a repo as node-link JSON (M = auto|vector|tags|nodes); round-trips via graphs add

  local-search find <query> [--scope <repos>]         Unified search: specs + graphify + code-review-graph
  local-search code <query> [--scope <repos>]         Search code-review-graph nodes by name
  local-search code hubs [--scope <repos>]            Top hub functions/classes
  local-search code blast <qualified> [--scope ...]   Impact set (depth 2, cap 50 by default)
  local-search code callers <qualified> [--scope ...] Direct callers
  local-search code callees <qualified> [--scope ...] Direct callees

  local-search scope show                             Print resolved scope and where it came from
  local-search scope set repo1,repo2                  Write .local-search.toml in CWD
  local-search scope clear                            Remove .local-search.toml from CWD
  local-search scope init                             Auto-detect nearest enclosing repo as scope

  local-search init | setup                           Show/create the project scope file (.agent/local-search-config.yaml)
  local-search init --add a,b | --remove a | --set a,b   Edit the project scope; --json prints machine state

  local-search scan                       Scan all repos
  local-search scan <repo-name>           Scan one repo

  local-search search <query>                                Search all repos (auto-routes to FTS+graph)
  local-search search <query> --repos all                    Every registered repo (default)
  local-search search <query> --repos graph-only             Only repos with graphify-out/
  local-search search <query> --repos repoA,repoB            Comma-separated subset
  local-search search <query> --source auto|fts|graph|both   Where results come from (default auto)
  local-search search <query> --rank auto|bm25|graph-aware   Ranking strategy (default auto)
  local-search search <query> --repo <name>                  Single repo (legacy; prefer --repos)
  local-search search <query> --exclude-location <pattern>   Exclude paths containing pattern
  local-search search <query> --semantic                     Hybrid FTS + vector re-ranking (RRF fusion)

  Auto rules:
    --source auto → both when any selected repo has graphify-out/, else fts
    --rank auto   → graph-aware when any selected repo has graphify-out/, else bm25
    The status line in [brackets] above results shows the resolved values.
  local-search read <name>                                   Read a spec
  local-search read <name> <repo>                            Read from specific repo
  local-search related <name>             Find related specs

  local-search list                       All specs, all repos
  local-search list <repo-or-project>     Filter by repo or project
  local-search projects                   List all projects
  local-search tags                       List all tags
  local-search tags <tag>                 Specs with a tag
  local-search recent [n]                 Recently modified (default 10)

  local-search graph tag <tag>                               kNN vector graph over specs with a tag (NetworkX JSON)
  local-search graph search <query> [--repo <name>]          Ego vector graph seeded by a query (NetworkX JSON)

  local-search ui                         Start the web UI daemon and open the browser
  local-search ui --port <n>              Start on a specific port (default 8787)
  local-search ui stop                    Stop the web UI daemon
  local-search ui status                  Show whether the web UI is running

  local-search stats                      Index statistics
  local-search db                         Print database file path
  local-search inspect                    Dump full index
  local-search reset                      Delete everything and start over

  local-search install-skill              Install the bundled Claude skill globally (~/.claude/skills)
  local-search install-skill --local      Install into this project (./.claude/skills)
  local-search install-skill --dir <path> Install into a specific skills directory
  local-search install-skill --force      Overwrite an existing install

  local-search help                       This help
  local-search -v, --version             Print version and exit

JSON output (for agents):
  local-search json search <query> [repo] [--semantic]
  local-search json read <name>
  local-search json list [repo-or-project]
  local-search json repos
  local-search json related <name>
  local-search json tags
  local-search json stats

Supported file types:
  Indexed directly:         .md  .mdx  .txt
  With companion .md:       .jpg .jpeg .png .gif .webp .svg .pdf

File locations:
  Repo list:  ~/.local-search/repos
  Database:   ~/.local-search/specs.db
`)
}

// ── Repo file helpers ─────────────────────────────────────────────────────────

type repoEntry struct {
	Name            string
	Path            string
	SkipDirectories []string
	AddedAt         string // RFC3339; empty = unknown (legacy lines)
}

func parseRepoEntryLine(line string) (repoEntry, bool) {
	parts := strings.SplitN(line, "|", 4)
	if len(parts) < 2 {
		return repoEntry{}, false
	}
	r := repoEntry{Name: parts[0], Path: parts[1]}
	if len(parts) >= 3 && strings.TrimSpace(parts[2]) != "" {
		r.SkipDirectories = strings.Split(parts[2], ",")
	}
	if len(parts) == 4 {
		if ts := strings.TrimSpace(parts[3]); ts != "" {
			if _, err := time.Parse(time.RFC3339, ts); err == nil {
				r.AddedAt = ts
			}
		}
	}
	norm, err := normalizeSkipDirectoryNames(r.SkipDirectories)
	if err != nil {
		return repoEntry{}, false
	}
	r.SkipDirectories = norm
	return r, true
}

func formatRepoEntryLine(r repoEntry) string {
	line := r.Name + "|" + r.Path
	var skip string
	if len(r.SkipDirectories) > 0 {
		if norm, err := normalizeSkipDirectoryNames(r.SkipDirectories); err == nil {
			skip = strings.Join(norm, ",")
		}
	}
	// added_at is positional (4th field). When it is present we MUST emit the
	// (possibly empty) 3rd skip-dirs field as a placeholder so the timestamp
	// stays in the 4th position — otherwise it lands in the skip-dirs field and
	// the line is dropped on the next load (R-6.6).
	if r.AddedAt != "" {
		line += "|" + skip + "|" + r.AddedAt
	} else if skip != "" {
		line += "|" + skip
	}
	return line
}

func loadRepos() []repoEntry {
	f, err := os.Open(reposFile)
	if err != nil {
		return nil
	}
	defer f.Close()

	var repos []repoEntry
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		if r, ok := parseRepoEntryLine(line); ok {
			repos = append(repos, r)
		}
	}
	return repos
}

func loadReposOrDie() []repoEntry {
	repos := loadRepos()
	if len(repos) == 0 {
		die("No repos added yet. Run: local-search repo add /path/to/specs")
	}
	return repos
}

func saveRepos(repos []repoEntry) {
	f, err := os.Create(reposFile)
	if err != nil {
		die(err.Error())
	}
	defer f.Close()
	for _, r := range repos {
		fmt.Fprintln(f, formatRepoEntryLine(r))
	}
}

func repoExists(repos []repoEntry, name, path string) bool {
	for _, r := range repos {
		if r.Name == name || r.Path == path {
			return true
		}
	}
	return false
}

// ── DB helper ─────────────────────────────────────────────────────────────────

func openDB() *sql.DB {
	if err := os.MkdirAll(appDir, 0755); err != nil {
		die(err.Error())
	}
	db, err := localdb.Open(dbFile)
	if err != nil {
		die("Cannot open database: " + err.Error())
	}
	if err := localdb.CreateSchema(db); err != nil {
		die("Cannot create schema: " + err.Error())
	}
	return db
}

// ── misc ──────────────────────────────────────────────────────────────────────

func die(msg string) {
	fmt.Fprintln(os.Stderr, "Error: "+msg)
	os.Exit(1)
}

// Suppress "imported and not used" for extract package used only indirectly via db/index.go
var _ = extract.TextExts
