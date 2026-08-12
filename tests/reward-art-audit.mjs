/* The victory screen's gear reward card rendered EMPTY. A card-exists check would
 * pass on the bug, so this reads the canvas PIXELS: a hydrated card has non-blank
 * pixels, an unhydrated one is fully transparent. */
import { boot, sleep } from './godmode.js';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
/* repo-relative and self-creating: the old absolute path pointed at one dead
   session's scratchpad, so the evidence shot threw on any other machine. */
const DIR = fileURLToPath(new URL('./shots', import.meta.url));
mkdirSync(DIR, { recursive: true });
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
const { browser, page } = await boot(process.argv[2] || process.env.URL);
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
/* THE SEAM IS RE-READ EVERY TIME, AND A MISSING SEAM IS THE FINDING.
   `window.__bhFight.finish('p')` was called twice with no re-read: if the hook
   was gone the second call threw a TypeError, and every pixel assertion below
   (the entire point of this file) died unrun. */
const forceWin = async n => {
  const hit = await page.evaluate(() => { if (!window.__bhFight) return false; window.__bhFight.finish('p'); return true; });
  check(`the fight hook is there to force the win (settle ${n})`, hit, hit ? '' : 'window.__bhFight is gone, so no victory screen was reached');
  return hit;
};
await forceWin(1);
await sleep(3400);
await forceWin(2);
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
/* the evidence shot must not be able to kill the run: a missing victory screen
   is already a named FAIL above, not a reason to throw here. */
if (el) { await el.screenshot({ path: `${DIR}/victory-cards.png` }); console.log('shot victory-cards'); }
else { console.log('note: no .fight-over to shoot'); }
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nVICTORY REWARD ART PAINTS');
process.exit(bad ? 1 : 0);
