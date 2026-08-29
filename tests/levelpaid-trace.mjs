/* FULL-TRACE PROBE for the levelpaid-2 anomaly (docs/LEVELPAID-TRACE-RESULTS.md).
 *
 * WHAT HAPPENED, ONCE. On 2026-08-28 a gate run of tests/boot-backfill-audit.mjs
 * failed its RESUME row: a twice-interrupted boot landed on 1983 xp rows against
 * 1982 cold, identical XP (51350), and the extra row was `levelpaid-2`: the
 * atomic claim that gates a level payout (js/game.js grantLevelRewards). Minting
 * it is followed by coinsAdd + a golden crate, so the interrupted run PAID a
 * level the cold run did not. 26+ reruns since, including a 15-point interrupt
 * sweep, have not reproduced it.
 *
 * WHAT THIS PROBE DOES. It repeats the audit's exact COLD and twice-interrupted
 * RESUME drill (same seed, same throttle, same interrupt condition) N times, and
 * on every run it records EVERY request against the xp store (`add` and `put`)
 * with the row's key/type/xp and a captured V8 async stack, in the page, at the
 * IDBObjectStore.prototype layer, outside every app module. Nothing in js/ is
 * touched. Output per run:
 *   - the caller-signature set of cold vs resume, and their diff;
 *   - whether awardDayCloseIfDue issued any xp-store request, with the
 *     day-claim kv state (dayHighWater/dayPaceKey/dayPaceAt/dayWitnessOrd)
 *     snapshotted before and after each boot;
 *   - any levelpaid-* request, with its FULL stack (the prize, if it fires);
 *   - the audit's own equality checks (rows / xp / coins / dust / crates).
 *
 * METHOD NOTES (record the method, not just the number):
 *   - Stacks are `new Error().stack` taken synchronously inside the wrapped
 *     add/put. V8's zero-cost async stacks include the awaiting chain
 *     ("at async runInitBackfill"), which is what attributes a request to its
 *     caller path. A stack that shows only db.js frames means the async chain
 *     was broken; the probe verifies on its first run that backfill awards do
 *     carry an `async runInitBackfill` frame and FAILS the run if none do
 *     (an empty sample is a failure, never a pass).
 *   - Trace records buffer in window.__xpTrace and flush to localStorage every
 *     250 records and on pagehide, so the records of an interrupted document
 *     survive the reload that kills it. sessionStorage numbers the documents.
 *   - The instrumentation adds ~0.1ms of sync work per request. The original
 *     event fired at CPU throttle 6, which is kept.
 *
 * SEED / PROBE / LEDGER are copied from tests/boot-backfill-audit.mjs verbatim
 * (2026-08-29) so the drill is the same drill that produced the event.
 *
 * Usage: node tests/levelpaid-trace.mjs [--runs N] [--out DIR]
 * Serves this tree itself; never points at production.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { boot, sleep, serveTree } = await import(path.join(ROOT, 'tests/godmode.js'));

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const RUNS = Number(arg('--runs', 10));
const OUT = path.resolve(arg('--out', path.join(ROOT, 'tests', 'levelpaid-trace-out')));
fs.mkdirSync(OUT, { recursive: true });

const DAYS = 365, PER_DAY = 5, THROTTLE = 6;

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

  const dates = [...new Set(logRows.map(e => e.date))].sort();
  const want = [];
  for (const e of logRows.slice(-400)) want.push(`log-${e.id}`);
  for (const d of dates) want.push(`firstlog-${d}`);
  for (const w of wRows.slice(-60)) want.push(`weigh-${w.date}`);
  for (const d of dates) {
    if (d >= today) continue;
    const es = logRows.filter(e => e.date === d);
    const tot = dayTotals(es);
    if (targets.p && tot.p >= targets.p) want.push(`protein-${d}`);
    if (tot.kcal <= targets.kcal && tot.kcal >= targets.kcal * 0.6) want.push(`dayclose-${d}`);
    const meals = new Set(es.map(e => e.meal));
    if ([0, 1, 2].every(m => meals.has(m))) want.push(`meals3-${d}`);
  }
  return { logRows: logRows.length, weights: wRows.length, dates: dates.length, want, targets };
};

const PROBE = async () => {
  let flag = null, rows = null;
  try {
    const { db, kvGet } = await import('/js/db.js');
    flag = !!(await kvGet('game-init'));
    rows = await db.count('xp');
  } catch { /* modules are not up yet: that is itself a sample */ }
  return { kids: document.getElementById('screen')?.children.length ?? 0, flag, rows };
};

const LEDGER = async () => {
  const { db, kvGet } = await import('/js/db.js');
  const loot = await import('/js/loot.js');
  const rows = await db.all('xp');
  const inv = await db.all('inv');
  return { keys: rows.map(r => r.key), sum: rows.reduce((a, r) => a + (r.xp || 0), 0),
           coins: await loot.coins(), dust: await loot.boneDust(),
           crates: inv.filter(r => r.kind === 'crate').length,
           flag: !!(await kvGet('game-init')), cursor: await kvGet('game-init-at', null) };
};
/* ---- end of the copied drill ---- */

/* The instrument. Installed on the current document AND on every new one, so an
   interrupted document's records survive its own death via the pagehide flush. */
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
    } catch { /* quota: keep buffering in memory rather than lose the tail */ }
  };
  window.__xpTraceFlush = flush;
  let doc = 0;
  try {
    doc = (Number(sessionStorage.getItem('__xpTraceDoc') || 0) + 1);
    sessionStorage.setItem('__xpTraceDoc', String(doc));
  } catch { /* doc stays 0 */ }
  const rec = (op, v) => {
    window.__xpTrace.push({ op, key: v && v.key, type: v && v.type, xp: v && v.xp,
                            doc, at: Date.now(), stack: String(new Error().stack || '') });
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
  try { sessionStorage.setItem('__xpTraceDoc', '0'); } catch { /* fine */ }
  return t;
};

const DAYSTATE = async () => {
  const { kvGet } = await import('/js/db.js');
  return { highWater: await kvGet('dayHighWater', null), paceKey: await kvGet('dayPaceKey', null),
           paceAt: await kvGet('dayPaceAt', null), witnessOrd: await kvGet('dayWitnessOrd', null) };
};

/* A caller signature: the app-level function chain of a stack, most-caller-last,
   with URLs and line numbers stripped so signatures aggregate across runs. */
const sigOf = (stack) => {
  const frames = [];
  for (const line of stack.split('\n')) {
    const m = line.match(/at (async )?([\w.<>$]+)?\s*\(?[^()]*\/js\/(\w+)\.js/);
    if (m) frames.push(`${m[2] || '?'}@${m[3]}`);
  }
  return frames.join('<') || '(no js/ frames)';
};

const srv = await serveTree(ROOT);
const base = srv.url.replace(/\/?$/, '/');

let page, browser;
const runs = [];
let fatal = null;
try {
  ({ page, browser } = await boot(base + '?demo'));
  await sleep(1200);
  await page.evaluate(TRACE_INIT);
  await page.evaluateOnNewDocument(TRACE_INIT);
  const cdp = await page.createCDPSession();
  const throttle = rate => cdp.send('Emulation.setCPUThrottlingRate', { rate });

  const bootAndWatch = async (maxMs = 90000) => {
    const t0 = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded' });
    while (Date.now() - t0 < maxMs) {
      const s = await page.evaluate(PROBE).catch(() => null);
      if (s && s.flag) break;
      await sleep(120);
    }
    return Date.now() - t0;
  };

  for (let r = 0; r < RUNS; r++) {
    const run = { n: r + 1 };

    /* COLD */
    await throttle(1);
    const seeded = await page.evaluate(SEED, DAYS, PER_DAY);
    /* KEEP the seed-window trace: the previous document is still live while SEED
       clears the xp store under it, and any straggler award landing on the
       freshly-emptied store is exactly the small-total moment a 1->2 crossing
       needs. Discarding this window would blind the probe to that suspect. */
    run.coldSeedTrace = await page.evaluate(COLLECT);
    run.postSeedKeysCold = await page.evaluate(async () => {
      const { db } = await import('/js/db.js');
      return (await db.all('xp')).map(r => r.key);
    });
    run.dayStateBeforeCold = await page.evaluate(DAYSTATE);
    await throttle(THROTTLE);
    run.coldMs = await bootAndWatch();
    const cold = await page.evaluate(LEDGER);
    const coldTrace = await page.evaluate(COLLECT);
    run.dayStateAfterCold = await page.evaluate(DAYSTATE);

    /* RESUME: two real reloads through the middle, the audit's own condition */
    await throttle(1);
    await page.evaluate(SEED, DAYS, PER_DAY);
    run.resumeSeedTrace = await page.evaluate(COLLECT);
    run.postSeedKeysResume = await page.evaluate(async () => {
      const { db } = await import('/js/db.js');
      return (await db.all('xp')).map(r => r.key);
    });
    run.dayStateBeforeResume = await page.evaluate(DAYSTATE);
    await throttle(THROTTLE);
    run.interruptions = [];
    for (let round = 0; round < 2; round++) {
      const t0 = Date.now();
      await page.reload({ waitUntil: 'domcontentloaded' });
      let last = null;
      while (Date.now() - t0 < 60000) {
        last = await page.evaluate(PROBE).catch(() => null);
        if (last && (last.flag || last.rows > (round + 1) * 400)) break;
        await sleep(150);
      }
      run.interruptions.push({ rowsAtKill: last && last.rows, flag: last && last.flag });
    }
    run.resumeMs = await bootAndWatch();
    const resumed = await page.evaluate(LEDGER);
    const resumeTrace = await page.evaluate(COLLECT);
    run.dayStateAfterResume = await page.evaluate(DAYSTATE);
    await throttle(1);

    /* the audit's equality checks, in the currency the bug pays in */
    const coldSet = new Set(cold.keys);
    const resumeSet = new Set(resumed.keys);
    run.ledger = {
      coldRows: cold.keys.length, resumeRows: resumed.keys.length,
      coldXp: cold.sum, resumeXp: resumed.sum,
      coldCoins: cold.coins, resumeCoins: resumed.coins,
      coldDust: cold.dust, resumeDust: resumed.dust,
      coldCrates: cold.crates, resumeCrates: resumed.crates,
      extraKeys: resumed.keys.filter(k => !coldSet.has(k)),
      missingKeys: cold.keys.filter(k => !resumeSet.has(k)),
      missingFromReference: seeded.want.filter(k => !resumeSet.has(k)).length,
    };
    run.anomaly = run.ledger.extraKeys.length > 0 || run.ledger.missingKeys.length > 0 ||
      run.ledger.coldXp !== run.ledger.resumeXp || run.ledger.coldCoins !== run.ledger.resumeCoins ||
      run.ledger.coldDust !== run.ledger.resumeDust || run.ledger.coldCrates !== run.ledger.resumeCrates ||
      run.postSeedKeysCold.length > 0 || run.postSeedKeysResume.length > 0;

    /* caller-set diff */
    const sigCount = trace => {
      const m = new Map();
      for (const t of trace) { const s = `${t.op}:${t.type}:${sigOf(t.stack)}`; m.set(s, (m.get(s) || 0) + 1); }
      return m;
    };
    const cs = sigCount(coldTrace), rs = sigCount(resumeTrace);
    run.sigs = {
      coldOnly: [...cs.keys()].filter(k => !rs.has(k)),
      resumeOnly: [...rs.keys()].filter(k => !cs.has(k)),
      counts: Object.fromEntries([...new Set([...cs.keys(), ...rs.keys()])].map(k => [k, { cold: cs.get(k) || 0, resume: rs.get(k) || 0 }])),
    };

    /* did awardDayCloseIfDue reach the xp store, in either half */
    const dayCloseHits = trace => trace.filter(t => /awardDayCloseIfDue/.test(t.stack)).map(t => ({ op: t.op, key: t.key, doc: t.doc }));
    run.dayClose = { cold: dayCloseHits(coldTrace), resume: dayCloseHits(resumeTrace) };

    /* the prize, if it ever fires */
    const paid = [...coldTrace, ...resumeTrace].filter(t => /^levelpaid-/.test(t.key || ''));
    run.levelpaid = paid.map(t => ({ half: coldTrace.includes(t) ? 'cold' : 'resume', op: t.op, key: t.key, doc: t.doc, at: t.at, stack: t.stack }));

    /* method self-check: the async chain must be visible, or the whole caller
       attribution is blind. An empty sample is a failure. */
    run.traceRecords = { cold: coldTrace.length, resume: resumeTrace.length };
    run.asyncChainVisible = coldTrace.some(t => /async runInitBackfill/.test(t.stack));

    fs.writeFileSync(path.join(OUT, `run-${String(r + 1).padStart(2, '0')}.json`), JSON.stringify({ ...run, coldTrace, resumeTrace }, null, 1));
    runs.push(run);
    console.log(`run ${r + 1}/${RUNS}: cold ${run.ledger.coldRows} rows/${run.ledger.coldXp} xp/${run.ledger.coldCoins} coins, ` +
      `resume ${run.ledger.resumeRows} rows/${run.ledger.resumeXp} xp/${run.ledger.resumeCoins} coins, ` +
      `trace ${coldTrace.length}+${resumeTrace.length} records, asyncChain=${run.asyncChainVisible}, ` +
      `dayClose cold=${run.dayClose.cold.length} resume=${run.dayClose.resume.length}, ` +
      `seedStray=${run.coldSeedTrace.length}/${run.resumeSeedTrace.length} postSeedRows=${run.postSeedKeysCold.length}/${run.postSeedKeysResume.length}, ` +
      `levelpaid=${run.levelpaid.length}${run.anomaly ? '  <-- ANOMALY: ' + JSON.stringify(run.ledger.extraKeys.slice(0, 4)) : ''}`);
    if (run.levelpaid.length) console.log('LEVELPAID CAPTURED:\n' + JSON.stringify(run.levelpaid, null, 2));
  }
} catch (e) {
  fatal = String(e && e.stack || e);
  console.error('FATAL', fatal);
} finally {
  try { if (browser) await browser.close(); } catch { /* gone */ }
  try { srv.close(); } catch { /* gone */ }
}

fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ RUNS, THROTTLE, DAYS, PER_DAY, fatal, runs }, null, 1));
const bad = runs.filter(r => r.anomaly);
const blind = runs.filter(r => !r.asyncChainVisible || !r.traceRecords.cold || !r.traceRecords.resume);
console.log(`\n${runs.length} runs complete; ${bad.length} anomalous; ${blind.length} with a blind or empty trace (a blind trace is a FAILURE)`);
process.exit(fatal || blind.length ? 1 : 0);
