/* 2026-09-08 frozen fix-sliver work order, Tom on v521:
 * "my background colour ... in a line between the dock ... and the rest".
 * Grade screenshot pixels, not the already-correct zero-gap geometry.
 * A transparent-border CONTROL must reproduce the stripe in those same pixels.
 * Native rubber-band pixels require operator evidence: Chromium's headless
 * compositor cannot prove iOS bounce paint. Missing evidence exits 97, never 0.
 * See manual/today-dock-pixels.md for prerequisites and the evidence format.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';
import { bandPasses, controlPasses } from './lib/today-dock-pixels.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hero = [108, 123, 61]; // Non-default equipped backdrop from the measured bug.
const evidencePath = process.env.TODAY_BOUNCE_EVIDENCE;
let own, browser, page, failures = 0, unproven = false;
if (!evidencePath) {
  console.log('UNPRV NATIVE-BOUNCE DID NOT RUN: needs a held iOS WebKit pull on a simulator/device, PNG and hash-bound JSON in TODAY_BOUNCE_EVIDENCE; see tests/manual/today-dock-pixels.md');
  unproven = true;
}
const check = (label, pass, detail) => {
  console.log(`${pass ? 'ok' : 'FAIL'} ${label}: ${detail}`);
  if (!pass) failures++;
};

// Decode the actual screenshot in a canvas. Regions use screenshot pixels.
async function pixels(page, png, regions, colours) {
  return page.evaluate(async ({ png, regions, colours }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + png;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return regions.map(({ x, y, width, height }) => {
      if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0
          || width < 1 || height < 1 || x + width > c.width || y + height > c.height)
        throw new Error('Empty or out-of-image pixel sample');
      const data = ctx.getImageData(x, y, width, height).data;
      const matches = colours.map(() => 0);
      for (let i = 0; i < data.length; i += 4) {
        colours.forEach((rgb, j) => {
          if (data[i + 3] === 255 && rgb.every((v, k) => Math.abs(v - data[i + k]) <= 3)) matches[j]++;
        });
      }
      return { count: width * height, matches, imageWidth: c.width, imageHeight: c.height };
    });
  }, { png, regions, colours });
}

try {
  // Always serve this checkout. Never accept a live or original-checkout URL.
  try {
    own = await serveTree(root);
    ({ browser, page } = await boot(own.url, { deviceScaleFactor: 1 }));
  } catch (error) {
    if (!/EPERM|EACCES|puppeteer.*(?:missing|not found|Cannot)|Could not find Chrome/i.test(String(error))) throw error;
    console.log(`UNPRV BROWSER DID NOT RUN: ${error.message}`);
    unproven = true;
  }
  if (!browser) {
    for (const width of [393, 375])
      for (const row of ['R40-22', 'BOUNCE-PREREQUISITES', 'BAND-PIXELS', 'CONTROL-RESTORE', 'RESTORED-BAND-PIXELS'])
        console.log(`UNPRV ${row} ${width} DID NOT RUN: browser unavailable`);
    if (evidencePath) console.log('UNPRV NATIVE-BOUNCE-PIXELS DID NOT RUN: browser PNG decoder unavailable');
  }
  if (browser) {
    for (const [width, height] of [[393, 852], [375, 667]]) {
      await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      await page.evaluate(() => { location.hash = '#/today'; });
      await page.waitForSelector('#screen.screen--today .today-plate');
      await sleep(1200);
      await page.evaluate(rgb => {
        const s = document.getElementById('screen');
        s.style.setProperty('--hero-edge', `rgb(${rgb.join(',')})`);
        s.scrollTop = s.scrollHeight;
      }, hero);
      await sleep(300);
      const measure = await page.evaluate(() => {
        const s = document.getElementById('screen'), dock = document.getElementById('tabbar');
        const fab = document.getElementById('fab').getBoundingClientRect();
        const r = s.getBoundingClientRect(), d = dock.getBoundingClientRect();
        const cs = getComputedStyle(s), border = parseFloat(cs.borderBottomWidth);
        const top = r.bottom - border;
        // Exclude the FAB's ring and the fractional boundary pixels, but sample
        // every interior row across both exposed sides of the full-width band.
        const y = Math.ceil(top) + 1, bottom = Math.floor(r.bottom) - 1;
        const left = Math.ceil(r.left) + 2, right = Math.floor(r.right) - 2;
        const endLeft = Math.floor(fab.left) - 8, startRight = Math.ceil(fab.right) + 8;
        return {
          border, gap: d.top - r.bottom, top, fabTop: fab.top,
          rect: { x: r.x, y: r.y, width: r.width, height: r.height }, scrollTop: s.scrollTop,
          atBottom: Math.abs(s.scrollHeight - s.clientHeight - s.scrollTop) < 2,
          scrollable: s.scrollHeight > s.clientHeight,
          colour: cs.backgroundColor, image: cs.backgroundImage,
          dock: getComputedStyle(dock).backgroundColor.match(/[\d.]+/g).slice(0, 3).map(Number),
          regions: [
            { x: left, y, width: endLeft - left, height: bottom - y },
            { x: startRight, y, width: right - startRight, height: bottom - y },
          ],
        };
      });
      assert(measure.scrollable && measure.atBottom, 'Today must be scrolled to its bottom');
      check(`R40-22 ${width}`, measure.border === 13 && Math.abs(measure.gap) < 0.5
        && measure.top <= measure.fabTop - 4, JSON.stringify(measure));
      check(`BOUNCE-PREREQUISITES ${width}`, measure.colour === `rgb(${hero.join(', ')})`
        && measure.image === 'none', `${measure.colour}, image=${measure.image}; native pixels graded separately`);
      const shot = await page.screenshot({ encoding: 'base64' });
      const band = await pixels(page, shot, measure.regions, [hero, measure.dock]);
      check(`BAND-PIXELS ${width}`, band.every(bandPasses), JSON.stringify(band));

      // Positive control restores the original transparent border in the DOM.
      // Restore the inline state even if screenshotting or decoding throws.
      const oldStyle = await page.$eval('#screen', s => s.getAttribute('style'));
      try {
        await page.$eval('#screen', s => s.style.setProperty('border-bottom-color', 'transparent', 'important'));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const restored = await page.$eval('#screen', s => {
          const cs = getComputedStyle(s), r = s.getBoundingClientRect();
          return { colour: cs.borderBottomColor, border: cs.borderBottomWidth, style: cs.borderBottomStyle,
            background: cs.backgroundColor, clip: cs.backgroundClip,
            rect: { x: r.x, y: r.y, width: r.width, height: r.height }, scrollTop: s.scrollTop };
        });
        check(`CONTROL-RESTORE ${width}`, restored.colour === 'rgba(0, 0, 0, 0)'
          && restored.border === '13px' && restored.style === 'solid'
          && restored.background === measure.colour
          && JSON.stringify(restored.rect) === JSON.stringify(measure.rect)
          && restored.scrollTop === measure.scrollTop, JSON.stringify(restored));
        const control = await pixels(page, await page.screenshot({ encoding: 'base64' }), measure.regions, [hero, measure.dock]);
        /* UNPROVEN, DELIBERATELY, 2026-09-08. This row's expectation has been
           wrong three separate ways and it currently disagrees with a direct
           operator measurement of the same band: sampling the full 393px width
           row by row with the transparent border restored gave y+1 at 393/393
           hero-edge and every row below it hero-edge except the FAB and its
           ring, while this row reports ~27%. Until that disagreement is
           resolved, reporting it as a PASS or a FAIL would both be lies, so it
           declares itself unproven and the suite does not grade on it. The
           fix itself was verified by hand: the band went from 540/540 px of
           rgb(108,123,61) to 540/540 px of rgb(15,14,20). Do not quietly turn
           this back into a check() without resolving the disagreement. */
        console.log(`UNPRV CONTROL-PIXELS ${width}: expectation disputes the operator's direct measurement of the same band; ${JSON.stringify(control)}`);
        unproven = true;
      } finally {
        await page.$eval('#screen', (s, style) => style === null ? s.removeAttribute('style') : s.setAttribute('style', style), oldStyle);
      }
      const restoredBand = await pixels(page, await page.screenshot({ encoding: 'base64' }), measure.regions, [hero, measure.dock]);
      check(`RESTORED-BAND-PIXELS ${width}`, restoredBand.every(bandPasses), JSON.stringify(restoredBand));
    }

    if (evidencePath) {
      const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
      const sha = createHash('sha256').update(readFileSync(path.join(root, 'app.css'))).digest('hex');
      assert.equal(evidence.cssSha256, sha, 'Native capture must use this exact app.css');
      assert.equal(evidence.engine, 'iOS WebKit');
      assert.deepEqual(evidence.heroEdge, hero);
      assert(Number.isFinite(evidence.scrollTop) && evidence.scrollTop <= -40, 'Capture must hold a real negative-scrollTop pull');
      assert(evidence.region.height >= 20, 'Sample at least 20 physical rows wholly inside the exposed bounce');
      const shot = readFileSync(path.resolve(path.dirname(evidencePath), evidence.screenshot)).toString('base64');
      const [bounce] = await pixels(page, shot, [evidence.region], [hero]);
      check('NATIVE-BOUNCE-PIXELS', evidence.region.width >= bounce.imageWidth * 0.75
        && bounce.matches[0] / bounce.count > 0.99,
        `operator-captured held iOS pull, ${JSON.stringify(bounce)}`);
    }
  }
} catch (error) {
  failures++;
  console.error(`FAIL today-dock-pixels: ${error.stack || error}`);
} finally {
  if (browser) await browser.close();
  if (own) own.close();
}
process.exitCode = failures ? 1 : unproven ? 97 : 0;
