import { boot, sleep, serveTree } from './tests/godmode.js';
import fs from 'node:fs';
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
await page.evaluate(() => document.querySelector('#labSpecies-C5')?.click());
await sleep(1800);

const scroller = await page.evaluate(() => {
  const b = document.querySelector('.sheet-body');
  return b ? { h: b.scrollHeight, c: b.clientHeight } : null;
});
console.log('scroller: ' + JSON.stringify(scroller));
const shots = [];
let pos = 0, i = 0;
while (pos < scroller.h && i < 12) {
  await page.evaluate(y => { document.querySelector('.sheet-body').scrollTop = y; }, pos);
  await sleep(500);
  const f = `/tmp/seg${i}.png`;
  await page.screenshot({ path: f });
  shots.push(f); pos += scroller.c - 20; i++;
}
console.log('segments: ' + shots.length);
await browser.close(); srv.close();
