// One-hop knowledge-graph reads for `graph explain` (Unit 4, R-4.1).
//
// Like every kg read that leaves the db layer (see kgexport.go), all queries
// here carry an explicit canonical ORDER BY so SQLite storage order, Go map
// iteration, or scan-worker scheduling can never leak into observable output.
// Within one direction the order is (type, src, dst, repo, path, field): the
// leading `type` keeps each edge-type group contiguous (R-4.1 "grouped by
// type"); inside a group — where type is constant — the remaining columns are
// exactly R-3.2's canonical edge sort (src, type, dst) extended by the
// provenance columns, so explain output and export output agree (R-4.3).
package db

import (
	"database/sql"
	"encoding/json"
)

// KGNode is one resolved node row from kg_nodes, with provenance decoded from
// its JSON column. Repo/Path are the winning declaring file (R-4.2); both are
// empty for 'unresolved' phantoms, whose provenance lives on the referencing
// edges instead.
type KGNode struct {
	ID         string
	Kind       string
	Repo       string
	Path       string
	Title      string
	Flags      string
	Provenance []string
}

// KGEdge is one typed edge row from kg_edges, carrying full provenance
// (declaring repo, file, and originating frontmatter field — R-4.2).
type KGEdge struct {
	Src   string
	Dst   string
	Type  string
	Repo  string
	Path  string
	Field string
}

// KGExplain returns the resolved node for id (nil when the id is unknown —
// phantoms DO have kg_nodes rows, so nil strictly means "never declared and
// never referenced"), plus its direct edges in both directions in canonical
// order (R-4.1). Data is drawn from the shared DB across all registered
// repos; the caller's working directory plays no role.
func KGExplain(db *sql.DB, id string) (node *KGNode, outgoing, incoming []KGEdge, err error) {
	row := db.QueryRow(
		"SELECT id,kind,repo,path,title,flags,provenance FROM kg_nodes WHERE id = ?", id,
	)
	var n KGNode
	var prov string
	switch err := row.Scan(&n.ID, &n.Kind, &n.Repo, &n.Path, &n.Title, &n.Flags, &prov); err {
	case nil:
		if prov != "" {
			if err := json.Unmarshal([]byte(prov), &n.Provenance); err != nil {
				return nil, nil, nil, err
			}
		}
		node = &n
	case sql.ErrNoRows:
		// unknown id: node stays nil; edge queries below return empty.
	default:
		return nil, nil, nil, err
	}

	outgoing, err = kgEdgeQuery(db,
		"SELECT src,dst,type,repo,path,field FROM kg_edges WHERE src = ? "+
			"ORDER BY type, src, dst, repo, path, field", id)
	if err != nil {
		return nil, nil, nil, err
	}
	incoming, err = kgEdgeQuery(db,
		"SELECT src,dst,type,repo,path,field FROM kg_edges WHERE dst = ? "+
			"ORDER BY type, src, dst, repo, path, field", id)
	if err != nil {
		return nil, nil, nil, err
	}
	return node, outgoing, incoming, nil
}

func kgEdgeQuery(db *sql.DB, q, id string) ([]KGEdge, error) {
	rows, err := db.Query(q, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []KGEdge
	for rows.Next() {
		var e KGEdge
		if err := rows.Scan(&e.Src, &e.Dst, &e.Type, &e.Repo, &e.Path, &e.Field); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
