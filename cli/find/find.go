// Package find implements the unified, scoped search across all three sources:
// spec FTS (via db.SearchInRepos), graphify graphs (via graph.SearchLabels),
// and code-review-graph SQLite databases (via codegraph.FindNodes).
//
// Results from each source are scored independently, normalized to [0, 1] via
// per-source min-max scaling, weighted, and merged into one ranked list. The
// merged score is comparable WITHIN a single query but not across queries —
// users tune weights to bias the merge toward whichever source they care most
// about.
package find

import (
	"database/sql"
	"math"
	"sort"
	"sync"

	localdb "local-search/db"
	"local-search/codegraph"
	"local-search/graph"
	"local-search/scope"
)

// SourceType discriminates result origins in the merged list.
type SourceType string

const (
	SourceSpec      SourceType = "spec"
	SourceGraphify  SourceType = "graphify"
	SourceCodeGraph SourceType = "codegraph"
)

// Result is one row in the merged ranked list. Score is the final post-weight
// score in [0, w] where w is the source's weight; sort by Score desc.
type Result struct {
	Score   float64    `json:"score"`
	Type    SourceType `json:"type"`
	Repo    string     `json:"repo"`
	Name    string     `json:"name"`
	Title   string     `json:"title,omitempty"`
	Path    string     `json:"path,omitempty"`
	Tags    string     `json:"tags,omitempty"`

	// Source-specific payloads. Only one is populated.
	Spec      *localdb.SearchResult `json:"spec,omitempty"`
	Graphify  *graph.LabelMatch     `json:"graphify,omitempty"`
	CodeGraph *codegraph.Node       `json:"code_node,omitempty"`

	// Blast is populated only by Context() (the agent payload), and only for
	// the top codegraph hit. nil otherwise.
	Blast []codegraph.Node `json:"blast,omitempty"`
}

// Missing names a repo we wanted to query but couldn't, with a remediation
// hint. Surfaced in the JSON payload so agents can prompt the user.
type Missing struct {
	Repo   string `json:"repo"`
	Reason string `json:"reason"`
	Fix    string `json:"fix"`
}

// Response is the full payload returned by Find / Context.
type Response struct {
	Scope       []string  `json:"scope"`
	ScopeSource string    `json:"scope_source"`
	Results     []Result  `json:"results"`
	Missing     []Missing `json:"missing,omitempty"`
}

// Inputs bundles everything Find needs. Keeping it as a struct keeps the call
// site readable when main.go assembles the args from many places.
type Inputs struct {
	Query          string
	DB             *sql.DB
	Scope          scope.Scope
	Repos          []localdb.RepoRow         // every registered repo
	ExternalGraphs []localdb.ExternalGraphRow // every registered external graph
	Limit          int                       // overall cap; 0 = 30
}

// Find runs all three source queries in parallel against the in-scope repos
// and external graphs, normalizes scores, weights them, merges, and returns
// the response.
//
// Scope entries are partitioned by prefix:
//   - "repo-name"        → repo (specs + graphify + repo's code-graph)
//   - "graph:graph-name" → external graph (codegraph only)
func Find(in Inputs) (Response, error) {
	limit := in.Limit
	if limit <= 0 {
		limit = 30
	}

	repoNames, graphNames := partitionScope(in.Scope.Repos)
	inScopeRepos := filterRepos(in.Repos, repoNames)
	inScopeGraphs := filterExternalGraphs(in.ExternalGraphs, graphNames)
	repoScope := scope.Scope{
		Repos: repoNames, Source: in.Scope.Source,
		Weights: in.Scope.Weights, Limits: in.Scope.Limits,
	}

	type partial struct {
		results []Result
		missing []Missing
		err     error
	}

	var (
		wg           sync.WaitGroup
		specsOut     partial
		graphifyOut  partial
		codegraphOut partial
	)

	wg.Add(3)
	go func() {
		defer wg.Done()
		specsOut = runSpecs(in.DB, in.Query, repoScope)
	}()
	go func() {
		defer wg.Done()
		graphifyOut = runGraphify(in.Query, in.Scope, inScopeRepos)
	}()
	go func() {
		defer wg.Done()
		codegraphOut = runCodeGraph(in.Query, in.Scope, inScopeRepos, inScopeGraphs)
	}()
	wg.Wait()

	if specsOut.err != nil {
		return Response{}, specsOut.err
	}

	merged := append(specsOut.results, graphifyOut.results...)
	merged = append(merged, codegraphOut.results...)

	sort.Slice(merged, func(i, j int) bool {
		return merged[i].Score > merged[j].Score
	})
	if len(merged) > limit {
		merged = merged[:limit]
	}

	missing := append(graphifyOut.missing, codegraphOut.missing...)

	return Response{
		Scope:       in.Scope.Repos,
		ScopeSource: in.Scope.Source,
		Results:     merged,
		Missing:     missing,
	}, nil
}

// Context wraps Find and inlines the blast radius for the highest-scoring
// codegraph result. Used by `local-search json context` so an agent gets
// specs + code + impact in one round-trip.
func Context(in Inputs) (Response, error) {
	resp, err := Find(in)
	if err != nil {
		return resp, err
	}

	for i := range resp.Results {
		r := &resp.Results[i]
		if r.Type != SourceCodeGraph || r.CodeGraph == nil {
			continue
		}
		// Find the code-graph backing this result. r.Repo is either a repo
		// name or a "graph:<name>" external-graph label; codeGraphPathFor
		// handles both.
		path, mtime, ok := codeGraphPathFor(r.Repo, in)
		if !ok {
			break
		}
		d, err := codegraph.Open(r.Repo, path, mtime)
		if err != nil || d == nil {
			break
		}
		blast, err := d.BlastRadius(r.CodeGraph.QualifiedName,
			in.Scope.Limits.BlastDepth, in.Scope.Limits.BlastCap)
		if err == nil {
			r.Blast = blast
		}
		break // only enrich the top codegraph hit
	}
	return resp, nil
}

// ── per-source runners ───────────────────────────────────────────────────────

func runSpecs(db *sql.DB, q string, sc scope.Scope) (out struct {
	results []Result
	missing []Missing
	err     error
}) {
	hits, err := localdb.SearchInRepos(db, q, sc.Repos)
	if err != nil {
		out.err = err
		return
	}
	if len(hits) > sc.Limits.Specs {
		hits = hits[:sc.Limits.Specs]
	}

	// FTS5 rank: more negative = better. Convert to "higher is better".
	scores := make([]float64, len(hits))
	for i := range hits {
		scores[i] = -hits[i].Relevance
	}
	norm := minMaxNormalize(scores)

	out.results = make([]Result, 0, len(hits))
	for i := range hits {
		h := hits[i]
		out.results = append(out.results, Result{
			Score: norm[i] * sc.Weights.Specs,
			Type:  SourceSpec,
			Repo:  h.Repo,
			Name:  h.Name,
			Title: h.Title,
			Path:  h.Path,
			Tags:  h.Tags,
			Spec:  &h,
		})
	}
	return
}

func runGraphify(q string, sc scope.Scope, repos []localdb.RepoRow) (out struct {
	results []Result
	missing []Missing
	err     error
}) {
	type rawHit struct {
		repo  string
		match graph.LabelMatch
		score float64
	}
	var raws []rawHit
	for _, r := range repos {
		if r.GraphPath == "" {
			continue
		}
		g, err := graph.Load(r.Name, r.GraphPath, r.GraphMTime)
		if err != nil || g == nil {
			out.missing = append(out.missing, Missing{
				Repo:   r.Name,
				Reason: "graphify graph unreadable",
				Fix:    "run `graphify .` in " + r.Path,
			})
			continue
		}
		nodes := g.SearchLabels(q, sc.Limits.Graphify)
		for _, n := range nodes {
			raws = append(raws, rawHit{
				repo:  r.Name,
				match: graph.LabelMatch{Repo: r.Name, Node: n, GraphPath: r.GraphPath},
				score: math.Log1p(float64(n.Degree)),
			})
		}
	}

	scores := make([]float64, len(raws))
	for i := range raws {
		scores[i] = raws[i].score
	}
	norm := minMaxNormalize(scores)

	out.results = make([]Result, 0, len(raws))
	for i := range raws {
		m := raws[i].match
		out.results = append(out.results, Result{
			Score:    norm[i] * sc.Weights.Graphify,
			Type:     SourceGraphify,
			Repo:     raws[i].repo,
			Name:     m.Node.Label,
			Graphify: &m,
		})
	}
	return
}

// codeGraphSource bundles a code-graph the runner should query, plus the
// label used to tag results. Two origins:
//   - A registered repo with code_graph_path set (label = repo name).
//   - An external graph entry (label = "graph:" + graph name).
type codeGraphSource struct {
	label    string
	path     string
	mtime    int64
	repoPath string // for MissingInstructions; empty for external graphs
}

func runCodeGraph(q string, sc scope.Scope,
	repos []localdb.RepoRow, externals []localdb.ExternalGraphRow,
) (out struct {
	results []Result
	missing []Missing
	err     error
}) {
	// Collect all code-graph sources from both origins. Repos without a
	// code-graph go straight to "missing" so the user sees the install hint;
	// external graphs always have a path (otherwise they wouldn't have been
	// registered).
	var sources []codeGraphSource
	for _, r := range repos {
		if r.CodeGraphPath == "" {
			out.missing = append(out.missing, Missing{
				Repo:   r.Name,
				Reason: "no .code-review-graph/",
				Fix:    codegraph.MissingInstructions(r.Path),
			})
			continue
		}
		sources = append(sources, codeGraphSource{
			label: r.Name, path: r.CodeGraphPath, mtime: r.CodeGraphMTime, repoPath: r.Path,
		})
	}
	for _, e := range externals {
		sources = append(sources, codeGraphSource{
			label: scope.GraphPrefix + e.Name, path: e.GraphPath, mtime: e.GraphMTime,
		})
	}

	type rawHit struct {
		label string
		node  codegraph.Node
		score float64
	}
	var raws []rawHit
	for _, src := range sources {
		d, err := codegraph.Open(src.label, src.path, src.mtime)
		if err != nil || d == nil {
			fix := "regenerate the code-graph"
			if src.repoPath != "" {
				fix = "regenerate via " + codegraph.MissingInstructions(src.repoPath)
			}
			out.missing = append(out.missing, Missing{
				Repo:   src.label,
				Reason: "code-review-graph SQLite unreadable",
				Fix:    fix,
			})
			continue
		}
		nodes, err := d.FindNodes(q, sc.Limits.CodeGraph)
		if err != nil {
			continue
		}
		for _, n := range nodes {
			deg, _ := d.OutDegreeOf(n.QualifiedName)
			raws = append(raws, rawHit{
				label: src.label,
				node:  n,
				score: math.Log1p(float64(deg)) + nameMatchBonus(q, n),
			})
		}
	}

	scores := make([]float64, len(raws))
	for i := range raws {
		scores[i] = raws[i].score
	}
	norm := minMaxNormalize(scores)

	out.results = make([]Result, 0, len(raws))
	for i := range raws {
		n := raws[i].node
		out.results = append(out.results, Result{
			Score:     norm[i] * sc.Weights.CodeGraph,
			Type:      SourceCodeGraph,
			Repo:      raws[i].label,
			Name:      n.QualifiedName,
			Title:     n.Kind + " " + n.Name,
			Path:      n.FilePath,
			CodeGraph: &n,
		})
	}
	return
}

// ── helpers ──────────────────────────────────────────────────────────────────

// minMaxNormalize scales s to [0, 1] using min-max within s. When all values
// are equal (or there's a single result), every output is 1.0 — they're all
// equally relevant within their source.
func minMaxNormalize(s []float64) []float64 {
	if len(s) == 0 {
		return nil
	}
	if len(s) == 1 {
		return []float64{1.0}
	}
	min, max := s[0], s[0]
	for _, v := range s[1:] {
		if v < min {
			min = v
		}
		if v > max {
			max = v
		}
	}
	out := make([]float64, len(s))
	rng := max - min
	if rng == 0 {
		for i := range out {
			out[i] = 1.0
		}
		return out
	}
	for i, v := range s {
		out[i] = (v - min) / rng
	}
	return out
}

// nameMatchBonus rewards exact and qualified-suffix name matches before
// normalization, so "process_payment" ranks higher than a node that merely
// contains the substring.
func nameMatchBonus(q string, n codegraph.Node) float64 {
	ql := lower(q)
	if lower(n.Name) == ql {
		return 0.5
	}
	if hasDotSuffix(lower(n.QualifiedName), ql) {
		return 0.25
	}
	return 0
}

func lower(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'A' && b[i] <= 'Z' {
			b[i] += 32
		}
	}
	return string(b)
}

func hasDotSuffix(qualifiedLower, queryLower string) bool {
	suffix := "." + queryLower
	if len(qualifiedLower) < len(suffix) {
		return false
	}
	return qualifiedLower[len(qualifiedLower)-len(suffix):] == suffix
}

// partitionScope splits a Scope.Repos list into plain repo names and
// external-graph names (without the "graph:" prefix). Order is preserved
// within each subset so iteration order remains stable.
func partitionScope(entries []string) (repos, graphs []string) {
	for _, e := range entries {
		if rest, isGraph := scope.HasGraphPrefix(e); isGraph {
			graphs = append(graphs, rest)
		} else {
			repos = append(repos, e)
		}
	}
	return
}

// filterRepos returns the subset of repos whose Name appears in keep.
// Order follows keep so the caller can rely on iteration order.
func filterRepos(repos []localdb.RepoRow, keep []string) []localdb.RepoRow {
	byName := make(map[string]localdb.RepoRow, len(repos))
	for _, r := range repos {
		byName[r.Name] = r
	}
	out := make([]localdb.RepoRow, 0, len(keep))
	for _, name := range keep {
		if r, ok := byName[name]; ok {
			out = append(out, r)
		}
	}
	return out
}

// filterExternalGraphs is the external-graph counterpart of filterRepos.
func filterExternalGraphs(graphs []localdb.ExternalGraphRow, keep []string) []localdb.ExternalGraphRow {
	byName := make(map[string]localdb.ExternalGraphRow, len(graphs))
	for _, g := range graphs {
		byName[g.Name] = g
	}
	out := make([]localdb.ExternalGraphRow, 0, len(keep))
	for _, name := range keep {
		if g, ok := byName[name]; ok {
			out = append(out, g)
		}
	}
	return out
}

// codeGraphPathFor finds the code-graph path that backed a result whose
// Repo label is `label`. Searches both repos (label = repo name) and
// external graphs (label = "graph:<name>"). Used by Context to inline the
// blast radius for the top hit.
func codeGraphPathFor(label string, in Inputs) (path string, mtime int64, ok bool) {
	if rest, isGraph := scope.HasGraphPrefix(label); isGraph {
		for _, e := range in.ExternalGraphs {
			if e.Name == rest {
				return e.GraphPath, e.GraphMTime, true
			}
		}
		return "", 0, false
	}
	for _, r := range in.Repos {
		if r.Name == label {
			return r.CodeGraphPath, r.CodeGraphMTime, r.CodeGraphPath != ""
		}
	}
	return "", 0, false
}
