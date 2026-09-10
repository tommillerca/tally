// Run 6: real production rendering/listeners and storage services over mem-idb.
// CONTROL paths require successful consent and live data. No browser claims.
// R6_APP_SOURCE selects a disposable pre-fix app.js for six independent RED rows.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {D,L,P,pet,seed,stable,dateKey} from './lib/r6-app-harness.mjs';
import {BH_BY_ID} from '../data/boneheadz.js';
const app=readFileSync(process.env.R6_APP_SOURCE || new URL('../js/app.js',import.meta.url),'utf8');
const esc=x=>String(x);
const context=vm.createContext({...P,...L,...D,BH_BY_ID,esc,
  KENNEL_SPECIES:['C1','C2','C3','C4','C5','C6'].map(id=>BH_BY_ID[id])});
vm.runInContext(app.split('// LAB UI PURE BEGIN:')[1].split('\n').slice(1).join('\n').split('// LAB UI PURE END')[0],context);
vm.runInContext(app.split('// PET DESTRUCTION UI PURE BEGIN')[1].split('// PET DESTRUCTION UI PURE END')[0],context);
let failed=0,passed=0;
async function check(id,fn){try{await fn();passed++;console.log(`PASS CONTROL ${id}`);}catch(e){failed++;console.log(`RED ${id}: ${e.stack}`);}}
const roster=()=>[pet('keep'),pet('feed'),pet('spare')];
await check('R6-S3 stale rendered Breed losses refuse the first tap after real step credit',async()=>{
  const pets=roster();await seed(pets,{petLvlSteps:{keep:0,feed:100,spare:0},petEquipped:'feed',equipped:{C:'C1'}});
  const ui=await stable(pets,'breed');assert.match(ui.panel,/100 banked training steps/);
  await D.db.put('health',{date:dateKey(),steps:20000});await L.creditEquippedPetSteps();
  assert.equal((await D.kvGet('petLvlSteps')).feed,20100);
  assert.doesNotMatch(ui.panel,/20,100/,'CONTROL panel remains the old quote before tap');
  await ui.click();
  assert.equal(ui.renders,2,'stale tap must refuse and render the true losses');
  assert.match(ui.panel,/20,100 banked training steps/);
  assert.equal(ui.button.dataset.armed,undefined);assert.equal(ui.sheets.length,0);
  assert.deepEqual(await D.kvGet('petInst'),pets);assert.equal(await D.kvGet('petBreedCredit',null),null);
  await ui.click();ui.type('DESTROY');
  await D.db.put('health',{date:dateKey(),steps:21000});await L.creditEquippedPetSteps();
  await ui.submit();assert.equal((await D.kvGet('petInst')).length,3);
  assert.match(ui.disclosure,/21,100 banked steps/);
  assert.equal(ui.review.nodes['#pdIn'].value,'');assert.equal(ui.review.nodes['#pdGo'].disabled,true);
  ui.type('DESTROY');await ui.submit();assert.equal((await D.kvGet('petInst')).length,2);
});
await check('R6-R1 Stable door counts durable intents and unseen data, including non-renderable operations',async()=>{
  await seed(roster());
  await D.kvSet('labIntents',{inflight:{}});await D.kvSet('labExperiments',{saved:{},seen:{},inflight:{}});await D.kvSet('labSeen',['seen']);
  const helper=app.indexOf('async function labWaitingCount()');
  if(helper>=0)vm.runInContext(app.slice(helper,app.indexOf('// LAB UI PURE BEGIN:',helper)),context);
  const stockStart=app.indexOf('    const labStock =',app.indexOf('async function openStable'));
  const stockEnd=app.indexOf('    /* OUT WITH YOU',stockStart);
  const countStart=app.indexOf('    const labWaiting =',stockEnd)>=0?app.indexOf('    const labWaiting =',stockEnd):app.indexOf('    const labRoomCount =',stockEnd);
  const countEnd=app.indexOf('    const breedLockNote =',countStart);
  assert.ok(countStart>stockEnd && countEnd>countStart,'CONTROL production door block found');
  const door=async(s)=>{context.laboratoryEngine=()=>({snapshot:async()=>s});return vm.runInContext('(async()=>{'+app.slice(stockStart,stockEnd)+app.slice(countStart,countEnd)+';return {count:labRoomCount,label:labRoomLabel};})()',context);};
  let d=await door({status:'unknown',remaining:0,unseen:[]});
  assert.equal(d.count,'2 waiting');assert.match(d.label,/2 .*waiting/);
  d=await door({status:'unknown',remaining:0,unseen:Array(17).fill({})});assert.equal(d.count,'2 waiting','render list must not control count');
  await D.kvSet('labIntents',{});await D.kvSet('labSeen',['saved','seen','inflight']);
  d=await door({status:'ready',remaining:1,unseen:[]});assert.equal(d.count,'1 today');
  d=await door({status:'unknown',remaining:0,unseen:[]});assert.equal(d.count,'Check status');
});
await check('R6-C3 invested Breed requires typed consent and ordinary surplus retains two taps',async()=>{
  const pets=roster();pets[1].lineage=2;
  await seed(pets,{petLvlSteps:{keep:0,feed:40000,spare:0},petNick:{feed:'Noodle'},petBonds:{feed:3},pettalents:{__iidV:2,feed:['c1_nip']}});
  const ui=await stable(pets,'breed');await ui.click();await ui.click();
  assert.equal((await D.kvGet('petInst')).length,3,'two taps must not spend invested pet');
  assert.equal(ui.review.nodes['#pdGo'].disabled,true);
  ui.type('breed');await ui.submit();assert.equal((await D.kvGet('petInst')).length,3);
  ui.type('DESTROY');await ui.submit();assert.equal((await D.kvGet('petInst')).length,2);
  await seed(roster());const quick=await stable(roster(),'breed');await quick.click();assert.equal(quick.sheets.length,0);await quick.click();assert.equal((await D.kvGet('petInst')).length,2);
});
await check('R6-C2 destruction disclosure names the Base cell of a shiny',async()=>{
  await seed([pet('keep','ember'),pet('feed','base',{shiny:true})]);
  const q=(await L.quotePetDestruction('feed','keep')).quote;
  assert.equal(q.lastCell,true,'CONTROL actual shiny owns the last Base cell');
  const html=context.petDestructionHtml(q);assert.match(html,/Your last Base .*collection cell will become empty/);assert.doesNotMatch(html,/Your last Shiny/);
  assert.match(context.petDestructionHtml({...q,inst:{...q.inst,shiny:false,morph:'ember'}}),/Your last Ember/);
});
await check('R6-R2 incubator purchase agrees with zero extra uses and affordable positive control',()=>{
  const s={capacity:1,used:2,remaining:0,hasExperiment:true,coins:100000,status:'ready'};
  const html=context.labIncubatorHtml(s);assert.match(html,/remaining uses: 0 to 0/);assert.match(html,/<button[^>]+data-lab-buy="2" disabled/);
  const good=context.labIncubatorHtml({...s,used:1});assert.match(good,/remaining uses: 0 to 1/);assert.doesNotMatch(good,/<button[^>]+disabled/);
  assert.match(context.labIncubatorHtml({...s,used:1,coins:0}),/<button[^>]+disabled/);
});
await check('R6-A1 interrupted presentation snapshots keep Today and post-hatch invitations',async()=>{
  await seed(roster());
  const q=(await L.laboratory.quote({iids:['keep','feed']})).quote;
  await D.kvSet('labIntents',{[q.request.opId]:{format:1,createdAt:Date.now(),quote:q.request}});
  const s=await L.laboratory.snapshot({presentationOnly:true});assert.equal(s.status,'unknown');assert.equal(s.remaining,0);
  const today=context.labTodayHtml(s,{current:true,priorDay:true,hidden:false});assert.match(today,/data-lab-open/);assert.doesNotMatch(today,/0 experiments available/);
  assert.equal(context.labTodayHtml(s,{current:true,priorDay:true,hidden:true}),'');
  const start=app.indexOf('  if (laboratoryEngine()) laboratoryEngine().snapshot({ presentationOnly: true }).then(s => {');
  const end=app.indexOf('  setFxLayer(305);',start);assert.ok(start>=0&&end>start);
  const links=[];context.wrap2={isConnected:true};context.laboratoryEngine=()=>({snapshot:async()=>s});context.document={createElement:()=>({addEventListener(){}})};context.$=()=>({appendChild:x=>links.push(x)});
  await vm.runInContext(app.slice(start,end),context);assert.equal(links.length,1);assert.equal(links[0].textContent,'Open Laboratory');
});
console.log(`R6 app: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
