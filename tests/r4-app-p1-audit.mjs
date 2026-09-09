// Reconstructed guard over existing fixes. No claim of pre-fix source evidence.
import './mem-idb.mjs';
import vm from 'node:vm';
import { assert, read, cut, audit, abortWrites } from './lib/r4-proof.mjs';
import * as D from '../js/db.js';
import * as loot from '../js/loot.js';
import * as football from '../data/football-teams.js';
import { BH_BY_ID } from '../data/boneheadz.js';
import * as cook from '../js/cooking.js';
import * as game from '../js/game.js';
import { dateKey, addDays } from '../js/nutrition.js';
const a = audit('R4 APP P1'), app = read('js/app.js');
let abort = false;
abortWrites((store, op, value) => abort && store === 'kv' && op === 'put' && value.k === 'ingredients');
let seq = 0;
async function fresh(coins = 100000) { D.useDbName(`r4-app-${++seq}`); await D.kvSet('coins', coins); await D.kvSet('paidlooks', ['H:existing']); }
async function paid(ids) {
  const credits = await D.kvGet('paidlooks'); assert(credits.includes('H:existing'));
  for (const id of ids) assert(credits.includes(`${BH_BY_ID[id].slot}:${id}`), `unpaid ${id}`);
}
await a.check('R4-1 CONTROL all ten drop purchases retain coins-paid transmog credit', async () => {
  await fresh(); for (const item of loot.DROP.items) { const before = await loot.coins(); assert((await loot.buyDropItem(item.id)).ok); assert.equal(await loot.coins(), before - item.cost); await paid([item.id]); }
});
await a.check('R4-1 football credits all 32 colourways, including helmet visors', async () => {
  for (const garment of football.FOOTBALL_SOLD.filter(g => ['H', 'T', 'FW'].includes(g.slot))) {
    await fresh(); const id = football.footballItemId(football.FOOTBALL_TEAMS[0].id, garment.key);
    assert((await loot.buyFootballItem(id, true)).ok);
    const colours = football.FOOTBALL_TEAMS.map(t => football.footballItemId(t.id, garment.key));
    assert.equal(colours.length, 32); await paid(colours); await paid(football.footballGrantIds(id));
    console.log(`${garment.key}: ${colours.length} paid colourways`);
  }
});
await a.check('R4-1 bundle credits every delivered garment', async () => {
  await fresh(); assert((await loot.buyFootballBundle(football.FOOTBALL_TEAMS[0].id, true)).ok); await paid(football.footballBundleIds());
});
await a.check('R4-1 unfunded purchase grants no credit or inventory', async () => {
  await fresh(0); assert.equal((await loot.buyDropItem(loot.DROP.items[0].id)).ok, false);
  assert.deepEqual(await D.kvGet('paidlooks'), ['H:existing']); assert.equal((await D.db.all('inv')).length, 0);
});
let forage;
const receipts = [];
vm.runInNewContext(cut(app, "    armToConfirm($('#forageBtn'", "    $$('[data-cook]'"), {
  ...D, ...cook, $: () => ({}), body: {}, armToConfirm: (_, label, fn) => { forage = fn; },
  S: {}, toast: text => receipts.push(text), popSound() {}, render() {},
});
await a.check('R4-2 CONTROL forage pays 45 and delivers one common ingredient', async () => {
  await fresh(45); await forage(); assert.equal(await loot.coins(), 0);
  assert.equal(Object.values(await D.kvGet('ingredients')).reduce((x,y) => x+y, 0), 1);
});
await a.check('R4-2 aborted ingredient write preserves wallet and pantry', async () => {
  await fresh(45); await D.kvSet('ingredients', { marrow: 3 }); receipts.length = 0; abort = true;
  try { await assert.rejects(forage()); } finally { abort = false; }
  assert.equal(await loot.coins(), 45); assert.deepEqual(await D.kvGet('ingredients'), { marrow: 3 }); assert.equal(receipts.length, 0);
});
await a.check('R4-2 retry succeeds after abort', async () => {
  await forage(); assert.equal(await loot.coins(), 0); assert.equal(Object.values(await D.kvGet('ingredients')).reduce((x,y) => x+y, 0), 4);
});
await a.check('R4-2 concurrent forage taps cannot spend one wallet twice', async () => {
  await fresh(45); await Promise.all([forage(), forage()]); assert.equal(await loot.coins(), 0);
  assert.equal(Object.values(await D.kvGet('ingredients')).reduce((x,y) => x+y, 0), 1);
});
let now = 100000;
const gps = vm.createContext({ Date: { now: () => now } });
vm.runInContext(cut(app, '    const MAX_LOOT_SPEED = 8;', '    // the open den'), gps);
await a.check('R4-19 CONTROL fresh driving speed blocks actions for full watch timeout', () => {
  vm.runInContext('youSpeed = 20; lastFix = {}; lastSpeedFixAt = Date.now();', gps); now += 20000;
  assert.equal(vm.runInContext('currentLootSpeed() > MAX_LOOT_SPEED', gps), true);
});
await a.check('R4-19 stale speed and position clear at 20 seconds, at every gate', () => {
  now++; assert.equal(vm.runInContext('currentLootSpeed()', gps), 0); assert.equal(vm.runInContext('lastFix', gps), null);
  const uses = app.split('\n').filter(l => /if \(.*> MAX_LOOT_SPEED|const tooFast =/.test(l));
  assert.equal(uses.length, 3); for (const line of uses) assert(line.includes('currentLootSpeed()'), line);
  assert.match(app, /maximumAge: 3000, timeout: 20000/);
});
await a.check('R4-19 first returning stationary GPS fix discards old smoothing history', () => {
  vm.runInContext('youSpeed = 20; lastFix = {}; lastSpeedFixAt = 100000;', gps);
  gps.pos = { coords: { latitude: 49, longitude: -123, speed: 0 } }; gps.now = now; gps.dt = 21;
  vm.runInContext(cut(app, '      currentLootSpeed(); // clear', '      // smooth the jitter'), gps);
  assert.equal(vm.runInContext('youSpeed', gps), 0);
});
await a.check('R4-22 next control is disabled and handler refuses dates at or after today', () => {
  const tag = app.match(/<button[^\n]*id="nextDay"[^\n]*/)[0];
  let click; const ctx = vm.createContext({ S: { date: dateKey() }, dateKey, addDays, refresh() {}, $: () => ({ addEventListener: (_, fn) => { click = fn; } }) });
  vm.runInContext(app.split('\n').find(l => l.includes("$('#nextDay').addEventListener")), ctx);
  for (const day of [dateKey(), addDays(dateKey(), 400)]) { ctx.S.date = day; assert.match(vm.runInContext('`' + tag + '`', ctx), / disabled>/); click(); assert.equal(ctx.S.date, day); }
  ctx.S.date = addDays(dateKey(), -1); assert.doesNotMatch(vm.runInContext('`' + tag + '`', ctx), / disabled>/); click(); assert.equal(ctx.S.date, dateKey());
});
await a.check('R4-22 future logs and recovery grant zero XP, crates, level-ups or entitlement', async () => {
  await fresh(); const events = []; globalThis.window = { dispatchEvent: e => events.push(e.type) };
  const recover = vm.createContext({ ...D, dateKey, finishFoodLogged: () => { throw Error('future reward reached'); } });
  vm.runInContext(cut(read('js/game.js'), 'async function recoverFoodLogs()', '\nexport async function onWeighIn'), recover);
  for (let i = 1; i <= 5; i++) {
    const entry = { id: 'future'+i, date: addDays(dateKey(), i), meal: 0, kcal: 100, p: 100, c: 0, f: 0 };
    await D.db.put('log', entry); const result = await game.onFoodLogged(entry, { targets: { p: 1 }, entriesForDate: [entry] });
    assert.equal(result.xp, 0); assert.equal(result.crates, 0); assert.equal((await D.db.get('log', entry.id)).foodXp, undefined);
    await D.db.put('log', { ...entry, foodXp: { id: entry.id, date: entry.date } });
  }
  await vm.runInContext('recoverFoodLogs()', recover); assert.equal((await D.db.all('xp')).length, 0); assert.equal((await D.db.all('inv')).length, 0); assert.equal(events.length, 0);
  const intent = cut(app, '    e.foodXp =', '    await db.put');
  const ctx = { e: { id: 'new-future', date: addDays(dateKey(), 1) }, previous: null, dateKey, via: null, S: { settings: { targets: {} } } };
  vm.runInNewContext(intent, ctx); assert.equal(ctx.e.foodXp, null);
  ctx.e.date = dateKey(); vm.runInNewContext(intent, ctx); assert.equal(ctx.e.foodXp.id, ctx.e.id);
});
await a.check('R4-22 CONTROL today still earns XP', async () => {
  await fresh(); delete globalThis.window;
  const entry = { id: 'today', date: dateKey(), meal: 0, kcal: 100, p: 5, c: 5, f: 5 };
  await D.db.put('log', entry); assert((await game.onFoodLogged(entry, { entriesForDate: [entry] })).xp > 0);
});
a.finish();
