/* tests/facegate-audit.mjs
 *
 * THE BUG: `IL9` (a raised banner, "Everyday Off-hand #20") covered 73.5% of the
 * skull's face. Any player who equipped it lost their head behind it, in the live
 * app. It shipped because nothing ever measured a held item against the face.
 *
 * WHY A NODE AUDIT AND NOT A BROWSER ONE: this is a property of the ART, not of
 * any screen. The same PNG is composited on 17 surfaces, so checking one screen
 * would prove nothing about the other 16. Measure the source asset once.
 *
 * THE FACE ZONE is derived from SK0-1's own alpha, never hardcoded: the upper 55%
 * of the skull's ink bounding box, which is where the eye sockets, nose notch and
 * teeth live. If Cam ever redraws the skull the zone moves with it.
 *
 * DIRECTION AND BOUND, not a trend (anti-regression rule 11): failure is a HELD
 * item covering more than THRESHOLD of the face's ink. Headwear is exempt on
 * purpose, since a mask or a visor is meant to be on the face.
 *
 * Usage: node tests/facegate-audit.mjs
 */
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BH = join(ROOT, 'assets', 'bh');

/* Held slots only. H (headwear), E (eyes), G (grillz), HS (head slot) are all
   MEANT to sit on the face and are excluded by design, not by oversight. */
const HELD_SLOTS = ['IL', 'IR'];
const THRESHOLD = 2.0;   // percent of face ink a held item may cover

/* A SETUP FAILURE MUST NOT WEAR A FINDING'S EXIT CODE. This resolved python as
   $HOME/miniconda3/bin/python3 and nothing else, so it ran on exactly one
   machine, and when that path was absent it exited 1, the same code line 92
   uses for a real held-item violation. A reader of the gate cannot tell those
   apart, which is how an audit stops being evidence: it looks like it has an
   opinion when it never ran. Same defect figure-audit had with Pillow.
   So: try the explicit override, then that conda path so nobody's setup breaks,
   then the interpreter on PATH. And check the LIBRARIES, not just the binary,
   because a python without PIL or numpy fails later inside the script with a
   traceback that reads like an art problem. Every setup failure exits 2, a code
   no held-item bug can produce. Exit 1 still means findings. */
const pyCandidates = [process.env.PYTHON, `${process.env.HOME}/miniconda3/bin/python3`,
  '/usr/bin/python3', '/usr/local/bin/python3', '/usr/bin/python'];
/* An explicit PYTHON that does not exist is a typo, not a hint. Falling through
   to some other interpreter would run the audit against a python the operator
   did not choose and never mention it. */
if (process.env.PYTHON && !existsSync(process.env.PYTHON)) {
  console.log(`SETUP  PYTHON is set to ${process.env.PYTHON}, which does not exist.`);
  console.log('  This audit CHECKED NOTHING. Fix the path or unset PYTHON to autodetect.');
  process.exit(2);
}
const PY = pyCandidates.find(p => p && existsSync(p));
if (!PY) {
  console.log(`SETUP  no python found; tried ${pyCandidates.filter(Boolean).join(', ')}`);
  console.log('  This audit CHECKED NOTHING. Set PYTHON= to a python with PIL and numpy.');
  process.exit(2);
}
const depProbe = spawnSync(PY, ['-c', 'import PIL, numpy'], { encoding: 'utf8' });
if (depProbe.status !== 0) {
  console.log(`SETUP  ${PY} cannot import PIL and numpy, which this audit measures with.`);
  console.log(`  This audit CHECKED NOTHING. ${(depProbe.stderr || '').trim().split('\n').pop()}`);
  process.exit(2);
}

const slots = HELD_SLOTS.filter(s => existsSync(join(BH, s)));
const files = slots.flatMap(s =>
  readdirSync(join(BH, s)).filter(f => f.endsWith('.png')).map(f => join(BH, s, f)));

if (!files.length) {
  console.log('FAIL  EMPTY SAMPLE: no held-item art found, the audit did not run');
  process.exit(1);
}

const script = `
import sys, json
import numpy as np
from PIL import Image
sk = np.array(Image.open(sys.argv[1]).convert('RGBA'))[...,3] > 40
ys, xs = np.where(sk)
y0, y1 = ys.min(), ys.min() + int((ys.max() - ys.min()) * 0.55)
x0, x1 = xs.min(), xs.max()
face = np.zeros_like(sk); face[y0:y1, x0:x1] = True
face_ink = int((sk & face).sum())
out = {'zone': [int(x0), int(y0), int(x1), int(y1)], 'faceInk': face_ink, 'items': {}}
for p in sys.argv[2:]:
    a = np.array(Image.open(p).convert('RGBA'))[...,3] > 40
    if a.shape != sk.shape:
        out['items'][p] = {'err': f'canvas {a.shape} != skull {sk.shape}'}
        continue
    out['items'][p] = {'pct': round(100 * float((a & sk & face).sum()) / face_ink, 2)}
print(json.dumps(out))
`;

const res = JSON.parse(execFileSync(PY, ['-c', script, join(BH, 'SK', 'SK0-1.png'), ...files],
  { maxBuffer: 1 << 24 }).toString());

console.log(`face zone ${JSON.stringify(res.zone)}, ${res.faceInk} ink px, ${files.length} held items\n`);

const bad = [], errs = [];
for (const [p, v] of Object.entries(res.items)) {
  const name = p.split('/').slice(-2).join('/');
  if (v.err) { errs.push(`${name}: ${v.err}`); continue; }
  if (v.pct > THRESHOLD) bad.push({ name, pct: v.pct });
}
bad.sort((a, b) => b.pct - a.pct);

for (const e of errs) console.log(`FAIL  ${e}`);
for (const b of bad) console.log(`FAIL  ${b.name} covers ${b.pct}% of the face (limit ${THRESHOLD}%)`);

const worst = Math.max(0, ...Object.values(res.items).filter(v => !v.err).map(v => v.pct));
if (!bad.length && !errs.length) {
  console.log(`PASS  every held item clears the face. Worst is ${worst}% of a ${THRESHOLD}% limit.`);
  console.log('\nfacegate clean');
  process.exit(0);
}
console.log(`\n${bad.length + errs.length} of ${files.length} held items fail`);
process.exit(1);
