/* F1 CENTRED means content centred within each tile, matching .ing-cell.
 * The full-width two-column grid stays unchanged. Art centres and text range
 * centres must be within 1 CSS pixel of their card centre. Other item cards
 * receive the same check. F2 measures the rail by ascending x and inventories
 * every Take off button in the Wardrobe, including hidden slot controls.
 * No base: serve this checkout. An explicit URL grades that URL unmodified.
 */
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';
import { declareAudit, recordAuditRow, completeAudit } from './audit-lifecycle.mjs';

declareAudit({ expectedRows: 10 });
let failures = 0, browser, server;
const row = (name, pass, data) => {
  recordAuditRow(name, pass ? 'PASS' : 'FAIL');
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(data)}`);
  if (!pass) failures++;
};
try {
  const base = process.argv[2] || process.env.URL || (server = await serveTree(fileURLToPath(new URL('../', import.meta.url)))).url;
  console.log(`BASE ${base}`);
  const session = await boot(base, { headless: process.env.HEADLESS_MODE || 'shell' });
  browser = session.browser;
  const page = session.page;
  await page.setBypassServiceWorker(true);
  await seed(page, { level: 20, reload: false });
  await page.evaluate(async () => {
    const loot = await import('./js/loot.js');
    await loot.grantCosmetic('H10-1', 'f1-f2-audit');
    await loot.equip('H', 'H10-1');
  });
  await page.reload({ waitUntil: 'networkidle2' });
  for (const [width, height] of [[375, 812], [430, 932]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.evaluate(() => { location.hash = '#/today'; }); await sleep(500);
    await page.evaluate(() => { location.hash = '#/bonehead'; });
    await page.waitForSelector('[data-tab="crates"]', { visible: true });
    await page.click('[data-tab="crates"]');
    await page.waitForSelector('.bp-crate-details', { visible: true });
    await page.evaluate(() => document.fonts.ready);
    const cards = await page.evaluate(() => [...document.querySelectorAll('#chContent .bp-card')].map(card => {
      const centre = el => { const r = el.getBoundingClientRect(); return r.x + r.width / 2; };
      const textCentre = el => {
        const range = document.createRange(); range.selectNodeContents(el);
        const r = range.getBoundingClientRect(); return r.x + r.width / 2;
      };
      const art = card.querySelector('.bp-card-top > :first-child');
      const image = art?.querySelector('img') || art;
      const title = card.querySelector(':scope > b');
      const summary = card.querySelector('summary');
      const r = card.getBoundingClientRect();
      return { crate: !!card.querySelector('.bp-crate-details'), width: r.width,
        card: centre(card), art: image ? centre(image) : null,
        title: title ? textCentre(title) : null, summary: summary ? textCentre(summary) : null };
    }));
    const crates = cards.filter(c => c.crate), items = cards.filter(c => !c.crate);
    const centred = list => list.length > 0 && list.every(c => c.width > 0 && [c.art, c.title, c.summary].every(x => x !== null && Math.abs(x - c.card) <= 1));
    row(`CONTROL Backpack ${width}x${height}`, crates.length > 0 && items.length > 0, { crates: crates.length, items: items.length });
    row(`CENTRED ${width}x${height}`, centred(crates) && centred(items), { tolerance: 1, cards });
    await page.click('[data-tab="wardrobe"]');
    await page.waitForSelector('.ward-toolbar', { visible: true });
    await page.evaluate(() => document.fonts.ready);
    const ward = await page.evaluate(() => {
      const visible = el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
      const describe = el => { const r = el.getBoundingClientRect(); return { text: el.textContent.trim(), x: r.x, y: r.y, width: r.width, visible: visible(el), class: el.className, slot: el.dataset.equip }; };
      return {
        rail: [...document.querySelectorAll('.ward-toolbar > button')].filter(visible).map(describe).sort((a, b) => a.x - b.x),
        takeOff: [...document.querySelectorAll('#chContent button, #chContent [role="button"]')].filter(el => el.textContent.trim() === 'Take off').map(describe)
      };
    });
    row(`CONTROL Wardrobe ${width}x${height}`, ward.rail.length === 4, { rail: ward.rail.length });
    row(`ORDER ${width}x${height}`, JSON.stringify(ward.rail.map(c => c.text)) === JSON.stringify(['Saved fits', 'Save fit', 'Take off', 'The Studio']), ward.rail);
    row(`ONE-TAKE-OFF ${width}x${height}`, ward.takeOff.filter(c => c.visible).length === 1, ward.takeOff);
  }
} catch (error) {
  failures++;
  console.error(`FAIL SETUP: ${error.stack}`);
} finally {
  await browser?.close();
  server?.close();
}
completeAudit();
process.exitCode = failures ? 1 : 0;
