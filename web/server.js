import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from './backend/src/server.js';
import { createRegistry } from './backend/src/sessions.js';
import { parseReposStdout, mergeRepoRows } from './backend/src/repos.js';
import { memoizeRepos } from './backend/src/reposCache.js';
import { probeJsonContext } from './backend/src/smoke.js';
import { createCliLog, tapChild } from './backend/src/cliLog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8787;
const isProd = process.env.NODE_ENV === 'production';
const frontendDir = path.resolve(__dirname, 'frontend');
const staticDir = path.resolve(__dirname, 'frontend/dist');

// CLI interaction logging. Precedence: an explicit off (`--no-logs` or
// LOG_CLI=0) disables; otherwise `--logs`/truthy LOG_CLI enables, and dev mode
// (non-prod) enables by default. `cliLog` is module-level so runLocalSearch can
// read it; it is also threaded onto `deps` for query.js/graphSearch.js.
const truthy = (v) => v === '1' || v === 'true';
const explicitOff = process.argv.includes('--no-logs') || process.env.LOG_CLI === '0';
const explicitOn = process.argv.includes('--logs') || truthy(process.env.LOG_CLI);
const logsEnabled = !explicitOff && (explicitOn || !isProd);

function logStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

const logFile =
  process.env.LOG_FILE || path.resolve(__dirname, 'logs', `server-${logStamp()}.log`);
let cliLog = null;
if (logsEnabled) {
  cliLog = createCliLog({ file: logFile, echo: process.argv.includes('--logs') });
}

// Capture stdout/exit code of a `local-search <args>` invocation.
function runLocalSearch(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('local-search', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    if (cliLog) {
      const h = cliLog.record({ cli: 'local-search', command: 'local-search ' + args.join(' ') });
      tapChild(h, child);
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

// deps.runRepos resolves a JSON stdout string (repos.js parses it).
// Fast path: `repo list` (registered repos + graph column) and `init --json`
// (spec counts) both read the existing index WITHOUT the git incremental reindex
// that `json repos` forces on every call — the slow part users saw on each page
// load. The index stays fresh via search, not listing.
async function runRepos() {
  const listed = await runLocalSearch(['repo', 'list']);
  if (listed.code !== 0) {
    throw new Error(`local-search repo list exited ${listed.code}: ${listed.stderr.trim()}`);
  }
  // Spec counts are best-effort enrichment — an init failure must not blank the
  // list, so the repos still render (with 0 counts) from `repo list` alone.
  let initStdout = '';
  try {
    const init = await runLocalSearch(['init', '--json']);
    if (init.code === 0) initStdout = init.stdout;
  } catch {
    /* leave counts at 0 */
  }
  return JSON.stringify(mergeRepoRows(listed.stdout, initStdout));
}

const graphCacheFile = path.resolve(__dirname, 'data', 'graph.json');

const registry = createRegistry();
// Memoized: /api/repos is hit on every popover open and /api/reveal needs the
// repo roots on every click. Both would otherwise re-spawn the CLI each time.
const deps = { runRepos: memoizeRepos(runRepos) };
deps.runLocalSearch = runLocalSearch;
deps.graphCacheFile = graphCacheFile;
if (cliLog) deps.cliLog = cliLog;

// Create the http server FIRST so its instance can be handed to Vite for the
// HMR websocket, keeping the dev server and API on one port. In dev, asset
// serving is delegated to a wrapper that defers to the Vite middleware assigned
// below; in prod we pass no handler so the server uses its built-in static serve.
let assetHandler = null;
const server = createServer({
  staticDir,
  registry,
  deps,
  assetHandler: isProd ? null : (req, res) => assetHandler(req, res),
});

if (!isProd) {
  // Dev mode: mount Vite in middleware mode and let it transform index.html.
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root: frontendDir,
    appType: 'custom',
    server: { middlewareMode: true, hmr: { server } },
  });
  assetHandler = (req, res) => {
    vite.middlewares(req, res, async () => {
      try {
        // Vite's static middleware skips .html so the app controls HTML. Pick the
        // multi-page entry by path (the graph explorer vs. the SPA console), then
        // let Vite transform it (inject the client + module scripts).
        const { pathname } = new URL(req.url, 'http://localhost');
        const entry =
          pathname === '/graph-explorer.html' || pathname === '/graph-explorer'
            ? 'graph-explorer.html'
            : 'index.html';
        const html = await vite.transformIndexHtml(
          req.url,
          fs.readFileSync(path.join(frontendDir, entry), 'utf8'),
        );
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (e) {
        vite.ssrFixStacktrace?.(e);
        res.writeHead(500);
        res.end(String(e?.stack || e));
      }
    });
  };
} else {
  // Prod mode: serve pre-built assets via the server's built-in static logic.
  assetHandler = null;
  if (!fs.existsSync(path.join(staticDir, 'index.html'))) {
    console.warn(`frontend/dist not found; run \`npm run build\` before \`npm start\`.`);
  }
}

// R-5.5: at startup, probe json context against the first available repo and
// report whether provenance is available or degraded. Never fatal.
async function probeProvenance() {
  let firstRepo;
  try {
    const rows = parseReposStdout(await runRepos());
    firstRepo = rows[0]?.name || rows[0]?.repo;
  } catch (err) {
    console.warn(`provenance: could not list repos (${err.message}); provenance degraded`);
    return;
  }
  if (!firstRepo) {
    console.warn('provenance: no repos found; provenance degraded');
    return;
  }
  const result = await probeJsonContext({ run: runLocalSearch, repo: firstRepo });
  if (result.available) {
    console.log(`provenance: available (probed "${firstRepo}")`);
  } else {
    console.warn(`provenance: degraded (${result.reason})`);
  }
}

server.listen(port, () => {
  const mode = isProd ? 'production' : 'dev';
  console.log(`local-search-ui (${mode}) listening on http://localhost:${port}`);
  if (logsEnabled) {
    console.log(`CLI interaction log: ${logFile}`);
  } else {
    console.log('CLI logging disabled (enable with --logs or LOG_CLI=1)');
  }
  probeProvenance();
});
