// L4: execute production handlers and renderers under Node with bounded DOM/storage
// adapters. This proves data and generated text/SVG, not browser layout or AT speech.
// An optional checkout path supports throwaway-copy prove-red runs.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const app = readFileSync(resolve(root, 'js/app.js'), 'utf8');
const nutrition = await import(pathToFileURL(resolve(root, 'js/nutrition.js')));
const { searchLocalFoods } = await import(pathToFileURL(resolve(root, 'js/sources.js')));
const noop = () => {};
function span(start, end, from = 0) {
  const a = app.indexOf(start, from), b = app.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `SETUP source region missing: ${start}`);
  return app.slice(a, b);
}
function fn(name) {
  const m = app.match(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(m, `SETUP function missing: ${name}`);
  const end = app.indexOf('\n}', m.index);
  assert.ok(end > m.index);
  return app.slice(m.index, end + 2);
}
function node() {
  return { innerHTML: '', textContent: '', value: '', dataset: {}, isConnected: true,
    handlers: {}, focus: noop, classList: { toggle: noop },
    addEventListener(type, cb) { this.handlers[type] = cb; }, querySelectorAll: () => [] };
}
function env(extra = {}) {
  const elements = new Map();
  const get = key => { if (!elements.has(key)) elements.set(key, node()); return elements.get(key); };
  const context = vm.createContext({ ...nutrition, console, Set, Map, Intl,
    dateKey: () => '2026-09-07', S: { date: '2026-09-07', userFoods: [], settings: { targets: { kcal: 2000, p: 100, c: 200, f: 60 }, units: 'kg' } },
    $: get, $$: () => [], esc: s => String(s ?? ''), ICONS: { search: '', close: noop, flame: noop },
    db: { all: async () => [] }, foodRowHtml: f => `<button data-food="${f.id}">${f.name}</button>`,
    GENERIC_FOODS: [], allSearchableFoods: () => [],
    openFoodForm: noop, findFood: noop, openPortion: noop, mealDefault: async () => 0,
    ...extra });
  return { context, get, run: s => vm.runInContext(s, context) };
}
let passed = 0, failed = 0;
async function test(name, body) {
  try { const detail = await body(); passed++; console.log(`ok ${name}: ${detail || 'passed'}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
const numericSource = span('const NUM_SHAPE', '/* READ A FIELD') + fn('readNum') +
  span('const MIN_AGE', '// Online/last-seen') + fn('quickAddEntry') + fn('openQuickAdd');
async function quickAdd(raw, locale) {
  const saved = [], toasts = [];
  const E = env({ Intl: { NumberFormat: class extends Intl.NumberFormat {
    constructor() { super(locale); }
  } }, openSheet: () => node(), t1Sect: () => '', newId: () => 'log-1',
    toast: text => toasts.push(text), commitLogEntry: async row => { saved.push(row); return { xp: 10 }; },
    queueCelebration: noop, closeAllSheetsViaHistory: noop, refresh: noop, setTimeout: noop,
    fmtG: nutrition.fmtG });
  E.run(numericSource);
  E.run('openQuickAdd(() => 0)');
  E.get('#qaKcal').value = raw;
  await E.get('#qaAdd').handlers.click({ currentTarget: { isConnected: false } });
  return { saved, toast: toasts.at(-1), E };
}
await test('CONTROL ordinary quick add reaches the save boundary and exact toast', async () => {
  const r = await quickAdd('125', 'en-US');
  assert.equal(r.saved.length, 1); assert.equal(r.saved[0].kcal, 125);
  assert.equal(r.toast, 'Added · 125 kcal · +10 XP');
  return r.toast;
});
await test('R52-8 German output survives quick add without a 1000x loss', async () => {
  const text = (1234).toLocaleString('de-DE'); assert.equal(text, '1.234');
  const r = await quickAdd(text, 'de-DE');
  assert.equal(r.toast, 'Added · 1234 kcal · +10 XP', `actual toast: ${r.toast}; saved kcal: ${r.saved[0]?.kcal}`);
  assert.equal(r.saved.length, 1); assert.equal(r.saved[0].kcal, 1234);
  return `${text} -> ${r.saved[0].kcal}; ${r.toast}`;
});
await test('CONTROL locale decimals, grouping, malformed input and numeric values', async () => {
  for (const locale of ['de-DE', 'en-US']) {
    const { E } = await quickAdd('125', locale);
    const parse = v => { E.context.raw = v; return E.run('numParse(raw)'); };
    for (const raw of ['1,5', '1.5', '.5', '0', '1234', 1.234]) {
      const expected = typeof raw === 'number' ? raw : Number(raw.replace(',', '.'));
      assert.equal(parse(raw).value, expected, `${locale} ${raw}`);
    }
    for (const raw of ['1e9', '12abc', '1.23.4', '1.234.56', 'NaN', 'Infinity', '']) assert.ok(!parse(raw).ok, `${locale} accepted ${raw}`);
    assert.equal(parse('1.234').value, locale === 'de-DE' ? 1234 : 1.234);
    assert.equal(parse('1,234').value, locale === 'de-DE' ? 1.234 : 1234);
    if (locale === 'de-DE') for (const [raw, value] of [['1.234,5', 1234.5], ['12.345.678', 12345678], ['-1.234', -1234]]) assert.equal(parse(raw).value, value);
  }
  const refused = await quickAdd('1.23.4', 'de-DE');
  assert.equal(refused.saved.length, 0); assert.match(refused.toast, /digits only/);
});
const foodSetup = span('const byLastUsedThenName', 'async function renderFoods') + fn('resultsCountText') + fn('localFoodSearch') + fn('renderFoods');
await test('Recently scanned 12 of 148', async () => {
  const E = env();
  E.context.S.userFoods = Array.from({ length: 148 }, (_, i) => ({ id: 'f' + i, name: 'Food ' + i, source: 'off', lastUsedAt: i }));
  E.run(foodSetup); const screen = node(); E.context.screen = screen;
  await E.run('renderFoods(screen)');
  const list = E.get('#fList').innerHTML, shown = (list.match(/data-food=/g) || []).length;
  assert.equal(shown, 12);
  assert.match(screen.innerHTML, /148 scanned/, `12 of 148; header: ${screen.innerHTML.split('</h1>')[0]}`);
  assert.match(list, /12 of 148/); assert.match(list, /Search finds the rest/);
  E.context.S.userFoods = []; await E.run('renderFoods(screen)');
  assert.match(screen.innerHTML, /none scanned yet/);
  return '12 of 148 rows; 148 scanned; limit disclosed';
});
await test('Search 25 of 52 announced and 40 of 52 visible', async () => {
  const foods = Array.from({ length: 52 }, (_, i) => ({ id: 'm' + i, name: 'L4meal ' + i, source: 'custom' }));
  const E = env({ searchLocalFoods, allSearchableFoods: () => foods });
  E.run(foodSetup); E.context.screen = node(); await E.run('renderFoods(screen)');
  E.get('#fq').value = 'L4meal'; await E.get('#fq').handlers.input({ target: E.get('#fq') });
  assert.equal((E.get('#fList').innerHTML.match(/data-food=/g) || []).length, 40);
  assert.equal(E.get('#fCount').textContent, '52 matches for L4meal. Showing first 40; refine your search to see the rest.', `40 of 52; visible count: ${E.get('#fCount').textContent}`);
  assert.match(E.context.screen.innerHTML, /id="fCount"[^>]*aria-live="polite"/);
  const input = node(), count = node(), results = node(), wrap = node(); let pending;
  Object.assign(E.context, { input, count, results, wrap, resultVersion: 0, searchItems: [],
    stampAddDraft: noop, clearTimeout: noop, setTimeout: cb => { pending = cb; },
    showDefault: noop, localResultsHtml: rows => rows.map(E.context.foodRowHtml).join(''),
    onlineRowHtml: () => '', navigator: { onLine: true }, bindRows: noop });
  E.run(span('  let debounce = 0;', "  input.addEventListener('keydown'", app.indexOf('async function localFoodSearch')));
  input.value = 'L4meal'; input.handlers.input(); await pending();
  assert.equal((results.innerHTML.match(/data-food=/g) || []).length, 25);
  assert.equal(count.textContent, '52 matches for L4meal. Showing first 25; refine your search to see the rest.', `25 of 52; live region: ${count.textContent}`);
  assert.equal(E.get('#visibleResultsCount').textContent, count.textContent);
  assert.match(app, /id="resultsCount"[^>]*aria-live="polite"/);
  return `25 of 52: ${count.textContent}; Foods: 40 of 52`;
});
await test('Weight chart 45 of 63 becomes 63 of 63', async () => {
  const weights = Array.from({ length: 63 }, (_, i) => ({ date: nutrition.addDays('2026-09-07', i - 62), kg: 80 + i / 10 }));
  const E = env({ db: { all: async table => table === 'weights' ? weights : [] },
    totalXp: async () => 0, levelFor: () => ({ level: 1, need: 100, into: 0, pct: 0 }), earnedBadgeIds: async () => new Set(),
    shownTotals: nutrition.dayTotals, calorieRingCard: () => '', activityRecoveryHtml: () => '',
    badgesGridHtml: () => '', barChart: () => '', kcalChart: () => '', proteinChart: () => '',
    loggedAvg: () => null, stepAvgWithToday: () => ({ avg: 0, weight: 0 }), STEP_REF: 10000,
    openWeightSheet: noop, openProgressSheet: noop, wireBarChart: noop, openHealthGuide: noop,
    checkForUpdate: noop, bindBadgeTaps: noop });
  E.run(fn('weightChart') + fn('renderTrends')); const screen = node(); screen.dataset.liveWired = '1'; E.context.screen = screen;
  await E.run('renderTrends(screen)');
  const count = (screen.innerHTML.match(/<circle /g) || []).length;
  assert.match(screen.innerHTML, /63 entries/);
  assert.equal(count, 63, `${count} of 63 points drawn, header says 63 entries`);
  return `${count} of 63 circles in production SVG; 63 entries`;
});
await test('XP receipts 6 of 50', async () => {
  const content = node();
  const E = env({ content, tab: 'progress', earnedBadgeIds: async () => new Set(), xpForDate: async () => Array.from({ length: 50 }, (_, i) => ({ key: 'food-' + i, label: 'Food ' + i, xp: 10 })),
    lvl: { into: 0, need: 100, level: 1 }, xp: 500, BADGES: [], badgesGridHtml: () => '', bindBadgeTaps: noop });
  await E.run('(async () => {' + span("  if (tab === 'progress') {", '  // restore scroll for in-page') + '})()');
  assert.equal((content.innerHTML.match(/class="xp-row"/g) || []).length, 6);
  assert.match(content.innerHTML, /500 XP earned/);
  assert.match(content.innerHTML, /6 of 50 XP receipts/, '6 of 50 receipts rendered without a measured total');
  return '6 of 50 XP receipts; full 500 XP total';
});
await test('Progress month 30 of 90 days, Year includes all 90', async () => {
  const health = Array.from({ length: 90 }, (_, i) => ({ date: nutrition.addDays('2026-09-07', i - 89), steps: 5000 + i }));
  const tabs = ['month', 'year', 'week'].map(r => Object.assign(node(), { dataset: { r } }));
  let html = '';
  const E = env({ db: { all: async () => health }, TREND_METRICS: { steps: { label: 'Steps', pick: h => h.steps, goodLow: false } },
    metricNum: (_, v) => String(v), metricUnit: () => 'steps', metricDetailChart: () => '', metricInsight: () => '',
    wireBarChart: noop, openSheet: text => { html = text; return node(); }, $$: selector => selector === '.rtab' ? tabs : [] });
  E.run(fn('metricValueByDate') + fn('metricSeries') + fn('openMetricDetail'));
  await E.run("openMetricDetail('steps')");
  assert.match(html, /30 of 90 recorded days/, '30 of 90 days shown without a measured history count');
  tabs[1].handlers.click(); assert.match(E.get('.trend-body').innerHTML, /90 of 90 recorded days, as monthly averages/);
  tabs[2].handlers.click(); assert.match(E.get('.trend-body').innerHTML, /7 of 90 recorded days/);
  return 'Month 30 of 90; Year 90 of 90 (monthly averages); Week 7 of 90';
});
console.log(`numbers-honesty: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
