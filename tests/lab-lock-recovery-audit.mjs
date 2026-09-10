// R3-2: kill the real adapter between commits, then boot from committed rows.
// Node IndexedDB double only. This does not claim an iOS/device kill test.
import assert from 'node:assert/strict';
// Finding 1 requires the separate health-writing scenarios, even in a direct
// lock audit invocation. Deleting that audit now prevents a green lock run.
import './lab-health-recovery-audit.mjs';

import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {D,L,pet,seed} from './lib/pet-destruction-harness.mjs';
import {auditOutputPath} from './lib/audit-output.mjs';

const roster=[pet('a'),pet('b'),pet('c')];
if(process.argv[2]==='--kill') {
  let connection;
  const open=indexedDB.open;
  indexedDB.open=(...args)=>{
    const request=open(...args);let success;
    Object.defineProperty(request,'onsuccess',{set:fn=>{success=fn;},get:()=>event=>{connection=request.result;success(event);}});
    return request;
  };
  await seed(roster);
  const quote=(await L.laboratory.quote({iids:['a','b']})).quote;
  const transaction=connection.transaction;
  const boundary=process.argv[4];
  connection.transaction=(...args)=>{
    const tx=transaction(...args),objectStore=tx.objectStore;let fence=false,spend=false,complete;
    tx.objectStore=name=>{
      const store=objectStore(name),put=store.put;
      store.put=value=>{
        if(name==='kv'&&value.k==='labIntents'&&Object.keys(value.v).length)fence=true;
        if(name==='kv'&&value.k==='labExperiments')spend=true;
        return put(value);
      };
      return store;
    };
    Object.defineProperty(tx,'oncomplete',{set:fn=>{complete=fn;},get:()=>async event=>{
      if(boundary==='intent'?fence:spend) {
        // Do not deliver completion to animate. No subsequent spend/readback runs.
        connection.transaction=transaction;
        const stores={};
        for(const name of ['kv','inv','health'])stores[name]=await D.db.all(name);
        writeFileSync(auditOutputPath(process.argv[3]),JSON.stringify({quote,stores,boundary}));
        process.kill(process.pid,'SIGKILL');
      } else complete?.(event);
    }});
    return tx;
  };
  await L.laboratory.animate({quote,acknowledgedRisk:'reviewed'});
  throw new Error('kill boundary was not reached');
}

const temp=mkdtempSync(auditOutputPath(join(tmpdir(),'lab-lock-')));
let sequence=0,passed=0,failed=0;
async function check(name,fn) {
  try {await fn();passed++;console.log(`PASS ${name}`);}
  catch(e) {failed++;console.log(`FAIL ${name}: ${e.message}`);}
}
function killed(boundary) {
  const path=join(temp,`${boundary}.json`);
  const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--kill',path,boundary],{encoding:'utf8',timeout:15000});
  assert.equal(child.signal,'SIGKILL',child.stderr||child.error?.message);
  const fixture=JSON.parse(readFileSync(path,'utf8'));
  const kv=Object.fromEntries(fixture.stores.kv.map(r=>[r.k,r.v]));
  assert.equal(Object.keys(kv.labIntents).length,boundary==='intent'?1:0);
  assert.equal(Object.keys(kv.labExperiments).length,boundary==='intent'?0:1);
  assert.equal(kv.petInst.length,boundary==='intent'?3:2);
  console.log(`KILL ${boundary}: SIGKILL, intents=${Object.keys(kv.labIntents).length}, receipts=${Object.keys(kv.labExperiments).length}, pets=${kv.petInst.length}`);
  return fixture;
}
async function boot(fixture) {
  D.useDbName(`lab-lock-boot-${++sequence}`);
  for(const [name,rows] of Object.entries(fixture.stores))for(const row of rows)await D.db.put(name,row);
}
try {
  const interrupted=killed('intent');
  for(const [name,change] of [
    ['CONTROL',async()=>{}],
    ['NICKNAME FIRST',()=>L.setPetNick('a','Ada')],
    ['BOOT AUTO-EQUIP',async()=>{assert.equal(await L.equippedPetIid(),'a');}],
    ['HATCH FIRST',async()=>{await D.db.put('inv',{id:'egg',kind:'egg',goal:0,stepsAtStart:0,morph:'base'});assert.equal((await L.hatchEgg('egg')).ready,true);}],
  ])await check(name,async()=>{
    await boot(interrupted);await change();
    const before=await D.kvGet('petInst'), statuses=[],quotes=[];
    for(let i=0;i<3;i++) {
      statuses.push((await L.laboratory.snapshot()).status);
      for(const iids of [['a','b'],['a','c'],['b','c']])quotes.push(await L.laboratory.quote({iids}));
    }
    console.log(`OBSERVED ${name}: snapshots=${statuses.join(',')}, quotes=${quotes.filter(q=>q.ok).length}/9 accepted, refusals=${[...new Set(quotes.filter(q=>!q.ok).map(q=>q.reason))].join(',')||'none'}`);
    assert.deepEqual(statuses,['ready','ready','ready']);
    assert.ok(quotes.every(q=>q.ok),'every valid pair must be quotable');
    assert.deepEqual(await D.kvGet('petInst'),before,'recovery must not consume or resurrect a pet');
    assert.deepEqual(await D.kvGet('labIntents'),{});
    assert.equal((await L.animateLaboratory(interrupted.quote.request,{acknowledgedRisk:'reviewed',requireIntent:true})).reason,'stale-quote');
    const fresh=quotes[0].quote,acknowledgedRisk=fresh.risk?'ANIMATE':'reviewed';
    const results=await Promise.all([L.laboratory.animate({quote:fresh,acknowledgedRisk}),L.laboratory.animate({quote:fresh,acknowledgedRisk})]);
    assert.ok(results.every(r=>r.ok));assert.equal(results[0].receipt.result.iid,results[1].receipt.result.iid);
    assert.equal((await D.kvGet('petInst')).length,before.length-1);
    assert.equal((await L.laboratory.snapshot()).used,1);
  });
  await check('orphan and malformed intents heal without returning spent pets',async()=>{
    for(const malformed of [false,true]) {
      await boot(interrupted);
      await L.salvageInstance('a');
      const before=await D.kvGet('petInst'),taken=await D.kvGet('petTaken');
      if(malformed)await D.kvSet('labIntents',{orphan:{quote:null}});
      assert.equal((await L.laboratory.snapshot()).status,'ready');
      assert.deepEqual(await D.kvGet('petInst'),before);assert.deepEqual(await D.kvGet('petTaken'),taken);
      assert.deepEqual(await D.kvGet('labIntents'),{});
      assert.equal((await L.laboratory.quote({iids:['b','c']})).ok,true);
      assert.equal((await L.animateLaboratory(interrupted.quote.request,{acknowledgedRisk:'reviewed',requireIntent:true})).ok,false);
    }
  });
  const committed=killed('spend');
  await check('production boot recovers before Today, even after auto-equip',async()=>{
    await boot(interrupted);
    await L.equippedPetIid();
    const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
    const helper=app.match(/async function recoverLaboratoryAtBoot\(\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(helper,'boot recovery helper must exist');
    const bootSource=app.slice(app.indexOf('async function boot()'),app.indexOf('const interruptedFight =',app.indexOf('async function boot()')));
    assert.match(bootSource,/await recoverLaboratoryAtBoot\(\)/);
    assert.ok(bootSource.indexOf('await recoverLaboratoryAtBoot()')>bootSource.indexOf('await social.bootSync('));
    const messages=[],context=vm.createContext({kvGet:D.kvGet,laboratoryEngine:()=>L.laboratory,toast:x=>messages.push(x),labStateCopy:()=> 'unresolved'});
    vm.runInContext(helper,context);
    await context.recoverLaboratoryAtBoot();
    assert.deepEqual(messages,[]);
    assert.equal((await L.laboratory.snapshot({presentationOnly:true})).status,'ready');
    assert.equal((await L.laboratory.quote({iids:['a','b']})).ok,true);
  });
  await check('durable receipt corruption still refuses recovery without changing pets',async()=>{
    await boot(committed);
    const receipts=await D.kvGet('labExperiments'),id=Object.keys(receipts)[0];
    receipts[id].result.morph='midnight';
    await D.kvSet('labExperiments',receipts);
    const before=await D.kvGet('petInst');
    await assert.rejects(()=>L.laboratory.snapshot());
    assert.deepEqual(await D.kvGet('petInst'),before);
  });
  await check('committed result delivered once, spent result never resurrected',async()=>{
    await boot(committed);
    const snapshot=await L.laboratory.snapshot(),result=snapshot.unseen[0];
    assert.equal(snapshot.used,1);assert.equal(result.resultPresent,true);
    // A stale intent with different context cannot override a genuine receipt.
    await D.kvSet('labIntents',{[result.opId]:{format:1,createdAt:1,quote:{...committed.quote.request,context:{}}}});
    assert.equal((await L.laboratory.snapshot()).status,'ready');
    assert.deepEqual(await D.kvGet('labIntents'),{});
    const replay=()=>L.laboratory.animate({quote:committed.quote,acknowledgedRisk:'reviewed'});
    assert.equal((await replay()).receipt.result.iid,result.result.iid);
    await L.salvageInstance(result.result.iid);
    assert.equal((await replay()).receipt.resultPresent,false);
    assert.equal((await D.kvGet('petInst')).length,1);
    assert.equal((await L.laboratory.snapshot()).used,1);
  });
} finally {rmSync(auditOutputPath(temp),{recursive:true,force:true});}
console.log('COVERAGE finding 1: lab-health-recovery-audit.mjs executed; lock-only scenarios do not cover health');
console.log(`LAB LOCK RECOVERY: ${passed} passed, ${failed} failed`);
process.exitCode=failed?1:0;
