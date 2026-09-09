// Frozen fix-breed-p0: REAL registered handler, quote and breed service over
// mem-idb. The harness clears currentTarget as soon as dispatch returns.
import assert from 'node:assert/strict';
import {D,pet,seed,stable} from './lib/pet-destruction-harness.mjs';

const roster=[pet('keeper'),pet('feed'),pet('spare-1'),pet('spare-2')];
await seed(roster);
const ui=await stable(roster,'breed');
assert.equal((await D.kvGet('petInst')).length,4);
assert.equal(await D.kvGet('petBreedCredit',null),null);
assert.equal(typeof ui.button.events.click,'function','CONTROL real click listener registered');
await ui.click();
assert.equal(ui.button.dataset.armed,'1');
assert.equal(ui.sheets.length,0,'plain spare uses the existing two-tap path');
assert.match(ui.disclosure,/destroyed for good.*lineage rank/);
assert.deepEqual(await D.kvGet('petInst'),roster,'tap one must not consume a pet');
assert.equal(await D.kvGet('petBreedCredit',null),null,'tap one must not spend cooldown');
console.log('PASS CONTROL tap 1: armed, disclosure shown, roster 4, no breed credit');
await ui.click();
const after=await D.kvGet('petInst');
assert.equal(after.length,3,'tap two must actually consume the feed pet');
assert.deepEqual(after.map(p=>p.iid),['keeper','spare-1','spare-2']);
assert.equal(after[0].lineage,1);
assert.deepEqual(after.slice(1),roster.slice(2),'unselected pets survive unchanged');
assert.equal(await D.kvGet('petBreedCredit',null),0,'real breed writes lifetime step credit, even at zero');
assert.equal(ui.results.length,1);
assert.equal(ui.results[0].iid,'keeper');
console.log('PASS tap 2: roster 4 -> 3, keeper lineage 1, petBreedCredit written as 0, result opened');
