// PURE source contract and live title/refresh markup. Browser geometry is unproven.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const app = read('js/app.js'), css = read('app.css');
function gradeLift(source) {
  assert.match(source, /\.screen--today #bhStage > \.hero-char\s*\{\s*top: calc\(var\(--gw-top, 50px\) \+ var\(--gw-h, 90px\) \+ var\(--bleed, 0px\) - 16px\);\s*bottom: 95px;/);
  assert.match(source, /\.screen--today #bhStage > \.hero-companion\s*\{ bottom: 108px;/);
  assert.match(source, /\.screen--today #bhStage > \.gw-row\s*\{ top: calc\(var\(--gw-top\) \+ var\(--bleed, 0px\) - 16px\);/);
}
gradeLift(css);
assert.throws(() => gradeLift(css.replace('bottom: 108px;', 'bottom: 92px;')), assert.AssertionError);
console.log('PASS CONTROL omitted pet lift rejected; top -16 and bottom +16 preserve character height, pet bottom +16 preserves spacing.');
const game = read('js/game.js');
const names = vm.runInNewContext(game.match(/export const LEVEL_NAMES = (\[[\s\S]*?\]);/)[1]);
const helper = app.slice(app.indexOf('function todayEarnedTitle('), app.indexOf('async function refreshLevelChip('));
const ctx = vm.createContext({LEVEL_NAMES:names});
vm.runInContext(helper, ctx);
assert.equal(ctx.todayEarnedTitle({level:8,name:'Streak Runner'}),'Streak Runner');
assert.equal(ctx.todayEarnedTitle({level:21,name:'Bone Grandmaster 21'}),'Bone Grandmaster');
ctx.LEVEL_NAMES[0] = 'Title 101';
assert.equal(ctx.todayEarnedTitle({level:1,name:'Title 101'}),'Title 101');
const today = app.slice(app.indexOf('async function renderToday('), app.indexOf('async function renderToday(')+80000);
assert.match(today, /class="hero-name">\$\{esc\(todayName\)\}/);
assert.match(today, /class="hero-title">\$\{esc\(todayEarnedTitle\(lvl\)\)\}/);
const refresh = app.slice(app.indexOf('async function refreshLevelChip('), app.indexOf('\n}', app.indexOf('async function refreshLevelChip(')) + 2);
assert.match(refresh, /levelFor\(await totalXp\(\)\)/);
assert.match(refresh, /title.textContent = todayEarnedTitle\(lvl\)/);
assert.match(refresh, /level.textContent = `Lv \$\{lvl.level\}`/);
assert.doesNotMatch(refresh, /\brow\.innerHTML/);
assert.match(app, /shape-rendering="crispEdges"><path fill="#736858"/);
assert.match(css, /\.screen--today \.hero-actions #pitBtn/);
assert.match(css, /\.screen--today #newsBanner > summary,\s*\.screen--today \.q-collapse > summary\s*\{[^}]*min-height: 48px/);
console.log('PASS Today title lookup, digit-bearing titles, live name/level/XP refresh, newspaper and scoped navigation/disclosure contracts. Browser UNPROVEN.');
