/* tests/hollow-scale-audit.mjs: DOES THE HOLLOW HOLD ONE WORLD SCALE.
 *
 * WHY THIS FILE EXISTS. The brief that commissioned it described rewriting an
 * invariant that read "48px art at exactly 2x". That invariant is a RENDERING
 * rule: it grades how the art was blitted, not how big the thing in it looks. A
 * sprite can be at a perfect integer scale and still depict a crow the size of a
 * shed, because apparent size comes from the INK inside the cell and the ink
 * fills between 83% and 100% of the box here (measured, printed on every run).
 * A box measurement cannot see that, and neither can a scale-factor check.
 *
 * NOTE FOR THE REVIEWER, on the record: there is no tests/hollow-scale-audit.mjs
 * on origin/main and none in the history of any branch (searched by path across
 * all refs), and none of the three hollow audits that DO exist carries a 48px or
 * 2x rule under another name. hollow-audit.mjs measures hit boxes, folds, cues
 * and motion; hollow-backdrop-audit.mjs measures coverage, blankness, inertness,
 * bands and piece GEOMETRY (element boxes, not ink); hollow-beds-audit.mjs
 * measures bed states by pixel difference. So this file is NEW, written against
 * what is on main, not a rewrite of something that was here.
 *
 * THE TWO ASSERTIONS, deliberately separate, because they are two properties and
 * a failure has to tell you which one broke:
 *
 *   SCALE  One metre is a fixed number of stage pixels. Each sprite declares
 *          what it depicts, in metres, in HEIGHTS below. The measured INK height
 *          must land within 15% of metres x PXPM. Direction and bound are
 *          printed for every row, over AND under.
 *   CRISP  Each sprite is drawn at an INTEGER multiple of its own viewBox, so a
 *          2.5-unit keyline never lands on a half pixel. This is a real rule
 *          about crisp art. It is NOT a rule about apparent size, which is the
 *          whole reason it is a second assertion with its own name.
 *
 * THE ANCHOR IS MEASURED, NOT ASSERTED. PXPM is not a constant in this file. It
 * is derived at run time from the measured ink height of hollow-fence-left
 * divided by the metres that piece declares, so the anchor can never drift away
 * from the art. What I measured, and why it is not the 76 the brief supplied:
 *
 *   hollow-fence-left  ink 132.0 x 47.0 stage px   (box 134 x 51)
 *   hollow-fence-right ink  65.5 x 57.0 stage px   (box  68 x 58)
 *
 *   The two fence files are one fence: a five-picket run with two rails, and a
 *   gate post on the right-hand piece. Both picket runs are the identical path
 *   (y115 to y160, 2-unit stroke), so the FENCE is 47.0 stage px of ink in both
 *   files. It is not 76 in either, and there is no 76 anywhere in the pack. The
 *   57.0 on the right is the gate POST, which stands proud of the fence on
 *   purpose and is declared separately below.
 *
 *   Which leaves what the 47 depicts. Declaring it a 1m fence gives 47 px/m, and
 *   at 47 px/m the keeper is 3.43m tall, the lantern post is 3.23m and a garden
 *   crow is 0.49m tall and 0.93m long. Declaring it a 0.60m low border fence
 *   gives 78.3 px/m, and at 78.3 the keeper is 2.06m, the lantern post is 1.94m,
 *   the crow is 0.29m, the crate 0.31m and the seed sack 0.45m. The second
 *   reading is the one the scene actually supports, and it lands within 3.0% of
 *   the 76 the brief supplied. So the brief's CONSTANT survives measurement; its
 *   premise (that the fence is 76px of ink depicting 1m) does not.
 *
 *   The keeper is the strongest independent referent in the picture, because
 *   human height is the least ambiguous quantity in it, and he is not an
 *   HLW_ART piece so he cannot be circular with this table. Measured on the real
 *   openHollow screen at 390x844: #hlwFlip ink 110.53 x 161.11 stage px, which
 *   is 2.06m at the anchor below. That measurement is what rules 47 px/m out.
 *
 * WHERE IT MEASURES. The rig is hollow-backdrop-audit's: the app's own
 * .hlw-vp > .hlw-stage with the shipped app.css, the real hollowBackdropHtml,
 * the rest of the page torn out so nothing else can contribute a pixel. The
 * stage is held at scale 1 so a stage pixel is a CSS pixel. Cross-checked
 * against the REAL screen (openHollow at 390x844, stage scale 0.959): fence
 * 46.92 vs 47.00, crow 22.94 vs 23.00 stage px. Section 0 re-measures the
 * anchor at 0.959 on every run so that agreement is asserted and not remembered.
 *
 * HOW INK IS MEASURED, and why not a plain screenshot diff. First version hid
 * the page and diffed the isolated piece against the same frame with the piece
 * hidden, which is tests/fight-layout-audit.mjs's inkOf. On this scene that
 * under-reads: app.css paints a near-black canvas (#0d0c12) and the crow is
 * #1d1b22 with a #17151d keyline, so the bird's head fell under the diff
 * threshold and the crow measured 16.5px instead of 23.0. Art that matches the
 * background is exactly the art an audit must not lose. So this is a true ALPHA
 * scan: the isolated piece is shot over white and over black, and
 * alpha = 1 - (white - black) / 255 per pixel, which is exact and independent of
 * the art's colour. Cutoff 0.5, which also drops the 25-30% cast shadows the
 * pieces carry (a shadow on the ground is not the object's height) and the
 * ambient glows. Every run measures a known 100x60 block through the same
 * pipeline first: if that does not come back 100x60 the instrument is broken and
 * nothing below it means anything.
 *
 * WHAT A FAILING RUN LOOKS LIKE:
 *   CALIBRATION  the 100x60 control block does not measure 100x60 +/- 0.5.
 *   EMPTY SAMPLE zero pieces matched, a declared piece missing from the render,
 *                zero ink pixels, or an ink height of 0. Never a pass.
 *   CROPPED      a piece's ink touches the edge of its own measuring crop and
 *                that edge is not the stage edge, so the number is a floor.
 *   COVERAGE     a drawn HLW_ART piece is in neither HEIGHTS nor NOT_MEASURED,
 *                or an entry names a piece that is not drawn or does not exist.
 *   SCALE        a sprite's ink is more than 15% off metres x PXPM.
 *   CRISP        a sprite is drawn at a non-integer multiple of its viewBox.
 *
 * Usage:  node tests/hollow-scale-audit.mjs
 * HLW_ROOT points it at another checkout (that is how prove-red runs it against
 * a mutated copy). It always serves a tree and never boots godmode's default,
 * which is the live production site.
 * An empty sample set is a FAILURE, never a pass.
 */
import { boot, serveTree, sleep } from './godmode.js';

const ROOT = process.env.HLW_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname);
const BOUND = 0.15;          // the SCALE tolerance, both directions
const ALPHA_CUT = 0.5;       // a pixel is ink at half coverage or more
const MARGIN = 40;           // stage px of slack around a piece's box when cropping
const BANDS = ['day', 'dusk', 'night'];

/* ── THE DECLARED TABLE. This is a DESIGN statement, not a measurement, and each
   row says what the sprite depicts and why that is the number. Rows marked
   `wide` are ones where the honest answer is a range rather than a value; they
   are printed on every run so nobody mistakes them for precision. ── */
const HEIGHTS = {
  'hollow-fence-left': { m: 0.60, anchor: true, why:
    'THE ANCHOR. Five pointed pickets on two rails, no post. A picket run of this '
    + 'proportion is a low garden border fence; 0.60m is the middle of the 0.45-0.75m '
    + 'that such a fence is built at. Rejected 1.0m: it puts the keeper at 3.43m and '
    + 'the lantern post at 3.23m, which nothing in the scene supports.' },

  'hollow-fence-right': { m: 0.72, why:
    'The same picket run plus the GATE POST and its cap. A gate post stands proud of '
    + 'its fence by about a fifth of the fence height so the gate has something to '
    + 'hang on, so 0.60 + 0.12. This row is NOT independent evidence about the world '
    + 'scale: it is rigidly tied to the anchor by the shared picket path. It is here '
    + 'so that a change to one fence file and not the other goes red.' },

  'hollow-crow': { m: 0.30, why:
    'A perched corvid, body and head, no legs to speak of. A carrion crow stands '
    + '0.28-0.35m at the crown when settled; 0.30 is the middle. Measured against '
    + 'the bird BEING 0.45-0.50m long nose to tail, which the sprite width also '
    + 'agrees with at this anchor.' },

  'hollow-shed': { m: 2.20, why:
    'A gable-roofed garden shed with a door, a window and plank cladding. Ridge '
    + 'height of a real one is 2.0-2.5m; 2.20 is the middle. This is the row I am '
    + 'most confident about in real-world terms and the one that FAILS, so read the '
    + 'failure note below before changing this number.' },

  'hollow-sign': { m: 2.10, why:
    'A gallows sign: a vertical post with an arm at the top and a plank on chains '
    + 'hanging under it, standing over the gate the path runs through. A sign you '
    + 'walk under needs 2.0-2.4m to the arm. 2.10 is the low end of that, chosen '
    + 'deliberately low so the row is not failing on an ambitious declaration.' },

  'hollow-shed-lantern': { m: 0.28, wide: true, why:
    'The small lantern hanging on the shed wall: cap, body and a glass panel. '
    + 'Hanging storm lanterns run 0.22-0.35m and this one is drawn as the little '
    + 'one, not the big one. UNCERTAIN: 0.28 is the middle of a range wide enough '
    + 'that this row could not fail either way at this anchor.' },

  'hollow-crate': { m: 0.32, why:
    'A slatted wooden produce crate stacked by the shed door, one cross-batten '
    + 'each way. Field crates are 0.25-0.40m tall; 0.32 is the middle.' },

  'hollow-sack': { m: 0.45, wide: true, why:
    'A tied hessian seed sack, gathered at the neck and standing up, so it is a '
    + 'part-filled one rather than a full 25kg sack lying over. 0.40-0.70m is the '
    + 'honest range for that. UNCERTAIN: 0.45 is the low end, which is what a '
    + 'standing part-filled sack looks like.' },

  'hollow-grass-tuft': { m: 0.27, why:
    'A three-blade tussock. Ornamental garden grass runs 0.20-0.40m; 0.27 is the '
    + 'middle. All three placements are measured, including the third, which the '
    + 'scene deliberately draws at 0.857x for variety (see SCATTER) and which '
    + 'therefore sits 12% under. That is inside the bound and is meant to be.' },

  'hollow-compost': { m: 0.65, why:
    'A compost heap with two barrows and a fork stuck in it. A heap you turn with '
    + 'a fork is 0.5-1.0m; 0.65 is a heap part way through its season. The barrows '
    + 'drawn on it are a cross-check: they come out at 0.15m wheels, which is a '
    + 'barrow.' },

  'hollow-lantern-post': { m: 1.95, why:
    'A garden lamp post: finial ring, cap, glazed body, base collar and a post '
    + 'running to the ground. Garden lamp posts are 1.8-2.4m so the light sits above '
    + 'head height; 1.95 is the low end of that. NOTE its ink is CLIPPED by the '
    + 'stage floor, so the measurement is a floor and the true figure is about 1 px '
    + 'more. The audit says so on the row rather than hiding it.' },
};

/* Drawn pieces that the metres rule deliberately does not cover. A drawn piece in
   neither table is a FAILURE, so a new prop cannot arrive unmeasured. */
const NOT_MEASURED = {
  'hollow-path-stone': 'a stepping stone lies FLAT in the path. Its vertical ink is the '
    + 'foreshortened plan view of an ellipse, not a height above the ground, so there is '
    + 'nothing for a metres-to-pixels rule to bite on. Its width would be a scale cue, but '
    + 'width in this diorama is foreshortened too and by an amount the scene never declares.',
  'hollow-lantern-flame': 'a flame is a light source, not an object standing on the ground: '
    + 'it is sized to READ at the lantern glass. It is also drawn only in the lit bands, and '
    + 'this audit measures the DAY band because that is the only one with no glow, no drop '
    + 'shadow and no firefly to contaminate an alpha scan.',
};

/* Pieces the scene deliberately rescales per instance, so the CRISP rule cannot
   apply to them. Each must exist, must be drawn, and must actually be off an
   integer somewhere: an exemption that excuses nothing is a stale exemption. */
const SCATTER = {
  'hollow-path-stone': 'hollow-scene.js draws the 13 stones at 13 comp radii through '
    + '`const s = rx / 21`, so the path does not read as a stamped repeat. Crispness is '
    + 'traded for variety, in the source, on purpose.',
  'hollow-grass-tuft': 'one asset, three placements, and TUFTS gives the third w:24 against '
    + 'a 28-unit viewBox (0.857x) so the three are not identical. Same trade, same reason.',
};

const fail = [];
const info = [];
const note = (cond, msg) => { if (!cond) fail.push(msg); };

const srv = await serveTree(ROOT);
console.log(`hollow-scale-audit: serving ${ROOT}`);
console.log(`hollow-scale-audit: URL ${srv.url}   (never the live default)`);
const { browser, page, errors } = await boot(srv.url);
const consoleErrs = [];
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
/* 420x800 so the whole 390x740 stage sits on screen at scale 1 with room for the
   crop margins, and BOTH isMobile and hasTouch, because puppeteer reads a missing
   key as false and silently RELOADS the page when either flips. tests/unit.test.js
   carries that rule and it went red on the first version of this file, which is
   exactly what it is for. */
await page.setViewport({ width: 420, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
/* LET THE APP FINISH BOOTING BEFORE THE RIG DEMOLISHES IT. mount() replaces
   document.body wholesale, and doing that while app.js is still wiring listeners
   throws "Cannot read properties of null (reading 'addEventListener')" out of the
   app's own boot path. That is the harness breaking the app, not the app being
   broken, and an audit that reports its own vandalism as a page error teaches
   everyone to ignore the page-error line. */
await sleep(2500);
const bootErrors = errors.length;

/* ── the rig ──────────────────────────────────────────────────────────────────
   vpW is the .hlw-vp width, which is what openHollow scales the 390-wide stage
   by, so passing 390 holds the stage at scale 1 and passing 374 reproduces the
   real sheet's 0.959. Animations are frozen: the crow bobs and the tufts sway,
   and a two-frame alpha scan of a moving sprite measures the union of two
   positions. Freezing is a property of the INSTRUMENT, not of the app, which is
   why hollow-backdrop-audit still owns the motion assertions. */
const mount = async (band, vpW) => page.evaluate(async ([b, url, w]) => {
  const m = await import(new URL('js/hollow-scene.js', url).href);
  document.body.innerHTML = `<div id="probeWrap" style="position:fixed;inset:0;overflow:hidden">
      <div class="hlw-vp" id="hlwVp" style="width:${w}px"><div class="hlw-stage" id="hlwStage"></div></div></div>`;
  const st = document.getElementById('hlwStage'), vp = document.getElementById('hlwVp');
  st.innerHTML = m.hollowBackdropHtml({ band: b })
    + '<div id="hlwCalib" style="position:absolute;left:10px;top:400px;width:100px;height:60px;background:#6d5540"></div>';
  const s = vp.clientWidth / m.HLW_STAGE.w;
  st.style.transform = `scale(${s})`;
  vp.style.height = Math.round(m.HLW_STAGE.h * s) + 'px';
  if (!document.getElementById('hlwFreeze')) {
    const css = document.createElement('style');
    css.id = 'hlwFreeze';
    css.textContent = '#hlwStage,#hlwStage *{animation:none !important;transition:none !important}';
    document.head.appendChild(css);
  }
  const r = st.getBoundingClientRect();
  return { scale: +(r.width / m.HLW_STAGE.w).toFixed(4), stage: { x: r.x, y: r.y, w: r.width, h: r.height } };
}, [band, srv.url, vpW]);

/* Tag every rendered HLW_ART instance. Matching is (viewBox + inner markup) run
   through the SAME parser on both sides, because inner markup alone is unsound
   (hollow-water-needs' path is a substring of hollow-timer-chip's) and viewBox
   alone is unsound too: the sign's "THE HOLLOW" text run is a second svg on the
   sign's own viewBox and is not a piece. Proven on the render: 27 instances
   match, and exactly the two non-art svgs (the path bands, the sign label) do
   not. The pair is asserted unique below before it is trusted. */
const tagPieces = async () => page.evaluate(async url => {
  const art = await import(new URL('js/hollow-art.js', url).href);
  const norm = p => { const d = document.createElement('div'); d.innerHTML = `<svg>${p}</svg>`; return d.firstChild.innerHTML; };
  const sig = {}, dupes = [];
  for (const [id, a] of Object.entries(art.HLW_ART)) {
    const k = a.vb + ' ' + norm(a.p);
    if (sig[k]) dupes.push(`${id} and ${sig[k]}`);
    sig[k] = id;
  }
  const st = document.getElementById('hlwStage'), S = st.getBoundingClientRect();
  const scale = S.width / 390;
  const out = [], unmatched = [];
  for (const el of st.querySelectorAll('svg[viewBox]')) {
    const id = sig[el.getAttribute('viewBox') + ' ' + el.innerHTML];
    if (!id) { unmatched.push(el.getAttribute('viewBox')); continue; }
    const vb = el.getAttribute('viewBox').trim().split(/\s+/).map(Number);
    const r = el.getBoundingClientRect();
    el.dataset.probe = 'p' + out.length;
    out.push({ probe: 'p' + out.length, id, vbw: vb[2], vbh: vb[3],
      box: { x: +((r.x - S.x) / scale).toFixed(2), y: +((r.y - S.y) / scale).toFixed(2),
        w: +(r.width / scale).toFixed(2), h: +(r.height / scale).toFixed(2) } });
  }
  const cal = document.getElementById('hlwCalib');
  cal.dataset.probe = 'calib';
  const cr = cal.getBoundingClientRect();
  return { pieces: out, unmatched, dupes, scale: +scale.toFixed(4),
    calib: { probe: 'calib', id: 'CALIBRATION', box: { x: +((cr.x - S.x) / scale).toFixed(2), y: +((cr.y - S.y) / scale).toFixed(2), w: +(cr.width / scale).toFixed(2), h: +(cr.height / scale).toFixed(2) } },
    stageBox: { w: +(S.width / scale).toFixed(2), h: +(S.height / scale).toFixed(2) } };
}, srv.url);

/* ── the alpha scan ──────────────────────────────────────────────────────────
   Crop to the piece's own box plus MARGIN so the diff is not a million-pixel
   loop per sprite, then REFUSE to trust a result whose ink touches a crop edge
   that is not the stage edge. Ink that leaves the crop is ink the measurement
   cannot see, and a measurement that silently under-reads is the failure mode
   this whole file exists to remove. */
const inkOf = async (probe, box, scale, stage) => {
  const x0 = Math.max(stage.x, stage.x + (box.x - MARGIN) * scale);
  const y0 = Math.max(stage.y, stage.y + (box.y - MARGIN) * scale);
  const x1 = Math.min(stage.x + stage.w, stage.x + (box.x + box.w + MARGIN) * scale);
  const y1 = Math.min(stage.y + stage.h, stage.y + (box.y + box.h + MARGIN) * scale);
  const clip = { x: Math.floor(x0), y: Math.floor(y0), width: Math.ceil(x1 - x0), height: Math.ceil(y1 - y0) };
  const atStage = {
    l: Math.abs(x0 - stage.x) < 0.5, t: Math.abs(y0 - stage.y) < 0.5,
    r: Math.abs(x1 - (stage.x + stage.w)) < 0.5, b: Math.abs(y1 - (stage.y + stage.h)) < 0.5,
  };
  await page.evaluate(p => {
    document.body.style.visibility = 'hidden';
    document.querySelector(`[data-probe="${p}"]`).style.visibility = 'visible';
  }, probe);
  const shot = async bg => {
    await page.evaluate(c => { document.documentElement.style.background = c; }, bg);
    await sleep(50);
    return page.screenshot({ clip, encoding: 'base64' });
  };
  const W = await shot('#ffffff'), B = await shot('#000000');
  await page.evaluate(p => {
    document.documentElement.style.background = '';
    document.body.style.visibility = '';
    document.querySelector(`[data-probe="${p}"]`).style.visibility = '';
  }, probe);
  const raw = await page.evaluate(async ([a, b, cut]) => {
    const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
    g.clearRect(0, 0, c.width, c.height); g.drawImage(ib, 0, 0);
    const db = g.getImageData(0, 0, c.width, c.height).data;
    let mnx = 1e9, mny = 1e9, mxx = -1, mxy = -1, px = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      /* alpha, exactly: over white a pixel reads a*C + (1-a)*255, over black it
         reads a*C, so white - black is (1-a)*255 whatever the colour C is. */
      const al = 1 - ((da[i] - db[i]) + (da[i + 1] - db[i + 1]) + (da[i + 2] - db[i + 2])) / 765;
      if (al >= cut) { px++; if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; }
    }
    return { px, cw: c.width, ch: c.height, mnx, mny, mxx, mxy };
  }, [W, B, ALPHA_CUT]);
  if (!raw.px) return { px: 0, ink: null, touch: null, stageClipped: false };
  const dev = raw.cw / clip.width;              // device px per CSS px
  const u = dev * scale;                        // device px per STAGE px
  const touch = { l: raw.mnx <= 0, t: raw.mny <= 0, r: raw.mxx >= raw.cw - 1, b: raw.mxy >= raw.ch - 1 };
  return {
    px: raw.px,
    ink: {
      x: +(((clip.x - stage.x) + raw.mnx / dev) / scale).toFixed(2),
      y: +(((clip.y - stage.y) + raw.mny / dev) / scale).toFixed(2),
      w: +((raw.mxx - raw.mnx + 1) / u).toFixed(2),
      h: +((raw.mxy - raw.mny + 1) / u).toFixed(2),
    },
    touch,
    /* touching a crop edge is only honest when that edge IS the stage edge, in
       which case the stage's own overflow:hidden really did cut the sprite */
    escaped: ['l', 't', 'r', 'b'].filter(k => touch[k] && !atStage[k]),
    stageClipped: ['l', 't', 'r', 'b'].some(k => touch[k] && atStage[k]),
  };
};

/* ── 0. COVERAGE, derived from what the scene actually draws ───────────────── */
const drawn = new Set();
for (const band of BANDS) {
  await mount(band, 390);
  await sleep(140);
  const t = await tagPieces();
  for (const p of t.pieces) drawn.add(p.id);
  note(t.dupes.length === 0, `MATCHER UNSOUND: ${t.dupes.join('; ')} are byte-identical, so coverage cannot tell them apart`);
  note(t.pieces.length > 0, `EMPTY SAMPLE: band ${band} matched zero HLW_ART pieces`);
}
note(drawn.size >= 10, `EMPTY SAMPLE: only ${drawn.size} HLW_ART pieces are drawn across ${BANDS.length} bands`);
for (const id of drawn) {
  if (!HEIGHTS[id] && !NOT_MEASURED[id]) fail.push(`COVERAGE UNACCOUNTED: ${id} is drawn by hollowBackdropHtml but is in neither HEIGHTS nor NOT_MEASURED`);
}
for (const [id, row] of Object.entries(HEIGHTS)) {
  if (!drawn.has(id)) fail.push(`COVERAGE STALE: HEIGHTS declares ${id}, which the backdrop does not draw`);
  if (!(row.m > 0)) fail.push(`COVERAGE: HEIGHTS ${id} declares ${row.m} metres`);
  if (!row.why || row.why.length < 40) fail.push(`COVERAGE: HEIGHTS ${id} has no real reasoning`);
}
for (const [id, why] of Object.entries(NOT_MEASURED)) {
  if (!drawn.has(id)) fail.push(`COVERAGE STALE: NOT_MEASURED names ${id}, which the backdrop does not draw`);
  if (HEIGHTS[id]) fail.push(`COVERAGE CONTRADICTION: ${id} is in HEIGHTS and in NOT_MEASURED`);
  if (!why || why.length < 40) fail.push(`COVERAGE: NOT_MEASURED ${id} has no real reason`);
}
const anchorId = Object.keys(HEIGHTS).find(k => HEIGHTS[k].anchor);
note(anchorId, 'no HEIGHTS row is marked as the anchor, so PXPM cannot be derived');
note(Object.values(HEIGHTS).filter(r => r.anchor).length === 1, 'more than one HEIGHTS row claims to be the anchor');
info.push(`COVERAGE  ${drawn.size} pieces drawn = ${Object.keys(HEIGHTS).length} measured + ${Object.keys(NOT_MEASURED).length} excused`);

/* ── 1. the DAY render, at scale 1, is what everything below is measured on ── */
const m1 = await mount('day', 390);
await sleep(220);
const tag = await tagPieces();
note(Math.abs(tag.scale - 1) < 0.001, `RIG: the stage mounted at scale ${tag.scale}, not 1, so a stage px is not a CSS px`);
note(Math.abs(tag.stageBox.w - 390) < 1 && Math.abs(tag.stageBox.h - 740) < 1,
  `RIG: the stage measures ${tag.stageBox.w}x${tag.stageBox.h} units, expected 390x740`);
note(tag.pieces.length > 0, 'EMPTY SAMPLE: zero HLW_ART instances tagged in the day render');

/* ── 2. CALIBRATION. The instrument is measured before the art is. ─────────── */
const cal = await inkOf(tag.calib.probe, tag.calib.box, tag.scale, m1.stage);
note(cal.px > 0, 'CALIBRATION: the 100x60 control block measured zero ink pixels, so the alpha scan is not working at all');
note(cal.ink && Math.abs(cal.ink.w - 100) <= 0.5 && Math.abs(cal.ink.h - 60) <= 0.5,
  `CALIBRATION: a known 100x60 block measured ${cal.ink ? cal.ink.w + 'x' + cal.ink.h : 'NOTHING'}; every number below it is therefore worthless`);
info.push(`CALIB     100x60 control measured ${cal.ink ? cal.ink.w + 'x' + cal.ink.h : 'NOTHING'} (${cal.px} ink px)`);

/* ── 3. measure the ink of every instance of every declared piece ──────────── */
const measured = [];
for (const p of tag.pieces) {
  if (!HEIGHTS[p.id]) continue;
  const r = await inkOf(p.probe, p.box, tag.scale, m1.stage);
  measured.push({ ...p, ...r });
  note(r.px > 0, `EMPTY SAMPLE: ${p.id} rendered zero ink pixels, so it did not render at all`);
  note(r.ink && r.ink.h > 0, `EMPTY SAMPLE: ${p.id} measured an ink height of ${r.ink ? r.ink.h : 'null'}`);
  if (r.escaped && r.escaped.length)
    fail.push(`CROPPED ${p.id}: its ink runs out of the measuring crop at ${r.escaped.join('/')}, so ${r.ink.h} is a floor, not a height`);
}
for (const id of Object.keys(HEIGHTS)) {
  note(measured.some(m => m.id === id), `EMPTY SAMPLE: ${id} is declared in HEIGHTS but no instance of it was measured in the render`);
}
note(measured.length >= Object.keys(HEIGHTS).length, `EMPTY SAMPLE: ${measured.length} instances measured for ${Object.keys(HEIGHTS).length} declared pieces`);

/* ── 4. THE ANCHOR, derived from the measurement, and cross-checked at the real
       screen's stage scale so the number cannot be an artefact of scale 1. ─── */
const anchor = measured.find(m => m.id === anchorId);
note(anchor && anchor.ink, `EMPTY SAMPLE: the anchor ${anchorId} was never measured`);
const PXPM = anchor && anchor.ink ? anchor.ink.h / HEIGHTS[anchorId].m : 0;
note(PXPM > 0, 'the anchor measured no ink, so one metre has no length and nothing below can run');

{
  const m2 = await mount('day', 374);          // the real sheet's width at 390x844
  await sleep(220);
  const t2 = await tagPieces();
  const a2 = t2.pieces.find(p => p.id === anchorId);
  note(a2, `EMPTY SAMPLE: the anchor ${anchorId} is missing from the 0.959-scale render`);
  if (a2) {
    const r2 = await inkOf(a2.probe, a2.box, t2.scale, m2.stage);
    note(r2.ink && r2.ink.h > 0, 'EMPTY SAMPLE: the anchor measured no ink at the real screen scale');
    const drift = r2.ink && anchor.ink ? Math.abs(r2.ink.h - anchor.ink.h) / anchor.ink.h : 1;
    note(drift <= 0.02,
      `ANCHOR DRIFT: ${anchorId} measures ${anchor.ink.h} stage px at scale 1 and ${r2.ink ? r2.ink.h : 'nothing'} at scale ${t2.scale}, ${(drift * 100).toFixed(1)}% apart (bound 2%). The measurement is a scale artefact, not a property of the art.`);
    info.push(`ANCHOR    ${anchorId} ink ${anchor.ink.h} px at scale 1, ${r2.ink ? r2.ink.h : '?'} px at scale ${t2.scale}, drift ${(drift * 100).toFixed(2)}%`);
  }
  await mount('day', 390);                     // put the rig back for the report
  await sleep(160);
}
info.push(`SCALE     1 metre = ${PXPM.toFixed(2)} stage px, derived from ${anchorId} ink ${anchor && anchor.ink ? anchor.ink.h : '?'} px / ${HEIGHTS[anchorId] ? HEIGHTS[anchorId].m : '?'} m`);

/* ── 5. ASSERTION ONE: APPARENT SIZE. Ink height against metres x PXPM. ────── */
const rows = [];
for (const m of measured) {
  if (!m.ink || !PXPM) continue;
  const want = HEIGHTS[m.id].m * PXPM;
  const dev = (m.ink.h - want) / want;
  const impl = m.ink.h / PXPM;
  rows.push({ id: m.id, ink: m.ink.h, box: m.box.h, want: +want.toFixed(2), dev, impl: +impl.toFixed(3),
    fill: +(m.ink.h / m.box.h).toFixed(3), stageClipped: m.stageClipped, anchor: !!HEIGHTS[m.id].anchor, wide: !!HEIGHTS[m.id].wide });
  if (Math.abs(dev) > BOUND) {
    fail.push(`SCALE ${m.id}: ink ${m.ink.h} stage px reads ${impl.toFixed(2)} m at ${PXPM.toFixed(2)} px/m, `
      + `but it depicts ${HEIGHTS[m.id].m} m and must measure ${want.toFixed(1)} px. `
      + `${(Math.abs(dev) * 100).toFixed(1)}% ${dev > 0 ? 'OVER' : 'UNDER'}, bound ${(BOUND * 100)}% either way.`);
  }
}
note(rows.length >= Object.keys(HEIGHTS).length, `EMPTY SAMPLE: ${rows.length} rows graded against ${Object.keys(HEIGHTS).length} declared pieces`);
/* The anchor grading itself is trivially 0% by construction. It is kept in the
   table so the number is visible, but it must never be the only row: a table of
   one row would pass for free. */
note(rows.filter(r => !r.anchor).length >= 5, `EMPTY SAMPLE: only ${rows.filter(r => !r.anchor).length} non-anchor rows, so the SCALE assertion is close to self-satisfying`);

/* ── 6. ASSERTION TWO: CRISP. Integer scale, and nothing to do with size. ──── */
let crispChecked = 0;
const scatterSeen = {};
for (const p of tag.pieces) {
  const kx = p.box.w / p.vbw, ky = p.box.h / p.vbh;
  if (SCATTER[p.id]) { scatterSeen[p.id] = (scatterSeen[p.id] || 0) + (Math.abs(kx - Math.round(kx)) > 0.02 ? 1 : 0); continue; }
  crispChecked++;
  if (Math.abs(kx - Math.round(kx)) > 0.02 || Math.abs(ky - Math.round(ky)) > 0.02 || Math.round(kx) < 1)
    fail.push(`CRISP ${p.id}: drawn ${p.box.w}x${p.box.h} from a ${p.vbw}x${p.vbh} viewBox, which is ${kx.toFixed(3)}x by ${ky.toFixed(3)}x. `
      + `Art must be drawn at a whole multiple of its source or its keylines land on half pixels. Bound: within 0.02 of an integer, floor 1x.`);
  else if (Math.abs(kx - ky) > 0.02)
    fail.push(`CRISP ${p.id}: drawn ${kx.toFixed(3)}x horizontally and ${ky.toFixed(3)}x vertically, so the art is stretched.`);
}
note(crispChecked >= 8, `EMPTY SAMPLE: only ${crispChecked} instances were graded for integer scale`);
for (const [id, why] of Object.entries(SCATTER)) {
  if (!drawn.has(id)) fail.push(`SCATTER STALE: ${id} is excused from CRISP but the backdrop does not draw it`);
  if (!why || why.length < 40) fail.push(`SCATTER ${id} has no real reason`);
  if (drawn.has(id) && !scatterSeen[id]) fail.push(`SCATTER POINTLESS: ${id} is excused from CRISP but every instance of it is already at a whole multiple. Delete the exemption or say what it is for.`);
}

/* ── report ───────────────────────────────────────────────────────────────── */
note(errors.length === 0, `PAGE ERRORS: ${JSON.stringify(errors.slice(0, 3))}`);
note(bootErrors === 0, `PAGE ERRORS DURING BOOT: ${JSON.stringify(errors.slice(0, 3))}`);
note(consoleErrs.length === 0, `CONSOLE ERRORS: ${JSON.stringify(consoleErrs.slice(0, 3))}`);

console.log('\n' + info.join('\n'));
console.log(`\nBOX FILL  ink height as a fraction of the element box, ${Math.min(...rows.map(r => r.fill)).toFixed(2)} to ${Math.max(...rows.map(r => r.fill)).toFixed(2)}.`);
console.log('          This range is why a box measurement cannot grade apparent size.');
console.log('\nSCALE     sprite                  ink    want     dev   reads as   declared');
for (const r of rows.sort((a, b) => a.dev - b.dev)) {
  console.log(`          ${r.id.padEnd(22)} ${String(r.ink).padStart(6)}  ${String(r.want).padStart(6)}  ${((r.dev >= 0 ? '+' : '') + (r.dev * 100).toFixed(1) + '%').padStart(7)}  ${r.impl.toFixed(2).padStart(6)} m  ${String(HEIGHTS[r.id].m).padStart(5)} m`
    + `${r.anchor ? '  ANCHOR' : ''}${r.wide ? '  (declared metres are a WIDE range, see HEIGHTS)' : ''}${r.stageClipped ? '  (ink clipped by the stage edge: this is a FLOOR)' : ''}`);
}
console.log(`\nCRISP     ${crispChecked} instances graded at integer scale, ${Object.keys(SCATTER).length} scatter pieces excused by name.`);
console.log(`\n=== hollow-scale ===`);
console.log(fail.length ? fail.map(f => 'FAIL ' + f).join('\n') : 'ALL PASS');
await browser.close(); srv.close?.();
process.exit(fail.length ? 1 : 0);
