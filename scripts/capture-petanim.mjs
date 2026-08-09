/* Deterministic capture + seamless-loop proof for the animated pets
 * (docs/pet-recolor-animation-skill.md §3). Seeks the real CSS animations
 * through one full 6s loop and gates on the rendered pixels:
 *
 *   1. every frame has decoded ink (empty sample = failure)
 *   2. frame(0) == frame(6s minus 1ms), pixel-exact: the seamless-loop proof.
 *      NOT frame(6s): an infinite animation wraps currentTime at the period, so
 *      t=L literally re-renders t=0 and that comparison can never fail. 1ms
 *      before the wrap a broken track shows its full mismatch while a correct
 *      one is sub-pixel-identical (proven red on translateY home 5px -> 2px).
 *   3. no ink ever touches the .petanim border (headroom / overflow clipping)
 *
 * Writes frames + a contact strip to the output dir and exits non-zero on any
 * gate failure.
 *
 *   node scripts/capture-petanim.mjs [C3|C1|C4|CX] [outDir]
 */
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PET = process.argv[2] || 'C3';
const OUT = path.resolve(process.argv[3] || path.join(ROOT, `..`, `petanim-capture-${PET}`));
const STEP_MS = 100; // loop length is read from the page (longest animation period)
const PUPPETEER = path.join(ROOT, '..', 'overlay-render-kit', 'node_modules', 'puppeteer');

const { default: puppeteer } = await import(path.join(PUPPETEER, 'lib/cjs/puppeteer/puppeteer.js'))
  .catch(() => import(PUPPETEER));

mkdirSync(OUT, { recursive: true });
// Stale frames from a previous run poison the gates (a leftover f6000.png once
// masked a broken loop seam); start from an empty frame set every time.
for (const f of readdirSync(OUT)) if (/^f\d+\.png$/.test(f)) rmSync(path.join(OUT, f));
const srv = spawn('python3', ['-m', 'http.server', '8179', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));

const browser = await puppeteer.launch({ headless: 'new' });
let LOOP_MS;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:8179/scripts/petanim-stage.html?pet=${PET}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.title === 'READY' || document.title === 'NOT-ANIMATED', { timeout: 10000 });
  if (await page.title() === 'NOT-ANIMATED') throw new Error(`${PET} is not an animated pet`);

  const clip = await page.evaluate(() => {
    const r = document.querySelector('.petanim').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await page.evaluate(() => document.getAnimations().forEach(a => a.pause()));
  // The stage's loop length = its longest animation period (every shorter track
  // divides it, per the playbook's loop math). 6s cloud/lizard, 4.8s catfish.
  LOOP_MS = await page.evaluate(() =>
    Math.max(...document.getAnimations().map(a => Number(a.effect.getTiming().duration) || 0)));
  if (!(LOOP_MS > 0)) throw new Error('no animation periods found on the stage');

  const times = [];
  for (let t = 0; t < LOOP_MS; t += STEP_MS) times.push(t);
  times.push(LOOP_MS - 1); // the seam sample; see gate 2 above
  for (const t of times) {
    await page.evaluate(ms => document.getAnimations().forEach(a => { a.currentTime = ms; }), t);
    await page.screenshot({ path: path.join(OUT, `f${String(t).padStart(4, '0')}.png`), clip, omitBackground: true });
  }
} finally {
  await browser.close();
  srv.kill();
}

// Pixel gates + contact strip (PIL lives in the default miniconda python3).
const gates = spawnSync('python3', ['-c', `
import sys, glob
import numpy as np
from PIL import Image

out = sys.argv[1]; loop = int(sys.argv[2]); step = int(sys.argv[3])
fails = []
def gate(label, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + label + ("  | " + detail if detail else ""))
    if not ok: fails.append(label)

paths = sorted(glob.glob(out + "/f*.png"))
frames = [np.array(Image.open(p).convert("RGBA")) for p in paths]
gate("frame count", len(frames) == loop // step + 1, f"{len(frames)} frames")
ink = [int((f[..., 3] > 8).sum()) for f in frames]
gate("every frame has decoded ink (empty sample = failure)", min(ink) > 3000, f"min {min(ink)} px")
# Compare what RENDERS (premultiplied): the cloud's rain legitimately carries
# alpha-2 pixels 1ms before the wrap (raw channel delta 255, visible delta ~8).
pm = lambda f: f[..., :3].astype(float) * f[..., 3:4].astype(float) / 255.0
d = int((np.abs(pm(frames[0]) - pm(frames[-1])).max(axis=-1) > 16).sum())
gate("frame(0) == frame(loop-1ms): seamless (visible px)", d == 0, f"{d} px differ")
edge = max(int(np.concatenate([f[0,:,3], f[-1,:,3], f[:,0,3], f[:,-1,3]]).max()) for f in frames)
gate("no ink on the stage border in any frame (headroom)", edge <= 8, f"max border alpha {edge}")

gray = np.full_like(frames[0], 128); gray[..., 3] = 255
def over(fg):
    fa = fg[..., 3:4] / 255.0
    o = gray.copy(); o[..., :3] = (fg[..., :3] * fa + gray[..., :3] * (1 - fa)).astype(np.uint8)
    return o
strip = np.concatenate([over(f) for f in frames[::5]], axis=1)
Image.fromarray(strip).save(out + "/strip.png")
print("strip: " + out + "/strip.png")
print(("GATES FAILED: " + ", ".join(fails)) if fails else "PETANIM CAPTURE VERIFIED")
sys.exit(1 if fails else 0)
`, OUT, String(LOOP_MS), String(STEP_MS)], { stdio: 'inherit' });

process.exit(gates.status ?? 1);
