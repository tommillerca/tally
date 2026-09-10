// R6 controls exercise the guard failures, without claiming browser rendering.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {CHANGES,NEXT_CHANGES} from '../js/changelog.js';
import {LAB_FINDING_GUARDS,ROOM2_FINDINGS,room2Missing,requireLabFindingCoverage} from './lib/lab-finding-coverage.mjs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const gate=read('tests/release-gate.mjs');
const init=gate.match(/const PURE = (\[[\s\S]*?\]);/)[0];
const additions=[...gate.matchAll(/^PURE\.(?:push|unshift)\([^;]+\);/gm)].map(m=>m[0]);
const pure=Array.from(vm.runInNewContext(init+'\n'+additions.join('\n')+'\nPURE'));
assert.ok(pure.length>=156,`PURE census must not shrink below 156: ${pure.length}`);
assert.equal(new Set(pure).size,pure.length);
assert.equal(LAB_FINDING_GUARDS[1],'lab-health-recovery-audit.mjs');
assert.match(gate,/requireLabFindingCoverage\(onDisk, PURE\)/);
assert.match(read('tests/lab-lock-recovery-audit.mjs'),/import '\.\/lab-health-recovery-audit\.mjs'/);
requireLabFindingCoverage(pure,pure);
for(const mode of ['file','registration']) {
  const missing=pure.filter(f=>f!=='lab-health-recovery-audit.mjs');
  assert.throws(()=>requireLabFindingCoverage(mode==='file'?missing:pure,mode==='registration'?missing:pure),/finding 1/);
}
console.log('PASS CONTROL finding 1: removing the health audit or its PURE registration is rejected; lock-only coverage cannot substitute');
const grades=Object.fromEntries(ROOM2_FINDINGS.map(id=>[id,()=>{}]));
assert.equal(ROOM2_FINDINGS.length,16);assert.deepEqual(room2Missing(grades),[]);
delete grades[6];delete grades[15];
assert.deepEqual(room2Missing(grades),[6,15]);
console.log(`PASS CONTROL room 2: deleted findings 6 and 15 report ${ROOM2_FINDINGS.length-room2Missing(grades).length}/${ROOM2_FINDINGS.length}, not 14/14`);
// Render the shipped dot template, then model its click/class semantics.
// This proves fixture selection only. Layout, swipe and warning remain BROWSER.
const app=read('js/app.js');
const template=app.match(/const cfDots = ([^\n]+);/)[1];
const html=vm.runInNewContext(template,{roster:[{sp:'C1'},{sp:'C4'},{sp:'CX'}],focusIdx:0,BH_BY_ID:{},esc:x=>x});
const buttons=[...html.matchAll(/<button\b[^>]*>/g)].map(m=>m[0]);
assert.equal(buttons.length,3);assert.match(buttons[0],/class="on"/);
const audit=read('tests/breed-sheet-scroll-audit.mjs');
const pick=audit.split('const picked = await page.evaluate(')[1]?.split('\n});')[0]+'\n}';
assert.ok(pick,'SETUP picker extraction');
async function selected(source) {
  let focus=0;const picked=new Set();
  const dots=buttons.map((_,i)=>({classList:{contains:c=>c==='on'&&focus===i},click:()=>{focus=i;}}));
  const children=buttons.map((_,i)=>({classList:{contains:()=>false},click:()=>{focus=i;}}));
  const document={
    querySelector:s=>s==='[data-breedsel]'?{click:()=>{if(picked.has(focus))picked.delete(focus);else picked.add(focus);}}:null,
    querySelectorAll:s=>s==='[data-cfdot]'?dots:s==='.cf-dots i'?children:s==='.cf-card'?buttons:s==='.cf-card.picked'?[...picked]:[],
  };
  return vm.runInNewContext(`(${source})()`,{document,setTimeout:fn=>fn()});
}
assert.equal(await selected(pick),2);
const old=pick.replace("'[data-cfdot]'","'.cf-dots i'").replace(/    if \(on < 0[^\n]+\n/,'');
assert.notEqual(old,pick,'CONTROL mutation applied');
assert.equal(await selected(old),0);
assert.ok(audit.indexOf("if (picked !== 2)")<audit.indexOf("ok('WARNING"));
console.log('PASS CONTROL scroll fixture: old child-dot selector picks 0; current button selector picks 2 in DOM model. Browser product assertion UNPROVEN');
const capture=JSON.parse(read('docs/playtest-lab/evidence.json'));
function labelled(value) {
  assert.equal(value.capturePhase,'post-fix-recapture');
  assert.equal(value.narrative.phase,'historical-pre-fix-observations');
}
labelled(capture);
assert.throws(()=>labelled(capture.groups),assert.AssertionError,'CONTROL old unlabelled array cannot masquerade as historical evidence');
assert.ok(capture.groups.length>=30);
assert.deepEqual(capture.groups.find(r=>r.id==='intent-health-lock').statuses,['ready','ready','ready']);
// Assembly moves pending notes into a numbered release. Grade both locations
// against their actual changelog entries, without requiring an empty vNEXT.
function gradeClaims(document,version,items) {
  const claims=document.split(/^## /m).find(block=>block.startsWith(`${version}\n`)||block.startsWith(`${version} (`));
  assert.ok(claims,`${version} claims must exist`);
  const notes=[...claims.matchAll(/^Changelog item: (.+)$/gm)].map(m=>m[1]);
  assert.deepEqual(notes,items);
  assert.equal([...claims.matchAll(/^\d+\. PROOF:/gm)].length,items.length);
  return claims;
}
const claims=read('docs/CLAIMS.md');
const latest=CHANGES.reduce((a,b)=>a.n>b.n?a:b);
const latestClaims=gradeClaims(claims,`v${latest.n}`,latest.items);
if(NEXT_CHANGES.length)gradeClaims(claims,'vNEXT',NEXT_CHANGES);
const missing=latestClaims.replace(/^\d+\. PROOF:[^\n]+\n/m,'');
assert.notEqual(missing,latestClaims,'CONTROL proof row removed');
assert.throws(()=>gradeClaims('## '+missing,`v${latest.n}`,latest.items),assert.AssertionError);
console.log('PASS CONTROL evidence labels distinguish historical narrative from current capture; shipped and pending changelog items have PROOF rows; a missing row is rejected');
