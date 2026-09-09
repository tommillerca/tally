// Frozen Progress playtest: production functions/templates with DOM adapters.
// No browser, sockets or filesystem writes. Optional app path supports prove-red.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import './mem-idb.mjs';
import * as D from '../js/db.js';
import * as G from '../js/game.js';
import * as N from '../js/nutrition.js';

const fault = { armed: false, hits: 0 };
const open = indexedDB.open.bind(indexedDB);
indexedDB.open = (...args) => {
  const request = open(...args);
  let success;
  Object.defineProperty(request, 'onsuccess', {
    set: fn => { success = fn; },
    get: () => event => {
      const connection = request.result, transaction = connection.transaction.bind(connection);
      connection.transaction = (...args) => {
        const tx = transaction(...args), objectStore = tx.objectStore.bind(tx);
        tx.objectStore = name => {
          const store = objectStore(name), add = store.add;
          store.add = row => {
            const result = add(row);
            if (fault.armed && name === 'xp' && row.key === 'badge-first-log') {
              fault.hits++; tx.abort();
            }
            return result;
          };
          return store;
        };
        return tx;
      };
      success(event);
    },
  });
  return request;
};

const app = readFileSync(process.argv[2] || new URL('../js/app.js', import.meta.url), 'utf8');
function cut(start, end) {
  const a = app.indexOf(start), b = app.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `SETUP missing production block ${start}`);
  return app.slice(a, b);
}
function fn(name) {
  const match = app.match(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert(match, `SETUP missing production function ${name}`);
  const end = app.indexOf('\n}', match.index);
  assert(end > match.index);
  return app.slice(match.index, end + 2);
}
const noop = () => {};
function node(dataset = {}) {
  return { dataset, innerHTML: '', textContent: '', handlers: {},
    classList: { toggle: noop, remove: noop }, querySelectorAll: () => [],
    addEventListener(type, handler) { this.handlers[type] = handler; } };
}
let sequence = 0, passed = 0, failed = 0;
async function reset() { D.useDbName(`progress-playtest-${++sequence}`); fault.armed = false; }
function environment() {
  const elements = new Map(), tabs = ['day', 'week', 'month', 'year'].map(r => node({ r }));
  const get = key => { if (!elements.has(key)) elements.set(key, node()); return elements.get(key); };
  const messages = [], sheets = [];
  const ctx = vm.createContext({ ...N, ...G, ...D, console, Date, Set, Map,
    dateKey: () => '2026-09-08',
    S: { settings: { units: 'kg', targets: { kcal: 2000, p: 100, c: 200, f: 60 } } },
    esc: N.esc || (v => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;')),
    ICONS: { up: () => '+', down: () => '-', flame: () => '*' },
    $: get, $$: selector => selector === '.rtab' ? tabs : [],
    openSheet: html => { sheets.push(html); return node(); },
    toast: text => messages.push(text), badgeIconHtml: icon => icon,
    calorieRingCard: () => '', activityRecoveryHtml: () => '',
    openWeightSheet: noop, openProgressSheet: noop, openHealthGuide: noop,
    checkForUpdate: noop, addEventListener: noop,
    document: { addEventListener: noop },
  });
  const run = code => vm.runInContext(code, ctx);
  run(cut('const TREND_METRICS =', '// The Progress-screen "Activity & recovery" block.')
    + fn('wireBarChart') + fn('prettyDay') + fn('sleepScore') + fn('openSleepDetail')
    + fn('badgesGridHtml') + fn('bindBadgeTaps'));
  const replaceChart = () => { elements.delete('.bc'); elements.delete('.bc-readout'); };
  return { ctx, run, get, tabs, sheets, messages, replaceChart };
}
async function detail(key, rows, weights = []) {
  await reset();
  for (const row of rows) await D.db.put('health', row);
  for (const row of weights) await D.db.put('weights', row);
  const e = environment();
  await e.run(`openMetricDetail('${key}')`);
  e.switch = range => {
    // Replacing trend-body in the browser discards the old chart's listeners.
    e.replaceChart();
    e.tabs.find(t => t.dataset.r === range).handlers.click();
    return e.get('.trend-body').innerHTML;
  };
  return e;
}
async function test(name, body) {
  try { const result = await body(); passed++; console.log(`PASS ${name}: ${result || 'verified'}`); }
  catch (error) { failed++; console.log(`FAIL ${name}: ${error.message.split('\n')[0]}`); }
}
const stat = (html, label) => html.match(new RegExp(`<div class="l">${label}</div><div class="v">([^<]+)`))?.[1];

await test('CONTROL badge concurrent evaluation pays once and survives loss of qualifying log', async () => {
  await reset();
  await D.db.put('log', { id: 'meal', date: N.dateKey(), kcal: 100, p: 0 });
  const calls = await Promise.all([G.evaluateBadges(), G.evaluateBadges()]);
  assert.equal(calls.flat().filter(b => b.id === 'first-log').length, 1);
  assert.equal(await G.totalXp(), 25);
  await D.db.del('log', 'meal');
  assert.equal((await G.evaluateBadges()).length, 0);
  assert((await G.earnedBadgeIds()).has('first-log'));
  assert.equal(await G.totalXp(), 25);
  return 'one First bite announcement, 25 XP retained';
});
await test('CONTROL aborted badge write can retry without losing or doubling XP', async () => {
  await reset();
  await D.db.put('log', { id: 'meal', date: N.dateKey(), kcal: 100, p: 0 });
  const before = fault.hits; fault.armed = true;
  await assert.rejects(G.evaluateBadges());
  assert.equal(fault.hits, before + 1);
  assert.equal(await D.db.get('xp', 'badge-first-log'), undefined);
  assert.equal(await G.totalXp(), 0);
  fault.armed = false;
  assert.equal((await G.evaluateBadges()).filter(b => b.id === 'first-log').length, 1);
  assert.equal(await G.totalXp(), 25);
  assert.equal((await G.evaluateBadges()).length, 0);
  return 'abort 0 XP; retry 25 XP; repeat 0 new badges';
});
await test('CONTROL Progress receipts count all earned XP while disclosing the six-row preview', async () => {
  await reset();
  for (let i = 0; i < 9; i++) await D.db.put('xp', {
    key: `receipt-${i}`, type: 'log', xp: 10, label: `Food ${i}`, date: '2026-09-08', ts: i,
  });
  const e = environment();
  e.ctx.content = node(); e.ctx.tab = 'progress';
  e.ctx.xp = await G.totalXp(); e.ctx.lvl = G.levelFor(e.ctx.xp);
  await e.run('(async () => {' + cut("  if (tab === 'progress') {", '  // restore scroll for in-page re-renders') + '})()');
  const html = e.ctx.content.innerHTML;
  assert(html.includes('Today · 90 XP earned'));
  assert(html.includes('90 XP total'));
  assert(html.includes('Showing 6 of 9 XP receipts for today'));
  assert.equal((html.match(/class="xp-row"/g) || []).length, 6);
  assert.equal((html.match(/data-badge=/g) || []).length, G.BADGES.length);
  return '90 XP total; six of nine receipts disclosed; all 29 badge tiles rendered';
});
await test('P1 cumulative history chart and summary share the completed-day average', async () => {
  for (const [key, value] of [['steps', 10000], ['activeKcal', 500], ['exerciseMin', 60]]) {
    const rows = Array.from({ length: 7 }, (_, i) => ({ date: N.addDays('2026-09-08', i - 6), [key]: i === 6 ? value / 100 : value }));
    const e = await detail(key, rows), html = e.switch('week');
    assert.equal(stat(html, 'Average').trim(), value.toLocaleString());
    const baseline = html.match(/>avg ([^<]+)/)?.[1];
    assert.equal(baseline, value.toLocaleString(), `${key}: chart avg ${baseline}, summary ${stat(html, 'Average')}`);
    assert(html.includes('Holding steady'), `${key}: partial today creates a false decline`);
    assert(html.includes(`data-val="${value / 100}"`), 'today must remain explorable');
  }
  return 'steps 10,000; active energy 500; move minutes 60; steady insights';
});
await test('CONTROL range switches rewire actual chart click and no-data readouts', async () => {
  const e = await detail('steps', [{ date: '2026-09-07', steps: 10000 }, { date: '2026-09-08', steps: 100 }]);
  for (const range of ['day', 'week', 'month', 'year']) {
    const html = e.switch(range);
    const hit = html.match(/class="bc-hit" data-i="([^"]+)" data-date="([^"]*)" data-label="([^"]*)" data-val="([^"]+)"/);
    assert(hit, `no populated hit target in ${range}`);
    const target = { dataset: { i: hit[1], date: hit[2], label: hit[3], val: hit[4] } };
    e.get('.bc').handlers.click({ target: { closest: () => target } });
    assert(e.get('.bc-readout').textContent.includes(Number(hit[4]).toLocaleString()));
    target.dataset.val = '';
    e.get('.bc').handlers.click({ target: { closest: () => target } });
    assert(e.get('.bc-readout').textContent.includes('nothing recorded'));
  }
  const empty = await detail('steps', []);
  assert(empty.sheets[0].includes('No readings in this window yet'));
  return 'Day/Week/Month/Year clicks and empty history reached';
});
await test('P1 partial today cannot invent a declining activity insight', async () => {
  const e = await detail('steps', Array.from({ length: 7 }, (_, i) => ({
    date: N.addDays('2026-09-08', i - 6), steps: i === 6 ? 100 : 10000,
  })));
  const html = e.switch('week');
  const insight = html.match(/<div class="trend-insight[^>]*>(.*?)<\/div>/)?.[1] || '';
  assert(html.includes('Holding steady'), `observed insight: ${insight}`);
  return 'Holding steady across this window';
});
await test('CONTROL genuine changes, noncumulative readings and today-only samples remain visible', async () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ date: N.addDays('2026-09-08', i - 6), steps: i < 3 ? 10000 : 5000 }));
  const changed = await detail('steps', rows);
  assert(changed.switch('week').includes('Down about <b>50%</b>'));
  const heart = await detail('restingHr', [{ date: '2026-09-07', restingHr: 60 }, { date: '2026-09-08', restingHr: 80 }]);
  assert.equal(stat(heart.switch('week'), 'Average')?.trim(), '70');
  const today = await detail('steps', [{ date: '2026-09-08', steps: 100 }]);
  const html = today.switch('week');
  assert(html.includes('data-val="100"'));
  assert(!/NaN|Infinity/.test(html));
  return 'real decline 50%; heart average 70; today-only bar 100';
});
await test('P2 Year weight Latest is the latest weigh-in, not its monthly mean', async () => {
  const e = await detail('weight', [], [{ date: '2026-09-01', kg: 70 }, { date: '2026-09-08', kg: 90 }]);
  const html = e.switch('year');
  assert(html.includes('data-val="80"'), 'CONTROL monthly chart must still average both readings');
  assert.equal(stat(html, 'Latest')?.trim(), '90.0', `Latest ${stat(html, 'Latest')}; latest saved weight 90.0`);
  return 'monthly bar 80.0 kg; Latest 90.0 kg';
});
await test('P3 short sleep does not present a null score as a number', async () => {
  await reset();
  await D.db.put('health', { date: '2026-09-08', sleepMin: 35, sleepHours: 35 / 60, sleepAuto: true });
  const e = environment();
  assert.equal(e.run('sleepScore({sleepMin:35})'), null);
  e.run(cut('const READY_MIN_DAYS =', '// Last night\'s sleep, broken into stages'));
  e.ctx.days = Array.from({ length: 8 }, (_, i) => ({ date: N.addDays('2026-09-08', i - 7), restingHr: 60,
    ...(i === 7 ? { sleepMin: 35, sleepHours: 35 / 60 } : {}) }));
  assert(e.run('readinessHtml(readinessScore(days))').includes('data-sleepdetail="1"'), 'CONTROL short sleep is reachable through the readiness tile');
  await e.run('openSleepDetail()');
  const html = e.sheets[0];
  assert(html.includes('0h 35m asleep'), 'CONTROL actual recorded duration must remain');
  assert(!html.includes('null<small>/100'), 'observed null/100 for 35 minutes');
  assert(html.includes('Not enough sleep recorded to score'), 'missing explanation for unavailable score');
  return '35 minutes retained; unavailable score explained';
});
await test('CONTROL full sleep still shows the computed score and secret badge taps stay masked', async () => {
  await reset();
  await D.db.put('health', { date: '2026-09-08', sleepMin: 480, sleepHours: 8 });
  const e = environment(); await e.run('openSleepDetail()');
  assert(e.sheets[0].includes('95<small>/100'));
  const badge = node({ badge: 'secret-tumtum' });
  e.ctx.$$ = () => [badge];
  e.run('bindBadgeTaps({})'); await badge.handlers.click();
  assert(e.messages[0].includes('Some things are only found'));
  await D.db.put('xp', { key: 'badge-secret-tumtum', type: 'badge', xp: 25, date: N.dateKey() });
  await badge.handlers.click();
  assert(e.messages[1].includes('Wabaloo Whisperer'));
  return '95/100; secret masked before earning, description reachable after';
});
await test('P4 sleep chart with older readings keeps its exploration hint', async () => {
  await reset();
  await D.db.put('health', { date: '2026-08-29', sleepMin: 480, sleepHours: 8 });
  const e = environment();
  e.run('const STEP_REF = 10000;'
    + cut('const DAY_STEP_CURVE =', 'async function renderTrends(')
    + fn('shownTotals') + fn('renderTrends') + fn('barChart') + fn('weightChart') + fn('kcalChart') + fn('proteinChart'));
  e.ctx.screen = node(); await e.run('renderTrends(screen)');
  const html = e.ctx.screen.innerHTML.split('SLEEP · LAST 14 DAYS')[1].split('WEIGHT')[0];
  assert(html.includes('data-val="8"'), 'CONTROL the older sleep bar must exist');
  assert(html.includes('Tap any bar for that night'), 'older bar exists but its exploration hint is blank');
  assert(!html.includes('to start your sleep trend'), 'existing history presented as unstarted');
  assert(html.includes('·<span class="d"'), 'older readings must not enter the 7-day sleep average');
  return '10-day-old sleep bar retains tap hint; 7-day average remains empty';
});

console.log(`Progress playtest: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
