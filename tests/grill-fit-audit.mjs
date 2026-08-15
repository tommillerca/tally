/* A GRILL MUST LAND ON THE TEETH IT IS DRAWN FOR.
 *
 * Brock, with screenshots, 2026-08-14: "the new mouth items are slightly off to
 * the left." Measured, and he is right about the mouth even though the offending
 * slot is Grillz rather than Chew. The three grillz that arrived in v335 come
 * from the SOL asset set, which was registered onto Tally's canvas by matching
 * the two SKULLS' BOUNDING BOXES (v335: "1217x1280 at (377,241) against 193x199
 * at (197,66)"). That is exactly the mistake the figure contract names: two
 * differently-drawn skulls with aligned boxes do not have their MOUTHS in the
 * same place, so the caps landed low and left of the teeth.
 *
 * Measured on the shipped art, overlap between each grill's alpha and SK0-1's
 * teeth, at its own canvas position vs its best position within +-8px:
 *      14 of 15 of Cam's originals   ratio 0.99 - 1.00   (already registered)
 *      GS1 Drip Grill                ratio 0.46          (20px low)
 *      GS2 Stud Braces               ratio 0.53          (4px left, 3px low)
 *      GS3 Ice Tooth                 ratio 0.61          (12px low)
 * The threshold below comes from that measurement, not from a number picked to
 * make the run green: originals cluster at >=0.99, the defects at <=0.61.
 *
 * DIRECTION AND BOUND (anti-regression rule 11). Failure is the ratio going
 * DOWN: art that sits at less than THRESHOLD of its own best registration is
 * misplaced. It is a ceiling on error, not a trend, so it cannot pass by
 * drifting. An empty item list or an empty teeth mask is a FAILURE, never a pass
 * (rule 3).
 *
 * PROVE-RED: `git stash` the three shifted PNGs (or shift any grill by 6px) and
 * this goes red naming the item and the offset it wants.
 *
 * Usage: node tests/grill-fit-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const THRESHOLD = 0.85;   // originals >=0.99, the three defects <=0.61
const SEARCH = 8;         // +-px; wider than any acceptable error, narrower than a tooth pitch

/* Cam's G12 is a knocked-out tooth: dark ink that REPLACES a tooth rather than a
   cap that sits on one, so a teeth-overlap ratio is meaningless for it (it
   measures 0.57 while rendering exactly as intended). Named, with the reason,
   rather than silently skipped, and printed on every run so it cannot rot. */
const NOT_A_CAP = { G12: 'knocked-out tooth: dark ink replacing a tooth, not a cap on one' };

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

/* The teeth of the default skull, as INK rather than as a box (figure contract
   rule 3): the cream pixels inside the jaw region, located on a gridded render
   of SK0-1 at x 305-392, y 195-250. */
function teethMask() {
  const { w, data } = readPng(path.join(ROOT, 'assets/bh/SK/SK0-1.png'));
  const m = new Uint8Array(w * w);
  let n = 0;
  for (let y = 195; y < 250; y++) {
    for (let x = 305; x < 392; x++) {
      const i = (y * w + x) * 4;
      if (data[i] > 210 && data[i + 1] > 200 && data[i + 2] > 170 && data[i + 3] > 200) { m[y * w + x] = 1; n++; }
    }
  }
  return { m, w, n };
}

const alpha = file => {
  const { w, h, data } = readPng(file);
  const a = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = data[i * 4 + 3] > 16 ? 1 : 0;
  return { a, w, h };
};

const overlap = (a, w, h, m, dx, dy) => {
  let n = 0;
  for (let y = Math.max(0, -dy); y < Math.min(h, h - dy); y++) {
    for (let x = Math.max(0, -dx); x < Math.min(w, w - dx); x++) {
      if (a[y * w + x] && m[(y + dy) * w + (x + dx)]) n++;
    }
  }
  return n;
};

const fails = [];
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) fails.push(name);
};

const teeth = teethMask();
ok('SAMPLE the teeth mask found ink on SK0-1 (an empty mask is a FAILURE, not a pass)',
  teeth.n > 100, `${teeth.n} teeth px`);

const dir = path.join(ROOT, 'assets/bh/G');
const ids = fs.readdirSync(dir).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)).sort();
ok('SAMPLE the Grillz slot has art to check (an empty slot is a FAILURE, not a pass)',
  ids.length > 0, `${ids.length} items`);

for (const id of ids) {
  if (NOT_A_CAP[id]) { console.log(`SKIP  ${id} not a cap: ${NOT_A_CAP[id]}`); continue; }
  const { a, w, h } = alpha(path.join(dir, `${id}.png`));
  const at0 = overlap(a, w, h, teeth.m, 0, 0);
  let best = { n: 0, dx: 0, dy: 0 };
  for (let dy = -SEARCH; dy <= SEARCH; dy++) {
    for (let dx = -SEARCH; dx <= SEARCH; dx++) {
      const n = overlap(a, w, h, teeth.m, dx, dy);
      if (n > best.n) best = { n, dx, dy };
    }
  }
  const ratio = best.n ? at0 / best.n : 0;
  ok(`FIT ${id} sits on the teeth it is drawn for`, ratio >= THRESHOLD,
    `ratio ${ratio.toFixed(2)} (overlap ${at0} of a best ${best.n})` +
    // "at least": the search is bounded at +-SEARCH so it cannot slide a cap onto
    // the neighbouring tooth, which means a badly placed item reports the edge of
    // the window rather than its true offset. Re-measure with a wider window once
    // it is inside this one.
    (ratio >= THRESHOLD ? '' : `; wants at least dx ${best.dx > 0 ? '+' : ''}${best.dx} dy ${best.dy > 0 ? '+' : ''}${best.dy}`));
}

console.log(`\n${fails.length ? `FAILED: ${fails.join(', ')}` : `every grill registers on the teeth (${ids.length} items, threshold ${THRESHOLD})`}`);
process.exit(fails.length ? 1 : 0);
