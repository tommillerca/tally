// Finding 2, frozen work order 2026-09-08. CONTROL drives the real open review,
// health sync, creditEquippedPetSteps and submit, including the real review UI.
import assert from 'node:assert/strict';
import {D,L,pet,seed,stable,dateKey} from './lib/pet-destruction-harness.mjs';
const roster=[pet('a'),pet('b')];
await seed(roster,{petLvlSteps:{a:100,b:0},petEquipped:'a',equipped:{C:'C1'}});
const ui=await stable(roster);await ui.click();
assert.match(ui.disclosure,/100 banked steps/);ui.type('DESTROY');
await D.db.put('health',{date:dateKey(),steps:1000});await L.creditEquippedPetSteps();
assert.equal((await D.kvGet('petLvlSteps')).a,1100);
await ui.submit();
assert.equal((await D.kvGet('petInst')).length,2,'CONTROL stale 100-step approval must preserve the now-1100-step pet');
assert.equal((await D.kvGet('petLvlSteps')).a,1100);
assert.equal(await D.kvGet('bonedust',0),0);
assert.match(ui.disclosure,/1,100 banked steps/);
assert.match(ui.review.nodes['#pdStatus'].textContent,/changed/);
assert.equal(ui.review.nodes['#pdIn'].value,'');assert.equal(ui.review.nodes['#pdGo'].disabled,true);
await ui.submit();assert.equal((await D.kvGet('petInst')).length,2);
ui.type('DESTROY');await ui.submit();await ui.submit();
assert.equal((await D.kvGet('petInst')).length,1);assert.equal(await D.kvGet('bonedust'),60);
console.log('PASS CONTROL: stale review refuses, re-presents 1,100 steps, clears consent, then destroys exactly once');
// CONTROL: a genuinely unequipped spare takes the quick path. A nickname
// arriving between taps stales its quote and requires a fresh typed review.
await seed(roster,{petEquipped:'b',equipped:{C:'C1'}});
const quick=await stable(roster);await quick.click();
assert.equal(quick.button.dataset.armed,'a','SETUP quick path must arm the selected spare');
assert.equal(quick.sheets.length,0,'SETUP first tap must not open a typed review');
assert.equal(quick.button.destructionQuote.equipped,false);
await L.setPetNick('a','BISCUIT');await quick.click();
assert.equal((await D.kvGet('petInst')).length,2);
assert.equal(await D.kvGet('bonedust',0),0);
assert.equal(quick.button.dataset.armed,undefined);
assert.equal(quick.sheets.length,1);
assert.match(quick.disclosure,/nickname BISCUIT is lost/);
assert.match(quick.review.nodes['#pdStatus'].textContent,/changed/);
assert.equal(quick.review.nodes['#pdGo'].disabled,true);
await quick.submit();assert.equal((await D.kvGet('petInst')).length,2);
quick.type('DESTROY');await quick.submit();
assert.equal((await D.kvGet('petInst')).length,1);
assert.equal(await D.kvGet('bonedust'),60);
console.log('PASS CONTROL: armed quick quote rejects a new nickname, preserves the pet, then requires fresh typed consent');
// A pending health delta belongs only to the equipped companion. It must not
// invent investment on the unequipped spare or block its valid quick quote.
await seed(roster,{petEquipped:'b',equipped:{C:'C1'}});
const health=await stable(roster);await health.click();
assert.equal(health.button.dataset.armed,'a');assert.equal(health.sheets.length,0);
await D.db.put('health',{date:dateKey(),steps:1000});
assert.equal((await L.quotePetDestruction('a')).quote.bankedSteps,0);
assert.equal((await L.quotePetDestruction('b')).quote.bankedSteps,1000);
await health.click();
assert.deepEqual((await D.kvGet('petInst')).map(p=>p.iid),['b']);
assert.equal(health.sheets.length,0);assert.equal(await D.kvGet('bonedust'),60);
console.log('PASS CONTROL: 1,000 pending health steps belong to equipped b; unequipped a completes the quick path');
