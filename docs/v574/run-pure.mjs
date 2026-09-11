import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
const gate=readFileSync('tests/release-gate.mjs','utf8');
const init=gate.match(/const PURE = (\[[\s\S]*?\]);/)[0];
const additions=[...gate.matchAll(/^PURE\.(?:push|unshift)\([^;]+\);/gm)].map(m=>m[0]);
const initial=Array.from(vm.runInNewContext(init+'\nPURE'));
const pure=Array.from(vm.runInNewContext(init+'\n'+additions.join('\n')+'\nPURE'));
writeFileSync('docs/v574/pure-census.json',JSON.stringify({literalCount:initial.length,additionSites:additions,additionalCount:pure.length-initial.length,total:pure.length,files:pure},null,2)+'\n');
mkdirSync('docs/v574/pure',{recursive:true});
const results=[];
for(const file of pure){
 const r=spawnSync(process.execPath,['tests/'+file],{encoding:'utf8',timeout:600000,maxBuffer:32*1024*1024});
 writeFileSync('docs/v574/pure/'+file+'.txt',(r.stdout||'')+(r.stderr||''));
 results.push({file,exitCode:r.status,signal:r.signal,error:r.error?.message});
 console.log(`${file}: exit ${r.status}${r.signal?' signal '+r.signal:''}`);
 writeFileSync('docs/v574/pure-results.json',JSON.stringify(results,null,2)+'\n');
}
const counts={total:results.length,passed:results.filter(r=>r.exitCode===0).length,failed:results.filter(r=>r.exitCode!==0&&r.exitCode!==97).length,unproven:results.filter(r=>r.exitCode===97).length};
console.log(JSON.stringify(counts));
writeFileSync('docs/v574/pure-summary.json',JSON.stringify(counts,null,2)+'\n');
process.exitCode=counts.failed?1:counts.unproven?97:0;
