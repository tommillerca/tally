/* Execute the full production profile renderer without a browser or sockets.
 * CONTROL: the sheet, equipped pet and visit callback must still work.
 * Prove red by restoring the old fp-yard-row markup in js/app.js.
 * This grades generated markup and wiring, not browser layout or the field.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const source = app.match(/^function openFriendProfile\([^]*?^}/m)?.[0];
assert.ok(source, 'CONTROL production profile renderer exists');
let html, visit, visited, portrait;
const context = vm.createContext({
  BH_BY_ID: { C4: { name: 'Pet' } },
  esc: String, nameWithAlias: f => f.name,
  hasFightableStats: () => false,
  avatarLayersHtml: () => '<div class="avatar-control"></div>',
  snapPetMorph: p => p.morph || 'base',
  // Keep the former row executable during the red mutation.
  isMorph: m => m === 'ember', petPortraitHtml: () => '<img class="row-control">',
  petSpriteHtml: (id, size, flip, opts) => {
    portrait = { id, size, opts };
    return '<img class="equipped-control">';
  },
  ICONS: { coin: () => '', pit: () => '' },
  openSheet: markup => { html = markup; return {}; },
  $: selector => selector === '#fpYardGo' && html.includes('id="fpYardGo"')
    ? { addEventListener: (event, fn) => { assert.equal(event, 'click'); visit = fn; } }
    : null,
  openFriendPaddock: f => { visited = f; },
});
vm.runInContext(source, context);
const wear = { CH: 'CH1' };
const pet = { id: 'C4', level: 8, shiny: true, morph: 'ember' };
const sample = [{ sp: 'C4', shiny: true, morph: 'ember' }];
let passed = 0, failed = 0;
function check(label, run) {
  try { run(); passed++; console.log(`PASS ${label}`); }
  catch (error) { failed++; console.log(`FAIL ${label}: ${error.message}`); }
}
for (const [label, yard, count] of [
  ['sampled total', { n: 12, pets: sample, wear }, '12 PETS'],
  ['empty sample with pets owned', { n: 12, pets: [], wear }, '12 PETS'],
  ['singular total', { n: 1, pets: sample, wear }, '1 PET'],
  ['empty paddock', { n: 0, pets: [], wear }, null],
  ['zero total with stale sample', { n: 0, pets: sample, wear }, null],
  ['legacy profile', undefined, null],
  ['malformed yard', {}, null],
]) check(label, () => {
  html = ''; visit = visited = portrait = null;
  const friend = { name: 'Crew friend', profile: { yard, pet } };
  context.openFriendProfile(friend, () => {});
  assert.ok(html.includes('class="fp-facts"'), 'CONTROL profile sheet renders');
  assert.ok(html.includes('class="fp-pet"'), 'CONTROL equipped pet remains');
  assert.equal(portrait.id, pet.id);
  assert.equal(portrait.opts.shiny, true);
  assert.equal(portrait.opts.morph, 'ember');
  assert.equal(portrait.opts.wear, yard?.wear || null, 'equipped pet keeps friend wardrobe');
  assert.equal(/fp-yard-(?:row|pet|more)\b/.test(html), false, 'no per-pet portrait row or overflow note');
  assert.equal(html.includes('class="fp-yard"'), count !== null);
  if (count) {
    assert.ok(html.includes(`<div class="fp-yard-h"><span>THEIR PADDOCK</span><b>${count}</b></div>`));
    assert.ok(html.includes('class="btn ghost fp-yard-go"'));
    assert.ok(html.includes('Visit their paddock ›</button>'));
    assert.equal(typeof visit, 'function', 'CONTROL visit handler exists');
    visit();
    assert.equal(visited, friend, 'visit opens this friend paddock');
  } else {
    assert.equal(html.includes('id="fpYardGo"'), false);
    assert.equal(visit, null);
  }
});
check('deleted selectors have no CSS rules', () => {
  assert.equal(/\.fp-yard-(?:row|pet|more)\b/.test(css), false);
});
console.log(`CREW YARD ROW: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
