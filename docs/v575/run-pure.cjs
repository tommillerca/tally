const fs = require('node:fs'), vm = require('node:vm'), cp = require('node:child_process');
const gate = fs.readFileSync('tests/release-gate.mjs','utf8');
const init = gate.match(/const PURE = (\[[\s\S]*?\]);/)[0];
const additions = [...gate.matchAll(/^PURE\.(?:push|unshift)\([^;]+\);/gm)].map(m=>m[0]);
const literal = vm.runInNewContext(init+'\nPURE');
const pure = Array.from(vm.runInNewContext(init+'\n'+additions.join('\n')+'\nPURE'));
fs.mkdirSync('docs/v575/pure',{recursive:true});
fs.writeFileSync('docs/v575/pure-census.json',JSON.stringify({literalCount:literal.length,additionSites:additions.length,total:pure.length,literal,additions,pure},null,2)+'\n');
let pass=0,fail=0; const results=[];
for (const file of pure) {
 const result=cp.spawnSync(process.execPath,['tests/'+file],{encoding:'utf8',timeout:600000,maxBuffer:20*1024*1024});
 fs.writeFileSync('docs/v575/pure/'+file+'.txt',(result.stdout||'')+(result.stderr||''));
 results.push({file,exitCode:result.status,signal:result.signal,error:result.error?.message});
 result.status===0 ? pass++ : fail++;
 console.log(`${file}: exit ${result.status}${result.error?' '+result.error.message:''}`);
}
fs.writeFileSync('docs/v575/pure-results.json',JSON.stringify({literalCount:literal.length,additionSites:additions.length,total:pure.length,passed:pass,failed:fail,results},null,2)+'\n');
console.log(`PURE: ${pure.length} total, ${pass} passed, ${fail} failed`);process.exitCode=fail?1:0;
