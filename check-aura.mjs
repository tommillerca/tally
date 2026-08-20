const W=setTimeout(()=>process.exit(3),90_000); W.unref?.();
import { boot, sleep, serveTree } from './tests/godmode.js';
import path from 'node:path';
let browser, srv;
try {
  srv = await serveTree(path.resolve('.'));
  const b = await boot(srv.url); browser=b.browser; const page=b.page; await sleep(1200);
  await page.setViewport({ width:440, height:956, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  await page.evaluate(()=>{location.hash='#/bonehead';}); await sleep(900);
  await page.evaluate(()=>document.querySelector('[data-tab="shop"]')?.click()); await sleep(1500);
  await page.evaluate(()=>document.querySelector('[data-tryon="AURA"]')?.click()); await sleep(2000);
  const r = await page.evaluate(() => {
    const L=[...document.querySelectorAll('.sheet .ton-fig img')].map(i=>({
      src:(i.getAttribute('src')||'').split('/').pop(), cls:i.className, f:getComputedStyle(i).filter }));
    return { lit: L.filter(x=>x.f!=='none'), total: L.length, auraClass: L.find(x=>/wpn-aura/.test(x.cls))?.cls || null };
  });
  console.log('AURA TRY-ON:', JSON.stringify(r, null, 1));
} catch(e){ console.log('ERROR:', e.message); }
finally { try{await browser?.close();}catch{} try{await srv?.stop?.();}catch{} clearTimeout(W); process.exit(0); }
