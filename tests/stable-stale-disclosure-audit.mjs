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
// Pending health credit must be quoted too, even without the credit service yet.
await seed(roster,{petEquipped:'a',equipped:{C:'C1'}});
const quick=await stable(roster);await quick.click();
await D.db.put('health',{date:dateKey(),steps:1000});await quick.click();
assert.equal((await D.kvGet('petInst')).length,2);assert.match(quick.disclosure,/1,000 banked steps/);
quick.cancel();assert.equal(await D.kvGet('bonedust',0),0);
console.log('PASS CONTROL: quick confirmation also rejects newly arrived, uncredited health steps');
