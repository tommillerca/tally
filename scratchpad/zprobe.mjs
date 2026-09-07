import { boot, sleep, serveTree } from '/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/ad578513-d00a-4ff9-bdb3-c31e94189b3d/scratchpad/wt-lapsed-18301/tests/godmode.js';
const srv = await serveTree('/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/ad578513-d00a-4ff9-bdb3-c31e94189b3d/scratchpad/wt-lapsed-18301');
const { page, browser } = await boot(srv.url);
await page.setViewport({width:393,height:852,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await page.evaluateOnNewDocument(()=>{window.__wheelForce=true;});
await page.reload({waitUntil:'networkidle2'});
await sleep(4000);
const out = await page.evaluate(()=>{
  const chain = n => { const a=[]; while(n && n!==document.documentElement){ const cs=getComputedStyle(n); a.push(n.tagName+(n.id?'#'+n.id:'')+(typeof n.className==='string'&&n.className?'.'+n.className.trim().split(/\s+/)[0]:'')+' z='+cs.zIndex+' pos='+cs.position+' t='+cs.transform+' f='+cs.filter+' iso='+cs.isolation+' op='+cs.opacity); n=n.parentElement;} return a; };
  const t=document.getElementById('toast'); const dw=document.querySelector('.dw');
  return { toast: chain(t), dw: dw?chain(dw):null, toastHidden: t?t.hidden:null };
});
console.log(JSON.stringify(out,null,1));
await browser.close(); srv.close(); process.exit(0);
