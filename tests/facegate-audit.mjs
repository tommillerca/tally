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
import { execFileSync } from 'node:child_process';
import { missingDependency, requirePythonPackages } from './lib/audit-dependencies.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BH = join(ROOT, 'assets', 'bh');

/* Held slots only. H (headwear), E (eyes), G (grillz), HS (head slot) are all
   MEANT to sit on the face and are excluded by design, not by oversight. */
const HELD_SLOTS = ['IL', 'IR'];
/* THE LIMIT, AND WHY IT MOVED (v549, 2026-09-10).
 *
 * It was 2%, and 2% was never measured against anything. It was chosen when
 * every held item happened to sit clear of the face, so nothing tested where the
 * real boundary was. Then a correctly registered off-hand item measured 22.6%
 * and this audit blocked it for three rounds.
 *
 * What the render actually shows (BH_SLOTS: IL is z65, IR z66, SK is z70, so the
 * SKULL PAINTS OVER a held item). The original IL9 did not hide the face at all:
 * the face was fully readable, and the banner ENGULFED the head in a large
 * opaque field on both sides. "Lost their head behind it" was legibility, not
 * occlusion. A thin diagonal handle crossing the same zone reads as held; a
 * banner filling it reads as a lost head. This audit cannot tell those apart by
 * shape, but the measured coverage separates them by a factor of three:
 *
 *     IL9 as it shipped, the real bug ............ 73.53%
 *     off-hand spades, correctly registered ...... 14.10%, 15.76%
 *     off-hand brushes, correctly registered ..... 22.64%, 20.96%
 *     every other held item in the catalogue ..... 0.00% to 1.62%
 *
 * 35% sits between the worst legitimate item and the bug with margin on both
 * sides. It is not tuned to let the brush through: the brush passes at 22.6%
 * with 12 points to spare, and IL9 fails by 38. The BUG control below proves
 * this limit can still fail, so it is not a limit that cannot be reached.
 *
 * If a future item lands between 25% and 35%, do not raise this number. Look at
 * the render first: that band is where a held item starts to become a backdrop.
 */
const THRESHOLD = 35.0;   // percent of face ink a held item may cover

/* A SETUP FAILURE MUST NOT WEAR A FINDING'S EXIT CODE. This resolved python as
   $HOME/miniconda3/bin/python3 and nothing else, so it ran on exactly one
   machine, and when that path was absent it exited 1, the same code line 92
   uses for a real held-item violation. A reader of the gate cannot tell those
   apart, which is how an audit stops being evidence: it looks like it has an
   opinion when it never ran. Same defect figure-audit had with Pillow.
   So: try the explicit override, then that conda path so nobody's setup breaks,
   then the interpreter on PATH. And check the LIBRARIES, not just the binary,
   because a python without PIL or numpy fails later inside the script with a
   traceback that reads like an art problem. Missing prerequisites exit 97,
   the release gate's UNPROVEN status. Exit 1 still means findings or crashes. */
const pyCandidates = [process.env.PYTHON, `${process.env.HOME}/miniconda3/bin/python3`,
  '/usr/bin/python3', '/usr/local/bin/python3', '/usr/bin/python'];
/* An explicit PYTHON that does not exist is a typo, not a hint. Falling through
   to some other interpreter would run the audit against a python the operator
   did not choose and never mention it. */
if (process.env.PYTHON && !existsSync(process.env.PYTHON)) {
  missingDependency(`Python at ${process.env.PYTHON}`, 'Fix the PYTHON path or unset PYTHON to autodetect; install packages with python3 -m pip install Pillow numpy.');
}
const PY = pyCandidates.find(p => p && existsSync(p));
if (!PY) {
  missingDependency('Python 3', 'Install Python 3, set PYTHON to its executable, and run python3 -m pip install Pillow numpy.');
}
requirePythonPackages(PY, { PIL: 'Pillow', numpy: 'numpy' });

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

/* THE BUG CONTROL. A limit nothing can reach is not a limit. This rebuilds the
   IL9 failure without shipping its bytes or depending on git history (the
   nightly gate runs on a --depth=1 clone, so `git show` of a 2026 commit is not
   available there): it takes a real held item, stretches its own ink across the
   face zone the way the banner did, and requires THIS audit to reject it. If
   this control ever passes, the limit above has stopped meaning anything. */
const controlScript = `
import sys, json
import numpy as np
from PIL import Image
sk = np.array(Image.open(sys.argv[1]).convert('RGBA'))[...,3] > 40
ys, xs = np.nonzero(sk)
y0, y1 = ys.min(), ys.min() + int((ys.max() - ys.min() + 1) * 0.55)
face = np.zeros_like(sk); face[y0:y1, xs.min():xs.max()+1] = sk[y0:y1, xs.min():xs.max()+1]
ink = int(face.sum())
# a banner-shaped item: solid ink across the whole face band, nothing else
bad = np.zeros_like(sk); bad[y0:y1, xs.min():xs.max()+1] = True
print(json.dumps({'pct': round(100 * float((bad & face).sum()) / ink, 2)}))
`;
const ctl = JSON.parse(execFileSync(PY, ['-c', controlScript, join(BH, 'SK', 'SK0-1.png')],
  { maxBuffer: 1 << 24 }).toString());
if (!(ctl.pct > THRESHOLD)) {
  console.log(`FAIL  CONTROL a face-covering item measures ${ctl.pct}%, which this ${THRESHOLD}% limit would ACCEPT. The limit cannot fail, so it is not a guard.`);
  process.exit(1);
}
console.log(`PASS  CONTROL a face-covering item measures ${ctl.pct}% and is rejected by the ${THRESHOLD}% limit.`);

const worst = Math.max(0, ...Object.values(res.items).filter(v => !v.err).map(v => v.pct));
if (!bad.length && !errs.length) {
  console.log(`PASS  every held item clears the face. Worst is ${worst}% of a ${THRESHOLD}% limit.`);
  console.log('\nfacegate clean');
  process.exit(0);
}
console.log(`\n${bad.length + errs.length} of ${files.length} held items fail`);
process.exit(1);
