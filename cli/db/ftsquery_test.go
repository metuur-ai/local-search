package db

import "testing"

func TestSanitizeFTSQuery(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"", `""`},
		{"   ", `""`},
		{"?", `"?"`},
		{"install upgrade", `"install" "upgrade"`},
		{"Research: Install / Upgrade (for a tr", `"Research:" "Install" "/" "Upgrade" "(for" "a" "tr"`},
		{`say "hi"`, `"say" """hi"""`},
	}
	for _, c := range cases {
		if got := sanitizeFTSQuery(c.in); got != c.want {
			t.Errorf("sanitizeFTSQuery(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// TestSearch_SpecialCharactersNoCrash reproduces the original bug: a query
// containing FTS5 operator characters (':', '/', '(', '?', unbalanced '"')
// used to fail with an FTS5 syntax error. It must now search the text as
// literal terms without ever erroring.
func TestSearch_SpecialCharactersNoCrash(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	insertTestSpec(t, db, "repo1", "docs/a.md", "install", "Research: Install / Upgrade Error Surfaces (for a trial)")

	// Must not error, and must find the spec: every term is a full word in the
	// indexed title, so the sanitized literal AND still matches.
	mustMatch := []string{
		"Research: Install / Upgrade Error Surfaces",
		"Research: Install",
		"install upgrade?",
	}
	for _, q := range mustMatch {
		results, err := Search(db, q, "", "")
		if err != nil {
			t.Fatalf("Search(%q) errored: %v", q, err)
		}
		if len(results) == 0 {
			t.Errorf("Search(%q) returned no results, expected the indexed spec", q)
		}
	}

	// Must not error. Results are unconstrained: a truncated word ("tr" vs
	// "trial") or absent phrase legitimately matches nothing under literal AND.
	mustNotError := []string{
		"Research: Install / Upgrade Error Surfaces (for a tr",
		`un"balanced`,
		"foo-bar",
		"a/b/c:d(e)",
	}
	for _, q := range mustNotError {
		if _, err := Search(db, q, "", ""); err != nil {
			t.Fatalf("Search(%q) errored: %v", q, err)
		}
	}
}

// TestSearch_PunctuationOnlyReturnsNothing ensures a query that is only
// punctuation degrades to an empty match rather than an error.
func TestSearch_PunctuationOnlyReturnsNothing(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	insertTestSpec(t, db, "repo1", "docs/a.md", "a", "Some Title")

	results, err := Search(db, "?", "", "")
	if err != nil {
		t.Fatalf("Search(\"?\") errored: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("Search(\"?\") = %d results, want 0", len(results))
	}
}

// TestSearch_OperatorSyntaxStillWorks confirms the raw-first strategy keeps
// FTS5 power-user syntax (boolean OR) working for valid queries.
func TestSearch_OperatorSyntaxStillWorks(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	insertTestSpec(t, db, "repo1", "docs/a.md", "alpha", "Alpha Document")
	insertTestSpec(t, db, "repo1", "docs/b.md", "beta", "Beta Document")

	results, err := Search(db, "alpha OR beta", "", "")
	if err != nil {
		t.Fatalf("Search with OR errored: %v", err)
	}
	if len(results) != 2 {
		t.Errorf("Search(\"alpha OR beta\") = %d results, want 2", len(results))
	}
}
