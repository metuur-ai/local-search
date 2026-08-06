package config

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/goccy/go-yaml"
	"github.com/goccy/go-yaml/parser"
)

// ProjectPath returns <dir>/.agents/local-search-config.yaml.
func ProjectPath(dir string) string {
	return filepath.Join(dir, AgentDir, FileName)
}

// GlobalPath returns $HOME/.local-search-config.yaml.
func GlobalPath(home string) string {
	if home == "" {
		return ""
	}
	return filepath.Join(home, GlobalRel)
}

// LegacyProjectPath returns <dir>/.local-search.toml (pre-0.4.0).
func LegacyProjectPath(dir string) string {
	return filepath.Join(dir, LegacyName)
}

// LegacyGlobalPath returns $HOME/.local-search/config.toml (pre-0.4.0).
func LegacyGlobalPath(home string) string {
	if home == "" {
		return ""
	}
	return filepath.Join(home, LegacyGlobalRel)
}

// IsNotExist reports whether err means "no config here" as opposed to "the
// config here is broken". Callers walking a directory chain must continue only
// on true — a malformed config has to stop the walk, or the old
// silently-fall-through bug comes straight back.
func IsNotExist(err error) bool {
	return errors.Is(err, fs.ErrNotExist)
}

// Load reads and validates one config file. Returns a wrapped fs.ErrNotExist
// when the file is absent, and a *Error when it is present but invalid.
func Load(path string) (Settings, error) {
	f, err := LoadFile(path)
	if err != nil {
		return Settings{}, err
	}
	s := f.Settings()
	s.Path = path
	return s, nil
}

// LoadFile reads a config with its pointers intact. Save needs the raw File so
// it can tell "absent" from "explicitly set" and avoid inventing fields.
func LoadFile(path string) (File, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return File{}, err // already wraps fs.ErrNotExist when missing
	}
	return Decode(path, data)
}

// Decode parses, audits, decodes, and validates config bytes.
func Decode(path string, data []byte) (File, error) {
	data = stripBOM(data)

	// A zero-byte or comment-only file is a VALID empty config, not an error —
	// `local-search init` legitimately produces one.
	if len(bytes.TrimSpace(data)) == 0 {
		return File{}, nil
	}

	// Phase 1: syntax. goccy's errors carry tokens, so FormatError renders a
	// line number plus a source snippet for free.
	ast, perr := parser.ParseBytes(data, 0)
	if perr != nil {
		return File{}, &Error{File: path, Source: data, Problems: []Problem{{
			Rendered: fmt.Sprintf("%s: %s", path, yaml.FormatError(perr, false, true)),
		}}}
	}

	// Phase 2: key audit BEFORE decode, so every typo is reported at once with
	// a suggestion. DisallowUnknownField alone stops at the first one.
	idx := indexKeys(ast)
	if probs := auditKeys(idx); len(probs) > 0 {
		return File{}, &Error{File: path, Source: data, Problems: probs}
	}

	// Phase 3: typed decode. Catches shape errors the key audit cannot see,
	// e.g. `repositories: "notalist"`. Duplicate map keys are already fatal in
	// goccy by default (AllowDuplicateMapKey is the opt-OUT).
	var f File
	if err := yaml.UnmarshalWithOptions(data, &f,
		yaml.DisallowUnknownField(),
		yaml.AllowFieldPrefixes(allowedPrefix),
	); err != nil {
		return File{}, &Error{File: path, Source: data, Problems: []Problem{{
			Rendered: fmt.Sprintf("%s: %s", path, yaml.FormatError(err, false, true)),
		}}}
	}

	// Phase 4: semantics, line-numbered from the phase-2 index.
	if probs := validate(f, idx); len(probs) > 0 {
		return File{}, &Error{File: path, Source: data, Problems: probs}
	}
	return f, nil
}

// stripBOM removes a UTF-8 byte-order mark, which would otherwise poison the
// first key and produce a baffling parse error.
func stripBOM(b []byte) []byte {
	return bytes.TrimPrefix(b, []byte{0xEF, 0xBB, 0xBF})
}

// ── Walk-up discovery ─────────────────────────────────────────────────────────

// FindProject walks up from start looking for .agents/local-search-config.yaml
// and returns the first one found.
//
// The walk STOPS at $HOME (exclusive) and at a git repository root. Without
// those guards a single `local-search init` run from $HOME would leave
// ~/.agents/local-search-config.yaml and silently capture the scope of every
// project on the machine.
//
// Returns a wrapped fs.ErrNotExist when nothing is found. Any other error means
// a config WAS found and is broken — callers must not continue past it.
func FindProject(start, home string) (Settings, error) {
	dir := start
	for {
		// $HOME is EXCLUSIVE: never even read ~/.agents/local-search-config.yaml.
		// A single `local-search init` run from $HOME would otherwise capture
		// every project on the machine. (The global config lives at
		// ~/.local-search-config.yaml and is consulted separately.)
		if isHome(dir, home) {
			break
		}
		path := ProjectPath(dir)
		s, err := Load(path)
		if err == nil {
			return s, nil
		}
		if !IsNotExist(err) {
			return Settings{}, err
		}
		// A git root is INCLUSIVE: its config is read (above) and the walk
		// stops there, so a nested checkout never inherits its parent's scope.
		if isGitRoot(dir) {
			break
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return Settings{}, fmt.Errorf("no %s found from %s: %w", FileName, start, fs.ErrNotExist)
}

// FindProjectConfigPath reports where FindProject would read from, without decoding.
// Used by callers that need to know whether a config exists before deciding to
// create one.
func FindProjectConfigPath(start, home string) (string, bool) {
	dir := start
	for {
		if isHome(dir, home) {
			return "", false
		}
		path := ProjectPath(dir)
		if st, err := os.Stat(path); err == nil && !st.IsDir() {
			return path, true
		}
		if isGitRoot(dir) {
			return "", false
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", false
		}
		dir = parent
	}
}

// isHome reports whether dir IS the home directory. The walk stops before
// reading here — see FindProject.
func isHome(dir, home string) bool {
	if home == "" {
		return false
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return false
	}
	habs, err := filepath.Abs(home)
	if err != nil {
		return false
	}
	return abs == habs
}

// isGitRoot reports whether dir contains a .git entry — a project boundary the
// user already understands, and the natural place for the walk to stop.
func isGitRoot(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, ".git"))
	return err == nil
}

// LoadGlobal reads ~/.local-search-config.yaml.
func LoadGlobal(home string) (Settings, error) {
	p := GlobalPath(home)
	if p == "" {
		return Settings{}, fmt.Errorf("no home directory: %w", fs.ErrNotExist)
	}
	return Load(p)
}
