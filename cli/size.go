// `local-search size` — how much space the index costs, on disk and per repo.
// Separates the DB *file* size (storage/copy cost, includes the FTS index and
// WAL overhead) from indexed *content* bytes (the corpus), then breaks the
// corpus down per repo (default) or per project.
package main

import (
	"encoding/json"
	"fmt"
	"os"

	localdb "local-search/db"
)

func cmdSize(args []string) {
	groupBy := "repo"
	asJSON := false
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--json":
			asJSON = true
		case "--by":
			if i+1 >= len(args) {
				die("--by needs a value: repo | project")
			}
			i++
			groupBy = args[i]
		default:
			die("Usage: local-search size [--by repo|project] [--json]")
		}
	}
	if groupBy != "repo" && groupBy != "project" {
		die("--by must be 'repo' or 'project'")
	}

	db := ensureDB()
	defer db.Close()

	report, err := localdb.Size(db, dbFile, groupBy)
	if err != nil {
		die(err.Error())
	}

	if asJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(report); err != nil {
			die(err.Error())
		}
		return
	}
	localdb.PrintSizeReport(report)
	fmt.Println()
	fmt.Println("Tip: `local-search doctor` checks index health and staleness.")
}
