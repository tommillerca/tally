import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
const gate=readFileSync('tests/release-gate.mjs','utf8');
const init=gate.match(/const PURE = (\[[\s\S]*?\]);/)[0];
const additions=[...gate.matchAll(/^PURE\.(?:push|unshift)\([^;]+\);/gm)].map(m=>m[0]);
const literal=Array.from(vm.runInNewContext(init+'\nPURE'));
const pure=Array.from(vm.runInNewContext(init+'\n'+additions.join('\n')+'\nPURE'));
mkdirSync('docs/v572/pure',{recursive:true});
const run=(file,out)=>{const r=spawnSync('node',[file],{encoding:'utf8',maxBuffer:32*1024*1024});writeFileSync(out,(r.stdout||'')+(r.stderr||''));return {file,exit:r.status,signal:r.signal,error:r.error?.message};};
const unit=process.argv.includes('--pure-only') ? JSON.parse(readFileSync('docs/v572/proof-summary.json','utf8')).unit : run('tests/unit.test.js','docs/v572/unit.test.txt');
console.log('AGREED',JSON.stringify(unit));
const results=[];
for(const file of pure){const r=run('tests/'+file,'docs/v572/pure/'+file+'.txt');results.push(r);console.log(JSON.stringify(r));}
const report={literalCount:literal.length,additionSites:additions.length,literal,additions,pureCount:pure.length,unit,passed:results.filter(r=>r.exit===0).length,failed:results.filter(r=>r.exit!==0).length,results};
writeFileSync('docs/v572/proof-summary.json',JSON.stringify(report,null,2)+'\n');
console.log('TOTAL',JSON.stringify({literal:report.literalCount,additionSites:report.additionSites,pure:report.pureCount,passed:report.passed,failed:report.failed}));
