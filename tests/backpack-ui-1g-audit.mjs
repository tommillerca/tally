import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import { EGG_STEP_THRESHOLD } from '../js/game.js';
import { STEPS_PER_ACTIVE_MIN } from '../js/loot.js';
import { MANUAL_WALKS_PER_DAY } from '../js/wellness.js';
import {INGREDIENT_IDS, INGREDIENTS, POTIONS} from '../js/cooking.js';
import {eggProgress, CRATES, CONSUMABLES, crateOdds, RARITIES} from '../js/loot.js';
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const bp = app.slice(app.indexOf("  if (tab === 'crates') {"), app.indexOf("    $$('.loot-pending', content)", app.indexOf("  if (tab === 'crates') {")) /* v588: the bench and its "Scroll only when" comment left the Backpack for the Wardrobe; the template now ends at the first handler */);
function ingredients(source, inv) {
  const line = source.split('\n').find(l => l.includes('class="ingredient-grid"'));
  return vm.runInNewContext('`'+line.trim()+'`', {INGREDIENT_IDS, INGREDIENTS, ingInv:inv, ingIconHtml:()=>'', esc:x=>x});
}
function checkIngredients(source) {
  for (const inv of [{}, {marrow:8, graveroot:5}]) {
    const html = ingredients(source, inv);
    assert.equal((html.match(/class="ing-cell"/g)||[]).length, 7, 'all seven ingredients must render including zeros');
    for (const id of INGREDIENT_IDS) assert(html.includes(`<span class="ing-n">${inv[id] || 0}</span><span class="ing-name">${INGREDIENTS[id].name}</span>`));
  }
}
checkIngredients(bp);
function checkEggs(source) {
  const start = source.indexOf('eggs.map(e => {'); const expr = source.slice(start, source.indexOf("}).join('')", start) + 11);
  const eggs=[{id:'a',stepsAtStart:100,goal:1000},{id:'b',stepsAtStart:400,goal:2000},{id:'c',goal:0}];
  const html = vm.runInNewContext(expr, {eggs, lifeSteps:600, eggProgress, eggTint:()=>'', crateIcon:()=>'', eggStale:false});
  assert.equal((html.match(/class="t3-egg"/g)||[]).length, 3);
  assert(html.includes('500 / 1,000 steps'));
  assert(html.includes('200 / 2,000 steps'));
  assert(html.includes('data-hatch="c"'));
  assert(!html.includes('data-hatch="a"'));
}
checkEggs(bp);
const cloned = bp.replace('eggProgress(e, lifeSteps)', 'eggProgress(eggs[0], lifeSteps)');
assert.notEqual(cloned,bp);
assert.throws(()=>checkEggs(cloned));
const hidden = bp.replace('INGREDIENT_IDS.map', 'INGREDIENT_IDS.filter(id => (ingInv[id] || 0) > 0).map');
assert.notEqual(hidden,bp);
assert.throws(()=>checkIngredients(hidden));
assert(bp.includes('Object.keys(CRATES).filter'));
assert(bp.includes('POTIONS.map'));
assert(bp.includes('class="bp-eggs"'));
assert(bp.includes('0 owned. Collected eggs will appear here'));
assert(bp.includes('<details class="bp-crate-details">'));
console.log('PASS Backpack: seven rendered ingredients, independent egg records, ready hatch routing, empty/card coverage. CONTROL zero filtering and cloned progress rejected. Browser UNPROVEN.');

const template = bp.slice(bp.indexOf('content.innerHTML = ') + 'content.innerHTML = '.length, bp.lastIndexOf(';'));
function render(extra = {}) {
  return vm.runInNewContext(template, {
    /* v584 put the egg threshold sentence into this template, so the constant
       has to be in scope here or the whole render throws ReferenceError. Taken
       from js/game.js rather than typed, so this harness cannot drift from the
       rule the sentence quotes. */
    EGG_STEP_THRESHOLD, STEPS_PER_ACTIVE_MIN, MANUAL_WALKS_PER_DAY,
    INGREDIENT_IDS, INGREDIENTS, POTIONS, CRATES, CONSUMABLES, crateOdds, RARITIES,
    pendingLoot:[], crates:[], eggs:[], lifeSteps:600, eggStale:false,
    ingInv:{}, bpPotions:{}, boosts:0, boost:0, vigors:0, foodActive:[],
    cook:{slots:[]}, dust:0, invAll:[], pCountTotal:0,
    eggProgress, eggTint:()=>'', crateIcon:()=>'', consumableIcon:()=>'',
    recipeIconHtml:()=>'', ingIconHtml:()=>'', esc:x=>x, ICONS:{dust:()=>''}, ...extra,
  });
}
const empty = render();
assert.equal((empty.match(/class="ing-cell"/g)||[]).length, 7);
assert.equal((empty.match(/class="bp-card"/g)||[]).length, 2+2+POTIONS.length);
assert(!empty.includes('role="progressbar"'));
assert(!empty.includes('data-open="'));
assert.equal((empty.match(/disabled>NONE TO OPEN/g)||[]).length, 2);
const mixed=render({crates:[{id:'d1',crate:'daily'},{id:'d2',crate:'daily'},{id:'g1',crate:'golden'}], bpPotions:{[POTIONS[0].id]:4}, boosts:2, vigors:1});
assert(mixed.includes('data-open="d1"'));
assert(mixed.includes('data-open="g1"'));
assert(mixed.includes('data-open-all="daily"'));
for (const html of [empty,mixed]) {
  const surface = html.replace(/<details class="bp-crate-details">[\s\S]*?<\/details>/g,'');
  assert(!surface.includes('Crate odds'));
  assert(!surface.includes('data-open-all'));
  assert(html.indexOf('data-lab-open') < html.indexOf('class="bp-grid"'));
  for (const p of POTIONS) assert(html.includes(`data-bp-potion="${p.id}"`));
}
let opened=0;
const handler=app.split('\n').find(l=>l.includes("$$('[data-bp-potion]', content).forEach"));
vm.runInNewContext(handler,{content:{},$$:()=>POTIONS.map(()=>({addEventListener:(event,fn)=>{assert.equal(event,'click');fn();}})),openKitchen:()=>opened++});
assert.equal(opened,POTIONS.length);
console.log(`PASS complete Backpack template: ${2+2+POTIONS.length} inventory cards; empty and mixed counts; odds/bulk confined to details; ${POTIONS.length} potion controls invoke the real Kitchen destination binding.`);
