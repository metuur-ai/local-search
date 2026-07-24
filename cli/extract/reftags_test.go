package extract

import (
	"strings"
	"testing"
)

func hasTag(tags, want string) bool {
	for _, t := range strings.Split(tags, ",") {
		if strings.TrimSpace(t) == want {
			return true
		}
	}
	return false
}

func TestExtractRefTags_SpecRef(t *testing.T) {
	content := "Delivery must be reliable.\n\n@spec req://payments/settlement-finality@1.0#R2\n"
	got := extractRefTags(content)
	if len(got) != 1 || got[0] != "spec:payments/settlement-finality" {
		t.Fatalf("got %v, want [spec:payments/settlement-finality]", got)
	}
}

func TestExtractRefTags_SpecProseMentionIgnored(t *testing.T) {
	// No req:// URI — must not be captured.
	for _, c := range []string{"see @spec annotations", "use @spec markers here"} {
		if got := extractRefTags(c); len(got) != 0 {
			t.Errorf("%q: expected no tags, got %v", c, got)
		}
	}
}

func TestExtractRefTags_SpecDropsVersionAndClause(t *testing.T) {
	got := extractRefTags("@spec req://identity/token-verification@2.1#R1")
	if len(got) != 1 || got[0] != "spec:identity/token-verification" {
		t.Fatalf("got %v, want [spec:identity/token-verification]", got)
	}
}

func TestExtractRefTags_Wikilink(t *testing.T) {
	got := extractRefTags("See [[Refund Policy]] and [[payments/settlement]].")
	if !contains(got, "link:refund-policy") || !contains(got, "link:payments-settlement") {
		t.Fatalf("got %v, want refund-policy + payments-settlement", got)
	}
}

func TestExtractRefTags_WikilinkAliasAndHeading(t *testing.T) {
	// target#heading|alias → tag from target only.
	got := extractRefTags("[[Onboarding#step-2|the second step]]")
	if len(got) != 1 || got[0] != "link:onboarding" {
		t.Fatalf("got %v, want [link:onboarding]", got)
	}
}

func TestExtractRefTags_GraphifyNavLinksSkipped(t *testing.T) {
	// graphify's GRAPH_REPORT.md "Community Hubs" nav links must not become tags —
	// they slugify to noise like `link:community-community-12`. Real wikilinks in
	// the same doc still count.
	content := "## Community Hubs (Navigation)\n" +
		"- [[_COMMUNITY_Community 0|Community 0]]\n" +
		"- [[_COMMUNITY_Community 12|Community 12]]\n\n" +
		"See also [[Refund Policy]].\n"
	got := extractRefTags(content)
	for _, bad := range got {
		if strings.HasPrefix(bad, "link:community-community") {
			t.Fatalf("graphify nav link leaked as tag: %v", got)
		}
	}
	if !contains(got, "link:refund-policy") {
		t.Fatalf("real wikilink dropped: %v", got)
	}
}

func TestExtractRefTags_ShellTestNotAWikilink(t *testing.T) {
	// A bash code fence with shell [[ … ]] must not yield link: tags.
	content := "Install:\n\n```bash\nif [[ -d \"$dir\" ]]; then echo hi; fi\n[[ -f \"$p\" ]] && run\n```\n"
	if got := extractRefTags(content); len(got) != 0 {
		t.Fatalf("shell tests leaked as tags: %v", got)
	}
}

func TestExtractRefTags_FencedSpecExampleStripped(t *testing.T) {
	// A format example inside a code fence should not be indexed as a real ref.
	content := "Format:\n\n```\n@spec req://example/only@1.0#R1\n```\n\nReal: @spec req://real/one@1.0#R1\n"
	got := extractRefTags(content)
	if contains(got, "spec:example/only") {
		t.Errorf("fenced example should be stripped: %v", got)
	}
	if !contains(got, "spec:real/one") {
		t.Errorf("prose ref should survive: %v", got)
	}
}

func TestExtractRefTags_PlaceholderRejected(t *testing.T) {
	// Doc format-description with placeholders must not become a tag.
	for _, c := range []string{
		"marker `@spec req://.../<id>@<version>#<clause>`",
		"@spec req://<path>/<id>@1.0#R1",
	} {
		if got := extractRefTags(c); len(got) != 0 {
			t.Errorf("%q: expected no tags, got %v", c, got)
		}
	}
}

func TestExtractRefTags_Dedup(t *testing.T) {
	content := "[[Refund Policy]] again [[refund policy]] and @spec req://a/b@1#R1 @spec req://a/b@2#R2"
	got := extractRefTags(content)
	if count(got, "link:refund-policy") != 1 || count(got, "spec:a/b") != 1 {
		t.Fatalf("expected dedup, got %v", got)
	}
}

func TestCombinedTags_MergesFrontmatterAndRefs(t *testing.T) {
	content := "---\ntags: go, http\n---\n# Title\n\n@spec req://payments/refund@1.0#R1 and [[Chargeback]]\n"
	tags := combinedTags(parseFrontmatter(content), content)
	for _, want := range []string{"go", "http", "spec:payments/refund", "link:chargeback"} {
		if !hasTag(tags, want) {
			t.Errorf("combined tags %q missing %q", tags, want)
		}
	}
}

func TestCombinedTags_NoRefsUnchanged(t *testing.T) {
	// Preserves existing behaviour byte-for-byte when there are no body refs.
	content := "---\ntags: alpha, beta\n---\n# T\n\nplain body\n"
	if got, want := combinedTags(parseFrontmatter(content), content), "alpha, beta"; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func contains(xs []string, v string) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}

func count(xs []string, v string) int {
	n := 0
	for _, x := range xs {
		if x == v {
			n++
		}
	}
	return n
}
