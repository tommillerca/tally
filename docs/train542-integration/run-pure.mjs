// Enumerate the complete PURE source, including every push and unshift.
// Usage: node docs/train542-integration/run-pure.mjs [output-directory]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import vm from 'node:vm';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {mkdtempSync} from 'node:fs';
import {auditOutputPath} from '../../tests/lib/audit-output.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=auditOutputPath(resolve(process.argv[2]||mkdtempSync(join(tmpdir(),'train542-pure-'))));
mkdirSync(out,{recursive:true});
console.log(`Full streams: ${out}`);
const gate=readFileSync(join(root,'tests/release-gate.mjs'),'utf8');
const files=Array.from(vm.runInNewContext(gate.slice(gate.indexOf('const PURE = ['),gate.indexOf('const BROWSER = ['))+'\nPURE'));
assert.ok(files.length>=156,`Refusing undersized census: ${files.length}/156`);
assert.equal(new Set(files).size,files.length);
writeFileSync(join(out,'enumeration.json'),JSON.stringify(files,null,2)+'\n');
const serial=vm.runInNewContext('('+gate.match(/const SERIAL = ({[\s\S]*?\n});/)[1]+')');
console.log(`Enumerated ${files.length} unique PURE entries from tests/release-gate.mjs`);
const results=[];
async function run(file){await new Promise(resolve=>{
 const p=spawn(process.execPath,['tests/'+file],{cwd:root});let output='';
 const timer=setTimeout(()=>p.kill('SIGTERM'),180000);
 p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);
 p.on('close',(code,signal)=>{clearTimeout(timer);writeFileSync(join(out,file+'.txt'),output);results.push({file,code,signal});console.log(`${code===0?'PASS':'FAIL'} ${file} exit=${code}${signal?' '+signal:''}`);if(code!==0)console.log(output.slice(-1500));resolve();});
});}
const parallel=files.filter(f=>!Object.hasOwn(serial,f));let next=0;
await Promise.all(Array.from({length:4},async()=>{for(let i=next++;i<parallel.length;i=next++)await run(parallel[i]);}));
for(const file of files.filter(f=>Object.hasOwn(serial,f)))await run(file);
results.sort((a,b)=>files.indexOf(a.file)-files.indexOf(b.file));
writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2)+'\n');
console.log(`${results.filter(r=>r.code===0).length}/${files.length} PURE entries exit 0`);
process.exitCode=results.some(r=>r.code!==0)?1:0;
