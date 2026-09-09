/* Frozen first-run work order, 2026-09-08. Production functions and onboarding
 * handlers over mem-idb. CONTROL rows require delivered goods and live controls.
 * No files, sockets, browser, network or production accounts are used.
 * RED/GREEN transcripts and limits: docs/PLAYTEST-FIRSTRUN.md.
 */
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as D from '../js/db.js';
import * as G from '../js/game.js';
import * as L from '../js/loot.js';
import * as C from '../js/cooking.js';
import * as N from '../js/nutrition.js';

// Interrupt the real IDB boundary, never replace the production reward function.
let fault = null, hits = 0, dead = false;
const open = indexedDB.open;
indexedDB.open = (...args) => {
  const req = open(...args);
  let success;
  Object.defineProperty(req, 'onsuccess', {
    set(fn) { success = fn; },
    get() { return success && (e => {
      const db = req.result, transaction = db.transaction;
      db.transaction = (...a) => {
        const tx = transaction(...a), objectStore = tx.objectStore;
        if (dead) tx.abort();
        tx.objectStore = name => {
          const store = objectStore(name);
          for (const op of ['add', 'put']) {
            const write = store[op];
            store[op] = row => {
              const result = write(row);
              if (fault?.(name, row)) {
                hits++;
                if (fault.mode === 'abort') tx.abort();
                else dead = true;
              }
              return result;
            };
          }
          return store;
        };
        return tx;
      };
      success(e);
    }); },
  });
  return req;
};
const resetFault = () => { fault = null; dead = false; };
let pass = 0, fail = 0;
async function test(name, run) {
  try { await run(); console.log(`PASS ${name}`); pass++; }
  catch (e) { console.log(`FAIL ${name}: ${e.message}`); fail++; }
  finally { resetFault(); }
}
async function kitState() {
  const inv = await D.db.all('inv');
  return { crates: inv.filter(x => x.kind === 'crate').length,
    eggs: inv.filter(x => x.kind === 'egg' && x.goal === 0).length,
    vigor: inv.filter(x => x.kind === 'vigor').length,
    ingredients: await C.ingredients(), coins: await L.coins() };
}
const fullKit = { crates: 2, eggs: 1, vigor: 1, ingredients: { marrow: 2, salt: 1 }, coins: G.DAYONE_TOPUP };
for (const mode of ['after-claim', 'abort']) await test(`F1 ${mode}: retry delivers the complete kit exactly once`, async () => {
  D.useDbName(`firstrun-${mode}`);
  hits = 0;
  fault = mode === 'abort' ? (store, row) => store === 'inv' && row.kind === 'crate'
    : (store, row) => store === 'kv' && row.k === 'loot-init';
  fault.mode = mode;
  await G.initLootIfNeeded().catch(() => null);
  assert(hits > 0, 'CONTROL the production kit must reach the fault');
  resetFault();
  await G.initLootIfNeeded();
  const state = await kitState();
  assert.deepEqual(state, fullKit, `recovered kit = ${JSON.stringify(state)}`);
  assert.equal(await G.initLootIfNeeded(), null);
  assert.deepEqual(await kitState(), fullKit);
});
await test('CONTROL concurrent first boots and later boot deliver only one kit', async () => {
  D.useDbName('firstrun-concurrent');
  const results = await Promise.all([G.initLootIfNeeded(), G.initLootIfNeeded()]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.deepEqual(await kitState(), fullKit);
  assert.equal(await D.kvGet('coinsRev'), G.DAYONE_TOPUP);
  assert.equal((await D.db.all('xp')).filter(r => r.key === 'dayone-topup').length, 1);
  assert.equal(await G.initLootIfNeeded(), null);
});
await test('CONTROL legacy kit and existing coin receipt never pay again', async () => {
  D.useDbName('firstrun-legacy');
  await D.kvSet('loot-init', true);
  assert.equal(await G.initLootIfNeeded(), null);
  assert.equal((await D.db.all('inv')).length, 0);
  assert.equal(await L.coins(), 0);
  D.useDbName('firstrun-prior-topup');
  await G.awardOnce('dayone-topup', 'welcome', 0, 'Already paid', undefined, null,
    { kv: { coins: () => 40, coinsRev: () => 40 } });
  await G.initLootIfNeeded();
  assert.equal(await L.coins(), 40);
});

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
function cut(start, end) {
  const a = app.indexOf(start), b = app.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `CONTROL production source missing: ${start}`);
  return app.slice(a, b);
}
function onboarding() {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { style: {}, classList: { add() {} },
      addEventListener(type, fn) { this[type] = fn; } });
    return nodes.get(selector);
  };
  const saved = [];
  let roll = 0;
  const ctx = vm.createContext({ ...N, XP_DAILY_CAP: G.XP_DAILY_CAP,
    newPlayerConfirmed: true, $: node, kvSet: D.kvSet, markBooted() {}, trackEvent() {},
    ICONS: { chev: () => '', star: () => '', pit: () => '' }, BH_BY_ID: {},
    onbGwartHtml: () => '', runTalkBox() {}, ONB_GWART: [], S: {}, popSound() {},
    randomName: () => ({ adj: 'New', noun: 'Bones', num: ++roll }),
    buildDisplayName: (a, n, i) => `${a} ${n} ${i}`, esc: String,
    t1Stroke: () => '', pixCur: () => '', bhIcon: () => '', openRestoreSheet() {},
    profileFormHtml: () => '', bindProfileForm: () => () => ({}),
    saveInitialSettings: async np => saved.push(np), toast() {},
  });
  vm.runInContext(cut('function renderOnboarding(', '\nasync function saveInitialSettings('), ctx);
  return { ctx, node, saved };
}
await test('CONTROL onboarding Meet, reroll, accept, back and skip handlers work', async () => {
  D.useDbName('firstrun-controls');
  const { ctx, node, saved } = onboarding();
  ctx.renderOnboarding();
  assert.match(node('#screen').innerHTML, /FEED THE/);
  node('#onbGo').click();
  node('#onbReroll').click();
  await node('#onbMe').click();
  assert.equal((await D.kvGet('onbName')).num, 2);
  assert.match(node('#screen').innerHTML, /THE PLAN/);
  node('#onbBack').click();
  assert.match(node('#screen').innerHTML, /New Bones 2/);
  await node('#onbMe').click();
  await node('#onbSkip').click();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].age, 30);
  assert.equal(saved[0].heightCm, 178);
});
await test('F2 onboarding explains the actual daily logging XP limit', async () => {
  D.useDbName('firstrun-log-limit');
  const { ctx, node } = onboarding();
  ctx.renderOnboarding(1);
  const html = node('#screen').innerHTML;
  let last;
  for (let i = 0; i <= G.XP_DAILY_CAP.log; i++) {
    const entry = { id: `first-day-${i}`, date: N.dateKey(), meal: 0,
      name: 'Breakfast item', kcal: 100, p: 0, c: 25, f: 0, ts: Date.now() };
    await D.db.put('log', entry);
    last = await G.onFoodLogged(entry, { entriesForDate: await D.db.all('log') });
  }
  const logs = (await D.db.all('xp')).filter(r => r.type === 'log');
  assert.equal(logs.length, G.XP_DAILY_CAP.log, 'CONTROL actual capped awards exist');
  assert.equal(last.xp, 0, 'the next log no longer earns XP');
  assert.match(html, new RegExp(`first ${G.XP_DAILY_CAP.log} logs`), 'render omits the daily XP limit');
  assert.doesNotMatch(html, /XP, every meal/);
});
await test('CONTROL first-day kit opens, hatches and cooks with persisted deliveries', async () => {
  D.useDbName('firstrun-play');
  await G.initLootIfNeeded();
  const inventory = await D.db.all('inv');
  const egg = inventory.find(x => x.kind === 'egg');
  const hatch = await L.hatchEgg(egg.id);
  assert.equal(hatch.ready, true);
  assert.equal((await L.equipped({ raw: true })).C, hatch.item.id);
  assert.equal((await L.petInstances()).length, 1);
  assert.equal((await C.startCook('bone-broth', 1000)).ok, true);
  assert.equal(await C.collectDish(0, 1000), null);
  assert.equal((await C.collectDish(0, 1000 + 15 * 60e3)).id, 'bone-broth');
  assert.equal((await C.pantryDishes()).filter(r => r.recipeId === 'bone-broth').length, 1);
  assert.equal(await C.collectDish(0, 1000 + 15 * 60e3), null);
  for (const crate of inventory.filter(x => x.kind === 'crate')) {
    const opened = await L.openCrate(crate.id);
    assert(opened.results.length > 0);
    assert.equal(await D.db.get('inv', crate.id), undefined);
    await assert.rejects(L.openCrate(crate.id), /crate gone/);
  }
  assert((await L.coins()) > G.DAYONE_TOPUP);
});
await test('CONTROL onboarding saves the default plan and kit through production persistence', async () => {
  D.useDbName('firstrun-save');
  const np = { sex: 'm', age: 30, heightCm: 178, weightKg: N.lbToKg(180),
    activity: 'moderate', goal: 'recomp', units: 'lb' };
  const state = { settings: null, demo: true }, witness = {};
  let entered = 0;
  const deps = { ...D, ...G, ...N, S: state, saveWitness: witness,
    saveRecoveryActive: false, NEWS: [{ id: 'existing-news' }],
    enterAppFromOnboarding: () => entered++, setTimeout() {}, np };
  // Function constructors have no app module URL. Resolve only that import's
  // path to this checkout; the production settings/guard/kit logic is verbatim.
  const source = cut('async function saveInitialSettings(', '\n/* Leaving onboarding')
    .replace("import('./changelog.js')", `import(${JSON.stringify(new URL('../js/changelog.js', import.meta.url).href)})`);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction(...Object.keys(deps),
    cut('let settingsBase = null;', '\n/* Test hooks') + '\n' +
    cut('async function guardSaveBeforeInit()', '\nfunction renderAccountRecovery(') + '\n' +
    source + '\nawait saveInitialSettings(np);')(...Object.values(deps));
  assert.equal(entered, 1);
  const persisted = await D.kvGet('settings');
  assert.deepEqual(persisted.profile, state.settings.profile);
  assert.deepEqual(persisted.targets, N.computeTargets(persisted.profile));
  assert.deepEqual(await D.kvGet('newsSeen'), ['existing-news']);
  assert.equal(await D.kvGet('game-init'), true);
  assert.deepEqual(await kitState(), fullKit);
});
console.log(`firstrun: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
