import { boot, sleep, serveTree } from './tests/godmode.js';
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(srv.url + '/?demo=1&godmode=1', { waitUntil: 'networkidle0' });
await sleep(1500);
await page.evaluate(async () => {
  const dbm = await import('./js/db.js');
  const mk = (sp,i) => ({ iid:`p-${sp}-${i}`, sp, morph:'base', shiny:false, lineage:0 });
  await dbm.kvSet('petInst', [mk('C5',1),mk('C5',2),mk('C5',3),mk('C1',1),mk('C1',2)]);
  await dbm.kvSet('pets', { C5:true, C1:true });
});
await page.goto(srv.url + '/?demo=1&godmode=1', { waitUntil: 'networkidle0' });
await sleep(2000);
await page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (/^(start|got it|continue|skip|play)/i.test(b.textContent.trim())) { b.click(); return; } });
await sleep(1200);
await page.evaluate(() => document.querySelector('[data-lab-open], .lab-door')?.click());
await sleep(1400);

// TITLE CLIPPING: measure the heading's own box against its ink
const title = await page.evaluate(() => {
  const h = [...document.querySelectorAll('h1,h2')].find(x => /laborator/i.test(x.textContent));
  if (!h) return { err: 'no title' };
  const cs = getComputedStyle(h);
  const r = h.getBoundingClientRect();
  return { text: h.textContent.trim(), scrollW: h.scrollWidth, clientW: h.clientWidth,
           overflowX: cs.overflowX, width: +r.width.toFixed(1), right: +r.right.toFixed(1),
           viewport: innerWidth, stroke: cs.webkitTextStroke || cs.paintOrder,
           parentOverflow: getComputedStyle(h.parentElement).overflow,
           clipped: h.scrollWidth > h.clientWidth + 1 };
});
console.log('TITLE: ' + JSON.stringify(title));

// choose Bulldog (we seeded three spares of C5) via the real radio input
const step1 = await page.evaluate(() => {
  const r = document.querySelector('#labSpecies-C5');
  if (!r) return { err: 'no C5 radio', ids: [...document.querySelectorAll('[id^=labSpecies-]')].map(x=>x.id) };
  r.click();
  return { picked: 'C5' };
});
await sleep(1600);
console.log('step1: ' + JSON.stringify(step1));
await page.screenshot({ path: '/tmp/lab-after-species.png' });
const after = await page.evaluate(() => {
  const t = document.body.innerText.replace(/\s+/g,' ');
  return { chars: t.length,
           specimens: document.querySelectorAll('.lab-specimens .lab-specimen, .lab-specimens > *').length,
           slots: document.querySelectorAll('[data-lab-slot]').length,
           picks: document.querySelectorAll('[data-lab-pick]').length,
           review: !!document.querySelector('[data-lab-review]'),
           sixColours: /six colours/i.test(t) };
});
console.log('after: ' + JSON.stringify(after));
// open the pet picker for slot 1 and screenshot that too
await page.evaluate(() => document.querySelector('[data-lab-slot]')?.click());
await sleep(1400);
await page.screenshot({ path: '/tmp/lab-picker.png' });
const picker = await page.evaluate(() => {
  const t = document.body.innerText.replace(/\s+/g,' ');
  return { picks: document.querySelectorAll('[data-lab-pick]').length, head: t.slice(0,180) };
});
console.log('picker: ' + JSON.stringify(picker));
await browser.close(); srv.close();
