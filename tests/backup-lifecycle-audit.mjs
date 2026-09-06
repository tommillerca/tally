/* R38-2 (2026-09-06, measured on v477 against a v477 Worker; main is v482,
 * re-verified on this tree before writing the fix): a whole session never
 * reached the cloud. BACKUP_THROTTLE_MS was 600s and the encrypted backup
 * only ever pushed at boot/resume (js/app.js bindAppLifecycle), so nothing
 * pushed on background or on close: a logged meal and two opened crates
 * were gone on restore because the throttle was still counting down when
 * the app closed.
 *
 * FIX: js/social.js now wires document visibilitychange->hidden and
 * window pagehide (js/native.js onAppHide) to a push decided by
 * dueBackupPush() -- due by the ordinary 600s throttle, OR (past a 20s
 * floor) because the exported save has grown since the last push. Wired
 * inside social.js itself, not app.js's boot/update code, so this fix
 * cannot collide with the lane working that file.
 *
 * tests/unit.test.js carries the Node-level prove-red on dueBackupPush's
 * decision (grown vs unchanged, inside vs past the floor). This file is the
 * companion the brief asked for: drive the REAL client in a REAL browser,
 * log a meal, fire the actual visibilitychange event, and watch a mock
 * Worker (the flaky-network-audit.mjs pattern: a plain http.createServer
 * standing in for bonez-api, driven with ?api=) for the PUT /backup that
 * must now arrive.
 *
 * PROVE-RED: with the onAppHide wiring reverted (autoSync's old bare
 * `elapsed > BACKUP_THROTTLE_MS`, no floor, no background/close hook),
 * this fails:
 *   FAIL  R38-2 BROWSER: visibilitychange->hidden pushes a PUT /backup for a grown save
 *     saw 0 PUT /backup call(s) after the hidden transition
 * because nothing is listening for the hidden transition at all.
 *
 * Usage: node tests/backup-lifecycle-audit.mjs
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep, dismissOverlays } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

/* ---------------------------------------------------------------- mock Worker */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS',
};
const seenBackupPuts = [];
const ROUTES = {
  'GET /friends': () => ({ friends: [], incoming: [], outgoing: [] }),
  'GET /leaderboard': () => ({ players: [] }),
  'GET /grants': () => ({ grants: [], cursor: 0 }),
  'GET /me': () => ({}),
  'GET /health': () => ({ ok: true, day: '2026-09-06' }),
  'GET /steps/settled': () => ({}),
  'GET /spires/mine': () => ({ spires: [] }),
  'PUT /profile': () => ({ ok: true }),
  'PUT /backup': (body) => { seenBackupPuts.push(body); return { ok: true, updatedAt: Date.now() }; },
};
const apiSrv = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  const p = new URL(req.url, 'http://x').pathname;
  let raw = ''; for await (const c of req) raw += c;
  const h = ROUTES[`${req.method} ${p}`];
  const out = h ? await h(raw ? JSON.parse(raw) : null) : null;
  if (!out) { res.writeHead(404, { ...CORS, 'content-type': 'application/json' }); res.end('{"error":"none"}'); return; }
  res.writeHead(200, { ...CORS, 'content-type': 'application/json' }); res.end(JSON.stringify(out));
});
await new Promise(r => apiSrv.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${apiSrv.address().port}`;

/* ---------------------------------------------------------------- the tree */
const srv = await serveTree(ROOT);
const BASE = srv.url;
console.log(`URL UNDER TEST: ${BASE}   mock API: ${API}`);

const { browser, page } = await boot(BASE, { headless: process.env.HEADLESS_MODE || 'shell' });
try {
  await page.goto(`${BASE}?demo&api=${encodeURIComponent(API)}`, { waitUntil: 'networkidle2' });
  await sleep(2400);
  await dismissOverlays(page);

  // A registered social identity, so isOnline()/dueBackupPush see a real
  // account rather than bailing at the first check.
  await page.evaluate(async () => {
    const idb = await new Promise((res, rej) => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => {
      const tx = idb.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ k: 'social', v: { playerId: 'me', handle: 'Test Bones', friendCode: 'ZZZ999', name: null, onlineAt: Date.now() } });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    idb.close();
  });

  // Log a meal: the same 'log' row shape the real Add flow writes, so the
  // export genuinely grows (the thing dueBackupPush's floor-bypass checks).
  await page.evaluate(async () => {
    const idb = await new Promise((res, rej) => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => {
      const tx = idb.transaction('log', 'readwrite');
      tx.objectStore('log').put({ id: 'r38-2-browser-meal', at: Date.now(), kcal: 450, name: 'Test Meal' });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    idb.close();
  });

  // CONTROL: with the tab still visible and nothing fired, the grown save must
  // NOT push on its own within the same wait window. Without this, a PASS below
  // would not distinguish "the hidden transition caused the push" from "this
  // build pushes on some unrelated timer regardless of visibility" -- the exact
  // kind of blind guard tests/guard-hygiene-lint.mjs exists to catch.
  await sleep(3000);
  const beforeControl = seenBackupPuts.length;
  ok('R38-2 CONTROL: a grown save does not push on its own with no hidden transition',
    beforeControl === 0, `saw ${beforeControl} PUT /backup call(s) with no trigger fired`);

  const before = seenBackupPuts.length;

  // Fire the real backgrounding transition: override the (normally read-only)
  // document.hidden/visibilityState getters and dispatch the event the app
  // actually listens for. This is the standard way to simulate tab-hiding
  // under a driven browser; nothing here calls the app's own push function.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await sleep(3000); // async ECDSA signing + AES-GCM encryption + the fetch round trip

  ok('R38-2 BROWSER: visibilitychange->hidden pushes a PUT /backup for a grown save',
    seenBackupPuts.length > before,
    `saw ${seenBackupPuts.length - before} PUT /backup call(s) after the hidden transition`);
} finally {
  await browser.close().catch(() => {});
  srv.close();
  apiSrv.close();
}

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
