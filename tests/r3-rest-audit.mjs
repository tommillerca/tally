// Frozen R3 work order. Node-only production functions, crypto and mem-idb.
// RED recorded against origin/main 07384c7a before production edits.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {D,L,P,pet,seed,stable} from './lib/pet-destruction-harness.mjs';
const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const social=readFileSync(new URL('../js/social.js',import.meta.url),'utf8');
const pets=readFileSync(new URL('../js/pets.js',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
function cut(src,start,end){const a=src.indexOf(start),b=src.indexOf(end,a+start.length);assert(a>=0&&b>a,`Missing source seam ${start}`);return src.slice(a,b);}
function run(code,deps={}){return new AsyncFunction(...Object.keys(deps),code)(...Object.values(deps));}
let failed=0,passed=0;
async function check(name,fn){try{await fn();passed++;console.log(`PASS ${name}`);}catch(e){failed++;console.log(`FAIL ${name}: ${e.message}`);}}
const key=await webcrypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
async function encrypt(value){const iv=webcrypto.getRandomValues(new Uint8Array(12));const ct=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(value)));return Buffer.concat([iv,Buffer.from(ct)]).toString('base64');}
async function probe(response){
  return run(cut(social,'async function decryptBackup(', '/* EVERY REQUEST')+'\n'+
    cut(social,'export async function hasCloudBackup()', '/* ---------------- grants').replace('export ','')+'\nreturn hasCloudBackup();',{
    signedFetch:async(method,path)=>{assert.equal(method,'GET');assert.equal(path,'/backup');if(response instanceof Error)throw response;return response;},
    backupKey:async()=>key,b64ToU8:s=>new Uint8Array(Buffer.from(s,'base64')),crypto:webcrypto,validateImport:D.validateImport,
  });
}
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
async function eraseCopy(has){
  const line={};
  await run(cut(app,'    Promise.all([social.hasCloudBackup(), social.hasRecoveryPhrase(), social.myRecoveryId()])','    const input = $(\'#erIn\'')+'\nawait new Promise(resolve=>setTimeout(resolve,0));',{
    social:{hasCloudBackup:async()=>has,hasRecoveryPhrase:async()=>true,myRecoveryId:async()=>'recovery-id',
      restoreTruth:new Function(cut(social,'export function restoreTruth(', '// R38-12:').replace('export ','')+'\nreturn restoreTruth;')()},
    $:()=>line,wrap:{},setTimeout,
  });return line.innerHTML;
}
await check('R3-8 bare ok body cannot reassure before erase',async()=>{
  const has=await probe(response({ok:true})),copy=await eraseCopy(has);
  console.log(`R3-8 witness: hasCloudBackup=${has}; erase copy=${copy}`);
  assert.equal(has,null);assert.doesNotMatch(copy,/can be restored later/);assert.match(copy,/no vault copy can be confirmed/);
});
await check('R3-8 CONTROL: valid encrypted save, malformed body, unreadable save and HTTP outcomes',async()=>{
  assert.equal(await probe(response({blob:await encrypt({app:'tally',version:1,log:[]})})),true);
  for(const body of [null,[],{}, {blob:''},{blob:3},{blob:'garbage'},{blob:await encrypt({ok:true})}, {blob:await encrypt({app:'tally',version:999,log:[]})}])assert.equal(await probe(response(body)),null,JSON.stringify(body));
  assert.equal(await probe({ok:true,status:200,json:async()=>{throw new SyntaxError('bad JSON');}}),null);
  assert.equal(await probe(response({},404)),false);assert.equal(await probe(response({},500)),null);assert.equal(await probe(new Error('offline')),null);
});
await check('R3-4 refused replacement explains protection and next step without changing save',async()=>{
  const roster=[pet('a'),pet('b'),pet('c')];await seed(roster);
  const older=await D.exportAll();
  const q=(await L.laboratory.quote({iids:['a','b']})).quote;
  const result=await L.laboratory.animate({quote:q,acknowledgedRisk:q.risk?'ANIMATE':'reviewed'});assert.equal(result.ok,true,JSON.stringify(result));
  const current=await D.exportAll();
  assert.throws(()=>D.fileReplacementPreview(current,older),/laboratory-restore-conflict/);
  await assert.rejects(D.importAll(older,{replace:true}),/laboratory-restore-conflict/);
  const messages=[];
  await run(cut(app,'/* File imports and local undo share','function fileReplacementHtml(')+'\nawait importBackupFromFile(file);',{
    ...D,readFileSave:async()=>current,file:{text:async()=>JSON.stringify(older)},toast:s=>messages.push(s),openFileReplacementReview:()=>assert.fail('Unsafe replacement reached review'),
  });
  const after=await D.readFileSave();for(const s of D.STORES)assert.deepEqual(after[s],current[s]);
  assert.equal(messages.length,1);console.log(`R3-4 witness: ${messages[0]}`);
  assert.doesNotMatch(messages[0],/laboratory-restore-conflict/);
  assert.match(messages[0],/Laboratory/);assert.match(messages[0],/protect|prevent/i);assert.match(messages[0],/newer backup/i);
  // A conflict discovered after review must receive the same explanation.
  let review;
  await run(cut(app,'function fileImportFailure(', 'function fileReplacementHtml(')+
    cut(app,'function openFileReplacementReview(', 'async function openFileRestorePoints(')+
    '\nopenFileReplacementReview(older,current,older);',{
    ...D,older,current,fileReplacementHtml:()=>'',openPetDestructionReview:q=>{review=q;},
    saveFileRestorePoint:()=>{},toast:s=>messages.push(s),finishFileImport:()=>assert.fail('Refused import finished'),
  });
  const refusal=await review.commit();assert.match(refusal.message,/newer backup/i);assert.doesNotMatch(refusal.message,/laboratory-restore-conflict/);
  const final=await D.readFileSave();for(const s of D.STORES)assert.deepEqual(final[s],current[s]);
});
for(const [name,extra] of [['nickname',{petNick:{a:'Buddy'}}],['bond',{petBonds:{a:1}}],['talents',{pettalents:{__iidV:2,a:['p-hp']}}],['equipped',{petEquipped:'a',equipped:{C:'C1'}}]]){
  await check(`R3-5 ${name} alone requires typed destruction`,async()=>{
    const roster=[pet('a'),pet('b')];await seed(roster,extra);const ui=await stable(roster);await ui.click();
    assert(ui.review,'Only the light gate opened');assert.equal(ui.review.nodes['#pdGo'].disabled,true);
    await ui.submit();assert.equal((await L.petInstances()).length,2);
    ui.type('DESTROY');await ui.submit();assert.deepEqual((await L.petInstances()).map(p=>p.iid),['b']);
  });
}
await check('R3-5 CONTROL: uninvested duplicate keeps two-tap confirmation',async()=>{
  const roster=[pet('a'),pet('b')];await seed(roster);const ui=await stable(roster);await ui.click();assert.equal(ui.review,undefined);assert.equal((await L.petInstances()).length,2);await ui.click();assert.equal((await L.petInstances()).length,1);
});
await check('R3-6 remove unreachable Stable guard; authority still filters unsupported rows',async()=>{
  await seed([pet('a'),pet('b')]);await D.kvSet('petInst',[pet('a'),pet('ghost','base',{sp:'C999'})]);
  assert((await L.petInstances()).every(p=>P.isKnownPet(p.sp)));assert((await D.kvGet('petInst')).some(p=>p.sp==='C999'),'Unknown save row must be retained');
  assert(!/stableGhostWarned|instsAll\.filter\(x => x && isKnownPet\(x.sp\)\)/.test(app),'Unreachable Stable filter/warning remains');
});
await check('R3-6 morph accounting comment matches six morphs and 36 pairs',async()=>{
  assert.equal(P.MORPHS.length,6);assert(/6 morphs = 36 pairs/.test(pets),'Comment still claims five morphs / 30 pairs');assert(!/5 morphs = 30 pairs/.test(pets));
});
await check('R3-6 CONTROL: retained friend payload actually reaches paddock renderer',async()=>{
  assert.match(app,/\$\('#fpYardGo', wrap\)\?\.addEventListener\('click', \(\) => openFriendPaddock\(f\)\)/);
  const yard={n:2,pets:[{sp:'C1',morph:'frost',shiny:false},{sp:'C6',morph:'base',shiny:true}],wear:{CE:'CE1'}};
  let drawn,html;
  const code=(cut(app,'async function openFriendPaddock(', '\n}\n')+'\n}').replace("await import('./paddock.js')",'paddock');
  await run(code+'\nawait openFriendPaddock(f);',{
    ...P,f:{name:'Friend',profile:{yard},lastSeen:1},paddock:{placePaddock:rs=>Object.fromEntries(rs.map(r=>[r.iid,{}])),PDK_SCENE:{KEEPER:{}},motionFor:sp=>sp},
    equipped:async()=>({}),dateKey:()=> '2026-09-09',paddockSceneHtml:opts=>{drawn=opts.roster;return '<scene>';},openSheet:s=>{html=s;},esc:String,snapshotDetail:()=> 'Shared snapshot',
  });
  assert.deepEqual(drawn.map(({sp,morph,shiny,wear})=>({sp,morph,shiny,wear})),yard.pets.map(p=>({...p,wear:yard.wear})));
  assert.match(html,/2 PETS/);
});
console.log(`R3 rest: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
