/* THE UPGRADE PATH: what a returning player actually gets when a release lands.
 *
 * WHY THIS EXISTS. Every fix in this repo reaches a player through exactly one
 * road: a new sw.js VERSION, a new index.html, new modules, new CSS. Nothing had
 * ever driven that road. Several branches shipped with the same footnote,
 * "index.html is precached under tally-vNNN, so existing installs keep the old
 * shell until a release bumps VERSION", and nobody had measured whether that
 * sentence is true. It is not (see WHAT IT MEASURED below), and the reason it is
 * not is one branch in the fetch handler that a future edit could take away in a
 * line, on a path that is only exercised on release day.
 *
 * WHAT IT DOES. It serves this checkout TWICE from one tree, through a server
 * that can hand out version A or version B of the same files:
 *     A  = the tree as it is
 *     B  = the tree with sw.js VERSION bumped, plus a marker changed in
 *          index.html AND in js/app.js AND in app.css
 * so every sample says which of the three layers is new and which is stale. A
 * PARTIAL update is the failure worth hunting: a new shell running old modules
 * (or the reverse) is the state that produces errors nobody can reproduce.
 *
 * It installs the worker on A, lets it take control, then flips the server to B
 * WITHOUT clearing anything, and measures what the player gets on:
 *     RETURN VISIT, RELOAD, VISIBILITYCHANGE, and the Progress UPDATE BANNER.
 *
 * IT MUST BE HTTPS. js/app.js registers the worker only when
 * `location.protocol === 'https:'` and there is no ?demo, so on a plain
 * http://127.0.0.1 tree the app never registers anything and none of the app's
 * OWN update machinery exists: no reg.update() on visibilitychange, no
 * controllerchange reload. An audit on http would have graded a page with no
 * update machinery on it at all. So this serves real TLS with a throwaway
 * self-signed cert and gives Chrome --ignore-certificate-errors, which makes the
 * origin a secure context: measured, the app registers sw.js itself, exactly as
 * it does on the live site. No ?demo either, for the same reason, so the run
 * clicks through the real onboarding first.
 *
 * WHAT IT MEASURED, 2026-08-17, against af88c60 (tally-v387). Everything below
 * is an assertion in this file, not a note:
 *
 *   GREEN. index.html DOES update in place, on the FIRST PAINT of the next
 *   visit, with no VERSION bump on the device and nothing cleared. Navigations
 *   are network-first (sw.js:168 counts request.mode === 'navigate' as shell),
 *   so the precache is the offline fallback and not the thing a player is
 *   served. The footnote "existing installs keep the old shell until a release
 *   bumps VERSION" is false for every online path measured here.
 *   GREEN. Return visit, reload, visibilitychange and the Progress banner all
 *   land the player on the new build in all three layers, the new worker takes
 *   charge, and exactly one tally-v* cache survives: activate really does
 *   delete the old one.
 *
 *   RED, and these are the findings. Both are pre-existing and neither is
 *   caused by anything on this branch:
 *   1. sw.js:174 treats a NON-OK response as the answer. Only a THROWN fetch
 *      reaches the .catch that consults the cache, so a 404 or a 5xx for a
 *      module is handed straight to the module loader while a good cached copy
 *      of that same file sits one line away. Measured with one PRECACHE entry
 *      404ing: the returning player gets the new index.html and the new CSS and
 *      NO app.js at all, #screen 0 children, a dead shell. The same device with the
 *      network fully removed boots
 *      FINE, because only that path reads the cache.
 *   2. app.js:519-520 tells the player "Update ready. Leave this screen to
 *      apply" and then nothing applies it. Closing the sheet reloads nothing;
 *      measured at 0 document loads, still running the old build, while the new
 *      worker is already in charge underneath and its cache already holds the
 *      new files. The player is left running old modules against a new cache
 *      until they next navigate.
 *
 * WHAT CHANGED IN v427, AND WHY THE OLD ROWS ARE GONE.
 *
 * This file used to assert the OPPOSITE of what it asserts now, and that is
 * deliberate rather than a rot. Its central row was "the visit the release
 * lands on is served the new build IMMEDIATELY, not after a self-reload",
 * which is the network-first contract: every html, js, css and json file
 * fetched from the real network on every open. Tom, item 18 of
 * docs/FEEDBACK-2026-08-22-v424.md: "The app is very sluggish on a bad
 * connection like verrrrry sluggish". That row WAS the sluggishness, and it
 * also bought the surprise full reload (a new worker skipWaiting()s underneath
 * a running page, controllerchange fires, app.js reloads).
 *
 * So the contract is now ATOMIC rather than immediate, and the rows below say
 * so out loud because a future reader will otherwise "fix" the app to match the
 * old ones (memory: a guard can encode a superseded instruction, and one did,
 * for three rounds):
 *
 *   SAFETY, on every scenario. The three layers are always ONE build and the
 *   app is always alive. A player is never served a new shell over old modules,
 *   which is the failure that produces bugs nobody can reproduce. This half is
 *   unchanged and it is what network-first was really protecting.
 *
 *   LIVENESS, on SECOND OPEN. The release still arrives, it just arrives on the
 *   NEXT open rather than this one: the visit it lands on is served the whole
 *   old build instantly out of cache while the new one downloads in the
 *   background, and the swap happens when the last client of the old worker
 *   goes away. Being stranded on old forever is the failure that matters here,
 *   and SECOND OPEN is the row that catches it.
 *
 *   SPEED, on THROTTLED BOOT. The reason for all of it, measured rather than
 *   asserted from the shape of the code.
 *
 *   THE KILLSWITCH, on KILLSWITCH. Everything above is cache-first, so if that
 *   machinery is ever wrong there is no lever left: a bad worker is the one bug
 *   that survives its own fix being deployed, because the broken worker decides
 *   whether the fix is ever fetched. version.json is carved permanently out of
 *   the caching, and this row proves it really does reach the network and
 *   really does pull a new worker with no help from the page.
 *
 * PROVE-RED (each names a different assertion, each read as an exit code):
 *   --prove-red=network-first  put the defect back: the shell branch never
 *                             consults the cache. THROTTLED BOOT goes red. This
 *                             is the falsification of the whole performance
 *                             claim, so if this one does not go red, nothing
 *                             here is evidence of anything.
 *   --prove-red=stranded      activate stops deleting old caches AND the shell
 *                             lookup drops its { cacheName: VERSION } scope, so
 *                             caches.match finds the OLDEST cache first. The new
 *                             worker activates and the player is served the old
 *                             build anyway, for ever. SECOND OPEN goes red.
 *   --prove-red=mixed         cache-first for subresources, network for the
 *                             navigation. New index.html, old modules: the
 *                             mixed-version module graph. The PARTIAL rows go
 *                             red.
 *   --prove-red=killswitch-ignored  checkStamp() returns immediately, so
 *                             version.json is never fetched. KILLSWITCH goes
 *                             red.
 *   --prove-red=stale-version B changes the files but does NOT bump VERSION.
 *                             Online, nothing breaks, which is itself the
 *                             finding. What goes red is the OFFLINE copy at the
 *                             explicit /index.html url: that cache key is only
 *                             ever rewritten by a fresh install, so it holds the
 *                             old shell beside the new modules.
 *   --prove-red=404           one PRECACHE entry 404s in B. The install throws,
 *                             READY is never written, and the old worker stays
 *                             in charge serving its own whole build.
 * Nothing in the repo is edited by any of these: the transform is applied to the
 * bytes on their way out of the server.
 *
 * Usage: node tests/sw-upgrade-audit.mjs [--prove-red=...] [--only=NAME]
 * It always serves this checkout (it has to own both versions of it), so it
 * takes no base URL.
 */
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, chromePath, sandboxArgs, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argOf = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=');
const PROVE = argOf('prove-red') || '';
const ONLY = argOf('only') || '';
/* 2026-08-23. The three at the front are named in Tom's own brief for the
   atomic-shell branch: "You must EXTEND tests/sw-upgrade-audit.mjs to go red on:
   stranded-on-old, a mixed-version module graph, and killswitch-ignored", with
   the ship gate attached to them ("if you cannot make that audit go RED against
   a deliberately broken service worker, the change does not ship"). The list
   grew a fourth, network-first, because that one is the falsification of the
   PERFORMANCE claim rather than of a safety claim, and without it the 84ms this
   file prints is a number with nothing to be compared against. `cache-first` was
   REMOVED on the same date: it used to restore the pre-v197 shape as a defect,
   and cache-first is now the shipped design, so keeping it would have pinned a
   superseded instruction. Source: docs/FEEDBACK-2026-08-22-v424.md item 18. */
const MODES = ['network-first', 'stranded', 'mixed', 'killswitch-ignored', 'stale-version', '404'];
if (PROVE && !MODES.includes(PROVE)) {
  console.log(`FAIL  SETUP unknown --prove-red=${PROVE} (${MODES.join(' | ')})`);
  process.exit(1);
}

const fails = [];
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) fails.push(name);
};

/* ---- the two versions, made out of one tree -------------------------------
   ONE marker token in all three layers so a cached response can be graded with
   one regex no matter which layer it came from. The A transform is applied too,
   so A and B differ by the marker and by nothing else: a difference that only
   exists in B would let a transform bug read as an upgrade. */
const swVersion = src => (src.match(/tally-v(\d+)/) || [])[1];
const APP_UPDATE_ANCHOR = 'if (!document.hidden) reg.update().catch(() => {});';
let NO_APP_UPDATE = false;

function transform(rel, buf, mode) {
  const v = mode === 'A' ? 'A' : 'B';
  const bump = mode === 'B' && PROVE !== 'stale-version';
  let s;
  switch (rel) {
    case 'index.html':
      s = buf.toString();
      return s.replace('<head>', `<head><meta name="tally-upgrade-marker" content="${v}"><!--TALLY_UPGRADE_MARKER:${v}-->`);
    case 'app.css':
      return buf.toString() + `\n:root{--tally-upgrade-marker:"${v}"}/*TALLY_UPGRADE_MARKER:${v}*/\n`;
    case 'js/app.js':
      s = buf.toString();
      if (bump) s = s.replace(/const APP_BUILD = 'v(\d+)'/, (m, n) => `const APP_BUILD = 'v${+n + 1}'`);
      /* THE KILLSWITCH ROW HAS TO BE ABOUT THE WORKER, NOT ABOUT THE PAGE.
         js/app.js already calls reg.update() on every visibilitychange, and it
         would find the new build on its own, so a KILLSWITCH row run against
         the untouched app would go green whether or not sw.js ever looked at
         version.json. The whole point of the stamp is the player stranded on a
         build whose app.js is NOT doing that (broken, or simply older than the
         line). This takes that line away for that one scenario, so the only
         thing left that can pull a new worker is the worker itself.
         Set per-scenario, and the scenario FAILS if the strip did not land. */
      if (NO_APP_UPDATE) s = s.replace(APP_UPDATE_ANCHOR, 'if (!document.hidden) void 0;');
      /* appended, so it runs after the module body: window is the only place a
         module-scope const can be read from outside, and the RUNNING value is
         the whole question. Identical in both versions apart from the letter. */
      return s + `\ntry { window.__tallyLayerJs = '${v}'; window.__tallyBuild = APP_BUILD; } catch (e) {}\n/*TALLY_UPGRADE_MARKER:${v}*/\n`;
    /* THE KILLSWITCH STAMP IS A REAL FILE AND HAS TO MOVE WITH THE BUILD.
       Left at A's number in version B, every device would call registration
       .update() once a minute for ever, and the KILLSWITCH row would pass on a
       permanent alarm rather than on a real one. */
    case 'version.json':
      s = buf.toString();
      return bump ? s.replace(/tally-v(\d+)/, (m, n) => `tally-v${+n + 1}`) : s;
    case 'sw.js':
      s = buf.toString();
      if (bump) s = s.replace(/tally-v(\d+)/g, (m, n) => `tally-v${+n + 1}`);
      /* Each mutation is applied to BOTH versions, because a regression that
         only appeared in the new worker could not affect the old one, and the
         old one is what serves the visit a release lands on. */
      if (PROVE === 'network-first') {
        // the defect this branch removed: the shell branch never reads the cache
        s = s.replace(SW_ANCHORS.gate, '    if (false) {');
      }
      if (PROVE === 'stranded') {
        // old caches survive, and an unscoped caches.match finds the OLDEST first
        s = s.replace(SW_ANCHORS.scoped,
          "      const hit = await caches.match(nav ? './index.html' : req.url);");
        s = s.replace(SW_ANCHORS.sweep,
          '      .then(keys => Promise.all(keys.filter(k => false).map(k => caches.delete(k))))');
      }
      if (PROVE === 'mixed') {
        // subresources from cache, the navigation from the network: new shell, old modules
        s = s.replace(SW_ANCHORS.gate, '    if (!nav && PRECACHED.has(req.url) && await shellReady()) {');
      }
      if (PROVE === 'killswitch-ignored') {
        s = s.replace(SW_ANCHORS.throttle, '  if (true) return;');
      }
      return s;
    default:
      return buf;
  }
}

/* THE FOUR LINES EVERY sw.js MUTATION ABOVE AIMS AT, named once so a prove-red
   that has drifted off its target is caught by the SETUP check below rather
   than passing as a green that proved nothing. */
const SW_ANCHORS = {
  gate:     '    if ((nav || PRECACHED.has(req.url)) && await shellReady()) {',
  scoped:   "      const hit = await caches.match(nav ? './index.html' : req.url, { cacheName: VERSION });",
  sweep:    '      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))',
  throttle: '  if (Date.now() - stampAt < 60000) return;',
};

/* ---- a self-signed cert, because the app's registration is gated on https --- */
function certs() {
  const dir = path.join(os.tmpdir(), 'tally-sw-upgrade-cert');
  const key = path.join(dir, 'key.pem'), crt = path.join(dir, 'cert.pem');
  const fresh = fs.existsSync(crt) && (Date.now() - fs.statSync(crt).mtimeMs) < 12 * 3600e3;
  if (!fresh) {
    fs.mkdirSync(dir, { recursive: true });
    try {
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', key, '-out', crt,
        '-days', '2', '-nodes', '-subj', '/CN=tally.test',
        '-addext', 'subjectAltName=DNS:tally.test,IP:127.0.0.1'], { stdio: 'ignore' });
    } catch (e) {
      throw new Error('openssl is not available, so no https origin can be made, so the app will never '
        + "register its own service worker (js/app.js gates on location.protocol === 'https:').\n"
        + '  This is a SETUP failure: nothing about the upgrade path has been checked.');
    }
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(crt) };
}

/* ---- the versioned server -------------------------------------------------- */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

async function serveVersioned() {
  const port = await new Promise(r => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); });
  });
  const state = { mode: 'A', broken: null, blackhole: false, hits: {}, throttle: null };
  const srv = https.createServer(certs(), (req, res) => {
    /* A REAL network failure, not page.setOfflineMode. Every shell request on a
       controlled page is issued by the WORKER in its own target, and
       setOfflineMode is page-level emulation the worker walks straight past
       (offline-boot-audit measured exactly that). Destroying the socket is
       refused for every target at once, with no emulation semantics to argue
       about, and it is what makes sw.js's .catch fall back to the cache. */
    if (state.blackhole) { req.socket.destroy(); return; }
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'https://x').pathname); } catch { res.writeHead(400); return res.end(); }
    if (p.endsWith('/')) p += 'index.html';
    const rel = p.replace(/^\/+/, '');
    const full = path.resolve(ROOT, rel);
    if (state.broken && state.mode === 'B' && rel === state.broken) { res.writeHead(404); return res.end('deliberately missing'); }
    if (!full.startsWith(ROOT + path.sep) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); return res.end('not here'); }
    state.hits[rel] = (state.hits[rel] || 0) + 1;
    const body = Buffer.from(transform(rel, fs.readFileSync(full), state.mode));
    const send = () => {
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream',
        /* no-cache everywhere so the browser HTTP cache is not a second variable:
           this audit is about the SERVICE WORKER's delivery, and the shell handler
           already forces revalidation for its own fetches. */
        'Cache-Control': 'no-cache',
      });
      if (!state.throttle) return res.end(body);
      const { rate } = state.throttle;
      let i = 0;
      const pump = () => {
        if (res.writableEnded) return;
        if (i >= body.length) return res.end();
        const end = Math.min(i + 8192, body.length);
        res.write(body.subarray(i, end));
        const ms = ((end - i) / rate) * 1000;
        i = end;
        setTimeout(pump, ms);
      };
      pump();
    };
    if (state.throttle) setTimeout(send, state.throttle.latency); else send();
  });
  await new Promise(r => srv.listen(port, '127.0.0.1', r));
  return {
    url: `https://tally.test:${port}/`,
    setMode: m => { state.mode = m; },
    setBroken: rel => { state.broken = rel; },
    setBlackhole: v => { state.blackhole = v; },
    /* HITS ARE THE ONLY HONEST ANSWER TO "does it go to the network". Asking the
       page, or reading the worker's caches, both grade something downstream of
       the question; the server either got the request or it did not. */
    hits: rel => state.hits[rel] || 0,
    resetHits: () => { state.hits = {}; },
    /* THE THROTTLE IS IN THE SERVER, NOT IN CDP, AND THAT IS NOT A DETAIL.
       Network.emulateNetworkConditions is set on a TARGET, and every shell
       request on a controlled page is issued by the SERVICE WORKER in its own
       target: the same reason this file destroys sockets rather than calling
       page.setOfflineMode (see blackhole above, and offline-boot-audit, which
       measured the worker walking straight past page-level emulation). A
       page-level throttle would have left the worker's own fetches running at
       full speed, and THROTTLED BOOT would have been a measurement of nothing.
       Here every response waits `latency` ms for its first byte and is then
       written at `rate` bytes/sec, per request, for every target at once. */
    setThrottle: t => { state.throttle = t; },
    close: () => srv.close(),
  };
}

/* CHROME DEVTOOLS "Fast 3G", the profile NAMED rather than a number invented:
   1.6 Mbit/s down (180,000 B/s), 750 kbit/s up, 562.5 ms round trip. Quoted in
   every number this file prints, so a later run can be compared to this one. */
const FAST_3G = { latency: 562.5, rate: 180000, name: 'Chrome DevTools "Fast 3G": 180,000 B/s, 562.5 ms RTT, applied per request in the server' };

/* ---- browser --------------------------------------------------------------- */
const puppeteer = await loadPuppeteer();
async function launch() {
  return puppeteer.launch({
    /* THIS SUITE CANNOT RUN UNDER headless 'shell', so it pins 'new' and does
    NOT let HEADLESS_MODE override. The global override exists because this
    Mac cannot screenshot under 'new' (godmode.js:450), which is a real
    constraint for suites that capture frames. This one takes no screenshots:
    `grep -c screenshot` is 0. Under 'shell' the tab never truly backgrounds,
    so visibilitychange never fires and the suite reports a red on a healthy
    app. Measured 2026-08-23: ALL GREEN under 'new', red under 'shell'.
    A false red on a green app is worse than a skipped suite, and worse still
    here because this is the suite that grades the release road. */
    headless: 'new',
    executablePath: chromePath(),
    defaultViewport: { width: 430, height: 932, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    args: [...sandboxArgs(), '--ignore-certificate-errors', '--host-resolver-rules=MAP tally.test 127.0.0.1'],
  });
}

/* Read every layer AS THE PAGE IS RUNNING IT, plus what is in the worker's cache
   for the same three files, so "the shell is new but the cache still holds the
   old one" is visible rather than averaged away. */
const LAYERS = async page => page.evaluate(async () => {
  const rx = /TALLY_UPGRADE_MARKER:([AB])/;
  const cacheOf = async u => {
    try { const r = await caches.match(u); if (!r) return '-'; const m = rx.exec(await r.text()); return m ? m[1] : '?'; }
    catch { return '-'; }
  };
  const meta = document.querySelector('meta[name="tally-upgrade-marker"]');
  const css = getComputedStyle(document.documentElement).getPropertyValue('--tally-upgrade-marker').trim().replace(/["']/g, '');
  const counts = {};
  /* THE SENTINEL AND THE KILLSWITCH, read out of the caches themselves.
     readyIn: which caches carry './__shell-ready__', i.e. which of them sw.js is
     willing to serve the shell out of. A cache with entries but no sentinel is a
     half-filled install, and telling those two apart is the whole point of it.
     stampCached: version.json must never be in ANY cache. If it ever is, the one
     lever that reaches a stuck worker has been put behind the thing it exists to
     escape, and no other row in this file would notice. */
  const readyIn = [], stampCached = [];
  for (const k of await caches.keys()) {
    const c = await caches.open(k);
    counts[k] = (await c.keys()).length;
    if (await c.match('./__shell-ready__')) readyIn.push(k);
    if (await c.match('./version.json')) stampCached.push(k);
  }
  return {
    readyIn, stampCached,
    bootMs: window.__bootMs ?? null,
    shell: meta ? meta.content : '-',
    module: window.__tallyLayerJs || '-',
    build: window.__tallyBuild || '-',
    css: css || '-',
    cachedShell: await cacheOf('./index.html'),
    cachedModule: await cacheOf('./js/app.js'),
    cachedCss: await cacheOf('./app.css'),
    controlled: !!navigator.serviceWorker.controller,
    caches: counts,
    screenKids: document.getElementById('screen')?.children.length ?? -1,
  };
});

/* WHICH WORKER IS ACTUALLY IN CHARGE. There is no api that hands you the active
   worker's VERSION constant, and reading caches.keys() is not it: a failed
   install leaves a second cache sitting there. So ask the worker to prove it:
   fetch a unique shell url, which its own fetch handler puts into caches.open(
   VERSION), then find which cache the token landed in. That is the running
   worker's VERSION by construction.

   THE PROBE HAS A FALLBACK, and the fallback exists because of a misleading red.
   Under --prove-red=cache-first the shell branch no longer writes through, so the
   probe found nothing and the row "the new worker is the one in charge" went red
   about the worker while the actual regression was somewhere else entirely. A
   red that names the wrong thing is how a fix gets aimed at the wrong file
   (anti-regression rule 10). So: probe first, and if the worker does not write
   through, fall back to the surviving cache name, which activate() has already
   narrowed to one on any healthy upgrade, and SAY which method answered. */
const ACTIVE_VERSION = async page => page.evaluate(async () => {
  if (!navigator.serviceWorker.controller) return null;
  const tok = 'swprobe' + Math.random().toString(36).slice(2);
  try { await fetch(`./app.css?${tok}=1`, { cache: 'no-store' }); } catch { /* fall through */ }
  for (let i = 0; i < 20; i++) {
    for (const k of await caches.keys()) {
      const keys = await (await caches.open(k)).keys();
      if (keys.some(r => r.url.includes(tok))) return k;
    }
    await new Promise(r => setTimeout(r, 150));
  }
  const surviving = (await caches.keys()).filter(k => /^tally-v/.test(k));
  return surviving.length === 1 ? surviving[0] + ' (by surviving cache, not write-through)' : null;
});

/* the fallback above appends how it answered, which belongs in the DETAIL and
   not in the value a comparison is made against. */
const normVer = v => String(v || '').split(' ')[0] || null;

const REG_STATE = async page => page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { none: true };
  return {
    active: reg.active?.state || null,
    installing: reg.installing?.state || null,
    waiting: reg.waiting?.state || null,
  };
});

/* The real onboarding, clicked. No ?demo is possible here (it turns registration
   off), so this is a virgin profile every run and the gate is real. */
async function passOnboarding(page) {
  for (const id of ['#onbGo', '#onbMe', '#onbSkip']) {
    for (let i = 0; i < 40; i++) {
      const hit = await page.evaluate(sel => {
        const b = document.querySelector(sel);
        if (!b || !b.getBoundingClientRect().width) return null;
        b.scrollIntoView({ block: 'center' });
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, id);
      if (hit) { await page.mouse.click(hit.x, hit.y); break; }
      await sleep(250);
    }
    await sleep(900);
  }
  await sleep(1500);
  return page.evaluate(() => !!document.querySelector('#screen')?.children.length && !document.querySelector('.onb'));
}

async function waitControlled(page, ms = 40000) {
  const t0 = Date.now();
  for (;;) {
    const c = await page.evaluate(() => !!navigator.serviceWorker.controller);
    if (c) return true;
    if (Date.now() - t0 > ms) return false;
    await sleep(300);
  }
}

/* An install of 130-odd entries is not instant, and a sample taken mid-install
   grades a cache that is still filling. Wait for it to STOP growing. */
async function waitCacheSettled(page, ms = 45000) {
  const t0 = Date.now();
  let last = -1, stable = 0;
  for (;;) {
    const n = await page.evaluate(async () => {
      let t = 0;
      for (const k of await caches.keys()) t += (await (await caches.open(k)).keys()).length;
      return t;
    });
    if (n === last && n > 0) { if (++stable >= 3) return n; } else { stable = 0; last = n; }
    if (Date.now() - t0 > ms) return n;
    await sleep(700);
  }
}

/* ---- one scenario ---------------------------------------------------------- */
const BREAK = 'js/quests.js';   // a STATIC import of app.js, so the graph dies with it

async function scenario(name, srv, act, { broken = null, offlineAfter = false, noAppUpdate = false } = {}) {
  console.log(`\n---- ${name} ----`);
  NO_APP_UPDATE = noAppUpdate;
  srv.setMode('A');
  srv.setBroken(broken || (PROVE === '404' ? BREAK : null));
  const browser = await launch();
  const out = { name };
  try {
    let page = await browser.newPage();
    /* COUNT REAL DOCUMENT LOADS, NOT NAVIGATION EVENTS. framenavigated also
       fires for the sheet's own history.pushState / history.back, so the sheet
       row read "2 navigations" while the document had never once reloaded,
       which is the exact opposite of what that row is about. A counter the
       document itself bumps on every parse is unambiguous, and sessionStorage
       is the one store that survives a reload and not a new tab, which is
       precisely the distinction wanted here. */
    const track = async p => p.evaluateOnNewDocument(() => {
      try { sessionStorage.setItem('__loads', String(+(sessionStorage.getItem('__loads') || 0) + 1)); } catch { /* storage denied */ }
      /* TIME TO FIRST CONTENT, TAKEN INSIDE THE DOCUMENT THAT EXPERIENCED IT.
         performance.now() is zeroed at this document's navigation start, so this
         is "from the moment the app was opened to the moment there was an app on
         the screen" with no clock shared with the test runner and no puppeteer
         round trip in the number. #screen having children is the same liveness
         signal index.html's own dead-shell watchdog uses, so this measures the
         thing the app already considers "up". */
      window.__bootMs = null;
      const iv = setInterval(() => {
        const el = document.getElementById('screen');
        if (el && el.children.length > 0) { window.__bootMs = Math.round(performance.now()); clearInterval(iv); }
      }, 16);
      setTimeout(() => clearInterval(iv), 180000);
    });
    await track(page);
    await page.goto(srv.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2500);
    await passOnboarding(page);
    if (!await waitControlled(page)) {
      out.error = 'the worker never took control on version A, so nothing below would be about an upgrade';
      return out;
    }
    const entries = await waitCacheSettled(page);
    out.installed = { entries, version: await ACTIVE_VERSION(page), layers: await LAYERS(page) };

    // the flip: a new build is now on the server. Nothing on the device is touched.
    srv.setMode('B');
    // zero the load counter here, so the number reported is loads SINCE the flip
    await page.evaluate(() => { try { sessionStorage.setItem('__loads', '0'); } catch { /* storage denied */ } });
    /* setPage has to move ctx.page as well as the local: a scenario that opens a
       fresh tab (RETURN VISIT closes the old one) would otherwise be graded
       through the page it just closed, which reads as a detached frame. */
    const ctx = { page, browser, srv, track };
    ctx.setPage = async p => { ctx.page = p; page = p; await track(p); };
    await act(ctx);
    page = ctx.page;
    /* whatever the scenario observed mid-flight belongs in the result, not on a
       context object the reporter never sees. The first version of this dropped
       them and printed "not recorded" for a banner that had actually been
       clicked, which is a check reporting on itself instead of on the app. */
    for (const k of ['early', 'bannerSeen', 'bannerText', 'duringSheet', 'toast', 'sheetOpen', 'diag', 'firstOpen', 'bootMs', 'bootWall', 'stampHits', 'reg2', 'appUpdateStripped']) {
      if (ctx[k] !== undefined) out[k] = ctx[k];
    }
    // settle long enough for a controllerchange self-reload to happen and finish
    await sleep(9000);
    out.after = {
      loads: await page.evaluate(() => { try { return +(sessionStorage.getItem('__loads') || 0); } catch { return -1; } }),
      layers: await LAYERS(page),
      version: await ACTIVE_VERSION(page),
      reg: await REG_STATE(page),
    };
    /* AND THEN TAKE THE NETWORK AWAY. Online, every shell request is answered
       from the network, so the precache is never the thing being read and its
       contents are not what the player gets. The one moment the precache IS the
       app is an offline open, and that is where a partial update can hide: the
       three layers have to agree with each other THERE too, not only online. */
    if (offlineAfter) {
      srv.setBlackhole(true);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await sleep(5000);
      out.offline = await LAYERS(page).catch(() => null);
      /* AND THE OTHER DOOR INTO THE SAME APP. A navigation to '/' is cached
         under the key '/', which the network-first handler rewrites on every
         online visit. The PRECACHE also carries './index.html' as its own
         separate key, and nothing but a fresh install ever rewrites that one.
         So the two doors can hold different builds, and only this url reads the
         one the precache owns. It is also the copy sw.js:177 hands back when a
         module request misses network AND cache. */
      await page.goto(srv.url + 'index.html', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await sleep(5000);
      out.offlineIndexHtml = await LAYERS(page).catch(() => null);
      srv.setBlackhole(false);
    }
  } catch (e) {
    out.error = String(e).split('\n')[0];
    out.stack = String(e.stack || '').split('\n').slice(0, 6).join(' | ');
    console.log('      ' + out.stack);
  } finally {
    await browser.close().catch(() => {});
    NO_APP_UPDATE = false;
    srv.setThrottle(null);
  }
  return out;
}

/* ---- the scenarios --------------------------------------------------------- */
const srv = await serveVersioned();
console.log(`serving this checkout at ${srv.url} (version A and version B out of one tree)`);
if (PROVE) console.log(`PROVE-RED MODE: ${PROVE}\n`);

const B_VERSION = (() => {
  const n = +swVersion(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'));
  return PROVE === 'stale-version' ? `tally-v${n}` : `tally-v${n + 1}`;
})();
const A_VERSION = `tally-v${swVersion(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'))}`;
/* The bound for THROTTLED BOOT. See the row that uses it for where it comes
   from; it is deliberately far from BOTH sides of the gap so ordinary machine
   noise cannot move it, and --prove-red=network-first proves it can go red. */
const BOOT_BUDGET_MS = 3000;

const PRECACHE_LEN = (() => {
  const s = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const arr = s.slice(s.indexOf('PRECACHE'), s.indexOf('];', s.indexOf('PRECACHE')));
  return [...arr.matchAll(/['"]\.\/[^'"]*['"]/g)].length;
})();

/* A PROVE-RED THAT MATCHES NOTHING IS A BLINDFOLD, not a proof. The first safe
   area guard written in this repo silently matched nothing and read as green, so
   every mode here has to demonstrate, before a browser starts, that it really
   changed the bytes it claims to change. */
if (PROVE) {
  const swA = fs.readFileSync(path.join(ROOT, 'sw.js'));
  const raw = swA.toString();
  const bumped = raw.replace(/tally-v(\d+)/g, (m, n) => `tally-v${+n + 1}`);
  const served = transform('sw.js', swA, 'B').toString();
  /* THE ANCHOR MUST HAVE BEEN THERE AND MUST NOW BE GONE. Checking only that
     the bytes changed would pass on the VERSION bump alone, and checking only
     that the anchor is absent would pass on an anchor that had been renamed out
     from under the mutation months ago. Both halves, every mode. */
  const gone = a => bumped.includes(a) && !served.includes(a);
  const changed = {
    'network-first': gone(SW_ANCHORS.gate) && served.includes('    if (false) {'),
    'stranded': gone(SW_ANCHORS.scoped) && gone(SW_ANCHORS.sweep),
    'mixed': gone(SW_ANCHORS.gate) && served.includes('    if (!nav && PRECACHED.has(req.url)'),
    'killswitch-ignored': gone(SW_ANCHORS.throttle) && served.includes('  if (true) return;'),
    'stale-version': swVersion(served) === swVersion(raw),
    '404': new RegExp(`['"]\\./${BREAK.replace(/[.]/g, '\\.')}['"]`).test(raw),
  }[PROVE];
  if (!changed) {
    console.log(`FAIL  SETUP --prove-red=${PROVE} did not actually change anything, so a green run below would prove nothing.`);
    process.exit(1);
  }
  console.log(`SETUP --prove-red=${PROVE} verified to bite before any browser started.\n`);
}

const SCENARIOS = {
  /* the ordinary case: the player closes the app and opens it again later */
  'RETURN VISIT': async ctx => {
    await ctx.page.close();
    const p = await ctx.browser.newPage();
    ctx.setPage(p);
    await p.goto(srv.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    /* the FIRST paint of the returning visit, before any worker swap can have
       happened: this is what the player looks at, and it is a different sample
       from the settled one. */
    await sleep(1200);
    ctx.early = await LAYERS(p).catch(() => null);
    await sleep(4000);
  },
  /* THE ATOMIC SWAP, WHICH IS THE WHOLE DESIGN, IN ONE SCENARIO.
     Open #1 is the visit the release lands on: the player is served the whole
     OLD build instantly out of cache while the new worker downloads its whole
     new build in the background and then WAITS (sw.js no longer calls
     skipWaiting). Open #2 is after every client of the old worker has gone
     away, which is when the new one activates. The player must be fully on B
     by then, in every layer, or they are stranded. */
  'SECOND OPEN': async ctx => {
    await ctx.page.close();
    let p = await ctx.browser.newPage();
    await ctx.setPage(p);
    await p.goto(srv.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(1500);
    ctx.early = await LAYERS(p).catch(() => null);
    // long enough for the whole background install of B to land and go to waiting
    await sleep(14000);
    ctx.firstOpen = await LAYERS(p).catch(() => null);
    ctx.firstOpen.reg = await REG_STATE(p).catch(() => null);
    /* EVERY client gone, not just this one: a waiting worker activates when the
       last document the old one controls unloads. */
    await p.close();
    await sleep(2000);
    p = await ctx.browser.newPage();
    await ctx.setPage(p);
    await p.goto(srv.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
  },

  /* THE COMPLAINT ITSELF, MEASURED. Tom: "The app is very sluggish on a bad
     connection like verrrrry sluggish". Install on a fast link, then put the
     bad connection in front of the SERVER (see setThrottle for why not CDP) and
     open the app again. The number that matters is time from navigation start
     to #screen having content, taken inside the document.
     Note this is the honest worst case rather than a friendly one: the new
     build B is on the server, so the whole background install is competing for
     the same throttled link while the player is trying to boot. */
  'THROTTLED BOOT': async ctx => {
    await ctx.page.close();
    srv.setThrottle(FAST_3G);
    const p = await ctx.browser.newPage();
    await ctx.setPage(p);
    const t0 = Date.now();
    await p.goto(srv.url, { waitUntil: 'domcontentloaded', timeout: 200000 }).catch(() => {});
    for (let i = 0; i < 400; i++) {
      const ms = await p.evaluate(() => window.__bootMs).catch(() => null);
      if (ms != null) break;
      await sleep(250);
    }
    ctx.bootMs = await p.evaluate(() => window.__bootMs).catch(() => null);
    ctx.bootWall = Date.now() - t0;
    srv.setThrottle(null);
    await sleep(4000);
  },

  /* THE ONE LEVER THAT SURVIVES A BAD WORKER.
     No navigation and no reload, because both make the BROWSER check sw.js by
     itself and that would grade the browser rather than this worker. js/app.js's
     own reg.update() is stripped out of the served bytes for this scenario
     alone (see transform), because that line would find the new build too and
     the row would pass whether or not sw.js ever looked at version.json.
     What is left is exactly the killswitch: the worker, on its own, fetching a
     thirty-byte stamp that no cache is allowed to answer, and pulling a new
     worker when it disagrees. */
  'KILLSWITCH': async ctx => {
    /* Ask the TRANSFORM, not the server. The server speaks https on a self
       signed cert at a hostname only Chrome resolves (--host-resolver-rules),
       so node's own fetch cannot reach it; and the transform is what the server
       would have returned anyway, byte for byte, so this is the more direct
       question with fewer things able to answer it wrongly. */
    ctx.appUpdateStripped = !transform('js/app.js', fs.readFileSync(path.join(ROOT, 'js/app.js')), 'B').includes(APP_UPDATE_ANCHOR);
    srv.resetHits();
    const p = ctx.page;
    for (let i = 0; i < 45; i++) {
      /* poke ANY same-origin request through the worker, so its fetch handler
         runs at all: a page sitting idle issues none, and checkStamp is called
         from the fetch handler. Query-stringed so it can never be a cache hit. */
      await p.evaluate(() => fetch('./icons/icon-192.png?poke=' + Math.random(), { cache: 'no-store' }).catch(() => {})).catch(() => {});
      const st = await REG_STATE(p).catch(() => ({}));
      if (st.installing || st.waiting) break;
      await sleep(3000);
    }
    ctx.stampHits = srv.hits('version.json');
    ctx.reg2 = await REG_STATE(p).catch(() => ({}));
  },

  /* the same tab, pulled down */
  'RELOAD': async ctx => {
    await ctx.page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(1200);
    ctx.early = await LAYERS(ctx.page).catch(() => null);
    await sleep(4000);
  },
  /* the resumed PWA: never re-navigates, so app.js hangs reg.update() off
     visibilitychange. Driven with two real tabs, so the event is the browser's,
     not one this audit dispatched at the listener it is grading. */
  'VISIBILITYCHANGE': async ctx => {
    const other = await ctx.browser.newPage();
    await other.goto('about:blank');
    await other.bringToFront();
    await sleep(1500);
    await ctx.page.bringToFront();
    await sleep(4000);
    await other.close();
  },
  /* Progress's "Update available" banner -> hardRefresh() */
  'UPDATE BANNER': async ctx => {
    const p = ctx.page;
    await p.evaluate(() => { location.hash = '#/progress'; });
    await sleep(3500);
    const seen = await p.evaluate(() => !!document.querySelector('#updBannerBtn'));
    ctx.bannerSeen = seen;
    ctx.bannerText = await p.evaluate(() => (document.querySelector('#updBannerBtn')?.textContent || '').replace(/\s+/g, ' ').trim());
    if (seen) {
      const hit = await p.evaluate(() => {
        const b = document.querySelector('#updBannerBtn');
        b.scrollIntoView({ block: 'center' });
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await p.mouse.click(hit.x, hit.y);
      await sleep(6000);
    }
  },
  /* the claim in app.js:519-520: with a sheet open the update is NOT applied and
     the player is told "Update ready. Leave this screen to apply". Open a sheet,
     MAKE THE UPDATE ARRIVE while it is open, then leave the screen and see
     whether anything applies it.
     The update has to be provoked. Nothing looks for one by itself: the browser
     checks sw.js on a NAVIGATION, and app.js checks it on a VISIBILITYCHANGE.
     A player sitting inside a sheet does neither, so the first version of this
     scenario measured a worker that had never heard of version B and graded the
     wrong thing entirely. The tab dance is the same real event the resumed-PWA
     row uses, so this is the honest way in. */
  'SHEET OPEN, THEN CLOSED': async ctx => {
    const p = ctx.page;
    /* #gearBtn is not a sheet, it is `location.hash = '#/settings'`, so the first
       version of this opened nothing and graded a page with no sheet on it.
       #pitBtn is a real openSheet() surface (godmode.openPit uses the same one).
       A sheet that never opened is recorded and FAILS below rather than passing
       quietly on a scenario that did not happen. */
    for (const id of ['pitBtn', 'addFoodBtn', 'gearBtn']) {
      const hit = await p.evaluate(sel => {
        const b = document.getElementById(sel);
        if (!b || !b.getBoundingClientRect().width) return null;
        b.scrollIntoView({ block: 'center' });
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, id);
      if (!hit) continue;
      await p.mouse.click(hit.x, hit.y);
      await sleep(2200);
      if (await p.evaluate(() => !!document.querySelector('#sheets').children.length)) break;
    }
    ctx.sheetOpen = await p.evaluate(() => !!document.querySelector('#sheets').children.length);
    /* RECORD the toast, do not sample for it. app.js shows this one for 3600ms
       and the sample that matters is taken seven seconds later, so a single read
       finds an empty element and reports "no toast" about a toast that fired.
       Rule 12: measure in the state the claim is about. */
    await p.evaluate(() => {
      window.__toasts = [];
      const t = document.getElementById('toast');
      if (!t) return;
      const grab = () => { const s = (t.textContent || '').trim(); if (s && !window.__toasts.includes(s)) window.__toasts.push(s); };
      new MutationObserver(grab).observe(t, { childList: true, characterData: true, subtree: true, attributes: true });
      grab();
    });
    const other = await ctx.browser.newPage();
    await other.goto('about:blank');
    await other.bringToFront();
    await sleep(1500);
    await p.bringToFront();
    await other.close();
    await sleep(7000);
    ctx.duringSheet = await LAYERS(p);
    ctx.duringSheet.version = await ACTIVE_VERSION(p);
    ctx.duringSheet.stillOpen = await p.evaluate(() => !!document.querySelector('#sheets').children.length);
    ctx.toast = (await p.evaluate(() => window.__toasts || [])).join(' | ');
    await p.evaluate(() => history.back());
    await sleep(6000);
    ctx.toast = (await p.evaluate(() => window.__toasts || []).catch(() => [])).join(' | ') || ctx.toast;
  },
};

const results = {};
for (const [name, act] of Object.entries(SCENARIOS)) {
  if (ONLY && !name.includes(ONLY.toUpperCase())) continue;
  results[name] = await scenario(name, srv, act, {
    offlineAfter: name === 'RETURN VISIT',
    noAppUpdate: name === 'KILLSWITCH',
  });
}

/* the failed install: one PRECACHE entry 404s in version B */
let failedInstall = null;
if (!ONLY) {
  failedInstall = await scenario('FAILED INSTALL (one 404 in PRECACHE)', srv, async ctx => {
    await ctx.page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);
    /* THE DIAGNOSIS, MEASURED, NOT ASSUMED (anti-regression rule 10). Two
       different things could produce a dead app here and they need different
       fixes: the server is missing a file and nothing could have helped, OR the
       worker is holding a perfectly good copy of that file and hands the 404
       through anyway. Ask both questions in the same breath. */
    ctx.diag = await ctx.page.evaluate(async rel => {
      const out = {};
      try { const r = await fetch('./' + rel, { cache: 'no-store' }); out.throughWorker = r.status; out.type = r.headers.get('content-type'); }
      catch (e) { out.throughWorker = 'threw: ' + String(e).slice(0, 60); }
      const hit = await caches.match('./' + rel);
      out.cachedCopyExists = !!hit;
      out.cachedCopyBytes = hit ? (await hit.text()).length : 0;
      return out;
    }, BREAK);
  }, { broken: BREAK });
}

srv.close();

/* ---- the table ------------------------------------------------------------- */
console.log('\n================ WHICH LAYER UPDATES WHEN ================');
console.log(`A = the tree as committed (${A_VERSION}).  B = VERSION bumped to ${B_VERSION} + a marker changed in index.html, js/app.js and app.css.`);
console.log('Every row: the worker was installed and controlling on A, then the SERVER was flipped to B. Nothing on the device was cleared.\n');
const pad = (s, n) => String(s).padEnd(n);
const W = 38;
console.log(pad('scenario', W) + pad('shell', 7) + pad('module', 8) + pad('css', 6) + pad('build', 7) + pad('worker', 13) + pad('loads', 7) + 'caches');
console.log('-'.repeat(118));
const all = { ...results, ...(failedInstall ? { [failedInstall.name]: failedInstall } : {}) };
for (const [name, r] of Object.entries(all)) {
  if (r.error) { console.log(pad(name, W) + 'ERROR: ' + r.error); continue; }
  const L = r.after.layers;
  console.log(pad(name, W) + pad(L.shell, 7) + pad(L.module, 8) + pad(L.css, 6) + pad(L.build, 7)
    + pad(r.after.version || 'none', 13) + pad(r.after.loads, 7) + Object.entries(L.caches).map(([k, v]) => `${k}:${v}`).join(' '));
}
console.log('');
console.log('the READY sentinel (which cache sw.js is willing to serve the shell out of) and time to first content:');
for (const [name, r] of Object.entries(all)) {
  if (r.error) continue;
  const L = r.after.layers;
  console.log('  ' + pad(name, W) + `sentinel:${L.readyIn.join(',') || 'NONE'}  version.json cached in:${L.stampCached.join(',') || 'nothing'}`
    + `  time to first content:${L.bootMs === null ? 'n/a' : L.bootMs + 'ms'}`);
}
console.log("\n'-' means the layer never arrived at all. shell = the meta in index.html, module = a value set by js/app.js's own body,");
console.log('css = a custom property read off :root, build = the running APP_BUILD, worker = the VERSION the controlling worker caches into.\n');
console.log("the worker's OWN CACHE for the same three files (this is what an OFFLINE open would get):");
for (const [name, r] of Object.entries(all)) {
  if (r.error) continue;
  const L = r.after.layers;
  console.log('  ' + pad(name, W) + `index.html:${L.cachedShell}  js/app.js:${L.cachedModule}  app.css:${L.cachedCss}`);
}
console.log('\nthe SAME DEVICE with the network taken away right afterwards (what the precache alone can serve):');
for (const [name, r] of Object.entries(all)) {
  if (r.error || !r.offline) continue;
  console.log('  ' + pad(name, W) + `at "/"           shell:${r.offline.shell}  module:${r.offline.module}  css:${r.offline.css}  build:${r.offline.build}  #screen:${r.offline.screenKids}`);
  if (r.offlineIndexHtml) {
    const x = r.offlineIndexHtml;
    console.log('  ' + pad('', W) + `at "/index.html" shell:${x.shell}  module:${x.module}  css:${x.css}  build:${x.build}  #screen:${x.screenKids}`);
  }
}
console.log('\nthe FIRST paint of the visit, before any worker swap could have happened:');
for (const [name, r] of Object.entries(all)) {
  if (r.error || !r.early) continue;
  console.log('  ' + pad(name, W) + `shell:${r.early.shell}  module:${r.early.module}  css:${r.early.css}  build:${r.early.build}`);
}
console.log('');

/* ---- assertions ------------------------------------------------------------ */
/* SETUP is read off whichever scenario actually ran, not off a hardcoded name:
   with --only=SHEET the hardcoded version reported "RETURN VISIT did not run" as
   a failure of the app, which is a check failing about itself. */
const ret = all['RETURN VISIT'] || Object.values(all).find(r => !r.error && r.installed);

/* SETUP first: an audit that installed nothing must not grade anything. */
if (ret && !ret.error) {
  ok('SETUP the worker installs on version A, controls the page, and fills its cache',
    ret.installed.entries > 80 && ret.installed.layers.controlled,
    `${ret.installed.entries} entries, controlling=${ret.installed.layers.controlled}, version=${ret.installed.version}`);
  const i = ret.installed.layers;
  ok('SETUP version A really is A in all three layers (a B here means the harness, not the app)',
    i.shell === 'A' && i.module === 'A' && i.css === 'A', `shell=${i.shell} module=${i.module} css=${i.css}`);
  ok('SETUP version A is in the worker cache, so the device has something to be stale WITH',
    i.cachedShell === 'A' && i.cachedModule === 'A' && i.cachedCss === 'A',
    `index.html=${i.cachedShell} js/app.js=${i.cachedModule} app.css=${i.cachedCss}`);
  /* FRESH INSTALL. The rows above are a first-ever open on a virgin profile,
     through the real onboarding, so they already ARE the fresh-install case;
     these two say the part that is new in v427 out loud rather than leaving it
     implied. */
  ok('FRESH INSTALL: a completed install writes the READY sentinel, and writes it into the cache it just filled',
    i.readyIn.length === 1 && i.readyIn[0] === A_VERSION,
    `sentinel present in: ${i.readyIn.join(', ') || 'NO CACHE'} (want exactly ${A_VERSION})`);
  ok('FRESH INSTALL: the app is alive on the build it just installed',
    i.screenKids > 0 && i.shell === 'A', `#screen children=${i.screenKids} shell=${i.shell}`);
} else {
  ok('SETUP the worker installs on version A and controls the page', false, ret ? ret.error : 'RETURN VISIT did not run');
}

const graded = Object.entries(all).filter(([n]) => n !== 'FAILED INSTALL (one 404 in PRECACHE)' && n !== 'SHEET OPEN, THEN CLOSED');
ok('SETUP every scenario produced a sample (an empty sample set is a failure, never a pass)',
  graded.length > 0 && graded.every(([, r]) => !r.error && r.after && r.after.layers.shell !== '-'),
  `${graded.length} scenarios, errors: ${graded.filter(([, r]) => r.error).map(([n]) => n).join(', ') || 'none'}`);

/* ================= SAFETY: NEVER A MIX, NEVER A CORPSE =====================
   This half is the one network-first was really buying, and it is unchanged in
   direction: whatever build a player is on, they are on ALL of it. A new shell
   over old modules is the state that produces bugs nobody can reproduce, and
   under an atomic shell it is the ONLY way this design can fail dangerously.
   Note what is deliberately NOT asserted here any more: which letter it is.
   That moved to SECOND OPEN. */
for (const [name, r] of graded) {
  if (r.error) continue;
  const L = r.after.layers;
  const set = new Set([L.shell, L.module, L.css]);
  ok(`${name}: no PARTIAL update (the three layers agree with each other)`,
    set.size === 1 && L.shell !== '-', `shell=${L.shell} module=${L.module} css=${L.css} build=${L.build}`);
  ok(`${name}: the app is alive`, L.screenKids > 0, `#screen children = ${L.screenKids}`);
  /* THE KILLSWITCH MUST NOT BE BEHIND THE THING IT EXISTS TO ESCAPE. Cheap,
     and graded on every scenario, because the day this goes wrong is the day
     there is no way to find out that it went wrong. */
  ok(`${name}: version.json is in no cache at all, so nothing but the network can answer it`,
    L.stampCached.length === 0, `cached in: ${L.stampCached.join(', ') || 'nothing (correct)'}`);
}

/* THE FIRST PAINT OF THE VISIT A RELEASE LANDS ON.
   THIS ROW USED TO SAY THE OPPOSITE AND IT WAS CHANGED ON PURPOSE. It used to
   require the new build here ("served the new build IMMEDIATELY, not after a
   self-reload"), which is the network-first contract and is the sluggishness
   Tom reported. Under the atomic shell the player is served the whole OLD build
   on this paint, instantly, out of cache. What must still be true, and is the
   only thing that was ever really at stake, is that it is a WHOLE build. */
for (const [name, r] of Object.entries(all)) {
  if (r.error || !r.early) continue;
  ok(`${name}: the first paint of the visit is ONE whole build, not a mix of two`,
    new Set([r.early.shell, r.early.module, r.early.css]).size === 1 && r.early.shell !== '-',
    `first paint: shell=${r.early.shell} module=${r.early.module} css=${r.early.css} build=${r.early.build}`);
}

/* ================= LIVENESS: THE RELEASE STILL ARRIVES =====================
   Cache-first without this row is indistinguishable from a player stranded on
   an old build for ever, which is the single worst outcome available here: a
   bad worker is the one bug that survives its own fix being deployed. So the
   swap is graded end to end, on the open AFTER the one the release landed on,
   and --prove-red=stranded exists to prove this row can actually go red. */
const so = all['SECOND OPEN'];
if (so && !so.error) {
  const f = so.firstOpen || {};
  const L = so.after.layers;
  console.log('');
  console.log(`FINDING  the atomic swap. Open #1 (the visit the release landed on): shell=${f.shell} module=${f.module} css=${f.css}`
    + ` build=${f.build}, registration ${JSON.stringify(f.reg)}, caches ${JSON.stringify(f.caches)}.`);
  console.log(`         Open #2: shell=${L.shell} module=${L.module} css=${L.css} build=${L.build}, worker=${so.after.version}.`);
  ok('SECOND OPEN: open #1 is served the whole OLD build (the release does not interrupt the player)',
    f.shell === 'A' && f.module === 'A' && f.css === 'A',
    `shell=${f.shell} module=${f.module} css=${f.css}`);
  ok('SECOND OPEN: the new build really did download in the background during open #1',
    !!(f.reg && (f.reg.waiting || f.reg.installing)),
    `registration during open #1: ${JSON.stringify(f.reg)}`);
  ok('SECOND OPEN: the player is fully on the new build by the next open (NOT stranded on old)',
    L.shell === 'B' && L.module === 'B' && L.css === 'B',
    `shell=${L.shell} module=${L.module} css=${L.css} build=${L.build}`);
  ok('SECOND OPEN: the new worker is the one in charge, and exactly one tally-v* cache survives',
    normVer(so.after.version) === B_VERSION
      && Object.keys(L.caches).filter(k => /^tally-v/.test(k)).length === 1,
    `worker=${so.after.version} (want ${B_VERSION}), caches=${Object.keys(L.caches).filter(k => /^tally-v/.test(k)).join(', ')}`);
  ok('SECOND OPEN: the build being served is the one the sentinel says is complete',
    L.readyIn.length === 1 && L.readyIn[0] === B_VERSION,
    `sentinel in: ${L.readyIn.join(', ') || 'NO CACHE'} (want ${B_VERSION})`);
}

/* THE OFFLINE COPY, WHICH IS THE ONE THE PRECACHE ACTUALLY OWNS.
   Online this whole question is moot: sw.js:174 answers every shell request from
   the network. The precache is only ever read when the network is gone, so that
   is where a stale entry can still bite, and the shape of the bite is a MIX. */
for (const [name, r] of Object.entries(all)) {
  if (r.error || !r.offline) continue;
  const o = r.offline;
  ok(`${name}: OFFLINE straight after the upgrade, the three layers are still one consistent version`,
    new Set([o.shell, o.module, o.css]).size === 1 && o.shell !== '-',
    `shell=${o.shell} module=${o.module} css=${o.css} build=${o.build}`);
  ok(`${name}: OFFLINE straight after the upgrade, the app still boots`,
    o.screenKids > 0, `#screen children = ${o.screenKids}`);
  const x = r.offlineIndexHtml;
  if (x) {
    ok(`${name}: OFFLINE at the explicit /index.html url, the precached shell is from the SAME build as the modules`,
      new Set([x.shell, x.module, x.css]).size === 1 && x.shell !== '-',
      `shell=${x.shell} module=${x.module} css=${x.css}  (this key is only ever rewritten by a fresh install, i.e. by a VERSION bump)`);
  }
}

/* THE WORKER AND THE OLD CACHE ARE GRADED ON 'SECOND OPEN' AND ONLY THERE.
   They used to be graded on every scenario, which was correct while install
   called skipWaiting(): the new worker took over the instant it finished, in
   the middle of whatever the player was doing. It no longer does (that swap is
   what put two builds in one document, and its controllerchange reload is Tom's
   "full reload after I have been away for a minute"), so on RELOAD or
   VISIBILITYCHANGE the new worker is legitimately sitting in `waiting` and
   requiring it to be in charge would be requiring the bug back.
   What every scenario still owes is one whole build and a live app, above. */

/* ================= SPEED: THE REASON FOR ALL OF IT ========================= */
const tb = all['THROTTLED BOOT'];
if (tb && !tb.error) {
  console.log('');
  console.log(`FINDING  THROTTLED BOOT. profile: ${FAST_3G.name}.`);
  console.log(`         time from navigation start to #screen having content: ${tb.bootMs === null ? 'NEVER ARRIVED' : tb.bootMs + ' ms'}`
    + ` (wall clock around the whole goto + poll: ${tb.bootWall} ms).`);
  console.log('         Measured on the open AFTER a release landed, i.e. with the entire background install of the new');
  console.log('         build competing for the same throttled link. That is the honest worst case, not a friendly one.');
  /* THE BOUND, AND WHERE IT COMES FROM. Network-first has to pay one 562.5 ms
     round trip for the document and then a round trip per module wave for a
     graph app.js reaches 41 modules deep, which is seconds, and it is what
     --prove-red=network-first puts back. Cache-first pays none of them. The
     threshold sits in the gap between those two, well clear of both, so it is a
     bound and not a trend (anti-regression rule 11). */
  ok('THROTTLED BOOT: the app puts content on the screen on a bad connection',
    tb.bootMs !== null, `time to first content = ${tb.bootMs === null ? 'never' : tb.bootMs + ' ms'}`);
  ok(`THROTTLED BOOT: first content within ${BOOT_BUDGET_MS} ms on ${FAST_3G.name.split(':')[0]}`,
    tb.bootMs !== null && tb.bootMs < BOOT_BUDGET_MS,
    `time to first content = ${tb.bootMs === null ? 'never' : tb.bootMs + ' ms'}, budget ${BOOT_BUDGET_MS} ms`);
}

/* ================= THE KILLSWITCH ========================================== */
const ks = all['KILLSWITCH'];
if (ks && !ks.error) {
  console.log('');
  console.log(`FINDING  KILLSWITCH. js/app.js's own reg.update() stripped from the served bytes: ${ks.appUpdateStripped}.`);
  console.log(`         version.json requests that reached the SERVER after the flip: ${ks.stampHits}.`);
  console.log(`         registration afterwards: ${JSON.stringify(ks.reg2)}.`);
  console.log('         No navigation and no reload happened in this scenario, so nothing but sw.js itself could have pulled a new worker.');
  /* THE SEAM FIRST. If the strip did not land, js/app.js found the update on
     its own and the two rows below are about the page, not about the worker:
     green, and evidence of nothing (memory: a seam with no consumer). */
  ok('SETUP KILLSWITCH: the page\'s own reg.update() really was taken out of the served app.js',
    ks.appUpdateStripped === true, `stripped=${ks.appUpdateStripped}`);
  ok('KILLSWITCH: the worker reaches the NETWORK for version.json with no navigation and no help from the page',
    ks.stampHits > 0, `${ks.stampHits} requests reached the server`);
  ok('KILLSWITCH: a stamp naming a different build pulls a new worker all by itself',
    !!(ks.reg2 && (ks.reg2.installing || ks.reg2.waiting)), `registration = ${JSON.stringify(ks.reg2)}`);
}

/* the failed install: a 404 must not produce a mixed shell */
if (failedInstall && !failedInstall.error) {
  const L = failedInstall.after.layers;
  const keys = Object.keys(L.caches).filter(k => /^tally-v/.test(k));
  const partial = L.caches[B_VERSION];
  console.log('');
  console.log(`FINDING  one 404 in PRECACHE (${BREAK}) -> install of ${B_VERSION} throws at the first non-OK (sw.js:141-144).`);
  console.log(`         caches after: ${keys.map(k => `${k}:${L.caches[k]}`).join(', ')}`);
  console.log(`         registration: ${JSON.stringify(failedInstall.after.reg)}`);
  console.log(`         the half-filled ${B_VERSION} cache ${partial ? `EXISTS with ${partial} of the ${PRECACHE_LEN} listed entries` : 'was not created'}, `
    + `and the worker in charge is ${failedInstall.after.version}.`);
  if (failedInstall.diag) {
    console.log(`         the same 404 reaches the PAGE: fetch('./${BREAK}') through the worker answered ${failedInstall.diag.throughWorker}`
      + ` (${failedInstall.diag.type}) while a good cached copy of it ${failedInstall.diag.cachedCopyExists
        ? `IS present, ${failedInstall.diag.cachedCopyBytes} bytes` : 'is NOT present'}.`);
  }
  ok('a failed install does not hand control to the half-installed worker',
    normVer(failedInstall.after.version) === A_VERSION,
    `worker in charge = ${failedInstall.after.version} (want the OLD ${A_VERSION})`);
  /* AND THE HALF-FILLED CACHE IS UNUSABLE BY CONSTRUCTION, which is the whole
     job of the sentinel. caches.open() creates the cache on its first line and
     the puts land one at a time, so a dead install leaves a cache NAMED for a
     build while holding a fraction of it. Serving that cache-first would be the
     mixed graph, delivered by the very mechanism meant to prevent it. READY is
     written last and only on success, so it must be absent here and present
     for the build actually in charge. */
  ok('a half-filled cache never gets the READY sentinel, so the shell can never be served out of it',
    L.readyIn.length === 1 && L.readyIn[0] === A_VERSION,
    `sentinel in: ${L.readyIn.join(', ') || 'nothing'} (want only the old ${A_VERSION}; the half-filled ${B_VERSION} must not have one)`);
  /* THE DIAGNOSIS IS THE FETCH HANDLER, NOT THE INSTALL, and the row says so on
     purpose: whoever reads this red must not go and "fix" the install. sw.js:174
     returns a non-OK response as if it were the answer. Only a thrown fetch
     reaches the .catch that falls back to the cache, so a 404 or a 5xx from the
     server is handed straight to the module loader while a perfectly good copy
     of the same file sits in the cache one line away. */
  ok('sw.js fetch handler: a non-OK response for a precached module falls back to the cached copy instead of being served as the answer',
    failedInstall.diag && failedInstall.diag.throughWorker === 200,
    `answered ${failedInstall.diag?.throughWorker}, cached copy present=${failedInstall.diag?.cachedCopyExists}`);
  ok('one 404 at deploy time does not leave the returning player on a MIX (new shell, missing module)',
    new Set([L.shell, L.module, L.css]).size === 1,
    `shell=${L.shell} module=${L.module} css=${L.css}`);
  ok('one 404 at deploy time does not leave the returning player on a DEAD SHELL',
    L.screenKids > 0, `#screen children = ${L.screenKids}`);
}

/* the app's own update UI */
const banner = all['UPDATE BANNER'];
if (banner && !banner.error) {
  console.log('');
  console.log(`FINDING  Progress "Update available" banner: ${banner.bannerSeen === undefined ? 'not recorded' : banner.bannerSeen ? 'SHOWN and clicked' : 'NOT shown'}`
    + (banner.bannerText ? `  copy: "${banner.bannerText}"` : ''));
  console.log('         checkForUpdate reads the tally-vNNN out of sw.js over the network and compares it to APP_BUILD, so the'
    + ' two numbers have to be bumped TOGETHER or this banner is either permanently on or permanently off.');
  ok('the Progress banner appears when a new build is live and the device has not taken it yet',
    banner.bannerSeen === true, `bannerSeen=${banner.bannerSeen}`);
  ok('hardRefresh() from the banner really lands the player on the new build, with a fresh worker and one cache',
    banner.after.layers.shell === 'B' && banner.after.layers.module === 'B' && normVer(banner.after.version) === B_VERSION,
    `shell=${banner.after.layers.shell} module=${banner.after.layers.module} worker=${banner.after.version} caches=${JSON.stringify(banner.after.layers.caches)}`);
}
const sheet = all['SHEET OPEN, THEN CLOSED'];
if (sheet && !sheet.error) {
  const d = sheet.duringSheet || {};
  const L = sheet.after.layers;
  console.log('');
  console.log(`FINDING  app.js:519-520, "apply the new build as soon as no sheet is open" / "Update ready. Leave this screen to apply".`);
  console.log(`         sheet really open: ${sheet.sheetOpen}. WHILE OPEN: shell=${d.shell} module=${d.module} css=${d.css}`
    + ` build=${d.build}, worker in charge=${d.version}, worker cache holds index.html:${d.cachedShell} js/app.js:${d.cachedModule}.`);
  console.log(`         toast on screen at that moment: "${sheet.toast || '(none)'}"`);
  console.log(`         AFTER the sheet was closed: shell=${L.shell} module=${L.module} css=${L.css} build=${L.build},`
    + ` document loads since the flip: ${sheet.after.loads}.`);
  ok('SHEET OPEN: a sheet really was open when the new worker arrived (an unopened sheet grades nothing)',
    sheet.sheetOpen === true, `sheetOpen=${sheet.sheetOpen}, still open at the sample=${d.stillOpen}`);
  ok('SHEET OPEN: the running page is deliberately held on the old build while a sheet is up (that half of the comment is true)',
    d.module === 'A', `module running during the sheet = ${d.module}`);
  /* THIS ROW USED TO REQUIRE THE OPPOSITE, AND THE OPPOSITE WAS THE BUG.
     It used to require that closing the sheet applied the new build. That path
     only existed because install called skipWaiting(): the new worker took over
     underneath a running page, controllerchange fired, and app.js reloaded the
     document. THAT RELOAD IS TOM'S COMPLAINT ("it does a full reload after I
     have been away for a minute"), and the window it opened, a page running old
     modules against a new cache, is the mixed graph this branch exists to shut.
     With no skipWaiting there is no mid-session swap to apply, so the correct
     behaviour is that NOTHING happens to the player mid-session, and the new
     build arrives on the next open (graded by SECOND OPEN). */
  ok('SHEET CLOSED: the player is NOT reloaded out from under a sheet, and stays on one whole build',
    L.shell === 'A' && L.module === 'A' && L.css === 'A' && sheet.after.loads === 0,
    `shell=${L.shell} module=${L.module} css=${L.css} document loads since the flip=${sheet.after.loads}`);
}

console.log(`\n${fails.length ? `FAILED (${fails.length}):\n  ` + fails.join('\n  ') : 'ALL GREEN'}`);
process.exit(fails.length ? 1 : 0);
