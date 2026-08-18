/* A FAILED CLOUD RESTORE MUST SPEAK, AND MUST BE RETRIED. MEASURED, NOT PARSED.
 *
 * The bug (shipped, then fixed in 17a977f): bootSync ran
 * `await kvSet('bootRestored', true)` immediately after pullBackup, WHATEVER the
 * outcome. One transient 500 on the one boot where the restore was supposed to
 * happen permanently forfeited it: the flag read "already restored" on every
 * later boot and the player kept an empty save with a perfectly good backup
 * sitting on the server, forever, in silence. The missing toast was the symptom;
 * the burned one-shot was the data loss.
 *
 * WHY THIS FILE WAS REWRITTEN. The first version of this guard read js/social.js
 * as TEXT and pinned the SHAPE of the code, down to "an unguarded `kvSet` on its
 * own line". Reg is right that that is not a guard: a refactor that keeps the bug
 * but moves the line PASSES, and a different correct fix FAILS. It measured
 * source formatting. This one runs the app, stubs the vault, and reads the flag
 * out of IndexedDB and the message off the screen.
 *
 * TWO THINGS THIS HAS TO DEFEAT TO RUN AT ALL, both documented so the next person
 * does not "simplify" them back out:
 *
 *  1. app.js:577 `const NOSOCIAL = S.demo || navigator.webdriver === true`, so
 *     under a normal godmode boot (?demo, webdriver) bootSync is NEVER CALLED and
 *     a browser check of it would be vacuous. So this boots WITHOUT ?demo and
 *     spoofs navigator.webdriver to false. That is also why it does not use
 *     godmode's seed(): seed() rightly refuses any page that is not ?demo.
 *     Data safety is preserved a different way, and it is stronger: puppeteer
 *     launches a throwaway profile, and the origin is a random loopback port from
 *     serveTree that has never been visited, so the `tally` database this touches
 *     is created by this run and dies with the browser. It asserts that: an
 *     already-populated database aborts the run rather than writing to it.
 *  2. With webdriver spoofed, showSplash and the gate intro stop skipping and
 *     would paint an overlay over the very toast being measured. Both also skip
 *     under reduced motion, so the page is emulated with
 *     prefers-reduced-motion: reduce.
 *
 * The API base is the SAME ORIGIN as the served tree (?api=<srv>/api) on purpose:
 * signedFetch sends x-bh-* headers, and cross-origin that would fire a CORS
 * preflight this harness would have to fake too.
 *
 * PROVE-RED: `git worktree add <tmp> 17a977f^` and run this file there. The
 * HTTP-500 and DROPPED rows go red (flag burned, nothing said) while the 404 and
 * EMPTY rows stay green, which is what a discriminating check looks like: the
 * pre-fix tree is not uniformly wrong, it is wrong in exactly two places.
 *
 * Usage: node tests/cloud-restore-silent-audit.mjs
 */
import { boot, serveTree, sleep } from './godmode.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const srv = await serveTree(process.cwd());
const API = srv.url.replace(/\/$/, '') + '/api';
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });

/* ---- make this page look like a real player's, not a test rig ---- */
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
});
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

/* ---- the vault stub ---- */
let mode = { kind: 'pass' };           // 'pass' | 'status' | 'abort'
let backupHits = 0;
await page.setRequestInterception(true);
page.on('request', req => {
  if (!/\/api\/backup(\?|$)/.test(req.url())) { req.continue().catch(() => {}); return; }
  backupHits++;
  if (mode.kind === 'abort') { req.abort('failed').catch(() => {}); return; }
  req.respond({ status: mode.status, contentType: 'application/json', body: mode.body ?? '{}' }).catch(() => {});
});

const goto = u => page.goto(u, { waitUntil: 'networkidle2' }).catch(e => { if (!/net::ERR_ABORTED/.test(String(e))) throw e; });

/* First non-demo load: creates the `tally` database and runs bootSync once with
   no identity (reason 'new-player', a quiet path). */
await goto(`${srv.url}?api=${encodeURIComponent(API)}`);
await sleep(2600);

const kvPut = rows => page.evaluate(async a => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('tally'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    for (const [k, v] of a.put) tx.objectStore('kv').put({ k, v });
    for (const k of a.del) tx.objectStore('kv').delete(k);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  db.close();
}, rows);

const kvGet = k => page.evaluate(async key => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('tally'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const out = await new Promise((res, rej) => {
    const q = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    q.onsuccess = () => res(q.result === undefined ? { present: false } : { present: true, v: q.result.v });
    q.onerror = () => rej(q.error);
  });
  db.close();
  return out;
}, k);

/* SAFETY, and it is an assertion, not a comment: refuse to run against anything
   that already looks like a save. A fresh loopback origin has none of these. */
const pre = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('tally'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const counts = await Promise.all(['log', 'foods', 'weights', 'xp'].map(s =>
    new Promise(r => { const q = db.transaction(s, 'readonly').objectStore(s).count(); q.onsuccess = () => r(q.result); q.onerror = () => r(-1); })));
  db.close();
  return counts;
});
if (pre.some(n => n > 0)) throw new Error(`refusing to run: the tally database on ${srv.url} already holds rows (${pre}). This audit writes to it and must only ever see a database it created.`);

/* An identity, so signedFetch actually reaches the network instead of throwing
   'offline' before it and turning every row below into the same generic error. */
await page.evaluate(async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const id = { privJwk: await crypto.subtle.exportKey('jwk', kp.privateKey), pubJwk: await crypto.subtle.exportKey('jwk', kp.publicKey), createdAt: Date.now() };
  const db = await new Promise(r => { const q = indexedDB.open('tally'); q.onsuccess = () => r(q.result); });
  await new Promise(r => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put({ k: 'identity', v: id });
    tx.objectStore('kv').put({ k: 'social', v: { playerId: 'audit-player', name: 'Audit' } });
    tx.oncomplete = r;
  });
  db.close();
});

/* ---- what the player can actually see ----
   VISIBILITY, not presence. This app has shipped several "it is in the DOM but
   nobody can see it" bugs, so: the effective opacity product all the way up the
   ancestor chain (freeze-reveal-audit's technique), plus a hit test at the
   toast's own centre, which is what catches a message painted UNDER a splash. */
const toastLook = () => page.evaluate(() => {
  const t = document.getElementById('toast');
  if (!t) return { exists: false };
  const r = t.getBoundingClientRect();
  let o = 1, n = t;
  while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
  const cs = getComputedStyle(t);
  const hit = r.width && r.height ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
  return {
    exists: true, hidden: t.hidden, text: (t.textContent || '').trim(), eff: +o.toFixed(3),
    w: Math.round(r.width), h: Math.round(r.height), vis: cs.visibility, disp: cs.display,
    onTop: !!hit && (hit === t || t.contains(hit)),
  };
});
const seenBy = s => s.exists && !s.hidden && !!s.text && s.eff > 0.9 && s.w > 0 && s.h > 0 && s.vis === 'visible' && s.disp !== 'none' && s.onTop;

/* Watch the WHOLE window rather than sampling once: the toast is fired on a 900ms
   timer after a boot that itself takes a couple of seconds, and a "quiet" row is
   only honest if nothing appeared at any point in it. */
async function watchToast(ms = 9000, step = 200) {
  let best = null, sightings = 0;
  for (let t = 0; t < ms; t += step) {
    const s = await toastLook();
    if (seenBy(s)) { sightings++; if (!best || s.eff > best.eff) best = s; }
    await sleep(step);
  }
  return { best, sightings };
}

async function scenario(m, { preFlag = null } = {}) {
  mode = m;
  backupHits = 0;
  await kvPut(preFlag === null ? { put: [], del: ['bootRestored'] } : { put: [['bootRestored', preFlag]], del: [] });
  await goto(`${srv.url}?api=${encodeURIComponent(API)}`);
  const t = await watchToast();
  return { ...t, flag: await kvGet('bootRestored'), hits: backupHits };
}

/* ================= 1. a transient 500 ================= */
const r500 = await scenario({ kind: 'status', status: 500, body: '{"error":"boom"}' });

ok('SAMPLE the stub was actually reached (zero /backup requests means this audit measured NOTHING)',
  r500.hits > 0, `${r500.hits} intercepted /backup request(s)`);

ok('RETRY a failed restore does NOT burn the one-shot: bootRestored is still unset, so the next boot tries again',
  r500.flag.present === false, JSON.stringify(r500.flag));

ok('SPEAKS the player is TOLD the cloud restore failed',
  !!r500.best, r500.best ? `"${r500.best.text}"` : `no visible toast in 9s (last look: ${JSON.stringify(await toastLook())})`);

ok('SPEAKS the message is VISIBLE, not merely in the DOM (opacity chain + hit test at its own centre)',
  !!r500.best && r500.best.eff > 0.9 && r500.best.onTop,
  r500.best ? `eff=${r500.best.eff} onTop=${r500.best.onTop} ${r500.best.w}x${r500.best.h}` : 'nothing to measure');

ok('HONEST the wording does not tell the player their data was lost',
  !r500.best || !/lost your|data (was )?lost|deleted|gone/i.test(r500.best.text),
  r500.best ? `"${r500.best.text}"` : 'no toast');

/* ================= 2. a dropped connection ================= */
/* A different code path: this throws inside pullBackup rather than returning an
   http-* reason, and it is the case the shipped bug was reported against. */
const rAbort = await scenario({ kind: 'abort' });
ok('SAMPLE the dropped-connection stub was reached', rAbort.hits > 0, `${rAbort.hits} request(s)`);
ok('RETRY a dropped connection does NOT burn the one-shot either',
  rAbort.flag.present === false, JSON.stringify(rAbort.flag));
ok('SPEAKS a dropped connection is visible to the player',
  !!rAbort.best, rAbort.best ? `"${rAbort.best.text}"` : 'no visible toast in 9s');

/* ================= 3. the quiet paths ================= */
/* These are the positive control for the flag. If the flag were simply never set
   any more, the two rows above would pass for the wrong reason; here it MUST be
   set, because a 404 and an empty vault are definitive answers with nothing left
   to restore. And neither may say a word: a returning player on a healthy boot
   must not be handed an alarming message. */
const rNone = await scenario({ kind: 'status', status: 404, body: '{}' });
ok('SAMPLE the no-backup stub was reached', rNone.hits > 0, `${rNone.hits} request(s)`);
ok('QUIET a definitive "no backup on the server" (404) DOES settle the one-shot',
  rNone.flag.present === true && rNone.flag.v === true, JSON.stringify(rNone.flag));
ok('QUIET a 404 says nothing to the player',
  !rNone.best, rNone.best ? `toasted "${rNone.best.text}" (${rNone.sightings} sightings)` : 'silent for 9s');

const rEmpty = await scenario({ kind: 'status', status: 200, body: '{"updatedAt":0}' });
ok('SAMPLE the empty-vault stub was reached', rEmpty.hits > 0, `${rEmpty.hits} request(s)`);
ok('QUIET an empty vault DOES settle the one-shot',
  rEmpty.flag.present === true && rEmpty.flag.v === true, JSON.stringify(rEmpty.flag));
ok('QUIET an empty vault says nothing to the player',
  !rEmpty.best, rEmpty.best ? `toasted "${rEmpty.best.text}"` : 'silent for 9s');

const rAlready = await scenario({ kind: 'status', status: 500, body: '{}' }, { preFlag: true });
ok('QUIET an already-restored boot does not even ASK the server',
  rAlready.hits === 0, `${rAlready.hits} request(s)`);
ok('QUIET an already-restored boot says nothing to the player',
  !rAlready.best, rAlready.best ? `toasted "${rAlready.best.text}"` : 'silent for 9s');

await browser.close(); srv.close?.();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\na failed cloud restore speaks, and is retried');
process.exit(fails.length ? 1 : 0);
