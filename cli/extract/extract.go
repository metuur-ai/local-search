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

	// Knowledge-graph fields, produced by the same single frontmatter parse
	// that feeds legacy tag extraction (R-2.2).
	NodeID                string // canonical ID (R-1.1) or `<repo>:<path>` fallback (R-1.2)
	CanonicalID           string // "" when the file declares no canonical ID
	Kind                  string // canonical scheme ("component", "req", …) or "file"
	Edges                 []Edge // typed, directed edges with field provenance (R-2.1)
	UnrecognizedRelFields []string // unknown fields with canonical-ID-shaped values (R-2.4)
	FrontmatterMalformed  bool   // frontmatter present but invalid YAML (R-2.3)

	// Declared document classification, read verbatim from frontmatter. Both are
	// producer-defined OPEN vocabularies, not closed enums — consumers must
	// tolerate unknown values. Stored as written and case-folded only at
	// grouping/query time: a producer's lifecycle value is information a
	// consumer has no standing to rewrite.
	DocType string // frontmatter `type:`   — e.g. "prd", "dashboard", "team-standard"
	Status  string // frontmatter `status:` — e.g. "draft", "validated", "complete"
}

// applyKG fills the knowledge-graph fields of sp from the shared frontmatter
// parse. Malformed YAML degrades to structural-only indexing (R-2.3): fallback
// identity, no edges — but body-link edges still apply, since they do not
// depend on frontmatter at all.
//
// docAbsPath is the file the body came from (the sidecar, for a media
// companion), which is what relative links resolve against.
func applyKG(sp *Spec, fm frontmatter, repoRoot, docAbsPath, content string) {
	sp.FrontmatterMalformed = fm.malformed
	id, kind := canonicalIDFrom(fm.fields)
	sp.CanonicalID = id
	if id != "" {
		sp.NodeID, sp.Kind = id, kind
	} else {
		sp.NodeID, sp.Kind = fallbackNodeID(sp.Repo, sp.Path), "file"
	}
	sp.Edges, sp.UnrecognizedRelFields = extractEdges(sp.NodeID, fm.fields)
	sp.Edges = append(sp.Edges,
		extractLinkEdges(sp.NodeID, sp.Repo, repoRoot, docAbsPath, content)...)
	sp.DocType = scalarField(fm.fields, "type")
	sp.Status = scalarField(fm.fields, "status")
}

// scalarField returns a trimmed string frontmatter value, or "" when the key is
// absent, malformed, or not a scalar string. Non-string values (a list, a map, a
// number) are deliberately ignored rather than stringified: a `status:` that is
// not a scalar is not a lifecycle value.
func scalarField(fields map[string]any, key string) string {
	v, ok := fields[key]
	if !ok {
		return ""
	}
	s, ok := v.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(s)
}

var frontmatterRe = regexp.MustCompile(`(?s)^---\s*\n(.*?)\n---\s*\n`)
var tagsLineRe = regexp.MustCompile(`(?im)^tags:\s*(.+)`)

// tagsFlowSeqRe matches a complete YAML flow sequence (`tags: [a, b, c]`) so the
// enclosing brackets can be dropped. An unterminated `[a, b` is left verbatim.
var tagsFlowSeqRe = regexp.MustCompile(`^\[(.*)\]$`)
var headingRe = regexp.MustCompile(`(?m)^#\s+(.+)`)

// specRefRe matches `@spec req://<path>/<id>@<version>#<clause>` and captures the
// path/id up to the first `@`, `#`, whitespace or quote. Requiring `req://` skips
// prose mentions like "@spec annotations".
var specRefRe = regexp.MustCompile("@spec\\s+req://([^@#\\s\"'`]+)")

// specIDRefRe matches the bare-ID EARS annotation form — `@spec R-1.3` or a
// comma-separated list `@spec TASKS-012, HEALTH-007` — the convention codebases
// actually use (see user-guide/reference/ears-spec-annotations.md). It captures the
// whole ID list; individual IDs are split and validated against specIDRe. The
// explicit `@spec ` marker is what makes this safe: a bare `R-1.3` sitting in prose
// or a table of unrelated rows is never tagged. Distinct from the `req://` form above
// (which begins `req://`, so the two patterns never overlap).
var specIDRefRe = regexp.MustCompile(`@spec\s+([A-Za-z]+-[0-9]+(?:\.[0-9]+)*(?:\s*,\s*[A-Za-z]+-[0-9]+(?:\.[0-9]+)*)*)`)

// specIDRe validates one lowercased EARS requirement id: an alpha area prefix, a
// hyphen, then a dotted numeric part — e.g. `r-1.3`, `tasks-012`, `health-007`.
var specIDRe = regexp.MustCompile(`^[a-z]+-[0-9]+(?:\.[0-9]+)*$`)

// earsTableIDRe matches the ID column of an EARS requirement table — a line that
// begins a markdown table row whose first cell is nothing but a requirement id:
//
//	| R-1.1 | THE SYSTEM SHALL … |
//
// This is the convention used by frontmatter-less `docs/ears/*.md` specs, where the
// table IS the annotation and no `@spec` marker is ever written. Anchoring to `^|`
// and requiring the cell to hold only the id is what keeps it safe: a bare `R-1.3`
// in prose, or a table whose first column is prose, never matches. The separator
// row (`|-------|`) fails the id shape, so it is skipped for free.
var earsTableIDRe = regexp.MustCompile(`(?m)^\s*\|\s*([A-Za-z]+-[0-9]+(?:\.[0-9]+)*)\s*\|`)

// docKindDirs is the closed set of directory names that classify a document by
// kind. Only these produce `kind:`/`feature:` tags — an open rule would emit
// `kind:src`, `kind:internal` and similar noise for every indexed file.
var docKindDirs = map[string]bool{
	"ears": true, "hld": true, "lld": true, "tasks": true,
	"prd": true, "adr": true, "rfc": true, "research": true, "design": true,
}

// wikilinkRe matches Obsidian-style `[[target]]` / `[[target#heading|alias]]` and
// captures the target. The first-char and inner classes forbid whitespace and
// `"`/`$`, so shell test expressions in code (`[[ -d "$x" ]]`) never match.
var wikilinkRe = regexp.MustCompile(`\[\[([^\s|#"$\[\]][^|#"$\[\]\n]*?)(?:[#|][^\[\]\n]*)?\]\]`)

// graphifyNavRe matches graphify's synthetic navigation wikilinks — anchors like
// `[[_COMMUNITY_Community 12]]` that graphify writes into graphify-out/GRAPH_REPORT.md
// to link its auto-numbered cluster hubs. They are machine-generated navigation, not
// content references, and would otherwise slugify into noise tags (e.g.
// `link:community-community-12`) that flood the tag facets. The `_UPPER_` prefix is
// graphify's convention for such synthetic nodes, so match the whole family.
var graphifyNavRe = regexp.MustCompile(`^_[A-Z]+_`)

// fencedCodeRe matches fenced code blocks; they are stripped before ref
// extraction so bash examples don't leak shell `[[ … ]]` as wikilinks.
var fencedCodeRe = regexp.MustCompile("(?s)```.*?```|~~~.*?~~~")

// slugStripRe collapses non-alphanumeric runs for wikilink slugs.
var slugStripRe = regexp.MustCompile(`[^a-z0-9]+`)

// validSpecIDRe accepts a normalized spec path/id (lowercase alnum with /_-). It
// rejects format-description placeholders like `req://.../<id>@<version>#<clause>`
// that appear in docs, so those don't become junk tags.
var validSpecIDRe = regexp.MustCompile(`^[a-z0-9][a-z0-9/_-]*$`)

// LinkEdgeType is the edge type for a markdown body link from one indexed
// document to another. Unlike the frontmatter relationship fields, a body link
// asserts only THAT a relationship exists, not which kind — the kind lives in
// the surrounding prose. This mirrors OKF §6, which specifies exactly the same
// untyped-relationship semantics for the identical construct.
const LinkEdgeType = "links_to"

// bodyLinkFieldPrefix marks an Edge.Field as a body locator (`body:<line>`)
// rather than a frontmatter field name, so provenance renderers can tell the
// two apart. Exported for the db layer, which builds `source_location`.
const bodyLinkFieldPrefix = "body:"

// BodyLinkField reports whether an Edge.Field is a body locator rather than a
// frontmatter field name.
func BodyLinkField(field string) bool {
	return strings.HasPrefix(field, bodyLinkFieldPrefix)
}

// mdLinkRe matches an inline markdown link whose target is an indexable text
// file, with an optional `#anchor`. The target class forbids whitespace and `)`,
// so link titles (`[x](a.md "T")`) do not match — same conservative choice the
// wikilink and @spec patterns make.
var mdLinkRe = regexp.MustCompile(`\]\(([^)\s]+\.(?:md|mdx|txt))(?:#[^)\s]*)?\)`)

// extractLinkEdges emits one `links_to` edge per distinct markdown body link
// that resolves to a file which actually exists on disk.
//
// Resolution is by FILESYSTEM PATH, so the destination is always the
// `<repo>:<path>` fallback identity (R-1.2) — never a canonical scheme ID.
// Consequence, accepted deliberately: when the target file declares its own
// canonical `id:`, its node lives at that canonical ID, so this edge points at
// a path-shaped name nothing declares and lands as an `unresolved` phantom
// (R-1.5). Measured at 2 of 581 resolvable links (0.3%) across the reference
// corpora. Fixing it properly means mapping (repo, path) -> declared ID, which
// only the global resolveKG pass can see; doing it here would make one file's
// edges depend on another file's contents and silently break the incremental
// mtime fast path.
//
// Fenced code is neutralized before matching, preserving line numbers so the
// `body:<line>` locator stays accurate. Both link forms are handled here, in
// one place: relative (resolved against the document's directory) and
// repo-absolute (leading `/`, resolved against the repo root).
func extractLinkEdges(nodeID, repoName, repoRoot, docAbsPath, content string) []Edge {
	if repoRoot == "" || docAbsPath == "" {
		return nil
	}
	// Blank out fences but keep the line count identical, so byte offsets still
	// map to the right source line.
	body := fencedCodeRe.ReplaceAllStringFunc(content, func(m string) string {
		return strings.Repeat("\n", strings.Count(m, "\n"))
	})

	docDir := filepath.Dir(docAbsPath)
	var edges []Edge
	seen := map[string]bool{}
	for _, loc := range mdLinkRe.FindAllStringSubmatchIndex(body, -1) {
		target := body[loc[2]:loc[3]]
		if strings.Contains(target, "://") || strings.ContainsAny(target, "<>") {
			continue
		}
		var abs string
		if strings.HasPrefix(target, "/") {
			abs = filepath.Join(repoRoot, filepath.FromSlash(target))
		} else {
			abs = filepath.Join(docDir, filepath.FromSlash(target))
		}
		rel, err := filepath.Rel(repoRoot, abs)
		if err != nil {
			continue
		}
		rel = filepath.ToSlash(rel)
		// Never let a link escape the repo, and never self-link.
		if rel == ".." || strings.HasPrefix(rel, "../") {
			continue
		}
		if st, err := os.Stat(abs); err != nil || st.IsDir() {
			continue
		}
		dst := fallbackNodeID(repoName, rel)
		if dst == nodeID || seen[dst] {
			continue
		}
		seen[dst] = true
		line := 1 + strings.Count(body[:loc[0]], "\n")
		edges = append(edges, Edge{
			Src:   nodeID,
			Dst:   dst,
			Type:  LinkEdgeType,
			Field: bodyLinkFieldPrefix + strconv.Itoa(line),
		})
	}
	return edges
}

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

	// The one shared frontmatter parse per file per scan (R-2.2).
	fm := parseFrontmatter(content)

	sp := &Spec{
		Repo:         repoName,
		Path:         filepath.ToSlash(rel),
		Project:      project,
		Name:         stem,
		Title:        extractTitle(content, stem),
		Tags:         combinedTags(fm, content, rel),
		Summary:      summaryFromBody(content[fm.bodyEnd:]),
		FullPath:     absPath,
		Modified:     formatMtime(info),
		ModifiedUnix: info.ModTime().Unix(),
		Size:         info.Size(),
		Ext:          strings.TrimPrefix(ext, "."),
		Content:      content,
	}
	applyKG(sp, fm, repoRoot, absPath, content)
	return sp, nil
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

	// The one shared frontmatter parse per file per scan (R-2.2).
	fm := parseFrontmatter(companionContent)

	sp := &Spec{
		Repo:         repoName,
		Path:         filepath.ToSlash(rel),
		Project:      project,
		Name:         stem,
		Title:        extractTitle(companionContent, stem),
		Tags:         combinedTags(fm, companionContent, rel),
		Summary:      summaryFromBody(companionContent[fm.bodyEnd:]),
		FullPath:     mediaAbsPath,
		Modified:     formatMtime(mediaInfo),
		ModifiedUnix: mediaInfo.ModTime().Unix(),
		Size:         mediaInfo.Size(),
		Ext:          strings.TrimPrefix(ext, "."),
		Content:      companionContent,
	}
	// Links resolve against the SIDECAR's directory, not the media file's —
	// they are the same directory today, but the sidecar is what holds the body.
	applyKG(sp, fm, repoRoot, companionAbsPath, companionContent)
	return sp, nil
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
		return normalizeTagsLine(m[1])
	}
	return ""
}

// normalizeTagsLine unwraps the YAML flow-sequence form so the comma split at
// index time doesn't leave `[` on the first tag and `]` on the last — which made
// `[research` and `research` count as two distinct tags.
func normalizeTagsLine(s string) string {
	s = strings.TrimSpace(s)
	if m := tagsFlowSeqRe.FindStringSubmatch(s); m != nil {
		s = strings.TrimSpace(m[1])
	}
	return s
}

// legacyTagsFromRaw extracts the verbatim `tags:` line from the raw
// frontmatter block — the existing behaviour, unchanged by the shared YAML
// parse so inherited outputs stay byte-identical (R-5.4).
func legacyTagsFromRaw(raw string) string {
	if raw == "" {
		return ""
	}
	if m := tagsLineRe.FindStringSubmatch(raw); len(m) > 1 {
		return normalizeTagsLine(m[1])
	}
	return ""
}

// combinedTags returns the frontmatter tags plus namespaced tags derived from
// the body: `@spec req://…` references as `spec:<path/id>` and `[[wikilinks]]`
// as `link:<slug>`. Frontmatter tags are preserved verbatim (existing behaviour);
// the derived tags are appended, comma-separated, so the existing splitTags path
// at index time populates spec_tags without any schema or query change.
// It consumes the shared frontmatter parse (R-2.2) instead of re-locating the block.
// Documents with no frontmatter at all (the `docs/ears|hld|lld|tasks/*.md`
// convention) additionally derive `kind:`/`feature:` from their path, so they are
// not tagless (R-5.5).
func combinedTags(fm frontmatter, content, rel string) string {
	feature := featureSlug(rel)
	groups := [][]string{
		{legacyTagsFromRaw(fm.raw)},
		extractRefTags(content, feature),
		docTags(rel, feature),
	}
	var out []string
	for _, g := range groups {
		for _, t := range g {
			if t != "" {
				out = append(out, t)
			}
		}
	}
	return strings.Join(out, ", ")
}

// featureSlug is the document's own identity — its filename stem, slugified. It
// namespaces EARS ids so `R-1.1` from two different specs stay distinct tags
// instead of collapsing into one meaningless facet shared by every spec in every
// repo.
func featureSlug(rel string) string {
	base := filepath.Base(filepath.ToSlash(rel))
	return slugify(strings.TrimSuffix(base, filepath.Ext(base)))
}

// docTags derives `kind:` and `feature:` from the path for files sitting in a
// recognized doc-kind directory. This is the only tag source for specs that carry
// no frontmatter and no inline references.
func docTags(rel, feature string) []string {
	dir := filepath.Base(filepath.Dir(filepath.ToSlash(rel)))
	if !docKindDirs[strings.ToLower(dir)] || feature == "" {
		return nil
	}
	return []string{"kind:" + strings.ToLower(dir), "feature:" + feature}
}

// extractRefTags collects deduped `spec:` and `link:` tags from the content body,
// after stripping fenced code so bash examples don't leak shell `[[ … ]]`.
func extractRefTags(content, feature string) []string {
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
	// Bare-ID form: `@spec R-1.3` / `@spec TASKS-012, HEALTH-007` → one tag per id.
	for _, m := range specIDRefRe.FindAllStringSubmatch(prose, -1) {
		for _, part := range strings.Split(m[1], ",") {
			id := strings.ToLower(strings.TrimSpace(part))
			if specIDRe.MatchString(id) {
				add("spec:" + id)
			}
		}
	}
	// EARS requirement tables: the id lives in the first table cell with no `@spec`
	// marker, so it is qualified by the document to stay unique across specs.
	if feature != "" {
		for _, m := range earsTableIDRe.FindAllStringSubmatch(prose, -1) {
			id := strings.ToLower(strings.TrimSpace(m[1]))
			if specIDRe.MatchString(id) {
				add("spec:" + feature + "/" + id)
			}
		}
	}
	for _, m := range wikilinkRe.FindAllStringSubmatch(prose, -1) {
		// Skip graphify's synthetic cluster-nav anchors (`[[_COMMUNITY_…]]`) so they
		// don't become `link:community-community-N` tags.
		if graphifyNavRe.MatchString(m[1]) {
			continue
		}
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
	return summaryFromBody(body)
}

// summaryFromBody extracts the first-paragraph summary from content that has
// already had its frontmatter sliced off (via the shared parse's bodyEnd).
func summaryFromBody(body string) string {
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
