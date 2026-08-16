/* THE STUDIO COMPOSITOR'S GUARD — js/studio.js, PLAN-the-studio.md step 2.
 *
 * Everything here is asserted on REAL DECODED PIXELS OF A REAL EXPORTED BLOB.
 * Every card is composed by composeCard(), handed back as an image/png Blob,
 * decoded through createImageBitmap (so the actual exported bytes are what gets
 * measured, not the canvas they came from), and read as ImageData. Nothing in
 * this file asserts a flag, an option object or a geometry constant standing in
 * for a picture: a knob is proven by the PIXELS it changed.
 *
 * WHAT IT ASSERTS
 *   SIZE     the Blob decodes to exactly 1080x1920 and is image/png.
 *   ZORDER   every BH_SLOTS slot the card draws lands at the right depth, proven
 *            by rendering each slot alone and, at every pixel where that slot is
 *            the TOPMOST one with solid ink, requiring the all-slots card to be
 *            pixel-identical to the slot-alone card. A slot that contributes no
 *            such pixel is a FAILURE (an unmeasured slot is not a passing slot).
 *   SHINY    a shiny pet renders SHINY and a non-shiny one does not: the pet
 *            region differs between the two, and the shiny sparkle's gold is
 *            present in one and absent in the other.
 *   OPTIONS  every knob in the composer table changes the EXPORTED PIXELS.
 *            Backdrop, pet in/out, quote on/off, friend code off/text, gear
 *            list on/off. Each is measured as a pixel delta in the region it
 *            owns AND as zero content in that region when it is off.
 *   GUTTER   with a plain wash, no drawn pixel lies outside the 6% safe gutter,
 *            and nothing at all sits below Instagram's reserved bottom.
 *   CONTRACT the pet-instance guard rejects an unresolved shiny, and no health
 *            data can reach a card because there is no input for any.
 *
 * An empty sample set is a FAILURE, never a pass: every count is asserted > 0
 * before it is asserted about.
 *
 * PROVE-RED. Every one of these was RUN against a THROWAWAY rsync of the tree
 * under /tmp with the bug reintroduced there, never in the worktree, and the
 * text below is what it actually printed (2026-08-15). The exact commands are in
 * gwart/STUDIO-COMPOSITOR-REPORT.md.
 *   ZORDER    reverse the slot sort to `(a, b) => b.z - a.z`
 *             -> 12 slots red, "dressed/H (z110) 20555 px wrong", "dressed/T
 *                (z60) 30848 px wrong", "under-layers/S (z20) 14370 px wrong"
 *   ZORDER    drop one slot from the layer list (`filter(s => s.code !== 'H')`)
 *             -> "every slot actually draws ink" red naming dressed/H, and
 *                "every drawable slot owns visible pixels" red naming H
 *   ZORDER    draw no layers at all
 *             -> all 16 slot renders red, all 13 slots unproven
 *   SHINY     force the base art and skip the sparkle
 *             -> "0 pixels differ", "shiny gold 0px, plain gold 0px"
 *   OPTION    ignore o.quote and always draw it
 *             -> "on 15631px, off 790px" (the row is not empty when it is off)
 *   OPTION    ignore o.pet and always draw the companion
 *             -> "in 60367px, out 60367px, 0px changed on the card"
 *   GUTTER    drop the sparkle's safe-margin clamp
 *             -> ink r=1030 against a gutter right edge of 1015
 *   GUTTER    move the plate and its last row 80px down
 *             -> "62236px below y=1540"
 *   SIZE      compose at 1080x1900
 *             -> {"w":1080,"h":1900}
 *   CONTRACT  remove the resolved-shiny guard
 *             -> {"undef":"accepted"}
 *   HARD RULE print a kcal figure in the name row
 *             -> HARD RULE red naming the line
 *
 * Usage: node tests/studio-audit.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

/* ------------------------------------------------------------------ STATIC -- */
const SRC = readFileSync(path.join(ROOT, 'js/studio.js'), 'utf8');
const CODE = SRC.split('\n')
  .filter(l => !/^\s*(?:\*|\/\/|\/\*)/.test(l))            // prose about a bug is not the bug
  .join('\n');

/* THE HARD RULE, PLAN §3: no calories, macros, weight, weigh-in trend or step
   counts may ever reach a card. Not as an option, not behind a toggle. The
   compositor has no input for one, and this is what notices if somebody adds
   one. Proven red by adding `look.kcal` to the name row. */
const HEALTH = /\b(kcal|calorie|macro|protein|carbs?|weighIn|weight|bodyweight|steps?Today|stepCount)\b/i;
const healthHits = CODE.split('\n')
  .map((l, i) => ({ n: i + 1, l }))
  .filter(({ l }) => HEALTH.test(l));
ok('HARD RULE no health data can reach a card (no calories, macros, weight, steps)',
  healthHits.length === 0,
  healthHits.length ? '\n      ' + healthHits.map(h => `js/studio.js:${h.n}  ${h.l.trim().slice(0, 80)}`).join('\n      ')
    : 'no health token in js/studio.js');

/* The figure contract's STATIC rule, applied to this file too: an outfit slot
   is a SPECIES id with no shiny on it. */
ok('CONTRACT the compositor never builds a pet out of an outfit slot',
  !/\{\s*id:\s*[\w.]+\.C\b/.test(CODE), 'no { id: x.C } construction');

/* --------------------------------------------------------------- the browser */
const srv = await serveTree(ROOT);
const { browser, page } = await boot(srv.url);
/* The directory listing python serves for /js/ is a real document with a real
   base URL and NONE of the app running, so the compositor is measured on its
   own rather than through a booted app that could mask or cause a failure. */
await page.goto(srv.url + 'js/', { waitUntil: 'domcontentloaded' });

const exported = await page.evaluate(async () => {
  const mod = await import('./studio.js');
  window.__st = {
    mod, store: new Map(), touched: null,
    rect(r) { return { l: Math.round(r.l), t: Math.round(r.t), r: Math.round(r.r), b: Math.round(r.b) }; },
    async render(id, look, opts) {
      const blob = await mod.composeCard(look, opts);
      const bmp = await createImageBitmap(blob);            // decode the EXPORTED BYTES
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(bmp, 0, 0);
      this.store.set(id, x.getImageData(0, 0, bmp.width, bmp.height));
      return { w: bmp.width, h: bmp.height, type: blob.type, bytes: blob.size };
    },
    drop(id) { this.store.delete(id); },
    px(id, x, y) {
      const d = this.store.get(id), i = (y * d.width + x) * 4;
      return [d.data[i], d.data[i + 1], d.data[i + 2], d.data[i + 3]];
    },
    /* Pixels in `rect` that are not the reference colour. `ref` defaults to the
       card's own top-left pixel, which on a plain wash IS the wash: the
       background is read off the render rather than hardcoded here. */
    countNot(id, rect, ref) {
      const d = this.store.get(id), R = this.rect(rect);
      const [r0, g0, b0] = ref || this.px(id, 0, 0);
      let n = 0;
      for (let y = R.t; y < R.b; y++) {
        for (let x = R.l; x < R.r; x++) {
          const i = (y * d.width + x) * 4;
          if (d.data[i] !== r0 || d.data[i + 1] !== g0 || d.data[i + 2] !== b0) n++;
        }
      }
      return n;
    },
    bboxNot(id, ref) {
      const d = this.store.get(id);
      const [r0, g0, b0] = ref || this.px(id, 0, 0);
      let l = d.width, t = d.height, r = -1, b = -1, n = 0;
      for (let y = 0; y < d.height; y++) {
        for (let x = 0; x < d.width; x++) {
          const i = (y * d.width + x) * 4;
          if (d.data[i] === r0 && d.data[i + 1] === g0 && d.data[i + 2] === b0) continue;
          n++;
          if (x < l) l = x;
          if (x > r) r = x;
          if (y < t) t = y;
          b = y;
        }
      }
      return { n, l, t, r: r + 1, b: b + 1 };
    },
    /* Pixels within `tol` of a colour: how the shiny sparkle's gold is found. */
    countNear(id, rect, [cr, cg, cb], tol) {
      const d = this.store.get(id), R = this.rect(rect);
      let n = 0;
      for (let y = R.t; y < R.b; y++) {
        for (let x = R.l; x < R.r; x++) {
          const i = (y * d.width + x) * 4;
          if (Math.abs(d.data[i] - cr) <= tol && Math.abs(d.data[i + 1] - cg) <= tol
            && Math.abs(d.data[i + 2] - cb) <= tol) n++;
        }
      }
      return n;
    },
    diff(a, b, rect) {
      const A = this.store.get(a), B = this.store.get(b);
      const R = this.rect(rect || { l: 0, t: 0, r: A.width, b: A.height });
      let n = 0;
      for (let y = R.t; y < R.b; y++) {
        for (let x = R.l; x < R.r; x++) {
          const i = (y * A.width + x) * 4;
          if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1]
            || A.data[i + 2] !== B.data[i + 2]) n++;
        }
      }
      return n;
    },
    /* ---- ZORDER, one slot at a time, HIGHEST z first ---------------------
       `probe` is a card carrying the body plus exactly this slot; `base` is the
       same card with no slots at all. Their difference is this slot's own ink.
       Eroded by 2px so only SOLID interior pixels count, because an antialiased
       edge blends with whatever is beneath it and would differ between the two
       cards for an honest reason. The first slot to claim a pixel, walking down
       from the top of the z order, is the slot that must be visible there: so
       the all-slots card has to be pixel-identical to the probe at every pixel
       this slot claims. Sorting the layers the wrong way round makes a lower
       slot paint over a higher one and those pixels stop matching. */
    /* ONE SLOT'S DEPTH, PROVEN ON PIXELS.
     *
     * `solo` is a card carrying ONLY this slot, `soloBg` is the identical card
     * over a backdrop, and `empty` is the card with no layers at all.
     *   ink     = solo differs from empty          this slot drew something
     *   opaque  = solo equals soloBg               two different backgrounds and
     *             the same result, so nothing shows through: the pixel is this
     *             slot's own colour and nobody else's
     * A pixel is OWNED by this slot when it is opaque here and no HIGHER slot
     * touched it, and at every owned pixel the finished all-slots card must be
     * pixel-identical to solo.
     *
     * Opacity is tested rather than approximated. The first pass eroded the mask
     * by 2px instead, on the theory that only antialiased edges blend, and it
     * reported a few hundred "wrong depth" pixels per slot which were really the
     * genuinely translucent parts of the art (the katana's highlight, the grill).
     * Two backgrounds answer the question exactly and there is nothing left to
     * tune.
     */
    claim(soloId, soloBgId, fullId) {
      const E = this.store.get('empty'), S = this.store.get(soloId);
      const EG = this.store.get('emptyBg'), G = this.store.get(soloBgId), F = this.store.get(fullId);
      const w = E.width, h = E.height, n = w * h;
      if (!this.touched) this.touched = new Uint8Array(n);
      const ink = new Uint8Array(n), opq = new Uint8Array(n);
      let raw = 0, owned = 0, mismatch = 0, hidden = 0, loose = 0, firstBad = null;
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        /* Ink is looked for against BOTH backgrounds. A resampled edge can carry
           an alpha near 0.01, which over the dark wash rounds away to nothing
           and looks like "this slot drew nothing here", while over a bright body
           in the stacked card the same alpha shifts the pixel by 3 units. That
           was the last handful of mismatches, and probing them is what found it:
           the layers above had alpha 0 in their own solo renders. Over the light
           backdrop the same faint alpha is visible, so the pair catches it. */
        const drew = S.data[i] !== E.data[i] || S.data[i + 1] !== E.data[i + 1]
          || S.data[i + 2] !== E.data[i + 2]
          || G.data[i] !== EG.data[i] || G.data[i + 1] !== EG.data[i + 1]
          || G.data[i + 2] !== EG.data[i + 2];
        if (!drew) continue;
        ink[p] = 1; raw++;
        /* Counted BEFORE this slot's own dilation runs, so it means "ink no
           HIGHER slot covered" and not "ink my own neighbour covered". */
        if (!this.touched[p]) loose++;
        if (S.data[i] === G.data[i] && S.data[i + 1] === G.data[i + 1]
          && S.data[i + 2] === G.data[i + 2]) opq[p] = 1;
      }
      /* Eroded by one pixel. Two backgrounds answer "is this pixel opaque"
         almost exactly, but a pixel at alpha 254 shows a sub-1/255 amount of
         either background and rounds to the same byte in both, so it slips
         through as opaque and then differs from the finished card by one unit.
         That was the last 6-to-172px of residue per slot. An alpha-254 pixel
         only occurs on a shape boundary, so dropping the boundary ring of the
         opaque mask removes them and the comparison stays EXACT: no tolerance,
         no threshold to drift. */
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const p = y * w + x;
          if (!opq[p] || this.touched[p]) continue;
          if (!(opq[p - 1] && opq[p + 1] && opq[p - w] && opq[p + w] && opq[p - w - 1]
            && opq[p - w + 1] && opq[p + w - 1] && opq[p + w + 1])) { hidden++; continue; }
          const i = p * 4;
          owned++;
          /* ONE UNIT of slack per channel, and it is a floor rather than a
             tuned number. The opacity test above compares this slot over two
             backgrounds; a pixel at alpha 254 lets through under 1/255 of
             either, which rounds to the same byte in both and reads as opaque.
             It then differs from the finished card by exactly one unit. A slot
             drawn at the WRONG DEPTH is a different garment's colour, tens to
             hundreds of units away, so this cannot hide one: reversing the z
             sort in composeCard still turns tens of thousands of pixels red. */
          if (Math.abs(F.data[i] - S.data[i]) > 1 || Math.abs(F.data[i + 1] - S.data[i + 1]) > 1
            || Math.abs(F.data[i + 2] - S.data[i + 2]) > 1) {
            mismatch++;
            if (!firstBad) firstBad = { x, y };
          }
        }
      }
      /* Anything this slot so much as touched is off limits to everything below
         it, dilated by REACH pixels. One pixel was not enough and the reason is
         measured, not guessed: a mismatching pixel was probed and the layers
         above it had alpha 0 there in their own solo renders, yet the stacked
         card still differed by one unit. Canvas2D draws these layers SCALED with
         imageSmoothingQuality 'high', and that resampling kernel has a support
         of a couple of source pixels, so a layer's edge influences the composite
         slightly further out than its own visible ink. REACH covers the kernel;
         it costs a thin ring of owned pixels per slot and nothing else. */
      const REACH = 3;
      for (let y = REACH; y < h - REACH; y++) {
        for (let x = REACH; x < w - REACH; x++) {
          if (!ink[y * w + x]) continue;
          for (let dy = -REACH; dy <= REACH; dy++) {
            for (let dx = -REACH; dx <= REACH; dx++) this.touched[(y + dy) * w + x + dx] = 1;
          }
        }
      }
      return { raw, owned, mismatch, hidden, loose, firstBad };
    },
  };
  return Object.keys(mod);
});
ok('the compositor module loads and exports what the plan calls for',
  exported.includes('composeCard') && exported.includes('LAYOUT'), exported.join(', '));

const LAYOUT = await page.evaluate(() => window.__st.mod.LAYOUT);
const SLOTS = await page.evaluate(async () => {
  const { BH_SLOTS } = await import('../data/boneheadz.js');
  return BH_SLOTS.map(s => ({ code: s.code, z: s.z }));
});

/* TWO outfits, because one cannot show all thirteen slots and pretending
   otherwise is how a slot goes unmeasured. Socks live under shoes and undies
   live under trousers: on a fully dressed figure they are INVISIBLE, and an
   invisible layer has no observable depth. So the sweep runs twice and every
   slot has to be proven in at least one pass.
   The items are CHOSEN BY MEASUREMENT, not taste: each is the item in its slot
   with the largest solid (alpha 255, eroded) interior, because the depth proof
   below needs opaque ink to compare. That matters: the first pass here wore T1,
   whose art is 83% semi-transparent (median alpha 109), so the tee had no solid
   interior anywhere and could not be proven at all. */
const DRESSED = {
  BG: 'BG4-1', B: 'B14', S: 'S3', FW: 'FW3', U: 'U4', P: 'P6-2', T: 'T9-4',
  SK: 'SK17', E: 'ES16', G: 'GS1', M: 'M10', H: 'H13-6', IL: 'IL9', IR: 'IR11-2', C: 'C1',
};
const UNDER = { B: 'B14', U: 'U4', S: 'S3' };
const PASSES = [{ key: 'dressed', outfit: DRESSED }, { key: 'under-layers', outfit: UNDER }];
const OUTFIT = DRESSED;
const STACK = SLOTS.filter(s => s.code !== 'BG' && s.code !== 'C');
ok('ZORDER there are slots to audit at all (zero is a FAILURE)',
  STACK.length >= 10, `${STACK.length} drawable slots: ${STACK.map(s => s.code).join(',')}`);

const missing = SLOTS.filter(s => !DRESSED[s.code]);
ok('ZORDER every BH_SLOTS slot is represented in the audit outfit',
  missing.length === 0, missing.length ? missing.map(s => s.code).join(',') : `${SLOTS.length} slots covered`);

const LOOK = {
  outfit: OUTFIT,
  pet: { id: 'C1', shiny: true, level: 7 },
  name: 'BONY WRECKER', level: 16,
};
const PLAIN = { backdrop: null, pet: false, quote: '', code: '', gear: false };
const ALL_ON = {
  backdrop: null, pet: true, gear: true,
  quote: 'Bones do not fuel themselves.', code: 'BONE-0042',
};

/* ------------------------------------------------------------------- SIZE -- */
const full = await page.evaluate(async (look, opts) =>
  window.__st.render('full', look, opts), LOOK, PLAIN);
ok('SIZE the exported Blob decodes to exactly 1080x1920',
  full.w === 1080 && full.h === 1920, JSON.stringify(full));
ok('SIZE the export is a real PNG with bytes in it (an empty Blob is a FAILURE)',
  full.type === 'image/png' && full.bytes > 5000, `${full.type}, ${full.bytes} bytes`);

/* ----------------------------------------------------------------- ZORDER -- */
await page.evaluate(async (look, opts, bg) => {
  await window.__st.render('empty', { ...look, outfit: {}, pet: null }, opts);
  await window.__st.render('emptyBg', { ...look, outfit: {}, pet: null }, { ...opts, backdrop: bg });
}, LOOK, PLAIN, 'BG4-1');
const zrows = [];
for (const pass of PASSES) {
  await page.evaluate(async (look, outfit, opts) => {
    window.__st.touched = null;                           // each pass is its own stack
    await window.__st.render('stack', { ...look, outfit, pet: null }, opts);
  }, LOOK, pass.outfit, PLAIN);
  const codes = SLOTS.filter(s => s.code !== 'BG' && s.code !== 'C' && pass.outfit[s.code])
    .sort((a, b) => b.z - a.z);                           // highest z first
  for (const s of codes) {
    await page.evaluate(async (look, o, opts, bg) => {
      await window.__st.render('solo', { ...look, outfit: o, pet: null }, opts);
      await window.__st.render('soloBg', { ...look, outfit: o, pet: null }, { ...opts, backdrop: bg });
    }, LOOK, { [s.code]: pass.outfit[s.code] }, PLAIN, 'BG4-1');
    const r = await page.evaluate(() => {
      const out = window.__st.claim('solo', 'soloBg', 'stack');
      window.__st.drop('solo'); window.__st.drop('soloBg');
      return out;
    });
    zrows.push({ pass: pass.key, code: s.code, z: s.z, ...r });
  }
  await page.evaluate(() => window.__st.drop('stack'));
}
ok('ZORDER both passes ran and produced rows (an empty sweep is a FAILURE)',
  zrows.length >= 16 && PASSES.every(p => zrows.some(r => r.pass === p.key)),
  `${zrows.length} slot renders across ${PASSES.length} outfits`);
const noInk = zrows.filter(r => r.raw === 0);
ok('ZORDER every slot actually draws ink (a layer that drew nothing is a FAILURE)',
  noInk.length === 0,
  noInk.length ? noInk.map(r => `${r.pass}/${r.code}`).join(',')
    : zrows.map(r => `${r.code}:${r.raw}`).join(' '));

/* EVERY slot must be proven SOMEWHERE. A slot buried on the dressed figure is
   measured on the under-layers pass instead, so no slot gets to pass by being
   invisible. */
const provenIn = new Map();
zrows.forEach(r => { if (r.owned > 0) provenIn.set(r.code, `${r.pass}:${r.owned}`); });
const unproven = STACK.filter(s => !provenIn.has(s.code));
ok('ZORDER every drawable slot owns visible pixels in at least one pass',
  unproven.length === 0,
  unproven.length ? unproven.map(s => s.code).join(',')
    : [...provenIn].map(([c, v]) => `${c}@${v}`).join(' '));

const wrongDepth = zrows.filter(r => r.mismatch > 0);
ok('ZORDER at every pixel a slot owns, the finished card shows THAT slot (z order holds)',
  wrongDepth.length === 0,
  wrongDepth.length
    ? wrongDepth.map(r => `${r.pass}/${r.code} (z${r.z}) ${r.mismatch} px wrong, first at ${JSON.stringify(r.firstBad)}`).join('; ')
    : `${zrows.reduce((a, r) => a + r.owned, 0)} owned pixels, all correct`);

/* THE BACKDROP IS THE BOTTOM OF THE STACK (BG, z 0). */
await page.evaluate(async (look, opts) =>
  window.__st.render('bg', look, { ...opts, backdrop: 'BG4-1' }), LOOK, PLAIN);
const bgBehind = await page.evaluate(() => {
  const st = window.__st, L = st.mod.LAYOUT;
  const top = { l: 0, t: 0, r: L.W, b: 260 };            // above the figure: backdrop only
  return {
    plainTop: st.countNot('full', top),
    bgTop: st.countNot('bg', top, st.px('full', 0, 0)),
    figureUnchanged: st.diff('full', 'bg', { l: 400, t: 700, r: 680, b: 1000 }),
  };
});
ok('ZORDER the backdrop fills the card behind everything (BG is z 0)',
  bgBehind.plainTop === 0 && bgBehind.bgTop > 260 * 1080 * 0.9, JSON.stringify(bgBehind));

/* ------------------------------------------------------------------ SHINY -- */
await page.evaluate(async (look, opts) => {
  await window.__st.render('shiny', { ...look, pet: { id: 'C1', shiny: true, level: 7 } }, { ...opts, pet: true });
  await window.__st.render('base-pet', { ...look, pet: { id: 'C1', shiny: false, level: 7 } }, { ...opts, pet: true });
}, LOOK, PLAIN);
const shiny = await page.evaluate(() => {
  const st = window.__st, L = st.mod.LAYOUT;
  const petBox = { l: L.pet.l, t: L.pet.ground - L.pet.inkH - 60, r: L.pet.r, b: L.pet.ground + 20 };
  return {
    petPixels: st.countNot('shiny', petBox),
    differs: st.diff('shiny', 'base-pet', petBox),
    goldShiny: st.countNear('shiny', petBox, [255, 224, 138], 24),
    goldPlain: st.countNear('base-pet', petBox, [255, 224, 138], 24),
  };
});
ok('SHINY the pet is drawn at all in its own region (an empty region is a FAILURE)',
  shiny.petPixels > 2000, `${shiny.petPixels} non-wash pixels`);
ok('SHINY a shiny pet and a non-shiny pet are DIFFERENT pixels',
  shiny.differs > 2000, `${shiny.differs} pixels differ`);
ok('SHINY the sparkle is on the shiny card and NOT on the plain one',
  shiny.goldShiny > 200 && shiny.goldPlain === 0,
  `shiny gold ${shiny.goldShiny}px, plain gold ${shiny.goldPlain}px`);

/* ---------------------------------------------------------------- OPTIONS --
   Every knob is proven by what it did to the EXPORTED PIXELS. Two assertions
   each, because they fail differently: the region it owns must be EMPTY when
   the knob is off (so a knob that draws nothing anywhere still fails), and the
   card must actually differ (so a knob that only edits an in-memory object
   still fails). */
await page.evaluate(async (look, on) => {
  const st = window.__st;
  await st.render('on', look, on);
  await st.render('noPet', look, { ...on, pet: false });
  await st.render('noQuote', look, { ...on, quote: '' });
  await st.render('noGear', look, { ...on, gear: false });
  await st.render('noCode', look, { ...on, code: '' });
  await st.render('bgOn', look, { ...on, backdrop: 'BG4-1' });
}, LOOK, ALL_ON);

const opt = await page.evaluate(() => {
  const st = window.__st, L = st.mod.LAYOUT;
  /* The plate's own fill, sampled well INSIDE the 34px corner radius and to the
     left of the centred name. At +6,+6 the sample lands outside the rounded
     corner and picks up the wash, which made every "row is empty when the knob
     is off" count the whole row. Sampled at a row that is ALWAYS drawn, because
     the plate's bottom now follows the content. */
  const plate = st.px('on', L.plate.l + 26, L.rows.name.t + 12);
  const wash = st.px('on', 0, 0);
  /* A row is EMPTY when every pixel in it is either plate fill or wash: with the
     row's own content gone the plate may have collapsed above it, so "equals the
     plate colour" alone would call bare wash a text pixel. */
  const emptyRow = (id, r) => st.countNot(id, r, plate) + st.countNot(id, r, wash)
    - (r.r - r.l) * (r.b - r.t);
  const petBox = { l: L.pet.l, t: L.pet.ground - L.pet.inkH - 60, r: L.pet.r, b: L.pet.ground + 20 };
  const top = { l: 0, t: 0, r: L.W, b: 260 };
  return {
    petOn: st.countNot('on', petBox), petOff: st.countNot('noPet', petBox),
    petDiff: st.diff('on', 'noPet'),
    quoteOn: st.countNot('on', L.rows.quote, plate), quoteOff: emptyRow('noQuote', L.rows.quote),
    quoteDiff: st.diff('on', 'noQuote'),
    gearOn: st.countNot('on', L.rows.gear, plate), gearOff: emptyRow('noGear', L.rows.gear),
    gearDiff: st.diff('on', 'noGear'),
    codeOn: st.countNot('on', L.rows.code, plate), codeOff: emptyRow('noCode', L.rows.code),
    codeDiff: st.diff('on', 'noCode'),
    washTop: st.countNot('on', top), bgTop: st.countNot('bgOn', top, st.px('on', 0, 0)),
    bgDiff: st.diff('on', 'bgOn'),
  };
});
ok('OPTION pet OUT means measurably fewer drawn pixels in the pet region',
  opt.petOn > 4000 && opt.petOff < opt.petOn * 0.35 && opt.petDiff > 4000,
  `in ${opt.petOn}px, out ${opt.petOff}px, ${opt.petDiff}px changed on the card`);
ok('OPTION quote OFF leaves no text pixels in the quote row',
  opt.quoteOn > 800 && opt.quoteOff === 0 && opt.quoteDiff > 800,
  `on ${opt.quoteOn}px, off ${opt.quoteOff}px, ${opt.quoteDiff}px changed`);
ok('OPTION gear list OFF leaves no text pixels in the gear row',
  opt.gearOn > 400 && opt.gearOff === 0 && opt.gearDiff > 400,
  `on ${opt.gearOn}px, off ${opt.gearOff}px, ${opt.gearDiff}px changed`);
ok('OPTION friend code OFF leaves no text pixels in the code row',
  opt.codeOn > 400 && opt.codeOff === 0 && opt.codeDiff > 400,
  `on ${opt.codeOn}px, off ${opt.codeOff}px, ${opt.codeDiff}px changed`);
ok('OPTION a backdrop replaces the plain wash across the whole card',
  opt.washTop === 0 && opt.bgTop > 260 * 1080 * 0.9 && opt.bgDiff > 200000,
  `wash ${opt.washTop}px drawn up top, backdrop ${opt.bgTop}px, ${opt.bgDiff}px changed`);

/* EVERY BACKDROP IN THE CATALOGUE, not the one I happened to pick. All 22 must
   compose without throwing and must actually paint the card. */
const bgIds = await page.evaluate(async () => {
  const { BH_ITEMS } = await import('../data/boneheadz.js');
  return BH_ITEMS.filter(i => i.slot === 'BG').map(i => i.id);
});
ok('OPTION the backdrop catalogue could be read at all (an empty list is a FAILURE)',
  bgIds.length >= 20, `${bgIds.length} BG items`);
const bgBad = [];
for (const id of bgIds) {
  const n = await page.evaluate(async (look, opts, bg) => {
    const st = window.__st;
    await st.render('bgx', look, { ...opts, backdrop: bg });
    const out = st.countNot('bgx', { l: 0, t: 0, r: 1080, b: 260 }, st.px('full', 0, 0));
    st.drop('bgx');
    return out;
  }, LOOK, PLAIN, id).catch(e => ({ err: String(e) }));
  if (typeof n !== 'number' || n < 260 * 1080 * 0.9) bgBad.push(`${id}: ${JSON.stringify(n)}`);
}
ok('OPTION all 22 catalogue backdrops compose and paint the card',
  bgBad.length === 0, bgBad.length ? bgBad.join('; ') : `${bgIds.length} backdrops verified`);

/* ----------------------------------------------------------------- GUTTER -- */
const gut = await page.evaluate(() => {
  const st = window.__st, L = st.mod.LAYOUT;
  const box = st.bboxNot('on');
  const belowSafe = st.countNot('on', { l: 0, t: L.safe.b, r: L.W, b: L.H });
  const aboveSafe = st.countNot('on', { l: 0, t: 0, r: L.W, b: L.safe.t });
  return { box, belowSafe, aboveSafe, gutter: L.gutter, safe: L.safe };
});
ok('GUTTER something was actually drawn to measure (an empty card is a FAILURE)',
  gut.box.n > 100000, `${gut.box.n} drawn pixels, bbox ${JSON.stringify({ l: gut.box.l, t: gut.box.t, r: gut.box.r, b: gut.box.b })}`);
ok('GUTTER nothing drawn enters the 6% safe gutter',
  gut.box.l >= gut.gutter.l && gut.box.t >= gut.gutter.t
  && gut.box.r <= gut.gutter.r && gut.box.b <= gut.gutter.b,
  `ink ${JSON.stringify({ l: gut.box.l, t: gut.box.t, r: gut.box.r, b: gut.box.b })} vs gutter ${JSON.stringify(gut.gutter)}`);
ok('GUTTER nothing sits below Instagram\'s reserved bottom (information may not enter it)',
  gut.belowSafe === 0, `${gut.belowSafe}px below y=${gut.safe.b}`);

/* --------------------------------------------------------------- CONTRACT -- */
const contract = await page.evaluate(async look => {
  const st = window.__st;
  const tryIt = async pet => {
    try { await st.mod.composeCard({ ...look, pet }, { pet: true }); return 'accepted'; } catch (e) { return String(e.message); }
  };
  return {
    undef: await tryIt({ id: 'C1', level: 3 }),               // petFrom's own-pet shape, shiny UNRESOLVED
    resolved: await tryIt({ id: 'C1', shiny: false, level: 3 }),
    badId: await tryIt({ id: 'NOPE', shiny: false }),
  };
}, LOOK);
ok('CONTRACT an unresolved pet shiny is REJECTED, not silently drawn in base colours',
  /must be a resolved boolean/.test(contract.undef) && contract.resolved === 'accepted',
  JSON.stringify(contract));
ok('CONTRACT an unknown pet id is rejected rather than composed blank',
  /unknown pet id/.test(contract.badId), contract.badId);

/* ------------------------------------------------------------------- done -- */
await browser.close();
srv.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (!results.length) { console.log('FAIL  nothing was checked (an empty run is a FAILURE)'); process.exit(1); }
if (failed.length) { console.log(failed.map(f => `  FAILED: ${f.name}`).join('\n')); process.exit(1); }
