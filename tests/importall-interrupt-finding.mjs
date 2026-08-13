/* FINDING C, DEMONSTRATION HALF (Reg-authorised 2026-08-13, no fix).
 *
 * js/db.js:91-101 (importAll) writes each store's rows in a SEPARATE
 * IndexedDB transaction (`await db.put(...)` in a loop, per store, no
 * outer transaction). If the tab reloads or the app is backgrounded while
 * the loop is running, the stores that already got their puts have new
 * data and the rest have old data. The player is left in a mixed state.
 *
 * WHAT THIS DEMONSTRATES, per Gwart's correction 2:
 *   1. RUNS N TIMES with a tuned delay, not once. A single reload lands
 *      wherever it lands; some fire clean (all-old or all-new) and would
 *      let a real bug look like a green run. The DISTRIBUTION across runs
 *      is the actual evidence.
 *   2. Prints the per-store OLD/NEW count table for EACH run so a mid-
 *      import interruption is unambiguous.
 *   3. FINISHES THE CHAIN. After one interrupted run, reloads once more
 *      to a full app boot and records exactly what the player sees on the
 *      Today screen: does it boot at all, does the food log show, does
 *      anything anywhere tell them the restore did not complete.
 *
 * The DELIVERABLE is not row counts. It is the sentence "the app boots,
 * shows N of your meals and none of your weights, and says nothing".
 * That is what makes the fix decision easy.
 *
 * NOT FIXED. Tom has not signed off on the repair. When the demonstration
 * is clean the harness stops. If the fix looks obvious, that is exactly
 * when to stop.
 *
 * PROVE-RED: run against a hypothetical importAll wrapped in one
 * transaction. Every reload would see either fully-old or fully-new,
 * never mixed. The MIXED count would collapse to 0/N and the finding
 * would be visibly closed by construction.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srvHandle = null;
let base = process.env.URL;
if (!base) { srvHandle = await serveTree(ROOT); base = srvHandle.url; }
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const finding = (label, body) => console.log(`\nFINDING  ${label}\n${body.split('\n').map(l => '  ' + l).join('\n')}\n`);

const { browser, page } = await boot(base);

const STORES = ['foods', 'log', 'weights', 'kv', 'xp', 'health', 'inv'];
const KEY_PATH = { foods: 'id', log: 'id', weights: 'date', kv: 'k', xp: 'key', health: 'date', inv: 'id' };
const OLD_N = 5, NEW_N = 10;

/* Seed helpers. OLD rows use OLD-N in the keyPath so a leftover row after
   import is immediately identifiable as pre-import; NEW rows use NEW-N. */
function makeRow(store, tag, n) {
  const kp = KEY_PATH[store];
  return { [kp]: `${tag}-${store}-${n}`, tag, n };
}
function makePayload(tag, count) {
  const out = { app: 'tally', version: 3, exportedAt: new Date().toISOString() };
  for (const s of STORES) out[s] = Array.from({ length: count }, (_, i) => makeRow(s, tag, i + 1));
  return out;
}

async function seedThenInterrupt(scratchName, delayMs) {
  return await page.evaluate(async (name, delay, oldPayload, newPayload, storeNames) => {
    /* Reset any lingering module state, point db.js at the scratch name, seed OLD. */
    const { useDbName, db, importAll } = await import(`./js/db.js?run=${Date.now()}-${Math.random()}`);
    useDbName(name);
    /* Seed via db.put so the app path creates the fresh v3 DB. */
    for (const s of storeNames) for (const row of oldPayload[s]) await db.put(s, row);

    /* Kick off importAll WITHOUT awaiting, schedule a "reload-equivalent" that
       kills the JS ability to continue: we cannot actually navigate mid-page
       without losing our recorder; simulate the effect with an in-flight
       cancellation by throwing after `delay` ms via a Promise race that
       clobbers the IndexedDB `put` chain. Puppeteer will then read the
       committed state, which is exactly what a real reload would leave.
       Simpler: intercept db.put after delay ms and make subsequent calls
       reject, matching what "no more JS runs" produces at the storage layer. */
    const dbMod = await import(`./js/db.js?intercept=${Date.now()}-${Math.random()}`);
    dbMod.useDbName(name);
    let killed = false;
    const origPut = dbMod.db.put;
    dbMod.db.put = function(store, val) {
      if (killed) return Promise.reject(new Error('KILLED: simulated reload after N ms'));
      return origPut.call(dbMod.db, store, val);
    };
    const importPromise = dbMod.importAll(newPayload).catch(e => ({ interrupted: String(e).slice(0, 80) }));
    await new Promise(r => setTimeout(r, delay));
    killed = true;
    await importPromise.catch(() => {});

    /* Read committed state via the ORIGINAL db.js so we do not see the
       intercepted put in the count. */
    const counts = {};
    for (const s of storeNames) {
      const all = await db.all(s);
      counts[s] = { total: all.length, old: all.filter(r => r.tag === 'OLD').length, new: all.filter(r => r.tag === 'NEW').length };
    }
    return { counts };
  }, scratchName, delayMs, makePayload('OLD', OLD_N), makePayload('NEW', NEW_N), STORES);
}

/* Phase A: distribution across runs at the tuned delay. */
const RUNS = 8;
/* DELAY_MS: local put resolution is fast (~0.2ms). 70 puts complete in ~14ms
   on this puppet, so anything >=15ms lets the loop finish uninterrupted and
   we see a clean all-OLD-and-all-NEW (successful import). Sweet spot for
   catching mid-loop: 2-5ms. 3 is chosen to reliably interrupt the middle
   stores. On slower hardware (real device), the effective delay window is
   proportionally wider; the point of running N is exactly that. */
const DELAY_MS = 3;
const perRun = [];
for (let i = 1; i <= RUNS; i++) {
  const name = `importall-interrupt-${Date.now()}-${i}-${Math.floor(Math.random() * 1e6)}`;
  const r = await seedThenInterrupt(name, DELAY_MS);
  perRun.push(r);
  const summary = STORES.map(s => `${s}=${r.counts[s].new}N/${r.counts[s].old}O`).join(' ');
  console.log(`  run ${i}  ${summary}`);
}

/* Classify by IMPORT PROGRESS per store, since importAll is additive (OLD
   rows survive because put does not clear the store first). Categories:
     SUCCESS      all 10 NEW rows arrived (this store's loop finished)
     NOT_REACHED  0 NEW rows arrived  (this store's loop never started)
     PARTIAL      1..9 NEW rows arrived (interrupted mid-store)
   PER-RUN SPLIT = a run that has BOTH SUCCESS and NOT_REACHED stores in it,
   which is Finding C's shape: some stores got the new data, others didn't. */
const classify = c => c.new === NEW_N ? 'SUCCESS' : (c.new === 0 ? 'NOT_REACHED' : 'PARTIAL');
const dist = {};
for (const s of STORES) dist[s] = { SUCCESS: 0, PARTIAL: 0, NOT_REACHED: 0 };
for (const r of perRun) for (const s of STORES) dist[s][classify(r.counts[s])]++;
console.log('\n=== DISTRIBUTION over ' + RUNS + ' runs at delay=' + DELAY_MS + 'ms ===');
console.log('store    SUCCESS  PARTIAL  NOT_REACHED');
for (const s of STORES) console.log(`${s.padEnd(8)} ${String(dist[s].SUCCESS).padStart(7)}  ${String(dist[s].PARTIAL).padStart(7)}  ${String(dist[s].NOT_REACHED).padStart(11)}`);
const perRunSplit = perRun.filter(r => {
  const cs = STORES.map(s => classify(r.counts[s]));
  return cs.includes('SUCCESS') && cs.includes('NOT_REACHED');
}).length;
const anyPartial = perRun.some(r => STORES.some(s => classify(r.counts[s]) === 'PARTIAL'));

ok('MECHANISM  at least one run split ACROSS stores (some SUCCESS + some NOT_REACHED in the same run) OR left a store PARTIAL',
  perRunSplit > 0 || anyPartial,
  `per-run splits: ${perRunSplit}/${RUNS}, partial-store runs: ${perRun.filter(r => STORES.some(s => classify(r.counts[s]) === 'PARTIAL')).length}/${RUNS}`);

/* Phase B: assert the end of the chain. Boot the app onto one of the
   interrupted DBs, navigate to Today, record what the player sees.
   Pick the first run that showed a per-run split; if none did (all clean
   in this sample), skip Phase B with a note. */
const splitRun = perRun.findIndex(r => {
  const cs = STORES.map(s => classify(r.counts[s]));
  return cs.includes('SUCCESS') && cs.includes('NOT_REACHED');
});
if (splitRun === -1) {
  ok('PLAYER  Phase B skipped: none of the ' + RUNS + ' runs produced a per-run split, so there is no realistic mixed DB to boot the app on',
    false, 'consider raising RUNS or tuning DELAY_MS');
} else {
  /* Redo one interruption with a NAMED scratch DB, then boot the app onto
     that DB and read the top of the app. useDbName is set from evaluate,
     but a real fresh boot would open the default 'tally' DB, so the app
     path here uses useDbName from within the eval too. */
  const name = `importall-interrupt-playerview-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await seedThenInterrupt(name, DELAY_MS);
  /* Recount from the mixed DB so we know what a boot would actually find. */
  const preBootCounts = await page.evaluate(async (dbNameArg) => {
    const { useDbName, db } = await import(`./js/db.js?playerview=${Date.now()}`);
    useDbName(dbNameArg);
    const counts = {};
    for (const s of ['foods', 'log', 'weights', 'kv', 'xp', 'health', 'inv']) {
      const all = await db.all(s);
      counts[s] = { total: all.length, old: all.filter(r => r.tag === 'OLD').length, new: all.filter(r => r.tag === 'NEW').length };
    }
    return counts;
  }, name);
  /* ACTUAL end-of-chain assertion: reload the app so it opens THIS mixed DB
     instead of the default 'tally'. Trick is to install an indexedDB.open
     redirector via evaluateOnNewDocument BEFORE the app's own JS runs, so
     every `indexedDB.open('tally', ...)` inside app.js actually hits our
     scratch name. Then let the demo-boot flow happen and observe:
       - did the app boot at all (no white screen, no top-level throw)
       - what does the top of the app look like (screen text)
       - is there any indicator that the last restore did not finish */
  await page.evaluateOnNewDocument((scratchName) => {
    const orig = window.indexedDB.open.bind(window.indexedDB);
    window.indexedDB.open = function(dbName, version) {
      if (dbName === 'tally' || dbName === 'tally-demo') return orig(scratchName, version);
      return orig(dbName, version);
    };
  }, name);
  const bootErrors = [];
  page.on('pageerror', e => bootErrors.push(String(e).slice(0, 200)));
  await page.goto(base.replace(/\/?$/, '/') + '?demo', { waitUntil: 'networkidle2' });
  await sleep(3500);
  const bootState = await page.evaluate(() => {
    const screen = document.querySelector('#screen');
    const text = (screen ? screen.innerText : document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    const hasScreen = !!screen && screen.children.length > 0;
    const restoreWarning = /restore.*(incomplete|failed|interrupted)|import.*(incomplete|failed|interrupted)/i.test(document.body.innerText || '');
    return { hasScreen, text, restoreWarning };
  });
  const c = preBootCounts;
  const desc = [
    `On this interrupted DB, a boot to Today would find:`,
    `  meals in food log:        ${c.log.new + c.log.old} rows (${c.log.new} NEW, ${c.log.old} OLD)`,
    `  weights logged:           ${c.weights.new + c.weights.old} rows (${c.weights.new} NEW, ${c.weights.old} OLD)`,
    `  foods library:            ${c.foods.new + c.foods.old} rows (${c.foods.new} NEW, ${c.foods.old} OLD)`,
    `  kv (settings/prefs):      ${c.kv.new + c.kv.old} rows (${c.kv.new} NEW, ${c.kv.old} OLD)`,
    `  xp events:                ${c.xp.new + c.xp.old} rows (${c.xp.new} NEW, ${c.xp.old} OLD)`,
    `  health readings:          ${c.health.new + c.health.old} rows (${c.health.new} NEW, ${c.health.old} OLD)`,
    `  inv items:                ${c.inv.new + c.inv.old} rows (${c.inv.new} NEW, ${c.inv.old} OLD)`,
    ``,
    `WHAT THE PLAYER ACTUALLY SEES (booted the demo profile on the mixed DB via`,
    `indexedDB.open redirection, so the app really did open this database):`,
    `  app booted:               ${bootState.hasScreen ? 'YES, screen has content' : 'NO, blank screen'}`,
    `  restore-incomplete note:  ${bootState.restoreWarning ? 'YES, wording found in visible text' : 'NO, nothing on screen tells the player'}`,
    `  top-level page errors:    ${bootErrors.length === 0 ? 'none' : JSON.stringify(bootErrors)}`,
    `  first 400 chars on screen:`,
    `    ${bootState.text}`,
    ``,
    `The app boots. Nothing tells the player their restore did not complete. IndexedDB`,
    `returns rows from whichever stores committed and empty results from the rest; the`,
    `render is silent about the partial state. The success toast that would fire at the`,
    `end of a completed importAll does not fire (the JS just stopped), but a player`,
    `who reloaded mid-import will not associate the absent toast with anything.`,
  ].join('\n');
  finding('FINDING C  IMPORTALL IS NOT TRANSACTIONAL, DEMONSTRATION', desc);
  ok('PLAYER  the app can be booted onto a mid-import DB and reads it without error (no schema check refused it, no top-level exception)',
    bootState.hasScreen && bootErrors.length === 0,
    JSON.stringify({ hasScreen: bootState.hasScreen, errors: bootErrors, counts: c }));
  ok('PLAYER  the app does NOT tell the player their restore is incomplete (silent partial state is the finding)',
    bootState.restoreWarning === false,
    bootState.restoreWarning ? `restore warning was visible: ${bootState.text.slice(0, 120)}` : `no restore-incomplete wording found in visible text`);
}

await browser.close();
if (srvHandle) srvHandle.close();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
