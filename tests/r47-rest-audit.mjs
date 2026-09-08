/* Node-only R47 guards. Executes the real response branch, delivery builder and
 * sheet builders with a fake DB/DOM/clock. No sockets, browser or Worker runtime.
 * Usage: node server/r47-rest.test.mjs [source-checkout]
 * Optional source root supports reverting fixes on throwaway copies for red proof.
 * Gate registration is blocked by N4's strict file ownership. Proposed handoff:
 * move this unchanged to tests/r47-rest-audit.mjs and register in PURE for the
 * rival allowlist, dormant titles and sheet clocks. Browser pixels are unproven.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root = resolve(process.argv[2] || fileURLToPath(new URL('..', import.meta.url)));
const app = readFileSync(resolve(root, 'js/app.js'), 'utf8');
const worker = readFileSync(resolve(root, 'server/src/index.js'), 'utf8');
const cooking = readFileSync(resolve(root, 'js/cooking.js'), 'utf8');
function fn(src, name, optional = false) {
  const start = src.search(new RegExp(`^(?:export )?(?:async )?function ${name}\\(`, 'm'));
  if (optional && start < 0) return '';
  assert.ok(start >= 0, `missing production function ${name}`);
  const end = src.indexOf('\n}', start);
  assert.ok(end > start, `missing end of ${name}`);
  return src.slice(start, end + 2).replace(/^export /, '');
}
let passed = 0, failed = 0;
async function test(name, run) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
const combat = { power: 12, marrow: 11, wind: 10, reflex: 9, hype: 8 };
const outfit = { B: 'B0-1', SK: 'SK0-1', C: 'C1', H: null };
const pet = { id: 'C1', shiny: true, morph: 'base' };
const snapshot = {
  level: 9, levelName: 'Strong', stats: { ...combat, futurePrivate: 'private' },
  talents: ['heavyhands'], outfit: { ...outfit, futurePrivate: 'private' },
  pet: { ...pet, level: 20, lineage: 3, wear: { H: 'private' }, futurePrivate: 'private' },
  weekKey: '2026-09-07', weekSteps: 12345, raceV: 2, plat: 'ios',
  title: 'Warden', gearLo: {}, gear: ['private'], badges: 10,
  yard: { n: 1, pets: [{ sp: 'C1', shiny: true }] }, futurePrivate: 'private',
};
const row = { id: 'sp-1-1', name: 'Test tower', owner: 'defender', owner_name: 'Keeper',
  defender: JSON.stringify(snapshot), claimed_at: 100, tended_at: 200, level: 3,
  siege_until: 9999999999999, siege_name: 'Besieger', owner_test: 0 };
async function spires(rows, auth = { playerId: 'stranger' }) {
  const start = worker.indexOf("      if (path === '/spires' && request.method === 'GET')");
  const end = worker.indexOf('\n      // Take one.', start);
  assert.ok(start > 0 && end > start, 'GET /spires branch missing');
  let reads = 0;
  const context = vm.createContext({
    path: '/spires', request: { method: 'GET' }, url: new URL('https://unused.invalid/spires?ids=sp-1-1'),
    verifySigned: async () => auth,
    env: { DB: { prepare(sql) {
      assert.match(sql, /FROM spires s LEFT JOIN players/);
      return { bind(...ids) { assert.deepEqual(ids, ['sp-1-1']); return { all: async () => { reads++; return { results: structuredClone(rows) }; } }; } };
    } } },
    sweepSieges: async (_env, records) => records,
    json: (body, status = 200) => new Response(JSON.stringify(body), { status }),
  });
  vm.runInContext(fn(worker, 'spireDefender', true), context);
  const response = await vm.runInContext(`(async () => { ${worker.slice(start, end)} })()`, context);
  assert.equal(reads, auth.err ? 0 : 1, 'response path was not exercised');
  return { status: response.status, body: await response.json() };
}
await test('R47-3 rival response contains only combat and appearance fields', async () => {
  const { body, status } = await spires([row]);
  assert.equal(status, 200);
  assert.equal(body.spires.length, 1);
  const d = body.spires[0].defender;
  const expected = ['outfit', 'pet', 'stats', 'talents'];
  assert.deepEqual(Object.keys(d).sort(), expected,
    `unexpected defender fields: ${Object.keys(d).filter(k => !expected.includes(k)).join(', ')}`);
  assert.deepEqual(d, { stats: combat, talents: ['heavyhands'], outfit, pet }, 'nested projection leaks fields or loses fighter/appearance data');
  assert.equal(body.spires[0].ownerName, 'Keeper');
  assert.equal(body.spires[0].siegeUntil, row.siege_until);
});
await test('R47-3 self, flagged owners, absent and malformed defenders stay private', async () => {
  assert.equal((await spires([row], { err: 'unauthorised' })).status, 401);
  assert.equal((await spires([row], { playerId: 'defender' })).body.spires[0].defender, null);
  const hidden = (await spires([{ ...row, owner_test: 1 }])).body.spires[0];
  assert.equal(hidden.owner, null); assert.equal(hidden.ownerName, null); assert.equal(hidden.defender, null);
  for (const defender of [null, 'null', '{', '[]', '42'])
    assert.equal((await spires([{ ...row, defender }])).body.spires[0].defender, null);
});
await test('R47-7 expired siege delivery says dormant while takeover says lost', async () => {
  const cards = [];
  const context = vm.createContext({
    notifyNow: async () => {}, maybeNotifyFriendGrants: () => {}, refresh: () => {},
    openPackReveal: async rows => { cards.push(...rows); },
  });
  vm.runInContext(fn(app, 'drawGrantDelivery'), context);
  const dormant = 'The siege broke through. It stands dormant, not lost: walk back and take it again.';
  await context.drawGrantDelivery({ applied: 2, appliedGrants: [
    { type: 'spire', key: 'siege-lost-sp-1-1-999', payload: { note: dormant } },
    { type: 'spire', key: 'spire-lost-sp-1-1-888', payload: { note: 'A rival took your tower.' } },
  ] });
  assert.equal(cards.length, 2);
  assert.equal(cards[0].name, 'Spire Dormant', `dormant delivery title was "${cards[0].name}"`);
  assert.equal(cards[0].stats, dormant);
  assert.equal(cards[1].name, 'Spire Lost');
});

// The production builders run with a tiny DOM substitute. It grades emitted
// text, clock wiring and lifecycle only. It cannot grade visibility or hit tests.
async function sheetClock(kind) {
  let now = 1000000, nextId = 0, current;
  const timers = new Map();
  const context = vm.createContext({
    spireNow: () => now, esc: String, SPIRE_RADIUS_M: 80,
    equipped: async () => null, petFrom: () => null, wardenTier: () => ({ tier: 0 }),
    social: { displayName: async () => 'Keeper' }, badgePixHtml: () => '',
    ICONS: { star: () => '', coin: () => '', close: () => '' },
    t1Sect: () => '', fmtDist: () => '10 m', composeAvatars: () => {}, document: {},
    $: () => ({ addEventListener() {} }),
    setInterval(cb, ms) { assert.equal(ms, 1000); timers.set(++nextId, cb); return nextId; },
    clearInterval(id) { timers.delete(id); },
    openSheet(html, options) {
      const match = html.match(/class="(?:sc-left|sp-siege-left)">([^<]*)</);
      // The old info sheet embeds the clock directly in prose.
      const old = html.match(/It falls in ([^<]*?) unless/);
      assert.ok(match || old, 'sheet emitted no clock');
      const node = { textContent: (match || old)[1] };
      current = { node, options, querySelectorAll: () => match ? [node] : [] };
      return current;
    },
  });
  vm.runInContext([fn(cooking, 'fmtCookTime'), fn(app, 'startSiegeClock', true),
    fn(app, 'openSiegeSheet'), fn(app, 'openSpireInfoSheet')].join('\n'), context);
  const s = { id: 'sp-1-1', name: 'Test tower', dist: 10 };
  const until = now + 120000;
  if (kind === 'defense') context.openSiegeSheet(s, { level: 3 }, { name: 'Besieger', until });
  else await context.openSpireInfoSheet({ s, view: { tribute: { coins: 180 } }, held: true,
    besieged: true, siegeUntil: until, siegeName: 'Besieger', lvl: 3, heldSince: 1 });
  assert.equal(current.node.textContent, '2m');
  now += 60000;
  for (const tick of timers.values()) tick();
  assert.equal(current.node.textContent, '1m', `${kind} clock stayed at ${current.node.textContent} after 60 seconds`);
  now = until + 1000;
  for (const tick of timers.values()) tick();
  assert.equal(current.node.textContent, '0m', 'expired clock must clamp at zero');
  assert.equal(timers.size, 1, 'sheet must own one clock timer');
  current.options.onClose();
  assert.equal(timers.size, 0, 'closing the sheet leaked its clock timer');
}
await test('R47-8 defense clock ticks, clamps at zero and stops on close', () => sheetClock('defense'));
await test('R47-8 info clock ticks, clamps at zero and stops on close', () => sheetClock('info'));
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
