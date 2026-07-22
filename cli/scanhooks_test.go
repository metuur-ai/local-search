package main

import (
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"local-search/git"
)

// R-5.1: --mechanism comma list parses to exactly the listed mechanisms;
// unknown values error; single values parse to just that one.
func TestResolveMechanisms(t *testing.T) {
	tests := []struct {
		name    string
		flag    string
		want    []string
		wantErr string // substring; "" means expect no error
	}{
		{name: "both mechanisms", flag: "git-hooks,shell", want: []string{mechGitHooks, mechShell}},
		{name: "single git-hooks", flag: "git-hooks", want: []string{mechGitHooks}},
		{name: "single shell", flag: "shell", want: []string{mechShell}},
		{name: "whitespace tolerated", flag: " git-hooks , shell ", want: []string{mechGitHooks, mechShell}},
		{name: "duplicates collapsed", flag: "git-hooks,git-hooks", want: []string{mechGitHooks}},
		{name: "unknown value errors", flag: "bogus", wantErr: "unknown mechanism"},
		{name: "one unknown in list errors", flag: "git-hooks,bogus", wantErr: "unknown mechanism"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// interactive=false so the flag path is exercised purely (no prompt).
			got, err := resolveMechanisms(tt.flag, false)

			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.wantErr)
				}
				if !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("error %q does not contain %q", err.Error(), tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(got) != len(tt.want) {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Fatalf("got %v, want %v", got, tt.want)
				}
			}
		})
	}
}

// resolveMechanisms with no flag delegates to the interactive prompt seam.
func TestResolveMechanisms_InteractiveSeam(t *testing.T) {
	orig := mechanismPrompt
	defer func() { mechanismPrompt = orig }()

	called := false
	mechanismPrompt = func() ([]string, error) {
		called = true
		return []string{mechShell}, nil
	}

	got, err := resolveMechanisms("", true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !called {
		t.Fatal("expected interactive prompt seam to be invoked when --mechanism omitted")
	}
	if len(got) != 1 || got[0] != mechShell {
		t.Fatalf("got %v, want [shell]", got)
	}
}

// R-5.3: install/uninstall invoked outside any registered repo returns the same
// guard error as `scan` AND performs no install (dispatch seam never reached).
func TestRunScanHooks_OutsideRepoInstallsNothing(t *testing.T) {
	origInstall := installScanHooksFn
	origUninstall := uninstallScanHooksFn
	origPrompt := mechanismPrompt
	defer func() {
		installScanHooksFn = origInstall
		uninstallScanHooksFn = origUninstall
		mechanismPrompt = origPrompt
	}()

	installReached := false
	uninstallReached := false
	promptReached := false
	installScanHooksFn = func(repoEntry, []string, bool) error { installReached = true; return nil }
	uninstallScanHooksFn = func(repoEntry, []string) error { uninstallReached = true; return nil }
	mechanismPrompt = func() ([]string, error) { promptReached = true; return []string{mechShell}, nil }

	// A registered repo somewhere else; cwd is outside it.
	repos := []repoEntry{{Name: "docs", Path: "/Users/me/docs"}}
	cwd := "/tmp/nowhere-outside-any-repo"

	for _, sub := range []string{"install", "uninstall"} {
		// Explicit --mechanism shell, matching the acceptance scenario.
		err := runScanHooks(sub, "shell", false, cwd, repos)
		if err == nil {
			t.Fatalf("%s: expected an error outside any registered repo, got nil", sub)
		}
		if !strings.Contains(err.Error(), "not inside a registered repo") {
			t.Fatalf("%s: error %q is not scan's not-inside-a-repo guard", sub, err.Error())
		}
	}

	if installReached || uninstallReached {
		t.Fatalf("dispatch reached outside a repo (install=%v uninstall=%v); nothing must be installed/removed", installReached, uninstallReached)
	}
	if promptReached {
		t.Fatal("mechanism prompt reached outside a repo; the CWD guard must fire first")
	}
}

// R-5.3 companion: with no repos registered at all, the guard returns the same
// "no repos added yet" guidance as scan and installs nothing.
func TestRunScanHooks_NoReposRegistered(t *testing.T) {
	err := runScanHooks("install", "shell", false, "/tmp/anywhere", nil)
	if err == nil {
		t.Fatal("expected an error with no repos registered, got nil")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "no repos added yet") {
		t.Fatalf("error %q is not the no-repos guidance", err.Error())
	}
}

// Inside a registered repo with --mechanism omitted, runScanHooks resolves the
// repo, invokes the interactive selection seam, and dispatches install for the
// selected mechanisms (R-5.2 seam wiring).
func TestRunScanHooks_InsideRepoUsesPromptSeam(t *testing.T) {
	origInstall := installScanHooksFn
	origPrompt := mechanismPrompt
	defer func() {
		installScanHooksFn = origInstall
		mechanismPrompt = origPrompt
	}()

	promptCalled := false
	mechanismPrompt = func() ([]string, error) { promptCalled = true; return []string{mechShell}, nil }

	var gotMechs []string
	var gotRepo repoEntry
	installScanHooksFn = func(r repoEntry, mechs []string, _ bool) error {
		gotRepo = r
		gotMechs = mechs
		return nil
	}

	// cwd == repo path so NearestRepoForCWD matches (uses filepath.Abs; a real
	// temp dir keeps the comparison honest).
	dir := t.TempDir()
	repos := []repoEntry{{Name: "docs", Path: dir}}

	if err := runScanHooks("install", "", false, dir, repos); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !promptCalled {
		t.Fatal("expected interactive prompt seam to be invoked when --mechanism omitted")
	}
	if gotRepo.Name != "docs" {
		t.Fatalf("dispatched for repo %q, want docs", gotRepo.Name)
	}
	if len(gotMechs) != 1 || gotMechs[0] != mechShell {
		t.Fatalf("dispatched mechanisms %v, want [shell]", gotMechs)
	}
}

// ── shell mechanism (story 5.3) ─────────────────────────────────────────────

// withTempAppDir points the package-global appDir at a fresh temp dir so shell
// tests write into it instead of the real ~/.local-search, and restores it after.
func withTempAppDir(t *testing.T) string {
	t.Helper()
	orig := appDir
	dir := t.TempDir()
	appDir = dir
	t.Cleanup(func() { appDir = orig })
	return dir
}

// captureStdout runs fn with os.Stdout redirected to a pipe and returns what was
// printed, so tests can assert on the source directive the install/uninstall
// functions emit.
func captureStdout(t *testing.T, fn func()) string {
	t.Helper()
	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stdout = w
	fn()
	_ = w.Close()
	os.Stdout = old
	data, _ := io.ReadAll(r)
	return string(data)
}

// R-5.6: installing the shell mechanism writes <appdir>/shell-hook.sh containing
// a recognizable managed snippet that runs `local-search scan`, prints the exact
// `source <abspath>` line, and touches NOTHING else (no rc file, no other file).
func TestInstallShellHook_WritesSnippetAndPrintsSource(t *testing.T) {
	dir := withTempAppDir(t)
	repo := repoEntry{Name: "docs", Path: t.TempDir()}
	snippet := filepath.Join(dir, "shell-hook.sh")

	out := captureStdout(t, func() {
		if err := installShellHook(repo); err != nil {
			t.Fatalf("installShellHook: %v", err)
		}
	})

	data, err := os.ReadFile(snippet)
	if err != nil {
		t.Fatalf("reading shell-hook.sh: %v", err)
	}
	got := string(data)
	if !strings.Contains(got, shellHookSentinelBegin) {
		t.Fatalf("managed marker missing from snippet:\n%s", got)
	}
	if !strings.Contains(got, "local-search scan") {
		t.Fatalf("surgical scan command missing from snippet:\n%s", got)
	}

	// Printed a `source <abspath>` line for the user to add to their rc.
	if !strings.Contains(out, "source "+snippet) {
		t.Fatalf("expected printed output to contain `source %s`, got:\n%s", snippet, out)
	}

	// R-5.6: nothing outside the snippet file is created — appDir holds only it.
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "shell-hook.sh" {
		var names []string
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Fatalf("appDir should contain only shell-hook.sh, found: %v", names)
	}
}

// R-5.9: re-installing is idempotent — identical content, no duplication, and
// still exactly one file; the source line is printed again.
func TestInstallShellHook_Idempotent(t *testing.T) {
	dir := withTempAppDir(t)
	repo := repoEntry{Name: "docs", Path: t.TempDir()}
	snippet := filepath.Join(dir, "shell-hook.sh")

	if err := installShellHook(repo); err != nil {
		t.Fatalf("install #1: %v", err)
	}
	first, err := os.ReadFile(snippet)
	if err != nil {
		t.Fatal(err)
	}

	out := captureStdout(t, func() {
		if err := installShellHook(repo); err != nil {
			t.Fatalf("install #2: %v", err)
		}
	})
	second, err := os.ReadFile(snippet)
	if err != nil {
		t.Fatal(err)
	}

	if string(first) != string(second) {
		t.Fatalf("re-install changed snippet content:\nfirst:\n%s\nsecond:\n%s", first, second)
	}
	if n := strings.Count(string(second), shellHookSentinelBegin); n != 1 {
		t.Fatalf("expected exactly one managed marker, found %d", n)
	}
	if !strings.Contains(out, "source "+snippet) {
		t.Fatalf("re-install should still print the source line, got:\n%s", out)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected exactly one file in appDir after re-install, found %d", len(entries))
	}
}

// R-5.8: uninstall removes the snippet file and prints the source line to delete;
// a second uninstall with the file already gone is a clean no-op (no error).
func TestUninstallShellHook_RemovesFileAndNoOp(t *testing.T) {
	dir := withTempAppDir(t)
	repo := repoEntry{Name: "docs", Path: t.TempDir()}
	snippet := filepath.Join(dir, "shell-hook.sh")

	if err := installShellHook(repo); err != nil {
		t.Fatalf("install: %v", err)
	}

	out := captureStdout(t, func() {
		if err := uninstallShellHook(repo); err != nil {
			t.Fatalf("uninstall: %v", err)
		}
	})
	if _, err := os.Stat(snippet); !os.IsNotExist(err) {
		t.Fatalf("snippet should be removed after uninstall (stat err = %v)", err)
	}
	if !strings.Contains(out, "source "+snippet) {
		t.Fatalf("uninstall should print the source line to delete, got:\n%s", out)
	}

	// Second uninstall with the file absent → clean no-op, no error.
	if err := uninstallShellHook(repo); err != nil {
		t.Fatalf("second uninstall should be a clean no-op: %v", err)
	}
}

// ── git-hooks mechanism (story 5.2) ─────────────────────────────────────────

// initGitRepo makes a real git repo in a temp dir so git.IsRepo (which shells
// out) returns true. Skips the test when the git binary is unavailable.
func initGitRepo(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git binary not available")
	}
	dir := t.TempDir()
	if out, err := exec.Command("git", "-C", dir, "init").CombinedOutput(); err != nil {
		t.Fatalf("git init failed: %v\n%s", err, out)
	}
	return dir
}

func hooksDir(repoPath string) string {
	return filepath.Join(repoPath, ".git", "hooks")
}

// R-5.4/R-5.5: installing into a hook that already has user content inserts the
// managed block WITHOUT discarding the user's lines; the file is executable.
func TestInstallGitHooks_PreservesUserContent(t *testing.T) {
	dir := initGitRepo(t)
	repo := repoEntry{Name: "docs", Path: dir}

	pm := filepath.Join(hooksDir(dir), "post-merge")
	if err := os.MkdirAll(hooksDir(dir), 0o755); err != nil {
		t.Fatal(err)
	}
	const userLine = "echo custom-user-hook-line"
	if err := os.WriteFile(pm, []byte("#!/bin/sh\n"+userLine+"\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := installGitHooks(repo, false); err != nil {
		t.Fatalf("installGitHooks: %v", err)
	}

	data, err := os.ReadFile(pm)
	if err != nil {
		t.Fatalf("reading post-merge: %v", err)
	}
	got := string(data)
	if !strings.Contains(got, userLine) {
		t.Fatalf("user content lost; file:\n%s", got)
	}
	if !strings.Contains(got, gitHookSentinelBegin) || !strings.Contains(got, gitHookSentinelEnd) {
		t.Fatalf("managed sentinels missing; file:\n%s", got)
	}
	if !strings.Contains(got, "local-search scan-hook-run 'docs'") {
		t.Fatalf("surgical scan trigger with baked repo name missing; file:\n%s", got)
	}
	if n := strings.Count(got, gitHookSentinelBegin); n != 1 {
		t.Fatalf("expected exactly one managed block, found %d begin sentinels", n)
	}

	info, err := os.Stat(pm)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o755 {
		t.Fatalf("hook mode = %v, want 0755", info.Mode().Perm())
	}
}

// R-5.9: re-installing does not duplicate the managed block; R-5.4: post-commit
// is never created.
func TestInstallGitHooks_IdempotentNoPostCommit(t *testing.T) {
	dir := initGitRepo(t)
	repo := repoEntry{Name: "docs", Path: dir}

	for i := 0; i < 2; i++ {
		if err := installGitHooks(repo, false); err != nil {
			t.Fatalf("install #%d: %v", i, err)
		}
	}

	for _, hook := range gitManagedHooks {
		data, err := os.ReadFile(filepath.Join(hooksDir(dir), hook))
		if err != nil {
			t.Fatalf("reading %s: %v", hook, err)
		}
		if n := strings.Count(string(data), gitHookSentinelBegin); n != 1 {
			t.Fatalf("%s: expected 1 managed block after re-install, found %d", hook, n)
		}
	}

	if _, err := os.Stat(filepath.Join(hooksDir(dir), "post-commit")); !os.IsNotExist(err) {
		t.Fatalf("post-commit must never be created (stat err = %v)", err)
	}
}

// R-5.8: uninstall removes only the managed block. A file that held ONLY the
// managed block (freshly created) is deleted; a file with user content is kept
// with its user lines intact.
func TestUninstallGitHooks_RemovesBlockAndCleansUp(t *testing.T) {
	dir := initGitRepo(t)
	repo := repoEntry{Name: "docs", Path: dir}

	// post-checkout has pre-existing user content; post-merge/post-rewrite are
	// created fresh by install (managed block + shebang only).
	if err := os.MkdirAll(hooksDir(dir), 0o755); err != nil {
		t.Fatal(err)
	}
	pc := filepath.Join(hooksDir(dir), "post-checkout")
	const userLine = "echo keep-me"
	if err := os.WriteFile(pc, []byte("#!/bin/sh\n"+userLine+"\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := installGitHooks(repo, false); err != nil {
		t.Fatalf("install: %v", err)
	}
	if err := uninstallGitHooks(repo); err != nil {
		t.Fatalf("uninstall: %v", err)
	}

	// Fresh-created hook (only managed content) → deleted.
	if _, err := os.Stat(filepath.Join(hooksDir(dir), "post-merge")); !os.IsNotExist(err) {
		t.Fatalf("post-merge should be deleted after uninstall (stat err = %v)", err)
	}

	// User-content hook → kept, block gone, user line intact.
	data, err := os.ReadFile(pc)
	if err != nil {
		t.Fatalf("post-checkout should be kept: %v", err)
	}
	got := string(data)
	if strings.Contains(got, gitHookSentinelBegin) || strings.Contains(got, gitHookSentinelEnd) {
		t.Fatalf("managed block not removed from post-checkout:\n%s", got)
	}
	if !strings.Contains(got, userLine) {
		t.Fatalf("user content lost from post-checkout:\n%s", got)
	}

	// R-5.9: second uninstall is a clean no-op.
	if err := uninstallGitHooks(repo); err != nil {
		t.Fatalf("second uninstall should be a no-op: %v", err)
	}
}

// R-5.4a: for a non-git dir, installGitHooks skips (sentinel error, no files) and
// the caller still installs other mechanisms (shell stub) without aborting.
func TestInstallGitHooks_NonGitSkipsAndCallerContinues(t *testing.T) {
	dir := t.TempDir()
	if git.IsRepo(dir) {
		t.Skip("temp dir unexpectedly inside a git repo")
	}
	repo := repoEntry{Name: "docs", Path: dir}

	err := installGitHooks(repo, false)
	if !errors.Is(err, errGitHooksSkipped) {
		t.Fatalf("expected errGitHooksSkipped for non-git repo, got %v", err)
	}
	// No hook files written.
	for _, hook := range gitManagedHooks {
		if _, statErr := os.Stat(filepath.Join(hooksDir(dir), hook)); !os.IsNotExist(statErr) {
			t.Fatalf("%s should not exist for a non-git repo (err = %v)", hook, statErr)
		}
	}

	// Caller path: git-hooks skipped, shell still proceeds → no error overall.
	if err := installScanHooks(repo, []string{mechGitHooks, mechShell}, false); err != nil {
		t.Fatalf("installScanHooks must continue past a skipped git-hooks: %v", err)
	}
	if _, statErr := os.Stat(filepath.Join(hooksDir(dir), "post-merge")); !os.IsNotExist(statErr) {
		t.Fatal("git hooks must not be written when the repo is non-git")
	}
}
