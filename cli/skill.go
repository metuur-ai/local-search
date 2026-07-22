package main

// The Claude skill ships inside the binary so `local-search install-skill`
// can drop it into a skills directory with no separate download. skilldata/
// is the single source of truth for the skill — install.sh and the bundle
// no longer carry a loose copy.

import (
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

//go:embed all:skilldata/local-search
var skillFS embed.FS

const (
	skillName      = "local-search"
	skillEmbedRoot = "skilldata/" + skillName
)

// cmdInstallSkill writes the embedded skill to a Claude skills directory.
//
//	--global (default)  ~/.claude/skills   (available to Claude everywhere)
//	--local             ./.claude/skills   (this project only, relative to CWD)
//	--dir <path>        an explicit skills directory
//
// The skill lands at <skills-dir>/local-search. An existing install is left
// untouched unless --force is given.
func cmdInstallSkill(args []string) {
	const usage = "Usage: local-search install-skill [--global | --local | --dir <path>] [--force]"

	scope := "global"
	dirOverride := ""
	force := false
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--global", "-g":
			scope = "global"
		case "--local", "-l":
			scope = "local"
		case "--force", "-f":
			force = true
		case "--dir":
			if i+1 >= len(args) {
				die("install-skill: --dir requires a path")
			}
			i++
			dirOverride = args[i]
		case "-h", "--help":
			fmt.Println(usage)
			return
		default:
			die(usage)
		}
	}

	var skillsDir string
	switch {
	case dirOverride != "":
		skillsDir = dirOverride
	case scope == "local":
		skillsDir = filepath.Join(".claude", "skills")
	default:
		skillsDir = filepath.Join(homeDir(), ".claude", "skills")
	}

	dest := filepath.Join(skillsDir, skillName)
	if _, err := os.Stat(dest); err == nil && !force {
		die(fmt.Sprintf("skill already installed at %s (use --force to overwrite)", dest))
	}

	n, err := writeEmbeddedSkill(dest)
	if err != nil {
		die(fmt.Sprintf("install-skill: %v", err))
	}
	fmt.Printf("Installed %s skill (%d files) → %s\n", skillName, n, dest)
	fmt.Printf("Claude Code discovers skills under %s\n", skillsDir)
}

// writeEmbeddedSkill copies the embedded skill tree to dest, returning the
// number of files written. Embed paths always use '/' separators, so the
// relative path is derived with string ops and converted to an OS path for the
// destination (keeps Windows correct).
func writeEmbeddedSkill(dest string) (int, error) {
	count := 0
	err := fs.WalkDir(skillFS, skillEmbedRoot, func(p string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel := strings.TrimPrefix(strings.TrimPrefix(p, skillEmbedRoot), "/")
		target := filepath.Join(dest, filepath.FromSlash(rel))
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		data, err := skillFS.ReadFile(p)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(target, data, 0o644); err != nil {
			return err
		}
		count++
		return nil
	})
	return count, err
}
