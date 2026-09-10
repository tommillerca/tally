// R6-C1/C5: real destruction services and production UI over mem-idb/DOM doubles.
// CONTROL: supported and null morphs, safe duplicates, and an independent 7-cell
// census. No browser layout claim. The original handoff rows were not supplied;
// this fixture preserves every listed hostile trait and the required total.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {D,L,P,pet,seed,stable} from './lib/pet-destruction-harness.mjs';
import {labMorph,labInput} from '../js/laboratory.js';
import {BH_BY_ID} from '../data/boneheadz.js';
const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const loot=readFileSync(new URL('../js/loot.js',import.meta.url),'utf8');
function block(source,from,to) {
  const a=source.indexOf(from),b=source.indexOf(to,a);
  assert(a>=0&&b>a,`CONTROL production block exists: ${from}`);
  return source.slice(a,b);
}
const labCellKey=vm.runInNewContext(block(loot,'const labCellKey =','const labPlain =')+';labCellKey',{...P,labMorph});
const species=['C1','C2','C3','C4','C5','C6'];
const colours=['base','ember','frost','toxic','rose','midnight'];
// Count grid occupancy directly, independently of either production helper.
const cells=roster=>species.flatMap(sp=>colours.filter(m=>roster.some(p=>p.sp===sp &&
  (p.shiny ? m==='base' : p.morph==null || p.morph==='' ? m==='base' : p.morph===m))).map(m=>`${sp}|${m}`)).sort();
const pairCells=roster=>[...P.ownedPairs(roster)].filter(k=>species.some(sp=>colours.some(m=>k===`${sp}|${m}`))).sort();
const hostile=[...colours.map((m,i)=>pet(`c1-${i}`,m)),pet('cx','base',{sp:'CX'}),
  pet('unsupported','sparkle',{sp:'C3'}),pet('null',null),pet('shiny-ember','ember',{shiny:true}),
  pet('shiny-unsupported','sparkle',{sp:'C2',shiny:true}),pet('c1-1','frost')];
let passed=0,failed=0;
async function check(name,fn) {
  try {await fn();passed++;console.log(`PASS ${name}`);}
  catch(e){failed++;console.error(`FAIL ${name}: ${e.message}`);}
}
await check('CONTROL hostile roster keeps seven cells on door, aria-label, heading and filled dots',async()=>{
  const expected=['C1|base','C1|ember','C1|frost','C1|midnight','C1|rose','C1|toxic','C2|base'];
  assert.deepEqual(cells(hostile),expected);
  assert.deepEqual(pairCells(hostile),expected);
  assert.equal(P.ownedCellCount(P.ownedPairs(hostile),species),7);
  const KENNEL_SPECIES=species.map(id=>BH_BY_ID[id]),body={innerHTML:'',scrollTop:0},empty=()=>'';
  const context=vm.createContext({...P,body,insts:hostile,labStock:null,KENNEL_SPECIES,
    rememberKin:empty,opts:{},st:{ready:true,dust:0},pair:false,sel:[],roster:hostile,cfWasPanelled:false,
    openIid:null,cfCards:'',cfWear:'',cfCaption:'',cfActs:'',petPortraitHtml:empty,pixCur:empty,bhIcon:empty,
    t1Stroke:empty,ICONS:{paw:empty,dust:empty}});
  vm.runInContext(block(app,'    const kennelOwned = ownedPairs(insts);','\n    body.scrollTop = bodyScroll;'),context);
  assert.match(body.innerHTML,/<b>Kennel<\/b><small aria-label="7 of 36 colours collected">7 of 36<\/small>/);
  const kennel=vm.createContext({...P,KENNEL_SPECIES,BH_BY_ID,openSheet:()=>({}),
    petInstances:async()=>hostile,$:()=>body,$$:()=>[],wireLabLinks:empty,esc:String,
    morphSwatch:()=>'',croppedPetImg:()=>'<img>',ICONS:{lock:empty}});
  await vm.runInContext(block(app,'async function openKennel()','\nif (typeof window')+';openKennel()',kennel);
  assert.match(body.innerHTML,/Collection &middot; 7 \/ 36/);
  assert.equal([...body.innerHTML.matchAll(/class="k-dot on"/g)].length,7);
  assert.equal([...body.innerHTML.matchAll(/class="k-cell"/g)].length,7);
});
await check('hostile roster agrees with labCellKey, including duplicate iid',()=>{
  assert.deepEqual([...new Set(hostile.map(labCellKey).filter(Boolean))].sort(),cells(hostile));
});
for(const sp of species) for(const morph of [null,'sparkle',...colours]) for(const shiny of [false,true]) {
  await check(`cell agreement ${sp}/${String(morph)}/shiny=${shiny}`,()=>{
    const row=pet('one',morph,{sp,shiny}),expected=cells([row]);
    assert.deepEqual(pairCells([row]),expected);
    assert.deepEqual([labCellKey(row)].filter(Boolean),expected);
    assert.equal(L.petLastColourLoss(row,[row]),expected.length===1);
    assert.equal(L.petLastColourLoss(row,[row,{...row,iid:'two'}]),false);
    if(shiny||morph==='sparkle')assert.equal(labInput(row,{}),null,'Laboratory still refuses shiny/unsupported inputs');
  });
}
for(const morph of [null,'sparkle',...colours]) for(const mode of ['destroy','breed']) {
  await check(`visible last-cell warning ${mode}/C2 shiny ${String(morph)}`,async()=>{
    const shiny=pet('shiny',morph,{sp:'C2',shiny:true}),keeper=pet('keeper','frost',{sp:'C2'});
    const roster=mode==='breed'?[keeper,shiny]:[shiny,keeper];
    await seed(roster);
    const ui=await stable(roster,mode);
    if(mode==='breed')assert.match(ui.bar(),/collection cell will become empty/);
    await ui.click();await ui.click();
    assert.match(ui.disclosure,/collection cell will become empty/,'the player must see the collection cell loss');
    assert.match(ui.disclosure,/Its shiny appearance is lost/);
    assert.equal((await D.kvGet('petInst')).length,2,'review has not spent the pet');
    assert.equal(ui.review.nodes['#pdGo'].disabled,true);
    ui.cancel();
    assert.equal((await D.kvGet('petInst')).length,2);
  });
}
for(const morph of [null,'sparkle',...colours]) {
  await check(`C5 safe Base backed by shiny ${String(morph)} has no false last-colour warning`,async()=>{
    const base=pet('base','base',{sp:'C6'}),shiny=pet('shiny',morph,{sp:'C6',shiny:true});
    await seed([base,shiny]);
    const quote=await L.quotePetDestruction(base.iid);
    assert.equal(quote.ok,true);assert.equal(quote.quote.lastCell,false);
    assert.equal(quote.quote.lastAppearance,true);
    const html=vm.runInNewContext(block(app,'// PET DESTRUCTION UI PURE BEGIN','// PET DESTRUCTION UI PURE END')+
      ';petDestructionHtml(q)',{...P,...L,BH_BY_ID,esc:String,q:quote.quote});
    assert.doesNotMatch(html,/last copy of this colour|collection cell will become empty/);
    assert.match(html,/last ordinary Base appearance/);assert.match(html,/shiny pet still preserves the Base collection cell/);
    assert.match(html,/is destroyed and does not come back/,'CONTROL actual production disclosure reached');
    const ui=await stable([base,shiny]);await ui.click();await ui.click();
    assert.doesNotMatch(ui.disclosure,/last copy of this colour|collection cell will become empty/);
    assert.match(ui.disclosure,/last ordinary Base appearance/);
    assert.match(ui.disclosure,/shiny pet still preserves the Base collection cell/);
    assert.equal(ui.sheets.length,0,'safe uninvested Base retains the two-tap path');
    assert.deepEqual((await D.kvGet('petInst')).map(p=>p.iid),['shiny']);
    await seed([base,shiny]);
    const risky=await stable([shiny,base]);await risky.click();await risky.click();
    assert.match(risky.disclosure,/Its shiny appearance is lost/);
    assert.match(risky.disclosure,/last copy of this colour/,'last shiny appearance is still disclosed');
    assert.doesNotMatch(risky.disclosure,/collection cell will become empty/);
    risky.cancel();
    await seed([shiny,base]);
    const breed=await stable([shiny,base],'breed');await breed.click();
    assert.equal(breed.sheets.length,0);assert.equal(breed.button.dataset.armed,'1');
    assert.match(breed.disclosure,/last ordinary Base appearance/);
    assert.match(breed.disclosure,/shiny pet still preserves the Base collection cell/);
    await breed.click();assert.deepEqual((await D.kvGet('petInst')).map(p=>p.iid),['shiny']);
  });
}
await check('CONTROL appearance preservation is limited to collection pets and the last ordinary copy',async()=>{
  for(const roster of [[pet('founder','base',{sp:'CX'}),pet('other')],[pet('a'),pet('b')]]) {
    await seed(roster);const q=(await L.quotePetDestruction(roster[0].iid)).quote;
    assert.equal(q.lastAppearance,false);
    const html=vm.runInNewContext(block(app,'// PET DESTRUCTION UI PURE BEGIN','// PET DESTRUCTION UI PURE END')+
      ';petDestructionHtml(q)',{...P,...L,BH_BY_ID,esc:String,q});
    assert.doesNotMatch(html,/last ordinary Base appearance|shiny pet still preserves/);
  }
});
console.log(`Collection cell audit: ${passed} passed, ${failed} failed`);
process.exitCode=failed?1:0;
