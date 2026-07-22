package db

import (
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
)

// TestReplaceRepo_ConcurrentReaderNeverSeesEmpty proves R-2.8: while ReplaceRepo
// re-indexes repo A in a loop on one connection, a concurrent reader on another
// connection must always observe A with its specs — either the pre-scan or the
// post-scan set — and NEVER the empty intermediate that a naive
// DeleteRepo-then-FullScan pair (two commits) would expose. WAL (from R-2.7) plus
// FullScan's single commit are what make the delete→reindex window unobservable.
//
// Run with -race to exercise the two-connection interleaving.
func TestReplaceRepo_ConcurrentReaderNeverSeesEmpty(t *testing.T) {
	// Seed repo A's source tree with >0 spec files.
	srcDir := t.TempDir()
	for _, name := range []string{"a.md", "b.md", "c.md"} {
		if err := os.WriteFile(filepath.Join(srcDir, name), []byte("# "+name+"\n\nbody\n"), 0644); err != nil {
			t.Fatalf("write seed file: %v", err)
		}
	}

	path := filepath.Join(t.TempDir(), "specs.db")

	// Handle A == the scan/writer process.
	writer, err := Open(path)
	if err != nil {
		t.Fatalf("open writer: %v", err)
	}
	defer writer.Close()
	if err := CreateSchema(writer); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	seed, err := ReplaceRepo(writer, "A", srcDir, nil)
	if err != nil {
		t.Fatalf("seed ReplaceRepo: %v", err)
	}
	if seed == 0 {
		t.Fatalf("seed indexed 0 specs; test needs >0 to detect an empty window")
	}

	// Handle B == a foreground reader process (a genuine second SQLite connection).
	reader, err := Open(path)
	if err != nil {
		t.Fatalf("open reader: %v", err)
	}
	defer reader.Close()

	countA := func() (int, error) {
		var n int
		err := reader.QueryRow("SELECT COUNT(*) FROM specs WHERE repo=?", "A").Scan(&n)
		return n, err
	}

	var (
		wg       sync.WaitGroup
		done     atomic.Bool
		sawEmpty atomic.Bool
		failErr  atomic.Value // error
	)

	// Reader: hammer COUNT(*) for A until the writer signals completion.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for !done.Load() {
			n, err := countA()
			if err != nil {
				failErr.Store(err)
				return
			}
			if n == 0 {
				sawEmpty.Store(true)
				return
			}
		}
	}()

	// Writer: replace A repeatedly. Each ReplaceRepo is one atomic unit.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 40; i++ {
			if _, err := ReplaceRepo(writer, "A", srcDir, nil); err != nil {
				failErr.Store(err)
				break
			}
		}
		done.Store(true)
	}()

	wg.Wait()

	if v := failErr.Load(); v != nil {
		t.Fatalf("error during concurrent replace/read: %v", v.(error))
	}
	if sawEmpty.Load() {
		t.Fatalf("R-2.8 violated: concurrent reader observed repo A with zero specs (empty intermediate)")
	}

	final, err := countA()
	if err != nil {
		t.Fatalf("final count: %v", err)
	}
	if final != seed {
		t.Fatalf("index not intact after concurrent replaces: final specs=%d, want %d", final, seed)
	}
}
