// Finding 4, frozen work order 2026-09-08. Typed reviews retain every disclosed loss.
import assert from 'node:assert/strict';
import {D,P,pet,seed,stable} from './lib/pet-destruction-harness.mjs';
let roster=[pet('a'),pet('b')];
await seed(roster,{petNick:{a:'BISCUIT'},petBonds:{a:4}});
const ui=await stable(roster);await ui.click();
assert.match(ui.disclosure,/BISCUIT/,'CONTROL typed review identifies the nickname');
assert.match(ui.disclosure,/nickname BISCUIT is lost/);assert.match(ui.disclosure,/Bond 4\/5 is lost/);
assert.equal(ui.sheets.length,1);assert.equal(ui.review.nodes['#pdGo'].disabled,true);
await ui.submit();assert.equal((await D.kvGet('petNick')).a,'BISCUIT');
ui.type('DESTROY');await ui.submit();assert.equal((await D.kvGet('petNick')).a,undefined);assert.equal((await D.kvGet('petBonds')).a,undefined);
console.log('PASS CONTROL: typed Destroy identifies BISCUIT and names the nickname and bond it removes');
const talent=P.PET_TREES[P.familyOf('C1').key][0].opts[0];
roster=[pet('a','ember',{lineage:2}),pet('b')];
await seed(roster,{petLvlSteps:{a:50000,b:0},pettalents:{__iidV:2,a:[talent.id]},petNick:{a:'<BISCUIT>'},petBonds:{a:4}});
const typed=await stable(roster);await typed.click();
assert.ok(typed.disclosure.includes(talent.name));assert.match(typed.disclosure,/Chosen talents are lost/);
assert.match(typed.disclosure,/50,000 banked steps and lineage 2/);assert.match(typed.disclosure,/&lt;BISCUIT&gt;/);
assert.match(typed.disclosure,/Bond 4\/5 is lost/);assert.match(typed.disclosure,/last copy/);
typed.cancel();assert.equal((await D.kvGet('pettalents')).a[0],talent.id);
console.log('PASS CONTROL: typed Destroy retains training and lineage warnings and names talent, nickname and bond losses');

// R6-G2: same-colour keeper preserves the cell, so this exercises the Breed
// quick confirmation. The warning must still name every investment consumed.
// Known R6-S3 belongs to the app lane. Keep this assertion red until fixed.
roster=[pet('keeper'),pet('feed','base',{lineage:2})];
await seed(roster,{petEquipped:'keeper',equipped:{C:'C1'},petLvlSteps:{keeper:0,feed:50000},
  pettalents:{__iidV:2,feed:[talent.id]},petNick:{feed:'BISCUIT'},petBonds:{feed:4}});
const breed=await stable(roster,'breed');await breed.click();
assert.ok(breed.sheets.length===1 || breed.button.dataset.armed==='1','SETUP breed confirmation must open or arm');
assert.equal((await D.kvGet('petInst')).length,2,'first tap must not consume the feed pet');
const lossChecks=[
  ['banked steps',/50,000 banked steps/],['nickname',/nickname BISCUIT is lost/],
  ['bond',/Bond 4\/5 is lost/],['talents',/Chosen talents are lost/],
  ['talent name',new RegExp(talent.name)],['lineage',/lineage 2/],
];
const missing=lossChecks.filter(([,pattern])=>!pattern.test(breed.disclosure)).map(([name])=>name);
console.log(`OBSERVED R6-S3 breed confirmation: ${breed.disclosure}`);
console.log(`${missing.length?'FAIL':'PASS'} R6-S3 Breed discloses every consumed investment: missing=${missing.join(', ')||'none'}${missing.length?' (expected red, app lane)':''}`);
assert.deepEqual(missing,[],'R6-S3: Breed confirmation must disclose all consumed investment; known app-lane defect');
