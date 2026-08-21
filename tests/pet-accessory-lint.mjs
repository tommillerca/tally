/* A PET ACCESSORY IS NOT A PET, AND IS NEVER PAINTED ON THE PLAYER.
 *
 * WHY THIS EXISTS. The Bumbleseal drop adds a second kind of thing to a
 * catalogue that until now held one: gear worn by the bonehead, plus pets, which
 * are whole separate figures. A pet accessory is neither. It is worn by the pet,
 * it is sold, and it is separated from both of the older kinds by nothing but
 * the two-letter string in its `slot` field. Two invariants ride on that string
 * and neither was enforced by anything:
 *
 * 1. THE MONEY ROW. Six places filter `slot === 'C'` to mean "a pet species":
 *    js/loot.js hatchEgg (:515), breed (:882) and :703, and js/app.js :11421,
 *    :12616 and :12864. A sellable accessory that carried 'C' would join the
 *    Mystery Egg's hatch pool, so a 60-dust egg would hand out the thing the
 *    shop is selling on the same screen. Nothing in the app would look broken:
 *    the item renders, the egg opens, the player simply stops paying.
 *
 * 2. THE WRONG FIGURE. Nine sites in js/app.js iterate BH_SLOTS to draw the
 *    PLAYER. A pet slot code listed there paints a pet's glasses on the
 *    bonehead's face, at the pet's registration, on every screen at once.
 *
 * Plus the ordering rule Tom fixed in one number, 2026-08-20: "the glasses are
 * ALWAYS on top in the hierarchy for cosmetics." That is CE holding the highest
 * z in PET_SLOTS, and it only means anything if the z values are distinct, since
 * two layers on the same z stack in whatever order the array happens to be in.
 *
 * And the art itself: Cam draws every layer pre-positioned in the same 2048
 * square as the pet base, and compositing is a plain stack with no per-pet
 * anchors. A layer at any other size is registered against nothing, and an empty
 * layer is an accessory a player buys and cannot see.
 *
 * THE CLIPPING BUDGET, which is the row worth having. croppedPetImg scales the
 * whole square so the BASE pet's ink fills 0.82 of the box, then centres it. The
 * free space that leaves at the sides is all the room an accessory has to stick
 * out past the pet before the .petcrop box cuts it off, silently, with no error
 * anywhere. At C6's ink that budget is 162 art-px at 2048, and the shipped
 * stinger spends 153 of it: measured off the real renderer at 300px it clears
 * the right edge by about one CSS pixel. It is not clipped today, and the next
 * accessory drawn slightly wider is. The two inputs (FILL, read out of
 * js/app.js, and the base ink from PET_CROP) come from the app's own sources, so
 * a change to either moves the budget here rather than stranding a stale number.
 *
 * IDENTITY IS NOT TAKEN FROM THE SLOT FIELD, because the slot field is the thing
 * under test: reading "a pet accessory is an item whose slot is a PET_SLOTS
 * code" would make row SLOT-C true by definition and blind to the only bug it
 * exists for. An accessory is recognised by its id (a PET_SLOTS code followed by
 * digits, a shape no species id has: those are C1..C6 and CX) OR by its slot, so
 * a mislabelled one is still in the sample and still graded.
 *
 * PURE on purpose: it imports data/boneheadz.js and reads PNG headers with
 * node:zlib. No browser, well under a second, so it runs on every gate and on
 * every art drop.
 *
 * PROVE-RED, each row against a real defect (all six confirmed 2026-08-21):
 *   SAMPLE    delete the six pet-accessory items from the catalogue
 *   SLOT-C    give CE1 slot 'C', the shape that makes it hatchable
 *   BH-SLOTS  add { code: 'CE', label: 'Glasses', z: 95 } to BH_SLOTS
 *   GLASSES   swap CE's z with CM's, so the patches cover the shades
 *   Z-UNIQUE  set CB's z to CG's 10
 *   ART       three ways: rename CG1.png, downscale CB2.png to 1024, and
 *             blank CM1.png to fully transparent
 *   OVERHANG  shift the stinger's ink 20px further right, spending 173 of a
 *             162-px budget
 *
 *   node tests/pet-accessory-lint.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* A NAMESPACE IMPORT, NOT NAMED ONES. A tree without the pet system would fail
   to LINK on `import { PET_SLOTS }`, which is a stack trace rather than a
   verdict. This way the absence is a red SAMPLE row that names what is missing. */
import * as BH from '../data/boneheadz.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

const PET_SLOTS = Array.isArray(BH.PET_SLOTS) ? BH.PET_SLOTS : [];
const BH_SLOTS = Array.isArray(BH.BH_SLOTS) ? BH.BH_SLOTS : [];
/* WITH_UNRELEASED, because art lands unreleased first and a mislabelled slot is
   already the bug at that point: the flip to released is a one-word edit nobody
   re-reviews. */
const ITEMS = BH.BH_ITEMS_WITH_UNRELEASED || BH.BH_ITEMS || [];

const codes = PET_SLOTS.map(s => s.code);
const accessoryId = new RegExp(`^(${codes.join('|')})\\d+$`);
const accessories = codes.length
  ? ITEMS.filter(i => codes.includes(i.slot) || accessoryId.test(i.id))
  : [];

/* AN EMPTY SAMPLE IS A FAILURE. Every row below is a list of offenders, and an
   empty catalogue produces an empty list, which is how a lint becomes
   decoration. If there are no pet accessories to grade, this file has graded
   nothing and must say so. */
ok('SAMPLE PET_SLOTS, BH_SLOTS and the catalogue all parsed',
  PET_SLOTS.length >= 4 && BH_SLOTS.length >= 10 && ITEMS.length > 300,
  `${PET_SLOTS.length} pet slots (${codes.join(' ') || 'none'}), ${BH_SLOTS.length} player slots, ${ITEMS.length} items`);
ok('SAMPLE the catalogue really carries pet accessories to grade',
  accessories.length > 0,
  accessories.length ? accessories.map(i => `${i.id}=${i.slot}`).join(' ') : 'ZERO pet accessories found: every row below would pass on an empty set');

/* ---- 1. THE MONEY ROW: an accessory must never be a species ---- */
const hatchable = accessories.filter(i => i.slot === 'C');
ok("SLOT-C no pet accessory carries slot 'C', the Mystery Egg's species pool",
  hatchable.length === 0,
  hatchable.length
    ? `${hatchable.map(i => `${i.id} (${i.name})`).join(', ')} would hatch free from a 60-dust egg on the screen that sells it`
    : `${accessories.length} accessories, none in the hatch pool`);

/* ---- 2. the player figure never wears a pet's kit ---- */
const painted = PET_SLOTS.filter(s => BH_SLOTS.some(b => b.code === s.code));
ok('BH-SLOTS no pet slot code appears in BH_SLOTS, which nine app.js sites iterate to draw the PLAYER',
  painted.length === 0,
  painted.length ? `${painted.map(s => s.code).join(', ')} would be painted on the bonehead` : `${codes.join(' ')} all absent from BH_SLOTS`);

/* ---- 3. Tom's rule, as one number ---- */
const glasses = PET_SLOTS.find(s => s.code === 'CE');
ok('GLASSES slot CE holds the strictly highest z in PET_SLOTS, always on top',
  !!glasses && PET_SLOTS.every(s => s.code === 'CE' || s.z < glasses.z),
  PET_SLOTS.map(s => `${s.code}:${s.z}`).join(' ') || 'no pet slots');

/* ---- 4. a tie makes the stacking order whatever the array order happens to be ---- */
const zs = PET_SLOTS.map(s => s.z);
ok('Z-UNIQUE every pet slot has its own z, so the stack has one defined order',
  zs.length > 0 && new Set(zs).size === zs.length,
  zs.join(', ') || 'no pet slots');

/* ---- 5. the art is real, square at Cam's 2048, and not empty ---- */
/* Minimal 8-bit RGBA PNG reader. tests/ carries two other copies of this
   (art-register-audit, figure-audit); neither exports it and both run their
   whole audit at import, so a third short one is cheaper than the coupling.
   Anything that is not 8-bit RGBA non-interlaced THROWS with the file named,
   because a format this cannot read honestly is a fact about the harness and
   must never be laundered into a passing row. */
function pngAlpha(file) {
  const buf = readFileSync(file);
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`not a PNG: ${file}`);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const depth = buf[24], colour = buf[25], interlace = buf[28];
  if (depth !== 8 || colour !== 6 || interlace !== 0) {
    throw new Error(`${file}: expected 8-bit RGBA non-interlaced, got depth ${depth} colour ${colour} interlace ${interlace}`);
  }
  const idat = [];
  for (let p = 8; p + 8 <= buf.length;) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8);
    if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    if (type === 'IEND') break;
    p += 12 + len;
  }
  if (!idat.length) throw new Error(`no IDAT: ${file}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp;
  if (raw.length < (stride + 1) * h) throw new Error(`truncated image data: ${file}`);
  const out = Buffer.alloc(stride * h);
  for (let y = 0, r = 0; y < h; y++) {
    const ft = raw[r++];
    for (let x = 0; x < stride; x++) {
      const cur = raw[r + x];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v;
      if (ft === 0) v = cur;
      else if (ft === 1) v = cur + a;
      else if (ft === 2) v = cur + b;
      else if (ft === 3) v = cur + ((a + b) >> 1);
      else if (ft === 4) {
        const p0 = a + b - c, pa = Math.abs(p0 - a), pb = Math.abs(p0 - b), pc = Math.abs(p0 - c);
        v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`${file}: unknown PNG filter ${ft} on row ${y}`);
      out[y * stride + x] = v & 0xff;
    }
    r += stride;
  }
  /* THE BOX AND THE CENTROID ARE DIFFERENT ANSWERS, which is the entire point of
     the SHOT row below: a purse's strap stretches the BOX upward while the bag
     holds the MASS, so the two differ by 223 art-px on CB1. Alpha-weighted, and
     on the pixel index (not the pixel centre), which is the convention the
     shipped boxes were measured with: CE1, CB2 and CG1 reproduce to 0.1 px. */
  let x0 = w, y0 = h, x1 = 0, y1 = 0, any = false, sx = 0, sy = 0, sa = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = out[y * stride + x * bpp + 3];
      if (!a) continue;
      any = true;
      if (x < x0) x0 = x;
      if (x >= x1) x1 = x + 1;
      if (y < y0) y0 = y;
      y1 = y + 1;
      sx += x * a; sy += y * a; sa += a;
    }
  }
  return { w, h, box: any ? [x0, y0, x1, y1] : null, ink: any ? [sx / sa / w, sy / sa / h] : null };
}

const SQUARE = 2048;
const art = accessories.map(i => {
  const rel = `assets/bh/${i.slot}/${i.id}.png`;
  const full = path.join(ROOT, rel);
  if (!existsSync(full)) return { id: i.id, rel, why: 'missing from disk' };
  let png;
  try { png = pngAlpha(full); } catch (e) { return { id: i.id, rel, why: e.message }; }
  if (png.w !== SQUARE || png.h !== SQUARE) return { id: i.id, rel, why: `${png.w}x${png.h}, not ${SQUARE}x${SQUARE}, so it registers against nothing` };
  if (!png.box) return { id: i.id, rel, why: 'fully transparent: a bought accessory nobody can see' };
  return { id: i.id, rel, box: png.box, ink: png.ink };
});
const badArt = art.filter(a => a.why);
ok(`ART every pet accessory has its ${SQUARE}x${SQUARE} layer on disk with ink in it`,
  badArt.length === 0,
  badArt.length ? badArt.map(a => `${a.rel}: ${a.why}`).join('; ') : art.map(a => `${a.id} [${a.box.join(',')}]`).join(' '));

/* ---- 5b. THE PRODUCT SHOT IS CENTRED ON THE INK MASS, NOT ON THE BOX ---- */
/* Tom, twice: "your purse is focused on the strap right now in the preview not
   the bag", and again after v421 shipped. petShotHtml (js/app.js) reads ONLY the
   shot box's centre and its x extent, so the centre IS the framing decision. The
   bounding box is the wrong centre for anything with a thin limb: CB1's strap
   pulls its box 223 art-px above its mass. Three of the five items were already
   on their centroid to 0.1 art-px, so this is the house rule being enforced
   rather than a new one being invented; the two that broke it are the two Tom
   flagged. SIZE stays a judgement call and is deliberately not graded: patches
   needs the widest window because it is three scattered marks. */
const SHOT_TOL = 4;                                    // art-px at 2048, ~20x the measurement noise
const shopItems = ((BH.PET_SHOP || {}).items) || [];
const shotRows = shopItems.map(it => {
  const a = art.find(r => r.id === it.id);
  if (!a || !a.ink) return { id: it.id, why: a ? 'art unmeasurable' : 'sold but not in the catalogue' };
  const [x0, y0, x1, y1] = it.shot || [];
  if (![x0, y0, x1, y1].every(Number.isFinite)) return { id: it.id, why: 'no shot box' };
  return {
    id: it.id,
    dx: ((x0 + x1) / 2 - a.ink[0]) * SQUARE,
    dy: ((y0 + y1) / 2 - a.ink[1]) * SQUARE,
  };
});
const offCentre = shotRows.filter(r => r.why || Math.abs(r.dx) > SHOT_TOL || Math.abs(r.dy) > SHOT_TOL);
ok(`SHOT every shop tile frames its item's alpha centroid, within ${SHOT_TOL} art-px`,
  shotRows.length > 0 && offCentre.length === 0,
  shotRows.length
    ? shotRows.map(r => r.why ? `${r.id} ${r.why}` : `${r.id} ${r.dx >= 0 ? '+' : ''}${r.dx.toFixed(1)},${r.dy >= 0 ? '+' : ''}${r.dy.toFixed(1)}`).join('  ')
      + (offCentre.length ? `  | OFF: ${offCentre.map(r => r.id).join(', ')} frame empty canvas instead of the product` : '')
    : 'PET_SHOP sells nothing, so no product shot was graded');

/* ---- 6. the layer fits inside the box the base pet's scale leaves it ---- */
/* THE BASE PET IS NAMED, BECAUSE NOTHING IN THE DATA LINKS AN ACCESSORY TO A
   SPECIES. C6 is the only species with accessory art, and every shipped layer is
   drawn on the Bumbleseal. When a second species gets its own accessories this
   becomes a loop over the pairs, which needs a link in the catalogue that does
   not exist yet. Grading every accessory against every species instead would
   fail all of them on the first lizard, since a layer drawn for one pet is
   nowhere near another one's ink. */
const BASE_PET = 'C6';
const base = (BH.PET_CROP || {})[BASE_PET];
/* FILL is read out of the renderer rather than copied, so this budget cannot
   drift away from the maths that actually clips the art. */
const appSrc = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const FILL = Number((appSrc.match(/const FILL = ([\d.]+);/) || [])[1]);

if (!base || !FILL) {
  ok(`OVERHANG the clipping budget is derived from ${BASE_PET} and croppedPetImg's FILL`, false,
    `PET_CROP.${BASE_PET} ${base ? 'read' : 'MISSING'}, FILL ${FILL || 'not found in js/app.js'}: the budget cannot be computed, so nothing was graded`);
} else {
  const cw = base.x1 - base.x0, ch = base.y1 - base.y0;
  const scale = FILL / Math.max(cw, ch);      // croppedPetImg: imgSize = px * FILL / max(cw, ch)
  const slack = (1 - cw * scale) / 2;         // fraction of the BOX left free each side after centring
  const budget = (slack / scale) * SQUARE;    // back into art-px in the 2048 square
  const edges = [
    ['left', a => base.x0 * SQUARE - a.box[0]],
    ['right', a => a.box[2] - base.x1 * SQUARE],
    ['top', a => base.y0 * SQUARE - a.box[1]],
    ['bottom', a => a.box[3] - base.y1 * SQUARE],
  ];
  const spend = art.filter(a => a.box).map(a => {
    const worst = edges.map(([side, f]) => ({ side, over: Math.max(0, Math.round(f(a))) }))
      .reduce((m, e) => (e.over > m.over ? e : m));
    return { id: a.id, ...worst, headroom: Math.round(budget) - worst.over };
  });
  const clipped = spend.filter(s => s.headroom < 0);
  ok(`OVERHANG no accessory overhangs ${BASE_PET}'s ink by more than the ${Math.round(budget)} art-px the box leaves it`,
    spend.length > 0 && clipped.length === 0,
    spend.length
      ? spend.map(s => `${s.id} ${s.side}+${s.over} (${s.headroom >= 0 ? `${s.headroom} spare` : `${-s.headroom} OVER, silently clipped`})`).join(', ')
      : 'no accessory art was measurable, so no overhang was graded');
}

console.log(fails ? '\nPET ACCESSORY LINT: FAILED' : '\nPET ACCESSORY LINT: accessories are sold, not hatched, never worn by the player, and none is clipped');
process.exit(fails);
