package find

import (
	"math"
	"testing"

	"local-search/codegraph"
)

func TestMinMaxNormalize_Empty(t *testing.T) {
	if got := minMaxNormalize(nil); got != nil {
		t.Fatalf("nil input → %v, want nil", got)
	}
}

func TestMinMaxNormalize_Single(t *testing.T) {
	got := minMaxNormalize([]float64{42})
	if len(got) != 1 || got[0] != 1.0 {
		t.Fatalf("single value → %v, want [1.0]", got)
	}
}

func TestMinMaxNormalize_AllEqual(t *testing.T) {
	got := minMaxNormalize([]float64{3, 3, 3})
	for i, v := range got {
		if v != 1.0 {
			t.Errorf("index %d = %v, want 1.0 when all equal", i, v)
		}
	}
}

func TestMinMaxNormalize_Range(t *testing.T) {
	got := minMaxNormalize([]float64{0, 5, 10})
	want := []float64{0.0, 0.5, 1.0}
	for i, v := range got {
		if math.Abs(v-want[i]) > 1e-9 {
			t.Errorf("index %d = %v, want %v", i, v, want[i])
		}
	}
}

func TestMinMaxNormalize_NegativeRange(t *testing.T) {
	// FTS5 ranks are negative — this is the actual production path.
	got := minMaxNormalize([]float64{-10, -5, -1})
	want := []float64{0.0, 5.0 / 9.0, 1.0}
	for i, v := range got {
		if math.Abs(v-want[i]) > 1e-9 {
			t.Errorf("index %d = %v, want %v", i, v, want[i])
		}
	}
}

func TestNameMatchBonus_Exact(t *testing.T) {
	n := codegraph.Node{Name: "ProcessPayment", QualifiedName: "pkg.charge.ProcessPayment"}
	b := nameMatchBonus("processpayment", n)
	if b != 0.5 {
		t.Fatalf("exact (case-insensitive) name match → %v, want 0.5", b)
	}
}

func TestNameMatchBonus_QualifiedSuffix(t *testing.T) {
	n := codegraph.Node{Name: "different", QualifiedName: "pkg.charge.process_payment"}
	b := nameMatchBonus("process_payment", n)
	if b != 0.25 {
		t.Fatalf("qualified suffix match → %v, want 0.25", b)
	}
}

func TestNameMatchBonus_NoMatch(t *testing.T) {
	n := codegraph.Node{Name: "x", QualifiedName: "pkg.x"}
	if b := nameMatchBonus("y", n); b != 0 {
		t.Fatalf("no match → %v, want 0", b)
	}
}

func TestHasDotSuffix(t *testing.T) {
	cases := []struct {
		qual, q string
		want    bool
	}{
		{"pkg.charge.process_payment", "process_payment", true},
		{"pkg.charge.process_payment", "payment", false}, // no dot before
		{"process_payment", "process_payment", false},   // no dot at all
		{"a.b", "b", true},
		{"", "anything", false},
	}
	for _, c := range cases {
		got := hasDotSuffix(c.qual, c.q)
		if got != c.want {
			t.Errorf("hasDotSuffix(%q, %q) = %v, want %v", c.qual, c.q, got, c.want)
		}
	}
}

func TestPartitionScope(t *testing.T) {
	cases := []struct {
		in         []string
		wantRepos  []string
		wantGraphs []string
	}{
		{
			in:         []string{"alpha", "graph:beta", "gamma", "graph:delta"},
			wantRepos:  []string{"alpha", "gamma"},
			wantGraphs: []string{"beta", "delta"},
		},
		{
			in:         []string{"only-repo"},
			wantRepos:  []string{"only-repo"},
			wantGraphs: nil,
		},
		{
			in:         []string{"graph:only-graph"},
			wantRepos:  nil,
			wantGraphs: []string{"only-graph"},
		},
		{
			in:         nil,
			wantRepos:  nil,
			wantGraphs: nil,
		},
	}
	for _, c := range cases {
		gotRepos, gotGraphs := partitionScope(c.in)
		if !slicesEqual(gotRepos, c.wantRepos) {
			t.Errorf("partitionScope(%v) repos = %v, want %v", c.in, gotRepos, c.wantRepos)
		}
		if !slicesEqual(gotGraphs, c.wantGraphs) {
			t.Errorf("partitionScope(%v) graphs = %v, want %v", c.in, gotGraphs, c.wantGraphs)
		}
	}
}

func slicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestLower_AsciiOnly(t *testing.T) {
	cases := map[string]string{
		"":           "",
		"abc":        "abc",
		"ABC":        "abc",
		"AbCxYz":     "abcxyz",
		"Process_42": "process_42",
	}
	for in, want := range cases {
		if got := lower(in); got != want {
			t.Errorf("lower(%q) = %q, want %q", in, got, want)
		}
	}
}
