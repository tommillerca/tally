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
import { boot, sleep, serveTree} from './godmode.js';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ~200 screenshots in this run. The default 30s CDP timeout is fine against the
// CDN but not against a local server sharing the machine with another session,
// where captureScreenshot has stalled past it mid-sweep.
/* DEFAULT TO WHAT YOU ARE ABOUT TO SHIP. This booted `process.env.URL` with no
   fallback, so an unset URL sent boot() to ITS default, which is the live site.
   Every local run was therefore grading github.io instead of the working tree,
   which is how a misregistered mask stayed green here for thirty builds while it
   was visibly broken on Tom's phone. Local by default now, URL=... for live,
   the same convention as the rest of the suite. */
// fileURLToPath, not .pathname: this repo lives under a path with a space in it
const HERE = path.dirname(fileURLToPath(import.meta.url));
let srv = null;
let base = process.env.URL;
if (!base) {
  /* serveTree: OS-assigned port, and a hard error if python never bound. */
  const srvHandle = await serveTree(path.resolve(HERE, '..'));
  srv = { kill: () => srvHandle.close() };
  base = srvHandle.url;
}
const { browser, page } = await boot(base, { protocolTimeout: 180000 });
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
if (!equipped) { await browser.close();
if (srv) srv.kill(); process.exit(1); }

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
    artFit: (() => { const i = s.parentElement?.querySelector('img'); return i ? getComputedStyle(i).objectFit : null; })(),
    artPos: (() => { const i = s.parentElement?.querySelector('img'); return i ? getComputedStyle(i).objectPosition : null; })(),
    maskPos: cs.maskPosition || cs.webkitMaskPosition,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
  };
});
check('the sheen element renders in the Wardrobe', !!el);
if (!el) { await browser.close(); process.exit(1); }
check('its mask is the weapon art, and it DECODED', el.maskDecoded, `${el.maskUrl} ${el.dims}`);
/* NOT a hard-coded 'cover'. This asserted the literal value the Wardrobe used
   when the check was written, and the Wardrobe moved to `contain` in v276, so the
   check went red for the CORRECT value and would have gone green for a mask that
   no longer matched. Assert the relationship, which is the thing that matters:
   the mask is scaled and placed exactly like the art it is masking. */
check('mask-size matches the art\'s object-fit', el.maskSize === el.artFit, `mask ${el.maskSize} vs art ${el.artFit}`);
check('mask-position matches the art\'s object-position', el.maskPos === el.artPos, `mask ${el.maskPos} vs art ${el.artPos}`);
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

/* ===== Cohesion sweep: the charge must reach every surface the character does.
 * The mask is compared against the SIBLING ARTWORK's computed object-fit rather
 * than against the string "cover". Hard-coding cover is what confined this effect
 * to the Wardrobe: the Today hero, both fight plates, the crew card and the map
 * marker all draw the stack `contain`, and a cover mask on them lights empty
 * canvas beside the sword. A surface added later with a different fit fails here
 * instead of shipping misregistered. */
await page.evaluate(() => document.getElementById('freeze-idle')?.remove());
await page.evaluate(() => { window.__charge && window.__charge.play(); });

const probe = label => page.evaluate(l => {
  const out = [];
  for (const stack of document.querySelectorAll('.bh-anim')) {
    const sheen = stack.querySelector(':scope > .wpn-sheen');
    const art = stack.querySelector('img');
    if (!art) continue;
    const fit = getComputedStyle(art).objectFit;
    const r = stack.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;             // not laid out / hidden
    const cs = sheen ? getComputedStyle(sheen) : null;
    out.push({
      sheen: !!sheen,
      fit,
      pos: getComputedStyle(art).objectPosition,
      maskPos: cs ? (cs.maskPosition || cs.webkitMaskPosition) : null,
      avFit: cs ? cs.getPropertyValue('--av-fit').trim() : null,
      avPos: cs ? cs.getPropertyValue('--av-pos').trim() : null,
      mask: cs ? (cs.maskSize || cs.webkitMaskSize) : null,
      anim: sheen ? getComputedStyle(sheen, '::after').animationName : null,
      size: `${Math.round(r.width)}x${Math.round(r.height)}`,
    });
  }
  return { surface: l, stacks: out };
}, label);

const cssState = await page.evaluate(async () => {
  const txt = await fetch('app.css', { cache: 'no-store' }).then(r => r.text()).catch(() => '');
  const live = [...document.styleSheets].some(ss => { try { return [...ss.cssRules].some(r => r.selectorText && /\.pd-center \.bh-stage\.lg \.bh-anim$/.test(r.selectorText) && r.style.getPropertyValue('--av-fit')); } catch { return false; } });
  return { fetchedHasRule: /--av-pos: 50% 72%/.test(txt), liveSheetHasRule: live, sw: !!navigator.serviceWorker?.controller };
});
console.log('CSS STATE', JSON.stringify(cssState));
const surfaces = [];
await page.evaluate(() => { location.hash = '#/today'; }); await sleep(2300);
await page.evaluate(() => document.querySelector('.dw')?.remove());
surfaces.push(await probe('Today hero'));
await page.evaluate(() => { location.hash = '#/bonehead'; }); await sleep(2000);
await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="wardrobe"]')?.click()); await sleep(1800);
surfaces.push(await probe('Wardrobe'));
await page.evaluate(() => { location.hash = '#/today'; }); await sleep(1600);
const pitBtn = await page.$('#pitBtn');
if (pitBtn) {
  await pitBtn.click(); await sleep(1700);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^fight$/i.test(x.textContent.trim()));
    if (b) b.click();
  });
  await sleep(2600);
  surfaces.push(await probe('Pit arena'));
  for (let i = 0; i < 6; i++) {
    if (!await page.evaluate(() => !!document.querySelector('#sheets > div'))) break;
    await page.evaluate(() => history.back()); await sleep(500);
  }
}
await page.evaluate(() => { location.hash = '#/map'; }); await sleep(2600);
surfaces.push(await probe('Map marker'));

let sawSheen = 0, checkedStacks = 0;
for (const s of surfaces) {
  const mine = s.stacks.filter(x => x.sheen);
  checkedStacks += s.stacks.length;
  sawSheen += mine.length;
  console.log(`\n${s.surface}: ${s.stacks.length} stack(s), ${mine.length} carrying the charge`);
  for (const x of s.stacks) console.log(`   ${x.size.padEnd(9)} fit=${x.fit.padEnd(8)} mask=${String(x.mask || '-').padEnd(8)} pos=${String(x.pos).padEnd(10)} maskPos=${String(x.maskPos || '-').padEnd(10)} ${x.anim || ''}`);
  for (const x of mine) {
    /* SIZE AND PLACE. Only the size was ever compared, so a surface that moves
       the art with object-position (the Wardrobe's `50% 72%`, shipping since
       v276) kept a mask pinned to centre and the charge floated beside the sword
       instead of sitting on it. Tom photographed exactly that on 2026-08-07. */
    check(`${s.surface}: mask sits where the art sits`, x.maskPos === x.pos,
      `mask-position ${x.maskPos} vs object-position ${x.pos}`);
    check(`${s.surface}: mask is in register with the art`, x.mask === x.fit,
      `mask-size ${x.mask} vs object-fit ${x.fit}`);
    check(`${s.surface}: the charge is running`, x.anim === 'wpnCharge', String(x.anim));
  }
}
check('avatar stacks were actually examined (empty set = failure)', checkedStacks > 0, `${checkedStacks} stacks`);
check('THE CHARGE REACHES MORE THAN THE WARDROBE', sawSheen >= 3, `${sawSheen} stacks across ${surfaces.length} surfaces`);

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
