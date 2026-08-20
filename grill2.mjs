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
  await page.evaluate(()=>document.querySelector('[data-tryon]:not([data-tryon="AURA"])')?.click()); await sleep(1800);
  const r = await page.evaluate(() => {
    const lum = c => { const [r,g,b]=c.match(/\d+/g).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;}); return 0.2126*r+0.7152*g+0.0722*b; };
    const ratio = (a,b) => { const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p); return +((x+0.05)/(y+0.05)).toFixed(2); };
    const bgOf = e => { let n=e; while(n){ const c=getComputedStyle(n).backgroundColor; if(c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; n=n.parentElement; } return 'rgb(0,0,0)'; };
    const sheet=document.querySelector('.sheet');
    const short=[...sheet.querySelectorAll('*')].find(e=>e.children.length===0&&/short/i.test(e.textContent||''));
    const badge=[...sheet.querySelectorAll('*')].find(e=>e.children.length===0&&/NOT YOURS/i.test(e.textContent||''));
    const free=[...sheet.querySelectorAll('*')].find(e=>e.children.length===0&&/buys nothing/i.test(e.textContent||''));
    const out={};
    for (const [k,e] of Object.entries({short,badge,free})) {
      if(!e) { out[k]='MISSING'; continue; }
      const cs=getComputedStyle(e);
      out[k]={ size: cs.fontSize, color: cs.color, bg: bgOf(e), contrast: ratio(cs.color, bgOf(e)) };
    }
    // can the sheet be dismissed while the entrance is still running?
    const anims = document.getAnimations().filter(a=>a.playState==='running').length;
    return { ...out, runningAnimations: anims, sheetOverlayPct: Math.round(sheet.getBoundingClientRect().height/innerHeight*100) };
  });
  console.log(JSON.stringify(r,null,1));
} catch(e){ console.log('ERROR:', e.message); }
finally { try{await browser?.close();}catch{} try{await srv?.stop?.();}catch{} clearTimeout(W); process.exit(0); }
