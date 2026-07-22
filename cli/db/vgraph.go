package db

import (
	"database/sql"
	"sort"
	"strconv"

	"local-search/embed"
)

// GraphNode / GraphLink / NodeLinkGraph mirror NetworkX node-link JSON
// (the same shape graph.CountNodes/Load consume): {"nodes":[...],"links":[...]}.
type GraphNode struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Repo    string `json:"repo"`
	Project string `json:"project,omitempty"`
	Path    string `json:"path,omitempty"`
}

// GraphLink is one undirected edge with a similarity weight.
type GraphLink struct {
	Source string  `json:"source"`
	Target string  `json:"target"`
	Weight float64 `json:"weight"`
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

	// Collect all candidate pairs at/above the threshold.
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
	// Strongest first, then greedily keep edges within each node's cap.
	sort.Slice(pairs, func(x, y int) bool { return pairs[x].w > pairs[y].w })
	degree := make([]int, len(specs))
	for _, p := range pairs {
		if degree[p.a] >= perNodeTopK || degree[p.b] >= perNodeTopK {
			continue
		}
		degree[p.a]++
		degree[p.b]++
		g.Links = append(g.Links, GraphLink{
			Source: specs[p.a].nodeID(),
			Target: specs[p.b].nodeID(),
			Weight: round4(p.w),
		})
	}

	return g, nil
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
