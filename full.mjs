import { boot, sleep, serveTree } from './tests/godmode.js';
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(srv.url + '/?demo=1&godmode=1', { waitUntil: 'networkidle0' });
await sleep(1500);
await page.evaluate(async () => {
  const dbm = await import('./js/db.js');
  const mk=(sp,i)=>({iid:`p-${sp}-${i}`,sp,morph:'base',shiny:false,lineage:0});
  await dbm.kvSet('petInst',[mk('C5',1),mk('C5',2),mk('C5',3),mk('C5',4),mk('C1',1),mk('C1',2)]);
  await dbm.kvSet('pets',{C5:true,C1:true});
});
await page.goto(srv.url + '/?demo=1&godmode=1', { waitUntil: 'networkidle0' });
await sleep(2000);
await page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (/^(start|got it|continue|skip|play)/i.test(b.textContent.trim())) { b.click(); return; } });
await sleep(1200);
await page.evaluate(() => document.querySelector('[data-lab-open], .lab-door')?.click());
await sleep(1500);
// capture the WHOLE sheet, not just the fold
const box = await page.evaluate(() => {
  const b = document.querySelector('.sheet-body') || document.querySelector('.sheet');
  if (!b) return null;
  b.style.overflow = 'visible'; b.style.height = 'auto';
  const sh = document.querySelector('.sheet'); if (sh) { sh.style.height='auto'; sh.style.maxHeight='none'; }
  return { h: document.querySelector('.sheet')?.scrollHeight || document.body.scrollHeight };
});
await sleep(600);
await page.setViewport({ width: 393, height: Math.min(4000, (box?.h||2000)+120), deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(900);
await page.screenshot({ path: '/tmp/lab-entry-full.png', fullPage: false });
console.log('entry captured h=' + (box?.h));
// then choose a species and capture that whole state
await page.evaluate(() => document.querySelector('#labSpecies-C5')?.click());
await sleep(1600);
const b2 = await page.evaluate(() => document.querySelector('.sheet')?.scrollHeight || 2000);
await page.setViewport({ width: 393, height: Math.min(4000, b2+120), deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(900);
await page.screenshot({ path: '/tmp/lab-species-full.png', fullPage: false });
console.log('species state captured h=' + b2);
await browser.close(); srv.close();
