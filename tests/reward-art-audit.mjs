/* The victory screen's gear reward card rendered EMPTY. A card-exists check would
 * pass on the bug, so this reads the canvas PIXELS: a hydrated card has non-blank
 * pixels, an unhydrated one is fully transparent. */
import { boot, sleep } from './godmode.js';
const DIR = '/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/a40abded-9d02-469c-8111-2200136500f1/scratchpad/shots';
const { browser, page } = await boot(process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

// a win inside an already-cleared feeding window pays pocket change and NO gear,
// so clear the ledger first or this tests the wrong branch
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.kvSet('glutton-beaten', {});
  await db.kvSet('gluttonRec', {});
});
// The GLUTTON is the fight that awards gear, which is the card Tom saw empty.
await page.evaluate(() => { window.__openGlutton(); });
await sleep(1800);
await page.evaluate(() => document.getElementById('gluttonFight')?.click());
await sleep(3000);
const live = await page.evaluate(() => !!window.__bhFight);
check('a fight is running', live);
// force a WIN through the engine's own settle, or the screen shows the loss branch
// (which awards no gear at all, so the check would test nothing)
await page.evaluate(() => window.__bhFight.finish('p'));
await sleep(3400);
await page.evaluate(() => window.__bhFight.finish('p'));
await sleep(3200);

const cards = await page.evaluate(() => {
  const over = document.querySelector('.fight-over');
  if (!over) return { none: true };
  const cvs = [...over.querySelectorAll('canvas.pc-canvas')];
  const read = cv => {
    const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let opaque = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) opaque++;
    return { w: cv.width, h: cv.height, opaquePx: opaque, art: cv.getAttribute('data-art') };
  };
  return {
    cardCount: over.querySelectorAll('.pack-card').length,
    names: [...over.querySelectorAll('.pc-name')].map(n => n.textContent.trim()),
    canvases: cvs.length,
    pixels: cvs.map(read),
    iconCards: over.querySelectorAll('.pc-icon').length,
  };
});
const dump = await page.evaluate(() => (document.querySelector('.fight-over')?.textContent || '').replace(/\s+/g, ' ').slice(0, 200));
console.log('victory screen says:', dump);
console.log('victory cards:', JSON.stringify(cards));
check('the victory screen rendered', !cards.none);
check('it shows at least one reward card', cards.cardCount > 0, `${cards.cardCount} cards`);
// an empty sample set is a FAILURE: if there is no canvas we have not tested the bug
check('at least one card uses canvas art (else this proves nothing)', cards.canvases > 0, `${cards.canvases} canvases`);
if (cards.canvases > 0) {
  for (const px of cards.pixels) {
    check(`the art is actually PAINTED (${(px.art || '').split('/').pop()})`, px.opaquePx > 200, `${px.opaquePx} opaque px of ${px.w}x${px.h}`);
  }
}
const el = await page.$('.fight-over');
await el.screenshot({ path: `${DIR}/victory-cards.png` });
console.log('shot victory-cards');
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nVICTORY REWARD ART PAINTS');
process.exit(bad ? 1 : 0);
