/* Hypothesis: .fb-tint multiplies against the WHOLE stack under it (backdrop and
   body), not just its own garment, because the tint spans are siblings of every
   other layer inside .bh-anim. Test: wrap each garment img with its tints in an
   isolated box at runtime and re-measure. */
import { boot, sleep, serveTree, setWidth, seed } from './tests/godmode.js';
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
await setWidth(page, 390, 844);
await seed(page, { dust: 500, coins: 9000, reload: false });
await page.evaluate(async () => {
  const loot = await import(new URL('js/loot.js', location.href).href);
  const fb = await import(new URL('data/football-teams.js', location.href).href);
  const t = fb.FOOTBALL_TEAMS[0];
  for (const g of ['helmet', 'jersey']) await loot.grantCosmetic(fb.footballItemId(t.id, g), 'probe');
  await loot.equip('H', fb.footballItemId(t.id, 'helmet'));
  await loot.equip('T', fb.footballItemId(t.id, 'jersey'));
  location.hash = '#/bonehead';
});
await sleep(2600);
const box = await page.evaluate(() => { const s = document.querySelector('.bh-stage'); const r = s.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; });
const layers = await page.evaluate(() => [...document.querySelectorAll('.bh-anim img')].map(i => i.src.split('/').slice(-2).join('/')));
console.log('LAYERS', JSON.stringify(layers));
await page.screenshot({ path: '/tmp/fb-before.png', clip: { ...box, scale: 2 } });
// apply the candidate fix in-page: each football img + its following tint spans go into an isolated wrapper
const wrapped = await page.evaluate(() => {
  let n = 0;
  for (const img of [...document.querySelectorAll('.bh-anim img')]) {
    if (!/\/football\//.test(img.src)) continue;
    const tints = []; let sib = img.nextElementSibling;
    while (sib && sib.classList.contains('fb-tint')) { tints.push(sib); sib = sib.nextElementSibling; }
    if (!tints.length) continue;
    const wrap = document.createElement('span');
    wrap.style.cssText = 'position:absolute;inset:0;isolation:isolate;pointer-events:none';
    img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img); tints.forEach(t => wrap.appendChild(t));
    n++;
  }
  return n;
});
console.log('WRAPPED', wrapped, 'garment layers isolated');
await sleep(500);
await page.screenshot({ path: '/tmp/fb-after.png', clip: { ...box, scale: 2 } });
await browser.close(); await srv.close?.();
