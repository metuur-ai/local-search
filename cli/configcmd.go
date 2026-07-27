package main

// `local-search config` — inspect, validate, and migrate the config file.
//
// Migration also happens implicitly on the first read after upgrading, but an
// explicit command matters: it lets a user or a CI job convert deterministically
// (and see the plan first with --dry-run) instead of having files rewritten as a
// side effect of whenever someone next runs a search.

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"local-search/config"
)

const configUsage = `Usage:
  local-search config show                       Print the resolved config and where it came from
  local-search config path                       Print the config path that would be used
  local-search config validate [--global]        Strict-check the config; exit 1 on problems
  local-search config migrate [--dry-run] [--keep-toml] [--all]
                                                 Convert a pre-0.4.0 .local-search.toml
  local-search config schema [--write <path>]    Print the JSON Schema

Common flags:
  --dir <path>   Operate on a project directory other than the current one
  --json         Machine-readable output (show, validate)`

func cmdConfig(args []string) {
	if len(args) == 0 {
		fmt.Println(configUsage)
		return
	}
	sub := args[0]
	rest := args[1:]

	// Shared flags.
	var (
		dir      string
		jsonOut  bool
		global   bool
		dryRun   bool
		keepTOML bool
		all      bool
		outPath  string
	)
	for i := 0; i < len(rest); i++ {
		switch rest[i] {
		case "--dir":
			if i+1 >= len(rest) {
				die("--dir needs a path")
			}
			i++
			dir = rest[i]
		case "--write", "-o":
			if i+1 >= len(rest) {
				die("--write needs a path")
			}
			i++
			outPath = rest[i]
		case "--json":
			jsonOut = true
		case "--global":
			global = true
		case "--dry-run", "-n":
			dryRun = true
		case "--keep-toml":
			keepTOML = true
		case "--all":
			all = true
		case "-h", "--help":
			fmt.Println(configUsage)
			return
		default:
			die("unknown flag for config " + sub + ": " + rest[i] + "\n" + configUsage)
		}
	}

	if dir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			die("cannot determine current directory: " + err.Error())
		}
		dir = cwd
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		die("cannot resolve dir: " + err.Error())
	}
	home := homeDir()

	switch sub {
	case "show":
		configShow(abs, home, jsonOut)
	case "path":
		configPath(abs, home)
	case "validate":
		configValidate(abs, home, global, jsonOut)
	case "migrate":
		configMigrate(abs, home, config.MigrateOptions{DryRun: dryRun, KeepTOML: keepTOML}, all)
	case "schema":
		configSchema(outPath)
	default:
		die("Unknown config subcommand: " + sub + "\n" + configUsage)
	}
}

func configShow(dir, home string, jsonOut bool) {
	settings, err := config.FindProject(dir, home)
	if err != nil && !config.IsNotExist(err) {
		die(err.Error())
	}
	if config.IsNotExist(err) {
		settings, err = config.LoadGlobal(home)
		if err != nil && !config.IsNotExist(err) {
			die(err.Error())
		}
		if config.IsNotExist(err) {
			settings = config.Defaults()
		}
	}

	if jsonOut {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(settings); err != nil {
			die(err.Error())
		}
		return
	}

	src := settings.Path
	if src == "" {
		src = "(no config found — built-in defaults)"
	}
	fmt.Printf("Source:  %s\n", src)
	if len(settings.Repositories) == 0 {
		fmt.Println("Repos:   (none)")
	} else {
		fmt.Printf("Repos:   %v\n", settings.Repositories)
	}
	fmt.Printf("Weights: specs=%.2f graphify=%.2f codegraph=%.2f\n",
		settings.Weights.Specs, settings.Weights.Graphify, settings.Weights.CodeGraph)
	fmt.Printf("Limits:  specs=%d graphify=%d codegraph=%d blast_depth=%d blast_cap=%d\n",
		settings.Limits.Specs, settings.Limits.Graphify, settings.Limits.CodeGraph,
		settings.Limits.BlastDepth, settings.Limits.BlastCap)
}

func configPath(dir, home string) {
	if path, ok := config.FindProjectConfigPath(dir, home); ok {
		fmt.Println(path)
		return
	}
	if g := config.GlobalPath(home); g != "" {
		if _, err := os.Stat(g); err == nil {
			fmt.Println(g)
			return
		}
	}
	// Nothing exists yet — report where a new one would go.
	fmt.Println(config.ProjectPath(dir))
}

// configValidate is the non-destructive way to see a config error. It matters
// because a broken config now makes `find` refuse to run, so there has to be a
// command that reports the problem without trying to fix or overwrite anything.
func configValidate(dir, home string, global, jsonOut bool) {
	var path string
	if global {
		path = config.GlobalPath(home)
		if path == "" {
			die("no home directory")
		}
	} else {
		p, ok := config.FindProjectConfigPath(dir, home)
		if !ok {
			fmt.Printf("No config found from %s — nothing to validate.\n", dir)
			return
		}
		path = p
	}

	_, err := config.Load(path)
	switch {
	case err == nil:
		if jsonOut {
			fmt.Printf("{\n  \"path\": %q,\n  \"valid\": true\n}\n", path)
		} else {
			fmt.Printf("%s: OK\n", path)
		}
	case config.IsNotExist(err):
		fmt.Printf("%s: not found\n", path)
	default:
		if jsonOut {
			b, _ := json.MarshalIndent(map[string]any{
				"path": path, "valid": false, "error": err.Error(),
			}, "", "  ")
			fmt.Println(string(b))
		} else {
			fmt.Fprintln(os.Stderr, err.Error())
		}
		os.Exit(1)
	}
}

func configMigrate(dir, home string, opts config.MigrateOptions, all bool) {
	ran := false

	run := func(res config.MigrateResult, err error) {
		if err != nil {
			fmt.Fprintln(os.Stderr, "Error:", err)
			os.Exit(1)
		}
		if !res.Ran {
			return
		}
		ran = true
		prefix := ""
		if opts.DryRun {
			prefix = "[dry-run] "
		}
		fmt.Println(prefix + res.Summary())
	}

	if all {
		// Sweep the whole tree so a monorepo owner can migrate in one
		// reviewable commit rather than having it happen one directory at a
		// time as people run searches.
		_ = filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
			if err != nil || !d.IsDir() {
				return nil //nolint:nilerr // unreadable dirs are skipped, not fatal
			}
			switch d.Name() {
			case "node_modules", ".git", "dist", "vendor":
				return filepath.SkipDir
			}
			if _, serr := os.Stat(config.LegacyProjectPath(p)); serr == nil {
				run(config.Migrate(p, opts))
			}
			return nil
		})
	} else if d, ok := config.FindLegacy(dir, home); ok {
		run(config.Migrate(d, opts))
	}

	run(config.MigrateGlobal(home, opts))

	if !ran {
		fmt.Println("No legacy .local-search.toml found — nothing to migrate.")
	}
}

func configSchema(outPath string) {
	data := config.Schema()
	if outPath == "" {
		os.Stdout.Write(data)
		return
	}
	if err := os.WriteFile(outPath, data, 0o644); err != nil {
		die("cannot write " + outPath + ": " + err.Error())
	}
	fmt.Fprintf(os.Stderr, "wrote %s\n", outPath)
}
