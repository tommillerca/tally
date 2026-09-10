// 2026-09-08 frozen fix-lab-room2 work order, findings 5 to 20.
// Real services and extracted render/callback code. No browser or pixel claim.
// CONTROL: grades reject preserved pre-fix observations, or explicitly
// labelled synthetic negative controls for 6 and 15. Every declared finding
// is graded against production; known app-lane failures stay red.
import assert from 'node:assert/strict';
import {ROOM2_FINDINGS,room2Missing} from './lib/lab-finding-coverage.mjs';
import {ownedPairs} from '../js/pets.js';
import {auditOutputPath} from './lib/audit-output.mjs';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const plain=h=>h.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
function observations(rows) {
  const r=id=>{const row=rows.find(x=>x.id===id);assert.ok(row,id);return row;};
  const excluded=r('excluded-metadata');
  const terminal=r('terminal-input');
  const capped=r('purchase-cap-control').cappedHtml;
  return {
    5:{invested:plain(r('breed-investment').html),low:plain(r('breed-low-training').html)},
    6:{disclosure:plain(r('stable-equipped').disclosure),equipped:r('stable-equipped').equipped,remaining:r('stable-equipped').remaining},
    7:{labCells:r('legacy-shiny-colour').labCells,kennelCells:r('legacy-shiny-colour').kennelCells,branches:r('legacy-shiny-colour').branches},
    8:{rows:excluded.rows.slice(0,2)},
    9:{name:excluded.stableUnknownName,reason:excluded.rows.find(p=>p.morph==='UNKNOWN').reason},
    10:{status:r('completionist').status,safePair:r('completionist').safePair},
    11:{status:r('one-spare').status,hasEligiblePair:r('one-spare').hasEligiblePair},
    12:{button:terminal.first.match(/<section class="lab-pick-row">[\s\S]*?<\/section>/g).find(h=>h.includes('Midnight')).match(/<button[^>]*>/)[0],text:plain(terminal.first)},
    13:{hasExperiment:r('incubator-hidden').hasExperiment,html:r('incubator-hidden').bench.match(/<button[^>]*data-lab-incubators[^>]*>/)?.[0]||'',purchase:plain(r('incubator-hidden').incubator)},
    14:{slots:capped.match(/<button[^>]*data-lab-slot="\d"[^>]*>/g),hint:capped.match(/<p id="labPairHint"[^>]*>(.*?)<\/p>/)[1]},
    15:{disclosure:plain(r('stable-shiny-last-copy').disclosure),cells:[...ownedPairs(r('stable-shiny-last-copy').remaining)],remaining:r('stable-shiny-last-copy').remaining},
    16:{live:r('old-receipt').live,text:plain(r('old-receipt').html)},
    17:{introRead:r('help-callback').introRead,details:r('help-callback').html.match(/<details id="labHelp"[^>]*>/)[0]},
    18:r('clock-callback'),19:r('ingredient-callback'),
    20:{capacity:r('purchase-callback').capacity,text:plain(r('purchase-callback').after),buttons:r('purchase-callback').after.match(/<button[^>]*data-lab-buy="\d"[^>]*>/g)},
  };
}
const grades={
  5:r=>{for(const text of ['50,000 banked training steps','nickname BISCUIT','lineage 2','bond 4/5','talent choices: Jinx','None transfers'])assert.ok(r.invested.includes(text),text);assert.match(r.low,/100 banked training steps/);},
  6:r=>{assert.match(r.disclosure,/It is equipped/);assert.match(r.disclosure,/Base Drizzle.*will take its place/);assert.equal(r.remaining.length,1);assert.equal(r.equipped,r.remaining[0].iid);},
  7:r=>{assert.deepEqual(r.labCells,['C1|base']);assert.deepEqual(r.kennelCells,r.labCells);assert.equal(r.branches.length,2);for(const b of r.branches){assert.deepEqual(b.lost,[]);assert.deepEqual(b.gained,[`C1|${b.morph}`]);assert.equal(b.afterCount,2);assert.equal(b.counts.find(c=>c.cell==='C1|base').after,1);}},
  8:r=>{assert.equal(r.rows.length,2);for(const p of r.rows){assert.equal(p.eligible,false);assert.equal(p.bankedSteps,50000);assert.equal(p.level,7);assert.equal(p.nickname,'BISCUIT');assert.equal(p.bond,4);assert.ok(p.reason);}},
  9:r=>{assert.equal(r.name,'Unsupported colour (UNKNOWN)');assert.match(r.reason,/not supported/);assert.match(r.reason,/backup for recovery/);},
  10:r=>{assert.equal(r.safePair,false);assert.match(r.status,/All 36 colours owned/);assert.match(r.status,/No matching pair preserves/);assert.match(r.status,/risky pair/);assert.doesNotMatch(r.status,/Animate copies/);},
  11:r=>{assert.equal(r.hasEligiblePair,true);assert.match(r.status,/review a risky pair/);assert.match(r.status,/hatch more copies/);assert.doesNotMatch(r.status,/need two spare pets/i);},
  12:r=>{assert.match(r.button,/disabled/);assert.match(r.text,/Midnight completes the recipe path/);},
  13:r=>{assert.equal(r.hasExperiment,true);assert.match(r.html,/data-lab-incubators/);assert.match(r.purchase,/Incubator 2/);},
  14:r=>{assert.equal(r.slots.length,2);assert.ok(r.slots.every(t=>t.includes('disabled')));assert.match(r.hint,/used 1\/1 experiments today/);assert.match(r.hint,/reset at/);},
  15:r=>{assert.deepEqual(r.cells,['C1|base']);assert.equal(r.remaining.length,1);assert.equal(r.remaining[0].shiny,true);assert.match(r.disclosure,/ordinary|non-shiny/i,'last appearance must be distinguished from collection ownership');assert.match(r.disclosure,/collection.*(remain|preserv|still|keep)|(remain|preserv|still|keep).*collection/i,'review must explain that the shiny preserves the collection cell');},
  16:r=>{assert.equal(r.live.level,7);assert.equal(r.live.nickname,'NEWNAME');assert.match(r.text,/At creation: Level 1/);assert.match(r.text,/not later training or naming/);},
  17:r=>{assert.equal(r.introRead,true);assert.doesNotMatch(r.details,/ open/);},
  18:r=>{assert.equal(r.initialClockReads,1);assert.equal(r.midnightReads,2);assert.equal(r.timezoneReads,3);assert.equal(r.timersAfterClose,0);},
  19:r=>{assert.equal(r.beforeSwipe.length,1);assert.match(r.beforeSwipe[0],/Ember/);assert.deepEqual(r.afterSwipe,[]);assert.deepEqual(r.backSwipe,r.beforeSwipe);},
  20:r=>{assert.equal(r.capacity,2);assert.match(r.text,/Capacity: 2 to 3/);assert.match(r.text,/remaining uses: 1 to 2/);assert.equal(r.buttons.length,1);assert.match(r.buttons[0],/data-lab-buy="3"/);},
};
const baseline=JSON.parse(readFileSync(new URL('fixtures/lab-room2-before.json',import.meta.url),'utf8'));
const dir=mkdtempSync(auditOutputPath(join(tmpdir(),'lab-room2-')));
try {
  const file=join(dir,'evidence.json');
  execFileSync(process.execPath,['docs/playtest-lab/run.mjs'],{cwd:root,env:{...process.env,LAB_EVIDENCE_OUT:file},stdio:'pipe',timeout:120000});
  const current=observations(JSON.parse(readFileSync(file,'utf8')).groups);
  let passed=0,failed=0;
  const missing=room2Missing(grades);
  for(const id of ROOM2_FINDINGS) {
    if(missing.includes(id)) {failed++;console.log(`FAIL finding ${id}: missing guard`);continue;}
    const grade=grades[id];
    try {
      assert.ok(Object.hasOwn(baseline,id),`finding ${id}: missing pre-fix observation`);
      assert.throws(()=>grade(baseline[id]),assert.AssertionError,`finding ${id}: pre-fix CONTROL must fail`);
      grade(current[id]);passed++;
      console.log(`PASS CONTROL finding ${id}: ${id===6||id===15?'synthetic negative control':'pre-fix observation'} rejected; production scenario passes`);
    } catch(error) {
      failed++;console.log(`FAIL finding ${id}${id===15?' (known app-lane disclosure defect; expected red)':''}: ${error.message}`);
    }
  }
  console.log(`${passed}/${ROOM2_FINDINGS.length} room 2 guards passed; ${failed} failed; ${missing.length} missing`);
  process.exitCode=failed?1:0;
} finally {rmSync(auditOutputPath(dir),{recursive:true,force:true});}
