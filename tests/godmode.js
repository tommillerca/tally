/* God mode for tests: reach any state directly instead of playing to it.
 *
 * WHY. Checks here kept being written as "play the game and hope": mash JAB and
 * wait, spin the wheel, click through overlays. That is slow, flaky, and it
 * silently fails to reach the state at all (a ladder check once ran 140 turns
 * without finishing a fight because the pet healed while the foe guarded). When
 * reaching a state is hard, it stops being verified, which is how a beaten rung
 * shipped advertising rewards it would never pay.
 *
 * Two safety rules, both enforced below, not just intended:
 *   1. Gated on navigator.webdriver. NEVER on ?demo: Tom uses ?demo to show the
 *      game to people and it must behave exactly like the real thing.
 *   2. Writes are refused unless the open database is `tally-demo`. A test run
 *      must not be able to touch a real save. Data safety in this project is
 *      additive-only for a reason: an account has been wiped twice.
 *
 * Usage from a puppeteer script:
 *   import { boot, seed, openPit, finishFight, state } from '../tests/godmode.js';
 *   const { browser, page } = await boot('http://localhost:8765/');
 *   await seed(page, { level: 12, coins: 900, beatRungs: [1, 2, 3] });
 *   await openPit(page);
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/* THE DETACHED-FRAME RACE IS A HARNESS FAULT, SO THE GUARD BELONGS HERE.
 *
 * Under CPU contention Chrome's CDP can flip a frame's execution-context id
 * between one call and the next, and puppeteer throws "Attempted to use
 * detached Frame" even though nothing navigated. It was first seen in the
 * gate (3 green : 1 red) and survived 156 clean solo runs, which is why it
 * read for weeks as year-readout's own bug. On 2026-08-12 it reproduced
 * TWICE in one hour, at load average 13, in two unrelated audits: once at a
 * plain post-click page.evaluate in wardrobe-audit, once during boot in a
 * newart run. Different files, same string. So it is not any one audit's
 * bug and no audit should have to remember it.
 *
 * ONE bounded retry, and the bounds are the whole point:
 *   - ONLY this error text is caught. Anything else propagates untouched.
 *   - EXACTLY one retry. A second detach propagates, so the guard can never
 *     become a blindfold that hides a genuinely broken page.
 *   - The caller passes `resync`, the wait for the condition its first call
 *     was reading, so the retry reads a settled page rather than guessing.
 *   - The retry LOGS. Silent recovery would hide a real regression that
 *     started throwing this shape for some reason other than starvation.
 *
 * Proven with synthetic injection (a real one cannot be summoned on demand):
 * one injected detach retries and passes, two exit non-zero, and a guard
 * downstream of the wrapped call still goes red on the bug it watches.
 */
export async function retryOnDetach(fn, resync) {
  try {
    return await fn();
  } catch (e) {
    if (!/Attempted to use detached Frame/i.test(String(e))) throw e;
    console.log(`RETRY  detached frame: "${String(e).split('\n')[0]}"; resyncing and retrying ONCE.`);
    if (resync) await resync();
    return await fn();
  }
}

/* PUPPETEER MUST BE RESOLVABLE ON A MACHINE THAT IS NOT TOM'S.
 *
 * This used to be one hardcoded path:
 *   $HOME/Documents/Hyperframes Editor/overlay-render-kit/node_modules/puppeteer
 * which is a SIBLING PROJECT, not a dependency of this repo, and package.json
 * declared no dependencies at all. So a fresh clone could run `npm test` (unit and
 * pit are pure, they only read source) and NOTHING else: every browser audit and
 * the release gate died at this import. That matters because the gate is the
 * mandatory pre-push check, so an outside contributor literally could not satisfy
 * the rule the project enforces.
 *
 * Order is deliberate. The repo's OWN node_modules wins, so a normal
 * `npm install` works anywhere. The kit path stays as a fallback so the three
 * machines already set up this way keep working with no install and no version
 * drift, and it is only consulted when a local copy is absent. If neither exists,
 * THROW with both paths and the fix named: a missing browser must not read as a
 * broken app. package.json pins the same version the kit carries (24.43.1) so the
 * two routes cannot behave differently.
 */
const KIT = path.join(process.env.HOME || '', 'Documents/Hyperframes Editor/overlay-render-kit/node_modules/puppeteer');
let _pptr = null;
export async function loadPuppeteer() {
  if (_pptr) return _pptr;
  try { _pptr = (await import('puppeteer')).default; return _pptr; } catch { /* fall through to the kit */ }
  const kitEntry = path.join(KIT, 'lib/cjs/puppeteer/puppeteer.js');
  if (fs.existsSync(kitEntry)) { _pptr = (await import(kitEntry)).default; return _pptr; }
  throw new Error(
    'puppeteer not found, so no browser audit can run.\n' +
    // fileURLToPath, not URL.pathname: the latter percent-encodes, and this line
    // exists to be copy-pasted ("Hyperframes%20Editor" is not a directory).
    `  tried: the repo's own node_modules (run \`npm install\` in ${path.join(path.dirname(fileURLToPath(import.meta.url)), '..')})\n` +
    `  tried: ${kitEntry}\n` +
    '  This is a SETUP failure, not a test failure: nothing about the app has been checked.');
}

/* A browser that is present but not where puppeteer looks is the same outage as
   no browser at all, and it reads as one: "Could not find Chrome". Take an
   explicit CHROME_PATH, else the browsers a CI image usually already ships, else
   nothing, and nothing means puppeteer resolves it exactly as it does today, so
   a machine with its own Chrome downloaded is untouched by this. */
export const chromePath = () => {
  const tries = [process.env.CHROME_PATH, ...(process.env.PLAYWRIGHT_BROWSERS_PATH
    ? fs.existsSync(process.env.PLAYWRIGHT_BROWSERS_PATH)
      ? fs.readdirSync(process.env.PLAYWRIGHT_BROWSERS_PATH)
        .filter(d => /^chromium-/.test(d))
        .map(d => path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, d, 'chrome-linux/chrome'))
      : [] : []),
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  return tries.find(p => p && fs.existsSync(p)) || undefined;
};

/* Same reasoning as chromePath, hoisted so an audit that launches its own
   browser instead of calling boot() cannot silently miss it. fx-audit.js did
   exactly that and died at launch on every root container. */
export const sandboxArgs = () => (process.getuid?.() === 0 ? ['--no-sandbox', '--disable-setuid-sandbox'] : []);

export async function boot(base = 'https://tommillerca.github.io/tally/', opts = {}) {
  const puppeteer = await loadPuppeteer();
  /* Chrome refuses to start its sandbox as uid 0, so on a root container every
     check here dies at launch and reads as "the browser is broken". No-op on a
     normal machine: the flag is only added when we are already root, which is
     the only case where the sandbox was never going to come up anyway. */
  const rootArgs = sandboxArgs();
  const browser = await puppeteer.launch({
    /* HEADLESS_MODE exists so a machine where modern headless cannot screenshot
       can still run the pixel audits. On this Mac, Page.captureScreenshot never
       returns under headless 'new' OR true, for any page, including a bare
       data: URL with nothing in it: measured at 22ms under 'shell' and hung
       past 180s under both others, four runs each. hero-flash.mjs dies on it
       with a stack and no FAIL lines, which reads like a broken app.
       Default is unchanged until somebody proves 'shell' does not move any
       other result. */
    headless: process.env.HEADLESS_MODE || 'new',
    defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    executablePath: chromePath(),
    ...opts,
    args: [...rootArgs, ...(opts.args || [])],
  });
  /* TRACK THE BROWSER BEFORE ANYTHING ELSE CAN THROW.
   * A boot that throws AFTER launch is exactly the leak Gwart found on Tom's
   * machine on 2026-08-14: 16 orphaned Chrome parents + 176 helpers, one alive
   * 15 hours, from 39 audits that time out at page.goto every run. The audit's
   * code cannot close a browser it never received a reference to, so cleanup
   * belongs here, not there. Track NOW so the process-exit backstop covers
   * even the throw-inside-boot path, and set an internal try so we can close
   * synchronously and rethrow with the browser already gone. */
  _trackBrowser(browser);
  try {
    const page = await browser.newPage();
    /* COLLECTED, NOT JUST PRINTED, AND HOOKED BEFORE THE FIRST goto. A suite that
       attaches its own pageerror listener after boot() returns cannot see anything
       thrown during the very first load, which is exactly where a broken module
       import or a bad top-level await lands: the app comes up empty, every later
       assertion fails for its own reason, and the actual cause is nowhere in the
       output. Returned so callers can assert on it. Additive: callers that
       destructure only { browser, page } are unaffected. */
    const errors = [];
    page.on('pageerror', e => { errors.push(String(e)); console.log('PAGEERROR', e.message); });
    // ?demo puts us on the tally-demo database, which is what seed() insists on.
    await page.goto(base.replace(/\/?$/, '/') + '?demo', { waitUntil: 'networkidle2' });
    await sleep(2400);
    await dismissOverlays(page);
    return { browser, page, base: base.replace(/\/?$/, '/'), errors };
  } catch (e) {
    /* Close in the same throw so the caller does not have to. `catch (e) close;
       throw e` is enough: no try/finally in the caller can save a browser they
       never received a reference to. Swallow close errors, the caller cares
       about the ORIGINAL throw, not that cleanup also complained. */
    await browser.close().catch(() => {});
    throw e;
  }
}

/* The demo profile opens with a daily spin and assorted first-run cards. They are
   not what any check is about, so clear them once, up front. */
export async function dismissOverlays(page, rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    if (!await click(page, /^(spin|nice|done|collect|claim|continue|ok|got it|next|skip|back to the pit)$/)) return;
    await sleep(1500);
  }
}

/* Click by visible label, with a real mouse event at the element's centre.
   Programmatic .click() does not reach some of this app's handlers, so do not
   swap this for one: a FIGHT button that silently ignores .click() is exactly the
   kind of thing that makes a check pass while testing nothing. */
export async function click(page, re) {
  const hit = await page.evaluate(src => {
    const rx = new RegExp(src, 'i');
    const b = [...document.querySelectorAll('button')]
      .find(x => rx.test((x.textContent || '').trim()) && !x.disabled && x.getBoundingClientRect().width);
    if (!b) return null;
    // A button below the fold measures fine but a mouse click at its coordinates
    // lands in dead space; a whole verification run once read as 7 failures
    // because of exactly this. Scroll first, like a thumb would.
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, re.source);
  if (!hit) return false;
  await page.mouse.click(hit.x, hit.y);
  return true;
}

/* Seed state by writing the SAME rows the game writes, then reloading so every
   selector and render reads it the normal way. Nothing here is a special test
   path through the UI, which is the point: the render being checked is the real
   one, fed real data.
     level      -> an xp award row worth enough to reach that level
     coins/dust -> the kv values the app reads
     beatRungs  -> ladder rungs marked beaten, exactly as a win records them
     champ      -> the Champion marked beaten
     xp         -> arbitrary extra award rows, if you need a specific shape
   Reloads by default; pass { reload: false } to batch several seeds. */
export async function seed(page, opts = {}) {
  const res = await page.evaluate(async (o) => {
    // THE guard, and it has to be about THIS PAGE, not about what databases exist.
    // The first version only checked that a tally-demo database was present, which
    // is true on any origin that has ever loaded ?demo. It would happily have let a
    // non-demo page through. The app switches to tally-demo only when the ?demo
    // param is set (app.js: useDbName('tally-demo')), so that param is the real
    // signal that this page cannot be pointed at a live save.
    if (!new URLSearchParams(location.search).has('demo')) {
      return { error: 'refusing to seed: this page is NOT in ?demo mode, so it is on a real save. Load it with ?demo.' };
    }
    const dbs = (await indexedDB.databases()).map(d => d.name);
    const name = dbs.find(n => n === 'tally-demo');
    if (!name) return { error: `refusing to seed: no tally-demo database (saw: ${dbs.join(', ') || 'none'})` };
    const db = await new Promise((res2, rej) => {
      const r = indexedDB.open(name); r.onsuccess = () => res2(r.result); r.onerror = () => rej(r.error);
    });
    const today = new Date().toISOString().slice(0, 10);
    const xpRows = [];
    if (o.level) xpRows.push({ key: 'godmode-level', type: 'quest', xp: o.level * o.level * 40, label: 'test seed', date: today, ts: Date.now() });
    for (const r of o.beatRungs || []) xpRows.push({ key: `pitrung-${r}`, type: 'pitrung', xp: 40, label: `Ladder: beat rung ${r}`, date: today, ts: Date.now() });
    if (o.champ) xpRows.push({ key: 'pitchamp', type: 'pitchamp', xp: 100, label: 'Champion beaten', date: today, ts: Date.now() });
    for (const r of o.xp || []) xpRows.push({ date: today, ts: Date.now(), ...r });
    if (xpRows.length) {
      await new Promise((res2, rej) => {
        const tx = db.transaction('xp', 'readwrite');
        xpRows.forEach(r => tx.objectStore('xp').put(r));
        tx.oncomplete = res2; tx.onerror = () => rej(tx.error);
      });
    }
    const kv = {};
    if (o.coins != null) kv.coins = o.coins;
    if (o.dust != null) kv.bonedust = o.dust;   // loot.js reads 'bonedust'; 'dust' seeded nothing
    if (Object.keys(kv).length) {
      await new Promise((res2, rej) => {
        const tx = db.transaction('kv', 'readwrite');
        for (const [k, v] of Object.entries(kv)) tx.objectStore('kv').put({ k, v });
        tx.oncomplete = res2; tx.onerror = () => rej(tx.error);
      });
    }
    return { db: name, xpRows: xpRows.map(r => r.key), kv: Object.keys(kv) };
  }, opts);
  if (res.error) throw new Error(res.error);
  if (opts.reload !== false) {
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2400);
    await dismissOverlays(page);
  }
  return res;
}

/* Open the Pit, closing any sheet already open first. This matters: opening it
   twice leaves TWO Pit sheets in the DOM, and a querySelector then reads the
   stale one. That cost a real debugging round here, where the database correctly
   showed a rung beaten while the harness kept reading the old sheet and calling
   it a regression. */
export async function openPit(page) {
  for (let i = 0; i < 3; i++) {
    if (!await click(page, /^done$/)) break;
    await sleep(500);
  }
  await page.evaluate(() => document.getElementById('pitBtn')?.click());
  await sleep(1600);
  const sheets = await page.evaluate(() => document.querySelectorAll('.pit-sect').length);
  if (sheets > 4) throw new Error(`${sheets} pit sections on screen: more than one Pit sheet is open, so any row read here could be stale`);
}

/* Start a specific ladder fight by rung number, without climbing to it. */
export async function fightRung(page, rung) {
  await openPit(page);
  const started = await page.evaluate(r => {
    const btn = document.querySelector(`button[data-rung="${r}"]`);
    if (!btn || btn.disabled) return false;
    const b = btn.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, rung);
  if (!started) return false;
  await page.mouse.click(started.x, started.y);
  await sleep(2400);
  return page.evaluate(() => !!document.querySelector('#youStage'));
}

/* Resolve the current fight through the game's REAL engine (see __bhFight.finish
   in app.js). Returns the {winner} object, or false if it could not be reached,
   which is a failure to report, never a pass. */
export async function finishFight(page, winner = 'p') {
  const has = await page.evaluate(() => !!window.__bhFight);
  if (!has) throw new Error('__bhFight missing: not in a fight, or the build predates the test hook');
  const over = await page.evaluate(w => window.__bhFight.finish(w), winner);
  await sleep(1200);
  return over;
}

export const fightState = page => page.evaluate(() => window.__bhFight && window.__bhFight.state());

/* Read a Pit row's reward line and button, the thing a player actually reads.
   Takes the LAST match on purpose: if an older sheet is still in the DOM the
   first match is the stale one, which reads as a bug that is not there. */
export const pitRow = (page, name) => page.evaluate(n => {
  const rows = [...document.querySelectorAll('.crate-row')].filter(r => new RegExp(n).test(r.textContent));
  const row = rows[rows.length - 1];
  if (!row) return null;
  return {
    text: row.querySelector('small')?.textContent.trim(),
    button: row.querySelector('button')?.textContent.trim() || null,
    duplicateSheets: rows.length,
  };
}, name);

export const state = page => page.evaluate(() => ({
  build: (document.body.innerText.match(/v\d{3}/) || [])[0] || null,
  screen: document.querySelector('.screen')?.className || null,
}));


/* Headless Chrome here never advances CSS animations: a .sheet reports
   playState 'running' with currentTime stuck at 0, so it paints at the FROM
   keyframe, translate(-50%, 60%), and every getBoundingClientRect on a sheet
   reads ~545px too low. Any audit that measures a sheet against the viewport is
   measuring that artifact, not the app. Call this first. */
export async function settle(page, ms = 250) {
  await page.evaluate(() => document.getAnimations().forEach(a => { try { a.finish(); } catch {} }));
  await new Promise(r => setTimeout(r, ms));
}

/* CHANGE WIDTH THROUGH THIS, NEVER page.setViewport DIRECTLY.
 *
 * puppeteer reloads the page for you when isMobile or hasTouch CHANGE, and it
 * reads a missing key as false:
 *   cdp/Page.js:819           if (needsReload) { await this.reload(); }
 *   cdp/EmulationManager.js:335  const mobile = viewport?.isMobile || false;
 * boot() launches with both true (defaultViewport above), so a call that just
 * says { width, height, deviceScaleFactor } flips both to false and silently
 * throws the document away. On this app that costs a fresh 10-13s seeded boot in
 * the middle of a suite, and its route() closes every sheet the audit had open.
 * Measured on 54e359b, extra documents served after one setViewport:
 *   { w, h, dsf }                     [1, 1, 1]
 *   { w, h, dsf, isMobile, hasTouch } [0, 0, 0]
 * It was two lines in batch-audit that cost a week of chasing a "phantom reload".
 *
 * This always carries both flags, so the viewport changes and nothing reloads.
 * A desktop viewport is a legitimate thing to want, but it must be deliberate:
 * pass them yourself and expect the reload. tests/unit.test.js enforces that any
 * direct setViewport call states both keys.
 */
export async function setWidth(page, width, height = 932) {
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
}

/* SERVE THIS CHECKOUT, AND FAIL LOUDLY IF THE PORT WAS NOT OURS.
 *
 * The self-serving audits each did:
 *   spawn('python3', ['-m','http.server','8134','--bind','127.0.0.1'], { stdio: 'ignore' })
 * on a HARD-CODED port with stdio thrown away. Three problems, in rising order of
 * nastiness:
 *   1. A stranded server from a killed run already holds the port. python exits with
 *      "Address already in use" straight into /dev/null, and the audit then talks to
 *      whatever IS listening. It passes or fails about somebody else's tree.
 *   2. Three ports are double-booked INSIDE this repo: 8146 (crew-inbox, onb-audit),
 *      8147 (feel-audit, milestones), 8171 (race-you, scout-audit). One checkout is
 *      only honest because they never run at the same moment.
 *   3. `await sleep(900)` then carry on: a slow start reads as a dead server.
 *
 * So: ask the OS for a free port, keep the child's stderr, and wait for python to say
 * it is serving. If it exits first, that is a hard error naming what python said. A
 * failed bind can no longer be silent, which is the whole point.
 */
export async function serveTree(root, { timeoutMs = 15000, forcePort = null } = {}) {
  /* forcePort exists so the failure branches can be PROVEN: point it at a privileged
     port and python cannot bind, which is the stranded-server case without needing a
     stranded server (macOS happily lets two processes share a port with SO_REUSEADDR,
     so squatting does not reproduce it). */
  const { spawn } = await import('node:child_process');
  const net = await import('node:net');
  const port = forcePort || await new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  });
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  /* Track BEFORE anything downstream can throw, same reason as boot(): the caller
     never saw this child, so cleanup on parent-throw belongs here. */
  _trackServer(srv);
  let err = '';
  srv.stderr.on('data', d => { err += d; });
  srv.stdout.on('data', () => {});
  let exited = null;
  srv.on('exit', (code, sig) => { exited = sig || `exit ${code}`; });

  const url = `http://127.0.0.1:${port}/`;
  const t0 = Date.now();
  for (;;) {
    if (exited) throw new Error(`serveTree: python died before serving ${url} (${exited}). stderr: ${err.trim().split('\n').pop() || '(silent)'}`);
    try { if ((await fetch(url + 'index.html')).ok) break; } catch { /* not up yet */ }
    if (Date.now() - t0 > timeoutMs) { srv.kill('SIGKILL'); throw new Error(`serveTree: nothing answered on ${url} within ${timeoutMs}ms. stderr: ${err.trim() || '(silent)'}`); }
    await new Promise(r => setTimeout(r, 100));
  }
  return { url, port, close: () => { try { srv.kill('SIGKILL'); } catch { /* already gone */ } } };
}

/* PROCESS-EXIT SAFETY NET for browsers and serveTree children.
 *
 * The observed leak Gwart found on 2026-08-14: 16 orphaned Chrome parents + 176
 * helpers on Tom's machine, one alive 15 HOURS, flattening his battery. It came
 * from the 39 census audits that time out at page.goto every run: boot() throws
 * INSIDE itself so the audit never gets a browser reference to close, and any
 * try/finally in the audit body cannot save what it never received. The
 * post-launch try/catch in boot() covers the specific throw-inside-boot leak.
 * This handles the wider class:
 *   - the audit gets its browser fine, then throws before browser.close().
 *   - the audit runs to completion but exits without calling close() at all.
 *   - the audit is interrupted (Ctrl-C, harness SIGTERM).
 *   - an unhandledRejection or uncaughtException tears the process down.
 *
 * What is deliberately NOT covered here: a timeout SIGKILL from the harness.
 * `process.on('exit')` does not fire when the OS kills the process, so nothing
 * inside node can clean up in that case. That's the census's job, and its
 * cwd-scoped reap between iterations handles it.
 *
 * Sync-only in the 'exit' handler (node does not await inside 'exit'); async
 * cleanup happens in the signal / uncaught handlers, with a sync SIGKILL fallback
 * afterwards. `Browser.process()` returns the Chrome parent ChildProcess so we can
 * send SIGKILL from the synchronous path; a graceful browser.close() reaps helper
 * processes properly and is preferred when we can await. Missing helper reaping is
 * exactly the "176 orphaned helpers" story, so both paths matter.
 */
const _browsers = new Set();
const _servers = new Set();

function _trackBrowser(browser) {
  _installExitHandlers();
  _browsers.add(browser);
  browser.once('disconnected', () => _browsers.delete(browser));
}
function _trackServer(srv) {
  _installExitHandlers();
  _servers.add(srv);
  srv.once('exit', () => _servers.delete(srv));
}

let _handlersInstalled = false;
function _installExitHandlers() {
  if (_handlersInstalled) return;
  _handlersInstalled = true;
  const syncReap = () => {
    for (const b of _browsers) { try { b.process()?.kill('SIGKILL'); } catch { /* already dead */ } }
    for (const s of _servers)  { try { s.kill('SIGKILL'); } catch { /* already dead */ } }
    _browsers.clear();
    _servers.clear();
  };
  process.once('exit', syncReap);
  /* async cleanup for signal / crash paths: graceful browser.close() reaps
     helpers properly, but bounded so a stuck close cannot hang the process. */
  const asyncReap = async (exitCode) => {
    await Promise.race([
      Promise.allSettled([
        ...[..._browsers].map(b => b.close().catch(() => {})),
        ...[..._servers].map(s => new Promise(res => {
          if (s.exitCode != null || s.killed) return res();
          s.once('exit', res);
          try { s.kill('SIGTERM'); } catch { res(); }
          setTimeout(() => { try { s.kill('SIGKILL'); } catch {} res(); }, 500);
        })),
      ]),
      new Promise(r => setTimeout(r, 3000)),
    ]);
    syncReap();
    process.exit(exitCode);
  };
  process.once('SIGINT',  () => asyncReap(130));
  process.once('SIGTERM', () => asyncReap(143));
  /* uncaughtException / unhandledRejection are the audit-throws-before-close
     path. Node's default is print+exit(1) which fires 'exit' where syncReap
     runs, but graceful close is better if we can arrange it. Print first so
     the error is not lost to our own logic. */
  process.once('uncaughtException', e => {
    console.error(e && e.stack || e);
    asyncReap(1);
  });
  process.once('unhandledRejection', e => {
    console.error(e && (e.stack || e) || 'unhandledRejection');
    asyncReap(1);
  });
}

/* Opt-in try/finally wrapper for new audits.
 *
 * Existing audits already do this pattern by hand and are fine. New audits get
 * one-line correctness: withBoot(base, async ({browser, page}) => {...}) always
 * calls browser.close() on any exit path, even a throw. The process-exit safety
 * net above catches everyone else; this makes the pattern obvious for the next
 * person writing an audit.
 */
export async function withBoot(base, fn, opts = {}) {
  const b = await boot(base, opts);
  try { return await fn(b); }
  finally { await b.browser.close().catch(() => {}); }
}
