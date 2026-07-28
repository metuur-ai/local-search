package config

// Writing the config.
//
// Two guarantees this file exists to provide, both fixing pre-0.4.0 bugs:
//
//  1. NON-DESTRUCTIVE. scope.WriteProjectConfig used to emit only the repo list,
//     so every `scope set` / `scope clear` / auto-init silently wiped a user's
//     weights and limits. SetRepositories is load-modify-write, and Save splices
//     only the `repositories:` line span so every other byte — comments, the
//     schema modeline, blank lines, key order — survives verbatim.
//
//  2. ATOMIC. The old writers used plain os.WriteFile, which truncates before
//     writing. A concurrent reader could observe a half-written file; with
//     strict validation that became a hard error on an innocent read. And
//     migration deletes the legacy TOML after writing, so a torn write would
//     lose BOTH copies. writeAtomic is temp-in-same-dir → fsync → rename.

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/goccy/go-yaml/parser"
)

// SchemaURL is where editors fetch the JSON Schema. The modeline referencing it
// is written on line 1 and, because the splice never touches line 1, survives
// every subsequent rewrite.
const SchemaURL = "https://raw.githubusercontent.com/metuur-ai/local-search/main/cli/config/schema/local-search-config.schema.json"

// Modeline returns the yaml-language-server directive.
func Modeline() string {
	return "# yaml-language-server: $schema=" + SchemaURL
}

const headerComment = `# LocalSearch config. Managed by ` + "`local-search init`" + ` / ` + "`local-search scope set`" + `; safe to hand-edit.
# Names must match ` + "`local-search repo list`" + `; "graph:" entries are external graphs.
# Validate with ` + "`local-search config validate`" + `.`

// SetRepositories replaces just the repository list at path, creating the file
// when absent. Everything else in an existing file is preserved.
func SetRepositories(path string, repos []string) error {
	original, rerr := os.ReadFile(path)
	switch {
	case rerr == nil:
		// Decoding on the READ side is load-bearing: it is what stops a
		// routine `local-search find` from bulldozing a config the user is
		// midway through hand-editing.
		f, err := Decode(path, original)
		if err != nil {
			return err
		}
		f.Repositories = repos
		return Save(path, f, original)
	case errors.Is(rerr, fs.ErrNotExist):
		return Save(path, File{Repositories: repos}, nil)
	default:
		return rerr
	}
}

// Save writes f to path. When original is non-nil it splices the repositories
// block into those bytes; otherwise it renders a fresh file.
func Save(path string, f File, original []byte) error {
	var out []byte
	if original != nil {
		if spliced, ok := spliceRepositories(original, f.Repositories); ok {
			out = spliced
		}
	}
	if out == nil {
		out = render(f)
	}
	return writeAtomic(path, out)
}

// Remove deletes the config file. Idempotent.
func Remove(path string) error {
	err := os.Remove(path)
	if err != nil && errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return err
}

// ── Rendering ─────────────────────────────────────────────────────────────────

// plainScalar matches names that are unambiguously safe to emit unquoted.
//
// This is deliberately conservative. Repo names are unvalidated at registration
// (`repo add` accepts any positional, defaulting to filepath.Base), so names
// like "@acme/ui", "*shared", "%metrics", "2024", and "true" are all reachable.
// The pre-0.4.0 writer emitted every name unquoted, which under a real YAML
// parser produces either a hard scanner error or — worse — a silently wrong
// type. Anything not matching here gets quoted.
var plainScalar = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9._/-]*$`)

// yamlScalar renders s as a YAML scalar, quoting when needed.
func yamlScalar(s string) string {
	if plainScalar.MatchString(s) && !isYAMLKeyword(s) {
		return s
	}
	// Double quotes with the two escapes YAML requires inside them.
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(s) + `"`
}

// isYAMLKeyword reports reserved words that would decode as a bool or null
// rather than a string. goccy is YAML 1.2, so yes/no/on/off are NOT included —
// a repo named "no" is safe.
func isYAMLKeyword(s string) bool {
	switch strings.ToLower(s) {
	case "true", "false", "null", "~":
		return true
	}
	return false
}

// render produces a complete config file. Used for new files and for migration
// output; existing files go through spliceRepositories instead.
func render(f File) []byte {
	var b strings.Builder
	b.WriteString(Modeline())
	b.WriteString("\n")
	b.WriteString(headerComment)
	b.WriteString("\n\n")

	if f.Version != nil {
		fmt.Fprintf(&b, "version: %d\n\n", *f.Version)
	}

	b.Write(renderRepositories(f.Repositories, "\n"))

	if w := f.Weights; w != nil && (w.Specs != nil || w.Graphify != nil || w.CodeGraph != nil) {
		b.WriteString("\nweights:\n")
		writeFloat(&b, "specs", w.Specs)
		writeFloat(&b, "graphify", w.Graphify)
		writeFloat(&b, "codegraph", w.CodeGraph)
	}
	if l := f.Limits; l != nil && (l.Specs != nil || l.Graphify != nil || l.CodeGraph != nil || l.BlastDepth != nil || l.BlastCap != nil) {
		b.WriteString("\nlimits:\n")
		writeInt(&b, "specs", l.Specs)
		writeInt(&b, "graphify", l.Graphify)
		writeInt(&b, "codegraph", l.CodeGraph)
		writeInt(&b, "blast_depth", l.BlastDepth)
		writeInt(&b, "blast_cap", l.BlastCap)
	}
	return []byte(b.String())
}

// renderRepositories emits the repositories block using the given line ending.
func renderRepositories(repos []string, eol string) []byte {
	var b strings.Builder
	if len(repos) == 0 {
		b.WriteString("repositories: []")
		b.WriteString(eol)
		return []byte(b.String())
	}
	b.WriteString("repositories:")
	b.WriteString(eol)
	for _, r := range repos {
		b.WriteString("  - ")
		b.WriteString(yamlScalar(r))
		b.WriteString(eol)
	}
	return []byte(b.String())
}

func writeFloat(b *strings.Builder, key string, v *float64) {
	if v != nil {
		fmt.Fprintf(b, "  %s: %g\n", key, *v)
	}
}

func writeInt(b *strings.Builder, key string, v *int) {
	if v != nil {
		fmt.Fprintf(b, "  %s: %d\n", key, *v)
	}
}

// ── Splicing ──────────────────────────────────────────────────────────────────

// spliceRepositories replaces only the `repositories:` block in src.
//
// A line splice rather than a marshal round-trip: goccy's CommentToMap +
// WithComment round-trip goes through a full re-encode, which normalizes
// indentation, drops blank lines, and can reorder keys. Splicing touches only
// the block's line span and leaves everything else byte-identical.
//
// Returns ok=false only when src cannot be parsed, which SetRepositories has
// already ruled out.
func spliceRepositories(src []byte, repos []string) ([]byte, bool) {
	eol := "\n"
	if bytes.Contains(src, []byte("\r\n")) {
		eol = "\r\n"
	}

	// The AST gives the exact line of the key, so a comment or a string that
	// merely looks like `repositories:` cannot fool us.
	astFile, err := parser.ParseBytes(src, 0)
	if err != nil {
		return nil, false
	}
	idx := indexKeys(astFile)
	pos, found := idx["repositories"]

	lines := splitLines(string(src), eol)
	block := string(renderRepositories(repos, eol))

	if !found || pos.Line <= 0 || pos.Line > len(lines) {
		// Key absent (a config with only weights). Append rather than
		// re-rendering, which would discard the user's comments.
		out := string(src)
		if out != "" && !strings.HasSuffix(out, eol) {
			out += eol
		}
		return []byte(out + block), true
	}

	start := pos.Line - 1 // 0-based
	keyIndent := indentOf(lines[start])

	// Consume the block: following lines that are blank, comments, or list
	// items / continuations indented deeper than the key. Stop at the first
	// line at or above the key's indent that is not a list item.
	//
	// Deliberately not trusting AST end-positions — goccy's block-sequence end
	// tokens do not reliably include trailing comments.
	end := start + 1
	lastContent := start
	for end < len(lines) {
		line := lines[end]
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			end++
			continue
		}
		ind := indentOf(line)
		if strings.HasPrefix(trimmed, "- ") || trimmed == "-" {
			if ind > keyIndent {
				end++
				lastContent = end - 1
				continue
			}
		}
		if ind > keyIndent {
			end++
			lastContent = end - 1
			continue
		}
		break
	}
	// Trailing blanks/comments after the last real item belong to whatever
	// comes next, not to this block.
	end = lastContent + 1

	var out []string
	out = append(out, lines[:start]...)
	out = append(out, splitLines(block, eol)...)
	out = append(out, lines[end:]...)
	return []byte(strings.Join(out, eol)), true
}

// splitLines splits on eol, dropping the empty element a trailing eol produces
// so Join round-trips exactly.
func splitLines(s, eol string) []string {
	parts := strings.Split(s, eol)
	if n := len(parts); n > 0 && parts[n-1] == "" {
		parts = parts[:n-1]
	}
	return parts
}

func indentOf(line string) int {
	for i, r := range line {
		if r != ' ' && r != '\t' {
			return i
		}
	}
	return len(line)
}

// ── Atomic write ──────────────────────────────────────────────────────────────

// writeAtomic writes data to path via a temp file in the SAME directory
// (rename must not cross filesystems), fsync, then rename.
func writeAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	mode := os.FileMode(0o644)
	if st, err := os.Stat(path); err == nil {
		mode = st.Mode().Perm()
	}

	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".tmp*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op once the rename succeeds

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpName, mode); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}
