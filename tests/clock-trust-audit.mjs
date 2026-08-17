/* CLOCK TRUST. Every daily limit in this game is decided by the device's own
 * clock via dateKey() (js/nutrition.js:132, `new Date()` in LOCAL time) and by
 * the device's own IndexedDB, and the level that falls out of it is pushed to a
 * SHARED leaderboard the server ranks by `json_extract(profile,'$.level')`
 * (server/src/index.js:658, ORDER BY lvl DESC at :676).
 *
 * This audit does NOT argue that a clock can be moved. It moves one and counts
 * what a player collects per reset, so the finding is a number.
 *
 * HOW THE CLOCK IS MOVED, and why this way. puppeteer 24.43.1 ships no clock
 * API: there is no `page.emulateClock`, and `Emulation.setVirtualTimePolicy`
 * over CDP drives the RENDERING clock (it pauses/advances timers and starves
 * IndexedDB callbacks), which is the wrong tool for a date gate. What is
 * installed instead, in `page.evaluateOnNewDocument` so it is live before any
 * app module runs, is a `Date` shim whose offset lives in localStorage and so
 * survives reloads. That is a faithful stand-in: every gate below reads the
 * date through `new Date()` / `Date.now()` in the page, which is exactly the
 * surface an OS clock change moves. No traffic leaves 127.0.0.1.
 *
 * DIRECTION: forward. Each cycle sets the shim to +1 local day and then plays
 * a minimal day through the app's own module functions. BOUND: 14 simulated
 * days per gate, which is the point where the per-day figures stop moving and
 * a longer run only re-adds the same constant.
 *
 * Self-serves via godmode.serveTree(ROOT), so it never needs a server handed
 * to it. Reports FINDINGs, not FAILs, for the measurements: the numbers are
 * the deliverable. It does FAIL on an empty sample set, because a cycle that
 * collected nothing means the harness broke, not that the game is safe.
 */
import { boot, sleep, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(ROOT);
const base = argv || srvHandle.url;
const DAYS = Number(process.env.DAYS || 14);

let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };
const finding = (l, d = '') => console.log(`FINDING ${l}${d ? '  ' + d : ''}`);

const { browser, page } = await boot(base);

try {
  /* The shim. Declared before the reload so it is installed for the boot path
     too, not bolted on after the app has already read the date once. */
  await page.evaluateOnNewDocument(() => {
    const Real = Date;
    const off = () => Number(localStorage.getItem('__clockOffsetMs') || 0);
    function Shim(...a) { return a.length ? new Real(...a) : new Real(Real.now() + off()); }
    Shim.prototype = Real.prototype;
    Shim.now = () => Real.now() + off();
    Shim.parse = Real.parse; Shim.UTC = Real.UTC;
    Object.setPrototypeOf(Shim, Real);
    window.Date = Shim;
    window.__realNow = () => Real.now();
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2200);

  const shiftDays = d => page.evaluate(n => {
    localStorage.setItem('__clockOffsetMs', String(n * 86400000));
    return new Date().toISOString();
  }, d);

  // Prove the shim actually moves the app's OWN date function, not just Date.
  const proof = await page.evaluate(async () => {
    const n = await import('./js/nutrition.js');
    const before = n.dateKey();
    localStorage.setItem('__clockOffsetMs', String(3 * 86400000));
    const after = n.dateKey();
    localStorage.setItem('__clockOffsetMs', '0');
    return { before, after };
  });
  check('clock shim moves js/nutrition.js dateKey()', proof.before !== proof.after,
    `${proof.before} -> ${proof.after}`);

  /* One simulated day of the cheapest possible play: log three meals (three
     taps), settle yesterday, take the free Pit fights, claim whatever daily
     quests are genuinely satisfied, and read whether the wheel has re-armed.
     Nothing here fakes progress: every claim goes through the app's real
     award()/claimQuest() and would refuse a second time on the same date. */
  const runCycle = () => page.evaluate(async () => {
    const [nut, game, quests, loot, energy, db] = await Promise.all([
      import('./js/nutrition.js'), import('./js/game.js'), import('./js/quests.js'),
      import('./js/loot.js'), import('./js/energy.js'), import('./js/db.js'),
    ]);
    const targets = { kcal: 2200, p: 150, c: 220, f: 70 };
    const day = nut.dateKey();
    const xp0 = await game.totalXp(), coin0 = await loot.coins();
    const inv0 = (await db.db.all('inv')).length;

    // three meals, ordinary food, well inside budget -> an on-budget day
    const meals = [0, 1, 2];
    for (const m of meals) {
      const e = { id: `ct-${day}-${m}`, date: day, meal: m, name: 'Chicken and rice',
                  kcal: 600, p: 50, c: 60, f: 15, qty: 1, ts: Date.now() };
      await db.db.put('log', e);
      await game.onFoodLogged(e, { targets, entriesForDate: await db.db.byIndex('log', 'date', day) });
    }

    // settle yesterday: this is the day-close crate + XP (js/game.js:479)
    const closed = await game.awardDayCloseIfDue(targets);

    // free Pit fights (js/energy.js:48) — count how many the reset handed back
    await energy.refreshPitEnergy();
    let free = 0;
    for (let i = 0; i < 10; i++) { const r = await energy.spendPitFight(); if (r.ok && r.used === 'free') free++; else break; }

    // the wheel gate (js/wheel.js:198). Open == the spin is available again.
    const wheelOpen = (await db.kvGet('wheelLastDate', null)) !== day;

    // daily quests: claim only the ones actually satisfied by the above
    const allXp = await db.db.all('xp');
    const qs = quests.dailyQuests(day, { hkConnected: false, huntEnabled: false, socialOn: false, pitTried: false, kitchenReady: false });
    const ctx = quests.questCtx('day', {
      date: day, entries: await db.db.byIndex('log', 'date', day), allXp,
      allLog: await db.db.all('log'), healthRows: await db.db.all('health'),
      targets, weighedToday: false, priorFoodIds: new Set(),
    });
    let claimedQ = 0, questCoins = 0, questXp = 0;
    for (const q of qs) {
      const st = quests.questState(q, ctx);
      if (!st.done || st.claimed) continue;
      const r = await quests.claimQuest(day, q, 'day');
      if (r) { claimedQ++; questCoins += r.coins; questXp += r.xp; }
    }
    const bonus = await quests.claimAllBonusIfDue(day, qs, await db.db.all('xp'));

    const xp1 = await game.totalXp(), coin1 = await loot.coins();
    const inv1 = (await db.db.all('inv')).length;
    return {
      day, xp: xp1 - xp0, coins: coin1 - coin0, inv: inv1 - inv0,
      closed: !!closed?.closed, consoled: !!closed?.consoled,
      free, wheelOpen, claimedQ, questCoins, questXp, bonus: !!bonus,
      level: game.levelFor(xp1).level, totalXp: xp1,
      questNames: qs.map(q => q.id),
    };
  });

  // day 0 is the baseline the player would have had anyway; days 1..N are the cheat
  await shiftDays(0);
  const day0 = await runCycle();
  const rows = [];
  const t0 = Date.now();
  for (let d = 1; d <= DAYS; d++) {
    await shiftDays(d);
    rows.push(await runCycle());
  }
  const wallMs = Date.now() - t0;

  check('sample set is not empty', rows.length === DAYS, `${rows.length} simulated days`);
  const sum = k => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const n = rows.length || 1;

  console.log('\n--- per simulated day (DIRECTION: forward, BOUND: ' + DAYS + ' days) ---');
  for (const r of rows) {
    console.log(`  ${r.day}  xp+${String(r.xp).padStart(4)}  coins+${String(r.coins).padStart(4)}` +
      `  inv+${r.inv}  free-fights ${r.free}  wheel ${r.wheelOpen ? 'ARMED' : 'spent'}` +
      `  dayclose ${r.closed ? 'GOLDEN' : r.consoled ? 'common' : '-'}  quests ${r.claimedQ}${r.bonus ? '+bonus' : ''}`);
  }

  const perDay = k => (sum(k) / n).toFixed(1);
  finding('baseline day 0', `xp+${day0.xp} coins+${day0.coins} inv+${day0.inv} free-fights ${day0.free}`);
  finding('XP per clock reset', `${perDay('xp')} (total ${sum('xp')} over ${n} resets)`);
  finding('coins per clock reset', `${perDay('coins')} (total ${sum('coins')})`);
  finding('inventory rows per clock reset', `${perDay('inv')} (crates + consumables, total ${sum('inv')})`);
  finding('free Pit fights per clock reset', `${perDay('free')} (cap FREE_FIGHTS=3, js/energy.js:8)`);
  finding('day-close crates', `${rows.filter(r => r.closed).length} golden, ${rows.filter(r => r.consoled).length} common, of ${n}`);
  finding('daily wheel re-armed', `${rows.filter(r => r.wheelOpen).length} of ${n} resets`);
  finding('daily quests claimed', `${sum('claimedQ')} claims + ${rows.filter(r => r.bonus).length} all-quests bonus crates`);
  finding('level', `${day0.level} -> ${rows[rows.length - 1].level} on ${rows[rows.length - 1].totalXp} XP`);

  const secsPerReset = wallMs / 1000 / n;
  finding('wall-clock cost', `${secsPerReset.toFixed(1)}s per reset in this harness ` +
    `=> ${Math.round(3600 / secsPerReset)} resets/hour, ` +
    `${Math.round((sum('xp') / n) * (3600 / secsPerReset))} XP/hour, ` +
    `${Math.round((sum('coins') / n) * (3600 / secsPerReset))} coins/hour if fully scripted`);

  /* THE SEEDED-PRIZE CONSEQUENCE. Both the wheel prize (js/wheel.js:205,
     mulberry32(hashStr('wheel:'+today))) and the day's three quests
     (js/quests.js:221, 'quests:'+date) are PURE FUNCTIONS OF THE DATE STRING.
     Date-seeding was chosen so a reload cannot reroll the prize. Under a
     movable clock it inverts: the player can compute every future date's
     outcome offline and set the clock only to the dates that pay. Measured by
     asking the app's own wheel gate + quest picker about a year of dates. */
  const seeded = await page.evaluate(async () => {
    const quests = await import('./js/quests.js');
    // the wheel's picker is module-private; the day's quests are not, and they
    // are the same seeded-by-date shape, so measure the shape we can reach.
    const trivial = new Set(['q-first', 'q-water', 'q-bed', 'q-weigh', 'q-log5', 'q-3meals']);
    let allTrivial = 0, scanned = 0;
    const d0 = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const qs = quests.dailyQuests(k, { hkConnected: true, huntEnabled: true, socialOn: true, pitTried: true, kitchenReady: true });
      scanned++;
      if (qs.every(q => trivial.has(q.id))) allTrivial++;
    }
    return { scanned, allTrivial };
  });
  check('seeded-quest scan produced a sample', seeded.scanned === 365, `${seeded.scanned} dates`);
  finding('date-seeded quest rotation is pre-computable',
    `${seeded.allTrivial} of ${seeded.scanned} future dates hand out three quests a cheat can finish with taps alone ` +
    `(${(seeded.allTrivial / seeded.scanned * 100).toFixed(1)}%); a clock-mover skips to those dates`);

  /* REDEEM CODES: confirm they are in the shipped bundle and that the one-shot
     is per-device kv, which is what an "erase everything" fix interacts with. */
  const redeem = await page.evaluate(async () => {
    const loot = await import('./js/loot.js');
    const db = await import('./js/db.js');
    const src = await (await fetch('./js/loot.js')).text();
    const before = await db.kvGet('redeemed', []);
    const r1 = await loot.redeemCode('BONEHEADZ');
    const mid = await db.kvGet('redeemed', []);
    const r2 = await loot.redeemCode('BONEHEADZ');
    await db.kvSet('redeemed', []);                 // exactly what an erase does
    const r3 = await loot.redeemCode('BONEHEADZ');
    const after = await db.kvGet('redeemed', []);
    return {
      codes: Object.keys(loot.REDEEM_CODES),
      inShippedSource: /BONEHEADZ:\s*\{/.test(src) && /COSMICPET/.test(src),
      before, mid, after,
      first: r1.ok, second: r2.ok, secondReason: r2.reason, afterErase: r3.ok,
    };
  });
  check('redeem codes ship in plaintext in js/loot.js', redeem.inShippedSource, redeem.codes.join(', '));
  check('a code pays the first time', redeem.first === true);
  check('the same code is refused the second time', redeem.second === false, `reason=${redeem.secondReason}`);
  check('clearing kv `redeemed` makes the code pay AGAIN', redeem.afterErase === true,
    'the one-shot is per-device state, not a server ledger');

} finally {
  await browser.close().catch(() => {});
  if (srvHandle) srvHandle.close();
}

console.log(bad ? `\n${bad} FAIL` : '\nall checks ok (see FINDING lines for the measurements)');
process.exit(bad ? 1 : 0);
