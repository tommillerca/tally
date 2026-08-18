/* ERASE EVERYTHING MEANS EVERY STORE, AND STARTING OVER PAYS ONCE.
 *
 * THE BUG (found by a scale audit, fixed on gwart/clientfix). Settings > Erase
 * all data cleared six stores by a hand-written literal:
 *
 *     for (const st of ['foods', 'log', 'weights', 'kv', 'xp', 'health'])
 *
 * 'inv' is the seventh store and it was not there. Every other seven-store list
 * in the tree has it (js/db.js exportAll/importAll, backup-roundtrip-audit,
 * importall-interrupt-finding); the erase was the one copy that lost a name, and
 * nothing tested the erase list at all.
 *
 * Two harms, and the second is the expensive one:
 *   1. The confirmation sheet promises the Bonehead on this device will be gone.
 *      The whole wardrobe survived: crates, gear, cosmetics and pets all live in
 *      'inv' (js/loot.js ownedCosmeticIds reads db.all('inv')). A destructive
 *      dialog that is not true is worse than no dialog.
 *   2. 'loot-init', the kv flag that records the welcome kit as paid, DOES get
 *      cleared, because kv was on the list. So the next boot pays the kit again
 *      on top of an inventory that was never emptied. Measured on a fresh
 *      non-demo profile before the fix:
 *        after onboarding   inv 3 rows (2 crates, 1 vigor), loot-init true
 *        after Erase        inv 3 rows,                     loot-init null
 *        after re-onboard   inv 6 rows (4 crates, 2 vigor)
 *      Inventory is strictly NON-DECREASING across an erase, and "erase and
 *      start over" is the most natural support instruction there is, so this is
 *      an unbounded faucet reachable by following advice.
 *
 * DIRECTION AND BOUND (anti-regression rule 11), because "the erase removed
 * some things" is the shape of check that passed on the bug:
 *   - After the erase, EVERY object store in the live database holds exactly
 *     ZERO rows. Not fewer rows than before. Zero. Any store above 0 is red.
 *   - Across an erase-then-reonboard cycle, the inventory row count must be
 *     <= what a single onboarding produces. It is a CEILING, never a trend:
 *     the bug's own signature is growth, so any check phrased as "the counts
 *     changed" grades the faucet as a pass.
 *
 * WHY IT DOES NOT USE ?demo, AND WHY THAT IS NOT A SHORTCUT. js/app.js boot()
 * re-seeds the demo database whenever ?demo has no settings, which is exactly
 * the state the erase leaves behind. On ?demo all seven stores come back
 * populated by seedDemo on the reload the erase performs and the measurement is
 * inconclusive in the direction that reads as "fine". So every page here is a
 * virgin browser context on the served tree with NO ?demo, like onb-audit.mjs.
 * Data safety: a throwaway puppeteer profile on a loopback port that has never
 * been visited, so the `tally` database this touches is created by this run and
 * dies with the browser. The audit asserts that before it writes anything.
 *
 * THE STATIC HALF IS NOT A STYLE CHECK. It exists because the behavioural half
 * cannot see a store that is added later and left empty by onboarding: an
 * eighth store with no rows in it passes "every store is empty" for free. So
 * the erase list is required to BE db.js's own list, derived from the module
 * and from onupgradeneeded, never a literal that happens to hold seven names
 * today.
 *
 * PROVE-RED: run this file in a checkout of 56c5058 (the pre-fix tree). The
 * ERASE-LIST, LIVE-ERASE and CEILING rows go red; the SETUP and KIT rows stay
 * green, which is what a discriminating check looks like.
 *
 * Usage: node tests/erase-completeness-audit.mjs [baseUrl]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serveTree, loadPuppeteer } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ============================ static half ============================ */

const dbSrc = readFileSync(path.join(ROOT, 'js/db.js'), 'utf8');
const appSrc = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

/* The stores the database actually defines, straight out of onupgradeneeded.
   This is the authority: a store exists because it is created here. */
const created = new Set();
for (let m, re = /createObjectStore\(\s*'([a-zA-Z_][\w]*)'/g; (m = re.exec(dbSrc)); ) created.add(m[1]);

/* And the list db.js publishes for callers that have to act on all of it. */
const mod = await import(pathToFileURL(path.join(ROOT, 'js/db.js')).href);
const published = Array.isArray(mod.STORES) ? mod.STORES : null;

/* EMPTY-SAMPLE GUARD. A drifted regex parses nothing, every set difference is
   then trivially empty, and the lint below passes while checking air. */
ok('SETUP  js/db.js onupgradeneeded parses to >=5 stores (a hollow parse would make every comparison below vacuous)',
  created.size >= 5, `parsed ${created.size}: ${JSON.stringify([...created])}`);

ok('STORES  js/db.js exports a STORES list for callers that act on all of the player data',
  !!published && published.length >= 5, published ? JSON.stringify(published) : 'js/db.js exports no STORES array');

const missingFromPublished = published ? [...created].filter(s => !published.includes(s)) : [...created];
const extraInPublished = published ? published.filter(s => !created.has(s)) : [];
ok('STORES  the published list is exactly the set onupgradeneeded creates (add an eighth store to one and not the other and this is where it stops)',
  !!published && !missingFromPublished.length && !extraInPublished.length,
  `missing: ${JSON.stringify(missingFromPublished)}  unknown: ${JSON.stringify(extraInPublished)}`);

/* The erase handler, located by the control the player actually presses. */
const eraseBlock = appSrc.match(/\$\('#eraseBtn'\)[\s\S]*?location\.reload\(\)/);
ok('SETUP  the #eraseBtn handler was located in js/app.js (if this fails the two rows below are checking nothing)',
  !!eraseBlock, eraseBlock ? `${eraseBlock[0].split('\n').length} lines` : 'no #eraseBtn handler found');

/* THE ERASE MOVED, THE RULE DID NOT. 2026-08-17: the handler used to run its
   own `for (const st of STORES) await db.clear(st)` loop. That loop is seven
   separate transactions and it only stops THIS tab, so with the app open twice
   the erase left rows behind (measured: 30 inv rows, 150 coins). It is now one
   transaction inside db.js's eraseAll(), which also freezes the other tabs
   first. So this row accepts EITHER shape, and in both cases insists the list
   of stores comes from db.js's STORES export rather than a literal, because a
   hand-copied literal is the specific thing that lost 'inv'. */
const inHandler = eraseBlock ? eraseBlock[0] : '';
const clearLoop = inHandler.match(/for\s*\(\s*const\s+\w+\s+of\s+([^)]+)\)\s*await\s+db\.clear/);
const callsEraseAll = /\bawait\s+eraseAll\s*\(\s*\)/.test(inHandler);
/* js/app.js has to be importing the identifier it uses FROM db.js, or it could
   be any local array or function with the same name and this would grade a
   coincidence. */
const importsStores = /import\s*\{[^}]*\bSTORES\b[^}]*\}\s*from\s*'\.\/db\.js'/.test(appSrc);
const importsEraseAll = /import\s*\{[^}]*\beraseAll\b[^}]*\}\s*from\s*'\.\/db\.js'/.test(appSrc);
/* and when the work lives in db.js, db.js's own erase has to iterate STORES.
   `eraseAll` is required to name STORES inside its body, not anywhere in the
   file, so a stray mention elsewhere cannot carry this. */
const eraseAllBody = dbSrc.match(/export async function eraseAll\s*\([\s\S]*?\n\}/);
const eraseAllUsesStores = !!(eraseAllBody && /\bof\s+STORES\b/.test(eraseAllBody[0]));
const viaLoop = !!clearLoop && /^\s*STORES\s*$/.test(clearLoop[1]) && importsStores && !clearLoop[1].includes('[');
const viaEraseAll = callsEraseAll && importsEraseAll && eraseAllUsesStores;
ok("ERASE-LIST  the erase clears js/db.js's STORES, not a literal it keeps its own copy of (the copy is what lost 'inv')",
  viaLoop || viaEraseAll,
  viaEraseAll ? 'via db.js eraseAll(), which iterates STORES'
    : clearLoop ? `clears: ${clearLoop[1].trim()}  imported from db.js: ${importsStores}`
      : `no \`for (const st of STORES) await db.clear\` loop and no \`await eraseAll()\` in the handler (eraseAll imported: ${importsEraseAll}, eraseAll iterates STORES: ${eraseAllUsesStores})`);

/* AND IT HAS TO BE ONE TRANSACTION, because "all of it or none of it" is the
   only version of this promise that survives a reload, a quota error or a
   second tab landing a write in the middle of the seven. */
ok('ERASE-ATOMIC  the wipe commits as ONE transaction over every store, not one transaction per store',
  !!(eraseAllBody && /transaction\(\s*STORES\s*,\s*'readwrite'\s*\)/.test(eraseAllBody[0])),
  eraseAllBody ? 'db.js eraseAll' : 'no eraseAll in db.js');

/* ========================== behavioural half ========================== */

const puppeteer = await loadPuppeteer();
let srvHandle = null;
let base = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
if (!base) { srvHandle = await serveTree(ROOT); base = srvHandle.url; }
base = base.replace(/\/?$/, '/');

const browser = await puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'new',
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  args: process.getuid?.() === 0 ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
});

const errors = [];
const ctx = await browser.createBrowserContext();   // its own storage: a virgin install
const page = await ctx.newPage();
page.on('pageerror', e => { errors.push(e.message); console.log('  PAGEERROR:', e.message.slice(0, 140)); });

/* Read EVERY store the open database declares, by name, from the database
   itself. Deriving the list here rather than typing it means a store added
   later is measured the moment it exists. */
const census = () => page.evaluate(async () => {
  const idb = await new Promise((res, rej) => { const r = indexedDB.open('tally'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const names = [...idb.objectStoreNames];
  const counts = {};
  for (const n of names) {
    counts[n] = await new Promise(r => { const q = idb.transaction(n, 'readonly').objectStore(n).count(); q.onsuccess = () => r(q.result); q.onerror = () => r(-1); });
  }
  const kinds = await new Promise(r => { const q = idb.transaction('inv', 'readonly').objectStore('inv').getAll(); q.onsuccess = () => r(q.result.map(x => x.kind + ':' + (x.itemId || x.tier || ''))); q.onerror = () => r([]); });
  const kvKeys = await new Promise(r => { const q = idb.transaction('kv', 'readonly').objectStore('kv').getAll(); q.onsuccess = () => r(q.result.map(x => x.k)); q.onerror = () => r([]); });
  const kvRow = k => new Promise(r => { const q = idb.transaction('kv', 'readonly').objectStore('kv').get(k); q.onsuccess = () => r(q.result ? q.result.v : null); q.onerror = () => r(null); });
  const lootInit = await kvRow('loot-init');
  const settings = await kvRow('settings');
  idb.close();
  return { counts, kinds, kvKeys, lootInit, settings: !!settings };
});

/* Onboard exactly the way onb-audit's HONEST-SKIP path does: real controls, the
   real save, the real welcome kit. */
async function onboard() {
  await page.evaluate(() => document.getElementById('onbGo')?.click()); await sleep(900);
  await page.evaluate(() => document.getElementById('onbMe')?.click()); await sleep(900);
  const has = await page.evaluate(() => !!document.getElementById('onbSkip'));
  if (!has) throw new Error('onboarding did not reach the plan step: #onbSkip is not on screen');
  await page.evaluate(() => document.getElementById('onbSkip')?.click());
  await sleep(6000);   // the welcome kit is granted during boot after the save
}

await page.goto(base, { waitUntil: 'networkidle2' });   // NO ?demo
await sleep(2600);

/* SAFETY, as an assertion and not a comment: refuse to run against anything
   that already looks like somebody's save.
   kv is excluded from the refusal and ONLY kv: boot writes its own flags into
   it (the day-one equip backfill, sound/haptic defaults) before onboarding has
   happened, so a genuinely virgin profile still shows kv rows here. Every store
   that holds player DATA must be empty, and a save with foods, log, weights, xp,
   health or inv in it is somebody's, so this stops. */
const pre = await census();
const preData = Object.entries(pre.counts).filter(([n]) => n !== 'kv');
if (preData.some(([, n]) => n > 0)) {
  throw new Error(`refusing to run: the tally database on ${base} already holds player data (${JSON.stringify(pre.counts)}). This audit erases it and must only ever see a database it created.`);
}
ok('SETUP  a virgin non-demo profile: every data store starts empty, and this is NOT ?demo (which re-seeds itself on the erase reload and makes the measurement meaningless)',
  Object.keys(pre.counts).length >= 5 && preData.every(([, n]) => n === 0),
  JSON.stringify(pre.counts));

await onboard();
const afterOnb = await census();
ok('KIT  onboarding pays the welcome kit into inv, so there is something for the erase to fail to remove',
  afterOnb.counts.inv > 0 && afterOnb.lootInit === true,
  `inv=${afterOnb.counts.inv} [${afterOnb.kinds.join(', ')}]  loot-init=${afterOnb.lootInit}`);

/* The erase, through the real sheet: Settings, the Erase button, the word typed
   into the field, the confirm button pressed. No direct call to db.clear. */
await page.evaluate(() => { location.hash = '#/settings'; });
await sleep(1800);
await page.evaluate(() => document.getElementById('eraseBtn')?.click());
await sleep(1000);
const armed = await page.evaluate(async () => {
  const input = document.getElementById('erIn'), go = document.getElementById('erGo');
  if (!input || !go) return null;
  input.value = 'ERASE';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  return { armed: !go.disabled, promise: (document.querySelector('.sheet-body')?.innerText || '') };
});
ok('SHEET  the erase sheet arms on the typed word (if it never armed, nothing below was erased by the app)',
  !!armed && armed.armed, armed ? armed.promise.split('\n')[0].slice(0, 120) : 'no #erIn / #erGo on screen');

await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
  page.evaluate(() => document.getElementById('erGo')?.click()),
]);
await sleep(3000);

const afterErase = await census();
/* DIRECTION: any data store above zero is the failure. BOUND: zero, not "fewer".
   kv is measured against the VIRGIN count instead of against zero, and that is
   not a hole: the erase reloads the page, and the boot on the other side writes
   its own defaults back into kv (the day-one equip backfill, sounds, haptics)
   before this can look. So the ceiling for kv is "a brand new install", the
   exact state the reload lands in, measured on this very profile at SETUP. A kv
   row that SURVIVED would push the count above it. The player's own keys are
   named and asserted absent below, which is the part that matters. */
const survivors = Object.entries(afterErase.counts).filter(([n, c]) => c !== 0 && n !== 'kv');
const kvCeiling = pre.counts.kv;
ok('LIVE-ERASE  every data store in the live database holds ZERO rows after the erase (the bug left inv untouched while wiping the flag that says the kit was paid)',
  Object.keys(afterErase.counts).length >= 5 && survivors.length === 0 && afterErase.counts.kv <= kvCeiling,
  survivors.length || afterErase.counts.kv > kvCeiling
    ? `survived the erase: ${JSON.stringify(Object.fromEntries(survivors))}  kv=${afterErase.counts.kv} (virgin-boot ceiling ${kvCeiling}) [${afterErase.kvKeys.join(', ')}]  inv holds [${afterErase.kinds.join(', ')}]`
    : `${JSON.stringify(afterErase.counts)}  kv holds only the virgin-boot keys [${afterErase.kvKeys.join(', ')}]`);

ok('LIVE-ERASE  the player profile is gone from kv: no settings, and no loot-init claiming the welcome kit was already paid',
  afterErase.settings === false && !afterErase.lootInit,
  `settings=${afterErase.settings}  loot-init=${afterErase.lootInit}`);

ok('LIVE-ERASE  the dialog is true about the Bonehead: no gear, cosmetics, pets or crates are left in inv',
  afterErase.counts.inv === 0, `inv=${afterErase.counts.inv} [${afterErase.kinds.join(', ')}]`);

/* And the reason it matters: start over, the way support would tell you to. */
const onOnb = await page.evaluate(() => !!document.querySelector('.onb'));
ok('RESTART  the erase really does return the app to onboarding, so this cycle is the one players are told to perform',
  onOnb);
await onboard();
const afterCycle = await census();
/* CEILING, not a trend. One onboarding pays one kit; a hundred erase cycles
   must still leave one kit's worth of inventory. */
ok('CEILING  erase then start over leaves ONE welcome kit, never a second on top of the first (inventory may never exceed a single onboarding)',
  afterCycle.counts.inv <= afterOnb.counts.inv && afterCycle.counts.inv > 0,
  `after first onboarding inv=${afterOnb.counts.inv} [${afterOnb.kinds.join(', ')}] -> after erase+reonboard inv=${afterCycle.counts.inv} [${afterCycle.kinds.join(', ')}]  ceiling=${afterOnb.counts.inv}`);

ok('NO page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await ctx.close();
await browser.close();
if (srvHandle) srvHandle.close();

const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join(', ')); process.exit(1); }
console.log('erase-completeness-audit clean');
