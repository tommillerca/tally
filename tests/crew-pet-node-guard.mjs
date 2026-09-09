// Node-only diagnostic: node tests/crew-pet-node-guard.mjs
// This passes on the supplied checkout. It is NOT a reproduction of the
// reported blank or proof of browser visibility. See docs/s2-crewblank.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as art from '../data/boneheadz.js';
import * as pets from '../js/pets.js';
import * as anim from '../js/petanim.js';
import './mem-idb.mjs';
import * as syncHealth from '../js/sync-health.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../js/app.js');
const social = read('../js/social.js');
const server = read('../server/src/index.js');
function cut(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `source seam missing: ${start}`);
  return source.slice(a, b);
}
const clean = x => JSON.parse(JSON.stringify(x));
const serverCtx = vm.createContext({});
// Execute the entire production sanitizer, including its real bounds.
vm.runInContext(cut(server, 'const RACE_RULES =', '\n') + '\n' +
  cut(server, "const RACE_EPOCH = '2026-08-07';", '/* =============== end snapshot bounds'), serverCtx);
vm.runInContext(cut(server, '        const shape = r => {', '\n        /* `truncated`'), serverCtx);

let input, response, uploaded;
const ctx = vm.createContext({ ...art, ...pets, ...anim, ...syncHealth,
  window: { devicePixelRatio: 2 },
  // A different viewer wardrobe must not supply the friend's accessories.
  S: { petWear: { CE: 'CE1' } },
  gameInitSettled: async () => {},
  buildFighter: async () => ({ stats: {}, talents: [], gearLo: {}, petMeta: input.pet }),
  equipped: async () => ({ B: 'B0-1', SK: 'SK0-1', C: input.pet.id }),
  totalXp: async () => 0, levelFor: () => ({ level: 1, name: 'Bonehead' }),
  ownedGearIds: async () => new Set(), earnedBadgeIds: async () => new Set(),
  weekStepsNow: async () => ({ weekKey: '2026-09-04', steps: 0 }),
  petInstances: async () => [{ sp: input.pet.id, shiny: input.pet.shiny, morph: input.pet.morph }],
  petWear: async () => input.wear, championTitle: async () => '',
  platformTag: () => 'web', RACE_RULES: 1,
  kvGet: async (_key, fallback) => fallback, kvSet: async () => {},
  // Transport is replaced at signedFetch, before any network can be used.
  signedFetch: async (method, path, body) => {
    if (method === 'PUT') {
      assert.equal(path, '/profile');
      uploaded = clean(body).snapshot;
      return { ok: true, status: 200, json: async () => ({}) };
    }
    assert.equal(method, 'GET'); assert.equal(path, '/friends');
    return { ok: true, status: 200, json: async () => clean(response) };
  },
  // Avatar composition is a sibling, outside the pet markup being graded.
  avatarLayersHtml: () => '<div class="bh-anim"></div>',
  sparkIco: () => '<svg></svg>',
});
const pieces = [
  cut(social, '// Validate parsed responses', '/* ---------------- account').replaceAll('export ', ''),
  cut(app, 'async function socialSnapshot()', '// Push the public profile snapshot'),
  cut(social, 'export async function syncProfile(', '/* ---------------- full encrypted backup').replaceAll('export ', ''),
  cut(social, 'export async function listFriends()', '// Incoming friend requests').replace('export ', ''),
  cut(app, 'function staticMassScale(', '// Render a static pet image'),
  cut(app, 'const wearOf =', '\n'),
  cut(app, 'function croppedPetImg(', '// Pet sprite:'),
  cut(app, 'const snapPetMorph =', '\n'),
  cut(app, 'function petPortraitHtml(', 'async function refreshShinyPets'),
  cut(app, 'function crewCardArtHtml(', '/* CREW-4:'),
];
vm.runInContext(pieces.join('\n'), ctx);

const jersey = art.BH_ITEMS.find(x => x.file === 'assets/bh/football/pet-jersey.png');
assert(jersey, 'football fixture requires a jersey');
const rows = [
  ['CONTROL C2 base', 'C2', false, 'base', {}],
  ['C6 base', 'C6', false, 'base', {}],
  ['C6 dressed', 'C6', false, 'base', { CE: 'CE1' }],
  ['C6 shiny', 'C6', true, 'base', { CE: 'CE1' }],
  ['C6 midnight', 'C6', false, 'midnight', { CE: 'CE1' }],
  ['C4 football', 'C4', false, 'base', { [jersey.slot]: jersey.id }],
  ['CX football', 'CX', false, 'base', { [jersey.slot]: jersey.id }],
];
let failed = 0;
for (const [name, id, shiny, morph, wear] of rows) {
  try {
    input = { pet: { id, shiny, morph, level: 1, lineage: 0 }, wear };
    const snapshot = await vm.runInContext('socialSnapshot()', ctx);
    assert.deepEqual(clean(snapshot.pet), input.pet, 'snapshot pet fields');
    await ctx.syncProfile(snapshot);
    assert.deepEqual(uploaded.pet, input.pet, 'upload pet fields');
    serverCtx.raw = uploaded;
    const stored = clean(vm.runInContext("sanitizeSnapshot(raw, {}, Date.parse('2026-09-08T12:00:00Z')).snap", serverCtx));
    assert.deepEqual(stored.pet, input.pet, 'sanitized pet fields');
    assert.deepEqual(stored.yard.wear, Object.keys(wear).length ? wear : null, 'sanitized wardrobe');
    serverCtx.me = 'viewer';
    serverCtx.row = { a: 'viewer', b: 'friend', status: 'accepted', b_handle: 'Skull', b_profile: JSON.stringify(stored) };
    const friend = vm.runInContext('shape(row)', serverCtx);
    assert.deepEqual(clean(friend.profile), stored, 'accepted friend profile');
    response = { friends: [friend], incoming: [], outgoing: [] };
    const data = await ctx.listFriends();
    assert.deepEqual(clean(data.friends[0].profile), stored, 'client friend profile');
    const html = ctx.crewCardArtHtml(data.friends[0]);
    const petHtml = html.slice(html.indexOf('<div class="cfan-pet">'));
    assert(petHtml.startsWith('<div class="cfan-pet">'), 'crew pet wrapper');
    assert(!/NaN|Infinity|undefined/.test(petHtml), 'invalid image geometry or value');
    const imgs = [...petHtml.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
    const expected = shiny ? `assets/bh/C/shiny/${id}.png` : pets.morphAsset(id, morph) || art.bhAsset(art.BH_BY_ID[id]);
    const src = imgs[0]?.match(/ src="([^"]+)"/)?.[1];
    assert([expected, art.bhThumb(expected, 192), art.bhThumb(expected, 384)].includes(src), `wrong or missing base image: ${src}`);
    assert.equal(imgs.length, 1 + art.petWornLayers(id, wear).length, 'base and own worn image count');
    const box = petHtml.match(/class="petcrop[^\"]*" style="width:([\d.]+)px;height:([\d.]+)px/);
    assert(box && +box[1] > 0 && +box[2] > 0, 'nonzero crop box');
    // Check the emitted transform against the known crop, without decoding art
    // or pretending this is a CSS layout engine.
    const geo = imgs[0].match(/width:([\d.]+)%;height:([\d.]+)%.*translate\(([-\d.]+)%,([-\d.]+)%\)/);
    assert(geo, 'base image transform');
    const c = art.PET_CROP[id], [w, h, tx, ty] = geo.slice(1).map(Number);
    const bounds = [(c.x0 + tx / 100) * w / 100, (c.y0 + ty / 100) * h / 100,
      (c.x1 + tx / 100) * w / 100, (c.y1 + ty / 100) * h / 100];
    assert(bounds[0] >= 0 && bounds[1] >= 0 && bounds[2] <= 1 && bounds[3] <= 1, 'known ink bounds outside crop box');
    console.log(`PASS ${name}: ${src}; ${box[1]}x${box[2]} box; ${imgs.length} image(s)`);
  } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
console.log(`${rows.length - failed}/${rows.length} Node rows passed. Browser paint unverified.`);
process.exitCode = failed ? 1 : 0;
