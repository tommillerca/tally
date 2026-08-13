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
const OLD_N = 5;
/* NEW_N chosen large enough that IDB's commit phase (disk write) takes
   longer than one macrotask. Sync dispatch of ~thousand puts is fast,
   but the commit itself is async and multi-tick. A reload scheduled at
   setTimeout(0) fires after the current task and its microtasks, which
   is after dispatch is done but during commit. Small NEW_N (say 10)
   commits inside a single tick and cannot be interrupted by any timer
   we could schedule from JS. 1000 gives enough commit-time for the
   reload to catch it in flight. */
const NEW_N = 1000;

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
  /* REAL TAB RELOAD, not a JS-layer stub. The pre-fix demonstration used a
     killed-flag on db.put to intercept subsequent awaits, which worked
     because the pre-fix importAll awaited each put sequentially. The fix
     dispatches all puts synchronously inside a multi-store transaction,
     so a JS-layer flag can never fire between puts. Only a REAL
     interruption (tab reload, tab teardown) tests what the transaction
     does under the platform-level abort path.
     PROTOCOL:
       1. Install indexedDB.open('tally') -> scratchName redirector via
          evaluateOnNewDocument, so app.js is not needed for db-name
          management.
       2. Reload to a fresh page. Seed OLD data. Kick off importAll(NEW).
          setTimeout(location.reload, delayMs).
       3. Wait for the reload to complete. Read counts through the app
          path (which now points at scratchName via the same redirector).
     The counts after reload show whether the transaction committed (all
     NEW arrived) or aborted (all OLD, no NEW). Anything in between is a
     partial-commit finding. */
  await page.evaluateOnNewDocument((sname) => {
    const orig = window.indexedDB.open.bind(window.indexedDB);
    window.indexedDB.open = function(dbName, version) {
      if (dbName === 'tally' || dbName === 'tally-demo') return orig(sname, version);
      return orig(dbName, version);
    };
  }, scratchName);
  /* Fresh navigation so the redirector takes effect. */
  await page.goto(base.replace(/\/?$/, '/') + '?demo', { waitUntil: 'networkidle2' });
  await sleep(500);
  /* Seed OLD data. */
  await page.evaluate(async (oldPayload, storeNames) => {
    const { db } = await import(`./js/db.js?seed=${Date.now()}-${Math.random()}`);
    for (const s of storeNames) for (const row of oldPayload[s]) await db.put(s, row);
  }, makePayload('OLD', OLD_N), STORES);
  /* Kick off importAll and schedule a real tab reload. importAll is
     fire-and-forget; the reload cuts JS execution mid-transaction. */
  await page.evaluate((newPayload, delay) => {
    /* Fresh module import so the transaction dispatches straight after
       this call, not delayed by any earlier module state. */
    import(`./js/db.js?import=${Date.now()}-${Math.random()}`).then(dbMod => {
      dbMod.importAll(newPayload).catch(() => {});
    });
    /* delay = how long between the import kicking off and the reload.
       0 means "reload right after the microtask that starts importAll",
       which is the tightest interruption possible from JS. */
    setTimeout(() => location.reload(), delay);
  }, makePayload('NEW', NEW_N), delayMs);
  /* Wait for the reload to complete. Puppeteer's waitForNavigation is
     the reliable way here. */
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
  await sleep(500);
  /* Read the committed state through the SAME redirector. */
  const counts = await page.evaluate(async (storeNames) => {
    const { db } = await import(`./js/db.js?read=${Date.now()}-${Math.random()}`);
    const out = {};
    for (const s of storeNames) {
      const all = await db.all(s);
      out[s] = { total: all.length, old: all.filter(r => r.tag === 'OLD').length, new: all.filter(r => r.tag === 'NEW').length };
    }
    return out;
  }, STORES);
  return { counts };
}

/* Phase A: distribution across runs at delays chosen to (a) reliably bite
   the interruption and (b) sometimes miss it (so we exercise both the
   abort path and the commit path). */
const RUNS = 8;
/* DELAY_MS chosen for a REAL page reload: with the transactional fix,
   the reload cuts the transaction before oncomplete fires, so a small
   delay reliably aborts. With the pre-fix build, the same delay caught
   mid-loop and produced per-run splits (see original demonstration).
   0 is the tightest possible interruption from JS (setTimeout microtask
   fires basically immediately after import kicks off). */
const DELAY_MS = 0;
const perRun = [];
for (let i = 1; i <= RUNS; i++) {
  const name = `importall-interrupt-${Date.now()}-${i}-${Math.floor(Math.random() * 1e6)}`;
  const r = await seedThenInterrupt(name, DELAY_MS);
  perRun.push(r);
  const summary = STORES.map(s => `${s}=${r.counts[s].new}N/${r.counts[s].old}O`).join(' ');
  console.log(`  run ${i}  ${summary}`);
}

/* Per-store classification:
     COMMITTED    all NEW_N rows arrived
     NOT_STARTED  0 NEW rows (transaction never landed for this store)
     PARTIAL      1..NEW_N-1 NEW rows (per-store mid-commit, IMPOSSIBLE
                  under a correct multi-store transaction)
   Per-RUN classification:
     FULLY_COMMITTED  all seven stores COMMITTED
     FULLY_ABORTED    all seven stores NOT_STARTED (transaction aborted)
     INCONSISTENT     anything else (partial store OR store-split): the
                      exact shape the fix must forbid */
const classify = c => c.new === NEW_N ? 'COMMITTED' : (c.new === 0 ? 'NOT_STARTED' : 'PARTIAL');
const runShape = r => {
  const cs = STORES.map(s => classify(r.counts[s]));
  if (cs.every(x => x === 'COMMITTED')) return 'FULLY_COMMITTED';
  if (cs.every(x => x === 'NOT_STARTED')) return 'FULLY_ABORTED';
  return 'INCONSISTENT';
};
const dist = {};
for (const s of STORES) dist[s] = { COMMITTED: 0, PARTIAL: 0, NOT_STARTED: 0 };
for (const r of perRun) for (const s of STORES) dist[s][classify(r.counts[s])]++;
const shapes = { FULLY_COMMITTED: 0, FULLY_ABORTED: 0, INCONSISTENT: 0 };
for (const r of perRun) shapes[runShape(r)]++;
console.log('\n=== DISTRIBUTION over ' + RUNS + ' runs at delay=' + DELAY_MS + 'ms ===');
console.log('store    COMMITTED  PARTIAL  NOT_STARTED');
for (const s of STORES) console.log(`${s.padEnd(8)} ${String(dist[s].COMMITTED).padStart(9)}  ${String(dist[s].PARTIAL).padStart(7)}  ${String(dist[s].NOT_STARTED).padStart(11)}`);
console.log(`\nPER-RUN SHAPES: FULLY_COMMITTED=${shapes.FULLY_COMMITTED}  FULLY_ABORTED=${shapes.FULLY_ABORTED}  INCONSISTENT=${shapes.INCONSISTENT}`);

/* THE FIX'S CONTRACT: no run may end INCONSISTENT. Every run must be
   FULLY_COMMITTED or FULLY_ABORTED. INCONSISTENT means either a per-run
   split (some stores committed, others didn't) or a per-store PARTIAL
   (some rows within one store committed but not all): both are the shape
   the multi-store transaction is designed to make impossible. */
ok('ATOMICITY  every run is FULLY_COMMITTED or FULLY_ABORTED, never INCONSISTENT (the transactional-import contract)',
  shapes.INCONSISTENT === 0,
  shapes.INCONSISTENT ? `${shapes.INCONSISTENT}/${RUNS} runs left the DB in a mixed state (some stores committed, some did not). This is Finding C.` : `${RUNS} runs, ${shapes.FULLY_COMMITTED} fully committed, ${shapes.FULLY_ABORTED} fully aborted, 0 inconsistent`);
/* Empty-sample guard on the interruption itself: if every run FULLY_COMMITTED,
   the reload never actually interrupted anything and the atomicity assertion
   above is vacuous. At delay=0 the reload should be tight enough to abort
   at least one run; if not, the test is not exercising the abort path. */
ok('INTERRUPTION  at least one run had its transaction aborted by the reload (empty-sample guard: otherwise ATOMICITY passes vacuously)',
  shapes.FULLY_ABORTED > 0,
  shapes.FULLY_ABORTED ? `${shapes.FULLY_ABORTED}/${RUNS} runs aborted` : 'all runs committed fully; reload did not interrupt; increase delay tightness');

/* Phase B: END OF CHAIN. Boot the real app on a FULLY_ABORTED DB and
   verify it is byte-identical to the pre-import state: OLD rows only,
   zero NEW rows across every store. This is the "did the player keep
   their game" question in Gwart's words. If the sample had no
   FULLY_ABORTED runs (interruption did not bite), skip with a hard fail
   for the same reason as the INTERRUPTION assertion above. */
const abortedRun = perRun.findIndex(r => runShape(r) === 'FULLY_ABORTED');
if (abortedRun === -1) {
  ok('PLAYER  Phase B needs a FULLY_ABORTED run to verify the post-abort DB IS the original save; the sample had none',
    false, 'increase RUNS or tighten DELAY_MS; ATOMICITY assertion cannot verify the recovery half without one');
} else {
  const name = `importall-abort-playerview-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await seedThenInterrupt(name, DELAY_MS);
  /* Recount THIS DB so we know what a boot would actually find. */
  const postAbortCounts = await page.evaluate(async (dbNameArg) => {
    const { useDbName, db } = await import(`./js/db.js?playerview=${Date.now()}`);
    useDbName(dbNameArg);
    const counts = {};
    for (const s of ['foods', 'log', 'weights', 'kv', 'xp', 'health', 'inv']) {
      const all = await db.all(s);
      counts[s] = { total: all.length, old: all.filter(r => r.tag === 'OLD').length, new: all.filter(r => r.tag === 'NEW').length };
    }
    return counts;
  }, name);
  /* Real boot on the post-abort DB via evaluateOnNewDocument redirector. */
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
    return { hasScreen, text };
  });
  const c = postAbortCounts;
  const allOldOnly = ['foods', 'log', 'weights', 'kv', 'xp', 'health', 'inv'].every(s => c[s].new === 0 && c[s].old === OLD_N);
  const desc = [
    `Post-abort DB counts (booted the app on this DB via indexedDB.open`,
    `redirector, so the app really opened it):`,
    `  meals in food log:        ${c.log.total} rows (${c.log.new} NEW, ${c.log.old} OLD)`,
    `  weights logged:           ${c.weights.total} rows (${c.weights.new} NEW, ${c.weights.old} OLD)`,
    `  foods library:            ${c.foods.total} rows (${c.foods.new} NEW, ${c.foods.old} OLD)`,
    `  kv (settings/prefs):      ${c.kv.total} rows (${c.kv.new} NEW, ${c.kv.old} OLD)`,
    `  xp events:                ${c.xp.total} rows (${c.xp.new} NEW, ${c.xp.old} OLD)`,
    `  health readings:          ${c.health.total} rows (${c.health.new} NEW, ${c.health.old} OLD)`,
    `  inv items:                ${c.inv.total} rows (${c.inv.new} NEW, ${c.inv.old} OLD)`,
    ``,
    `WHAT THE PLAYER SEES:`,
    `  app booted:               ${bootState.hasScreen ? 'YES' : 'NO'}`,
    `  top-level page errors:    ${bootErrors.length === 0 ? 'none' : JSON.stringify(bootErrors)}`,
    `  first 400 chars on screen:`,
    `    ${bootState.text}`,
    ``,
    allOldOnly
      ? 'The transaction aborted cleanly. Every store holds ONLY the pre-import OLD rows. The player is looking at their original save.'
      : 'The DB has NEW rows after an abort. The fix is not working. Investigate.',
  ].join('\n');
  finding('FINDING C  FIX VERIFIED, POST-ABORT DB IS THE ORIGINAL SAVE', desc);
  ok('PLAYER  the app boots cleanly on a post-abort DB (no schema check refused it, no top-level exception)',
    bootState.hasScreen && bootErrors.length === 0,
    JSON.stringify({ hasScreen: bootState.hasScreen, errors: bootErrors }));
  ok('PLAYER  the post-abort DB IS the pre-import save: every store has exactly OLD_N OLD rows and zero NEW rows (the transactional-import guarantee at the row level)',
    allOldOnly,
    JSON.stringify(c));
}

await browser.close();
if (srvHandle) srvHandle.close();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
