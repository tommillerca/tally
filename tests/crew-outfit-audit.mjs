// Frozen fix-crew-outfit regression. Node only, no network or pixel claims.
// Pre-fix: 2/7 pass. Both pet change handlers write locally but schedule zero
// uploads. Body football CONTROL passes. Trace and proof: docs/fix-crew-outfit.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => readFileSync(resolve(root, p), 'utf8');
const imp = p => import(pathToFileURL(resolve(root, p)));
await imp('tests/mem-idb.mjs');
const { db, kvGet, kvSet, useDbName } = await imp('js/db.js');
const loot = await imp('js/loot.js');
const art = await imp('data/boneheadz.js');
const football = await imp('data/football-teams.js');
const pets = await imp('js/pets.js');
const app = read('js/app.js'), social = read('js/social.js'), server = read('server/src/index.js');
function cut(src, start, end) {
  const a = src.indexOf(start), b = src.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `source seam missing: ${start}`);
  return src.slice(a, b);
}
const clean = x => JSON.parse(JSON.stringify(x));
const srv = vm.createContext({});
vm.runInContext(cut(server, 'const RACE_RULES =', '\n') + '\n' +
  cut(server, "const RACE_EPOCH = '2026-08-07';", '/* =============== end snapshot bounds') + '\n' +
  cut(server, '        const shape = r => {', '\n        /* `truncated`'), srv);
let pending = new Map(), nextTimer = 0, uploaded, response, pushes = 0, online = true;
const handlers = {}, outfitCalls = [], petCalls = [];
let petMeta = { id: 'C4', level: 1, shiny: false, lineage: 0, morph: 'base' };
const buttons = {
  '[data-petwear]': { dataset: {}, addEventListener: (event, fn) => { assert.equal(event, 'click'); handlers.wear = fn; } },
  '[data-pwteam]': { dataset: {}, closest: () => ({ dataset: { pwsp: 'C4' } }), addEventListener: (event, fn) => { assert.equal(event, 'click'); handlers.team = fn; } },
};
const ctx = vm.createContext({ ...art, ...football, ...pets, ...loot,
  S: { settings: {}, petWear: {}, shinyPets: new Set(['C4']) },
  kvGet, kvSet, gameInitSettled: async () => {},
  buildFighter: async () => ({ stats: {}, talents: [], gearLo: {}, petMeta }),
  totalXp: async () => 0, levelFor: () => ({ level: 1, name: 'Bonehead' }),
  ownedGearIds: async () => new Set(), earnedBadgeIds: async () => new Set(),
  weekStepsNow: async () => ({ weekKey: '2026-09-04', steps: 0 }),
  petInstances: async () => [{ sp: petMeta.id, shiny: petMeta.shiny, morph: 'base' }],
  championTitle: async () => '', platformTag: () => 'web', RACE_RULES: 1, APP_SOCIAL_V: 'test',
  setTimeout: (fn, ms) => { assert.equal(ms, 1200); const id = ++nextTimer; pending.set(id, fn); return id; },
  clearTimeout: id => pending.delete(id),
  signedFetch: async (method, path, body) => {
    if (method === 'PUT') {
      assert.equal(path, '/profile'); uploaded = clean(body.snapshot); pushes++;
      srv.raw = uploaded;
      const stored = vm.runInContext("sanitizeSnapshot(raw, {}, Date.parse('2026-09-09T12:00:00Z')).snap", srv);
      assert.deepEqual(clean(stored.outfit), uploaded.outfit, 'sanitizer preserves real outfit');
      assert.deepEqual(clean(stored.yard.wear), uploaded.yard.wear, 'sanitizer preserves real pet kit');
      srv.me = 'viewer'; srv.row = { a: 'viewer', b: 'friend', status: 'accepted', b_handle: 'Friend', b_profile: JSON.stringify(stored) };
      response = { friends: [vm.runInContext('shape(row)', srv)], incoming: [], outgoing: [] };
      return { ok: true, json: async () => ({}) };
    }
    assert.equal(method, 'GET'); assert.equal(path, '/friends');
    return { ok: true, json: async () => clean(response) };
  },
  $$: selector => { assert(buttons[selector], selector); return [buttons[selector]]; },
  body: {}, popSound: () => {}, render: () => {}, toast: () => {}, saveSettings: () => {},
  refreshPetWear: async () => { ctx.S.petWear = await loot.petWear(); },
  // Capture the remote figure contract at the renderer boundary.
  petPortraitHtml: (id, px, shiny, opts) => { petCalls.push({ id, shiny, opts: clean(opts) }); return '<pet>'; },
  petSpriteHtml: (id, px, moving, opts) => { petCalls.push({ id, shiny: opts.shiny, opts: clean(opts) }); return '<pet>'; },
  nameWithAlias: () => 'Friend', hasFightableStats: () => false,
  esc: x => String(x), ICONS: { coin: () => '' },
  openSheet: () => { throw new Error('PROFILE_RENDERED'); },
  weaponSheenHtml: () => '', EMBER_EYES: new Set(),
});
vm.runInContext([
  cut(social, '// Validate parsed responses', '/* ---------------- account').replaceAll('export ', ''),
  cut(app, 'async function socialSnapshot()', '// Push the public profile snapshot'),
  cut(social, 'export async function syncProfile(', '/* ---------------- full encrypted backup').replace('export ', ''),
  cut(social, 'export async function listFriends()', '// Incoming friend requests').replace('export ', ''),
  cut(app, 'let _profilePushT =', 'function pitBeatKeys'),
  cut(app, 'const footballTintHtml =', '// A leaderboard/podium row'),
  cut(app, 'const snapPetMorph =', '\n'),
  cut(app, 'function crewCardArtHtml(', '/* CREW-4:'),
].join('\n'), ctx);
// Execute the real profile template, stopping before its DOM wiring.
vm.runInContext(cut(app, 'function openFriendProfile(', '\nfunction '), ctx);
ctx.social = { isOnline: async () => online, syncProfile: ctx.syncProfile };
vm.runInContext('let petRailTeam = null; let ownedCos = new Set();', ctx);
vm.runInContext(cut(app, "    $$('[data-petwear]', body)", '    /* ONE LISTENER ON THE ROW'), ctx);
const realAvatar = ctx.avatarLayersHtml;
ctx.avatarLayersHtml = (eq, opts) => { outfitCalls.push({ eq: clean(eq), opts }); return realAvatar(eq, opts); };
async function flush() { const jobs = [...pending.values()]; pending.clear(); for (const fn of jobs) await fn(); }
async function checkRemote() {
  const data = await ctx.listFriends(), f = data.friends[0];
  assert(f, 'nonempty friend response');
  assert.deepEqual(clean(f.profile.outfit), await loot.equipped());
  assert.deepEqual(clean(f.profile.yard.wear), Object.keys(await loot.petWear()).length ? await loot.petWear() : null);
  outfitCalls.length = petCalls.length = 0;
  const html = ctx.crewCardArtHtml(f);
  assert.throws(() => ctx.openFriendProfile(f, () => {}), /PROFILE_RENDERED/);
  assert.equal(outfitCalls.length, 2, 'card and profile executed');
  for (const call of outfitCalls) { assert.deepEqual(call.eq, clean(f.profile.outfit)); assert.equal(call.opts.foreign, true); }
  assert.equal(petCalls.length, 2);
  for (const call of petCalls) { assert.equal(call.shiny, petMeta.shiny); assert.deepEqual(call.opts.wear, clean(f.profile.yard.wear)); }
  return html;
}
const teams = football.FOOTBALL_TEAMS.slice(0, 2);
// Derive garment keys from the real catalogue, not from a guessed slot list.
const petKits = teams.map(t => art.BH_ITEMS.find(i => i.football?.team === t.id && i.file === 'assets/bh/football/pet-jersey.png'));
const bodyKit = art.BH_ITEMS.find(i => i.football && i.slot === 'H');
assert(bodyKit && petKits.every(Boolean), 'SETUP football catalogue fixtures exist');
useDbName('crew-outfit-audit');
for (const item of [bodyKit, ...petKits]) await db.put('inv', { id: item.id, kind: 'cos', itemId: item.id });
ctx.owned = new Set([bodyKit, ...petKits].map(i => i.id));
vm.runInContext('ownedCos = owned', ctx);
let failures = 0, total = 0;
async function test(name, fn) { total++; try { await fn(); console.log(`PASS ${name}`); } catch (e) { failures++; console.error(`FAIL ${name}: ${e.message}`); } }
await test('CONTROL body football survives publish, sanitizer, friends, card and profile', async () => {
  // Drive the production wardrobe callback through its save and publish statements.
  ctx.slot = bodyKit.slot; ctx.cell = { dataset: { equip: bodyKit.id } };
  const save = cut(app, '    const doEquip = async cell => {', '      /* GEAR CAME OFF');
  await vm.runInContext(save + '\n}; doEquip(cell);', ctx);
  assert.equal(pending.size, 1); await flush();
  const html = await checkRemote();
  assert(html.includes('football/helmet.png') && html.includes('fb-tint'), 'actual avatar emits football kit and tints');
});
await test('pet garment equip publishes within the existing debounce', async () => {
  buttons['[data-petwear]'].dataset.petwear = petKits[0].id;
  await handlers.wear();
  assert.equal((await loot.petWear())[petKits[0].slot], petKits[0].id, 'local write reached');
  assert.equal(pending.size, 1, 'saved pet outfit scheduled no profile push');
  await flush(); await checkRemote();
});
await test('pet football team change publishes the new colourway', async () => {
  await kvSet('petWear', { [petKits[0].slot]: petKits[0].id }); await ctx.refreshPetWear();
  buttons['[data-pwteam]'].dataset.pwteam = teams[1].id;
  await handlers.team();
  assert.equal((await loot.petWear())[petKits[1].slot], petKits[1].id, 'team write reached');
  assert.equal(pending.size, 1, 'saved team scheduled no profile push');
  await flush(); await checkRemote();
});
await test('unequip publishes bare; refused garment schedules nothing', async () => {
  await kvSet('petWear', { [petKits[0].slot]: petKits[0].id });
  buttons['[data-petwear]'].dataset.petwear = petKits[0].id;
  await handlers.wear(); assert.equal(pending.size, 1); await flush(); await checkRemote();
  buttons['[data-petwear]'].dataset.petwear = 'missing';
  await handlers.wear(); assert.equal(pending.size, 0);
});
await test('rapid garment changes coalesce and preserve snapshot shiny', async () => {
  await kvSet('petWear', {});
  petMeta = { ...petMeta, shiny: true };
  ctx.S.shinyPets = new Set();
  buttons['[data-petwear]'].dataset.petwear = petKits[0].id;
  const before = pushes;
  await handlers.wear(); await handlers.wear(); await handlers.wear();
  assert.equal(pending.size, 1);
  await flush(); assert.equal(pushes, before + 1); await checkRemote();
});
await test('unchanged and unavailable team choices do not publish', async () => {
  buttons['[data-pwteam]'].dataset.pwteam = teams[0].id;
  await handlers.team(); assert.equal(pending.size, 0);
  buttons['[data-pwteam]'].dataset.pwteam = football.FOOTBALL_TEAMS[2].id;
  await handlers.team(); assert.equal(pending.size, 0);
});
await test('offline changes remain local without a transport attempt', async () => {
  online = false;
  const before = pushes;
  await handlers.wear(); assert.equal(pending.size, 1);
  await flush(); assert.equal(pushes, before);
});
console.log(`${total - failures}/${total} passed; ${pushes} captured profile uploads; pixel review owed.`);
process.exitCode = failures ? 1 : 0;
