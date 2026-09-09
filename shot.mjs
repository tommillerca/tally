import { boot, sleep, serveTree } from './tests/godmode.js';
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(srv.url + '/?demo=1&godmode=1', { waitUntil: 'networkidle0' });
await sleep(1500);
await page.evaluate(async () => {
  const dbm = await import('./js/db.js');
  const mk=(sp,i,m='base')=>({iid:`p-${sp}-${m}-${i}`,sp,morph:m,shiny:false,lineage:0});
  await dbm.kvSet('petInst',[mk('C5',1),mk('C5',2),mk('C5',3),mk('C1',1),mk('C1',2,'frost'),mk('C1',3,'ember'),mk('C3',1),mk('C4',1)]);
  await dbm.kvSet('pets',{C5:true,C1:true,C3:true,C4:true});
  await dbm.kvSet('bonedust', 240);
});
await page.goto(srv.url + '/?demo=1&godmode=1', { waitUntil: 'networkidle0' });
await sleep(2200);
await page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (/^(start|got it|continue|skip|play)/i.test(b.textContent.trim())) { b.click(); return; } });
await sleep(1200);
const nav = await page.evaluate(async () => {
  const tabs=[...document.querySelectorAll('.tabbar button, nav button, [role=tab]')];
  for (const t of tabs) { if (/stable/i.test(t.textContent)) { t.click(); return 'tab'; } }
  for (const b of document.querySelectorAll('button,a')) if (/^stable/i.test(b.textContent.trim())) { b.click(); return 'link'; }
  return 'not found';
});
await sleep(1800);
console.log('nav: ' + nav);
const sc = await page.evaluate(() => {
  const s=document.querySelector('.sheet-body')||document.querySelector('.screen');
  return s ? {h:s.scrollHeight,c:s.clientHeight,tag:s.className} : null;
});
console.log('scroller: ' + JSON.stringify(sc));
let i=0,pos=0;
while (sc && pos < sc.h && i < 6) {
  await page.evaluate((y,cls)=>{ (document.querySelector('.sheet-body')||document.querySelector('.screen')).scrollTop=y; }, pos);
  await sleep(500); await page.screenshot({path:`/tmp/st${i}.png`}); pos += sc.c-20; i++;
}
const dupe = await page.evaluate(() => {
  const t = document.body.innerText;
  const names = (t.match(/BASE DRIZZLE/gi)||[]).length;
  const carousels = document.querySelectorAll('.pet-carousel, [class*=carousel], .pet-strip').length;
  const cards = document.querySelectorAll('[class*=petcard], .pet-card').length;
  return { nameOccurrences: names, carousels, cards,
           heading: [...document.querySelectorAll('h2,h3')].map(h=>h.textContent.trim()).slice(0,8) };
});
console.log('dupe: ' + JSON.stringify(dupe));
const dd = await page.evaluate(() => {
  const t=document.body.innerText;
  const count=(re)=>((t.match(re)||[]).length);
  return { NICKNAME:count(/NICKNAME/g), BREED:count(/BREED/g), DESTROY:count(/DESTROY/g),
           Paddock:count(/The Paddock/g), Laboratory:count(/The Laboratory/g), Kennel:count(/The Kennel/g),
           nickBtns: document.querySelectorAll('[data-nick],#petNick,button').length };
});
console.log('dom: ' + JSON.stringify(dd));
console.log('segments: ' + i);
await browser.close(); srv.close();
