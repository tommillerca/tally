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

  console.log('=== RACK TILE layers ===');
  const tile = await page.evaluate(() => [...document.querySelectorAll('.rk-stage img')].slice(0,6).map(i=>({
    src:(i.getAttribute('src')||''), natural:`${i.naturalWidth}x${i.naturalHeight}`,
    css:`${Math.round(i.getBoundingClientRect().width)}x${Math.round(i.getBoundingClientRect().height)}`,
    rendering:getComputedStyle(i).imageRendering })));
  tile.forEach(t=>console.log(` ${t.src.split('/').slice(-3).join('/').padEnd(26)} natural ${t.natural.padEnd(9)} drawn ${t.css.padEnd(9)} image-rendering: ${t.rendering}`));

  await page.evaluate(()=>document.querySelector('[data-tryon]')?.click()); await sleep(1400);
  console.log('=== TRY-ON stage layers ===');
  const ton = await page.evaluate(() => [...document.querySelectorAll('.ton-fig img')].map(i=>({
    src:(i.getAttribute('src')||''), natural:`${i.naturalWidth}x${i.naturalHeight}`,
    css:`${Math.round(i.getBoundingClientRect().width)}x${Math.round(i.getBoundingClientRect().height)}`,
    rendering:getComputedStyle(i).imageRendering, dpr: devicePixelRatio })));
  ton.forEach(t=>console.log(` ${t.src.split('/').slice(-3).join('/').padEnd(26)} natural ${t.natural.padEnd(9)} drawn ${t.css.padEnd(9)} image-rendering: ${t.rendering}`));
  console.log(' devicePixelRatio', ton[0]?.dpr, '-> physical draw =', (parseInt(ton[0]?.css)||0)*(ton[0]?.dpr||1), 'px');
} catch(e){ console.log('ERROR:', e.message); }
finally { try{await browser?.close();}catch{} try{await srv?.stop?.();}catch{} clearTimeout(W); process.exit(0); }
