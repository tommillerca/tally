/* A LOOK TAP NEVER SHOWS AN EMPTY DRESSING ROOM OR AN UNDECODED DOLL.
 *
 * QA round 23 F1, measured per frame on integ/playtest-round-a before the fix:
 *   - a paid commit: `.bh-stage` took ZERO intermediate values across 226 frames
 *     (a hard cut) and #chContent held 0 elements for 2 of them;
 *   - a preview tap: 3 blank frames, and all eight doll layers reported
 *     naturalWidth == 0 while visible for 86ms;
 *   - at collection scale one tap discarded 65.2 MB and took 645ms to settle.
 * Cause: both taps called renderCharacter(wrap, 'wardrobe', { instant: true }),
 * which rebuilds #chBody (a fresh, EMPTY #chContent), awaits eight things, then
 * writes the content. `instant: true` suppressed no transition: opts is read in
 * exactly one place, for scroll. The equip path had the fix (restageWardrobe:
 * decode every layer, then swap only the stage). The fix points the preview and
 * the commit at the same path (restageDoll / restageWardrobe + restageLook in
 * js/app.js) and refreshes the panel in place.
 *
 * WHAT IS MEASURED, and why each row is there:
 *   REBUILD   #chContent is the SAME node before and after the tap. This is the
 *             deterministic row: renderCharacter replaces #chBody's innerHTML, so
 *             on the old path the node identity changes on every tap, whatever
 *             the frame timing does.
 *   CONTENT   sampled every animation frame across the tap: #chContent never has
 *             0 children. This is QA's own measure.
 *   LAYERS    in every sampled frame, every VISIBLE `.bh-stage.lg img` reports
 *             naturalWidth > 0. An undecoded layer paints as nothing.
 *   CONTROL   the tap actually happened: the previewed art is in the stage and the
 *             bar is armed with it (preview); the transmog is written, dust is
 *             down by the price and the slot tile carries its "look changed"
 *             mark (commit). Without these a frozen page passes the three above.
 * Both taps are graded: PREVIEW (free, tries the look on) and COMMIT (the paid
 * two-tap Wear it). The commit is a REAL armToConfirm: two mouse clicks.
 *
 * PROVE-RED: revert the two call sites in js/app.js (restageLook() ->
 * renderCharacter(wrap, 'wardrobe', { instant: true }) in the [data-look] handler
 * and in applyLook). REBUILD goes red on both taps by construction; CONTENT goes
 * red with the 2-3 empty frames QA counted. Not run in the session that wrote it
 * (the machine was under a gate; STATIC ONLY), so the first run is the proof.
 *
 * Usage: node tests/wardrobe-restage-audit.mjs
 */
import { boot, sleep, settle, setWidth, serveTree, seed, exitFor } from './godmode.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

/* Two hats on the demo profile, one worn and one merely collected, so the slot
   the Wardrobe opens on ('H') has exactly one paid look to try. Both common:
   the price is 6 dust, the cheapest commit in the app. */
const WORN = 'H10-1', TRY = 'H10-3', PRICE = 6, SLOT = 'H';

const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
await setWidth(page, 390, 844);
await seed(page, { dust: 500, reload: false });
const granted = await page.evaluate(async ({ WORN, TRY, SLOT }) => {
  if (!navigator.webdriver) return { error: 'not webdriver' };
  const loot = await import(new URL('js/loot.js', location.href).href);
  await loot.grantCosmetic(WORN, 'wardrobe-restage-audit');
  await loot.grantCosmetic(TRY, 'wardrobe-restage-audit');
  await loot.equip(SLOT, WORN);
  /* gate7 2026-09-04, first run: SETUP read transmogPrice = 0 because a look is
     free when the slot carries no STATS (transmogPrice: "no stats in the slot:
     free"). A cosmetic in H is not gear in H. Seed the slot the way
     transmog-clarity-audit does: grant and equip the lowest-level H gear. */
  const { GEAR_ITEMS } = await import(new URL('js/gear.js', location.href).href);
  const { totalXp, levelFor } = await import(new URL('js/game.js', location.href).href);
  const lvl = levelFor(await totalXp()).level;
  const gearH = GEAR_ITEMS.filter(x => x.slot === SLOT && (x.minLevel || 1) <= lvl).sort((a, b) => (a.minLevel || 1) - (b.minLevel || 1))[0];
  if (!gearH) return { error: 'no H gear at level ' + lvl };
  await loot.grantGear(gearH.id, 'wardrobe-restage-audit');
  await loot.equipGear(SLOT, gearH.id);
  return { ok: true, price: await loot.transmogPrice(SLOT, TRY) };
}, { WORN, TRY, SLOT });
if (granted.error) { console.log('FAIL  SETUP ' + granted.error); process.exit(1); }
ok('SETUP the try-on look is priced (a free look would skip the two-tap commit)', granted.price === PRICE, `transmogPrice(${SLOT}, ${TRY}) = ${granted.price}`);
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2400);
await page.evaluate(() => { location.hash = '#/bonehead'; }); await sleep(2000);
await page.evaluate(() => document.querySelector('[data-tab="wardrobe"]')?.click()); await sleep(1800);
await page.evaluate(s => document.querySelector(`.pd-slot[data-pd="${s}"]`)?.click(), SLOT); await sleep(1800);
await settle(page);

const present = await page.evaluate(({ TRY }) => ({
  tile: !!document.querySelector(`[data-look="${TRY}"]`),
  stage: document.querySelectorAll('.bh-stage.lg img').length,
  content: !!document.getElementById('chContent'),
}), { TRY });
ok('SETUP the Dressing Room is open on the slot with the try-on tile, a stage and #chContent', present.tile && present.stage > 0 && present.content, JSON.stringify(present));

/* Per-frame sampler. rAF fires once per frame before paint, so what it reads is
   what that frame paints. Started BEFORE the tap and stopped by the reader. */
const startSampling = () => page.evaluate(() => {
  window.__c0 = document.getElementById('chContent');
  window.__frames = [];
  window.__sampling = true;
  const vis = im => { const r = im.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(im).visibility !== 'hidden'; };
  const tick = () => {
    if (!window.__sampling) return;
    const c = document.getElementById('chContent');
    const imgs = [...document.querySelectorAll('.bh-stage.lg img')];
    window.__frames.push({
      t: Math.round(performance.now()),
      n: c ? c.children.length : -1,
      undecoded: imgs.filter(im => vis(im) && !(im.naturalWidth > 0)).length,
      visible: imgs.filter(vis).length,
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const readSamples = () => page.evaluate(() => {
  window.__sampling = false;
  return { frames: window.__frames, sameContent: window.__c0 === document.getElementById('chContent') };
});
const grade = (label, s, controlOk, controlDetail) => {
  const empty = s.frames.filter(f => f.n === 0).length, gone = s.frames.filter(f => f.n === -1).length;
  const undecoded = s.frames.filter(f => f.undecoded > 0).length;
  const seenLayers = s.frames.some(f => f.visible > 0);
  ok(`${label} REBUILD #chContent is the same node after the tap (renderCharacter replaces it)`, s.sameContent);
  ok(`${label} CONTENT #chContent never held 0 elements in any sampled frame`, s.frames.length > 10 && empty === 0 && gone === 0,
    `${s.frames.length} frames, ${empty} empty, ${gone} missing`);
  ok(`${label} LAYERS every visible doll layer had naturalWidth > 0 in every sampled frame`, seenLayers && undecoded === 0,
    `${undecoded} frame(s) with an undecoded visible layer; layers seen in ${s.frames.filter(f => f.visible > 0).length} frames`);
  ok(`${label} CONTROL the tap did what a player's tap does`, controlOk, controlDetail);
};
const clickAt = async sel => {
  const r = await page.evaluate(sel => { const b = document.querySelector(sel); if (!b) return null; const x = b.getBoundingClientRect(); return { x: x.left + x.width / 2, y: x.top + x.height / 2 }; }, sel);
  if (!r) return false;
  await page.mouse.click(r.x, r.y);
  return true;
};

/* ---- PREVIEW: tap the try-on tile ---- */
await page.evaluate(s => document.querySelector(s)?.scrollIntoView({ block: 'center', behavior: 'instant' }), `[data-look="${TRY}"]`);
await sleep(300);
await startSampling();
const tapped = await clickAt(`[data-look="${TRY}"]`);
await sleep(900);
const pv = await readSamples();
const pvCtl = await page.evaluate(({ TRY }) => {
  const srcs = [...document.querySelectorAll('.bh-stage.lg img')].map(i => i.getAttribute('src') || '');
  return { inStage: srcs.some(s => s.includes(TRY)), armed: !!document.querySelector(`.mog-go[data-look-apply="${TRY}"]`), selected: !!document.querySelector(`[data-look="${TRY}"].selected`) };
}, { TRY });
grade('PREVIEW', pv, tapped && pvCtl.inStage && pvCtl.armed && pvCtl.selected, JSON.stringify(pvCtl));

/* ---- COMMIT: two real taps on Wear it ---- */
const dustBefore = await page.evaluate(async () => (await import(new URL('js/loot.js', location.href).href)).boneDust());
await page.evaluate(() => document.querySelector('.mog-go')?.scrollIntoView({ block: 'center', behavior: 'instant' }));
await sleep(300);
const armed = await clickAt('.mog-go[data-look-apply]');
await sleep(350);
const armedLabel = await page.evaluate(() => document.querySelector('.mog-go')?.textContent.trim());
await startSampling();
const confirmed = armed && await clickAt('.mog-go[data-look-apply]');
await sleep(1200);
const cm = await readSamples();
const cmCtl = await page.evaluate(async ({ TRY, SLOT }) => {
  const loot = await import(new URL('js/loot.js', location.href).href);
  const tm = await loot.transmogMap();
  const srcs = [...document.querySelectorAll('.bh-stage.lg img')].map(i => i.getAttribute('src') || '');
  return { written: tm[SLOT] === TRY, inStage: srcs.some(s => s.includes(TRY)), dust: await loot.boneDust(),
    mark: !!document.querySelector(`.pd-slot[data-pd="${SLOT}"] .pd-mog`), equippedRing: !!document.querySelector(`[data-look="${TRY}"].equipped`),
    pill: document.querySelector('.ward-dust')?.textContent.trim() };
}, { TRY, SLOT });
grade('COMMIT', cm,
  confirmed && /spend/i.test(armedLabel || '') && cmCtl.written && cmCtl.inStage && cmCtl.dust === dustBefore - PRICE && cmCtl.mark && cmCtl.equippedRing && (cmCtl.pill || '').includes(String(cmCtl.dust)),
  `armed label "${armedLabel}", ${JSON.stringify(cmCtl)}, dust ${dustBefore} -> ${cmCtl.dust} (price ${PRICE})`);

await browser.close(); srv.close?.();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(' | ')}` : '\na look tap in the Dressing Room never shows an empty room or an undecoded doll');
process.exit(exitFor(fails.length));
