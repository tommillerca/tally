/* S1: execute the shipped snapshot and Crew markup without booting a browser.
 * CONTROL: pet.wear is absent while yard.wear is populated, as on real profiles.
 * Revert only crewCardArtHtml's wear argument to p.pet.wear || null to prove red.
 * This proves serialization and markup, never HTTP status or visible pixels.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import * as art from '../data/boneheadz.js';
import { morphAsset, isMorph } from '../js/pets.js';
import { ANIMATED_PETS, petMassScale } from '../js/petanim.js';

const root = new URL('../', import.meta.url);
const app = readFileSync(new URL('js/app.js', root), 'utf8');
function source(name) {
  const match = app.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'));
  assert.ok(match, `SETUP production function ${name} exists`);
  return match[0];
}
function declaration(name) {
  const match = app.match(new RegExp(`^const ${name} = [^\\n]+;`, 'm'));
  assert.ok(match, `SETUP production declaration ${name} exists`);
  return match[0];
}
const helmet = Object.values(art.BH_BY_ID).find(x => x.slot === 'CH' && x.football);
const jersey = Object.values(art.BH_BY_ID).find(x => x.slot === 'CT' && x.football);
assert.ok(helmet && jersey, 'CONTROL real football pet garments exist');
const beeWear = { CE: 'CE1', CB: 'CB1', CG: 'CG1', CM: 'CM1' };
const kitWear = { CH: helmet.id, CT: jersey.id };
let current;
const context = vm.createContext({
  ...art, morphAsset, isMorph, ANIMATED_PETS, petMassScale,
  window: { devicePixelRatio: 2 }, S: { petWear: beeWear },
  sparkIco: () => '', avatarLayersHtml: () => '',
  gameInitSettled: async () => {}, buildFighter: async () => ({ petMeta: current.pet }),
  equipped: async () => ({}), totalXp: async () => 0, ownedGearIds: async () => [],
  earnedBadgeIds: async () => new Set(), weekStepsNow: async () => ({}),
  petInstances: async () => [{ iid: 'private-instance', sp: current.pet.id }],
  petWear: async () => current.wear, levelFor: () => ({ level: 1, name: 'Bonehead' }),
  platformTag: () => 'web', RACE_RULES: 1, championTitle: async () => '',
});
vm.runInContext([
  declaration('wearOf'), declaration('snapPetMorph'),
  ...['staticMassScale', 'petScale', 'croppedPetImg', 'petPortraitHtml',
    'crewCardArtHtml', 'socialSnapshot'].map(source),
].join('\n'), context);
// Run the detail sheet's actual wardrobe selection to pin the shared source.
const detail = source('openFriendProfile');
const wearStart = detail.indexOf('  const yard =');
const wearEnd = detail.indexOf('  const yardHtml =', wearStart);
assert.ok(wearStart >= 0 && wearEnd > wearStart, 'CONTROL detail wardrobe slice exists');
const detailWear = vm.runInContext(`p => { ${detail.slice(wearStart, wearEnd)} return yardWear; }`, context);
const images = html => [...html.matchAll(/<img\b[^>]* src="([^"]+)"/g)].map(m => m[1]);
let failures = 0;
async function check(label, run) {
  try { await run(); console.log(`PASS ${label}`); }
  catch (error) { failures++; console.log(`FAIL ${label}: ${error.message}`); }
}
for (const dpr of [2, 3]) {
  context.window.devicePixelRatio = dpr;
  for (const [label, id, wear, shiny, morph] of [
    ['C6 bare', 'C6', null, false, 'base'],
    ['C6 accessories', 'C6', beeWear, false, 'base'],
    ['C4 tinted kit', 'C4', kitWear, false, 'base'],
    // C6 is excluded from SHINY_ART; C4 is a supported shiny instance.
    ['C4 shiny kit', 'C4', kitWear, true, 'base'],
    ['C6 morph accessories', 'C6', beeWear, false, 'ember'],
  ]) await check(`${label} DPR ${dpr}`, async () => {
    current = { pet: { id, level: 8, shiny, morph }, wear };
    const p = JSON.parse(JSON.stringify(await context.socialSnapshot()));
    assert.equal(p.pet.wear, undefined, 'CONTROL pet.wear stays absent on the wire');
    assert.deepEqual(p.yard.wear, wear, 'CONTROL wardrobe reaches the friends-only yard');
    assert.equal(detailWear(p), p.yard.wear, 'detail sheet reads this wardrobe');
    const html = context.crewCardArtHtml({ profile: p });
    const urls = images(html);
    const worn = art.petWornLayers(id, wear);
    assert.equal(urls.length, 1 + worn.length,
      `pet.wear=undefined: expected base plus ${worn.length} worn layers, got ${urls.length}`);
    const untier = u => u.replace(/\/thumb\/(192|384)\//, '/');
    assert.deepEqual(urls.slice(1).map(untier), worn, 'real accessories in layer order');
    const base = shiny ? `assets/bh/C/shiny/${id}.png` : morphAsset(id, morph) || art.bhAsset(art.BH_BY_ID[id]);
    assert.equal(untier(urls[0]), base, 'base/shiny/morph art survives Crew path');
    const tints = art.petWornTints(id, wear).flat().filter(Boolean);
    assert.equal((html.match(/class="fb-tint pw"/g) || []).length, tints.length);
    for (const tint of tints) assert.ok(html.includes(`background:${tint.hex}`), 'team tint preserved');
    const masks = [...html.matchAll(/--fbm:url\('([^']+)'\)/g)].map(m => m[1]);
    assert.deepEqual(masks.map(untier), tints.map(t => t.mask), 'registered tint masks');
    for (const url of [...urls, ...masks]) assert.ok(existsSync(new URL(url, root)), `asset on disk: ${url}`);
    if (label === 'C6 bare') console.log(`TRACE C6 DPR ${dpr}: ${urls[0]} (filesystem only; HTTP unproven)`);
  });
}
for (const yard of [undefined, null, {}, { wear: beeWear }, { pets: [], wear: null }]) {
  await check(`legacy/malformed yard ${JSON.stringify(yard)}`, () => {
    const p = { pet: { id: 'C6' }, yard };
    assert.equal(detailWear(p), null);
    assert.equal(images(context.crewCardArtHtml({ profile: p })).length, 1,
      'friend must never inherit the viewer wardrobe');
  });
}
await check('CONTROL an absent pet produces no pet art', () => {
  assert.equal(images(context.crewCardArtHtml({ profile: {} })).length, 0);
});
console.log(failures ? `CREW PET AUDIT FAILED: ${failures}` : 'CREW PET SNAPSHOT AND MARKUP VERIFIED');
process.exitCode = failures ? 1 : 0;
