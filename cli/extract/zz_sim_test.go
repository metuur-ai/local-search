package extract

import (
	"fmt"
	"os"
	"regexp"
	"strings"
	"testing"
)

// --- copy of cli/db.splitTags (index-time path that fills spec_tags) ---
func simSplitTags(tags string) []string {
	var result []string
	for _, t := range strings.Split(tags, ",") {
		if t = strings.TrimSpace(t); t != "" {
			result = append(result, t)
		}
	}
	return result
}

// --- PROPOSED FIX: unwrap a YAML flow sequence before anything is appended ---
var simFlowSeqRe = regexp.MustCompile(`^\[(.*)\]$`)

func simFixTagsLine(s string) string {
	s = strings.TrimSpace(s)
	if m := simFlowSeqRe.FindStringSubmatch(s); m != nil {
		s = m[1]
	}
	return strings.TrimSpace(s)
}

func simFixItem(t string) string {
	return strings.TrimSpace(strings.Trim(strings.TrimSpace(t), `"'`))
}

func TestSimReindex(t *testing.T) {
	for _, path := range strings.Split(os.Getenv("SIM_FILES"), "\n") {
		if path == "" {
			continue
		}
		b, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		content := string(b)
		fm := parseFrontmatter(content)

		// CURRENT
		cur := combinedTags(fm, content, path)

		// FIXED: same pipeline, but base tags line unwrapped first
		base := simFixTagsLine(legacyTagsFromRaw(fm.raw))
		refs := extractRefTags(content)
		var fixed string
		switch {
		case len(refs) == 0:
			fixed = base
		case base == "":
			fixed = strings.Join(refs, ", ")
		default:
			fixed = base + ", " + strings.Join(refs, ", ")
		}

		fmt.Printf("\n══ %s\n", path)
		fmt.Printf("specs.tags NOW   : %q\n", cur)
		fmt.Printf("specs.tags FIXED : %q\n", fixed)
		fmt.Printf("spec_tags NOW    :\n")
		for _, x := range simSplitTags(cur) {
			fmt.Printf("    %q\n", x)
		}
		fmt.Printf("spec_tags FIXED  :\n")
		for _, x := range simSplitTags(fixed) {
			fmt.Printf("    %q\n", simFixItem(x))
		}
	}
}
