// Join guard: execute the actual UI gate against the real loot export.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './mem-idb.mjs';
import * as D from '../js/db.js';
import * as L from '../js/loot.js';
import { petLevel, MORPHS, MORPH_LABEL } from '../js/pets.js';
import { BH_BY_ID } from '../data/boneheadz.js';
import vm from 'node:vm';
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const gate = app.match(/function laboratoryEngine\(\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(gate, 'UI gate must remain inspectable');
const methods = ['snapshot', 'quote', 'animate', 'purchase', 'acknowledge', 'setUi'];
const declared = gate.match(/\[([^\]]+)\]\.every/)?.[1].match(/'([^']+)'/g)?.map(x => x.slice(1,-1));
assert.deepEqual(declared, methods, 'UI method list changed: update and exercise the integration contract');
const resolve = exports => Function('labLoot', `${gate}; return laboratoryEngine();`)(exports);
const gradeInterface = exports => {
  assert.equal(exports.laboratory?.version, 1, 'laboratory.version must be 1');
  for (const method of methods) assert.equal(typeof exports.laboratory[method], 'function', method);
  assert.equal(resolve(exports), exports.laboratory, 'actual UI gate must accept the adapter');
};
gradeInterface(L);
console.log('PASS CONTROL: actual UI gate accepts laboratory.version 1 and all six callable methods');
assert.throws(() => gradeInterface({}));
for (const method of methods) assert.throws(() => gradeInterface({ laboratory: { ...L.laboratory, [method]: undefined } }));
let connection;
const originalOpen=indexedDB.open;
indexedDB.open=(...args)=>{
  const request=originalOpen(...args);let success;
  Object.defineProperty(request,'onsuccess',{get:()=>success,set:fn=>{success=e=>{connection=request.result;fn(e);};}});
  return request;
};
let seq = 0;
async function seed(morphs = ['base', 'base']) {
  D.useDbName(`lab-integration-${++seq}`);
  const roster = morphs.map((morph,i) => ({iid:`p${i}`, sp:'C1', morph, shiny:false, lineage:0, hatchedAtSteps:0}));
  for (const [k,v] of Object.entries({petInst:roster, pets:{C1:{hatchedAtSteps:0}}, looks:['C1'], petLvlV:2,
    petLvlSteps:Object.fromEntries(roster.map(p=>[p.iid,0])), pettalents:{__iidV:2}, petStepCredit:0,
    petEquipped:null, equipped:{}, coins:100000, coinsRev:0})) await D.kvSet(k,v);
  await D.db.put('inv',{id:'ownership', kind:'cos', itemId:'C1'});
  return roster;
}
const lab = L.laboratory;
await seed();
const before = await lab.snapshot();
assert.equal(before.status, 'ready');
assert.equal(before.capacity, 1);
assert.equal(before.used, 0);
assert.equal(before.hasSafePair, false, 'two last Bases must never be recommended');
const q = await lab.quote({iids:['p0','p1']});
assert.equal(q.ok, true);
assert.equal(q.quote.recipe, 'base-base');
assert.ok(q.quote.inputs.every(p=>p.eligible));
assert.deepEqual(q.quote.distribution, [{morph:'ember',weight:22},{morph:'frost',weight:22}]);
assert.ok(q.quote.branches.every(b=>b.lost.includes('C1|base') && Array.isArray(b.counts)));
const result = await lab.animate({quote:q.quote, acknowledgedRisk:'ANIMATE'});
assert.equal(result.ok, true);
const after = await lab.snapshot();
assert.equal(after.pets.length, 1);
assert.ok(['ember','frost'].includes(after.pets[0].morph));
assert.equal(after.pets[0].level, 1);
assert.equal(petLevel((await D.kvGet('petLvlSteps'))[result.receipt.result.iid]), 1);
assert.ok(after.pets.every(p=>!['p0','p1'].includes(p.iid)));
assert.equal(after.used, 1);
assert.equal(after.remaining, 0);
assert.equal((await D.kvGet('labDaily'))[result.receipt.day].used, 1);
assert.equal(after.unseen[0].opId, result.receipt.opId);
console.log('PASS CONTROL: in-memory IndexedDB, two Base inputs destroyed, one coloured level-1 output, daily use spent');

// Invoke the remaining public methods, including replay after result removal.
assert.equal((await lab.setUi({todayHidden:true})).ok,true);
const hidden = (await lab.snapshot()).ui;
assert.equal(hidden.todayHidden,true);
assert.equal(hidden.introRead,true);
assert.equal((await lab.setUi({capacity:3})).ok,false);
assert.equal((await lab.acknowledge(result.receipt.opId)).ok,true);
await lab.acknowledge(result.receipt.opId);
assert.deepEqual(await D.kvGet('labSeen'),[result.receipt.opId]);
assert.equal((await lab.snapshot()).unseen.length,0);
assert.equal((await lab.animate({quote:q.quote,acknowledgedRisk:'ANIMATE'})).receipt.result.iid,result.receipt.result.iid);
await L.salvageInstance(result.receipt.result.iid);
assert.equal((await lab.animate({quote:q.quote,acknowledgedRisk:'ANIMATE'})).receipt.resultPresent,false);
assert.equal((await D.kvGet('petInst')).length,0);
console.log('PASS CONTROL: acknowledgement unions, UI flags persist, replay never recreates a removed result');

const purchaseSnapshot = await lab.snapshot();
assert.equal((await lab.purchase({slot:3,opId:'third-first',snapshotToken:purchaseSnapshot.token})).reason,'prerequisite');
const buy2={slot:2,opId:'buy2',snapshotToken:purchaseSnapshot.token};
assert.equal((await lab.purchase(buy2)).ok,true);
assert.equal((await lab.purchase(buy2)).ok,true);
assert.equal(await D.kvGet('coins'),80000);
assert.equal((await lab.purchase({slot:3,opId:'stale3',snapshotToken:purchaseSnapshot.token})).reason,'stale-quote');
const second=await lab.snapshot();
assert.equal(second.capacity,2);assert.equal(second.used,1);assert.equal(second.remaining,1);
assert.equal((await lab.purchase({slot:3,opId:'buy3',snapshotToken:second.token})).ok,true);
assert.equal(await D.kvGet('coins'),40000);
assert.equal((await lab.snapshot()).capacity,3);
assert.equal((await D.kvGet('coinsHistory')).ops['lab-incubator:buy2:coins'],-20000);
assert.equal((await D.kvGet('coinsHistory')).ops['lab-incubator:buy3:coins'],-40000);
assert.deepEqual(await D.kvGet('labIntents'),{});
console.log('PASS CONTROL: sequential atomic purchases, fixed prices, stale snapshot refusal, idempotent debit');

await seed(['base','base','base']);
await lab.snapshot();
await D.db.put('xp',{key:'dayeffort-2025-01-01',date:'2025-01-01',amount:25});
const pre={presentationOnly:true,inv:await D.db.all('inv'),health:[],log:[],xp:await D.db.all('xp')};
const saved=(await D.exportAll()).kv;
const reads=globalThis.__memIdbReads.full;
const discovery=await lab.snapshot(pre);
assert.equal(globalThis.__memIdbReads.full,reads,'preloaded Today stores must not be rescanned');
assert.deepEqual((await D.exportAll()).kv,saved,'presentation-only snapshot writes nothing');
assert.equal(discovery.hasSafePair,true);assert.equal(discovery.hasSafeUsefulPair,true);
assert.equal(discovery.priorDay,true);assert.equal(discovery.species.C1.safeCounts.base,2);
assert.equal((await lab.snapshot({...pre,xp:[]})).priorDay,false,'creation timestamp alone does not qualify');
let safeQuote=await lab.quote({iids:['p0','p1']});
assert.equal(safeQuote.quote.risk,false);
assert.equal((await lab.animate({quote:safeQuote.quote,acknowledgedRisk:'wrong'})).ok,false);
const stale=safeQuote.quote;
await L.setPetNick('p0','Named');
assert.equal((await lab.animate({quote:stale,acknowledgedRisk:'reviewed'})).reason,'stale-quote');
const invested=await lab.quote({iids:['p0','p1']});
assert.notEqual(invested.quote.opId,stale.opId);
assert.equal(invested.quote.risk,true);assert.equal(invested.quote.inputs[0].nickname,'Named');
assert.equal((await lab.animate({quote:invested.quote,acknowledgedRisk:'reviewed'})).ok,false);
assert.equal((await lab.animate({quote:invested.quote,acknowledgedRisk:'ANIMATE'})).ok,true);
assert.equal((await lab.quote({iids:['p0','p2']})).reason,'cap-reached');
console.log('PASS CONTROL: read-only Today reuses all supplied stores, safe pair predicate, refreshed warnings, acknowledgement');

// A saved-but-undispatched intent is recovered without rolling or spending.
await seed(['base','base','base']);
safeQuote=await lab.quote({iids:['p0','p1']});
await L.saveLabIntent(safeQuote.quote.request,{acknowledgedRisk:'reviewed'});
assert.equal((await lab.snapshot({presentationOnly:true})).status,'unknown');
assert.equal((await lab.quote({iids:['p1','p2']})).reason,'unknown');
const recovered=await lab.snapshot();
assert.ok(recovered.recoveredOpIds.includes(safeQuote.quote.opId));
assert.equal(recovered.used,0);assert.equal(recovered.pets.length,3);
assert.deepEqual(await D.kvGet('labIntents'),{});
assert.equal((await L.animateLaboratory(safeQuote.quote.request,{acknowledgedRisk:'reviewed',requireIntent:true})).reason,'stale-quote','late dispatch must be fenced after recovery');
assert.equal((await lab.animate({quote:safeQuote.quote,acknowledgedRisk:'reviewed'})).ok,true);
console.log('PASS CONTROL: durable intent blocks submissions, recovery confirms pre-state, late dispatch cannot spend');

// Feed actual engine data to the actual production UI renderers, including the
// counts.map call which fails if durable branch maps leak through unchanged.
const pure=app.split('// LAB UI PURE BEGIN:')[1].split('\n').slice(1).join('\n').split('// LAB UI PURE END')[0];
const ui=vm.createContext({MORPHS,MORPH_LABEL,BH_BY_ID,KENNEL_SPECIES:['C1','C2','C3','C4','C5','C6'].map(id=>BH_BY_ID[id]),
  esc:x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),petSpriteHtml:()=>'<img>',petPortraitHtml:()=>'<img data-portrait>',morphSwatch:()=> 'var(--text)'});
vm.runInContext(pure,ui);
assert.equal(ui.labQuoteSupported(q.quote),true);
assert.match(ui.labConfirmationHtml(q.quote),/C|Ember|Frost/);
assert.match(ui.labConfirmationHtml(q.quote),/2 to 0 pets/);
assert.match(ui.labBenchHtml(before,[null,null],''),/data-lab-review disabled/);
assert.match(ui.labRevealHtml(result.receipt),/Level 1/);
assert.throws(()=>ui.labBranchesHtml({...q.quote,branches:q.quote.request.branches}),'unadapted durable count maps must fail');
console.log('PASS CONTROL: production UI accepts real quotes and renders branch counts, warnings, bench and saved result');

// Fail in the real consuming transaction, after the intent has been saved.
await seed(['base','base','base']);
const abortQuote=(await lab.quote({iids:['p0','p1']})).quote;
const initialRoster=await D.kvGet('petInst');
const transaction=connection.transaction;let abortReached=0;
connection.transaction=(...args)=>{
  const tx=transaction(...args),objectStore=tx.objectStore;
  tx.objectStore=name=>{const store=objectStore(name),put=store.put;
    store.put=value=>{const result=put(value);if(name==='kv'&&value.k==='petInst'&&value.v.length===2){abortReached++;tx.abort();}return result;};
    return store;};return tx;
};
try {
  assert.equal((await lab.animate({quote:abortQuote,acknowledgedRisk:'reviewed'})).reason,'confirmed-abort');
} finally {connection.transaction=transaction;}
assert.equal(abortReached,1);assert.deepEqual(await D.kvGet('petInst'),initialRoster);
assert.deepEqual(await D.kvGet('labDaily'),{});assert.deepEqual(await D.kvGet('labIntents'),{});
assert.equal((await lab.animate({quote:abortQuote,acknowledgedRisk:'reviewed'})).ok,true);
console.log('PASS CONTROL: transaction abort rolls back both inputs, output and daily debit; unchanged readback confirms abort');

// A committed transaction whose completion response is lost must reveal the
// saved receipt. The mem-IDB commits its journal before invoking oncomplete.
await seed(['base','base','base']);
const lostQuote=(await lab.quote({iids:['p0','p1']})).quote;
const realTransaction=connection.transaction;let lostReached=0;
connection.transaction=(...args)=>{
  const tx=realTransaction(...args),objectStore=tx.objectStore;let committed=false,complete;
  tx.objectStore=name=>{const store=objectStore(name),put=store.put;
    store.put=value=>{if(name==='kv'&&value.k==='labExperiments')committed=true;return put(value);};return store;};
  Object.defineProperty(tx,'oncomplete',{set:fn=>{complete=fn;},get:()=>event=>{
    if(committed){lostReached++;tx.error=new Error('lost completion response');tx.onabort(event);}else complete(event);
  }});return tx;
};
let lostResult;
try {lostResult=await lab.animate({quote:lostQuote,acknowledgedRisk:'reviewed'});}finally{connection.transaction=realTransaction;}
assert.equal(lostReached,1);assert.equal(lostResult.ok,true);
assert.equal((await lab.snapshot()).used,1);assert.equal((await D.kvGet('petInst')).length,2);
assert.equal((await lab.animate({quote:lostQuote,acknowledgedRisk:'reviewed'})).receipt.result.iid,lostResult.receipt.result.iid);
console.log('PASS CONTROL: lost post-commit response recovers the saved IID without a second spend');

// Restore preserves presentation union and revision semantics already owned by
// the engine. No new key family or second merge policy is introduced.
await lab.setUi({todayHidden:true});
const staleBackup=await D.exportAll();
await lab.setUi({todayHidden:false});
await lab.acknowledge(lostResult.receipt.opId);
await D.importAll(staleBackup,{replace:false});
assert.equal((await lab.snapshot()).ui.todayHidden,false);
assert.deepEqual(await D.kvGet('labSeen'),[lostResult.receipt.opId]);
console.log('PASS CONTROL: stale backup cannot undo deliberate Today restore or receipt acknowledgement');

await seed(['base','base','base']);
const overnight=(await lab.quote({iids:['p0','p1']})).quote;
await L.saveLabIntent(overnight.request,{acknowledgedRisk:'reviewed'});
const RealDate=Date,nextDay=new RealDate();nextDay.setDate(nextDay.getDate()+1);
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[nextDay.getTime()]));}static now(){return nextDay.getTime();}};
try {
  const s=await lab.snapshot();assert.ok(s.recoveredOpIds.includes(overnight.opId));assert.equal(s.used,0);
  assert.equal((await lab.animate({quote:overnight,acknowledgedRisk:'reviewed'})).reason,'stale-quote');
} finally {globalThis.Date=RealDate;}
console.log('PASS CONTROL: overnight intent readback recovers unchanged pets without accepting an old-day quote');

await seed(['base','base','base']);
await D.kvSet('petInst',(await D.kvGet('petInst')).map((p,i)=>i===2?{...p,shiny:true}:p));
assert.equal((await lab.snapshot()).hasSafeUsefulPair,true,'a shiny Base may be the collection keeper');
await D.kvSet('petLvlSteps',{p0:7,p1:0,p2:0});
await D.kvSet('petInst',(await D.kvGet('petInst')).map((p,i)=>i===0?{...p,lineage:2}:p));
assert.equal((await lab.snapshot()).hasSafeUsefulPair,false,'partial training and lineage prevent promotion');
const trained=(await lab.quote({iids:['p0','p1']})).quote;
assert.equal(trained.inputs[0].eligible,true);assert.equal(trained.inputs[0].bankedSteps,7);
assert.equal(trained.salvageDust,L.petDustValue(BH_BY_ID.C1)*2+16);
assert.equal((await lab.quote({iids:['p0','p2']})).reason,'ineligible');
console.log('PASS CONTROL: shiny keeper is safe, shiny input is excluded, trained ordinary pets retain eligibility and exact salvage warning');

await seed(['base','base','base']);
const forPurchase=(await lab.quote({iids:['p0','p1']})).quote;
await lab.animate({quote:forPurchase,acknowledgedRisk:'reviewed'});
const purchaseView=await lab.snapshot();
const request={format:1,rules:'lab-final-v1',kind:'purchase',slot:2,opId:'purchase-race',price:20000,snapshotToken:purchaseView.token};
await D.kvSet('labIntents',{[request.opId]:{format:1,quote:request,acknowledgedRisk:'reviewed',createdAt:Date.now()}});
assert.equal((await lab.snapshot({presentationOnly:true})).status,'unknown');
await D.kvBumpRevisioned('coins','coinsRev',-1);
assert.equal((await L.buyLabIncubator(request)).reason,'stale-quote','the consuming transaction must independently validate the token');
assert.equal(await D.kvGet('coins'),99999);assert.deepEqual(await D.kvGet('labIncubators'),{});
// Restore the reviewed balance using its revisioned writer. A changed revision
// still makes this pending purchase unknown, never a falsely confirmed abort.
assert.equal((await lab.snapshot()).status,'unknown');
console.log('PASS CONTROL: persisted purchase blocks new submissions and transaction-side token checks reject a balance race');
