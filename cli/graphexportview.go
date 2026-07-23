package main

// graphexportview.go implements `local-search graph export-view`: select several
// registered repos (via --repos/--all or an interactive TTY picker), build each
// repo's per-repo knowledge graph exactly as single-repo `graph export` would,
// then merge them into ONE viewer-ready NetworkX {nodes,links} JSON. Per-repo
// node ids are rowid-derived and collide across repos, so every id/source/target
// is namespaced with a `<repo>:` prefix (see docs/lld/graph-export-view-multi-repo.md).

import (
	"bufio"
	"database/sql"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"

	localdb "local-search/db"
)

// repoGraph pairs a repo name with the graph exported for it, so mergeGraphs can
// namespace every node/link by its owning repo.
type repoGraph struct {
	repo string
	g    localdb.NodeLinkGraph
}

// cmdGraphExportView implements `graph export-view [--repos a,b | --all]
// [--edges auto|vector|tags|nodes] [--out <file>]`.
func cmdGraphExportView(db *sql.DB, args []string) {
	const usage = "Usage: local-search graph export-view [--repos a,b | --all] [--edges auto|vector|tags|nodes] [--out <file>]"
	var (
		reposFlag string
		allFlag   bool
		edges     = "auto"
		outPath   = "graph.json"
	)
	for i := 0; i < len(args); i++ {
		switch a := args[i]; a {
		case "--repos":
			if i+1 >= len(args) {
				die("--repos needs a comma-separated list")
			}
			reposFlag = args[i+1]
			i++
		case "--all":
			allFlag = true
		case "--edges":
			if i+1 >= len(args) {
				die("--edges needs a value (auto|vector|tags|nodes)")
			}
			edges = args[i+1]
			i++
		case "--out":
			if i+1 >= len(args) {
				die("--out needs a file path")
			}
			outPath = args[i+1]
			i++
		default:
			die("unknown flag for graph export-view: " + a + "\n" + usage)
		}
	}

	// R-1.5: validate --edges up front so a bad value always errors naming the
	// set, regardless of how repos are selected.
	switch edges {
	case "auto", "vector", "tags", "nodes":
		// valid
	default:
		die("unknown --edges value: " + edges + " (want auto|vector|tags|nodes)")
	}

	repos, err := localdb.Repos(db)
	if err != nil {
		die(err.Error())
	}

	// Resolve selection → sorted, deduped, validated repo names (R-2.*, R-3.3).
	selected := selectRepos(repos, reposFlag, allFlag, usage)

	// Build each selected repo's subgraph, resolving `auto` per repo (R-3.1/3.2).
	perRepo := make([]repoGraph, 0, len(selected))
	for _, repo := range selected {
		re := edges
		if re == "auto" {
			hasVec, err := localdb.RepoHasVectors(db, repo)
			if err != nil {
				die(err.Error())
			}
			if hasVec {
				re = "vector"
			} else {
				re = "tags"
			}
			fmt.Fprintf(os.Stderr, "graph export-view: %s edges=%s (auto)\n", repo, re)
		}
		g, err := localdb.RepoGraph(db, repo, re, false, 0.3, 8)
		if err != nil {
			die(err.Error())
		}
		perRepo = append(perRepo, repoGraph{repo: repo, g: g})
	}

	merged := mergeGraphs(perRepo)

	// R-5.1: write via WriteJSONFile. R-5.2: summary to stderr, stdout stays empty.
	if err := localdb.WriteJSONFile(outPath, merged); err != nil {
		die("cannot write " + outPath + ": " + err.Error())
	}
	fmt.Fprintf(os.Stderr, "wrote %d nodes, %d links from %d repo(s) → %s\n",
		len(merged.Nodes), len(merged.Links), len(selected), outPath)
}

// selectRepos turns flags (or an interactive prompt) into a sorted, deduped,
// validated set of registered repo names. It dies on any error and never returns
// an empty selection.
func selectRepos(repos []localdb.RepoRow, reposFlag string, allFlag bool, usage string) []string {
	names := make([]string, 0, len(repos))
	known := make(map[string]bool, len(repos))
	for _, r := range repos {
		names = append(names, r.Name)
		known[r.Name] = true
	}

	var chosen []string
	switch {
	case allFlag:
		// R-2.1: every registered repo.
		chosen = append(chosen, names...)
	case reposFlag != "":
		// R-2.2 / R-2.3: exactly the named repos; unknown name → die with list.
		for _, part := range strings.Split(reposFlag, ",") {
			name := strings.TrimSpace(part)
			if name == "" {
				continue
			}
			if !known[name] {
				die("unknown repo: " + name + "\nRegistered repos: " + strings.Join(names, ", ") +
					"\n(See `local-search repo list`.)")
			}
			chosen = append(chosen, name)
		}
	default:
		// No selection flags: interactive picker only when stdin is a TTY,
		// otherwise die without ever reading stdin (R-2.6).
		fi, _ := os.Stdin.Stat()
		isTTY := fi != nil && fi.Mode()&os.ModeCharDevice != 0
		if !isTTY {
			die(usage)
		}
		chosen = promptRepoSelection(repos)
	}

	// R-2.8: dedupe. R-3.3: ascending name order for deterministic output.
	chosen = dedupSort(chosen)
	// R-2.9: empty resolved selection → die, write nothing.
	if len(chosen) == 0 {
		die(usage)
	}
	return chosen
}

// promptRepoSelection prints a numbered repo list (with honest spec counts) to
// stderr and reads one selection line from stdin (R-2.4/2.5/2.7). Returns the
// chosen repo names (empty for an empty line, R-2.9).
func promptRepoSelection(repos []localdb.RepoRow) []string {
	for i, r := range repos {
		// R-2.4: display RepoRow.Count (spec_count), NOT GraphNodeCount.
		fmt.Fprintf(os.Stderr, "%d. %s  (%d specs)\n", i+1, r.Name, r.Count)
	}
	fmt.Fprint(os.Stderr, "Include (e.g. 1,3 or all): ")

	line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
	line = strings.TrimSpace(line)
	if strings.EqualFold(line, "all") {
		out := make([]string, len(repos))
		for i, r := range repos {
			out[i] = r.Name
		}
		return out
	}
	if line == "" {
		return nil
	}

	var out []string
	for _, part := range strings.Split(line, ",") {
		tok := strings.TrimSpace(part)
		if tok == "" {
			continue
		}
		idx, err := strconv.Atoi(tok)
		if err != nil || idx < 1 || idx > len(repos) {
			die("invalid selection: " + tok + " (enter comma-separated numbers 1.." +
				strconv.Itoa(len(repos)) + " or 'all')")
		}
		out = append(out, repos[idx-1].Name)
	}
	return out
}

// dedupSort returns the input with duplicates removed and sorted ascending.
func dedupSort(in []string) []string {
	seen := make(map[string]bool, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	sort.Strings(out)
	return out
}

// mergeGraphs namespaces every node id and link endpoint by its owning repo,
// concatenates the subgraphs into one NodeLinkGraph, and sorts deterministically
// (R-4.*, R-5.3, R-5.5). Node fields other than ID (Path/Type/Repo/…) are left
// untouched so the viewer's path-based coloring is unaffected.
func mergeGraphs(perRepo []repoGraph) localdb.NodeLinkGraph {
	repoNames := make([]string, 0, len(perRepo))
	merged := localdb.NodeLinkGraph{
		Directed:   false,
		Multigraph: false,
		Nodes:      []localdb.GraphNode{},
		Links:      []localdb.GraphLink{},
	}

	for _, pr := range perRepo {
		repoNames = append(repoNames, pr.repo)
		prefix := pr.repo + ":"
		for _, n := range pr.g.Nodes {
			n.ID = prefix + n.ID // R-4.1 (loop copy — source graph untouched)
			merged.Nodes = append(merged.Nodes, n)
		}
		for _, l := range pr.g.Links {
			l.Source = prefix + l.Source // R-4.2
			l.Target = prefix + l.Target
			merged.Links = append(merged.Links, l)
		}
	}

	// R-5.5: deterministic top-level metadata.
	sort.Strings(repoNames)
	merged.Graph = map[string]any{"repos": repoNames}

	// R-5.3: node ids are unique (repo-prefixed rowids), so a plain sort is a
	// total order; links may share (source,target) pairs, so sort stably.
	sort.Slice(merged.Nodes, func(i, j int) bool {
		return merged.Nodes[i].ID < merged.Nodes[j].ID
	})
	sort.SliceStable(merged.Links, func(i, j int) bool {
		if merged.Links[i].Source != merged.Links[j].Source {
			return merged.Links[i].Source < merged.Links[j].Source
		}
		return merged.Links[i].Target < merged.Links[j].Target
	})

	return merged
}
