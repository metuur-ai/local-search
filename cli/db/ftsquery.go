package db

import (
	"database/sql"
	"strings"
)

// ── FTS5 query safety ──────────────────────────────────────────────────────────
//
// User input reaches SQLite through bind parameters (MATCH ?), so it can never
// alter the SQL statement — there is no SQL-injection surface here. It CAN,
// however, be rejected by FTS5's own MATCH-expression grammar: characters such
// as ':', '/', '(', ')', '?', '*', a leading '-', or an odd number of '"' are
// parsed as query operators. A doc title like
//   Research: Install / Upgrade Error Surfaces (for a trial)
// therefore makes a bare MATCH fail with a syntax error instead of searching for
// the text the user typed.

// ftsSyntaxError reports whether err is FTS5 rejecting the MATCH expression
// because of the user's text, as opposed to a genuine SQL/IO error we must
// surface. In a "… specs_fts MATCH ?" statement the schema is fixed, so a
// "no such column" error can only come from FTS5 parsing user text as a
// "column:term" filter — it is safe to treat as a query-syntax error.
func ftsSyntaxError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "fts5: syntax error") ||
		strings.Contains(msg, "unterminated string") ||
		strings.Contains(msg, "no such column:") ||
		strings.Contains(msg, "malformed match")
}

// sanitizeFTSQuery turns arbitrary user text into an FTS5 MATCH expression that
// can never raise a syntax error: each whitespace-separated token becomes a
// double-quoted literal (embedded quotes doubled) and the tokens are ANDed
// together. FTS5 operators in the original text (OR, NEAR, prefix '*') are
// treated as ordinary words. Punctuation-only input yields `""`, which matches
// nothing rather than erroring.
func sanitizeFTSQuery(raw string) string {
	fields := strings.Fields(raw)
	if len(fields) == 0 {
		return `""`
	}
	quoted := make([]string, len(fields))
	for i, f := range fields {
		quoted[i] = `"` + strings.ReplaceAll(f, `"`, `""`) + `"`
	}
	return strings.Join(quoted, " ")
}

// runFTSMatch executes an FTS5 MATCH query. args[matchIdx] must hold the MATCH
// argument (the user query). If SQLite rejects the raw text as invalid FTS5
// syntax, it retries once with sanitizeFTSQuery applied, so ordinary text with
// punctuation searches as literal terms instead of crashing. Power-user syntax
// (OR, prefix*, "phrases") keeps working whenever the raw query is valid.
func runFTSMatch(db *sql.DB, sqlText string, args []interface{}, matchIdx int) (*sql.Rows, error) {
	rows, err := db.Query(sqlText, args...)
	if ftsSyntaxError(err) {
		if raw, ok := args[matchIdx].(string); ok {
			args[matchIdx] = sanitizeFTSQuery(raw)
			rows, err = db.Query(sqlText, args...)
		}
	}
	return rows, err
}
