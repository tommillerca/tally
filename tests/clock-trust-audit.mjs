/* CLOCK TRUST. Every daily limit in this game is decided by the device's own
 * clock via dateKey() (js/nutrition.js:132, `new Date()` in LOCAL time) and by
 * the device's own IndexedDB, and the level that falls out of it is pushed to a
 * SHARED leaderboard the server ranks by `json_extract(profile,'$.level')`
 * (server/src/index.js:658, ORDER BY lvl DESC at :676).
 *
 * WHAT CHANGED, 2026-08-17. This file started life as a pure measurement: it
 * moved a clock and counted what a player collects per reset, and it exited 0
 * while printing "FINDING XP per clock reset 176.4". That was honest as a
 * measurement and useless as a gate entry: a suite that documents a live
 * exploit and reports success is the same failure the suite-rot entry exists
 * to catch, because green is what people read. The monotonic day guard
 * (claimDay, js/db.js:209) now exists, so everything the guard bounds is an
 * ASSERTION here with a stated direction and a stated bound, and goes RED if
 * the guard regresses. What remains a FINDING is named below, with the reason
 * it cannot be asserted.
 *
 * WHAT CHANGED AGAIN, v397. The forward walk was a FINDING here, at 176.4 XP
 * and 64.6 coins per reset, with the honest note that no LOCAL rule could ever
 * bound it: Date.now() and dateKey() read the same setting, so a day-long jump
 * moves both terms together, and `performance.now()` resets its origin on every
 * page load so a force-quit erases it. That note ended "a server timestamp would
 * work", and rule 3 (js/db.js witnessServerDay) is that server timestamp: the
 * newest day `GET /health` has ever been seen to report becomes a ceiling, with
 * WITNESS_GRACE days of headroom so an offline player is never blocked. No
 * server change and no migration were needed; the endpoint and the response
 * already existed and this is a read of them.
 *
 * So the forward walk is now an ASSERTION with both sides of the ceiling
 * required to differ, and section 7 asserts rule 3 on its own terms: the wire
 * (against a loopback /health this file owns, never the real API), the
 * monotonicity, both sides of the offline allowance, the heal, and both import
 * paths. What is NOT closed is stated in the closing FINDING and is honestly
 * devtools-tier, plus the per-ENTRY food-logging XP that no day gate should be
 * touching in the first place.
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
 * ONE THING THE SHIM CANNOT DO is separate the local calendar from UTC, which
 * is what a TIMEZONE change does. Those cases (the eastbound traveller, the
 * grace ceiling) are driven by moving the guard's own anchor row instead, and
 * are labelled ANCHOR where that is what happened, so nobody reads them as a
 * full end-to-end simulation.
 *
 * DIRECTION and BOUND, per surface:
 *   FORWARD WALK     direction: more per reset is worse.  BOUND: exactly zero
 *                    guard-covered rewards on any day past witness +
 *                    WITNESS_GRACE, asserted on BOTH sides of the ceiling.
 *   SERVER WITNESS   direction: a movable ceiling is failure. BOUND: it rises
 *                    only, it comes from the wire, and no restore lowers it.
 *   BACKWARDS HARVEST direction: any payout is failure.   BOUND: exactly zero
 *                    guard-covered rewards (crates, quests, day-close, free
 *                    fights, coins) on a never-before-visited day below the
 *                    high-water mark.
 *   HONEST DAY       direction: ZERO payout is failure.   BOUND: a genuine
 *                    forward day more than 20h later pays the full day.
 *   GRACE CEILING    direction: too permissive is failure. BOUND: DAY_GRACE
 *                    days of headroom, asserted on BOTH sides of the edge.
 *   HONEST PLAYER    direction: a refusal is failure.     BOUND: none of the
 *                    evening-then-morning, traveller-east, or NTP-correction
 *                    cases may be refused.
 *
 * Self-serves via godmode.serveTree(ROOT), so it never needs a server handed
 * to it, and never points at the live production site. It FAILs on an empty
 * sample set, because a cycle that collected nothing means the harness broke,
 * not that the game is safe.
 */
import { boot, sleep, serveTree } from './godmode.js';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(ROOT);
const base = argv || srvHandle.url;
const DAYS = Number(process.env.DAYS || 14);
const HOUR = 3600000;

let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };
const finding = (l, d = '') => console.log(`FINDING ${l}${d ? '  ' + d : ''}`);

/* A STAND-IN FOR THE SERVER'S /health, on loopback. The wire this guard hangs
   off is `GET {apiBase}/health -> { ok, ts }`, and a test that pokes
   witnessServerDay() directly would prove the arithmetic while proving nothing
   about the plumbing. This answers a ts THIS FILE chose, so the assertion below
   is that the number the server said is the number the ceiling moved to. It is
   127.0.0.1 and it is ours: the real API is never contacted. */
let healthTs = Date.now();
let healthHits = 0;
const health = http.createServer((req, res) => {
  healthHits++;
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ ok: true, ts: healthTs }));
});
await new Promise(r => health.listen(0, '127.0.0.1', r));
const healthUrl = `http://127.0.0.1:${health.address().port}`;

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

  /* N LOCAL DAYS AHEAD, NOT N*24 HOURS, and the difference is a real one that
     only shows on some real-world dates. shiftDays() adds a flat 86400000ms per
     day, but the app's day is dateKey(), which is LOCAL. Across a DST fall-back
     a 24 hour REAL step does not advance the local date at all: measured, base
     2026-08-28 00:55 EDT + 800 days lands on 2028-11-05 00:55 EDT, and +801 days
     (exactly 24h more of real time) lands on 2028-11-05 23:55 EST. Same local
     day, because the clocks went back an hour in between.
     The ten-day walk below then made two claims on ONE day and the app correctly
     answered `same-day` for the second, which the row read as a missing
     `advanced`. The app was right; the shim was not. And because the landing
     date is computed from TODAY, this row was green for most of the year and
     went red the moment the real date moved base+800 onto a DST boundary: it
     passed at 23:00 and failed at 00:55 on the next date.
     Same construction as gotoLocal below, which already had to solve this for
     the evening-then-morning case. */
  const shiftLocalDays = (d, hour = 12) => page.evaluate((n, h) => {
    const real = window.__realNow();
    const b = new Date(real);
    const target = new Date(b.getFullYear(), b.getMonth(), b.getDate() + n, h, 0, 0, 0).getTime();
    localStorage.setItem('__clockOffsetMs', String(target - real));
    return new Date().toISOString();
  }, d, hour);

  /* Put the page's local clock at a specific LOCAL day-offset and hour. Needed
     for the evening-then-morning case, where the whole point is that only nine
     hours pass across a real day boundary. */
  const gotoLocal = (dayDelta, hour) => page.evaluate((dd, h) => {
    const real = window.__realNow();
    const b = new Date(real);
    const target = new Date(b.getFullYear(), b.getMonth(), b.getDate() + dd, h, 0, 0, 0).getTime();
    localStorage.setItem('__clockOffsetMs', String(target - real));
    const n = new Date();
    return { key: `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`,
             now: Date.now(), local: n.toString() };
  }, dayDelta, hour);

  // Direct access to the guard, for the cases the reward path cannot express.
  const guard = {
    reset: () => page.evaluate(async () => {
      const db = await import('./js/db.js');
      await db.kvSet('dayHighWater', null);
      await db.kvSet('dayPaceKey', null);
      await db.kvSet('dayPaceAt', 0);
      await db.kvSet(db.DAY_WITNESS_KEY, 0);   // a device with no history at all
      return true;
    }),
    claim: (key) => page.evaluate(async k => {
      const [db, nut] = await Promise.all([import('./js/db.js'), import('./js/nutrition.js')]);
      const r = await db.claimDay(k || nut.dateKey());
      return { ...r, key: k || nut.dateKey(), state: await db.dayGuardState() };
    }, key || null),
    state: () => page.evaluate(async () => (await import('./js/db.js')).dayGuardState()),
    // ANCHOR: pretend no UTC time has passed since the anchor, which is exactly
    // what a timezone change does to the local calendar. The shim cannot.
    anchorAtNow: () => page.evaluate(async () => {
      const db = await import('./js/db.js');
      await db.kvSet('dayPaceAt', Date.now());
      return db.dayGuardState();
    }),
    anchorAgoMs: (ms) => page.evaluate(async v => {
      const db = await import('./js/db.js');
      await db.kvSet('dayPaceAt', Date.now() - v);
      return db.dayGuardState();
    }, ms),
    grace: () => page.evaluate(async () => (await import('./js/db.js')).DAY_GRACE),
    witnessGrace: () => page.evaluate(async () => (await import('./js/db.js')).WITNESS_GRACE),
    /* Witness the server at a REAL instant `dayDelta` days from now. Deliberately
       computed off window.__realNow(), never off the shimmed clock: the whole
       point of rule 3 is that this number does not move when the device's clock
       does, and reading it through the shim would quietly make it move. */
    witnessAt: (dayDelta) => page.evaluate(async dd => {
      const db = await import('./js/db.js');
      return db.witnessServerDay(window.__realNow() + dd * 86400000);
    }, dayDelta),
    clearWitness: () => page.evaluate(async () => {
      const db = await import('./js/db.js');
      await db.kvSet(db.DAY_WITNESS_KEY, 0);
      return db.dayGuardState();
    }),
  };
  /* The day key the app WILL report once shiftDays(dayDelta) is in force. It has
     to use the same fixed-millisecond arithmetic shiftDays does, because that is
     what dateKey() ends up seeing. This used to do calendar arithmetic instead
     (new Date(y, m, d + dd)), and the two disagree by a day whenever the offset
     span crosses a DST transition: fixed ms shifts the wall clock by an hour, so
     between 00:00 and 01:00 local it lands on the previous calendar day while the
     calendar version does not. The probes then seeded dayHighWater one day AHEAD
     of the day runCycle() went on to play, claimDay() correctly called that day
     backwards, and every daily reward paid zero. It reproduced for exactly one
     hour a day, on exactly the offsets that straddle a DST boundary, which is why
     it read as a stable pre-existing app fault rather than audit drift. */
  const keyFor = (dayDelta) => page.evaluate(dd => {
    const d = new Date(window.__realNow() + dd * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, dayDelta);

  // Prove the shim actually moves the app's OWN date function, not just Date.
  const proof = await page.evaluate(async () => {
    const n = await import('./js/nutrition.js');
    const before = n.dateKey();
    localStorage.setItem('__clockOffsetMs', String(3 * 86400000));
    const after = n.dateKey();
    const ordStable = n.dayOrdinal('2026-01-05');
    localStorage.setItem('__clockOffsetMs', '0');
    return { before, after, ordStable, ordAfter: n.dayOrdinal('2026-01-05'),
      ordDiff: n.dayOrdinal(after) - n.dayOrdinal(before) };
  });
  check('clock shim moves js/nutrition.js dateKey()', proof.before !== proof.after,
    `${proof.before} -> ${proof.after}`);
  /* dayOrdinal is the one date function the clock must not be able to move: if
     it ever grows a `new Date()` inside, the whole guard becomes clock-relative
     and silently stops guarding. FAILURE DIRECTION: the two readings differ. */
  check('dayOrdinal() is clock-proof (same key, clock moved 3 days)',
    proof.ordStable === proof.ordAfter && Number.isFinite(proof.ordStable),
    `${proof.ordStable} == ${proof.ordAfter}`);
  check('dayOrdinal() counts the shim move as exactly 3 days', proof.ordDiff === 3, `delta ${proof.ordDiff}`);

  const GRACE = await guard.grace();
  check('DAY_GRACE is a real, small number', Number.isInteger(GRACE) && GRACE >= 1 && GRACE <= 5, `DAY_GRACE=${GRACE}`);

  /* One simulated day of play: log meals, settle yesterday, take the free Pit
     fights, claim whatever daily quests are genuinely satisfied, and read
     whether the wheel has re-armed. Nothing here fakes progress: every claim
     goes through the app's real award()/claimQuest() and would refuse a second
     time on the same date.

     TWO SHAPES OF DAY, AND WHY `full` EXISTS. The cheap day (three taps) is the
     right provocation for the forward walk, where the question is what a clock
     farmer collects per reset and a bigger day would only inflate the number.
     It is the WRONG provocation for section 3's "an honest day still pays", and
     those rows were RED on a clean tree because of it. dailyQuests() draws 3 of
     the 10 ungated pool entries, seeded by the DATE (js/quests.js pick()), and
     the cheap day satisfies exactly three of those ten (q-first, q-3meals,
     q-protein), so on any date whose draw misses all three the day genuinely
     completes nothing, claimedQ is 0, and the quest coins that are the day's only
     coin source are 0 with the guard wide open. MEASURED over 401 consecutive
     dates from 2026-08-27: 123 of them (30.7%) roll a set the cheap day cannot
     touch. 2026-12-11 (the +106 honest day when today is 2026-08-27) is one:
     it rolled [q-sleep, q-bed, q-water], each at cur 0 / target 1, while
     claimDay() answered { fresh: true, reason: 'same-day' }. The audit was
     asking a day that had done nothing why it had not been paid.

     `full` does the other seven things a player can do in a day, through the
     same real APIs the UI calls (js/wellness.js addWater/markBed/markSleep, a
     weights row read back the way js/app.js:3307 reads it, a `via: 'scan'` log,
     a foodId the day has never seen, and five entries instead of three). All ten
     ungated dailies are then genuinely done, so whichever three the date draws
     are all claimable and claimedQ is QUEST_N.day on EVERY date. Used for the
     +102..+106 block only: those wellness/scan award() keys are per-DATE and
     ungated by claimDay, so folding them into the forward walk would add ungated
     XP to the refused days and move a bound this file is not entitled to move. */
  const runCycle = (full = false) => page.evaluate(async (full) => {
    const [nut, game, quests, loot, energy, db, well] = await Promise.all([
      import('./js/nutrition.js'), import('./js/game.js'), import('./js/quests.js'),
      import('./js/loot.js'), import('./js/energy.js'), import('./js/db.js'),
      import('./js/wellness.js'),
    ]);
    const targets = { kcal: 2200, p: 150, c: 220, f: 70 };
    const day = nut.dateKey();
    const xp0 = await game.totalXp(), coin0 = await loot.coins();
    const inv0 = (await db.db.all('inv')).length;
    const guardBefore = await db.dayGuardState();

    /* Three meals, ordinary food, inside budget -> a GOLDEN day close. `full`
       adds two snacks that keep the day ON budget (1800 + 400 = 2200, the target
       itself, and js/game.js onBudget is `<=`) and take q-log5 to its target of
       five. They carry a foodId, which q-new-food reads against the empty
       priorFoodIds below, and are logged `via: 'scan'`, which is the only thing
       that writes the type-'scan' row q-scan reads. */
    const meals = full ? [0, 1, 2, 3, 3] : [0, 1, 2];
    for (let i = 0; i < meals.length; i++) {
      const snack = i >= 3;
      const e = snack
        ? { id: `ct-${day}-s${i}`, date: day, meal: meals[i], name: 'Yoghurt and berries',
            foodId: `ctfood-${day}-${i}`, kcal: 200, p: 12, c: 20, f: 5, qty: 1, ts: Date.now() }
        : { id: `ct-${day}-${meals[i]}`, date: day, meal: meals[i], name: 'Chicken and rice',
            kcal: 600, p: 50, c: 60, f: 15, qty: 1, ts: Date.now() };
      await db.db.put('log', e);
      await game.onFoodLogged(e, { targets, via: snack ? 'scan' : null,
        entriesForDate: await db.db.byIndex('log', 'date', day) });
    }
    /* The other four ungated dailies, each through the API the UI calls:
       q-water, q-bed and q-sleep (js/wellness.js), and q-weigh (a weights row). */
    if (full) {
      await well.addWater(well.WATER_GOAL, day);
      await well.markBed(day);
      await well.markSleep(8, day);
      await db.db.put('weights', { date: day, kg: 80 });
    }

    // settle yesterday: this is the day-close crate + XP (js/game.js:479)
    const closed = await game.awardDayCloseIfDue(targets);

    // free Pit fights (js/energy.js:48) — count how many the reset handed back
    await energy.refreshPitEnergy();
    let free = 0;
    for (let i = 0; i < 10; i++) { const r = await energy.spendPitFight(); if (r.ok && r.used === 'free') free++; else break; }

    /* The wheel gate (js/wheel.js:198), read as the wheel itself reads it:
       BOTH the date row and claimDay, because the spin path is gated on both
       (js/wheel.js:204). Asking only the date row reported ARMED on every
       refused day, which was true of the row and false of the wheel. */
    const wheelOpen = (await db.kvGet('wheelLastDate', null)) !== day && (await db.claimDay(day)).fresh;

    // daily quests: claim only the ones actually satisfied by the above
    const allXp = await db.db.all('xp');
    /* GATES CLOSED ON PURPOSE, second attempt documented: opening every gate
       (the first attempt at the 2026-08-31 red) rolled quests this harness can
       never satisfy (steps targets, cooking), which reds the claim sweep for
       the wrong reason. Closed gates restrict the draw to the ungated dailies
       the full-day fixture genuinely completes; what aged out was only the
       premise that a closed-gate draw is always THREE. Post-#283 the seed-fixed
       draw shrinks on dates whose draw hits gated quests, so the premise and
       claim rows below assert on the rolled SET (non-empty, fully done, every
       one paid), which no date lottery can shrink to vacuity. */
    const qs = quests.dailyQuests(day, { hkConnected: false, huntEnabled: false, socialOn: false, pitTried: false, kitchenReady: false });
    const ctx = quests.questCtx('day', {
      date: day, entries: await db.db.byIndex('log', 'date', day), allXp,
      allLog: await db.db.all('log'), healthRows: await db.db.all('health'),
      // js/app.js:3307 reads it exactly this way; false stays false on a cheap day.
      targets, weighedToday: !!(await db.db.get('weights', day)), priorFoodIds: new Set(),
    });
    let claimedQ = 0, questCoins = 0, questXp = 0;
    for (const q of qs) {
      const st = quests.questState(q, ctx);
      if (!st.done || st.claimed) continue;
      const r = await quests.claimQuest(day, q, 'day');
      /* `if (r)` was enough until claimQuest gained { capped: true }, which is
         truthy and carries no coins or xp: it would have counted a refused claim
         and added undefined, turning both totals into NaN. Not reachable today
         (each replayed day gets its own periodKey, so no period is ever spent)
         but the same unguarded truthiness as reward-sop's `!!r`. */
      if (r && !r.capped) { claimedQ++; questCoins += r.coins; questXp += r.xp; }
    }
    const bonus = await quests.claimAllBonusIfDue(day, qs, await db.db.all('xp'));

    const xp1 = await game.totalXp(), coin1 = await loot.coins();
    const inv1 = (await db.db.all('inv')).length;
    return {
      day, ord: nut.dayOrdinal(day), xp: xp1 - xp0, coins: coin1 - coin0, inv: inv1 - inv0,
      closed: !!closed?.closed, consoled: !!closed?.consoled,
      free, wheelOpen, claimedQ, questCoins, questXp, bonus: !!bonus,
      level0: game.levelFor(xp0).level, level: game.levelFor(xp1).level, totalXp: xp1,
      wall: Date.now(),
      guardBefore, guardAfter: await db.dayGuardState(),
      questNames: qs.map(q => q.id),
      questStates: qs.map(q => ({ id: q.id, ...quests.questState(q, ctx) })),
      questCap: quests.QUEST_N.day,
    };
  }, full);

  /* EXACTLY the daily gates claimDay stands in front of, and nothing else. Two
     things are deliberately excluded, because folding them in would make this
     block either unstable or dishonest:
       - food-logging XP: `log-<entryId>` is keyed by the ENTRY, not the date,
         so it is not a daily limit and no day guard can or should touch it;
       - the raw coin and inventory deltas: a LEVEL-UP fires off that logging
         XP and pays coins and a crate through grantLevelRewards, which is a
         progression reward, not a daily one. It is asserted separately below,
         by attribution, so a real daily-gate leak can never hide inside it. */
  const guardCovered = r => ({
    questCoins: r.questCoins, freeFights: r.free, questClaims: r.claimedQ,
    dayCloseCrate: r.closed || r.consoled, allQuestBonus: r.bonus,
  });
  const guardCoveredTotal = r => r.questCoins + r.free + r.claimedQ +
    (r.closed || r.consoled ? 1 : 0) + (r.bonus ? 1 : 0);

  /* ================= 1. THE FORWARD WALK (ASSERTED from v397) =============
     Was a FINDING, because rules 1 and 2 read the clock the farmer is moving
     and could not see a 24h jump. Rule 3 does not read that clock: it reads
     the newest day the SERVER has been witnessed on (js/db.js witnessServerDay,
     fed by GET /health), so the walk has a ceiling for the first time.
     DIRECTION: forward, more per reset is worse. BOUND: every simulated day
     past witness + WITNESS_GRACE pays EXACTLY ZERO of every guard-covered
     daily. Both sides of the edge are asserted, so "pays nothing" can never
     pass by refusing everything. */
  const W_GRACE = await guard.witnessGrace();
  check('WITNESS_GRACE is a real, small number', Number.isInteger(W_GRACE) && W_GRACE >= 1 && W_GRACE <= 14,
    `WITNESS_GRACE=${W_GRACE}`);
  await shiftDays(0);
  /* The server is witnessed at TODAY, once, before the walk starts. This is
     what an honest player's device has every time it has any network at all;
     it is stated here rather than left to rule 3's first-run seed so the
     ceiling below is a number the test chose, not one it inherited. */
  const witnessed = await guard.witnessAt(0);
  const ceiling = witnessed + W_GRACE;
  check('witnessing the server sets a ceiling', Number.isFinite(witnessed) && witnessed > 20000,
    `witness=${witnessed} ceiling=${ceiling} (UTC day ordinals)`);
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

  /* THE ASSERTION. Split the walk at the witnessed ceiling and require the two
     halves to behave differently: below it a normal day, above it nothing. */
  const within = rows.filter(r => r.ord <= ceiling);
  const beyond = rows.filter(r => r.ord > ceiling);
  check('the walk really crossed the ceiling, so neither half is vacuous',
    within.length > 0 && beyond.length > 0,
    `${within.length} days within the ${W_GRACE}-day allowance, ${beyond.length} past it`);
  check('CONTROL: days inside the allowance still pay in full (offline players are NOT blocked)',
    within.every(r => guardCoveredTotal(r) > 0),
    `min guard-covered payout within = ${Math.min(...within.map(guardCoveredTotal))}`);
  const leaked = beyond.filter(r => guardCoveredTotal(r) > 0);
  check('a day the SERVER has not reached pays ZERO of every daily gate',
    leaked.length === 0,
    leaked.length ? `LEAK on ${leaked.map(r => `${r.day} ${JSON.stringify(guardCovered(r))}`).join(', ')}`
                  : `${beyond.length} days past the ceiling, every one of them 0 quest coins, 0 quest claims, 0 free fights, no day-close crate, no bonus crate`);
  check('...and the refusal is BY NAME, not a side effect of something else',
    beyond.length > 0 && beyond.every(r => r.guardAfter.witness === witnessed),
    `witness unmoved at ${witnessed} across ${beyond.length} refused days`);
  const beyondXp = beyond.reduce((a, r) => a + r.xp, 0);
  check('the XP a refused day still pays is the ungated food-logging XP only',
    beyond.every(r => r.xp <= 120), `max xp on a refused day = ${Math.max(...beyond.map(r => r.xp))}`);

  const perDay = k => (sum(k) / n).toFixed(1);
  finding('baseline day 0', `xp+${day0.xp} coins+${day0.coins} inv+${day0.inv} free-fights ${day0.free}`);
  finding('XP per clock reset (FULL 24h forward jump, NOW BOUNDED)',
    `${perDay('xp')} (total ${sum('xp')} over ${n} resets), of which ${beyondXp} came from the ` +
    `${beyond.length} days past the ceiling and is ungated food-logging XP, not a daily gate. ` +
    `Measured at 176.4 per reset (2470 over 14) before rule 3 existed. The walk no longer ` +
    `scales with the number of resets: it scales with the number of days the SERVER has reached.`);
  finding('coins per clock reset', `${perDay('coins')} (total ${sum('coins')})`);
  finding('inventory rows per clock reset', `${perDay('inv')} (crates + consumables, total ${sum('inv')})`);
  finding('free Pit fights per clock reset', `${perDay('free')} (cap FREE_FIGHTS=3, js/energy.js:8)`);
  finding('day-close crates', `${rows.filter(r => r.closed).length} golden, ${rows.filter(r => r.consoled).length} common, of ${n}`);
  finding('daily wheel re-armed', `${rows.filter(r => r.wheelOpen).length} of ${n} resets`);
  finding('daily quests claimed', `${sum('claimedQ')} claims + ${rows.filter(r => r.bonus).length} all-quests bonus crates`);
  finding('level', `${day0.level} -> ${rows[rows.length - 1].level} on ${rows[rows.length - 1].totalXp} XP`);
  finding('what the forward walk NOW costs the farmer',
    `the high-water mark ends at ${rows[rows.length - 1].guardAfter.highWater}. The ${W_GRACE}-day allowance is ` +
    `a ONE-TIME bubble, not a rate: to open the day after the ceiling the server has to reach the day before it, ` +
    `and the only way to make that happen is to wait a real day. Rule 1 then makes the bubble a debt, because the ` +
    `mark is left in the future and every real day below it pays zero.`);

  const secsPerReset = wallMs / 1000 / n;
  finding('wall-clock cost', `${secsPerReset.toFixed(1)}s per reset in this harness ` +
    `=> ${Math.round(3600 / secsPerReset)} resets/hour, ` +
    `${Math.round((sum('xp') / n) * (3600 / secsPerReset))} XP/hour, ` +
    `${Math.round((sum('coins') / n) * (3600 / secsPerReset))} coins/hour if fully scripted`);

  /* ================= 2. THE BACKWARDS HARVEST (ASSERTED) ==================
     This is the exploit the guard exists to close, and it is the cheap one:
     jump to +105, collect, then walk BACK through the days you skipped, every
     one of which is an unvisited date and therefore a full set of unclaimed
     award() keys. Days 100+ are used deliberately so they are nowhere near
     the forward walk above: a "pays nothing" that is really the per-key ledger
     refusing a day it already paid would be a pass for the wrong reason, which
     is anti-regression rule 1.
     DIRECTION: any guard-covered payout on the backwards day is a FAILURE.
     BOUND: exactly zero. */
  console.log('\n--- backwards harvest: +105, then back to an unvisited +102 ---');
  await guard.reset();
  /* Warm +104 first so the +105 control is a FULL day: awardDayCloseIfDue only
     settles a yesterday that has log rows, so without this the control pays no
     crate and no quests and "the backwards day is cheaper" compares two thin
     days and means nothing. */
  await shiftDays(104);
  await runCycle(true);
  await shiftDays(105);
  const fwd = await runCycle(true);
  check('CONTROL: the +105 day pays, so the guard is not simply refusing everything',
    guardCoveredTotal(fwd) > 0 && fwd.xp > 0,
    `xp+${fwd.xp} coins+${fwd.coins} inv+${fwd.inv} free ${fwd.free} quests ${fwd.claimedQ} guard=${fwd.guardAfter.highWater}`);

  await shiftDays(102);
  const backKey = await keyFor(102);
  const backProbe = await guard.claim(backKey);
  check('claimDay refuses a day below the high-water mark, BY NAME',
    backProbe.fresh === false && backProbe.reason === 'backwards',
    `fresh=${backProbe.fresh} reason=${backProbe.reason} highWater=${backProbe.highWater}`);
  check('a refused day WRITES NOTHING: the mark is unmoved',
    backProbe.state.highWater === fwd.guardAfter.highWater,
    `${backProbe.state.highWater} still == ${fwd.guardAfter.highWater}`);

  /* FULL, like the +105 control above it. A backwards day that is offered every
     daily the game has and still pays zero is a strictly stronger statement than
     one that was only ever offered three. */
  const back = await runCycle(true);
  const bc = guardCovered(back);
  check('backwards day pays ZERO quest coins', bc.questCoins === 0, `quest coins+${bc.questCoins}`);
  check('backwards day hands back ZERO free Pit fights', bc.freeFights === 0, `free ${bc.freeFights} (FREE_FIGHTS=3)`);
  check('backwards day claims ZERO daily quests', bc.questClaims === 0, `${bc.questClaims} claims`);
  check('backwards day settles NO day-close crate', bc.dayCloseCrate === false, `closed=${back.closed} consoled=${back.consoled}`);
  check('backwards day pays NO all-quests bonus crate', bc.allQuestBonus === false);
  check('backwards day: every guard-covered daily reward is zero', guardCoveredTotal(back) === 0,
    JSON.stringify(bc));
  /* THE ATTRIBUTION CHECK, and it is the one that stops the block above being
     comfortable. Coins and crates CAN still move on a refused day, because the
     ungated logging XP can cross a level boundary and grantLevelRewards pays
     out. That is progression, not a daily gate. So: either nothing moved, or a
     level really was gained. FAILURE DIRECTION: coins or inventory appear on a
     refused day with NO level-up behind them, which means a daily gate leaked. */
  const levelled = back.level > back.level0;
  check('any coins or crates on a refused day are a LEVEL-UP, not a leaked daily gate',
    (back.coins === 0 && back.inv === 0) || levelled,
    `coins+${back.coins} inv+${back.inv} level ${back.level0}->${back.level}`);
  if (back.coins || back.inv) {
    finding('level-up spillover on a refused day',
      `coins+${back.coins} inv+${back.inv} from level ${back.level0}->${back.level}, paid by ` +
      `grantLevelRewards off the ungated logging XP. Not a daily gate, so claimDay does not and ` +
      `should not touch it; it is bounded by the levelling curve, not by the number of clock resets.`);
  }
  /* The residual is real and it is named rather than hidden. `log-<entryId>`
     and the streak rows it feeds are keyed by the food entry, not by the date,
     so logging three meals pays the same on any day and a day guard is the
     wrong tool for it. Reported with its measured size so nobody reads
     "guard-covered is zero" as "the clock is now worth nothing". */
  finding('residual XP on a refused day (ungated food-logging path)',
    `${back.xp} XP, against ${fwd.xp} on the honest +105 day. This is award('log-<entryId>') ` +
    `plus the streak rows it feeds; those keys are per ENTRY, not per DATE, so they are not a ` +
    `daily limit and claimDay is the wrong place to gate them. js/game.js:281 onFoodLogged is ` +
    `the next call site if that residual is judged worth closing.`);
  check('the backwards day is strictly cheaper than the honest one', back.xp < fwd.xp,
    `${back.xp} < ${fwd.xp}`);

  /* ================= 3. THE HONEST FORWARD DAY (ASSERTED) =================
     A guard that refuses everything passes section 2 for entirely the wrong
     reason. DIRECTION: a ZERO payout here is the FAILURE. BOUND: a genuine
     forward day, more than 20 hours of wall clock after the last honest one,
     pays the full day. */
  console.log('\n--- honest forward day: +106, a real day after +105 ---');
  await shiftDays(106);
  const honestKey = await keyFor(106);
  const honest = await runCycle(true);
  /* THE ROLLOVER IS READ OFF THE MARK, NOT OFF A PROBE, and the probe is gone.
     This block used to fire `guard.claim(honestKey)` before the cycle and assert
     reason === 'advanced' on the answer. That probe IS the rollover: claimDay's
     'advanced' branch writes dayHighWater, so it fires exactly once per day, and
     every one of the six reward-path callers that followed it (js/energy.js:55,
     js/game.js:695, js/poi.js:648, js/quests.js:356 and :396, js/wheel.js:302)
     then got 'same-day'. The rows below were grading a day that was already open,
     which is not the thing they are named after. Nothing probes it now: the
     cycle's own first caller takes the transition, exactly as the first screen a
     player opens after midnight does, and the evidence it happened is the mark
     itself moving from the +105 day to this one. A refusal writes nothing and
     leaves the mark where it was (section 2 asserts that), so this row cannot
     pass on a refused day. HONEST LIMIT: which caller takes 'advanced' is an
     ordering detail of this cycle, so a regression punishing only ONE caller's
     rollover would cost that caller's reward and show up in the totals below,
     not in this row. */
  check('claimDay opened a genuine new day: the mark moved, on the path that pays',
    honest.guardBefore.highWater === fwd.day && honest.guardAfter.highWater === honestKey,
    `mark ${honest.guardBefore.highWater} -> ${honest.guardAfter.highWater} (expected ${fwd.day} -> ${honestKey})`);
  const hoursSinceHonest = (honest.wall - fwd.wall) / HOUR;
  check('the honest day really is more than 20 hours after the last one',
    hoursSinceHonest > 20, `${hoursSinceHonest.toFixed(1)}h of wall clock`);
  check('honest forward day still pays a day-close crate', honest.closed || honest.consoled,
    `closed=${honest.closed} consoled=${honest.consoled}`);
  check('honest forward day hands back the full free-fight floor', honest.free === 3, `free ${honest.free}`);
  /* NOT `claimedQ > 0`. That was this file's own red row on a clean tree, and it
     was red because the cheap day satisfied nothing on a date whose draw missed
     it, never because a claim was refused: see the `full` note on runCycle. The
     full day genuinely completes all ten ungated dailies, so the date rolls
     three quests, all three are DONE, and all three must PAY. Asserting the whole
     cap rather than "at least one" is strictly stronger than the row it replaces
     and it no longer moves with the calendar: one refusal, on any date, is red.
     The set is asserted non-empty and fully done FIRST, so the claim row can
     never pass on 0 === 0, and a shortfall is attributed to the right side of
     the line: an incomplete provocation reds the control row, a refused payout
     reds the claim row. */
  check('the honest day rolled a non-empty, fully completed quest set, so the claim row is not vacuous',
    honest.questNames.length >= 1 && honest.questStates.every(q => q.done),
    `${honest.questNames.length} rolled (cap ${honest.questCap}; the draw may shrink on gated dates post-#283), all done: ` +
    honest.questStates.map(q => `${q.id} ${q.cur}/${q.target}`).join(', '));
  check('honest forward day still claims daily quests, EVERY one it rolled',
    honest.claimedQ === honest.questNames.length,
    `${honest.claimedQ} of ${honest.questNames.length} rolled claims`);
  /* NOT `coins > 0` either. The raw delta is the one number guardCovered above
     deliberately refuses to trust, because a level-up pays coins through
     grantLevelRewards and would hold this row up on its own while every daily
     gate stayed shut. Measured: with the coinsAdd in claimQuest removed, this day
     still banks +85 coins of level-up spillover, so `coins > 0` was green while
     all 140 quest coins vanished. So: the QUEST coins have to be positive, and
     they have to have reached the wallet. */
  check('honest forward day still pays coins, and they are the QUEST coins',
    honest.questCoins > 0 && honest.coins >= honest.questCoins,
    `coins+${honest.coins}, of which quest coins ${honest.questCoins}`);
  check('honest forward day still pays XP', honest.xp > 0, `xp+${honest.xp}`);
  /* Compared against the +105 control, not against the forward walk's mean. The
     walk is a CHEAP day and this is a full one, so that comparison would be two
     different shapes of day and would pass with 2.5x of room whatever happened
     here. `fwd` is the same shape of day one day earlier, which makes the bound
     tight (measured 333 vs 333). The pre-guard 176.4 and the measured mean are
     still reported in the FINDING above, so the historical anchor is not lost. */
  /* Post-#283 two consecutive dates can legitimately roll different-SIZED quest
     sets, and quest XP dominates the day total, so raw-total parity reds on a
     healthy tree whenever the lottery deals unequal days. Compare like with
     like: parity holds on the raw totals when the sets are the same size, and
     on the per-rolled-quest normalized totals when they are not. */
  const sameSize = honest.questNames.length === fwd.questNames.length;
  const norm = d => d.xp / Math.max(1, d.questNames.length);
  check('the honest day is worth as much as the honest day before it (normalized when the date lottery dealt unequal sets)',
    sameSize ? honest.xp >= fwd.xp * 0.8 : norm(honest) >= norm(fwd) * 0.8,
    `${honest.xp} (${honest.questNames.length}q) vs ${fwd.xp} (${fwd.questNames.length}q) on the +105 control`);

  /* ================= 4. THE GRACE CEILING (ASSERTED, BOTH SIDES) ==========
     Rule 2: the local date may not outrun UTC elapsed by more than DAY_GRACE.
     The shim cannot move the local calendar without moving UTC, because that
     is a TIMEZONE change, so the anchor row is moved instead and the case is
     labelled ANCHOR. DIRECTION: too permissive is the failure the farmer wants
     and too strict is the failure the traveller feels, so BOTH sides of the
     edge are asserted. BOUND: exactly DAY_GRACE. */
  console.log(`\n--- ANCHOR: the grace ceiling, both sides of DAY_GRACE=${GRACE} ---`);
  for (const delta of [GRACE, GRACE + 1]) {
    await guard.reset();
    await shiftDays(300);
    await guard.claim(await keyFor(300));          // seed the mark at +300
    await shiftDays(300 + delta);
    await guard.anchorAtNow();                     // ANCHOR: zero UTC elapsed
    const r = await guard.claim(await keyFor(300 + delta));
    const shouldPass = delta <= GRACE;
    check(`${delta} local days with ZERO elapsed time is ${shouldPass ? 'allowed' : 'REFUSED'}`,
      r.fresh === shouldPass && (shouldPass || r.reason === 'too-fast'),
      `fresh=${r.fresh} reason=${r.reason} allowed=${r.allowed} claimed=${r.claimed}`);
  }

  /* Idle allowance must not bank. A player away for a month must not come back
     holding thirty days of headroom to spend in one sitting.
     DIRECTION: an accepted jump here is the failure. */
  await guard.reset();
  await shiftDays(400);
  await guard.claim(await keyFor(400));
  await shiftDays(430);
  /* Thirty days pass for the SERVER too, which is what makes this the honest
     idle-month case rather than a walk. Without it rule 3 refuses +430 first
     and this block would stop testing rule 2 at all. */
  await guard.witnessAt(430);
  await guard.claim(await keyFor(430));            // 30 honest days pass
  await guard.anchorAtNow();                       // ANCHOR: from here, no time passes
  const banked = await guard.claim(await keyFor(430 + GRACE + 1));
  check('an idle month does NOT bank spendable allowance',
    banked.fresh === false && banked.reason === 'too-fast',
    `fresh=${banked.fresh} reason=${banked.reason} allowed=${banked.allowed} claimed=${banked.claimed}`);

  /* ================= 5. THE HONEST PLAYER MUST NOT BE REFUSED ============
     Every one of these is a real person, and every one of them is a FAILURE
     if the guard says no. This block is the reason the first design (a rolling
     "20 hours since the last day we saw") was thrown away: it refuses the very
     first case here, every night, for every evening-then-morning player. */
  console.log('\n--- the honest player: a refusal in this block is a FAILURE ---');

  // 5a. 23:00 last night, 08:00 this morning. Nine hours across a real boundary.
  await guard.reset();
  const evening = await gotoLocal(200, 23);
  const seed = await guard.claim(evening.key);
  check('seeding: an existing player is let through on their first ever call',
    seed.fresh === true && seed.reason === 'seeded', `reason=${seed.reason} key=${seed.key}`);
  const morning = await gotoLocal(201, 8);
  const gap = (morning.now - evening.now) / HOUR;
  const morningClaim = await guard.claim(morning.key);
  check('evening-then-morning player is NOT refused (9h across a real day boundary)',
    morningClaim.fresh === true && morningClaim.reason === 'advanced',
    `${gap.toFixed(1)}h gap, ${evening.key} -> ${morning.key}, fresh=${morningClaim.fresh} reason=${morningClaim.reason}` +
    ` [the rejected 20h-rolling design returns fresh=false here]`);
  check('...and that gap really is under 20 hours, so the check is not vacuous',
    gap > 0 && gap < 20, `${gap.toFixed(1)}h`);

  // 5b. Same day, twice. Must be free and must write nothing.
  const st1 = await guard.state();
  const again = await guard.claim(morning.key);
  const st2 = await guard.state();
  check('a second call on the SAME day is fresh and stateless',
    again.fresh === true && again.reason === 'same-day' && st1.paceAt === st2.paceAt,
    `reason=${again.reason} paceAt ${st1.paceAt} == ${st2.paceAt}`);

  // 5c. The eastbound traveller. LA Monday 22:00 PDT -> Sydney Wednesday 06:00
  //     AEST: two local dates for fifteen hours of flight. ANCHOR, because the
  //     19-hour zone shift is exactly what the Date shim cannot express.
  await guard.reset();
  await shiftDays(500);
  await guard.claim(await keyFor(500));
  await shiftDays(502);
  await guard.anchorAgoMs(15 * HOUR);              // ANCHOR: 15h of flight
  const traveller = await guard.claim(await keyFor(502));
  check('eastbound traveller crossing the date line is NOT refused (2 local days, 15h elapsed)',
    traveller.fresh === true, `fresh=${traveller.fresh} reason=${traveller.reason} allowed=${traveller.allowed}`);

  // 5d. The westbound traveller. This one DOES cost a day, and the cost is
  //     bounded and stated rather than hidden.
  await guard.reset();
  await shiftDays(510);
  await guard.claim(await keyFor(510));
  const west = await guard.claim(await keyFor(509));
  const westBack = await guard.claim(await keyFor(510));
  const westNext = await guard.claim(await keyFor(511));
  check('westbound traveller loses the day BELOW the mark (this is the stated cost)',
    west.fresh === false && west.reason === 'backwards', `reason=${west.reason}`);
  check('...and nothing more: the mark day and the next day both open normally',
    westBack.fresh === true && westNext.fresh === true,
    `same-day=${westBack.reason} next=${westNext.reason}`);
  finding('what a traveller loses',
    'eastbound: nothing. westbound across the date line: the dailies for the local dates that ' +
    'fall below the high-water mark, which is at most one day, then normal service. That is the ' +
    'deliberate trade for making "backwards" absolute.');

  // 5e. NTP corrections, both directions, after a flat battery.
  await guard.reset();
  await shiftDays(600);
  const trueDay = await guard.claim(await keyFor(600));
  const stuckPast = await guard.claim(await keyFor(570));       // RTC stuck 30 days back
  const stateAfterPast = await guard.state();
  const ntpForward = await guard.claim(await keyFor(601));      // NTP lands, next real day
  check('NTP: a clock stuck in the PAST is refused and heals on correction',
    stuckPast.fresh === false && stuckPast.reason === 'backwards' &&
    stateAfterPast.highWater === trueDay.state.highWater && ntpForward.fresh === true,
    `stuck=${stuckPast.reason}, mark unmoved at ${stateAfterPast.highWater}, after=${ntpForward.reason}`);

  await guard.reset();
  await shiftDays(700);
  const trueDay2 = await guard.claim(await keyFor(700));
  await guard.anchorAtNow();
  const garbageFuture = await guard.claim(await keyFor(700 + 3650));   // RTC reads a decade ahead
  const stateAfterFuture = await guard.state();
  const ntpBack = await guard.claim(await keyFor(700));
  check('NTP: a garbage FUTURE clock is refused, writes nothing, and heals on correction',
    garbageFuture.fresh === false && garbageFuture.reason === 'too-fast' &&
    stateAfterFuture.highWater === trueDay2.state.highWater && ntpBack.fresh === true,
    `future=${garbageFuture.reason}, mark unmoved at ${stateAfterFuture.highWater}, after=${ntpBack.reason}`);
  check('the guard has no latch: every refusal is stateless',
    stateAfterFuture.highWater === trueDay2.state.highWater &&
    stateAfterPast.highWater === trueDay.state.highWater,
    'a refusal can never leave a player permanently locked out');

  /* ================= 6. MIGRATION (ASSERTED) =============================
     An existing player must not lose a day to the update itself, wherever
     their clock happens to be. DIRECTION: a refusal on the first ever call is
     the failure. */
  await guard.reset();
  await shiftDays(-40);                              // a player whose clock is well behind
  const migrateBehind = await guard.claim();
  await guard.reset();
  await shiftDays(900);                              // a player who already farmed
  const migrateAhead = await guard.claim();
  check('MIGRATION: the first call after the update always seeds, never penalises',
    migrateBehind.fresh === true && migrateBehind.reason === 'seeded' &&
    migrateAhead.fresh === true && migrateAhead.reason === 'seeded',
    `behind=${migrateBehind.key} ahead=${migrateAhead.key}`);
  finding('migration policy',
    'dayHighWater starts null, so the mark seeds from wherever the player already is. Nobody is ' +
    'retroactively penalised and nobody who already farmed is rolled back. The alternative would ' +
    'punish a legitimate player whose device is a day off, to reclaim XP that is already spent.');

  await shiftDays(0);

  /* THE SEEDED-PRIZE CONSEQUENCE. Both the wheel prize (js/wheel.js:205,
     mulberry32(hashStr('wheel:'+today))) and the day's three quests
     (js/quests.js:221, 'quests:'+date) are PURE FUNCTIONS OF THE DATE STRING.
     Date-seeding was chosen so a reload cannot reroll the prize. Under a
     movable clock it inverts: the player can compute every future date's
     outcome offline and set the clock only to the dates that pay. Measured by
     asking the app's own wheel gate + quest picker about a year of dates.
     STAYS A FINDING: the guard does not change it, because it is a property of
     the seeding scheme, not of the day gate. Skipping to a chosen future date
     still works; what the guard adds is that you cannot skip BACK afterwards. */
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

  /* ================= 7. THE SERVER WITNESS (ASSERTED) =====================
     Rule 3, on its own terms. Section 1 proved the forward walk now stops;
     this proves the thing it stops on is the SERVER'S day and not an accident:
     that the wire really carries it, that it only ever moves up, that both
     sides of the offline allowance behave, that a refusal heals the moment the
     server catches up, and that a restored backup cannot wind it back. */
  console.log('\n--- the server witness: rule 3 on its own terms ---');

  // 7a. THE WIRE. Reloaded with ?api= pointed at the loopback stub, which is
  //     the app's own documented dev hook (js/social.js initFromQuery), so
  //     nothing here can reach the production API by accident.
  const serverDay = Date.now() + 500 * 86400000;
  healthTs = serverDay;
  await page.goto(`${base}?api=${encodeURIComponent(healthUrl)}`, { waitUntil: 'networkidle2' });
  await sleep(1200);
  await guard.clearWitness();
  const hitsBefore = healthHits;
  const wire = await page.evaluate(async () => {
    const [social, db] = await Promise.all([import('./js/social.js'), import('./js/db.js')]);
    const before = (await db.dayGuardState()).witness;
    const got = await social.touchServerDay();
    return { before, got, after: (await db.dayGuardState()).witness, api: await social.apiBase() };
  });
  check('touchServerDay actually called /health on the stub, not the real API',
    healthHits > hitsBefore && wire.api === healthUrl, `${healthHits - hitsBefore} hit(s) on ${wire.api}`);
  check('the ceiling moves to the day the SERVER said, and to nothing else',
    wire.before === 0 && wire.after === Math.floor(serverDay / 86400000),
    `${wire.before} -> ${wire.after}, server ts ${serverDay} = day ${Math.floor(serverDay / 86400000)}`);

  // 7b. MONOTONIC. A replayed, stale or forged-backwards answer must not lower
  //     the ceiling, or the farmer just serves themselves an old timestamp.
  healthTs = Date.now() - 900 * 86400000;
  const older = await page.evaluate(async () => {
    const [social, db] = await Promise.all([import('./js/social.js'), import('./js/db.js')]);
    await social.touchServerDay();
    return (await db.dayGuardState()).witness;
  });
  check('an OLDER server answer cannot lower the ceiling', older === wire.after,
    `witness still ${older} after a /health 900 days in the past`);

  /* 7c. BOTH SIDES OF THE OFFLINE ALLOWANCE. The pace anchor is pushed back
     nine days first so rule 2 has headroom and cannot be the thing that
     refuses: this block must fail on rule 3 or not at all. */
  await guard.reset();
  await shiftDays(500);
  const seededW = await guard.claim(await keyFor(500));
  const wState = await guard.state();
  check('an offline device with no witness at all SEEDS and is let through',
    seededW.fresh === true && wState.witness > 0,
    `reason=${seededW.reason} witness seeded at ${wState.witness}`);
  await guard.anchorAgoMs(9 * 86400000);
  const edgeIn = await guard.claim(await keyFor(500 + W_GRACE));
  await guard.anchorAgoMs(9 * 86400000);
  const hwBeforeEdge = (await guard.state()).highWater;
  const edgeOut = await guard.claim(await keyFor(500 + W_GRACE + 1));
  const hwAfterEdge = (await guard.state()).highWater;
  check(`${W_GRACE} days offline is ALLOWED (the plane, the cabin, the dead SIM)`,
    edgeIn.fresh === true, `fresh=${edgeIn.fresh} reason=${edgeIn.reason}`);
  check(`${W_GRACE + 1} days past the last /health is REFUSED, by name`,
    edgeOut.fresh === false && edgeOut.reason === 'unwitnessed',
    `fresh=${edgeOut.fresh} reason=${edgeOut.reason} witness=${edgeOut.witness} ceiling=${edgeOut.ceiling} claimed=${edgeOut.claimed}`);
  check('...and that refusal writes NOTHING, so rule 3 cannot latch either',
    hwAfterEdge === hwBeforeEdge, `high-water unmoved at ${hwAfterEdge}`);

  // 7d. HEALING. One successful /health, on any network, on any later day, and
  //     the refused day opens. This is what makes the offline story bearable.
  await guard.witnessAt(500 + W_GRACE + 1);
  await guard.anchorAgoMs(9 * 86400000);
  const healed = await guard.claim(await keyFor(500 + W_GRACE + 1));
  check('one /health after the fact opens the refused day: the pause is not a loss',
    healed.fresh === true, `fresh=${healed.fresh} reason=${healed.reason}`);

  /* 7f. THE ONLINE PLAYER IS NEVER TOUCHED BY ANY OF THIS. The inverse of the
     forward-walk assertion and the more important one: when the server's day
     advances alongside the device's, which is every player with any network at
     all, the ceiling is always ahead and never binds. Ten days, no refusals.
     DIRECTION: a single refusal here is a FAILURE. */
  await guard.reset();
  await shiftLocalDays(800);
  await guard.witnessAt(800);
  await guard.claim(await keyFor(800));
  const online = [];
  for (let d = 801; d <= 810; d++) {
    await shiftLocalDays(d);
    await guard.witnessAt(d);                      // the server got there too
    online.push(await guard.claim(await keyFor(d)));
  }
  check('ten days with the server advancing too: not one refusal',
    online.length === 10 && online.every(r => r.fresh === true && r.reason === 'advanced'),
    /* THE DETAIL HAS TO EXPLAIN THE CONDITION IT SITS UNDER. This printed
       "10/10 advanced" while the row was RED, because it only consulted
       `fresh` while the condition also requires reason === 'advanced'. The
       actual failure was one day answering `same-day`, and the message hid it
       completely: it took a trace to find out which day and why. Report both
       halves. */
    online.every(r => r.fresh && r.reason === 'advanced')
      ? `${online.length}/${online.length} advanced`
      : `refused: [${online.filter(r => !r.fresh).map(r => r.reason).join(', ') || 'none'}]`
        + `  not-advanced: [${online.map((r, i) => [801 + i, r]).filter(([, r]) => r.fresh && r.reason !== 'advanced').map(([d, r]) => `d${d}:${r.reason}`).join(', ') || 'none'}]`);

  /* 7e. A RESTORE CANNOT WIND THE CEILING BACK. Named in the previous version
     of this file as the hole that undoes any device-side mark: export, farm,
     restore, mark reset, farmed rows kept. Asserted on BOTH import paths, the
     Settings file restore (replace) and the cloud pull (merge). */
  for (const replace of [false, true]) {
    const roundTrip = await page.evaluate(async rep => {
      const db = await import('./js/db.js');
      await db.kvSet(db.DAY_WITNESS_KEY, 20000);
      const backup = await db.exportAll();              // taken while the mark is low
      await db.kvSet(db.DAY_WITNESS_KEY, 20050);        // 50 days of server time later
      await db.importAll(backup, { replace: rep });
      return { inFile: 20000, after: (await db.dayGuardState()).witness };
    }, replace);
    check(`restoring an older backup cannot lower the ceiling (${replace ? 'file restore' : 'cloud pull'})`,
      roundTrip.after === 20050,
      `file carried ${roundTrip.inFile}, device kept ${roundTrip.after}`);
  }

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
      first: r1.ok, second: r2.ok, secondReason: r2.reason,
      afterErase: r3.ok, afterEraseReason: r3.reason,
    };
  });
  check('redeem codes ship in plaintext in js/loot.js', redeem.inShippedSource, redeem.codes.join(', '));
  check('a code pays the first time', redeem.first === true);
  check('the same code is refused the second time', redeem.second === false, `reason=${redeem.secondReason}`);
  /* This used to assert afterErase === true, back when the one-shot lived only in
     the `redeemed` LIST and clearing that list handed the code back. PR #43 moved
     the claim onto a per-code kv row taken with addIfAbsent, so the list is now a
     legacy read and clearing it no longer reopens anything. Assert the hole is
     CLOSED. FAILURE DIRECTION: afterErase goes true, meaning the per-code row
     stopped being the thing that decides. */
  check('clearing kv `redeemed` does NOT make the code pay again', redeem.afterErase === false,
    `the claim is the per-code row redeemed:BONEHEADZ, not the list (reason=${redeem.afterEraseReason})`);

  finding('WHAT THIS GUARD DOES NOT STOP',
    'devtools (kvSet either mark by hand); editing js/db.js in a local checkout; pointing kv `apiBase` ' +
    '(settable from the URL as ?api=) at a server the player controls, which hands the ceiling any day ' +
    'they like; a clean reinstall or a full erase, which reseeds every mark and costs them their save; ' +
    'and the ungated food-logging XP measured in section 2, which is keyed per ENTRY and is not a daily ' +
    'limit. The backup-restore hole IS closed now, on both import paths (section 7e). What is left is ' +
    'devtools-tier: this stops casual clock-toggling from Settings, it makes a forward walk a debt, and ' +
    'it caps that walk at one bubble of WITNESS_GRACE days followed by the honest one-day-per-real-day rate.');

} finally {
  await browser.close().catch(() => {});
  if (srvHandle) srvHandle.close();
  health.close();
}

console.log(bad ? `\n${bad} FAIL` : '\nall checks ok (see FINDING lines for the measurements)');
process.exit(bad ? 1 : 0);
