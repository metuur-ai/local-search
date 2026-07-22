#!/usr/bin/env node
// explainable-search — global launcher for the explainable-search web server.
//
// Runs the production server (prebuilt frontend/dist, Node built-ins only) from
// any working directory. Exposed globally two ways:
//   * `npm install -g .` from web/ (this file is the package "bin"), or
//   * the `explainable-search` launcher that install.sh drops in ~/.local/bin.
//
// Override the port with PORT (default 8787). Pass --logs/--no-logs through to
// server.js as usual.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(here, '..', 'server.js');

await import(pathToFileURL(serverPath).href);
