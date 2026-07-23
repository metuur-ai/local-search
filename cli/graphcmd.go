// `graph explain` (Unit 4): one-hop typed neighborhood with provenance,
// served straight from SQL (LLD B3 doctrine — no external binary). main.go
// only dispatches here; everything about the command lives in this file.
//
// Machine contract (R-4.3/R-4.4, documented in
// docs/guides/graph-explain.md):
//
//	exit 0  entity found (including 'conflict' and 'unresolved' phantoms)
//	exit 1  usage error (matches the codebase-wide die() convention)
//	exit 2  entity not found — in --json mode stdout still carries a
//	        well-formed JSON result with "found": false, never an error blob
//	exit 3  DB missing — instructs the user to run `scan`; NEVER scans
//	        implicitly (R-4.5)
//
// JSON evolution is additive-only: fields may be added, never renamed,
// removed, or re-typed; schema_version bumps only on an additive change.
package main

import (
	"fmt"
	"os"
	"strings"

	localdb "local-search/db"
)

// Exit codes of `graph explain` (R-4.4). Distinct by requirement; 1 is shared
// with the global die() usage-error convention on purpose.
const (
	exitExplainFound    = 0
	exitExplainUsage    = 1
	exitExplainNotFound = 2
	exitExplainNoDB     = 3
)

// explainSchemaVersion is the version stamped into every --json envelope
// (R-4.3). Bump only for additive changes.
const explainSchemaVersion = 1

// JSON envelope types. Field order is fixed by the struct definitions and
// encoding/json emits struct fields in declaration order, so two runs over
// the same graph state are byte-identical (R-4.3).
type explainNodeJSON struct {
	ID         string   `json:"id"`
	Kind       string   `json:"kind"`
	Repo       string   `json:"repo"`
	Path       string   `json:"path"`
	Title      string   `json:"title"`
	Flags      string   `json:"flags"`
	Provenance []string `json:"provenance"`
}

type explainEdgeJSON struct {
	Src   string `json:"src"`
	Dst   string `json:"dst"`
	Repo  string `json:"repo"`
	Path  string `json:"path"`
	Field string `json:"field"`
}

type explainGroupJSON struct {
	Type  string            `json:"type"`
	Edges []explainEdgeJSON `json:"edges"`
}

type explainJSON struct {
	SchemaVersion int                `json:"schema_version"`
	Query         string             `json:"query"`
	Found         bool               `json:"found"`
	Node          *explainNodeJSON   `json:"node"`
	Outgoing      []explainGroupJSON `json:"outgoing"`
	Incoming      []explainGroupJSON `json:"incoming"`
}

// cmdGraphExplain implements `graph explain <entity> [--json]` (R-4.1…R-4.5).
func cmdGraphExplain(args []string) {
	const usage = "Usage: local-search graph explain <entity> [--json]"

	var entity string
	var asJSON bool
	for _, a := range args {
		switch {
		case a == "--json" || a == "-json":
			asJSON = true
		case strings.HasPrefix(a, "-"):
			die("unknown flag for graph explain: " + a + "\n" + usage)
		case entity != "":
			die("graph explain takes a single <entity>\n" + usage)
		default:
			entity = a
		}
	}
	if entity == "" {
		die(usage)
	}

	// R-4.5: a query never scans. Fail fast with the scan instruction instead
	// of going through ensureDB (which would bootstrap a scan).
	if _, err := os.Stat(dbFile); os.IsNotExist(err) {
		fmt.Fprintln(os.Stderr, "Error: no database found — run `local-search scan` first")
		os.Exit(exitExplainNoDB)
	}

	db := openDB()
	defer db.Close()

	node, outgoing, incoming, err := localdb.KGExplain(db, entity)
	if err != nil {
		die(err.Error())
	}

	if asJSON {
		env := explainJSON{
			SchemaVersion: explainSchemaVersion,
			Query:         entity,
			Found:         node != nil,
			Outgoing:      groupExplainEdges(outgoing),
			Incoming:      groupExplainEdges(incoming),
		}
		if node != nil {
			prov := node.Provenance
			if prov == nil {
				prov = []string{}
			}
			env.Node = &explainNodeJSON{
				ID: node.ID, Kind: node.Kind, Repo: node.Repo, Path: node.Path,
				Title: node.Title, Flags: node.Flags, Provenance: prov,
			}
		}
		// R-4.3: JSON only on stdout — same encoder as `graph tag|search`.
		localdb.PrintJSON(env)
		if node == nil {
			os.Exit(exitExplainNotFound) // R-4.4: well-formed result + distinct code
		}
		return // exitExplainFound
	}

	if node == nil {
		fmt.Fprintf(os.Stderr, "Error: no graph entity found for %q — nothing declares or references it\n", entity)
		os.Exit(exitExplainNotFound)
	}
	printExplainHuman(node, outgoing, incoming)
}

// groupExplainEdges folds a canonically ordered edge list (type, src, dst,
// repo, path, field — see db/kgexplain.go) into contiguous per-type groups
// (R-4.1 "grouped by type"). Always returns a non-nil slice so JSON renders
// [] rather than null.
func groupExplainEdges(edges []localdb.KGEdge) []explainGroupJSON {
	groups := make([]explainGroupJSON, 0)
	for _, e := range edges {
		if len(groups) == 0 || groups[len(groups)-1].Type != e.Type {
			groups = append(groups, explainGroupJSON{Type: e.Type, Edges: []explainEdgeJSON{}})
		}
		g := &groups[len(groups)-1]
		g.Edges = append(g.Edges, explainEdgeJSON{
			Src: e.Src, Dst: e.Dst, Repo: e.Repo, Path: e.Path, Field: e.Field,
		})
	}
	return groups
}

// printExplainHuman renders the node and its grouped one-hop neighborhood.
// Everything is emitted in the same canonical order as the JSON envelope, so
// human output is deterministic too (R-4.1). Every item carries its origin
// repo and file path (R-4.2).
func printExplainHuman(node *localdb.KGNode, outgoing, incoming []localdb.KGEdge) {
	head := node.ID
	if node.Kind != "" {
		head += "  [" + node.Kind + "]"
	}
	if node.Flags != "" {
		head += "  (" + node.Flags + ")"
	}
	fmt.Println(head)
	if node.Title != "" {
		fmt.Println("  title:   " + node.Title)
	}
	if node.Flags == "unresolved" {
		fmt.Println("  defined: (phantom — referenced below but never declared)")
	} else {
		fmt.Println("  defined: " + node.Repo + ":" + node.Path)
	}
	if len(node.Provenance) > 1 {
		fmt.Println("  all definers: " + strings.Join(node.Provenance, ", "))
	}

	printExplainDirection("outgoing", "->", outgoing, func(e localdb.KGEdge) string { return e.Dst })
	printExplainDirection("incoming", "<-", incoming, func(e localdb.KGEdge) string { return e.Src })
}

func printExplainDirection(label, arrow string, edges []localdb.KGEdge, other func(localdb.KGEdge) string) {
	fmt.Println()
	if len(edges) == 0 {
		fmt.Println(label + ": (none)")
		return
	}
	fmt.Println(label + ":")
	last := ""
	for _, e := range edges {
		if e.Type != last {
			fmt.Println("  " + e.Type + ":")
			last = e.Type
		}
		fmt.Printf("    %s %s  (%s:%s, field %s)\n", arrow, other(e), e.Repo, e.Path, e.Field)
	}
}
