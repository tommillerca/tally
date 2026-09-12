// Exploratory evidence, not a regression suite. Run from this checkout:
// node docs/playtest-lab/run.mjs
// Real services and extracted production renderers; no sockets or browser.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import vm from 'node:vm';
import '../../tests/mem-idb.mjs';
import * as D from '../../js/db.js';
import * as L from '../../js/loot.js';
import * as P from '../../js/pets.js';
import * as Rules from '../../js/laboratory.js';
import {dateKey} from '../../js/nutrition.js';
import {BH_BY_ID} from '../../data/boneheadz.js';
const app=readFileSync(process.env.LAB_APP_SOURCE || new URL('../../js/app.js',import.meta.url),'utf8');
const pure=app.split('// LAB UI PURE BEGIN:')[1].split('\n').slice(1).join('\n').split('// LAB UI PURE END')[0];
const esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const ui=vm.createContext({...P,...L,BH_BY_ID,KENNEL_SPECIES:['C1','C2','C3','C4','C5','C6'].map(id=>BH_BY_ID[id]),esc,
  petPortraitHtml:()=>'<img data-portrait>',petSpriteHtml:()=>'<img data-sprite>',morphSwatch:()=> 'var(--text)',
  /* v579 gave the Laboratory and Kitchen room headers, and openLab now calls
     roomHeaderHtml. This harness evals a SLICE of openLab, so the function is
     not in scope and the whole run died with a ReferenceError. Stubbed to a
     marker rather than the real markup: this harness grades lab COPY and
     behaviour, not header art, which tests/room-headers-audit.mjs owns. */
  roomHeaderHtml:room=>`<div data-room-header="${room}"></div>`});
vm.runInContext(pure,ui);
const text=html=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const evidence=[];
const record=(id,data)=>{evidence.push({id,...data});console.log(`OBSERVED ${id}`);};
let seq=0;
const pet=(morph='base',extra={})=>({iid:`p${++seq}`,sp:'C1',morph,shiny:false,lineage:0,hatchedAtSteps:0,...extra});
async function seed(roster,extra={}) {
  D.useDbName(`playtest-lab-${++seq}`);
  const species=[...new Set(roster.map(p=>p.sp))];
  const values={petInst:roster,pets:Object.fromEntries(species.map(sp=>[sp,{hatchedAtSteps:0}])),looks:species,
    petLvlV:2,petLvlSteps:Object.fromEntries(roster.map(p=>[p.iid,0])),pettalents:{__iidV:2},petStepCredit:0,
    petEquipped:null,equipped:{},coins:100000,coinsRev:0,...extra};
  for(const [k,v] of Object.entries(values))await D.kvSet(k,v);
  for(const sp of species)await D.db.put('inv',{id:`ownership-${sp}`,kind:'cos',itemId:sp});
  return L.laboratory.snapshot();
}
const quote=async pair=>{const r=await L.laboratory.quote({iids:pair.map(p=>p.iid)});assert.equal(r.ok,true,JSON.stringify(r));return r.quote;};
const animate=async q=>{const r=await L.laboratory.animate({quote:q,acknowledgedRisk:q.risk?'ANIMATE':'reviewed'});assert.equal(r.ok,true,JSON.stringify(r));return r.receipt;};
const bench=(s,selected=[null,null],sp='C1',q=null)=>ui.labBenchHtml(s,selected,sp,q);
const talent=P.PET_TREES[P.familyOf('C1').key][0].opts[0];
let roster=[pet()];
let s=await seed(roster);
record('welcome',{status:ui.labStateCopy(s,'C1'),stock:s.species.C1.safeCounts,html:bench(s),picker:ui.labPickerHtml(s,[null,null],0,'C1')});
roster=[pet(),pet()];s=await seed(roster);let q=await quote(roster);
record('one-spare',{hasEligiblePair:s.hasEligiblePair,hasSafePair:s.hasSafePair,stock:s.species.C1.safeCounts,status:ui.labStateCopy(s,'C1'),html:bench(s,roster.map(p=>p.iid),'C1',q),confirmation:ui.labConfirmationHtml(q)});
assert.equal(s.species.C1.safeCounts.base,1);assert.equal(q.risk,true);
roster=[pet('midnight'),pet(),pet(),pet('ember'),pet('frost')];s=await seed(roster);
record('terminal-input',{first:ui.labPickerHtml(s,[null,null],0,'C1'),second:ui.labPickerHtml(s,[roster[0].iid,null],1,'C1'),html:bench(s,[roster[0].iid,null])});

roster=['base','base','base','base','ember','frost','toxic'].map(m=>pet(m));s=await seed(roster);
record('mid-collection',{stock:s.species.C1.safeCounts,collection:s.collectionCount,html:bench(s)});
roster=Array.from({length:6},(_,i)=>P.MORPHS.map(m=>pet(m,{sp:`C${i+1}`}))).flat();s=await seed(roster);
q=await quote(roster.filter(p=>p.sp==='C1'&&['ember','frost'].includes(p.morph)));
record('completionist',{collection:s.collectionCount,safePair:s.hasSafePair,status:ui.labStateCopy(s,'C1'),html:bench(s),branches:q.branches});
assert.equal(s.collectionCount,36);assert.ok(q.branches.every(b=>b.afterCount===34));
roster=[pet(),pet(),pet('ember'),pet('ember'),pet('ember'),pet('frost'),pet('frost'),pet('frost'),pet('toxic'),pet('rose')];s=await seed(roster);
record('today-repeat',{today:ui.labTodayHtml(s,{current:true,priorDay:true,hidden:false}),useful:s.hasSafeUsefulPair});
q=await quote(roster.slice(0,2));record('optional-result-branch',{branches:q.branches,html:ui.labBranchesHtml(q)});
// An interrupted pre-dispatch intent, followed by an ordinary health sync.
roster=[pet(),pet(),pet()];await seed(roster);q=await quote(roster.slice(0,2));
assert.equal((await L.saveLabIntent(q.request,{acknowledgedRisk:'reviewed'})).ok,true);
await D.db.put('health',{date:dateKey(),steps:100,exerciseMin:0});
const statuses=[];for(let i=0;i<3;i++)statuses.push((await L.laboratory.snapshot()).status);
record('intent-health-lock',{statuses,pets:(await D.kvGet('petInst')).length,used:(await L.laboratory.snapshot()).used,intents:Object.keys(await D.kvGet('labIntents')),quote:await L.laboratory.quote({iids:roster.slice(0,2).map(p=>p.iid)})});
// Recovery belongs to findings 1 to 4. Record it without requiring the old bug.
// Legacy and excluded rows retain real investment in storage.
roster=[pet('base',{shiny:true}),pet('base',{sp:'CX'}),pet('UNKNOWN'),pet()];delete roster[3].morph;
s=await seed(roster,{petLvlSteps:Object.fromEntries(roster.map(p=>[p.iid,50000])),petNick:Object.fromEntries(roster.map(p=>[p.iid,'BISCUIT'])),petBonds:Object.fromEntries(roster.map(p=>[p.iid,4]))});
record('excluded-metadata',{stored:await D.kvGet('petLvlSteps'),rows:s.pets,picker:ui.labPickerHtml(s,[null,null],0),stableUnknownName:L.petColourName(roster[2])});
assert.equal(s.pets[3].bankedSteps,50000);
// Shiny keeper and legacy shiny with a conflicting morph, separately.
roster=[pet('base',{shiny:true}),pet(),pet()];s=await seed(roster);q=await quote(roster.slice(1));
record('shiny-keeper-control',{stock:s.species.C1.safeCounts,risk:q.risk,branches:q.branches});assert.equal(q.risk,false);
roster=[pet('frost',{shiny:true}),pet(),pet()];s=await seed(roster);q=await quote(roster.slice(1));
record('legacy-shiny-colour',{labCells:s.ownedCells,kennelCells:[...P.ownedPairs(roster)],branches:q.branches,html:ui.labBranchesHtml(q)});
// Laboratory loss disclosures, equipment replacement and retained wardrobe.
roster=[pet('toxic',{lineage:3}),pet('rose'),pet()];
s=await seed(roster,{petLvlSteps:{[roster[0].iid]:50000,[roster[1].iid]:100},petNick:{[roster[0].iid]:'BISCUIT'},petBonds:{[roster[0].iid]:4},pettalents:{__iidV:2,[roster[0].iid]:[talent.id]},petEquipped:roster[0].iid,equipped:{C:'C1',H:'test-hat'},petWear:{PH:'test-owned-wardrobe'}});
q=await quote(roster.slice(0,2));const investedReceipt=await animate(q);
record('lab-disclosure-control',{html:ui.labConfirmationHtml(q),equipped:await D.kvGet('petEquipped'),result:investedReceipt.result,petWear:await D.kvGet('petWear')});
assert.equal(await D.kvGet('petEquipped'),investedReceipt.result.iid);
await D.kvSet('petLvlSteps',{[investedReceipt.result.iid]:50000});await L.setPetNick(investedReceipt.result.iid,'NEWNAME');
s=await L.laboratory.snapshot();record('old-receipt',{live:s.pets.find(p=>p.iid===investedReceipt.result.iid),html:ui.labRevealHtml(s.unseen[0])});
// Capture and drive the production Stable Destroy click handler.
const destroySource=app.slice(app.indexOf("    $$('[data-destroy]', body).forEach",app.indexOf('async function openStable')),app.indexOf("    $$('[data-offsp]', body).forEach",app.indexOf('async function openStable')));
const destroyHelpers=app.split('// PET DESTRUCTION UI PURE BEGIN')[1].split('// PET DESTRUCTION UI PURE END')[0];
async function destroyCase(name,roster,extra={},between=null) {
  await seed(roster,extra);const bank=await D.kvGet('petLvlSteps');
  const messages=[];let review=null,click;
  const button={dataset:{destroy:roster[0].iid,dust:String(L.petDustValue(BH_BY_ID[roster[0].sp])+(roster[0].shiny?15:0)+(roster[0].lineage||0)*8)},innerHTML:'Destroy',addEventListener:(type,fn)=>{click=fn;}};
  const ctx=vm.createContext({...P,...L,esc,insts:roster,bank,body:{},S:{},ICONS:{dust:()=>''},BH_BY_ID,setTimeout:()=>0,popSound:()=>{},render:()=>{},toast:x=>messages.push(x),openPetDestructionReview:config=>{review=config;},$$:()=>[button]});
  vm.runInContext(destroyHelpers,ctx);vm.runInContext(destroySource,ctx);await click();
  const disclosure=review?.html||messages.join(' '),typed=!!review;
  if(between)await between();
  if(review)await review.commit();else await click();
  record(name,{typed,disclosure,messages,remaining:await D.kvGet('petInst'),bank:await D.kvGet('petLvlSteps'),nick:await D.kvGet('petNick'),bond:await D.kvGet('petBonds'),talents:await D.kvGet('pettalents'),equipped:await D.kvGet('petEquipped')});
}
roster=[pet(),pet()];await destroyCase('stable-named-bonded',roster,{petNick:{[roster[0].iid]:'BISCUIT'},petBonds:{[roster[0].iid]:4}});
roster=[pet('ember',{lineage:2}),pet()];await destroyCase('stable-talents',roster,{petLvlSteps:{[roster[0].iid]:50000},pettalents:{__iidV:2,[roster[0].iid]:[talent.id]}});
roster=[pet(),pet()];await destroyCase('stable-equipped',roster,{petEquipped:roster[0].iid,equipped:{C:'C1'}});
roster=[pet(),pet('base',{shiny:true})];await destroyCase('stable-shiny-last-copy',roster);
roster=[pet(),pet()];await destroyCase('stable-stale-training',roster,{petLvlSteps:{[roster[0].iid]:100},petEquipped:roster[0].iid,equipped:{C:'C1'}},async()=>{
  await D.db.put('health',{date:dateKey(),steps:1000,exerciseMin:0});await L.creditEquippedPetSteps();
  record('stable-training-before-commit',{bank:await D.kvGet('petLvlSteps')});
});
// Extract the real Breed bar and its real two-tap commit handler.
const breedStart=app.indexOf('${pair ? `<div class="breed-bar');
const breedEnd=app.indexOf("</div>` : ''}`;",breedStart)+"</div>` : ''}`;".length;
const breedExpression=app.slice(breedStart+2,breedEnd-3);
const breedHandler=app.slice(app.indexOf("    $('#doBreed', body)?.addEventListener",app.indexOf('async function openStable')),app.indexOf("    $$('[data-petpick2]', body).forEach",app.indexOf('async function openStable')));
async function breedCase(name,roster,extra={}) {
  await seed(roster,extra);const [keeper,spare]=roster,bank=await D.kvGet('petLvlSteps');let click;const messages=[];
  const button={dataset:{},disabled:false,classList:{add:()=>{}},addEventListener:(type,fn)=>{click=fn;}};
  const spareLoss=ui.breedInvestmentCopy?.(spare,bank,await L.petNicks(),await L.petBonds(),await D.kvGet('pettalents')) || '';
  const ctx=vm.createContext({...P,...L,esc,keeper,spare,spareLoss,pair:true,bank,offLineage:1,spareLvl:P.petLevel(bank[spare.iid]||0),
    spareIsPrecious:vm.runInNewContext(app.match(/const spareIsPrecious = ([^;]+);/)[1],{spare,spareLoss,spareLvl:P.petLevel(bank[spare.iid]||0)}),
    petPortraitHtml:()=>'<img>',petBreedGainText:()=>'(stat text omitted)',petStatBonusText:()=>'(stat text omitted)',
    ICONS:{chev:()=>'',warn:()=>''},spChips:'',breedLockNote:'',canBreedNow:true,
    body:{},insts:roster,sel:roster.map(p=>p.iid),offSp:keeper.iid,$:()=>button,toast:x=>messages.push(x),setTimeout:()=>0,
    BREED_ERR:{},saveBreed:()=>{},render:async()=>{},openPetBreedResult:()=>{},BH_BY_ID,openPetDestructionReview:()=>{}});
  vm.runInContext(destroyHelpers,ctx);
  const html=vm.runInContext(breedExpression,ctx);vm.runInContext(breedHandler,ctx);
  await click({currentTarget:button});await click({currentTarget:button});
  const after=await L.laboratory.snapshot();
  record(name,{html,messages,collectionBefore:P.ownedCellCount(P.ownedPairs(roster),['C1','C2','C3','C4','C5','C6']),collectionAfter:after.collectionCount,
    pets:after.pets,nick:await D.kvGet('petNick'),bonds:await D.kvGet('petBonds'),talents:await D.kvGet('pettalents')});
}
roster=[pet(),pet('midnight')];await breedCase('breed-last-colour',roster);
roster=[pet(),pet('ember',{lineage:2})];await breedCase('breed-investment',roster,{petLvlSteps:{[roster[1].iid]:50000},petNick:{[roster[1].iid]:'BISCUIT'},petBonds:{[roster[1].iid]:4},pettalents:{__iidV:2,[roster[1].iid]:[talent.id]}});
roster=[pet(),pet()];await breedCase('breed-low-training',roster,{petLvlSteps:{[roster[1].iid]:100}});
roster=[pet('base',{shiny:true}),pet()];await breedCase('breed-shiny-keeper-control',roster);
// The first free experiment can remove the room's only incubator entry.
roster=[pet(),pet()];await seed(roster);await animate(await quote(roster));s=await L.laboratory.snapshot();
record('incubator-hidden',{hasExperiment:s.hasExperiment,coins:s.coins,hasEligiblePair:s.hasEligiblePair,bench:bench(s),incubator:ui.labIncubatorHtml(s)});
assert.equal(s.hasExperiment,true);assert.match(ui.labIncubatorHtml(s),/data-lab-buy="2"/);
// Closing Help saves the flag but paint still consumes the old snapshot.
roster=[pet(),pet(),pet()];s=await seed(roster);await L.laboratory.setUi({introRead:true});
record('help-stale-snapshot',{stored:(await D.kvGet('labUi')).introRead,oldSnapshot:s.ui.introRead,paint:bench(s)});
assert.match(bench(s),/id="labHelp" open/);
// Drive the actual Help callback, foreground clock subscription, carousel repaint,
// and purchase sheet handler. DOM endpoints are doubles, not browser evidence.
const helpLine=app.split('\n').find(line=>line.includes("$('#labHelp', body)?.addEventListener"));
let helpToggle;const helpSnapshot=structuredClone(s);
vm.runInNewContext(helpLine,{snapshot:helpSnapshot,body:{},$:()=>({addEventListener:(_,fn)=>{helpToggle=fn;}}),laboratoryEngine:()=>L.laboratory});
helpToggle({target:{open:false}});
record('help-callback',{introRead:helpSnapshot.ui.introRead,html:bench(helpSnapshot)});
const roomStart=app.indexOf('async function openLaboratory()');
const clockSource=app.slice(roomStart,app.indexOf('  async function draw()',roomStart));
let clockDay='2026-09-08',clockZone='UTC',clockReads=0,closeRoom;const timers=new Map();
const room={isConnected:true};
const clockCtx=vm.createContext({document:{activeElement:null,hidden:false,addEventListener:()=>{},removeEventListener:()=>{}},
  window:{addEventListener:()=>{},removeEventListener:()=>{}},sheetStack:[{wrap:room}],
  openSheet:(_,opts)=>{closeRoom=opts.onClose;return room;},$:()=>({}),MutationObserver:class{observe(){}disconnect(){}},
  setInterval:(fn)=>{timers.set(1,fn);return 1;},clearInterval:id=>timers.delete(id),dateKey:()=>clockDay,
  Intl:{DateTimeFormat:()=>({resolvedOptions:()=>({timeZone:clockZone})})},currentTab:()=>'',countRead:()=>clockReads++,
  /* v579: openLaboratory now calls roomHeaderHtml for the room header. This
     context evals a SLICE of that function to grade its CLOCK behaviour, so the
     header helper is out of scope and the whole run died on a ReferenceError.
     Stubbed, not reproduced: header art belongs to tests/room-headers-audit.mjs. */
  roomHeaderHtml:room=>`<div data-room-header="${room}"></div>`});
await vm.runInContext(clockSource+'async function draw(){countRead();} await draw(); } openLaboratory();',clockCtx);
const initialClockReads=clockReads;
clockDay='2026-09-09';for(const tick of timers.values())tick();const midnightReads=clockReads;
clockZone='America/Vancouver';for(const tick of timers.values())tick();const timezoneReads=clockReads;
closeRoom();record('clock-callback',{initialClockReads,midnightReads,timezoneReads,timersAfterClose:timers.size});
roster=[pet('ember'),pet('base',{sp:'C2'})];s=await seed(roster);
const notes=[];const acts={appendChild:n=>notes.push(n)};
const ingredientCtx=vm.createContext({...P,...L,BH_BY_ID,labName:ui.labName,roster,bank:{},cfIid:roster[0].iid,focused:roster[0],
  labStock:s,sel:[],eqIid:null,openIid:null,body:{},centreRail:()=>{},
  $:selector=>selector==='.cf-acts'?acts:null,$$:selector=>selector==='.lab-ingredient'?[...notes]:[],
  document:{createElement:()=>({remove(){notes.splice(notes.indexOf(this),1);}})}});
const repaintStart=app.indexOf('    function repaintFocus()');
const repaintEnd=app.indexOf('\n    // No card-click',repaintStart);
const ingredientStart=app.includes('    function repaintLabIngredients(')?app.indexOf('    function repaintLabIngredients('):app.indexOf('    if (labStock) {\n      const needed');
const ingredientEnd=app.indexOf("    $('#kennelBtn'",ingredientStart);
vm.runInContext(app.slice(repaintStart,repaintEnd)+app.slice(ingredientStart,ingredientEnd),ingredientCtx);
const beforeSwipe=notes.map(n=>n.textContent);
ingredientCtx.cfIid=roster[1].iid;vm.runInContext('repaintFocus()',ingredientCtx);const afterSwipe=notes.map(n=>n.textContent);
ingredientCtx.cfIid=roster[0].iid;vm.runInContext('repaintFocus()',ingredientCtx);
record('ingredient-callback',{beforeSwipe,afterSwipe,backSwipe:notes.map(n=>n.textContent)});
roster=Array.from({length:6},()=>pet());await seed(roster);await animate(await quote(roster.slice(0,2)));s=await L.laboratory.snapshot();
let sheetHtml='',button=null,purchaseStatus={textContent:''};const purchaseSheet={isConnected:true};
const purchaseBody={set innerHTML(h){sheetHtml=h;button=null;purchaseStatus={textContent:''};}};
const purchaseCtx=vm.createContext({snapshot:s,wrap:{isConnected:true},labIncubatorHtml:ui.labIncubatorHtml,
  openSheet:h=>{sheetHtml=h;return purchaseSheet;},$:selector=>{
    if(selector==='.sheet-body')return purchaseBody;
    if(selector==='#labPurchaseStatus')return purchaseStatus;
    if(selector==='[data-lab-buy]'){
      const match=sheetHtml.match(/data-lab-buy="(\d)"/);if(!match)return null;
      return button ||= {dataset:{labBuy:match[1]},addEventListener:(_,fn)=>{button.click=fn;}};
    }
  },laboratoryEngine:()=>L.laboratory,labReadSnapshot:()=>L.laboratory.snapshot(),rollDayIfNeeded:async()=>{},newId:D.newId});
const incubatorStart=app.indexOf('  function incubators() {',roomStart);
vm.runInContext(app.slice(incubatorStart,app.indexOf('  await draw();',incubatorStart))+'incubators();',purchaseCtx);
const purchaseBefore=sheetHtml;await button.click();await button.click();
record('purchase-callback',{before:purchaseBefore,after:sheetHtml,status:purchaseStatus.textContent,capacity:(await L.laboratory.snapshot()).capacity});
// Every morph pair, same IID, cross-species and invalid inputs, all six species.
let checks=0,legal=0;
for(let i=1;i<=6;i++)for(let a=0;a<6;a++)for(let b=a;b<6;b++){
  roster=[pet(P.MORPHS[a],{sp:`C${i}`}),pet(P.MORPHS[b],{sp:`C${i}`})];await seed(roster);
  const expected=!!Rules.labRecipe(roster,roster.map(p=>p.iid));
  const r=await L.laboratory.quote({iids:roster.map(p=>p.iid)});assert.equal(r.ok,expected);checks++;if(r.ok)legal++;
  assert.equal((await L.laboratory.quote({iids:[roster[0].iid,roster[0].iid]})).ok,false);checks++;
  await D.kvSet('petInst',[roster[0],{...roster[1],sp:i===6?'C1':`C${i+1}`}]);
  assert.equal((await L.laboratory.quote({iids:roster.map(p=>p.iid)})).ok,false);checks++;
}
record('recipe-matrix-control',{checks,legal});assert.equal(legal,18);
// Fixed local midnight, then timezone travel. Restore globals on completion.
const RealDate=Date,oldTZ=process.env.TZ;let instant=Date.UTC(2026,8,8,23,59,59);
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};
try {
  process.env.TZ='UTC';roster=Array.from({length:12},()=>pet());s=await seed(roster);
  await animate(await quote(roster.slice(0,2)));s=await L.laboratory.snapshot();const cappedHtml=bench(s);
  const third=await L.laboratory.purchase({slot:3,opId:'third-first',snapshotToken:s.token});assert.equal(third.reason,'prerequisite');
  await D.kvSet('coins',19999);s=await L.laboratory.snapshot();const poor=await L.laboratory.purchase({slot:2,opId:'poor',snapshotToken:s.token});assert.equal(poor.reason,'insufficient-coins');
  record('insufficient-control',{response:poor,html:ui.labIncubatorHtml(s)});
  await D.kvSet('coins',100000);s=await L.laboratory.snapshot();const beforePurchase=ui.labIncubatorHtml(s);
  const buy={slot:2,opId:'buy-two',snapshotToken:s.token};assert.equal((await L.laboratory.purchase(buy)).ok,true);assert.equal((await L.laboratory.purchase(buy)).ok,true);
  const balance=await D.kvGet('coins');assert.equal(balance,80000);s=await L.laboratory.snapshot();
  assert.equal((await L.laboratory.purchase({slot:3,opId:'buy-three',snapshotToken:s.token})).ok,true);
  await animate(await quote(roster.slice(2,4)));await animate(await quote(roster.slice(4,6)));s=await L.laboratory.snapshot();
  record('purchase-cap-control',{third,balance,capacity:s.capacity,used:s.used,remaining:s.remaining,beforePurchase,cappedHtml});
  const stale=s;instant+=2000;s=await L.laboratory.snapshot();assert.equal(s.remaining,3);
  record('midnight',{oldRemaining:stale.remaining,newRemaining:s.remaining,oldHtml:bench(stale),newHtml:bench(s)});
  await animate(await quote(roster.slice(6,8)));s=await L.laboratory.snapshot();assert.equal(s.remaining,2);
  record('two-remaining-control',{remaining:s.remaining});
  instant=Date.UTC(2026,8,10,18);process.env.TZ='America/Los_Angeles';roster=Array.from({length:8},()=>pet());await seed(roster);await animate(await quote(roster.slice(0,2)));
  process.env.TZ='Asia/Tokyo';s=await L.laboratory.snapshot();assert.equal(s.remaining,1);await animate(await quote(roster.slice(2,4)));
  process.env.TZ='America/Los_Angeles';s=await L.laboratory.snapshot();record('timezone-return',{status:s.status,copy:ui.labStateCopy(s),remaining:s.remaining});assert.equal(s.status,'clock-backwards');
} finally {globalThis.Date=RealDate;if(oldTZ===undefined)delete process.env.TZ;else process.env.TZ=oldTZ;}
writeFileSync(process.env.LAB_EVIDENCE_OUT || new URL('evidence.json',import.meta.url),JSON.stringify({
  capturePhase:'post-fix-recapture',
  capturedAt:new Date().toISOString(),
  narrative:{path:'docs/PLAYTEST-LAB.md',phase:'historical-pre-fix-observations',
    warning:'Ranked findings describe the original 2026-09-08 observations, not this capture. See the current disposition table in that report.'},
  scope:'Node real services and extracted renderer/handler probes. No browser, pixels, real touch, native health or device durability proof. Review commits in this exploratory probe may bypass typed input; dedicated audits grade consent.',
  sourceSha256:Object.fromEntries(['js/app.js','js/loot.js','js/pets.js','js/laboratory.js','js/db.js'].map(file=>[file,createHash('sha256').update(readFileSync(new URL('../../'+file,import.meta.url))).digest('hex')])),
  groups:evidence,
},null,2)+'\n');
console.log(`Completed ${evidence.length} evidence groups; ${checks} recipe checks. No app mutations.`);
