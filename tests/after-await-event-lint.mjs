// Frozen fix-breed-p0. Node-only parser lint with executable positive controls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scanAfterAwaitEvents} from './lib/after-await-event-scan.mjs';
const controls=[
  ['inline listener',"b.addEventListener('click', async e => { await quote(); e.currentTarget.dataset.armed='1'; });",1],
  ['captured button',"b.addEventListener('click', async e => { const b=e.currentTarget; await quote(); b.dataset.armed='1'; });",0],
  ['target survives',"b.onclick=async e=>{await quote(); e.target.value='';};",0],
  ['named listener',"async function click(event){await quote(); event.currentTarget.remove();} b.addEventListener('click',click);",1],
  ['computed access',"b.onclick=async event=>{await quote();event?.['currentTarget'].remove();};",1],
  ['event alias',"b.onclick=async e=>{const event=e;await quote();event.currentTarget.remove();};",1],
  ['destructuring',"b.onclick=async e=>{await quote();const {currentTarget:button}=e;};",1],
  ['destructuring assignment',"b.onclick=async e=>{await quote();({currentTarget:button}=e);};",1],
  ['conditional suspension',"b.onclick=async e=>{if(ready)await quote(); e.currentTarget.remove();};",1],
  ['await operand is synchronous',"b.onclick=async e=>{await save(e.currentTarget);};",0],
  ['nested await is separate',"b.onclick=async e=>{const later=async()=>{await quote();};e.currentTarget.remove();};",0],
  ['nested read after await',"b.onclick=async e=>{await quote();setTimeout(()=>e.currentTarget.remove());};",1],
  ['template expression',"b.onclick=async e=>{await quote();show(`${e.currentTarget}`);};",1],
  ['comments strings regex',"b.onclick=async e=>{await quote();/*e.currentTarget*/show('e.currentTarget', /e.currentTarget/);};",0],
  ['sibling functions',"async function a(){await quote();} async function b(e){e.currentTarget.remove();}",0],
  ['loop continuation',"b.onclick=async e=>{while(ready){e.currentTarget.remove();await quote();}};",1],
  ['async iteration',"b.onclick=async e=>{for await(const x of stream){e.currentTarget.remove();}};",1],
  ['nested listener has its own event',"async function render(){await quote();b.onclick=async e=>{const button=e.currentTarget;await save(button);};}",0],
  ['branch isolation',"b.onclick=async e=>{if(ready){await quote();}else{e.currentTarget.remove();}};",0],
];
for(const [name,source,count] of controls)assert.equal(scanAfterAwaitEvents(source).hazards.length,count,`CONTROL ${name}`);
console.log(`PASS CONTROL: ${controls.length} parser fixtures`);
const root=resolve(process.argv.slice(2).find(arg=>!arg.startsWith('--'))||fileURLToPath(new URL('..',import.meta.url)));
const source=readFileSync(resolve(root,'js/app.js'),'utf8');
const result=scanAfterAwaitEvents(source);
assert.ok(result.asyncFunctions>100,'CONTROL whole app parsed');
if(process.argv.includes('--inventory'))for(const row of result.reads)console.log(`READ js/app.js:${row.line} (async function ${row.listenerLine}): ${row.code}`);
for(const row of result.hazards)console.log(`FAIL js/app.js:${row.line}: ${row.code} reads currentTarget after await; capture it before suspension`);
console.log(`${result.hazards.length?'FAIL':'PASS'} after-await-event: ${result.hazards.length} hazards, ${result.asyncFunctions} async functions scanned`);
process.exitCode=result.hazards.length?1:0;
