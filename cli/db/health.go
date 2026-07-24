// Health and size introspection used by `local-search doctor` and
// `local-search size`. These read-only helpers live in the db package so they
// can reuse the private byte formatter and share one place for the schema
// contract (schemaVersion) and the per-repo git-HEAD cache key.
package db

import (
	"database/sql"
	"fmt"
	"os"
)

// ExpectedSchemaVersion is the schema version this binary writes. `doctor`
// compares it against the on-disk PRAGMA user_version to warn when the next
// scan will rebuild the cache (schema.go resets on mismatch).
func ExpectedSchemaVersion() int { return schemaVersion }

// OnDiskSchemaVersion returns the DB's PRAGMA user_version (0 on a fresh file).
func OnDiskSchemaVersion(db *sql.DB) (int, error) {
	var v int
	err := db.QueryRow("PRAGMA user_version").Scan(&v)
	return v, err
}

// IntegrityCheck runs SQLite's PRAGMA integrity_check and returns its first
// row. A healthy database returns "ok".
func IntegrityCheck(db *sql.DB) (string, error) {
	var result string
	if err := db.QueryRow("PRAGMA integrity_check(1)").Scan(&result); err != nil {
		return "", err
	}
	return result, nil
}

// ── Size report ───────────────────────────────────────────────────────────────

// RepoSize is one row of the per-repo/-project size breakdown.
type RepoSize struct {
	Name  string `json:"name"`
	Specs int    `json:"specs"`
	Bytes int64  `json:"bytes"` // summed indexed-content bytes (specs.size)
}

// SizeReport separates on-disk file size (what the DB costs to store/copy —
// includes the FTS index + WAL overhead) from indexed-content bytes (the corpus
// itself, SUM(specs.size)). The two diverge a lot because FTS5 roughly doubles
// storage, so they are always reported side by side.
type SizeReport struct {
	DBPath       string     `json:"db_path"`
	DBFileBytes  int64      `json:"db_file_bytes"`
	WALBytes     int64      `json:"wal_bytes"`
	SHMBytes     int64      `json:"shm_bytes"`
	ContentBytes int64      `json:"content_bytes"`
	TotalSpecs   int        `json:"total_specs"`
	GroupBy      string     `json:"group_by"` // "repo" | "project"
	Breakdown    []RepoSize `json:"breakdown"`
}

// Size builds a SizeReport. groupBy selects the breakdown dimension: "project"
// groups by specs.project; anything else groups by specs.repo.
func Size(db *sql.DB, dbPath, groupBy string) (SizeReport, error) {
	r := SizeReport{DBPath: dbPath, GroupBy: "repo"}
	col := "repo"
	if groupBy == "project" {
		col, r.GroupBy = "project", "project"
	}

	// On-disk file plus its WAL/SHM sidecars (present under journal_mode=WAL).
	if fi, err := os.Stat(dbPath); err == nil {
		r.DBFileBytes = fi.Size()
	}
	if fi, err := os.Stat(dbPath + "-wal"); err == nil {
		r.WALBytes = fi.Size()
	}
	if fi, err := os.Stat(dbPath + "-shm"); err == nil {
		r.SHMBytes = fi.Size()
	}

	if err := db.QueryRow(
		"SELECT COUNT(*), COALESCE(SUM(size),0) FROM specs",
	).Scan(&r.TotalSpecs, &r.ContentBytes); err != nil {
		return r, err
	}

	// Column name is whitelisted above, so this interpolation is safe.
	rows, err := db.Query(fmt.Sprintf(
		"SELECT %s, COUNT(*), COALESCE(SUM(size),0) FROM specs GROUP BY %s ORDER BY SUM(size) DESC",
		col, col,
	))
	if err != nil {
		return r, err
	}
	defer rows.Close()
	for rows.Next() {
		var row RepoSize
		if err := rows.Scan(&row.Name, &row.Specs, &row.Bytes); err != nil {
			return r, err
		}
		if row.Name == "" {
			row.Name = "(none)"
		}
		r.Breakdown = append(r.Breakdown, row)
	}
	return r, rows.Err()
}

// PrintSizeReport writes a human-readable size breakdown. HumanBytes formatting
// matches `stats` / `inspect`.
func PrintSizeReport(r SizeReport) {
	fmt.Printf("DB file:          %s   %s\n", humanBytes(r.DBFileBytes), r.DBPath)
	if r.WALBytes > 0 || r.SHMBytes > 0 {
		fmt.Printf("  ├─ WAL          %s\n", humanBytes(r.WALBytes))
		fmt.Printf("  └─ SHM          %s\n", humanBytes(r.SHMBytes))
	}
	fmt.Printf("Indexed content:  %s across %d specs\n\n", humanBytes(r.ContentBytes), r.TotalSpecs)

	label := "Per repo"
	if r.GroupBy == "project" {
		label = "Per project"
	}
	if len(r.Breakdown) == 0 {
		fmt.Printf("%s: (nothing indexed yet)\n", label)
		return
	}
	fmt.Printf("%-28s %8s  %10s  %6s\n", label, "specs", "content", "share")
	fmt.Println("  " + dashes(56))
	for _, row := range r.Breakdown {
		pct := 0.0
		if r.ContentBytes > 0 {
			pct = float64(row.Bytes) / float64(r.ContentBytes) * 100
		}
		fmt.Printf("  %-26s %8d  %10s  %5.0f%%\n", truncate(row.Name, 26), row.Specs, humanBytes(row.Bytes), pct)
	}
}

func dashes(n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = '-'
	}
	return string(b)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	if n <= 1 {
		return s[:n]
	}
	return s[:n-1] + "…"
}
