/* A BOOT THAT FAILS MUST SAY SO. NO BLANK SCREEN, EVER, FOR ANY REASON.
 *
 * THE DEFECT. Measured at 430x932 on v385: the app booted to a PERMANENT blank
 * screen with no message ever, from two independent causes. #screen held 0
 * children and the page held 28 characters of text (the tab bar labels: "Today
 * Boneyard Crew Bonehead") against 16 children and 1,619 characters on a healthy
 * boot. index.html reloads a contentless shell once at 12s and then gave up in
 * SILENCE, so the end state was the same empty room forever.
 *
 *   CAUSE 1, THE NETWORK HANG. There were zero fetch timeouts in the entire
 *   client (`grep -rc 'AbortController\|AbortSignal' js/*.js` returned 0 in every
 *   file). js/app.js awaited social.bootSync() BEFORE renderOnboarding, guarded
 *   only by `.catch(() => null)`, and a .catch handles a REJECTION: a fetch that
 *   completes its TCP handshake and then never answers never rejects, so it was
 *   no protection at all. A captive portal, a corporate proxy or a dead
 *   middlebox hung boot forever. Brand-new players were fine (bootSync returns
 *   'new-player' before any fetch); RETURNING and REINSTALLING players, the ones
 *   with a cloud backup worth waiting for, were the ones held hostage.
 *
 *   CAUSE 2, STORAGE DENIED. In private browsing, or with site data blocked,
 *   boot() threw at its first line (kvGet('settings')), boot() was invoked bare
 *   with no .catch, and js/db.js cached the REJECTED open promise for the life of
 *   the page so every later call failed too. Two unhandled SecurityErrors and an
 *   empty room.
 *
 *   CAUSE 3, ANYTHING ELSE. The general rule is worth more than either specific
 *   fix, so the third scenario here does not name a cause: it injects a throw
 *   into boot() and demands words anyway. The fourth kills the module graph, so
 *   app.js never executes at all, and demands words from index.html's own
 *   recovery script after its one reload has lost.
 *
 * WHY IT ASSERTS ON COUNTS AND NOT ON STRINGS. A string match passes on a blank
 * page that happens to contain one word, and this whole defect class IS "the
 * page technically has some text on it". So every row states its DIRECTION and
 * its BOUND against the two measured anchors:
 *   BLANK    <= 60 characters, 0 #screen children   (measured dead shell: 28)
 *   ALIVE    >= 8 children AND >= 600 characters    (measured healthy: 16 / 1619)
 *   SPEAKS   >= 200 characters AND >= 30 words AND a hit-testable Try again
 * Failure direction is DOWNWARD in all three: fewer characters, fewer elements.
 * A ceiling would be the wrong instrument here; there is no resource to exhaust,
 * the thing that can run out is the player's patience with an empty room.
 *
 * AN EMPTY SAMPLE IS A FAILURE. Every scenario carries a row proving the failure
 * it drives was actually reached: intercepted requests held open, the injected
 * throw present in the served source, the module request blocked. A scenario that
 * measured nothing must go red, not green.
 *
 * PROVE-RED: revert either fix and this goes red on that fix's rows alone.
 *   cause 1: drop the deadline in js/social.js bootSync + the race in js/app.js
 *   cause 2: restore `boot();` bare and let js/db.js cache the rejection
 *
 * Usage: node tests/boot-speaks-audit.mjs        (serves this checkout itself)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

/* THE BOUNDS, in one place, so every row below is measured against the same
   two anchors and nobody has to guess what "enough words" means. */
const BLANK_CHARS = 60;    // the dead shell measured 28 (33 with the demo badge)
const ALIVE_KIDS = 8;      // healthy measured 16
const ALIVE_CHARS = 600;   // healthy measured 1619
const SPEAKS_CHARS = 200;  // the recovery message measured 408
const SPEAKS_WORDS = 30;

const srv = await serveTree(ROOT);
const API = srv.url.replace(/\/$/, '') + '/api';

/* One browser, a fresh page per scenario. Launched through godmode.boot() and
   never puppeteer.launch(): boot() is what adds --no-sandbox when we are uid 0,
   and a direct launch dies with a Chrome error that reads like an app failure. */
const { browser, page: bootPage } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });

/* NAVIGATION-TOLERANT BY CONSTRUCTION. index.html reloads a dead shell at 12s,
   and every scenario here is sampling across that moment on purpose. An evaluate
   that lands mid-navigation throws "Execution context was destroyed", which would
   kill the run with a stack and no FAIL rows: exit 1 that reads like a broken
   harness rather than a measured failure. A destroyed context means the page is
   between loads, which is a legitimate sample of "nothing on screen". */
const BLANK_SAMPLE = { kids: 0, chars: 0, words: 0, text: '', hasFail: false, failBox: null, retryBox: null, midNav: true };

/* What the player can actually SEE, not what is merely in the DOM. The opacity
   product up the whole ancestor chain plus a hit test at the element's own
   centre, which is what catches a message painted underneath the splash. */
const lookNow = page => page.evaluate(() => {
  const scr = document.getElementById('screen');
  const fail = document.getElementById('bootFail');
  const txt = (document.body.innerText || '').trim();
  const vis = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    let o = 1, n = el;
    while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
    const hit = r.width && r.height ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
    return { w: Math.round(r.width), h: Math.round(r.height), eff: +o.toFixed(3), onTop: !!hit && (hit === el || el.contains(hit)) };
  };
  const btn = [...document.querySelectorAll('button')].find(b => /try again/i.test(b.textContent || ''));
  return {
    kids: scr ? scr.children.length : -1,
    chars: txt.length,
    words: txt.split(/\s+/).filter(Boolean).length,
    text: txt.slice(0, 260),
    hasFail: !!fail,
    failBox: vis(fail),
    retryBox: vis(btn),
  };
});

const look = page => lookNow(page).catch(e => {
  if (/Execution context was destroyed|detached Frame|Target closed/i.test(String(e))) return { ...BLANK_SAMPLE };
  throw e;
});

/* Poll by WALL CLOCK, never by iteration count. An iteration count is a budget in
   units of "however long an evaluate took", which is exactly the number that
   drifts under load, and drifting past the 12s shell reload is what turns a
   measured red into a harness crash. Returns the elapsed ms, or -1 for never. */
async function waitFor(page, pred, ms, step = 100) {
  const t0 = Date.now();
  for (;;) {
    if (pred(await look(page))) return Date.now() - t0;
    if (Date.now() - t0 >= ms) return -1;
    await sleep(step);
  }
}

const alive = s => s.kids >= ALIVE_KIDS && s.chars >= ALIVE_CHARS;
const speaks = s => s.hasFail && s.chars >= SPEAKS_CHARS && s.words >= SPEAKS_WORDS
  && !!s.failBox && s.failBox.eff > 0.9 && s.failBox.onTop && s.failBox.w > 0 && s.failBox.h > 0
  && !!s.retryBox && s.retryBox.onTop;

/* A page that looks like a returning player's: no ?demo, navigator.webdriver
   false. app.js sets NOSOCIAL = S.demo || navigator.webdriver === true and skips
   bootSync entirely otherwise, so a normal godmode page could never reach cause
   1 and every row about it would be vacuous. Data safety is preserved a stronger
   way: a throwaway profile on a random loopback port that has never been
   visited, and the emptiness of that database is ASSERTED below, not assumed. */
async function realPlayerPage() {
  const p = await browser.newPage();
  await p.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
  });
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  return p;
}
const goto = (p, u) => p.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 })
  .catch(e => { if (!/net::ERR_ABORTED|Navigation timeout/.test(String(e))) throw e; });

/* The population this defect actually hits: a RETURNING player. bootSync returns
   'new-player' before it touches the network for a brand-new install, so a fresh
   profile could never reach cause 1, and a fresh profile also renders onboarding
   (1 child, 270 characters) rather than the Today screen the bounds are set
   against. An identity plus an account plus settings is what a returning player
   has, and it is what takes bootSync onto the wire. */
const seedReturningPlayer = p => p.evaluate(async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const id = { privJwk: await crypto.subtle.exportKey('jwk', kp.privateKey), pubJwk: await crypto.subtle.exportKey('jwk', kp.publicKey), createdAt: Date.now() };
  const db = await new Promise(r => { const q = indexedDB.open('tally'); q.onsuccess = () => r(q.result); });
  await new Promise(r => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put({ k: 'identity', v: id });
    tx.objectStore('kv').put({ k: 'social', v: { playerId: 'boot-speaks-audit', name: 'Audit' } });
    tx.objectStore('kv').put({ k: 'settings', v: { targets: { kcal: 2200, p: 160, c: 220, f: 70 }, sex: 'm', unit: 'kg' } });
    tx.objectStore('kv').delete('bootRestored');
    tx.oncomplete = r;
  });
  db.close();
});

const toastText = p => p.evaluate(() => ((document.getElementById('toast') || {}).textContent || '').trim());

/* ================= 0. CONTROL: a healthy boot ================= */
/* Without this row every bound below could be met by an app that renders nothing
   in ANY circumstance, and the whole file would be measuring its own harness. */
{
  const p = await realPlayerPage();
  let apiHits = 0;
  await p.setRequestInterception(true);
  p.on('request', r => {
    if (/\/api\//.test(r.url())) { apiHits++; r.respond({ status: 404, contentType: 'application/json', body: '{}' }).catch(() => {}); return; }
    r.continue().catch(() => {});
  });
  // first load creates the `tally` database on this throwaway origin
  await goto(p, `${srv.url}?api=${encodeURIComponent(API)}`);
  await sleep(2600);
  const pre = await p.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('tally'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const counts = await Promise.all(['log', 'foods', 'weights', 'xp'].map(st =>
      new Promise(r => { const q = db.transaction(st, 'readonly').objectStore(st).count(); q.onsuccess = () => r(q.result); q.onerror = () => r(-1); })));
    db.close();
    return counts;
  });
  ok('SAFETY the tally database on this loopback origin was created by this run and holds no rows',
    pre.every(n => n === 0), `log/foods/weights/xp = ${pre.join('/')}`);

  await seedReturningPlayer(p);
  await goto(p, `${srv.url}?api=${encodeURIComponent(API)}`);
  const ms = await waitFor(p, s2 => s2.kids > 0, 15000);
  await sleep(3000);
  const s = await look(p);

  ok('SAMPLE the api stub was reached, so the scenarios below are not measuring an app that never calls out',
    apiHits > 0, `${apiHits} intercepted /api request(s)`);
  ok(`CONTROL a healthy boot renders: >= ${ALIVE_KIDS} #screen children AND >= ${ALIVE_CHARS} characters (fewer is failure)`,
    alive(s), `screenKids=${s.kids} chars=${s.chars} words=${s.words} firstContent=${ms}ms`);
  ok('CONTROL a healthy boot shows no recovery message',
    !s.hasFail, `bootFail present=${s.hasFail}`);
  await p.close();
}

/* ================= 1. THE NETWORK HANG ================= */
/* A server that accepts the connection and NEVER ANSWERS. Held requests, not
   aborted ones: an abort rejects, and a rejection was never the problem. This is
   the exact shape of a captive portal and a dead middlebox. */
{
  const p = await realPlayerPage();
  const held = [];
  let mode = 'answer';
  await p.setRequestInterception(true);
  p.on('request', r => {
    if (!/\/api\//.test(r.url())) { r.continue().catch(() => {}); return; }
    if (mode === 'hang') { held.push(r); return; }      // accepted, never answered
    r.respond({ status: 404, contentType: 'application/json', body: '{}' }).catch(() => {});
  });

  await goto(p, `${srv.url}?api=${encodeURIComponent(API)}`);
  await sleep(2600);
  await seedReturningPlayer(p);

  mode = 'hang';
  await goto(p, `${srv.url}?api=${encodeURIComponent(API)}`);
  /* THE WINDOW STOPS AT 11s ON PURPOSE. index.html reloads a contentless shell
     at 12s, so anything measured after that could be the reload rather than the
     app carrying on, and this row is about the app carrying on. */
  const ms = await waitFor(p, s2 => s2.kids > 0, 11000);
  const s = await look(p);
  // the failure toast is fired on a 900ms timer after bootSync gives up, so it
  // cannot be read in the same sample as first content
  let toast = '';
  for (let i = 0; i < 15 && !/cloud backup/i.test(toast); i++) { toast = await toastText(p).catch(() => ''); await sleep(200); }

  ok('SAMPLE the hang was real: requests were accepted and never answered (zero held means this scenario measured NOTHING)',
    held.length > 0, `${held.length} request(s) held open`);
  ok(`HANG the app renders anyway, before the 12s shell reload: >= ${ALIVE_KIDS} children AND >= ${ALIVE_CHARS} characters (fewer is failure)`,
    alive(s), `screenKids=${s.kids} chars=${s.chars} firstContent=${ms}ms`);
  ok('HANG and it happens inside the bounded budget, not by luck (11,000ms ceiling, the 12s shell reload)',
    ms > 0 && ms < 11000, `firstContent=${ms}ms`);
  ok('HANG it is the REAL app on screen, not the recovery message',
    !s.hasFail, `bootFail present=${s.hasFail}`);
  ok('HANG the restore is treated as "not now" in the wording the definitive-failure path already uses, not as a loss',
    /cloud backup/i.test(toast) && /nothing has been lost/i.test(toast) && /try again next time/i.test(toast),
    `toast="${toast}"`);
  for (const r of held) r.abort('failed').catch(() => {});
  await p.close();
}

/* ================= 2. STORAGE DENIED ================= */
/* indexedDB.open throws SecurityError, which is what Firefox private browsing and
   a storage-blocked Safari actually do. The real indexedDB is kept in a closure
   so the retry row below can hand it back and prove the recovery is real. */
{
  const p = await realPlayerPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await p.evaluateOnNewDocument(() => {
    const real = window.indexedDB;
    window.__idbDeny = true;
    const boom = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      get: () => (window.__idbDeny
        ? { open: boom, deleteDatabase: boom, databases: () => Promise.reject(new DOMException('The operation is insecure.', 'SecurityError')), cmp: () => 0 }
        : real),
    });
  });
  await goto(p, `${srv.url}?demo`);
  const ms = await waitFor(p, s2 => s2.hasFail, 10000);
  await sleep(600);
  const s = await look(p);

  ok('SAMPLE storage really was denied (a SecurityError reached the page, so this is not a healthy boot in disguise)',
    await p.evaluate(() => { try { window.indexedDB.open('x'); return false; } catch (e) { return e.name === 'SecurityError'; } }),
    'indexedDB.open throws SecurityError');
  ok('DENIED the page is NOT the measured blank shell (0 children, <= 60 characters)',
    !(s.kids === 0 && s.chars <= BLANK_CHARS), `screenKids=${s.kids} chars=${s.chars}`);
  ok(`DENIED the player gets WORDS: >= ${SPEAKS_CHARS} characters AND >= ${SPEAKS_WORDS} words, visible (opacity chain + hit test) with a reachable Try again`,
    speaks(s), `chars=${s.chars} words=${s.words} fail=${JSON.stringify(s.failBox)} retry=${JSON.stringify(s.retryBox)}`);
  ok('DENIED the words say WHAT happened and WHAT to do, not just that something went wrong',
    /storage|private browsing|site data/i.test(s.text) && /try again|normal window|allow/i.test(s.text),
    `"${s.text.replace(/\n/g, ' / ').slice(0, 150)}"`);
  ok('DENIED the message arrives promptly, not after the 12s shell timer (this must be the app speaking, not the shell)',
    ms > 0 && ms < 10000, `message at ${ms}ms`);
  ok('DENIED nothing is left as an unhandled error on the page',
    errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : 'no page errors');

  /* THE CACHED REJECTION, MEASURED. js/db.js used to keep the FAILED open promise
     forever, so one denied open condemned the page even after storage came back
     and no retry could ever succeed. Hand the real indexedDB back and call the
     real module: it must open. This drives the same module instance boot used. */
  const retry = await p.evaluate(async () => {
    window.__idbDeny = false;
    try {
      const m = await import('/js/db.js');
      await m.kvSet('bootSpeaksAuditProbe', 'ok');
      return { ok: (await m.kvGet('bootSpeaksAuditProbe', null)) === 'ok' };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
  ok('RETRY a database call SUCCEEDS once storage is available again, so the rejected open is not cached for the life of the page',
    retry.ok, JSON.stringify(retry));
  await p.close();
}

/* ================= 3. AN UNFORESEEN THIRD THING ================= */
/* The general rule, and the only row here that names no cause. A throw is
   injected into boot() by rewriting the served js/app.js, which is the honest way
   to reach "some future thing throws": it drives the REAL boot().catch through
   the REAL module rather than calling the failure screen by hand. The injection
   itself is asserted, so a rewrite that silently missed cannot pass. */
{
  const p = await realPlayerPage();
  const SRC = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const ANCHOR = 'async function boot() {';
  const INJECT = `${ANCHOR}\n  if (location.search.indexOf('bhthrow') >= 0) throw new Error('injected: an unforeseen third thing during boot');`;
  const patched = SRC.replace(ANCHOR, INJECT);
  let served = false;
  await p.setRequestInterception(true);
  p.on('request', r => {
    if (/\/js\/app\.js(\?|$)/.test(r.url())) {
      served = true;
      r.respond({ status: 200, contentType: 'text/javascript', body: patched }).catch(() => {});
      return;
    }
    r.continue().catch(() => {});
  });
  await goto(p, `${srv.url}?demo&bhthrow=1`);
  await waitFor(p, s2 => s2.hasFail, 10000);
  await sleep(600);
  const s = await look(p);

  ok('SAMPLE the throw was really injected (patched source differs from disk AND was served)',
    patched !== SRC && served, `patched=${patched !== SRC} served=${served}`);
  ok('UNFORESEEN the page is NOT the measured blank shell (0 children, <= 60 characters)',
    !(s.kids === 0 && s.chars <= BLANK_CHARS), `screenKids=${s.kids} chars=${s.chars}`);
  ok(`UNFORESEEN an unnamed boot failure still gets WORDS: >= ${SPEAKS_CHARS} characters AND >= ${SPEAKS_WORDS} words, visible, with a reachable Try again`,
    speaks(s), `chars=${s.chars} words=${s.words} fail=${JSON.stringify(s.failBox)} retry=${JSON.stringify(s.retryBox)}`);
  ok('UNFORESEEN it does not tell the player their data is gone, because it is not',
    /nothing has been lost|still on this device/i.test(s.text) && !/lost your|data (was )?lost|deleted|wiped/i.test(s.text),
    `"${s.text.replace(/\n/g, ' / ').slice(0, 150)}"`);
  await p.close();
}

/* ================= 4. THE MODULE GRAPH NEVER RUNS ================= */
/* app.js never executes at all, so nothing in js/ can speak: this is index.html's
   own recovery script, and the case it used to LOSE in silence. It gets its one
   reload, that reload fails too, and then it must say something. The loop guard
   is asserted in the same breath, because a message is not worth a reload loop. */
{
  const p = await realPlayerPage();
  let navs = 0, blocked = 0;
  p.on('framenavigated', f => { if (f === p.mainFrame()) navs++; });
  await p.setRequestInterception(true);
  p.on('request', r => {
    if (/\/js\/haptics\.js/.test(r.url())) { blocked++; r.abort('failed').catch(() => {}); return; }
    r.continue().catch(() => {});
  });
  await goto(p, `${srv.url}?demo`);
  const early = await look(p);
  // 12s to the reload, 12s more to the losing branch, plus slack for both loads
  // 12s to the reload, 12s more to the losing branch, plus slack for both loads
  await waitFor(p, s2 => s2.hasFail, 34000, 250);
  const s = await look(p);

  ok('SAMPLE the module graph really was broken (js/haptics.js blocked at least once)',
    blocked > 0, `${blocked} blocked request(s)`);
  ok('SAMPLE the shell really was dead to begin with, or nothing below means anything',
    early.kids === 0 && early.chars <= BLANK_CHARS, `screenKids=${early.kids} chars=${early.chars}`);
  ok(`DEAD SHELL when the one reload loses, the shell SPEAKS: >= ${SPEAKS_CHARS} characters AND >= ${SPEAKS_WORDS} words, visible, with a reachable Try again`,
    speaks(s), `screenKids=${s.kids} chars=${s.chars} words=${s.words} fail=${JSON.stringify(s.failBox)} retry=${JSON.stringify(s.retryBox)}`);
  ok('DEAD SHELL the words blame the download and not the player, and promise their gym is safe',
    /connection|download/i.test(s.text) && /nothing has been lost|safe on this device/i.test(s.text),
    `"${s.text.replace(/\n/g, ' / ').slice(0, 150)}"`);
  ok('DEAD SHELL and it still reloads exactly ONCE: a message must never become a reload loop',
    navs === 2, `${navs} navigation(s) (1 = never retried, 3+ = loop)`);
  await p.close();
}

await bootPage.close().catch(() => {});
await browser.close();
srv.close();
console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`);
process.exit(fails.length ? 1 : 0);
