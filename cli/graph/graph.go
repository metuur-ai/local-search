// Package graph integrates with the graphify CLI (https://github.com/safishamsi/graphify).
//
// Design principle: graphify is the source of truth. local-search stores only
// pointers (graph_path, mtime, node_count) and delegates traversal to the
// graphify binary. Parsed graph data is read on demand and never persisted.
//
// Every function in this package is safe to call when graphify is not
// installed and when graph.json files are missing or malformed — failures
// degrade to "no graph available" rather than aborting the caller.
package graph

import (
	"encoding/json"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

// GraphFile is the relative path inside a repo where graphify writes its graph.
const GraphFile = "graphify-out/graph.json"

// Info is a lightweight summary of a graphify graph file.
// Path is empty when no graph exists.
type Info struct {
	Path      string // absolute path to graph.json, "" if missing
	MTime     int64  // unix timestamp, 0 if missing
	NodeCount int    // 0 if missing or unparseable
}

// Detect looks for graphify-out/graph.json under repoRoot and returns its
// metadata. Missing file is not an error — it returns a zero-value Info.
func Detect(repoRoot string) Info {
	abs := filepath.Join(repoRoot, GraphFile)
	st, err := os.Stat(abs)
	if err != nil || st.IsDir() {
		return Info{}
	}
	return Info{
		Path:      abs,
		MTime:     st.ModTime().Unix(),
		NodeCount: CountNodes(abs),
	}
}

// CountNodes parses the graph file just enough to count nodes.
// Returns 0 on any error — graph features should still work without a count.
//
// Exported so callers (e.g. `graphs add` for an arbitrary graph.json) can
// count nodes without going through Detect's directory-layout assumptions.
func CountNodes(path string) int {
	f, err := os.Open(path)
	if err != nil {
		return 0
	}
	defer f.Close()

	// Graphify exports NetworkX node-link JSON: {"nodes": [...], "links": [...]}.
	// We only need len(nodes); decode lazily to keep memory bounded.
	var shape struct {
		Nodes []json.RawMessage `json:"nodes"`
	}
	if err := json.NewDecoder(f).Decode(&shape); err != nil {
		return 0
	}
	return len(shape.Nodes)
}

// BinaryAvailable reports whether the graphify CLI is on PATH.
// Used to print accurate hints in graph-only commands.
func BinaryAvailable() bool {
	_, err := exec.LookPath("graphify")
	return err == nil
}

// ── In-memory graph (loaded on demand, cached per process) ───────────────────

// Node is a graph node with the fields local-search needs for ranking and
// label search. Other graphify fields are ignored.
type Node struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	NormLabel string `json:"norm_label"`
	Community int    `json:"community"`
	FileType  string `json:"file_type"`
	Degree    int    `json:"-"` // computed from links after load
}

// Graph is an in-memory representation of one graphify graph.json.
// Repo is the local-search repo this graph belongs to (empty for external).
type Graph struct {
	Repo  string
	Path  string
	MTime int64
	Nodes []Node

	// byNorm maps lowercased label → node index for case-insensitive lookup.
	byNorm map[string][]int
}

// LabelMatch is one node-label hit returned by SearchLabels.
type LabelMatch struct {
	Repo      string
	Node      Node
	GraphPath string
}

// graphCache is keyed by (path, mtime). A different mtime invalidates the
// previous entry — graphify writes a new file rather than rewriting in place
// for `update` runs, so mtime is a reliable cache key.
type cacheKey struct {
	path  string
	mtime int64
}

var (
	cacheMu sync.RWMutex
	cache   = map[cacheKey]*Graph{}
)

// Load parses graph.json at path and returns an in-memory Graph. The result
// is cached per-process keyed by (path, mtime); subsequent calls with the
// same args return the cached value without re-reading the file.
//
// Returns nil, nil if the file is missing — callers should treat that as
// "no graph available" and skip rather than abort.
func Load(repo, path string, mtime int64) (*Graph, error) {
	key := cacheKey{path: path, mtime: mtime}

	cacheMu.RLock()
	if g, ok := cache[key]; ok {
		cacheMu.RUnlock()
		return g, nil
	}
	cacheMu.RUnlock()

	f, err := os.Open(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var raw struct {
		Nodes []Node `json:"nodes"`
		Links []struct {
			Source string `json:"source"`
			Target string `json:"target"`
		} `json:"links"`
	}
	if err := json.NewDecoder(f).Decode(&raw); err != nil {
		return nil, err
	}

	// Compute degree from links (undirected count).
	degByID := make(map[string]int, len(raw.Nodes))
	for _, l := range raw.Links {
		degByID[l.Source]++
		degByID[l.Target]++
	}

	byNorm := make(map[string][]int, len(raw.Nodes))
	for i := range raw.Nodes {
		raw.Nodes[i].Degree = degByID[raw.Nodes[i].ID]
		norm := strings.ToLower(raw.Nodes[i].NormLabel)
		if norm == "" {
			norm = strings.ToLower(raw.Nodes[i].Label)
		}
		byNorm[norm] = append(byNorm[norm], i)
	}

	g := &Graph{
		Repo:   repo,
		Path:   path,
		MTime:  mtime,
		Nodes:  raw.Nodes,
		byNorm: byNorm,
	}

	cacheMu.Lock()
	cache[key] = g
	cacheMu.Unlock()
	return g, nil
}

// SearchLabels returns nodes whose label contains query (case-insensitive
// substring). Results are sorted by degree descending so high-centrality
// nodes appear first. limit caps the result count; pass 0 for no limit.
func (g *Graph) SearchLabels(query string, limit int) []Node {
	if g == nil || query == "" {
		return nil
	}
	needle := strings.ToLower(query)
	var hits []Node
	for i := range g.Nodes {
		hay := strings.ToLower(g.Nodes[i].NormLabel)
		if hay == "" {
			hay = strings.ToLower(g.Nodes[i].Label)
		}
		if strings.Contains(hay, needle) {
			hits = append(hits, g.Nodes[i])
		}
	}
	// Sort by degree desc — highest-centrality matches first.
	for i := 1; i < len(hits); i++ {
		for j := i; j > 0 && hits[j].Degree > hits[j-1].Degree; j-- {
			hits[j], hits[j-1] = hits[j-1], hits[j]
		}
	}
	if limit > 0 && len(hits) > limit {
		hits = hits[:limit]
	}
	return hits
}

// CentralityBoost returns a multiplier for ranking specs whose name matches
// a graph node. Returns 1.0 (no boost) when no match exists.
//
// The formula is gentle: a node with degree d contributes (1 + log(1+d)/8),
// capped at 1.5×. This keeps BM25 dominant while letting graph-central
// specs surface above near-ties.
func (g *Graph) CentralityBoost(specName string) float64 {
	if g == nil || specName == "" {
		return 1.0
	}
	idxs, ok := g.byNorm[strings.ToLower(specName)]
	if !ok || len(idxs) == 0 {
		return 1.0
	}
	maxDeg := 0
	for _, i := range idxs {
		if g.Nodes[i].Degree > maxDeg {
			maxDeg = g.Nodes[i].Degree
		}
	}
	// log1p(maxDeg) / 8, capped — degree 100 → +0.58, degree 1000 → +0.86.
	boost := 1.0 + math.Log1p(float64(maxDeg))/8.0
	if boost > 1.5 {
		boost = 1.5
	}
	return boost
}
