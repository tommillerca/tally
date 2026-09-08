/* R46-7 to R46-12: execute shipped render functions and control callbacks in
 * Node, with storage/DOM doubles. No browser, sockets, layout or pixel claim.
 * CONTROL fixtures include nonempty meals, today's speech and navigable dates.
 * An optional checkout argument supports reverting the actual source in a
 * throwaway copy. R46-8 already ships here; revert dayBudget's shownTotals call
 * to dayTotals to reproduce its original arithmetic defect.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
const root = process.argv[2] || fileURLToPath(new URL('..', import.meta.url));
const app = readFileSync(`${root}/js/app.js`, 'utf8');
const nutrition = await import(pathToFileURL(`${root}/js/nutrition.js`));
const { streakDateSet } = await import(pathToFileURL(`${root}/js/game.js`));
const today = '2026-09-07';
const dateKey = d => d ? nutrition.dateKey(d) : today;
function fn(name) {
  const start = app.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `SETUP missing ${name}`);
  const end = app.indexOf('\n}', start);
  assert.ok(end > start, `SETUP unterminated ${name}`);
  return app.slice(start, end + 2);
}
function between(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `SETUP missing source span ${start}`);
  return text.slice(a, b);
}
function load(names, extra = {}) {
  const c = vm.createContext({ ...nutrition, dateKey, esc: String,
    S: {date: today, speechSalt: 0, settings: {targets: {kcal: 2540, p: 100, c: 200, f: 80}}}, ...extra });
  vm.runInContext(names.map(fn).join('\n'), c);
  return c;
}
let failed = 0, checked = 0;
async function check(name, f) {
  checked++;
  try { await f(); console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
function mealContext() {
  const c = load(['shownTotals','mealBlock','emptyMealLine','signOffLine']);
  vm.runInContext(between(app, 'const EMPTY_MEAL_LINES =', '\nfunction emptyMealLine'), c);
  return c;
}
const mk = (id, date, kcal, meal = 0) => ({id, date, kcal, meal, name: id, p: 10, c: 20, f: 5, ts: 1});
async function trends(log, health = []) {
  const c = load(['shownTotals','loggedAvg'], {
    streakDateSet,
    db: {all: async store => store === 'log' ? log : store === 'health' ? health : []},
    totalXp: async () => 0, levelFor: () => ({level: 1, name: 'Bones', need: 100, into: 0, pct: 0}),
    earnedBadgeIds: async () => [], stepAvgWithToday: () => ({avg: 0, partial: false}),
    typicalStepShare: () => 1, STEP_REF: 8000,
    calorieRingCard: () => '', activityRecoveryHtml: () => '', barChart: () => '',
    kcalChart: () => '', proteinChart: () => '', badgesGridHtml: () => '',
    ICONS: {flame: () => ''},
  });
  // Run every calculation and the actual HTML assignment, stopping only before
  // unrelated chart/weight listeners. Assert the rendered recap and averages.
  vm.runInContext(between(fn('renderTrends'), 'async function renderTrends', "  $('#logWeight')") + '\n}', c);
  const el = {};
  await c.renderTrends(el);
  return el.innerHTML;
}
await check('R46-7 zero-calorie row counts: 6/7 logged, streak 9; deletion gives 5/7 and 5', async () => {
  const log = Array.from({length: 9}, (_, i) => mk(`row-${i}`, nutrition.addDays(today, -i - 1), i === 5 ? 0 : 100));
  const before = await trends(log);
  assert.match(before, /6<small>\/7<\/small>/, 'zero-calorie day omitted from rendered 6/7 recap');
  assert.match(before, /9<small><\/small>/, 'streak must include the same zero-calorie row');
  assert.match(before, /89<\/span><span class="d">avg kcal/, 'average must include zero-calorie logged days');
  const after = await trends(log.filter(e => e.kcal));
  assert.match(after, /5<small>\/7<\/small>/);
  assert.match(after, /5<small><\/small>/);
  const empty = await trends([]);
  assert.match(empty, /0<small>\/7<\/small>/);
  assert.match(empty, /·<\/span><span class="d">avg kcal/);
  // Tom's row rule: walking alone is not food logging or a paying streak day.
  const walked = await trends([], [{date: today, steps: 3000}]);
  assert.match(walked, /0<small>\/7<\/small>/);
  assert.match(walked, /0<small><\/small>/);
});
await check('R46-8 Add and Today both show 1668 left after 872 displayed kcal', async () => {
  const entries = [174.6, 174.6, 174.6, 174.6, 171.6].map((kcal, i) => mk(`budget-${i}`, today, kcal));
  const c = load(['dayBudget','shownTotals','calorieRingCard','macroRow'], {
    entriesFor: async () => entries, db: {get: async () => null}, activeCalorieBonus: () => 0,
    ICONS: {check: () => ''},
  });
  const b = await c.dayBudget();
  const tot = c.shownTotals(entries);
  const ring = c.calorieRingCard({tot, t: c.S.settings.targets, remaining: 2540 - tot.kcal, startBig: tot.kcal});
  assert.match(ring, /1,668 left/);
  assert.equal(b.used, 872, `Add used ${b.used} instead of Today's 872`);
  assert.equal(Math.round(b.left), 1668, 'Add must show 1668 LEFT');
});
function todayReadAndCopy(c, rows) {
  const body = fn('renderToday');
  const prefix = between(body, '  const entries =', '  const streak =');
  // Support the unchanged tree, where the source date was implicit.
  const fallback = prefix.includes('const copySourceDate') ? '' : 'const copySourceDate = addDays(S.date, -1);';
  const renderMeals = app.split('\n').find(l => l.includes('${MEALS.map((name, i) => mealBlock('));
  assert.ok(renderMeals, 'SETUP Today meal renderer found');
  const copy = between(body, "  $$('[data-copymeal]')", '\n\n  if (isToday)');
  c.db = {
    all: async () => rows,
    get: async (_, id) => rows.find(r => r.id === id),
    put: async (_, e) => rows.push({...e}),
  };
  c.entriesFor = async date => rows.filter(e => e.date === date);
  c.toasts = [];
  c.toast = text => c.toasts.push(text);
  c.rollDayIfNeeded = async () => false;
  c.recordMealUsed = async () => {};
  c.refreshNotifSchedules = () => {};
  c.onFoodLogged = async () => ({xp: 0});
  c.trackEvent = () => {};
  c.refresh = () => {};
  c.confettiBurst = () => {};
  c.popSound = () => {};
  c.queueCelebration = () => {};
  c.innerWidth = 393;
  let id = 0;
  c.newId = () => `copied-${++id}`;
  c.MEAL_SPLIT = [0.25, 0.35, 0.30, 0.10];
  c.buttons = [];
  c.$$ = () => c.buttons;
  vm.runInContext(fn('commitLogEntry'), c);
  vm.runInContext(`async function mountMeals() {
    ${prefix}
    ${fallback}
    const isToday = S.date === dateKey(), t = S.settings.targets;
    const html = \`${renderMeals}\`;
    buttons.push(...[...html.matchAll(/data-copymeal="(\\d+)"/g)].map(m => ({dataset: {copymeal: m[1]}, addEventListener: (_, f) => { callbacks[m[1]] = f; }})));
    ${copy}
    return html;
  }`, c);
  c.callbacks = {};
  return c.mountMeals();
}
for (const [issue, date] of [['R46-9', today], ['R46-10', '2026-08-29']]) {
  await check(`${issue} copy chip and callback agree on source date, 723 kcal and stored meal`, async () => {
    const c = mealContext(); c.S.date = date;
    if (app.includes('function firstDiaryDate(')) vm.runInContext(fn('firstDiaryDate'), c);
    const source = nutrition.addDays(date, -1);
    const rows = [240.6, 240.6, 240.6].map((kcal, i) => mk(`source-${i}`, source, kcal));
    rows.push(mk('other-meal', source, 99, 1), mk('wrong-yesterday', '2026-09-06', 505, 2));
    const html = await todayReadAndCopy(c, rows);
    const chip = html.match(/<button[^>]*data-copymeal="0"[^>]*>(.*?)<\/button>/)?.[1];
    assert.ok(chip, 'CONTROL nonempty previous breakfast must offer a copy');
    if (date !== today) {
      assert.ok(chip.includes(source) && !chip.includes('yesterday'), `historical chip must name ${source}: ${chip}`);
    }
    const promised = Number(chip.match(/\((\d+) kcal\)/)[1]);
    await c.callbacks[0]({clientX: 10, clientY: 10});
    const copied = rows.filter(r => r.date === date);
    assert.equal(copied.length, 3);
    assert.equal(c.shownTotals(copied).kcal, 723);
    assert.equal(promised, 723, `chip promises ${promised} kcal but copied meal displays 723`);
    assert.equal(copied[0].kcal, 240.6, 'saved nutrition remains unrounded');
    assert.equal(copied[0].meal, 0);
    assert.match(c.mealBlock('Breakfast', 0, copied, []), />723 kcal</);
    if (date !== today) assert.ok(c.toasts[0].includes(source), `historical toast must name ${source}: ${c.toasts[0]}`);
    assert.ok(!c.mealBlock('Breakfast', 0, [], []).includes('data-copymeal'), 'empty source cannot offer a copy');
    assert.ok(!c.mealBlock('Breakfast', 0, copied, rows).includes('data-copymeal'), 'filled meal cannot offer a copy');
  });
}
await check('R46-11 past empty meals and sign-offs never speak as today, across every speech choice', () => {
  const c = mealContext();
  for (let salt = 0; salt < 12; salt++) {
    c.S.speechSalt = salt; c.S.date = '2026-08-29';
    for (const name of nutrition.MEALS) {
      const html = c.mealBlock(name, 0, [], []);
      assert.match(html, /recorded for this day/, `historical ${name} still uses today's empty copy: ${c.emptyMealLine(name)}`);
    }
    for (const count of [0, 1, 3]) {
      const line = c.signOffLine(count, {p: 0}, {p: 100});
      assert.match(line, /recorded for this day/);
      assert.doesNotMatch(line, /today|tomorrow|yet|hurry|will be here/i);
    }
  }
  c.S.date = today; c.S.speechSalt = 0;
  assert.match(c.signOffLine(0, {}, {}), /Nothing written down yet/, 'CONTROL today keeps its existing voice');
  assert.match(c.emptyMealLine('Breakfast'), /day is young/, 'CONTROL today keeps its empty meal choices');
});
await check('R46-12 actual back-arrow callback stops at creation and marks its button disabled', () => {
  const c = load([], {refresh: () => {}});
  if (app.includes('function firstDiaryDate(')) vm.runInContext(fn('firstDiaryDate'), c);
  const body = fn('renderToday');
  const prefix = between(body, '  const entries =', '  const streak =');
  const binding = app.split('\n').find(l => l.includes("$('#prevDay').addEventListener"));
  const markup = app.split('\n').find(l => l.includes('id="prevDay"'));
  assert.ok(binding && markup, 'CONTROL actual arrow markup and callback found');
  // The existing render prefix computes the bound from the same stored rows.
  c.entriesFor = async () => []; c.db = {all: async () => c.rows};
  c.$ = () => ({addEventListener: (_, f) => {c.back = f;}});
  vm.runInContext(`async function mountArrow() { ${prefix}\n${binding}\nreturn \`${markup}\`; }`, c);
  c.mount = async (createdAt, rows, date) => {
    c.rows = rows; c.S.settings.createdAt = createdAt; c.S.date = date;
    return c.mountArrow();
  };
  return (async () => {
    const created = new Date(2026, 7, 28, 12).getTime();
    await c.mount(created, [], today);
    for (let i = 0; i < 25; i++) c.back();
    assert.equal(c.S.date, '2026-08-28', `back arrow walked past account history to ${c.S.date}`);
    assert.match(await c.mount(created, [], c.S.date), /\sdisabled[\s>]/);
    const before = c.S.date; c.back(); assert.equal(c.S.date, before);
    const enabled = await c.mount(created, [], '2026-08-29');
    assert.doesNotMatch(enabled, /\sdisabled[\s>]/, 'CONTROL next day must allow Back');
    c.back(); assert.equal(c.S.date, '2026-08-28');
    for (const stamp of [created, undefined, 'invalid']) {
      await c.mount(stamp, [mk('imported', '2026-08-20', 0)], today);
      for (let i = 0; i < 30; i++) c.back();
      assert.equal(c.S.date, '2026-08-20', 'older imported rows remain reachable, including zero-calorie rows');
    }
    assert.match(await c.mount(undefined, [], today), /\sdisabled[\s>]/, 'empty legacy save stops at today');
  })();
});
console.log(`${checked - failed}/${checked} guards passed`);
process.exitCode = failed ? 1 : 0;
