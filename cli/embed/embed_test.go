package embed

import (
	"math"
	"testing"
)

// l2norm computes the Euclidean norm of a vector for assertions.
func l2norm(v []float32) float64 {
	var sumSq float64
	for _, x := range v {
		sumSq += float64(x) * float64(x)
	}
	return math.Sqrt(sumSq)
}

func TestEmbedDeterministic(t *testing.T) {
	a := Embed("payment refund")
	b := Embed("payment refund")
	if len(a) != len(b) {
		t.Fatalf("length mismatch: %d vs %d", len(a), len(b))
	}
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("non-deterministic at index %d: %v vs %v", i, a[i], b[i])
		}
	}
}

func TestEmbedLength(t *testing.T) {
	if got := len(Embed("some arbitrary text")); got != Dim {
		t.Fatalf("length = %d, want %d", got, Dim)
	}
}

func TestEmbedL2Norm(t *testing.T) {
	v := Embed("payment refund transaction failed")
	norm := l2norm(v)
	if math.Abs(norm-1.0) > 1e-5 {
		t.Fatalf("L2 norm = %v, want ~1.0", norm)
	}
}

func TestEmbedEmpty(t *testing.T) {
	for _, in := range []string{"", "   ", "\t\n  ", "!!! ??? ---"} {
		v := Embed(in)
		if len(v) != Dim {
			t.Fatalf("input %q: length = %d, want %d", in, len(v), Dim)
		}
		if norm := l2norm(v); norm != 0 {
			t.Fatalf("input %q: norm = %v, want 0", in, norm)
		}
	}
}

func TestSelfCosine(t *testing.T) {
	v := Embed("refund a duplicate charge")
	got := Cosine(v, v)
	if math.Abs(float64(got)-1.0) > 1e-5 {
		t.Fatalf("self cosine = %v, want ~1.0", got)
	}
}

func TestCosineIdenticalVsUnrelated(t *testing.T) {
	same := Cosine(Embed("payment refund"), Embed("payment refund"))
	if math.Abs(float64(same)-1.0) > 1e-5 {
		t.Fatalf("cosine of identical text = %v, want ~1.0", same)
	}

	unrelated := Cosine(
		Embed("payment refund transaction"),
		Embed("mountain hiking trail sunset"),
	)
	if unrelated >= 1.0 {
		t.Fatalf("cosine of unrelated text = %v, want < 1.0", unrelated)
	}
}

func TestEncodeDecodeRoundTrip(t *testing.T) {
	v := Embed("round trip serialization test")
	got := Decode(Encode(v))
	if len(got) != len(v) {
		t.Fatalf("length = %d, want %d", len(got), len(v))
	}
	for i := range v {
		if got[i] != v[i] {
			t.Fatalf("round-trip mismatch at %d: %v vs %v", i, got[i], v[i])
		}
	}
}

func TestEncodeLength(t *testing.T) {
	v := Embed("size check")
	if got := len(Encode(v)); got != len(v)*4 {
		t.Fatalf("encoded length = %d, want %d", got, len(v)*4)
	}
}

func TestDecodeTruncatesRemainder(t *testing.T) {
	// 9 bytes -> 2 whole float32s, trailing byte dropped.
	b := make([]byte, 9)
	if got := len(Decode(b)); got != 2 {
		t.Fatalf("decoded length = %d, want 2", got)
	}
}

func TestCosineDimMismatch(t *testing.T) {
	if got := Cosine([]float32{1, 0, 0}, []float32{1, 0}); got != 0 {
		t.Fatalf("mismatched-length cosine = %v, want 0", got)
	}
	if got := Cosine(nil, nil); got != 0 {
		t.Fatalf("empty cosine = %v, want 0", got)
	}
}
