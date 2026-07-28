package config

import _ "embed"

// The JSON Schema is embedded so `local-search config schema` works offline and
// always matches the running binary. schema_test.go asserts it stays in sync
// with knownKeys, so the published schema cannot drift from the Go structs.
//
//go:embed schema/local-search-config.schema.json
var schemaJSON []byte

// Schema returns the published JSON Schema for the config file.
func Schema() []byte {
	out := make([]byte, len(schemaJSON))
	copy(out, schemaJSON)
	return out
}
