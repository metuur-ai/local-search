package main

// local-search scan-hooks — install/uninstall automation that keeps a repo's
// index fresh as git activity happens. This file is the SCAFFOLD (story 5.1):
// command skeleton, arg/flag parsing, the CWD guard that reuses `scan`'s target
// resolution, and mechanism selection (flag list or interactive). The actual
// per-mechanism file writing is filled in later:
//
//	TODO(5.2) git-hooks mechanism  (installGitHooks / uninstallGitHooks)
//	TODO(5.3) shell mechanism      (installShellHook / uninstallShellHook)
//	TODO(5.4) trigger behavior     (change-gate, detached dispatch, per-repo lock)

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"local-search/git"
)

// Available automation mechanisms (R-5.1). The two-element universe is fixed;
// 5.2/5.3 flesh out what each one writes.
const (
	mechGitHooks = "git-hooks"
	mechShell    = "shell"
)

// allMechanisms is the offered set, in display/default order.
var allMechanisms = []string{mechGitHooks, mechShell}

// Injectable seams so tests can spy on dispatch without a real prompt or any
// filesystem writes. mechanismPrompt is the thin interactive branch; the two
// *Fn vars point at the per-command dispatchers (which in turn call the stubbed
// per-mechanism functions 5.2/5.3 will implement).
var (
	mechanismPrompt      = promptMechanismSelection
	installScanHooksFn   = installScanHooks
	uninstallScanHooksFn = uninstallScanHooks
)

// cmdScanHooks dispatches `local-search scan-hooks <install|uninstall>`.
//
//	scan-hooks install   [--mechanism git-hooks,shell] [--force]
//	scan-hooks uninstall [--mechanism git-hooks,shell]
//
// It is a thin wrapper (mirroring cmdInstallSkill): parse args, load repos +
// cwd, then hand the pure-ish work to runScanHooks and die() on error.
func cmdScanHooks(args []string) {
	const usage = "Usage: local-search scan-hooks <install|uninstall> [--mechanism git-hooks,shell] [--force]"

	if len(args) == 0 {
		die(usage)
	}
	sub := args[0]
	switch sub {
	case "install", "uninstall":
		// ok
	case "-h", "--help":
		fmt.Println(usage)
		return
	default:
		die(usage)
	}

	mechanismFlag := ""
	force := false
	rest := args[1:]
	for i := 0; i < len(rest); i++ {
		switch rest[i] {
		case "--mechanism", "-m":
			if i+1 >= len(rest) {
				die("scan-hooks: --mechanism requires a value (git-hooks,shell)")
			}
			i++
			mechanismFlag = rest[i]
		case "--force", "-f":
			force = true
		case "-h", "--help":
			fmt.Println(usage)
			return
		default:
			die(usage)
		}
	}

	repos := loadReposOrDie()
	cwd, _ := os.Getwd()
	if err := runScanHooks(sub, mechanismFlag, force, cwd, repos); err != nil {
		die(err.Error())
	}
}

// runScanHooks is the testable seam (cwd + repos + parsed args → error). It
// resolves the target repo BEFORE any selection or mutation, so an invocation
// outside a registered repo installs/removes nothing (R-5.3).
func runScanHooks(sub, mechanismFlag string, force bool, cwd string, repos []repoEntry) error {
	// R-5.3: same CWD guard as `scan` — reuse resolveScanTarget so the error
	// text (and the no-repos-registered / not-inside-a-repo distinction) is
	// identical. Runs first: on failure we return having touched nothing.
	repo, err := resolveHookRepo(cwd, repos)
	if err != nil {
		return err
	}

	mechs, err := resolveMechanisms(mechanismFlag, true)
	if err != nil {
		return err
	}

	switch sub {
	case "install":
		return installScanHooksFn(repo, mechs, force)
	case "uninstall":
		return uninstallScanHooksFn(repo, mechs)
	default:
		return fmt.Errorf("unknown scan-hooks subcommand %q", sub)
	}
}

// resolveHookRepo resolves the single repo enclosing cwd using the SAME
// mechanism `scan` uses (resolveScanTarget with no args → surgical single
// target). It therefore returns scan's exact guard errors: "not inside a
// registered repo…" when cwd is outside any repo (R-5.3), and the "no repos
// added yet" guidance when none are registered (R-1.8).
func resolveHookRepo(cwd string, repos []repoEntry) (repoEntry, error) {
	mode, targets, err := resolveScanTarget(nil, cwd, repos)
	if err != nil {
		return repoEntry{}, err
	}
	if mode != modeSurgical || len(targets) != 1 {
		return repoEntry{}, fmt.Errorf("scan-hooks operates on a single CWD-resolved repo")
	}
	return targets[0], nil
}

// resolveMechanisms turns the --mechanism flag into the concrete list to act on
// (R-5.1). The flag path is pure and fully testable: a comma list, each value
// validated against {git-hooks, shell}, trimmed and de-duplicated, order
// preserved. When the flag is omitted it falls back to the interactive prompt
// (R-5.2) — kept thin behind the mechanismPrompt seam.
func resolveMechanisms(flagValue string, interactive bool) ([]string, error) {
	if strings.TrimSpace(flagValue) != "" {
		var out []string
		seen := map[string]bool{}
		for _, part := range strings.Split(flagValue, ",") {
			m := strings.TrimSpace(part)
			if m == "" {
				continue
			}
			if m != mechGitHooks && m != mechShell {
				return nil, fmt.Errorf("unknown mechanism %q (valid: %s)", m, strings.Join(allMechanisms, ", "))
			}
			if !seen[m] {
				seen[m] = true
				out = append(out, m)
			}
		}
		if len(out) == 0 {
			return nil, fmt.Errorf("--mechanism requires at least one of: %s", strings.Join(allMechanisms, ", "))
		}
		return out, nil
	}

	// No flag: interactive selection (R-5.2), thin branch behind the seam.
	if interactive {
		return mechanismPrompt()
	}
	return nil, fmt.Errorf("no --mechanism specified and no interactive prompt available")
}

// promptMechanismSelection presents the available mechanisms and reads the
// user's choice from stdin, mirroring the existing stdin-confirm pattern in
// cmdReset. Kept deliberately small; 5.1 only needs the selection to work.
func promptMechanismSelection() ([]string, error) {
	fmt.Println("Select scan-hook mechanism(s) to install:")
	fmt.Printf("  1) %-9s — git .git/hooks post-merge/checkout/rewrite\n", mechGitHooks)
	fmt.Printf("  2) %-9s — cd-into-repo trigger\n", mechShell)
	fmt.Print("Enter numbers (e.g. 1,2) or 'all': ")

	reader := bufio.NewReader(os.Stdin)
	answer, _ := reader.ReadString('\n')
	answer = strings.TrimSpace(strings.ToLower(answer))
	if answer == "" {
		return nil, fmt.Errorf("no mechanism selected")
	}
	if answer == "all" {
		return append([]string(nil), allMechanisms...), nil
	}

	var out []string
	seen := map[string]bool{}
	for _, part := range strings.Split(answer, ",") {
		var m string
		switch strings.TrimSpace(part) {
		case "1", mechGitHooks:
			m = mechGitHooks
		case "2", mechShell:
			m = mechShell
		default:
			return nil, fmt.Errorf("invalid selection %q", strings.TrimSpace(part))
		}
		if !seen[m] {
			seen[m] = true
			out = append(out, m)
		}
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("no mechanism selected")
	}
	return out, nil
}

// installScanHooks dispatches to the per-mechanism installers and prints a
// status line for each. The installers themselves are stubs until 5.2/5.3.
func installScanHooks(repo repoEntry, mechs []string, force bool) error {
	for _, m := range mechs {
		switch m {
		case mechGitHooks:
			if err := installGitHooks(repo, force); err != nil {
				// R-5.4a: a non-git (or worktree) repo skips git-hooks with a
				// message but must NOT abort the loop — other requested
				// mechanisms (e.g. shell) still install. installGitHooks has
				// already printed the reason; just move on.
				if errors.Is(err, errGitHooksSkipped) {
					continue
				}
				return fmt.Errorf("git-hooks: %w", err)
			}
			fmt.Printf("  git-hooks: installed for %s\n", repo.Name)
		case mechShell:
			if err := installShellHook(repo); err != nil {
				return fmt.Errorf("shell: %w", err)
			}
			fmt.Printf("  shell: installed for %s\n", repo.Name)
		default:
			return fmt.Errorf("unknown mechanism %q", m)
		}
	}
	return nil
}

// uninstallScanHooks dispatches to the per-mechanism removers and prints a
// status line for each. Stubs until 5.2/5.3.
func uninstallScanHooks(repo repoEntry, mechs []string) error {
	for _, m := range mechs {
		switch m {
		case mechGitHooks:
			if err := uninstallGitHooks(repo); err != nil {
				return fmt.Errorf("git-hooks: %w", err)
			}
			fmt.Printf("  git-hooks: removed for %s\n", repo.Name)
		case mechShell:
			if err := uninstallShellHook(repo); err != nil {
				return fmt.Errorf("shell: %w", err)
			}
			fmt.Printf("  shell: removed for %s\n", repo.Name)
		default:
			return fmt.Errorf("unknown mechanism %q", m)
		}
	}
	return nil
}

// ── Per-mechanism stubs (filled in by later stories) ────────────────────────

// ── git-hooks mechanism (R-5.4, R-5.4a, R-5.5, R-5.8, R-5.9) ─────────────────

// Sentinel delimiters wrapping the managed content inside a hook file (R-5.5).
// Everything between them is owned by scan-hooks; everything outside is the
// user's and is preserved verbatim on install and uninstall.
const (
	gitHookSentinelBegin = "# >>> local-search scan-hooks (managed) >>>"
	gitHookSentinelEnd   = "# <<< local-search scan-hooks (managed) <<<"
)

// gitManagedHooks are the three history-movement hooks we manage. `post-commit`
// is deliberately EXCLUDED (R-5.4): it is redundant with the query-time
// incremental path and the highest scan-storm risk on rapid commits.
var gitManagedHooks = []string{"post-merge", "post-checkout", "post-rewrite"}

// errGitHooksSkipped signals that git-hook installation was skipped for a
// non-git repo (or an unsupported worktree/.git-file layout). The caller treats
// it as non-fatal so other requested mechanisms still install (R-5.4a).
var errGitHooksSkipped = errors.New("git-hooks skipped")

// installGitHooks writes managed post-merge/post-checkout/post-rewrite hooks
// into the repo's .git/hooks, each triggering a surgical scan of THIS repo
// (R-5.4). The managed content is delimited by sentinels so a pre-existing
// user hook is never clobbered (R-5.5); re-installing reconciles the block in
// place so there is never a duplicate (R-5.9). Returns errGitHooksSkipped for a
// non-git repo (R-5.4a).
func installGitHooks(repo repoEntry, force bool) error {
	if !git.IsRepo(repo.Path) {
		fmt.Printf("  git-hooks: skipped for %s (not a git repository)\n", repo.Name)
		return errGitHooksSkipped
	}
	hooksDir, err := gitHooksDir(repo.Path)
	if err != nil {
		// e.g. `.git` is a file (worktree/submodule) — degrade gracefully
		// rather than error the whole command.
		fmt.Printf("  git-hooks: skipped for %s (%v)\n", repo.Name, err)
		return errGitHooksSkipped
	}
	if err := os.MkdirAll(hooksDir, 0o755); err != nil {
		return fmt.Errorf("creating hooks dir: %w", err)
	}

	// force is subsumed by always-reconcile: we replace an existing managed
	// block in place regardless, which both refreshes a stale block (the --force
	// intent, R-5.5) and guarantees no duplication (R-5.9).
	_ = force
	block := gitHookManagedBlock(repo.Name)
	for _, hook := range gitManagedHooks {
		path := filepath.Join(hooksDir, hook)
		if err := installOneGitHook(path, block); err != nil {
			return fmt.Errorf("%s: %w", hook, err)
		}
	}
	return nil
}

// uninstallGitHooks removes ONLY the managed block from each of the three hook
// files, leaving unrelated user content intact and runnable (R-5.8). A file that
// becomes empty (or contains only a bare shebang / whitespace) is deleted;
// otherwise it is kept. `post-commit` is never touched.
func uninstallGitHooks(repo repoEntry) error {
	hooksDir := filepath.Join(repo.Path, ".git", "hooks")
	for _, hook := range gitManagedHooks {
		path := filepath.Join(hooksDir, hook)
		data, err := os.ReadFile(path)
		if err != nil {
			if os.IsNotExist(err) {
				continue // nothing to remove (also covers non-git repos)
			}
			return fmt.Errorf("%s: %w", hook, err)
		}
		newContent, removed := removeManagedBlock(string(data))
		if !removed {
			continue // no managed block: leave the user's file untouched
		}
		if hookIsEffectivelyEmpty(newContent) {
			if err := os.Remove(path); err != nil {
				return fmt.Errorf("%s: %w", hook, err)
			}
			continue
		}
		if err := os.WriteFile(path, []byte(newContent), 0o755); err != nil {
			return fmt.Errorf("%s: %w", hook, err)
		}
		if err := os.Chmod(path, 0o755); err != nil {
			return fmt.Errorf("%s: %w", hook, err)
		}
	}
	return nil
}

// gitHooksDir resolves <repo>/.git/hooks, verifying `.git` is a real directory.
// If `.git` is a file (worktree/submodule gitdir pointer) we degrade gracefully
// by erroring — the caller turns that into a skip.
func gitHooksDir(repoPath string) (string, error) {
	gitPath := filepath.Join(repoPath, ".git")
	info, err := os.Stat(gitPath)
	if err != nil {
		return "", fmt.Errorf(".git not found under %s", repoPath)
	}
	if !info.IsDir() {
		return "", fmt.Errorf(".git is a file (worktree/submodule) — unsupported")
	}
	return filepath.Join(gitPath, "hooks"), nil
}

// gitHookManagedBlock is the sentinel-wrapped content written into each hook.
// It invokes the internal `scan-hook-run` trigger (which owns the change-gate,
// per-repo lock and surgical scan) with the resolved repo name baked in so it is
// unambiguous regardless of where the hook runs. The trigger is dispatched
// detached (`&`) and the hook `exit 0`s unconditionally, so a slow or failing
// scan can never block or fail the git operation (R-5.10).
func gitHookManagedBlock(repoName string) []string {
	return []string{
		gitHookSentinelBegin,
		"# Managed by `local-search scan-hooks` — do not edit between the markers.",
		"# Change-gate + per-repo lock + surgical scan all live in `scan-hook-run`.",
		"# Dispatch it detached and return success so git is never blocked (R-5.10).",
		"local-search scan-hook-run " + singleQuote(repoName) + " >/dev/null 2>&1 &",
		"exit 0",
		gitHookSentinelEnd,
	}
}

// installOneGitHook writes the managed block into a single hook file, reconciling
// in place if a block already exists and preserving all other lines. A brand-new
// file gets a `#!/bin/sh` shebang so it is runnable. The file is made executable.
func installOneGitHook(path string, block []string) error {
	var existing string
	isNew := false
	if data, err := os.ReadFile(path); err == nil {
		existing = string(data)
	} else if os.IsNotExist(err) {
		isNew = true
	} else {
		return err
	}

	content := insertOrReplaceManagedBlock(existing, block, isNew)
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		return err
	}
	// Explicit chmod: WriteFile's mode is masked by umask, so re-assert 0755.
	return os.Chmod(path, 0o755)
}

// insertOrReplaceManagedBlock returns file content with the managed block present
// exactly once. If a block already exists it is replaced in place (idempotent,
// R-5.9); otherwise it is appended, preserving every existing user line (R-5.5).
// A fresh file (isNew) is given a shebang first so the hook is runnable.
func insertOrReplaceManagedBlock(existing string, block []string, isNew bool) string {
	lines := splitHookLines(existing)
	begin, end := findManagedRange(lines)
	if begin >= 0 && end >= begin {
		out := make([]string, 0, len(lines)-(end-begin+1)+len(block))
		out = append(out, lines[:begin]...)
		out = append(out, block...)
		out = append(out, lines[end+1:]...)
		return joinHookLines(out)
	}

	if isNew {
		lines = append(lines, "#!/bin/sh", "")
	} else if len(lines) > 0 {
		lines = append(lines, "") // blank separator before the appended block
	}
	lines = append(lines, block...)
	return joinHookLines(lines)
}

// removeManagedBlock strips the sentinel-delimited managed block. Returns the new
// content and whether a block was found and removed.
func removeManagedBlock(existing string) (string, bool) {
	lines := splitHookLines(existing)
	begin, end := findManagedRange(lines)
	if begin < 0 {
		return existing, false
	}
	out := make([]string, 0, len(lines))
	out = append(out, lines[:begin]...)
	out = append(out, lines[end+1:]...)
	return joinHookLines(out), true
}

// findManagedRange locates the [begin,end] line indices of the first complete
// managed block. Returns (-1,-1) when absent — or when a begin sentinel has no
// matching end (malformed), in which case we treat it as absent to avoid
// clobbering trailing user content.
func findManagedRange(lines []string) (int, int) {
	begin := -1
	for i, l := range lines {
		if strings.TrimSpace(l) == gitHookSentinelBegin {
			begin = i
			break
		}
	}
	if begin == -1 {
		return -1, -1
	}
	for j := begin + 1; j < len(lines); j++ {
		if strings.TrimSpace(lines[j]) == gitHookSentinelEnd {
			return begin, j
		}
	}
	return -1, -1
}

// hookIsEffectivelyEmpty reports whether content has no meaningful user lines:
// only blanks and/or a bare shebang. Such a file is deleted on uninstall (R-5.8).
func hookIsEffectivelyEmpty(content string) bool {
	for _, l := range strings.Split(content, "\n") {
		t := strings.TrimSpace(l)
		if t == "" || strings.HasPrefix(t, "#!") {
			continue
		}
		return false
	}
	return true
}

// splitHookLines splits into lines, dropping trailing blank lines so appends and
// joins stay stable across repeated install/uninstall cycles.
func splitHookLines(s string) []string {
	if s == "" {
		return nil
	}
	lines := strings.Split(s, "\n")
	for len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

// joinHookLines re-joins lines with a trailing newline (empty in → empty out).
func joinHookLines(lines []string) string {
	if len(lines) == 0 {
		return ""
	}
	return strings.Join(lines, "\n") + "\n"
}

// singleQuote POSIX-single-quotes s so an arbitrary repo name is safe as one
// shell argument.
func singleQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// ── shell mechanism (R-5.6, R-5.8, R-5.9) ────────────────────────────────────

// Marker wrapping the managed snippet, mirroring the git-hook sentinels. It also
// serves as the recognizable signature that identifies our snippet file.
const (
	shellHookSentinelBegin = "# >>> local-search scan-hooks (shell mechanism, managed) >>>"
	shellHookSentinelEnd   = "# <<< local-search scan-hooks (shell mechanism, managed) <<<"
)

// shellHookPath is the single shared snippet file all repos use. It lives under
// appDir (the resolved ~/.local-search) so tests overriding appDir write into a
// temp dir rather than the real home.
func shellHookPath() string {
	return filepath.Join(appDir, "shell-hook.sh")
}

// shellHookSnippet is the sourced shell function that fires a surgical scan when
// the user cd's into a registered repo. It is repo-set-agnostic: `local-search
// scan` with no args resolves the CWD to its enclosing repo and is surgical +
// non-destructive, no-op'ing/erroring harmlessly outside any repo — so a single
// shared snippet covers every registered repo without baking repo paths in.
// Registered for zsh (chpwd) and bash (PROMPT_COMMAND); PowerShell is out of
// scope (documented, best-effort — see the LLD note alongside ui_windows.go).
func shellHookSnippet() string {
	return strings.Join([]string{
		shellHookSentinelBegin,
		"# Managed by `local-search scan-hooks` — do not edit between the markers.",
		"# On entering a registered repo directory this runs a surgical scan for it.",
		"# `scan-hook-run` (no args) resolves CWD->repo and owns the change-gate,",
		"# per-repo lock and surgical scan, so this snippet needs no repo baking.",
		"# Dispatched detached (&) with errors swallowed so navigation never blocks",
		"# (R-5.10/R-5.11/R-5.12); outside any repo it no-ops harmlessly.",
		"__local_search_scan_hook() {",
		"    local-search scan-hook-run >/dev/null 2>&1 &",
		"}",
		"if [ -n \"${ZSH_VERSION:-}\" ]; then",
		"    autoload -Uz add-zsh-hook 2>/dev/null && add-zsh-hook chpwd __local_search_scan_hook",
		"elif [ -n \"${BASH_VERSION:-}\" ]; then",
		"    case \":${PROMPT_COMMAND:-}:\" in",
		"        *__local_search_scan_hook*) ;;",
		"        *) PROMPT_COMMAND=\"__local_search_scan_hook${PROMPT_COMMAND:+;$PROMPT_COMMAND}\" ;;",
		"    esac",
		"fi",
		"# Windows/PowerShell is not supported by this snippet (best-effort/documented).",
		shellHookSentinelEnd,
		"",
	}, "\n")
}

// installShellHook writes the shared shell-hook snippet to appDir/shell-hook.sh
// and prints the exact `source` line for the user's shell rc (R-5.6). It never
// edits rc files. Writing the whole file is naturally idempotent — re-installing
// overwrites with byte-identical content, so there is never any duplication
// (R-5.9). repo is unused: the snippet is CWD-resolving and repo-set-agnostic.
func installShellHook(_ repoEntry) error {
	if err := os.MkdirAll(appDir, 0o755); err != nil {
		return fmt.Errorf("creating app dir: %w", err)
	}
	path := shellHookPath()
	if err := os.WriteFile(path, []byte(shellHookSnippet()), 0o644); err != nil {
		return fmt.Errorf("writing shell hook: %w", err)
	}
	fmt.Printf("  shell: wrote %s\n", path)
	fmt.Println("  Add this line to your shell rc (~/.zshrc or ~/.bashrc), then restart your shell:")
	fmt.Printf("      source %s\n", path)
	return nil
}

// uninstallShellHook removes the shared snippet file and prints the exact
// `source` line for the user to delete from their rc (R-5.8). It never edits rc
// files. A missing file is a clean no-op — a second uninstall does not error.
func uninstallShellHook(_ repoEntry) error {
	path := shellHookPath()
	if err := os.Remove(path); err != nil {
		if os.IsNotExist(err) {
			return nil // already gone: clean no-op
		}
		return fmt.Errorf("removing shell hook: %w", err)
	}
	fmt.Printf("  shell: removed %s\n", path)
	fmt.Println("  Remove this line from your shell rc (~/.zshrc or ~/.bashrc):")
	fmt.Printf("      source %s\n", path)
	return nil
}
