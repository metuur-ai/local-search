package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"local-search/embed"
)

// ── Search ────────────────────────────────────────────────────────────────────

// SearchResult is one ranked hit from a full-text search.
type SearchResult struct {
	Repo      string  `json:"repo"`
	Project   string  `json:"project"`
	Name      string  `json:"name"`
	Title     string  `json:"title"`
	Tags      string  `json:"tags"`
	Path      string  `json:"path"`
	FullPath  string  `json:"fullpath"`
	Ext       string  `json:"ext"`
	Relevance float64 `json:"relevance"`
}

// Search performs a BM25-ranked FTS5 query. repoFilter="" means all repos, directoryFilter="" means all paths.
func Search(db *sql.DB, query, repoFilter, directoryFilter string) ([]SearchResult, error) {
	var (
		rows *sql.Rows
		err  error
	)
	const searchLimit = 200
	baseSQL := `
		SELECT s.repo, s.project, s.name, s.title, s.tags,
		       s.path, s.fullpath, s.ext, f.rank
		FROM specs_fts f
		JOIN specs s ON s.id = f.rowid
		WHERE specs_fts MATCH ?`

	var args []interface{}
	args = append(args, query)

	if repoFilter != "" {
		baseSQL += " AND s.repo=?"
		args = append(args, repoFilter)
	}

	if directoryFilter != "" {
		baseSQL += " AND s.path LIKE ?"
		args = append(args, directoryFilter+"%")
	}

	baseSQL += " ORDER BY f.rank LIMIT ?"
	args = append(args, searchLimit)

	rows, err = runFTSMatch(db, baseSQL, args, 0)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		if err := rows.Scan(&r.Repo, &r.Project, &r.Name, &r.Title, &r.Tags, &r.Path, &r.FullPath, &r.Ext, &r.Relevance); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, rows.Err()
}

// SemanticSearch runs FTS5 BM25 first, then re-ranks the candidates by fusing
// BM25 rank with cosine similarity of a deterministic feature-hash embedding
// via Reciprocal Rank Fusion. Opt-in; default Search() behavior is unchanged.
// k <= 0 returns all candidates. Falls back to FTS-only order when the query
// embeds to a zero vector or no vectors are stored yet.
func SemanticSearch(db *sql.DB, query, repoFilter, directoryFilter string, k int) ([]SearchResult, error) {
	ftsResults, err := Search(db, query, repoFilter, directoryFilter)
	if err != nil {
		return nil, err
	}
	if len(ftsResults) == 0 {
		return nil, nil
	}

	qv := embed.Embed(query)
	if isZeroVector(qv) {
		// No usable semantic signal; fall back to FTS-only ordering.
		if k > 0 && len(ftsResults) > k {
			ftsResults = ftsResults[:k]
		}
		return ftsResults, nil
	}

	// Load candidate vectors within the same filtered scope as Search.
	vecSQL := `
		SELECT s.repo, s.path, v.vec
		FROM specs s
		JOIN spec_vectors v ON v.spec_id = s.id`
	var vecArgs []interface{}
	if repoFilter != "" {
		vecSQL += " WHERE s.repo=?"
		vecArgs = append(vecArgs, repoFilter)
		if directoryFilter != "" {
			vecSQL += " AND s.path LIKE ?"
			vecArgs = append(vecArgs, directoryFilter+"%")
		}
	} else if directoryFilter != "" {
		vecSQL += " WHERE s.path LIKE ?"
		vecArgs = append(vecArgs, directoryFilter+"%")
	}

	rows, err := db.Query(vecSQL, vecArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	vecByKey := make(map[string][]float32)
	for rows.Next() {
		var repo, path string
		var blob []byte
		if err := rows.Scan(&repo, &path, &blob); err != nil {
			return nil, err
		}
		vecByKey[vecKey(repo, path)] = embed.Decode(blob)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Rank candidates that have a stored vector by cosine similarity descending.
	type cand struct {
		key    string
		cosine float32
	}
	var scored []cand
	for _, r := range ftsResults {
		key := vecKey(r.Repo, r.Path)
		if vec, ok := vecByKey[key]; ok {
			scored = append(scored, cand{key: key, cosine: embed.Cosine(qv, vec)})
		}
	}
	sort.SliceStable(scored, func(i, j int) bool {
		return scored[i].cosine > scored[j].cosine
	})
	cosineRank := make(map[string]int, len(scored))
	for rank, c := range scored {
		cosineRank[c.key] = rank
	}

	// Fuse BM25 rank with cosine rank via Reciprocal Rank Fusion.
	for i := range ftsResults {
		score := rrf(i)
		if rank, ok := cosineRank[vecKey(ftsResults[i].Repo, ftsResults[i].Path)]; ok {
			score += rrf(rank)
		}
		ftsResults[i].Relevance = score
	}
	sort.SliceStable(ftsResults, func(i, j int) bool {
		return ftsResults[i].Relevance > ftsResults[j].Relevance
	})

	if k > 0 && len(ftsResults) > k {
		ftsResults = ftsResults[:k]
	}
	return ftsResults, nil
}

func isZeroVector(v []float32) bool {
	for _, x := range v {
		if x != 0 {
			return false
		}
	}
	return true
}

func rrf(rank int) float64 { return 1.0 / (60.0 + float64(rank)) }

func vecKey(repo, path string) string { return repo + "\x00" + path }

// SearchInRepos performs the same FTS5 query as Search but restricts results
// to a specific set of repo names. Empty repos slice returns no results (use
// Search with repoFilter="" for the all-repos case).
func SearchInRepos(db *sql.DB, query string, repos []string) ([]SearchResult, error) {
	if len(repos) == 0 {
		return nil, nil
	}
	const searchLimit = 200
	placeholders := strings.Repeat("?,", len(repos))
	placeholders = placeholders[:len(placeholders)-1]
	args := make([]any, 0, len(repos)+2)
	args = append(args, query)
	for _, r := range repos {
		args = append(args, r)
	}
	args = append(args, searchLimit)

	sqlText := `
		SELECT s.repo, s.project, s.name, s.title, s.tags,
		       s.path, s.ext, f.rank
		FROM specs_fts f
		JOIN specs s ON s.id = f.rowid
		WHERE specs_fts MATCH ? AND s.repo IN (` + placeholders + `)
		ORDER BY f.rank LIMIT ?`
	rows, err := runFTSMatch(db, sqlText, args, 0)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		if err := rows.Scan(&r.Repo, &r.Project, &r.Name, &r.Title, &r.Tags, &r.Path, &r.Ext, &r.Relevance); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, rows.Err()
}

// PrintSearch writes human-readable search output to stdout.
func PrintSearch(results []SearchResult, query string) {
	if len(results) == 0 {
		fmt.Println("No results for: " + query)
		fmt.Println()
		fmt.Println("  Broader term, or prefix: local-search search \"" + query + "*\"")
		fmt.Println("  Boolean: local-search search \"" + query + " OR <other>\"")
		fmt.Println("  Browse: local-search list")
		return
	}
	for _, r := range results {
		fmt.Printf("  [%s] %s\n", r.Repo, r.FullPath)
		fmt.Printf("    %s", r.Title)
		if r.Tags != "" {
			fmt.Printf("  (%s)", r.Tags)
		}
		fmt.Printf("  .%s\n", r.Ext)
	}
}

// ── Read ──────────────────────────────────────────────────────────────────────

// ReadSpec returns the fullpath of the spec matching name (and optional repo and directory).
// If multiple match, prints choices and returns "".
func ReadSpec(db *sql.DB, name, repoFilter, directoryFilter string) (string, error) {
	var rows *sql.Rows
	var err error

	base := "SELECT fullpath, repo, project||'/'||name FROM specs WHERE LOWER(name)=LOWER(?)"
	var args []interface{}
	args = append(args, name)

	if repoFilter != "" {
		base += " AND repo=?"
		args = append(args, repoFilter)
	}

	if directoryFilter != "" {
		base += " AND path LIKE ?"
		args = append(args, directoryFilter+"%")
	}

	rows, err = db.Query(base, args...)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	type match struct{ path, repo, label string }
	var matches []match
	for rows.Next() {
		var m match
		if err := rows.Scan(&m.path, &m.repo, &m.label); err != nil {
			return "", err
		}
		matches = append(matches, m)
	}
	if err := rows.Err(); err != nil {
		return "", err
	}

	switch len(matches) {
	case 0:
		return "", fmt.Errorf("no spec found: %q", name)
	case 1:
		return matches[0].path, nil
	default:
		fmt.Fprintf(os.Stderr, "Multiple specs named %q — specify repo:\n", name)
		for _, m := range matches {
			fmt.Fprintf(os.Stderr, "  local-search read %s %s\n", name, m.repo)
		}
		return "", nil
	}
}

// ── List ──────────────────────────────────────────────────────────────────────

// ListRow is one row from the list command.
type ListRow struct {
	Repo    string
	Project string
	Name    string
	Title   string
	Ext     string
}

// List returns specs filtered by repo or project name. filter="" = all.
func List(db *sql.DB, filter string) ([]ListRow, error) {
	if filter == "" {
		return listAll(db)
	}

	// Check if filter is a repo name
	var count int
	db.QueryRow("SELECT COUNT(*) FROM repos WHERE name=?", filter).Scan(&count) //nolint:errcheck
	if count > 0 {
		return listByRepo(db, filter)
	}
	return listByProject(db, filter)
}

func listAll(db *sql.DB) ([]ListRow, error) {
	rows, err := db.Query(
		"SELECT repo, project, name, title, ext FROM specs ORDER BY repo, project, name",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanListRows(rows)
}

func listByRepo(db *sql.DB, repo string) ([]ListRow, error) {
	rows, err := db.Query(
		"SELECT repo, project, name, title, ext FROM specs WHERE repo=? ORDER BY project, name", repo,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanListRows(rows)
}

func listByProject(db *sql.DB, project string) ([]ListRow, error) {
	rows, err := db.Query(
		"SELECT repo, project, name, title, ext FROM specs WHERE project=? ORDER BY repo, name", project,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanListRows(rows)
}

func scanListRows(rows *sql.Rows) ([]ListRow, error) {
	// Pre-allocate with a reasonable guess to avoid repeated slice doublings.
	result := make([]ListRow, 0, 256)
	for rows.Next() {
		var r ListRow
		if err := rows.Scan(&r.Repo, &r.Project, &r.Name, &r.Title, &r.Ext); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// StreamList writes human-readable grouped list output directly from the DB
// without materialising the full result set into memory. Use this instead of
// List+PrintList when JSON output is not needed.
func StreamList(db *sql.DB, filter string) error {
	var (
		rows *sql.Rows
		err  error
	)
	if filter == "" {
		rows, err = db.Query(
			"SELECT repo, project, name, title, ext FROM specs ORDER BY repo, project, name",
		)
	} else {
		var count int
		db.QueryRow("SELECT COUNT(*) FROM repos WHERE name=?", filter).Scan(&count) //nolint:errcheck
		if count > 0 {
			rows, err = db.Query(
				"SELECT repo, project, name, title, ext FROM specs WHERE repo=? ORDER BY project, name", filter,
			)
		} else {
			rows, err = db.Query(
				"SELECT repo, project, name, title, ext FROM specs WHERE project=? ORDER BY repo, name", filter,
			)
		}
	}
	if err != nil {
		return err
	}
	defer rows.Close()

	empty := true
	var lastRepo, lastProject string
	for rows.Next() {
		var r ListRow
		if err := rows.Scan(&r.Repo, &r.Project, &r.Name, &r.Title, &r.Ext); err != nil {
			return err
		}
		empty = false
		if r.Repo != lastRepo {
			fmt.Printf("\n[%s]\n", r.Repo)
			lastRepo = r.Repo
			lastProject = ""
		}
		if r.Project != lastProject {
			fmt.Printf("  %s/\n", r.Project)
			lastProject = r.Project
		}
		fmt.Printf("    %s  %s  .%s\n", r.Name, r.Title, r.Ext)
	}
	if empty {
		fmt.Println("No specs found.")
	}
	return rows.Err()
}

// PrintList writes human-readable grouped list output.
func PrintList(rows []ListRow) {
	var lastRepo, lastProject string
	for _, r := range rows {
		if r.Repo != lastRepo {
			fmt.Printf("\n[%s]\n", r.Repo)
			lastRepo = r.Repo
			lastProject = ""
		}
		if r.Project != lastProject {
			fmt.Printf("  %s/\n", r.Project)
			lastProject = r.Project
		}
		fmt.Printf("    %s  %s  .%s\n", r.Name, r.Title, r.Ext)
	}
}

// ── Projects ──────────────────────────────────────────────────────────────────

// ProjectRow is one row from the projects command.
type ProjectRow struct {
	Repo    string
	Project string
	Count   int
}

// Projects returns all distinct projects with spec counts.
func Projects(db *sql.DB) ([]ProjectRow, error) {
	rows, err := db.Query(
		"SELECT repo, project, COUNT(*) FROM specs GROUP BY repo, project ORDER BY repo, project",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ProjectRow
	for rows.Next() {
		var r ProjectRow
		if err := rows.Scan(&r.Repo, &r.Project, &r.Count); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// ── Related ───────────────────────────────────────────────────────────────────

// Related finds specs related to the one with the given name by shared tags or title words.
func Related(db *sql.DB, name string) ([]SearchResult, error) {
	// Fetch the spec's tags and title
	var tags, title string
	err := db.QueryRow(
		"SELECT COALESCE(tags,''), COALESCE(title,'') FROM specs WHERE LOWER(name)=LOWER(?)", name,
	).Scan(&tags, &title)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("spec not found: %q", name)
	}
	if err != nil {
		return nil, err
	}

	// Build an FTS query from tags + title words
	terms := buildRelatedQuery(tags, title, name)
	if terms == "" {
		return nil, nil
	}

	rows, err := db.Query(`
		SELECT s.repo, s.project, s.name, s.title, s.tags,
		       s.project || '/' || s.name, s.ext, f.rank
		FROM specs_fts f
		JOIN specs s ON s.id = f.rowid
		WHERE specs_fts MATCH ? AND LOWER(s.name) != LOWER(?)
		ORDER BY f.rank
		LIMIT 10`,
		terms, name,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		if err := rows.Scan(&r.Repo, &r.Project, &r.Name, &r.Title, &r.Tags, &r.Path, &r.Ext, &r.Relevance); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, rows.Err()
}

func buildRelatedQuery(tags, title, exclude string) string {
	var terms []string
	for _, t := range strings.Split(tags, ",") {
		t = strings.TrimSpace(t)
		if t != "" && !strings.EqualFold(t, exclude) {
			terms = append(terms, `"`+strings.ReplaceAll(t, `"`, "")+`"`)
		}
	}
	for _, w := range strings.Fields(title) {
		w = strings.Trim(w, `"':.,!?`)
		// Quote as a literal: a title word may still contain FTS5 operator
		// characters (e.g. "install/upgrade", "(for") that would otherwise
		// make the MATCH expression a syntax error.
		if len(w) > 3 && !strings.EqualFold(w, exclude) {
			terms = append(terms, `"`+strings.ReplaceAll(w, `"`, "")+`"`)
		}
	}
	if len(terms) == 0 {
		return ""
	}
	return strings.Join(terms, " OR ")
}

// ── Recent ────────────────────────────────────────────────────────────────────

// RecentRow is one row from the recent command.
type RecentRow struct {
	Repo     string
	Project  string
	Name     string
	Title    string
	Modified string
}

// Recent returns the n most recently modified specs.
func Recent(db *sql.DB, n int) ([]RecentRow, error) {
	if n <= 0 {
		n = 10
	}
	rows, err := db.Query(
		"SELECT repo, project, name, title, modified FROM specs ORDER BY modified_unix DESC LIMIT ?", n,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []RecentRow
	for rows.Next() {
		var r RecentRow
		if err := rows.Scan(&r.Repo, &r.Project, &r.Name, &r.Title, &r.Modified); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// ── Tags ──────────────────────────────────────────────────────────────────────

// TagRow is one row from the tags command.
type TagRow struct {
	Tag   string `json:"tag"`
	Count int    `json:"count"`
}

// Tags returns all tags with usage counts.
func Tags(db *sql.DB) ([]TagRow, error) {
	rows, err := db.Query(
		"SELECT tag, COUNT(*) FROM spec_tags GROUP BY tag ORDER BY COUNT(*) DESC, tag",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []TagRow
	for rows.Next() {
		var r TagRow
		if err := rows.Scan(&r.Tag, &r.Count); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// SpecsByTag returns specs that have the given tag.
func SpecsByTag(db *sql.DB, tag string) ([]ListRow, error) {
	rows, err := db.Query(`
		SELECT s.repo, s.project, s.name, s.title, s.ext
		FROM specs s
		JOIN spec_tags t ON t.spec_id = s.id
		WHERE LOWER(t.tag) = LOWER(?)
		ORDER BY s.repo, s.project, s.name`, tag,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanListRows(rows)
}

// ── Stats ─────────────────────────────────────────────────────────────────────

// StatsResult holds aggregate index statistics.
type StatsResult struct {
	Repos      int    `json:"repos"`
	TotalSpecs int    `json:"total_specs"`
	Projects   int    `json:"projects"`
	UniqueTags int    `json:"unique_tags"`
	TotalBytes int64  `json:"total_bytes"`
	LastScan   string `json:"last_scan"`
}

// Stats returns aggregate index statistics. Reads from the meta cache populated
// by RefreshStats after each scan. Falls back to live queries if cache is absent.
func Stats(db *sql.DB) (StatsResult, error) {
	var s StatsResult

	// Try cache first — O(1) indexed meta lookups.
	if v := getMeta(db, "stats_specs"); v != "" {
		s.Repos, _ = strconv.Atoi(getMeta(db, "stats_repos"))
		s.TotalSpecs, _ = strconv.Atoi(v)
		s.Projects, _ = strconv.Atoi(getMeta(db, "stats_projects"))
		s.UniqueTags, _ = strconv.Atoi(getMeta(db, "stats_tags"))
		s.TotalBytes, _ = strconv.ParseInt(getMeta(db, "stats_bytes"), 10, 64)
		s.LastScan = getMeta(db, "last_scan")
		return s, nil
	}

	// Cache miss: compute live (first run before any scan completes).
	// COALESCE wraps the WHOLE subquery (not just `value`) so a missing row
	// also produces 'never' rather than a NULL that fails Scan into a string.
	err := db.QueryRow(`
		SELECT
		  (SELECT COUNT(*) FROM repos),
		  (SELECT COUNT(*) FROM specs),
		  (SELECT COUNT(DISTINCT project) FROM specs),
		  (SELECT COUNT(DISTINCT tag) FROM spec_tags),
		  (SELECT COALESCE(SUM(size),0) FROM specs),
		  COALESCE((SELECT value FROM meta WHERE key='last_scan'), 'never')
	`).Scan(&s.Repos, &s.TotalSpecs, &s.Projects, &s.UniqueTags, &s.TotalBytes, &s.LastScan)
	return s, err
}

// RefreshStats recomputes aggregate statistics and caches them in the meta table.
// Call after any scan that modifies the index so Stats() reads from cache.
func RefreshStats(db *sql.DB) error {
	var repos, specs, projects, tags int
	var bytes int64
	err := db.QueryRow(`
		SELECT
		  (SELECT COUNT(*) FROM repos),
		  (SELECT COUNT(*) FROM specs),
		  (SELECT COUNT(DISTINCT project) FROM specs),
		  (SELECT COUNT(DISTINCT tag) FROM spec_tags),
		  (SELECT COALESCE(SUM(size),0) FROM specs)
	`).Scan(&repos, &specs, &projects, &tags, &bytes)
	if err != nil {
		return err
	}
	_, err = db.Exec(
		"INSERT OR REPLACE INTO meta (key,value) VALUES (?,?),(?,?),(?,?),(?,?),(?,?)",
		"stats_repos", strconv.Itoa(repos),
		"stats_specs", strconv.Itoa(specs),
		"stats_projects", strconv.Itoa(projects),
		"stats_tags", strconv.Itoa(tags),
		"stats_bytes", strconv.FormatInt(bytes, 10),
	)
	return err
}

// getMeta reads a single meta value without propagating errors.
func getMeta(db *sql.DB, key string) string {
	var val string
	db.QueryRow("SELECT value FROM meta WHERE key=?", key).Scan(&val) //nolint:errcheck
	return val
}

// PrintStats writes human-readable statistics.
func PrintStats(s StatsResult, dbPath string) {
	fmt.Printf("Repos:       %d\n", s.Repos)
	fmt.Printf("Specs:       %d\n", s.TotalSpecs)
	fmt.Printf("Projects:    %d\n", s.Projects)
	fmt.Printf("Unique tags: %d\n", s.UniqueTags)
	fmt.Printf("Total size:  %s\n", humanBytes(s.TotalBytes))
	fmt.Printf("Last scan:   %s\n", s.LastScan)
	if dbPath != "" {
		if fi, err := os.Stat(dbPath); err == nil {
			fmt.Printf("DB size:     %s\n", humanBytes(fi.Size()))
		}
	}
}

// ── Repos ─────────────────────────────────────────────────────────────────────

// RepoRow is one registered repository with its spec count and (optionally)
// graphify and code-review-graph metadata. Graph fields are zero-valued when
// the corresponding artifact was not detected during the last scan.
type RepoRow struct {
	Name               string `json:"repo"`
	Path               string `json:"path"`
	Count              int    `json:"spec_count"`
	GraphPath          string `json:"graph_path,omitempty"`
	GraphMTime         int64  `json:"graph_mtime,omitempty"`
	GraphNodeCount     int    `json:"graph_node_count,omitempty"`
	CodeGraphPath      string `json:"code_graph_path,omitempty"`
	CodeGraphMTime     int64  `json:"code_graph_mtime,omitempty"`
	CodeGraphNodeCount int    `json:"code_graph_node_count,omitempty"`
}

// Repos returns all registered repositories with spec counts and graph metadata.
func Repos(db *sql.DB) ([]RepoRow, error) {
	rows, err := db.Query(`
		SELECT r.name, r.path, COUNT(s.id),
		       COALESCE(r.graph_path, ''),
		       COALESCE(r.graph_mtime, 0),
		       COALESCE(r.graph_node_count, 0),
		       COALESCE(r.code_graph_path, ''),
		       COALESCE(r.code_graph_mtime, 0),
		       COALESCE(r.code_graph_node_count, 0)
		FROM repos r
		LEFT JOIN specs s ON s.repo = r.name
		GROUP BY r.name, r.path, r.graph_path, r.graph_mtime, r.graph_node_count,
		         r.code_graph_path, r.code_graph_mtime, r.code_graph_node_count
		ORDER BY r.name`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []RepoRow
	for rows.Next() {
		var r RepoRow
		if err := rows.Scan(&r.Name, &r.Path, &r.Count,
			&r.GraphPath, &r.GraphMTime, &r.GraphNodeCount,
			&r.CodeGraphPath, &r.CodeGraphMTime, &r.CodeGraphNodeCount,
		); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// ── External graphs (graphs not tied to a registered repo) ────────────────────

// Kinds an external graph can be tagged with.
const (
	GraphKindGraphify        = "graphify"
	GraphKindCodeReviewGraph = "code-review-graph"
)

// ExternalGraphRow is a graph registered manually via `local-search graphs add`.
// Used for graphify clone outputs (~/.graphify/repos/<owner>/<name>/graphify-out/),
// code-review-graph SQLite databases, or any graph artifact the user wants to
// include in queries without registering its parent directory as a spec repo.
//
// The Kind field discriminates between graphify (NetworkX node-link JSON) and
// code-review-graph (SQLite). Defaults to "graphify" for legacy rows.
type ExternalGraphRow struct {
	Name       string `json:"name"`
	GraphPath  string `json:"graph_path"`
	GraphMTime int64  `json:"graph_mtime,omitempty"`
	NodeCount  int    `json:"node_count,omitempty"`
	AddedAt    int64  `json:"added_at,omitempty"`
	Kind       string `json:"kind"`
}

// ExternalGraphs returns all manually-registered external graphs.
func ExternalGraphs(db *sql.DB) ([]ExternalGraphRow, error) {
	rows, err := db.Query(`
		SELECT name, graph_path,
		       COALESCE(graph_mtime, 0),
		       COALESCE(node_count, 0),
		       COALESCE(added_at, 0),
		       COALESCE(kind, 'graphify')
		FROM external_graphs
		ORDER BY name`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ExternalGraphRow
	for rows.Next() {
		var r ExternalGraphRow
		if err := rows.Scan(&r.Name, &r.GraphPath, &r.GraphMTime, &r.NodeCount, &r.AddedAt, &r.Kind); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// AddExternalGraph registers a graph file by name with its kind discriminator.
// Returns an error if the name is already taken. kind must be "graphify" or
// "code-review-graph"; empty kind defaults to "graphify" for backward-compat.
func AddExternalGraph(db *sql.DB, name, graphPath string, mtime int64, nodeCount int, kind string) error {
	if kind == "" {
		kind = GraphKindGraphify
	}
	_, err := db.Exec(
		"INSERT INTO external_graphs (name, graph_path, graph_mtime, node_count, added_at, kind) VALUES (?,?,?,?,?,?)",
		name, graphPath, mtime, nodeCount, time.Now().Unix(), kind,
	)
	return err
}

// RemoveExternalGraph deletes a registered external graph by name.
// Returns sql.ErrNoRows if the name is not registered.
func RemoveExternalGraph(db *sql.DB, name string) error {
	res, err := db.Exec("DELETE FROM external_graphs WHERE name=?", name)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ── JSON output ───────────────────────────────────────────────────────────────

// PrintJSON serialises v as indented JSON to stdout.
func PrintJSON(v any) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.Encode(v) //nolint:errcheck
}

// WriteJSONFile serialises v as indented JSON to a file with a trailing newline.
func WriteJSONFile(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0o644)
}

// ── Inspect ───────────────────────────────────────────────────────────────────

// Inspect dumps all repos, specs, and tags for debugging.
func Inspect(db *sql.DB, dbPath string) error {
	repos, err := Repos(db)
	if err != nil {
		return err
	}
	fmt.Println("=== Repos ===")
	for _, r := range repos {
		fmt.Printf("  [%s] %s  (%d specs)\n", r.Name, r.Path, r.Count)
	}

	fmt.Println("\n=== Specs ===")
	rows, err := db.Query(
		"SELECT repo, project, name, title, ext, modified, size FROM specs ORDER BY repo, project, name",
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var repo, project, name, title, ext, modified string
		var size int64
		if err := rows.Scan(&repo, &project, &name, &title, &ext, &modified, &size); err != nil {
			return err
		}
		fmt.Printf("  [%s] %s/%s  %q  .%s  %s  %d bytes\n",
			repo, project, name, title, ext, modified, size)
	}

	tags, err := Tags(db)
	if err != nil {
		return err
	}
	fmt.Println("\n=== Tags ===")
	for _, t := range tags {
		fmt.Printf("  %s (%d)\n", t.Tag, t.Count)
	}

	fmt.Printf("\nDB: %s\n", dbPath)
	if fi, err := os.Stat(dbPath); err == nil {
		fmt.Printf("    %s  modified %s\n", humanBytes(fi.Size()), fi.ModTime().Format(time.RFC3339))
	}
	return nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

func humanBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}
