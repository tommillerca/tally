// Known unfixed settlement and backup-merge gaps, recorded by the frozen map playtest.
// Run: node docs/playtest-map-gaps.mjs
// Executes production boss/mini branches and the common coin tail. Only the
// failed coinsAdd dependency and non-state UI helpers are replaced. No writes
// to disk, network or browser. Exit 1 means the earned-payout invariant failed.
import {readFileSync} from 'node:fs';
import {pathToFileURL, fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..', import.meta.url));
const local=p=>import(pathToFileURL(`${root}/${p}`));
await local('tests/mem-idb.mjs');
const D=await local('js/db.js'), P=await local('js/poi.js'), L=await local('js/loot.js');
const C=await local('js/cooking.js'), N=await local('js/nutrition.js');
const app=readFileSync(`${root}/js/app.js`,'utf8');
const cut=(a,b)=>{const start=app.indexOf(a),end=app.indexOf(b,start);if(start<0||end<start)throw Error('missing production slice');return app.slice(start,end);};
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const common=cut("      if (foeCfg.mode !== 'wanderer') {",'      window.__refreshWalletPill?.();');
const branches=cut("      else if (foeCfg.mode === 'boss') {","      else if (foeCfg.mode === 'secret') {");
const settle=async(config,coinWrite)=>{
  const env={...D,...P,...L,...C,...N,foeCfg:config,coinsAdd:coinWrite,crateCard:x=>x,ingIconHtml:()=>'',ICONS:{dust:()=>''}};
  delete env.coins;
  return new AsyncFunction(...Object.keys(env),`let xp=0,coins=0,bossLoot=null,extraCards=[],extras=[];if(false){} ${branches}\n${common}\nreturn {xp,coins};`)(...Object.values(env));
};
let failures=0;
for(const mode of ['boss','mini']){
  D.useDbName(`map-gap-${mode}`);
  await D.db.put('xp',{key:'seed',type:'seed',xp:1000000,date:N.dateKey()});
  await D.kvSet('buffs',{xp2:2});
  const den=P.densNear('2026-W37',49.28,-123.12,'2026-09-08').find(d=>d.roaming && d.reward.coins);
  const mini=P.minisNear('2026-09-08',49.28,-123.12)[0];
  const config={mode,den,mini,date:N.dateKey()};
  // The dependency's rejected Promise models a failed currency write. The
  // decisions about claiming, consuming charm and retry payouts are production.
  let failed=0;
  try{await settle(config,async()=>{failed++;throw Error('coin write unavailable');});}catch(e){if(e.message!=='coin write unavailable')throw e;}
  if(failed!==1)throw Error('fault missed');
  const key=mode==='boss'?P.denKey(N.dateKey(),den):P.miniKey(N.dateKey(),mini);
  const before={claimed:!!await D.db.get('xp',key),coins:await L.coins(),charm:(await D.kvGet('buffs')).xp2};
  const retry=await settle(config,L.coinsAdd);
  const base=mode==='boss'?den.reward.coins:mini.reward.coins;
  const owed=base+Math.round(base*0.25), wallet=await L.coins();
  const healthy=wallet===owed && (await D.kvGet('buffs')).xp2===1;
  if(!healthy) failures++;
  console.log(`${healthy?'PASS':'FAIL'} M5 ${mode}: `+JSON.stringify({baseOwed:base,boostedOwed:owed,afterFailure:before,retry,wallet,charm:(await D.kvGet('buffs')).xp2}));
}
// The ordinary additive cloud-merge path, with real export and import services.
D.useDbName('map-gap-stale-empty');
await D.db.put('xp',{key:'seed',type:'seed',xp:1000000,date:N.dateKey()});
await D.kvSet('denloot',[]);
const staleEmpty=await D.exportAll();
const landmark=P.densNear(P.isoWeekKey(),49.28,-123.12)[0];
const earned=await P.claimDenWin(landmark);
if(!earned?.gearChoices?.length) throw Error('missing real gear entitlement');
await D.importAll(staleEmpty,{replace:false});
const pendingAfter=(await D.kvGet('denloot',[])).length;
const replay=await P.claimDenWin(landmark);
if(pendingAfter!==1) failures++;
console.log(`${pendingAfter===1?'PASS':'FAIL'} M6 stale empty merge: pending=${pendingAfter}, winRetry=${JSON.stringify(replay)}`);
D.useDbName('map-gap-stale-choice');
await D.db.put('xp',{key:'seed',type:'seed',xp:1000000,date:N.dateKey()});
const reward=await P.claimDenWin(landmark);
const pending=await D.kvGet('denloot'), staleChoice=await D.exportAll();
await P.claimDenLoot(pending[0].key,reward.gearChoices[0].id);
await D.importAll(staleChoice,{replace:false});
await P.claimDenLoot(pending[0].key,reward.gearChoices[1].id);
const gearCount=(await L.inventory()).filter(r=>r.kind==='gear').length;
if(gearCount!==1) failures++;
console.log(`${gearCount===1?'PASS':'FAIL'} M6 stale choice merge: gear=${gearCount}, expected=1`);
console.log(`KNOWN GAPS: ${failures} earned-payout invariant(s) failed`);
process.exitCode=failures?1:0;
