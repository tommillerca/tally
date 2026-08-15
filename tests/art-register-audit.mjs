/* ART MUST REGISTER ON THE ANATOMY IT IS DRAWN FOR, AND A SLOT MUST SAY WHICH.
 *
 * This is the generalisation of grill-fit-audit, which guarded one slot. The
 * defect it guards is a CLASS, not three items.
 *
 * THE CLASS. v335 imported 63 cosmetics from the SOL asset set and registered
 * them onto Tally's canvas by matching the two SKULLS' BOUNDING BOXES ("1217x1280
 * at (377,241) against 193x199 at (197,66)"). That is figure contract rule 3
 * violated verbatim: align on INK, never on boxes. Two differently-drawn skulls
 * with aligned boxes do not have their mouths, sockets or crowns in the same
 * place, so art placed that way lands off its own anatomy.
 *
 * THE BATCH, by the v335 commit (2198e49), is 63 files in FOUR slots:
 *      E  eyes    23      G  grillz   3      H  hats    24      M  mouth   13
 * The three a player reported (GS1, GS2, GS3) are Grillz. The other 60 are not,
 * so "the three are fixed" is not "the class is closed". The inventory below is
 * re-derived from disk on every run and pinned to 63, so the claim cannot rot.
 *
 * WHAT THE FIX ACTUALLY WAS, measured off the PNGs either side of b4d7b52:
 *      GS1 dx +1  dy -20      GS2 dx +4  dy -3      GS3 dx -4  dy -12
 * Three different offsets, all vertical, none of them one shared batch offset.
 * That matters: there is no single "SOL offset" to go looking for in the other
 * 60, so each slot has to be measured on its own anatomy or declared uncovered.
 *
 * THE METHOD. Build a mask of one piece of skull anatomy from the DEFAULT
 * skull's INK (not its box). For an item, count the overlap of its alpha with
 * that mask where the art actually sits, and divide by the best overlap it could
 * reach anywhere within +-SEARCH px. A correctly registered item is already at
 * its own best: ratio ~1. A misplaced one is not.
 *
 * WHERE THE METHOD WORKS, AND WHERE IT LIES. It works when the art CAPS a small,
 * structured piece of anatomy, because then the overlap has a sharp peak in the
 * right place. It does not work when the art sits INSIDE a larger opening, or
 * covers a big solid region, because then the overlap is either maximised
 * somewhere other than where the artist drew it (a FALSE RED) or barely changes
 * when you shift it (BLIND). Both were measured, on this art, before any slot
 * was declared. See NOT_COVERED for the numbers.
 *
 * SO A SLOT IS ONLY "COVERED" IF THE AUDIT RE-EARNS IT EVERY RUN. Declaring an
 * anchor in a table is a claim, and a claim in a comment is how a check that
 * cannot fail gets shipped. Two calibration gates run before any item is judged:
 *   CAL-A  NO FALSE RED. Every one of Cam's originals in the slot must pass. If
 *          the anchor flags art that has always rendered correctly, the anchor
 *          is wrong, not the art.
 *   CAL-B  NOT BLIND. Every item in the slot, shifted by PROBE px in each of the
 *          four cardinal directions, must FAIL. If a 12px slip would still score
 *          a pass, that row is decoration.
 * CAL-A is the floor and CAL-B is the ceiling, and the threshold has to fit
 * between them. Both are failures, not warnings.
 *
 * DIRECTION AND BOUND (anti-regression rule 11). Failure is the ratio going
 * DOWN. It is a ceiling on error, not a trend, so it cannot pass by drifting. An
 * empty item list, an empty mask, an undeclared slot and an unproven anchor are
 * each a FAILURE, never a pass (rule 3).
 *
 * PROVE-RED: shift any covered item's PNG by 12px in a scratch copy of the tree
 * and its FIT row goes red naming the offset it wants. Do it in a throwaway
 * tree, never the one you are working in.
 *
 * Usage: node tests/art-register-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { BH_SLOTS } from '../data/boneheadz.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEARCH = 24;   // +-px. Was 8; see LIMITS.
const PROBE = 12;    // px, the median of the three measured fixes above (20, 3, 12)
const DEFAULT_SKULL = 'SK0-1';

/* ANATOMY, as ink on the default skull rather than as a box. Each entry names
   the region it scans and the colour rule that finds the anatomy inside it, plus
   the pixel count a healthy mask has, so a skull that does not draw this feature
   the same way is EXCLUDED by name instead of quietly producing a junk mask. */
const ANATOMY = {
  teeth: {
    what: 'the cream tooth faces of the lower jaw',
    box: [305, 195, 392, 250],
    ink: p => p[0] > 210 && p[1] > 200 && p[2] > 170 && p[3] > 200,
    valid: [200, 800],
    invalidMeans: 'a skull drawn with a solid cream jaw rather than individual teeth',
  },
};

/* EVERY SLOT IN BH_SLOTS APPEARS BELOW. An unlisted slot must never read as a
   passing slot, so the coverage check fails on any code that is missing here.
   Each entry is either an anchor or a REASON, and every reason that says
   "measured" was measured on this art before it was written down. */
const COVERED = {
  G: {
    anchor: 'teeth',
    threshold: 0.85,
    /* Cam's originals score 0.93 to 1.00 and a 12px slip scores 0.00 to 0.04, so
       0.85 sits in a gap two thirds of the scale wide. The three defects scored
       0.46, 0.53 and 0.61 before the fix. */
    exempt: { G12: 'a knocked-out tooth: dark ink REPLACING a tooth, not a cap on one, so a teeth-overlap ratio is meaningless for it (it measures 0.57 while rendering exactly as intended)' },
  },
};

const NOT_COVERED = {
  E: 'FALSE RED, measured. Eye art sits INSIDE the sockets rather than capping them, so a pupil slides freely and the overlap peaks somewhere other than where it was drawn. Against a socket-ink mask Cam\'s own originals score E4 0.60, E11-1 0.70, E1 0.79, E2 0.82, while the known Grillz defect band was 0.46 to 0.61. The healthy band and the defect band OVERLAP, so no threshold can separate them and any threshold picked would flag Cam\'s art.',
  M: 'FALSE RED, measured. Mouth items attach at different points of the jaw (a cigarette at the corner, a bubble below it, an arrow straight through), so there is no one anatomy they all register on. Against the teeth mask Cam\'s own M1, M2, M3, M4, M6, M8, M10 and M11 all score 0.00: their alpha never touches the teeth at all.',
  H: 'FALSE RED, measured. The crown is a big solid dome, so overlap is flat where the hat covers it and monotone where it does not. Cam\'s own originals span 0.02 (H7-1, a bandana worn over the eyes) to 1.00, which is the whole scale.',
  T: 'BLIND, measured. A torso mask does not false-red (Cam\'s tops score 0.91 to 1.00) but it cannot catch anything: shifted 12px they still score 0.77 to 0.97, above any threshold the 0.91 floor allows. This is the measured precedent for the body slots below.',
  S: 'no anchor measured. A body-anchored slot of the same shape as T, which measured BLIND, and the v335 batch did not touch it.',
  FW: 'no anchor measured. A body-anchored slot of the same shape as T, which measured BLIND, and the v335 batch did not touch it.',
  U: 'no anchor measured. A body-anchored slot of the same shape as T, which measured BLIND, and the v335 batch did not touch it.',
  P: 'no anchor measured. A body-anchored slot of the same shape as T, which measured BLIND, and the v335 batch did not touch it.',
  IL: 'no anchor measured. A body-anchored slot of the same shape as T, which measured BLIND, and the v335 batch did not touch it.',
  IR: 'no anchor measured. A body-anchored slot of the same shape as T, which measured BLIND, and the v335 batch did not touch it.',
  SK: 'no anchor is possible: the skull IS the anatomy every other head slot registers against.',
  B: 'no anchor is possible: the body IS the anatomy every other body slot registers against.',
  BG: 'no anchor is possible: a background is full-frame art behind the figure and registers against nothing.',
  C: 'no anchor is possible: a pet is a separate figure that stands beside the bonehead rather than on it.',
};

/* Minimal PNG reader. Every file under assets/bh is 8-bit RGBA, non-interlaced
   (verified), so this handles exactly that and throws on anything else rather
   than quietly returning garbage pixels. */
function readPng(file) {
  const buf = fs.readFileSync(file);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const depth = buf[24], color = buf[25], interlace = buf[28];
  if (depth !== 8 || color !== 6 || interlace !== 0) {
    throw new Error(`${file}: expected 8-bit RGBA non-interlaced, got depth ${depth} color ${color} interlace ${interlace}`);
  }
  const chunks = [];
  for (let p = 8; p + 8 <= buf.length;) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    if (type === 'IDAT') chunks.push(buf.subarray(p + 8, p + 8 + len));
    p += len + 12;
    if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const bpp = 4, stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0, r = 0; y < h; y++) {
    const filter = raw[r++];
    for (let x = 0; x < stride; x++) {
      const cur = raw[r + x];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v;
      if (filter === 0) v = cur;
      else if (filter === 1) v = cur + a;
      else if (filter === 2) v = cur + b;
      else if (filter === 3) v = cur + ((a + b) >> 1);
      else if (filter === 4) {
        const p0 = a + b - c, pa = Math.abs(p0 - a), pb = Math.abs(p0 - b), pc = Math.abs(p0 - c);
        v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`${file}: unknown PNG filter ${filter} on row ${y}`);
      out[y * stride + x] = v & 0xff;
    }
    r += stride;
  }
  return { w, h, data: out };
}

/* The mask is kept as a LIST of its own pixels, not as a full canvas: every
   offset then costs the anatomy's size (hundreds of px) instead of the canvas's
   (410k), which is what makes a +-24 window affordable. */
function buildMask(anat, skullFile) {
  const { w, h, data } = readPng(skullFile);
  const [x0, y0, x1, y1] = anat.box;
  const px = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      if (anat.ink([data[i], data[i + 1], data[i + 2], data[i + 3]])) px.push(y * w + x);
    }
  }
  return { px, w, h };
}

const alpha = file => {
  const { w, h, data } = readPng(file);
  const a = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = data[i * 4 + 3] > 16 ? 1 : 0;
  return { a, w, h };
};

/* Overlap of the item's alpha with the mask when the mask is read (dx,dy) from
   where it sits: mask pixel (X,Y) is compared against item pixel (X-dx, Y-dy). */
function overlap(a, w, h, mask, dx, dy) {
  let n = 0;
  for (const p of mask.px) {
    const X = (p % w) - dx, Y = ((p / w) | 0) - dy;
    if (X >= 0 && X < w && Y >= 0 && Y < h && a[Y * w + X]) n++;
  }
  return n;
}

const fails = [];
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) fails.push(name);
};
const slotDir = code => path.join(ROOT, 'assets/bh', code);
const idsIn = code => fs.readdirSync(slotDir(code)).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)).sort();
/* The v335 SOL import named every file <slot>S<n>. Nothing Cam drew collides:
   the count is pinned to the 63 in commit 2198e49 below. */
const isBatch = (code, id) => new RegExp(`^${code}S\\d+$`).test(id);

console.log('=== SLOT COVERAGE: every slot declares its anatomy, or declares that it has none ===');
const missing = BH_SLOTS.map(s => s.code).filter(c => !COVERED[c] && !NOT_COVERED[c]);
ok('every BH_SLOTS code is declared here (an undeclared slot must never read as a passing slot)',
  missing.length === 0, missing.length ? `undeclared: ${missing.join(', ')}` : `${BH_SLOTS.length} slots declared`);
const stray = [...Object.keys(COVERED), ...Object.keys(NOT_COVERED)].filter(c => !BH_SLOTS.some(s => s.code === c));
ok('no slot is declared here that BH_SLOTS does not have (a stale row reads as coverage)',
  stray.length === 0, stray.length ? `stray: ${stray.join(', ')}` : 'none');

console.log('\n=== THE v335 SOL BATCH, re-derived from disk ===');
let batchTotal = 0, batchCovered = 0;
for (const s of BH_SLOTS) {
  const n = fs.existsSync(slotDir(s.code)) ? idsIn(s.code).filter(id => isBatch(s.code, id)).length : 0;
  if (!n) continue;
  batchTotal += n;
  if (COVERED[s.code]) batchCovered += n;
  console.log(`      ${s.code.padEnd(3)} ${s.label.padEnd(11)} ${String(n).padStart(3)} batch item(s)   ${COVERED[s.code] ? `COVERED by the ${COVERED[s.code].anchor} anchor` : 'NOT COVERED'}`);
}
ok('the SOL batch on disk is still the 63 files of commit 2198e49 (if this moved, the inventory above is stale)',
  batchTotal === 63, `${batchTotal} found`);

console.log('\n=== ANATOMY: built from ink on the default skull, and shown to be the same ink on the others ===');
const masks = {};
for (const [name, anat] of Object.entries(ANATOMY)) {
  const m = buildMask(anat, path.join(ROOT, `assets/bh/SK/${DEFAULT_SKULL}.png`));
  masks[name] = m;
  ok(`SAMPLE the ${name} mask found ink on ${DEFAULT_SKULL} (an empty mask is a FAILURE, not a pass)`,
    m.px.length >= anat.valid[0] && m.px.length <= anat.valid[1], `${m.px.length} px, ${anat.what}`);

  /* THE ONE-SKULL LIMIT, MEASURED INSTEAD OF INHERITED. The mask comes off one
     skull, so the honest question is whether the anatomy moves on the other 31.
     It does not: every skull that draws this feature at all draws it in exactly
     the same pixels. Failure here means a new skull broke that premise, which
     is the moment one-skull validation stops generalising. */
  const skulls = fs.readdirSync(path.join(ROOT, 'assets/bh/SK')).filter(f => f.endsWith('.png'));
  const excluded = [], moved = [];
  for (const f of skulls) {
    const other = buildMask(anat, path.join(ROOT, `assets/bh/SK/${f}`));
    if (other.px.length < anat.valid[0] || other.px.length > anat.valid[1]) { excluded.push(`${f.slice(0, -4)} (${other.px.length}px)`); continue; }
    const set = new Set(other.px);
    let best = { n: -1, dx: 0, dy: 0 };
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        let n = 0;
        for (const p of m.px) { const q = p + dy * m.w + dx; if (set.has(q)) n++; }
        if (n > best.n) best = { n, dx, dy };
      }
    }
    if (best.dx !== 0 || best.dy !== 0) moved.push(`${f.slice(0, -4)} (${best.dx},${best.dy})`);
  }
  ok(`AGREEMENT every skull that draws ${name} puts it in the same pixels as ${DEFAULT_SKULL}`,
    moved.length === 0, moved.length ? `moved: ${moved.join(', ')}` : `${skulls.length - excluded.length} of ${skulls.length} skulls agree at (0,0)`);
  console.log(`      excluded from AGREEMENT, ${excluded.length} skull(s), each ${anat.invalidMeans}: ${excluded.join(', ') || 'none'}`);
}

for (const [code, spec] of Object.entries(COVERED)) {
  const anat = ANATOMY[spec.anchor], m = masks[spec.anchor];
  const ids = idsIn(code);
  console.log(`\n=== SLOT ${code}: art must register on ${spec.anchor} (${anat.what}), threshold ${spec.threshold} ===`);
  ok(`SAMPLE the ${code} slot has art to check (an empty slot is a FAILURE, not a pass)`, ids.length > 0, `${ids.length} items`);

  const measured = {};
  for (const id of ids) {
    if (spec.exempt?.[id]) { console.log(`SKIP  ${id} exempt: ${spec.exempt[id]}`); continue; }
    const { a, w, h } = alpha(path.join(slotDir(code), `${id}.png`));
    const at0 = overlap(a, w, h, m, 0, 0);
    let best = { n: 0, dx: 0, dy: 0 };
    for (let dy = -SEARCH; dy <= SEARCH; dy++) {
      for (let dx = -SEARCH; dx <= SEARCH; dx++) {
        const n = overlap(a, w, h, m, dx, dy);
        if (n > best.n) best = { n, dx, dy };
      }
    }
    /* The four cardinal PROBE shifts: what this item would score if it had
       slipped by PROBE px. The WORST of them is what CAL-B has to beat. */
    const probe = Math.max(...[[PROBE, 0], [-PROBE, 0], [0, PROBE], [0, -PROBE]]
      .map(([dx, dy]) => (best.n ? overlap(a, w, h, m, dx, dy) / best.n : 1)));
    measured[id] = { ratio: best.n ? at0 / best.n : 0, best, probe, at0 };
  }

  const cohort = Object.keys(measured).filter(id => !isBatch(code, id));
  ok(`SAMPLE ${code} has originals to calibrate against (an empty cohort is a FAILURE, not a pass)`, cohort.length > 0, `${cohort.length} of Cam's`);

  const falseRed = cohort.filter(id => measured[id].ratio < spec.threshold);
  ok(`CAL-A no false red: every one of Cam's ${code} originals passes, so the anchor is not flagging healthy art`,
    falseRed.length === 0,
    falseRed.length ? `flagged: ${falseRed.map(i => `${i} ${measured[i].ratio.toFixed(2)}`).join(', ')}`
      : `cohort floor ${Math.min(...cohort.map(i => measured[i].ratio)).toFixed(2)} >= ${spec.threshold}`);

  const blind = Object.keys(measured).filter(id => measured[id].probe >= spec.threshold);
  ok(`CAL-B not blind: shifting any ${code} item ${PROBE}px in any cardinal direction would FAIL it`,
    blind.length === 0,
    blind.length ? `would still pass shifted: ${blind.map(i => `${i} ${measured[i].probe.toFixed(2)}`).join(', ')}`
      : `worst shifted score ${Math.max(...Object.values(measured).map(v => v.probe)).toFixed(2)} < ${spec.threshold}`);

  for (const id of Object.keys(measured)) {
    const { ratio, best, at0, probe } = measured[id];
    const sat = Math.abs(best.dx) === SEARCH || Math.abs(best.dy) === SEARCH;
    ok(`FIT ${id}${isBatch(code, id) ? ' (SOL batch)' : ''} sits on the ${spec.anchor} it is drawn for`, ratio >= spec.threshold,
      `ratio ${ratio.toFixed(2)} (overlap ${at0} of a best ${best.n}), a ${PROBE}px slip would score ${probe.toFixed(2)}`
      + (ratio >= spec.threshold ? '' : `; wants dx ${best.dx > 0 ? '+' : ''}${best.dx} dy ${best.dy > 0 ? '+' : ''}${best.dy}`)
      + (sat ? ` [SATURATED: its best is at the edge of the +-${SEARCH}px window, so this offset is a FLOOR on how far off it is, not the true offset]` : ''));
  }
}

console.log('\n=== SLOTS WITH NO ANCHOR. Printed every run: not covered is not the same as clean. ===');
for (const [code, why] of Object.entries(NOT_COVERED)) {
  const label = (BH_SLOTS.find(s => s.code === code) || {}).label || code;
  const n = fs.existsSync(slotDir(code)) ? idsIn(code).filter(id => isBatch(code, id)).length : 0;
  console.log(`      ${code.padEnd(3)} ${label.padEnd(11)} NOT COVERED${n ? `, and it holds ${n} unguarded SOL batch item(s)` : ''}\n            ${why}`);
}

console.log(`\n=== LIMITS, printed every run so they are never quietly dropped ===
      1. ONE SKULL, now with evidence rather than a shrug. The masks are built
         from ${DEFAULT_SKULL} only. The AGREEMENT check above measures every other
         skull and passes only while they all draw the anatomy in the same
         pixels; skulls that draw it differently are excluded BY NAME above,
         and art is not validated against those.
      2. A BOUNDED WINDOW. The search is +-${SEARCH}px (it was +-8; widening it lowered
         four of Cam's grillz from 1.00 to 0.93 by finding better alignments the
         old window could not see, so the numbers got stricter, not looser). An
         item whose best is at the window edge is marked SATURATED above: its
         reported offset is a FLOOR, not its true offset, so a very wrong item
         and a moderately wrong one can report the same number.
      3. ${batchTotal - batchCovered} of the ${batchTotal} SOL batch items are in slots with no anchor. They
         are NOT measured by this audit and must not be read as clean.`);

console.log(`\n${fails.length ? `FAILED: ${fails.join(' | ')}` : `every covered slot registers on its anatomy (${batchCovered} of ${batchTotal} SOL batch items covered)`}`);
process.exit(fails.length ? 1 : 0);
