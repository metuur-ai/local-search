// Canonical knowledge-graph export (Unit 3). The kg tables are keyed on
// canonical STRING IDs, but SQLite returns unordered SELECTs in storage
// (rowid) order — and rowids depend on insert order, which the parallel scan
// workers do not fix. Every kg read that leaves the db layer therefore goes
// through the canonical ORDER BY below (LLD: "canonical sort everywhere"), so
// Go map iteration or worker scheduling can never leak into observable output.
package db

import (
	"database/sql"
	"strings"
)

// KGExport serializes the knowledge-graph state in the canonical order R-3.2
// mandates: nodes sorted by ID; edges sorted by (src, type, dst), then by the
// remaining provenance columns (repo, path, field) so multi-provenance edge
// groups are totally ordered too. Two DBs hold the same graph state iff their
// exports are byte-identical — the property the rebuild-equivalence (R-3.2)
// and incremental≡full-scan (R-3.3) gates diff-test.
//
// SQLite's default BINARY collation makes ORDER BY on these TEXT columns a
// bytewise sort, identical to Go string comparison — no locale can change the
// order between two machines or two runs.
func KGExport(db *sql.DB) (string, error) {
	var b strings.Builder

	nodeRows, err := db.Query(
		"SELECT id,kind,repo,path,title,flags,provenance FROM kg_nodes ORDER BY id",
	)
	if err != nil {
		return "", err
	}
	for nodeRows.Next() {
		var id, kind, repo, path, title, flags, prov string
		if err := nodeRows.Scan(&id, &kind, &repo, &path, &title, &flags, &prov); err != nil {
			nodeRows.Close()
			return "", err
		}
		b.WriteString("node\t" + id + "\t" + kind + "\t" + repo + "\t" + path +
			"\t" + title + "\t" + flags + "\t" + prov + "\n")
	}
	nodeRows.Close()
	if err := nodeRows.Err(); err != nil {
		return "", err
	}

	edgeRows, err := db.Query(
		"SELECT src,dst,type,repo,path,field FROM kg_edges " +
			"ORDER BY src, type, dst, repo, path, field",
	)
	if err != nil {
		return "", err
	}
	for edgeRows.Next() {
		var src, dst, typ, repo, path, field string
		if err := edgeRows.Scan(&src, &dst, &typ, &repo, &path, &field); err != nil {
			edgeRows.Close()
			return "", err
		}
		b.WriteString("edge\t" + src + "\t" + typ + "\t" + dst + "\t" + repo +
			"\t" + path + "\t" + field + "\n")
	}
	edgeRows.Close()
	if err := edgeRows.Err(); err != nil {
		return "", err
	}

	return b.String(), nil
}
