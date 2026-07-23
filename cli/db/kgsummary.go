// Scan-summary support (task 5.1, R-5.1): the per-repo knowledge-graph
// feedback printed after every scan — the only loop telling the user whether
// registration+scan yielded a graph worth querying (sparse-yield risk).
//
// Two data sources feed the summary:
//
//  1. The kg tables themselves (kg_decls / kg_edges / kg_nodes) — always
//     current, queried at summary time with the canonical sorts.
//  2. Scan-time aggregates that exist only while the file stream is in flight
//     (malformed-frontmatter paths per R-2.3, unrecognized relational-looking
//     field counts per R-2.4). FullScan persists those per repo in the meta
//     table, inside the scan transaction, via writeKGScanStats. The scan
//     command always re-reads the whole target repo (`scan all` → FullScan,
//     `scan <name>` → ReplaceRepo → FullScan), so the stats are fresh whenever
//     a summary is printed; IncrementalScan runs only on query-command
//     bootstrap paths, which never print a summary.
package db

import (
	"database/sql"
	"encoding/json"
	"sort"
)

// kgScanStatsPrefix keys the per-repo scan aggregates in the meta table.
const kgScanStatsPrefix = "kg_scan_stats_"

// kgScanStats is the persisted JSON shape. Malformed is sorted and the map
// marshals with sorted keys, so the stored value is deterministic (R-3.2's
// "canonical sort everywhere" discipline applies to every observable output).
type kgScanStats struct {
	Malformed    []string       `json:"malformed"`    // repo-relative paths (R-2.3)
	Unrecognized map[string]int `json:"unrecognized"` // field name → occurrence count (R-2.4)
}

// writeKGScanStats stores one repo's scan aggregates inside the scan tx.
func writeKGScanStats(tx *sql.Tx, repo string, malformed []string, unrec map[string]int) error {
	if malformed == nil {
		malformed = []string{}
	}
	if unrec == nil {
		unrec = map[string]int{}
	}
	sort.Strings(malformed)
	blob, err := json.Marshal(kgScanStats{Malformed: malformed, Unrecognized: unrec})
	if err != nil {
		return err
	}
	_, err = tx.Exec("INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)",
		kgScanStatsPrefix+repo, string(blob))
	return err
}

// KGFieldCount is one unrecognized relational-looking frontmatter field and
// how many files used it (R-2.4 → surfaced per R-5.1).
type KGFieldCount struct {
	Field string
	Count int
}

// KGRepoSummary is the per-repo scan summary (R-5.1). "Structural" is the
// legacy extraction profile (every indexed file yields a fallback file-identity
// node); "typed" is the knowledge-graph profile (canonical-ID nodes and typed
// frontmatter edges).
type KGRepoSummary struct {
	StructuralNodes int // fallback nodes this repo declares (kind='file', R-1.2)
	TypedNodes      int // canonical-ID nodes this repo declares (R-1.1)
	TypedEdges      int // typed edges this repo's files declare (R-2.1)
	Conflicts       int // distinct IDs this repo declares that resolved 'conflict' (R-1.4)
	Unresolved      int // distinct phantom IDs this repo's edges reference (R-1.5)

	MalformedFiles  []string       // sorted repo-relative paths (R-2.3 warnings)
	TopUnrecognized []KGFieldCount // count desc, then field asc; capped at kgTopUnrecognized
}

// kgTopUnrecognized caps the "top unrecognized relational fields" listing.
const kgTopUnrecognized = 5

// KGScanSummary computes one repo's post-scan summary. Every listing is
// deterministically ordered, so two identical scans summarize byte-identically.
func KGScanSummary(db *sql.DB, repo string) (KGRepoSummary, error) {
	var s KGRepoSummary

	counts := []struct {
		dst   *int
		query string
	}{
		{&s.StructuralNodes, "SELECT COUNT(*) FROM kg_decls WHERE repo=? AND kind='file'"},
		{&s.TypedNodes, "SELECT COUNT(*) FROM kg_decls WHERE repo=? AND kind!='file'"},
		{&s.TypedEdges, "SELECT COUNT(*) FROM kg_edges WHERE repo=?"},
		// A conflict is attributed to every repo that declares the contested ID
		// (R-1.4 keeps all definers in provenance); a phantom to every repo
		// whose edges reference it (phantoms carry no file provenance of their
		// own — R-1.5).
		{&s.Conflicts, "SELECT COUNT(DISTINCT d.id) FROM kg_decls d " +
			"JOIN kg_nodes n ON n.id=d.id WHERE d.repo=? AND n.flags='conflict'"},
		{&s.Unresolved, "SELECT COUNT(DISTINCT e.dst) FROM kg_edges e " +
			"JOIN kg_nodes n ON n.id=e.dst WHERE e.repo=? AND n.flags='unresolved'"},
	}
	for _, c := range counts {
		if err := db.QueryRow(c.query, repo).Scan(c.dst); err != nil {
			return s, err
		}
	}

	if raw := GetMeta(db, kgScanStatsPrefix+repo); raw != "" {
		var stats kgScanStats
		if err := json.Unmarshal([]byte(raw), &stats); err != nil {
			return s, err
		}
		s.MalformedFiles = stats.Malformed
		sort.Strings(s.MalformedFiles) // stored sorted; re-sort defensively
		for f, n := range stats.Unrecognized {
			s.TopUnrecognized = append(s.TopUnrecognized, KGFieldCount{Field: f, Count: n})
		}
		sort.Slice(s.TopUnrecognized, func(i, j int) bool {
			a, b := s.TopUnrecognized[i], s.TopUnrecognized[j]
			if a.Count != b.Count {
				return a.Count > b.Count
			}
			return a.Field < b.Field
		})
		if len(s.TopUnrecognized) > kgTopUnrecognized {
			s.TopUnrecognized = s.TopUnrecognized[:kgTopUnrecognized]
		}
		// Canonical zero form: a clean repo summarizes to the zero struct
		// whether or not stats were persisted (JSON round-trips `[]` as a
		// non-nil empty slice; don't let that leak into comparisons).
		if len(s.MalformedFiles) == 0 {
			s.MalformedFiles = nil
		}
		if len(s.TopUnrecognized) == 0 {
			s.TopUnrecognized = nil
		}
	}
	return s, nil
}
