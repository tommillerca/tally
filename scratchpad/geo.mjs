import { boot, sleep, serveTree, settle } from '/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/ad578513-d00a-4ff9-bdb3-c31e94189b3d/scratchpad/wt-lapsed-18301/tests/godmode.js';
const srv = await serveTree('/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/ad578513-d00a-4ff9-bdb3-c31e94189b3d/scratchpad/wt-lapsed-18301');
const { page, browser } = await boot(srv.url);
await page.setViewport({width:393,height:852,deviceScaleFactor:2,isMobile:true,hasTouch:true});
const day = o => { const d=new Date(); d.setDate(d.getDate()-o); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
await page.evaluate(async (g) => {
  const db = await new Promise((res,rej)=>{const r=indexedDB.open('tally-demo');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
  await new Promise((res,rej)=>{const tx=db.transaction(['log','kv'],'readwrite');
    tx.objectStore('log').clear();
    tx.objectStore('log').put({id:'lapsed-seed-1',date:g,meal:0,name:'Oats',kcal:1800,p:80,c:200,f:60,ts:Date.now()});
    tx.objectStore('kv').put({k:'lastOpenDay',v:g}); tx.objectStore('kv').delete('wheelLastDate');
    tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});
}, day(90));
await page.reload({waitUntil:'networkidle2'});
await sleep(3000);
await page.evaluate(()=>document.querySelector('.dw')?.remove());
await settle(page,400);
const out = await page.evaluate(()=>{
  const sc=document.getElementById('screen');
  const rows=[...sc.children].map(n=>{const r=n.getBoundingClientRect();return {tag:n.tagName,cls:(typeof n.className==='string'?n.className:'')+(n.id?'#'+n.id:''),top:+r.top.toFixed(1),h:+r.height.toFixed(1)};});
  const fold=document.querySelector('.tabbar').getBoundingClientRect().top;
  return {fold:+fold.toFixed(1), rows};
});
console.log(JSON.stringify(out,null,1));
await browser.close(); srv.close(); process.exit(0);
