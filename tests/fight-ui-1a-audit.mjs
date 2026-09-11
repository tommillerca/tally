import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const expr = app.match(/const fightPetName = ([^;]+);/)?.[1];
assert.ok(expr, 'SETUP Fight HUD must resolve the equipped instance nickname');
for (const [nicks, expected] of [[{ pet1: 'Bumbleseal' }, 'Bumbleseal'], [{}, 'Seal'], [{ pet2: 'Other pet' }, 'Seal']]) {
  assert.equal(vm.runInNewContext(expr, { fightPetNicks: nicks, fighter: { petMeta: { iid: 'pet1' } }, petBody: { name: 'Seal' } }), expected);
}
assert.match(app, /class="petname">\$\{esc\(fightPetName\)\}/);
const items = app.match(/<button class="fight-act items" id="itemsOpen"[^\n]+/)[0];
assert.match(items, /<b>ITEMS<\/b><\/button>/);
assert.match(items, /canDrink/);
assert.match(app, /class="fight-venue">\$\{esc\(venue\)\}/);
console.log('PASS fight 1A: instance nickname, unnamed fallback, escaped HUD, simple ITEMS and live venue');

// CONTROL: a species-keyed lookup must fail the instance nickname assertion.
const wrongKey = expr.replace('fighter.petMeta?.iid', 'fighter.petMeta?.id');
assert.notEqual(wrongKey, expr, 'CONTROL mutation must hit the production expression');
assert.throws(() => assert.equal(vm.runInNewContext(wrongKey, {
  fightPetNicks: { pet1: 'Bumbleseal' },
  fighter: { petMeta: { iid: 'pet1', id: 'C1' } },
  petBody: { name: 'Seal' },
}), 'Bumbleseal'), assert.AssertionError);
console.log('PASS CONTROL: species-keyed nickname lookup is rejected');
