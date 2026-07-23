// Unit 3 acceptance gates: rebuild equivalence (task 3.1 / R-3.2) and
// incremental ≡ full-scan equivalence (task 3.2 / R-3.3), both diff-tested
// through the canonical KGExport ordering.
package db

import (
	"database/sql"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"local-search/git"
)

// ── fixture helpers ──────────────────────────────────────────────────────────

// kgdMtimeSeq hands out strictly increasing per-write mtimes (seconds apart,
// anchored in the past). Every file VERSION gets a unique mtime, so an edit can
// never collide with the previously indexed mtime of the same path — the
// IncrementalScan mtime fast path must see every real edit, and a sub-second
// collision manufactured by test speed would be a fixture artifact, not the
// product behavior under test.
var kgdMtimeSeq int64

// kgdWrite writes a file (creating parent dirs) with a unique mtime.
func kgdWrite(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
	seq := atomic.AddInt64(&kgdMtimeSeq, 1)
	ts := time.Now().Add(time.Duration(seq-100000) * time.Second)
	if err := os.Chtimes(path, ts, ts); err != nil {
		t.Fatalf("chtimes %s: %v", path, err)
	}
}

// kgdGit runs git in dir with a deterministic identity.
func kgdGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=test", "GIT_AUTHOR_EMAIL=test@example.com",
		"GIT_COMMITTER_NAME=test", "GIT_COMMITTER_EMAIL=test@example.com",
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v in %s: %v\n%s", args, dir, err, out)
	}
}

// kgdOpen opens a fresh schema-initialized DB in its own temp dir.
func kgdOpen(t *testing.T) *sql.DB {
	t.Helper()
	dbh, err := Open(filepath.Join(t.TempDir(), "specs.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { dbh.Close() })
	if err := CreateSchema(dbh); err != nil {
		t.Fatalf("CreateSchema: %v", err)
	}
	return dbh
}

// kgdExport returns the canonical export plus a canonically ordered dump of the
// raw declaration layer, so rebuild drift in EITHER layer fails the diff.
func kgdExport(t *testing.T, dbh *sql.DB) string {
	t.Helper()
	exp, err := KGExport(dbh)
	if err != nil {
		t.Fatalf("KGExport: %v", err)
	}
	rows, err := dbh.Query("SELECT repo,path,id,kind,title FROM kg_decls ORDER BY repo, path, id")
	if err != nil {
		t.Fatalf("query kg_decls: %v", err)
	}
	defer rows.Close()
	var b strings.Builder
	b.WriteString(exp)
	for rows.Next() {
		var repo, path, id, kind, title string
		if err := rows.Scan(&repo, &path, &id, &kind, &title); err != nil {
			t.Fatalf("scan kg_decls: %v", err)
		}
		b.WriteString("decl\t" + repo + "\t" + path + "\t" + id + "\t" + kind + "\t" + title + "\n")
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("kg_decls rows: %v", err)
	}
	return b.String()
}

// kgdWriteFixture populates a multi-repo working tree exercising every kg
// feature the export serializes: canonical IDs, fallback IDs, a cross-repo
// conflict (R-1.4), a phantom (R-1.5), reversed edges, list/scalar edge
// fields, and a media file with a sidecar companion.
func kgdWriteFixture(t *testing.T, repoA, repoB, repoC string) {
	t.Helper()
	kgdWrite(t, filepath.Join(repoA, "auth.md"), `---
id: component://auth
dependsOn:
  - component://ledger
relationships: [component://payments]
---
# Auth service

Owns login.
`)
	kgdWrite(t, filepath.Join(repoA, "pay.md"), `---
id: component://payments
components:
  - component://auth
---
# Payments (claim A)
`)
	if err := os.WriteFile(filepath.Join(repoA, "diagram.png"), []byte("\x89PNG-fake"), 0o644); err != nil {
		t.Fatalf("write diagram.png: %v", err)
	}
	kgdWrite(t, filepath.Join(repoA, "diagram.md"), `---
implementedBy: component://auth
---
# Diagram sidecar
`)
	kgdWrite(t, filepath.Join(repoB, "payments.md"), `---
id: component://payments
upstream: component://auth
---
# Payments (claim B)
`)
	kgdWrite(t, filepath.Join(repoB, "notes.md"), `---
implementedBy:
  - component://auth
from-discovery: req://checkout/r9
---
# Notes
`)
	kgdWrite(t, filepath.Join(repoC, "reqs.md"), `---
id: req://checkout/r1
dependsOn: [component://payments, component://auth]
---
# Checkout requirement 1
`)
}

// kgdSanity guards against a vacuously passing diff: the fixture must actually
// produce a conflict node, a phantom node, and edges in the export.
func kgdSanity(t *testing.T, export string) {
	t.Helper()
	for _, want := range []string{
		"conflict",             // component://payments declared in repoA AND repoB (R-1.4)
		"unresolved",           // component://ledger referenced, never declared (R-1.5)
		"edge\t",               // typed edges present
		"decl\t",               // raw layer present
		"component://payments", // the contested ID itself
	} {
		if !strings.Contains(export, want) {
			t.Fatalf("fixture export lost its teeth: missing %q in:\n%s", want, export)
		}
	}
}

// ── task 3.1 / R-3.2: rebuild equivalence ────────────────────────────────────

// TestRebuildEquivalence_R32_FullRebuildByteIdentical proves the DB really is
// a derived cache: delete the DB, rescan the unchanged working trees, and the
// canonical export is byte-identical to the pre-deletion export. Repeated 5×
// (per the task's verify clause) to catch map-order leaks, alternating the
// repo scan order so worker scheduling AND registration order are both shown
// not to reach the export.
func TestRebuildEquivalence_R32_FullRebuildByteIdentical(t *testing.T) {
	root := t.TempDir()
	repoA := filepath.Join(root, "repoA")
	repoB := filepath.Join(root, "repoB")
	repoC := filepath.Join(root, "repoC")
	kgdWriteFixture(t, repoA, repoB, repoC)

	repos := [][2]string{{"repoA", repoA}, {"repoB", repoB}, {"repoC", repoC}}

	// scanAll builds a brand-new DB (≡ "rm db && rescan") and exports it.
	scanAll := func(order [][2]string) string {
		dbh := kgdOpen(t)
		for _, r := range order {
			if _, err := FullScan(dbh, r[0], r[1], nil); err != nil {
				t.Fatalf("FullScan %s: %v", r[0], err)
			}
		}
		return kgdExport(t, dbh)
	}

	base := scanAll(repos)
	kgdSanity(t, base)

	reversed := [][2]string{repos[2], repos[1], repos[0]}
	for i := 0; i < 5; i++ {
		order := repos
		if i%2 == 1 {
			order = reversed // scan-order independence: resolveKG is global (R-3.1)
		}
		if got := scanAll(order); got != base {
			t.Fatalf("rebuild %d (order %v) diverged from pre-deletion export (R-3.2)\n--- baseline ---\n%s\n--- rebuild ---\n%s",
				i+1, order, base, got)
		}
	}
}

// ── task 3.2 / R-3.3: incremental ≡ full scan ────────────────────────────────

// TestIncrementalEquivalence_R33_IncrementalMatchesFullScan proves a sequence
// of incremental scans (add → edit → rename → delete → repo removal) converges
// after every step to exactly the state a from-scratch full scan of the same
// working trees produces — including the mtime fast path in IncrementalScan,
// which must skip only genuinely unchanged files.
func TestIncrementalEquivalence_R33_IncrementalMatchesFullScan(t *testing.T) {
	root := t.TempDir()
	repoA := filepath.Join(root, "repoA")
	repoB := filepath.Join(root, "repoB")
	repoC := filepath.Join(root, "repoC")
	kgdWriteFixture(t, repoA, repoB, repoC)
	for _, dir := range []string{repoA, repoB, repoC} {
		kgdGit(t, dir, "init")
		kgdGit(t, dir, "add", ".")
		kgdGit(t, dir, "commit", "-m", "baseline")
	}

	live := [][2]string{{"repoA", repoA}, {"repoB", repoB}, {"repoC", repoC}}

	// The long-lived incrementally evolved DB.
	incDB := kgdOpen(t)
	last := map[string]string{}
	for _, r := range live {
		if _, err := FullScan(incDB, r[0], r[1], nil); err != nil {
			t.Fatalf("baseline FullScan %s: %v", r[0], err)
		}
		last[r[0]] = git.CurrentCommit(r[1])
	}

	// checkStep: incremental-scan every live repo on incDB, full-scan the same
	// trees into a fresh DB, and require byte-identical canonical exports.
	checkStep := func(step string) {
		t.Helper()
		for _, r := range live {
			_, newCommit, err := IncrementalScan(incDB, r[0], r[1], last[r[0]], nil)
			if err != nil {
				t.Fatalf("step %q: IncrementalScan %s: %v", step, r[0], err)
			}
			last[r[0]] = newCommit
		}
		freshDB := kgdOpen(t)
		for _, r := range live {
			if _, err := FullScan(freshDB, r[0], r[1], nil); err != nil {
				t.Fatalf("step %q: fresh FullScan %s: %v", step, r[0], err)
			}
		}
		want := kgdExport(t, freshDB)
		got := kgdExport(t, incDB)
		if got != want {
			t.Fatalf("step %q: incremental state diverged from full-scan state (R-3.3)\n--- full scan ---\n%s\n--- incremental ---\n%s",
				step, want, got)
		}
	}

	// Step 0: no changes at all — incremental must be a clean no-op.
	checkStep("baseline-noop")
	kgdSanity(t, kgdExport(t, incDB))

	// Step 1: ADD a new spec with a canonical ID and edges.
	kgdWrite(t, filepath.Join(repoA, "new.md"), `---
id: req://checkout/r2
dependsOn: [component://payments]
---
# Checkout requirement 2
`)
	kgdGit(t, repoA, "add", ".")
	kgdGit(t, repoA, "commit", "-m", "add new.md")
	checkStep("add")

	// Step 2: EDIT — repoA drops its component://payments claim (conflict must
	// dissolve), and the media SIDECAR changes its edge target (exercises
	// readMediaForCompanion in the incremental path).
	kgdWrite(t, filepath.Join(repoA, "pay.md"), `---
components:
  - component://auth
---
# Payments notes (claim withdrawn)
`)
	kgdWrite(t, filepath.Join(repoA, "diagram.md"), `---
implementedBy: component://payments
---
# Diagram sidecar v2
`)
	kgdGit(t, repoA, "add", ".")
	kgdGit(t, repoA, "commit", "-m", "edit pay.md + sidecar")
	checkStep("edit")

	// Step 3: RENAME — fallback-ID identity follows the path (R-1.2).
	if err := os.MkdirAll(filepath.Join(repoB, "docs"), 0o755); err != nil {
		t.Fatalf("mkdir docs: %v", err)
	}
	kgdGit(t, repoB, "mv", "notes.md", filepath.Join("docs", "notes.md"))
	kgdGit(t, repoB, "commit", "-m", "rename notes.md")
	checkStep("rename")

	// Step 4: DELETE — the declaring file of req://checkout/r1 disappears; any
	// remaining references to it must resolve exactly as a fresh scan would.
	kgdGit(t, repoC, "rm", "reqs.md")
	kgdGit(t, repoC, "commit", "-m", "delete reqs.md")
	checkStep("delete")

	// Step 5: REPO REMOVAL — repoB leaves; conflict/phantom state must be
	// recomputed globally (R-3.1) and match a fresh scan of the survivors.
	if err := DeleteRepo(incDB, "repoB"); err != nil {
		t.Fatalf("DeleteRepo repoB: %v", err)
	}
	live = [][2]string{{"repoA", repoA}, {"repoC", repoC}}
	delete(last, "repoB")
	checkStep("repo-removal")
}
