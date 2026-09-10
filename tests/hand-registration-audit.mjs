/* SOURCE-ONLY DIAGNOSTIC, retained during the v536 revert (2026-09-09).
 * A source composite is not evidence of rendered registration. This scores
 * 640x640 master PNG ink against B0-1 in source coordinates, not the shipping
 * avatar renderer. It cannot prove on-body alignment or a correct grip.
 * The original floor, controls, census and failure exit are unchanged.
 * This is a diagnostic only, skipped by the release gate. Its historical
 * thresholds neither accept nor reject the operator-selected Round 4 offsets.
 * Rendered alignment evidence comes from the operator's shipping-avatar
 * comparisons, not this source score. A rendered-pixel guard remains owed.
 * Ink is alpha > 30; boxes are half-open; dilation is Manhattan distance.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SIZE = 640;
const MIN_RING = 150;
const passes = ring => ring >= MIN_RING;
function readPng(file) {
  const buf = fs.readFileSync(file);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const depth = buf[24], color = buf[25], interlace = buf[28];
  if (depth !== 8 || color !== 6 || interlace !== 0) {
    throw new Error(`${file}: expected 8-bit RGBA non-interlaced, got depth ${depth} color ${color} interlace ${interlace}`);
  }
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG signature');
  assert.equal(w, SIZE, `${file}: width`);
  assert.equal(h, SIZE, `${file}: height`);
  const chunks = [];
  for (let p = 8; p + 8 <= buf.length;) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    if (type === 'IDAT') chunks.push(buf.subarray(p + 8, p + 8 + len));
    p += len + 12;
    if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  assert.equal(raw.length, h * (w * 4 + 1), `${file}: decoded size`);
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

// Two exact distance-transform sweeps, with no obstacles or diagonal steps.
function distances(core) {
  const d = Int16Array.from(core, v => v ? 0 : 32000);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = y * SIZE + x;
    if (x) d[i] = Math.min(d[i], d[i - 1] + 1);
    if (y) d[i] = Math.min(d[i], d[i - SIZE] + 1);
  }
  for (let y = SIZE - 1; y >= 0; y--) for (let x = SIZE - 1; x >= 0; x--) {
    const i = y * SIZE + x;
    if (x < SIZE - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
    if (y < SIZE - 1) d[i] = Math.min(d[i], d[i + SIZE] + 1);
  }
  return d;
}
const probe = new Uint8Array(SIZE * SIZE);
probe[320 * SIZE + 320] = 1;
const control = distances(probe);
assert.equal(control[322 * SIZE + 322], 4, 'CONTROL dilation is Manhattan, not square or Euclidean');
assert.equal(Array.from(control).filter(d => d <= 14 && d > 2).length, 408, 'CONTROL ring area');
assert.equal(passes(149), false, 'CONTROL below floor rejected');
assert.equal(passes(150), true, 'CONTROL floor accepted');
console.log('SOURCE-ONLY: not evidence of rendered registration; historical assertions retained.');
console.log('PASS CONTROL Manhattan dilation and ring boundary 149 FAIL / 150 PASS');

const body = readPng(path.join(ROOT, 'assets/bh/B/B0-1.png'));
const slots = [
  { slot: 'IL', box: [438, 228, 502, 292], coreSize: 3584, count: 38 },
  // Lower screen-left fist, selected on B0-1 before scoring IR items.
  { slot: 'IR', box: [136, 384, 200, 448], coreSize: 3776, count: 24 },
];
let failed = 0;
for (const { slot, box, coreSize, count } of slots) {
  const core = new Uint8Array(SIZE * SIZE);
  const [x0, y0, x1, y1] = box;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * SIZE + x;
    core[i] = body.data[i * 4 + 3] > 30 ? 1 : 0;
  }
  assert.equal(core.reduce((a, b) => a + b, 0), coreSize, `${slot} SAMPLE body ink`);
  const d = distances(core);
  const ring = Uint8Array.from(d, v => v > 2 && v <= 14 ? 1 : 0);
  const dir = path.join(ROOT, 'assets/bh', slot);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.equal(files.length, count, `${slot} SAMPLE full inventory; review new art before updating denominator`);
  console.log(`${slot} SAMPLE ${files.length}/${count}, core=${coreSize}, ring=${ring.reduce((a,b) => a+b,0)}, box=[${box}]`);
  let clean = 0;
  for (const file of files) {
    const { data } = readPng(path.join(dir, file));
    let c = 0, r = 0;
    for (let i = 0; i < core.length; i++) if (data[i * 4 + 3] > 30) {
      c += core[i]; r += ring[i];
    }
    const pass = passes(r);
    if (pass) clean++; else failed++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${file.slice(0, -4)} core=${c} ring=${r} floor=${MIN_RING}`);
  }
  console.log(`${slot}: ${clean}/${files.length} pass`);
}
console.log(`source-composite diagnostic (not rendered registration): ${failed} FAILED`);
process.exitCode = failed ? 1 : 0;
