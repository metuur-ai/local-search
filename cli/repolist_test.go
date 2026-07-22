package main

import (
	"io"
	"os"
	"strings"
	"testing"
	"time"

	localdb "local-search/db"
)

// R-4.1/4.2/4.3/3.6: a repo with full tracked state renders real ages + a 7-char
// commit; a legacy repo with empty AddedAt renders "—" in the ADDED column.
func TestFormatRepoList_FullAndLegacyState(t *testing.T) {
	setupScanEnv(t)

	full := repoEntry{
		Name:    "full",
		Path:    "/tmp/full",
		AddedAt: time.Now().Add(-48 * time.Hour).UTC().Format(time.RFC3339),
	}
	legacy := repoEntry{Name: "legacy", Path: "/tmp/legacy"} // no AddedAt

	db, err := localdb.Open(dbFile)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()
	if err := localdb.CreateSchema(db); err != nil {
		t.Fatalf("schema: %v", err)
	}
	now := time.Now()
	_ = localdb.SetMeta(db, "last_scan_full", now.Add(-2*time.Hour).UTC().Format(time.RFC3339))
	_ = localdb.SetMeta(db, "last_index_update_full", now.Add(-10*time.Minute).UTC().Format(time.RFC3339))
	_ = localdb.SetMeta(db, "git_commit_full", "3231af4deadbeefcafe")

	out := formatRepoList([]repoEntry{full, legacy}, db)

	for _, want := range []string{"full", "legacy", "/tmp/full", "/tmp/legacy", "3231af4", "2d", "2h", "10m", "—"} {
		if !strings.Contains(out, want) {
			t.Errorf("expected output to contain %q; got:\n%s", want, out)
		}
	}
	// The full commit hash must be truncated to 7 chars.
	if strings.Contains(out, "3231af4deadbeef") {
		t.Errorf("commit should be short (7-char), not full; got:\n%s", out)
	}
}

// R-4.4: with the DB absent, repoList must still list name/path/added, render
// DB-derived columns as "—", and exit cleanly (no error/panic).
func TestRepoList_DBAbsent_ExitsCleanly(t *testing.T) {
	setupScanEnv(t)

	r := repoEntry{
		Name:    "docs",
		Path:    "/tmp/docs",
		AddedAt: time.Now().Add(-24 * time.Hour).UTC().Format(time.RFC3339),
	}
	saveRepos([]repoEntry{r})
	_ = os.Remove(dbFile) // ensure DB is absent

	out := captureRepoListStdout(t)

	for _, want := range []string{"docs", "/tmp/docs", "1d", "—"} {
		if !strings.Contains(out, want) {
			t.Errorf("expected output to contain %q; got:\n%s", want, out)
		}
	}
	// DB must not have been recreated as a side effect of a read-only list.
	if _, err := os.Stat(dbFile); err == nil {
		t.Errorf("repo list recreated the DB file; should be best-effort read-only")
	}
}

// captureRepoListStdout runs repoList() with os.Stdout redirected to a pipe and
// returns everything printed.
func captureRepoListStdout(t *testing.T) string {
	t.Helper()
	old := os.Stdout
	rp, wp, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	os.Stdout = wp
	done := make(chan string, 1)
	go func() {
		b, _ := io.ReadAll(rp)
		done <- string(b)
	}()

	repoList()

	_ = wp.Close()
	os.Stdout = old
	return <-done
}
