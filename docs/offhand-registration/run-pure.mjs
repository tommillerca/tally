// Run the complete registered PURE tier without starting the browser tier.
// Usage from this checkout: node docs/offhand-registration/run-pure.mjs
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
const gate=readFileSync(join(root,'tests/release-gate.mjs'),'utf8');
const init=gate.match(/const PURE = (\[[\s\S]*?\]);/)[0];
const mutations=[...gate.matchAll(/^PURE\.(?:push|unshift)\([^;]+\);/gm)].map(m=>m[0]);
const files=vm.runInNewContext(init+'\n'+mutations.join('\n')+'\nPURE');
const serial=vm.runInNewContext('('+gate.match(/const SERIAL = ({[\s\S]*?\n});/)[1]+')');
const out=mkdtempSync(join(tmpdir(),'offhand-registration-pure-'));
console.log(`Full streams: ${out}`);
const results=[];
const streams=new Map();
async function run(file) {
  await new Promise(resolve=>{
    const p=spawn(process.execPath,['tests/'+file],{cwd:root});let output='';
    const timer=setTimeout(()=>p.kill('SIGTERM'),180000);
    p.stdout.on('data',b=>{output+=b;});p.stderr.on('data',b=>{output+=b;});
    p.on('close',(code,signal)=>{
      clearTimeout(timer);writeFileSync(join(out,file+'.txt'),output);
      results.push({file,code,signal});
      streams.set(file, output);
      console.log(`${code===0?'PASS':'FAIL'} ${file} exit=${code}${signal?' '+signal:''}`);
      if(code!==0)console.log(output.split('\n').filter(l=>/FAIL|Error|Cannot|ENOENT|EPERM|EACCES/.test(l)).join('\n').slice(0,2000));
      resolve();
    });
  });
}
const parallel=files.filter(f=>!Object.hasOwn(serial,f));let index=0;
await Promise.all(Array.from({length:4},async()=>{for(let i=index++;i<parallel.length;i=index++)await run(parallel[i]);}));
for(const file of files.filter(f=>Object.hasOwn(serial,f)))await run(file);
writeFileSync(join(root,'docs/offhand-registration/pure-summary.json'),JSON.stringify(results,null,2)+'\n');
writeFileSync(join(root,'docs/offhand-registration/pure-output.txt'), files.map(f=>`=== ${f} ===\n${streams.get(f)}\nexit=${results.find(r=>r.file===f).code}\n`).join('\n'));
console.log(`${results.filter(r=>r.code===0).length}/${files.length} PURE files exit 0`);
process.exitCode=results.some(r=>r.code!==0)?1:0;
