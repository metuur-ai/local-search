// Package extract parses spec file metadata: title, tags, summary, and content.
// Replicates the bash local-search.sh extraction logic exactly.
package extract

import (
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// MediaExts is the set of binary file extensions that require a companion .md sidecar.
var MediaExts = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true,
	".gif": true, ".webp": true, ".svg": true, ".pdf": true,
}

// TextExts is the set of text file extensions indexed directly.
var TextExts = map[string]bool{
	".md": true, ".mdx": true, ".txt": true,
}

// Spec holds all extracted metadata for a single file to be indexed.
type Spec struct {
	Repo         string
	Path         string // relative to repo root
	Project      string
	Name         string
	Title        string
	Tags         string
	Summary      string
	FullPath     string
	Modified     string // unix timestamp as string
	ModifiedUnix int64  // mtime as unix seconds
	Size         int64
	Ext          string
	Content      string
}

var frontmatterRe = regexp.MustCompile(`(?s)^---\s*\n(.*?)\n---\s*\n`)
var tagsLineRe = regexp.MustCompile(`(?im)^tags:\s*(.+)`)
var headingRe = regexp.MustCompile(`(?m)^#\s+(.+)`)

// specRefRe matches `@spec req://<path>/<id>@<version>#<clause>` and captures the
// path/id up to the first `@`, `#`, whitespace or quote. Requiring `req://` skips
// prose mentions like "@spec annotations".
var specRefRe = regexp.MustCompile("@spec\\s+req://([^@#\\s\"'`]+)")

// wikilinkRe matches Obsidian-style `[[target]]` / `[[target#heading|alias]]` and
// captures the target. The first-char and inner classes forbid whitespace and
// `"`/`$`, so shell test expressions in code (`[[ -d "$x" ]]`) never match.
var wikilinkRe = regexp.MustCompile(`\[\[([^\s|#"$\[\]][^|#"$\[\]\n]*?)(?:[#|][^\[\]\n]*)?\]\]`)

// fencedCodeRe matches fenced code blocks; they are stripped before ref
// extraction so bash examples don't leak shell `[[ … ]]` as wikilinks.
var fencedCodeRe = regexp.MustCompile("(?s)```.*?```|~~~.*?~~~")

// slugStripRe collapses non-alphanumeric runs for wikilink slugs.
var slugStripRe = regexp.MustCompile(`[^a-z0-9]+`)

// validSpecIDRe accepts a normalized spec path/id (lowercase alnum with /_-). It
// rejects format-description placeholders like `req://.../<id>@<version>#<clause>`
// that appear in docs, so those don't become junk tags.
var validSpecIDRe = regexp.MustCompile(`^[a-z0-9][a-z0-9/_-]*$`)

const maxContentBytes = 10 * 1024 * 1024 // 10 MB cap
const maxSummaryChars = 300

// FromFile extracts a Spec from a text file (.md, .mdx, .txt).
// repoName and repoRoot are used to compute relative path and project.
func FromFile(repoName, repoRoot, absPath string) (*Spec, error) {
	info, err := os.Stat(absPath)
	if err != nil {
		return nil, err
	}
	return fromFileInfo(repoName, repoRoot, absPath, info)
}

// FromFileEntry is like FromFile but reuses the fs.DirEntry from WalkDir,
// avoiding a redundant os.Stat call.
func FromFileEntry(repoName, repoRoot, absPath string, d fs.DirEntry) (*Spec, error) {
	info, err := d.Info()
	if err != nil {
		return nil, err
	}
	return fromFileInfo(repoName, repoRoot, absPath, info)
}

func fromFileInfo(repoName, repoRoot, absPath string, info os.FileInfo) (*Spec, error) {
	rel, err := filepath.Rel(repoRoot, absPath)
	if err != nil {
		return nil, err
	}

	content, err := readFileCapped(absPath)
	if err != nil {
		content = ""
	}

	ext := strings.ToLower(filepath.Ext(absPath))
	stem := strings.TrimSuffix(filepath.Base(absPath), filepath.Ext(absPath))
	project := projectFromRel(rel)

	return &Spec{
		Repo:         repoName,
		Path:         filepath.ToSlash(rel),
		Project:      project,
		Name:         stem,
		Title:        extractTitle(content, stem),
		Tags:         combinedTags(content),
		Summary:      extractSummary(content),
		FullPath:     absPath,
		Modified:     formatMtime(info),
		ModifiedUnix: info.ModTime().Unix(),
		Size:         info.Size(),
		Ext:          strings.TrimPrefix(ext, "."),
		Content:      content,
	}, nil
}

// FromCompanion extracts a Spec for a media file using its companion .md sidecar.
// Returns nil if the companion does not exist or is empty.
func FromCompanion(repoName, repoRoot, mediaAbsPath, companionAbsPath string) (*Spec, error) {
	mediaInfo, err := os.Stat(mediaAbsPath)
	if err != nil {
		return nil, err
	}
	return fromCompanionInfo(repoName, repoRoot, mediaAbsPath, mediaInfo, companionAbsPath)
}

// FromCompanionEntry is like FromCompanion but reuses the fs.DirEntry for the media file,
// avoiding a redundant os.Stat call on the media file.
func FromCompanionEntry(repoName, repoRoot, mediaAbsPath string, d fs.DirEntry, companionAbsPath string) (*Spec, error) {
	mediaInfo, err := d.Info()
	if err != nil {
		return nil, err
	}
	return fromCompanionInfo(repoName, repoRoot, mediaAbsPath, mediaInfo, companionAbsPath)
}

func fromCompanionInfo(repoName, repoRoot, mediaAbsPath string, mediaInfo os.FileInfo, companionAbsPath string) (*Spec, error) {
	// Check companion exists and is non-empty without a full Stat — use os.Open + read
	cf, err := os.Open(companionAbsPath)
	if err != nil {
		return nil, nil // no companion — skip
	}
	defer cf.Close()

	// Read companion content (capped)
	lr := io.LimitReader(cf, maxContentBytes)
	companionBytes, _ := io.ReadAll(lr)
	if len(companionBytes) == 0 {
		return nil, nil // empty companion — skip
	}
	companionContent := strings.ToValidUTF8(string(companionBytes), "\uFFFD")

	rel, err := filepath.Rel(repoRoot, mediaAbsPath)
	if err != nil {
		return nil, err
	}

	ext := strings.ToLower(filepath.Ext(mediaAbsPath))
	stem := strings.TrimSuffix(filepath.Base(mediaAbsPath), filepath.Ext(mediaAbsPath))
	project := projectFromRel(rel)

	return &Spec{
		Repo:         repoName,
		Path:         filepath.ToSlash(rel),
		Project:      project,
		Name:         stem,
		Title:        extractTitle(companionContent, stem),
		Tags:         combinedTags(companionContent),
		Summary:      extractSummary(companionContent),
		FullPath:     mediaAbsPath,
		Modified:     formatMtime(mediaInfo),
		ModifiedUnix: mediaInfo.ModTime().Unix(),
		Size:         mediaInfo.Size(),
		Ext:          strings.TrimPrefix(ext, "."),
		Content:      companionContent,
	}, nil
}

// BuildMediaStems returns a set of file stems (without extension) that have a
// media extension in the given directory entries. Used for O(1) sidecar checks.
func BuildMediaStems(entries []fs.DirEntry) map[string]bool {
	stems := make(map[string]bool, len(entries)/4+1)
	for _, e := range entries {
		ext := strings.ToLower(filepath.Ext(e.Name()))
		if MediaExts[ext] {
			stems[strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))] = true
		}
	}
	return stems
}

// HasMediaCompanion checks whether any media file exists with the same stem as the given .md path.
// Used to skip indexing .md files that are sidecars.
// For hot paths (WalkDir), prefer HasMediaCompanionInDir which reuses cached directory entries.
func HasMediaCompanion(mdAbsPath string) bool {
	dir := filepath.Dir(mdAbsPath)
	stem := strings.TrimSuffix(filepath.Base(mdAbsPath), filepath.Ext(mdAbsPath))
	entries, err := os.ReadDir(dir)
	if err != nil {
		// Fall back to individual stat calls if ReadDir fails
		stemFull := strings.TrimSuffix(mdAbsPath, filepath.Ext(mdAbsPath))
		for ext := range MediaExts {
			if _, e := os.Stat(stemFull + ext); e == nil {
				return true
			}
		}
		return false
	}
	return HasMediaCompanionInDir(stem, entries)
}

// HasMediaCompanionInDir checks whether any entry in the pre-read directory listing
// has the same stem and a media extension. Avoids repeated os.Stat calls during walks.
func HasMediaCompanionInDir(stem string, entries []fs.DirEntry) bool {
	for _, e := range entries {
		name := e.Name()
		ext := strings.ToLower(filepath.Ext(name))
		if !MediaExts[ext] {
			continue
		}
		if strings.TrimSuffix(name, filepath.Ext(name)) == stem {
			return true
		}
	}
	return false
}

// CompanionPath returns the expected companion .md path for a media file.
func CompanionPath(mediaAbsPath string) string {
	stem := strings.TrimSuffix(mediaAbsPath, filepath.Ext(mediaAbsPath))
	return stem + ".md"
}

// ── helpers ──────────────────────────────────────────────────────────────────

// readFileCapped reads up to maxContentBytes from path, allocating only as much
// memory as the file actually contains (not a fixed 10 MB buffer).
func readFileCapped(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	lr := io.LimitReader(f, maxContentBytes)
	data, err := io.ReadAll(lr)
	if err != nil {
		return "", err
	}
	return strings.ToValidUTF8(string(data), "\uFFFD"), nil
}

func projectFromRel(rel string) string {
	// Use IndexByte to avoid allocating a []string for the common case.
	slash := strings.IndexByte(filepath.ToSlash(rel), '/')
	if slash > 0 {
		return filepath.ToSlash(rel)[:slash]
	}
	return "_root"
}

func extractTitle(content, fallback string) string {
	if m := headingRe.FindStringSubmatch(content); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	return fallback
}

func extractTags(content string) string {
	fm := frontmatterRe.FindStringSubmatch(content)
	if len(fm) < 2 {
		return ""
	}
	if m := tagsLineRe.FindStringSubmatch(fm[1]); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

// combinedTags returns the frontmatter tags plus namespaced tags derived from
// the body: `@spec req://…` references as `spec:<path/id>` and `[[wikilinks]]`
// as `link:<slug>`. Frontmatter tags are preserved verbatim (existing behaviour);
// the derived tags are appended, comma-separated, so the existing splitTags path
// at index time populates spec_tags without any schema or query change.
func combinedTags(content string) string {
	base := extractTags(content)
	refs := extractRefTags(content)
	switch {
	case len(refs) == 0:
		return base
	case base == "":
		return strings.Join(refs, ", ")
	default:
		return base + ", " + strings.Join(refs, ", ")
	}
}

// extractRefTags collects deduped `spec:` and `link:` tags from the content body,
// after stripping fenced code so bash examples don't leak shell `[[ … ]]`.
func extractRefTags(content string) []string {
	prose := fencedCodeRe.ReplaceAllString(content, "")
	var out []string
	seen := map[string]bool{}
	add := func(t string) {
		if t == "" || seen[t] {
			return
		}
		seen[t] = true
		out = append(out, t)
	}
	for _, m := range specRefRe.FindAllStringSubmatch(prose, -1) {
		id := strings.ToLower(strings.Trim(m[1], "/"))
		if validSpecIDRe.MatchString(id) {
			add("spec:" + id)
		}
	}
	for _, m := range wikilinkRe.FindAllStringSubmatch(prose, -1) {
		if s := slugify(m[1]); s != "" {
			add("link:" + s)
		}
	}
	return out
}

// slugify lowercases and replaces non-alphanumeric runs with single hyphens.
func slugify(s string) string {
	s = slugStripRe.ReplaceAllString(strings.ToLower(strings.TrimSpace(s)), "-")
	return strings.Trim(s, "-")
}

func extractSummary(content string) string {
	// Strip frontmatter by slicing past the match end — avoids allocating a
	// new string copy of the entire content on every call.
	body := content
	if loc := frontmatterRe.FindStringIndex(content); loc != nil {
		body = content[loc[1]:]
	}

	var lines []string
	collecting := false

	// Scan line-by-line without allocating a []string for all lines.
	// Stops as soon as the first paragraph ends, so large files are not fully scanned.
	for len(body) > 0 {
		var line string
		if i := strings.IndexByte(body, '\n'); i >= 0 {
			line = body[:i]
			body = body[i+1:]
		} else {
			line = body
			body = ""
		}
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "#") {
			continue // skip headings
		}
		if trimmed == "" {
			if collecting {
				break // end of first paragraph
			}
			continue
		}
		collecting = true
		lines = append(lines, trimmed)
	}

	summary := strings.Join(lines, " ")
	// Single rune conversion: convert once, slice if needed.
	runes := []rune(summary)
	if len(runes) > maxSummaryChars {
		return string(runes[:maxSummaryChars])
	}
	return summary
}

func formatMtime(info os.FileInfo) string {
	return strconv.FormatInt(info.ModTime().Unix(), 10)
}
