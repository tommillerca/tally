/* tests/hollow-scale-audit.mjs — THE HOLLOW RENDERS AT ONE PIXEL SCALE.
 *
 * WHY THIS EXISTS. Tom's verdict on the first full-pixel Hollow was "it looks
 * like a child designed it", and the measured reason was not composition: the
 * scene was drawing 48px sprites at 1x, 2x AND 3x in the same picture, plus a
 * 96px ground tile at 1x and a 232px fence tile at 1x. Two pixel sizes in one
 * frame is the loudest amateur tell there is, because the eye reads it as two
 * different games sharing a screen. Everything is 2x now and this keeps it 2x.
 *
 * WHAT IT ASSERTS, and none of it is a restatement of the code:
 *   SCALE     every <img class="hlw-pix"> renders at exactly 2x its natural size
 *   INTEGER   every sprite's box lands on whole DEVICE pixels, size and origin,
 *             because a half-pixel origin is resampled however pixelated is set
 *   SHARP     no sprite has a transform on itself or on any ancestor up to the
 *             stage, which silently defeats image-rendering: pixelated
 *   TILES     the CSS background tiles are on the same 2x grid as the sprites
 *   CONTROL   the sample is non-empty and covers the scene, so a Hollow that
 *             failed to draw cannot pass by drawing nothing
 *
 * A note on the transform rule: the STAGE itself carries a scale, and that is
 * deliberate and snapped (js/app.js snaps it to 1/(2*dpr) so the whole scene
 * lands on device pixels). The stage is where the walk stops.
 */
import { boot, sleep, serveTree } from './godmode.js';

const EXPECT_SCALE = 2;
const out = [];
let fails = 0;
const ok = m => out.push(`ok   ${m}`);
const bad = m => { fails++; out.push(`FAIL ${m}`); };

const srv = await serveTree(process.cwd());
const base = process.argv[2] || srv.url;
console.log(`URL UNDER TEST: ${base}`);

const { browser, page } = await boot(base);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

await page.evaluate(async () => {
  const db = await import('/js/db.js');
  const { DROP } = await import('/js/loot.js');
  await db.kvSet('changelogSeen', 999999);
  await db.kvSet(`dropSeen.${DROP.id}`, true);
  for (const k of ['spiresIntroSeen', 'raceIntroSeen', 'gardenIntroSeen', 'surveySeen', 'namePrompted']) await db.kvSet(k, true);
  await db.kvSet('renameRequired', null);
});
await sleep(1200);
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1000);
await page.evaluate(async () => {
  const db = await import('/js/db.js');
  const now = Date.now(), H = 3600e3;
  await db.kvSet('hlwSeen', now - 86400e3);
  await db.kvSet('garden', {
    plotsOwned: 4, seeds: { marrow: 3, bog: 2 }, composts: { date: '', used: 0 },
    plots: [
      { ing: 'ectoplasm', plantedAt: now - 13 * H, readyAt: now - H, watered: true },
      { ing: 'bog', plantedAt: now - 2.5 * H, readyAt: now + 0.5 * H, watered: false },
      { ing: 'marrow', plantedAt: now - 0.2 * H, readyAt: now + 2.8 * H, watered: true },
      { ing: 'graveroot', plantedAt: now - 2 * H, readyAt: now - 0.1 * H, watered: true }, null] });
});
await sleep(200);
await page.evaluate(() => window.__openHollow && window.__openHollow());
await sleep(1800);

const probe = await page.evaluate(() => {
  const stage = document.querySelector('#hlwStage');
  if (!stage) return { error: 'no #hlwStage' };
  const dpr = window.devicePixelRatio || 1;
  const sprites = [...stage.querySelectorAll('img.hlw-pix')].map(el => {
    const r = el.getBoundingClientRect();
    /* Walk to the stage looking for a transform. A transform on ANY ancestor
       promotes the layer and the compositor resamples the whole thing. */
    let t = null;
    for (let n = el; n && n !== stage; n = n.parentElement) {
      const v = getComputedStyle(n).transform;
      if (v && v !== 'none') { t = `${n.tagName}.${n.className || ''} ${v}`; break; }
    }
    return {
      src: (el.getAttribute('src') || '').split('/').pop(),
      nw: el.naturalWidth, nh: el.naturalHeight,
      w: r.width, h: r.height, left: r.left, top: r.top,
      dw: r.width * dpr, dh: r.height * dpr, dleft: r.left * dpr, dtop: r.top * dpr,
      rendering: getComputedStyle(el).imageRendering,
      transform: t,
    };
  });
  const bg = n => { const e = document.querySelector(n); return e ? getComputedStyle(e).backgroundSize : null; };
  return { dpr, sprites, ground: bg('.hlw-ground'), path: bg('.hlw-path') };
});

if (probe.error) { bad(`CONTROL ${probe.error}`); }
else {
  const s = probe.sprites;

  /* CONTROL first: an empty or thin sample is a failure, not a pass. The scene
     draws well over thirty sprites in this state; twenty is a floor that a
     half-rendered Hollow cannot clear. */
  if (s.length >= 20) ok(`CONTROL ${s.length} pixel sprites sampled at dpr ${probe.dpr}`);
  else bad(`CONTROL only ${s.length} pixel sprites in the render; the sample is too thin to grade`);

  const decoded = s.filter(x => x.nw > 0);
  if (decoded.length === s.length) ok(`CONTROL all ${s.length} sprites decoded (naturalWidth > 0)`);
  else bad(`CONTROL ${s.length - decoded.length} sprite(s) never decoded, so their scale is unmeasurable: ${s.filter(x => !x.nw).map(x => x.src).join(', ')}`);

  /* Compare with a tolerance. A layout-rounded height comes back as 96.0000152,
     which is 2x for every purpose that matters, and an exact !== turned every
     healthy sprite red on a tree whose only real defect was one 3x shed. */
  const off2x = x => Math.abs(x.w / x.nw - EXPECT_SCALE) > 1e-3 || Math.abs(x.h / x.nh - EXPECT_SCALE) > 1e-3;
  const wrongScale = decoded.filter(off2x);
  if (!wrongScale.length) ok(`SCALE all ${decoded.length} sprites render at exactly ${EXPECT_SCALE}x native`);
  else for (const x of wrongScale) bad(`SCALE ${x.src} renders ${x.w}x${x.h} from ${x.nw}x${x.nh}, which is ${(x.w / x.nw).toFixed(3)}x by width and ${(x.h / x.nh).toFixed(3)}x by height, not ${EXPECT_SCALE}x`);

  const frac = v => Math.abs(v - Math.round(v));
  const offGrid = s.filter(x => frac(x.dw) > 0.02 || frac(x.dh) > 0.02 || frac(x.dleft) > 0.02 || frac(x.dtop) > 0.02);
  if (!offGrid.length) ok(`INTEGER all ${s.length} sprite boxes land on whole device pixels`);
  else for (const x of offGrid) bad(`INTEGER ${x.src} sits at device ${x.dleft.toFixed(3)},${x.dtop.toFixed(3)} size ${x.dw.toFixed(3)}x${x.dh.toFixed(3)}; a fractional edge is resampled whatever image-rendering says`);

  const soft = s.filter(x => x.rendering !== 'pixelated');
  if (!soft.length) ok(`SHARP all ${s.length} sprites compute image-rendering: pixelated`);
  else for (const x of soft) bad(`SHARP ${x.src} computes image-rendering: ${x.rendering}`);

  const promoted = s.filter(x => x.transform);
  if (!promoted.length) ok(`SHARP no sprite has a transform on itself or an ancestor below the stage`);
  else for (const x of promoted) bad(`SHARP ${x.src} is inside a transformed ancestor (${x.transform}); the compositor resamples it bilinearly`);

  /* The tiles are backgrounds, not sprites, so they need their own row. The
     ground tile is 96px native and the path tiles are 48px native. */
  /* 184x128 is 2x the 92x64 grass field cut from Tom's panels. */
  if (probe.ground === '184px 128px') ok(`TILES ground tile at ${probe.ground} is 2x its 92x64 native`);
  else bad(`TILES ground tile background-size is ${probe.ground}, not 184px 128px; it is off the scene's 2x grid`);

  /* One layer now, not two. The cobble tile was the noisiest thing on the screen:
     60% transparent scattered stones, sliced by a 48px track out of a 96px tile,
     so it repeated as structureless speckle down the middle of the scene. */
  if (probe.path === '96px 96px') ok(`TILES path tile at ${probe.path} is 2x its 48px native`);
  else bad(`TILES path background-size is ${probe.path}, not 96px 96px`);
}

await browser.close();
srv.close();

console.log(out.join('\n'));
console.log(fails ? `\nFAIL (${fails})` : `\nall green, ${out.length} checks`);
process.exit(fails ? 1 : 0);
