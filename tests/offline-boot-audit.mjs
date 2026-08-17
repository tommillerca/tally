/* OFFLINE BOOT: the other half of the v197 trade.
 *
 * v197 moved the app shell to NETWORK-FIRST so a deploy could never be blocked by
 * a poisoned cache entry. That fixed staleness and it moved the risk: the cache is
 * now a FALLBACK, reached only when the network throws. Nothing in this repo ever
 * exercised that fallback. This is a PWA people open at the gym on one bar, so
 * "boots with no network" is not a nice-to-have, it is what the worker is for.
 *
 * WHAT IT ASSERTS
 *   1. sw.js activates, controls the page, and its precache actually fills (an
 *      empty cache is a failure, never a pass).
 *   2. With the network gone, a reload still boots: the SHELL renders (not
 *      Chrome's error page), the TAB BAR WORKS (real mouse click, and the screen
 *      has to actually change), and TODAY IS USABLE (its heading, its ring and a
 *      real number, not a blank frame).
 *   3. Back online, it recovers.
 *   4. A second offline pass as the RETURNING VISITOR: by then one controlled
 *      online load has run, so anything missing from PRECACHE has been
 *      runtime-cached. Cold and warm are different states that fail differently,
 *      so they are reported separately instead of averaged into one green.
 *
 * HOW "OFFLINE" IS DONE, AND WHY NOT setOfflineMode ALONE.
 * page.setOfflineMode(true) is a page-level emulation and every shell request on a
 * controlled page is issued by the WORKER, in its own target. Measured on this
 * tree: with only setOfflineMode, a page fetch threw "Failed to fetch" (so a probe
 * looked convincingly offline) while the worker fetched js/haptics.js and
 * js/bosses.js from the live server and grew its cache from 102 entries to 161.
 * Emulating the service_worker target too did not fix it: the navigation restarts
 * the worker and the new target comes up unemulated. An audit built on either
 * would have certified offline behaviour it never once exercised.
 *
 * So the network is taken away for real: this audit OWNS its server and stops it.
 * That is why a base URL is not used to serve (see below). Two independent proofs
 * per pass, because "I believe it is offline" is how the above happened:
 *   - a Node-side fetch at the origin must be REFUSED (the server is gone, for
 *     every target, with no emulation semantics to argue about), and
 *   - the worker's cache must not GROW across the offline reload. It only ever
 *     puts after a successful network response, so growth means it got out.
 *
 * PROVE-RED: `--break-cache` deletes the worker's own caches from the page
 * (caches.keys() then caches.delete) before the first offline pass. No source file
 * is touched, sw.js least of all. Every offline assertion must go red.
 *
 * Usage: node tests/offline-boot-audit.mjs [baseUrl] [--break-cache]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveTree, boot, dismissOverlays, settle, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
const breakCache = process.argv.includes('--break-cache');

/* THIS AUDIT SERVES ITS OWN TREE, ALWAYS. Being offline means being able to take
   the network away, and you cannot switch off a server you do not own. Under the
   release gate the URL handed in IS this checkout, so nothing is lost; the line is
   printed so a run against some other URL cannot quietly look like it graded it. */
let srv = await serveTree(ROOT);
const PORT = srv.port;
const base = srv.url;
if (argUrl) console.log(`NOTE: offline means owning the network, so this run serves THIS checkout at ${base} and does not use ${argUrl}.`);

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};
const bail = msg => { console.log('FAIL  ' + msg); results.push({ name: msg, pass: false }); };

const booted = await boot(base);
const browser = booted.browser;
let page = booted.page;   // reassigned at RECOVERY; every helper reads it at call time

/* WHEN THIS GOES RED, THE REASON HAS TO BE IN THE OUTPUT. A blank app offline is
   one module failing to load, and the only place that says which one is the
   console and the failed-request list. Reported per pass, not as a global tally. */
const log = [];
let mark = 0;
function attachLog(p) {
  p.on('console', m => { if (m.type() === 'error') log.push('console: ' + m.text().replace(/\s+/g, ' ').slice(0, 170)); });
  p.on('pageerror', e => log.push('pageerror: ' + String(e).replace(/\s+/g, ' ').slice(0, 170)));
  p.on('requestfailed', r => log.push(`reqfail: ${new URL(r.url()).pathname} ${r.failure()?.errorText || ''}`));
}
attachLog(page);
const dumpLog = tag => {
  const out = log.slice(mark); mark = log.length;
  if (out.length) console.log(`      ${tag} browser log:\n` + out.slice(0, 10).map(l => '        ' + l).join('\n'));
};

/* ---- 1. install the worker ------------------------------------------------
   js/app.js:507 registers sw.js only when `!S.demo && location.protocol ===
   'https:'`, so on a local http tree the app never registers it and an audit that
   only waited would time out having tested nothing. Register it explicitly:
   127.0.0.1 is a secure context, so this is the same worker running the same
   install the live site runs. */
const install = await page.evaluate(async () => {
  try {
    await navigator.serviceWorker.register('sw.js', { scope: './' });
    const reg = await navigator.serviceWorker.ready;
    for (let i = 0; i < 150 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 200));
    const entries = {};
    for (const k of await caches.keys()) entries[k] = (await (await caches.open(k)).keys()).length;
    return { active: !!reg.active, controlled: !!navigator.serviceWorker.controller, entries };
  } catch (e) { return { err: String(e) }; }
});
const cached = Object.values(install.entries || {}).reduce((a, b) => a + b, 0);
ok('service worker activates, controls the page, and precaches the shell',
  !install.err && install.active && install.controlled && cached > 80,
  install.err || `${cached} entries in ${JSON.stringify(install.entries)}`);
if (install.err || !install.controlled) {
  bail('no controlling service worker, so nothing below would be about offline behaviour');
  await finish();
}

/* ---- helpers --------------------------------------------------------------- */

const reachable = async () => {
  try { const r = await fetch(base + 'index.html', { cache: 'no-store' }); return r.ok; } catch { return false; }
};

/* Take the network away for everything, worker included.
 *
 * AND THE HTTP CACHE WITH IT, because otherwise the growth proof below is not a
 * proof. Its claim is "the worker only puts after a successful network response,
 * so growth means it got out". That is false while Chrome's own disk cache is
 * warm: the static-asset branch of sw.js calls `fetch(e.request)` with the
 * request's default cache mode, so a heuristically-fresh HTTP-cache entry is
 * returned with `res.ok === true` and put into Cache Storage without a byte
 * crossing the network.
 *
 * Measured on this tree, 2026-08-17, cold pass, with the server stopped and a
 * node-side fetch at the origin REFUSED: the SW caches went 137 -> 156 entries,
 * all nineteen of them Bonehead part PNGs the same profile had already
 * downloaded during the online boot. With Network.clearBrowserCache called
 * first and nothing else changed: 137 -> 137, no additions and no removals.
 * So the red row this audit printed on main was the HTTP cache, not the
 * network, and the audit was accusing the worker of something it could not do.
 *
 * Clearing is also the HARSHER offline test, which is the one worth
 * certifying: it forces every request to be answered out of the worker's own
 * precache or not at all. */
async function setOffline(on) {
  await page.setOfflineMode(on);   // so navigator.onLine is honest too
  if (on) {
    if (srv) { srv.close(); srv = null; }
    const cdp = await page.createCDPSession();
    await cdp.send('Network.clearBrowserCache');
    await cdp.detach().catch(() => {});
    for (let i = 0; i < 50 && await reachable(); i++) await sleep(100);
  } else if (!srv) {
    srv = await serveTree(ROOT, { forcePort: PORT });
  }
}

/* null when it cannot be read at all, which is what Chrome's network error page
   looks like from here: no `caches`, no app, no origin. That is a finding for the
   shell check below to report, not a reason for the suite to die. */
const cacheSize = () => page.evaluate(async () => {
  if (typeof caches === 'undefined') return null;
  let n = 0;
  for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).length;
  return n;
}).catch(() => null);

const NOTHING = { hasApp: false, title: '(unreadable)', bodyHead: '', screenLen: 0, tabs: [], hash: '' };
const inspect = () => page.evaluate(() => {
  const body = (document.body?.innerText || '').trim();
  const screen = document.querySelector('#screen');
  return {
    hasApp: !!document.querySelector('#app'),
    title: document.title,
    bodyHead: body.slice(0, 100).replace(/\s+/g, ' '),
    screenLen: (screen?.innerText || '').trim().length,
    tabs: [...document.querySelectorAll('#tabbar .tab[data-tab]')].map(t => t.dataset.tab),
    hash: location.hash,
  };
}).catch(() => NOTHING);

/* A real mouse click at the tab's centre. Programmatic .click() does not reach
   some of this app's handlers, and "the tab bar is in the DOM" is not "the tab
   bar works". */
async function tapTab(tab) {
  const at = await page.evaluate(t => {
    const b = document.querySelector(`#tabbar .tab[data-tab="${t}"]`);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, tab).catch(() => null);
  if (!at) return false;
  await page.mouse.click(at.x, at.y);
  await sleep(1800);
  return true;
}

async function reload() {
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(3500);
    await dismissOverlays(page);
    await settle(page);
    return null;
  } catch (e) { return String(e).split('\n')[0]; }
}

/* ---- one offline pass ------------------------------------------------------ */
async function offlinePass(tag) {
  await setOffline(true);
  const up = await reachable();
  ok(`${tag}: the network really is gone (the origin refuses a connection)`, !up,
    up ? `${base} is still answering, so this pass would certify nothing` : `${base} refused`);
  if (up) { bail(`${tag}: could not take the network away`); return; }

  const before = await cacheSize();
  const navErr = await reload();
  const after = await cacheSize();
  /* The worker only writes to its cache after a response that came back ok, so a
     bigger cache means it reached the network during a pass that claims it could
     not. This is the check that caught the two emulation approaches above. */
  /* Not "did not grow much": ZERO new entries. The browser HTTP cache is cleared
     in setOffline, so the only way a new entry can appear is a response that came
     off the network, and there is no network. */
  ok(`${tag}: the worker never reached the network (not one new cache entry)`,
    before === null || after === null || after <= before,
    after === null ? 'unreadable: this page is not the app (see the shell check below)' : `${before} -> ${after} entries`);

  const info = await inspect();
  dumpLog(tag);
  ok(`${tag}: the app shell boots with no network`,
    !navErr && info.hasApp && info.title === 'Boneheadz Gym',
    navErr || `title="${info.title}" #app=${info.hasApp} body="${info.bodyHead}"`);
  ok(`${tag}: the booted shell has content (a blank shell is not a boot)`,
    info.screenLen > 40, `${info.screenLen} chars on #screen`);
  ok(`${tag}: the tab bar is there to operate`, info.tabs.length >= 4, info.tabs.join(', ') || 'no tabs at all');

  /* OPERATE it: go somewhere that is not Today and prove the app moved. */
  const pre = await inspect();
  const tapped = await tapTab('bonehead');
  const post = await inspect();
  ok(`${tag}: tapping a tab navigates offline (the screen changes, not just a class)`,
    tapped && post.hash !== pre.hash && post.screenLen > 40 && post.screenLen !== pre.screenLen,
    `hash ${pre.hash || '(none)'} -> ${post.hash || '(none)'}, ${pre.screenLen} -> ${post.screenLen} chars`);

  /* Back to Today: the screen the app opens on, and the one somebody is at the gym
     for. Assert its own furniture, not just "some text". */
  await tapTab('today');
  const today = await page.evaluate(() => {
    const s = document.querySelector('#screen');
    return {
      heading: (s?.querySelector('.day-title h1')?.textContent || '').trim(),
      ring: !!s?.querySelector('.ring-card #ringFill'),
      kcal: (s?.querySelector('#ringBig')?.textContent || '').trim(),
      len: (s?.innerText || '').trim().length,
    };
  }).catch(() => ({ heading: '', ring: false, kcal: '', len: 0 }));
  ok(`${tag}: Today is usable offline (heading, ring and a real number)`,
    !!today.heading && today.ring && /\d/.test(today.kcal) && today.len > 120,
    JSON.stringify(today));
}

/* ---- 2. cold: installed, then straight offline ----------------------------- */
if (breakCache) {
  const gone = await page.evaluate(async () => {
    const keys = await caches.keys();
    for (const k of keys) await caches.delete(k);
    return keys;
  });
  console.log(`--break-cache: deleted the worker's caches [${gone.join(', ')}] before going offline\n`);
}
await offlinePass('COLD (installed, then straight offline)');

/* ---- 3. back online: it has to recover -------------------------------------
   IN A FRESH TAB, NOT BY RELOADING THIS ONE, and not with a cache-bypassing
   reload either. Two measured reasons. A soft reload on the offline tab re-serves
   the poisoned text/html module out of the browser's HTTP cache and stays blank
   (0 chars) even with the server back, so recovery would go red about Chrome's
   cache. And Page.reload with ignoreCache is a hard reload, which BYPASSES the
   service worker entirely: it came back green at 1421 chars while proving nothing
   about the worker, and left its cache un-warmed, which then made the WARM pass
   below a second cold pass wearing a warm label. A new tab is an ordinary
   SW-controlled navigation, which is what a returning player performs. */
await setOffline(false);
const fresh = await browser.newPage();
attachLog(fresh);
let backErr = null;
try {
  await fresh.goto(base + '?demo', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3500);
  await dismissOverlays(fresh);
  await settle(fresh);
} catch (e) { backErr = String(e).split('\n')[0]; }
const old = page;
page = fresh;
await old.close().catch(() => {});
const backInfo = await inspect();
dumpLog('RECOVERY');
ok('RECOVERY: back online, a normal SW-controlled load serves the app again',
  !backErr && backInfo.hasApp && backInfo.screenLen > 40 && await reachable(),
  backErr || `#screen ${backInfo.screenLen} chars`);

/* ---- 4. warm: the returning visitor, one controlled online load later ------- */
await offlinePass('WARM (after a controlled online load)');

await finish();

async function finish() {
  await page.setOfflineMode(false).catch(() => {});
  await browser.close().catch(() => {});
  if (srv) srv.close();
  const failed = results.filter(r => !r.pass);
  if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log('FAILED: ' + failed.map(f => f.name).join(' | ')); process.exit(1); }
  console.log('offline boot clean');
  process.exit(0);
}
