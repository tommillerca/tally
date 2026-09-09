/* 2026-09-09 frozen fix-dock-line supersedes the opaque-band acceptance.
 * Capture every tab and test real scroller clipping with a clickable probe row.
 * Pixel continuity is manual: the old fixed-RGB predicate certified the bug.
 * Native rubber-band pixels require operator evidence: Chromium's headless
 * compositor cannot prove iOS bounce paint. Missing evidence exits 97, never 0.
 * See manual/today-dock-pixels.md for prerequisites and the evidence format.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';
import { auditOutputPath } from './lib/audit-output.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hero = [108, 123, 61]; // Non-default equipped backdrop from the measured bug.
const evidencePath = process.env.TODAY_BOUNCE_EVIDENCE;
let own, browser, page, failures = 0, unproven = true;
console.log('UNPRV ALL-TAB-PIXELS: manual pixel continuity review is owed; geometry and hit-tests cannot certify appearance');
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
    console.log('UNPRV ALL-TAB GEOMETRY, ROW-TAP and SCREENSHOTS DID NOT RUN: browser unavailable');
    if (evidencePath) console.log('UNPRV NATIVE-BOUNCE-PIXELS DID NOT RUN: browser PNG decoder unavailable');
  }
  if (browser) {
    const output = auditOutputPath(process.env.DOCK_LINE_EVIDENCE_DIR || path.join(tmpdir(), `tally-dock-line-${process.pid}`));
    mkdirSync(auditOutputPath(output), { recursive: true });
    const tabs = await page.$$eval('#tabbar [data-tab]', els => els.map(el => el.dataset.tab));
    assert.deepEqual(tabs, ['today', 'boneyard', 'friends', 'bonehead'], 'every tab must be covered');
    for (const [width, height] of [[393, 852], [375, 667]]) {
      await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      for (const tab of tabs) {
        await page.evaluate(tab => { location.hash = '#/' + tab; }, tab);
        await page.waitForFunction(tab => document.querySelector('#tabbar .tab.active')?.dataset.tab === tab
          && document.querySelector('#screen.screen-in')?.firstElementChild, {}, tab);
        await sleep(1200);
        // Capture the actual equipped art. Never recolour it for a fixture.
        for (const position of ['top', 'bottom']) {
          await page.$eval('#screen', (s, position) => { s.scrollTop = position === 'top' ? 0 : s.scrollHeight; }, position);
          await sleep(300);
          const measure = await page.evaluate(() => {
            const s = document.getElementById('screen'), d = document.getElementById('tabbar');
            const r = s.getBoundingClientRect(), dock = d.getBoundingClientRect();
            const fab = document.getElementById('fab').getBoundingClientRect();
            const cs = getComputedStyle(s);
            return { border: parseFloat(cs.borderBottomWidth), gap: dock.top - r.bottom,
              ringClearance: fab.top - 4 - r.bottom, background: cs.backgroundColor,
              dockBackground: getComputedStyle(d).backgroundColor, scrollTop: s.scrollTop };
          });
          check(`R40-22 ${tab} ${width} ${position}`, measure.border === 0 && Math.abs(measure.gap) < 0.5
            && measure.ringClearance >= 0, JSON.stringify(measure));
          const capture = auditOutputPath(path.join(output, `${tab}-${width}-${position}.png`));
          await page.screenshot({ path: auditOutputPath(capture) });
          console.log(`CAPTURE ${capture}; RGB/continuity measurements remain manual`);
        }
        // A 44px probe crosses the real scroller's bottom, including the FAB's
        // box below it. Click its visible part and separately hit-test the
        // clipped part. This exercises browser clipping, not arithmetic.
        const saved = await page.$eval('#screen', s => s.scrollTop);
        await page.$eval('#screen', s => {
          const spacer = document.createElement('div');
          spacer.id = 'dock-test-spacer'; spacer.style.cssText = 'height:2000px;flex:none;';
          const row = document.createElement('button');
          row.id = 'dock-test-row'; row.textContent = 'Dock clipping probe';
          row.style.cssText = 'display:block;height:44px;min-height:44px;flex:none;width:100%;margin:0;padding:0;';
          row.dataset.taps = '0';
          row.addEventListener('click', () => { row.dataset.taps = String(Number(row.dataset.taps) + 1); });
          s.append(spacer, row);
          s.scrollTop += row.getBoundingClientRect().top - (s.getBoundingClientRect().bottom - 22);
        });
        try {
          const hit = await page.evaluate(() => {
            const s = document.getElementById('screen').getBoundingClientRect();
            const row = document.getElementById('dock-test-row').getBoundingClientRect();
            const fab = document.getElementById('fab').getBoundingClientRect();
            const x = (fab.left + fab.right) / 2, y = s.bottom - 3;
            return { x, y, crossesFab: row.top < fab.top && row.bottom > fab.top,
              visibleHit: document.elementFromPoint(x, y)?.id,
              clippedHit: document.elementFromPoint(x, fab.top + 1)?.closest('button')?.id };
          });
          check(`ROW-CLIP ${tab} ${width}`, hit.crossesFab && hit.visibleHit === 'dock-test-row'
            && hit.clippedHit === 'fab', JSON.stringify(hit));
          await page.touchscreen.tap(hit.x, hit.y);
          check(`ROW-TAP ${tab} ${width}`, await page.$eval('#dock-test-row', row => row.dataset.taps === '1'),
            'visible row segment must receive exactly one tap');
          const style = await page.$eval('#tabbar', d => d.getAttribute('style'));
          try {
            // CONTROL removes the exclusion entirely. The same bottom-of-
            // scrollport point must now hit the FAB, reproducing R40-22.
            await page.$eval('#tabbar', d => d.style.setProperty('padding-top', '8px', 'important'));
            const control = await page.evaluate(() => {
              const s = document.getElementById('screen').getBoundingClientRect();
              const f = document.getElementById('fab').getBoundingClientRect();
              return document.elementFromPoint((f.left + f.right) / 2, s.bottom - 3)?.closest('button')?.id;
            });
            check(`CONTROL-LOST-EXCLUSION ${tab} ${width}`, control === 'fab', String(control));
          } finally {
            await page.$eval('#tabbar', (d, style) => style === null ? d.removeAttribute('style') : d.setAttribute('style', style), style);
          }
        } finally {
          await page.$eval('#screen', (s, saved) => {
            s.querySelector('#dock-test-row')?.remove(); s.querySelector('#dock-test-spacer')?.remove(); s.scrollTop = saved;
          }, saved);
        }
      }
    }
    await page.evaluate(() => { location.hash = '#/today'; });
    await page.waitForSelector('#screen.screen--today .today-plate');
    const bounce = await page.$eval('#screen', (s, hero) => {
      s.style.setProperty('--hero-edge', `rgb(${hero.join(',')})`);
      const cs = getComputedStyle(s);
      return { colour: cs.backgroundColor, image: cs.backgroundImage };
    }, hero);
    check('BOUNCE-PREREQUISITES', bounce.colour === `rgb(${hero.join(', ')})` && bounce.image === 'none', JSON.stringify(bounce));

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
