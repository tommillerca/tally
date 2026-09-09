// P1 merge regression audit. Real importer and cooking writers, no sockets.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import * as D from '../js/db.js';
import * as C from '../js/cooking.js';
let passed = 0, failed = 0, sequence = 0;
const merge = data => D.importAll(data, { replace: false });
const fresh = () => D.useDbName(`p1-merge-${++sequence}`);
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
await check('F01 stale merge retains marrow, Feast and spent buff charge', async () => {
  fresh();
  await D.kvSet('ingredients', { marrow: 1 });
  await D.kvSet('pantry', []);
  await D.kvSet('foodbuffs', [{ recipe: 'bone-broth', kind: 'combat', fightsLeft: 2 }]);
  const stale = await D.exportAll();
  await C.grantIngredient('marrow', 5);
  const feast = { recipeId: 'necro-feast', name: "Necromancer's Feast", cookedAt: 123 };
  await D.kvUpdate('pantry', rows => [...rows, feast]);
  await C.consumeFightFoodBuffs();
  await merge(stale);
  const actual = [(await C.ingredients()).marrow, (await C.pantryDishes()).length, (await C.foodBuffs())[0]?.fightsLeft];
  assert.ok(JSON.stringify(actual) === '[6,1,1]', `expected marrow/pantry/charges [6,1,1], got ${JSON.stringify(actual)}`);
  assert.deepEqual(await C.pantryDishes(), [feast]);
});
await check('F02 deletion survives stale diary merge', async () => {
  fresh();
  await D.db.put('log', { id: 'meal', date: '2026-09-08', kcal: 100 });
  const stale = await D.exportAll();
  await D.db.del('log', 'meal');
  await merge(stale);
  assert.ok(!(await D.db.get('log', 'meal')), 'deleted 100-kcal meal was resurrected');
});
await check('F02 correction survives stale diary merge', async () => {
  fresh();
  await D.db.put('log', { id: 'meal', date: '2026-09-08', kcal: 100 });
  const stale = await D.exportAll();
  await D.db.put('log', { ...stale.log[0], kcal: 250 });
  await merge(stale);
  const actual = (await D.db.get('log', 'meal')).kcal;
  assert.ok(actual === 250, `expected corrected 250 kcal, got ${actual}`);
});
await check('F03 independent same-potion grants survive replay and spending', async () => {
  fresh(); await C.grantPotion('vital-tonic');
  const base = await D.exportAll();
  await C.grantPotion('vital-tonic'); const a = await D.exportAll();
  fresh(); await D.importAll(base); await C.grantPotion('vital-tonic');
  await merge(a);
  const count = (await C.potionsInv())['vital-tonic'];
  assert.ok(count === 3, `expected 3 Vital Tonics, got ${count}`);
  await C.usePotion('vital-tonic');
  for (const stale of [a, base, a]) await merge(stale);
  assert.equal((await C.potionsInv())['vital-tonic'], 2);
});
await check('CONTROL replacement intentionally rolls back and distinct meals merge', async () => {
  fresh(); await D.db.put('log', { id: 'old', kcal: 100 });
  const base = await D.exportAll();
  await D.db.put('log', { id: 'new', kcal: 200 });
  await merge(base); assert.equal((await D.db.all('log')).length, 2);
  await D.importAll(base); assert.deepEqual(await D.db.all('log'), base.log);
});
const state = async () => { const { exportedAt, ...data } = await D.exportAll(); return data; };
await check('F01 independent ingredient credits and debits join in both directions', async () => {
  for (const reverse of [false, true]) {
    fresh(); await C.grantIngredient('marrow', 10); const name = `p1-merge-${sequence}`;
    const base = await D.exportAll();
    await C.grantIngredient('marrow', 5); const a = await D.exportAll();
    fresh(); await D.importAll(base); await C.grantIngredient('marrow', 7);
    await D.kvUpdate('ingredients', cur => { cur.marrow -= 3; return cur; });
    const b = await D.exportAll();
    if (reverse) D.useDbName(name);
    await merge(reverse ? b : a);
    assert.equal((await C.ingredients()).marrow, 19);
    for (const stale of [base, a, b]) await merge(stale);
    assert.equal((await C.ingredients()).marrow, 19);
  }
});
await check('F01 conflicting pantry branches refuse every store without losing either dish', async () => {
  fresh(); await D.kvSet('pantry', []); const base = await D.exportAll();
  const dish = id => ({ recipeId: id, cookedAt: 123 });
  await D.kvUpdate('pantry', rows => [...rows, dish('necro-feast')]); const a = await D.exportAll();
  fresh(); await D.importAll(base);
  await D.kvUpdate('pantry', rows => [...rows, dish('bone-broth')]);
  const before = await state();
  a.foods.push({ id: 'must-not-land' });
  await assert.rejects(merge(a), /Keep both saves for recovery; no merge was applied/);
  assert.deepEqual(await state(), before);
  assert.equal(a.kv.find(r => r.k === 'pantry').v[0].recipeId, 'necro-feast');
});
await check('F02 remote deletion propagates; concurrent edit/delete refuses atomically', async () => {
  fresh(); await D.db.put('log', { id: 'meal', kcal: 100 }); const base = await D.exportAll();
  await D.db.del('log', 'meal'); const deletion = await D.exportAll();
  fresh(); await D.importAll(base); await merge(deletion);
  assert.equal(await D.db.get('log', 'meal'), undefined);
  await merge(base); assert.equal(await D.db.get('log', 'meal'), undefined);
  await D.importAll(base); await D.db.put('log', { id: 'meal', kcal: 250 });
  const before = await state();
  await assert.rejects(merge(deletion), /conflicting merge history/);
  assert.deepEqual(await state(), before);
});
await check('F02 causal edits work with a backwards clock and survive a fresh restore', async () => {
  fresh(); await D.db.put('log', { id: 'meal', kcal: 100, updatedAt: 999 }); const base = await D.exportAll();
  fresh(); await D.importAll(base); await D.db.put('log', { id: 'meal', kcal: 250, updatedAt: 1 });
  const edited = await D.exportAll();
  fresh(); await D.importAll(base); await merge(edited); await merge(base);
  assert.equal((await D.db.get('log', 'meal')).kcal, 250);
});
await check('F02 all diary mutation primitives retain tombstones and edits', async () => {
  for (const method of ['addIfAbsent', 'claimAndPay', 'payAtomic', 'take', 'takeAndPay', 'clear']) {
    fresh(); await D.db.put('log', { id: 'meal', kcal: 100 }); const base = await D.exportAll();
    if (method === 'addIfAbsent' || method === 'claimAndPay') {
      await D.db.del('log', 'meal');
      await D[method]('log', { id: 'meal', kcal: 250 });
    } else if (method === 'payAtomic') await D.payAtomic({ puts: [{ store: 'log', val: { id: 'meal', kcal: 250 } }] });
    else await D.db[method]('log', 'meal');
    await merge(base);
    assert.equal((await D.db.get('log', 'meal'))?.kcal, ['addIfAbsent', 'claimAndPay', 'payAtomic'].includes(method) ? 250 : undefined, method);
  }
});
await check('F03 duplicate grants are counted once across repeated bidirectional exchange', async () => {
  fresh(); await C.grantPotion('vital-tonic'); const name = `p1-merge-${sequence}`;
  const base = await D.exportAll();
  await C.grantPotion('vital-tonic', 4); await C.usePotion('vital-tonic'); const a = await D.exportAll();
  fresh(); await D.importAll(base); await C.grantPotion('vital-tonic', 3); await C.grantPotion('fury-flask');
  const b = await D.exportAll(); await merge(a); const union = await D.exportAll();
  D.useDbName(name); for (const snapshot of [b, union, base, a, union]) await merge(snapshot);
  assert.deepEqual(await C.potionsInv(), { 'vital-tonic': 7, 'fury-flask': 1 });
});
await check('F03 overspent offline inventory refuses the entire import', async () => {
  fresh(); await C.grantPotion('vital-tonic'); const base = await D.exportAll();
  await C.usePotion('vital-tonic'); const a = await D.exportAll();
  fresh(); await D.importAll(base); await C.usePotion('vital-tonic'); const before = await state();
  await assert.rejects(merge(a), /conflicting merge history/);
  assert.deepEqual(await state(), before);
});
await check('CONTROL malformed history and ambiguous legacy resources refuse without mutation', async () => {
  fresh(); await C.grantPotion('vital-tonic'); const base = await D.exportAll();
  const before = await state();
  for (const mutate of [
    data => { data.kv.find(r => r.k.startsWith('mergeHistory:')).v.format = 99; },
    data => { data.kv.find(r => r.k === 'potions').v['vital-tonic'] = 999; },
    data => { data.kv = data.kv.filter(r => r.k !== 'potions'); },
    data => { data.kv = data.kv.filter(r => !r.k.startsWith('mergeHistory:')); },
  ]) {
    const bad = structuredClone(base); mutate(bad);
    await assert.rejects(merge(bad), /merge history/); assert.deepEqual(await state(), before);
  }
});
await check('CONTROL aborted multi-resource payout retains balances and histories', async () => {
  fresh(); await C.grantIngredient('marrow', 1); await C.grantPotion('vital-tonic'); const before = await state();
  await assert.rejects(D.payAtomic({ kv: {
    ingredients: cur => ({ marrow: cur.marrow + 5 }), potions: cur => ({ 'vital-tonic': cur['vital-tonic'] + 1 }),
    refuse: () => { throw new Error('injected abort'); },
  } }), /injected abort/);
  assert.deepEqual(await state(), before);
});
await check('CONTROL partial replacement without kv retires obsolete diary history', async () => {
  fresh(); await D.db.put('log', { id: 'meal', kcal: 250 });
  await D.importAll({ app: 'tally', log: [{ id: 'meal', kcal: 100 }] });
  assert.equal((await D.exportAll()).log[0].kcal, 100);
});
await check('CONTROL malformed diary put cannot become a clear operation', async () => {
  fresh(); await D.db.put('log', { id: 'keep', kcal: 100 }); const before = await state();
  await assert.rejects(D.db.put('log', { kcal: 999 }), /no key|DataError/);
  assert.deepEqual(await state(), before);
});
await check('CONTROL failed import rolls back staged records and merged history', async () => {
  fresh(); await C.grantPotion('vital-tonic'); const base = await D.exportAll();
  await C.grantPotion('vital-tonic'); const incoming = await D.exportAll();
  fresh(); await D.importAll(base); const before = await state();
  incoming.foods.push({ id: 'staged-food' }); incoming.weights.push({ invalid: 'no date key' });
  await assert.rejects(merge(incoming), /no key|DataError|restore/);
  assert.deepEqual(await state(), before);
});
await check('CONTROL legacy equal potion counts refuse instead of concealing missing grants', async () => {
  const legacy = { app: 'tally', log: [], kv: [{ k: 'potions', v: { 'vital-tonic': 2 } }] };
  fresh(); await D.importAll(legacy);
  const before = await D.db.all('kv');
  await assert.rejects(merge(legacy), /Keep both saves for recovery/);
  assert.deepEqual(await D.db.all('kv'), before);
});
await check('CONTROL import and queued potion earnings serialize under one transaction lock', async () => {
  fresh(); await C.grantPotion('vital-tonic'); const base = await D.exportAll();
  await Promise.all([merge(base), C.grantPotion('vital-tonic', 3), merge(base), C.grantPotion('vital-tonic', 7)]);
  assert.equal((await C.potionsInv())['vital-tonic'], 11);
});
console.log(`P1 MERGE: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
