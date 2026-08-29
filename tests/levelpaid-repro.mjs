/* DETERMINISTIC REPRO of the levelpaid-2 event of 2026-08-28.
 *
 * THE MECHANISM (established by tests/levelpaid-trace.mjs, 12 traced runs):
 * boot() keeps awarding AFTER kv 'game-init' lands: initLootIfNeeded, the
 * retirement backfills, then awardDayCloseIfDue, whose tail is a NON-QUIET
 * evaluateBadges sweep (9 badge attempts, 25 xp each). The audit declares the
 * boot finished at the flag, so its next SEED begins (first statement:
 * db.clear('xp')) while that tail can still be in flight. Every award the tail
 * issues after the clear is a FRESH claim against a nearly-empty ledger, and
 * awardOnce's level check runs on each: the running total crosses
 * xpForLevel(2) = 200 inside the sweep's 225-285 xp span (and can never reach
 * xpForLevel(3) = 510), so grantLevelRewards(1, 2) mints `levelpaid-2`, pays
 * levelCoins(2) = 30 coins and one golden crate. The badge keys re-claimed by
 * the straddling sweep are the same keys the reseeded backfill would mint, so
 * the final ledger differs from cold by exactly one xp:0 row: "1983 rows vs
 * 1982 cold, 51350 xp vs 51350 cold ... unexpected: levelpaid-2", verbatim.
 *
 * WHAT THIS SCRIPT DOES. Runs the audit's own drill, but instead of letting
 * the cut land wherever the scheduler puts it (observed 2026-08-29: 5 of 12
 * runs had tail awards inside the seed window, 0-3 rows landing post-clear,
 * always below the 200 xp crossing), it ALIGNS the cut: it waits for the
 * tail's dayclose-<yesterday> request to appear in the xp-store trace and
 * fires the full audit SEED at that instant. The remaining tail (protein 40 +
 * meals3 20 + 9 badges 225 = 285 xp) then claims fresh against the emptied
 * store and must cross 200. Then the audit's twice-interrupted resume drill
 * runs to completion and the final ledger is compared against an uncut cold
 * run, in the currency the bug pays in.
 *
 * PASS = the event reproduced: exactly one extra row, levelpaid-2, coins +30,
 * crates +1, XP identical, with the mint's full async stack captured.
 * An attempt where the cut misses the tail (no fresh post-clear claims) is
 * retried up to MAX_TRIES times; running out of tries is a FAILURE with the
 * per-attempt diagnostics printed, never a pass (an empty sample is a failure).
 *
 * Method notes: same instrument as tests/levelpaid-trace.mjs (IDBObjectStore
 * add/put wrapped in the page, V8 async stacks); SEED copied verbatim from
 * tests/boot-backfill-audit.mjs; CPU throttle 6 throughout the cut so the poll
 * loop (one ~10ms evaluate every 25ms) has margin inside the tail's gaps.
 * No js/ file is touched: the app is doing exactly what its ledger tells it.
 *
 * Usage: node tests/levelpaid-repro.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { boot, sleep, serveTree } = await import(path.join(ROOT, 'tests/godmode.js'));

const DAYS = 365, PER_DAY = 5, THROTTLE = 6, MAX_TRIES = 5;

const results = [];
const ok = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

/* ---- copied verbatim from tests/boot-backfill-audit.mjs (2026-08-29) ---- */
const SEED = async (DAYS, PER_DAY) => {
  const { db, kvGet, kvSet } = await import('/js/db.js');
  const { dayTotals } = await import('/js/nutrition.js');

  for (const s of ['log', 'weights', 'xp']) await db.clear(s);
  for (const k of ['game-init', 'game-init-at']) await db.del('kv', k);

  const d0 = new Date();
  const localKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dayKey = n => { const d = new Date(d0); d.setDate(d.getDate() - n); return localKey(d); };
  const today = localKey(d0);
  const targets = { kcal: 2200, p: 140, c: 220, f: 70 };

  const logRows = [], wRows = [];
  let id = 0;
  for (let n = DAYS; n >= 1; n--) {
    const date = dayKey(n);
    for (let m = 0; m < PER_DAY; m++) {
      logRows.push({ id: `seedlog-${String(id++).padStart(6, '0')}`, date, meal: m % 3,
                     name: 'Seed food', kcal: 380, p: 30, c: 40, f: 12, qty: 1, ts: Date.now() });
    }
    if (n % 6 === 0) wRows.push({ date, kg: 84 + (n % 7) * 0.1 });
  }
  for (let i = 0; i < logRows.length; i += 400) await Promise.all(logRows.slice(i, i + 400).map(r => db.put('log', r)));
  for (const w of wRows) await db.put('weights', w);
  await kvSet('settings', { ...(await kvGet('settings', {}) || {}), targets });
  return { logRows: logRows.length };
};
/* ---- end of the copied seed ---- */

const TRACE_INIT = () => {
  if (window.__xpTraceInstalled) return;
  window.__xpTraceInstalled = true;
  window.__xpTrace = [];
  const flush = () => {
    if (!window.__xpTrace.length) return;
    try {
      const prev = JSON.parse(localStorage.getItem('__xpTraceLog') || '[]');
      localStorage.setItem('__xpTraceLog', JSON.stringify(prev.concat(window.__xpTrace)));
      window.__xpTrace = [];
    } catch { /* keep buffering */ }
  };
  window.__xpTraceFlush = flush;
  const rec = (op, v) => {
    window.__xpTrace.push({ op, key: v && v.key, type: v && v.type, xp: v && v.xp,
                            at: Date.now(), stack: String(new Error().stack || '') });
    if (window.__xpTrace.length >= 250) flush();
  };
  const add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...a) { if (this.name === 'xp') rec('add', a[0]); return add.apply(this, a); };
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...a) { if (this.name === 'xp') rec('put', a[0]); return put.apply(this, a); };
  addEventListener('pagehide', flush);
};

const COLLECT = () => {
  window.__xpTraceFlush && window.__xpTraceFlush();
  const t = JSON.parse(localStorage.getItem('__xpTraceLog') || '[]');
  localStorage.removeItem('__xpTraceLog');
  return t;
};

const PROBE = async () => {
  let flag = null, rows = null;
  try {
    const { db, kvGet } = await import('/js/db.js');
    flag = !!(await kvGet('game-init'));
    rows = await db.count('xp');
  } catch { /* not up yet */ }
  return { flag, rows };
};

const LEDGER = async () => {
  const { db, kvGet } = await import('/js/db.js');
  const loot = await import('/js/loot.js');
  const rows = await db.all('xp');
  const inv = await db.all('inv');
  return { keys: rows.map(r => r.key), sum: rows.reduce((a, r) => a + (r.xp || 0), 0),
           coins: await loot.coins(), dust: await loot.boneDust(),
           crates: inv.filter(r => r.kind === 'crate').length,
           flag: !!(await kvGet('game-init')) };
};

const srv = await serveTree(ROOT);
const base = srv.url.replace(/\/?$/, '/');

let page, browser;
try {
  ({ page, browser } = await boot(base + '?demo'));
  await sleep(1200);
  await page.evaluate(TRACE_INIT);
  await page.evaluateOnNewDocument(TRACE_INIT);
  const cdp = await page.createCDPSession();
  const throttle = rate => cdp.send('Emulation.setCPUThrottlingRate', { rate });

  const bootToFlag = async (maxMs = 90000) => {
    const t0 = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded' });
    while (Date.now() - t0 < maxMs) {
      const s = await page.evaluate(PROBE).catch(() => null);
      if (s && s.flag) return true;
      await sleep(120);
    }
    return false;
  };

  /* Wait until the xp store has been quiet for quietMs: the boot tail is done. */
  const quiesce = async (quietMs = 2500, maxMs = 30000) => {
    const t0 = Date.now();
    let last = -1, lastMoved = Date.now();
    while (Date.now() - t0 < maxMs) {
      const n = await page.evaluate(() =>
        (window.__xpTrace || []).length + (JSON.parse(localStorage.getItem('__xpTraceLog') || '[]')).length);
      if (n !== last) { last = n; lastMoved = Date.now(); }
      else if (Date.now() - lastMoved >= quietMs) return true;
      await sleep(200);
    }
    return false;
  };

  /* --------- CONTROL: one uncut cold run, tail allowed to finish. --------- */
  await page.evaluate(SEED, DAYS, PER_DAY);
  await throttle(THROTTLE);
  const coldUp = await bootToFlag();
  await throttle(1);
  await quiesce();          // this wait is exactly what the audit lacks
  const cold = await page.evaluate(LEDGER);
  await page.evaluate(COLLECT);
  ok('SAMPLE the control cold run completed with the tail settled',
     coldUp && cold.flag && cold.keys.length > 1900,
     `${cold.keys.length} rows, ${cold.sum} xp, ${cold.coins} coins, ${cold.crates} crates`);

  /* --------- THE CUT, retried until it lands inside the tail. --------- */
  let hit = null;
  const attempts = [];
  for (let attempt = 1; attempt <= MAX_TRIES && !hit; attempt++) {
    await throttle(1);
    await page.evaluate(SEED, DAYS, PER_DAY);
    await page.evaluate(COLLECT);
    await throttle(THROTTLE);
    const up = await bootToFlag();

    /* Flag is up; the tail is running. Wait for awardDayCloseIfDue's first
       request (the dayclose-<yesterday> duplicate) and fire the audit's SEED
       at that instant: its first statement is db.clear('xp'), so everything
       the tail does from here claims fresh against an emptying ledger. */
    const t0 = Date.now();
    let sawTail = false;
    while (Date.now() - t0 < 60000) {
      const seen = await page.evaluate(() =>
        (window.__xpTrace || []).some(t => /awardDayCloseIfDue/.test(t.stack)) ||
        JSON.parse(localStorage.getItem('__xpTraceLog') || '[]').some(t => /awardDayCloseIfDue/.test(t.stack)));
      if (seen) { sawTail = true; break; }
      await sleep(25);
    }
    const seedStartedAt = Date.now();
    await page.evaluate(SEED, DAYS, PER_DAY);   // THE CUT: the audit's own reseed
    await quiesce(1500, 20000);                 // let the straddling tail finish

    /* What did the tail claim after the cut? Fresh claims are the rows now
       standing in a store the seed emptied. */
    const midTrace = await page.evaluate(() => {
      window.__xpTraceFlush && window.__xpTraceFlush();
      return JSON.parse(localStorage.getItem('__xpTraceLog') || '[]');
    });
    const tailReqs = midTrace.filter(t => /awardDayCloseIfDue|grantLevelRewards/.test(t.stack));
    const paid = midTrace.filter(t => /^levelpaid-/.test(t.key || ''));
    attempts.push({ attempt, up, sawTail, tailRequests: tailReqs.length, levelpaid: paid.map(p => p.key) });
    console.log(`attempt ${attempt}: bootUp=${up} sawTail=${sawTail} tailRequests=${tailReqs.length} ` +
                `levelpaid=[${paid.map(p => p.key).join(',')}] (seed fired ${seedStartedAt - t0}ms after flag-poll start)`);
    if (paid.length) hit = { attempt, paid, tailReqs };
  }

  ok('CUT a seed fired at the tail made the sweep claim fresh and mint a level payout',
     !!hit,
     hit ? `attempt ${hit.attempt}: ${hit.paid.map(p => p.key).join(', ')}`
         : `no mint in ${MAX_TRIES} attempts: ${JSON.stringify(attempts)}`);

  if (hit) {
    console.log('\n=== THE MINT, FULL ASYNC STACK ===');
    for (const p of hit.paid) console.log(`${p.op} ${p.key} xp=${p.xp}\n${p.stack}\n`);

    /* --------- finish the audit's own resume drill on the cut save --------- */
    const interruptions = [];
    for (let round = 0; round < 2; round++) {
      const t0 = Date.now();
      await page.reload({ waitUntil: 'domcontentloaded' });
      let last = null;
      while (Date.now() - t0 < 60000) {
        last = await page.evaluate(PROBE).catch(() => null);
        if (last && (last.flag || last.rows > (round + 1) * 400)) break;
        await sleep(150);
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
      await sleep(400);
      interruptions.push(last && last.rows);
    }
    const done = await bootToFlag();
    await throttle(1);
    await quiesce();
    const resumed = await page.evaluate(LEDGER);
    const coldSet = new Set(cold.keys);
    const extra = resumed.keys.filter(k => !coldSet.has(k));

    ok('EVENT the audit FAIL of 2026-08-28, reproduced on demand',
       done && resumed.keys.length === cold.keys.length + 1 &&
       extra.length === 1 && extra[0] === 'levelpaid-2' &&
       resumed.sum === cold.sum &&
       resumed.coins === cold.coins + 30 && resumed.crates === cold.crates + 1,
       `${resumed.keys.length} rows vs ${cold.keys.length} cold, ${resumed.sum} xp vs ${cold.sum} cold, ` +
       `unexpected: ${extra.join(', ') || 'none'}; ` +
       `PAID DIFFERENTLY: coins ${resumed.coins} vs ${cold.coins}, crates ${resumed.crates} vs ${cold.crates} ` +
       `(interrupted at ${interruptions.join(', ')} rows)`);
  }
} catch (e) {
  ok('REPRO ran to completion', false, String(e && e.stack || e));
} finally {
  try { if (browser) await browser.close(); } catch { /* gone */ }
  try { srv.close(); } catch { /* gone */ }
}

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
