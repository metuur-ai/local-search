// local-search ui — start/stop the local-search-ui web UI as a background
// daemon. `ui` (or `ui start`) spawns the Node backend detached, waits for it
// to become healthy, and opens the browser. `ui stop` kills it. `ui status`
// reports whether it is running.
package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const uiDefaultPort = 8787

var (
	uiPidFile = filepath.Join(appDir, "ui.pid")
	uiLogFile = filepath.Join(appDir, "ui.log")
)

// cmdUI dispatches `local-search ui [start|stop|status] [--port N]`.
func cmdUI(args []string) {
	sub := "start"
	port := uiDefaultPort
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "start", "stop", "status":
			sub = args[i]
		case "--port", "-p":
			if i+1 < len(args) {
				if p, err := strconv.Atoi(args[i+1]); err == nil {
					port = p
				}
				i++
			}
		}
	}

	switch sub {
	case "start":
		uiStart(port)
	case "stop":
		uiStop()
	case "status":
		uiStatus()
	}
}

func uiStart(port int) {
	// Already running? Just re-open the browser.
	if pid, p, ok := readUIState(); ok && processAlive(pid) {
		url := fmt.Sprintf("http://localhost:%d", p)
		fmt.Printf("UI already running (pid %d) — %s\n", pid, url)
		openBrowser(url)
		return
	}

	webDir, err := resolveWebDir()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
	backendDir := filepath.Join(webDir, "backend")
	distIndex := filepath.Join(webDir, "frontend", "dist", "index.html")

	if _, err := exec.LookPath("node"); err != nil {
		fmt.Fprintln(os.Stderr, "Error: 'node' not found on PATH. Install Node.js to run the UI.")
		os.Exit(1)
	}
	if _, err := os.Stat(distIndex); err != nil {
		fmt.Fprintf(os.Stderr, "Error: frontend not built (%s missing).\n", distIndex)
		fmt.Fprintf(os.Stderr, "Build it once with: (cd %s && npm install && npm run build)\n",
			filepath.Join(webDir, "frontend"))
		os.Exit(1)
	}

	if err := os.MkdirAll(appDir, 0o755); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
	logF, err := os.OpenFile(uiLogFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
	defer logF.Close()

	cmd := exec.Command("node", filepath.Join("bin", "serve.js"))
	cmd.Dir = backendDir
	cmd.Env = append(os.Environ(), fmt.Sprintf("PORT=%d", port))
	cmd.Stdout = logF
	cmd.Stderr = logF
	cmd.SysProcAttr = detachSysProcAttr()

	if err := cmd.Start(); err != nil {
		fmt.Fprintln(os.Stderr, "Error: failed to start UI server:", err)
		os.Exit(1)
	}
	if err := writeUIState(cmd.Process.Pid, port); err != nil {
		fmt.Fprintln(os.Stderr, "Warning: could not write pid file:", err)
	}

	url := fmt.Sprintf("http://localhost:%d", port)
	if waitForHealth(port, 6*time.Second) {
		fmt.Printf("UI started (pid %d) — %s\n", cmd.Process.Pid, url)
		openBrowser(url)
	} else {
		fmt.Printf("UI process started (pid %d) but did not become healthy within 6s.\n", cmd.Process.Pid)
		fmt.Printf("Check the log: %s\n", uiLogFile)
	}
	// Detach: let the daemon outlive this process.
	_ = cmd.Process.Release()
}

func uiStop() {
	pid, port, ok := readUIState()
	if !ok {
		fmt.Println("UI is not running.")
		return
	}
	if !processAlive(pid) {
		fmt.Printf("UI not running (stale pid %d); cleaning up.\n", pid)
		os.Remove(uiPidFile)
		return
	}
	if err := killPID(pid); err != nil {
		fmt.Fprintf(os.Stderr, "Error stopping UI (pid %d): %v\n", pid, err)
		os.Exit(1)
	}
	os.Remove(uiPidFile)
	fmt.Printf("UI stopped (pid %d, port %d).\n", pid, port)
}

func uiStatus() {
	pid, port, ok := readUIState()
	if !ok || !processAlive(pid) {
		if ok {
			os.Remove(uiPidFile)
		}
		fmt.Println("UI: stopped")
		return
	}
	fmt.Printf("UI: running (pid %d) — http://localhost:%d\n", pid, port)
}

// ── helpers ────────────────────────────────────────────────────────────────

// resolveWebDir locates the repo's web/ directory. Order: LOCAL_SEARCH_WEB_DIR
// env override, then walk up from the executable's dir and the CWD looking for
// web/backend/bin/serve.js.
func resolveWebDir() (string, error) {
	marker := filepath.Join("web", "backend", "bin", "serve.js")
	if env := os.Getenv("LOCAL_SEARCH_WEB_DIR"); env != "" {
		if _, err := os.Stat(filepath.Join(env, "backend", "bin", "serve.js")); err == nil {
			return env, nil
		}
		return "", fmt.Errorf("LOCAL_SEARCH_WEB_DIR=%s does not contain backend/bin/serve.js", env)
	}
	var starts []string
	if exe, err := os.Executable(); err == nil {
		starts = append(starts, filepath.Dir(exe))
	}
	if cwd, err := os.Getwd(); err == nil {
		starts = append(starts, cwd)
	}
	for _, s := range starts {
		if base, ok := findUpwards(s, marker); ok {
			return filepath.Join(base, "web"), nil
		}
	}
	return "", fmt.Errorf("could not locate the web/ directory. Run from inside the local-search repo, or set LOCAL_SEARCH_WEB_DIR to the path of its web/ folder")
}

// findUpwards walks up from start looking for rel; returns the directory that
// contains it.
func findUpwards(start, rel string) (string, bool) {
	dir := start
	for i := 0; i < 8; i++ {
		if _, err := os.Stat(filepath.Join(dir, rel)); err == nil {
			return dir, true
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", false
}

func writeUIState(pid, port int) error {
	return os.WriteFile(uiPidFile, []byte(fmt.Sprintf("%d\n%d\n", pid, port)), 0o644)
}

func readUIState() (pid, port int, ok bool) {
	b, err := os.ReadFile(uiPidFile)
	if err != nil {
		return 0, 0, false
	}
	fields := strings.Fields(string(b))
	if len(fields) == 0 {
		return 0, 0, false
	}
	pid, err = strconv.Atoi(fields[0])
	if err != nil {
		return 0, 0, false
	}
	port = uiDefaultPort
	if len(fields) >= 2 {
		if p, err := strconv.Atoi(fields[1]); err == nil {
			port = p
		}
	}
	return pid, port, true
}

// processAlive reports whether a process with pid exists (signal 0 probe).
func processAlive(pid int) bool {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return proc.Signal(syscall.Signal(0)) == nil
}

// waitForHealth polls GET /api/health until 200 or timeout.
func waitForHealth(port int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	url := fmt.Sprintf("http://localhost:%d/api/health", port)
	client := &http.Client{Timeout: 500 * time.Millisecond}
	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return true
			}
		}
		time.Sleep(150 * time.Millisecond)
	}
	return false
}

// openBrowser opens url with the OS default handler. Best-effort.
func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		fmt.Printf("Open %s in your browser.\n", url)
		return
	}
	_ = cmd.Process.Release()
}
