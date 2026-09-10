import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import vm from 'node:vm';
const root=new URL('../../',import.meta.url),source=readFileSync(new URL('tests/release-gate.mjs',root),'utf8');
const pure=vm.runInNewContext(source.slice(source.indexOf('const PURE = ['),source.indexOf('const BROWSER = ['))+'\nPURE;');
if(pure.length<151||new Set(pure).size!==pure.length)throw Error(`Invalid PURE census: ${pure.length}`);
const out=new URL('./pure/',import.meta.url);mkdirSync(out,{recursive:true});
console.log(`Enumerated ${pure.length} PURE audits from tests/release-gate.mjs`);
writeFileSync(new URL('./pure-list.json',import.meta.url),JSON.stringify(pure,null,2)+'\n');
const results=[];
for(const file of pure){
 const result=await new Promise(resolve=>{
  const child=spawn(process.execPath,[`tests/${file}`],{cwd:root,env:process.env});let output='';
  child.stdout.on('data',s=>output+=s);child.stderr.on('data',s=>output+=s);
  child.on('error',e=>output+=e.message);child.on('close',(code,signal)=>resolve({file,code,signal,output}));
 });
 writeFileSync(new URL(file+'.txt',out),result.output);
 results.push({file:result.file,code:result.code,signal:result.signal});
 console.log(`${result.code===0?'PASS':'FAIL'} ${file} exit=${result.code}`);
 writeFileSync(new URL('./pure-results.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
}
console.log(`${results.filter(r=>r.code===0).length}/${pure.length} PURE audits exit 0`);
process.exitCode=results.some(r=>r.code!==0)?1:0;
