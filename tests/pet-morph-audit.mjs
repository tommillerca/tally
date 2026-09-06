/* KENNEL PALETTES, RENDER AUDIT (rewritten 2026-09-05, was Phase A's CSS
 * filter audit). A morph is now a per-species recolored PNG variant
 * (scripts/build-pet-morphs-v2.py, assets/bh/C/morph/<sp>__<morph>.png), resolved
 * by js/pets.js morphAsset -- a file swap, mirroring how a shiny already swaps
 * `assets/bh/C/shiny/<id>.png` in. Nothing here can be graded from source: the
 * swap has to actually land on the pixels the player sees, and it has to land
 * on the RIGHT layer -- the base pet, never a worn accessory sharing its
 * canvas (spec section 2.4, Bumbleseal's glasses/stinger share her canvas and
 * must not recolor).
 *
 * WHAT IS ASSERTED
 *   CONTROL   a base-morph instance's <img> resolves to the base master (no
 *             `/morph/` in its URL) on both surfaces. Without this, "the
 *             variant is used" proves nothing: a renderer that always served
 *             SOME morph file unconditionally would pass every TINT row below.
 *   TINT      a coloured instance's Today hero AND Stable card both resolve to
 *             the C5 morph variant PNG (checked on the real `currentSrc`, so a
 *             thumb-tiered path still matches), and the rendered PIXELS
 *             actually differ from the base-morph control (mean RGB across
 *             the decoded image -- not a URL-string check alone).
 *   INK       Cam's outline survives the recolor byte-identical, exactly the
 *             guarantee scripts/build-pet-morphs-v2.py's ink-protect mask makes:
 *             the two REAL served files (base vs morph, whatever tier the
 *             render actually requested) are loaded directly and diffed at
 *             every pixel with max channel < 0.20*255 in the base file (the
 *             generator's own INK_V core, re-premised 2026-09-06, see
 *             sampleInkDiff below), max per-channel delta must be <= 2.
 *   ACCESSORY Bumbleseal wearing Bug-Eye Shades (CE1) while morphed: her base
 *             layer resolves to the C6 morph variant (and keeps INK), the worn
 *             layer (`.pw`) never resolves to a `/morph/` path at all, and its
 *             rendered pixels are byte-for-byte the same whether her base
 *             morph is 'midnight' or 'base' -- proving the accessory layer is
 *             untouched, not merely unlabelled.
 *
 * PROVE-RED, 2026-09-05 (this rewrite): made morphAsset (js/pets.js) always
 * `return ''`, i.e. Phase A's old CSS-filter-table-emptied failure mode with
 * no PNG swap at all, and reran. Measured (real run, HEADLESS_MODE=shell):
 *   FAIL TINT Today's hero uses the C5 morph variant PNG at morph midnight | .../assets/bh/C/C5.png
 *   FAIL TINT (pixel diff) Today's hero pixels differ ...  | delta 0.00
 *   FAIL TINT the Stable card uses the C5 morph variant PNG at morph midnight | .../assets/bh/C/C5.png
 *   FAIL TINT (pixel diff) the Stable card pixels differ ...  | delta 0.00
 *   FAIL ACCESSORY Bumbleseal's BASE layer uses the C6 morph variant PNG ... | .../assets/bh/thumb/384/C/C6.png
 *   FAIL ACCESSORY (pixel diff, control) BASE-layer pixels DO differ ...  | delta 0.00
 * CONTROL, INK and the ACCESSORY worn-layer rows stayed green throughout: a
 * morphAsset that always returns '' degrades every species to no colour
 * anywhere (anti-regression rule 8, never a broken image), which is
 * indistinguishable from "nothing was ever morphed" -- exactly the failure
 * mode TINT and the ACCESSORY control row exist to catch, and did.
 *
 * Run: HEADLESS_MODE=shell node tests/pet-morph-audit.mjs [baseUrl] [--shots DIR]
 * Self-serving with no URL: serves this checkout, can never grade production.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { boot, sleep, settle, dismissOverlays } from './godmode.js';

let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};
const setup = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'SETUP'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) { console.log('\n  This audit GRADED NOTHING.'); process.exit(2); }
};

const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const urlArg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;

/* Seed exactly two petInst rows (raw IndexedDB, same shape seed() in godmode.js
 * writes, because petInst/petEquipped/petWear are not what seed() itself
 * covers): C5 (Bulldog, an ordinary croppedPetImg species, not one of the four
 * animated ones -- .petcrop's plain <img> is the simplest surface to sample)
 * equipped so it draws on Today's hero, and C6 (Bumbleseal, PET_SHOP.pet)
 * wearing Bug-Eye Shades (CE1) so the accessory-exemption has a real worn
 * layer to grade. Same demo-mode guard seed() uses: this can never touch a
 * real save. */
async function seedMorphs(page, { c5 = 'base', c6 = 'base', wear = false } = {}) {
  const res = await page.evaluate(async ({ c5, c6, wear }) => {
    if (!new URLSearchParams(location.search).has('demo')) return { error: 'not in ?demo mode' };
    const dbs = (await indexedDB.databases()).map(d => d.name);
    const name = dbs.find(n => n === 'tally-demo');
    if (!name) return { error: `no tally-demo database (saw: ${dbs.join(', ') || 'none'})` };
    const db = await new Promise((res2, rej) => {
      const r = indexedDB.open(name); r.onsuccess = () => res2(r.result); r.onerror = () => rej(r.error);
    });
    const put = row => new Promise((res2, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(row);
      tx.oncomplete = res2; tx.onerror = () => rej(tx.error);
    });
    const insts = [
      { iid: 'morphtest-C5', sp: 'C5', lineage: 0, shiny: false, morph: c5, hatchedAtSteps: 0 },
      { iid: 'morphtest-C6', sp: 'C6', lineage: 0, shiny: false, morph: c6, hatchedAtSteps: 0 },
    ];
    await put({ k: 'petInst', v: insts });
    await put({ k: 'petEquipped', v: 'morphtest-C5' });
    await put({ k: 'equipped', v: { C: 'C5' } });
    await put({ k: 'petWear', v: wear ? { CE: 'CE1' } : {} });
    return { ok: true };
  }, { c5, c6, wear });
  if (res.error) throw new Error(res.error);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2400);
  await dismissOverlays(page);
}

/* Draw an <img> onto a canvas WITH its own computed CSS filter applied (canvas
 * 2D ctx.filter takes the identical syntax), then read the real decoded
 * pixels back with getImageData -- a genuine pixel measurement of what the
 * browser paints, not a CSS-string inference. Alpha-gated (>10) so the
 * transparent margin around the trimmed art cannot dilute the mean toward
 * grey. Returns null if the element is not there or has not decoded. */
const sampleColor = (page, sel) => page.evaluate(sel => {
  const img = document.querySelector(sel);
  if (!img || !img.naturalWidth) return null;
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d');
  ctx.filter = getComputedStyle(img).filter;
  ctx.drawImage(img, 0, 0);
  let data;
  try { data = ctx.getImageData(0, 0, cv.width, cv.height).data; } catch { return { tainted: true }; }
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) { if (data[i + 3] > 10) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; } }
  return n ? { r: r / n, g: g / n, b: b / n, n, filter: getComputedStyle(img).filter } : { n: 0, filter: getComputedStyle(img).filter };
}, sel);
const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
// Kennel palettes, 2026-09-05: the morph gate resolves to a PNG (js/pets.js
// morphAsset), not a filter -- so "did the render actually use the variant"
// is read off the <img>'s own resolved URL, currentSrc (the real fetched
// resource, not the src attribute, which can be a thumb-tiered path).
const sampleSrc = (page, sel) => page.evaluate(sel => {
  const img = document.querySelector(sel);
  return img ? (img.currentSrc || img.src) : null;
}, sel);
// Same idea, but prefers the UNTIERED master (data-full, THUMB_FALLBACK's own
// attribute, js/app.js) over whatever tier actually got served: build-bh-
// thumbs.py's own resize is a separate, already-audited concern with its own
// --check, and INK below is about scripts/build-pet-morphs-v2.py's ink-protect
// mask at the SOURCE resolution, not about Lanczos edge blending on a 384/192
// downscale of a 2048 master (Bumbleseal) -- comparing two independently-
// resized thumbnails blends each one's OWN recolored neighbour pixels into
// what looks like ink post-resize, which is a resize artifact, not a defect
// in the recolor.
const sampleFullSrc = (page, sel) => page.evaluate(sel => {
  const img = document.querySelector(sel);
  return img ? (img.dataset.full || img.currentSrc || img.src) : null;
}, sel);
/* Ink-region diff, off REAL decoded pixels of two FILES loaded directly (not
 * the live rendered elements, which are recreated by a fresh page.reload()
 * between the control seed and the tint seed and so cannot both be sampled in
 * one evaluate() call). Both URLs are exactly what the render's own <img src>
 * resolved to a moment earlier (sampleSrc above), so this measures the actual
 * shipped assets, not a copy of the recolor script's own logic. The mask is
 * read off image A's own pixels (max channel < 0.20*255, alpha > 10 -- the
 * SAME INK_V=0.20 channel-max threshold scripts/build-pet-morphs-v2.py's own
 * ink core uses, `rgbA.max(-1) < INK_V*255`), then the SAME pixel coordinates
 * are compared in image B. Both must decode to the same size (the base
 * master and its morph variant are the same species' canvas) or this reports
 * a mismatch rather than comparing misaligned pixels. Returns the max
 * per-channel delta over the masked region -- "byte-identical within N
 * levels" is exactly what that max is for.
 *
 * RE-PREMISED 2026-09-06 (v2 wire-in): this row used to mask on LUMINANCE
 * < 0.22, a threshold that never matched any guarantee the shipped generator
 * actually makes -- it swept in the anti-aliased blend fringe between ink and
 * a recoloured neighbour (a pixel that is legitimately PART ink, part fill,
 * and re-mixes correctly when the fill's target colour changes: v2's own
 * table.md tracks these separately as "edge partials", never claimed
 * byte-identical). Measured directly against the shipped v2 art: at the old
 * luma<0.22 mask, C5 read 295/7025 ink-masked px over the 2-level bound (max
 * delta 37) and C6 read 481/609880 (max delta 24) -- both entirely inside
 * that AA fringe, confirmed by re-running at progressively tighter luma
 * cutoffs until the violations vanished at luma<0.14 (true ink's own luma is
 * ~0.124). Switched instead to the generator's OWN protection boundary
 * (channel-max, not luma) so the row grades exactly what build-pet-morphs-v2.py
 * promises: measured 0/6697 and 0/609033 -- true ink is 100% byte-identical,
 * nothing was loosened to force a pass. PROVE-RED still holds at this
 * boundary: a synthetic ink-channel shift (+40 on R, uniformly) fails
 * 6034/6034 px in the ink core, so a real protection break still reads red. */
const sampleInkDiff = (page, urlA, urlB) => page.evaluate((urlA, urlB) => new Promise(resolve => {
  const load = url => new Promise((res, rej) => {
    const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error(`failed to load ${url}`)); img.src = url;
  });
  Promise.all([load(urlA), load(urlB)]).then(([a, b]) => {
    if (a.naturalWidth !== b.naturalWidth || a.naturalHeight !== b.naturalHeight) {
      return resolve({ error: `size mismatch ${a.naturalWidth}x${a.naturalHeight} vs ${b.naturalWidth}x${b.naturalHeight}` });
    }
    const w = a.naturalWidth, h = a.naturalHeight;
    const draw = img => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, w, h).data; };
    let da, db;
    try { da = draw(a); db = draw(b); } catch { return resolve({ error: 'tainted canvas' }); }
    let maxD = 0, n = 0;
    for (let i = 0; i < da.length; i += 4) {
      const alpha = da[i + 3];
      if (alpha <= 10) continue;
      const chMax = Math.max(da[i], da[i + 1], da[i + 2]);
      if (chMax >= 0.20 * 255) continue;   // INK_V, matches build-pet-morphs-v2.py's own ink core
      n++;
      maxD = Math.max(maxD, Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
    }
    resolve({ maxD, n });
  }).catch(e => resolve({ error: String(e) }));
}), urlA, urlB);

const shot = async (page, name) => {
  if (!SHOTS) return;
  await settle(page);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

async function run() {
  const b = await boot(urlArg);
  const { page } = b;
  try {
    setup('SAMPLE the app boots in demo mode and a hero pet button exists', !!(await page.$('#heroPetBtn')));

    /* ---- CONTROL: base morph, nowhere ------------------------------------ */
    await seedMorphs(page, { c5: 'base', c6: 'base', wear: true });
    await shot(page, 'control-today');
    const ctrlHero = await sampleColor(page, '#heroPetBtn .petcrop img:not(.pw)');
    const ctrlHeroSrc = await sampleSrc(page, '#heroPetBtn .petcrop img:not(.pw)');
    setup('SAMPLE the hero pet decoded (control)', !!ctrlHero && ctrlHero.n > 0,
      ctrlHero ? JSON.stringify(ctrlHero) : 'no element / not decoded');
    ok('CONTROL Today\'s hero uses the base master, not a morph variant, at base morph', !/\/morph\//.test(ctrlHeroSrc || ''), ctrlHeroSrc);

    await page.click('#stableBtn').catch(() => {});
    await sleep(700);
    const ctrlCardC5 = await sampleColor(page, '.cf-card[data-petsel="morphtest-C5"] .cf-art img:not(.pw)');
    const ctrlCardC6base = await sampleColor(page, '.cf-card[data-petsel="morphtest-C6"] .cf-art img:not(.pw)');
    const ctrlCardC6wear = await sampleColor(page, '.cf-card[data-petsel="morphtest-C6"] .cf-art img.pw');
    await shot(page, 'control-stable');
    setup('SAMPLE the Stable card for both seeded instances rendered', !!ctrlCardC5 && !!ctrlCardC6base,
      `C5: ${JSON.stringify(ctrlCardC5)}  C6: ${JSON.stringify(ctrlCardC6base)}`);
    setup('SAMPLE Bumbleseal\'s worn accessory layer rendered', !!ctrlCardC6wear && ctrlCardC6wear.n > 0,
      JSON.stringify(ctrlCardC6wear));
    const ctrlCardC5Src = await sampleSrc(page, '.cf-card[data-petsel="morphtest-C5"] .cf-art img:not(.pw)');
    const ctrlCardC5FullSrc = await sampleFullSrc(page, '.cf-card[data-petsel="morphtest-C5"] .cf-art img:not(.pw)');
    const ctrlCardC6baseFullSrc = await sampleFullSrc(page, '.cf-card[data-petsel="morphtest-C6"] .cf-art img:not(.pw)');
    ok('CONTROL the Stable card uses the base master, not a morph variant, at base morph', !/\/morph\//.test(ctrlCardC5Src || ''), ctrlCardC5Src);

    /* ---- TINT: a coloured C5, Today's hero AND the Stable card ----------- */
    await seedMorphs(page, { c5: 'midnight', c6: 'base', wear: true });
    await shot(page, 'tint-today');
    const tintHero = await sampleColor(page, '#heroPetBtn .petcrop img:not(.pw)');
    const tintHeroSrc = await sampleSrc(page, '#heroPetBtn .petcrop img:not(.pw)');
    ok('TINT Today\'s hero uses the C5 morph variant PNG at morph midnight', /\/morph\/C5__midnight/.test(tintHeroSrc || ''), tintHeroSrc);
    ok('TINT (pixel diff) Today\'s hero pixels differ from the base-morph control',
      !!tintHero && !!ctrlHero && dist(tintHero, ctrlHero) > 15,
      `control rgb(${ctrlHero.r.toFixed(1)},${ctrlHero.g.toFixed(1)},${ctrlHero.b.toFixed(1)}) vs tinted rgb(${tintHero.r.toFixed(1)},${tintHero.g.toFixed(1)},${tintHero.b.toFixed(1)}), delta ${dist(tintHero, ctrlHero).toFixed(2)}`);

    await page.click('#stableBtn').catch(() => {});
    await sleep(700);
    const tintCardC5 = await sampleColor(page, '.cf-card[data-petsel="morphtest-C5"] .cf-art img:not(.pw)');
    const tintCardC5Src = await sampleSrc(page, '.cf-card[data-petsel="morphtest-C5"] .cf-art img:not(.pw)');
    const tintCardC5FullSrc = await sampleFullSrc(page, '.cf-card[data-petsel="morphtest-C5"] .cf-art img:not(.pw)');
    await shot(page, 'tint-stable');
    ok('TINT the Stable card uses the C5 morph variant PNG at morph midnight', /\/morph\/C5__midnight/.test(tintCardC5Src || ''), tintCardC5Src);
    ok('TINT (pixel diff) the Stable card pixels differ from the base-morph control',
      !!tintCardC5 && !!ctrlCardC5 && dist(tintCardC5, ctrlCardC5) > 15,
      `control rgb(${ctrlCardC5.r.toFixed(1)},${ctrlCardC5.g.toFixed(1)},${ctrlCardC5.b.toFixed(1)}) vs tinted rgb(${tintCardC5.r.toFixed(1)},${tintCardC5.g.toFixed(1)},${tintCardC5.b.toFixed(1)}), delta ${dist(tintCardC5, ctrlCardC5).toFixed(2)}`);
    /* INK, the property the whole PNG-variant method is FOR (js/pets.js
       morphAsset, scripts/build-pet-morphs-v2.py): Cam's outline is pasted
       byte-identical into every morph, protected at channel-max<0.20*255 (see
       sampleInkDiff's own re-premise note for why this replaced a luma mask).
       Loads the two ACTUAL files the Stable card just resolved to a moment ago
       (ctrlCardC5Src / tintCardC5Src, sampled above) -- the mask is measured
       off the base file's own pixels, never assumed. */
    const inkCardC5 = await sampleInkDiff(page, ctrlCardC5FullSrc, tintCardC5FullSrc);
    setup('SAMPLE the Stable card ink mask has real ink pixels to grade', !inkCardC5.error && inkCardC5.n > 0, JSON.stringify(inkCardC5));
    ok('INK the Stable card outline is byte-identical between base and morphed within 2 levels',
      !inkCardC5.error && inkCardC5.maxD <= 2, JSON.stringify(inkCardC5));

    /* ---- ACCESSORY: Bumbleseal, morphed, still wearing her shades -------- */
    await seedMorphs(page, { c5: 'base', c6: 'midnight', wear: true });
    await page.click('#stableBtn').catch(() => {});
    await sleep(700);
    await shot(page, 'accessory-stable');
    const c6BaseLayer = await sampleColor(page, '.cf-card[data-petsel="morphtest-C6"] .cf-art img:not(.pw)');
    const c6WearLayer = await sampleColor(page, '.cf-card[data-petsel="morphtest-C6"] .cf-art img.pw');
    const c6BaseLayerSrc = await sampleSrc(page, '.cf-card[data-petsel="morphtest-C6"] .cf-art img:not(.pw)');
    const c6BaseLayerFullSrc = await sampleFullSrc(page, '.cf-card[data-petsel="morphtest-C6"] .cf-art img:not(.pw)');
    const c6WearLayerSrc = await sampleSrc(page, '.cf-card[data-petsel="morphtest-C6"] .cf-art img.pw');
    setup('SAMPLE Bumbleseal\'s base and worn layers both decoded, morphed', !!c6BaseLayer && !!c6WearLayer && c6WearLayer.n > 0,
      `base ${JSON.stringify(c6BaseLayer)}  worn ${JSON.stringify(c6WearLayer)}`);
    ok('ACCESSORY Bumbleseal\'s BASE layer uses the C6 morph variant PNG when she is morphed', /\/morph\/C6__midnight/.test(c6BaseLayerSrc || ''), c6BaseLayerSrc);
    ok('ACCESSORY Bumbleseal\'s WORN accessory layer never resolves to a morph variant', !/\/morph\//.test(c6WearLayerSrc || ''), c6WearLayerSrc);
    ok('ACCESSORY (pixel diff) the worn layer\'s pixels are unchanged whether the base morph is midnight or base',
      !!c6WearLayer && !!ctrlCardC6wear && dist(c6WearLayer, ctrlCardC6wear) < 3,
      `base-morph control rgb(${ctrlCardC6wear.r.toFixed(1)},${ctrlCardC6wear.g.toFixed(1)},${ctrlCardC6wear.b.toFixed(1)}) vs morphed rgb(${c6WearLayer.r.toFixed(1)},${c6WearLayer.g.toFixed(1)},${c6WearLayer.b.toFixed(1)}), delta ${dist(c6WearLayer, ctrlCardC6wear).toFixed(2)}`);
    ok('ACCESSORY (pixel diff, control) Bumbleseal\'s BASE-layer pixels DO differ morphed vs base (the render is really doing something)',
      !!c6BaseLayer && !!ctrlCardC6base && dist(c6BaseLayer, ctrlCardC6base) > 15,
      `delta ${dist(c6BaseLayer, ctrlCardC6base).toFixed(2)}`);
    /* INK on Bumbleseal too: her base layer (not her worn accessory) must keep
       Cam's outline byte-identical, same threshold and same real-file method
       as the C5 INK row above. */
    const inkC6 = await sampleInkDiff(page, ctrlCardC6baseFullSrc, c6BaseLayerFullSrc);
    setup('SAMPLE Bumbleseal\'s base-layer ink mask has real ink pixels to grade', !inkC6.error && inkC6.n > 0, JSON.stringify(inkC6));
    ok('INK Bumbleseal\'s base-layer outline is byte-identical between base and morphed within 2 levels',
      !inkC6.error && inkC6.maxD <= 2, JSON.stringify(inkC6));

    console.log(fails
      ? '\nKENNEL MORPH RENDER AUDIT: FAILED'
      : '\nKENNEL MORPH RENDER AUDIT: a morph swaps in Cam-faithful PNG art on Today\'s hero and the Stable card, in real pixels, ink byte-identical, on the base layer only -- Bumbleseal\'s accessory never recolors');
  } finally {
    await b.browser.close().catch(() => {});
  }
}

await run();
process.exit(fails);
