package main

import (
	"database/sql"
	"fmt"
	"os"
	"strings"

	localdb "local-search/db"
)

// printKGScanSummary prints the per-repo knowledge-graph scan summary (task
// 5.1, R-5.1) right under the repo's "N files indexed" line. Together with
// that line it covers every R-5.1 field: files scanned (existing line, kept
// untouched per R-5.4), nodes/edges per extraction profile, warnings
// (malformed frontmatter, R-2.3), conflict/unresolved counts (R-1.4/R-1.5),
// and the top unrecognized relational-looking fields (R-2.4).
//
// Wording is deterministic: fixed templates, counts from canonically-sorted
// queries, sorted listings — two identical scans print byte-identical
// summaries. Failure to summarize never fails the scan itself: the index was
// already committed, so we warn on stderr and keep going.
func printKGScanSummary(db *sql.DB, repoName string) {
	s, err := localdb.KGScanSummary(db, repoName)
	if err != nil {
		fmt.Fprintf(os.Stderr, "  %s: warning — kg summary unavailable: %v\n", repoName, err)
		return
	}

	fmt.Printf("    kg: structural %d nodes; typed %d nodes, %d edges; conflicts %d, unresolved %d\n",
		s.StructuralNodes, s.TypedNodes, s.TypedEdges, s.Conflicts, s.Unresolved)

	if len(s.MalformedFiles) > 0 {
		fmt.Printf("    kg: malformed frontmatter (%d): %s\n",
			len(s.MalformedFiles), strings.Join(s.MalformedFiles, ", "))
	}

	if len(s.TopUnrecognized) > 0 {
		parts := make([]string, 0, len(s.TopUnrecognized))
		for _, fc := range s.TopUnrecognized {
			parts = append(parts, fmt.Sprintf("%s (%d)", fc.Field, fc.Count))
		}
		fmt.Printf("    kg: unrecognized relational fields: %s\n", strings.Join(parts, ", "))
	}
}
