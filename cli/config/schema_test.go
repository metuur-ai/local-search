package config

import (
	"encoding/json"
	"sort"
	"strings"
	"testing"
)

// The published JSON Schema and the runtime key registry must describe the same
// document. They are written by hand in two places, so this test is what stops
// them drifting — an editor that validates against a stale schema is worse than
// no schema at all.
func TestSchemaMatchesKnownKeys(t *testing.T) {
	var doc map[string]any
	if err := json.Unmarshal(Schema(), &doc); err != nil {
		t.Fatalf("embedded schema is not valid JSON: %v", err)
	}

	fromSchema := map[string]bool{}
	var walk func(prefix string, node map[string]any)
	walk = func(prefix string, node map[string]any) {
		props, ok := node["properties"].(map[string]any)
		if !ok {
			return
		}
		for k, v := range props {
			path := k
			if prefix != "" {
				path = prefix + "." + k
			}
			fromSchema[path] = true
			if child, ok := v.(map[string]any); ok {
				walk(path, child)
			}
		}
	}
	walk("", doc)

	for k := range knownKeys {
		if !fromSchema[k] {
			t.Errorf("knownKeys has %q but the JSON Schema does not", k)
		}
	}
	for k := range fromSchema {
		if !knownKeys[k] {
			t.Errorf("JSON Schema has %q but knownKeys does not", k)
		}
	}
	if t.Failed() {
		t.Logf("knownKeys: %v", sorted(knownKeys))
		t.Logf("schema:    %v", sorted(fromSchema))
	}
}

// additionalProperties:false is what makes an editor flag a typo'd key, and it
// is the schema-side counterpart of the runtime key audit.
func TestSchemaForbidsAdditionalProperties(t *testing.T) {
	var doc map[string]any
	if err := json.Unmarshal(Schema(), &doc); err != nil {
		t.Fatal(err)
	}
	var check func(path string, node map[string]any)
	check = func(path string, node map[string]any) {
		props, ok := node["properties"].(map[string]any)
		if !ok {
			return
		}
		if ap, present := node["additionalProperties"]; !present || ap != false {
			name := path
			if name == "" {
				name = "(root)"
			}
			t.Errorf("%s should set additionalProperties:false", name)
		}
		for k, v := range props {
			if child, ok := v.(map[string]any); ok {
				p := k
				if path != "" {
					p = path + "." + k
				}
				check(p, child)
			}
		}
	}
	check("", doc)
}

// The modeline points editors at the schema; if the two disagree the reference
// is dead. Cheap to check, easy to get wrong in a rename.
func TestModelineMatchesSchemaID(t *testing.T) {
	var doc map[string]any
	if err := json.Unmarshal(Schema(), &doc); err != nil {
		t.Fatal(err)
	}
	id, _ := doc["$id"].(string)
	if id == "" {
		t.Fatal("schema has no $id")
	}
	if !strings.Contains(Modeline(), id) {
		t.Errorf("modeline %q does not reference the schema $id %q", Modeline(), id)
	}
}

// A fully-populated config must satisfy the schema's own type expectations.
func TestRenderedConfigMatchesSchemaShape(t *testing.T) {
	f := File{
		Repositories: []string{"a", "graph:b"},
		Weights:      &Weights{Specs: Float(1), Graphify: Float(0), CodeGraph: Float(0.8)},
		Limits: &Limits{
			Specs: Int(20), Graphify: Int(10), CodeGraph: Int(10),
			BlastDepth: Int(2), BlastCap: Int(50),
		},
	}
	out := render(f)
	got, err := Decode("rendered.yaml", out)
	if err != nil {
		t.Fatalf("render produced a config our own parser rejects: %v\n%s", err, out)
	}
	if len(got.Repositories) != 2 {
		t.Errorf("repositories = %v", got.Repositories)
	}
	if got.Weights == nil || got.Weights.Graphify == nil || *got.Weights.Graphify != 0 {
		t.Error("explicit 0 weight did not survive render→parse")
	}
}

func sorted(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
