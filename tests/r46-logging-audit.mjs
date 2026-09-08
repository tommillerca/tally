/* R46: real source functions and Node DOM doubles, no browser or sockets.
 * CONTROL: positive search, persisted nutrition, one local-row pick, and normal
 * no-sheet routing prevent no-op implementations from passing the zero bounds.
 * Prove red: run against HEAD^ in a throwaway tree for round-one defects and
 * HEAD for the bulk-close race. Physical hit testing remains browser work.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root = process.argv[2] || fileURLToPath(new URL('..', import.meta.url));
const app = readFileSync(`${root}/js/app.js`, 'utf8');
const sources = await import(pathToFileURL(`${root}/js/sources.js`));
const { searchFoods, GENERIC_FOODS } = await import(pathToFileURL(`${root}/data/generic-foods.js`));
const nutrition = await import(pathToFileURL(`${root}/js/nutrition.js`));
function fn(name) {
  const start = app.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `missing ${name}`);
  return app.slice(start, app.indexOf('\n}', start) + 2);
}
function load(names, context = {}) {
  const c = vm.createContext(context);
  vm.runInContext(names.map(fn).join('\n'), c);
  return c;
}
function wireRouter(c) {
  const teardown = new Error('router reached teardown');
  const timers = c.routeTimers = [];
  Object.assign(c, {
    _dayRefreshPending: false, updatePending: false, wheelRetryPending: false, saveRecoveryActive: false,
    reducedMotion: true, $: () => null, setTimeout: f => timers.push(f),
    closeAllSheets: () => { c.routes++; c.sheetStack.length = 0; throw teardown; },
  });
  vm.runInContext(fn('route') + '\n' + fn('closeTopSheet'), c);
  const route = c.route;
  c.routes = 0;
  c.route = (...args) => { try { return route(...args); } catch (e) { if (e !== teardown) throw e; } };
}
const failed = [];
let checked = 0;
async function check(name, f) {
  checked++;
  try { await f(); console.log(`PASS ${name}`); }
  catch (e) { failed.push(name); console.log(`FAIL ${name}: ${e.message}`); }
}
const history = [1, 2].map(id => ({ id: String(id), date: '2026-09-06', meal: 2, name: 'Dinner out', kcal: 505, p: 25, c: 60, f: 18, fiber: 5, sodium: 800, portionLabel: '1 dinner' }));
function search(foods, entries, query, limit) {
  // Exercise the old caller's actual matcher when running the reverted tree.
  if (sources.searchLocalFoods) return sources.searchLocalFoods(foods, entries, query, limit);
  const items = searchFoods(foods, query, limit);
  return { items, total: items.length };
}
await check('R46-4 two diary snapshots searchable with saved nutrition', () => {
  const r = search(GENERIC_FOODS, history, 'Dinner out', 25);
  assert.equal(r.items.filter(f => f.name === 'Dinner out').length, 2, 'expected both Dinner out entries');
  for (const f of r.items) {
    assert.deepEqual(nutrition.nutrientsFor(f, { mode: 'serving', idx: 0, qty: 1 }), { kcal: 505, p: 25, c: 60, f: 18, fiber: 5, sugar: 0, sodium: 800 });
  }
});
await check('R46-3 accents folded on both sides without changing display names', () => {
  for (const [name, q] of [['Crème brûlée','creme'], ['Crème brûlée','brulee'], ['Café','Cafe'], ['Cafe','Café']]) {
    const food = { id: 'accent', name, source: 'custom' };
    const r = search([food], [], q, 25);
    assert.equal(r.items.length, 1, `${q} must find ${name}`);
    assert.equal(r.items[0].name, name);
  }
});
await check('R46-2 both limits expose true totals and truncation', () => {
  const c = load(['resultsCountText']);
  for (const limit of [25, 40]) {
    const r = search(Array.from({ length: 93 }, (_, id) => ({id, name: `Rice ${id}`})), [], 'rice', limit);
    assert.equal(r.items.length, limit);
    assert.equal(r.total, 93, `limit ${limit} must retain all 93 matches`);
    assert.match(c.resultsCountText(r.total, 'rice', r.items.length), new RegExp(`93 matches.*Showing first ${limit}`));
  }
});
await check('R46-5 midnight retains both sheets and 505 input, advances date, repaints after close', async () => {
  const sheets = [{ input: 'Dinner out' }, { input: '505' }];
  const S = { settings: { targets: {} }, date: '2026-09-06' };
  let routes = 0;
  const c = load(['rollDayIfNeeded'], { S, sheetStack: sheets, _dayAnchor: S.date, _rolling: false, _dayRefreshPending: false, toast: () => {},
    dateKey: () => '2026-09-07', kvSet: async () => {}, awardDayCloseIfDue: async () => null,
    route: () => { routes++; sheets.length = 0; }, maybeShowDailyWheel: async () => null,
    refreshNotifSchedules: () => {}, setTimeout: () => {},
  });
  wireRouter(c);
  sheets.forEach(r => { r.wrap = { remove() {} }; });
  assert.equal(await c.rollDayIfNeeded(), true);
  assert.equal(c.routes, 0, 'day roll must not route through open sheets');
  assert.equal(sheets.length, 2);
  assert.equal(sheets[1].input, '505');
  assert.equal(S.date, '2026-09-07');
  c.closeTopSheet(); c.closeTopSheet();
  while (c.routeTimers.length) c.routeTimers.shift()();
  assert.equal(await c.rollDayIfNeeded(), false);
  assert.equal(S.date, '2026-09-07');
  assert.equal(c.routes, 1);
});
await check('R46-8 Add budget uses the sum of displayed diary rows', async () => {
  const c = load(['shownTotals', 'dayBudget'], { S: { date: 'day', settings: {targets: {kcal: 2000}} },
    entriesFor: async () => Array.from({length: 5}, () => ({kcal: 100.4, meal: 2})),
    db: { get: async () => null }, activeCalorieBonus: () => 0, dayTotals: nutrition.dayTotals,
  });
  const b = await c.dayBudget();
  assert.equal(b.used, 500);
  assert.equal(b.left, 1500);
});
// A small DOM double operates the real input and row callbacks. It does not
// claim browser hit testing, accessibility announcements or navigation proof.
class Node {
  constructor(id = '') { this.id = id; this.value = ''; this.isConnected = true; this.listeners = {}; this.dataset = {}; this.style = {}; this.children = []; }
  set innerHTML(v) {
    this.html = v; this.children = [];
    for (const m of v.matchAll(/data-food="([^"]+)"/g)) { const n = new Node(); n.dataset.food = m[1]; this.children.push(n); }
    if (v.includes('id="onlineSect"')) { const n = new Node('onlineSect'); this.children.push(n); }
  }
  get innerHTML() { return this.html || ''; }
  addEventListener(k, f) { (this.listeners[k] ||= []).push(f); }
  async fire(k, extra = {}) { for (const f of [...(this.listeners[k] || [])]) await f({currentTarget: this, target: this, preventDefault() {}, ...extra}); }
}
function addHarness({ recent = async () => [], online = async () => [], foods = GENERIC_FOODS } = {}) {
  const ids = new Map(['q','results','resultsCount','visibleResultsCount','actMyFoods','actScan','actLabel','actQuick','addBudget'].map(id => [id, new Node(id)]));
  const wrap = new Node(); const timers = [];
  const rows = (scope, key) => (scope?.children || []).flatMap(n => [...(key in n.dataset ? [n] : []), ...rows(n, key)]);
  const findId = (scope, id) => (scope?.children || []).find(n => n.id === id);
  const $ = (sel, scope) => scope && scope !== wrap ? findId(scope, sel.slice(1)) : ids.get(sel.slice(1));
  const $$ = (sel, scope) => sel === '[data-food]' ? rows(scope, 'food') : [];
  const picks = [];
  const c = load(['resultsCountText','localResultsHtml','openAdd'], {
    $, $$, openSheet: () => wrap, ICONS: new Proxy({}, { get: () => () => '' }), GENERIC_FOODS: foods,
    S: { settings: {}, onlineCache: new Map(), userFoods: [] }, mealChipsHtml: () => '',
    dayBudget: async () => new Promise(() => {}), recentFoods: recent, allSearchableFoods: () => foods,
    foodRowHtml: f => `<button data-food="${f.id}">${f.name}</button>`, recentRowHtml: r => `<button data-food="${r.food.id}">${r.food.name}</button>`,
    t1Sect: name => name, esc: x => x, onlineRowHtml: () => '',
    findFood: id => foods.find(f => f.id === id), openPortion: f => picks.push(f.id),
    searchFoods, localFoodSearch: async (q, limit) => search(foods, [], q, limit), searchOnline: online,
    stampAddDraft: () => {}, window: {addEventListener(){}}, navigator: {onLine: true},
    setTimeout: f => {timers.push(f); return timers.length;}, clearTimeout: () => {},
  });
  c.openAdd();
  return { c, ids, picks, timers, async query(q) {ids.get('q').value = q; await ids.get('q').fire('input'); await timers.pop()();} };
}
await check('R46-6 online results bind each local food exactly once', async () => {
  const h = addHarness();
  await new Promise(resolve => setImmediate(resolve));
  await h.query('apple');
  const row = h.ids.get('results').children.find(n => n.dataset.food);
  assert.ok(row, 'nonempty local result required');
  await h.ids.get('q').fire('keydown', {key: 'Enter'});
  await new Promise(resolve => setImmediate(resolve));
  await row.fire('click');
  assert.equal(h.picks.length, 1, 'one row click must open exactly one portion sheet');
});
await check('R46-6 slow recents cannot replace a newer apple search with Banana', async () => {
  let finish;
  const h = addHarness({recent: () => new Promise(resolve => {finish = resolve;})});
  await h.query('apple');
  const before = h.ids.get('results').innerHTML;
  assert.match(before, /apple/i);
  finish([{food: {id: 'banana', name: 'Banana'}}]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.ids.get('results').innerHTML, before, 'late recents replaced the chosen search');
});
await check('R46-4 selecting history commits a new 505 kcal snapshot without saving a fake food', async () => {
  const food = search(GENERIC_FOODS, history, 'Dinner out', 25).items.find(f => f.name === 'Dinner out');
  assert.ok(food, 'Dinner out must be selectable');
  const entries = [], savedFoods = [];
  const start = app.indexOf("  $('#addBtn', wrap).addEventListener('click', async (ev) => {");
  const end = app.indexOf('\n  });', start);
  const handler = app.slice(start, end + 6);
  let click;
  const btn = { isConnected: false, disabled: false };
  const c = vm.createContext({
    $: () => ({ addEventListener: (_, f) => {click = f;} }), wrap: {},
    food, sel: {mode: 'serving', idx: 0, qty: 1}, editing: false, entry: null, via: null,
    curMeal: 2, amtRaw: null, LIMITS: {servings: {min: 0.25, max: 100}},
    nutrientsFor: nutrition.nutrientsFor, portionLabel: nutrition.portionLabel,
    S: {date: '2026-09-07'}, newId: () => 'new-entry',
    commitLogEntry: async e => {entries.push(e); return {xp: 10};},
    persistFoodUse: async f => {savedFoods.push(f);},
    trackEvent() {}, toast() {}, queueCelebration() {}, clearAddDraft() {}, closeAllSheetsViaHistory() {},
    setTimeout() {}, refresh() {},
  });
  vm.runInContext(handler, c);
  await click({currentTarget: btn});
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, 'new-entry');
  assert.equal(entries[0].date, '2026-09-07');
  assert.equal(entries[0].kcal, 505);
  assert.equal(entries[0].fiber, 5);
  assert.equal(entries[0].sodium, 800);
  assert.equal(entries[0].foodId, null);
  assert.equal(savedFoods.length, 0);
  assert.equal(history[0].id, '1');
});
await check('R46-4 a history portion draft resolves its original log after reload', async () => {
  const opened = [];
  const c = load(['restoreAddDraft'], {
    kvGet: async () => ({sheet: 'portion', q: 'Dinner out', foodId: 'history-1', historyEntryId: '1', sel: {mode: 'serving', idx: 0, qty: 2}}),
    addDraftUsable: () => true, currentTab: () => 'today', sheetStack: [], mealDefault: async () => 2,
    openAdd() {}, db: {get: async () => history[0]}, foodFromLog: sources.foodFromLog,
    findFood: () => null, openPortion: (f, opts) => opened.push({f, opts}),
  });
  await c.restoreAddDraft();
  assert.equal(opened.length, 1, 'history portion draft was not restored');
  assert.equal(opened[0].f.name, 'Dinner out');
  assert.equal(nutrition.nutrientsFor(opened[0].f, opened[0].opts.sel).kcal, 1010);
});
await check('R46-5 real midnight commit retains sheets and writes a fresh row to today', async () => {
  const sheets = [{input: 'Dinner out'}, {input: '505'}];
  const store = new Map();
  const S = {date: '2026-09-06', settings: {targets: {}}};
  const c = load(['rollDayIfNeeded', 'commitLogEntry'], {
    S, sheetStack: sheets, _dayAnchor: S.date, _rolling: false, _dayRefreshPending: false,
    dateKey: () => '2026-09-07', kvSet: async () => {}, awardDayCloseIfDue: async () => null,
    route: () => {sheets.length = 0;}, maybeShowDailyWheel: async () => null,
    refreshNotifSchedules() {}, setTimeout() {}, toast() {}, recordMealUsed: async () => {},
    onFoodLogged: async () => ({xp: 10}), entriesFor: async () => [], trackEvent() {},
    db: {put: async (_, e) => store.set(e.id, {...e}), get: async (_, id) => store.get(id)},
  });
  wireRouter(c);
  await c.commitLogEntry({id: 'fresh', date: S.date, kcal: 505, meal: 2}, null);
  assert.equal(store.get('fresh').date, '2026-09-07');
  assert.equal(store.get('fresh').kcal, 505);
  assert.equal(sheets.length, 2, 'roll inside commit destroyed sheets before write completed');
  store.set('old', {id: 'old', date: '2026-09-06', kcal: 300});
  await c.commitLogEntry({...store.get('old'), kcal: 350}, null);
  assert.equal(store.get('old').date, '2026-09-06');
});
// Model the documented single popstate for a multi-entry traversal. Run the
// shipped close functions and relog callback, with Banana underneath Add.
function historyHarness(reducedMotion) {
  const timers = [], traversals = [], saved = [];
  let index = 3; // about:blank, app, Add, portion
  const mk = () => ({ isConnected: true, style: {}, remove() { this.isConnected = false; } });
  const lower = { wrap: mk() }, upper = { wrap: mk(), restoreFocus() { lower.wrap.inert = false; } };
  lower.wrap.inert = true;
  const sheetStack = [lower, upper];
  const c = load(['closeTopSheet', 'closeAllSheets', 'closeAllSheetsViaHistory'], {
    sheetStack, reducedMotion, updatePending: false, wheelRetryPending: false,
    $: () => ({classList: {add() {}}, addEventListener() {}}),
    setTimeout: f => timers.push(f),
    history: {
      go(n) { traversals.push(n); timers.unshift(() => { index += n; c.pop(); }); },
      back() { this.go(-1); },
    },
    window: {addEventListener: (_, f) => { c.pop = f; }},
  });
  const pop = app.match(/^window.addEventListener\('popstate', .*$/m);
  assert.ok(pop, 'SETUP shipped popstate callback exists');
  vm.runInContext(pop[0], c);
  const start = app.indexOf("b.addEventListener('click', async (ev) => {", app.indexOf("if (scope === results) $$('[data-relog]'"));
  // HEAD^ used the same callback without the scope qualifier.
  const fallback = app.indexOf("b.addEventListener('click', async (ev) => {", app.indexOf("$$('[data-relog]', results)"));
  const from = start >= 0 ? start : fallback;
  assert.ok(from >= 0, 'SETUP real relog callback exists');
  const end = app.indexOf('\n    }));', from);
  Object.assign(c, {
    b: {dataset: {relog: 'banana'}, addEventListener: (_, f) => { c.relog = f; }},
    db: {all: async () => [{id: 'banana', name: 'Banana', kcal: 105}]},
    S: {date: '2026-09-07'}, curMeal: 2, newId: () => 'unintended',
    commitLogEntry: async e => {saved.push(e); return {xp: 10};},
    toast() {}, queueCelebration() {}, clearAddDraft() {}, refresh() {},
    confettiBurst() {}, popSound() {}, innerWidth: 393,
  });
  vm.runInContext(app.slice(from, end) + '\n    });', c);
  return {c, lower, timers, traversals, saved, index: () => index,
    async tapExposedRecent() {
      if (lower.wrap.isConnected && !lower.wrap.inert && lower.wrap.style.pointerEvents !== 'none') {
        await c.relog({currentTarget: c.b});
      }
    },
  };
}
await check('R46-6 CONTROL exposed recent really logs Banana 105 and traverses Back', async () => {
  const h = historyHarness(true);
  h.lower.wrap.inert = false;
  await h.tapExposedRecent();
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].name, 'Banana');
  assert.equal(h.saved[0].kcal, 105);
  assert.deepEqual(h.traversals, [-1]);
});
await check('R46-6 bulk close cannot expose Banana or traverse back to about:blank', async () => {
  for (const reduced of [true, false]) {
    const h = historyHarness(reduced);
    h.c.closeAllSheetsViaHistory();
    h.timers.shift()(); // the one popstate, before the delayed refresh
    await h.tapExposedRecent();
    while (h.timers.length) h.timers.shift()();
    assert.equal(h.saved.length, 0, `bulk close exposed Banana at 105 kcal (reduced motion ${reduced}, history index ${h.index()})`);
    assert.equal(h.index(), 1, 'bulk close left the app for about:blank');
    assert.equal(h.c.sheetStack.length, 0, 'DOM sheets outlived their history entries');
  }
});
await check('R46-6 repeated bulk close consumes each owned history entry once', () => {
  const h = historyHarness(true);
  h.c.closeAllSheetsViaHistory(); h.c.closeAllSheetsViaHistory();
  assert.deepEqual(h.traversals, [-2], 'repeated completion scheduled a second history traversal');
});
console.log(`${checked - failed.length}/${checked} guards passed`);
process.exitCode = failed.length ? 1 : 0;
