// Frozen PRIOR-PACE appendix adapted for paired protected/unprotected measurement.
// Run from the checkout root: node scripts/lab-risk-model.mjs
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root = pathToFileURL(process.cwd() + '/');
const {rollMorph, ownedPairs, MORPHS, MORPH_WEIGHT} = await import(new URL('js/pets.js', root));
const {pickRandomPet, SHINY_CHANCE, SHINY_ART, eggProgress, EGG_GOAL_STEPS} = await import(new URL('js/loot.js', root));
const ids = ['C1','C2','C3','C4','C5','C6'];
const morphs = ['base','ember','frost','toxic','rose','midnight'];
const weights = {...MORPH_WEIGHT, rose:10};
assert.deepEqual(morphs.map(m=>weights[m]), [40,22,22,10,10,4]);
assert.equal(SHINY_CHANCE, .03);
assert.deepEqual(SHINY_ART, ids.slice(0,5));
assert.equal(EGG_GOAL_STEPS, 8000);
const random = seed => () => {
  seed = (seed + 0x6D2B79F5)>>>0;
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
let cryptoRng = random(20260908);
Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues(a){
  for(let i=0;i<a.length;i++) a[i]=Math.floor(cryptoRng()*4294967296);
  return a;
}}});
// Real legacy helper control. Never use this global, five-morph roll as a lab recipe.
const onlyFrostMissing = ownedPairs(ids.flatMap(sp=>MORPHS.filter(m=>m!=='frost').map(morph=>({sp,morph}))));
for(let i=0;i<1000;i++) assert.equal(rollMorph(onlyFrostMissing),'frost');
assert.equal(MORPHS.includes('rose'),true); // Rose has shipped since the frozen measurement.
assert(ownedPairs([{sp:'C1',morph:'rose'}]).has('C1|rose'));
console.log(JSON.stringify({control:'real rollMorph fresh-first: 1000/1000 Frost; Rose present in this checkout; ownedPairs accepts Rose'}));
const {labDistribution} = await import(new URL('js/laboratory.js', root));
let protectedMode=true;
const profiles = [
  {name:'casual',rate:1.6,active:[0,2,4,6],steps:5000,income:360},
  {name:'daily',rate:5.9,active:[0,1,2,3,4,5,6],steps:15500,income:2632}
];
const has = (r,m) => r[m]+(m===0?r[6]:0)>0;
const done = r => morphs.every((_,m)=>has(r,m));
const middleNeeded = r => !r[3]||!r[4]||(!r[5]&&(r[3]<2||r[4]<2));
function candidates(r,ms,stock,sp){
  if(!protectedMode)return ms;
  const owned=ownedPairs(morphs.flatMap((m,i)=>has(r,i)?[{sp,morph:m}]:[]));
  const missing=ms.filter(m=>!owned.has(sp+'|'+morphs[m]));
  const low=stock?ms.filter(m=>r[m]<2):[];
  return missing.length?missing:low.length?low:ms;
}
// Ordered collection/stock table, including eligible-vs-shiny Base bookkeeping.
for(const [left,right,stock,expected] of [
  [0,0,true,[1,2]], [0,2,true,[1]], [2,0,true,[2]],
  [1,1,true,[1,2]], [1,2,true,[1]], [2,1,true,[2]],
  [2,2,true,[1,2]], [1,2,false,[1,2]]
]) assert.deepEqual(candidates([1,left,right,0,0,0,0],[1,2],stock,'C1'),expected);
// Pin the unprotected adapter to the production resolver across stock combinations.
for(const [recipe,ms] of [['base-base',[1,2]],['ember-frost',[3,4]]]) {
  for(const l of [0,1,2,4])for(const r of [0,1,2,4]) {
    const roster=[...Array.from({length:l},()=>({sp:'C1',morph:morphs[ms[0]]})),...Array.from({length:r},()=>({sp:'C1',morph:morphs[ms[1]]}))];
    assert.deepEqual(labDistribution(roster,recipe,'C1').distribution,ms.map(m=>({morph:morphs[m],weight:weights[morphs[m]]})));
  }
}
function trial(p,index,{slots=1,stock=false,burst=false,buy=false}={}){
  const hatchRng=random(20260908+Math.imul(index,2654435761));
  cryptoRng=hatchRng;
  // Keep the prior species-specific lower streams and seeds for paired comparisons.
  const lower=ids.map((_,s)=>random(1234567+Math.imul(index,2246822519)+Math.imul(s+1,1013904223)));
  const rows=ids.map(()=>[stock?10000:0,0,0,0,0,0,0]);
  const attempts=ids.map(()=>0), uses=ids.map(()=>0), bases=ids.map(()=>0);
  let day=0,meter=0,pending=[],hatches=0,first=0,any=0,one=0,firstPair=0;
  let exp=0,activeDays=0,busyDays=0,capDays=0,capacityTotal=0,secondUses=0,thirdUses=0;
  const hatch=()=>{
    // Match hatchEgg's unconditional shiny draw, then actual species helper, then art gate.
    const shinyRoll=hatchRng()<SHINY_CHANCE;
    const id=pickRandomPet(new Set(ids.filter((_,s)=>rows[s].some(n=>n>0)))).id;
    const s=ids.indexOf(id);assert(s>=0,'CX/unknown hatch');
    rows[s][shinyRoll&&SHINY_ART.includes(id)?6:0]++;hatches++;
  };
  if(!stock) hatch(); // Existing ready welcome egg, opened on day 1.
  function choose(){
    for(let priority=0;priority<2;priority++) for(let s=0;s<6;s++){
      const r=rows[s],top=!r[5],mid=middleNeeded(r);
      if(priority===0&&top&&r[3]>=2&&r[4]>=2)return {s,inputs:[3,4],ms:[5],final:true};
      if(mid&&r[1]>=2&&r[2]>=2&&(priority===1||!r[3]||!r[4]))
        return {s,inputs:[1,2],ms:candidates(r,[3,4],top,ids[s])};
      if(r[0]>=2&&r[0]+r[6]>=3&&((priority===0&&(!r[1]||!r[2]))||
        (priority===1&&mid&&(r[1]<2||r[2]<2))))
        return {s,inputs:[0,0],ms:candidates(r,[1,2],mid,ids[s])};
    }
    return null;
  }
  function animate(action){
    const {s,inputs,ms}=action,r=rows[s];
    const before=morphs.map((_,m)=>has(r,m));
    const total=r.reduce((a,b)=>a+b,0);
    let out=5;
    if(action.final){
      assert.deepEqual(ms,[5]); // Guaranteed result, no final outcome RNG draw.
    }else{
      // Preserve prior lower-stream advancement even on protected singleton outcomes.
      let x=lower[s]()*ms.reduce((sum,m)=>sum+weights[morphs[m]],0);
      out=ms.at(-1);for(const m of ms){x-=weights[morphs[m]];if(x<0){out=m;break;}}
    }
    // Always subtract two and immediately add one pet. Column 6 is never an input.
    for(const m of inputs){assert(m<6&&r[m]>0);r[m]--;}
    r[out]++;exp++;uses[s]++;
    if(inputs[0]===0)bases[s]+=2;
    if(action.final)attempts[s]++;
    assert.equal(r.reduce((a,b)=>a+b,0),total-1);
    assert(before.every((owned,m)=>!owned||has(r,m)),'safe policy lost a cell');
  }
  while(!rows.every(done)){
    day++;assert(day<100000,'uncensored trial guard exceeded');
    const active=p.active.includes((day-1)%7);
    if(active)meter+=p.steps;
    if(!stock){
      const n=burst?(day%7===0?Math.floor(day*p.rate/7)-Math.floor((day-7)*p.rate/7):0):
        Math.floor(day*p.rate/7)-Math.floor((day-1)*p.rate/7);
      for(let i=0;i<n;i++)pending.push({stepsAtStart:meter,goal:EGG_GOAL_STEPS});
      if(active)pending=pending.filter(e=>{if(eggProgress(e,meter).ready){hatch();return false;}return true;});
    }
    if(active){
      if(!firstPair&&rows.some(r=>r[0]>=2))firstPair=day;
      activeDays++;
      const capacity=buy?(day*p.income/7>=60000?3:day*p.income/7>=20000?2:1):slots;
      capacityTotal+=capacity;
      let used=0;
      while(used<capacity&&!rows.every(done)){
        const action=choose();if(!action)break;animate(action);used++;
      }
      if(used)busyDays++;
      if(used>=2)secondUses++;
      if(used>=3)thirdUses++;
      if(used===capacity&&choose())capDays++;
    }
    if(!first&&rows.some(r=>r.slice(1,6).some(n=>n>0)))first=day;
    if(!any&&rows.some(done))any=day;
    if(!one&&done(rows[0]))one=day;
  }
  const S=attempts.reduce((a,b)=>a+b,0);
  for(let s=0;s<6;s++){
    assert.equal(attempts[s],1);
    assert(protectedMode ? uses[s]===15 : uses[s]>=15);
    assert(protectedMode ? bases[s]===20 : bases[s]>=20);
  }
  assert.equal(S,6);
  assert(protectedMode ? exp===90 : exp>=90);
  assert.equal(rows.flat().reduce((a,b)=>a+b,0),(stock?60000:0)+hatches-exp);
  return {seed:index,first,firstPair,any,one,full:day,exp,hatches,attempts:S,maxAttempts:Math.max(...attempts),
    baseFeedstock:bases.reduce((a,b)=>a+b,0),consumedPets:2*exp,perSpeciesUses:uses,perSpecies:attempts,activeDays,busyDays,capDays,capacityTotal,secondUses,thirdUses};
}
const N=Number(process.env.LAB_TRIALS||20000);
assert(Number.isInteger(N)&&N>0);
const stats=a=>{
  a.sort((a,b)=>a-b);
  return {mean:+(a.reduce((a,b)=>a+b,0)/a.length).toFixed(3),
    ...Object.fromEntries([50,90,95,99].map(q=>['p'+q,a[Math.ceil(a.length*q/100)-1]])),max:a.at(-1)};
};
const paired=new Map();
const protectedSamples=new Map();
function run(p,opts={}){
  const samples=Array.from({length:N},(_,i)=>trial(p,i,opts));
  const summary=Object.fromEntries(['first','firstPair','any','one','full','exp','hatches','attempts','maxAttempts',
    'baseFeedstock','consumedPets','activeDays','busyDays','capDays','secondUses','thirdUses'].map(k=>[k,stats(samples.map(s=>s[k]))]));
  if(protectedMode)assert.equal(summary.exp.mean,90);
  assert.equal(summary.attempts.mean,6);
  if(opts.stock && protectedMode){
    assert.equal(summary.full.p50,Math.ceil(90/opts.slots));
    assert.equal(summary.full.max,Math.ceil(90/opts.slots));
  }
  if(opts.stock)for(const s of samples)assert.equal(s.full,Math.ceil(s.exp/opts.slots));
  const key=protectedMode+':'+p.name+':'+!!opts.stock;
  if(!opts.burst&&!opts.buy){
    if((opts.slots||1)===1)paired.set(key,samples);
    else{
      const base=paired.get(key);assert(base);
      for(let i=0;i<N;i++)assert.deepEqual(samples[i].perSpeciesUses,base[i].perSpeciesUses);
      summary.daysSaved=stats(samples.map((s,i)=>base[i].full-s.full));
    }
  }
  const scenario=p.name+':'+JSON.stringify(opts);
  if(protectedMode)protectedSamples.set(scenario,samples);
  else {
    const baseline=protectedSamples.get(scenario);assert(baseline);
    summary.extra=Object.fromEntries(['full','exp','baseFeedstock','consumedPets','hatches'].map(k=>[k,stats(samples.map((s,i)=>s[k]-baseline[i][k]))]));
    // Risk cannot affect the first experiment or eligible pair under the frozen policy.
    for(let i=0;i<N;i++)for(const k of ['first','firstPair'])assert.equal(samples[i][k],baseline[i][k]);
  }
  if(protectedMode && N===20000 && opts.slots===1 && !opts.stock) {
    const expected=p.name==='daily'?[[12,13],[116,130],[192,223]]:[[43,47],[423,470],[703,817]];
    for(const [i,k] of ['first','any','full'].entries())assert.deepEqual([summary[k].p50,summary[k].p90],expected[i]);
  }
  const sum=k=>samples.reduce((n,s)=>n+s[k],0);
  const worst=samples.reduce((a,b)=>b.maxAttempts>a.maxAttempts?b:a);
  console.log(JSON.stringify({mode:protectedMode?'protected':'unprotected',profile:p.name,opts,N,...summary,
    pooledSpeciesAttempts:stats(samples.flatMap(s=>s.perSpecies)),
    utilisation:+(sum('exp')/sum('capacityTotal')).toFixed(5),
    busyDayFraction:+(sum('busyDays')/sum('activeDays')).toFixed(5),
    worstSpecies:{seed:worst.seed,attempts:worst.maxAttempts,species:ids[worst.perSpecies.indexOf(worst.maxAttempts)],fullDay:worst.full}}));
}
for(protectedMode of [true,false]) {
for(const p of profiles)for(const slots of [1,2,3])run(p,{slots});
for(const slots of [1,2,3])run(profiles[1],{slots,stock:true});
for(const p of profiles)run(p,{burst:true});
for(const p of profiles)run(p,{buy:true});
}
