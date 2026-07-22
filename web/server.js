import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from './backend/src/server.js';
import { createRegistry } from './backend/src/sessions.js';
import { parseReposStdout } from './backend/src/repos.js';
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

// deps.runRepos resolves the raw stdout string (repos.js parses it).
async function runRepos() {
  const { stdout, stderr, code } = await runLocalSearch(['json', 'repos']);
  if (code !== 0) {
    throw new Error(`local-search json repos exited ${code}: ${stderr.trim()}`);
  }
  return stdout;
}

const registry = createRegistry();
const deps = { runRepos };
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
        const html = await vite.transformIndexHtml(
          req.url,
          fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8'),
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
  console.log(`explainable-search (${mode}) listening on http://localhost:${port}`);
  if (logsEnabled) {
    console.log(`CLI interaction log: ${logFile}`);
  } else {
    console.log('CLI logging disabled (enable with --logs or LOG_CLI=1)');
  }
  probeProvenance();
});
