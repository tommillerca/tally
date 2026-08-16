/* THE RETENTION ROWS FIRE EXACTLY ONCE, AND NEVER FOR A ROBOT.
 * SELF-SERVING: it always serves THIS checkout with serveTree(ROOT) (line ~60)
 * and refuses a URL argument, so it can never be pointed at production.
 *
 * What is being guarded (js/analytics.js, js/app.js, js/game.js):
 *   day_first_open { d, g, s }  the first open of a new LOCAL day. Two trigger
 *       sites: js/app.js after initAnalytics in boot(), and js/app.js inside
 *       rollDayIfNeeded. Both are needed, because `_dayAnchor` is module level
 *       and re-initialises to today on every reload, so a force quit overnight
 *       never passes the rollover branch, while a WebView suspended for days
 *       never re-runs boot().
 *   day_closed { r, d }         the day-close award actually minted.
 *
 * WHY THIS AUDIT LOOKS ODD, and the two things it has to defeat to run at all:
 *
 *  1. BOTH EVENTS ARE SUPPRESSED IN EVERY NORMAL AUDIT. js/analytics.js:17 BOT
 *     is true under navigator.webdriver AND under ?demo, and a godmode boot is
 *     both, so track() queues nothing. A check written the usual way would be
 *     vacuously green forever. So the emitting phases boot WITHOUT ?demo and
 *     with navigator.webdriver spoofed to false, exactly as
 *     cloud-restore-silent-audit.mjs does, and for the same reason. That is also
 *     why godmode's seed() is not used: it rightly refuses any page that is not
 *     ?demo. Data safety is preserved a different and stronger way: puppeteer
 *     gets a throwaway profile, each phase gets its OWN browser context (so its
 *     own storage), and the origin is a random loopback port from serveTree that
 *     has never been visited. The `tally` database each phase touches is created
 *     by this run and dies with the browser, and the audit ASSERTS it was empty
 *     before it wrote anything.
 *
 *  2. THE BACKEND IS LIVE. js/social.js:30 PROD_API points at the real Worker,
 *     and a non-bot session really does flush events to it. Two independent
 *     belts: every emitting page is loaded with ?api=<the local server>, and
 *     request interception ABORTS every request that is not loopback and counts
 *     the ones aimed at the Worker. NO PROD asserts that count is zero. Without
 *     both, running this audit would post its own fixture rows into production
 *     analytics, which is the exact pollution the BOT gate exists to prevent.
 *
 * ANTI-VACUOUS, because "no events" is what BOTH a working gate and a dead
 * feature look like. Every suppression row is paired with a positive control:
 *   - the kv day marker IS written under BOT (trackDayFirstOpen writes the gate
 *     and then calls track(), which drops the row), so the marker proves the
 *     trigger site really ran and the ONLY thing that stopped the row was the
 *     gate. A missing marker fails the row instead of passing it.
 *   - the `dayclose-<yesterday>` XP row proves awardDayCloseIfDue reached its
 *     minting branch in the bot phases too.
 *   - CONTROL asserts the identical seed DOES emit in the non-bot phase.
 * Every count row also asserts its sample set is non-empty first.
 *
 * DIRECTION AND BOUND for each family, since "it fired" is not a direction:
 *   fire count  EXACTLY 1 per event per eligible day. 0 = the return is never
 *               recorded (retention reads as worse than it is and the feature is
 *               dead); 2+ = double counting (retention reads as better than it
 *               is, which is the more expensive direction). Both are bounded by
 *               an equality, never by "more than before".
 *   props       EXACT VALUES, not presence. A row of the right shape carrying
 *               the wrong day count misfiles a whole cohort silently.
 *   payload     MAX serialized length, ceiling 300, because the server clips
 *               props at JSON.stringify(props).slice(0,300) mid-string and not
 *               JSON aware (see js/analytics.js). Measured, printed, and given
 *               a much tighter working ceiling so drift is caught long before
 *               it lands in D1 as unterminated JSON.
 *
 * PROVE-RED, 2026-08-16. Four throwaway trees from `git archive`, one break in
 * each, run separately. All four exited 1, and each went red in a DIFFERENT
 * place, which is what a discriminating guard looks like:
 *   1. day_first_open DOUBLE (the `last === today` gate deleted from
 *      dayFirstOpenRow): 3 red. NO SECOND SAME DAY (2 rows), NEW DAY (3 rows),
 *      GAP (the extra row reported g=0). Everything about day_closed stayed
 *      green.
 *   2. day_first_open NEVER (both trigger sites in js/app.js deleted): 14 red,
 *      including all three BOT CONTROL rows and CONTROL, which is exactly the
 *      job of an anti-vacuous control: with the feature dead, "no rows under
 *      BOT" must stop counting as proof of a working gate.
 *   3. day_closed DOUBLE (fired unconditionally instead of only on the branch
 *      that returns non-null): 3 red. CLOSED IDEMPOTENT (2 rows), and both
 *      CLOSED NOT DUE rows (3 rows). CLOSED ONCE stayed green, because the
 *      first fire is still correct: it takes a second boot to see this bug.
 *   4. day_closed NEVER (the call deleted): 7 red. Every CLOSED row, EFFORT,
 *      and CONTROL. Every day_first_open row stayed green.
 * Note that 1 and 3 leave ONCE / CLOSED ONCE green and 2 and 4 fail them: the
 * two directions really do need different rows, and a guard that only owned one
 * of them would be half a guard.
 *
 * Run: node tests/retention-audit.mjs      (no arguments, by design)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';
import { dateKey, addDays, daysBetween } from '../js/nutrition.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv.slice(2).some(a => /^https?:/i.test(a))) {
  console.log('FAIL  retention-audit takes no URL: it writes to IndexedDB and must only ever run against its own served checkout.');
  process.exit(1);
}
const srv = await serveTree(ROOT);
const API = srv.url.replace(/\/$/, '') + '/api';
console.log(`serving this checkout at ${srv.url}`);

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

/* ---------------------------------------------------------------- fixture --- */
const TODAY = dateKey();
const Y = addDays(TODAY, -1);
const Y2 = addDays(TODAY, -2);
const INSTALL_AGE = 13;
const CREATED_AT = new Date(`${addDays(TODAY, -INSTALL_AGE)}T09:00:00`).getTime();
const INSTALL_DAY = dateKey(new Date(CREATED_AT));
const EXP_D = daysBetween(INSTALL_DAY, TODAY);   // 13, computed rather than assumed
const EXP_S = 2;                                 // Y and Y2 logged, today not: streakFrom gives 2
const TARGET_KCAL = 2000;

/* The seed every phase gets, so the bot phases and the live phase differ in
   NOTHING except the gate. `onBudget` picks which day-close award is due:
   1500 kcal is inside [0.6*2000, 2000] -> 'close'; 3000 is outside -> 'effort'. */
const seedScript = async (a) => {
  const dbName = a.dbName;
  const db = await new Promise((res, rej) => { const r = indexedDB.open(dbName); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const clear = store => new Promise((res, rej) => { const q = db.transaction(store, 'readwrite').objectStore(store).clear(); q.onsuccess = res; q.onerror = () => rej(q.error); });
  await clear('xp');       // so initGameIfNeeded's backfill cannot pre-mint yesterday's close
  await clear('log');
  await new Promise((res, rej) => {
    const tx = db.transaction(['kv', 'log'], 'readwrite');
    const kv = tx.objectStore('kv');
    const log = tx.objectStore('log');
    kv.put({ k: 'settings', v: { profile: { sex: 'm', age: 33, heightCm: 180, weightKg: 84, activity: 'moderate', goal: 'recomp' }, targets: { kcal: a.targetKcal, p: 100, c: 200, f: 60 }, units: 'lb', fdcKey: null, createdAt: a.createdAt } });
    kv.put({ k: 'game-init', v: true });     // fresh install: nothing to backfill
    kv.put({ k: 'loot-init', v: true });
    kv.put({ k: 'changelogSeen', v: 99999 });
    kv.put({ k: 'evq', v: [] });             // every count below starts from zero
    kv.put({ k: 'apiBase', v: a.api });
    kv.delete('retentionDay');
    for (const [i, d] of [a.y, a.y2].entries()) {
      log.put({ id: `fix-${d}-1`, date: d, meal: 0, ts: Date.now() - (i + 1) * 86400000, name: 'fixture', kcal: a.kcal / 2, p: 30, c: 40, f: 10 });
      log.put({ id: `fix-${d}-2`, date: d, meal: 2, ts: Date.now() - (i + 1) * 86400000, name: 'fixture', kcal: a.kcal / 2, p: 30, c: 40, f: 10 });
    }
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  db.close();
};

/* --------------------------------------------------------------- plumbing --- */
const offOrigin = [];
const prodHits = [];
/* Attached to EVERY page, including godmode's, so NO PROD below is a statement
   about the whole run and not just about the pages this file created. */
const blockOffOrigin = async (page) => {
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = req.url();
    if (/^https?:\/\/127\.0\.0\.1[:/]/.test(u) || /^(data|blob):/.test(u)) { req.continue().catch(() => {}); return; }
    offOrigin.push(u);
    if (/workers\.dev|bonez-api/i.test(u)) prodHits.push(u);
    req.abort('failed').catch(() => {});
  });
};
const { browser, page: demoPage } = await boot(srv.url);   // ?demo AND webdriver: the bot phase A page
await blockOffOrigin(demoPage);

const seed = (page, dbName, opts = {}) => page.evaluate(seedScript, {
  dbName, api: API, createdAt: opts.createdAt ?? CREATED_AT, targetKcal: TARGET_KCAL,
  kcal: opts.kcal ?? 1500, y: Y, y2: Y2,
});

const read = (page, dbName) => page.evaluate(async (a) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open(a.dbName); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const get = (store, key) => new Promise((res, rej) => { const q = db.transaction(store, 'readonly').objectStore(store).get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const kv = k => get('kv', k).then(r => (r ? r.v : null));
  const evq = (await kv('evq')) || [];
  const out = {
    total: evq.length,
    opens: evq.filter(e => e.name === 'day_first_open').map(e => e.props),
    closes: evq.filter(e => e.name === 'day_closed').map(e => e.props),
    retentionDay: await kv('retentionDay'),
    settings: !!(await kv('settings')),
    dayclose: !!(await get('xp', 'dayclose-' + a.y)),
    dayeffort: !!(await get('xp', 'dayeffort-' + a.y)),
  };
  db.close();
  return out;
}, { dbName, y: Y });

// storage is per browser context, so each phase gets its own `tally` database
const freshPage = async ({ spoofHuman }) => {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  if (spoofHuman) {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
    });
    // with webdriver spoofed the splash and gate intro stop skipping themselves
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  }
  await blockOffOrigin(page);
  return page;
};

const LIVE = u => `${srv.url}?api=${encodeURIComponent(API)}${u || ''}`;
const DEMO = u => `${srv.url}?demo&api=${encodeURIComponent(API)}${u || ''}`;
const goto = (page, u) => page.goto(u, { waitUntil: 'networkidle2' })
  .catch(e => { if (!/net::ERR_ABORTED/.test(String(e))) throw e; });
const BOOT_MS = 2800;

/* ============================ PHASE LIVE: the events actually fire ========= */
const live = await freshPage({ spoofHuman: true });
await goto(live, LIVE());
await sleep(BOOT_MS);

/* SAFETY, as an assertion and not a comment: refuse to write to anything that
   already looks like a real save. A fresh loopback origin has none of these. */
const pre = await live.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('tally'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const n = await Promise.all(['log', 'foods', 'weights', 'xp'].map(s =>
    new Promise(r => { const q = db.transaction(s, 'readonly').objectStore(s).count(); q.onsuccess = () => r(q.result); q.onerror = () => r(-1); })));
  db.close();
  return n;
});
if (pre.some(n => n > 0)) throw new Error(`refusing to run: the tally database on ${srv.url} already holds rows (${pre}).`);

await seed(live, 'tally');
await goto(live, LIVE());                       // boot 1: the day's first open
await sleep(BOOT_MS);
const L1 = await read(live, 'tally');

ok('SAMPLE: the first seeded boot queued events at all', L1.total > 0,
  `${L1.total} rows in evq (an empty queue is a failure, not a pass)`);
ok('ONCE: exactly one day_first_open on the first open of the day', L1.opens.length === 1,
  `${L1.opens.length} rows (0 = the return is never recorded, 2+ = double counted)`);
ok('PAYLOAD: day_first_open carries the right install age, gap and streak',
  L1.opens.length === 1 && L1.opens[0].d === EXP_D && L1.opens[0].g === -1 && L1.opens[0].s === EXP_S,
  `${JSON.stringify(L1.opens[0])} want {"d":${EXP_D},"g":-1,"s":${EXP_S}}`);
ok('GATE: the one new kv key holds today, so a repeat open is blocked', L1.retentionDay === TODAY,
  `retentionDay=${L1.retentionDay} want ${TODAY}`);
ok('CLOSED ONCE: exactly one day_closed when the award minted', L1.closes.length === 1,
  `${L1.closes.length} rows, xp ledger row dayclose-${Y}=${L1.dayclose}`);
ok('CLOSED PAYLOAD: which award fired, and the install age it fired on',
  L1.closes.length === 1 && L1.closes[0].r === 'close' && L1.closes[0].d === EXP_D,
  `${JSON.stringify(L1.closes[0])} want {"r":"close","d":${EXP_D}}`);

/* Re-open the SAME day. Nothing may fire: the kv gate blocks the open, and the
   XP ledger blocks the close (award() returns 0 once its key exists). */
await goto(live, LIVE());
await sleep(BOOT_MS);
const L2 = await read(live, 'tally');
ok('NO SECOND SAME DAY: re-opening the app emits no second day_first_open', L2.opens.length === 1,
  `${L2.opens.length} rows after a second boot on the same day (2 = the gate is gone)`);
ok('CLOSED IDEMPOTENT: the second boot mints nothing, so it emits nothing', L2.closes.length === 1,
  `${L2.closes.length} rows after two boots that both call awardDayCloseIfDue`);

/* A genuinely new day. Only the gate is moved back, so this is the boot site
   (js/app.js after initAnalytics) doing the work a force quit overnight needs. */
await live.evaluate(async (y) => {
  const db = await new Promise(res => { const r = indexedDB.open('tally'); r.onsuccess = () => res(r.result); });
  await new Promise(res => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ k: 'retentionDay', v: y }); tx.oncomplete = res; });
  db.close();
}, Y);
await goto(live, LIVE());
await sleep(BOOT_MS);
const L3 = await read(live, 'tally');
ok('NEW DAY: the boot site fires again once the day really changed', L3.opens.length === 2,
  `${L3.opens.length} rows (still 1 = a returning player is never counted)`);
ok('GAP: the second row reports one day since the last active day',
  L3.opens.length === 2 && L3.opens[1].g === 1 && L3.opens[1].d === EXP_D,
  `${JSON.stringify(L3.opens[1])} want g=1, d=${EXP_D}`);
ok('CLOSED NOT DUE (ledger): a third boot with nothing left to mint stays quiet', L3.closes.length === 1,
  `${L3.closes.length} rows after three boots`);

/* NOT DUE, with the ledger CLEARED so idempotency cannot be what is passing:
   no entries for yesterday means awardDayCloseIfDue returns at `if (!es.length)`
   and there is no award, so there must be no row. */
await live.evaluate(async () => {
  const db = await new Promise(res => { const r = indexedDB.open('tally'); r.onsuccess = () => res(r.result); });
  const clear = s => new Promise(res => { const q = db.transaction(s, 'readwrite').objectStore(s).clear(); q.onsuccess = res; });
  await clear('log'); await clear('xp');
  db.close();
});
await goto(live, LIVE());
await sleep(BOOT_MS);
const L4 = await read(live, 'tally');
ok('CLOSED NOT DUE (no day to close): an unlogged yesterday emits nothing',
  L4.closes.length === 1 && !L4.dayclose,
  `${L4.closes.length} rows with the ledger cleared and no entries for ${Y}`);

/* ==================== PHASE ROLL: the rollDayIfNeeded trigger site ========= */
/* The other site cannot be reached by reloading, because _dayAnchor is module
   level and a reload re-initialises it to today. So the DAY moves under a live
   page instead: the timezone is shifted forward and the app is resumed, which is
   exactly the suspended-WebView-crossing-midnight case the site exists for.
   Seeded OVER budget, so this phase also covers the 'effort' award. */
const roll = await freshPage({ spoofHuman: true });
await roll.emulateTimezone('Etc/GMT+12');            // UTC-12, the last place on earth
await goto(roll, LIVE());
await sleep(BOOT_MS);
await seed(roll, 'tally', { kcal: 3000 });
await goto(roll, LIVE());
await sleep(BOOT_MS);
const R1 = await read(roll, 'tally');
ok('EFFORT: an off-budget but logged day reports the consolation award',
  R1.closes.length === 1 && R1.closes[0].r === 'effort',
  `${JSON.stringify(R1.closes)} , xp row dayeffort-${Y}=${R1.dayeffort}`);

await roll.emulateTimezone('Pacific/Kiritimati');     // UTC+14: the local day moves forward
const moved = await roll.evaluate(async (before) => {
  const n = await import('./js/nutrition.js');
  const today = n.dateKey();
  const s = await (await import('./js/db.js')).kvGet('settings', null);
  return { today, jumped: n.daysBetween(before, today), d: n.daysBetween(n.dateKey(new Date(s.createdAt)), today) };
}, R1.retentionDay);
ok('SETUP: the timezone shift really moved the local day forward', moved.jumped >= 1,
  `${R1.retentionDay} -> ${moved.today} (+${moved.jumped}d). 0 = this phase proves nothing`);

await roll.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));  // onAppResume
await sleep(2500);
const R2 = await read(roll, 'tally');
ok('ROLLOVER: the rollDayIfNeeded site fires the new day without any reload',
  R2.opens.length === R1.opens.length + 1,
  `${R1.opens.length} -> ${R2.opens.length} rows across the midnight crossing`);
ok('ROLLOVER PAYLOAD: it reports the real gap and the real install age',
  R2.opens.length >= 2 && R2.opens[R2.opens.length - 1].g === moved.jumped && R2.opens[R2.opens.length - 1].d === moved.d,
  `${JSON.stringify(R2.opens[R2.opens.length - 1])} want g=${moved.jumped}, d=${moved.d}`);
ok('ROLLOVER: a resume on the SAME day after it emits nothing more', await (async () => {
  await roll.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await sleep(1800);
  const R3 = await read(roll, 'tally');
  return R3.opens.length === R2.opens.length;
})(), 'a second resume must not re-emit the day');

/* ============================ PHASE BOT: suppression, three ways =========== */
/* Each of these is the SAME seed as the live phase. The only difference is the
   session, so anything that fires is the gate failing, and anything that does
   not fire has the kv day marker to prove the code ran anyway. */
const botPhase = async (label, page, dbName, url) => {
  await goto(page, url);
  await sleep(BOOT_MS);
  await seed(page, dbName);
  await goto(page, url);
  await sleep(BOOT_MS);
  const r = await read(page, dbName);
  ok(`BOT ${label}: no day_first_open, no day_closed`, r.opens.length === 0 && r.closes.length === 0,
    `${r.opens.length} open rows, ${r.closes.length} close rows, ${r.total} rows in evq total`);
  ok(`BOT ${label} CONTROL: the trigger sites really ran (marker + ledger written)`,
    r.retentionDay === TODAY && r.dayclose,
    `retentionDay=${r.retentionDay} (want ${TODAY}), dayclose-${Y} row=${r.dayclose}. Both absent = nothing ran and the row above is vacuous`);
  return r;
};

await botPhase('demo + webdriver', demoPage, 'tally-demo', DEMO());
const wdOnly = await freshPage({ spoofHuman: false });   // webdriver true, no ?demo
await botPhase('webdriver only', wdOnly, 'tally', LIVE());
const demoOnly = await freshPage({ spoofHuman: true });  // ?demo, webdriver spoofed false
await botPhase('demo only', demoOnly, 'tally-demo', DEMO());

ok('CONTROL: the identical seed DOES emit when the session is not a bot',
  L1.opens.length === 1 && L1.closes.length === 1,
  'without this the three BOT rows above could pass on a dead feature');

/* ============================ PHASE SIZE: the 300-char server clip ========= */
/* server/src/index.js stores JSON.stringify(e.props).slice(0, 300), mid-string
   and not JSON aware, so anything over 300 lands in D1 as unterminated JSON and
   json_extract returns null on it. Measure, do not assume. */
const emitted = [...L3.opens, ...R2.opens, ...L1.closes, ...R1.closes].map(p => JSON.stringify(p));
const worst = await live.evaluate(async () => {
  const a = await import('./js/analytics.js');
  // a decade-old install, a decade-long gap and a decade-long streak, which is
  // larger than any real device can produce
  const open = a.dayFirstOpenRow(null, '2036-08-16', '1996-01-01', 99999);
  return { open: JSON.stringify(open), closed: JSON.stringify({ r: 'effort', d: 99999 }) };
});
const measured = [...emitted, worst.open, worst.closed];
const maxLen = Math.max(...measured.map(s => s.length));
ok('SAMPLE: payload lengths were actually measured', emitted.length >= 4,
  `${emitted.length} emitted payloads + 2 synthetic worst cases`);
ok('TRUNCATION: every payload fits the 300-char server clip with room to spare', maxLen <= 60,
  `longest ${maxLen} of 300 chars (${(300 - maxLen)} spare). emitted: ${emitted.join(' ')} ; worst case: ${worst.open} ${worst.closed}`);

/* ============================ PHASE SAFETY ================================ */
ok('NO PROD: not one request was aimed at the live Worker', prodHits.length === 0,
  prodHits.length ? prodHits.slice(0, 4).join(' , ') : `0 of ${offOrigin.length} off-origin requests (all aborted)`);

await browser.close();
srv.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nretention rows hold: one row per day, one row per close, none for robots');
process.exit(fails.length ? 1 : 0);
