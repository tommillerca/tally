const W=setTimeout(()=>process.exit(3),110_000); W.unref?.();
import { boot, sleep, serveTree } from './tests/godmode.js';
import path from 'node:path';
let browser, srv;
try {
  srv = await serveTree(path.resolve('.'));
  const b = await boot(srv.url); browser=b.browser; const page=b.page; await sleep(1200);
  await page.setViewport({ width:440, height:956, deviceScaleFactor:2, isMobile:true, hasTouch:true });

  const scan = async (label) => {
    const rows = await page.evaluate(() => {
      const out=[];
      for (const i of document.querySelectorAll('img')) {
        const r=i.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        const src=i.getAttribute('src')||'';
        if (!/assets\/bh\//.test(src)) continue;
        const cs=getComputedStyle(i);
        out.push({ src: src.split('assets/bh/')[1], nat:i.naturalWidth,
                   w:Math.round(r.width), h:Math.round(r.height),
                   fit:cs.objectFit, scale:cs.transform,
                   cls:(i.className||'').slice(0,24), parent:(i.parentElement?.className||'').slice(0,24) });
      }
      return out;
    });
    // dedupe by parent class + drawn size
    const seen=new Set(); const uniq=[];
    for (const r of rows) { const k=r.parent+'|'+r.w; if(seen.has(k)) continue; seen.add(k); uniq.push(r); }
    for (const r of uniq.slice(0,7)) {
      const phys = r.w * 2;
      const up = r.nat ? (phys / r.nat) : 0;
      console.log(`  ${label.padEnd(10)} ${r.parent.padEnd(24)} src ${String(r.nat).padEnd(4)} drawn ${String(r.w).padEnd(4)} phys ${String(phys).padEnd(4)} upscale ${up.toFixed(2)}x  fit:${r.fit}`);
    }
  };

  await page.evaluate(()=>{location.hash='#/bonehead';}); await sleep(1200);
  await page.evaluate(()=>document.querySelector('[data-tab="wardrobe"]')?.click()); await sleep(1600);
  await scan('WARDROBE');
  await page.evaluate(()=>document.querySelector('[data-tab="backpack"]')?.click()); await sleep(1600);
  await scan('BACKPACK');
  await page.evaluate(()=>document.querySelector('[data-tab="shop"]')?.click()); await sleep(1500);
  await scan('SHOP');
} catch(e){ console.log('ERROR:', e.message); }
finally { try{await browser?.close();}catch{} try{await srv?.stop?.();}catch{} clearTimeout(W); process.exit(0); }
