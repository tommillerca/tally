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
  const tiles = await page.evaluate(()=>[...document.querySelectorAll('[data-tryon]')].map(b=>b.dataset.tryon));
  console.log('rack tiles:', tiles.join(', '));
  for (const id of tiles) {
    await page.evaluate(i=>document.querySelector(`[data-tryon="${i}"]`)?.click(), id);
    await sleep(900);
    const r = await page.evaluate(() => {
      const st=document.querySelector('.ton-stage');
      const nw=document.querySelector('.ton-fig .ton-new');
      const cs=nw?getComputedStyle(nw):null;
      return { tiny: st?.classList.contains('tiny')||false, aura: st?.classList.contains('aura')||false,
               filter: cs?.filter ?? 'no .ton-new', anim: cs?cs.animationName:'-', iters: cs?cs.animationIterationCount:'-' };
    });
    console.log(`${id.padEnd(8)} tiny=${String(r.tiny).padEnd(5)} aura=${String(r.aura).padEnd(5)} filter=${String(r.filter).slice(0,44).padEnd(44)} anim=${r.anim}/${r.iters}`);
    await page.evaluate(()=>document.querySelector('.sheet .sheet-close')?.click()); await sleep(500);
  }
} catch(e){ console.log('ERROR:', e.message); }
finally { try{await browser?.close();}catch{} try{await srv?.stop?.();}catch{} clearTimeout(W); process.exit(0); }
