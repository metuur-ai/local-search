// Package codegraph integrates with code-review-graph
// (https://github.com/tirth8205/code-review-graph), a Tree-sitter-based code
// knowledge-graph CLI that writes a per-repo SQLite at .code-review-graph/graph.sqlite.
//
// Design principle: code-review-graph is the source of truth. local-search stores
// only pointers (path, mtime, node count) and reads the SQLite read-only on
// demand. We never write to it.
//
// Every function in this package is safe to call when the artifact is missing
// or malformed — failures degrade to "no code-graph available" rather than
// aborting the caller.
package codegraph

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	_ "modernc.org/sqlite" // registers the "sqlite" driver
)

// DirName is the directory code-review-graph writes its SQLite into.
const DirName = ".code-review-graph"

// CommonFilenames lists the SQLite filenames code-review-graph has been
// observed to use. Different upstream versions write `graph.db` or
// `graph.sqlite`. Probed in order; first hit wins.
var CommonFilenames = []string{"graph.db", "graph.sqlite"}

// DBRelPath is the legacy single-name path. Kept as the default so existing
// callers (tests, fixtures) continue to work; new code should call Detect()
// which probes every CommonFilenames entry.
const DBRelPath = DirName + "/graph.sqlite"

// Info is a lightweight summary persisted in the repos table. Path is empty
// when no artifact exists.
type Info struct {
	Path      string // absolute path to the SQLite file, "" if missing
	MTime     int64  // unix timestamp, 0 if missing
	NodeCount int    // 0 if missing or unreadable
}

// Detect looks under <repoRoot>/.code-review-graph/ for a SQLite file
// produced by code-review-graph and returns its metadata. The conventional
// filenames (graph.db, graph.sqlite) are probed first; if neither matches,
// any other .db/.sqlite file in that directory is opened and validated by
// schema (must have both `nodes` and `edges` tables).
//
// Missing artifact is not an error — returns a zero-value Info.
func Detect(repoRoot string) Info {
	cgDir := filepath.Join(repoRoot, DirName)

	// Phase 1: try the well-known filenames first. Cheapest path.
	for _, name := range CommonFilenames {
		abs := filepath.Join(cgDir, name)
		if info, ok := statFileInfo(abs); ok {
			return info
		}
	}

	// Phase 2: probe any other .db / .sqlite file in the directory and accept
	// the first one whose schema matches code-review-graph. Handles upstream
	// renames or user-customized filenames without requiring code changes.
	entries, err := os.ReadDir(cgDir)
	if err != nil {
		return Info{}
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(e.Name()))
		if ext != ".db" && ext != ".sqlite" {
			continue
		}
		abs := filepath.Join(cgDir, e.Name())
		if !LooksLikeCodeReviewGraph(abs) {
			continue
		}
		if info, ok := statFileInfo(abs); ok {
			return info
		}
	}
	return Info{}
}

// statFileInfo stats path and builds an Info{}. Returns ok=false for missing
// files or directories. Used by Detect's two-phase probe.
func statFileInfo(path string) (Info, bool) {
	st, err := os.Stat(path)
	if err != nil || st.IsDir() {
		return Info{}, false
	}
	return Info{
		Path:      path,
		MTime:     st.ModTime().Unix(),
		NodeCount: CountNodes(path),
	}, true
}

// LooksLikeCodeReviewGraph reports whether the file at path appears to be a
// code-review-graph SQLite (has both a "nodes" and an "edges" table).
// Used by `graphs add` to auto-detect kind from a path the user supplies.
// Returns false for missing files, non-SQLite files, and SQLite files with a
// different schema.
func LooksLikeCodeReviewGraph(path string) bool {
	db, err := openRO(path)
	if err != nil {
		return false
	}
	defer db.Close()
	hasNodes, _ := tableExists(db, "nodes")
	hasEdges, _ := tableExists(db, "edges")
	return hasNodes && hasEdges
}

// CountNodes returns the row count of the nodes table for an arbitrary
// SQLite file path. Returns 0 on any error. Exported so `graphs add` can
// count nodes for files outside the conventional .code-review-graph/ layout.
func CountNodes(path string) int {
	db, err := openRO(path)
	if err != nil {
		return 0
	}
	defer db.Close()
	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM nodes").Scan(&n); err != nil {
		return 0
	}
	return n
}

// ── Read-only handle cache ───────────────────────────────────────────────────

// DB wraps a cached read-only *sql.DB and the metadata used to key the cache.
// Callers never close the embedded sql.DB; the cache owns its lifetime.
type DB struct {
	repo  string
	path  string
	mtime int64
	sql   *sql.DB
}

// Repo returns the repo name this code-graph was loaded for. May be empty
// for external (non-repo-bound) graphs.
func (d *DB) Repo() string { return d.repo }

// Path returns the absolute path to the underlying SQLite file.
func (d *DB) Path() string { return d.path }

type cacheKey struct {
	path  string
	mtime int64
}

var (
	cacheMu sync.RWMutex
	cache   = map[cacheKey]*DB{}
)

// Open returns a cached read-only *DB. The cache key is (path, mtime); a
// changed mtime invalidates the previous entry, so re-running
// `code-review-graph build` (which rewrites the file) is picked up
// automatically on the next Open call.
//
// repo is informational only — it is attached to results so the caller can
// tag fan-out responses by source repo. Pass "" for external graphs.
func Open(repo, path string, mtime int64) (*DB, error) {
	key := cacheKey{path: path, mtime: mtime}

	cacheMu.RLock()
	if d, ok := cache[key]; ok {
		cacheMu.RUnlock()
		return d, nil
	}
	cacheMu.RUnlock()

	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	sqlDB, err := openRO(path)
	if err != nil {
		return nil, err
	}

	d := &DB{repo: repo, path: path, mtime: mtime, sql: sqlDB}

	cacheMu.Lock()
	// Re-check under the write lock — another goroutine may have cached this
	// entry between our RLock release and our Lock acquire.
	if existing, ok := cache[key]; ok {
		sqlDB.Close()
		cacheMu.Unlock()
		return existing, nil
	}
	cache[key] = d
	cacheMu.Unlock()
	return d, nil
}

// openRO opens a code-review-graph SQLite file read-only with immutable=1.
// The immutable flag tells SQLite the file is guaranteed not to change for the
// duration of the connection's life, which eliminates lock contention even if
// another process holds a writer.
func openRO(path string) (*sql.DB, error) {
	q := url.Values{}
	q.Set("mode", "ro")
	q.Set("immutable", "1")
	dsn := "file:" + path + "?" + q.Encode()
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// Cap connections — read-only handles do not benefit from a large pool
	// and we want predictable resource usage when many DBs are cached.
	db.SetMaxOpenConns(2)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// tableExists reports whether a given table exists in the connected DB.
func tableExists(db *sql.DB, table string) (bool, error) {
	var name string
	err := db.QueryRow(
		"SELECT name FROM sqlite_master WHERE type='table' AND name=?",
		table,
	).Scan(&name)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// ── Query types ──────────────────────────────────────────────────────────────

// Node is a single node row from the upstream `nodes` table, narrowed to the
// columns local-search uses for ranking and display.
type Node struct {
	Repo          string `json:"repo,omitempty"`
	Kind          string `json:"kind"`           // File | Class | Function | Type | Test
	Name          string `json:"name"`
	QualifiedName string `json:"qualified_name"`
	FilePath      string `json:"file_path"`
	LineStart     int    `json:"line_start,omitempty"`
	LineEnd       int    `json:"line_end,omitempty"`
	Language      string `json:"language,omitempty"`
	IsTest        bool   `json:"is_test,omitempty"`
}

// HubNode pairs a Node with its outgoing-edge count, used for "top hubs" queries.
type HubNode struct {
	Node     Node `json:"node"`
	OutDegree int  `json:"out_degree"`
}

// ── Queries ──────────────────────────────────────────────────────────────────

// FindNodes returns nodes whose name OR qualified_name contains query
// (case-insensitive). Results are ordered with name-equality matches first,
// then suffix matches on qualified_name, then everything else. Capped at limit
// (pass 0 for the default of 50).
func (d *DB) FindNodes(query string, limit int) ([]Node, error) {
	if d == nil || query == "" {
		return nil, nil
	}
	if limit <= 0 {
		limit = 50
	}
	needle := "%" + strings.ToLower(query) + "%"
	rows, err := d.sql.Query(`
		SELECT kind, name, qualified_name, file_path,
		       COALESCE(line_start, 0), COALESCE(line_end, 0),
		       COALESCE(language, ''), COALESCE(is_test, 0)
		FROM nodes
		WHERE LOWER(name) LIKE ? OR LOWER(qualified_name) LIKE ?
		ORDER BY
		  CASE WHEN LOWER(name) = LOWER(?) THEN 0
		       WHEN LOWER(qualified_name) LIKE LOWER(?) THEN 1
		       ELSE 2 END,
		  LENGTH(qualified_name)
		LIMIT ?`,
		needle, needle, query, "%."+strings.ToLower(query), limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNodes(rows, d.repo)
}

// FindNodeByQualified returns a single node by exact qualified_name match,
// or nil when not found.
func (d *DB) FindNodeByQualified(qualifiedName string) (*Node, error) {
	if d == nil || qualifiedName == "" {
		return nil, nil
	}
	row := d.sql.QueryRow(`
		SELECT kind, name, qualified_name, file_path,
		       COALESCE(line_start, 0), COALESCE(line_end, 0),
		       COALESCE(language, ''), COALESCE(is_test, 0)
		FROM nodes WHERE qualified_name = ? LIMIT 1`,
		qualifiedName,
	)
	n := Node{Repo: d.repo}
	var isTest int
	if err := row.Scan(&n.Kind, &n.Name, &n.QualifiedName, &n.FilePath,
		&n.LineStart, &n.LineEnd, &n.Language, &isTest); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	n.IsTest = isTest != 0
	return &n, nil
}

// CallersOf returns nodes that have a CALLS edge pointing at qualifiedName.
// Uses the upstream idx_edges_target_kind index for an O(log n) lookup.
func (d *DB) CallersOf(qualifiedName string) ([]Node, error) {
	return d.relatedNodes(qualifiedName, "target_qualified", "source_qualified", "CALLS")
}

// CalleesOf returns nodes that qualifiedName has a CALLS edge to.
func (d *DB) CalleesOf(qualifiedName string) ([]Node, error) {
	return d.relatedNodes(qualifiedName, "source_qualified", "target_qualified", "CALLS")
}

// relatedNodes joins the edges and nodes tables to walk one hop in either
// direction along edges of the given kind.
func (d *DB) relatedNodes(seed, fromCol, toCol, edgeKind string) ([]Node, error) {
	if d == nil || seed == "" {
		return nil, nil
	}
	q := fmt.Sprintf(`
		SELECT n.kind, n.name, n.qualified_name, n.file_path,
		       COALESCE(n.line_start, 0), COALESCE(n.line_end, 0),
		       COALESCE(n.language, ''), COALESCE(n.is_test, 0)
		FROM edges e
		JOIN nodes n ON n.qualified_name = e.%s
		WHERE e.%s = ? AND e.kind = ?
		LIMIT 200`, toCol, fromCol)
	rows, err := d.sql.Query(q, seed, edgeKind)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNodes(rows, d.repo)
}

// BlastRadius does a bounded BFS from qualifiedName along all edges (both
// directions, all kinds) and returns the impact set, excluding the seed.
// depth defaults to 2, cap defaults to 50; pass 0 for either to use the default.
func (d *DB) BlastRadius(qualifiedName string, depth, cap int) ([]Node, error) {
	if d == nil || qualifiedName == "" {
		return nil, nil
	}
	if depth <= 0 {
		depth = 2
	}
	if cap <= 0 {
		cap = 50
	}

	visited := map[string]bool{qualifiedName: true}
	frontier := []string{qualifiedName}

	for hop := 0; hop < depth && len(frontier) > 0; hop++ {
		next, err := d.expandFrontier(frontier, visited, cap)
		if err != nil {
			return nil, err
		}
		frontier = next
		if len(visited)-1 >= cap {
			break
		}
	}

	// Drop the seed; load full Node rows for everything we visited.
	delete(visited, qualifiedName)
	if len(visited) == 0 {
		return nil, nil
	}
	names := make([]string, 0, len(visited))
	for n := range visited {
		names = append(names, n)
		if len(names) >= cap {
			break
		}
	}
	return d.nodesByQualifiedNames(names)
}

// expandFrontier walks one BFS hop, adding newly-discovered qualified names
// to visited and returning the next frontier. Stops at the cap.
func (d *DB) expandFrontier(frontier []string, visited map[string]bool, cap int) ([]string, error) {
	if len(frontier) == 0 {
		return nil, nil
	}
	placeholders := strings.Repeat("?,", len(frontier))
	placeholders = placeholders[:len(placeholders)-1]

	args := make([]any, 0, len(frontier))
	for _, f := range frontier {
		args = append(args, f)
	}

	// Get neighbors in both directions in one query.
	q := `
		SELECT target_qualified FROM edges WHERE source_qualified IN (` + placeholders + `)
		UNION
		SELECT source_qualified FROM edges WHERE target_qualified IN (` + placeholders + `)`
	rows, err := d.sql.Query(q, append(args, args...)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var next []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		if visited[n] {
			continue
		}
		visited[n] = true
		next = append(next, n)
		if len(visited)-1 >= cap {
			break
		}
	}
	return next, rows.Err()
}

// nodesByQualifiedNames batch-fetches Node rows by qualified_name.
func (d *DB) nodesByQualifiedNames(names []string) ([]Node, error) {
	if len(names) == 0 {
		return nil, nil
	}
	placeholders := strings.Repeat("?,", len(names))
	placeholders = placeholders[:len(placeholders)-1]
	args := make([]any, 0, len(names))
	for _, n := range names {
		args = append(args, n)
	}
	rows, err := d.sql.Query(`
		SELECT kind, name, qualified_name, file_path,
		       COALESCE(line_start, 0), COALESCE(line_end, 0),
		       COALESCE(language, ''), COALESCE(is_test, 0)
		FROM nodes WHERE qualified_name IN (`+placeholders+`)`,
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNodes(rows, d.repo)
}

// HubNodes returns the top-N nodes by outgoing-edge count.
// Used for ranking boosts and `local-search code hubs`.
func (d *DB) HubNodes(limit int) ([]HubNode, error) {
	if d == nil {
		return nil, nil
	}
	if limit <= 0 {
		limit = 20
	}
	rows, err := d.sql.Query(`
		SELECT n.kind, n.name, n.qualified_name, n.file_path,
		       COALESCE(n.line_start, 0), COALESCE(n.line_end, 0),
		       COALESCE(n.language, ''), COALESCE(n.is_test, 0),
		       COUNT(e.id) AS deg
		FROM nodes n
		LEFT JOIN edges e ON e.source_qualified = n.qualified_name
		GROUP BY n.id
		ORDER BY deg DESC
		LIMIT ?`,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hubs []HubNode
	for rows.Next() {
		var h HubNode
		var isTest int
		if err := rows.Scan(&h.Node.Kind, &h.Node.Name, &h.Node.QualifiedName,
			&h.Node.FilePath, &h.Node.LineStart, &h.Node.LineEnd,
			&h.Node.Language, &isTest, &h.OutDegree); err != nil {
			return nil, err
		}
		h.Node.IsTest = isTest != 0
		h.Node.Repo = d.repo
		hubs = append(hubs, h)
	}
	return hubs, rows.Err()
}

// OutDegreeOf returns the count of outgoing edges from qualifiedName, used by
// the ranking layer to size centrality boosts. Returns 0 when not found.
func (d *DB) OutDegreeOf(qualifiedName string) (int, error) {
	if d == nil || qualifiedName == "" {
		return 0, nil
	}
	var n int
	err := d.sql.QueryRow(
		"SELECT COUNT(*) FROM edges WHERE source_qualified = ?",
		qualifiedName,
	).Scan(&n)
	return n, err
}

// ── helpers ──────────────────────────────────────────────────────────────────

func scanNodes(rows *sql.Rows, repo string) ([]Node, error) {
	var out []Node
	for rows.Next() {
		var n Node
		var isTest int
		if err := rows.Scan(&n.Kind, &n.Name, &n.QualifiedName, &n.FilePath,
			&n.LineStart, &n.LineEnd, &n.Language, &isTest); err != nil {
			return nil, err
		}
		n.IsTest = isTest != 0
		n.Repo = repo
		out = append(out, n)
	}
	return out, rows.Err()
}

// MissingInstructions returns the user-facing message printed when a repo
// has no .code-review-graph/. Centralized so every command (and the JSON
// payload) prints the same fix.
func MissingInstructions(repoRoot string) string {
	abs := repoRoot
	if a, err := filepath.Abs(repoRoot); err == nil {
		abs = a
	}
	return fmt.Sprintf("pip install code-review-graph && cd %s && code-review-graph build", abs)
}
