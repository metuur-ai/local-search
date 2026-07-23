// Task 1.1 unit tests — canonical node identity (R-1.1) and platform-stable
// fallback identity (R-1.2).
package extract

import (
	"os"
	"path/filepath"
	"testing"
)

func writeFixture(t *testing.T, dir, rel, content string) string {
	t.Helper()
	abs := filepath.Join(dir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	return abs
}

// TestNodeIdentity_R11_SameCanonicalIDAcrossRepoFixtures: files in two
// different repo fixtures declaring the same canonical ID produce the SAME
// identity key — the global-identity precondition for the db-level merge.
func TestNodeIdentity_R11_SameCanonicalIDAcrossRepoFixtures(t *testing.T) {
	const doc = "---\nid: component://auth-service\n---\n# Auth\n"
	repoA, repoB := t.TempDir(), t.TempDir()
	absA := writeFixture(t, repoA, "auth.md", doc)
	absB := writeFixture(t, repoB, "docs/deep/auth-copy.md", doc)

	spA, err := FromFile("repo-a", repoA, absA)
	if err != nil {
		t.Fatalf("FromFile A: %v", err)
	}
	spB, err := FromFile("repo-b", repoB, absB)
	if err != nil {
		t.Fatalf("FromFile B: %v", err)
	}

	if spA.NodeID != "component://auth-service" || spA.NodeID != spB.NodeID {
		t.Errorf("identity keys differ: %q vs %q, want both component://auth-service (R-1.1)", spA.NodeID, spB.NodeID)
	}
	if spA.Kind != "component" || spB.Kind != "component" {
		t.Errorf("kinds = %q/%q, want component/component", spA.Kind, spB.Kind)
	}
}

// TestNodeIdentity_R12_WindowsSeparatorNormalized: fallback identity uses
// forward slashes on ALL platforms — a `\` from a Windows path walk must never
// leak into the identity key (the doc's path-separator case).
func TestNodeIdentity_R12_WindowsSeparatorNormalized(t *testing.T) {
	got := fallbackNodeID("repo-a", `docs\specs\auth.md`)
	want := "repo-a:docs/specs/auth.md"
	if got != want {
		t.Errorf("fallbackNodeID = %q, want %q (R-1.2)", got, want)
	}
	// Same file walked with POSIX separators yields the identical key.
	if posix := fallbackNodeID("repo-a", "docs/specs/auth.md"); posix != got {
		t.Errorf("platform-dependent identity: %q vs %q", posix, got)
	}
}

// TestNodeIdentity_R11_NonCanonicalIDFallsBack: an `id` field that is not
// canonical-URL-shaped does not become an identity; the file gets the
// `<repo>:<path>` fallback and kind "file" (R-1.1/R-1.2).
func TestNodeIdentity_R11_NonCanonicalIDFallsBack(t *testing.T) {
	repo := t.TempDir()
	abs := writeFixture(t, repo, "notes.md", "---\nid: just-a-slug\n---\nBody.\n")
	sp, err := FromFile("repo-a", repo, abs)
	if err != nil {
		t.Fatalf("FromFile: %v", err)
	}
	if sp.CanonicalID != "" {
		t.Errorf("CanonicalID = %q, want \"\" for non-canonical id field", sp.CanonicalID)
	}
	if sp.NodeID != "repo-a:notes.md" || sp.Kind != "file" {
		t.Errorf("NodeID/Kind = %q/%q, want repo-a:notes.md/file", sp.NodeID, sp.Kind)
	}
}

// TestKindOfID pins the exported scheme derivation used for phantom typing.
func TestKindOfID(t *testing.T) {
	cases := map[string]string{
		"component://auth":     "component",
		"req://checkout/r1":    "req",
		"capability://search":  "capability",
		"context://onboarding": "context",
		"repo-a:notes.md":      "",
		"free-form":            "",
	}
	for id, want := range cases {
		if got := KindOfID(id); got != want {
			t.Errorf("KindOfID(%q) = %q, want %q", id, got, want)
		}
	}
}
