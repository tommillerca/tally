/* THE THREE FIGURES IN THE PIT, GRADED IN PAINTED PIXELS.
 *
 * Tom, 2026-08-22, after one fight with the Wanderer and Bumbleseal equipped:
 *   "i just fought the wanderer and he is WAY too big in the pit and overlapping
 *    with my bonehead"
 *   "im guessing what happened was you were afraid to cut off the tail of the
 *    wanderer in the pit, you can that's ok"
 *   "the scale of bumbleseal wihle fighting was too big"
 *   "bumble seal shouldnt have a glow in the pit like that"
 *   "we need to mirror bumbleseal in the fights so she faces the enemy"
 *
 * Four complaints about one screen, and every one of them is invisible to a
 * getBoundingClientRect: the Wanderer's plate is a 640-square whose ink is
 * 562x417 with a 77px tail on the end of that, a pet's box is 76px whatever is
 * drawn inside it, a drop-shadow glow paints outside every box there is, and a
 * mirror changes no box at all. tally/CLAUDE.md's figure contract says align on
 * INK; this suite goes one better and measures what was actually PAINTED.
 *
 * HOW THE INK IS MEASURED. Screenshot the arena, hide ONE element, screenshot
 * again, and diff: the pixels that changed are the pixels that element paints,
 * shadow and glow included. Two things make that honest here:
 *   - EVERY LOOP IS FROZEN FIRST. The torches, the fog and the crowd repaint on
 *     their own, so a live diff reports the whole arena as changed. Measured
 *     before the freeze was added: every figure's "ink" came back as the full
 *     361x330 arena, which would have passed a size check on nothing at all.
 *   - AN EMPTY MASK IS A FAILURE. CONTROL requires all three figures to paint
 *     thousands of pixels before any row below is believed.
 *
 * PROVE-RED, 2026-08-22. Throwaway tree seeded with `git show <rev>:<path>`, one
 * mutation at a time, exit code read from a FILE and never through a pipe. Both
 * mutations exited 1.
 *   PRE-FIX, app.css / js/app.js / js/pets.js at f18d479f, which is the build Tom
 *   fought. Six rows red at 393x852 and five at 320x568, both CONTROLs green:
 *     CLEAR      "his ink x24.5..335.5 against your x44.5..103: they OVERLAP by
 *                78.5px" (61px at 320x568). This is his complaint, in one number.
 *     TAIL       "painted aspect 1.293 (the whole plate is 1.348, the cropped
 *                body 1.199)". Red at 393x852 only: at 320x568 the arena is
 *                narrow enough that its own overflow already truncated him, so
 *                the aspect came out cropped-looking on an uncropped plate. That
 *                is the row's honest limit and it is why the margin half exists.
 *     STANDS     his feet 17.5px below the player's.
 *     PET-MASS   "her painted ink 92.5x82.5 against the bulldog's 85.5x63.5 and
 *                the Mallard's 85x71.5 ... she is 22%" (28% at 320x568).
 *     PET-GLOW   "350 gold pixels painted outside her ink, filter
 *                drop-shadow(rgba(255, 201, 97, 0.95) 0px 0px 8px)" (299 at
 *                320x568).
 *     PET-FACING "her painted right half is 0.74x the luminance of her left".
 *   NO-CLIP, the clip-path deleted and everything else left fixed -> TAIL red at
 *   BOTH viewports and nothing else red: "his ink stops 1.5px short of the
 *   arena's right edge" (7.5px with the crop). The first version of TAIL graded
 *   proportion alone and passed this mutation, because an uncropped tail simply
 *   runs into the arena's overflow and is sliced by the wall instead. Measured,
 *   not assumed, and fixed at the assertion.
 *
 * NO MAP NEEDED: it drives window.__denFight, the webdriver-only seam js/app.js
 * already exposes, so it grades on any machine. The Wanderer's despawn on the
 * walking map is the sibling suite, tests/wanderer-despawn-audit.mjs.
 *
 *   node tests/pit-figures-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree, settle } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
console.log(`URL UNDER TEST  ${base}`);
const { browser, page, errors: errs = [] } = await boot(base);
page.on('pageerror', e => errs.push(String(e)));

/* 393x852 is the phone Tom holds; 320x568 is the smallest thing that runs this
   app and the one that finds every layout fault. The arena is a clamp on the
   viewport, so these are genuinely different boxes. */
const VIEWPORTS = [[393, 852], [320, 568]];
const WANDERER = { name: 'The Wanderer', wanderer: true, aiLevel: 5,
  talents: ['frostbolt', 'firebolt', 'totemic', 'frostbite', 'wildfire', 'tempest'] };
const MAGE = { name: 'The Live Wire', mage: true };

/* His plate's own alpha box and the column the tail starts at, both measured off
   assets/bh/wanderer/wanderer.png with PIL rather than eyeballed. */
const PLATE = { x0: 60, y0: 88, x1: 622, y1: 505, cut: 560, side: 640 };
const FULL_ASPECT = (PLATE.x1 - PLATE.x0) / (PLATE.y1 - PLATE.y0);          // 1.348
const CROPPED_ASPECT = (PLATE.cut - PLATE.x0) / (PLATE.y1 - PLATE.y0);      // 1.199

const equipPet = sp => page.evaluate(async (sp) => {
  const loot = await import('./js/loot.js');
  await loot.grantPet(sp, 'test');
  const insts = await loot.petInstances();
  const inst = insts.find(x => x.sp === sp);
  if (!inst) return null;
  await loot.setEquippedPet(inst.iid);
  return inst.iid;
}, sp);
// NOT awaited: __denFight resolves when the fight CLOSES, which is the flee below.
const openFoe = cfg => page.evaluate(c => { window.__denFight(1.45, 0, c); }, cfg).then(() => sleep(1700));
const closeFoe = () => page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^flee$/i.test((x.textContent || '').trim()));
  if (b) b.click();
}).then(() => sleep(900));

const freeze = () => page.evaluate(() => {
  document.getAnimations().forEach(a => { try { a.pause(); } catch { /* finished */ } });
  /* AND THE TOAST GOES. Granting a pet toasts, the toast fades on its own clock,
     and at 320x568 it lands INSIDE the measured band: measured, it added 23,000
     changed pixels to the player's mask and stretched it from 57px wide to 274,
     which read as the player overlapping everything. It is not part of any
     figure, so it is not allowed to be part of any figure's ink. */
  const t = document.getElementById('toast');
  if (t) { t.textContent = ''; t.style.display = 'none'; }
  if (document.getElementById('__freeze')) return;
  const st = document.createElement('style'); st.id = '__freeze';
  st.textContent = '*,*::before,*::after{animation-play-state:paused !important;transition:none !important}';
  document.head.appendChild(st);
});
/* The whole SCREEN, not the arena: a figure that spilled outside the arena has
   to be visible to the measurement, or INSIDE below could never fail. */
const clipRect = () => page.evaluate(() => {
  const a = document.querySelector('#arena').getBoundingClientRect();
  const pad = 60;
  const x = Math.max(0, Math.round(a.left - pad)), y = Math.max(0, Math.round(a.top - pad));
  return { clip: { x, y, width: Math.min(innerWidth - x, Math.round(a.width + pad * 2)), height: Math.round(a.height + pad * 2) },
    arena: { l: a.left - x, t: a.top - y, r: a.right - x, b: a.bottom - y, w: a.width, h: a.height } };
});
const png = c => page.screenshot({ clip: c, encoding: 'base64' });
const hide = (sel, on) => page.evaluate(([s, o]) => {
  const n = document.querySelector(s); if (n) n.style.visibility = o ? 'hidden' : '';
}, [sel, on]);

/* The painted box of ONE element: the pixels that change when it is hidden.
   Also returns the mean luminance of each half (which way a figure faces) and,
   for a box handed in, the count of WARM pixels painted outside it that got
   BRIGHTER, which is a rarity glow and cannot be a drop-shadow (those are
   black, so they darken). */
async function inkOf(sel, clip, inkBox = null) {
  await freeze();
  const a = await png(clip);
  await hide(sel, true); await sleep(140);
  const b = await png(clip);
  await hide(sel, false); await sleep(140);
  return page.evaluate(async ([A, B, box]) => {
    const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([load(A), load(B)]);
    const cv = document.createElement('canvas'); cv.width = ia.width; cv.height = ia.height;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, cv.width, cv.height).data;
    g.clearRect(0, 0, cv.width, cv.height); g.drawImage(ib, 0, 0);
    const db = g.getImageData(0, 0, cv.width, cv.height).data;
    const dpr = devicePixelRatio || 1;
    let l = 1e9, t = 1e9, r = -1, bo = -1, n = 0, glow = 0;
    let sumL = 0, nL = 0, sumR = 0, nR = 0;
    const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const pts = [];
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4;
      if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) < 12) continue;
      n++; if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > bo) bo = y;
      pts.push([x, y, lum(da, i)]);
      if (box) {
        const cx = x / dpr, cy = y / dpr;
        const outside = cx < box.l - 1 || cx > box.r + 1 || cy < box.t - 1 || cy > box.b + 1;
        // brighter AND warm: a gold halo. A drop-shadow is black and darkens.
        if (outside && lum(da, i) - lum(db, i) > 10 && da[i] - da[i + 2] > 40) glow++;
      }
    }
    if (!n) return { n: 0, glow: 0 };
    const mid = (l + r) / 2;
    for (const [x, , L] of pts) { if (x < mid) { sumL += L; nL++; } else { sumR += L; nR++; } }
    const R = v => Math.round(v / dpr * 10) / 10;
    return { n, glow, l: R(l), t: R(t), r: R(r + 1), b: R(bo + 1), w: R(r + 1 - l), h: R(bo + 1 - t),
      lumL: Math.round(sumL / Math.max(1, nL)), lumR: Math.round(sumR / Math.max(1, nR)) };
  }, [a, b, inkBox]);
}

/* The pet's ink box in CSS px, from PET_CROP mapped through the RENDERED image,
   which is the figure contract's own rule 3. Used to place the glow band; the
   size rows are graded on painted pixels. */
const petInkBox = () => page.evaluate(async () => {
  const { PET_CROP } = await import('../data/boneheadz.js');
  const stage = document.querySelector('#petStage');
  if (!stage) return null;
  const crop = stage.querySelector('.petcrop');
  const anim = stage.querySelector('.petanim');
  if (crop) {
    const img = crop.querySelector('img');
    if (!img) return null;
    const ir = img.getBoundingClientRect();
    const petId = Object.keys(PET_CROP).find(k => (img.getAttribute('src') || '').includes(`/${k}.png`)) || null;
    const c = petId ? PET_CROP[petId] : null;
    if (!c) return { petId, l: ir.left, t: ir.top, r: ir.right, b: ir.bottom };
    /* THE MIRROR MOVES THE INK, AND THE FIRST CUT OF THIS ROW DID NOT KNOW IT.
       .faces-away flips .petcrop, so the img's RECT is unchanged while the ink
       inside it maps to 1-x1..1-x0. Reading the unmirrored fractions put the box
       on her empty side and counted her own yellow abdomen as a halo: 15 gold
       pixels "outside her ink" on a build with no glow at all. Audit drift,
       fixed at the assertion. */
    const flip = stage.classList.contains('faces-away');
    const x0 = flip ? 1 - c.x1 : c.x0, x1 = flip ? 1 - c.x0 : c.x1;
    return { petId, l: ir.left + x0 * ir.width, t: ir.top + c.y0 * ir.height,
      r: ir.left + x1 * ir.width, b: ir.top + c.y1 * ir.height };
  }
  if (anim) { const b = anim.getBoundingClientRect(); return { petId: 'anim', l: b.left, t: b.top, r: b.right, b: b.bottom }; }
  return null;
});
const stageBox = () => page.evaluate(() => {
  const s = document.querySelector('#petStage');
  if (!s) return null;
  const b = s.getBoundingClientRect();
  const inner = s.querySelector('.petcrop') || s.querySelector('.petanim');
  return { w: Math.round(b.width), h: Math.round(b.height),
    innerW: inner ? Math.round(inner.getBoundingClientRect().width) : null,
    tf: inner ? getComputedStyle(inner).transform : 'none',
    filter: getComputedStyle(s.querySelector('img') || s).filter };
});

const R1 = n => Math.round(n * 10) / 10;
const seen = {};

try {
  for (const [vw, vh] of VIEWPORTS) {
    const k = `${vw}x${vh}`;
    await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await sleep(400);
    seen[k] = { pets: {} };
    for (const sp of ['C6', 'C5', 'C2', 'C1']) {
      await equipPet(sp);
      await openFoe(WANDERER);
      await settle(page);
      const { clip, arena } = await clipRect();
      const box = await petInkBox();
      const rel = b => b && { l: R1(b.l - clip.x), t: R1(b.t - clip.y), r: R1(b.r - clip.x), b: R1(b.b - clip.y) };
      const pet = await inkOf('#petStage', clip, rel(box));
      const rec = { pet, stage: await stageBox(), inkBox: rel(box) };
      if (sp === 'C6') {
        rec.foe = await inkOf('#foeStage', clip);
        rec.you = await inkOf('#youStage', clip);
        rec.arena = arena;
        if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/pit-wanderer-${k}.png` });
      }
      seen[k].pets[sp] = rec;
      await closeFoe();
    }
    // the Live Wire, the boss this composition was measured against
    await equipPet('C6');
    await openFoe(MAGE);
    await settle(page);
    const { clip } = await clipRect();
    seen[k].mage = { foe: await inkOf('#foeStage', clip), you: await inkOf('#youStage', clip) };
    await closeFoe();
  }

  for (const [vw, vh] of VIEWPORTS) {
    const k = `${vw}x${vh}`, s = seen[k], tag = n => `${n} @${k}`;
    const c6 = s.pets.C6, foe = c6.foe, you = c6.you, ar = c6.arena;

    ok(tag('CONTROL every figure really painted, and an empty mask is a FAILURE'),
      foe.n > 5000 && you.n > 1500 && c6.pet.n > 1500,
      `painted pixels: wanderer ${foe.n}, player ${you.n}, pet ${c6.pet.n}`);

    /* THE COMPLAINT, IN ONE NUMBER. Pre-fix this was -78.5px at 393x852. */
    const gap = R1(foe.l - you.r);
    ok(tag('CLEAR the Wanderer does not overlap the bonehead'), gap >= 8,
      `his ink x${foe.l}..${foe.r} against your x${you.l}..${you.r}: ` +
      (gap >= 0 ? `${gap}px of daylight` : `they OVERLAP by ${-gap}px`));

    /* A BAND, NOT A FLOOR. Too big is the bug that was just reported, so the
       ceiling is the half that matters, and the Live Wire on the same
       instrument (1.76x) is the floor this has to beat to still read as the
       harder boss. */
    const ratio = R1(foe.h / you.h);
    const mageRatio = R1(s.mage.foe.h / s.mage.you.h);
    ok(tag('LOOMS he is a boss and no more than a boss: 1.9x to 3.2x the player'),
      ratio >= 1.9 && ratio <= 3.2,
      `${foe.h}px of him against ${you.h}px of you = ${ratio}x, with the Live Wire at ${mageRatio}x`);

    ok(tag('FILLS he still owns the stage'),
      foe.w >= ar.w * 0.55 && foe.h >= ar.h * 0.5,
      `${foe.w}x${foe.h} of a ${R1(ar.w)}x${R1(ar.h)} arena ` +
      `(${Math.round(foe.w / ar.w * 100)}% wide, ${Math.round(foe.h / ar.h * 100)}% tall)`);

    /* THE CROP ITSELF, IN PIXELS, AND IT TAKES BOTH HALVES.
       Proportion alone is not enough: measured, deleting the clip-path left this
       suite GREEN, because his tail then runs into the arena's own overflow and
       is sliced by the wall instead, which keeps the painted aspect right while
       putting Cam's art hard against a rounded border. So the second half is the
       MARGIN. Art that ends 7px short of the edge was cropped on purpose; art
       that ends exactly on it was cut off by the container, and those look
       completely different on a phone. */
    const aspect = R1(foe.w / foe.h * 100) / 100;
    const margin = R1(ar.r - foe.r);
    ok(tag('TAIL the tail is cropped off on purpose, not scaled down and not sliced by the arena wall'),
      Math.abs(aspect - CROPPED_ASPECT) < Math.abs(aspect - FULL_ASPECT) && margin >= 4,
      `painted aspect ${aspect} (the whole plate is ${R1(FULL_ASPECT * 100) / 100}, the cropped body ` +
      `${R1(CROPPED_ASPECT * 100) / 100}), and his ink stops ${margin}px short of the arena's right edge`);

    ok(tag('INSIDE nothing of him is painted outside the arena'),
      foe.l >= ar.l - 1 && foe.r <= ar.r + 1 && foe.t >= ar.t - 1 && foe.b <= ar.b + 1,
      `his ink x${foe.l}..${foe.r} y${foe.t}..${foe.b} in an arena x${R1(ar.l)}..${R1(ar.r)} y${R1(ar.t)}..${R1(ar.b)}`);

    ok(tag('STANDS he and the player stand on the same ground'),
      Math.abs(foe.b - you.b) <= 16,
      `his feet at y${foe.b}, yours at y${you.b}`);

    /* ---- the pet ---- */
    const her = c6.pet, dog = s.pets.C5.pet, duck = s.pets.C2.pet;
    const peers = [dog.h, duck.h].sort((a, b) => a - b);
    const mid = (peers[0] + peers[1]) / 2;
    ok(tag('PET-MASS Bumbleseal is the size of the animal everybody else brings'),
      her.h <= mid * 1.12,
      `her painted ink ${her.w}x${her.h} against the bulldog's ${dog.w}x${dog.h} and the Mallard's ${duck.w}x${duck.h} ` +
      `(median height ${mid}, she is ${Math.round((her.h / mid - 1) * 100)}%)`);

    /* ZERO, and it is a ceiling rather than a trend. A rarity halo is warm and
       BRIGHTENS the ground outside the sprite; .fstage's own drop-shadow is
       black and darkens it, so the shadow cannot pass for a glow here and
       removing the shadow cannot pass for removing the glow. */
    ok(tag('PET-GLOW no rarity halo is painted around her'), her.glow === 0,
      `${her.glow} gold pixels painted outside her ink, filter ${c6.stage.filter}`);

    /* FACING, MEASURED OFF HER OWN ART. Her face is the cream disc on one side
       and her abdomen is black and yellow: the plate's left half is 1.59x the
       luminance of its right. So whichever half of the RENDER is brighter is the
       half her face is on, and the foe is on the right. */
    const bright = R1(her.lumR / her.lumL * 100) / 100;
    ok(tag('PET-FACING she faces the enemy'), her.lumR > her.lumL * 1.15,
      `her painted right half is ${bright}x the luminance of her left ` +
      `(her plate's face side is 1.59x, so >1 means she is turned toward him)`);

    /* AND NOBODY ELSE MOVED. The shrink is gated on petStacksOnBody and the
       mirror on FACES_LEFT, so every companion-canvas pet keeps its 76px stage
       and its unmirrored art. */
    const others = ['C5', 'C2', 'C1'].map(id => [id, s.pets[id].stage]);
    ok(tag('PET-UNTOUCHED the other pets keep their size and their facing'),
      others.every(([, st]) => st.innerW >= 74 && st.tf === 'none'),
      others.map(([id, st]) => `${id} inner ${st.innerW}px tf ${st.tf}`).join(', ') +
      `; C6 inner ${c6.stage.innerW}px tf ${c6.stage.tf}`);

    /* THE OTHER DRAWN BOSS DID NOT MOVE EITHER. A pin with a tolerance, not a
       vibe: measured identically before and after this change. */
    ok(tag('MAGE-UNCHANGED the Live Wire keeps his own measured size'),
      s.mage.foe.n > 5000 && s.mage.foe.h > 0 && Math.abs(s.mage.foe.w / s.mage.foe.h - 0.758) < 0.08,
      `his painted ink ${s.mage.foe.w}x${s.mage.foe.h}, ratio to the player ${mageRatio}x`);
  }
  ok('NO PAGE ERRORS', errs.length === 0, errs.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  if (srv) await srv.close();
}
console.log(fails ? '\nPIT FIGURES AUDIT FAILED' : '\nPIT FIGURES AUDIT VERIFIED');
process.exit(fails);
