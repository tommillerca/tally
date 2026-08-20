const W=setTimeout(()=>process.exit(3),150_000); W.unref?.();
import { boot, sleep, serveTree } from './tests/godmode.js';
import path from 'node:path';
let browser, srv;
try {
  srv = await serveTree(path.resolve('.'));
  const b = await boot(srv.url); browser=b.browser; const page=b.page; await sleep(1200);
  const SIZES = [[440,956,'iPhone 17 Pro Max'],[430,932,'15/16 Pro Max'],[402,874,'17 Pro'],
                 [393,852,'15/16'],[390,844,'13/14'],[375,667,'SE 2/3'],[320,568,'SE 1']];
  console.log('size        device                 arena box (css px)      ratio    content box (inside 2px border)');
  for (const [w,h,name] of SIZES) {
    await page.setViewport({ width:w, height:h, deviceScaleFactor:3, isMobile:true, hasTouch:true });
    // emulate the insets a real iPhone has; without them the arena reads too tall
    await page.evaluate(() => {
      const r = document.documentElement;
      r.style.setProperty('--sat','59px'); r.style.setProperty('--sab','34px');
    });
    await page.evaluate(async () => { await window.__denFight(1.6, 0); });
    await sleep(1700);
    const m = await page.evaluate(() => {
      const a = document.querySelector('.fight-body > .arena');
      if (!a) return null;
      const r = a.getBoundingClientRect();
      const cs = getComputedStyle(a);
      const bw = parseFloat(cs.borderTopWidth) || 0;
      const crowd = document.querySelector('.pit-crowd');
      const fl = document.querySelector('.arena-floor');
      const figs = [...document.querySelectorAll('.arena .fstage')].map(f => {
        const q = f.getBoundingClientRect();
        return { w: Math.round(q.width), h: Math.round(q.height),
                 x: Math.round(q.x - r.x), y: Math.round(q.y - r.y) };
      });
      return {
        w: +r.width.toFixed(1), h: +r.height.toFixed(1), border: bw,
        radius: cs.borderTopLeftRadius,
        cw: +(r.width - bw*2).toFixed(1), ch: +(r.height - bw*2).toFixed(1),
        crowdPct: crowd ? getComputedStyle(crowd).height : null,
        floorFromBottom: fl ? Math.round(r.bottom - fl.getBoundingClientRect().top) : null,
        figs,
      };
    });
    if (!m) { console.log(w + 'x' + h + '  no arena'); continue; }
    const tag = (w + 'x' + h).padEnd(11);
    console.log(tag + ' ' + name.padEnd(22) + ' ' + m.w + ' x ' + m.h + '   ratio ' + (m.w/m.h).toFixed(3) + '   content ' + m.cw + ' x ' + m.ch);
    console.log('            radius ' + m.radius + ', border ' + m.border + 'px, crowd band ' + m.crowdPct + ', floor line ' + m.floorFromBottom + 'px up from the bottom');
    console.log('            fighters: ' + m.figs.map(f => f.w + 'x' + f.h + ' at ' + f.x + ',' + f.y).join('   '));
  }
} catch(e){ console.log('ERROR:', e.message); }
finally { try{await browser?.close();}catch{} try{await srv?.stop?.();}catch{} clearTimeout(W); process.exit(0); }
