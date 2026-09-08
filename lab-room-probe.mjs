import { boot, sleep, serveTree } from './tests/godmode.js';
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url);
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));

await page.goto(srv.url + '/?demo=1&godmode=1', { waitUntil: 'networkidle0' });
await sleep(1500);

// put real spare pets in the demo save through the app's own db module
const put = await page.evaluate(async () => {
  const dbm = await import('./js/db.js');
  const mk = (sp, i) => ({ iid: `probe-${sp}-${i}`, sp, morph: 'base', shiny: false, lineage: 0 });
  const insts = [mk('C5',1), mk('C5',2), mk('C5',3), mk('C1',1), mk('C1',2)];
  await dbm.kvSet('petInst', insts);
  await dbm.kvSet('pets', { C5: true, C1: true });
  return (await dbm.kvGet('petInst', []))?.length ?? -1;
});
console.log('pets written: ' + put);

await page.goto(srv.url + '/?demo=1&godmode=1', { waitUntil: 'networkidle0' });
await sleep(2000);
await page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (/^(start|got it|continue|skip|play)/i.test(b.textContent.trim())) { b.click(); return; } });
await sleep(1200);

const found = await page.evaluate(async () => {
  // click every tab, then look for the door anywhere on screen
  const tabs = [...document.querySelectorAll('.tabbar button, nav button, [role=tab]')];
  const log = [];
  for (const t of tabs) {
    t.click(); await new Promise(r => setTimeout(r, 650));
    const d = document.querySelectorAll('[data-lab-open], .lab-door').length;
    log.push(`${(t.textContent||'?').trim().slice(0,10)}:${d}`);
    if (d) return { tab: t.textContent.trim(), doors: d, log };
  }
  return { doors: 0, log, tabCount: tabs.length };
});
console.log('hunt: ' + JSON.stringify(found));

let room = null;
if (found.doors) {
  await page.evaluate(() => document.querySelector('[data-lab-open], .lab-door').click());
  await sleep(1500);
  room = await page.evaluate(() => {
    const t = document.body.innerText;
    return { chars: t.replace(/\s+/g,' ').length, lab: /laborator/i.test(t),
             animate: /animate/i.test(t), colours: /ember|frost|toxic|rose|midnight/i.test(t) };
  });
  await page.screenshot({ path: '/tmp/lab-room-v3.png', fullPage: false });
}
console.log('room: ' + JSON.stringify(room));
console.log('errors: ' + (errs.length ? errs.slice(0,3).join(' | ') : 'none'));
await browser.close(); srv.close();
