package main

import (
	"os"
	"path/filepath"
	"testing"
)

// mkWeb creates dir/web/server.js and, when built, web/frontend/dist/index.html.
func mkWeb(t *testing.T, dir string, built bool) string {
	t.Helper()
	web := filepath.Join(dir, "web")
	if err := os.MkdirAll(web, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(web, "server.js"), []byte("//"), 0o644); err != nil {
		t.Fatal(err)
	}
	if built {
		dist := filepath.Join(web, "frontend", "dist")
		if err := os.MkdirAll(dist, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dist, "index.html"), []byte("<html>"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return web
}

// A bare checkout under CWD (server.js but no built frontend) must not shadow
// the installed bundle that ships a prebuilt frontend — the regression behind
// the "frontend not built" report.
func TestResolveWebDir_UnbuiltCheckoutDoesNotShadowInstalled(t *testing.T) {
	t.Setenv("LOCAL_SEARCH_WEB_DIR", "")
	t.Setenv("HOME", t.TempDir()) // neutralize the real ~/.local/share candidate

	checkout := t.TempDir()
	mkWeb(t, checkout, false) // unbuilt: server.js only
	t.Chdir(checkout)

	xdg := t.TempDir()
	t.Setenv("XDG_DATA_HOME", xdg)
	installed := mkWeb(t, filepath.Join(xdg, "local-search"), true) // built

	got, err := resolveWebDir()
	if err != nil {
		t.Fatalf("resolveWebDir: %v", err)
	}
	if got != installed {
		t.Errorf("resolveWebDir = %q, want installed built copy %q", got, installed)
	}
}

// When the checkout under CWD is itself built, it stays the winner — nearest
// usable web/ still wins as long as it can actually serve.
func TestResolveWebDir_BuiltCheckoutWins(t *testing.T) {
	t.Setenv("LOCAL_SEARCH_WEB_DIR", "")
	t.Setenv("HOME", t.TempDir())

	checkout := t.TempDir()
	web := mkWeb(t, checkout, true) // built
	t.Chdir(checkout)

	xdg := t.TempDir()
	t.Setenv("XDG_DATA_HOME", xdg)
	mkWeb(t, filepath.Join(xdg, "local-search"), true)

	got, err := resolveWebDir()
	if err != nil {
		t.Fatalf("resolveWebDir: %v", err)
	}
	if got != web {
		t.Errorf("resolveWebDir = %q, want built checkout %q", got, web)
	}
}

// With no built candidate anywhere, the unbuilt checkout is still returned so
// the caller can point at a real web/ and print its build hint.
func TestResolveWebDir_FallsBackToUnbuiltWhenNoneBuilt(t *testing.T) {
	t.Setenv("LOCAL_SEARCH_WEB_DIR", "")
	t.Setenv("XDG_DATA_HOME", t.TempDir()) // empty: no installed candidate
	t.Setenv("HOME", t.TempDir())          // empty: no ~/.local/share candidate

	checkout := t.TempDir()
	web := mkWeb(t, checkout, false)
	t.Chdir(checkout)

	got, err := resolveWebDir()
	if err != nil {
		t.Fatalf("resolveWebDir: %v", err)
	}
	if got != web {
		t.Errorf("resolveWebDir = %q, want unbuilt checkout %q", got, web)
	}
}
