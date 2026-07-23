# Multi-Repo Graph Export for Self-Hosted Viewer — Tasks

Source of truth: `docs/ears/graph-export-view-multi-repo.md`. Architecture: `docs/lld/…`.
All code lands in `cli/` (new `cli/graphexportview.go` + a router case in `cli/main.go`). No
schema change, no change to other commands.

## Unit 1: Command surface & routing

- [x] 1.1 Wire `export-view` into the graph router and parse its flags (est: ~25m)
  - why: Give the merge a command surface without disturbing the existing `graph` subcommands —
    the entry point every other story hangs off.
  - acceptance:
    - R-1.1 — WHEN `local-search graph export-view` runs, dispatch to `cmdGraphExportView`.
    - R-1.2 — accept `--repos`, `--all`, `--edges` (default `auto`), `--out` (default `graph.json`).
    - R-1.3 — `export-view` and its flags appear in the `graph` usage string.
    - R-1.5 — an `--edges` value outside `auto|vector|tags|nodes` exits with an error naming the set.
    - R-1.4 — no behaviour change to `graph export|tag|search|explain`.
  - verify: `go build -o /tmp/local-search .`; `/tmp/local-search graph` prints usage incl.
    `export-view`; `/tmp/local-search graph export-view --edges bogus` exits non-zero naming the
    valid values; existing graph tests still pass (`go test ./... -run Graph`).

## Unit 2: Repo selection

- [x] 2.1 Selection resolver — flags, dedup, unknown-repo, empty (deps: 1.1, est: ~30m)
  - why: Turn `--repos`/`--all` (and, later, interactive indices) into a clean, deduped,
    validated repo set — the single choke point that guarantees collision-free, non-empty input
    to the merge.
  - acceptance:
    - R-2.1 — `--all` selects every registered repo.
    - R-2.2 — `--repos a,b` selects exactly the named repos.
    - R-2.3 — an unknown name in `--repos` exits with an error listing registered repos.
    - R-2.8 — the selected set is deduped (`--repos a,a` → one `a`).
    - R-2.9 — an empty resolved selection exits with a usage/error message, writes nothing.
  - verify: `--repos <known>,<known>` → one merged file; `--repos <unknown>` → non-zero + repo
    list; `--repos a,a` → node count equals a single `a`; `--all` on an empty registry → error,
    no file written.

- [x] 2.2 Interactive TTY picker (deps: 2.1, est: ~35m)
  - why: The capability you explicitly asked for — see the registered repos with honest counts and
    multi-select in one step, instead of memorising names for `--repos`.
  - acceptance:
    - R-2.4 — no flags + interactive TTY → numbered list `N. <name> (<Count> specs)` using
      `RepoRow.Count` (NOT `GraphNodeCount`) + prompt `Include (e.g. 1,3 or all): `.
    - R-2.5 — comma indices select those positions; `all` selects every repo.
    - R-2.7 — an out-of-range or unparseable selection exits with an error (no arbitrary pick).
  - verify: run in a real terminal, confirm the list shows spec counts and `1,2` / `all` select
    correctly and `9` (out of range) errors; feed a bad index via redirected stdin in a Go
    subprocess test and assert non-zero exit + message.

- [x] 2.3 Headless guard — non-TTY never hangs (deps: 2.1, est: ~15m)
  - why: Preserve the tool's headless contract — a scripted/CI invocation with no flags must fail
    fast, never block waiting on a stdin that will never arrive.
  - acceptance:
    - R-2.6 — no flags + stdin not an interactive TTY (including `os.Stdin.Stat()` error/nil) →
      exit with usage, never read stdin.
  - verify: subprocess test — run with no repo flags and stdin from `/dev/null`; assert non-zero
    exit, usage on stderr, and prompt return (no hang).

## Unit 3: Per-repo graph construction

- [x] 3.1 Build each selected repo's graph (deps: 2.1, est: ~20m)
  - why: Each repo's subgraph must be byte-for-byte what single-repo `graph export` would produce,
    so the merged view behaves identically in the viewer.
  - acceptance:
    - R-3.1 — `--edges auto` resolves per repo to `vector` when `RepoHasVectors`, else `tags`,
      noting the choice on stderr.
    - R-3.2 — build via `RepoGraph(db, repo, edges, false, 0.3, 8)` (content off; same 0.3 / 8
      defaults as single-repo export).
    - R-3.3 — process selected repos in ascending name order.
  - verify: stderr shows one `edges=… (auto)` line per repo; per-repo node counts match a
    standalone `graph export <repo>` of the same repo.

## Unit 4: Merge & collision safety

- [x] 4.1 `mergeGraphs` — namespace, remap, concatenate (deps: 3.1, est: ~30m)
  - why: Combine the subgraphs into one file the viewer can load, without letting rowid-based node
    ids collide across repos, and without silently touching the fields the viewer colors by.
  - acceptance:
    - R-4.1 — every node id becomes `<repo>:<id>`.
    - R-4.2 — every link `source`/`target` gets the same `<repo>:` prefix as its owning repo.
    - R-4.3 — merged node/link counts equal the sums across selected repos.
    - R-4.4 — output keeps the NetworkX `{nodes, links}` shape (`id`/`source`/`target`).
    - R-4.5 — canonical nodes appearing in >1 repo stay distinct (no cross-repo merge).
    - (invariant) `path`/`type`/`repo` on each node are preserved untouched — coloring depends on
      `path` (see LLD Key Decisions).
  - verify: merged file's `len(nodes)`/`len(links)` == sum of per-repo graphs; grep confirms ids
    are `repo:`-prefixed and every link endpoint resolves to a node; a node's `path` is unchanged
    vs its single-repo export.

## Unit 5: Output & determinism

- [x] 5.1 Deterministic ordering + merged metadata (deps: 4.1, est: ~20m)
  - why: A viewer file that changes bytes on every run is un-diffable and un-cacheable; scripts/CI
    depend on stable output.
  - acceptance:
    - R-5.3 — sort nodes by `id`; sort links **stably** (`sort.SliceStable`) by `(source, target)`
      so duplicate endpoint pairs (similarity + typed-kg) keep a fixed relative order.
    - R-5.5 — set merged top-level metadata deterministically: `graph = {"repos": [sorted names]}`,
      `directed = false`, `multigraph = false`.
  - verify: inspect output — nodes ascending by id, `graph.repos` sorted, `directed`/`multigraph`
    false. (Byte-identity asserted in 5.3.)

- [x] 5.2 Write output + clean stdout summary (deps: 4.1, est: ~15m)
  - why: Produce the artifact and a human-readable summary without polluting the data stream the
    way scripts might pipe.
  - acceptance:
    - R-5.1 — write merged graph to `--out` (default `graph.json`) via `WriteJSONFile`.
    - R-5.2 — print `wrote N nodes, M links from K repo(s) → <out>` to stderr; stdout stays empty
      (no summary/prompt/list on stdout).
  - verify: `... --repos a,b --out /tmp/g.json 1>/tmp/out 2>/tmp/err`; `/tmp/out` is empty,
    `/tmp/err` has the summary, `/tmp/g.json` is valid JSON.

- [x] 5.3 Determinism golden test — byte-identical across runs (deps: 5.1, 5.2, est: ~25m)
  - why: Lock the reproducibility guarantee behind an automated gate so a future change can't
    silently reintroduce nondeterminism.
  - acceptance:
    - R-5.4 — same flags twice against an unchanged index → byte-identical files.
  - verify: Go golden test (pattern: `cli/golden_test.go`) across two fixture repos runs
    `export-view --repos … --out` twice and asserts `diff` is clean and counts equal the input
    sum; manual: `... --out /tmp/g1.json && ... --out /tmp/g2.json && diff /tmp/g1.json /tmp/g2.json`.

---

### Final verification (whole feature)

```bash
cd cli && go build -o /tmp/local-search .        # or: make build
/tmp/local-search graph export-view --repos <a>,<b> --out /tmp/graph.json
python3 -c "import json;d=json.load(open('/tmp/graph.json'));print(len(d['nodes']),'nodes',len(d['links']),'links')"
/tmp/local-search graph export-view --repos <a>,<b> --out /tmp/g2.json && diff /tmp/graph.json /tmp/g2.json && echo OK
go test ./...                                     # golden + subprocess tests green
# manual: run with no --repos in a terminal, pick "1,2"; load the file in the hosted viewer.
```

Estimated total: ~4h (excluding the manual viewer-load gate).
