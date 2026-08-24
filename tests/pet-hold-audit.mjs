/* tests/pet-hold-audit.mjs — PRESS AND HOLD A DRESSED PET AND HER CLOTHES LIGHT UP.
 *
 * Tom, 2026-08-22 (feedback item v424-19): "Press and hold on bumble seal
 * highlights her sunglasses."
 *
 * VERIFIED BY FIRING THE REAL GESTURE AND ASSERTING PIXELS, never by calling the
 * highlight's own code. tally/CLAUDE.md is explicit about this and it was written
 * after v245 shipped an animation nobody could see: a real press at the real
 * coordinates, and the evidence is the difference between two captures of the
 * running screen. A getBoundingClientRect over a blank frame reads perfectly.
 *
 * WHAT IS GRADED, and which direction is failure.
 *
 *   SETUP    she is BOUGHT through buyPetItem, the path the money actually goes
 *            through, and the glasses are worn by TAPPING THEIR REAL TILE. A
 *            hand-written save row would prove the highlight can light something
 *            somebody else wrote.
 *   FOOTPRINT  where the glasses are, measured rather than assumed: one capture
 *            with the worn layer visible and one with it `visibility: hidden`,
 *            and the difference IS the glasses. Its centroid is the target every
 *            row below is compared against. Empty is a failure: no footprint
 *            means the piece never decoded and every later row would be grading
 *            a highlight on nothing.
 *   LIGHTS   the held frame differs from the resting frame. Failure is NO
 *            CHANGE, which is what an animation nobody wired up looks like.
 *   ON-THE-PIECE  the change's centroid sits within 8px of the glasses' own ink
 *            centroid. This is the row that separates "the pet glows" from "her
 *            sunglasses are highlighted". Failure in either direction: a
 *            whole-figure glow lands its centroid on the pet's middle, not on
 *            her face.
 *   RESTRAINT  the lit pixels stay under 6% of the pet's box. Tom asked for a
 *            highlight, not a light show, and "it lit up" with no ceiling is the
 *            shape of check that passes because the app is too loud (this repo's
 *            anti-regression rule 11: a check on something that can run away
 *            needs a bound, never a trend).
 *            THE 6% IS DERIVED FROM A MEASURED REJECTION, not invented. The
 *            first cut of the highlight was two stacked accent drop-shadows at
 *            2px and 5px; rendered and looked at, it was a lime glow bleeding
 *            across half her face, which is exactly the light show Tom ruled
 *            out, and it measured 7.2% of her box. The shipped one is a single
 *            1.5px rim plus a 1.08 brightness lift and measures 3.9%. A ceiling
 *            anywhere above 7.2% would have passed the version that was thrown
 *            away, so the bound sits between the two: 1.5x headroom over what
 *            ships, and red on what was rejected.
 *   RELEASE  letting go puts it back. Failure is a halo that sticks, which turns
 *            a momentary affordance into a permanent decoration.
 *   NOT-A-TAP  a short press does nothing. The pet sits on Today, in the Stable,
 *            in the Paddock and in the Pit, and a highlight that fired on every
 *            brush would be noise on four screens.
 *
 * Serves the tree by default and NEVER defaults to production.
 * Usage: node tests/pet-hold-audit.mjs      (exits non-zero on failure)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';
import { PET_SHOP, PET_SLOTS } from '../data/boneheadz.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* THE SUNGLASSES, RESOLVED FROM THE SLOT THAT IS LITERALLY NAMED "Glasses",
   never from the item id and never from a name regex. The first cut of this
   matched /glass|shade/ against the id and the name, found nothing, and fell
   through to a default that quietly bought CM1, the PATCHES: seven green rows
   about a garment Tom did not mention. PET_SLOTS carries the label, the item id
   carries the slot code as its prefix, and if that ever stops being true this
   throws by name instead of grading the wrong piece. */
const GLASSES_SLOT = PET_SLOTS.find(s => /glass/i.test(s.label));
const GLASSES = GLASSES_SLOT && PET_SHOP.items.find(i => i.id.startsWith(GLASSES_SLOT.code))?.id;
if (!GLASSES) throw new Error(`no shop item sits in a PET_SLOTS slot labelled "Glasses" (slots: ${PET_SLOTS.map(s => s.code + '=' + s.label).join(', ')}); fix this resolver rather than grading whatever is last in the list`);

/* See RESTRAINT in the header: 3.9% ships, 7.2% was rendered, looked at and
   thrown away for being a glow rather than a highlight. */
const LOUD_MAX_PCT = 6;

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const base = process.argv[2] || null;
const srv = base ? null : await serveTree(ROOT);
const url = base || srv.url;
const { browser, page } = await boot(url);

const shot = async () => 'data:image/png;base64,' + (await page.screenshot({ encoding: 'base64' }));

/* The difference between two captures, restricted to one rect, as an ink weight,
   a centroid and a pixel count. Decoded in the page because node has no PNG
   decoder; identical technique to tests/badge-centre-lib.mjs. */
const diffIn = (a, b, rect) => page.evaluate(async (aa, bb, r) => {
  const load = u => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
  const [ia, ib] = await Promise.all([load(aa), load(bb)]);
  const dpr = ia.width / innerWidth;
  const grab = img => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    return x.getImageData(0, 0, img.width, img.height).data;
  };
  const A = grab(ia), B = grab(ib), W = ia.width;
  const x0 = Math.floor(r.x * dpr), y0 = Math.floor(r.y * dpr);
  const x1 = Math.ceil((r.x + r.w) * dpr), y1 = Math.ceil((r.y + r.h) * dpr);
  let sum = 0, sx = 0, sy = 0, n = 0, area = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      area++;
      const i = (y * W + x) * 4;
      const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
      if (d < 12) continue;
      sum += d; sx += (x + 0.5) * d; sy += (y + 0.5) * d; n++;
    }
  }
  return { px: n, area, pct: area ? n * 100 / area : 0,
    cx: sum ? (sx / sum) / dpr : null, cy: sum ? (sy / sum) / dpr : null };
}, a, b, rect);

try {
  await seed(page, { level: 20, coins: 400000 });

  /* BOUGHT, NOT GRANTED, for the reason pet-wardrobe-audit gives: buyPetItem is
     the only way an accessory legitimately enters a save. */
  const bought = await page.evaluate(async ids => {
    const loot = await import('/js/loot.js');
    const out = [];
    for (const id of ids) { const r = await loot.buyPetItem(id); out.push({ id, ok: !!r && r.ok !== false }); }
    return out;
  }, [PET_SHOP.pet.id, GLASSES]);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2400);

  // her wardrobe lives under her card in the Stable; wear the glasses by tapping
  await page.evaluate(() => { location.hash = '#/pets'; });
  await sleep(900);
  await page.evaluate(() => document.getElementById('stableBtn')?.click());
  await sleep(1700);
  const tapped = await page.evaluate(async id => {
    const b = document.querySelector(`[data-petwear="${id}"]`);
    if (!b) return false;
    b.click();
    return true;
  }, GLASSES);
  await sleep(1200);

  const pet = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.petcrop.dressed')]
      .map(e => ({ e, r: e.getBoundingClientRect() }))
      .filter(x => x.r.width > 60 && x.r.top >= 0 && x.r.bottom <= innerHeight)
      .sort((a, b) => b.r.width - a.r.width)[0];
    if (!el) return null;
    const worn = [...el.e.querySelectorAll('img.pw')];
    window.__phEl = el.e; window.__phWorn = worn;
    return { x: el.r.x, y: el.r.y, w: el.r.width, h: el.r.height,
      worn: worn.length, decoded: worn.filter(w => w.naturalWidth > 0).length,
      srcs: worn.map(w => w.getAttribute('src').split('/').pop()) };
  });

  ok('SETUP she was bought through the real shop path, the glasses tile was tapped, and a dressed pet is on screen',
    bought.every(b => b.ok) && tapped && !!pet && pet.worn > 0 && pet.decoded === pet.worn,
    `${bought.map(b => b.id + (b.ok ? '' : ' REFUSED')).join(' ')} | tile ${tapped ? 'tapped' : 'MISSING'} | `
    + (pet ? `${pet.w.toFixed(0)}x${pet.h.toFixed(0)}px box, ${pet.worn} worn layer(s) [${pet.srcs.join(',')}], ${pet.decoded} decoded` : 'no dressed pet rendered'));
  if (!pet) throw new Error('no dressed pet on screen, so nothing below could be measured');

  const box = { x: pet.x, y: pet.y, w: pet.w, h: pet.h };

  /* FOOTPRINT: where the glasses actually are, measured off the render. */
  const rest = await shot();
  await page.evaluate(() => { for (const w of window.__phWorn) w.style.visibility = 'hidden'; });
  await sleep(220);
  const bare = await shot();
  await page.evaluate(() => { for (const w of window.__phWorn) w.style.visibility = ''; });
  await sleep(220);
  const foot = await diffIn(rest, bare, box);
  ok('FOOTPRINT the worn piece puts ink on the glass, so there is something to highlight',
    foot.px > 0 && foot.cx != null,
    `${foot.px} px of glasses ink (${foot.pct.toFixed(1)}% of her box), centroid (${(foot.cx || 0).toFixed(1)}, ${(foot.cy || 0).toFixed(1)})`);

  /* THE REAL GESTURE: a real pointer, at the real coordinates, held. */
  const cx = pet.x + pet.w / 2, cy = pet.y + pet.h / 2;
  const before = await shot();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await sleep(800);                       // past HOLD_MS (420) and the .16s fade
  const held = await shot();
  await page.mouse.up();
  await sleep(600);
  const after = await shot();

  const lit = await diffIn(before, held, box);
  ok('LIGHTS holding on her changes what is on the glass',
    lit.px > 0,
    `${lit.px} px changed (${lit.pct.toFixed(1)}% of her box)`);

  const dist = (lit.cx == null || foot.cx == null) ? Infinity : Math.hypot(lit.cx - foot.cx, lit.cy - foot.cy);
  ok('ON-THE-PIECE the change is centred on the glasses, not on the pet',
    dist <= 8,
    `highlight centroid (${(lit.cx || 0).toFixed(1)}, ${(lit.cy || 0).toFixed(1)}) vs glasses ink centroid `
    + `(${(foot.cx || 0).toFixed(1)}, ${(foot.cy || 0).toFixed(1)}): ${dist.toFixed(1)}px apart`);

  ok(`RESTRAINT it is a highlight, not a light show (under ${LOUD_MAX_PCT}% of her box)`,
    lit.pct > 0 && lit.pct < LOUD_MAX_PCT,
    `${lit.pct.toFixed(1)}% of her box changed (shipped 3.9%, the rejected two-shadow glow 7.2%)`);

  const back = await diffIn(before, after, box);
  ok('RELEASE letting go puts it back',
    back.px === 0,
    back.px === 0 ? 'the released frame is identical to the resting frame' : `${back.px} px still lit after release`);

  /* NOT-A-TAP. A quick press must do nothing, or the pet becomes a flashing
     target on all four screens that draw her. */
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await sleep(120);
  const quick = await shot();
  await page.mouse.up();
  await sleep(400);
  const tapDiff = await diffIn(before, quick, box);
  ok('NOT-A-TAP a short press leaves her alone',
    tapDiff.px === 0,
    tapDiff.px === 0 ? 'a 120ms press changed nothing' : `${tapDiff.px} px lit after only 120ms`);
} finally {
  await browser.close();
  if (srv) srv.close();
}

const failed = results.filter(r => !r.pass).length;
console.log(`\n${failed ? 'FAILED' : 'OK'}  ${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
