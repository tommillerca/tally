/* THE FRIEND AND CREW FLOW, WITH TWO REAL PLAYERS.
 *
 * Every other social check in tests/ drives ONE browser against seeded fixtures
 * (__testFriends, __testMe) or a hand-written ledger row. Nothing had ever put
 * two clients on one relationship, which is the only place a whole class of bug
 * can live: A accepted and B still shows pending, A removed and B still shows
 * friends, a gift that pays on one device and again on the other.
 *
 * So this one boots TWO browser profiles and starts its OWN Cloudflare Worker on
 * a free port with the project's real server/src/index.js and a real local D1.
 * Two accounts, two friend codes, one relationship, and every assertion is read
 * from BOTH sides.
 *
 * WHAT IT LOCKS DOWN
 *   ADD       A adds B by code; A sees Pending, B sees the request, naming A
 *   ACCEPT    B accepts; BOTH lists now hold the other, and A's Pending is gone
 *   SEALED    a gift does not pay on arrival; it sits in B's box with an OPEN
 *   PAYS-ONCE opening it pays the exact coins, once
 *   AGAIN     re-delivering that same grant key pays NOTHING and does not put
 *             the opened present back in the box            <- the v387 finding
 *   LEDGER    the same, for a coins-only grant that is not a gift (the step-race
 *             podium and /admin/grant payloads carry no xp either)
 *   CAP-GIFT  the 6th coin gift of the day is refused, and B receives exactly 5
 *   CAP-CHEER the 11th cheer is refused, and B receives exactly 10
 *   SELF      adding, accepting, gifting and cheering yourself are all refused
 *   REMOVE    A removes B; the removal is visible on BOTH lists, and gift and
 *             cheer to the ex-friend are refused from either side
 *
 * DIRECTION AND BOUND, per anti-regression rule 11. Every payout row here fails
 * in the direction of PAYING MORE, and every one is asserted as an exact equality
 * against a number computed before the action, never as a trend. AGAIN and LEDGER
 * would pass on a trend check ("coins went up") precisely when the app is broken.
 * The cap rows are bounded the same way: exactly 5 and exactly 10 delivered, not
 * "some were refused".
 *
 * PROVEN RED, 2026-08-17, in a throwaway `git archive` tree with the two
 * js/social.js guards reverted to their v387 form: AGAIN and LEDGER go red on
 * three rows (an opened gift comes back sealed, re-opening pays 100 again, a
 * re-ingested make-good pays 500 again), exit 1. Everything else stays green,
 * which is the point: this file is about the FLOW, and the flow itself is sound.
 *
 * An empty sample set is a FAILURE: every count is asserted non-zero, and the
 * run aborts if either account fails to register or the two never become friends.
 *
 * NO LIVE HOST. serveTree() serves this checkout, the Worker is spawned here on
 * a free port, and every page is behind a request interceptor that ABORTS any
 * request that is not 127.0.0.1. godmode boot() defaults to the production site,
 * so the base is always passed explicitly.
 *
 *   node tests/crew-pair-audit.mjs
 *   API=http://127.0.0.1:8788 node tests/crew-pair-audit.mjs   (reuse a Worker)
 */
import path from 'node:path';
import net from 'node:net';
import { existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree, dismissOverlays } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};
const die = msg => { console.log(`FAIL  ${msg}`); process.exit(1); };

/* ---------------- the Worker ----------------
   Spawned here rather than assumed running, for the same reason serveTree exists:
   a hard-coded port that nothing bound means the audit talks to whatever IS
   listening, or silently to nothing. If it does not answer /health, this is a
   FAILURE, never a skip. */
/* Resolve wrangler's OWN entry point and run it under this node, never through
   `npx`. Measured here 2026-08-17: an `npx wrangler dev` child is SIGTERMed
   1.5-20 seconds after it comes up (npx cannot reach the registry from this
   box, and it takes the worker down with it when it gives up), which reads as
   "the server crashed" rather than "the launcher did". Same resolution order as
   godmode's loadPuppeteer: the project's own install first, the shared cache
   second, and a THROW naming both if neither exists. */
function wranglerEntry() {
  const candidates = [
    path.join(ROOT, 'server/node_modules/wrangler/bin/wrangler.js'),
    path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'),
  ];
  const npxRoot = path.join(process.env.HOME || '/root', '.npm/_npx');
  try {
    for (const d of readdirSync(npxRoot)) candidates.push(path.join(npxRoot, d, 'node_modules/wrangler/bin/wrangler.js'));
  } catch { /* no npx cache */ }
  const hit = candidates.find(f => existsSync(f));
  if (!hit) die(`no wrangler found. Looked in:\n    ${candidates.join('\n    ')}\n  Fix: npm i -D wrangler in server/.`);
  return hit;
}

async function startWorker() {
  if (process.env.API) return { url: process.env.API, close: () => {} };
  const port = await new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  });
  const dir = path.join(ROOT, 'server');
  const bin = wranglerEntry();
  const seed = spawn(process.execPath, [bin, 'd1', 'execute', 'bonez', '--local', '--file=schema.sql'],
    { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise(r => seed.on('exit', r));
  const p = spawn(process.execPath, [bin, 'dev', '--local', '--port', String(port),
    '--var', 'DEV:1', '--var', 'ADMIN_TOKEN:devtoken'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  p.stderr.on('data', d => { err += d; });
  p.stdout.on('data', d => { err += d; });
  let exited = null;
  p.on('exit', (c, s) => { exited = s || `exit ${c}`; });
  const url = `http://127.0.0.1:${port}`;
  const t0 = Date.now();
  for (;;) {
    if (exited) die(`the Worker died before serving ${url} (${exited}). ${err.trim().split('\n').pop() || ''}`);
    try { if ((await fetch(url + '/health')).ok) break; } catch { /* not up */ }
    if (Date.now() - t0 > 60000) { p.kill('SIGKILL'); die(`nothing answered on ${url}/health within 60s. ${err.trim() || '(silent)'}`); }
    await sleep(400);
  }
  return { url, close: () => { try { p.kill('SIGKILL'); } catch { /* gone */ } } };
}

const api = await startWorker();
const srvHandle = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srvHandle.url;
const pageUrl = `${base.replace(/\/?$/, '/')}?demo&api=${encodeURIComponent(api.url)}`;
const cleanup = async (...browsers) => {
  for (const b of browsers) await b?.close().catch(() => {});
  srvHandle?.close();
  api.close();
};

/* ---------------- one player ---------------- */
async function lockToLocal(page) {
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(u) || u.startsWith('data:') || u.startsWith('blob:')) r.continue();
    else { console.log('BLOCKED (not 127.0.0.1)', u); r.abort(); }
  });
}
async function bootPlayer() {
  const { browser, page } = await boot(base);
  await lockToLocal(page);
  await page.goto(pageUrl, { waitUntil: 'networkidle2' });
  await sleep(2600);
  await dismissOverlays(page);
  return { browser, page };
}
const kvGet = (p, k) => p.page.evaluate(async (key) => {
  const d = await new Promise((res, rej) => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return await new Promise((res, rej) => { const t = d.transaction('kv').objectStore('kv').get(key); t.onsuccess = () => res(t.result ? t.result.v : null); t.onerror = () => rej(t.error); });
}, k);
const kvPut = (p, k, v) => p.page.evaluate(async (key, val) => {
  // same guard as godmode seed(): only ever the demo database
  if (!new URLSearchParams(location.search).has('demo')) throw new Error('not ?demo');
  const d = await new Promise((res, rej) => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return await new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put({ k: key, v: val }); t.oncomplete = () => res(true); t.onerror = () => rej(t.error); });
}, k, v);
/* THE DEVICE SYNCS. app.js gates its boot autoSync behind NOSOCIAL (?demo OR
   navigator.webdriver), which every automated session is, so the delivery path
   can only be reached by calling it. A dynamic import of the SAME module URL
   app.js imported hands back the SAME live module instance, so this is the real
   pullGrants over the real signed fetch, not a re-implementation of it. */
const soc = (p, fn, ...args) => p.page.evaluate(async (f, a) => {
  const m = await import('/js/social.js');
  return await m[f](...a);
}, fn, args);
const sync = p => p.page.evaluate(async () => {
  const m = await import('/js/social.js');
  const r = await m.pullGrants();
  return { applied: r.applied, keys: (r.grants || []).map(g => g.key) };
});
const coinsOf = p => kvGet(p, 'coins').then(c => c || 0);
const goCrew = async p => {
  await p.page.evaluate(() => { location.hash = '#/today'; }); await sleep(400);
  await p.page.evaluate(() => { location.hash = '#/friends'; }); await sleep(2200);
  await dismissOverlays(p.page); await sleep(400);
};
// What the CREW TAB is actually showing: the request rows, the fan, the sealed gifts.
const shown = p => p.page.evaluate(() => ({
  sections: [...document.querySelectorAll('.fl-sect')].map(s => s.querySelector('.fl-h')?.textContent || ''),
  accept: [...document.querySelectorAll('[data-accept]')].map(e => e.dataset.accept),
  crew: [...document.querySelectorAll('[data-fan]')].map(e => e.dataset.fan),
  sealed: [...document.querySelectorAll('[data-gift]')].map(e => e.dataset.gift),
}));
const devGrant = (playerId, key, payload) => fetch(`${api.url}/dev/grant`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ playerId, key, type: 'social', payload }),
}).then(r => r.json());

const A = await bootPlayer();
const B = await bootPlayer();
try {
  for (const p of [A, B]) {
    await goCrew(p);
    await p.page.evaluate(() => document.getElementById('crewGoOnline')?.click());
    await sleep(3200); await dismissOverlays(p.page);
  }
  const meA = await kvGet(A, 'social'), meB = await kvGet(B, 'social');
  if (!meA?.playerId || !meB?.playerId) die(`both players must register (A=${JSON.stringify(meA)} B=${JSON.stringify(meB)})`);
  if (meA.playerId === meB.playerId) die('the two browsers registered as the SAME account: this audit would prove nothing');
  console.log(`      A ${meA.playerId} ${meA.friendCode}\n      B ${meB.playerId} ${meB.friendCode}`);
  // drain the welcome grant on both, so every later coin delta is the thing under test
  await sync(A); await sync(B);
  await kvPut(A, 'coins', 9000); await kvPut(B, 'coins', 1000);

  /* ---------------- ADD ---------------- */
  await goCrew(A);
  await A.page.evaluate(code => {
    document.getElementById('friendCode').value = code;
    document.getElementById('friendAddBtn').click();
  }, meB.friendCode);
  await sleep(2500);
  const addA = await shown(A);
  ok('ADD    A sees B as Pending after adding by code', addA.sections.some(h => /pending/i.test(h)), JSON.stringify(addA.sections));
  await goCrew(B);
  const addB = await shown(B);
  ok('ADD    B sees an incoming request, and it names A',
    addB.accept.includes(meA.playerId) && addB.sections.some(h => /wants to be friends/i.test(h)),
    JSON.stringify(addB));

  /* ---------------- ACCEPT ---------------- */
  await B.page.evaluate(id => document.querySelector(`[data-accept="${id}"]`).click(), meA.playerId);
  await sleep(2600);
  const accB = await shown(B);
  ok('ACCEPT B\'s Crew holds A the moment B accepts', accB.crew.includes(meA.playerId), JSON.stringify(accB.crew));
  await goCrew(A);
  const accA = await shown(A);
  ok('ACCEPT A\'s Crew holds B without A doing anything', accA.crew.includes(meB.playerId), JSON.stringify(accA.crew));
  ok('ACCEPT A\'s Pending row is gone (the two sides tell one story)',
    !accA.sections.some(h => /pending/i.test(h)), JSON.stringify(accA.sections));
  if (!accA.crew.includes(meB.playerId) || !accB.crew.includes(meA.playerId)) die('the pair never became friends: nothing below would mean anything');

  /* ---------------- SEALED / PAYS-ONCE / AGAIN ---------------- */
  const GIFT = 100;
  const sent = await soc(A, 'sendGift', meB.playerId, 'spend', GIFT);
  ok('GIFT   the server accepts A\'s coin gift to B', sent.ok === true, JSON.stringify(sent));
  const b0 = await coinsOf(B);
  const pulled = await sync(B);
  ok('GIFT   the grant reaches B\'s device', pulled.keys.length === 1 && /^gift-spend-/.test(pulled.keys[0]), JSON.stringify(pulled));
  const b1 = await coinsOf(B);
  ok('SEALED arriving pays NOTHING: it is a present, not a receipt', b1 === b0, `${b0} -> ${b1}`);
  await goCrew(B);
  const sealed = (await shown(B)).sealed;
  ok('SEALED B\'s Crew tab shows exactly one unopened gift', sealed.length === 1, `${sealed.length} sealed`);
  if (sealed.length !== 1) die('no sealed gift to open: an empty sample set is a failure');
  await B.page.evaluate(k => document.querySelector(`[data-gift="${k}"]`).click(), sealed[0]);
  await sleep(2600); await dismissOverlays(B.page);
  const b2 = await coinsOf(B);
  ok(`PAYS-ONCE opening it pays exactly ${GIFT}`, b2 === b1 + GIFT, `${b1} -> ${b2}, expected ${b1 + GIFT}`);

  /* The delivery cursor is kv the CLIENT holds, so anything that rewinds it
     re-delivers the grant: a restore from backup, a reinstall that pulls the
     cloud save, a second tab or a second device on the same account pulling from
     its own cursor, or a pull whose loop is interrupted before it writes the
     cursor back. Modelled here at its root, by rewinding the cursor: what must
     hold is that a SECOND delivery of an already-consumed key pays nothing. */
  await kvPut(B, 'grantCursor', 0);
  await kvPut(B, 'grantsSeen', []);
  const re = await sync(B);
  ok('AGAIN  the same grant really is re-delivered (an empty re-pull proves nothing)',
    re.keys.some(k => k === sealed[0]), JSON.stringify(re.keys));
  const b3 = await coinsOf(B);
  ok('AGAIN  re-delivery alone pays nothing', b3 === b2, `${b2} -> ${b3}`);
  await goCrew(B);
  const resealed = (await shown(B)).sealed;
  ok('AGAIN  an already-opened present does NOT come back sealed', resealed.length === 0, `${resealed.length} sealed again`);
  if (resealed.length) {
    await B.page.evaluate(k => document.querySelector(`[data-gift="${k}"]`).click(), resealed[0]);
    await sleep(2600); await dismissOverlays(B.page);
  }
  const b4 = await coinsOf(B);
  ok(`AGAIN  the ${GIFT} coins are never paid a second time`, b4 === b2, `${b2} -> ${b4}`);

  /* ---------------- LEDGER: the same, for a payload that is not a gift ----
     The step-race podium and /admin/grant both pay coins with no xp in the
     payload, and both land through applyPayload directly (not held). /dev/grant
     writes exactly that shape. */
  const MAKEGOOD = 500;
  const cur = await kvGet(B, 'grantCursor');
  await devGrant(meB.playerId, `makegood-${Date.now()}`, { coins: MAKEGOOD, note: 'Sorry about that' });
  const c0 = await coinsOf(B);
  const g1 = await sync(B);
  const c1 = await coinsOf(B);
  ok('LEDGER a coins-only make-good pays its coins once', c1 === c0 + MAKEGOOD, `${c0} -> ${c1}, expected ${c0 + MAKEGOOD}`);
  await kvPut(B, 'grantCursor', cur || 0);
  await kvPut(B, 'grantsSeen', []);
  const g2 = await sync(B);
  ok('LEDGER it really is re-delivered (an empty re-pull proves nothing)',
    g2.keys.some(k => g1.keys.includes(k)), JSON.stringify(g2.keys));
  const c2 = await coinsOf(B);
  ok('LEDGER re-ingesting it pays nothing at all', c2 === c1, `${c1} -> ${c2}`);

  /* ---------------- CAPS ---------------- */
  const before = (await soc(B, 'giftBox')).length;
  const spend = [];
  for (let i = 0; i < 6; i++) spend.push(await soc(A, 'sendGift', meB.playerId, 'spend', 25));
  const accepted = spend.filter(r => r.ok).length;
  ok('CAP-GIFT the server allows 4 more coin gifts today and refuses the rest (5/friend/day)',
    accepted === 4 && spend.slice(4).every(r => r.status === 429),
    `${accepted} accepted, statuses ${spend.map(r => r.status).join(',')}`);
  await sync(B);
  const boxNow = (await soc(B, 'giftBox')).length;
  ok('CAP-GIFT B receives exactly the gifts the server accepted, no more',
    boxNow === before + accepted, `${before} -> ${boxNow}, accepted ${accepted}`);

  const cheers = [];
  for (let i = 0; i < 12; i++) cheers.push(await soc(A, 'sendCheer', meB.playerId, i % 6));
  const cheersOk = cheers.filter(r => r.ok).length;
  ok('CAP-CHEER exactly 10 cheers a day land and the 11th is refused',
    cheersOk === 10 && cheers.slice(10).every(r => r.status === 429),
    `${cheersOk} accepted, statuses ${cheers.map(r => r.status).join(',')}`);

  /* ---------------- SELF ---------------- */
  const selfAdd = await soc(A, 'friendRequest', meA.friendCode);
  const selfAcc = await soc(A, 'acceptFriend', meA.playerId);
  const selfGift = await soc(A, 'sendGift', meA.playerId, 'free');
  const selfCheer = await soc(A, 'sendCheer', meA.playerId, 0);
  ok('SELF   you cannot add, accept, gift or cheer yourself',
    selfAdd.ok === false && selfAcc === false && selfGift.ok === false && selfCheer.ok === false,
    JSON.stringify({ selfAdd, selfAcc, selfGift, selfCheer }));

  /* ---------------- REMOVE ---------------- */
  const removed = await soc(A, 'removeFriend', meB.playerId);
  ok('REMOVE the removal is accepted', removed === true);
  await goCrew(A);
  ok('REMOVE B is gone from A\'s Crew', !(await shown(A)).crew.includes(meB.playerId));
  await goCrew(B);
  ok('REMOVE A is gone from B\'s Crew too, with B doing nothing',
    !(await shown(B)).crew.includes(meA.playerId), JSON.stringify((await shown(B)).crew));
  const exGift = await soc(B, 'sendGift', meA.playerId, 'free');
  const exCheer = await soc(B, 'sendCheer', meA.playerId, 0);
  ok('REMOVE neither side can gift or cheer an ex-friend',
    exGift.status === 403 && exCheer.status === 403, JSON.stringify({ exGift, exCheer }));
} catch (e) {
  console.log('FAIL  the audit threw:', e && e.stack || e);
  fails = 1;
}

await cleanup(A.browser, B.browser);
console.log(fails ? '\nFAILED' : '\nAll pair checks green.');
process.exit(fails);
