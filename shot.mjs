import { boot, sleep, serveTree } from './tests/godmode.js';
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluate(async () => { const db = await import('/js/db.js'); const { DROP } = await import('/js/loot.js');
  await db.kvSet('changelogSeen', 999999); await db.kvSet(`dropSeen.${DROP.id}`, true);
  for (const k of ['spiresIntroSeen','raceIntroSeen','gardenIntroSeen','surveySeen','namePrompted']) await db.kvSet(k, true);
  await db.kvSet('renameRequired', null); });
await sleep(1400);
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1200);
await page.evaluate(async () => { const db = await import('/js/db.js'); const now=Date.now(),H=3600e3;
  await db.kvSet('hlwSeen', now-86400e3);
  await db.kvSet('garden',{plotsOwned:4,seeds:{marrow:3,bog:2},composts:{date:'',used:0},
   plots:[{ing:'ectoplasm',plantedAt:now-13*H,readyAt:now-H,watered:true},{ing:'bog',plantedAt:now-2.5*H,readyAt:now+0.5*H,watered:false},
   {ing:'marrow',plantedAt:now-0.2*H,readyAt:now+2.8*H,watered:true},{ing:'graveroot',plantedAt:now-2*H,readyAt:now-0.1*H,watered:true},null]}); });
await sleep(200);
await page.evaluate(() => window.__openHollow && window.__openHollow());
await sleep(2200);
await page.evaluate(() => { const g=document.querySelector('.hlw-ground'); if (g) g.className='hlw-ground hlw-ground-day'; });
await sleep(300);
const probe = await page.evaluate(() => {
  const st=document.querySelector('#hlwStage'); const s=st.getBoundingClientRect();
  const k=s.width/390;
  const row=e=>{const r=e.getBoundingClientRect();return {src:(e.getAttribute('src')||'').split('/').pop(),
    x:+((r.left-s.left)/k).toFixed(0), y:+((r.top-s.top)/k).toFixed(0), w:+(r.width/k).toFixed(0), h:+(r.height/k).toFixed(0)};};
  return [...st.querySelectorAll('img.hlw-pix')].map(row)
    .filter(r=>/crow|fence|shed|sack|crate|sign|scarecrow/.test(r.src));
});
console.log(JSON.stringify(probe, null, 0));
const el = await page.$('#hlwStage');
if (el) await el.screenshot({ path: process.argv[2] });
await browser.close(); srv.close();
