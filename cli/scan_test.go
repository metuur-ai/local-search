package main

import (
	"bytes"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"

	localdb "local-search/db"
)

// setupScanEnv points the package-level appDir/reposFile/dbFile at a temp dir so
// cmdScan operates in isolation. Restored on cleanup. Not parallel-safe (mutates
// package globals), so these tests must not call t.Parallel().
func setupScanEnv(t *testing.T) {
	t.Helper()
	dir := t.TempDir()
	oldApp, oldRepos, oldDB := appDir, reposFile, dbFile
	appDir = dir
	reposFile = filepath.Join(dir, "repos")
	dbFile = filepath.Join(dir, "specs.db")
	t.Cleanup(func() {
		appDir, reposFile, dbFile = oldApp, oldRepos, oldDB
	})
}

// makeScanRepo creates a non-git repo dir with a single indexable spec file.
func makeScanRepo(t *testing.T, name string) repoEntry {
	t.Helper()
	dir := t.TempDir()
	writeSpec(t, filepath.Join(dir, name+".md"), "# "+name+"\n\nspec for "+name+"\n")
	return repoEntry{Name: name, Path: dir}
}

func countSpecs(t *testing.T, db *sql.DB, repo string) int {
	t.Helper()
	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM specs WHERE repo = ?", repo).Scan(&n); err != nil {
		t.Fatalf("count specs for %q: %v", repo, err)
	}
	return n
}

// R-2.3: with A/B/C registered, a surgical `scan A` leaves B and C rows still
// queryable — no intervening `scan all`. (The pre-overhaul body os.Remove'd the
// DB and full-scanned only A, which would drop B and C; this asserts against it.)
func TestCmdScan_Surgical_PreservesOtherRepos(t *testing.T) {
	setupScanEnv(t)
	a, b, c := makeScanRepo(t, "a"), makeScanRepo(t, "b"), makeScanRepo(t, "c")
	saveRepos([]repoEntry{a, b, c})

	cmdScan([]string{"all"}) // populate all three
	cmdScan([]string{"a"})   // surgical rescan of A only

	db, err := localdb.Open(dbFile)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()
	for _, name := range []string{"a", "b", "c"} {
		if countSpecs(t, db, name) == 0 {
			t.Fatalf("repo %q has no rows after a surgical scan of a", name)
		}
	}
}

// R-2.2: a surgical scan must not delete the DB file. os.SameFile proves the
// underlying file identity (dev+inode) is unchanged — i.e. not removed+recreated.
func TestCmdScan_Surgical_DoesNotDeleteDBFile(t *testing.T) {
	setupScanEnv(t)
	a, b := makeScanRepo(t, "a"), makeScanRepo(t, "b")
	saveRepos([]repoEntry{a, b})

	cmdScan([]string{"all"}) // create the DB
	before, err := os.Stat(dbFile)
	if err != nil {
		t.Fatalf("stat db before surgical scan: %v", err)
	}

	cmdScan([]string{"a"}) // surgical

	after, err := os.Stat(dbFile)
	if err != nil {
		t.Fatalf("db file missing after surgical scan: %v", err)
	}
	if !os.SameFile(before, after) {
		t.Fatalf("surgical scan replaced the DB file (identity changed)")
	}
}

// R-2.4: a fresh (no DB file) surgical scan creates the schema and indexes ONLY
// the target repo — it must not fan out to the other registered repos.
func TestCmdScan_Surgical_FreshDBIndexesOnlyTarget(t *testing.T) {
	setupScanEnv(t)
	a, b := makeScanRepo(t, "a"), makeScanRepo(t, "b")
	saveRepos([]repoEntry{a, b})

	if _, err := os.Stat(dbFile); !os.IsNotExist(err) {
		t.Fatalf("expected no DB file before the fresh surgical scan")
	}

	cmdScan([]string{"a"}) // bootstrap schema + index only A

	db, err := localdb.Open(dbFile)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()
	if countSpecs(t, db, "a") == 0 {
		t.Fatalf("target repo a was not indexed on a fresh surgical scan")
	}
	if n := countSpecs(t, db, "b"); n != 0 {
		t.Fatalf("non-target repo b was indexed on a fresh surgical scan (fan-out): %d rows", n)
	}
}

// R-1.3: a no-arg scan from a directory OUTSIDE every registered repo must fail
// with a non-zero (error) result and mutate NOTHING — the seeded DB's bytes are
// byte-for-byte identical afterward. Exercised through runScan (the testable seam
// under cmdScan) with an explicit cwd so the outcome does not depend on the test
// process's actual working directory.
func TestRunScan_OutsideAnyRepo_NoMutation(t *testing.T) {
	setupScanEnv(t)
	a, b := makeScanRepo(t, "a"), makeScanRepo(t, "b")
	repos := []repoEntry{a, b}
	saveRepos(repos)

	cmdScan([]string{"all"}) // seed a valid DB with real content

	before, err := os.ReadFile(dbFile)
	if err != nil {
		t.Fatalf("read seeded db: %v", err)
	}

	outside := t.TempDir() // not enclosed by any registered repo
	err = runScan(nil, outside, repos)

	if err == nil {
		t.Fatalf("expected non-nil error scanning from outside any repo")
	}
	after, rerr := os.ReadFile(dbFile)
	if rerr != nil {
		t.Fatalf("db file missing/unreadable after erroring scan: %v", rerr)
	}
	if !bytes.Equal(before, after) {
		t.Fatalf("DB mutated on outside-any-repo error: %d bytes before, %d after", len(before), len(after))
	}
}

// R-1.5 (no-mutation clause): `scan <bogus-name>` must fail and leave the seeded
// DB's bytes unchanged — an unknown name changes nothing.
func TestRunScan_UnknownName_NoMutation(t *testing.T) {
	setupScanEnv(t)
	a, b := makeScanRepo(t, "a"), makeScanRepo(t, "b")
	repos := []repoEntry{a, b}
	saveRepos(repos)

	cmdScan([]string{"all"}) // seed a valid DB with real content

	before, err := os.ReadFile(dbFile)
	if err != nil {
		t.Fatalf("read seeded db: %v", err)
	}

	err = runScan([]string{"bogus-name"}, a.Path, repos)

	if err == nil {
		t.Fatalf("expected non-nil error scanning an unknown repo name")
	}
	after, rerr := os.ReadFile(dbFile)
	if rerr != nil {
		t.Fatalf("db file missing/unreadable after erroring scan: %v", rerr)
	}
	if !bytes.Equal(before, after) {
		t.Fatalf("DB mutated on unknown-name error: %d bytes before, %d after", len(before), len(after))
	}
}

// R-3.3: a surgical `scan A` records that repo's per-repo last-scan timestamp
// (`last_scan_A`, parseable RFC3339) and does NOT write one for the untouched
// repos. Run on a fresh DB so only A is indexed — B must have no last_scan_B.
func TestCmdScan_Surgical_WritesPerRepoLastScan(t *testing.T) {
	setupScanEnv(t)
	a, b := makeScanRepo(t, "a"), makeScanRepo(t, "b")
	saveRepos([]repoEntry{a, b})

	cmdScan([]string{"a"}) // surgical scan of A only (bootstraps schema + indexes A)

	db, err := localdb.Open(dbFile)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	got := localdb.GetMeta(db, "last_scan_a")
	if got == "" {
		t.Fatalf("expected last_scan_a to be set after surgical scan of a")
	}
	if _, err := time.Parse(time.RFC3339, got); err != nil {
		t.Fatalf("last_scan_a is not RFC3339: %q (%v)", got, err)
	}
	if other := localdb.GetMeta(db, "last_scan_b"); other != "" {
		t.Fatalf("untouched repo b should have no last_scan_b, got %q", other)
	}
}

// R-3.3 + R-3.7: a full `scan all` writes a per-repo `last_scan_<name>` for EVERY
// registered repo (not only the global value), AND retains the global
// `meta["last_scan"]` consumed by `stats`.
func TestCmdScan_All_WritesPerRepoLastScanAndGlobal(t *testing.T) {
	setupScanEnv(t)
	a, b := makeScanRepo(t, "a"), makeScanRepo(t, "b")
	saveRepos([]repoEntry{a, b})

	cmdScan([]string{"all"})

	db, err := localdb.Open(dbFile)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	for _, name := range []string{"a", "b"} {
		got := localdb.GetMeta(db, "last_scan_"+name)
		if got == "" {
			t.Fatalf("expected last_scan_%s after scan all", name)
		}
		if _, err := time.Parse(time.RFC3339, got); err != nil {
			t.Fatalf("last_scan_%s is not RFC3339: %q (%v)", name, got, err)
		}
	}

	if global := localdb.GetMeta(db, "last_scan"); global == "" {
		t.Fatalf("global last_scan must be retained after scan all (R-3.7)")
	}
}

// R-6.4: `repo remove B` (with A/B/C registered and indexed) surgically deletes
// only B's rows — A and C stay queryable — drops B from the flat repos file, and
// does NOT delete/recreate the DB file (os.SameFile identity is preserved).
func TestRepoRemove_Surgical_PreservesOthersAndDBFile(t *testing.T) {
	setupScanEnv(t)
	a, b, c := makeScanRepo(t, "a"), makeScanRepo(t, "b"), makeScanRepo(t, "c")
	saveRepos([]repoEntry{a, b, c})

	cmdScan([]string{"all"}) // index all three
	before, err := os.Stat(dbFile)
	if err != nil {
		t.Fatalf("stat db before remove: %v", err)
	}

	repoRemove([]string{"b"}) // surgical remove of B

	after, err := os.Stat(dbFile)
	if err != nil {
		t.Fatalf("db file missing after repo remove: %v", err)
	}
	if !os.SameFile(before, after) {
		t.Fatalf("repo remove replaced the DB file (identity changed)")
	}

	db, err := localdb.Open(dbFile)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()
	for _, name := range []string{"a", "c"} {
		if countSpecs(t, db, name) == 0 {
			t.Fatalf("repo %q has no rows after removing b", name)
		}
	}
	if n := countSpecs(t, db, "b"); n != 0 {
		t.Fatalf("removed repo b still has %d rows", n)
	}

	for _, r := range loadRepos() {
		if r.Name == "b" {
			t.Fatalf("b is still in the flat repos file after remove")
		}
	}
}

// R-2.6: `scan all` deletes the DB file and rebuilds from scratch. Proven
// deterministically: a repo indexed then deregistered is purged only if the DB
// was deleted and re-indexed from the (now shorter) repos file.
func TestCmdScan_All_RebuildsFromScratch(t *testing.T) {
	setupScanEnv(t)
	a, b := makeScanRepo(t, "a"), makeScanRepo(t, "b")
	saveRepos([]repoEntry{a, b})
	cmdScan([]string{"all"}) // DB has a and b

	saveRepos([]repoEntry{a}) // deregister b
	cmdScan([]string{"all"})  // full rebuild from the (a-only) repos file

	db, err := localdb.Open(dbFile)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()
	if countSpecs(t, db, "a") == 0 {
		t.Fatalf("repo a missing after scan all")
	}
	if n := countSpecs(t, db, "b"); n != 0 {
		t.Fatalf("scan all did not purge deregistered repo b: %d rows", n)
	}
}

// R-3.1 + R-6.3: `repo add` stamps a non-empty RFC3339 added_at on the new repo,
// then surgically indexes ONLY that repo. The pre-existing repo A is neither
// re-scanned (its last_scan_a is unchanged) nor dropped, and the DB file is not
// deleted/recreated (os.SameFile identity is preserved) — the old full-rebuild
// path would have failed all three.
func TestRepoAdd_StampsAddedAtAndSurgicallyIndexesOnlyNew(t *testing.T) {
	setupScanEnv(t)
	a := makeScanRepo(t, "a")
	saveRepos([]repoEntry{a})
	cmdScan([]string{"all"}) // index A and create the DB

	db0, err := localdb.Open(dbFile)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	lastScanA := localdb.GetMeta(db0, "last_scan_a")
	if lastScanA == "" {
		t.Fatalf("expected last_scan_a after scan all")
	}
	db0.Close()

	before, err := os.Stat(dbFile)
	if err != nil {
		t.Fatalf("stat db before repo add: %v", err)
	}

	n := makeScanRepo(t, "n")
	repoAdd([]string{n.Path, "n"}) // surgical add of the new repo N

	// R-6.3: the DB file was not deleted/recreated.
	after, err := os.Stat(dbFile)
	if err != nil {
		t.Fatalf("db file missing after repo add: %v", err)
	}
	if !os.SameFile(before, after) {
		t.Fatalf("repo add replaced the DB file (identity changed)")
	}

	// R-3.1: N's flat-file line carries a non-empty, parseable RFC3339 added_at.
	var found bool
	for _, r := range loadRepos() {
		if r.Name == "n" {
			found = true
			if r.AddedAt == "" {
				t.Fatalf("repo add did not stamp added_at on n")
			}
			if _, err := time.Parse(time.RFC3339, r.AddedAt); err != nil {
				t.Fatalf("n added_at is not RFC3339: %q (%v)", r.AddedAt, err)
			}
		}
	}
	if !found {
		t.Fatalf("repo n missing from flat repos file after add")
	}

	db, err := localdb.Open(dbFile)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	// R-6.3: N is queryable; A was not re-scanned but is still queryable.
	if countSpecs(t, db, "n") == 0 {
		t.Fatalf("repo n has no rows after add")
	}
	if countSpecs(t, db, "a") == 0 {
		t.Fatalf("repo a should stay queryable after adding n")
	}
	if got := localdb.GetMeta(db, "last_scan_a"); got != lastScanA {
		t.Fatalf("last_scan_a changed (a was re-scanned): before %q, after %q", lastScanA, got)
	}
}
