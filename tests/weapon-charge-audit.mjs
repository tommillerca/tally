/* The Wardrobe weapon charge, verified the way v245 taught us to verify motion:
 * by sampling DECODED PIXELS while the animation runs, never by reading geometry.
 *
 * What a FAILURE looks like here (state it before trusting a pass):
 *   - travelFrames === 1  → every frame during the sweep is identical, i.e. the
 *     light crosses the blade too fast to see. That is EXACTLY the bug the first
 *     build shipped (800px sweep, exponential ease, invisible by 4% of the cycle).
 *   - restFrames > 1      → the band is parked ON the art instead of off it.
 *   - maskDecoded false   → the mask PNG never loaded, so the element is masked to
 *     nothing and paints zero pixels regardless of what the transform says.
 *   - samples === 0       → an empty sample set is a FAILURE, never a pass.
 */
import { boot, sleep } from './godmode.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { browser, page } = await boot(process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

// Equip a top-tier main-hand. The sheen is epic+ only by design.
const equipped = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const loot = await import('./js/loot.js');
  // find an epic/legendary IR (main-hand) from the item table the app itself uses
  const { BH_ITEMS } = await import('./data/boneheadz.js');
  const w = BH_ITEMS.find(i => i.slot === 'IR' && ['epic', 'legendary', 'prestige'].includes(i.rarity));
  if (!w) return null;
  await loot.grantCosmetic(w.id, 'test');
  const eq = await db.kvGet('equipped', {}); eq.IR = w.id; await db.kvSet('equipped', eq);
  await db.kvSet('glow', true);
  return { id: w.id, rarity: w.rarity };
});
check('an epic+ main-hand is equipped', !!equipped, equipped ? `${equipped.id} (${equipped.rarity})` : 'NONE FOUND');
if (!equipped) { await browser.close(); process.exit(1); }

await page.evaluate(() => { location.hash = '#/bonehead'; }); await sleep(2000);
await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="wardrobe"]')?.click());
await sleep(2000);

// The element exists, is masked, and the mask actually DECODED.
const el = await page.evaluate(async () => {
  const s = document.querySelector('.bh-stage .wpn-sheen');
  if (!s) return null;
  const cs = getComputedStyle(s);
  const after = getComputedStyle(s, '::after');
  const url = (cs.maskImage || cs.webkitMaskImage || '').match(/url\("?([^")]+)"?\)/);
  let decoded = false, dims = '';
  if (url) {
    decoded = await new Promise(res => {
      const im = new Image();
      im.onload = () => { dims = `${im.naturalWidth}x${im.naturalHeight}`; res(im.naturalWidth > 0); };
      im.onerror = () => res(false);
      im.src = url[1];
    });
  }
  const r = s.getBoundingClientRect();
  return {
    maskUrl: url ? url[1].split('/').pop() : null,
    maskDecoded: decoded, dims,
    maskSize: cs.maskSize || cs.webkitMaskSize,
    anim: after.animationName, dur: after.animationDuration,
    blend: after.mixBlendMode,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
  };
});
check('the sheen element renders in the Wardrobe', !!el);
if (!el) { await browser.close(); process.exit(1); }
check('its mask is the weapon art, and it DECODED', el.maskDecoded, `${el.maskUrl} ${el.dims}`);
check('mask-size is cover (matches object-fit: cover)', el.maskSize === 'cover', el.maskSize);
check('the charge is animating', el.anim === 'wpnCharge', `${el.anim} ${el.dur}`);
check('it modulates rather than paints (overlay)', el.blend === 'overlay', el.blend);

// Sample real pixels across a full cycle. Travel is 0-23%; the rest is dwell.
const dur = parseFloat(el.dur) * 1000;
const clip = { x: el.rect.x, y: el.rect.y, width: el.rect.w, height: el.rect.h };
/* Frames are compared by MEAN PIXEL DIFFERENCE, not by hash. Ten screenshots of a
 * single frozen phase yield two different md5s on this pipeline (compositing and
 * antialiasing jitter), so "distinct hashes" cannot tell a parked band from a
 * moving one: noise alone manufactures variation. The noise floor is measured in
 * this run and every threshold below is expressed relative to it. */
const shotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpn-'));
let shotN = 0;
const shotAt = async () => {
  const f = path.join(shotDir, `f${String(shotN++).padStart(3, '0')}.png`);
  await page.screenshot({ clip, type: 'png', path: f });
  return f;
};
// Freeze everything else on the stage first. The Bonehead's 3.4s idle breath
// moves the whole layer stack, and with it running, EVERY frame differs no matter
// what the sheen does: the sampler would report a pass for an invisible effect.
// The universal selector cannot match ::after, so the charge itself survives this.
await page.evaluate(() => {
  const st = document.createElement('style');
  st.id = 'freeze-idle';
  st.textContent = '.bh-stage *, .bh-stage { animation: none !important; transition: none !important; }';
  document.head.appendChild(st);
});
await sleep(300);

/* RED PROOF (BREAK=fast). Reintroduces the exact bug this effect shipped with the
 * first time: an 800px sweep on an ease-out-expo, which puts the light past the
 * 149px blade within about 4% of the cycle. It still moves pixels, so a naive
 * "did anything change" assertion passes it happily. That is why the legibility
 * count below exists, and running this flag must turn that count RED. */
if (process.env.BREAK === 'fast') {
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = `@keyframes wpnBroken { 0% { transform: translate3d(-120%,0,0) } 100% { transform: translate3d(800px,0,0) } }
      .bh-stage .wpn-sheen::after { animation-name: wpnBroken !important;
        animation-timing-function: cubic-bezier(.19,1,.22,1) !important; }`;
    document.head.appendChild(st);
  });
  console.log('!! BREAK=fast: the original invisible sweep is reinstated\n');
  await sleep(300);
}

/* Drive the animation, do not race it. The sweep lives on ::after, so resetting
 * `animation` on the parent .wpn-sheen is a NO-OP: an earlier version of this
 * audit did exactly that, sampled a window the charge had already left, and
 * reported "1 distinct travel frame" on a perfectly healthy effect. getAnimations
 * with subtree:true reaches the pseudo-element; pausing it and stepping
 * currentTime makes every sample land on a known phase. */
const paused = await page.evaluate(() => {
  const s = document.querySelector('.bh-stage .wpn-sheen');
  const a = s.getAnimations({ subtree: true })
    .find(x => (x.animationName || (x.effect && x.effect.getKeyframes && 'css')) && String(x.animationName || '') === 'wpnCharge')
    || s.getAnimations({ subtree: true })[0];
  if (!a) return null;
  a.pause();
  window.__charge = a;
  return { name: a.animationName || 'anon', dur: a.effect.getTiming().duration };
});
check('the charge animation is reachable and pausable', !!paused,
  paused ? `${paused.name} ${paused.dur}ms` : 'getAnimations found nothing on ::after');
if (!paused) { await browser.close(); process.exit(1); }

const seek = p => page.evaluate(v => {
  window.__charge.currentTime = v * window.__charge.effect.getTiming().duration;
}, p);

// Noise floor first: one phase, nothing touched, five captures.
await seek(0.60);
const noiseShots = []; for (let i = 0; i < 5; i++) noiseShots.push(await shotAt());

const seq = [];
for (let pct = 0; pct <= 1.0001; pct += 0.02) {
  await seek(pct);
  seq.push({ pct, f: await shotAt() });
}

// numpy does the arithmetic: mean absolute difference per consecutive pair, 0-255.
const diffs = JSON.parse(execFileSync('python3', ['-c', `
import sys, json, numpy as np
from PIL import Image
def a(p): return np.asarray(Image.open(p).convert('RGB'), dtype=np.int16)
fs = json.loads(sys.argv[1])
print(json.dumps([float(np.abs(a(x) - a(y)).mean()) for x, y in zip(fs, fs[1:])]))
`, JSON.stringify([...noiseShots, ...seq.map(s => s.f)])]).toString());

const noise = diffs.slice(0, noiseShots.length - 1);
const cyc = diffs.slice(noiseShots.length);            // pair i = seq[i] -> seq[i+1]
const noiseFloor = Math.max(...noise);
const travelD = cyc.filter((_, i) => seq[i].pct < 0.23);
const restD = cyc.filter((_, i) => seq[i].pct >= 0.25 && i < cyc.length);
const mx = a => (a.length ? Math.max(...a) : 0);
const f = n => n.toFixed(3);

console.log(`\nnoise floor (same phase):  ${f(noiseFloor)}`);
console.log(`travel  n=${travelD.length}  max ${f(mx(travelD))}`);
console.log(`at rest n=${restD.length}  max ${f(mx(restD))}`);
console.log(`moved >3x noise at: ${seq.filter((s, i) => cyc[i] > noiseFloor * 3).map(s => Math.round(s.pct * 100)).join(' ')} (% of cycle)`);

check('the sample set is not empty', travelD.length > 0 && restD.length > 0,
  `${travelD.length}/${restD.length}`);
check('PIXELS CHANGE while the charge crosses the blade', mx(travelD) > noiseFloor * 3,
  `${f(mx(travelD))} vs ${f(noiseFloor)} floor`);
const movingSteps = travelD.filter(d => d > noiseFloor * 3).length;
check('and it is LEGIBLE, not a one-frame flash', movingSteps >= 4,
  `${movingSteps} of ${travelD.length} travel steps show motion`);
check('the band rests OFF the art (parked, within noise)', mx(restD) <= noiseFloor * 3,
  `${f(mx(restD))} max vs ${f(noiseFloor * 3)} allowed`);
fs.rmSync(shotDir, { recursive: true, force: true });

// Reduced motion must remove it, not freeze a bright bar across the sword.
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await sleep(400);
const rm = await page.evaluate(() => {
  const s = document.querySelector('.bh-stage .wpn-sheen');
  return s ? getComputedStyle(s).display : 'gone';
});
check('reduced motion removes the effect entirely', rm === 'none' || rm === 'gone', rm);

console.log(bad ? `\n${bad} FAILING` : '\nWEAPON CHARGE VERIFIED');
await browser.close();
process.exit(bad ? 1 : 0);
