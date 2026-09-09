// Two real local databases, real encrypted backup/CAS client, simulated network.
// No browser, sockets, Worker or production writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {D,L,pet,seed} from './lib/pet-destruction-harness.mjs';
import * as S from '../js/social.js';
import {labReconciliation,labDayProjection,validateLabSave} from '../js/laboratory.js';

// CONTROL: the fixtures must actually collide before anything below is graded.
// Without this a harness that silently built two independent days would report
// every arm green while testing nothing. Required by guard-hygiene-lint.
const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const copy=Function(`${app.match(/function cloudFailLine\([\s\S]*?\n\}/)[0]}; return cloudFailLine;`)();
let blob=null,dailyBlob=null,version=0,offline=false,failed=0;
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});
globalThis.fetch=async(url,opts={})=>{
  if(offline)throw new TypeError('offline');
  const path=new URL(url).pathname;
  if(path==='/register')return response(200,{playerId:'lab-conflict',handle:'LAB',friendCode:'LAB1'});
  if(path!=='/backup')return response(404,{});
  if((opts.method||'GET')==='GET'){
    const selected=new URL(url).searchParams.get('slot')==='daily'?dailyBlob:blob;
    return selected?response(200,{blob:selected,version,updatedAt:version}):response(404,{});
  }
  const body=JSON.parse(opts.body);
  if(body.baseVersion!==(blob?version:null))return response(409,{code:'stale-backup',version});
  blob=body.blob;version++;return response(200,{ok:true,version,updatedAt:version});
};
async function check(label,fn){try{await fn();console.log(`PASS ${label}`);}catch(e){failed++;console.log(`FAIL ${label}: ${e.message.split("\n")[0]}`);}}
const contents=({exportedAt,...save})=>save;
const kv=save=>Object.fromEntries(save.kv.map(r=>[r.k,r.v]));
// Execute the existing Settings control, including its real setCloudBackup and
// pushBackup calls. This proves a reachable action, not browser rendering.
async function retryFromSettings(){
  let click,pushed;
  const button={disabled:false,addEventListener(event,fn){assert.equal(event,'click');click=fn;}};
  const start=app.indexOf("  $('#cbOn', el)?.addEventListener('click'");
  const end=app.indexOf("  $('#cbOff', el)?.addEventListener",start);
  assert.ok(start>0&&end>start);
  vm.runInNewContext(app.slice(start,end),{el:{},$:()=>button,APP_SOCIAL_V:'audit',
    social:{...S,pushBackup:async(...args)=>(pushed=await S.pushBackup(...args))},
    kvGet:D.kvGet,cloudFailLine:copy,toast(){},renderSettings(){}});
  await click();return pushed;
}
const ui={};
for(const name of ['labReconciledHtml','labDailyCopy','labIncubatorHtml']){
  ui[name]=Function(`${app.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))[0]}; return ${name};`)();
}
for(const arm of ['same-pair','different-pairs']){
  blob=null;version=0;offline=false;
  await seed(['a','b','c','d','e'].map(id=>pet(id)));
  await D.kvSet('apiBase','https://lab-conflict.invalid');
  assert.equal((await S.goOnline()).ok,true);
  assert.equal(await S.pushBackup('audit'),true); // Mint shared encryption key.
  const base=await D.exportAll();
  const forks=[];
  for(const device of ['a','b']){
    D.useDbName(`lab-conflict-${arm}-${device}`);
    await D.importAll(base);
    await D.kvSet('backupVersion',version);
    await D.kvSet('backupAt',0);
    offline=true;
    const iids=device==='b'&&arm==='different-pairs'?['c','d']:['a','b'];
    const quoted=await L.laboratory.quote({iids});
    assert.equal(quoted.ok,true,JSON.stringify({quoted,roster:await D.kvGet('petInst')}));
    const q=quoted.quote;
    const result=await L.laboratory.animate({quote:q,acknowledgedRisk:q.risk?'ANIMATE':'reviewed'});
    assert.equal(result.ok,true,JSON.stringify(result));
    await D.db.put('log',{id:device,date:q.day,meal:0,ts:1,name:device,kcal:1,p:0,c:0,f:0});
    forks.push(await D.exportAll());
  }
  offline=false;
  D.useDbName(`lab-conflict-${arm}-a`);
  assert.equal(await S.pushBackup('audit'),true);
  dailyBlob=blob; // Archive lacks the other device's experiment, even after sync.
  D.useDbName(`lab-conflict-${arm}-b`);
  const pushes=[await retryFromSettings()];for(let i=0;i<2;i++)pushes.push(await S.pushBackup('audit'));
  const fail=await D.kvGet('backupFail'),at=await D.kvGet('backupAt',0);
  const pull=await S.pullBackup(),daily=await S.restoreDailyBackup();
  console.log(`${arm}: ${JSON.stringify({pushes,backupAt:at,reason:fail?.reason,pull:pull.restored,daily:daily.restored,copy:fail?copy(fail.reason)+' Last good backup: '+(at?'recorded':'never')+'.':null})}`);
  await check(`${arm}: losing device recovers and records a backup`,()=>{
    assert.deepEqual(pushes,[true,true,true]);assert.ok(at>0);assert.equal(pull.restored,true);
  });
  await check(`${arm}: immutable receipts, results and unrelated progress survive`,async()=>{
    const state=kv(await D.exportAll());
    for(const fork of forks)for(const [id,r] of Object.entries(kv(fork).labExperiments)){
      assert.deepEqual(state.labExperiments[id],r);
      assert.ok(state.petInst.some(p=>p.iid===r.result.iid));
    }
    assert.deepEqual((await D.db.all('log')).map(r=>r.id).sort(),['a','b']);
  });
  await check(`${arm}: both devices converge and consumed pets stay absent after reconnect`,async()=>{
    const merged=kv(await D.exportAll());
    D.useDbName(`lab-conflict-${arm}-a`);
    assert.equal((await S.pullBackup()).restored,true);
    const state=kv(await D.exportAll());
    assert.deepEqual(state.labExperiments,merged.labExperiments);
    assert.deepEqual(state.labDaily,merged.labDaily);
    assert.equal(new Set(state.petTaken).size,state.petTaken.length);
    for(const fork of forks)for(const r of Object.values(kv(fork).labExperiments))for(const p of r.inputs){
      assert.ok(state.petTaken.includes(p.iid));assert.ok(!state.petInst.some(x=>x.iid===p.iid));
    }
    assert.equal((await L.laboratory.quote({iids:['a','b']})).ok,false);
    assert.equal((await L.laboratory.snapshot()).remaining,0);
  });
  await check(`${arm}: recovery is disclosed and a stale daily replacement cannot erase it`,async()=>{
    assert.equal(daily.restored,false);
    const s=await L.laboratory.snapshot();
    assert.equal(s.reconciliation.recovered.length,1);
    assert.equal(Object.keys(s.reconciliation.consumed).length,arm==='same-pair'?2:4);
    assert.equal(s.used,2);assert.equal(s.remaining,0);
    assert.match(ui.labReconciledHtml(s),/All results and original receipts were kept/);
    assert.match(ui.labReconciledHtml(s),/Offline devices cannot check/);
    assert.match(ui.labDailyCopy(s),/2 experiments were recorded/);
    assert.match(ui.labIncubatorHtml(s),/Today's remaining uses: 0 to 0/);
  });
  await check(`${arm}: replay, stale merge and later result consumption cannot duplicate pets`,async()=>{
    const saved=await D.exportAll(),state=kv(saved);
    const reconciliation=labReconciliation(state.labExperiments);
    const reverse=Object.fromEntries(Object.entries(state.labExperiments).reverse());
    assert.deepEqual(labReconciliation(reverse),reconciliation);
    assert.deepEqual(labDayProjection(reverse,state.labIncubators),state.labDaily);
    for(const r of Object.values(state.labExperiments)){
      const replay=await L.animateLaboratory(r.request,{acknowledgedRisk:'ANIMATE'});
      assert.equal(replay.ok,true);assert.deepEqual(replay.receipt,r);
    }
    assert.deepEqual(await D.kvGet('petInst'),state.petInst);
    const result=Object.values(state.labExperiments)[0].result;
    await L.salvageInstance(result.iid);
    await D.importAll(saved,{replace:false});await D.importAll(base,{replace:false});
    assert.equal((await D.kvGet('petInst')).some(p=>p.iid===result.iid),false);
    assert.deepEqual(await D.kvGet('labExperiments'),state.labExperiments);
    assert.deepEqual(await D.kvGet('labDaily'),state.labDaily);
    validateLabSave(kv(await D.exportAll()));
    // With capacity available, refusal must come from spent input ownership.
    assert.equal((await L.buyLabIncubator({format:1,opId:`${arm}-buy2`,slot:2,price:20000})).ok,true);
    assert.equal((await L.buyLabIncubator({format:1,opId:`${arm}-buy3`,slot:3,price:40000})).ok,true);
    assert.equal((await L.laboratory.snapshot()).remaining,1);
    assert.equal((await L.quoteLaboratory(['a','b'])).reason,'invalid-pair');
  });
  await check(`${arm}: abort rolls reconciliation back and invalid receipts still refuse`,async()=>{
    let connection;
    const originalOpen=indexedDB.open;
    indexedDB.open=(...args)=>{
      const request=originalOpen(...args);let callback;
      Object.defineProperty(request,'onsuccess',{get:()=>callback,set:fn=>{
        callback=e=>{connection=request.result;fn(e);};
      }});
      return request;
    };
    D.useDbName(`lab-conflict-${arm}-abort`);
    try{await D.importAll(forks[0]);}finally{indexedDB.open=originalOpen;}
    const before=await D.exportAll(),transaction=connection.transaction;let hits=0;
    connection.transaction=(...args)=>{
      const tx=transaction(...args),objectStore=tx.objectStore;
      tx.objectStore=name=>{
        const store=objectStore(name),put=store.put;
        store.put=row=>{
          if(name==='kv'&&row.k==='labDaily'&&Object.values(row.v).some(day=>day.used===2)){
            hits++;throw new DOMException('injected abort','QuotaExceededError');
          }
          return put(row);
        };
        return store;
      };
      return tx;
    };
    try{await assert.rejects(D.importAll(forks[1],{replace:false}),/injected abort/);}finally{connection.transaction=transaction;}
    assert.equal(hits,1,`abort boundary hits: ${hits}`);assert.deepEqual(contents(await D.exportAll()),contents(before));
    await D.importAll(forks[1],{replace:false});const merged=await D.exportAll();
    const tampered=structuredClone(forks[0]);
    Object.values(kv(tampered).labExperiments)[0].committedAt++;
    await assert.rejects(D.importAll(tampered,{replace:false}),/laboratory-restore-conflict/);
    assert.deepEqual(contents(await D.exportAll()),contents(merged));
    const broken=structuredClone(merged);
    Object.values(kv(broken).labExperiments)[0].result.morph='base';
    await assert.rejects(D.importAll(broken,{replace:false}),/invalid-experiment/);
    assert.deepEqual(contents(await D.exportAll()),contents(merged));
  });
}
await check('permanent conflict copy gives action without a safety or retry promise',()=>{
  const text=copy('conflicting-experiments');
  assert.doesNotMatch(text,/safe|keeps retrying/i);
  assert.match(text,/export/i);assert.match(text,/conflict|cannot merge/i);
  assert.match(text,/tap On under Cloud backup/);
  assert.match(app,/<button id="cbOn"[^>]*>On<\/button>/);
  for(const reason of ['network','decrypt','too-large','laboratory-restore-conflict','invalid-experiment']){
    assert.doesNotMatch(copy(reason),/safe on this phone|keeps retrying/i);
  }
});
console.log('LIMITATION: disconnected devices can still attempt the same pets. This audit proves reconciliation and ownership refusal after reconnect, not immediate offline exclusion.');
console.log(`${failed} failed`);process.exitCode=failed?1:0;
