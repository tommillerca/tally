/* THE FIRST-BOOT BACKFILL MUST NOT BE A BOOT LOOP, AND MUST NOT LOSE XP.
 *
 * The bug this pins. js/game.js initGameIfNeeded is a one-shot retroactive replay
 * that runs on the first v385 boot of any pre-RPG install: about 1,980 awards for
 * a one-year diary. It had three properties, and only together were they fatal:
 *   1. js/app.js ran it BEFORE route(), so it blocked first paint;
 *   2. the completion flag was written at the very END, so an interruption threw
 *      away every second of it;
 *   3. index.html's dead-shell backstop reloads the page when #screen is still
 *      empty at 12s.
 * A slow phone with an old save therefore blocked past 12s, got reloaded, found
 * no flag, and replayed from zero: a loop that waiting cannot escape, because
 * waiting is the thing that triggers it.
 *
 * MEASURED here, one year of diary (1,825 log rows, 60 weigh-ins, 1,982 awards),
 * initGameIfNeeded end to end, all three trees interleaved in one session, two
 * samples each, because this container's own speed drifts by nearly 2x between
 * sessions:
 *     origin/main   (award() rescanned the xp store)  1x 13.3-13.4s  4x 35.0-38.7s
 *     gwart/xpperf  (constant-cost award)             1x  2.8-3.0s   4x 10.0-11.1s  5x 13.3s  6x 14.2s
 *     this branch   (chunked and checkpointed)        1x  2.5-2.8s   4x  9.7-10.5s  5x 13.5s  6x 14.6s
 * The 12,000ms line is crossed at NO THROTTLE on main, and between 4x and 5x
 * after the constant-cost award(). 4x is an ordinary mid-range phone and
 * index.html's own boot curve is calibrated out to 40x, so speed moved the cliff
 * without removing it. What changed here is the shape: checkpointed, resumable,
 * and behind the paint.
 *
 * WHAT THIS ASSERTS, and how each goes red:
 *   SAMPLE  The legacy save was really built and the replay really ran on it. An
 *           empty sample set is a FAILURE, never a pass.
 *   TOTAL   A cold replay lands on a ledger this audit derives from the SEED DATA,
 *           without consulting game.js's loop.
 *           RED: skip a chunk, or advance the cursor past work that never ran.
 *   PAINT   On a legacy save there is a moment when #screen HAS CONTENT while
 *           'game-init' is still unset. Stated as an ORDER, not a millisecond
 *           threshold, so it means the same thing on any machine.
 *           DIRECTION: a screen still empty when the replay finishes is failure.
 *           BOUND: content must be up strictly before the flag lands.
 *           RED: put initGameIfNeeded back in front of route() in boot().
 *   RESUME  Interrupted TWICE by a real page reload mid-replay, the save still
 *           lands on the exact same ledger and XP total as an uninterrupted run.
 *           This is the half that matters: it is the boot loop, reproduced.
 *           RED: lose the checkpoint, or trust one that no longer matches its item.
 *   WORK    And a resume must actually SKIP what it already did, or it is a loop
 *           with extra steps. Counted at the IndexedDB layer (reads of the xp
 *           store), outside every module, so it measures the same thing before and
 *           after the fix and survives a reload. DIRECTION: more reads is failure.
 *           BOUND: a resumed boot reads the xp store at most RESUME_BUDGET of what
 *           a cold one does. RED: delete the cursor, and the resume redoes ~1,980.
 *   LEVEL   A half-replayed level must not reach the shared leaderboard.
 *           gameInitSettled() stays PENDING while the replay runs and resolves
 *           after it, and socialSnapshot() awaits it before reading totalXp.
 *           RED: drop the await in socialSnapshot, or resolve the gate early.
 *
 * WHAT A CONTAINER CANNOT SHOW YOU: this machine is the fast one in every number
 * above. The device that actually looped is a cold, thermally throttled phone with
 * a cold IndexedDB and a cold module cache, and CPU throttling models the JS but
 * not the storage. So the milliseconds here are a floor, which is exactly why
 * PAINT, RESUME and WORK are written as orders and ratios instead.
 *
 * Usage: node tests/boot-backfill-audit.mjs [baseUrl]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { boot, sleep, serveTree } = await import(path.join(ROOT, 'tests/godmode.js'));

const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
/* NEVER run bare: godmode's boot() defaults to the LIVE PRODUCTION site, and this
   audit writes thousands of xp rows and reloads the page repeatedly. It serves
   this tree itself. */
const srv = argUrl ? null : await serveTree(ROOT);
const base = (argUrl || srv.url).replace(/\/?$/, '/');

const results = [];
const ok = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

const DAYS = 365;           // a full legacy year
const PER_DAY = 5;          // foods a day: a real diary, and 1,825 rows
const THROTTLE = 6;         // the slowest device the 12s backstop was calibrated for
const RESUME_BUDGET = 0.75; // a resume may re-read at most this share of a cold run

/* Counted at the IndexedDB layer so it is blind to which module did the reading.
   db.all uses getAll and db.get uses get, so this counts exactly award()'s
   existence check plus the badge and levelup lookups. */
const COUNT_XP_GETS = () => {
  window.__xpGets = 0;
  const g = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function (...a) {
    if (this.name === 'xp') window.__xpGets++;
    return g.apply(this, a);
  };
};

/* The seed, and the reference ledger derived FROM IT rather than from game.js.
   It writes IndexedDB so it runs in the page, but every key it returns is
   computed from the rules the feature is specified by, so a loop that quietly
   skips work cannot agree with it. */
const SEED = async (DAYS, PER_DAY) => {
  const { db, kvGet, kvSet } = await import('/js/db.js');
  const { dayTotals } = await import('/js/nutrition.js');

  for (const s of ['log', 'weights', 'xp']) await db.clear(s);
  for (const k of ['game-init', 'game-init-at']) await db.del('kv', k);

  const d0 = new Date();
  const dayKey = n => { const d = new Date(d0); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const today = d0.toISOString().slice(0, 10);
  const targets = { kcal: 2200, p: 140, c: 220, f: 70 };

  const logRows = [], wRows = [];
  let id = 0;
  for (let n = DAYS; n >= 1; n--) {
    const date = dayKey(n);
    for (let m = 0; m < PER_DAY; m++) {
      /* ids are zero-padded so IndexedDB key order matches insertion order, which
         is what makes "the last 400" the same list on every boot, which is what
         makes an index into that list a resumable position at all. */
      logRows.push({ id: `seedlog-${String(id++).padStart(6, '0')}`, date, meal: m % 3,
                     name: 'Seed food', kcal: 380, p: 30, c: 40, f: 12, qty: 1, ts: Date.now() });
    }
    if (n % 6 === 0) wRows.push({ date, kg: 84 + (n % 7) * 0.1 });
  }
  for (let i = 0; i < logRows.length; i += 400) await Promise.all(logRows.slice(i, i + 400).map(r => db.put('log', r)));
  for (const w of wRows) await db.put('weights', w);
  // boot() only reaches the backfill past the onboarding gate, so it needs targets
  await kvSet('settings', { ...(await kvGet('settings', {}) || {}), targets });

  // THE REFERENCE. Derived here, from the seed, never from the replay.
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
  return { kids: document.getElementById('screen')?.children.length ?? 0, flag, rows, gets: window.__xpGets ?? null };
};

const LEDGER = async () => {
  const { db, kvGet } = await import('/js/db.js');
  const rows = await db.all('xp');
  return { keys: rows.map(r => r.key), sum: rows.reduce((a, r) => a + (r.xp || 0), 0),
           flag: !!(await kvGet('game-init')), cursor: await kvGet('game-init-at', null), gets: window.__xpGets ?? null };
};

let page, browser;
try {
  ({ page, browser } = await boot(base + '?demo'));
  await sleep(1200);
  await page.evaluate(COUNT_XP_GETS);            // this document
  await page.evaluateOnNewDocument(COUNT_XP_GETS); // and every one after a reload
  const cdp = await page.createCDPSession();
  const throttle = rate => cdp.send('Emulation.setCPUThrottlingRate', { rate });

  /* Drive a real boot and watch it. Returns every sample taken between the reload
     and the moment 'game-init' lands, which is the only definition of "the replay
     finished" the app itself uses. */
  const bootAndWatch = async (maxMs = 90000) => {
    const t0 = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded' });
    const samples = [];
    while (Date.now() - t0 < maxMs) {
      const s = await page.evaluate(PROBE).catch(() => null);
      if (s) samples.push({ ...s, at: Date.now() - t0 });
      if (s && s.flag) break;
      await sleep(120);
    }
    return { samples, ms: Date.now() - t0 };
  };

  const seeded = await page.evaluate(SEED, DAYS, PER_DAY);

  /* --------- LEVEL: the gate that keeps a half-replayed level off the board. --------- */
  const gate = await page.evaluate(async (targets) => {
    const game = await import('/js/game.js');
    const run = game.initGameIfNeeded(targets);
    const early = await Promise.race([
      game.gameInitSettled().then(() => 'settled'),
      new Promise(r => setTimeout(() => r('pending'), 400)),
    ]);
    const runningMid = game.gameInitRunning();
    await run;
    const late = await Promise.race([
      game.gameInitSettled().then(() => 'settled'),
      new Promise(r => setTimeout(() => r('pending'), 400)),
    ]);
    return { early, runningMid, late, runningAfter: game.gameInitRunning() };
  }, seeded.targets);

  const appSrc = await (await fetch(base + 'js/app.js')).text();
  const snapBody = appSrc.slice(appSrc.indexOf('async function socialSnapshot()'), appSrc.indexOf('async function socialSnapshot()') + 1600);
  const snapAwaitsGate = /await gameInitSettled\(\)[\s\S]*?totalXp\(\)/.test(snapBody) && snapBody.includes('async function socialSnapshot()');

  ok('LEVEL the backfill gate stays pending while the replay runs, and socialSnapshot waits on it',
     gate.early === 'pending' && gate.runningMid === true && gate.late === 'settled' &&
     gate.runningAfter === false && snapAwaitsGate,
     `mid-run gate=${gate.early}/running=${gate.runningMid}, after gate=${gate.late}/running=${gate.runningAfter}, ` +
     `socialSnapshot awaits gameInitSettled before totalXp: ${snapAwaitsGate}`);

  /* --------- COLD: one uninterrupted boot on the legacy save. --------- */
  await page.evaluate(SEED, DAYS, PER_DAY);
  await throttle(THROTTLE);
  const coldRun = await bootAndWatch();
  const cold = await page.evaluate(LEDGER);

  ok('SAMPLE the legacy save was built and a cold boot replayed it end to end',
     seeded.logRows > 1000 && seeded.want.length > 500 && cold.keys.length > 500 &&
     cold.sum > 0 && cold.flag === true && coldRun.samples.length > 0,
     `${seeded.logRows} log rows / ${seeded.weights} weigh-ins / ${seeded.dates} dates; ` +
     `${seeded.want.length} reference keys; ${cold.keys.length} ledger rows, ${cold.sum} xp; ` +
     `${coldRun.samples.length} samples over ${coldRun.ms}ms at ${THROTTLE}x CPU throttle`);

  {
    const have = new Set(cold.keys);
    const missing = seeded.want.filter(k => !have.has(k));
    ok('TOTAL a cold replay lands on the ledger derived independently from the save',
       seeded.want.length > 0 && missing.length === 0,
       `${seeded.want.length - missing.length}/${seeded.want.length} reference keys present` +
       (missing.length ? `; first missing: ${missing.slice(0, 4).join(', ')}` : ''));
  }

  {
    const s = coldRun.samples;
    const firstPaint = s.findIndex(x => x.kids > 0);
    const firstFlag = s.findIndex(x => x.flag === true);
    const paintedWhileUnfinished = s.filter(x => x.kids > 0 && x.flag === false).length;
    ok('PAINT the screen has content while the retroactive replay is still unfinished',
       s.length > 0 && firstFlag >= 0 && firstPaint >= 0 && firstPaint < firstFlag && paintedWhileUnfinished > 0,
       `first paint at sample ${firstPaint} (${s[firstPaint] ? s[firstPaint].at : '?'}ms), ` +
       `game-init at sample ${firstFlag} (${s[firstFlag] ? s[firstFlag].at : '?'}ms); ` +
       `${paintedWhileUnfinished}/${s.length} samples had content with the replay still running`);
  }

  /* --------- RESUME: two real page reloads straight through the middle. --------- */
  await throttle(1);
  await page.evaluate(SEED, DAYS, PER_DAY);
  await throttle(THROTTLE);

  const interruptions = [];
  for (let round = 0; round < 2; round++) {
    const t0 = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded' });
    let last = null;
    // let boot's own replay get a meaningful way in, then pull the rug on it
    while (Date.now() - t0 < 60000) {
      last = await page.evaluate(PROBE).catch(() => null);
      if (last && (last.flag || last.rows > (round + 1) * 400)) break;
      await sleep(150);
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(400);
    const after = await page.evaluate(async () => {
      const { db, kvGet } = await import('/js/db.js');
      return { cursor: await kvGet('game-init-at', null), flag: !!(await kvGet('game-init')), rows: await db.count('xp') };
    });
    interruptions.push({ killedAt: last && last.rows, ...after });
  }

  ok('SAMPLE both interruptions caught the replay mid-flight, before it had finished',
     interruptions.length === 2 && interruptions.every(x => x.rows > 100 && x.flag === false),
     interruptions.map((x, i) => `#${i + 1}: ${x.rows} ledger rows survived, flag=${x.flag}`).join('  '));

  ok('RESUME an interrupted replay leaves a checkpoint behind, so the work survives the reload',
     interruptions.length === 2 &&
     interruptions.every(x => x.cursor && Number.isInteger(x.cursor.p) && (x.cursor.p > 0 || x.cursor.i > 0)),
     interruptions.map((x, i) => `#${i + 1}: cursor=${JSON.stringify(x.cursor)}`).join('  '));

  // now let it run out, and count what the resumed boot has to read
  const resumeRun = await bootAndWatch();
  const resumed = await page.evaluate(LEDGER);
  await throttle(1);

  {
    const have = new Set(resumed.keys);
    const missing = seeded.want.filter(k => !have.has(k));
    const coldSet = new Set(cold.keys);
    const extra = resumed.keys.filter(k => !coldSet.has(k));
    ok('RESUME twice-interrupted, the save reaches the exact ledger and XP total of an uninterrupted run',
       seeded.want.length > 0 && missing.length === 0 && resumed.sum === cold.sum &&
       resumed.keys.length === cold.keys.length && extra.length === 0 && resumed.flag === true,
       `${resumed.keys.length} rows vs ${cold.keys.length} cold, ${resumed.sum} xp vs ${cold.sum} cold, ` +
       `${seeded.want.length - missing.length}/${seeded.want.length} reference keys` +
       (missing.length ? `; first missing: ${missing.slice(0, 4).join(', ')}` : '') +
       (extra.length ? `; unexpected: ${extra.slice(0, 4).join(', ')}` : ''));
  }

  ok('RESUME the checkpoint is cleared once the replay is genuinely finished',
     resumed.flag === true && resumed.cursor === null,
     `flag=${resumed.flag} cursor=${JSON.stringify(resumed.cursor)}`);

  ok(`WORK a resumed boot re-reads at most ${Math.round(RESUME_BUDGET * 100)}% of the xp store a cold one reads`,
     cold.gets > 500 && resumed.gets > 0 && resumed.gets <= cold.gets * RESUME_BUDGET,
     `cold ${cold.gets} xp-store reads over ${coldRun.ms}ms, resumed ${resumed.gets} over ${resumeRun.ms}ms = ` +
     `${cold.gets ? Math.round((resumed.gets / cold.gets) * 100) : '?'}% of cold`);
} catch (e) {
  ok('AUDIT ran to completion', false, String(e && e.stack || e));
} finally {
  try { if (browser) await browser.close(); } catch { /* already gone */ }
  try { if (srv) srv.close(); } catch { /* already gone */ }
}

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
