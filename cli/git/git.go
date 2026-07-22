// Package git provides change-detection helpers for git repositories.
// Replicates the bash git_changed_files() and is_git_repo() logic.
package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

// specGlobs is the set of file patterns the tool indexes. Package-level to
// avoid a heap allocation on every ChangedFiles call.
var specGlobs = []string{
	"*.md", "*.mdx", "*.txt",
	"*.jpg", "*.jpeg", "*.png", "*.gif", "*.webp", "*.svg", "*.pdf",
}

// IsRepo reports whether dir is inside a git repository.
func IsRepo(dir string) bool {
	cmd := exec.Command("git", "-C", dir, "rev-parse", "--git-dir")
	return cmd.Run() == nil
}

// CurrentCommit returns the current HEAD commit hash, or "" if not in a git repo
// or if HEAD does not exist yet.
func CurrentCommit(dir string) string {
	out, err := run(dir, "rev-parse", "HEAD")
	if err != nil {
		return ""
	}
	return out
}

// ChangedFiles returns spec file paths (relative to repo root) that have changed
// since lastCommit. If lastCommit is empty, returns all tracked spec files.
//
// Covers: committed changes, staged, unstaged, and untracked files.
// Returned paths use forward slashes regardless of OS.
func ChangedFiles(dir, lastCommit string) ([]string, error) {
	current := CurrentCommit(dir)
	if current == "" {
		return nil, nil
	}

	seen := map[string]bool{}
	add := func(lines string) {
		for _, l := range strings.Split(lines, "\n") {
			l = strings.TrimSpace(l)
			if l != "" && isSpecFile(l) {
				seen[filepath.ToSlash(l)] = true
			}
		}
	}

	if lastCommit == "" {
		// First scan: grab all tracked spec files
		args := append([]string{"ls-files", "--"}, specGlobs...)
		if out, err := run(dir, args...); err == nil {
			add(out)
		}
	} else if lastCommit != current {
		// Committed changes since last scan
		args := append([]string{"diff", "--name-only", lastCommit, current, "--"}, specGlobs...)
		if out, err := run(dir, args...); err == nil {
			add(out)
		}
	}

	// Always include uncommitted changes (staged and unstaged)
	for _, subcmd := range [][]string{
		{"diff", "--name-only"},
		{"diff", "--cached", "--name-only"},
	} {
		args := append(subcmd, append([]string{"--"}, specGlobs...)...)
		if out, err := run(dir, args...); err == nil {
			add(out)
		}
	}

	// Untracked files
	args := append([]string{"ls-files", "--others", "--exclude-standard", "--"}, specGlobs...)
	if out, err := run(dir, args...); err == nil {
		add(out)
	}

	result := make([]string, 0, len(seen))
	for p := range seen {
		result = append(result, p)
	}
	sort.Strings(result) // O(n log n) — replaces the old O(n²) insertion sort
	return result, nil
}

// FileExists reports whether a path exists inside a repo directory.
func FileExists(repoRoot, relPath string) bool {
	_, err := os.Stat(filepath.Join(repoRoot, filepath.FromSlash(relPath)))
	return err == nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

func run(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimRight(string(out), "\n"), nil
}

func isSpecFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".md", ".mdx", ".txt",
		".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".pdf":
		return true
	}
	return false
}
