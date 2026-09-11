// Run from the checkout root. No server or browser gate is started.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import vm from 'node:vm';
const gate=readFileSync('tests/release-gate.mjs','utf8');
const init=gate.match(/const PURE = (\[[\s\S]*?\]);/)[0];
const additions=[...gate.matchAll(/^PURE\.(?:push|unshift)\([^;]+\);/gm)].map(m=>m[0]);
const pure=Array.from(vm.runInNewContext(init+'\n'+additions.join('\n')+'\nPURE'));
const literal=Array.from(vm.runInNewContext(init+'\nPURE'));
mkdirSync('docs/v573/pure',{recursive:true});
writeFileSync('docs/v573/pure-enumeration.json',JSON.stringify({literalCount:literal.length,additionSites:additions.length,total:pure.length,literal,additions,suites:pure},null,2)+'\n');
console.log(`PURE literal ${literal.length}; push/unshift sites ${additions.length}; total ${pure.length}`);
const rows=new Array(pure.length);
let next=0;
async function worker(){
 for(let i=next++; i<pure.length; i=next++){
  const file=pure[i];
  const r=await new Promise(resolve=>{
   const child=spawn(process.execPath,['tests/'+file]);let output='',error=null;
   child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
   child.on('error',e=>error=e.message);
   child.on('close',(status,signal)=>resolve({status,signal,error,output}));
  });
  writeFileSync('docs/v573/pure/'+file+'.txt',r.output);
  const row={file,exit:r.status,signal:r.signal,error:r.error};rows[i]=row;
  console.log(`${file}: exit ${r.status}${r.signal?' signal '+r.signal:''}`);
  writeFileSync('docs/v573/pure-results.json',JSON.stringify(rows,null,2)+'\n');
 }
}
await Promise.all(Array.from({length:4},worker));
const passed=rows.filter(r=>r.exit===0).length;
console.log(`PURE: ${passed}/${rows.length} passed; ${rows.length-passed} failed or blocked`);
process.exitCode=passed===rows.length?0:1;
