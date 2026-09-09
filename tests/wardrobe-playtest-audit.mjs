/* Frozen wardrobe playtest, 2026-09-08. Production services over mem-idb,
 * real app template/handler slices, transaction abort and interruption controls.
 * No sockets, browser, file writes or pixel claims. Red transcript is recorded
 * in docs/PLAYTEST-WARDROBE.md before the corresponding production fixes.
 */
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fault = { match: null, mode: '', hit: false };
const originalOpen = indexedDB.open.bind(indexedDB);
indexedDB.open = (...args) => {
  const req = originalOpen(...args);
  let success;
  Object.defineProperty(req, 'onsuccess', { set(fn) { success = fn; }, get() {
    return success && (event => {
      const database = req.result, transaction = database.transaction.bind(database);
      database.transaction = (...args) => {
        const tx = transaction(...args);
        if (fault.hit && fault.mode === 'after') { tx.abort(); return tx; }
        const objectStore = tx.objectStore.bind(tx);
        tx.objectStore = name => {
          const store = objectStore(name);
          for (const op of ['put', 'delete']) {
            const original = store[op];
            store[op] = value => {
              const result = original(value);
              if (fault.match?.(name, op, value)) {
                fault.hit = true;
                if (fault.mode === 'abort') tx.abort();
              }
              return result;
            };
          }
          return store;
        };
        return tx;
      };
      success(event);
    });
  } });
  return req;
};
const { db, kvGet, kvSet, useDbName } = await import('../js/db.js');
const loot = await import('../js/loot.js');
const { GEAR_BY_ID } = await import('../js/gear.js');
const { BH_BY_ID } = await import('../data/boneheadz.js');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let passed = 0, failed = 0, sequence = 0;
const resetFault = () => Object.assign(fault, { match: null, mode: '', hit: false });
async function test(name, fn) {
  resetFault(); useDbName(`wardrobe-playtest-${++sequence}`);
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e?.message || e}`); }
  finally { resetFault(); }
}
function cut(start, end) {
  const a = app.indexOf(start), b = app.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `CONTROL production slice missing: ${start}`);
  return app.slice(a, b);
}
function run(code, deps) { return new AsyncFunction(...Object.keys(deps), code)(...Object.values(deps)); }
const hat = 'g-H10-1-gravecaller', lookGear = 'g-H10-2-ringmaster', look = 'H10-2';
async function dressed(dust = 100) {
  await loot.grantGear(hat, 'audit'); await loot.grantGear(lookGear, 'audit');
  await loot.equipGear('H', hat); await kvSet('bonedust', dust);
}
await test('W1 transmog interruption after debit preserves receipt and appearance', async () => {
  await dressed();
  Object.assign(fault, { mode: 'after', match: (s, op, v) => s === 'kv' && op === 'put' && v.k === 'bonedust' });
  await loot.applyTransmog('H', look).catch(() => {});
  const hit = fault.hit; resetFault(); assert(hit, 'CONTROL debit fault must fire');
  const dust = await loot.boneDust(), paid = await kvGet('paidlooks', []), tm = await loot.transmogMap();
  assert(dust === 100 - loot.transmogCost(look) && paid.includes(`H:${look}`) && tm.H === look,
    `dust=${dust}, paid=${JSON.stringify(paid)}, transmog=${JSON.stringify(tm)}`);
  await loot.clearTransmog('H'); const retry = await loot.applyTransmog('H', look);
  assert.equal(retry.cost, 0, 'retry must not charge again');
});
await test('W1 aborted appearance write rolls back dust and receipt', async () => {
  await dressed(); const rev = await kvGet('dustRev', 0);
  Object.assign(fault, { mode: 'abort', match: (s, op, v) => s === 'kv' && op === 'put' && v.k === 'transmog' });
  await assert.rejects(loot.applyTransmog('H', look));
  const hit = fault.hit; resetFault(); assert(hit, 'CONTROL appearance abort must fire');
  const dust = await loot.boneDust(), paid = await kvGet('paidlooks', []);
  assert(dust === 100 && !paid.includes(`H:${look}`), `dust=${dust}, paid=${JSON.stringify(paid)}`);
  assert.equal(await kvGet('dustRev', 0), rev);
  assert.equal((await loot.applyTransmog('H', look)).cost, loot.transmogCost(look));
});
await test('CONTROL concurrent transmog taps with exactly one purchase worth of dust both succeed once', async () => {
  await dressed(loot.transmogCost(look));
  const results = await Promise.all([loot.applyTransmog('H', look), loot.applyTransmog('H', look)]);
  assert(results.every(r => r.ok), JSON.stringify(results));
  assert.equal(results.reduce((n, r) => n + r.cost, 0), loot.transmogCost(look));
  assert.equal(await loot.boneDust(), 0);
});
await test('W2 melting legacy gear keeps its collected look forever', async () => {
  await db.put('inv', loot.gearRow(lookGear, 'legacy'));
  assert((await loot.collectedLooks()).has(look), 'CONTROL owned gear exposes its look');
  const result = await loot.disenchantGear(lookGear);
  assert(result.ok); assert.equal(await loot.boneDust(), loot.gearDustValue(GEAR_BY_ID[lookGear]));
  assert((await loot.collectedLooks()).has(look), `look ${look} vanished after melt`);
});
await test('W2 concurrent collected looks survive after inventory copies are melted', async () => {
  await Promise.all([loot.grantGear(hat, 'audit'), loot.grantGear(lookGear, 'audit')]);
  const ledger = await kvGet('looks', []);
  assert(ledger.includes(GEAR_BY_ID[hat].artId) && ledger.includes(look), `collected ledger=${JSON.stringify(ledger)}`);
  await loot.disenchantGear(hat); await loot.disenchantGear(lookGear);
  const looks = await loot.collectedLooks();
  assert(looks.has(GEAR_BY_ID[hat].artId) && looks.has(look), `collected=${JSON.stringify([...looks])}`);
});
await test('W3 aborted melt preserves worn stats, item and dust', async () => {
  await dressed();
  Object.assign(fault, { mode: 'abort', match: (s, op, v) => s === 'inv' && op === 'delete' && v === `gear:${hat}` });
  await assert.rejects(loot.disenchantGear(hat));
  const hit = fault.hit; resetFault(); assert(hit, 'CONTROL melt abort must fire');
  assert(await db.get('inv', `gear:${hat}`)); assert.equal(await loot.boneDust(), 100);
  assert.equal((await loot.gearLoadout()).H, hat, 'failed melt removed equipped stats');
});
await test('CONTROL melting one copy concurrently pays exactly once and retains other slots', async () => {
  await dressed(); await kvSet('gearloadout', { H: hat, S: 'preserve-other-slot' });
  const results = await Promise.all([loot.disenchantGear(hat), loot.disenchantGear(hat)]);
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(await loot.boneDust(), 100 + loot.gearDustValue(GEAR_BY_ID[hat]));
  assert.deepEqual(await loot.gearLoadout(), { S: 'preserve-other-slot' });
});
await test('W4 single crate click recovers from an aborted take and allows retry', async () => {
  const crate = await loot.grantCrate('daily', 'audit');
  const btn = { dataset: { open: crate.id }, disabled: false, addEventListener: (_, fn) => { btn.click = fn; } };
  const reveals = [], messages = []; let renders = 0;
  await run(cut("    $$('[data-open]', content).forEach", "    $$('[data-open-all]', content).forEach"), {
    $$: () => [btn], content: {}, wrap: {}, openCrate: loot.openCrate,
    openCrateReveal: async r => reveals.push(r), toast: m => messages.push(m),
    renderCharacter: () => { renders++; },
  });
  Object.assign(fault, { mode: 'abort', match: (s, op, v) => s === 'inv' && op === 'delete' && v === crate.id });
  let rejected = false; await btn.click().catch(() => { rejected = true; });
  const hit = fault.hit; resetFault(); assert(hit, 'CONTROL crate abort must fire');
  assert(await db.get('inv', crate.id)); assert.equal(reveals.length, 0);
  assert(!rejected && !btn.disabled && messages.length > 0,
    `rejected=${rejected}, disabled=${btn.disabled}, messages=${messages.length}`);
  await btn.click(); assert.equal(reveals.length, 1); assert(renders > 0);
  assert.equal(await db.get('inv', crate.id), undefined);
});
await test('CONTROL crate rewards persist and double-open pays once', async () => {
  const crate = await loot.grantCrate('golden', 'audit');
  const results = await Promise.allSettled([loot.openCrate(crate.id), loot.openCrate(crate.id)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const opened = results.find(r => r.status === 'fulfilled').value;
  assert.equal(opened.results.length, loot.CRATES.golden.rolls);
  assert.equal(await loot.coins(), opened.coins);
  assert((await kvGet('invTaken', [])).includes(crate.id));
  const inv = await loot.inventory();
  for (const result of opened.results) {
    if (result.type === 'cos') assert(inv.some(r => r.itemId === result.item.id));
    if (result.type === 'gear') assert(inv.some(r => r.gearId === result.gear.id));
    if (result.type === 'ingredient') assert((await kvGet('ingredients', {}))[result.ingredient] > 0);
    if (result.type === 'consumable') assert(inv.some(r => r.kind === result.consumable));
  }
});
await test('CONTROL real crate odds template reports production percentages', async () => {
  const html = await run(cut('        const line = kind => crateOdds(kind)', '\n      })()}') ,
    { crateOdds: loot.crateOdds, RARITIES: loot.RARITIES });
  for (const kind of ['daily', 'golden']) {
    const odds = loot.crateOdds(kind);
    for (const row of odds.rows) assert(html.includes(`${loot.RARITIES[row.rarity].label} ${row.pct}%`));
  }
  assert(html.includes('When a cosmetic drops')); assert(html.includes('3 pulls'));
});
await test('CONTROL plain cosmetic equip, hide, clear and strip conserve ownership', async () => {
  await dressed(); await loot.grantCosmetic(look, 'audit');
  await loot.equip('H', look); assert.equal((await loot.equipped()).H, look);
  assert.equal((await loot.gearLoadout()).H, undefined);
  const inventory = await loot.inventory();
  assert.equal((await loot.applyTransmog('H', loot.TRANSMOG_HIDE)).cost, 0);
  assert.equal((await loot.equipped()).H, undefined);
  await loot.clearTransmog('H'); assert.equal((await loot.equipped()).H, BH_BY_ID[look].id);
  await loot.stripAll(); assert.deepEqual(await loot.inventory(), inventory);
});
await test('CONTROL paid saved fit survives strip and restores owned gear without another charge', async () => {
  await dressed(); await loot.applyTransmog('H', look);
  const dust = await loot.boneDust(), inventory = await loot.inventory();
  const saved = await loot.captureFit('My hat'); assert(saved.ok);
  await loot.stripAll(); assert.equal((await loot.gearLoadout()).H, undefined);
  const result = await loot.applyFit(saved.fit.id);
  assert(result.ok); assert.equal(result.cost, 0); assert.equal(await loot.boneDust(), dust);
  assert.equal((await loot.gearLoadout()).H, hat); assert.equal((await loot.equipped()).H, look);
  assert.deepEqual(await loot.inventory(), inventory);
  await loot.renameFit(saved.fit.id, 'Renamed'); assert.equal((await loot.fits())[0].name, 'Renamed');
  await loot.deleteFit(saved.fit.id); assert.equal((await loot.fits()).length, 0);
});
await test('CONTROL transmog refuses missing ownership, wrong slot and insufficient dust without changing state', async () => {
  await dressed(0);
  const snapshot = async () => ({ dust: await loot.boneDust(), paid: await kvGet('paidlooks', []), tm: await loot.transmogMap() });
  const before = await snapshot();
  assert.equal((await loot.applyTransmog('S', look)).reason, 'slot');
  assert.equal((await loot.applyTransmog('H', look)).reason, 'dust');
  await db.del('inv', `gear:${lookGear}`); await kvSet('looks', []);
  assert.equal((await loot.applyTransmog('H', look)).reason, 'not-collected');
  assert.deepEqual(await snapshot(), before);
});
console.log(`WARDROBE PLAYTEST: ${passed} passed, ${failed} failed (Node only, no pixel claim)`);
process.exitCode = failed ? 1 : 0;
