// Egg-only manual walk rewards. Default mode drives this tree in a browser.
// --simulate runs the real reward function with an in-memory transaction adapter.
// --main also loads frozen main 72026f4b source read-only. Neither mode claims browser proof.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import * as game from '../js/game.js';
import * as loot from '../js/loot.js';
import * as nutrition from '../js/nutrition.js';
import * as database from '../js/db.js';
import { VIGOR_CAP } from '../js/energy.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const simulation = process.argv.includes('--simulate');
const main = process.argv.includes('--main');
if (main && !simulation) throw new Error('--main requires --simulate; browser red must serve a separate main tree');
const baseline = '72026f4bcfaf361204800b50a1dcf1f4af54e21e';
const source = file => main ? execFileSync('git', ['show', `${baseline}:${file}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }) : readFileSync(path.join(ROOT, file), 'utf8');
const app = source('js/app.js');
const extract = (s, name) => {
  const start = s.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  return s.slice(start, s.indexOf('\n}', start) + 2);
};
let failures = 0;
const ok = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail)}`);
  if (!pass) failures++;
};

// Shared driver, executed in Node or inside the browser with the real modules.
async function measure(a) {
  const { db, kvSet, logManualWalk, eggProgress, lifetimeStepsSum, dateKey, addDays } = a;
  const today = dateKey();
  const reset = async () => { for (const s of ['health', 'xp', 'inv', 'kv']) await db.clear(s); };
  const state = async () => ({ health: await db.all('health'), xp: await db.all('xp'), inv: await db.all('inv'), energy: await a.kvGet('pitEnergy', {}) });
  const raw = async () => (await db.all('inv')).reduce((n, e) => n + (e.manualWalkCredit || 0), 0);
  await reset();
  await db.put('inv', { id: 'control-egg', kind: 'egg', stepsAtStart: 0, goal: 8000 });
  const before = eggProgress(await db.get('inv', 'control-egg'), await lifetimeStepsSum()).walked;
  const accepted = [await logManualWalk(30, today, 1), await logManualWalk(30, today, 2)];
  const control = await state();
  const after = eggProgress(await db.get('inv', 'control-egg'), await lifetimeStepsSum()).walked;
  const cappedBefore = JSON.stringify(control);
  const extra = [await logManualWalk(60, today), await logManualWalk(60, today)];
  const cappedAfter = JSON.stringify(await state());
  const race = await a.weekStepsNow(today);
  const meter = await lifetimeStepsSum();
  const credit = await raw();

  await reset();
  await db.put('health', { date: today, steps: 12000, exerciseMin: 2 });
  const old = { id: 'old', kind: 'egg', stepsAtStart: 10000, goal: 8000, manualWalkCredit: 0 };
  await db.put('inv', old);
  const banked = eggProgress(old, await lifetimeStepsSum()).walked;
  await logManualWalk(15, today, 1);
  const retained = await db.get('inv', 'old');
  const kept = eggProgress(retained, await lifetimeStepsSum()).walked;
  const health = await db.get('health', today);

  await reset();
  await db.put('inv', { id: 'concurrent', kind: 'egg', stepsAtStart: 0, goal: 8000 });
  const concurrent = await Promise.all([logManualWalk(30, today, 1), logManualWalk(30, today, 1)]);
  const replay = await logManualWalk(30, today, 1);
  const concurrentState = await state();
  await logManualWalk(30, today, 2);
  const full = JSON.stringify(await state());
  const backwards = await logManualWalk(60, addDays(today, -1), 1);
  const forwards = await logManualWalk(60, addDays(today, 30), 1);
  const clockUnchanged = full === JSON.stringify(await state());
  // Attempt a different duration against the same receipt as a replay.
  const changedReplay = await logManualWalk(60, today, 1);
  const sharedBefore = (await db.all('xp')).filter(r => r.type === 'egg').length;
  await a.onHealthSync(today, { steps: 0 });
  const sharedAfter = (await db.all('xp')).filter(r => r.type === 'egg').length;
  const sharedInventory = (await db.all('inv')).filter(r => r.kind === 'egg').length;
  await reset();
  await db.put('inv', { id: 'four', kind: 'egg', stepsAtStart: 0, goal: 8000 });
  const four = await Promise.all(Array.from({ length: 4 }, () => logManualWalk(30, today)));
  const fourCredit = await raw();

  const scenarios = [];
  for (const minutes of [15, 30, 60]) {
    await reset();
    await db.put('inv', { id: 'starter', kind: 'egg', stepsAtStart: 0, goal: 8000 });
    let acceptedCount = 0, hatchReady = 0;
    for (let d = 0; d < 60; d++) {
      const date = addDays(today, d);
      // Real elapsed days have a fresh authority witness. No simulated clock farm.
      await kvSet('dayWitnessOrd', nutritionOrdinal(date));
      for (const slot of [1, 2]) if ((await logManualWalk(minutes, date, slot)).ok) acceptedCount++;
      for (const e of (await db.all('inv')).filter(e => e.kind === 'egg')) {
        if (eggProgress(e, await lifetimeStepsSum()).ready) { hatchReady++; await db.del('inv', e.id); }
      }
    }
    const final = await state();
    scenarios.push({ minutes, days: 60, accepted: acceptedCount, dailyEggs: final.xp.filter(r => r.type === 'egg').length,
      hatchReady, unhatched: final.inv.filter(e => e.kind === 'egg').length, raceSteps: final.health.reduce((n, r) => n + (r.steps || 0), 0) });
  }
  return { control, accepted, before, after, credit, extra, capUnchanged: cappedBefore === cappedAfter,
    race, meter, banked, kept, retained, health, concurrent, replay, concurrentState,
    backwards, forwards, clockUnchanged, changedReplay, sharedBefore, sharedAfter, sharedInventory, four, fourCredit, scenarios };
  function nutritionOrdinal(date) { return Math.round(Date.parse(date + 'T00:00:00Z') / 86400000); }
}

function grade(r) {
  ok('CONTROL', r.accepted.every(x => x.ok) && r.control.health.length === 1 && r.control.health[0].manualWalks.length === 2
    && r.control.xp.filter(x => x.type === 'wellness').length === 2, r.control);
  ok('PROGRESS', r.after - r.before === 8000 && r.credit === 15000, { before: r.before, after: r.after, delta: r.after - r.before, rawCredit: r.credit });
  ok('EARN', r.control.inv.filter(e => e.kind === 'egg').length === 2 && r.control.xp.filter(x => x.type === 'egg').length === 1, r.accepted);
  ok('CAP', r.extra.every(x => !x.ok) && r.capUnchanged, r.extra);
  ok('NO-RESET', r.banked === 2500 && r.kept >= r.banked && r.retained.stepsAtStart === 10000 && r.health.steps === 12000 && r.health.exerciseMin === 2,
    { banked: r.banked, kept: r.kept, anchor: r.retained.stepsAtStart });
  ok('RACE', r.race.steps === 0 && r.meter === 0 && r.control.health.every(h => !Object.hasOwn(h, 'steps')), { race: r.race, petMeter: r.meter });
  ok('REPLAY', r.concurrent.filter(x => x.ok).length === 1 && !r.replay.ok && !r.changedReplay.ok
    && r.concurrentState.inv.find(e => e.id === 'concurrent').manualWalkCredit === 7500, { concurrent: r.concurrent, replay: r.replay, changedReplay: r.changedReplay });
  ok('CLOCK', !r.backwards.ok && !r.forwards.ok && r.clockUnchanged, { backwards: r.backwards, forwards: r.forwards });
  ok('SHARED-EGG', r.sharedBefore === 1 && r.sharedAfter === 1 && r.sharedInventory === 2, { before: r.sharedBefore, after: r.sharedAfter, eggs: r.sharedInventory });
  ok('CONCURRENT-CAP', r.four.filter(x => x.ok).length === 2 && r.fourCredit === 15000, { four: r.four, credit: r.fourCredit });
  console.log('MEASUREMENT 60 elapsed days, two walks/day, no Health, one initial unhatched egg; remove ready eggs without simulating pet loot or level rewards.');
  console.log(JSON.stringify(r.scenarios));
}

if (simulation) {
  console.log(`DIRECT SIMULATION ${main ? 'main' : 'working tree'}: real walk/egg functions, memory persistence; no IndexedDB or DOM proof.`);
  let stores = Object.fromEntries(['health', 'xp', 'inv', 'kv'].map(s => [s, new Map()]));
  const key = (s, v) => s === 'health' ? v.date : s === 'xp' ? v.key : s === 'kv' ? v.k : v.id;
  const db = {
    get: async (s, k) => structuredClone(stores[s].get(k)),
    all: async s => structuredClone([...stores[s].values()]),
    put: async (s, v) => stores[s].set(key(s, v), structuredClone(v)),
    del: async (s, k) => stores[s].delete(k), clear: async s => stores[s].clear(),
  };
  const kvGet = async (k, fallback) => (await db.get('kv', k))?.v ?? fallback;
  const kvSet = async (k, v) => db.put('kv', { k, v });
  let queue = Promise.resolve();
  const payAtomic = plan => {
    const run = queue.then(async () => {
      const s = {}, rows = {};
      for (const k of plan.snapshot.keys) s[k] = await kvGet(k);
      for (const k of plan.snapshot.stores) rows[k] = await db.all(k);
      const p = plan.decide(s, rows), next = structuredClone(stores);
      for (const { store, val } of p.puts || []) next[store].set(key(store, val), structuredClone(val));
      for (const [k, fn] of Object.entries(p.kv || {})) {
        const v = fn(next.kv.get(k)?.v);
        if (v !== undefined) next.kv.set(k, { k, v });
      }
      stores = next;
      return structuredClone(p.result);
    });
    queue = run.catch(() => {});
    return run;
  };
  const env = { ...nutrition, ...game, ...loot, ...database, VIGOR_CAP, db, kvGet, kvSet, payAtomic,
    grantLevelRewards: async () => ({}),
    award: async (key, type, xp, label, date) => {
      if (await db.get('xp', key)) return 0;
      await db.put('xp', { key, type, xp, label, date }); return xp;
    },
    addVigor: async n => kvSet('pitEnergy', { vigor: Math.min(VIGOR_CAP, (await kvGet('pitEnergy', {})).vigor + n || n) }),
  };
  env.awardOnce = async (key, type, xp, label, date, extra, pay) => {
    if (await db.get('xp', key)) return { claimed: false, xp: 0 };
    await db.put('xp', { key, type, xp, label, date });
    for (const p of pay?.puts || []) await db.put(p.store, p.val);
    return { claimed: true, xp };
  };
  env.eggRow = async source => ({ id: 'health-egg', kind: 'egg', goal: 8000, stepsAtStart: 0, source });
  env.grantCrate = async () => db.put('inv', await env.eggRow('health'));
  env.evaluateBadges = async () => [];
  const onHealthSync = vm.runInNewContext(`(async ${extract(source('js/game.js'), 'onHealthSync')})`, env);
  const wellness = vm.runInNewContext(source('js/wellness.js').replace(/^import .*;$/gm, '').replace(/^export /gm, '') + '\n({logManualWalk})', env);
  const eggProgress = vm.runInNewContext(`(${extract(source('js/loot.js'), 'eggProgress')})`, { EGG_GOAL_STEPS: loot.EGG_GOAL_STEPS });
  const raceFn = vm.runInNewContext(`(async ${extract(app, 'weekStepsNow')})`, { db, dateKey: nutrition.dateKey,
    raceWeekKey: d => d, raceWeekDates: d => Array.from({ length: 7 }, (_, i) => nutrition.addDays(d, i)) });
  const lifetimeStepsSum = async () => (await db.all('health')).reduce((n, r) => n + (r.steps || 0)
    + Math.min(r.exerciseMin || 0, loot.ACTIVE_MIN_DAILY_CAP) * loot.STEPS_PER_ACTIVE_MIN, 0);
  grade(await measure({ ...wellness, db, kvGet, kvSet, eggProgress, lifetimeStepsSum, ...nutrition, onHealthSync, weekStepsNow: raceFn }));
  const paragraph = app.match(/<p class="note egg-threshold">[^<]+<\/p>/)?.[0];
  const copy = paragraph ? vm.runInNewContext('`' + paragraph + '`', { EGG_STEP_THRESHOLD: game.EGG_STEP_THRESHOLD }) : '';
  ok('TOLD-SOURCE (DOM BLOCKED)', copy.includes(`An egg needs ${game.EGG_STEP_THRESHOLD.toLocaleString('en-US')} steps in a day.`), { copy, threshold: game.EGG_STEP_THRESHOLD });
} else {
  const { boot, serveTree, sleep } = await import('./godmode.js');
  const requested = process.argv[2] || process.env.URL;
  let browser, srv;
  let control = 'browser fixture boot';
  try {
    srv = requested ? null : await serveTree(ROOT);
    const base = requested || srv.url;
    console.log(`URL UNDER TEST: ${base}`);
    const session = await boot(base); browser = session.browser;
    const { page } = session;
    const r = await page.evaluate(async ({ driver, race }) => {
      const d = await import('./js/db.js'), w = await import('./js/wellness.js');
      const l = await import('./js/loot.js'), n = await import('./js/nutrition.js'), g = await import('./js/game.js');
      // A separate fresh save, no Health source and no boot grants.
      d.useDbName('tally-demo-egg-audit');
      const weekStepsNow = new Function('db', 'dateKey', 'raceWeekKey', 'raceWeekDates', `return async ${race}`)(d.db, n.dateKey, x => x,
        date => Array.from({ length: 7 }, (_, i) => n.addDays(date, i)));
      try { return await new Function(`return (${driver})`)()({ ...d, ...w, ...l, ...n, onHealthSync: g.onHealthSync, weekStepsNow }); }
      finally { d.useDbName('tally-demo'); }
    }, { driver: measure.toString(), race: extract(app, 'weekStepsNow') });
    grade(r);
    control = '#chTabs [data-tab="crates"]';
    await page.evaluate(() => { location.hash = '#/bonehead'; });
    await sleep(2000);
    await page.waitForSelector('#chTabs [data-tab="crates"]');
    // In-page activation reaches the real handler inside the nested scroller.
    await page.evaluate(selector => document.querySelector(selector).click(), control);
    control = '.bp-eggs (egg panel after crates control)';
    await page.waitForSelector('.bp-eggs');
    const told = await page.$eval('.bp-eggs', el => {
      const p = el.querySelector('.egg-threshold');
      const text = p?.textContent || '';
      const number = text.match(/^An egg needs ([\d,]+) steps in a day\.$/);
      return { text, number: number ? Number(number[1].replaceAll(',', '')) : null, visible: !!p && p.getBoundingClientRect().height > 0 && getComputedStyle(p).visibility !== 'hidden' };
    });
    const threshold = await page.evaluate(async () => (await import('./js/game.js')).EGG_STEP_THRESHOLD);
    ok('TOLD', told.visible && told.number === threshold && told.text === `An egg needs ${threshold.toLocaleString('en-US')} steps in a day.`, { ...told, threshold });
    control = '#/today manual walk fixture';
    await page.evaluate(async () => {
      const { db, kvGet, kvSet } = await import('./js/db.js');
      await kvSet('settings', { ...(await kvGet('settings', {})), hkConnected: false, hkNative: false });
      await db.clear('health');
      for (const r of await db.all('xp')) if (r.key.startsWith('mwalk-')) await db.del('xp', r.key);
      location.hash = '#/today';
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    for (const slot of [1, 2]) {
      control = `[data-walkmin="30"][data-walkslot="${slot}"]`;
      await page.waitForSelector(control);
      await page.evaluate(selector => document.querySelector(selector).click(), control);
      await page.waitForFunction(async count => {
        const w = await import('./js/wellness.js'); return (await w.manualWalksToday()).length === count;
      }, {}, slot);
    }
    await page.waitForFunction(() => document.querySelectorAll('[data-walkmin]').length === 0);
    ok('UI-WALKS', await page.evaluate(async () => (await (await import('./js/wellness.js')).manualWalksToday()).length === 2), 'Two real controls logged; capped controls removed');
    // Existing UI audit is operated too; failures remain findings, never ignored.
    control = 'uiAudit route controls';
    /* tests/ui-audit.js is an ES MODULE, and page.evaluate() runs a classic
       script, so evaluating its text verbatim throws "Unexpected token
       'export'" and took this whole row out. Strip the export keyword so the
       declarations land as globals, which is what the next evaluate expects.
       Same class as running `node --check` on a .js file that uses export: the
       parser is in the wrong mode, and the error looks like a broken file
       rather than a harness fault. */
    const ui = readFileSync(path.join(ROOT, 'tests/ui-audit.js'), 'utf8')
      .replace(/^export\s+(?=(async\s+)?(function|const|let|var|class)\b)/gm, '')
      .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
    await page.evaluate(ui);
    const uiResult = await page.evaluate(async () => { if (typeof uiAudit !== 'function') throw new Error('uiAudit unavailable'); return await uiAudit(); });
    ok('UI-AUDIT', uiResult.pass && uiResult.checked.controls > 0, uiResult);
  } catch (error) {
    ok('FIXTURE', false, { control, error: error.message });
  } finally { if (browser) await browser.close(); srv?.close(); }
}
console.log(`EGG AUDIT: ${failures} failed`);
process.exitCode = failures ? 1 : 0;
