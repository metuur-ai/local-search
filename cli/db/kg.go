// Knowledge-graph resolution (Phase 1): the GLOBAL post-scan pass that
// rebuilds the resolved node layer (kg_nodes) from every registered repo's raw
// declarations (kg_decls) and typed edges (kg_edges).
package db

import (
	"database/sql"
	"encoding/json"
	"sort"

	"local-search/extract"
)

// kgDecl is one raw per-file declaration row, as written by insertKGSpec.
type kgDecl struct {
	repo, path, kind, title string
}

// provKey is the total order used everywhere a winner or a listing must be
// deterministic: the lexicographic `repo:path` string (LLD: "Deterministic
// conflict winner (smallest repo:path)"). Column-wise (repo, path) ordering is
// NOT equivalent (e.g. "a1:b" < "a:z" as strings), so the concatenated key is
// compared directly.
func (d kgDecl) provKey() string { return d.repo + ":" + d.path }

// resolveKG recomputes canonical-ID resolution globally across all registered
// repos' data (R-3.1). It runs inside the SAME transaction as every scan and
// repo removal — never incrementally per repo, because merge, conflict, and
// phantom state all depend on other repos' declarations.
//
// Rules:
//   - Exactly one declaration → plain node (R-1.1 canonical / R-1.2 fallback).
//     References never declare, so a reference in repo A to a definition in
//     repo B merges onto B's node instead of forking one (R-1.3).
//   - Multiple declarations of one canonical ID → ONE node: the definition
//     with the lexicographically smallest `repo:path` wins, the node is
//     flagged 'conflict', and every defining file is retained in the JSON
//     provenance column (R-1.4).
//   - Edge endpoints with no declaration anywhere → phantom node flagged
//     'unresolved' (R-1.5), kind derived from the ID scheme when the ID is
//     canonical-shaped.
//
// kg_nodes is fully derived, so it is rebuilt from scratch: that is the only
// way conflict/phantom state stays correct when contributors disappear
// (file delete, repo remove) as well as when they appear.
func resolveKG(tx *sql.Tx) error {
	// 1. Load all raw declarations, grouped by declared ID.
	decls := map[string][]kgDecl{}
	rows, err := tx.Query("SELECT id, repo, path, kind, title FROM kg_decls")
	if err != nil {
		return err
	}
	for rows.Next() {
		var id string
		var d kgDecl
		if err := rows.Scan(&id, &d.repo, &d.path, &d.kind, &d.title); err != nil {
			rows.Close()
			return err
		}
		decls[id] = append(decls[id], d)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	// 2. Load every edge endpoint for phantom detection (R-1.5).
	endpoints := map[string]bool{}
	rows, err = tx.Query("SELECT src FROM kg_edges UNION SELECT dst FROM kg_edges")
	if err != nil {
		return err
	}
	for rows.Next() {
		var ep string
		if err := rows.Scan(&ep); err != nil {
			rows.Close()
			return err
		}
		endpoints[ep] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	// 3. Rebuild the resolved layer. Full wipe is intentional: kg_nodes is a
	// derived projection of kg_decls+kg_edges (never edited elsewhere), and a
	// partial update could strand rows whose contributors vanished.
	if _, err := tx.Exec("DELETE FROM kg_nodes"); err != nil {
		return err
	}
	stmt, err := tx.Prepare(
		"INSERT INTO kg_nodes (id,kind,repo,path,title,flags,provenance) VALUES (?,?,?,?,?,?,?)",
	)
	if err != nil {
		return err
	}
	defer stmt.Close()

	// Deterministic insert order (groundwork for the Unit 3 equivalence gate).
	ids := make([]string, 0, len(decls))
	for id := range decls {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	for _, id := range ids {
		ds := decls[id]
		// Winner = lexicographically smallest `repo:path` (R-1.4); the same
		// order fixes the provenance listing.
		sort.Slice(ds, func(i, j int) bool { return ds[i].provKey() < ds[j].provKey() })
		winner := ds[0]
		flags := ""
		if len(ds) > 1 {
			flags = "conflict" // R-1.4: duplicate canonical-ID definitions
		}
		prov := make([]string, len(ds))
		for i, d := range ds {
			prov[i] = d.provKey()
		}
		pj, err := json.Marshal(prov)
		if err != nil {
			return err
		}
		if _, err := stmt.Exec(id, winner.kind, winner.repo, winner.path, winner.title, flags, string(pj)); err != nil {
			return err
		}
	}

	// 4. Phantoms: referenced anywhere, declared nowhere (R-1.5). They carry no
	// file provenance of their own — the referencing edges hold theirs.
	eps := make([]string, 0, len(endpoints))
	for ep := range endpoints {
		if _, declared := decls[ep]; !declared {
			eps = append(eps, ep)
		}
	}
	sort.Strings(eps)
	for _, ep := range eps {
		if _, err := stmt.Exec(ep, extract.KindOfID(ep), "", "", "", "unresolved", "[]"); err != nil {
			return err
		}
	}
	return nil
}
