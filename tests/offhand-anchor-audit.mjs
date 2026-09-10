/* tests/offhand-anchor-audit.mjs
 *
 * THE BUG THIS EXISTS FOR: the off-hand shovel and toothbrush did not sit in the
 * hand, and two attempts to fix it (v536 and v544) each made it WORSE, because
 * every measurement scored ITEM INK NEAR THE HAND. These items are drawn with an
 * INTENTIONAL GAP in the handle: two disconnected alpha components, and the hand
 * is meant to appear IN THAT GAP. Maximising ink near the hand is the opposite of
 * the target, so each round pushed the art further away. Tom, five times:
 * "the offhand is STILL NOT FIXED".
 *
 * WHAT THIS MEASURES: the midpoint of the gap between an item's two largest
 * components, against the hand. Source space is valid here and a browser is not
 * needed: every avatar layer is a 640x640 canvas painted into one identical box
 * with one object-fit, so the same affine applies to body and item alike and
 * RELATIVE registration survives to the screen unchanged.
 *
 * WHY A LOCK AND NOT A RULE. 54 of 62 held items have two components, but for
 * some of them those components are not a grip at all (IL9's pole and cloth), so
 * requiring every item to sit on the anchor would invent verdicts about art
 * nobody has looked at. This pins the items whose registration has been VERIFIED
 * IN THE RENDER, and it exists to stop them drifting again.
 *
 * Measured 2026-09-10. Hand proxy = centroid of B0-1 alpha>30 in [420,210,515,310)
 * = (459.3, 263.8). All 32 bodies agree on it to within 0.34px, so one anchor is
 * correct for the whole body set.
 *
 * NOT PINNED, AND WORTH A LOOK (measured, not judged): IL9 sits at +47.7,+86.7,
 * IL5 at +44.7, IL8-1 at -10.8, IL14 at -21.3 in y. IL9 is the "flag" Tom named
 * alongside the shovel and brush. None are pinned here because none have been
 * checked in the render yet.
 *
 * Usage: node tests/offhand-anchor-audit.mjs
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { missingDependency, requirePythonPackages } from './lib/audit-dependencies.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* A SETUP FAILURE MUST NOT WEAR A FINDING'S EXIT CODE, same reasoning as
   facegate-audit: resolve python the shared way and exit distinctly when it or
   its packages are absent, so a reader of the gate can tell "this never ran"
   from "this found something". */
if (process.env.PYTHON && !existsSync(process.env.PYTHON)) {
  missingDependency(`Python at ${process.env.PYTHON}`, 'Fix the PYTHON path or unset PYTHON to autodetect; install packages with python3 -m pip install Pillow numpy scipy.');
}
const pyCandidates = [process.env.PYTHON, `${process.env.HOME}/miniconda3/bin/python3`,
  '/usr/bin/python3', '/usr/local/bin/python3', '/usr/bin/python'];
const PY = pyCandidates.find(p => p && existsSync(p));
if (!PY) {
  missingDependency('Python 3', 'Install Python 3, set PYTHON to its executable, and run python3 -m pip install Pillow numpy scipy.');
}
requirePythonPackages(PY, { PIL: 'Pillow', numpy: 'numpy', scipy: 'scipy' });

/* Verified in the real app renderer at 430x932 on 2026-09-10: fingers wrapped
   around the handle in the gap, face unobstructed. Tolerance is 4px, which is
   wider than the 3.5px spread across the five independently drawn items that
   were already correct, and far tighter than the 24 to 86px the v544 art drifted. */
const TOL = 4.0;
const PINNED = {
  'IL7-1': [17.7, -6.3], 'IL7-2': [17.7, -6.8], 'IL7-3': [18.2, -6.8],
  'IL16-1': [16.2, -7.8], 'IL16-2': [16.2, -7.8], 'IL16-3': [16.7, -8.3],
  'IL17-1': [17.7, -7.3], 'IL17-2': [17.7, -7.3],
  'IL10-1': [16.2, -6.3], 'IL10-2': [18.2, -8.3],
};

const script = `
import sys, json
import numpy as np
from PIL import Image
from scipy.ndimage import label
root = sys.argv[1]
B = np.array(Image.open(root + '/assets/bh/B/B0-1.png').convert('RGBA'))[:,:,3] > 30
yy, xx = np.nonzero(B[210:310, 420:515])
fx, fy = xx.mean() + 420, yy.mean() + 210
out = {'hand': [round(float(fx), 3), round(float(fy), 3)], 'items': {}}
for name in sys.argv[2:]:
    a = np.array(Image.open(root + '/assets/bh/IL/' + name + '.png').convert('RGBA'))[:,:,3] > 30
    lab, n = label(a, structure=np.ones((3, 3)))
    comps = []
    for i in range(1, n + 1):
        m = lab == i
        if m.sum() < 50: continue
        ys, xs = np.nonzero(m); comps.append((int(m.sum()), xs, ys))
    comps.sort(key=lambda c: -c[0])
    if len(comps) < 2:
        out['items'][name] = {'err': 'fewer than two components, so there is no grip gap to measure'}
        continue
    A = np.stack([comps[0][1], comps[0][2]], 1).astype(float)
    C = np.stack([comps[1][1], comps[1][2]], 1).astype(float)
    d = ((A[:, None] - C[None]) ** 2).sum(-1)
    i, j = np.unravel_index(d.argmin(), d.shape)
    p, q = A[i], C[j]
    out['items'][name] = {'dx': round(float((p[0] + q[0]) / 2 - fx), 3),
                          'dy': round(float((p[1] + q[1]) / 2 - fy), 3)}
print(json.dumps(out))
`;

const names = Object.keys(PINNED).filter(n => existsSync(join(ROOT, 'assets', 'bh', 'IL', `${n}.png`)));
if (names.length !== Object.keys(PINNED).length) {
  console.log(`FAIL  SETUP ${Object.keys(PINNED).length - names.length} pinned item(s) are missing from assets/bh/IL`);
  process.exit(1);
}
const res = JSON.parse(execFileSync(PY, ['-c', script, ROOT, ...names], { maxBuffer: 1 << 24 }).toString());
console.log(`hand ${JSON.stringify(res.hand)}, ${names.length} pinned held items, tolerance ${TOL}px\n`);

let failed = 0;
for (const [name, [wx, wy]] of Object.entries(PINNED)) {
  const v = res.items[name];
  if (v.err) { console.log(`FAIL  ${name}: ${v.err}`); failed++; continue; }
  const ex = Math.abs(v.dx - wx), ey = Math.abs(v.dy - wy);
  if (ex > TOL || ey > TOL) {
    console.log(`FAIL  ${name} grip gap moved to ${v.dx.toFixed(1)},${v.dy.toFixed(1)} from ${wx},${wy} (off by ${ex.toFixed(1)},${ey.toFixed(1)}, limit ${TOL})`);
    failed++;
  } else {
    console.log(`PASS  ${name} grip gap ${v.dx.toFixed(1)},${v.dy.toFixed(1)}`);
  }
}
/* A pin that matches whatever it is given is not a pin. */
const drifted = { ...res.items['IL17-1'] };
if (!(Math.abs(drifted.dx + 24 - PINNED['IL17-1'][0]) > TOL)) {
  console.log('FAIL  CONTROL the v544 drift of +24px would still PASS this tolerance, so it guards nothing');
  process.exit(1);
}
console.log(`\nPASS  CONTROL the v544 drift (+24,+32 on spades, +22,+86 on brushes) exceeds the ${TOL}px tolerance`);
console.log(failed ? `\noffhand-anchor: ${failed} FAILED` : '\noffhand-anchor clean');
process.exit(failed ? 1 : 0);
