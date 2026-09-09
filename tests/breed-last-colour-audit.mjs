// Finding 3, frozen work order 2026-09-08. Real bar, review and breed service.
import assert from 'node:assert/strict';
import {D,pet,seed,stable} from './lib/pet-destruction-harness.mjs';
const roster=[pet('a'),pet('b','midnight')];await seed(roster);
const ui=await stable(roster,'breed');
assert.match(ui.bar(),/last Midnight.*collection cell will become empty/,'CONTROL the Breed bar names the last Midnight loss');
await ui.click();await ui.click();
assert.equal((await D.kvGet('petInst')).length,2,'two taps cannot consume the last colour');
assert.match(ui.disclosure,/last Midnight.*collection cell will become empty/);
assert.equal(ui.review.nodes['#pdGo'].disabled,true);
ui.type('breed');await ui.submit();assert.equal((await D.kvGet('petInst')).length,2);
ui.type('DESTROY');await ui.submit();await ui.submit();
const after=await D.kvGet('petInst');assert.equal(after.length,1);assert.equal(after[0].iid,'a');assert.equal(after[0].lineage,1);
assert.equal(ui.results.length,1,'successful typed review opens the result after closing');
console.log('PASS CONTROL: last Midnight is named in bar and typed review, and only explicit consent consumes it');
// A real spare keeps the normal two taps, including a shiny Base keeper.
const duplicates=[pet('a','base',{shiny:true}),pet('b')];await seed(duplicates);
const quick=await stable(duplicates,'breed');await quick.click();assert.equal(quick.sheets.length,0);
await quick.click();assert.equal((await D.kvGet('petInst'))[0].shiny,true);
// Stock moving while an ordinary two-tap review is open must escalate too.
const three=[pet('a'),pet('b','midnight'),pet('c','midnight')];await seed(three);
const changed=await stable(three,'breed');await changed.click();
await D.kvSet('petInst',three.slice(0,2));await changed.click();
assert.equal((await D.kvGet('petInst')).length,2);assert.match(changed.disclosure,/last Midnight/);
changed.cancel();assert.equal((await D.kvGet('petInst')).length,2);
console.log('PASS CONTROL: spare path and shiny keeper survive; newly last colour re-presents and cancellation spends nothing');
