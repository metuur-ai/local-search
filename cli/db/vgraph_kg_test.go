// Coverage for the export node-ID namespace unification (review fix): typed
// knowledge-graph links in RepoGraph must share ONE node-ID namespace with the
// untyped families. Endpoints whose winning declaration is a spec of the
// exported repo resolve to that spec's rowid ID; everything else (cross-repo
// definitions, unresolved phantoms) keeps its canonical string ID AND gets a
// supplementary node — so nodes[] is always a closed set over link endpoints
// and NetworkX never materializes phantom duplicate nodes on import.
package db

import (
	"os"
	"path/filepath"
	"testing"
)

// vkgWrite writes a file, creating parent dirs.
func vkgWrite(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func TestRepoGraph_TypedLinksShareNodeIDNamespace(t *testing.T) {
	root := t.TempDir()
	repoX := filepath.Join(root, "repoX")
	repoY := filepath.Join(root, "repoY")

	// repoX: alpha depends on beta (in-repo), gamma (declared nowhere →
	// phantom) and delta (declared in repoY → cross-repo).
	vkgWrite(t, filepath.Join(repoX, "alpha.md"), `---
id: component://alpha
dependsOn:
  - component://beta
  - component://gamma
upstream: component://delta
---
# Alpha
`)
	vkgWrite(t, filepath.Join(repoX, "beta.md"), `---
id: component://beta
---
# Beta
`)
	vkgWrite(t, filepath.Join(repoY, "delta.md"), `---
id: component://delta
---
# Delta
`)

	dbh := openKGTestDB(t)
	if _, err := FullScan(dbh, "repoX", repoX, nil); err != nil {
		t.Fatalf("FullScan repoX: %v", err)
	}
	if _, err := FullScan(dbh, "repoY", repoY, nil); err != nil {
		t.Fatalf("FullScan repoY: %v", err)
	}

	g, err := RepoGraph(dbh, "repoX", "tags", false, 0.3, 5)
	if err != nil {
		t.Fatalf("RepoGraph: %v", err)
	}

	// Closure: every link endpoint must exist in nodes[].
	nodeByID := map[string]GraphNode{}
	for _, n := range g.Nodes {
		if _, dup := nodeByID[n.ID]; dup {
			t.Fatalf("duplicate node id %q in export", n.ID)
		}
		nodeByID[n.ID] = n
	}
	for _, l := range g.Links {
		if _, ok := nodeByID[l.Source]; !ok {
			t.Errorf("link source %q (relation %q) missing from nodes[]", l.Source, l.Relation)
		}
		if _, ok := nodeByID[l.Target]; !ok {
			t.Errorf("link target %q (relation %q) missing from nodes[]", l.Target, l.Relation)
		}
	}

	// In-repo endpoints must use the SAME rowid IDs as the spec nodes — the
	// canonical IDs of alpha and beta must NOT appear as node IDs.
	rowIDByPath := map[string]string{}
	for _, n := range g.Nodes {
		if n.Path != "" && n.Kind == "" && n.Flags == "" {
			rowIDByPath[n.Path] = n.ID
		}
	}
	alphaID, betaID := rowIDByPath["alpha.md"], rowIDByPath["beta.md"]
	if alphaID == "" || betaID == "" {
		t.Fatalf("spec nodes missing: alpha=%q beta=%q", alphaID, betaID)
	}
	for _, canonical := range []string{"component://alpha", "component://beta"} {
		if _, ok := nodeByID[canonical]; ok {
			t.Errorf("in-repo endpoint %q leaked as a duplicate canonical-ID node", canonical)
		}
	}
	foundInRepo := false
	for _, l := range g.Links {
		if l.Relation != "" && l.Source == alphaID && l.Target == betaID {
			foundInRepo = true
		}
	}
	if !foundInRepo {
		t.Errorf("no typed link %s→%s using spec rowid IDs", alphaID, betaID)
	}

	// Phantom endpoint: canonical ID kept, supplementary node flagged
	// 'unresolved' (R-1.5).
	gamma, ok := nodeByID["component://gamma"]
	if !ok {
		t.Fatal("phantom endpoint component://gamma has no supplementary node")
	}
	if gamma.Flags != "unresolved" {
		t.Errorf("phantom node flags = %q, want %q", gamma.Flags, "unresolved")
	}

	// Cross-repo endpoint: canonical ID kept, supplementary node carries the
	// defining repo's provenance.
	delta, ok := nodeByID["component://delta"]
	if !ok {
		t.Fatal("cross-repo endpoint component://delta has no supplementary node")
	}
	if delta.Repo != "repoY" || delta.Path != "delta.md" {
		t.Errorf("cross-repo node provenance = (%q,%q), want (repoY, delta.md)", delta.Repo, delta.Path)
	}

	// Typed links must point at gamma/delta by canonical ID.
	for _, want := range []string{"component://gamma", "component://delta"} {
		hit := false
		for _, l := range g.Links {
			if l.Relation != "" && l.Target == want {
				hit = true
			}
		}
		if !hit {
			t.Errorf("no typed link targeting %q", want)
		}
	}
}
