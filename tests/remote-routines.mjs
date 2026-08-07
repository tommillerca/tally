/* The housebound player's path, and routines you write yourself.
 *
 * Tom, 2026-08-06: "People that can't get out for walks feel like there's no
 * point to log on. Should we do a remote pass boss fight free daily or
 * something? Is there ways to include working out as a potential experience
 * gain. Also it would be cool to have a part of the app where could set routines
 * or personal tasks you need to accomplish."
 *
 * Three answers, three sets of checks:
 *   REMOTE    one boss a day with no GPS, and it counts as a den win, which is
 *             the thing that actually gated the Gauntlet behind walking
 *   FUEL      recorded exercise minutes move the egg/pet meter, capped per day
 *   ROUTINE   user-defined tasks on the same ledger as the built-in habits,
 *             with an XP cap so a self-written task is not a money printer
 *
 * PROVE-RED: drop the `den.remote` branch from claimDenWin and REMOTE fails;
 * remove exerciseMin from lifetimeStepsSum and FUEL fails; raise ROUTINE_XP_CAP
 * and the cap check fails.
 *
 * Usage: node tests/remote-routines.mjs
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srv = null;
let base = process.env.URL;
if (!base) {
  srv = spawn('python3', ['-m', 'http.server', '8148', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(900);
  base = 'http://127.0.0.1:8148/';
}

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await seed(page, { level: 14, coins: 500 });

/* ---------------- REMOTE DEN ---------------- */
const remote = await page.evaluate(async () => {
  const poi = await import('./js/poi.js');
  const d1 = poi.remoteDen('2026-08-08'), d2 = poi.remoteDen('2026-08-09');
  const same = poi.remoteDen('2026-08-08');
  return {
    deterministic: d1.name === same.name && d1.tier === same.tier,
    differsByDay: d1.id !== d2.id,
    noLocation: d1.lat === undefined && d1.lng === undefined,
    tierCapped: [d1.tier, d2.tier].every(t => t <= 4),
    key: poi.denKey('2026-08-08', d1),
  };
});
ok('REMOTE the daily boss needs no location at all', remote.noLocation, JSON.stringify(remote));
ok('REMOTE it is the same boss for everyone on a given day', remote.deterministic && remote.differsByDay, JSON.stringify(remote));
ok('REMOTE it stays below the 2-on-1 monsters', remote.tierCapped, `tiers ok`);

const claim = await page.evaluate(async () => {
  const poi = await import('./js/poi.js');
  const day = '2026-08-08';
  const den = poi.remoteDen(day);
  const before = await poi.denWinsCount();
  const first = await poi.claimDenWin(den, day);
  const mid = await poi.denWinsCount();
  const again = await poi.claimDenWin(den, day);   // same day: must pay nothing
  const tomorrow = await poi.claimDenWin(poi.remoteDen('2026-08-09'), '2026-08-09');
  const after = await poi.denWinsCount();
  const { kvGet } = await import('./js/db.js');
  return {
    before, mid, after, firstPaid: !!first, againPaid: !!again, tomorrowPaid: !!tomorrow,
    // the remote branch's distinguishing behaviour: no gear chooser, lighter coins
    gearChoices: first ? first.gearChoices : 'no-claim',
    pendingLoot: ((await kvGet('denloot', [])) || []).length,
    coins: first ? first.coins : null,
    fullCoins: den.reward ? den.reward.coins : null,
  };
});
ok('REMOTE beating it counts as a den win (this is what unblocks the Gauntlet)',
  claim.firstPaid && claim.mid === claim.before + 1, JSON.stringify(claim));
ok('REMOTE it is once per day, not a grind', claim.againPaid === false, JSON.stringify(claim));
ok('REMOTE a new day is a new boss and a new win', claim.tomorrowPaid && claim.after === claim.mid + 1, JSON.stringify(claim));
// walking to a REAL den has to stay the better deal, so the remote one hands out
// no gear chooser at all. This is also what proves the remote branch ran.
ok('REMOTE it pays no gear choice (a real den is still the better trip)',
  claim.gearChoices === null && claim.pendingLoot === 0, JSON.stringify({ gearChoices: claim.gearChoices, pendingLoot: claim.pendingLoot }));

// and it has to be REACHABLE: the control must exist in the Pit
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1200);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /the pit/i.test(x.textContent || '')); if (b) b.click(); });
await sleep(2200);
const inPit = await page.evaluate(() => ({
  sect: /remote den/i.test(document.body.innerText),
  btn: !!document.querySelector('#remoteDenBtn') || /TOMORROW/.test(document.body.innerText),
}));
ok('REMOTE the Pit actually offers it', inPit.sect && inPit.btn, JSON.stringify(inPit));

/* ---------------- WORKOUT FUEL ---------------- */
const fuel = await page.evaluate(async () => {
  const { db } = await import('./js/db.js');
  const loot = await import('./js/loot.js');
  await db.put('health', { date: '2026-08-01', steps: 1000, exerciseMin: 0 });
  const stepsOnly = await loot.lifetimeStepsSum();
  await db.put('health', { date: '2026-08-01', steps: 1000, exerciseMin: 30 });
  const withWorkout = await loot.lifetimeStepsSum();
  await db.put('health', { date: '2026-08-01', steps: 1000, exerciseMin: 600 }); // absurd
  const capped = await loot.lifetimeStepsSum();
  return { stepsOnly, withWorkout, capped, perMin: loot.STEPS_PER_ACTIVE_MIN, cap: loot.ACTIVE_MIN_DAILY_CAP };
});
ok('FUEL a workout moves the egg meter', fuel.withWorkout === fuel.stepsOnly + 30 * fuel.perMin, JSON.stringify(fuel));
ok('FUEL a mis-recorded marathon workout cannot hatch a shelf of eggs',
  fuel.capped === fuel.stepsOnly + fuel.cap * fuel.perMin, JSON.stringify(fuel));

/* ---------------- ROUTINES ---------------- */
const routine = await page.evaluate(async () => {
  const w = await import('./js/wellness.js');
  const added = [];
  for (const n of ['Stretch', 'Meds', 'Walk the dog', 'Guitar']) added.push(await w.addRoutine(n));
  const list = await w.getRoutines();
  const empty = await w.addRoutine('   ');
  const xps = [];
  for (const r of list) xps.push((await w.markRoutine(r.id)).xp);
  const repeat = await w.markRoutine(list[0].id);
  const done = await w.routinesDone();
  await w.removeRoutine(list[0].id);
  const afterRemove = (await w.getRoutines()).length;
  return { n: list.length, names: list.map(r => r.name), emptyRejected: empty.ok === false, xps, repeatXp: repeat.xp, doneCount: done.size, afterRemove, cap: w.ROUTINE_XP_CAP };
});
ok('ROUTINE you can write your own tasks', routine.n === 4 && routine.names[0] === 'Stretch', JSON.stringify(routine.names));
ok('ROUTINE a blank one is refused', routine.emptyRejected, String(routine.emptyRejected));
ok('ROUTINE the first few pay XP', routine.xps.slice(0, routine.cap).every(x => x > 0), JSON.stringify(routine.xps));
ok('ROUTINE beyond the daily cap they still tick but stop paying',
  routine.xps.length > routine.cap && routine.xps[routine.cap] === 0, JSON.stringify(routine.xps));
ok('ROUTINE ticking the same one twice pays nothing', routine.repeatXp === 0, String(routine.repeatXp));
ok('ROUTINE done-state is read back from the ledger', routine.doneCount === 4, String(routine.doneCount));
ok('ROUTINE you can remove one', routine.afterRemove === 3, String(routine.afterRemove));

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
