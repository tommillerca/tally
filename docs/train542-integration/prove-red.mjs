// Replay pre-fix source or explicitly labelled defect mutations in a disposable
// tree. The real checkout and every original checkout remain read-only here.
// Usage: node docs/train542-integration/prove-red.mjs [output-directory]
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=resolve(process.argv[2]||mkdtempSync(join(tmpdir(),'train542-red-output-')));
assert.ok(!output.startsWith(root),'proof streams must stay outside the checkout');
mkdirSync(output,{recursive:true});
const temp=mkdtempSync(join(tmpdir(),'train542-red-tree-'));
const results=[];
const original=new Map();
function replace(file,before,after){
  const path=join(temp,file),source=readFileSync(path,'utf8');
  assert.ok(source.includes(before),`mutation anchor missing: ${file}: ${before}`);
  assert.notEqual(before,after);
  writeFileSync(path,source.replace(before,after));
}
function historical(file,ref){writeFileSync(join(temp,file),execFileSync('git',['show',`${ref}:${file}`],{cwd:root,maxBuffer:16*1024*1024}));}
function run(id,audit,mutate,expected,args=[]){
  for(const [file,source] of original)writeFileSync(join(temp,file),source);
  mutate();
  const p=spawnSync(process.execPath,[`tests/${audit}`, ...args],{cwd:temp,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});
  const stream=(p.stdout||'')+(p.stderr||'');
  writeFileSync(join(output,`${id}.txt`),stream);
  assert.equal(p.signal,null,`${id}: process must finish`);
  assert.equal(p.status,1,`${id}: defective production behavior must exit 1, got ${p.status}\n${stream.slice(-2000)}`);
  assert.match(stream,expected,`${id}: expected defect assertion must be reached`);
  results.push({id,audit,exit:p.status,evidence:expected.source});
  console.log(`PASS RED CONTROL ${id}: ${audit} exited ${p.status}; ${expected.source}`);
}
try {
  for(const name of readdirSync(root)) {
    if(['js','tests','docs'].includes(name))cpSync(join(root,name),join(temp,name),{recursive:true});
    else symlinkSync(join(root,name),join(temp,name));
  }
  for(const file of ['js/app.js','js/loot.js','js/pets.js','tests/release-gate.mjs','docs/CLAIMS.md'])original.set(file,readFileSync(join(temp,file),'utf8'));
  run('room2-pre-integration','lab-room2-audit.mjs',()=>historical('js/app.js','b48f2e2c'),/FAIL finding 15/);
  run('breed-last-colour-no-typed-gate','breed-last-colour-audit.mjs',()=>replace('js/app.js',
    'if (q.lastCell || labInvested({ ...q, level: petLevel(q.bankedSteps), lineage: q.inst.lineage }))',
    'if (false)'),/two taps cannot consume the last colour/);
  run('stable-loss-pre-app-lane','stable-loss-disclosure-audit.mjs',()=>historical('js/app.js','b48f2e2c^'),/missing=banked steps, nickname, bond, talents, talent name, lineage/);
  run('lab-ui-hidden-offer','lab-ui-audit.mjs',()=>replace('js/app.js','return current && !hidden &&','return current &&'),/AssertionError[\s\S]*data-lab-hide/);
  run('lab-ui-hidden-recovery','lab-ui-audit.mjs',()=>replace('js/app.js',"s.status === 'unknown' || (priorDay", "false || (priorDay"),/faulty variant must be rejected|AssertionError[\s\S]*data-lab-open/);
  run('kennel-generic-spare-name','kennel-copy-audit.mjs',()=>replace('js/app.js',
    'spareName = petDestructionName(q);','spareName = BH_BY_ID[q.inst.sp].name;'),/FAIL R44-14 armed breeding button and toast keep the spare identity: armed breed button omitted colour\/level/);
  run('rooms-below-album','stable-rooms-top-audit.mjs',()=>{},/all three room controls must precede the album/,['--prove-red']);
  run('rooms-render-list-count','stable-rooms-top-audit.mjs',()=>replace('js/app.js',
    'const labWaiting = labStock?.waiting;', 'const labWaiting = labStock?.unseen.length;'),/tile carries its live count/);
  run('breed-two-tap-pre-event-fix','breed-two-tap-audit.mjs',()=>historical('js/app.js','0f860173^'),/TypeError: Cannot read properties of null \(reading 'dataset'\)/);
  run('collection-pre-cells-lane','collection-cell-audit.mjs',()=>{
    historical('js/loot.js','b48f2e2c^');historical('js/pets.js','b48f2e2c^');
  },/FAIL visible last-cell warning[\s\S]*collection cell loss/);
  run('guards-missing-gate-call','r6-guards-audit.mjs',()=>replace('tests/release-gate.mjs',
    'requireLabFindingCoverage(onDisk, PURE);',''),/AssertionError[\s\S]*requireLabFindingCoverage/);
  run('guards-missing-proof-row','r6-guards-audit.mjs',()=>{
    const file='docs/CLAIMS.md',s=readFileSync(join(temp,file),'utf8');
    replace(file,s.match(/^\d+\. PROOF:[^\n]+\n/m)[0],'');
  },/AssertionError[\s\S]*14 !== 15/);
  writeFileSync(join(output,'results.json'),JSON.stringify(results,null,2)+'\n');
  console.log(`${results.length}/${results.length} defect controls rejected. Streams: ${output}`);
} finally {rmSync(temp,{recursive:true,force:true});}
