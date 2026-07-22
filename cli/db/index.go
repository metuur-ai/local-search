package db

import (
	"database/sql"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"local-search/codegraph"
	"local-search/embed"
	"local-search/extract"
	"local-search/git"
	"local-search/graph"
)

// workItem is a file discovered during directory walking.
type workItem struct {
	absPath string
	entry   fs.DirEntry
	isMedia bool
}

// FullScan indexes all spec files in repoRoot under repoName.
//
// Design: walkItems streams work items directly into workCh as WalkDir visits
// them, so workers start reading files immediately rather than waiting for the
// full walk to complete. Memory is bounded by (workerCount × maxContentBytes)
// because the channel buffers apply backpressure.
func FullScan(db *sql.DB, repoName, repoRoot string, skipDirectories []string) (int, error) {
	// Cap workers between 2 and 16 to avoid overwhelming the kernel's dir cache.
	workerCount := runtime.NumCPU()
	if workerCount < 2 {
		workerCount = 2
	} else if workerCount > 16 {
		workerCount = 16
	}

	type result struct {
		sp  *extract.Spec
		err error
	}
	// Fixed-size channel buffers: backpressure keeps memory bounded.
	workCh := make(chan workItem, workerCount*2)
	resultsCh := make(chan result, workerCount*2)

	var wg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for item := range workCh {
				if item.isMedia {
					companion := extract.CompanionPath(item.absPath)
					sp, e := extract.FromCompanionEntry(repoName, repoRoot, item.absPath, item.entry, companion)
					// Media without a companion .md is intentionally skipped.
					// We do not warn — repos like fastapi have hundreds of
					// images and the warning spam buries useful output.
					resultsCh <- result{sp, e}
				} else {
					sp, e := extract.FromFileEntry(repoName, repoRoot, item.absPath, item.entry)
					resultsCh <- result{sp, e}
				}
			}
		}()
	}

	// Close results channel once all workers finish.
	go func() {
		wg.Wait()
		close(resultsCh)
	}()

	// Walk and feed workers directly — streaming, no intermediate slice.
	walkErr := make(chan error, 1)
	go func() {
		err := walkItems(repoRoot, workCh, skipDirectories)
		close(workCh)
		walkErr <- err
	}()

	// Open transaction and stream Specs directly into the DB.
	tx, err := db.Begin()
	if err != nil {
		for range resultsCh {
		}
		return 0, err
	}
	defer tx.Rollback() //nolint:errcheck

	if err := deleteRepoEntries(tx, repoName); err != nil {
		return 0, err
	}

	stmt, err := tx.Prepare(
		"INSERT OR REPLACE INTO specs " +
			"(repo,path,project,name,title,tags,summary,fullpath,modified,modified_unix,size,ext,content) " +
			"VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
	)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	count := 0
	for r := range resultsCh {
		if r.sp == nil || r.err != nil {
			continue
		}
		sp := r.sp
		if _, err := stmt.Exec(
			sp.Repo, sp.Path, sp.Project, sp.Name, sp.Title,
			sp.Tags, sp.Summary, sp.FullPath, sp.Modified, sp.ModifiedUnix, sp.Size, sp.Ext, sp.Content,
		); err != nil {
			return 0, err
		}
		count++
	}

	if err := <-walkErr; err != nil {
		return 0, err
	}

	// FTS and tags are cheap SELECT-driven operations; run after all specs are inserted.
	if err := batchInsertFTS(tx, repoName); err != nil {
		return 0, err
	}
	if err := batchInsertTags(tx, repoName); err != nil {
		return 0, err
	}
	if err := batchInsertVectors(tx, repoName); err != nil {
		return 0, err
	}

	// Detect graphify-out/graph.json. Missing graph is fine — columns stay NULL.
	gi := graph.Detect(repoRoot)
	now := time.Now().Unix()
	var (
		graphPath  any = nil
		graphMTime any = nil
		graphNodes any = nil
	)
	if gi.Path != "" {
		graphPath = gi.Path
		graphMTime = gi.MTime
		graphNodes = gi.NodeCount
	}

	// Detect .code-review-graph/graph.sqlite. Independent of graphify above —
	// either, both, or neither may be present.
	cgi := codegraph.Detect(repoRoot)
	var (
		codeGraphPath  any = nil
		codeGraphMTime any = nil
		codeGraphNodes any = nil
	)
	if cgi.Path != "" {
		codeGraphPath = cgi.Path
		codeGraphMTime = cgi.MTime
		codeGraphNodes = cgi.NodeCount
	}

	if _, err := tx.Exec(
		"INSERT OR REPLACE INTO repos "+
			"(name, path, graph_path, graph_mtime, graph_node_count, graph_last_seen, "+
			" code_graph_path, code_graph_mtime, code_graph_node_count) "+
			"VALUES (?,?,?,?,?,?,?,?,?)",
		repoName, repoRoot, graphPath, graphMTime, graphNodes, now,
		codeGraphPath, codeGraphMTime, codeGraphNodes,
	); err != nil {
		return 0, err
	}

	// Best-effort ANALYZE so the planner uses the new indexes. Never fail the scan on it.
	_, _ = tx.Exec("ANALYZE")

	if err := tx.Commit(); err != nil {
		return 0, err
	}
	RefreshStats(db) //nolint:errcheck — best-effort cache update
	return count, nil
}

// ReplaceRepo atomically replaces one repo's index: it clears the repo's existing
// rows and re-indexes the repo as a single all-or-nothing unit, committing once.
//
// R-2.8: a concurrent reader on another connection observes — under WAL (R-2.7) —
// either the pre-scan snapshot or the post-scan snapshot for the repo, never the
// empty window between delete and re-insert. This holds because FullScan already
// performs the delete (deleteRepoEntries) and the re-insert inside ONE *sql.Tx
// and commits exactly once; the deletion is not visible to other connections
// until that single commit. ReplaceRepo is a thin, named delegate to FullScan so
// the atomic-replace contract is explicit at the call site.
//
// IMPORTANT: callers MUST NOT call DeleteRepo before ReplaceRepo/FullScan. That
// pairing was the original defect — DeleteRepo commits its own transaction first,
// exposing exactly the empty intermediate state R-2.8 forbids. FullScan's single
// transaction is the atomic boundary; a separate pre-delete breaks it.
func ReplaceRepo(db *sql.DB, repoName, repoRoot string, skipDirectories []string) (int, error) {
	return FullScan(db, repoName, repoRoot, skipDirectories)
}

// IncrementalScan updates only changed files for a git repo.
// lastCommit is the previously stored HEAD hash (empty string = first scan).
// Returns the number of files updated and the new HEAD commit hash.
//
// Design: file reads happen outside the transaction via a worker pool (no DB
// lock held during I/O). All DB writes are batched into a single transaction.
func IncrementalScan(db *sql.DB, repoName, repoRoot, lastCommit string, skipDirectories []string) (int, string, error) {
	changed, err := git.ChangedFiles(repoRoot, lastCommit)
	if err != nil {
		return 0, lastCommit, err
	}
	changed = filterSkippedPaths(changed, skipDirectories)
	if len(changed) == 0 {
		newCommit := git.CurrentCommit(repoRoot)
		if newCommit == "" {
			newCommit = lastCommit
		}
		return 0, newCommit, nil
	}

	// Phase 1: read all changed files concurrently OUTSIDE the transaction.
	type pendingSpec struct {
		relPath string
		sp      *extract.Spec // nil = file was deleted
	}
	type workResult struct {
		toDelete []string
		toInsert []pendingSpec
		err      error
	}

	workerCount := runtime.NumCPU()
	if workerCount < 2 {
		workerCount = 2
	} else if workerCount > 16 {
		workerCount = 16
	}

	relCh := make(chan string, workerCount*2)
	resCh := make(chan workResult, workerCount*2)

	var wg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for rel := range relCh {
				absPath := filepath.Join(repoRoot, filepath.FromSlash(rel))
				ext := strings.ToLower(filepath.Ext(rel))
				var res workResult
				switch {
				case extract.MediaExts[ext]:
					res.toDelete = []string{rel}
					if git.FileExists(repoRoot, rel) {
						companion := extract.CompanionPath(absPath)
						sp, e := extract.FromCompanion(repoName, repoRoot, absPath, companion)
						if e == nil && sp != nil {
							res.toInsert = []pendingSpec{{rel, sp}}
						}
						// Silent skip when no companion: see FullScan above.
					}
				case extract.TextExts[ext]:
					if extract.HasMediaCompanion(absPath) {
						mediaSpecs, mediaRels, e := readMediaForCompanion(repoName, repoRoot, absPath)
						if e != nil {
							res.err = e
						} else {
							for i, mrel := range mediaRels {
								res.toDelete = append(res.toDelete, mrel)
								if mediaSpecs[i] != nil {
									res.toInsert = append(res.toInsert, pendingSpec{mrel, mediaSpecs[i]})
								}
							}
						}
					} else {
						res.toDelete = []string{rel}
						if git.FileExists(repoRoot, rel) {
							sp, e := extract.FromFile(repoName, repoRoot, absPath)
							if e == nil {
								res.toInsert = []pendingSpec{{rel, sp}}
							}
						}
					}
				}
				resCh <- res
			}
		}()
	}
	go func() {
		wg.Wait()
		close(resCh)
	}()
	go func() {
		for _, rel := range changed {
			relCh <- rel
		}
		close(relCh)
	}()

	var toDelete []string
	var toInsert []pendingSpec
	for res := range resCh {
		if res.err != nil {
			return 0, lastCommit, res.err
		}
		toDelete = append(toDelete, res.toDelete...)
		toInsert = append(toInsert, res.toInsert...)
	}

	if len(toDelete) == 0 && len(toInsert) == 0 {
		newCommit := git.CurrentCommit(repoRoot)
		if newCommit == "" {
			newCommit = lastCommit
		}
		return 0, newCommit, nil
	}

	// Phase 2: single transaction for all DB writes.
	tx, err := db.Begin()
	if err != nil {
		return 0, lastCommit, err
	}
	defer tx.Rollback() //nolint:errcheck

	for _, rel := range toDelete {
		if err := deleteSpecEntry(tx, repoName, rel); err != nil {
			return 0, lastCommit, err
		}
	}

	insertStmt, err := tx.Prepare(
		"INSERT OR REPLACE INTO specs " +
			"(repo,path,project,name,title,tags,summary,fullpath,modified,modified_unix,size,ext,content) " +
			"VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
	)
	if err != nil {
		return 0, lastCommit, err
	}
	defer insertStmt.Close()

	for _, p := range toInsert {
		sp := p.sp
		if _, err := insertStmt.Exec(
			sp.Repo, sp.Path, sp.Project, sp.Name, sp.Title,
			sp.Tags, sp.Summary, sp.FullPath, sp.Modified, sp.ModifiedUnix, sp.Size, sp.Ext, sp.Content,
		); err != nil {
			return 0, lastCommit, err
		}
	}

	// Batch FTS and tags for all newly inserted specs in two SQL passes.
	insertedPaths := make([]string, len(toInsert))
	for i, p := range toInsert {
		insertedPaths[i] = p.relPath
	}
	if err := batchInsertFTSPaths(tx, repoName, insertedPaths); err != nil {
		return 0, lastCommit, err
	}
	if err := batchInsertTagsPaths(tx, repoName, insertedPaths); err != nil {
		return 0, lastCommit, err
	}
	if err := batchInsertVectorsPaths(tx, repoName, insertedPaths); err != nil {
		return 0, lastCommit, err
	}

	if err := tx.Commit(); err != nil {
		return 0, lastCommit, err
	}
	RefreshStats(db) //nolint:errcheck — best-effort cache update

	newCommit := git.CurrentCommit(repoRoot)
	if newCommit == "" {
		newCommit = lastCommit
	}
	return len(toInsert), newCommit, nil
}

// DeleteRepo removes all database entries for the named repo and repopulates FTS
// for the remaining repos.
func DeleteRepo(db *sql.DB, repoName string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck

	if err := deleteRepoEntries(tx, repoName); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM repos WHERE name=?", repoName); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM meta WHERE key=?", "git_commit_"+repoName); err != nil {
		return err
	}

	// deleteRepoEntries already removed only this repo's FTS entries via
	// "DELETE FROM specs_fts WHERE rowid IN (...)" — remaining repos' FTS data
	// is intact, so no re-index is needed.

	return tx.Commit()
}

// ── directory walk ────────────────────────────────────────────────────────────

// walkItems walks repoRoot and sends indexable files directly to workCh.
// Workers start consuming as soon as the first item arrives — no intermediate
// slice is built. Cache entries are evicted as soon as WalkDir moves to a
// different parent directory, keeping memory O(current depth) regardless of
// whether directories contain indexable files.
// Permission-denied errors are skipped; other errors abort the walk.
func walkItems(repoRoot string, workCh chan<- workItem, skipDirectories []string) error {
	skipSet := toSkipDirSet(skipDirectories)
	mediaStems := map[string]map[string]bool{} // dir → stem → true
	lastDir := ""

	return filepath.WalkDir(repoRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if os.IsPermission(err) {
				return nil // skip unreadable dirs/files, continue walk
			}
			return err
		}
		if d.IsDir() {
			if shouldSkipDir(path, repoRoot, skipSet) {
				return filepath.SkipDir
			}
			// Evict the previous directory's cache as soon as we descend into a
			// new one. WalkDir is depth-first so lastDir won't be visited again.
			if lastDir != "" && lastDir != path {
				delete(mediaStems, lastDir)
			}
			entries, readErr := os.ReadDir(path)
			if readErr == nil {
				mediaStems[path] = extract.BuildMediaStems(entries)
			}
			lastDir = path
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		dir := filepath.Dir(path)

		// Evict when the file's parent differs from the last-seen directory
		// (handles directories that contain only subdirs and no files).
		if dir != lastDir {
			delete(mediaStems, lastDir)
			lastDir = dir
		}

		switch {
		case extract.TextExts[ext]:
			// Skip .md/.mdx files that are sidecars for a media file.
			stem := strings.TrimSuffix(d.Name(), filepath.Ext(d.Name()))
			if stems, ok := mediaStems[dir]; ok {
				if stems[stem] {
					return nil // sidecar — skip
				}
			} else if extract.HasMediaCompanion(path) {
				return nil // fallback (rare: dir not in cache)
			}
			workCh <- workItem{path, d, false}

		case extract.MediaExts[ext]:
			workCh <- workItem{path, d, true}
		}

		return nil
	})
}

func toSkipDirSet(skipDirectories []string) map[string]bool {
	set := make(map[string]bool, len(skipDirectories))
	for _, name := range skipDirectories {
		name = strings.TrimSpace(name)
		if name != "" {
			set[name] = true
		}
	}
	return set
}

func shouldSkipDir(path, repoRoot string, skipSet map[string]bool) bool {
	if len(skipSet) == 0 {
		return false
	}
	if path == repoRoot {
		return false
	}
	return skipSet[filepath.Base(path)]
}

func filterSkippedPaths(paths, skipDirectories []string) []string {
	if len(paths) == 0 || len(skipDirectories) == 0 {
		return paths
	}
	skipSet := toSkipDirSet(skipDirectories)
	out := make([]string, 0, len(paths))
	for _, p := range paths {
		if !pathHasSkippedDir(p, skipSet) {
			out = append(out, p)
		}
	}
	return out
}

func pathHasSkippedDir(relPath string, skipSet map[string]bool) bool {
	if len(skipSet) == 0 {
		return false
	}
	for _, seg := range strings.Split(filepath.ToSlash(relPath), "/") {
		if skipSet[seg] {
			return true
		}
	}
	return false
}

// ── batch DB operations ───────────────────────────────────────────────────────

func deleteRepoEntries(tx *sql.Tx, repoName string) error {
	// FTS5 contentless tables require the 'delete' command with the indexed
	// fields. We omit the full 'content' column (up to 10 MB per row) and pass
	// an empty string instead — FTS5 contentless tables do not verify content
	// on delete, so this is safe and avoids loading large blobs into RAM.
	// Materialize all rows first, close the read cursor, then execute writes —
	// avoids holding a read cursor open while issuing write statements on the
	// same connection (can serialize or deadlock with modernc.org/sqlite).
	rows, err := tx.Query(
		"SELECT id,repo,name,title,tags,summary FROM specs WHERE repo=?", repoName,
	)
	if err != nil {
		return err
	}

	type specRow struct {
		id                               int64
		repo, name, title, tags, summary string
	}
	var toDelete []specRow
	for rows.Next() {
		var r specRow
		if err := rows.Scan(&r.id, &r.repo, &r.name, &r.title, &r.tags, &r.summary); err != nil {
			rows.Close()
			return err
		}
		toDelete = append(toDelete, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	ftsStmt, err := tx.Prepare(
		"INSERT INTO specs_fts(specs_fts,rowid,repo,name,title,tags,summary,content) " +
			"VALUES('delete',?,?,?,?,?,?,?)",
	)
	if err != nil {
		return err
	}
	defer ftsStmt.Close()

	for _, r := range toDelete {
		// Pass "" for content — FTS5 contentless delete does not validate it.
		if _, err := ftsStmt.Exec(r.id, r.repo, r.name, r.title, r.tags, r.summary, ""); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(
		"DELETE FROM spec_tags WHERE spec_id IN (SELECT id FROM specs WHERE repo=?)", repoName,
	); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM spec_vectors WHERE repo=?", repoName); err != nil {
		return err
	}
	if _, err := tx.Exec(
		"DELETE FROM spec_edges WHERE src_spec_id IN (SELECT id FROM specs WHERE repo=?) "+
			"OR dst_spec_id IN (SELECT id FROM specs WHERE repo=?)", repoName, repoName,
	); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM specs WHERE repo=?", repoName); err != nil {
		return err
	}
	return nil
}

func batchInsertFTS(tx *sql.Tx, repoName string) error {
	_, err := tx.Exec(
		"INSERT INTO specs_fts(rowid,repo,name,title,tags,summary,content) "+
			"SELECT id,repo,name,title,tags,summary,content FROM specs WHERE repo=?",
		repoName,
	)
	return err
}

// sqliteMaxVars is the default SQLITE_MAX_VARIABLE_NUMBER limit. We reserve
// one slot for the repo argument, so batches use at most sqliteMaxVars-1 paths.
const sqliteMaxVars = 999

// batchInsertFTSPaths inserts FTS entries for a specific set of paths within a repo.
// Paths are chunked into batches of ≤998 to stay within SQLite's variable limit.
func batchInsertFTSPaths(tx *sql.Tx, repoName string, paths []string) error {
	return chunkPaths(paths, func(chunk []string) error {
		placeholders := strings.Repeat("?,", len(chunk))
		placeholders = placeholders[:len(placeholders)-1]
		args := make([]any, 0, len(chunk)+1)
		args = append(args, repoName)
		for _, p := range chunk {
			args = append(args, p)
		}
		_, err := tx.Exec(
			"INSERT INTO specs_fts(rowid,repo,name,title,tags,summary,content) "+
				"SELECT id,repo,name,title,tags,summary,content FROM specs WHERE repo=? AND path IN ("+placeholders+")",
			args...,
		)
		return err
	})
}

// batchInsertTagsPaths inserts spec_tags rows for a specific set of paths within a repo.
// Paths are chunked into batches of ≤998 to stay within SQLite's variable limit.
func batchInsertTagsPaths(tx *sql.Tx, repoName string, paths []string) error {
	stmt, err := tx.Prepare("INSERT INTO spec_tags (spec_id,tag) VALUES (?,?)")
	if err != nil {
		return err
	}
	defer stmt.Close()

	return chunkPaths(paths, func(chunk []string) error {
		placeholders := strings.Repeat("?,", len(chunk))
		placeholders = placeholders[:len(placeholders)-1]
		args := make([]any, 0, len(chunk)+1)
		args = append(args, repoName)
		for _, p := range chunk {
			args = append(args, p)
		}
		rows, err := tx.Query(
			"SELECT id, tags FROM specs WHERE repo=? AND tags != '' AND path IN ("+placeholders+")",
			args...,
		)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var id int64
			var tags string
			if err := rows.Scan(&id, &tags); err != nil {
				return err
			}
			for _, tag := range splitTags(tags) {
				if _, err := stmt.Exec(id, tag); err != nil {
					return err
				}
			}
		}
		return rows.Err()
	})
}

func batchInsertTags(tx *sql.Tx, repoName string) error {
	rows, err := tx.Query(
		"SELECT id, tags FROM specs WHERE repo=? AND tags != ''", repoName,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	stmt, err := tx.Prepare("INSERT INTO spec_tags (spec_id,tag) VALUES (?,?)")
	if err != nil {
		return err
	}
	defer stmt.Close()

	for rows.Next() {
		var id int64
		var tags string
		if err := rows.Scan(&id, &tags); err != nil {
			return err
		}
		for _, tag := range splitTags(tags) {
			if _, err := stmt.Exec(id, tag); err != nil {
				return err
			}
		}
	}
	return rows.Err()
}

// batchInsertVectors embeds every spec in the repo and stores an L2-normalized
// feature-hash vector in spec_vectors. Zero-vector embeddings (empty content)
// are skipped. Embedding is pure-CPU hashing, so running it in-transaction is fine.
func batchInsertVectors(tx *sql.Tx, repoName string) error {
	rows, err := tx.Query(
		"SELECT id, title, summary, content FROM specs WHERE repo=?", repoName,
	)
	if err != nil {
		return err
	}
	// Materialize rows before issuing writes on the same connection (modernc.org/sqlite
	// can serialize/deadlock if a read cursor is open during writes).
	type vrow struct {
		id   int64
		text string
	}
	var toEmbed []vrow
	for rows.Next() {
		var id int64
		var title, summary, content string
		if err := rows.Scan(&id, &title, &summary, &content); err != nil {
			rows.Close()
			return err
		}
		toEmbed = append(toEmbed, vrow{id, title + "\n" + summary + "\n" + content})
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	stmt, err := tx.Prepare(
		"INSERT OR REPLACE INTO spec_vectors(spec_id,repo,dim,vec) VALUES (?,?,?,?)",
	)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, r := range toEmbed {
		v := embed.Embed(r.text)
		if isZeroVec(v) {
			continue
		} // skip empty-content specs
		if _, err := stmt.Exec(r.id, repoName, embed.Dim, embed.Encode(v)); err != nil {
			return err
		}
	}
	return nil
}

func isZeroVec(v []float32) bool {
	for _, x := range v {
		if x != 0 {
			return false
		}
	}
	return true
}

// batchInsertVectorsPaths embeds specs restricted to a set of paths within a repo
// and stores their L2-normalized vectors in spec_vectors. Zero-vector embeddings
// are skipped. Paths are chunked into batches of ≤998 to stay within SQLite's
// variable limit.
func batchInsertVectorsPaths(tx *sql.Tx, repoName string, paths []string) error {
	stmt, err := tx.Prepare(
		"INSERT OR REPLACE INTO spec_vectors(spec_id,repo,dim,vec) VALUES (?,?,?,?)",
	)
	if err != nil {
		return err
	}
	defer stmt.Close()

	return chunkPaths(paths, func(chunk []string) error {
		placeholders := strings.Repeat("?,", len(chunk))
		placeholders = placeholders[:len(placeholders)-1]
		args := make([]any, 0, len(chunk)+1)
		args = append(args, repoName)
		for _, p := range chunk {
			args = append(args, p)
		}
		rows, err := tx.Query(
			"SELECT id, title, summary, content FROM specs WHERE repo=? AND path IN ("+placeholders+")",
			args...,
		)
		if err != nil {
			return err
		}
		// Materialize rows before issuing writes on the same connection (modernc.org/sqlite
		// can serialize/deadlock if a read cursor is open during writes).
		type vrow struct {
			id   int64
			text string
		}
		var toEmbed []vrow
		for rows.Next() {
			var id int64
			var title, summary, content string
			if err := rows.Scan(&id, &title, &summary, &content); err != nil {
				rows.Close()
				return err
			}
			toEmbed = append(toEmbed, vrow{id, title + "\n" + summary + "\n" + content})
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}

		for _, r := range toEmbed {
			v := embed.Embed(r.text)
			if isZeroVec(v) {
				continue
			} // skip empty-content specs
			if _, err := stmt.Exec(r.id, repoName, embed.Dim, embed.Encode(v)); err != nil {
				return err
			}
		}
		return nil
	})
}

// ── single-file incremental helpers ─────────────────────────────────────────

func deleteSpecEntry(tx *sql.Tx, repoName, relPath string) error {
	var id int64
	var repo, name, title, tags, summary string
	err := tx.QueryRow(
		"SELECT id,repo,name,title,tags,summary FROM specs WHERE repo=? AND path=?",
		repoName, relPath,
	).Scan(&id, &repo, &name, &title, &tags, &summary)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}

	// Pass "" for content — FTS5 contentless delete does not validate it.
	if _, err := tx.Exec(
		"INSERT INTO specs_fts(specs_fts,rowid,repo,name,title,tags,summary,content) "+
			"VALUES('delete',?,?,?,?,?,?,?)",
		id, repo, name, title, tags, summary, "",
	); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM spec_tags WHERE spec_id=?", id); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM spec_vectors WHERE spec_id=?", id); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM spec_edges WHERE src_spec_id=? OR dst_spec_id=?", id, id); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM specs WHERE id=?", id); err != nil {
		return err
	}
	return nil
}

// readMediaForCompanion reads media specs whose sidecar .md just changed.
// Returns parallel slices of specs and their relative paths.
func readMediaForCompanion(repoName, repoRoot, companionAbsPath string) ([]*extract.Spec, []string, error) {
	stem := strings.TrimSuffix(companionAbsPath, filepath.Ext(companionAbsPath))
	var specs []*extract.Spec
	var rels []string
	for ext := range extract.MediaExts {
		mediaAbs := stem + ext
		if _, err := os.Stat(mediaAbs); os.IsNotExist(err) {
			continue
		}
		rel, err := filepath.Rel(repoRoot, mediaAbs)
		if err != nil {
			continue
		}
		rel = filepath.ToSlash(rel)
		sp, err := extract.FromCompanion(repoName, repoRoot, mediaAbs, companionAbsPath)
		if err != nil {
			continue
		}
		specs = append(specs, sp) // may be nil if companion empty
		rels = append(rels, rel)
	}
	return specs, rels, nil
}

// ── tag helpers ───────────────────────────────────────────────────────────────

func splitTags(tags string) []string {
	var result []string
	for _, t := range strings.Split(tags, ",") {
		t = strings.TrimSpace(t)
		if t != "" {
			result = append(result, t)
		}
	}
	return result
}

// chunkPaths calls fn for each sub-slice of paths of length ≤ sqliteMaxVars-1,
// keeping every batch within SQLite's SQLITE_MAX_VARIABLE_NUMBER limit (one
// slot is reserved for the repo argument that always accompanies the batch).
func chunkPaths(paths []string, fn func([]string) error) error {
	const batchSize = sqliteMaxVars - 1 // 998
	for len(paths) > 0 {
		end := batchSize
		if end > len(paths) {
			end = len(paths)
		}
		if err := fn(paths[:end]); err != nil {
			return err
		}
		paths = paths[end:]
	}
	return nil
}
