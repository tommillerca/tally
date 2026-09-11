// Frozen Today playtest, 2026-09-08. Production slices and real db/game calls.
// Node only: DOM doubles prove handlers and copy, never pixels or layout.
// Assertions execute production code; all fixtures stay in memory.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { db, kvGet, kvSet, useDbName } from '../js/db.js';
import * as game from '../js/game.js';
import * as nutrition from '../js/nutrition.js';
import * as wellness from '../js/wellness.js';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function cut(start, end) {
  const a = app.indexOf(start), b = app.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Missing production slice: ${start}`);
  return app.slice(a, b);
}
function run(code, deps = {}) {
  const args = { ...nutrition, ...game, ...wellness, db, kvGet, kvSet, ...deps };
  return new AsyncFunction(...Object.keys(args), code)(...Object.values(args));
}
let passed = 0, failed = 0, seq = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
const RealDate = Date;
let now = new RealDate(2026, 8, 8, 12).getTime();
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
};
const today = nutrition.dateKey(), yesterday = nutrition.addDays(today, -1);
const targets = { kcal: 2000, p: 100, c: 250, f: 70 };
function meal(date = today, id = 'meal', kcal = 400) {
  return { id, date, ts: now, meal: 0, name: 'Oats', kcal, p: 10, c: 20, f: 5 };
}
async function fresh() { useDbName(`today-playtest-${++seq}`); }
const entriesFor = date => db.byIndex('log', 'date', date);
const rollCode = cut('let _dayAnchor = dateKey();', '\n/* THE RETURN CARD');
const commitCode = cut('async function commitLogEntry(', '\nfunction queueCelebration(');
async function rollover({ past = false, fail = false } = {}) {
  await fresh();
  await db.put('log', meal(yesterday, 'yesterday', 1600));
  const S = { date: past ? nutrition.addDays(today, -3) : yesterday, settings: { targets } };
  let clock = yesterday, calls = 0;
  const routes = [], messages = [];
  const h = await run(rollCode + '\n' + commitCode + '\nreturn { rollDayIfNeeded, commitLogEntry };', {
    S, dateKey: () => clock, entriesFor,
    awardDayCloseIfDue: async t => {
      calls++;
      if (fail && calls === 1) throw new Error('injected settlement failure');
      return game.awardDayCloseIfDue(t);
    },
    route: x => routes.push(x), toast: x => messages.push(x), setTimeout: () => {},
    maybeShowDailyWheel: async () => false, refreshNotifSchedules: () => {},
    sheetStack: [], refresh: () => {}, dayGuardToast: () => {},
    recordMealUsed: async () => {}, storageIsFull: () => false, trackEvent: () => {},
  });
  clock = today;
  return { ...h, S, routes, messages, calls: () => calls };
}

try {
  await test('CONTROL day close pays one crate and retries pay none', async () => {
    const h = await rollover();
    assert.equal(await h.rollDayIfNeeded(), true);
    assert.equal(h.S.date, today);
    assert.equal(await h.rollDayIfNeeded(), false);
    await game.awardDayCloseIfDue(targets);
    assert.equal((await db.all('inv')).filter(r => r.source === `dayclose-${yesterday}`).length, 1);
    assert.equal((await db.get('xp', `dayclose-${yesterday}`)).xp, 50);
  });
  await test('ROLLOVER failed settlement remains retryable in the same session', async () => {
    const h = await rollover({ fail: true });
    await assert.rejects(h.rollDayIfNeeded(), /injected/);
    await h.rollDayIfNeeded();
    const crates = (await db.all('inv')).filter(r => r.source === `dayclose-${yesterday}`);
    assert.equal(crates.length, 1, `retry delivered ${crates.length} day-close crates; calls=${h.calls()}`);
    assert.equal(h.S.date, today);
    assert.equal(h.routes.length, 1);
  });
  await test('ROLLOVER failed meal-time settlement rearms Add and retry saves once today', async () => {
    const h = await rollover({ fail: true });
    const btn = { disabled: true }, entry = meal(yesterday, 'midnight-meal');
    let first;
    try { first = await h.commitLogEntry(entry, btn); }
    catch (e) { assert.fail(`Add escaped: ${e.message}; disabled=${btn.disabled}`); }
    assert.equal(first, null);
    assert.equal(btn.disabled, false);
    assert(h.messages.some(m => m.includes('Could not save')));
    btn.disabled = true;
    assert(await h.commitLogEntry(entry, btn));
    assert.equal((await db.get('log', entry.id)).date, today);
    assert.equal((await entriesFor(today)).length, 1);
  });
  await test('CONTROL rollover retains deliberate past navigation and existing meal dates', async () => {
    const past = await rollover({ past: true }), original = past.S.date;
    await past.rollDayIfNeeded();
    assert.equal(past.S.date, original);
    assert.equal(past.routes.length, 0);
    const h = await rollover();
    await h.commitLogEntry(meal(yesterday, 'yesterday', 1500), { disabled: true });
    assert.equal((await db.get('log', 'yesterday')).date, yesterday);
  });
  await test('STREAK Today honours earned freeze days in the hero copy', async () => {
    await fresh();
    for (let i = 0; i < 5; i++) if (i !== 2) await db.put('log', meal(nutrition.addDays(today, -i), `m${i}`));
    await db.put('xp', { key: 'freeze', type: 'freeze', date: nutrition.addDays(today, -2), xp: 0 });
    const prefix = cut('async function renderToday(el) {', '  const inv = await db.all(\'inv\');');
    const streak = await run(prefix + '\nreturn streak; } return renderToday({});', {
      S: { date: today, settings: {} }, entriesFor, social: { displayName: async () => null },
      firstDiaryDate: () => nutrition.addDays(today, -4),
    });
    assert.equal(streak, 5, `Today says ${streak}; protected streak is 5`);
    const pool = await run(cut('function gwartPool(', '\nfunction ',) + '\nreturn gwartPool(ctx);', {
      ctx: { entries: [meal()], tot: { kcal: 400, p: 10 }, targets, crates: [], streak, level: 1, isToday: true },
    });
    assert(pool.includes('5 days running. The habit is doing the work now.'));
  });
  await test('CONTROL food save failure keeps Add usable; XP failure keeps one committed meal', async () => {
    await fresh();
    const messages = [], S = { date: today, settings: { targets } };
    const commit = await run(commitCode + '\nreturn commitLogEntry;', {
      S, entriesFor, rollDayIfNeeded: async () => false,
      refreshNotifSchedules: () => {}, recordMealUsed: async () => {},
      toast: m => messages.push(m), storageIsFull: () => false, trackEvent: () => {},
    });
    const put = db.put, btn = { disabled: true };
    db.put = async (store, row) => { if (store === 'log') throw new Error('injected log write'); return put(store, row); };
    try { assert.equal(await commit(meal(), btn), null); } finally { db.put = put; }
    assert.equal(btn.disabled, false);
    assert.equal((await db.all('log')).length, 0);
    assert(messages.some(m => m.includes('Could not save')));
    const claim = db.addIfAbsent;
    db.addIfAbsent = async () => { throw new Error('injected XP failure'); };
    try { assert.equal((await commit(meal(), { disabled: true })).receiptFailed, true); }
    finally { db.addIfAbsent = claim; }
    assert.equal((await db.all('log')).length, 1);
    assert.equal((await db.get('log', 'meal')).foodXp.id, 'meal');
    await game.onFoodLogged(meal(), { targets, entriesForDate: await entriesFor(today) });
    await game.onFoodLogged(meal(), { targets, entriesForDate: await entriesFor(today) });
    assert.equal((await db.all('xp')).filter(r => r.type === 'log').length, 1);
  });

  await test('REWARD streak crate survives delivery failure and retry', async () => {
    await fresh();
    for (let i = 0; i < 3; i++) await db.put('log', meal(nutrition.addDays(today, -i), `s${i}`));
    const entitled = { ...meal(today, 's0'), foodXp: { id: 's0', date: today, targets, via: null } };
    await db.put('log', entitled);
    await kvSet('game-init', true);
    const put = db.put, claimAndPay = db.claimAndPay;
    let injected = 0;
    db.claimAndPay = (store, row, pay) => {
      if (store === 'xp' && row.key === 'streak-3') {
        assert(pay.puts.some(p => p.store === 'inv' && p.val.source === 'streak-3'));
        return claimAndPay(store, row, { ...pay, kv: { ...pay.kv, todayAuditAbort: () => {
          injected++; throw new Error('injected streak crate write');
        } } });
      }
      return claimAndPay(store, row, pay);
    };
    db.put = async (store, row) => {
      if (store === 'inv' && row.source === 'streak-3') { injected++; throw new Error('injected streak crate write'); }
      return put(store, row);
    };
    try { await assert.rejects(game.onFoodLogged(entitled), /injected streak crate/); }
    finally { db.put = put; db.claimAndPay = claimAndPay; }
    assert.equal(injected, 1);
    // Resume through the production recovery entry point, not a test retry loop.
    await game.initGameIfNeeded(targets);
    const count = (await db.all('inv')).filter(r => r.source === 'streak-3').length;
    assert.equal(count, 1, `retry delivered ${count} streak crates after XP claimed`);
    assert.equal((await db.get('xp', 'streak-3')).xp, 100);
    assert.equal(await kvGet('foodXpDone:s0'), true);
    await game.onFoodLogged(meal(today, 's0'));
    assert.equal((await db.all('inv')).filter(r => r.source === 'streak-3').length, 1);
  });
  await test('REWARD every newly earned streak milestone delivers its crate', async () => {
    await fresh();
    for (let i = 0; i < 7; i++) await db.put('log', meal(nutrition.addDays(today, -i), `seven${i}`));
    const r = await game.onFoodLogged(meal(today, 'seven0'));
    const sources = (await db.all('inv')).filter(r => /^streak-/.test(r.source)).map(r => r.source).sort();
    assert.deepEqual(sources, ['streak-3', 'streak-7']);
    assert.equal(r.crates, 2);
  });
  await test('CONTROL overlapping milestone claims pay one crate; history initialization stays XP-only', async () => {
    await fresh();
    for (let i = 0; i < 3; i++) await db.put('log', meal(nutrition.addDays(today, -i), `race${i}`));
    const results = await Promise.all([game.onFoodLogged(meal(today, 'race0')), game.onFoodLogged(meal(today, 'race0'))]);
    assert.equal((await db.all('inv')).filter(r => r.source === 'streak-3').length, 1);
    assert.equal(results.reduce((n, r) => n + r.crates, 0), 1);
    await fresh();
    for (let i = 0; i < 3; i++) await db.put('log', meal(nutrition.addDays(today, -i), `history${i}`));
    await game.initGameIfNeeded(targets);
    assert.equal((await db.get('xp', 'streak-3')).xp, 100);
    assert.equal((await db.all('inv')).filter(r => /^streak-/.test(r.source)).length, 0);
  });
  await test('CONTROL meal rows and calorie ring agree at fractional, empty and over-budget totals', async () => {
    const render = await run(
      cut('function shownTotals(', '\nconst bubbleSideCache') +
      cut('function calorieRingCard(', '\n/* OVER IS A STATE') +
      cut('function macroRow(', '\n/* ONE ROUNDING') +
      cut('function mealBlock(', '\n\n/* ================= meal defaults') +
      '\nreturn { shownTotals, calorieRingCard, mealBlock };', {
        esc: s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
        emptyMealLine: () => 'No meal yet', ICONS: { check: () => '' },
      });
    for (const values of [[], [340.4, 340.4, 341.7], [2100]]) {
      const entries = values.map((kcal, i) => meal(today, `fraction${i}`, kcal));
      const tot = render.shownTotals(entries), expected = values.reduce((s, n) => s + Math.round(n), 0);
      const row = render.mealBlock('Breakfast', 0, entries, [], 2000);
      const ring = render.calorieRingCard({ tot, t: targets, over: tot.kcal > 2000,
        remaining: 2000 - tot.kcal, protHit: false, startBig: tot.kcal });
      assert.equal(tot.kcal, expected);
      assert(row.includes(`${expected.toLocaleString()} / 2,000`));
      assert(ring.includes(`<b>${expected.toLocaleString()}</b>`));
      assert(ring.includes(expected > 2000 ? '100 over' : `${(2000 - expected).toLocaleString()} left`));
      assert(row.includes('data-addmeal="0"'));
    }
  });
  await test('CONTROL actual hero handlers open Backpack, Stable and Pit without button bubbling', async () => {
    const events = {}, destinations = [];
    const $ = selector => ({ addEventListener: (event, fn) => { events[selector + ':' + event] = fn; } });
    await run(cut("  $('#bhStage').addEventListener('click'", '  /* R38-24: "Quest progress"'), {
      $, openCharacter: tab => destinations.push(tab), openStable: () => destinations.push('stable'), openPit: () => destinations.push('pit'),
    });
    events['#bhStage:click']({ target: { closest: () => null } });
    events['#bhStage:click']({ target: { closest: () => ({}) } });
    events['#charBtn:click'](); events['#stableBtn:click'](); events['#pitBtn:click']();
    assert.deepEqual(destinations, ['crates', 'crates', 'stable', 'pit']);
  });
  await test('CONTROL daily row handlers persist water, bed and sleep; repeat taps pay once', async () => {
    await fresh();
    const events = {}, messages = [];
    const node = key => ({ dataset: { sleep: key }, addEventListener: (event, fn) => { events[key] = fn; } });
    await run(cut("  $('#wWater')?.addEventListener", '  // dev hook: ?automap=1'), {
      $: selector => node(selector), $$: selector => selector === '[data-sleep]' ? [node('6'), node('8')] : [],
      S: { sounds: false }, questTiers: [], toast: m => messages.push(m), refresh: () => {},
      dropSound: () => {}, chimeSound: () => {}, confettiBurst: () => {}, innerWidth: 400, innerHeight: 800,
    });
    for (let i = 0; i < 9; i++) await events['#wWater']();
    await events['#wBed'](); await events['#wBed']();
    await events['6'](); await events['8']();
    const w = await wellness.getWellness();
    assert.equal(w.water, 8); assert.equal(w.bed, true); assert.equal(w.sleepHours, 8);
    assert.equal((await db.get('health', today)).sleepMin, 480);
    assert.equal((await db.all('xp')).filter(r => r.type === 'wellness').length, 3);
    assert(messages.some(m => m.includes('Hydrated! +8 XP')));
    assert(messages.includes('Already made today.'));
    const html = await run(cut('function wellnessCardHtml(', '\n// Sleep logs HOURS') + '\nreturn wellnessCardHtml(w);', {
      w, pixCur: () => '', ICONS: { check: () => '', water: () => '', bed: () => '' },
      sleepRowHtml: () => '', walkRowHtml: () => '',
    });
    assert(html.includes('8 cups down. Hydrated.'));
    assert(!html.includes('id="wWater"'));
    assert(!html.includes('id="wBed"'));
    now += 24 * 60 * 60 * 1000;
    try { assert.deepEqual(await wellness.getWellness(), { date: nutrition.dateKey(), water: 0, bed: false, sleep: false, sleepHours: null }); }
    finally { now -= 24 * 60 * 60 * 1000; }
  });
} finally { globalThis.Date = RealDate; }
console.log(`TODAY PLAYTEST: ${passed} passed, ${failed} failed (Node only)`);
process.exitCode = failed ? 1 : 0;
