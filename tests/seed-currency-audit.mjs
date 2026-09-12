/* PURE: execute godmode's actual seed with a page double and production db
 * over mem-idb. Optional source path supports a RED run against the old helper.
 * Browser boot timing and the six consuming browser audits remain commander proof.
 */
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const database = await import('../js/db.js');
const { useDbName, kvGet, kvSet, kvBumpRevisioned, exportAll } = database;
const source = readFileSync(process.argv[2] || new URL('./godmode.js', import.meta.url), 'utf8');
const match = source.match(/export async function seed\(page, opts = \{\}\) \{[\s\S]*?\n\}/);
assert.ok(match, 'seed source found');
const seed = new Function('sleep', 'dismissOverlays', `${match[0].replace('export ', '').replaceAll("import('./js/db.js')", `import(${JSON.stringify(new URL('../js/db.js', import.meta.url).href)})`)}; return seed;`)(async () => {}, async () => {});
globalThis.location = { search: '?demo' };
indexedDB.databases = async () => [{ name: 'tally-demo' }];
const page = { waitForFunction: async () => {}, evaluate: async (fn, arg) => fn(arg), reload: async () => {} };
useDbName('tally-demo');
await kvBumpRevisioned('coins', 'coinsRev', 340);
await kvSet('bonedust', 12); // legacy opening without a history
let failures = 0;
async function check(name, run) {
  try { await run(); console.log(`PASS PURE ${name}`); }
  catch (e) { failures++; console.log(`FAIL PURE ${name}: ${e.message}`); }
}
await check('CONTROL seeded balances accept a revisioned credit and export', async () => {
  await seed(page, { coins: 900, dust: 80, reload: false });
  assert.equal(await kvGet('coins'), 900);
  assert.equal(await kvGet('bonedust'), 80);
  assert.equal(await kvBumpRevisioned('coins', 'coinsRev', 7), 907);
  assert.equal(await kvBumpRevisioned('bonedust', 'dustRev', 3), 83);
  await exportAll();
});
await check('lower, zero and repeated targets preserve histories', async () => {
  for (const target of [20, 0, 0]) {
    await seed(page, { coins: target, dust: target, reload: false });
    assert.equal(await kvGet('coins'), target);
    assert.equal(await kvGet('bonedust'), target);
    await exportAll();
  }
});
await check('non-demo page remains refused', async () => {
  location.search = '';
  await assert.rejects(seed(page, { coins: 999, reload: false }), /NOT in \?demo/);
  location.search = '?demo';
});
await check('seed refuses an already corrupt fixture before returning', async () => {
  await kvSet('coins', 12345);
  await assert.rejects(seed(page, { reload: false }), /currency history does not match/);
});
console.log(`seed-currency: ${failures ? failures + ' FAILED' : 'clean'}`);
process.exitCode = failures ? 1 : 0;
