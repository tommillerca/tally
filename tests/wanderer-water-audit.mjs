/* THE WANDERER IS BOUND TO LAND, and the answer is the same on every device.
 *
 * Tom, 2026-08-22: "The wanderer is out in the lake where I am right now. He
 * shouldn't be. He's bound to land." wandererAt was pure math on a lat/lng grid
 * with zero land awareness. The fix hands it js/water.js's classifier (the
 * basemap's own z14 vector tiles, point-in-polygon against the `water` layer)
 * and a seeded fallback of beat centres; this suite grades both halves:
 *
 *   CONTROL-*    the classifier is not blind, in BOTH directions: a point in
 *                the middle of Lake Ontario reads water, inland Toronto reads
 *                land. A zero-violations row beside a blind classifier grades
 *                nothing, which is why these come first.
 *   SAMPLE       the scan really holds the bug: across the Toronto shoreline
 *                cells the LEGACY derivation (no oracle) walks over water in at
 *                least 3 (cell, instance) pairs. An empty sample is a FAILURE.
 *   LAND         with the oracle, every wanderer handed to the map keeps his
 *                ENTIRE lap on land: 180 sampled minutes per lap, zero water
 *                positions, across every scanned pair. And at least one pair
 *                that was water under legacy now stands on land, so the row
 *                cannot be satisfied by hiding everyone.
 *   HIDDEN       a cell in open water has NO wanderer that lap (null at every
 *                sampled minute), with its own control that legacy DID put him
 *                on the water there, so the null is hiding a real bug and not
 *                a broken derivation.
 *   UNDECIDED    an oracle that cannot answer yet (tiles loading) hides him
 *                rather than showing him somewhere wrong.
 *   PURE         same (date, cell, clock, oracle) asked twice is the same man.
 *   DETERMINISM  two child processes, each a fresh module instance with fresh
 *                tile fetches, classify a fixed grid and derive the same
 *                wanderers byte-for-byte. This is the row the whole design
 *                exists for: two friends must see one man.
 *
 * PROVEN RED 2026-08-22 in a throwaway `cp -R` tree (no .git) with
 * js/wanderer.js reverted to f18d479f (pre-fix), exit code read from a FILE:
 * SAMPLE stays green (the scan still holds the bug), LAND goes red with real
 * water positions, HIDDEN goes red with him standing in open lake. Unmutated:
 * all rows green.
 *
 * NEEDS THE TILE HOST. Same contract as tests/boneyard-audit.mjs: no route to
 * tiles.openfreemap.org means every row would grade a blind oracle, so the
 * suite reports UNPROVEN with exit 97 instead of green.
 *
 *   node tests/wanderer-water-audit.mjs
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as W from '../js/wanderer.js';
import { isWater, ensureWater } from '../js/water.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATE = '2026-08-22';   // seeds are date-keyed; pinned so runs are comparable
let fails = 0;
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  | ' + d : ''}`); if (!p) fails = 1; };

// ---- capability: no tile host, no verdict -------------------------------
try {
  const r = await fetch('https://tiles.openfreemap.org/planet');
  if (!r.ok) throw new Error(String(r.status));
} catch (e) {
  console.log(`UNPROVEN  no route to the vector tile host (${e.message}); every row would grade a blind oracle`);
  process.exit(97);
}

// ---- the ground: Toronto's Lake Ontario shoreline -----------------------
// cx 2180..2182 spans lat 43.59..43.65 (islands, harbour, waterfront);
// cy -3972..-3964 spans lng -79.45..-79.27. Mixed land/water on purpose.
const CELLS = [];
for (let cx = 2180; cx <= 2182; cx++) for (let cy = -3972; cy <= -3964; cy++) CELLS.push([cx, cy]);
const MID_LAKE = [2175, -3950];   // 43.50, -79.00: open water, ~15 km offshore
const INSTS = [0, 1, 2, 3];

// prefetch every tile any sample can touch: cell bbox + 600 m margin, grid
// step under a z14 tile's own span so no intersecting tile is missed
async function prefetchCell(cx, cy) {
  const pts = [];
  const la0 = (cx - 0.5) * W.WANDER_CELL_DEG - 0.006, la1 = (cx + 0.5) * W.WANDER_CELL_DEG + 0.006;
  const ln0 = (cy - 0.5) * W.WANDER_CELL_DEG - 0.008, ln1 = (cy + 0.5) * W.WANDER_CELL_DEG + 0.008;
  for (let la = la0; la <= la1; la += 0.007) for (let ln = ln0; ln <= ln1; ln += 0.01) pts.push([la, ln]);
  return ensureWater(pts, 60000);
}
let fetched = true;
for (const [cx, cy] of [...CELLS, MID_LAKE]) fetched = (await prefetchCell(cx, cy)) && fetched;
ok('SETUP every tile the scan needs arrived (an unanswered oracle grades nothing)', fetched);

// ---- the classifier is not blind, in both directions --------------------
ok('CONTROL-WATER a point in the middle of Lake Ontario classifies as water',
  isWater(43.75, -78.00) === true);
ok('CONTROL-LAND inland Toronto classifies as land',
  isWater(43.7100, -79.4000) === false);

// ---- scan: where did the LEGACY derivation put him? ---------------------
const lapMinutes = inst => {
  const out = [];
  for (let m = inst * W.WANDER_LAP_MIN; m < (inst + 1) * W.WANDER_LAP_MIN; m += 0.25) out.push(m);
  return out;
};
const pairs = [];
for (const [cx, cy] of CELLS) {
  for (const inst of INSTS) {
    const mins = lapMinutes(inst);
    let legacyWater = 0, unknown = 0;
    for (const m of mins) {
      const w = W.wandererAt(cx, cy, DATE, m);   // no oracle: the shipped bug
      const v = isWater(w.lat, w.lng);
      if (v === undefined) unknown++;
      else if (v) legacyWater++;
    }
    pairs.push({ cx, cy, inst, legacyWater, unknown, samples: mins.length });
  }
}
const unknownTotal = pairs.reduce((a, p) => a + p.unknown, 0);
ok('SETUP every legacy position could be classified', unknownTotal === 0, `${unknownTotal} unknown`);
const wet = pairs.filter(p => p.legacyWater > 0);
ok('SAMPLE the scan really holds the bug: legacy walks him over water',
  wet.length >= 3,
  `${wet.length} of ${pairs.length} (cell, instance) pairs put some of his lap on water; worst ${Math.max(0, ...wet.map(p => p.legacyWater))}/${pairs[0].samples} sampled minutes wet`);

// ---- the fix: every shown wanderer keeps his whole lap on land ----------
let violations = 0, shown = 0, hidden = 0, relocated = 0, undecided = 0;
for (const p of pairs) {
  const mins = lapMinutes(p.inst);
  let anyNull = false, anyWater = 0;
  for (const m of mins) {
    const w = W.wandererAt(p.cx, p.cy, DATE, m, isWater);
    if (!w) { anyNull = true; continue; }
    const v = isWater(w.lat, w.lng);
    if (v === undefined) undecided++;
    else if (v) anyWater++;
  }
  violations += anyWater;
  if (anyNull) hidden++; else shown++;
  if (!anyNull && p.legacyWater > 0) relocated++;
}
ok('LAND no shown wanderer ever stands on water, across every sampled minute of every lap',
  violations === 0 && undecided === 0,
  `${violations} water positions, ${undecided} unclassifiable, across ${pairs.length} laps (${shown} shown, ${hidden} hidden)`);
ok('LAND-RELOCATED the fallback finds land rather than hiding everyone: a legacy-wet lap now stands dry',
  relocated >= 1, `${relocated} of ${wet.length} legacy-wet laps relocated onto land`);

// ---- open water: no wanderer at all, and that null hides a real bug -----
{
  const [cx, cy] = MID_LAKE;
  const mins = lapMinutes(0);
  const legacyWet = mins.every(m => { const w = W.wandererAt(cx, cy, DATE, m); return isWater(w.lat, w.lng) === true; });
  const allNull = mins.every(m => W.wandererAt(cx, cy, DATE, m, isWater) === null);
  ok('CONTROL-HIDDEN legacy really stranded him in open water there (else the null proves nothing)', legacyWet);
  ok('HIDDEN a cell in open water has no wanderer that lap', allNull);
}

// ---- an oracle that cannot answer yet hides him -------------------------
ok('UNDECIDED tiles still loading means hidden, never shown-and-wrong',
  W.wandererAt(2181, -3968, '1999-01-01', 10, () => undefined) === null);

// ---- purity survives the constraint -------------------------------------
{
  const a = W.wandererAt(2181, -3968, DATE, 12.5, isWater);
  const b = W.wandererAt(2181, -3968, DATE, 12.5, isWater);
  ok('PURE same (date, cell, clock, oracle) twice is the same man',
    JSON.stringify(a) === JSON.stringify(b));
}

// ---- two devices, one man -----------------------------------------------
/* Each child is a FRESH process importing a FRESH js/water.js, so its tiles
   come off the network again: two independent oracle builds. They derive the
   same graded pairs and classify the same fixed grid; outputs must be
   byte-identical. Exit codes come from spawnSync status, not a shell pipe. */
const CHILD = `
import * as W from '${ROOT.replace(/\\/g, '/')}/js/wanderer.js';
import { isWater, ensureWater } from '${ROOT.replace(/\\/g, '/')}/js/water.js';
const pts = [];
for (let la = 43.606; la <= 43.634; la += 0.007)
  for (let ln = -79.376; ln <= -79.284; ln += 0.01) pts.push([la, ln]);
await ensureWater(pts, 60000);
const grid = pts.map(([la, ln]) => isWater(la, ln) ? 1 : 0).join('');
const out = [];
for (const cy of [-3968, -3967, -3966, -3965]) {
  for (const inst of [0, 1]) {
    for (const m of [inst * 45 + 3, inst * 45 + 21, inst * 45 + 39]) {
      await ensureWater([[43.62, cy * 0.02]], 60000);
      let w = W.wandererAt(2181, cy, '${DATE}', m, isWater);
      for (let t = 0; t < 400 && w === null; t++) {   // null may mean tiles pending
        await new Promise(r => setTimeout(r, 100));
        w = W.wandererAt(2181, cy, '${DATE}', m, isWater);
        if (w === null && t === 399) break;
      }
      out.push(w ? [w.lat.toFixed(12), w.lng.toFixed(12), w.heading.toFixed(9)].join(',') : 'none');
    }
  }
}
console.log(JSON.stringify({ grid, out }));
`;
const kids = [0, 1].map(() => spawnSync(process.execPath, ['--input-type=module', '-e', CHILD], { encoding: 'utf8', timeout: 180000 }));
ok('SETUP both determinism children ran', kids.every(k => k.status === 0),
  kids.map(k => `status=${k.status}${k.status ? ' ' + (k.stderr || '').slice(0, 120) : ''}`).join('  '));
const outs = kids.map(k => (k.stdout || '').trim());
ok('DETERMINISM two fresh oracle builds derive the same man everywhere',
  outs[0].length > 0 && outs[0] === outs[1],
  outs[0] === outs[1] ? `${outs[0].length} bytes, identical` : `child outputs differ`);
ok('CONTROL-DETERMINISM the children graded a real sample (an empty one is a FAILURE)',
  (() => { try { const j = JSON.parse(outs[0]); return j.grid.includes('1') && j.grid.includes('0') && j.out.length === 24 && j.out.some(o => o !== 'none'); } catch { return false; } })(),
  'grid holds both classes and wanderers were derived');

console.log(fails ? '\nWANDERER WATER AUDIT FAILED' : '\nWANDERER WATER AUDIT VERIFIED');
process.exit(fails);
