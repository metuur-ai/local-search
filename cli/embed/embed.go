// Package embed provides a deterministic, pure-Go text embedder for local
// vector search. It uses feature hashing (the "hashing trick") over a
// bag-of-words: no model, no vocabulary, no training — the same text always
// maps to the same fixed-length vector. This keeps the binary CGO-free and
// dependency-free while still giving cosine similarity that clusters related
// documents.
package embed

import (
	"encoding/binary"
	"hash/fnv"
	"math"
	"strings"
	"unicode"
)

// Dim is the fixed dimensionality of every embedding vector. Feature hashing
// projects an unbounded vocabulary into exactly Dim buckets, so callers can
// store and compare vectors without knowing the token set in advance.
const Dim = 256

// Embed converts text into a deterministic, L2-normalized embedding of length
// Dim using feature hashing over a lowercased bag-of-words.
//
// Each token is hashed with FNV-1a; the low bits pick a bucket and one bit of
// the same hash picks a sign (+1 or -1). The signed increment lets some hash
// collisions cancel instead of always reinforcing, which reduces collision bias
// without needing a second hash pass.
//
// The vector is L2-normalized so that Cosine reduces to a plain dot product.
// Text with no alphanumeric tokens yields the zero vector (never a divide by
// zero). The result always has length exactly Dim.
func Embed(text string) []float32 {
	vec := make([]float32, Dim)

	// Split on any non-alphanumeric rune; letters and digits are token chars.
	tokens := strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})

	for _, tok := range tokens {
		h := fnv.New32a()
		h.Write([]byte(tok))
		sum := h.Sum32()

		bucket := sum % Dim
		// Use a higher bit of the hash for the sign so it is independent of the
		// bucket selection (which uses the low bits).
		if (sum>>16)&1 == 1 {
			vec[bucket]++
		} else {
			vec[bucket]--
		}
	}

	// L2-normalize. A zero vector (no tokens) is left as-is to avoid NaNs.
	var sumSq float64
	for _, v := range vec {
		sumSq += float64(v) * float64(v)
	}
	if sumSq > 0 {
		norm := float32(math.Sqrt(sumSq))
		for i := range vec {
			vec[i] /= norm
		}
	}

	return vec
}

// Encode serializes a vector to little-endian bytes, 4 bytes per float32, for
// compact on-disk storage. The result length is len(v)*4.
func Encode(v []float32) []byte {
	b := make([]byte, len(v)*4)
	for i, f := range v {
		binary.LittleEndian.PutUint32(b[i*4:], math.Float32bits(f))
	}
	return b
}

// Decode is the inverse of Encode, reading little-endian float32s from b. A
// trailing partial float32 (when len(b) is not a multiple of 4) is discarded.
func Decode(b []byte) []float32 {
	n := len(b) / 4
	v := make([]float32, n)
	for i := 0; i < n; i++ {
		v[i] = math.Float32frombits(binary.LittleEndian.Uint32(b[i*4:]))
	}
	return v
}

// Cosine returns the cosine similarity of a and b. Because Embed produces
// L2-normalized vectors, this is just their dot product. It returns 0 when the
// lengths differ or either vector is empty, so callers never need to guard
// mismatched inputs themselves.
func Cosine(a, b []float32) float32 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dot float32
	for i := range a {
		dot += a[i] * b[i]
	}
	return dot
}
