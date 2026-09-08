import { auditOutputPath } from './lib/audit-output.mjs';
/* THE FOOTBALL KIT, IN PIXELS. The half tests/football-kit-audit.mjs cannot reach.
 *
 * That file is PURE and it grades everything a number can answer: the palette,
 * the item generation, the composite arithmetic over the shipped PNG bytes, the
 * gate, the prices, the grants. What it CANNOT answer is whether any of it
 * arrives on a screen, and every one of the three defects this file exists for
 * was invisible to it:
 *
 *   1. THE PET GARMENTS WERE NEVER DRAWN. C4 (Beardie) and CX (Day One Lizard)
 *      are both in ANIMATED_PETS, so petSpriteHtml returned animatedPetHtml
 *      before it could reach croppedPetImg, the ONLY function that paints a
 *      pet's worn layers. The tint arithmetic was perfect, the masks were on
 *      disk, the wardrobe tile rendered the piece correctly, and on Today, the
 *      Stable, the Paddock and the Pit the lizard wore nothing at all. Tom,
 *      2026-09-04: "just put the pet pieces on a version of the lizard that
 *      isnt animated for this."
 *   2. SWAPPING RENDERER CHANGES THE SIZE. The static and animated stages are
 *      normalised by two different functions (staticMassScale, petMassScale)
 *      that disagree by 1.28% on C4, so a kit that switches stages can make the
 *      animal jump when it goes on. Nothing throws; you have to look.
 *   3. A MASK EITHER CLIPS OR IT DOES NOT. VISOR_EYES_POLICY 'clip' keeps the
 *      three eye items that project past the glass and masks them with the worn
 *      visor's own art alpha. Whether the lasers are actually bounded by the
 *      helmet is a fact about composited pixels; a source read proves only that
 *      a URL was emitted.
 *
 * HOW EVERY MEASUREMENT HERE IS MADE, and why it is not an eyeball:
 *
 *   Nothing is read off a getBoundingClientRect. A CSS box measures perfectly
 *   over a blank frame (tally/CLAUDE.md rule 1), and a detached node reports
 *   all-zero rects that arithmetic happily divides. So every claim below comes
 *   from a DIFFERENCE BETWEEN TWO SCREENSHOTS of the same rectangle of the same
 *   page: shoot it, hide exactly one layer, shoot it again, and the pixels that
 *   changed are that layer's contribution and nothing else. The background is
 *   identical in both, so no keying, no threshold on "what looks like art", and
 *   a layer that paints nothing produces a diff of zero and fails.
 *
 *   The comparison itself runs in the PAGE's own canvas (an <img> from the
 *   base64 screenshot into getImageData), which is how tests/crate-palette-
 *   audit.mjs reads pixels here: it keeps this file free of an image library
 *   and it decodes Chrome's own PNG with Chrome.
 *
 *   ANIMATION IS FROZEN FIRST, deliberately and only for the SIZE rows. The
 *   lizard bobs +-4px and a fly loops above its head; comparing an animated
 *   stage to a static one at two random phases would measure the phase. This is
 *   not "verify an animation by calling its function": nothing here grades
 *   motion. It grades a size, and a size is only a number when the clock is
 *   pinned. The fly is hidden by name for the same reason and the row fails if
 *   the fly element is not there to hide, so a rename cannot disarm it.
 *
 * THE ROWS:
 *   SAMPLE       setup: three lizard instances, the garments owned, a wardrobe
 *                tile to tap, a Stable card with a pet in it. Exits 2.
 *   PET-CONTROL  the negative that makes everything else mean something: with
 *                the garments OWNED and NOTHING worn, the lizard draws one
 *                layer and the diff against a hidden pet is the ANIMATED stage.
 *   PET-WEARS    tap the real wardrobe tile: base + both garments + four tint
 *                spans, every image decoded and every span a non-zero box, on
 *                all three lizards (C4, C4 shiny, CX) and on two surfaces.
 *   PET-SIZE     the animal is the same size with the kit on as with it off.
 *                Ink measured from the screenshot diff, not from the box.
 *   PET-TINT     the kit is the TEAM's colour on all three lizards: render each
 *                lizard under a navy team and a yellow team, and the pixels
 *                that differ between those two renders are exactly the tinted
 *                ones. Each render's mean over that mask has to be nearer its
 *                OWN team's primary than the other's, which no constant-colour
 *                garment can pass.
 *   PET-REGISTER the tinted region lands in the SAME place on all three
 *                lizards, which is the claim "they are all the same base frame"
 *                measured rather than assumed.
 *   VISOR-CLIP   no eye pixel lands outside the helmet silhouette. The eye's
 *                contribution and the helmet's own painted area are two
 *                independent screenshot diffs, so "outside the helmet" is a set
 *                difference over measured pixels and not a guess at an alpha.
 *   VISOR-SEEN   and the lasers are still THERE: the eye layer contributes a
 *                non-zero number of pixels through the glass. Without this,
 *                VISOR-CLIP passes on an eye layer that was deleted.
 *   VISOR-CONTROL the same measurement, on the same frame, with the mask turned
 *                off in the live DOM. It must report a real escape. This is the
 *                row that proves VISOR-CLIP can fail at all.
 *
 * PROVE-RED, to run in a `cp -R` throwaway before believing this file:
 *   drop `wearsFootball` from petSpriteHtml (i.e. revert job 1)
 *     -> PET-WEARS on all three lizards and both surfaces, PET-TINT, PET-REGISTER
 *   petScale keyed on ANIMATED_PETS again instead of on the stage
 *     -> PET-SIZE alone, by ~1.3% of the ink height
 *   .eye-clip's mask-size fixed at `100% 100%` instead of var(--av-fit)
 *     -> VISOR-CLIP (the clip slides off the art on a `cover` surface)
 *   visorClipMask returning null
 *     -> VISOR-CLIP, with VISOR-CONTROL reporting the same number (which is
 *        itself the tell: control == live means nothing is being clipped)
 *
 * Run: node tests/football-render-audit.mjs [baseUrl] [--shots DIR]
 * HEADLESS_MODE=shell on this Mac. Self-serving: with no URL it serves this
 * checkout, so it can never grade production.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, settle, setWidth, serveTree } from './godmode.js';
import { FOOTBALL_TEAMS, FOOTBALL_TEAM_BY_ID, FOOTBALL_PETS, footballItemId, VISOR_BLOCKED_EYES } from '../data/football-teams.js';
import { BH_BY_ID, PET_CROP, bhFamilyKey } from '../data/boneheadz.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};
const setup = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'SETUP'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) { console.log('\n  This audit GRADED NOTHING.'); process.exit(2); }
};

const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) mkdirSync(auditOutputPath(SHOTS), { recursive: true });

/* TWO TEAMS AT OPPOSITE ENDS OF THE GAMUT, so "the tint follows the team" is a
   question the mean colour can actually answer: a very dark navy and a bright
   yellow. Same two the pure audit's TINT row uses for the same reason. */
const NAVY = 'boneyard-bruisers', GOLD = 'windrow-wasps';
/* The two garments Cam drew for the lizard, 2026-09-04, named in
   data/football-teams.js FOOTBALL_GARMENTS as the two rows carrying `pets`
   (docs/FOOTBALL-KIT.md section 1). Both are driven, because Tom's ruling was
   about the pet PIECES and not about one of them. */
const PET_GARMENTS = ['pet-helmet', 'pet-jersey'];
const EYE = 'E11-1';                                  // Red Lasers, the worst escape at 2068px
const VISOR = 'visor90';                              // the darkest glass

setup('SAMPLE the two teams and the blocked eye item this file drives are real',
  !!FOOTBALL_TEAM_BY_ID[NAVY] && !!FOOTBALL_TEAM_BY_ID[GOLD] && VISOR_BLOCKED_EYES.has(EYE) && !!BH_BY_ID[EYE],
  `${FOOTBALL_TEAM_BY_ID[NAVY]?.name} ${FOOTBALL_TEAM_BY_ID[NAVY]?.a} vs ${FOOTBALL_TEAM_BY_ID[GOLD]?.name} ${FOOTBALL_TEAM_BY_ID[GOLD]?.a}; ${EYE} = ${BH_BY_ID[EYE]?.name}`);
setup('SAMPLE both lizard species are declared wearers, so all three instances below have something to put on',
  FOOTBALL_PETS.includes('C4') && FOOTBALL_PETS.includes('CX'), FOOTBALL_PETS.join(', '));

const rgb = hx => [1, 3, 5].map(i => parseInt(hx.slice(i, i + 2), 16));
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

/* ------------------------------------------------------------------ live ---- */
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--') && /^https?:/.test(a));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || process.env.URL || srv.url;
const { browser, page } = await boot(base);

/* THE CLOCK IS PINNED FOR THE PIXEL ROWS. See the header: this measures sizes
   and colours, never motion, and an unpinned bob turns a size into a coin toss.
   Re-applied after every reload because a reload throws the stylesheet away. */
const freeze = () => page.addStyleTag({ content:
  '*, *::before, *::after { animation: none !important; transition: none !important; }' });

/* `clip` intersects the rect with an ancestor's, because a layer box is not
   always what you can SEE: .bh-anim is inset:0 of .hero-char, which hangs below
   the scene's own overflow:hidden, so the bottom 25% of its box is page
   background that no injected ground reaches. Measured on the first run: the
   BACKDROP control reported exactly that band as "covered by something". */
const rectOf = (sel, pad = 0, clip = null) => page.evaluate((s, p, c) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return null;
  const q = c ? document.querySelector(c)?.getBoundingClientRect() : null;
  const L = Math.max(0, r.left - p, q ? q.left : 0), T = Math.max(0, r.top - p, q ? q.top : 0);
  const R = Math.min(innerWidth, r.right + p, q ? q.right : innerWidth);
  const B = Math.min(innerHeight, r.bottom + p, q ? q.bottom : innerHeight);
  if (!(R > L && B > T)) return null;
  return { x: Math.floor(L), y: Math.floor(T), width: Math.max(1, Math.ceil(R - Math.floor(L))), height: Math.max(1, Math.ceil(B - Math.floor(T))) };
}, sel, pad, clip);

const shoot = async rect => { await settle(page); return page.screenshot({ clip: rect, encoding: 'base64' }); };
/* Hide by VISIBILITY, never by display or by removing the node: the layout must
   not move between the two shots or the diff measures the reflow. Returns a
   restore, and the count so a selector that matched nothing cannot pass. */
const hide = async sel => {
  const n = await page.evaluate(s => {
    const els = [...document.querySelectorAll(s)];
    els.forEach(e => { e.dataset.fbHidden = e.style.visibility || ''; e.style.visibility = 'hidden'; });
    return els.length;
  }, sel);
  return { n, restore: () => page.evaluate(s => document.querySelectorAll(s).forEach(e => { e.style.visibility = e.dataset.fbHidden || ''; delete e.dataset.fbHidden; }), sel) };
};
/* Shoot `rect`, hide `sel`, shoot again: the pixels that changed ARE that
   selector's contribution. `hidden` is reported so a diff over nothing (a
   selector that matched no element) reads as the setup failure it is. */
const contribution = async (rect, sel) => {
  const on = await shoot(rect);
  const h = await hide(sel);
  const off = await shoot(rect);
  await h.restore();
  return { on, off, hidden: h.n };
};
/* contribution + the diff, with `hidden` kept out of the shot bag: pixels()
   loads every key it is given as an image. */
const diffOf = async (rect, sel) => {
  const { on, off, hidden } = await contribution(rect, sel);
  return { ...(await pixels({ on, off }, 'diff')), hidden };
};

/* THE ONLY PIXEL MATHS IN THIS FILE, and it runs in the page's own canvas.
   DIFF  count + bounding box + mean colour of the pixels that changed
   OUTSIDE  the same, restricted to pixels NOT inside a second diff's mask,
            dilated by `grow` so an anti-aliased seam is not an escape. */
const THRESH = 10;      // sum of |dR|+|dG|+|dB|; lossless PNGs, so this is AA noise only
const pixels = (shots, op, grow = 1) => page.evaluate(async (shots, op, grow, T) => {
  const load = s => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('bad shot')); i.src = 'data:image/png;base64,' + s; });
  const imgs = {};
  for (const k of Object.keys(shots)) imgs[k] = await load(shots[k]);
  const w = imgs[Object.keys(shots)[0]].naturalWidth, h = imgs[Object.keys(shots)[0]].naturalHeight;
  for (const k of Object.keys(imgs)) if (imgs[k].naturalWidth !== w || imgs[k].naturalHeight !== h) return { err: `${k} is ${imgs[k].naturalWidth}x${imgs[k].naturalHeight}, expected ${w}x${h}` };
  const grab = img => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
  const D = {}; for (const k of Object.keys(imgs)) D[k] = grab(imgs[k]);
  const maskOf = (a, b) => {
    const m = new Uint8Array(w * h);
    const A = D[a], B = D[b];
    for (let i = 0, k = 0; i < A.length; i += 4, k++) {
      if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > T) m[k] = 1;
    }
    return m;
  };
  const stats = (m, src) => {
    const S = D[src];
    let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; const sum = [0, 0, 0];
    for (let k = 0; k < m.length; k++) {
      if (!m[k]) continue;
      const x = k % w, y = (k / w) | 0;
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      sum[0] += S[k * 4]; sum[1] += S[k * 4 + 1]; sum[2] += S[k * 4 + 2];
    }
    return n ? { w, h, n, x0, y0, x1, y1, bw: x1 - x0 + 1, bh: y1 - y0 + 1, mean: sum.map(s => s / n) } : { w, h, n: 0 };
  };
  if (op === 'diff') return stats(maskOf('on', 'off'), 'on');
  /* COVERAGE, NOT CONTRIBUTION, and the difference is the whole soundness of the
     row below. The first version of this file asked "where does the helmet
     change the picture", which is not the same question as "where is the
     helmet": measured 2026-09-04, the dark glass sits over the skull's own dark
     eye sockets and changes almost nothing there, so 904 laser pixels sitting
     squarely INSIDE the helmet were reported as escapes. A screenshot diff
     against the page's own background cannot answer an alpha question.
     So the layer is shot alone over a BLACK ground and again over a WHITE one.
     Anything the layer covers is attenuated between the two; bare background
     swings the full 255. alpha = 1 - swing/255, per pixel, and it is a fact
     about the layer rather than about what happens to be behind it. */
  const alphaOf = (a, b) => {
    const A = D[a], B = D[b], m = new Uint8Array(w * h);
    for (let i = 0, k = 0; i < A.length; i += 4, k++) {
      const swing = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
      if (255 - swing > 8) m[k] = 1;                 // covered at all (alpha > ~3%)
    }
    return m;
  };
  const count = m => m.reduce((a, b) => a + b, 0);
  /* THE MEASURABLE REGION. The ground swap does not reach every pixel of the
     rectangle: measured 2026-09-04, the bottom 25% of .bh-anim's box sits under
     something opaque and constant that no injected background gets behind, so
     it never swings and would read as "covered by the helmet" everywhere. So
     the blank pair defines where an alpha CAN be read, every coverage below is
     restricted to it, and any eye pixel falling outside it is reported rather
     than silently excused: an escape hiding in an unmeasurable band would be
     exactly the bug this file is for. */
  const blank = alphaOf('bgA', 'bgB');
  const usable = new Uint8Array(w * h);
  for (let k = 0; k < blank.length; k++) usable[k] = blank[k] ? 0 : 1;
  if (op === 'empty') {
    let firstBad = h;
    for (let y = 0; y < h && firstBad === h; y++) for (let x = 0; x < w; x++) if (!usable[y * w + x]) { firstBad = y; break; }
    return { w, h, usable: count(usable), total: w * h, firstBad };
  }
  /* ESCAPE: eye coverage outside helmet coverage, the helmet grown by `grow`
     device pixels so an anti-aliased seam between two independently sampled
     alphas is not a laser escaping a helmet. */
  const eyeAll = alphaOf('eyeA', 'eyeB');
  const helm = alphaOf('helmA', 'helmB');
  const eye = new Uint8Array(w * h);
  for (let k = 0; k < eyeAll.length; k++) if (eyeAll[k] && usable[k]) eye[k] = 1;
  for (let k = 0; k < helm.length; k++) if (!usable[k]) helm[k] = 0;
  const big = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!helm[y * w + x]) continue;
    for (let dy = -grow; dy <= grow; dy++) for (let dx = -grow; dx <= grow; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < h && xx >= 0 && xx < w) big[yy * w + xx] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  let inside = 0;
  for (let k = 0; k < eye.length; k++) { if (!eye[k]) continue; if (big[k]) inside++; else out[k] = 1; }
  const o = stats(out, 'eyeA');
  return { ...o, escaped: o.n, eye: count(eye), helmet: count(big), inside, usable: count(usable), total: w * h };
}, shots, op, grow, THRESH);

const shot = async (name, rect) => {
  if (!SHOTS) return;
  await settle(page);
  const f = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: auditOutputPath(f), ...(rect ? { clip: rect } : {}) });
  console.log(`      shot: ${f}`);
};

try {
  await seed(page, { level: 20, coins: 400000 });
  await setWidth(page, 393, 852);

  /* GRANTED, NOT BOUGHT, and the reason is the flag rather than laziness: the
     kit is FOOTBALL_KIT_LIVE=false, so buyFootballItem refuses by design and
     there is no shelf to tap. The till is graded in tests/football-kit-audit.mjs
     (PRICE, PRICE-BUYPATH, BUNDLE-BUYPATH); this file grades the RENDER, and
     grantCosmetic is the same writer buyFootballItem calls once it has taken
     the money. */
  const petIds = t => PET_GARMENTS.map(g => footballItemId(t, g));
  const insts = await page.evaluate(async ids => {
    const loot = await import('/js/loot.js');
    await loot.grantPet('C4');
    await loot.grantPet('CX');
    await loot.addPetInstance('C4', { shiny: true });
    for (const id of ids) await loot.grantCosmetic(id, 'football');
    return (await loot.petInstances()).map(x => ({ iid: x.iid, sp: x.sp, shiny: !!x.shiny }));
  }, [...petIds(NAVY), ...petIds(GOLD)]);

  /* THE THREE LIZARDS Tom named: "make sure the cosmetics go on the shiny and
     the founders purple lizard because at the end of the day theyre all the
     same base frame." A shiny is an INSTANCE flag over the same species id, so
     the third one is found by that flag and not by a species that does not
     exist. */
  /* Tom, 2026-09-04: "make sure the cosmetics go on the shiny and the founders
     purple lizard because at the end of the day theyre all the same base
     frame." Three instances, exactly those three, and the shiny is found by its
     INSTANCE flag because there is no shiny species id to look up. */
  const LIZARDS = [
    { key: 'C4', inst: insts.find(x => x.sp === 'C4' && !x.shiny) },
    { key: 'C4-shiny', inst: insts.find(x => x.sp === 'C4' && x.shiny) },
    { key: 'CX', inst: insts.find(x => x.sp === 'CX') },
  ];
  setup('SAMPLE three lizard instances exist to dress: the Beardie, its shiny, and the Day One Lizard',
    LIZARDS.every(l => l.inst), LIZARDS.map(l => `${l.key}=${l.inst ? l.inst.iid : 'MISSING'}`).join(' '));

  const focus = async iid => {
    await page.evaluate(async i => { const loot = await import('/js/loot.js'); await loot.setEquippedPet(i); }, iid);
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2400);
    await freeze();
  };
  const openStable = async () => {
    await page.evaluate(() => { location.hash = '#/pets'; });
    await sleep(900);
    await page.evaluate(() => document.getElementById('stableBtn')?.click());
    await sleep(1700);
  };
  const STABLE_ART = '.cf-card.active .cf-art';
  /* DOM order is paint order inside one stage, so this list read top to bottom
     IS what the eye sees. Decoded (naturalWidth) and visible (a real rect) per
     layer, never inferred from the wrapper. */
  const stackAt = sel => page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    const box = el.querySelector('.petcrop') || el.querySelector('.petanim') || el;
    return {
      kind: el.querySelector('.petcrop') ? 'static' : el.querySelector('.petanim') ? 'animated' : 'none',
      imgs: [...box.querySelectorAll('img')].map(i => { const r = i.getBoundingClientRect(); return { src: i.getAttribute('src'), nw: i.naturalWidth, w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; }),
      tints: [...box.querySelectorAll('.fb-tint')].map(t => { const r = t.getBoundingClientRect(); const c = getComputedStyle(t); return { bg: c.backgroundColor, mask: (c.webkitMaskImage || c.maskImage || '').slice(0, 80), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; }),
    };
  }, sel);
  /* THE VISIBLE PANEL, NOT THE FIRST ONE IN THE DOCUMENT. Every species that can
     wear a piece gets its own .pet-wear panel, all of them built and all but the
     focused one `hidden` (the ring's spin handler flips that attribute rather
     than re-rendering). A bare [data-petwear=...] query therefore returns the
     HIDDEN lizard's tile about half the time, whose rect is 0x0, and a mouse
     click at 0,0 lands on the app's back button. Measured on the first run of
     this file: "1 of 2 tapped", with the whole screen navigated away. So the
     selector is scoped and a zero-sized hit is refused rather than clicked.
     THE TEAM IS PICKED FIRST. Since 2026-09-05 (bhFamilies on the Stable, then
     Tom's "two items then colours below" the same day) the panel draws ONE
     tile per garment family showing the rail's team, and a rail of team tiles
     under the row. So a colourway's own [data-petwear] tile exists only while
     its team is the rail's: a real click on that team's [data-pwteam] tile
     (render() runs) is what brings it up. */
  /* Two reads with a wait between: the team rail scrolls SMOOTHLY, so a rect
     read in the same tick as scrollIntoView is a rect mid-flight and the click
     lands on whichever tile happened to be passing (measured 2026-09-05: the
     Windrow Wasps tap landed on a neighbour and the helmet stayed navy). */
  const centreOf = async sel => {
    const found = await page.evaluate(s => { const b = document.querySelector(s); if (!b) return false; b.scrollIntoView({ block: 'center', inline: 'center' }); return true; }, sel);
    if (!found) return null;
    await sleep(500);
    return page.evaluate(s => {
      const r = document.querySelector(s).getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, sel);
  };
  const tapTile = async id => {
    const tileSel = `.pet-wear:not([hidden]) [data-petwear="${id}"]`;
    let hit = await centreOf(tileSel);
    if (!hit) {
      const team = await centreOf(`.pet-wear:not([hidden]) .fb-rail [data-pwteam="${BH_BY_ID[id].football.team}"]`);
      if (!team) return false;
      await page.mouse.click(team.x, team.y);
      await sleep(650);
      hit = await centreOf(tileSel);
    }
    if (!hit) return false;
    await page.mouse.click(hit.x, hit.y);
    await sleep(650);
    return true;
  };

  /* ---------------------------------------------------- PET-CONTROL ---- */
  await focus(LIZARDS[0].inst.iid);
  await openStable();
  const bare = await stackAt(STABLE_ART);
  setup('SAMPLE the Stable draws the focused lizard', !!bare && bare.kind !== 'none', bare ? `${bare.kind}, ${bare.imgs.length} image(s)` : 'no pet on the card');
  const bareRect = await rectOf(STABLE_ART, 24);
  setup('SAMPLE the pet has a rectangle to screenshot', !!bareRect, JSON.stringify(bareRect));
  /* The fly loops far above the creature and is not the animal, so it is out of
     every ink measurement. Hidden BY NAME and the count asserted, so a renamed
     layer fails here instead of quietly inflating the ink box. */
  const flyHide = await hide('.pa-fly');
  setup('SAMPLE the animated lizard has a fly layer to take out of the ink box', flyHide.n > 0, `${flyHide.n} .pa-fly element(s) hidden for the size rows`);
  const bareInk = await diffOf(bareRect, `${STABLE_ART} > *`);
  await flyHide.restore();
  ok('PET-CONTROL with both garments OWNED and NOTHING worn, the lizard draws its animated stage alone',
    bare.kind === 'animated' && bare.tints.length === 0 && bareInk.n > 0 && bare.imgs.every(i => i.nw > 0),
    `${bare.kind} stage, ${bare.imgs.length} layers, ${bare.tints.length} tint spans, ${bareInk.n} ink px in ${bareInk.bw}x${bareInk.bh} device px`);
  await shot('00-bare-lizard', bareRect);

  /* ---------------------------------------------------------- SHELF ---- */
  /* Tom, 2026-09-05 on v476: "the way you equip the lizard stuff in the stable
     means that you gotta scroll past all the helmet colours before you get to
     the shirt. it should be two items then colours below just like the boneheadz
     wardrobe." So: the garment row holds exactly one tile per family
     (bhFamilies over what this lizard owns, two here), each a real [data-petwear]
     tap, and a team rail sits under it with a tile per team. Proven red on v476
     (fca972e2): 0 garment tiles (the families were [data-petfam] tiles that
     opened their 32 colourways INLINE) and no rail. */
  const shelf = await page.evaluate(() => {
    const p = document.querySelector('.pet-wear:not([hidden])');
    if (!p) return null;
    const rail = p.querySelector('.fb-rail');
    return {
      sp: p.dataset.pwsp,
      garments: [...p.querySelectorAll('.pw-row:not(.fb-rail) [data-petwear]')].map(b => b.dataset.petwear),
      inline: p.querySelectorAll('.pw-row:not(.fb-rail) [data-petwear]').length,
      teams: rail ? rail.querySelectorAll('[data-pwteam]').length : 0,
      railBelow: rail ? rail.getBoundingClientRect().top >= p.querySelector('.pw-row:not(.fb-rail)').getBoundingClientRect().bottom : false,
      tap: rail ? Math.min(...[...rail.querySelectorAll('[data-pwteam]')].map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); })) : 0,
    };
  });
  const ownedPetFams = new Set(petIds(NAVY).concat(petIds(GOLD)).map(id => bhFamilyKey(BH_BY_ID[id]))).size;
  ok(`SHELF the lizard's wardrobe row is one tile per garment family (${ownedPetFams}) with a ${FOOTBALL_TEAMS.length}-team rail BELOW it, every team tile at least 40px`,
    !!shelf && shelf.inline === ownedPetFams && shelf.teams === FOOTBALL_TEAMS.length && shelf.railBelow && shelf.tap >= 40,
    shelf ? `${shelf.inline} garment tiles (${shelf.garments.join(' ')}), ${shelf.teams} team tiles, rail below row ${shelf.railBelow}, smallest team tile ${shelf.tap}px` : 'no visible wardrobe panel');
  /* OPERATE IT: wear the navy helmet, tap the yellow team, and the helmet on her
     must now be the yellow one, with the jersey still off. Then take it off
     again so PET-WEARS below starts from the bare lizard it expects. */
  const wornNavy = await tapTile(footballItemId(NAVY, 'pet-helmet'));
  const gold = await centreOf(`.pet-wear:not([hidden]) .fb-rail [data-pwteam="${GOLD}"]`);
  if (gold) { await page.mouse.click(gold.x, gold.y); await sleep(700); }
  const wearNow = await page.evaluate(async () => (await import('/js/loot.js')).petWear());
  const shownTile = await page.evaluate(() => document.querySelector('.pet-wear:not([hidden]) .pw-row:not(.fb-rail) .pw-item.on')?.dataset.petwear || null);
  ok(`SHELF-TEAM tapping a team tile recolours the worn garment: navy helmet on, tap ${FOOTBALL_TEAM_BY_ID[GOLD].name}, the helmet is now theirs and the jersey stays off`,
    wornNavy && !!gold && wearNow.CH === footballItemId(GOLD, 'pet-helmet') && !wearNow.CT && shownTile === footballItemId(GOLD, 'pet-helmet'),
    `navy tapped ${wornNavy}, team tile ${gold ? 'found' : 'MISSING'}, wear ${JSON.stringify(wearNow)}, worn tile shows ${shownTile}`);
  if (wearNow.CH) await tapTile(wearNow.CH);

  /* ---------------------------------------------------- STABLE-RAIL ---- */
  /* HANDOFFMASTER20260906 B9/B10 and R40-28..31, measured on v488: the rail
     listed 32 teams in catalogue order for an inventory of two, so the owned
     Glasswater helmet sat 3113px along a 3337px rail; a worn garment PINNED the
     rail to its own team so tapping another owned team did nothing; the toast
     told a player who owned that helmet "That colourway is not in your
     wardrobe"; a Locked tile read "Picked" with nothing worn; and the pick was a
     fresh `let` per open, so the scroll was paid again every visit. A THIRD team
     is granted with the helmet ONLY, so there is a real team that has one of her
     two pieces and lacks the other: that is the state every one of these rows
     needs and the two-team seed above cannot produce. */
  const GREEN = 'glasswater-gannets';
  setup('SAMPLE the third team the rail rows lean on is real', !!FOOTBALL_TEAM_BY_ID[GREEN], FOOTBALL_TEAM_BY_ID[GREEN]?.name);
  await page.evaluate(() => document.querySelector('.sheet-close')?.click());
  await sleep(600);
  await page.evaluate(async id => { const loot = await import('/js/loot.js'); await loot.grantCosmetic(id, 'football'); }, footballItemId(GREEN, 'pet-helmet'));
  await openStable();
  /* every toast the page shows, read off the real #toast as it changes */
  const armToasts = () => page.evaluate(() => {
    window.__toasts = [];
    const t = document.getElementById('toast');
    /* TEXT changes only. nextToast() writes textContent once per message, so
       that is one push per toast; watching attributes too re-pushed the OLD
       text when the `out` class landed 2.2s later (measured: RAIL-FULL-SWAP
       read the Gannets toast as a Wasps one). */
    new MutationObserver(() => { const s = (t.textContent || '').trim(); if (s) window.__toasts.push(s); })
      .observe(t, { childList: true, characterData: true, subtree: true });
  });
  await armToasts();
  /* a toast QUEUES behind one still showing (2.2s + 180ms exit), so a row that
     claims "nothing was said" waits out the previous toast before reading */
  const toasts = async (wait = 0) => { if (wait) await sleep(wait); return page.evaluate(() => window.__toasts.slice()); };
  const railRead = () => page.evaluate(() => {
    const p = document.querySelector('.pet-wear:not([hidden])'), rail = p && p.querySelector('.fb-rail');
    if (!rail) return null;
    const rr = rail.getBoundingClientRect();
    const tiles = [...rail.querySelectorAll('[data-pwteam]')].map((b, i) => {
      const r = b.getBoundingClientRect();
      return { i, team: b.dataset.pwteam, locked: b.classList.contains('locked'), on: b.classList.contains('on'), tag: b.querySelector('small').textContent.trim(),
        centre: Math.round(r.left + r.width / 2 - rr.left + rail.scrollLeft), inView: r.left >= rr.left - 1 && r.right <= rr.right + 1 };
    });
    const on = tiles.find(t => t.on) || null;
    return { view: rail.clientWidth, total: rail.scrollWidth, tiles, on: on && on.team, onTag: on && on.tag, onLocked: !!(on && on.locked), onInView: !!(on && on.inView),
      pickedLocked: tiles.filter(t => t.locked && /picked|worn/i.test(t.tag)).map(t => t.team),
      garments: [...p.querySelectorAll('.pw-row:not(.fb-rail) [data-petwear]')].map(b => b.dataset.petwear) };
  });
  const wearOf = () => page.evaluate(async () => (await import('/js/loot.js')).petWear());
  const tapTeam = async t => {
    const c = await centreOf(`.pet-wear:not([hidden]) .fb-rail [data-pwteam="${t}"]`);
    if (!c) return false;
    await page.mouse.click(c.x, c.y); await sleep(900);
    return true;
  };
  const r0 = await railRead();
  setup('SAMPLE the Stable rail is on screen with three owned teams to order', !!r0 && r0.tiles.filter(t => !t.locked).length === 3, r0 ? `${r0.tiles.filter(t => !t.locked).length} owned of ${r0.tiles.length}` : 'no rail');
  const owned0 = r0.tiles.filter(t => !t.locked), firstLocked = r0.tiles.findIndex(t => t.locked);
  /* the rail centre-snaps, so "on the first screen" is measured as the scroll
     from the first owned tile's centre to the last one's: under one view */
  const ownedSpan = Math.max(...owned0.map(t => t.centre)) - Math.min(...owned0.map(t => t.centre));
  ok(`RAIL-ORDER owned teams come first, before every locked one, and the farthest owned team is under one screen of scrolling from the first (view ${r0.view}px of ${r0.total}px)`,
    owned0.every(t => t.i < firstLocked) && ownedSpan < r0.view && r0.onInView,
    `owned at positions ${owned0.map(t => `#${t.i + 1}`).join(' ')} (first locked #${firstLocked + 1}); ${ownedSpan}px from first owned centre to last, view ${r0.view}px; parked tile in view ${r0.onInView}`);
  await shot('06-stable-rail-393');
  /* both NAVY pieces on, then tap the team that has only the helmet */
  const navyOn = [await tapTile(footballItemId(NAVY, 'pet-helmet')), await tapTile(footballItemId(NAVY, 'pet-jersey'))];
  const w0 = await wearOf();
  setup('SAMPLE both navy pieces are on before the half-swap', navyOn.every(Boolean) && w0.CH === footballItemId(NAVY, 'pet-helmet') && w0.CT === footballItemId(NAVY, 'pet-jersey'), JSON.stringify(w0));
  await page.evaluate(() => { window.__toasts = []; });
  const greenTapped = await tapTeam(GREEN);
  const w1 = await wearOf(), r1 = await railRead(), t1 = await toasts();
  const jerseyLbl = 'Lizard Jersey';
  ok(`RAIL-TOAST tapping ${FOOTBALL_TEAM_BY_ID[GREEN].name} (helmet owned, jersey not) names the piece that is missing and never says the colourway is not in your wardrobe`,
    greenTapped && t1.length >= 1 && t1.every(s => s.includes(jerseyLbl) && s.includes(FOOTBALL_TEAM_BY_ID[GREEN].name) && !/colourway is not in your wardrobe/i.test(s)),
    `toasts: ${JSON.stringify(t1)}`);
  ok(`RAIL-HALF-SWAP the helmet she has in ${FOOTBALL_TEAM_BY_ID[GREEN].name} swaps, the jersey she lacks stays navy, and the rail parks on the tapped team`,
    greenTapped && w1.CH === footballItemId(GREEN, 'pet-helmet') && w1.CT === footballItemId(NAVY, 'pet-jersey') && !!r1 && r1.on === GREEN && !r1.onLocked,
    `wear ${JSON.stringify(w1)}, rail on ${r1 && r1.on} (${r1 && r1.onTag})`);
  /* the team that has both: a full swap, no toast at all */
  await page.evaluate(() => { window.__toasts = []; });
  const goldTapped = await tapTeam(GOLD);
  const w2 = await wearOf(), r2 = await railRead(), t2 = await toasts(1500);
  ok(`RAIL-FULL-SWAP tapping ${FOOTBALL_TEAM_BY_ID[GOLD].name} (both pieces owned) swaps both and says nothing`,
    goldTapped && w2.CH === footballItemId(GOLD, 'pet-helmet') && w2.CT === footballItemId(GOLD, 'pet-jersey') && t2.length === 0 && !!r2 && r2.on === GOLD && r2.onTag === 'Worn',
    `wear ${JSON.stringify(w2)}, toasts ${JSON.stringify(t2)}, rail on ${r2 && r2.on} (${r2 && r2.onTag})`);
  /* everything off, then a Locked team: nothing applies, nothing reads Picked on a Locked tile, and the toast is true */
  await tapTile(w2.CH); await tapTile(w2.CT);
  const w3 = await wearOf();
  setup('SAMPLE the lizard is bare before the locked tap', !w3.CH && !w3.CT, JSON.stringify(w3));
  const LOCKED = r0.tiles.find(t => t.locked).team;
  await page.evaluate(() => { window.__toasts = []; });
  const lockedTapped = await tapTeam(LOCKED);
  const r4 = await railRead(), t4 = await toasts();
  ok(`RAIL-LOCKED tapping a Locked team (${FOOTBALL_TEAM_BY_ID[LOCKED].name}) with nothing on does not park the rail on it, no Locked tile reads Picked, and the toast names that team truthfully`,
    lockedTapped && !!r4 && r4.on === GOLD && r4.pickedLocked.length === 0 && t4.length >= 1 && t4.every(s => s.includes(FOOTBALL_TEAM_BY_ID[LOCKED].name) && !/colourway is not in your wardrobe/i.test(s)),
    `rail on ${r4 && r4.on} (${r4 && r4.onTag}), locked tiles reading Picked/Worn: ${JSON.stringify(r4 && r4.pickedLocked)}, toasts ${JSON.stringify(t4)}`);
  /* the pick survives a close, a reload and a reopen */
  await focus(LIZARDS[0].inst.iid);
  await openStable();
  const r5 = await railRead();
  ok(`RAIL-REMEMBERS after a reload and a fresh open with nothing worn the rail is still parked on the last team picked (${FOOTBALL_TEAM_BY_ID[GOLD].name}), in view, and the garment tiles show that team`,
    !!r5 && r5.on === GOLD && r5.onInView && r5.garments.includes(footballItemId(GOLD, 'pet-helmet')),
    `rail on ${r5 && r5.on} (${r5 && r5.onTag}), in view ${r5 && r5.onInView}; garment tiles ${r5 && r5.garments.join(' ')}`);
  /* the SE: same rail, 320 wide, parked tile still in view */
  await setWidth(page, 320, 568);
  await sleep(600);
  await page.evaluate(() => document.querySelector('.pet-wear:not([hidden]) .fb-rail')?.scrollIntoView({ block: 'center' }));
  await sleep(400);
  const r6 = await railRead();
  ok(`RAIL-SE at 320px the parked team is in view and every owned team is within one screen of it`,
    !!r6 && r6.on === GOLD && r6.onInView && (Math.max(...r6.tiles.filter(t => !t.locked).map(t => t.centre)) - Math.min(...r6.tiles.filter(t => !t.locked).map(t => t.centre))) < r6.view,
    r6 ? `view ${r6.view}px, parked ${r6.on} in view ${r6.onInView}, owned centres ${r6.tiles.filter(t => !t.locked).map(t => t.centre).join(' ')}` : 'no rail');
  await shot('07-stable-rail-320');
  await setWidth(page, 393, 852);
  await sleep(400);

  /* ------------------------------------------------------ PET-WEARS ---- */
  const worn = [];
  for (const g of PET_GARMENTS) worn.push(await tapTile(footballItemId(NAVY, g)));
  setup('SAMPLE both football tiles are in the lizard\'s wardrobe and could be tapped', worn.every(Boolean), `${worn.filter(Boolean).length} of ${PET_GARMENTS.length} tapped`);

  const surfaces = [];
  for (const L of LIZARDS) {
    await focus(L.inst.iid);
    await openStable();
    surfaces.push({ key: `${L.key}/stable`, st: await stackAt(STABLE_ART) });
    await page.evaluate(() => { location.hash = '#/today'; });
    await sleep(2000);
    await freeze();
    surfaces.push({ key: `${L.key}/today`, st: await stackAt('#bhStage .hero-companion') });
  }
  /* WHAT "WEARING IT" MEANS, measured per surface: the STATIC canvas (the only
     one that paints worn layers), three images (base + two garments) all
     decoded and boxed, and four .fb-tint spans (two colours x two garments)
     each a real box carrying a mask and a colour. */
  const wearBad = surfaces.filter(s => !s.st || s.st.kind !== 'static' || s.st.imgs.length !== 3
    || !s.st.imgs.every(i => i.nw > 0 && i.w > 0 && i.h > 0)
    || s.st.tints.length !== 4 || !s.st.tints.every(t => t.w > 0 && t.h > 0 && /url\(/.test(t.mask) && /^rgb/.test(t.bg)));
  ok('PET-WEARS all three lizards wear both football garments, on the static canvas, decoded and boxed, on both surfaces',
    surfaces.length === 6 && wearBad.length === 0,
    wearBad.length
      ? wearBad.map(s => `${s.key}: ${s.st ? `${s.st.kind}, ${s.st.imgs.length} imgs, ${s.st.tints.length} tints` : 'nothing rendered'}`).join('; ')
      : surfaces.map(s => `${s.key} ${s.st.kind} ${s.st.imgs.length}img/${s.st.tints.length}tint`).join(', '));
  await shot('01-today-kit-on');

  /* ---------------------------------------------------------- STAGE ---- */
  /* THE SURFACE PET-WEARS ABOVE DOES NOT REACH. The Stable and Today draw a
     dressed pet through croppedPetImg, the ONE function graded above; the
     Wardrobe's Backpack/Build tab draws the SAME pet through avatarLayersHtml's
     own stack, where a body-canvas pet is one more layer beside the player's
     own gear rather than a box of its own. Tom, 2026-09-04 (re-affirmed here):
     "the pet kit renders on the lizard, on every surface." Still wearing the
     NAVY kit PET-WEARS just equipped above (petWear is one global kv row, not
     per-species, so nothing has to be re-tapped), on all three lizards. */
  const openBackpack = async () => {
    await page.evaluate(() => { location.hash = '#/bonehead'; });
    await sleep(900);
    await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="crates"]')?.click());
    await sleep(900);
    await freeze();
  };
  const STAGE_SEL = '.bh-stage.lg';
  const petSlotOf = g => BH_BY_ID[footballItemId(NAVY, g)].slot;    // -> CH, CT
  const stageTintSel = PET_GARMENTS.map(g => `${STAGE_SEL} .fb-tint[data-fbslot="${petSlotOf(g)}"]`).join(', ');
  const rgbFromCss = s => (s.match(/\d+/g) || []).map(Number);
  const teamRGBs = [rgb(FOOTBALL_TEAM_BY_ID[NAVY].a), rgb(FOOTBALL_TEAM_BY_ID[NAVY].b)];
  const stageRows = [];
  for (const L of LIZARDS) {
    await focus(L.inst.iid);
    await openBackpack();
    const rect = await rectOf(STAGE_SEL, 12);
    /* THE SAME CONTRIBUTION MEASUREMENT VISOR-SEEN uses above: shoot the rect,
       hide the worn layers (`.pw`, the class avatarLayersHtml now shares with
       croppedPetImg's own worn layers), shoot again. Non-zero ink IS "the
       lizard differs from the bare-lizard render", measured rather than
       eyeballed, and `hidden` proves both garments were actually there to
       hide (2: helmet + jersey). */
    const wornInk = rect ? await diffOf(rect, `${STAGE_SEL} img.pw`) : { n: 0, hidden: 0 };
    const tints = rect ? await page.evaluate(sel => [...document.querySelectorAll(sel)].map(t => {
      const r = t.getBoundingClientRect(); const c = getComputedStyle(t);
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), bg: c.backgroundColor };
    }), stageTintSel) : [];
    stageRows.push({ key: L.key, rect: !!rect, wornInk: wornInk.n, hidden: wornInk.hidden, tints });
  }
  const stageBad = stageRows.filter(r => !r.rect || r.hidden !== PET_GARMENTS.length || r.wornInk <= 0
    || r.tints.length !== 4
    || !r.tints.every(t => t.w > 0 && t.h > 0 && teamRGBs.some(c => dist(rgbFromCss(t.bg), c) < 2)));
  ok('STAGE the lizard on the Wardrobe stage (avatarLayersHtml\'s own stack, not croppedPetImg) wears its football kit too, tinted to the team\'s own hex, on all three lizards',
    stageRows.length === 3 && stageBad.length === 0,
    stageBad.length
      ? stageBad.map(r => `${r.key}: ${!r.rect ? 'no .bh-stage.lg' : `${r.wornInk}px worn ink (${r.hidden}/${PET_GARMENTS.length} worn layer(s) found), ${r.tints.length} tint span(s) ${JSON.stringify(r.tints)}`}`).join('; ')
      : stageRows.map(r => `${r.key} ${r.wornInk}px worn ink, ${r.tints.length} tints`).join(', '));
  await shot('01b-stage-kit-on', await rectOf(STAGE_SEL, 12));

  /* -------------------------------------------------------- PET-SIZE ---- */
  /* Tom's trade is the animation, NOT the size: the animal must not jump when
     the kit goes on. Both inks measured on the same card, at the same px, with
     the clock pinned and the fly out, so the only difference left is the
     renderer. */
  await focus(LIZARDS[0].inst.iid);
  await openStable();
  /* THE RECTANGLE IS RE-MEASURED ON BOTH SIDES, never carried across a tap.
     Tapping a wardrobe tile scrolls the tile into view, which takes the card
     off the top of the viewport: the first run of this file reused the rect
     from before the taps and measured 0 ink, i.e. it screenshotted a patch of
     empty page twice and reported them identical. So each side scrolls the card
     back to the middle and asks for its own rect, and only the ink's SIZE is
     compared across the two. */
  const petRect = async () => {
    await page.evaluate(s2 => document.querySelector(s2)?.scrollIntoView({ block: 'center' }), STABLE_ART);
    await sleep(400);
    return rectOf(STABLE_ART, 24);
  };
  /* THE ANIMAL, NOT THE OUTFIT. The first run compared the whole drawn thing and
     reported a 46-device-px height difference, which was entirely the helmet
     standing proud of the skull and the jersey hanging below it: correct
     pixels, wrong question. So the worn layers (`.pw`, images and tint spans
     alike) come off for this row and what is measured on both sides is the
     LIZARD. */
  const pwOff = await hide(`${STABLE_ART} .pw`);
  setup('SAMPLE the worn layers can be taken off the render, so PET-SIZE measures the animal and not the outfit',
    pwOff.n >= 4, `${pwOff.n} worn layer(s)/tint span(s) hidden (2 garments + 4 tints expected)`);
  const kitOnInk = await diffOf(await petRect(), `${STABLE_ART} > *`);
  await pwOff.restore();
  /* Take the kit off through the REAL tiles, so the comparison is against the
     state a player actually has and not against a hand-written save. */
  for (const g of PET_GARMENTS) await tapTile(footballItemId(NAVY, g));
  const kitRect = await petRect();
  const offFly = await hide('.pa-fly');
  const kitOffInk = await diffOf(kitRect, `${STABLE_ART} > *`);
  await offFly.restore();
  /* WHAT THIS ROW CAN HONESTLY ASSERT, and it is not "the same bounding box".
     MEASURED 2026-09-04 on the Stable card at 124px, garments off, clock
     pinned: the animated lizard's ink is 264x179 and the static one's 260x194.
     They are two different DRAWINGS of the same animal at aspect 1.475 and
     1.345, so the boxes cannot match and a row demanding that they do would be
     red on correct code. What CAN be demanded is that the animal keeps its
     visual mass: the linear scale between the two inks, taken as the square
     root of the painted-pixel counts, is 0.989 today. 5% bounds that at three
     times its measured value while still catching every defect in this class --
     mass:false alone is 124px against 164 (a 0.76 ratio, 24% out) and a wrong
     crop or a lost scale is larger still. The 1.28% scale-function choice is
     NOT what this bounds, because the measurement above showed it is smaller
     than the difference between the drawings: see petScale in js/app.js. */
  const dh = Math.abs(kitOnInk.bh - kitOffInk.bh), dw = Math.abs(kitOnInk.bw - kitOffInk.bw);
  const linear = Math.sqrt(kitOnInk.n / kitOffInk.n);
  ok('PET-SIZE the lizard keeps its visual mass when the kit forces the static canvas: the stage changed, the animal did not',
    kitOnInk.n > 0 && kitOffInk.n > 0 && Math.abs(linear - 1) <= 0.05,
    `static (kit on, garments off) ${kitOnInk.bw}x${kitOnInk.bh} = ${kitOnInk.n}px of ink, animated (kit off) ${kitOffInk.bw}x${kitOffInk.bh} = ${kitOffInk.n}px, linear ratio ${linear.toFixed(4)} (box delta ${dw}x${dh} device px, which is the two drawings' aspects: ${(kitOnInk.bw / kitOnInk.bh).toFixed(3)} static vs ${(kitOffInk.bw / kitOffInk.bh).toFixed(3)} animated)`);
  await shot('02-kit-off', kitRect);

  /* -------------------------------------- PET-TINT and PET-REGISTER ---- */
  /* The two team renders differ ONLY in the tint, so the pixels that differ
     between them are exactly the tinted ones: no mask registration is computed
     here, it is measured. Then each render's mean over that mask must be nearer
     its own team's primary than the other's, which a garment painted one fixed
     colour cannot pass in either direction. */
  const wearTeam = async t => {
    await page.evaluate(async ids => {
      const loot = await import('/js/loot.js');
      const w = await loot.petWear();
      for (const s of Object.keys(w)) await loot.togglePetWear(w[s]);
      for (const id of ids) await loot.togglePetWear(id);
    }, petIds(t));
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2400);
    await freeze();
    await openStable();
  };
  const tints = [];
  for (const L of LIZARDS) {
    await focus(L.inst.iid);
    await wearTeam(NAVY);
    const r = await rectOf(STABLE_ART, 24);
    const navyShot = await shoot(r);
    await wearTeam(GOLD);
    const goldShot = await shoot(r);
    const m = await pixels({ on: navyShot, off: goldShot }, 'diff');
    const gm = await pixels({ on: goldShot, off: navyShot }, 'diff');
    tints.push({ key: L.key, n: m.n, box: m.n ? `${m.x0},${m.y0} ${m.bw}x${m.bh}` : 'empty',
      x0: m.x0, y0: m.y0, bw: m.bw, bh: m.bh, navyMean: m.mean, goldMean: gm.mean, err: m.err || gm.err });
    await shot(`03-tint-${L.key}`, r);
  }
  const A = rgb(FOOTBALL_TEAM_BY_ID[NAVY].a), B = rgb(FOOTBALL_TEAM_BY_ID[GOLD].a);
  const tintBad = tints.filter(t => t.err || !t.n || !t.navyMean
    || dist(t.navyMean, A) >= dist(t.navyMean, B) || dist(t.goldMean, B) >= dist(t.goldMean, A));
  ok(`PET-TINT the kit takes the TEAM's colour on all three lizards: ${FOOTBALL_TEAM_BY_ID[NAVY].name} reads nearer its own navy, ${FOOTBALL_TEAM_BY_ID[GOLD].name} nearer its own gold`,
    tints.length === 3 && tintBad.length === 0,
    tintBad.length
      ? tintBad.map(t => `${t.key}: ${t.err || `${t.n} px changed between the two teams` + (t.navyMean ? `, navy render mean ${t.navyMean.map(Math.round)} (dE ${dist(t.navyMean, A).toFixed(1)} to navy vs ${dist(t.navyMean, B).toFixed(1)} to yellow)` : '')}`).join('; ')
      : tints.map(t => `${t.key} ${t.n}px, navy ${dist(t.navyMean, A).toFixed(0)}<${dist(t.navyMean, B).toFixed(0)}, yellow ${dist(t.goldMean, B).toFixed(0)}<${dist(t.goldMean, A).toFixed(0)}`).join(' | '));

  /* "THEY ARE ALL THE SAME BASE FRAME", measured, and split in two because the
     two halves of that claim are true to different tolerances:

     THE SHINY IS EXACTLY THE SAME FRAME. C4's shiny is a recolour of C4.png on
     the same canvas with the same PET_CROP, so the kit has to land on the
     IDENTICAL device pixels. Zero tolerance, and it is the half that would
     break if the shiny ever got its own crop or its own scale.

     CX IS THE SAME FRAME TO WITHIN CAM'S OWN CROP. The Day One Lizard is C4
     recoloured, but its measured ink box is not byte-identical: PET_CROP has
     C4 at 0.5344..0.8891 x 0.6250..0.8938 and CX at 0.5375..0.8859 x
     0.6281..0.8906, a 0.0032-of-the-square difference. croppedPetImg fits the
     INK to 82% of the box, so a marginally smaller ink means a marginally
     larger canvas behind it and the garment (registered to the canvas, as it
     must be) comes out ~2% bigger on CX. That is Cam's art, not the renderer,
     so the bound is DERIVED FROM PET_CROP rather than typed: a real
     mis-registration is tens of pixels, and this is under three. */
  const byKey = Object.fromEntries(tints.map(t => [t.key, t]));
  const same = ['x0', 'y0', 'bw', 'bh'].every(k => byKey['C4'][k] === byKey['C4-shiny'][k]);
  ok('PET-REGISTER-SHINY the kit lands on the IDENTICAL pixels on the Beardie and on its shiny: the recolour is the same frame',
    byKey['C4'].n > 0 && byKey['C4-shiny'].n > 0 && same,
    `C4 ${byKey['C4'].box} vs shiny ${byKey['C4-shiny'].box}` + (same ? ' (identical)' : ' (MOVED)'));
  const cropScale = sp => { const c = PET_CROP[sp]; return 1 / Math.max(c.x1 - c.x0, c.y1 - c.y0); };
  const predicted = cropScale('CX') / cropScale('C4');
  const measured = byKey['CX'].bw / byKey['C4'].bw;
  ok('PET-REGISTER-CX the kit lands on the Day One Lizard where C4\'s own ink box says it must, so the drift is Cam\'s crop and not the renderer',
    byKey['CX'].n > 0 && Math.abs(measured - predicted) < 0.02
      && Math.abs(byKey['CX'].x0 - byKey['C4'].x0) <= 3 && Math.abs(byKey['CX'].y0 - byKey['C4'].y0) <= 3,
    `C4 ${byKey['C4'].box}, CX ${byKey['CX'].box}: size ratio measured ${measured.toFixed(4)} vs ${predicted.toFixed(4)} predicted from PET_CROP, origin moved ${byKey['CX'].x0 - byKey['C4'].x0},${byKey['CX'].y0 - byKey['C4'].y0} device px`);

  /* ------------------------------------------------------ VISOR-CLIP ---- */
  /* The helmet and the eyes on the PLAYER, on Today's hero, where the stack is
     object-fit COVER: that is the surface the .eye-clip mask has to follow with
     --av-fit, and a mask pinned to `100% 100%` slides off exactly here. */
  const helmetId = footballItemId(NAVY, VISOR);
  const equipped = await page.evaluate(async ([visor, eye]) => {
    const loot = await import('/js/loot.js');
    await loot.grantCosmetic(visor, 'football');
    await loot.grantCosmetic(eye, 'test');
    try { await loot.equip('H', visor); await loot.equip('E', eye); } catch (e) { return { err: String(e.message || e) }; }
    return await loot.equipped();
  }, [helmetId, EYE]);
  setup('SAMPLE the visor and the lasers could both be equipped (nothing refused them under this policy)',
    !equipped.err && equipped.H === helmetId && equipped.E === EYE,
    equipped.err ? `equip refused: ${equipped.err}` : `H=${equipped.H} E=${equipped.E}`);
  await page.evaluate(() => { location.hash = '#/today'; });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2600);
  await freeze();
  const stage = '#bhStage .bh-anim';
  const eyeSel = `${stage} img.eye-clip`;
  const helmSel = `${stage} img[src*="${VISOR}.png"]`;
  const wired = await page.evaluate((e, h) => ({
    eye: document.querySelectorAll(e).length, helm: document.querySelectorAll(h).length,
    mask: (getComputedStyle(document.querySelector(e) || document.body).webkitMaskImage || '').slice(0, 90),
    fit: getComputedStyle(document.querySelector(h) || document.body).objectFit,
  }), eyeSel, helmSel);
  setup('SAMPLE the hero really is wearing the dark visor with the lasers under it, and the eye layer carries the clip',
    wired.eye === 1 && wired.helm === 1 && /url\(/.test(wired.mask),
    `${wired.eye} clipped eye layer, ${wired.helm} visor layer (object-fit ${wired.fit}), mask ${wired.mask || 'NONE'}`);
  const heroRect = await rectOf(stage, 0, '#bhStage');
  setup('SAMPLE the hero stack has a rectangle to screenshot', !!heroRect, JSON.stringify(heroRect));
  await shot('04-visor-lasers', heroRect);

  /* ---- THE SILHOUETTE IS MEASURED AS ALPHA, NOT AS A DIFFERENCE ----
     Each layer is shot ALONE over a black ground and again over a white one;
     what the layer covers is attenuated between the two, bare ground swings the
     full 255. See the alphaOf note in pixels() for the 904-pixel false positive
     that made this necessary. BACKDROP is the control that the swap reaches the
     pixels at all: with every layer hidden, essentially the whole rectangle has
     to swing, or every "covered" reading below is meaningless. */
  const bgStyle = async hex => page.evaluate(h => {
    let el = document.getElementById('fbBg');
    if (!el) { el = document.createElement('style'); el.id = 'fbBg'; document.head.appendChild(el); }
    /* THE GROUND GOES ON .bh-anim ITSELF, not on the scene. .bh-anim is
       position:absolute inset:0 of .hero-char and IS the rectangle being shot,
       so its own background reaches every pixel of it and its layers paint on
       top. Painting the scene instead left a quarter of the rect on the page's
       own background, which does not swing at all and therefore read as
       "covered by something" -- caught by the BACKDROP control below on the
       first run, at 24.94%. The siblings that overlap the rect (the pet, the
       status row, the bubble) are hidden so nothing else can paint into it. */
    el.textContent = h === null ? '' : `#bhStage .bh-anim { background: ${h} !important; }
      #bhStage .hero-backdrop, #bhStage .hero-top, #bhStage .gw-row, #bhStage .hero-companion,
      #bhStage .hero-actions, #bhStage .bh-bubble { visibility: hidden !important; }`;
  }, hex);
  const onlyShow = sel => page.evaluate(s2 => {
    const keep = sel2 => new Set(document.querySelectorAll(sel2));
    const k = keep(s2);
    const all = [...document.querySelectorAll('#bhStage .bh-anim > *')];
    all.forEach(e => { e.dataset.fbV = e.style.visibility || ''; if (!k.has(e)) e.style.visibility = 'hidden'; });
    return { kept: all.filter(e => k.has(e)).length, of: all.length };
  }, sel);
  const showAll = () => page.evaluate(() => document.querySelectorAll('#bhStage .bh-anim > *')
    .forEach(e => { e.style.visibility = e.dataset.fbV || ''; delete e.dataset.fbV; }));
  const coverage = async (rect, sel) => {
    const o = sel === null ? { kept: 0, of: 0 } : await onlyShow(sel);
    if (sel === null) await onlyShow('#no-such-element');
    await bgStyle('#000'); const a = await shoot(rect);
    await bgStyle('#fff'); const b = await shoot(rect);
    await bgStyle(null); await showAll();
    return { a, b, kept: o.kept, of: o.of };
  };

  const blank = await coverage(heroRect, null);
  const emptySwing = await pixels({ bgA: blank.a, bgB: blank.b }, 'empty');
  setup('SAMPLE swapping the ground behind the stack reaches most of the rectangle, so an alpha can be read there at all',
    !emptySwing.err && emptySwing.usable / emptySwing.total > 0.6,
    emptySwing.err || `${emptySwing.usable} of ${emptySwing.total} px swing the full ground colour with every layer hidden (${(100 * emptySwing.usable / emptySwing.total).toFixed(1)}% measurable)`);

  /* WHERE THE LASERS ACTUALLY ARE, from the composited picture rather than from
     an alpha, because THIS diff is readable everywhere: hide the eye layer on
     the real screen and see what changes. It answers two questions at once --
     whether the lasers are drawn at all, and whether every pixel of them is
     inside the band where an alpha can be read below. An escape sitting in the
     unmeasurable band would be exactly the bug this file is for, so it is
     asserted rather than assumed. */
  const eyeC = await diffOf(heroRect, eyeSel);
  setup('SAMPLE every laser pixel sits inside the measurable region, so no escape can hide in the band the ground swap misses',
    !eyeC.err && eyeC.n > 0 && eyeC.y1 < emptySwing.firstBad,
    eyeC.err || `the eye layer changes ${eyeC.n} px, bottom row ${eyeC.y1}; the measurable band ends at row ${emptySwing.firstBad} of ${emptySwing.h}`);

  const eyeCov = await coverage(heroRect, eyeSel);
  const helmCov = await coverage(heroRect, helmSel);
  setup('SAMPLE each layer could be isolated for its own alpha', eyeCov.kept === 1 && helmCov.kept === 1,
    `eye ${eyeCov.kept} of ${eyeCov.of} layers kept, helmet ${helmCov.kept} of ${helmCov.of}`);
  const SHOTS4 = { bgA: blank.a, bgB: blank.b, eyeA: eyeCov.a, eyeB: eyeCov.b, helmA: helmCov.a, helmB: helmCov.b };
  const clipped = await pixels(SHOTS4, 'escape');

  /* Without VISOR-SEEN, VISOR-CLIP is green on an eye layer that was deleted,
     which is the failure mode 'hide' actually has. */
  ok('VISOR-SEEN the lasers are still drawn: the eye layer changes real pixels on the real screen, through the glass',
    !eyeC.err && eyeC.hidden === 1 && eyeC.n > 0 && clipped.inside > 0,
    eyeC.err || `${eyeC.n} px of the composited hero change when the eye layer is hidden; ${clipped.inside} px of eye alpha sit inside the ${clipped.helmet}px helmet silhouette`);
  ok('VISOR-CLIP no eye pixel lands outside the helmet silhouette',
    !clipped.err && clipped.eye > 0 && clipped.escaped === 0,
    clipped.err || `${clipped.escaped} escaped px of ${clipped.eye} eye px` + (clipped.escaped ? ` at ${clipped.x0},${clipped.y0} ${clipped.bw}x${clipped.bh}` : ''));

  /* THE CONTROL, and it is the row that gives VISOR-CLIP its meaning: turn the
     mask off in the live DOM, on the same frame, and re-run the same
     measurement. If it does not report an escape then the measurement cannot
     see one, and a green VISOR-CLIP above meant nothing. */
  await page.evaluate(s2 => { const e = document.querySelector(s2); e.style.webkitMaskImage = 'none'; e.style.maskImage = 'none'; }, eyeSel);
  const looseCov = await coverage(heroRect, eyeSel);
  const loose = await pixels({ ...SHOTS4, eyeA: looseCov.a, eyeB: looseCov.b }, 'escape');
  await shot('05-visor-lasers-unclipped', heroRect);
  ok('VISOR-CONTROL with the mask turned off in the live DOM the same measurement DOES report an escape, so the row above can fail',
    !loose.err && loose.escaped > 0 && loose.escaped > clipped.escaped,
    loose.err || `unclipped ${loose.escaped} escaped px of ${loose.eye} vs clipped ${clipped.escaped} of ${clipped.eye}`);

  /* ----------------------------------------------------------- PILL ---- */
  /* HANDOFFMASTER20260906 B11 (R40-20): the Locker Room poster's price pill was
     `white-space: nowrap` on a 203px string and ran past its own card by 7.0px
     at 393, 24.1px at 375 and 79.1px at 320, where it read "4,200 A PIECE, 16"
     and stopped. Measured as rects on the real Shop at the three widths. */
  await page.evaluate(() => { location.hash = '#/shop'; });
  await sleep(1200);
  const pillAt = async (w, h) => {
    await setWidth(page, w, h);
    await sleep(700);
    await page.evaluate(() => document.querySelector('.fb-drop .t3-price')?.scrollIntoView({ block: 'center' }));
    await sleep(300);
    const m = await page.evaluate(() => {
      /* measured against the poster's TEXT COLUMN (.tx), the box the pill is
         laid out in. The card clips (overflow hidden) and pads 14px on the
         right, so on origin/main at v493 the nowrap pill ran 23.0px past its
         column at 393 and 40.1px at 375 while ending 2px inside the card's
         border: a card-edge check reads that as healthy. */
      const pill = document.querySelector('.fb-drop .t3-price'), tx = pill && pill.closest('.tx'), card = pill && pill.closest('.t3-drop.fb-drop');
      if (!pill || !tx || !card) return null;
      const p = pill.getBoundingClientRect(), t = tx.getBoundingClientRect(), c = card.getBoundingClientRect();
      return { text: pill.textContent.trim().replace(/\s+/g, ' '), w: +p.width.toFixed(1), h: +p.height.toFixed(1), over: +(p.right - t.right).toFixed(1), left: +(p.left - t.left).toFixed(1), card: +(p.right - c.right).toFixed(1) };
    });
    if (w === 393 || w === 320) await shot(`08-price-pill-${w}`);
    return m;
  };
  const pills = { 393: await pillAt(393, 852), 375: await pillAt(375, 667), 320: await pillAt(320, 568) };
  const badPills = Object.entries(pills).filter(([, m]) => !m || !(m.w > 0 && m.h > 0) || m.over > 0.5 || m.left < -0.5 || m.card > 0);
  ok('PILL the Locker Room price pill stays inside its text column and its card at 393, 375 and 320 and still reads both prices',
    badPills.length === 0 && Object.values(pills).every(m => m && /a piece/.test(m.text) && /the lot/.test(m.text)),
    Object.entries(pills).map(([w, m]) => `${w}: ${m ? `${m.w}x${m.h}, past its column ${m.over}px, past the card ${m.card}px, "${m.text}"` : 'NO PILL'}`).join(' | '));
  await setWidth(page, 393, 852);

  /* -------------------------------------------------------- PET-WARN ---- */
  /* WARN BEFORE BUYING (Tom, 2026-09-06): a pet garment (or the bundle, which
     always includes both) is granted exactly as normal to a save with no
     lizard yet -- nothing is withheld or refunded -- but the confirm toast
     says the pieces wait in the Stable until one hatches. The PURE half (the
     petsPending flag, both ways, over mem-idb) is
     tests/football-kit-audit.mjs PET-WARN / PET-WARN-CONTROL; this is the
     one row in this file that reads a TOAST rather than a screenshot,
     because the claim is copy the player sees, not a rendered frame.
     Two teams THIS FILE HAS NOT TOUCHED ANYWHERE ABOVE (not NAVY, not GOLD),
     so both purchases below are genuinely unowned regardless of what ran
     earlier. This section runs LAST on purpose: the bundle purchase grants
     every remaining garment in every team, which would invalidate every
     ownership assumption a row above it depends on. */
  const WARN_A = FOOTBALL_TEAMS[10].id, WARN_B = FOOTBALL_TEAMS[11].id;
  await page.evaluate(() => {
    window.__toastLog = [];
    const el = document.getElementById('toast');
    if (!el) return;
    new MutationObserver(records => {
      for (const r of records) {
        if (r.type !== 'attributes' || r.attributeName !== 'hidden') continue;
        if (r.oldValue === null) continue;            // just became hidden
        const t = (el.textContent || '').trim();
        if (t) window.__toastLog.push(t);
      }
    }).observe(el, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
  });
  /* Scoped to entries at or after `since` (a log length snapshot taken right
     before the action), never the whole cumulative log: a slow-to-land toast
     from an EARLIER purchase matching the same pattern must not be read as
     THIS purchase's confirm. Polls to a deadline rather than a fixed sleep,
     same reason tests/redeem-audit.mjs does: toast timing varies with how
     many rows a purchase grants (32 ids for one garment, more for the
     bundle), and a constant chosen between two real durations is a coin
     toss either way. */
  const logLen = () => page.evaluate(() => (window.__toastLog || []).length);
  const toastSince = async (since, re, deadline = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < deadline) {
      const hit = await page.evaluate((s, r) => (window.__toastLog || []).slice(s).find(t => new RegExp(r, 'i').test(t)) || null, since, re.source);
      if (hit) return hit;
      await sleep(250);
    }
    return null;
  };

  await page.evaluate(() => { location.hash = '#/shop'; });
  await sleep(1200);
  await page.click('#fbSect summary').catch(() => {});
  await sleep(500);

  /* Arm-then-buy, same dance js/app.js's wireDropBuyButtons runs: one tap
     arms ("Tap again to buy"), a second inside 2600ms spends. */
  const buyTile = async (team, key) => {
    await page.select('#fbTeam', team);
    await sleep(400);
    const sel = `[data-buyfb="fb-${team}-${key}"]`;
    await page.waitForSelector(sel, { timeout: 8000 });
    await page.click(sel);
    await sleep(150);
    await page.click(sel);
  };
  const buyBundle = async () => {
    const sel = '[data-buyfbkit="all"]';
    await page.waitForSelector(sel, { timeout: 8000 });
    await page.click(sel);
    await sleep(150);
    await page.click(sel);
  };

  /* CONTROL FIRST, while the three lizard instances seeded at SAMPLE (C4, its
     shiny, CX) are still owned: buying an unowned pet tile must NOT warn. */
  let since = await logLen();
  await buyTile(WARN_A, 'pet-helmet');
  const controlToast = await toastSince(since, /is yours/);
  const controlWarned = await toastSince(since, /wait.*Stable|Stable.*hatch/, 2000);
  ok('PET-WARN-CONTROL a save that already owns a lizard buys a pet tile with no "wait in the Stable" line, so the row below can fail',
    !!controlToast && !controlWarned,
    `toast: ${JSON.stringify(controlToast)}`);

  /* FRESH: clear every pet instance so ownsFootballPet() is false, then buy a
     DIFFERENT still-unowned pet tile and the bundle (which always includes
     both pet garments). Nothing about the garment purchase itself changes --
     REPEAT/REPEAT-BUNDLE-style refusal is graded at the PURE layer -- only
     the confirm copy is under test here. */
  await page.evaluate(async () => { const { kvSet } = await import('/js/db.js'); await kvSet('petInst', []); });
  since = await logLen();
  await buyTile(WARN_B, 'pet-jersey');
  const freshTileToast = await toastSince(since, /wait.*Stable|Stable.*hatch/);
  ok('PET-WARN a fresh save with no lizard is warned buying a pet tile: the confirm toast says the pieces wait in the Stable',
    !!freshTileToast, `toast: ${JSON.stringify(freshTileToast)}`);

  since = await logLen();
  await buyBundle();
  const freshBundleToast = await toastSince(since, /wait.*Stable|Stable.*hatch/);
  ok('PET-WARN the same fresh save is warned buying the bundle too, which always includes both pet garments',
    !!freshBundleToast && /full kit/i.test(freshBundleToast), `toast: ${JSON.stringify(freshBundleToast)}`);

} finally {
  await browser.close().catch(() => {});
  if (srv) srv.close();
}

console.log(fails
  ? '\nFOOTBALL RENDER AUDIT: FAILED'
  : '\nFOOTBALL RENDER AUDIT: three lizards wear the kit at the size they always were, in their team\'s colours, and the lasers stay inside the helmet');
process.exit(fails);
