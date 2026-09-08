/* Z1: run the shipped Trends calculations/HTML and the real paying engine
 * against the same persisted diary. PURE, no sockets or browser. Layout and
 * browser concurrency remain unrun. The clock is fixed across local midnight.
 * CONTROL: no row, even with walking, gives no logged day or streak.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import './mem-idb.mjs';

const RealDate = Date;
const now = new RealDate(2031, 4, 5, 12).getTime();
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
};
const { db, useDbName } = await import('../js/db.js');
const g = await import('../js/game.js');
const nutrition = await import('../js/nutrition.js');
const today = nutrition.dateKey();
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
function fn(name) {
  const start = app.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  const end = app.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start, `SETUP missing ${name}`);
  return app.slice(start, end + 2);
}
async function trends() {
  const c = vm.createContext({ ...nutrition, db, streakDateSet: g.streakDateSet,
    S: { settings: { units: 'kg', targets: { kcal: 2000, p: 100 } } }, esc: String,
    totalXp: g.totalXp, levelFor: g.levelFor, earnedBadgeIds: g.earnedBadgeIds,
    stepAvgWithToday: () => ({ avg: 0, partial: false }), typicalStepShare: () => 1,
    STEP_REF: 8000, calorieRingCard: () => '', activityRecoveryHtml: () => '',
    barChart: () => '', kcalChart: () => '', proteinChart: () => '',
    badgesGridHtml: () => '', ICONS: { flame: () => '' },
  });
  const render = fn('renderTrends');
  const stop = render.indexOf("  $('#logWeight')");
  assert.ok(stop > 0, 'SETUP missing end of Trends HTML assignment');
  vm.runInContext(fn('shownTotals') + '\n' + fn('loggedAvg') + '\n' + render.slice(0, stop) + '\n}', c);
  const el = {};
  await c.renderTrends(el);
  const logged = el.innerHTML.match(/class="rp-v">(\d+)<small>\/7<\/small><\/span><span class="rp-s">days logged/);
  const streak = el.innerHTML.match(/class="rp-v">(\d+)<small><\/small><\/span><span class="rp-s">day streak/);
  assert.ok(logged && streak, 'CONTROL real recap pills must be rendered');
  return { logged: Number(logged[1]), streak: Number(streak[1]) };
}
const row = (id, offset, kcal = 100) => ({ id, date: nutrition.addDays(today, -offset),
  name: id, meal: 0, ts: now, kcal, p: 0, c: 0, f: 0 });
const baseXp = async () => (await db.all('xp')).filter(r => r.type === 'log').reduce((n, r) => n + r.xp, 0);
let passed = 0, failed = 0;
async function check(name, act) {
  useDbName(`zero-calorie-${passed + failed}`);
  try { await act(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack}`); }
}
try {
  for (const [length, gap] of [[9, 6], [90, 3]]) {
    await check(`${length}-day history: deleting sole zero-calorie row changes display and paying streak together`, async () => {
      const rows = Array.from({ length }, (_, i) => row(`row-${i}`, i, i === gap ? 0 : 100));
      for (const e of rows) await db.put('log', e);
      const before = await trends();
      const payBefore = await g.onFoodLogged(rows[0], { entriesForDate: [rows[0]] });
      assert.deepEqual(before, { logged: 7, streak: length });
      assert.equal(payBefore.streak, before.streak);
      assert.equal((await g.buildStats()).streak, before.streak);
      await db.del('log', rows[gap].id);
      const after = await trends();
      const payAfter = await g.onFoodLogged(rows[0], { entriesForDate: [rows[0]] });
      assert.deepEqual(after, { logged: 6, streak: gap });
      assert.equal(payAfter.streak, after.streak);
      assert.equal((await g.buildStats()).streak, after.streak);
      assert.equal(before.streak - after.streak, payBefore.streak - payAfter.streak);
      const dates = g.streakDateSet(await db.all('log'), await db.all('xp'));
      assert.ok(!dates.has(rows[gap].date), 'past XP must not keep a deleted log day alive');
    });
  }
  await check('zero-calorie quick add advances 13 to 14 and pays the same streak milestone once', async () => {
    for (let i = 1; i <= 13; i++) await db.put('log', row(`past-${i}`, i));
    assert.deepEqual(await trends(), { logged: 6, streak: 13 });
    const e = row('diet-soda', 0, 0);
    await db.put('log', e);
    const pay = await g.onFoodLogged(e, { entriesForDate: [e] });
    assert.deepEqual(await trends(), { logged: 7, streak: 14 });
    assert.equal(pay.streak, 14);
    assert.equal(pay.streakMilestone, 14);
    assert.equal((await db.get('xp', 'streak-14')).xp, 100);
    const total = await g.totalXp();
    assert.equal((await g.onFoodLogged(e, { entriesForDate: [e] })).xp, 0);
    assert.equal(await g.totalXp(), total, 'retry cannot repay milestone or log');
  });
  await check('deleting one of two zero-calorie rows keeps the day; deleting the last removes it', async () => {
    const a = row('a', 0, 0), b = row('b', 0, 0);
    await db.put('log', a); await db.put('log', b);
    await g.onFoodLogged(a, { entriesForDate: [a, b] });
    await db.del('log', a.id);
    assert.deepEqual(await trends(), { logged: 1, streak: 1 });
    assert.equal((await g.buildStats()).streak, 1);
    await db.del('log', b.id);
    assert.deepEqual(await trends(), { logged: 0, streak: 0 });
    assert.equal((await g.buildStats()).streak, 0);
  });
  await check('CONTROL no row is no logged day, including a walking-only day', async () => {
    assert.deepEqual(await trends(), { logged: 0, streak: 0 });
    assert.equal((await g.buildStats()).streak, 0);
    await db.put('health', { date: today, steps: 10000 });
    assert.deepEqual(await trends(), { logged: 0, streak: 0 });
    assert.equal((await g.buildStats()).streak, 0);
  });
  await check('legacy freeze protects the same streak in display and engine without inventing a logged day', async () => {
    await db.put('xp', { key: 'legacy-freeze', date: today, type: 'freeze', xp: 0 });
    assert.deepEqual(await trends(), { logged: 0, streak: 1 });
    assert.equal((await g.buildStats()).streak, 1);
  });
  await check('zero-calorie log/delete hammer cannot bypass the existing shared daily XP cap', async () => {
    const cap = g.XP_DAILY_CAP.log;
    assert.ok(Number.isInteger(cap) && cap > 0 && cap < 60);
    // A normal food must pay, so disabling all food XP cannot pass this guard.
    const food = row('food', 0);
    await db.put('log', food);
    await g.onFoodLogged(food, { entriesForDate: [food] });
    assert.equal(await baseXp(), 10);
    for (let i = 0; i < 60; i++) {
      const e = row(`tap-${i}`, 0, 0);
      await db.put('log', e);
      await g.onFoodLogged(e, { entriesForDate: [food, e] });
      await db.del('log', e.id);
    }
    assert.ok(await baseXp() <= cap * 10, 'zero-calorie rows bypassed the existing cap');
    assert.deepEqual(await trends(), { logged: 1, streak: 1 });
  });
} finally { globalThis.Date = RealDate; }
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
