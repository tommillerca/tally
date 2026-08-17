/* THE XP RUNNING TOTAL: it must be FAST, and it must be RIGHT.
 *
 * The bug this pins: award() called totalXp(), which was db.all('xp') plus a
 * reduce, on EVERY reward. Measured in Chrome on this container against the real
 * store, one award cost 4.9ms at 900 xp rows (a month of play), 28ms at 5400 (six
 * months) and 35ms at 10950 (a year), rising linearly with the store. Rewards fire
 * in bursts and a mid-range phone is 5 to 8x slower, so a one-year save paid a
 * quarter of a second per award. initGameIfNeeded made it quadratic by replaying
 * about 1900 awards against a store growing underneath them.
 *
 * The fix is an in-memory running total in js/game.js, stamped with the xp store's
 * write epoch from js/db.js. This audit refuses to let it come back, and refuses to
 * let it be fast and wrong.
 *
 * WHAT IT ASSERTS, and how each goes red:
 *   SHAPE   Full scans of the xp store during a fixed burst of awards do not grow
 *           with row count. Counted, not timed, because a millisecond threshold is
 *           a coin flip on shared CI: db.all('xp') is wrapped in-page and every
 *           call is tallied. DIRECTION: more scans is failure. BOUND: at most
 *           SCAN_BUDGET scans for BURST awards, at EVERY row count.
 *           RED: revert totalXp() to `db.all('xp')` + reduce and the scan count
 *           becomes one per award, so it grows 900 -> 5400 -> 10950 with the store.
 *
 * THE BURST INTERLEAVES A kv WRITE, AND THAT IS THE POINT. DO NOT SIMPLIFY IT OUT.
 * The first version of this audit fired bare back-to-back awards. Nothing in the
 * app does that. A fight win is award plus COINS plus gear plus quests plus badges,
 * and coins are kvSet, which is db.put('kv', ...). The first version of the cache
 * was stamped from ONE GLOBAL write counter shared by every store, so that kv write
 * moved the xp store's epoch too and the cache was discarded on almost every award:
 * measured on this container at 5400 rows, 11 cache drops and 11 full scans across
 * a 12-award burst in the app's shape, against 0 in the bare-award shape the audit
 * was driving. The audit was green and the app was still scanning. An audit whose
 * fixture is a shape the app never produces is a guard that cannot fail, which is
 * exactly the class this batch exists to remove. So the kv write stays, and the
 * INTERLEAVE control check below fails if it ever stops happening.
 *   TRUTH   After every single award, totalXp() equals a from-scratch recount read
 *           straight out of IndexedDB. A cache that disagrees with the rows is a
 *           worse bug than the slow scan was.
 *           RED: bump the cached total by the wrong amount, or skip invalidation.
 *   DRIFT   A write to the xp store that does NOT go through award() must be seen
 *           by the next totalXp(). This is the import / restore / erase / raw-put
 *           class, and it is the whole reason the cache is epoch-stamped.
 *           RED: key the cache on nothing, or cache without checking db.epoch.
 *   COLD    A fresh reader with no cache still returns the truth (rebuild path).
 *
 * Every check reports the sample size it ran on. An empty sample set is a FAILURE.
 *
 * Usage: node tests/xp-total-audit.mjs [baseUrl]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { boot, sleep, serveTree } = await import(path.join(ROOT, 'tests/godmode.js'));

const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
/* NEVER run bare: godmode's boot() defaults to the LIVE PRODUCTION site, and this
   audit writes thousands of xp rows. It serves this tree itself. */
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srv.url;

const results = [];
const ok = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

/* 900 rows is a month of play, 5400 is six months, 10950 is a year: the three
   sizes the original measurement was taken at. */
const SIZES = [900, 5400, 10950];
const BURST = 12;      // one fight win fires award plus coins plus gear plus quests plus badges
/* A cold cache may pay for ONE honest scan. The slack above that is for the LIVE
   APP running in the same page: Today, quests and the ledger read the xp store on
   their own timers, and those reads land in the same tally. It is still nowhere
   near the failing shape, which is one scan PER AWARD, so 12+ per burst. */
const SCAN_BUDGET = 4;

let page, browser;
try {
  ({ page, browser } = await boot(base + '?demo'));
  await sleep(2500);

  const out = await page.evaluate(async (SIZES, BURST) => {
    const { db, kvSet } = await import('/js/db.js');
    const game = await import('/js/game.js');
    const log = [];

    // count full scans of the xp store, without changing what db.all does
    const realAll = db.all;
    const realPut = db.put;
    let scans = 0, kvWrites = 0;
    db.all = (store) => { if (store === 'xp') scans++; return realAll(store); };
    db.put = (store, val) => { if (store === 'kv') kvWrites++; return realPut(store, val); };

    // the independent truth: straight out of IndexedDB, never through game.js
    const recount = async () => {
      const rows = await realAll('xp');
      return { sum: rows.reduce((a, r) => a + (r.xp || 0), 0), n: rows.length };
    };

    const fill = async (from, to) => {
      const batch = [];
      for (let i = from; i < to; i++) batch.push({ key: `seed-${i}`, type: 'seed', xp: 5, label: 'seed', date: '2026-01-01', ts: Date.now() });
      for (let i = 0; i < batch.length; i += 400) await Promise.all(batch.slice(i, i + 400).map(r => db.put('xp', r)));
    };

    await db.clear('xp');
    let have = 0, awarded = 0;
    for (const N of SIZES) {
      await fill(have, N);
      have = N;
      const rowsBefore = (await recount()).n;

      /* Warm the cache the way a running app would: something read the total
         before the burst started. The burst is what we are measuring. */
      await game.totalXp();
      scans = 0; kvWrites = 0;
      let truthMismatch = 0, checked = 0;
      let awardMs = 0;
      for (let i = 0; i < BURST; i++) {
        const t0 = performance.now();
        /* xp 0 keeps this out of the level-up path: grantLevelRewards opens
           crates and grants eggs, which is a different subsystem's cost and
           would swamp the number we are actually measuring. */
        await game.award(`burst-${N}-${i}`, 'seed', 0, 'burst', '2026-01-01');
        /* THE APP'S BURST, NOT A SYNTHETIC ONE: a fight win pays coins right
           after the xp, and coinsAdd is kvSet is db.put('kv', ...). Removing
           this line is what made an earlier version of this audit unable to
           fail. See the header. */
        await kvSet('audit-burst-coins', i);
        awardMs += performance.now() - t0;
        awarded++;
        const truth = await recount();
        const cached = await game.totalXp();
        checked++;
        if (cached !== truth.sum) truthMismatch++;
      }
      const perAward = awardMs / BURST;

      /* DRIFT: a raw put that never went through award(). The next totalXp()
         must see it. */
      const beforeDrift = await game.totalXp();
      await db.put('xp', { key: `drift-${N}`, type: 'seed', xp: 777, label: 'drift', date: '2026-01-01', ts: Date.now() });
      const afterDrift = await game.totalXp();
      const driftTruth = (await recount()).sum;

      /* COLD: force the rebuild path and confirm it lands on the truth. */
      const cold = await game.rebuildXpTotal();

      log.push({ N, rowsBefore, scans, kvWrites, checked, truthMismatch, perAward: +perAward.toFixed(2),
                 driftSeen: afterDrift - beforeDrift, driftOk: afterDrift === driftTruth, coldOk: cold === driftTruth });
      have += BURST + 1;
    }
    db.all = realAll;
    return { log, awarded };
  }, SIZES, BURST);

  const rows = out.log;
  ok('SAMPLE the audit actually ran at every row count',
     rows.length === SIZES.length && out.awarded === SIZES.length * BURST && rows.every(r => r.rowsBefore > 0),
     `${rows.length} sizes, ${out.awarded} awards, rows ${rows.map(r => r.rowsBefore).join('/')}`);

  /* CONTROL. If the kv writes stop happening the SHAPE check goes back to
     measuring a shape the app never produces, and passes for the wrong reason. */
  ok('INTERLEAVE the burst really did write kv between awards',
     rows.length > 0 && rows.every(r => r.kvWrites >= BURST),
     rows.map(r => `${r.rowsBefore}rows: ${r.kvWrites} kv writes`).join('  '));

  const scanList = rows.map(r => `${r.rowsBefore}rows=${r.scans}scans`).join('  ');
  ok(`SHAPE full xp scans per ${BURST}-award burst never exceed ${SCAN_BUDGET}, at any row count`,
     rows.length > 0 && rows.every(r => r.scans <= SCAN_BUDGET),
     scanList);
  /* The same fact stated the other way, because "under budget" could in principle
     hold while still tracking the store. Direction: growth is failure. */
  /* +1 of slack for the live app's own background reads landing differently
     between the two samples. The failing shape is 12 scans against 2, so a single
     stray read cannot hide it. */
  ok('SHAPE scan count does not grow between the smallest and the largest store',
     rows.length > 1 && rows[rows.length - 1].scans <= rows[0].scans + 1,
     `${rows[0].rowsBefore}rows=${rows[0].scans}  ->  ${rows[rows.length - 1].rowsBefore}rows=${rows[rows.length - 1].scans}`);

  ok('TRUTH the cached total equals a full recount after every award',
     rows.length > 0 && rows.every(r => r.checked === BURST && r.truthMismatch === 0),
     rows.map(r => `${r.rowsBefore}rows: ${r.checked - r.truthMismatch}/${r.checked} agree`).join('  '));

  ok('DRIFT a raw store write outside award() is picked up by the next read',
     rows.length > 0 && rows.every(r => r.driftOk && r.driftSeen === 777),
     rows.map(r => `${r.rowsBefore}rows: +${r.driftSeen}`).join('  '));

  ok('COLD a from-scratch rebuild lands on the truth',
     rows.length > 0 && rows.every(r => r.coldOk),
     `${rows.length} rebuilds`);

  console.log('\nper-award cost (informational, not asserted): ' +
    rows.map(r => `${r.rowsBefore}rows ${r.perAward}ms`).join('   '));
} catch (e) {
  ok('AUDIT ran to completion', false, String(e && e.stack || e));
} finally {
  try { if (browser) await browser.close(); } catch { /* already gone */ }
  try { if (srv) srv.close(); } catch { /* already gone */ }
}

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
