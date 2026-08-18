/* THE NETWORK IS RARELY OFF. IT IS FLAKY, AND FLAKY IS THE CASE NOBODY TESTS.
 *
 * tests/offline-boot-audit.mjs proves the app BOOTS with no network. This one is
 * about what happens once you start pressing things, in the three network states
 * that are not "on":
 *
 *   GONE     the host refuses the connection. The one everybody codes for.
 *   HANGING  the request is accepted and never answered. A phone that walks into
 *            a lift does not get a TCP reset; the socket goes quiet and Chrome
 *            sits on it for minutes. Every catch in this app is written for a
 *            REJECTION, and a promise that never settles never reaches one.
 *   FLAP     the request lands, the server acts, the answer is lost on the way
 *            back. Reported at the bottom as a measurement, not graded: see the
 *            note there for why the client cannot fix it alone.
 *
 * WHAT IT ASSERTS, and the shape of every row is the same: a failure the player
 * cannot see is the bug, so each one grades BOTH what reached the store AND what
 * the screen said.
 *
 *  OFFLINE-FIRST  with the origin's server stopped and the browser HTTP cache
 *                 cleared, logging a meal through the real Add flow still writes
 *                 the row. That is the app's most common action and the whole
 *                 claim on the tin; nothing tested it.
 *  LOOKUP         a food lookup that never reached a database must not report
 *                 "not in the books" / "nothing found online". Measured before
 *                 the fix: barcode 5000112637922 resolves online and was called
 *                 "never listed in the databases" offline.
 *  CREW           an unreachable Crew server must not render as an empty Crew.
 *                 Measured before the fix: three friends on the server, the API
 *                 unreachable, and the tab read "YOUR CREW · 0 / No Crew yet.
 *                 Send a friend your code".
 *  DEADLINE       under a HANGING server every control comes back to a live
 *                 state with words on screen, inside a BOUND (not a trend): two
 *                 deadlines. Before the fix, four controls measured at six
 *                 seconds and still going: free gift stuck on "...", 250-coin
 *                 gift with the coins taken and no refund, name save stuck on
 *                 "Saving...", add-a-friend stuck on "...".
 *  BALANCE        the coin gift's refund is exact: back to the byte-identical
 *                 pre-gift balance, never "close to it".
 *  CONTROL        every one of the above has an ONLINE twin, because "the app
 *                 said it could not reach the server" passes trivially on an app
 *                 that is broken everywhere. If the control row is red the
 *                 offline rows certify nothing.
 *
 * WHAT A FAILING RESULT LOOKS LIKE (anti-regression rule 1). LOOKUP goes red
 * when the offline sheet contains "not in the books"; CREW goes red when the fan
 * shows the make-a-friend copy or the count reads 0; DEADLINE goes red when a
 * button is still disabled after two deadlines; BALANCE goes red on any figure
 * that is not exactly the pre-gift number; CONTROL goes red when the online twin
 * did not produce a product / a crew / a delivered gift, and every offline row
 * below it is then meaningless.
 *
 * PROVE-RED is not a flag here, it is `git stash`: every row above was measured
 * red on ddbb079 before the fixes in this branch, and the numbers are quoted in
 * the commit messages and in each row's comment.
 *
 * The API deadline is shortened through social.__setApiDeadline, which is
 * webdriver-gated exactly like __testFriends. It exercises the same code: if the
 * deadline is ever removed the setter becomes a no-op and the DEADLINE rows go
 * red rather than quietly passing.
 *
 * Usage: node tests/flaky-network-audit.mjs
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
const note = (name, detail) => console.log(`NOTE  ${name}  ${detail}`);

/* The deadline the app is driven at. Real default is 12000 (social.js) / 15000
   (sources.js); shortened here so four controls do not cost a minute each. The
   BOUND every DEADLINE row is graded against is two of these. */
const TEST_DEADLINE_MS = 2500;
const BOUND_MS = TEST_DEADLINE_MS * 2;

/* ------------------------------------------------- static: no bare fetch left
   The behavioural rows below can only drive the call sites that exist today.
   This is the coverage half: the NEXT remote call added to any of these three
   files cannot ship without a deadline, because a bare fetch() in them fails
   here. That is the same shape as precache-audit deriving its list from the
   module graph rather than from a hand-written one.
   A failing result looks like: "js/social.js:412 fetch(" printed below. */
const fs = await import('node:fs');
const DEADLINE_FILES = ['js/social.js', 'js/analytics.js', 'js/sources.js'];
const bare = [];
for (const f of DEADLINE_FILES) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  lines.forEach((ln, i) => {
    // the two wrapper bodies are the only places a bare fetch belongs, and they
    // are recognised by the signal they attach, not by their line number
    if (/signal:\s*ac\.signal/.test(ln)) return;
    // a call site, OR a default parameter that hands the raw fetch down
    // (`fetchFn = fetch`), which is how js/sources.js shipped with no deadline
    if (/(?<![A-Za-z_$.])fetch\s*\(/.test(ln) || /=\s*fetch\s*[,)]/.test(ln)) bare.push(`${f}:${i + 1} ${ln.trim().slice(0, 80)}`);
  });
}
ok('STATIC  every network call in social.js, analytics.js and sources.js goes through a deadline wrapper, so the next one cannot ship without one',
  bare.length === 0 && DEADLINE_FILES.length === 3,
  bare.length ? bare.join(' | ') : `${DEADLINE_FILES.length} files scanned, 0 bare fetch calls`);

/* THE LOCAL GAME MUST STAY LOCAL. Crates, the wheel, the Pit, cooking, gear,
   pets, quests and the XP ledger are the reason this app works on a plane, and
   today not one of them imports social.js or calls fetch. That is a property
   worth pinning rather than rediscovering: a single network call added to the
   crate-opening path would break the offline promise silently, and no
   behavioural test would notice until somebody was on a train.
   A failing result looks like: "js/loot.js references the network". */
const LOCAL_ONLY = ['js/loot.js', 'js/pit.js', 'js/cooking.js', 'js/wheel.js', 'js/quests.js', 'js/game.js', 'js/gear.js', 'js/pets.js', 'js/energy.js', 'js/garden.js'];
const networked = LOCAL_ONLY.filter(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  return /(?<![A-Za-z_$.])fetch\s*\(/.test(src) || /from '\.\/social\.js'/.test(src) || /XMLHttpRequest|navigator\.sendBeacon/.test(src);
});
ok('OFFLINE-FIRST  the local game modules reach no network at all, so crates, the wheel, the Pit and the Kitchen cannot stop working on a plane',
  networked.length === 0 && LOCAL_ONLY.length === 10,
  networked.length ? networked.join(', ') + ' reference the network' : `${LOCAL_ONLY.length} modules scanned, 0 network references`);

/* ---------------------------------------------------------------- mock Worker
   A stand-in for bonez-api, with a mode per run. 'hang' holds the response open
   and never answers and never closes, which is the state this file exists for;
   'dead' destroys the socket; 'work-then-drop' runs the handler (so the SERVER
   has acted) and then destroys the socket, which is the flap. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS',
};
const FRIENDS = [
  { playerId: 'p1', name: 'Bony Wrecker', handle: 'bw', friendCode: 'AAA111', level: 9, lastSeen: Date.now(), outfit: { SK: 'SK0-1' }, stats: {} },
  { playerId: 'p2', name: 'Skull Crusher', handle: 'sc', friendCode: 'BBB222', level: 4, lastSeen: Date.now() - 9e5, outfit: { SK: 'SK0-1' }, stats: {} },
  { playerId: 'p3', name: 'Rib Tickler', handle: 'rt', friendCode: 'CCC333', level: 7, lastSeen: Date.now() - 5e6, outfit: { SK: 'SK0-1' }, stats: {} },
];
const ROUTES = {
  'GET /friends': () => ({ friends: FRIENDS, incoming: [], outgoing: [] }),
  'GET /leaderboard': () => ({ players: [] }),
  'GET /grants': () => ({ grants: [], cursor: 0 }),
  'GET /me': () => ({}),
  'GET /steps/week': () => ({}),
  'GET /spires/mine': () => ({ spires: [] }),
  'PUT /profile': () => ({ ok: true }),
  'PUT /backup': () => ({ ok: true }),
  'POST /name': () => ({ name: 'Test Name' }),
  'POST /friends/request': () => ({ status: 'sent' }),
};
const api = { mode: 'ok', held: new Set(), gifts: [] };
ROUTES['POST /gift'] = ({ body }) => { api.gifts.push(body); return { ok: true, reward: { coins: (body && body.coins) || 20 } }; };

const apiSrv = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  const p = new URL(req.url, 'http://x').pathname;
  let raw = ''; for await (const c of req) raw += c;
  if (api.mode === 'dead') { req.socket.destroy(); return; }
  if (api.mode === 'hang') { api.held.add(res); return; }
  const slow = /^slow:(\d+)$/.exec(api.mode);
  if (slow) await new Promise(r => setTimeout(r, +slow[1]));
  const h = ROUTES[`${req.method} ${p}`];
  const out = h ? await h({ body: raw ? JSON.parse(raw) : null }) : null;
  if (api.mode === 'work-then-drop') { req.socket.destroy(); return; }
  if (!out) { res.writeHead(404, { ...CORS, 'content-type': 'application/json' }); res.end('{"error":"none"}'); return; }
  res.writeHead(200, { ...CORS, 'content-type': 'application/json' }); res.end(JSON.stringify(out));
});
await new Promise(r => apiSrv.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${apiSrv.address().port}`;

/* ---------------------------------------------------------------- the tree */
let srv = await serveTree(ROOT);
const PORT = srv.port;
const BASE = srv.url;
console.log(`URL UNDER TEST: ${BASE}   mock API: ${API}`);

const { browser, page } = await boot(BASE, { headless: process.env.HEADLESS_MODE || 'shell' });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e).split('\n')[0]));

/* ---- food-database interception. The two lookup hosts are third-party, so they
   are answered (or refused, or held) here rather than by the mock Worker. ---- */
let foodMode = 'ok';
const heldFood = [];
await page.setRequestInterception(true);
page.on('request', req => {
  const u = req.url();
  if (!/openfoodfacts|nal\.usda\.gov/.test(u)) { req.continue().catch(() => {}); return; }
  if (foodMode === 'dead') { req.abort('failed').catch(() => {}); return; }
  if (foodMode === 'hang') { heldFood.push(req); return; }
  const json = b => req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(b) }).catch(() => {});
  if (/openfoodfacts.*\/product\//.test(u)) {
    json({ status: 1, product: { code: '5000112637922', product_name: 'Test Cola', brands: 'Testco', serving_size: '330 ml', serving_quantity: 330,
      nutriments: { 'energy-kcal_100g': 42, proteins_100g: 0, carbohydrates_100g: 10, fat_100g: 0 } } });
    return;
  }
  if (/openfoodfacts.*search/.test(u)) {
    json({ products: [{ code: '111', product_name: 'Test Apple Bar', brands: 'Testco', nutriments: { 'energy-kcal_100g': 200, proteins_100g: 3, carbohydrates_100g: 30, fat_100g: 6 } }] });
    return;
  }
  json({ foods: [] });
});

await page.goto(`${BASE}?demo&api=${encodeURIComponent(API)}`, { waitUntil: 'networkidle2' });
await sleep(2400);
await dismissOverlays(page);

/* An account row, so the Crew tab takes its online branch, plus a known balance. */
const KV = (put) => page.evaluate(async rows => {
  const idb = await new Promise((res, rej) => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res, rej) => {
    const tx = idb.transaction('kv', 'readwrite');
    for (const [k, v] of rows) tx.objectStore('kv').put({ k, v });
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  idb.close();
}, put);
await KV([['social', { playerId: 'me', handle: 'Test Bones', friendCode: 'ZZZ999', name: null, onlineAt: Date.now() }], ['coins', 5000]]);

const shortened = await page.evaluate(async ms => {
  const s = await import('./js/social.js');
  return typeof s.__setApiDeadline === 'function' ? { set: s.__setApiDeadline(ms), def: s.API_DEADLINE_MS } : { set: false, def: null };
}, TEST_DEADLINE_MS);
/* The default is asserted separately from the override: shrinking it for the run
   must not be able to hide a default that is missing, infinite, or absurd. */
ok('SETUP  the API deadline exists, is finite and is under 20s, and the audit could shorten it',
  shortened.set === true && Number.isFinite(shortened.def) && shortened.def > 0 && shortened.def <= 20000,
  `default=${shortened.def}ms  driven at ${TEST_DEADLINE_MS}ms`);

/* ---------------------------------------------------------------- helpers */
/* A real mouse click at the element's centre, and it WAITS for the element to
   have a box. Sheets here are hidden until revealWhenReady() has decoded their
   images, so a button that is already in the DOM measures 0x0 for a beat; a
   single-shot querySelector-and-click reads that as "no such control" and a
   CONTROL row goes red against a working app. Bounded wait, then give up. */
const $click = async (sel, waitMs = 5000) => {
  const t0 = Date.now();
  for (;;) {
    const at = await page.evaluate(s => {
      const b = document.querySelector(s);
      if (!b || b.disabled) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      /* HIT-TEST BEFORE CLICKING (anti-regression rule 6). A sheet that is still
         sliding in measures a perfectly good box at coordinates the mouse will
         miss by the time the event lands, and a click into dead space is
         indistinguishable from a control that ignored it. Only click when the
         centre of the box really is this button. */
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || (hit !== b && !b.contains(hit))) return null;
      return { x: cx, y: cy };
    }, sel).catch(() => null);
    if (at) { await page.mouse.click(at.x, at.y); return true; }
    if (Date.now() - t0 > waitMs) return false;
    await sleep(250);
  }
};
const btn = sel => page.evaluate(s => { const b = document.querySelector(s); return b ? { text: (b.textContent || '').trim(), disabled: !!b.disabled } : null; }, sel).catch(() => null);
const toastText = () => page.evaluate(() => { const t = document.querySelector('#toast'); return t && !t.hidden ? (t.textContent || '').trim() : ''; }).catch(() => '');
const topSheet = () => page.evaluate(() => { const s = [...document.querySelectorAll('#sheets .sheet')].pop(); return s ? (s.innerText || '').replace(/\s+/g, ' ') : ''; }).catch(() => '');
const screenText = () => page.evaluate(() => (document.querySelector('#screen')?.innerText || '').replace(/\s+/g, ' ')).catch(() => '');
const coins = () => page.evaluate(async () => {
  const idb = await new Promise((res, rej) => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const v = await new Promise(res => { const q = idb.transaction('kv').objectStore('kv').get('coins'); q.onsuccess = () => res(q.result ? q.result.v : null); q.onerror = () => res(null); });
  idb.close(); return v;
}).catch(() => null);
const logRows = () => page.evaluate(async () => {
  const idb = await new Promise((res, rej) => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const n = await new Promise(res => { const q = idb.transaction('log').objectStore('log').getAll(); q.onsuccess = () => res(q.result.length); q.onerror = () => res(-1); });
  idb.close(); return n;
}).catch(() => -1);
const closeSheets = async () => {
  for (let i = 0; i < 6; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('#sheets .sheet').length).catch(() => 0);
    if (!n) break;
    await page.evaluate(() => history.back()).catch(() => {});
    await sleep(650);
  }
};
/* ALWAYS BOUNCE. Setting location.hash to the value it already holds fires no
   hashchange, so "go to the Crew tab" was a no-op whenever we were already on
   it and the screen kept whatever the previous network state had painted. That
   is how the gift CONTROL row went red against a working app: it clicked into
   the deck of a tab that had never re-rendered. */
const goTab = async tab => {
  await closeSheets();
  await page.evaluate(t => { location.hash = t === 'today' ? '#/bonehead' : '#/today'; }, tab).catch(() => {});
  await sleep(900);
  await page.evaluate(t => { location.hash = '#/' + t; }, tab).catch(() => {});
  await sleep(2200);
};

/* Wait for a condition, returning how long it took, capped. Used by every
   DEADLINE row so the grade is "inside the bound", never "eventually". */
async function waitFor(fn, capMs, pollMs = 120) {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return Date.now() - t0;
    if (Date.now() - t0 > capMs) return -1;
    await sleep(pollMs);
  }
}

/* ---- one full pass of the real Add-food flow, ending on the Add button ---- */
async function logAMeal() {
  await goTab('today');
  if (!await $click('[data-addmeal]')) return { opened: false };
  await sleep(1700);
  await page.evaluate(() => {
    const inp = document.querySelector('#t1Search, input[type=search]');
    if (inp) { inp.value = 'apple'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
  }).catch(() => {});
  await sleep(1500);
  if (!await $click('[data-food]')) return { opened: true, picked: false };
  await sleep(1600);
  const added = await $click('#addBtn');
  await sleep(2200);
  return { opened: true, picked: true, added };
}

/* ======================================================= 1. LOOKUP, CONTROL */
async function barcodeLookup() {
  await goTab('today');
  if (!await $click('[data-addmeal]')) return '(no add sheet)';
  await sleep(1700);
  if (!await $click('#actScan')) return '(no scan control)';
  await sleep(1700);
  await page.evaluate(() => {
    const inp = document.querySelector('#manualCode');
    if (inp) { inp.value = '5000112637922'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    document.querySelector('#manualGo')?.click();
  }).catch(() => {});
  return null;
}

foodMode = 'ok';
await barcodeLookup();
await sleep(4500);
const bcOnline = await topSheet();
ok('CONTROL  online, barcode 5000112637922 resolves to a product, so the offline rows below are about the network and not about a broken harness',
  /Test Cola/i.test(bcOnline), bcOnline.slice(0, 90) || '(nothing on screen)');

foodMode = 'dead';
await barcodeLookup();
await sleep(5000);
const bcGone = await topSheet();
/* RED BEFORE THE FIX: this sheet said "Not in the books ... never listed in the
   databases" for a barcode the CONTROL row above just resolved. */
ok('LOOKUP  with the food databases unreachable the app must not claim the barcode is not in them',
  !!bcGone && !/not in the books|never listed in the databases/i.test(bcGone) && /could not look that up|signal/i.test(bcGone),
  bcGone.slice(0, 120) || '(nothing on screen)');

foodMode = 'hang';
await barcodeLookup();
const bcSettled = await waitFor(async () => !/Looking up/i.test(await topSheet()), BOUND_MS + 16000);
ok('DEADLINE  a barcode lookup against a server that never answers still settles, inside one lookup budget',
  bcSettled >= 0, bcSettled >= 0 ? `settled after ${bcSettled}ms (budget 15000ms)` : 'still on "Looking up" after 31s');
ok('LOOKUP  and the sheet it settles on is the could-not-reach one, not "not in the books"',
  bcSettled >= 0 && /could not look that up|signal/i.test(await topSheet()),
  (await topSheet()).slice(0, 110) || '(nothing on screen)');

/* ------------------------------------------------ 2. ONLINE SEARCH, both ways */
async function onlineSearch(q) {
  await goTab('today');
  if (!await $click('[data-addmeal]')) return '(no add sheet)';
  await sleep(1700);
  await page.evaluate(t => {
    const inp = document.querySelector('#t1Search, input[type=search]');
    if (inp) { inp.value = t; inp.dispatchEvent(new Event('input', { bubbles: true })); }
  }, q).catch(() => {});
  await sleep(1400);
  await page.evaluate(() => document.querySelector('[data-online]')?.click()).catch(() => {});
  await sleep(6000);
  return page.evaluate(() => { const e = document.querySelector('#onlineSect'); return e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : '(no online section)'; }).catch(() => '');
}
foodMode = 'ok';
const srchOnline = await onlineSearch('qqqa');
ok('CONTROL  online, the online food search returns a result',
  /Test Apple Bar/i.test(srchOnline), srchOnline.slice(0, 90) || '(empty)');
foodMode = 'dead';
const srchGone = await onlineSearch('qqqb');
/* RED BEFORE THE FIX: "Nothing found online. Try the barcode or label scanner",
   which sends a player with no signal to a scanner that needs the same network. */
ok('LOOKUP  a search that reached neither database must not report that nothing was found',
  !!srchGone && !/nothing found online/i.test(srchGone) && /signal/i.test(srchGone),
  srchGone.slice(0, 120) || '(empty)');

/* ============================================== 3. THE CREW TAB, three states */
const readCrew = () => page.evaluate(() => {
  const s = document.querySelector('#screen');
  const box = id => { const e = s && s.querySelector(id); return e && !e.hidden ? (e.innerText || '').replace(/\s+/g, ' ').trim() : ''; };
  return {
    count: (s?.querySelector('#cfanCount')?.textContent || '').trim(),
    empty: box('#cfanEmpty'),
    unreached: box('#cfanUnreached'),
    loading: box('#cfanLoading'),
    cards: s ? s.querySelectorAll('#cfanDeck [data-fan]').length : 0,
  };
}).catch(() => ({ count: '', empty: '', unreached: '', loading: '', cards: 0 }));

api.mode = 'ok';
await goTab('friends');
const crewOnline = await readCrew();
ok('CONTROL  online, the Crew tab shows the three friends the server returned',
  crewOnline.cards >= 3 && /·\s*3/.test(crewOnline.count), JSON.stringify(crewOnline));

api.mode = 'dead';
await goTab('today'); await goTab('friends');
const crewGone = await readCrew();
/* RED BEFORE THE FIX: count "· 0", and #cfanEmpty reading "No Crew yet. Send a
   friend your code, or type theirs in below." to a player with three friends. */
ok('CREW  an unreachable Crew server is not an empty Crew: no "No Crew yet", and the count does not claim 0',
  !crewGone.empty && !/·\s*0/.test(crewGone.count), JSON.stringify(crewGone));
ok('CREW  and it says so in words the player can act on, naming the server',
  /could not reach the crew server/i.test(crewGone.unreached) && /try again/i.test(crewGone.unreached),
  crewGone.unreached.slice(0, 130) || '(no message at all)');

/* AND THE WAY BACK HAS TO WORK. A message with a button on it that does nothing
   is a worse lie than no message (anti-regression rule 5: operate the control,
   do not admire it). Signal returns, the player taps Try again, and the crew
   comes back without leaving the tab. */
api.mode = 'ok';
const retryTapped = await $click('#cfanRetry');
const crewBack = await waitFor(async () => (await readCrew()).cards >= 3, 15000);
ok('CREW  tapping Try again on the could-not-reach box brings the crew back once there is signal',
  retryTapped && crewBack >= 0 && /·\s*3/.test((await readCrew()).count),
  retryTapped ? `${crewBack}ms, ${JSON.stringify(await readCrew()).slice(0, 90)}` : 'the Try again button could not be tapped');

api.mode = 'hang';
await goTab('today'); await goTab('friends');
const crewSettled = await waitFor(async () => !(await readCrew()).loading, BOUND_MS + 4000);
ok('DEADLINE  the Crew tab under a server that never answers leaves "Loading your Crew..." inside two deadlines',
  crewSettled >= 0 && crewSettled <= BOUND_MS + 4000,
  crewSettled >= 0 ? `settled after ${crewSettled}ms (bound ${BOUND_MS + 4000}ms)` : `still loading after ${BOUND_MS + 4000}ms`);
ok('CREW  and a hang lands on the same could-not-reach copy a refusal does',
  /could not reach the crew server/i.test((await readCrew()).unreached),
  (await readCrew()).unreached.slice(0, 110) || '(no message at all)');

/* ============================ 4. FOUR CONTROLS AGAINST A SERVER THAT HANGS */
/* Each one measured before the fix at six seconds and still going, disabled,
   with no toast. The grade is: enabled again, its own label back, and words. */
const present = sel => page.evaluate(s => !!document.querySelector(s), sel).catch(() => false);
async function openFriendCard() {
  api.mode = 'ok';
  await goTab('friends');
  /* WAIT FOR THE DECK, do not assume it. Coming back from a HANG pass the fan
     has to re-fetch, and clicking into an empty deck is how this CONTROL row
     first went red against a perfectly good app. */
  if (await waitFor(() => present('#cfanDeck [data-fan]'), 12000) < 0) return false;
  /* TWICE, ON PURPOSE. Only the CENTRE card of the fan opens a profile; a tap on
     any other card just brings it to the centre. The first card in DOM order is
     the centre only for a crew of one, which is why this read as a broken app
     with three friends and as a working one with one. */
  await page.evaluate(() => document.querySelector('#cfanDeck [data-fan]')?.click()).catch(() => {});
  await sleep(900);
  if (!await present('#fpGift')) {
    await page.evaluate(() => document.querySelector('#cfanDeck [data-fan]')?.click()).catch(() => {});
  }
  if (await waitFor(() => present('#fpGift'), 8000) < 0) return false;
  if (!await $click('#fpGift')) return false;
  return (await waitFor(() => present('#giftFree'), 8000)) >= 0;
}

/* DRIVE ONE CONTROL, AND REFUSE TO GRADE A TAP THAT NEVER HAPPENED.
 *
 * The naive version of this (click, then wait for the button to be enabled) is
 * green on a button that was never pressed, because "enabled" is also its
 * resting state. That is not hypothetical: it made the name-save row read 2ms
 * and quote a toast left over from the previous block. So every control is
 * required to be SEEN in its busy state first; if it never goes busy the row
 * fails and says so rather than reporting a number.
 *
 * Toasts are cleared first for the same reason: a stale toast from the block
 * above is not evidence about this one. */
/* BLANK IT, NEVER REMOVE IT. #toast is a single persistent element that
   nextToast() looks up and calls getAttribute on; removing it threw
   "Cannot read properties of null" inside the app and killed every toast for
   the rest of the run, which read as four broken controls. The harness must not
   be able to break the thing it is measuring. */
const clearToasts = () => page.evaluate(() => { const t = document.querySelector('#toast'); if (t) { t.textContent = ''; t.hidden = true; } }).catch(() => {});
async function driveUnderHang(sel, tap) {
  await clearToasts();
  api.mode = 'hang';
  const tapped = await tap();
  if (tapped === false) return { sawBusy: false, ms: -1, label: '', toast: await toastText(), tapped: false };
  // 1. it has to go busy at all
  const busy = await waitFor(async () => { const b = await btn(sel); return !!(b && b.disabled); }, 4000, 60);
  if (busy < 0) return { sawBusy: false, ms: -1, label: '', toast: await toastText(), tapped: true };
  // 2. and then come back, inside the bound
  const back = await waitFor(async () => { const b = await btn(sel); return !!(b && !b.disabled); }, BOUND_MS);
  return { sawBusy: true, ms: back, label: ((await btn(sel)) || {}).text || '', toast: await toastText(), tapped: true };
}
const grade = (name, r, gate, wantToast) => ok(name,
  gate && r.sawBusy && r.ms >= 0 && r.ms <= BOUND_MS && wantToast.test(r.toast),
  !gate ? 'the control was never reachable, so this row measures nothing'
    : r.tapped === false ? 'the control could not be tapped at all (nothing at its centre), so nothing was driven'
    : !r.sawBusy ? 'the control never entered its busy state, so nothing was driven'
    : r.ms < 0 ? `still disabled after ${BOUND_MS}ms`
    : `${r.ms}ms (bound ${BOUND_MS}ms), label "${r.label}", toast "${r.toast.slice(0, 60)}"`);

const opened = await openFriendCard();
await sleep(600);
ok('CONTROL  the gift sheet opens from a friend card, so the two gift rows below are really driving it',
  opened && /free daily gift/i.test(await topSheet()), (await topSheet()).slice(0, 80));

const free = await driveUnderHang('#giftFree', () => $click('#giftFree'));
grade('DEADLINE  free gift: the button comes back to life with words inside two deadlines, instead of sitting on "..."',
  free, opened, /could not send/i);

const coinsBefore = await coins();
const spend = await driveUnderHang('.gift-amt[data-amt="250"]', async () => {
  // armToConfirm: the first tap arms, the second commits
  await page.evaluate(() => document.querySelector('.gift-amt[data-amt="250"]')?.click()).catch(() => {});
  await sleep(600);
  await page.evaluate(() => document.querySelector('.gift-amt[data-amt="250"]')?.click()).catch(() => {});
});
const coinsAfter = await coins();
grade('DEADLINE  250-coin gift: the chip comes back to life with words inside two deadlines',
  spend, opened, /not spent|could not send/i);
/* EXACT, not "about right". Measured before the fix: 5000 -> 4750, no refund,
   no toast, and the chip dead. A spend that cannot complete must leave the
   balance byte-identical to what it was. Gated on the tap having really
   happened, because an unchanged balance is trivially true when nothing was
   pressed: that is how this row read green against ddbb079, where the crew fan
   was empty and the gift sheet never opened at all. */
ok('BALANCE  250-coin gift: a send that never got an answer leaves the balance exactly where it started',
  opened && spend.sawBusy && coinsAfter === coinsBefore,
  opened && spend.sawBusy ? `${coinsBefore} -> ${coinsAfter} (must be identical)` : 'no send was attempted, so this row measures nothing');

api.mode = 'ok';
await goTab('friends');
await $click('#crewEditName');
const nameOpened = (await waitFor(() => present('#nbSave'), 8000)) >= 0;
const name = await driveUnderHang('#nbSave', () => $click('#nbSave'));
ok('CONTROL  the name builder opens, so the row below is driving a real Save',
  nameOpened, (await topSheet()).slice(0, 70));
grade('DEADLINE  name save: the button leaves "Saving..." with words inside two deadlines',
  name, nameOpened, /could not save/i);

api.mode = 'ok';
await goTab('friends');
const codeIn = await page.evaluate(() => { const i = document.querySelector('#friendCode'); if (!i) return false; i.value = 'AAA111'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; }).catch(() => false);
const add = await driveUnderHang('#friendAddBtn', () => $click('#friendAddBtn'));
const addToast = add.toast;
grade('DEADLINE  add a friend: the button comes back with words inside two deadlines',
  add, codeIn, /could not reach/i);
/* RED BEFORE THE FIX in a different way: the button DID come back once a
   deadline existed, and blamed the code. A network failure must not be reported
   as a bad friend code, or the player re-reads a code that was never wrong. */
ok('CREW  add a friend: a request that never reached the server is not reported as a bad code',
  add.sawBusy && !/no bonehead has that code/i.test(addToast) && /could not reach/i.test(addToast),
  add.sawBusy ? (addToast.slice(0, 110) || '(no toast at all)') : 'the Add button never went busy, so this row measures nothing');

/* ============ 4b. THE TWO CALLS A FINISHED FIGHT AWAITS, DIRECTLY ========= */
/* A won spire fight awaits social.claimSpireRemote / defendSpireRemote before it
   can show the player anything, so a hang there is a rewards screen that never
   arrives. Driving a real spire fight needs a signed-in test identity that this
   repo does not have yet (tests/spire-phase3-audit.mjs's own header records the
   same wall), so these two rows drive the exported calls app.js awaits rather
   than the fight around them. Stated plainly so nobody reads this as coverage of
   the fight UI: it is coverage of the promise the fight UI hangs on. */
api.mode = 'hang';
const spireSettle = await page.evaluate(async cap => {
  const s = await import('./js/social.js');
  const run = async fn => {
    const t0 = Date.now();
    try { await Promise.race([fn(), new Promise(r => setTimeout(() => r('CAP'), cap))]); } catch { /* a rejection is a settle */ }
    return Date.now() - t0;
  };
  return {
    claim: await run(() => s.claimSpireRemote({ id: 'sp1', name: 'Test Spire', lat: 1, lng: 2 })),
    defend: await run(() => s.defendSpireRemote('sp1')),
  };
}, BOUND_MS + 3000).catch(() => ({ claim: -1, defend: -1 }));
ok('DEADLINE  claimSpireRemote settles against a server that never answers, so a won fight can still pay out',
  spireSettle.claim > 0 && spireSettle.claim < BOUND_MS + 2500, `${spireSettle.claim}ms (bound ${BOUND_MS + 2500}ms)`);
ok('DEADLINE  defendSpireRemote settles too',
  spireSettle.defend > 0 && spireSettle.defend < BOUND_MS + 2500, `${spireSettle.defend}ms (bound ${BOUND_MS + 2500}ms)`);

/* ================================ 5. THE FLAP, MEASURED AND NOT GRADED ===== */
/* The server acts and the answer is lost. The client refunds, because from here
   that is indistinguishable from a request that never landed, so the player pays
   nothing and the friend still receives the gift: coins minted by a bad signal.
   It is NOT graded because there is no client-only fix. Deducting after the
   answer instead of before is the same hole facing the other way. Closing it
   needs an idempotency key on POST /gift so the client can retry until it gets a
   definitive answer, and server/ is not this branch's to change. Printed every
   run so it cannot rot into folklore. */
const flapReady = await openFriendCard();
ok('CONTROL  the gift sheet opens again for the flap measurement below',
  flapReady, flapReady ? 'open' : 'the gift sheet never opened, so the FLAP line measures nothing');
const flapBefore = await coins();
const giftsBefore = api.gifts.length;
api.mode = 'work-then-drop';
await page.evaluate(() => document.querySelector('.gift-amt[data-amt="100"]')?.click()).catch(() => {});
await sleep(700);
await page.evaluate(() => document.querySelector('.gift-amt[data-amt="100"]')?.click()).catch(() => {});
await sleep(BOUND_MS + 1500);
const flapAfter = await coins();
note('FLAP  server delivered, answer lost',
  `coins ${flapBefore} -> ${flapAfter}; the server recorded ${api.gifts.length - giftsBefore} delivery(ies). The player paid ${flapBefore - flapAfter} for them. Needs an idempotency key on POST /gift; not gradeable client-side.`);

/* SLOW, NOT ABSENT: the deadline fires and the request lands anyway. This is the
   case the deadline itself creates, so it is measured rather than assumed. The
   outcome is the same shape as the FLAP above and for the same reason. */
const slowReady = await openFriendCard();
const slowBefore = await coins();
const slowGifts = api.gifts.length;
api.mode = `slow:${BOUND_MS + 2000}`;
await page.evaluate(() => document.querySelector('.gift-amt[data-amt="100"]')?.click()).catch(() => {});
await sleep(700);
await page.evaluate(() => document.querySelector('.gift-amt[data-amt="100"]')?.click()).catch(() => {});
await sleep(BOUND_MS + 4000);
note('SLOW  the deadline fires, the request lands afterwards',
  slowReady
    ? `coins ${slowBefore} -> ${await coins()}; the server recorded ${api.gifts.length - slowGifts} delivery(ies) after the client had already given up. Same residue as FLAP.`
    : 'the gift sheet never opened, so this line measures nothing');

/* ======================= 6. OFFLINE-FIRST: THE APP'S MOST COMMON ACTION ==== */
/* Everything above ran with the tree's own server up. This last part takes it
   away for real (the audit owns it, so it can stop it) and clears the browser
   HTTP cache, which is the same lesson offline-boot-audit had to learn: a warm
   HTTP cache answers requests with no network involved and makes "offline" a
   claim rather than a fact. */
api.mode = 'dead';
foodMode = 'dead';
await closeSheets();
const swOk = await page.evaluate(async () => {
  try {
    await navigator.serviceWorker.register('sw.js', { scope: './' });
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 150 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 200));
    return !!navigator.serviceWorker.controller;
  } catch { return false; }
}).catch(() => false);
ok('SETUP  a controlling service worker, without which nothing below would be about being offline',
  swOk, swOk ? 'controlled' : 'no controller');

const beforeRows = await logRows();
srv.close(); srv = null;
const cdp = await page.createCDPSession();
await cdp.send('Network.clearBrowserCache');
await cdp.detach().catch(() => {});
await page.setOfflineMode(true);
let originUp = true;
try { await fetch(BASE + 'index.html'); } catch { originUp = false; }
ok('SETUP  the origin really is gone (a node-side fetch at it is refused), so the rows below cannot pass on a live server',
  !originUp, originUp ? `${BASE} is still answering` : `${BASE} refused`);

await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(3800);
await dismissOverlays(page);
const meal = await logAMeal();
const afterRows = await logRows();
const mealToast = await toastText();
/* THE POINT OF THE WHOLE APP. Not "the screen rendered": a row in the store,
   and a message that says it saved. Direction and bound: exactly one more row
   than before, never zero and never two. */
ok('OFFLINE-FIRST  with the origin gone and the HTTP cache cleared, logging a meal through the real Add flow writes exactly one row',
  meal.added === true && afterRows === beforeRows + 1,
  `reached the Add button: ${meal.added}; log rows ${beforeRows} -> ${afterRows} (must be +1)`);
ok('OFFLINE-FIRST  and the player is told it saved',
  /added|saved/i.test(mealToast), mealToast.slice(0, 90) || '(no toast at all)');
const offlineScreen = await screenText();
ok('OFFLINE-FIRST  Today is still a usable screen after the write, not a blank frame',
  offlineScreen.length > 120, `${offlineScreen.length} chars on #screen`);

ok('CONTROL  nothing above threw an uncaught error into the page',
  pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || 'none');

/* ---------------------------------------------------------------- report */
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (results.length === 0) { console.log('FAIL  zero rows examined, so nothing was checked'); }
for (const f of failed) console.log('FAILED: ' + f.name);
for (const r of api.held) { try { r.destroy(); } catch { /* gone */ } }
await browser.close().catch(() => {});
if (srv) srv.close();
apiSrv.closeAllConnections?.();
apiSrv.close();
process.exit(failed.length || results.length === 0 ? 1 : 0);
