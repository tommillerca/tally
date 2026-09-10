// Real two-device purchases and encrypted CAS transport, using the existing IDB double.
import assert from 'node:assert/strict';
import {D,L,pet,seed} from '../../tests/lib/pet-destruction-harness.mjs';
import {pathToFileURL} from 'node:url';
const S=await import(process.env.DESTRUCTION_SOURCE_ROOT ? pathToFileURL(`${process.env.DESTRUCTION_SOURCE_ROOT}/js/social.js`) : new URL('../../js/social.js',import.meta.url));
const before=process.argv.includes('--before');
const lowWallet=process.argv.includes('--low-wallet');
let blob=null,version=0,offline=false,conflicts=0,failures=0;
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});
globalThis.fetch=async(url,opts={})=>{
  if(offline)throw new TypeError('offline');
  const path=new URL(url).pathname;
  if(path==='/register')return response(200,{playerId:'r6',handle:'R6',friendCode:'R6'});
  assert.equal(path,'/backup');
  if((opts.method||'GET')==='GET')return blob?response(200,{blob,version,updatedAt:version}):response(404,{});
  const body=JSON.parse(opts.body);
  if(body.baseVersion!==(blob?version:null)){conflicts++;return response(409,{code:'stale-backup',version});}
  blob=body.blob;version++;return response(200,{ok:true,version,updatedAt:version});
};
const kv=s=>Object.fromEntries(s.kv.map(r=>[r.k,r.v]));
await seed(['a','b','c','d','e','f'].map(id=>pet(id)),{coins:lowWallet?25000:100000});
await D.kvSet('apiBase','https://r6.invalid');
assert.equal((await S.goOnline()).ok,true);
const quote=(await L.laboratory.quote({iids:['a','b']})).quote;
assert.ok(quote);
assert.equal((await L.laboratory.animate({quote,acknowledgedRisk:quote.risk?'ANIMATE':'reviewed'})).ok,true);
assert.equal(await S.pushBackup('audit'),true);
const base=await D.exportAll(),forks=[];
for(const device of ['a','b']){
  D.useDbName(`r6-${device}`);await D.importAll(base);
  await D.kvSet('backupVersion',version);await D.kvSet('backupAt',0);
  offline=true;
  const s=await L.laboratory.snapshot();
  const bought=await L.laboratory.purchase({slot:2,opId:`r6-buy-${device}`,snapshotToken:s.token});
  assert.equal(bought.ok,true,JSON.stringify(bought));
  assert.equal(await D.kvGet('coins'),s.coins-20000);
  await D.db.put('log',{id:device,date:quote.day,meal:0,ts:1,name:device,kcal:1,p:0,c:0,f:0});
  await D.db.put('foods',{id:device,name:device,kcal:1,p:0,c:0,f:0});
  await D.db.put('weights',{date:device==='a'?'2026-01-01':'2026-01-02',kg:70});
  await D.db.put('inv',{id:`extra-${device}`,kind:'cos',itemId:'C2'});
  await D.db.put('health',{date:device==='a'?'2026-01-01':'2026-01-02',steps:100});
  await D.db.put('xp',{key:`extra-${device}`,xp:10,date:quote.day});
  await D.kvSet(`unrelated-${device}`,{earned:true});
  forks.push(await D.exportAll());
}
offline=false;
assert.notDeepEqual(kv(forks[0]).labIncubators,kv(forks[1]).labIncubators);
for(const replace of [false,true])for(const direction of [0,1]){
  D.useDbName(`r6-import-${replace}-${direction}`);await D.importAll(forks[direction]);
  let counts,error;
  try{counts=await D.importAll(forks[1-direction],{replace});}catch(e){error=e.message;}
  const incoming=forks[1-direction],stored=await D.exportAll();
  const survived=['log','foods','weights','inv','health','xp'].every(store=>incoming[store].every(row=>stored[store].some(r=>JSON.stringify(r)===JSON.stringify(row))))&&kv(stored)[`unrelated-${direction===0?'b':'a'}`]?.earned===true;
  console.log(`${before?'RED':'CHECK'} direction=${direction} replace=${replace} unrelatedSurvived=${survived} refusal=${error||'none'} counts=${JSON.stringify(counts)}`);
  if(before){assert.equal(error,'laboratory-restore-conflict');assert.equal(survived,false);failures++;}
  else {
    assert.equal(error,undefined);assert.equal(survived,true);
    const state=kv(stored);
    assert.equal(state.coins,kv(incoming).coins,'duplicate has its full price refunded');
    for(const fork of forks){const receipt=kv(fork).labIncubators['2'];assert.deepEqual(state.labIncubatorPurchases[receipt.opId],receipt);}
    assert.equal(state.coinsHistory.ops['lab-incubator-refund:r6-buy-b:coins'],20000);
    assert.equal(counts.notices.length,1);assert.equal(counts.notices[0].opId,'r6-buy-b');
    assert.match(counts.notices[0].message,/Incubator 2.*could not.*20,000 coins was refunded once/);
    assert.deepEqual(state.labIncubatorRecovery,counts.notices);
    const expected=state.coins;
    await D.importAll(incoming,{replace:false});await D.importAll(base,{replace:false});
    assert.equal(await D.kvGet('coins'),expected,'replays and stale saves cannot repeat refunds');
    D.validateImport(await D.exportAll());
  }
}
D.useDbName('r6-a');assert.equal(await S.pushBackup('audit'),true);
D.useDbName('r6-b');const pushed=await S.pushBackup('audit');
console.log(`${before?'RED':'CHECK'} cloud push=${pushed} CAS conflicts=${conflicts} failure=${JSON.stringify(await D.kvGet('backupFail'))}`);
assert.ok(conflicts>0);
if(before){assert.equal(pushed,false);assert.equal((await D.kvGet('backupFail')).reason,'laboratory-restore-conflict');failures++;}
else {
  assert.equal(pushed,true);assert.ok(await D.kvGet('backupAt'));
  const recovered=await D.exportAll();
  assert.deepEqual(recovered.log.map(r=>r.id).sort(),['a','b']);
  D.useDbName('r6-a');const pulled=await S.pullBackup();assert.equal(pulled.restored,true);assert.equal(pulled.notices[0].opId,'r6-buy-b');
  assert.deepEqual((await D.db.all('log')).map(r=>r.id).sort(),['a','b']);
  assert.equal(await S.pushBackup('audit'),true);
  const beforeSpend=await D.kvGet('coins');
  await D.payAtomic({kv:{coins:n=>n-123,coinsRev:n=>n+123}});
  await D.importAll(recovered,{replace:false});
  assert.equal(await D.kvGet('coins'),beforeSpend-123,'spent refund stays spent after stale merge');
  console.log('PASS recovery on both original device databases without erase; refund replay and spending preserved');
  // A third independent offline receipt changes the canonical owner. Retain all
  // debits and refund exactly two duplicates, without refunding the new owner.
  D.useDbName('r6-third');await D.importAll(base);
  const thirdState=await L.laboratory.snapshot();
  assert.equal((await L.laboratory.purchase({slot:2,opId:'a-earlier-owner',snapshotToken:thirdState.token})).ok,true);
  const third=await D.exportAll();
  D.useDbName('r6-b');await D.importAll(third,{replace:false});
  const three=kv(await D.exportAll());
  assert.equal(three.coins,kv(recovered).coins);
  assert.equal(Object.keys(three.labIncubatorPurchases).length,3);
  assert.equal(three.labIncubators['2'].opId,'a-earlier-owner');
  assert.equal(Object.keys(three.coinsHistory.ops).filter(id=>id.startsWith('lab-incubator-refund:')).length,2);
  D.validateImport(await D.exportAll());
  console.log('PASS third-device convergence with a new canonical receipt');
}
if(!before){
  const contents=({exportedAt,...save})=>save;
  for(const replace of [false,true]){
    let connection;
    const originalOpen=indexedDB.open;
    indexedDB.open=(...args)=>{
      const request=originalOpen(...args);let callback;
      Object.defineProperty(request,'onsuccess',{get:()=>callback,set:fn=>{callback=e=>{connection=request.result;fn(e);};}});
      return request;
    };
    D.useDbName(`r6-abort-${replace}`);
    try{await D.importAll(forks[0]);}finally{indexedDB.open=originalOpen;}
    const saved=await D.exportAll(),transaction=connection.transaction;let hits=0;
    connection.transaction=(...args)=>{
      const tx=transaction(...args),objectStore=tx.objectStore;
      tx.objectStore=name=>{
        const store=objectStore(name),put=store.put;
        store.put=row=>{
          if(name==='kv'&&row.k==='labIncubatorPurchases'){hits++;throw new DOMException('injected refund abort','QuotaExceededError');}
          return put(row);
        };return store;
      };return tx;
    };
    try{await assert.rejects(D.importAll(forks[1],{replace}),/injected refund abort/);}finally{connection.transaction=transaction;}
    assert.equal(hits,1);assert.deepEqual(contents(await D.exportAll()),contents(saved));
    await D.importAll(forks[1],{replace});
    const merged=await D.exportAll(),tampered=structuredClone(merged);
    kv(tampered).labIncubatorPurchases['r6-buy-b'].purchasedAt++;
    await assert.rejects(D.importAll(tampered,{replace}),/laboratory-restore-conflict/);
    assert.deepEqual(contents(await D.exportAll()),contents(merged));
    const broken=structuredClone(merged);kv(broken).labIncubatorPurchases['r6-buy-b'].price++;
    assert.throws(()=>D.validateImport(broken),/invalid-incubators/);
    console.log(`PASS replace=${replace} refund/import rollback and immutable receipt controls`);
  }
  D.useDbName('r6-slot3-earner');await D.importAll(forks[0]);
  await D.payAtomic({kv:{coins:n=>n+40000,coinsRev:n=>n+40000}});
  const funded=await L.laboratory.snapshot();
  assert.equal((await L.laboratory.purchase({slot:3,opId:'r6-buy-three',snapshotToken:funded.token})).ok,true);
  const withThree=await D.exportAll();
  for(const direction of [0,1]){
    D.useDbName(`r6-slot3-merge-${direction}`);
    await D.importAll(direction?forks[1]:withThree);
    await D.importAll(direction?withThree:forks[1],{replace:false});
    const merged=await D.exportAll(),state=kv(merged);
    assert.equal(state.coins,kv(forks[1]).coins,'separate slot keeps the earnings that funded it');
    assert.equal(Object.keys(state.labIncubators).length,2);
    assert.equal(Object.keys(state.labIncubatorPurchases).length,3);
    D.validateImport(merged);
  }
  console.log('PASS both directions keep a separately earned slot 3 without premature wallet refusal');
}
console.log(before?`RED: ${failures} required recovery assertions fail on original code (defects positively asserted)`:'PASS two-device guard');
process.exitCode=before?1:0;
