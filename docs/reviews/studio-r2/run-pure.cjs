const fs = require('fs'), vm = require('vm'), {spawn} = require('child_process');
const source = fs.readFileSync('tests/release-gate.mjs','utf8');
const files = vm.runInNewContext(source.slice(source.indexOf('const PURE = ['), source.indexOf('const BROWSER = [')) + '\nPURE');
const dir = '/private/tmp/studio-r2-pure-logs'; fs.mkdirSync(dir,{recursive:true});
let next=0; const results=[];
async function worker(){ while(next<files.length){ const file=files[next++]; const out=fs.openSync(dir+'/'+file+'.txt','w'); const code=await new Promise(resolve=>{const p=spawn(process.execPath,['tests/'+file],{stdio:['ignore',out,out]});p.on('exit',resolve);p.on('error',()=>resolve(127));});fs.closeSync(out);results.push({file,code}); console.log(`${code === 0 ? 'PASS' : 'FAIL'} ${file} exit ${code}`); }}
Promise.all([worker(),worker()]).then(()=>{fs.writeFileSync('docs/reviews/studio-r2/pure-summary.json',JSON.stringify(results,null,2)+'\n');console.log(`${results.filter(r=>r.code===0).length}/${files.length} PURE green`);process.exitCode=results.some(r=>r.code!==0)?1:0;});
