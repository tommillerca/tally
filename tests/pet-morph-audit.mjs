/* KENNEL PHASE A, RENDER AUDIT: a morph is a CSS filter over Cam's EXISTING art
 * (no new PNGs, spec BUILDpetskennel20260905.md section 0.7), so nothing here
 * can be graded from source: the filter has to actually land on the pixels the
 * player sees, and it has to land on the RIGHT layer -- the base pet, never a
 * worn accessory sharing its canvas (section 2.4, Bumbleseal's glasses/stinger
 * share her canvas and must not tint).
 *
 * WHAT IS ASSERTED
 *   CONTROL   a base-morph instance draws with NO filter anywhere, on both
 *             surfaces. Without this, "a filter is present" proves nothing: a
 *             renderer that always applied SOME filter unconditionally would
 *             pass every row below.
 *   TINT      a coloured instance's Today hero AND Stable card both carry a
 *             non-empty CSS filter on the base layer, and the rendered PIXELS
 *             actually differ from the base-morph control (mean RGB across the
 *             decoded image, sampled through a canvas with the element's own
 *             computed filter applied -- not a CSS-string check).
 *   ACCESSORY Bumbleseal wearing Bug-Eye Shades (CE1) while morphed: her base
 *             layer carries the filter, the worn layer (`.pw`) carries NONE,
 *             and its rendered pixels are byte-for-byte the same whether her
 *             base morph is 'midnight' or 'base' -- proving the accessory
 *             layer is untouched, not merely unlabelled.
 *
 * PROVE-RED, 2026-09-05, in this checkout: emptied MORPH_TINT's per-morph
 * filter table in js/app.js (`const MORPH_FILTER = {}`) and reran. Measured:
 *   FAIL TINT Today's hero carries a real filter at morph midnight  | none
 *   FAIL TINT (pixel diff) Today's hero pixels differ ...  | delta 0.00
 *   FAIL TINT the Stable card carries a real filter at morph midnight  | none
 *   FAIL TINT (pixel diff) the Stable card pixels differ ...  | delta 0.00
 *   FAIL ACCESSORY Bumbleseal's BASE layer carries the filter ...  | none
 *   FAIL ACCESSORY (pixel diff, control) BASE-layer pixels DO differ ...  | delta 0.00
 * CONTROL and the ACCESSORY worn-layer rows stayed green throughout: an empty
 * tint table degrades every species to no colour anywhere (anti-regression
 * rule 8, never a broken image), which is indistinguishable from "nothing was
 * ever tinted" -- exactly the failure mode TINT and the ACCESSORY control row
 * exist to catch, and did.
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
const hasFilter = c => !!c && c.filter && c.filter !== 'none';

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
    setup('SAMPLE the hero pet decoded (control)', !!ctrlHero && ctrlHero.n > 0,
      ctrlHero ? JSON.stringify(ctrlHero) : 'no element / not decoded');
    ok('CONTROL Today\'s hero carries no filter at base morph', !hasFilter(ctrlHero), ctrlHero.filter);

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
    ok('CONTROL the Stable card carries no filter at base morph', !hasFilter(ctrlCardC5), ctrlCardC5.filter);

    /* ---- TINT: a coloured C5, Today's hero AND the Stable card ----------- */
    await seedMorphs(page, { c5: 'midnight', c6: 'base', wear: true });
    await shot(page, 'tint-today');
    const tintHero = await sampleColor(page, '#heroPetBtn .petcrop img:not(.pw)');
    ok('TINT Today\'s hero carries a real filter at morph midnight', hasFilter(tintHero), tintHero && tintHero.filter);
    ok('TINT (pixel diff) Today\'s hero pixels differ from the base-morph control',
      !!tintHero && !!ctrlHero && dist(tintHero, ctrlHero) > 15,
      `control rgb(${ctrlHero.r.toFixed(1)},${ctrlHero.g.toFixed(1)},${ctrlHero.b.toFixed(1)}) vs tinted rgb(${tintHero.r.toFixed(1)},${tintHero.g.toFixed(1)},${tintHero.b.toFixed(1)}), delta ${dist(tintHero, ctrlHero).toFixed(2)}`);

    await page.click('#stableBtn').catch(() => {});
    await sleep(700);
    const tintCardC5 = await sampleColor(page, '.cf-card[data-petsel="morphtest-C5"] .cf-art img:not(.pw)');
    await shot(page, 'tint-stable');
    ok('TINT the Stable card carries a real filter at morph midnight', hasFilter(tintCardC5), tintCardC5 && tintCardC5.filter);
    ok('TINT (pixel diff) the Stable card pixels differ from the base-morph control',
      !!tintCardC5 && !!ctrlCardC5 && dist(tintCardC5, ctrlCardC5) > 15,
      `control rgb(${ctrlCardC5.r.toFixed(1)},${ctrlCardC5.g.toFixed(1)},${ctrlCardC5.b.toFixed(1)}) vs tinted rgb(${tintCardC5.r.toFixed(1)},${tintCardC5.g.toFixed(1)},${tintCardC5.b.toFixed(1)}), delta ${dist(tintCardC5, ctrlCardC5).toFixed(2)}`);

    /* ---- ACCESSORY: Bumbleseal, morphed, still wearing her shades -------- */
    await seedMorphs(page, { c5: 'base', c6: 'midnight', wear: true });
    await page.click('#stableBtn').catch(() => {});
    await sleep(700);
    await shot(page, 'accessory-stable');
    const c6BaseLayer = await sampleColor(page, '.cf-card[data-petsel="morphtest-C6"] .cf-art img:not(.pw)');
    const c6WearLayer = await sampleColor(page, '.cf-card[data-petsel="morphtest-C6"] .cf-art img.pw');
    setup('SAMPLE Bumbleseal\'s base and worn layers both decoded, morphed', !!c6BaseLayer && !!c6WearLayer && c6WearLayer.n > 0,
      `base ${JSON.stringify(c6BaseLayer)}  worn ${JSON.stringify(c6WearLayer)}`);
    ok('ACCESSORY Bumbleseal\'s BASE layer carries the filter when she is morphed', hasFilter(c6BaseLayer), c6BaseLayer.filter);
    ok('ACCESSORY Bumbleseal\'s WORN accessory layer carries no filter at all', !hasFilter(c6WearLayer), c6WearLayer.filter);
    ok('ACCESSORY (pixel diff) the worn layer\'s pixels are unchanged whether the base morph is midnight or base',
      !!c6WearLayer && !!ctrlCardC6wear && dist(c6WearLayer, ctrlCardC6wear) < 3,
      `base-morph control rgb(${ctrlCardC6wear.r.toFixed(1)},${ctrlCardC6wear.g.toFixed(1)},${ctrlCardC6wear.b.toFixed(1)}) vs morphed rgb(${c6WearLayer.r.toFixed(1)},${c6WearLayer.g.toFixed(1)},${c6WearLayer.b.toFixed(1)}), delta ${dist(c6WearLayer, ctrlCardC6wear).toFixed(2)}`);
    ok('ACCESSORY (pixel diff, control) Bumbleseal\'s BASE-layer pixels DO differ morphed vs base (the render is really doing something)',
      !!c6BaseLayer && !!ctrlCardC6base && dist(c6BaseLayer, ctrlCardC6base) > 15,
      `delta ${dist(c6BaseLayer, ctrlCardC6base).toFixed(2)}`);

    console.log(fails
      ? '\nKENNEL MORPH RENDER AUDIT: FAILED'
      : '\nKENNEL MORPH RENDER AUDIT: a morph paints Today\'s hero and the Stable card, in real pixels, on the base layer only -- Bumbleseal\'s accessory never tints');
  } finally {
    await b.browser.close().catch(() => {});
  }
}

await run();
process.exit(fails);
