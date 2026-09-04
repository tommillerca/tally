/* The victory screen's gear reward card rendered EMPTY. A card-exists check would
 * pass on the bug, so this reads the canvas PIXELS: a hydrated card has non-blank
 * pixels, an unhydrated one is fully transparent. */
import { boot, sleep, shotDir } from './godmode.js';
const DIR = shotDir('tally-shots');  // machine-local, see godmode shotDir
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
/* 'shell', not 'new': on this Mac Page.captureScreenshot never returns under
   headless 'new', and this suite takes a screenshot. Measured 2026-09-03 on a
   4-cell probe (headless new|shell x captureBeyondViewport default|false):
   'new' hit the 45s protocolTimeout on BOTH cbv settings, 'shell' returned in
   234ms. So the camera was the fault, not the clip. See boot(). */
const { browser, page } = await boot(process.argv[2] || process.env.URL, { headless: process.env.HEADLESS_MODE || 'shell' });
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
  /* THE MANNEQUIN IS ART TOO (2026-09-03). packCardHtml stopped emitting a
     .pc-canvas for anything the crop table can place: a gear reveal now draws
     the piece WORN, as a stack of <img> layers inside .pc-worn. The canvas
     sample went to zero, so the positive control below correctly refused to
     grade an empty set -- and that is the whole reason it exists. Widening it
     to the mannequin keeps the row a real control rather than deleting it:
     both art paths are read as PIXELS, so a card that renders its layers and
     paints nothing is still caught. An <img> has no getImageData, so each
     layer is drawn into a scratch canvas at its own natural size; the page is
     served same-origin, so nothing taints. EVERY layer is asserted, not the
     stack as a whole: if the base mannequin loads and the piece being revealed
     does not, that is the empty reward card this file was written for. */
  const countOpaque = (ctx, w, h) => {
    const d = ctx.getImageData(0, 0, w, h).data;
    let opaque = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) opaque++;
    return opaque;
  };
  const read = cv => ({
    w: cv.width, h: cv.height, art: cv.getAttribute('data-art'),
    opaquePx: countOpaque(cv.getContext('2d'), cv.width, cv.height),
  });
  const readImg = im => {
    const w = im.naturalWidth, h = im.naturalHeight;
    const art = im.getAttribute('src');
    // an image that never decoded has no pixels at all: report 0 and let the
    // painted check below go red, rather than skipping it out of the sample
    if (!w || !h) return { w, h, opaquePx: 0, art };
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(im, 0, 0);
    return { w, h, art, opaquePx: countOpaque(ctx, w, h) };
  };
  const worn = [...over.querySelectorAll('.pc-worn img')];
  return {
    cardCount: over.querySelectorAll('.pack-card').length,
    names: [...over.querySelectorAll('.pc-name')].map(n => n.textContent.trim()),
    canvases: cvs.length,
    wornLayers: worn.length,
    pixels: [...cvs.map(read), ...worn.map(readImg)],
    iconCards: over.querySelectorAll('.pc-icon').length,
  };
});
const dump = await page.evaluate(() => (document.querySelector('.fight-over')?.textContent || '').replace(/\s+/g, ' ').slice(0, 200));
console.log('victory screen says:', dump);
console.log('victory cards:', JSON.stringify(cards));
check('the victory screen rendered', !cards.none);
check('it shows at least one reward card', cards.cardCount > 0, `${cards.cardCount} cards`);
// an empty sample set is a FAILURE: with neither a canvas nor a worn layer to
// read, nothing below has tested the bug (see the note in the evaluate above)
check('at least one card uses readable art, canvas or mannequin (else this proves nothing)',
  cards.pixels.length > 0, `${cards.canvases} canvases, ${cards.wornLayers} worn layers`);
if (cards.pixels.length > 0) {
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
