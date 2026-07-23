package db

import (
	"database/sql"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"local-search/embed"
)

// GraphNode / GraphLink / NodeLinkGraph mirror NetworkX node-link JSON
// (the same shape graph.CountNodes/Load consume): {"nodes":[...],"links":[...]}.
//
// The lean vector-graph commands (`graph tag` / `graph search`) populate only
// ID/Label/Repo/Project; the richer `graph export` fills the rest. Every added
// field is `omitempty`, so those lean commands emit exactly what they did before.
type GraphNode struct {
	ID        string   `json:"id"`
	Label     string   `json:"label"`
	NormLabel string   `json:"norm_label,omitempty"`
	Repo      string   `json:"repo"`
	Project   string   `json:"project,omitempty"`
	Path      string   `json:"path,omitempty"`
	Name      string   `json:"name,omitempty"`
	Title     string   `json:"title,omitempty"`
	Summary   string   `json:"summary,omitempty"`
	Tags      []string `json:"tags,omitempty"`
	FileType  string   `json:"file_type,omitempty"`
	Content   string   `json:"content,omitempty"`

	// Knowledge-graph supplementary-node fields, set ONLY on the extra nodes
	// RepoGraph emits for typed-link endpoints that have no spec row in the
	// exported repo (cross-repo definitions and unresolved phantoms). Both are
	// `omitempty`, so every pre-existing node serializes byte-identically
	// (R-5.4).
	Kind  string `json:"kind,omitempty"`  // canonical scheme ('component', 'req', …)
	Flags string `json:"flags,omitempty"` // '', 'conflict' (R-1.4), 'unresolved' (R-1.5)
}

// GraphLink is one undirected edge with a similarity weight — plus, for TYPED
// knowledge-graph links only (R-5.2), the four graphify link-schema fields:
// relation, confidence, source_file, source_location. All four are `omitempty`
// and left zero on similarity links, so every pre-existing untyped link (and
// the lean `graph tag`/`graph search` outputs) serializes byte-identically to
// before (R-4.6, R-5.4). Typed links share ONE node-ID namespace with the
// untyped families: endpoints that resolve to a spec in the exported repo use
// that spec's rowid ID; only endpoints resolved elsewhere (cross-repo, phantom)
// keep their canonical string ID — and those always get a matching
// supplementary node, so every link endpoint exists in nodes[].
type GraphLink struct {
	Source string  `json:"source"`
	Target string  `json:"target"`
	Weight float64 `json:"weight"`

	Relation       string  `json:"relation,omitempty"`        // edge type, e.g. depends_on (R-2.1)
	Confidence     float64 `json:"confidence,omitempty"`      // 1 — declared edges are deterministic extractions
	SourceFile     string  `json:"source_file,omitempty"`     // repo-relative declaring file (provenance)
	SourceLocation string  `json:"source_location,omitempty"` // "frontmatter:<field>" locator (provenance)
}

// NodeLinkGraph is a NetworkX-compatible node-link container.
type NodeLinkGraph struct {
	Directed   bool           `json:"directed"`
	Multigraph bool           `json:"multigraph"`
	Graph      map[string]any `json:"graph"`
	Nodes      []GraphNode    `json:"nodes"`
	Links      []GraphLink    `json:"links"`
}

// vspec holds one spec's identity and its decoded embedding vector.
type vspec struct {
	id      int64
	repo    string
	name    string
	title   string
	project string
	vec     []float32
}

// nodeID returns the string node id used in the node-link graph.
func (s vspec) nodeID() string { return strconv.FormatInt(s.id, 10) }

// label returns the display label: title, or name when title is empty.
func (s vspec) label() string {
	if s.title != "" {
		return s.title
	}
	return s.name
}

// node builds a GraphNode from the spec.
func (s vspec) node() GraphNode {
	return GraphNode{ID: s.nodeID(), Label: s.label(), Repo: s.repo, Project: s.project}
}

// round4 rounds a similarity weight to 4 decimals for stable JSON output.
func round4(w float64) float64 {
	return float64(int64(w*1e4+0.5)) / 1e4
}

// VectorGraphByTag builds an undirected kNN vector graph over every spec that
// carries the given tag and has a stored embedding. Edges connect pairs whose
// cosine similarity is >= minWeight, capped at perNodeTopK incident edges per
// node so the result stays sparse instead of a hairball.
func VectorGraphByTag(db *sql.DB, tag string, minWeight float64, perNodeTopK int) (NodeLinkGraph, error) {
	g := NodeLinkGraph{
		Directed:   false,
		Multigraph: false,
		Graph:      map[string]any{},
		Nodes:      []GraphNode{},
		Links:      []GraphLink{},
	}

	rows, err := db.Query(`SELECT s.id, s.repo, s.name, s.title, s.project, v.vec
		FROM specs s
		JOIN spec_tags t ON t.spec_id=s.id
		JOIN spec_vectors v ON v.spec_id=s.id
		WHERE LOWER(t.tag)=LOWER(?)`, tag)
	if err != nil {
		return g, err
	}
	defer rows.Close()

	var specs []vspec
	for rows.Next() {
		var s vspec
		var blob []byte
		if err := rows.Scan(&s.id, &s.repo, &s.name, &s.title, &s.project, &blob); err != nil {
			return g, err
		}
		s.vec = embed.Decode(blob)
		specs = append(specs, s)
	}
	if err := rows.Err(); err != nil {
		return g, err
	}

	for _, s := range specs {
		g.Nodes = append(g.Nodes, s.node())
	}

	g.Links = append(g.Links, knnLinks(specs, minWeight, perNodeTopK)...)
	return g, nil
}

// knnLinks builds undirected kNN edges over specs: every pair whose cosine
// similarity is >= minWeight, kept strongest-first while each node stays within
// perNodeTopK incident edges. Node ids are the specs' own ids, so the links are
// valid against a node set built from the same specs.
func knnLinks(specs []vspec, minWeight float64, perNodeTopK int) []GraphLink {
	type pair struct {
		a, b int
		w    float64
	}
	var pairs []pair
	for i := 0; i < len(specs); i++ {
		for j := i + 1; j < len(specs); j++ {
			w := float64(embed.Cosine(specs[i].vec, specs[j].vec))
			if w >= minWeight {
				pairs = append(pairs, pair{a: i, b: j, w: w})
			}
		}
	}
	// Strongest first (tie-break by index for deterministic output), then
	// greedily keep edges within each node's cap.
	sort.Slice(pairs, func(x, y int) bool {
		if pairs[x].w != pairs[y].w {
			return pairs[x].w > pairs[y].w
		}
		if pairs[x].a != pairs[y].a {
			return pairs[x].a < pairs[y].a
		}
		return pairs[x].b < pairs[y].b
	})
	degree := make([]int, len(specs))
	var links []GraphLink
	for _, p := range pairs {
		if degree[p.a] >= perNodeTopK || degree[p.b] >= perNodeTopK {
			continue
		}
		degree[p.a]++
		degree[p.b]++
		links = append(links, GraphLink{
			Source: specs[p.a].nodeID(),
			Target: specs[p.b].nodeID(),
			Weight: round4(p.w),
		})
	}
	return links
}

// VectorGraphBySearch builds an ego vector graph seeded by a query. The top
// seedK specs by cosine similarity to the query become seed nodes; each seed is
// then one-hop expanded to its perNodeTopK nearest neighbors (cosine >=
// minWeight) among all vectored specs. repoFilter restricts the candidate set
// when non-empty.
func VectorGraphBySearch(db *sql.DB, query, repoFilter string, seedK, perNodeTopK int, minWeight float64) (NodeLinkGraph, error) {
	g := NodeLinkGraph{
		Directed:   false,
		Multigraph: false,
		Graph:      map[string]any{},
		Nodes:      []GraphNode{},
		Links:      []GraphLink{},
	}

	qv := embed.Embed(query)
	allZero := true
	for _, f := range qv {
		if f != 0 {
			allZero = false
			break
		}
	}
	if allZero {
		return g, nil
	}

	q := `SELECT s.id, s.repo, s.name, s.title, s.project, v.vec
		FROM specs s
		JOIN spec_vectors v ON v.spec_id=s.id`
	var args []any
	if repoFilter != "" {
		q += ` WHERE s.repo=?`
		args = append(args, repoFilter)
	}
	rows, err := db.Query(q, args...)
	if err != nil {
		return g, err
	}
	defer rows.Close()

	var specs []vspec
	for rows.Next() {
		var s vspec
		var blob []byte
		if err := rows.Scan(&s.id, &s.repo, &s.name, &s.title, &s.project, &blob); err != nil {
			return g, err
		}
		s.vec = embed.Decode(blob)
		specs = append(specs, s)
	}
	if err := rows.Err(); err != nil {
		return g, err
	}

	// Score every spec against the query, best first.
	type scored struct {
		idx int
		w   float64
	}
	ranked := make([]scored, len(specs))
	for i := range specs {
		ranked[i] = scored{idx: i, w: float64(embed.Cosine(qv, specs[i].vec))}
	}
	sort.Slice(ranked, func(x, y int) bool { return ranked[x].w > ranked[y].w })

	limit := seedK
	if limit > len(ranked) {
		limit = len(ranked)
	}
	seeds := make([]int, 0, limit)
	for i := 0; i < limit; i++ {
		seeds = append(seeds, ranked[i].idx)
	}

	inGraph := map[int]bool{}
	for _, si := range seeds {
		inGraph[si] = true
	}
	seenEdge := map[string]bool{}

	for _, si := range seeds {
		// Nearest neighbors of this seed among all specs, excluding itself.
		type nn struct {
			idx int
			w   float64
		}
		var nbrs []nn
		for j := range specs {
			if j == si {
				continue
			}
			w := float64(embed.Cosine(specs[si].vec, specs[j].vec))
			if w >= minWeight {
				nbrs = append(nbrs, nn{idx: j, w: w})
			}
		}
		sort.Slice(nbrs, func(x, y int) bool { return nbrs[x].w > nbrs[y].w })
		kept := nbrs
		if len(kept) > perNodeTopK {
			kept = kept[:perNodeTopK]
		}
		for _, n := range kept {
			inGraph[n.idx] = true
			// Dedup the unordered pair.
			lo, hi := si, n.idx
			if lo > hi {
				lo, hi = hi, lo
			}
			key := strconv.Itoa(lo) + "-" + strconv.Itoa(hi)
			if seenEdge[key] {
				continue
			}
			seenEdge[key] = true
			g.Links = append(g.Links, GraphLink{
				Source: specs[si].nodeID(),
				Target: specs[n.idx].nodeID(),
				Weight: round4(n.w),
			})
		}
	}

	// Emit nodes in a stable order (seeds first, then remaining, by index).
	for _, si := range seeds {
		g.Nodes = append(g.Nodes, specs[si].node())
	}
	seedSet := map[int]bool{}
	for _, si := range seeds {
		seedSet[si] = true
	}
	others := make([]int, 0)
	for idx := range inGraph {
		if !seedSet[idx] {
			others = append(others, idx)
		}
	}
	sort.Ints(others)
	for _, idx := range others {
		g.Nodes = append(g.Nodes, specs[idx].node())
	}

	return g, nil
}

// RepoHasVectors reports whether the repo has any stored spec embeddings. It
// drives `graph export --edges auto`: vector edges when true, tag edges when not.
func RepoHasVectors(db *sql.DB, repo string) (bool, error) {
	var n int
	err := db.QueryRow("SELECT COUNT(*) FROM spec_vectors WHERE repo=?", repo).Scan(&n)
	return n > 0, err
}

// RepoGraph exports every spec in repo as a rich NetworkX node-link graph. Nodes
// carry full spec identity (name/title/summary/tags/file_type/path); content is
// included only when includeContent is set. edges selects the link source:
//
//	"vector" — kNN cosine similarity over stored embeddings
//	"tags"   — Jaccard overlap of shared tags
//	"nodes"  — no links
//
// The output is import-compatible with graph.Load, so an exported repo round-trips
// through `graphs add`. Nodes are emitted in stable id order.
func RepoGraph(db *sql.DB, repo, edges string, includeContent bool, minWeight float64, perNodeTopK int) (NodeLinkGraph, error) {
	g := NodeLinkGraph{
		Directed:   false,
		Multigraph: false,
		Graph:      map[string]any{"repo": repo, "edges": edges},
		Nodes:      []GraphNode{},
		Links:      []GraphLink{},
	}

	rows, err := db.Query(`SELECT id, repo, name, title, project, path, ext, summary, tags, content
		FROM specs WHERE repo=? ORDER BY id`, repo)
	if err != nil {
		return g, err
	}
	defer rows.Close()

	// path → rowid node ID, so typed knowledge-graph links can resolve their
	// canonical endpoints onto the SAME nodes the untyped families use (one
	// node-ID namespace per export — see kgTypedLinks).
	pathToRowID := make(map[string]string)

	for rows.Next() {
		var (
			id                                                          int64
			rp, name, title, project, path, ext, summary, tags, content string
		)
		if err := rows.Scan(&id, &rp, &name, &title, &project, &path, &ext, &summary, &tags, &content); err != nil {
			return g, err
		}
		label := title
		if label == "" {
			label = name
		}
		n := GraphNode{
			ID:        strconv.FormatInt(id, 10),
			Label:     label,
			NormLabel: strings.ToLower(label),
			Repo:      rp,
			Project:   project,
			Path:      path,
			Name:      name,
			Title:     title,
			Summary:   summary,
			Tags:      splitTags(tags),
			FileType:  strings.TrimPrefix(ext, "."),
		}
		if includeContent {
			n.Content = content
		}
		g.Nodes = append(g.Nodes, n)
		pathToRowID[path] = n.ID
	}
	if err := rows.Err(); err != nil {
		return g, err
	}

	switch edges {
	case "nodes":
		// no links
	case "tags":
		g.Links = append(g.Links, tagLinks(g.Nodes, perNodeTopK)...)
	case "vector":
		vrows, err := db.Query(`SELECT s.id, v.vec FROM specs s
			JOIN spec_vectors v ON v.spec_id=s.id
			WHERE s.repo=? ORDER BY s.id`, repo)
		if err != nil {
			return g, err
		}
		defer vrows.Close()
		var vspecs []vspec
		for vrows.Next() {
			var s vspec
			var blob []byte
			if err := vrows.Scan(&s.id, &blob); err != nil {
				return g, err
			}
			s.vec = embed.Decode(blob)
			vspecs = append(vspecs, s)
		}
		if err := vrows.Err(); err != nil {
			return g, err
		}
		g.Links = append(g.Links, knnLinks(vspecs, minWeight, perNodeTopK)...)
	default:
		return g, fmt.Errorf("unknown edges mode %q (want vector|tags|nodes)", edges)
	}

	// Typed knowledge-graph links (R-5.2): appended AFTER the untyped families
	// so every pre-existing link serializes byte-identically (R-5.4), in the
	// kg_edges primary-key order (canonical-sort discipline, R-3.2). The export
	// is rebuilt from the tables on every run, so this is fully regenerated
	// derived output (R-5.3). `--edges nodes` explicitly means "no links", so
	// typed links are skipped there too. Supplementary nodes (endpoints with no
	// spec row in this repo) are appended after the spec nodes, in canonical-ID
	// order, so nodes[] stays a closed set over every link endpoint.
	if edges != "nodes" {
		typed, extra, err := kgTypedLinks(db, repo, pathToRowID)
		if err != nil {
			return g, err
		}
		g.Links = append(g.Links, typed...)
		g.Nodes = append(g.Nodes, extra...)
	}

	return g, nil
}

// kgTypedLinks returns the repo's declared typed edges as graphify-schema
// links (relation/confidence/source_file/source_location populated), plus the
// supplementary nodes needed so every link endpoint exists in nodes[].
//
// Node-ID unification (review fix): the untyped node/link families key nodes
// by spec rowid, so typed links resolve each canonical endpoint through
// kg_nodes and use the SAME rowid ID whenever the endpoint's winning
// declaration is a spec of the exported repo. Without this the export held two
// disjoint ID namespaces and NetworkX silently materialized duplicate phantom
// nodes for every typed endpoint. Endpoints resolved elsewhere — cross-repo
// definitions and 'unresolved' phantoms (R-1.5) — keep their canonical string
// ID and are emitted as supplementary GraphNodes (canonical-ID order, R-3.2).
//
// One link per declaration row — the same (src,dst,type) declared by two files
// yields two links, because provenance is per declaration (LLD). Confidence is
// 1: typed edges are deterministic frontmatter extractions, not inferred
// similarity.
func kgTypedLinks(db *sql.DB, repo string, pathToRowID map[string]string) ([]GraphLink, []GraphNode, error) {
	type kgEdgeRow struct {
		src, dst, typ, path, field string
	}
	rows, err := db.Query(`SELECT src, dst, type, path, field FROM kg_edges
		WHERE repo=? ORDER BY src, dst, type, repo, path, field`, repo)
	if err != nil {
		return nil, nil, err
	}
	var edgeRows []kgEdgeRow
	for rows.Next() {
		var e kgEdgeRow
		if err := rows.Scan(&e.src, &e.dst, &e.typ, &e.path, &e.field); err != nil {
			rows.Close()
			return nil, nil, err
		}
		edgeRows = append(edgeRows, e)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	if len(edgeRows) == 0 {
		return nil, nil, nil
	}

	// Distinct endpoints, sorted for deterministic chunking and node order.
	epSet := make(map[string]bool, len(edgeRows)*2)
	for _, e := range edgeRows {
		epSet[e.src] = true
		epSet[e.dst] = true
	}
	eps := make([]string, 0, len(epSet))
	for ep := range epSet {
		eps = append(eps, ep)
	}
	sort.Strings(eps)

	// Resolve endpoints through the resolved layer (kg_nodes), chunked to stay
	// within SQLite's variable limit.
	type kgNodeInfo struct {
		kind, nrepo, npath, title, flags string
	}
	info := make(map[string]kgNodeInfo, len(eps))
	err = chunkPaths(eps, func(chunk []string) error {
		placeholders := strings.Repeat("?,", len(chunk))
		placeholders = placeholders[:len(placeholders)-1]
		args := make([]any, 0, len(chunk))
		for _, ep := range chunk {
			args = append(args, ep)
		}
		nrows, err := db.Query(
			"SELECT id, kind, repo, path, title, flags FROM kg_nodes WHERE id IN ("+placeholders+")",
			args...)
		if err != nil {
			return err
		}
		defer nrows.Close()
		for nrows.Next() {
			var id string
			var n kgNodeInfo
			if err := nrows.Scan(&id, &n.kind, &n.nrepo, &n.npath, &n.title, &n.flags); err != nil {
				return err
			}
			info[id] = n
		}
		return nrows.Err()
	})
	if err != nil {
		return nil, nil, err
	}

	// resolveID maps a canonical endpoint onto this repo's spec rowid when its
	// winning declaration is one of the exported spec rows; otherwise the
	// canonical ID is kept and a supplementary node is required.
	resolveID := func(ep string) (string, bool) {
		if n, ok := info[ep]; ok && n.nrepo == repo {
			if rid, ok2 := pathToRowID[n.npath]; ok2 {
				return rid, true
			}
		}
		return ep, false
	}

	links := make([]GraphLink, 0, len(edgeRows))
	for _, e := range edgeRows {
		src, _ := resolveID(e.src)
		dst, _ := resolveID(e.dst)
		links = append(links, GraphLink{
			Source:         src,
			Target:         dst,
			Weight:         1,
			Relation:       e.typ,
			Confidence:     1,
			SourceFile:     e.path,
			SourceLocation: "frontmatter:" + e.field,
		})
	}

	var extra []GraphNode
	for _, ep := range eps {
		if _, mapped := resolveID(ep); mapped {
			continue
		}
		n := info[ep] // zero value when kg_nodes has no row (defensive; resolveKG guarantees one)
		label := n.title
		if label == "" {
			label = ep
		}
		extra = append(extra, GraphNode{
			ID:        ep,
			Label:     label,
			NormLabel: strings.ToLower(label),
			Repo:      n.nrepo,
			Path:      n.npath,
			Title:     n.title,
			Kind:      n.kind,
			Flags:     n.flags,
		})
	}
	return links, extra, nil
}

// tagLinks builds undirected edges between nodes that share tags, weighted by
// Jaccard overlap (|shared| / |union|), kept strongest-first within each node's
// perNodeTopK cap so heavily-tagged repos don't collapse into a hairball.
func tagLinks(nodes []GraphNode, perNodeTopK int) []GraphLink {
	sets := make([]map[string]bool, len(nodes))
	for i, n := range nodes {
		s := make(map[string]bool, len(n.Tags))
		for _, t := range n.Tags {
			if t = strings.ToLower(strings.TrimSpace(t)); t != "" {
				s[t] = true
			}
		}
		sets[i] = s
	}
	type pair struct {
		a, b int
		w    float64
	}
	var pairs []pair
	for i := 0; i < len(nodes); i++ {
		if len(sets[i]) == 0 {
			continue
		}
		for j := i + 1; j < len(nodes); j++ {
			if len(sets[j]) == 0 {
				continue
			}
			inter := 0
			for t := range sets[i] {
				if sets[j][t] {
					inter++
				}
			}
			if inter == 0 {
				continue
			}
			union := len(sets[i]) + len(sets[j]) - inter
			pairs = append(pairs, pair{a: i, b: j, w: float64(inter) / float64(union)})
		}
	}
	sort.Slice(pairs, func(x, y int) bool {
		if pairs[x].w != pairs[y].w {
			return pairs[x].w > pairs[y].w
		}
		if pairs[x].a != pairs[y].a {
			return pairs[x].a < pairs[y].a
		}
		return pairs[x].b < pairs[y].b
	})
	degree := make([]int, len(nodes))
	var links []GraphLink
	for _, p := range pairs {
		if degree[p.a] >= perNodeTopK || degree[p.b] >= perNodeTopK {
			continue
		}
		degree[p.a]++
		degree[p.b]++
		links = append(links, GraphLink{
			Source: nodes[p.a].ID,
			Target: nodes[p.b].ID,
			Weight: round4(p.w),
		})
	}
	return links
}
