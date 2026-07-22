package db

import (
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// isLockedErr reports whether err is a SQLite lock-contention failure, i.e. the
// class of error R-2.7 requires us to avoid under concurrent scan/query.
func isLockedErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "database is locked") ||
		strings.Contains(msg, "sqlite_busy") ||
		strings.Contains(msg, "database table is locked")
}

// TestOpen_ConcurrentScanAndQueryNoLock proves R-2.7: two handles to the same
// file-backed DB (a scan-like writer and a foreground reader/writer, as the two
// processes automation creates) contend without any SQLITE_BUSY / "database is
// locked" failure, and the index is intact afterward. The bounded busy_timeout
// (plus WAL) set in Open is what makes losers wait rather than fail.
func TestOpen_ConcurrentScanAndQueryNoLock(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "specs.db")

	// Handle A == the scan/writer process.
	writer, err := Open(path)
	if err != nil {
		t.Fatalf("Open writer: %v", err)
	}
	defer writer.Close()

	if _, err := writer.Exec(`CREATE TABLE t(id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)`); err != nil {
		t.Fatalf("create table: %v", err)
	}

	// Handle B == the foreground search/ensureDB process, which the LLD notes may
	// also be writing. A separate *sql.DB means a genuine second SQLite
	// connection, so writer-writer contention actually exercises busy_timeout.
	other, err := Open(path)
	if err != nil {
		t.Fatalf("Open other: %v", err)
	}
	defer other.Close()

	const iterations = 300
	errCh := make(chan error, 4*iterations)
	var wg sync.WaitGroup

	// Writer goroutine: a scan-like insert loop.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < iterations; i++ {
			if _, err := writer.Exec(`INSERT INTO t(v) VALUES (?)`, "scan"); err != nil {
				errCh <- fmt.Errorf("writer insert %d: %w", i, err)
			}
		}
	}()

	// Contending goroutine: interleaves reads (query) and writes (ensureDB) on a
	// second connection while the writer runs.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < iterations; i++ {
			var n int
			if err := other.QueryRow(`SELECT COUNT(*) FROM t`).Scan(&n); err != nil {
				errCh <- fmt.Errorf("query %d: %w", i, err)
			}
			if _, err := other.Exec(`INSERT INTO t(v) VALUES (?)`, "query"); err != nil {
				errCh <- fmt.Errorf("other insert %d: %w", i, err)
			}
		}
	}()

	wg.Wait()
	close(errCh)

	for err := range errCh {
		if isLockedErr(err) {
			t.Fatalf("lock contention under concurrent scan/query (R-2.7 violated): %v", err)
		}
		t.Fatalf("unexpected error under contention: %v", err)
	}

	// Index intact: every committed insert from both goroutines is present.
	var final int
	if err := other.QueryRow(`SELECT COUNT(*) FROM t`).Scan(&final); err != nil {
		t.Fatalf("final count: %v", err)
	}
	if want := 2 * iterations; final != want {
		t.Fatalf("index not intact: got %d rows, want %d", final, want)
	}
}
