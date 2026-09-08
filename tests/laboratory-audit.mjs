// Laboratory engine guards. CONTROL paths mint real results through payAtomic.
// IndexedDB interruption is simulated, not a browser-process kill proof.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './mem-idb.mjs';
import * as D from '../js/db.js';
import * as L from '../js/loot.js';
import { dateKey } from '../js/nutrition.js';
const P = await import('../js/laboratory.js').catch(() => ({}));
let failed = 0, checked = 0, seq = 0;
async function check(name, fn) {
  checked++;
  try { await fn(); console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack}`); }
}
const pet = (morph, iid = `a${++seq}`, extra = {}) => ({ iid, sp: 'C1', morph, shiny: false, lineage: 0, hatchedAtSteps: 0, ...extra });
async function seed(morphs = ['base', 'base', 'base', 'base', 'base']) {
  D.useDbName(`lab-audit-${++seq}`);
  const roster = morphs.map(m => pet(m));
  for (const [k,v] of Object.entries({petInst:roster, pets:{C1:{hatchedAtSteps:0}}, looks:['C1'], petLvlV:2,
    petLvlSteps:Object.fromEntries(roster.map(x=>[x.iid,0])), pettalents:{__iidV:2}, petStepCredit:0,
    petEquipped:null, equipped:{}, coins:100000, coinsRev:0})) await D.kvSet(k,v);
  await D.db.put('inv',{id:'legacy-c1',kind:'cos',itemId:'C1'});
  return roster;
}
const snapshot = async () => (await D.exportAll()).kv;
const quote = pair => L.quoteLaboratory(pair.map(x=>x.iid));
const animate = q => L.animateLaboratory(q,{acknowledgedRisk:'ANIMATE'});
await check('ODDS CONTROL: all three recipes, exact weights and 60000 draws', () => {
  assert.equal(typeof P.labPreview,'function');
  let rngState=123456;
  const rng=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/2**32;};
  for (const [a,b,outputs,weight] of [['base','base',['ember','frost'],22],['ember','frost',['toxic','rose'],10],['toxic','rose',['midnight'],4]]) {
    const roster=[pet(a),pet(b)]; const p=P.labPreview(roster,roster.map(x=>x.iid));
    assert.deepEqual(p.distribution,outputs.map(morph=>({morph,weight})));
    const counts={};let draws=0;
    for(let i=0;i<20000;i++){const m=P.resolveLabOutcome(p.distribution,()=>{draws++;return rng();});counts[m]=(counts[m]||0)+1;}
    for(const m of outputs)assert.ok(Math.abs(counts[m]/20000-1/outputs.length)<0.02);
    assert.equal(draws,outputs.length===1?0:20000);
  }
});
function assertFlatOdds(preview) {
  for (const [inputs,outs,weight] of [[['base','base'],['ember','frost'],22],[['ember','frost'],['toxic','rose'],10]]) {
    for (const sp of ['C1','C2','C3','C4','C5','C6']) for (const l of [0,1,2,4]) for (const r of [0,1,2,4]) for (const active of [true,false]) {
      const make = m => pet(m,undefined,{sp});
      const pair=inputs.map(make);
      const roster=[...pair,...Array.from({length:l},()=>make(outs[0])),...Array.from({length:r},()=>make(outs[1]))];
      if(!active) { roster.push(make('midnight')); if(inputs[0]==='base')roster.push(make('toxic'),make('rose')); }
      roster.push(pet(outs[0],undefined,{sp:sp==='C1'?'C2':'C1'}));
      const state={petLvlSteps:Object.fromEntries(roster.map(x=>[x.iid,1000]))};
      const p=preview(roster,pair.map(x=>x.iid),state);
      assert.deepEqual(p.distribution,outs.map(morph=>({morph,weight})));
      assert.equal(p.protection,'none');
      assert.equal(P.resolveLabOutcome(p.distribution,()=>0),outs[0]);
      assert.equal(P.resolveLabOutcome(p.distribution,()=>0.5-Number.EPSILON),outs[0]);
      assert.equal(P.resolveLabOutcome(p.distribution,()=>0.5),outs[1]);
      assert.equal(P.resolveLabOutcome(p.distribution,()=>1-Number.EPSILON),outs[1]);
    }
  }
}
await check('ODDS CONTROL: flat 50/50 across collection, stock, species and trained inputs', () => {
  assertFlatOdds(P.labPreview);
  // A real repeated-output sequence remains possible as ownership changes.
  const roster=Array.from({length:8},()=>pet('base'));
  for(let i=0;i<3;i++) {
    const pair=roster.filter(x=>x.morph==='base').slice(0,2);
    const p=P.labPreview(roster,pair.map(x=>x.iid));
    const result=P.resolveLabOutcome(p.distribution,()=>0.75);
    assert.equal(result,'frost');
    for(const input of pair)roster.splice(roster.indexOf(input),1);
    roster.push(pet(result));
  }
  assert.equal(roster.filter(x=>x.morph==='frost').length,3);
  assert.equal(roster.some(x=>x.morph==='ember'),false);
  const pair=[pet('toxic'),pet('rose')];const p=P.labPreview(pair,pair.map(x=>x.iid));
  assert.deepEqual(p.branches[0].lost,['C1|rose','C1|toxic']);assert.deepEqual(p.branches[0].gained,['C1|midnight']);assert.equal(p.branches[0].afterCount,1);
});
await check('ODDS CONTROL: reintroduced collection and ingredient filters fail the same guard', async () => {
  const source=readFileSync(new URL('../js/laboratory.js',import.meta.url),'utf8');
  const needle="return {distribution:[left,right].map(morph=>({morph,weight})),protection:'none'};";
  assert.equal(source.split(needle).length,2,'production mutation must land exactly once');
  for(const threshold of [1,2]) {
    // Threshold 1 restores missing-colour filtering; threshold 2 restores stock filtering.
    const mutant=source.replace(needle,`const low=[left,right].filter(m=>roster.filter(x=>x.sp===sp && labMorph(x.morph)===m && labInput(x,state)).length<${threshold});
      return {distribution:(low.length?low:[left,right]).map(morph=>({morph,weight})),protection:'none'};`)
      .replace("'./pets.js'",JSON.stringify(new URL('../js/pets.js',import.meta.url).href));
    const bad=await import('data:text/javascript;base64,'+Buffer.from(mutant).toString('base64'));
    assert.throws(()=>assertFlatOdds(bad.labPreview),assert.AssertionError,`filter threshold ${threshold} must fail`);
  }
});
await check('ATOMICITY CONTROL: successful Animate, interruption rollback and replay', async () => {
  assert.equal(typeof L.animateLaboratory,'function');
  const roster=await seed(['toxic','rose','base']);const q=await quote(roster.slice(0,2));
  const before=await snapshot(); const idb=await openConnection();let reached=0;
  const original=idb.transaction;
  idb.transaction=(...args)=>{const tx=original(...args);const os=tx.objectStore;tx.objectStore=name=>{const s=os(name);if(name==='kv'){const put=s.put;s.put=v=>{const r=put(v);if(v.k==='petInst'&&!v.v.some(x=>x.iid===roster[0].iid)){reached++;tx.abort();}return r;};}return s;};return tx;};
  try{await assert.rejects(animate(q));}finally{idb.transaction=original;}
  assert.equal(reached,1);assert.deepEqual(await snapshot(),before);
  const result=await animate(q);assert.equal(result.ok,true);assert.equal(result.receipt.result.morph,'midnight');
  const live=await D.kvGet('petInst');assert.equal(live.length,2);assert.equal(live.some(x=>q.iids.includes(x.iid)),false);
  assert.equal((await D.kvGet('petLvlSteps'))[result.receipt.result.iid],0);
  assert.deepEqual(await animate(q),result);assert.equal((await D.kvGet('petInst')).length,2);
  assert.equal(await D.kvGet('coins'),100000);assert.equal((await D.db.all('xp')).length,0);assert.equal((await D.db.all('inv')).length,1);
});
// Capture the same connection js/db.js uses, without replacing its transaction logic.
async function openConnection(){let conn;const old=indexedDB.open;indexedDB.open=(...a)=>{const r=old(...a);let cb;Object.defineProperty(r,'onsuccess',{configurable:true,get:()=>cb,set:f=>{cb=e=>{conn=r.result;f(e);};}});return r;};const name=`lab-capture-${seq}`;
  const saved=await D.exportAll();D.useDbName(name);try{await D.importAll(saved,{replace:true});}finally{indexedDB.open=old;}return conn;}
await check('DAILY CONTROL: second attempt, rollover, stale midnight, backwards and purchases',async()=>{
  assert.equal(typeof L.quoteLaboratory,'function');
  const roster=await seed();const q=await quote(roster.slice(0,2));assert.equal((await animate(q)).ok,true);
  assert.equal((await quote(roster.slice(2,4))).reason,'daily-cap');
  assert.equal((await L.buyLabIncubator({format:1,opId:'buy-three-first',slot:3,price:40000})).ok,false);
  const buy={format:1,opId:'buy-two',slot:2,price:20000};assert.equal((await L.buyLabIncubator(buy)).ok,true);assert.equal((await L.buyLabIncubator(buy)).ok,true);assert.equal(await D.kvGet('coins'),80000);
  const oldQ=await quote(roster.slice(2,4));const RealDate=Date;const next=new RealDate();next.setDate(next.getDate()+1);
  globalThis.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[next.getTime()]));}static now(){return next.getTime();}};
  try{assert.equal((await animate(oldQ)).reason,'stale-quote');const fresh=await quote(roster.slice(2,4));assert.equal(fresh.used,0);assert.equal((await animate(fresh)).ok,true);}finally{globalThis.Date=RealDate;}
  assert.equal((await quote([roster[4],...(await D.kvGet('petInst')).filter(x=>x.iid!==roster[4].iid)].slice(0,2))).reason,'backwards');
  const oldTZ=process.env.TZ,instant=Date.UTC(2026,8,8,18);
  globalThis.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[instant]));}static now(){return instant;}};
  try{
    process.env.TZ='America/Los_Angeles';const r=await seed(),first=await quote(r.slice(0,2));assert.equal((await animate(first)).ok,true);
    process.env.TZ='America/New_York';assert.equal((await quote(r.slice(2,4))).reason,'daily-cap','same-date travel adds no use');
    process.env.TZ='Asia/Tokyo';const travel=await quote(r.slice(2,4));assert.equal(travel.used,0);assert.equal((await animate(travel)).ok,true);
    process.env.TZ='America/Los_Angeles';assert.equal((await quote(r.slice(2,4))).reason,'backwards','returning west cannot reopen a bucket');
  }finally{globalThis.Date=RealDate;if(oldTZ===undefined)delete process.env.TZ;else process.env.TZ=oldTZ;}

});
await check('INVALID CONTROL: all 21 morph pairs and rejected inputs leave state intact',async()=>{
  assert.equal(typeof L.quoteLaboratory,'function');
  const morphs=['base','ember','frost','toxic','rose','midnight'];let legal=0;
  for(let i=0;i<6;i++)for(let j=i;j<6;j++){const a=pet(morphs[i]),b=pet(morphs[j]);const p=P.labPreview([a,b],[a.iid,b.iid]);if(p.ok)legal++;}
  assert.equal(legal,3);
  for(const pair of [[pet('toxic'),pet('toxic')],[pet('base'),pet('base',undefined,{sp:'C2'})],[pet('base'),pet('base',undefined,{shiny:true})],[pet('base'),pet('base',undefined,{sp:'CX'})],[pet('wat'),pet('base')],[pet(4),pet('base')]]){
    await seed();await D.kvSet('petInst',pair);await L.initLaboratory();const before=await snapshot();assert.equal((await quote(pair)).ok,false);assert.deepEqual(await snapshot(),before);
  }
  const roster=await seed();const q=await quote(roster.slice(0,2));assert.equal((await animate(q)).ok,true);
});
await check('MIGRATION CONTROL: additive, idempotent and legacy coloured eggs preserved',async()=>{
  assert.equal(typeof L.initLaboratory,'function');await seed();const egg={id:'old-rose',kind:'egg',morph:'rose',goal:0,stepsAtStart:0,source:'legacy',ts:1};await D.db.put('inv',egg);
  const old=await D.kvGet('petInst');await L.initLaboratory();const once=await snapshot();await L.initLaboratory();assert.deepEqual(await snapshot(),once);assert.deepEqual(await D.kvGet('petInst'),old);assert.deepEqual(await D.db.get('inv',egg.id),egg);assert.equal(await D.kvGet('labV'),1);
});
await check('LIVE CONTROL: investment, equipment, health, RNG and simultaneous submissions',async()=>{
  assert.equal(typeof L.animateLaboratory,'function');
  const roster=await seed(['toxic','rose','base']);const pair=roster.slice(0,2);
  await D.kvSet('petEquipped',pair[0].iid);await D.kvSet('equipped',{C:'C1',H:'hat'});
  await D.kvSet('petNick',{[pair[0].iid]:'PRIVATE',[roster[2].iid]:'KEEP'});
  await D.kvSet('petBonds',{[pair[1].iid]:4});await D.kvSet('petLvlSteps',{[pair[0].iid]:50,[pair[1].iid]:7,[roster[2].iid]:3});
  await D.kvSet('pettalents',{__iidV:2,__legacy:{C1:['archived']},[pair[0].iid]:['choice']});
  const q=await quote(pair);assert.equal(q.risk,true);assert.equal(q.inputs[0].bankedSteps,50);
  assert.equal((await L.animateLaboratory(q)).reason,'acknowledgement-required');
  await L.setPetNick(pair[0].iid,'CHANGED');assert.equal((await animate(q)).reason,'stale-quote');
  const q2=await quote(pair);await D.db.put('health',{date:dateKey(),steps:100,exerciseMin:2});
  assert.equal((await animate(q2)).reason,'unsettled-training');
  const q3=await quote(pair);assert.equal(q3.meter,600);assert.equal(q3.inputs[0].bankedSteps,650);
  const a=await Promise.all([animate(q3),animate(q3)]);assert.equal(a[0].ok,true);assert.deepEqual(a[0],a[1]);
  const r=a[0].receipt;assert.equal(r.result.hatchedAtSteps,600);assert.equal(await D.kvGet('petEquipped'),r.result.iid);
  assert.deepEqual(await D.kvGet('equipped'),{C:'C1',H:'hat'});
  for(const key of ['petLvlSteps','petNick','petBonds','pettalents'])for(const x of pair)assert.equal(Object.hasOwn(await D.kvGet(key),x.iid),false);
  assert.deepEqual(await D.kvGet('petNick'),{[roster[2].iid]:'KEEP'});
  assert.deepEqual((await D.kvGet('pettalents')).__legacy,{C1:['archived']});
  await Promise.all([L.setPetNick(pair[0].iid,'GHOST'),L.bondUp(pair[1].iid),L.setPetPick(pair[0].iid,'x',['x']),L.creditEquippedPetSteps()]);
  assert.equal((await D.kvGet('petLvlSteps'))[r.result.iid],0);
  for(const key of ['petNick','petBonds','pettalents'])for(const x of pair)assert.equal(Object.hasOwn(await D.kvGet(key),x.iid),false);
  await L.salvageInstance(r.result.iid);assert.deepEqual(await animate(q3),a[0]);
  assert.equal((await D.kvGet('petInst')).some(x=>x.iid===r.result.iid),false);
  assert.equal((await animate({...q3,iids:[...q3.iids].reverse()})).reason,'op-conflict');
  const bases=await seed(),randomQuote=await quote(bases.slice(0,2)),before=await snapshot();
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues(){throw new Error('injected RNG failure');},randomUUID:()=> 'unused'}});
  try{await assert.rejects(animate(randomQuote),/injected RNG failure/);}finally{Object.defineProperty(globalThis,'crypto',descriptor);}
  assert.deepEqual(await snapshot(),before);assert.equal((await animate(randomQuote)).ok,true);

});
await check('RESTORE CONTROL: stale merge, replacement refusal, closure and currency receipts',async()=>{
  assert.equal(typeof L.initLaboratory,'function');const roster=await seed(['toxic','rose','base']);
  await L.initLaboratory();const stale=await D.exportAll();const q=await quote(roster.slice(0,2));const r=await animate(q);assert.equal(r.ok,true);
  const buy={format:1,opId:'restore-buy',slot:2,price:20000};const buys=await Promise.all([L.buyLabIncubator(buy),L.buyLabIncubator({...buy,opId:'other-buy'})]);
  assert.equal(buys.filter(x=>x.ok).length,1);assert.equal(await D.kvGet('coins'),80000);
  assert.equal((await D.kvGet('coinsHistory')).ops['lab-incubator:restore-buy:coins'],-20000);
  const complete=await D.exportAll();await D.importAll(stale,{replace:false});assert.equal((await D.kvGet('petInst')).length,2);assert.equal((await D.kvGet('labDaily'))[q.day].used,1);
  const stable=await snapshot();await assert.rejects(D.importAll(stale,{replace:true}));assert.deepEqual(await snapshot(),stable);
  for(const mutate of [
    x=>x.kv.find(x=>x.k==='labExperiments').v[q.opId].distribution.push({morph:'rose',weight:10}),
    x=>x.kv.find(x=>x.k==='labExperiments').v[q.opId].result.morph='toxic',
    x=>x.kv.find(x=>x.k==='petTaken').v.splice(0,1),
    x=>x.kv.find(x=>x.k==='petInst').v.splice(0),
    x=>x.kv.find(x=>x.k==='labV').v=2,
    x=>x.kv.find(x=>x.k==='labDaily').v={},
    x=>x.kv.find(x=>x.k==='coinsHistory').v.ops['lab-incubator:restore-buy:coins']=0,
  ]){const broken=structuredClone(complete);mutate(broken);await assert.rejects(D.importAll(broken,{replace:false}));assert.deepEqual(await snapshot(),stable);}
  await D.importAll(complete,{replace:true});assert.equal((await D.kvGet('petInst')).length,2);
  await L.salvageInstance(r.receipt.result.iid);const consumed=await D.exportAll();await D.importAll(complete,{replace:false});assert.equal((await D.kvGet('petInst')).some(x=>x.iid===r.receipt.result.iid),false);
  await D.importAll(consumed,{replace:true});
});
await check('FAULT CONTROL: split transactions lose inputs; atomic service rolls back every write boundary',async()=>{
  assert.equal(typeof L.animateLaboratory,'function');
  // This deliberately faulty action drives the same payAtomic primitive with
  // two transactions. A kill after the first demonstrates the loss detector.
  let roster=await seed(['toxic','rose','base']);
  await D.payAtomic({kv:{petInst:cur=>cur.filter(x=>!roster.slice(0,2).some(p=>p.iid===x.iid))}});
  assert.equal((await D.kvGet('petInst')).length,1,'CONTROL: split destroy commits without any result');
  for(const key of ['petInst','petTaken','petLvlSteps','petNick','petBonds','pettalents','labExperiments','labDaily','labIntents','labUi','dayHighWater','dayWitnessOrd']){
    roster=await seed(['toxic','rose','base']);const q=await quote(roster.slice(0,2));const before=await snapshot(),conn=await openConnection(),original=conn.transaction;let hit=0;
    conn.transaction=(...args)=>{const tx=original(...args),store=tx.objectStore;tx.objectStore=name=>{const os=store(name),put=os.put;os.put=v=>{if(name==='kv'&&v.k===key){hit++;throw new DOMException('injected quota abort','QuotaExceededError');}return put(v);};return os;};return tx;};
    try{await assert.rejects(animate(q));}finally{conn.transaction=original;}
    assert.equal(hit,1,'boundary reached: '+key);assert.deepEqual(await snapshot(),before,'rollback at '+key);
    assert.equal((await animate(q)).ok,true,'CONTROL: retry commits at '+key);
  }
});
console.log(`${checked-failed}/${checked} Laboratory guards passed`);process.exitCode=failed?1:0;
