import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
const gate=readFileSync('tests/release-gate.mjs','utf8');
const init=gate.match(/const PURE = (\[[\s\S]*?\]);/)[0];
const additions=[...gate.matchAll(/^PURE\.(?:push|unshift)\([^;]+\);/gm)].map(m=>m[0]);
const literal=vm.runInNewContext(init+';PURE');
const pure=Array.from(vm.runInNewContext(init+'\n'+additions.join('\n')+'\nPURE'));
const dir='docs/v572/unlock-proof';mkdirSync(dir,{recursive:true});
writeFileSync(dir+'/census.json',JSON.stringify({literalCount:literal.length,additionSites:additions.length,total:pure.length,literal,additions,pure},null,2));
const results=[];
for(const file of pure){const r=spawnSync(process.execPath,['tests/'+file],{encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});writeFileSync(dir+'/'+file+'.txt',(r.stdout||'')+(r.stderr||''));results.push({file,exit:r.status,signal:r.signal,error:r.error?.message});writeFileSync(dir+'/results.json',JSON.stringify(results,null,2));console.log(`${results.length}/${pure.length} ${file} exit=${r.status}`);}
console.log(JSON.stringify({literal:literal.length,additionSites:additions.length,total:pure.length,passed:results.filter(r=>r.exit===0).length,failed:results.filter(r=>r.exit!==0)}));
