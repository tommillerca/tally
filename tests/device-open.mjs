#!/usr/bin/env node
/* OPEN THE REAL APP ON A REAL SIMULATOR, ON A CLEAN TODAY, IN ONE COMMAND.
 *
 * Tom, 2026-08-21: "Can you make the simulator test better? Like not starting at
 * on-boarding". The premise turned out to be wrong in an instructive way: it was
 * never onboarding. `?demo` has always seeded a full profile and skipped it
 * (js/app.js, `if (S.demo && !S.settings) await seedDemo()`).
 *
 * WHAT ACTUALLY BLOCKED EVERY DEVICE CHECK is that thirteen first-run sheets
 * suppress themselves under `navigator.webdriver` and nothing else. Chromium via
 * puppeteer IS webdriver, so no headless audit has ever seen one. A phone opened
 * with `xcrun simctl openurl` is NOT, so the whole queue fires: the recovery-code
 * prompt, then the drop popup, then the Live Wire intro, then the daily wheel,
 * measured three sheets deep before Today was reachable. That is why device
 * checking has always been a manual tapping exercise, and why the overscroll
 * wordmark was only ever proven on a stripped-down proxy page.
 *
 * ?calm is the device-side twin of that same switch. See CALM_BOOT in js/app.js.
 *
 * A FRESH PORT EVERY RUN, and that is not incidental. The app registers a service
 * worker, so a second run against the same port is served the FIRST run's cached
 * modules and your change appears not to have landed. This repo has lost time to
 * that before ("my change isn't showing" means suspect the service worker). A new
 * port is a new origin, which means a new SW scope, a new cache and a new
 * IndexedDB, so every run starts genuinely clean.
 *
 * Usage:
 *   node tests/device-open.mjs              serve + open on the booted simulator
 *   node tests/device-open.mjs --print      just print the URL, do not open
 *   node tests/device-open.mjs --path /#/boneyard    open straight to a screen
 *
 * Leaves the server running in the foreground; ctrl-C to stop.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const printOnly = argv.includes('--print');
const hashPath = (argv.includes('--path') ? argv[argv.indexOf('--path') + 1] : '') || '';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  /* the served tree is the repo, so refuse anything that climbs out of it */
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      /* no-store on top of the fresh port: belt and braces against a stale module */
      'cache-control': 'no-store',
    }).end(buf);
  });
});

/* port 0 = let the OS pick a free one, which is also what makes it fresh */
server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/index.html?demo&calm${hashPath ? '#' + hashPath.replace(/^#/, '') : ''}`;
  console.log(`serving ${ROOT}`);
  console.log(`URL: ${url}`);
  /* --print exits: it is for a script that wants the URL, and a listener held
     open would hang the caller. Serving only makes sense when we also opened it. */
  if (printOnly) { server.close(); return; }
  try {
    const booted = execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted']).toString();
    if (!/\(Booted\)/.test(booted)) {
      console.log('\nNo booted simulator. Boot one, then open the URL above.');
      return;
    }
    execFileSync('xcrun', ['simctl', 'openurl', 'booted', url]);
    console.log('opened on the booted simulator. ctrl-C to stop serving.');
  } catch (e) {
    console.log(`\ncould not drive simctl (${String(e.message).slice(0, 80)}). Open the URL above by hand.`);
  }
});
