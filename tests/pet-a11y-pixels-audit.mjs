/* P2 browser proof. NOT executed in the socket-denied implementation sandbox.
 * Run on the pre-P2 throwaway tree and the final tree to obtain before/after
 * composited pixels. Uses screenshot bytes, never CSS colours. No hue threshold
 * is invented: report deuteranopia dE76 and require a redundant shape cue.
 * CONTROL: one base pet per species, then all five morphs per species.
 * Existing kennel-audit.mjs retains the 100% roster-fit and decoded-art guards.
 */
import assert from 'node:assert/strict';
import { boot, seed, sleep, serveTree, setWidth } from './godmode.js';

const supplied = process.argv.slice(2).find(a => /^https?:/.test(a));
const srv = supplied ? null : await serveTree(new URL('../', import.meta.url).pathname);
const { browser, page, errors } = await boot(supplied || srv.url);
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${detail ? ': ' + detail : ''}`);
  if (!pass) fails++;
};
const linear = c => (c /= 255) <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
const luminance = rgb => rgb.map(linear).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
function deuterLab(rgb) {
  // Machado severity 1.0 deuteranopia matrix, applied in linear sRGB.
  const l = rgb.map(linear);
  const d = [[.367322, .860646, -.227968], [.280085, .672501, .047413], [-.011820, .042940, .968881]]
    .map(row => Math.max(0, Math.min(1, row.reduce((s, c, i) => s + c * l[i], 0))));
  const xyz = [[.4124564, .3575761, .1804375], [.2126729, .7151522, .0721750], [.0193339, .1191920, .9503041]]
    .map((row, j) => row.reduce((s, c, i) => s + c * d[i], 0) / [.95047, 1, 1.08883][j]);
  const [x, y, z] = xyz.map(t => t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const delta = (a, b) => Math.hypot(...deuterLab(a).map((v, i) => v - deuterLab(b)[i]));

async function openStable() {
  await page.evaluate(() => { location.hash = '#/boneyard'; }); await sleep(400);
  await page.evaluate(() => { location.hash = '#/today'; }); await sleep(700);
  await page.click('#stableBtn'); await page.waitForSelector('#stableBody'); await sleep(900);
}
async function openKennel() {
  await openStable(); await page.click('#kennelBtn');
  await page.waitForSelector('#kennelBody .k-cell'); await sleep(900);
}
async function grant(morphs) {
  await page.evaluate(async ms => {
    assertDemo();
    function assertDemo() { if (!new URLSearchParams(location.search).has('demo')) throw Error('demo only'); }
    const { addPetInstance } = await import('/js/loot.js');
    for (const sp of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']) for (const morph of ms) {
      if (!await addPetInstance(sp, { morph })) throw Error(`grant refused ${sp}/${morph}`);
    }
  }, morphs);
}
async function pixels(selector) {
  const el = await page.$(selector);
  if (!el) return [];
  await el.scrollIntoView(); await sleep(150);
  const shot = 'data:image/png;base64,' + await page.screenshot({ encoding: 'base64' });
  return page.evaluate(async (png, sel) => {
    const img = await createImageBitmap(await (await fetch(png)).blob());
    const canvas = new OffscreenCanvas(img.width, img.height), ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const dpr = img.width / innerWidth;
    const at = (x, y) => Array.from(ctx.getImageData(Math.floor(x * dpr), Math.floor(y * dpr), 1, 1).data).slice(0, 3);
    const list = [...document.querySelectorAll(sel)];
    return list.map((el, index) => {
      const r = el.getBoundingClientRect();
      if (r.left < 2 || r.top < 2 || r.right + 3 >= innerWidth || r.bottom + 2 >= innerHeight) return null;
      const samples = [];
      for (let y = -1; y < r.height + 1; y += 1 / dpr) for (let x = -1; x < r.width + 1; x += 1 / dpr) samples.push(at(r.left + x, r.top + y));
      return { morph: el.dataset.morph || ['base', 'ember', 'frost', 'toxic', 'midnight'][index % 5], on: el.classList.contains('on'), dpr,
        center: at(r.left + r.width / 2, r.top + r.height / 2),
        ground: at(r.right + 3, r.top + r.height / 2), samples };
    });
  }, shot, selector);
}
async function textScale(surface, selector) {
  const el = await page.$(selector);
  assert(el, `missing text sample ${selector}`);
  await el.scrollIntoView(); await sleep(200);
  const small = await el.screenshot();
  const before = await el.evaluate(e => ({ size: parseFloat(getComputedStyle(e).fontSize), h: e.getBoundingClientRect().height }));
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await sleep(700);
  await el.scrollIntoView();
  const big = await el.screenshot();
  const after = await el.evaluate(e => ({ size: parseFloat(getComputedStyle(e).fontSize), h: e.getBoundingClientRect().height,
    fits: e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1 }));
  ok(`TEXT ${surface} responds at 200% with visible, unclipped text`, !small.equals(big) && after.size / before.size >= 1.99 && after.fits,
    `${before.size} -> ${after.size}px; rendered height ${before.h} -> ${after.h}px; screenshot equal=${small.equals(big)}`);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; }); await sleep(700);
}
try {
  ok('CONTROL colour metric distinguishes colours and preserves identical inputs', delta([240, 118, 58], [143, 210, 60]) > 1 && delta([240, 118, 58], [240, 118, 58]) === 0);
  await seed(page, { level: 20, coins: 9000 });
  await setWidth(page, 393, 852);
  await grant(['base']); await openKennel();
  const basePortrait = (await pixels('.k-row:first-child .k-thumb'))[0];
  assert(basePortrait, 'CONTROL base roster portrait is on screen');
  const meanLuma = d => d.samples.reduce((sum, p) => sum + .2126 * p[0] + .7152 * p[1] + .0722 * p[2], 0) / d.samples.length;
  const counts = await page.evaluate(() => ({ cells: document.querySelectorAll('.k-cell').length, missing: document.querySelectorAll('.k-dot:not(.on)').length }));
  ok('CONTROL partial collection has 30 cells and 24 missing dots', counts.cells === 30 && counts.missing === 24, JSON.stringify(counts));
  for (let row = 1; row <= 6; row++) {
    const dots = await pixels(`.k-row:nth-child(${row}) .k-dot`);
    const measured = dots.filter(Boolean).filter(d => !d.on).map(d => ({ morph: d.morph,
      contrast: Math.max(...d.samples.map(p => contrast(p, d.ground))),
      area: d.samples.filter(p => contrast(p, d.ground) >= 3).length / d.dpr ** 2 }));
    ok(`DOT PIXELS row ${row}: all four missing slots have a visible edge`, measured.length === 4 && measured.every(d => d.area >= 8), JSON.stringify(measured));
  }
  const swatches = await pixels('.k-grid-head-cell .k-swatch');
  ok('SWATCH PIXELS five colours visible before ownership', swatches.length === 5 && swatches.every(d => d && d.samples.filter(p => contrast(p, d.ground) >= 3).length / d.dpr ** 2 >= 8));
  const labels = await page.$$eval('.k-cell', cells => cells.map(c => c.getAttribute('aria-label')));
  ok('NAMES all 30 cells have distinct accessible names', labels.length === 30 && new Set(labels).size === 30);
  const target = '.k-cell.locked';
  const cell = await page.$(target); assert(cell, 'CONTROL missing a locked keyboard target');
  const sp = await cell.evaluate(e => e.dataset.sp);
  const before = await page.$eval(`.k-grid-label[data-sp="${sp}"]`, e => e.textContent);
  await cell.focus(); await page.keyboard.press('Enter');
  const selected = await page.$eval(`.k-grid-label[data-sp="${sp}"]`, e => e.textContent);
  await page.keyboard.press('Space');
  const restored = await page.$eval(`.k-grid-label[data-sp="${sp}"]`, e => e.textContent);
  ok('KEYBOARD locked selection retains species and toggles back', selected.includes(before) && selected.includes('Not hatched yet.') && restored === before, `${before} -> ${selected} -> ${restored}`);
  await textScale('Kennel', '.k-lead');
  await openStable(); await textScale('Stable', '.cf-cap b');
  await page.click('#stableToPaddock'); await page.waitForSelector('.sheet-paddock'); await sleep(1000);
  await page.click('.pdk-pet[data-pdk]');
  await page.waitForSelector('.pdk-card .pdk-flavor'); await sleep(700);
  await textScale('Paddock', '.pdk-card .pdk-flavor');
  await grant(['ember', 'frost', 'toxic', 'midnight']); await openKennel();
  const completedPortrait = (await pixels('.k-row:first-child .k-thumb'))[0];
  assert(completedPortrait, 'CONTROL complete roster portrait is on screen');
  console.log(`MEASURE INTENT Drizzle roster whole-crop mean sRGB luma: ${meanLuma(basePortrait).toFixed(2)} -> ${meanLuma(completedPortrait).toFixed(2)} / 255 (highest-tier choice retained)`);
  const full = await pixels('.k-row:first-child .k-dot');
  const ember = full.find(d => d?.morph === 'ember'), toxic = full.find(d => d?.morph === 'toxic');
  assert(ember && toxic, 'CONTROL missing full-collection hue samples');
  console.log(`MEASURE DEUTERANOPIA full roster Ember/Toxic: ${delta(ember.center, toxic.center).toFixed(2)} dE76 (Machado 1.0, D65); RGB ${ember.center} / ${toxic.center}`);
  // Sampled square corners must carry more visible ink than round corners.
  // Shape itself is also pinned in the Node source guard; the screenshot areas
  // here verify that the redundant cue actually survives compositing.
  const inkArea = d => d.samples.filter(p => contrast(p, d.ground) >= 3).length / d.dpr ** 2;
  ok('SHAPE PIXELS Ember square differs from Toxic circle', inkArea(ember) > inkArea(toxic) + 5,
    `visible areas ${inkArea(ember).toFixed(1)} / ${inkArea(toxic).toFixed(1)} CSS px2`);
  ok('NO page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close(); srv?.close();
}
console.log(`PET A11Y PIXELS: ${fails ? `${fails} failed` : 'all passed'}`);
process.exitCode = fails ? 1 : 0;
