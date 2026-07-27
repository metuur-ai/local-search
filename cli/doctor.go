// `local-search doctor` — one-shot health check. Answers the three questions
// people actually hit: "why isn't search working", "why are results stale", and
// "why won't the web UI start". Groups read-only checks under headings, prints
// ✓ / ⚠ / ✗ per line, and exits 0 (ok) / 1 (warnings) / 2 (errors) so it's
// scriptable. `--json` emits the same findings as structured data.
package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"local-search/config"
	localdb "local-search/db"
	"local-search/git"
)

// check status levels, ordered so the worst level wins for the exit code.
const (
	statusOK   = "ok"
	statusWarn = "warn"
	statusFail = "fail"
)

type finding struct {
	Group  string `json:"group"`
	Label  string `json:"label"`
	Status string `json:"status"` // ok | warn | fail
	Detail string `json:"detail,omitempty"`
}

type doctorReport struct {
	Version  string    `json:"version"`
	Findings []finding `json:"findings"`
	Warnings int       `json:"warnings"`
	Failures int       `json:"failures"`
}

func (r *doctorReport) add(group, label, status, detail string) {
	r.Findings = append(r.Findings, finding{group, label, status, detail})
	switch status {
	case statusWarn:
		r.Warnings++
	case statusFail:
		r.Failures++
	}
}

func cmdDoctor(args []string) {
	asJSON := false
	for _, a := range args {
		switch a {
		case "--json":
			asJSON = true
		case "-h", "--help":
			fmt.Println("Usage: local-search doctor [--json]")
			return
		default:
			die("Usage: local-search doctor [--json]")
		}
	}

	rep := &doctorReport{Version: Version}
	runDoctorChecks(rep)

	if asJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(rep); err != nil {
			die(err.Error())
		}
	} else {
		printDoctorReport(rep)
	}

	switch {
	case rep.Failures > 0:
		os.Exit(2)
	case rep.Warnings > 0:
		os.Exit(1)
	}
}

func runDoctorChecks(rep *doctorReport) {
	checkEnvironment(rep)
	checkConfig(rep)
	checkDatabase(rep)
	checkRepos(rep)
	checkDependencies(rep)
	checkWebUI(rep)
}

// ── Config ────────────────────────────────────────────────────────────────────

// checkConfig reports on the project and global config files.
//
// This exists because a malformed config now makes `find` and `code` refuse to
// run: there has to be a read-only command that shows the problem without
// trying to rewrite anything. It also surfaces leftover pre-0.4.0 TOML files
// that auto-migration has not reached.
func checkConfig(rep *doctorReport) {
	const g = "Config"
	cwd, _ := os.Getwd()
	home := homeDir()

	// Project config, found by walking up.
	if path, ok := config.FindProjectConfigPath(cwd, home); ok {
		if s, err := config.Load(path); err != nil {
			rep.add(g, "Project config", statusFail, err.Error())
		} else if len(s.Repositories) == 0 {
			rep.add(g, "Project config", statusWarn,
				path+" lists no repositories — `local-search init --set <a,b>`")
		} else {
			rep.add(g, "Project config", statusOK,
				fmt.Sprintf("%s (%d repositories)", path, len(s.Repositories)))
		}
	} else {
		rep.add(g, "Project config", statusOK, "none for this directory (using defaults)")
	}

	// Global config.
	if gp := config.GlobalPath(home); gp != "" {
		if _, err := os.Stat(gp); err == nil {
			if _, lerr := config.Load(gp); lerr != nil {
				rep.add(g, "Global config", statusFail, lerr.Error())
			} else {
				rep.add(g, "Global config", statusOK, gp)
			}
		}
	}

	// Leftover pre-0.4.0 TOML.
	var legacy []string
	if dir, ok := config.FindLegacy(cwd, home); ok {
		legacy = append(legacy, config.LegacyProjectPath(dir))
	}
	if lg := config.LegacyGlobalPath(home); lg != "" {
		if _, err := os.Stat(lg); err == nil {
			legacy = append(legacy, lg)
		}
	}
	if len(legacy) > 0 {
		rep.add(g, "Legacy TOML", statusWarn,
			strings.Join(legacy, ", ")+" — run `local-search config migrate`")
	}
}

// ── Environment ───────────────────────────────────────────────────────────────

func checkEnvironment(rep *doctorReport) {
	const g = "Environment"
	rep.add(g, "CLI version", statusOK, Version)

	// Which binary is actually running, and whether a *different* local-search
	// shadows it on PATH (a classic "I upgraded but nothing changed" cause).
	exe, err := os.Executable()
	if err == nil {
		rep.add(g, "Binary path", statusOK, exe)
		if resolved, lerr := exec.LookPath("local-search"); lerr == nil {
			if rp, _ := filepath.EvalSymlinks(resolved); rp != "" {
				if ep, _ := filepath.EvalSymlinks(exe); ep != "" && ep != rp {
					rep.add(g, "PATH resolution", statusWarn,
						"a different local-search is first on PATH: "+resolved)
				}
			}
		}
	}

	// App dir must exist and be writable — scans and the repo list live here.
	if err := os.MkdirAll(appDir, 0755); err != nil {
		rep.add(g, "App directory", statusFail, appDir+": "+err.Error())
		return
	}
	probe := filepath.Join(appDir, ".doctor-write-test")
	if err := os.WriteFile(probe, []byte("x"), 0600); err != nil {
		rep.add(g, "App directory", statusFail, appDir+" is not writable: "+err.Error())
	} else {
		os.Remove(probe)
		rep.add(g, "App directory", statusOK, appDir)
	}
}

// ── Database ──────────────────────────────────────────────────────────────────

func checkDatabase(rep *doctorReport) {
	const g = "Database"

	fi, err := os.Stat(dbFile)
	if os.IsNotExist(err) {
		rep.add(g, "Database file", statusWarn,
			"not created yet — run `local-search scan` (or add a repo)")
		return
	}
	if err != nil {
		rep.add(g, "Database file", statusFail, dbFile+": "+err.Error())
		return
	}
	rep.add(g, "Database file", statusOK, fmt.Sprintf("%s (%s)", dbFile, humanSize(fi.Size())))

	// A read-only DB file breaks scans silently — flag the mode bits.
	if fi.Mode().Perm()&0200 == 0 {
		rep.add(g, "Writable", statusFail, "database file is read-only")
	}

	// A large leftover WAL hints at a crashed/killed writer.
	if wi, werr := os.Stat(dbFile + "-wal"); werr == nil && wi.Size() > 8<<20 {
		rep.add(g, "WAL file", statusWarn,
			fmt.Sprintf("%s WAL not checkpointed — a scan may have been interrupted", humanSize(wi.Size())))
	}

	db := openDB()
	defer db.Close()

	if res, ierr := localdb.IntegrityCheck(db); ierr != nil {
		rep.add(g, "Integrity", statusFail, ierr.Error())
	} else if res != "ok" {
		rep.add(g, "Integrity", statusFail, "PRAGMA integrity_check: "+res)
	} else {
		rep.add(g, "Integrity", statusOK, "ok")
	}

	// Schema mismatch => the next scan rebuilds the cache (schema.go resets).
	want := localdb.ExpectedSchemaVersion()
	if got, verr := localdb.OnDiskSchemaVersion(db); verr == nil {
		if got != want {
			rep.add(g, "Schema version", statusWarn,
				fmt.Sprintf("on-disk v%d, binary expects v%d — next scan will rebuild the index", got, want))
		} else {
			rep.add(g, "Schema version", statusOK, fmt.Sprintf("v%d", got))
		}
	}
}

// ── Repos & freshness ─────────────────────────────────────────────────────────

func checkRepos(rep *doctorReport) {
	const g = "Repos"

	repos := loadRepos()
	if len(repos) == 0 {
		rep.add(g, "Registered repos", statusWarn,
			"none — add one with `local-search repo add /path/to/specs`")
		return
	}
	rep.add(g, "Registered repos", statusOK, strconv.Itoa(len(repos)))

	// Open the DB only if it exists, so freshness checks are best-effort.
	db := openIfExists()
	if db != nil {
		defer db.Close()
	}

	drift := 0
	for _, r := range repos {
		if _, err := os.Stat(r.Path); err != nil {
			rep.add(g, r.Name, statusFail, "path missing: "+r.Path)
			continue
		}
		// Index drift: current git HEAD vs the commit cached at last scan.
		if db != nil && git.IsRepo(r.Path) {
			cur := git.CurrentCommit(r.Path)
			cached := localdb.GetMeta(db, "git_commit_"+r.Name)
			if cur != "" && cached != "" && cur != cached {
				drift++
				rep.add(g, r.Name, statusWarn, "changed since last scan (index is stale)")
				continue
			}
		}
		rep.add(g, r.Name, statusOK, r.Path)
	}

	if db != nil {
		last := localdb.GetMeta(db, "last_scan")
		if last == "" {
			last = "never"
		}
		status := statusOK
		if drift > 0 || last == "never" {
			status = statusWarn
		}
		detail := "last scan: " + last
		if drift > 0 {
			detail = fmt.Sprintf("%s — %d repo(s) drifted; run `local-search scan`", detail, drift)
		}
		rep.add(g, "Index freshness", status, detail)
	}
}

// ── Dependencies (feature-gated → warn, not fail) ─────────────────────────────

func checkDependencies(rep *doctorReport) {
	const g = "Dependencies"

	if path, err := exec.LookPath("claude"); err == nil {
		rep.add(g, "claude CLI", statusOK, path)
	} else {
		rep.add(g, "claude CLI", statusWarn, "not on PATH — AI-answer mode unavailable (graph search still works)")
	}

	if path, err := exec.LookPath("node"); err == nil {
		detail := path
		if v, ok := nodeMajor(); ok {
			if v < 18 {
				rep.add(g, "Node.js", statusWarn, fmt.Sprintf("v%d < 18 — web UI needs Node ≥ 18", v))
			} else {
				rep.add(g, "Node.js", statusOK, fmt.Sprintf("v%d (%s)", v, path))
			}
			return
		}
		rep.add(g, "Node.js", statusOK, detail)
	} else {
		rep.add(g, "Node.js", statusWarn, "not on PATH — web UI unavailable (CLI still works)")
	}
}

// ── Web UI daemon (only when a pid file is present) ───────────────────────────

func checkWebUI(rep *doctorReport) {
	const g = "Web UI"
	pid, port, ok := readUIState()
	if !ok {
		rep.add(g, "Daemon", statusOK, "not running")
		return
	}
	if !processAlive(pid) {
		rep.add(g, "Daemon", statusWarn,
			fmt.Sprintf("stale pid file (pid %d not running) — `local-search ui stop` to clear", pid))
		return
	}
	if waitForHealth(port, 1500*time.Millisecond) {
		rep.add(g, "Daemon", statusOK, fmt.Sprintf("healthy — http://localhost:%d (pid %d)", port, pid))
	} else {
		rep.add(g, "Daemon", statusWarn,
			fmt.Sprintf("pid %d alive but /api/health not responding on port %d — see %s", pid, port, uiLogFile))
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

// openIfExists opens the DB only when the file already exists, so doctor never
// triggers an implicit scan or creates an empty DB (unlike ensureDB).
func openIfExists() *sql.DB {
	if _, err := os.Stat(dbFile); err != nil {
		return nil
	}
	return openDB()
}

func nodeMajor() (int, bool) {
	out, err := exec.Command("node", "--version").Output() // e.g. "v20.11.1\n"
	if err != nil {
		return 0, false
	}
	s := strings.TrimSpace(string(out))
	s = strings.TrimPrefix(s, "v")
	if dot := strings.IndexByte(s, '.'); dot > 0 {
		s = s[:dot]
	}
	v, err := strconv.Atoi(s)
	return v, err == nil
}

func humanSize(b int64) string {
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

func printDoctorReport(rep *doctorReport) {
	glyph := map[string]string{statusOK: "✓", statusWarn: "⚠", statusFail: "✗"}
	fmt.Printf("local-search doctor — v%s\n", rep.Version)
	lastGroup := ""
	for _, f := range rep.Findings {
		if f.Group != lastGroup {
			fmt.Printf("\n%s\n", f.Group)
			lastGroup = f.Group
		}
		line := fmt.Sprintf("  %s %s", glyph[f.Status], f.Label)
		if f.Detail != "" {
			line += ": " + f.Detail
		}
		fmt.Println(line)
	}
	fmt.Println()
	switch {
	case rep.Failures > 0:
		fmt.Printf("Result: %d error(s), %d warning(s).\n", rep.Failures, rep.Warnings)
	case rep.Warnings > 0:
		fmt.Printf("Result: healthy with %d warning(s).\n", rep.Warnings)
	default:
		fmt.Println("Result: all checks passed.")
	}
}
