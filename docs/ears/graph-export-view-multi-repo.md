# Multi-Repo Graph Export for Self-Hosted Viewer — EARS Specifications

## Unit 1: Command surface & routing

**Why:** Expose one new subcommand that composes existing per-repo export without disturbing the
current `graph export` or any other `graph` subcommand.

| ID    | EARS statement                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-1.1 | WHEN the user runs `local-search graph export-view`, THE SYSTEM SHALL dispatch to `cmdGraphExportView` from the `graph` router.                                     |
| R-1.2 | THE SYSTEM SHALL accept the flags `--repos <comma-list>`, `--all`, `--edges <auto\|vector\|tags\|nodes>` (default `auto`), and `--out <file>` (default `graph.json`). |
| R-1.3 | THE SYSTEM SHALL include `export-view` and its flags in the `graph` usage string.                                                                                   |
| R-1.4 | THE SYSTEM SHALL NOT alter the behavior of the existing `graph export`, `graph tag`, `graph search`, or `graph explain` subcommands.                                |
| R-1.5 | IF `--edges` is given a value other than `auto`, `vector`, `tags`, or `nodes`, THE SYSTEM SHALL exit with an error naming the accepted values.                       |

## Unit 2: Repo selection

**Why:** Let a human pick repos interactively while keeping the tool fully scriptable and never
hanging a non-interactive process on stdin.

| ID    | EARS statement                                                                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-2.1 | WHEN `--all` is passed, THE SYSTEM SHALL select every registered repo.                                                                                                |
| R-2.2 | WHEN `--repos a,b` is passed, THE SYSTEM SHALL select exactly the named repos.                                                                                        |
| R-2.3 | IF a name in `--repos` is not a registered repo, THE SYSTEM SHALL exit with an error listing the registered repos.                                                    |
| R-2.4 | WHERE neither `--repos` nor `--all` is passed AND stdin is an interactive TTY, THE SYSTEM SHALL print a numbered list of repos (each with its **spec count**, `RepoRow.Count`, NOT `GraphNodeCount`) and prompt `Include (e.g. 1,3 or all): `. |
| R-2.5 | WHEN the interactive user enters comma-separated 1-based indices, THE SYSTEM SHALL select the repos at those positions; WHEN the user enters `all`, THE SYSTEM SHALL select every repo. |
| R-2.6 | WHERE neither `--repos` nor `--all` is passed AND stdin is NOT an interactive TTY (including when `os.Stdin.Stat()` errors or returns nil), THE SYSTEM SHALL exit with a usage message and SHALL NOT read from stdin. |
| R-2.7 | IF an interactive selection contains an index outside the listed range or is unparseable, THE SYSTEM SHALL exit with an error rather than selecting an arbitrary repo. |
| R-2.8 | THE SYSTEM SHALL dedupe the selected repo set (whether from `--repos a,a` or interactive `1,1`) so no repo is exported more than once.                                 |
| R-2.9 | IF the resolved selection is empty (empty registry under `--all`, or an empty interactive line), THE SYSTEM SHALL exit with a usage/error message rather than writing a graph. |

## Unit 3: Per-repo graph construction

**Why:** Each selected repo's subgraph must be identical to what single-repo `graph export` would
produce, so the merged view behaves exactly like the viewer already expects.

| ID    | EARS statement                                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-3.1 | WHERE `--edges auto`, THE SYSTEM SHALL resolve edges per repo to `vector` when the repo has vectors (`RepoHasVectors`) and to `tags` otherwise, and note the resolved value on stderr. |
| R-3.2 | THE SYSTEM SHALL build each repo's graph via `RepoGraph(db, repo, edges, false, 0.3, 8)` — content excluded, `minWeight 0.3`, `perNodeTopK 8` — matching the single-repo export defaults. |
| R-3.3 | THE SYSTEM SHALL process selected repos in ascending name order.                                                                                          |

## Unit 4: Merge & collision safety

**Why:** Combine subgraphs into one file the viewer can load, without letting per-repo rowid IDs
collide.

| ID    | EARS statement                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-4.1 | THE SYSTEM SHALL prefix every node's `id` with its owning repo as `<repo>:<id>`.                                                                  |
| R-4.2 | THE SYSTEM SHALL remap every link's `source` and `target` with the same `<repo>:` prefix as the link's owning repo.                              |
| R-4.3 | THE SYSTEM SHALL emit a single `{nodes, links}` object whose node and link counts equal the sums across the selected repos' graphs.               |
| R-4.4 | THE SYSTEM SHALL keep the same NetworkX node-link shape (`nodes` / `links` with `id` / `source` / `target`) the single-repo export emits.         |
| R-4.5 | THE SYSTEM SHALL NOT merge canonical nodes that appear in more than one repo — such nodes remain distinct, namespaced by repo.                    |

## Unit 5: Output & determinism

**Why:** Produce a clean, reproducible artifact and a human-readable summary without polluting the
data stream.

| ID    | EARS statement                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-5.1 | THE SYSTEM SHALL write the merged graph to the `--out` path (default `graph.json`) via `WriteJSONFile`.                                            |
| R-5.2 | THE SYSTEM SHALL print `wrote N nodes, M links from K repo(s) → <out>` to stderr and SHALL NOT write the summary, prompt, or repo list to stdout.  |
| R-5.3 | THE SYSTEM SHALL sort merged nodes by `id`, and sort merged links **stably** by `(source, target)` over deterministic input, so that duplicate `(source, target)` pairs retain a fixed relative order. |
| R-5.4 | WHEN the command is run twice with identical flags against an unchanged index, THE SYSTEM SHALL produce byte-identical output files.               |
| R-5.5 | THE SYSTEM SHALL set the merged graph's top-level metadata deterministically — `graph = {"repos": [<selected names, sorted>]}`, `directed = false`, `multigraph = false` — rather than inheriting one arbitrary repo's metadata. |
