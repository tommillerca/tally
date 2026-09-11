// PURE rendered markup and scoring checks. No browser geometry or operated controls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('function sleepScore('), app.indexOf('// Last night\'s sleep, broken'));
const ctx = vm.createContext({dateKey: () => '2026-09-10', ICONS: {up: () => '', down: () => ''}});
vm.runInContext(source, ctx);
const rows = (hr=60, hv=45, extra={}) => Array.from({length:20}, (_, i) => ({date: i===19?'2026-09-10':'2026-09-09',restingHr:i===19?hr:60,hrv:i===19?hv:45,...(i===19?extra:{})}));
const score = (a) => ctx.readinessScore(a);
assert.deepEqual([score(rows()).score,score(rows(50,62)).score,score(rows(72,30)).score,score(rows(50,62)).score-score(rows(72,30)).score,score(rows(60,45,{sleepMin:35})).score],[72,96,47,49,72]);
assert.equal(score([]),null);
assert.match(ctx.readinessHtml(score(rows().slice(0,3))),/Learning your normal/);
function grade(html) {
  const tiles = [...html.matchAll(/<button class="rd-tile[^]*?<\/button>/g)].map(m=>m[0]);
  assert.equal(tiles.length,3);
  for(const tile of tiles) assert.match(tile, /class="rd-icon"[^]*class="rl"[^]*class="rv"[^]*class="rd-delta"/, 'icon label value delta anatomy');
}
grade(ctx.readinessHtml(score(rows())));
const stale = ctx.readinessHtml({...score(rows()),slL:7.5,slScore:80,slDate:'2026-09-01',rhrDate:'2026-09-02'});
grade(stale);
assert.match(stale,/09-01/);assert.match(stale,/not last night/);assert.match(stale,/09-02/);
assert.match(stale,/data-metric="restingHr"/);assert.match(stale,/data-metric="hrv"/);assert.match(stale,/data-sleepdetail="1"/);
assert.match(stale,/moon.png/);assert.match(stale,/#ff8b81/);assert.match(stale,/#7cc4ff/);
assert.match(css,/\.rd-card \.rd-tile\s*\{[^}]*min-height: 148px/);
assert.throws(()=>grade(stale.replace('class="rd-icon"','class="broken"')),/icon label value delta anatomy/);
assert.doesNotMatch(app,/Your watch logged the hours but not the stages last night/);
console.log('PASS readiness 1D: 72 / 96 / 47 / 49 / 72; calibration, null, tile anatomy, units/actions and stale dates. CONTROL missing-icon mutation rejected. Browser UNPROVEN.');
