/* THE WANDERER'S TRIP WIRE, FIRED FOR REAL.
 *
 * tests/wanderer-boneyard-audit.mjs proves the derivation, the geometry, the
 * money and the ceiling by calling the module. None of that can see the thing
 * the feature actually IS: a GPS fix arriving on the open Boneyard, landing
 * inside a cone nobody tapped, and a fight starting on its own. Every hop of
 * that runs in js/app.js behind a live map, and a module test cannot reach one
 * of them.
 *
 * So this suite drives it. Two boots of the real app, each with the device's
 * position overridden to a point computed off the REAL Wanderer's REAL heading:
 *
 *   BEHIND  45 m behind him. He is drawn, his lantern is drawn, no fight starts.
 *   AHEAD   45 m into his light. The arena opens, on his name, with no tap
 *           anywhere in the run.
 *
 * The BEHIND boot is not decoration: "no fight started" is what a dead trigger
 * reports too, so the two boots are each other's control, and each carries a
 * CONTROL row that says the fix really was on the side of the line it claims.
 *
 * PROVE-RED for LOOMS-LIVE, 2026-08-21, when the row became a BAND. Throwaway
 * `cp -R` of the tree with its .git removed, one mutation at a time, exit code
 * read from a FILE and never through a pipe. TWO mutations, because a band has
 * two ways to break and a one-sided check cannot see the other one:
 *   js/wanderer.js MARK_PX 200 -> 260 (the shipped v421 size Tom complained
 *     about) -> FAIL, exit 1, "his ink is 228x169 against a 127px collect ring
 *     and a 42px spawn pin, so 1.80x the ring and 58% of a 393px screen".
 *     The CEILING. Every other row in the suite stayed green, so the red is
 *     about size and nothing else.
 *   js/wanderer.js MARK_PX 200 -> 150 -> FAIL, exit 1, "his ink is 132x98 ...
 *     so 1.04x the ring and 34% of a 393px screen". The FLOOR: he has stopped
 *     being the biggest thing out there. Same, every other row green.
 *   Unmutated at 200: PASS, exit 0, "176x130 ... 1.39x the ring and 45% of a
 *   393px screen", VERIFIED, 13 of 13.
 *
 * PROVE-RED, 2026-08-22, for the rows added with the beam rework. Same method,
 * `cp -R` throwaway, exit code read from a FILE.
 *   V423-SIZING   js/app.js put back the way it was: both sizing paths gated on
 *     map.loaded() and both opening with a 200 px fallback -> exit 1,
 *     STEADY-LIVE "2 distinct width(s) across 132 frames of pan and a full
 *     world tick: [200,508]" and TRACKS-LIVE "508 -> 1341 px over 3 distinct
 *     widths, 1 step(s) backwards, smallest seen 200". That 200 is the CSS
 *     fallback painted over a correct answer, and it is the size flicker Tom
 *     reported. Unmutated: pan 1 width, zoom 10 to 28 widths, 0 backwards.
 *   PULSE-LIVE    the 3.2s opacity loop put back on the cone -> exit 1,
 *     STILL-LIVE "animation-name wandererLantern, opacity 0.893635".
 *
 * A ROW THAT WAS RED ON CLEAN MAIN AND IS FIXED HERE. LANTERN-LIVE read the
 * flame at LANTERN.x on a plate that v423 mirrors on his eastward half, so it
 * measured 124.75 px of error on a perfectly good cone whenever his beat
 * happened to run east, which is half the time. Reproduced on clean v423 and on
 * this branch before the fix, identical number, exactly (1 - 2*0.188) * 200.
 * Audit drift, fixed at the assertion, and the mirrored case is now measured
 * rather than asserted in prose (see APEX-MIRRORED in the sibling suite).
 *
 * NEEDS A MAP. MapLibre needs WebGL and vector tiles; on a machine with neither,
 * every row here would be graded against a blank screen and pass on nothing. So
 * it measures the capability first and reports UNPROVEN with exit 97 rather than
 * green, the same contract tests/boneyard-audit.mjs runs under.
 *
 * AND IT NEEDS A THIRD THING, WHICH IS WHY IT USED TO EXIT 97 WITHOUT SAYING SO.
 * 2026-09-02, chasing an exit 97 recorded against this suite in the v470 release:
 * boneyardCapability only proves the map STYLE's remote URL answers, and the
 * style names exactly one, https://tiles.openfreemap.org/planet. js/water.js
 * fetches the z14 .pbf tiles UNDER that endpoint, and nothing measured those. So
 * a machine that could draw the map but not read its water tiles fell through to
 * the empty-set branch and reported "no Wanderer is within WANDER_SHOW_M of HOME
 * right now (81 water tiles warmed over 30043ms ...)", which blamed his loop for
 * a network fault, quoted a tile count that was the constant 81 whatever
 * happened, and printed an UNPROVEN banner naming no missing property at all.
 * Reproduced on a `cp -R` throwaway with water.js's TILEJSON_URL pointed at a
 * dead path (the map style untouched, so the capability probe stayed green):
 * exit 97, all 17 rows ungraded, that exact sentence. It now measures the oracle
 * and reports it as a missing capability by name, ORACLE, beside WEBGL and
 * TILES. Same throwaway after the fix: exit 97, and "MISSING, measured in this
 * run: ORACLE js/water.js could not classify a single one of the lattice points
 * around HOME in 30034ms".
 *
 * HIS LOOP IS NOT THE USUAL EXPLANATION. Measured 2026-09-02 by sweeping all
 * 1440 minutes of five consecutive days from HOME against the real land oracle:
 * 1414 to 1440 minutes of 1440 have somebody inside WANDER_SHOW_M, so the empty
 * set is a 0 to 2% state and an exit 97 that blames it should be doubted.
 * On this machine, 2026-09-02, this suite runs and is GREEN: 17 of 17, exit 0.
 *
 * THREE DICE THIS SUITE WAS ROLLING, ALL FIXED 2026-08-27, NONE OF THEM THE
 * APP. It failed a DIFFERENT row every run on clean main, which is the tell.
 *
 *   1. IT DIED ON AN EMPTY SET. `wanderersNear(date, HOME...)[0]` with no guard.
 *      He walks a 140-220 m loop and can leave WANDER_SHOW_M inside an instance,
 *      and when he had, the suite threw `Cannot read properties of undefined
 *      (reading 'lat')`, exit 1, SEVENTEEN rows graded to nothing and a stack
 *      trace that reads like a broken app. Measured on clean main 2026-08-27:
 *      four runs out of five, minutes apart. Declared now, never indexed into.
 *   2. IT ASKED WITHOUT THE LAND ORACLE, so on ~12% of instances it stood the
 *      player 45 m into a cone that does not exist and CHARGE-LIVE went red on a
 *      healthy trigger. See the note on realWanderer in tests/godmode.js for the
 *      224-sample measurement. Now derived the way js/app.js derives.
 *   3. IT GRADED WHICHEVER MARKER CAME FIRST. `querySelector('.map-wanderer-
 *      mark')` on a map that draws every man inside 1200 m. Measured on clean
 *      main: the graded marker sat at x 706..906, y 979..1179 on a 393x852
 *      screen -- entirely off it -- so document.elementFromPoint returned null
 *      and TAPTHRU-LIVE printed "elementFromPoint over his body returned the
 *      Wanderer" about a marker nobody could have tapped. It now selects
 *      [data-w="<his id>"], the id js/app.js stamps on the element, and both
 *      hit-test rows say out loud whether their probe was on screen at all.
 *
 * PROVE-RED, 2026-08-27, after the above. Throwaway `cp -R`, exit read from a
 * FILE, one mutation at a time:
 *   js/wanderer.js MARK_PX 200 -> 260 -> exit 1, LOOMS-LIVE alone red.
 *   js/wanderer.js .map-wanderer-mark `pointer-events: none` -> `auto` ->
 *     exit 1, TAPTHRU-LIVE alone red, now naming the pixel it probed.
 *   js/wanderer.js the `.map-you, .map-spawn, ... { z-index: 1 }` rule deleted
 *     -> exit 1, PINS-SURVIVE alone red.
 *
 *   node tests/wanderer-patrol-live-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree, boneyardCapability, unproven, unprovenReport, exitFor, realWanderer } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
console.log(`URL UNDER TEST  ${base}`);
let fails = 0;
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  | ' + d : ''}`); if (!p) fails = 1; };

async function run(offsetDeg, label) {
  const { browser, page } = await boot(base, {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const origin = new URL(base).origin;
  await browser.defaultBrowserContext().overridePermissions(origin, ['geolocation']);
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const HOME = { latitude: 49.2827, longitude: -123.1207 };
  await page.setGeolocation(HOME);
  const cap = await boneyardCapability(page);
  if (!cap.ok) { await browser.close(); return { cap }; }
  await seed(page, { level: 18, coins: 500 });

  /* WHERE IS HE, AND WHERE WOULD A PLAYER HAVE TO STAND. Through godmode's
     realWanderer, which asks the question js/app.js asks: with js/water.js's
     land oracle. Asking without it returned the right ID at the wrong place on
     12% of instances (see the note on realWanderer), which is what took
     CHARGE-LIVE red on a healthy app.
     AND AN EMPTY SET IS DECLARED, NOT INDEXED INTO. This used to be
     `wanderersNear(...)[0]` with no guard, so on a minute when his loop had
     carried him past WANDER_SHOW_M the whole suite died at `w.lat` with
     `Cannot read properties of undefined`, exit 1, seventeen rows graded to
     nothing. Measured on clean main 2026-08-27: four runs out of five. */
  const target = await realWanderer(page, HOME, { offsetDeg });
  if (!target.w) { await browser.close(); return { empty: target }; }

  await page.setGeolocation({ latitude: target.p.lat, longitude: target.p.lng });
  await page.evaluate(() => { location.hash = '#/boneyard'; });
  await sleep(2500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(11000);

  const seenState = await page.evaluate(async (wid) => {
    const W = await import('./js/wanderer.js');
    /* HIS MARKER, BY ID. `querySelector('.map-wanderer-mark')` returns whichever
       Wanderer MapLibre happens to hold first, and on a map that draws every man
       inside WANDER_SHOW_M (1200 m) that is regularly one who is nowhere near
       the viewport: measured on clean main 2026-08-27, the graded marker sat at
       x 706..906 y 979..1179 on a 393x852 screen, entirely off-screen, which
       made document.elementFromPoint return null and took TAPTHRU-LIVE red with
       the message "elementFromPoint over his body returned the Wanderer" on a
       perfectly good marker. The despawn suite already learned this and stamps
       the id on the element (js/app.js, el.dataset.w); this reads it. */
    const mark = document.querySelector(`.map-wanderer-mark[data-w="${wid}"]`);
    const cone = mark && mark.querySelector('.wanderer-cone');
    const bodyEl = mark && mark.querySelector('.wanderer-body');
    const img = mark && mark.querySelector('img');
    const rb = mark && mark.getBoundingClientRect();
    const cb = cone && cone.getBoundingClientRect();
    const bb = bodyEl && bodyEl.getBoundingClientRect();
    const cs = cone && getComputedStyle(cone);
    const arena = document.querySelector('#arena');
    const foeName = arena && (arena.textContent.match(/The Wanderer/) ? 'The Wanderer' : arena.textContent.slice(0, 60));
    /* THE INK, not the box. The plate is a 640-square with transparent margins,
       so its element rect says nothing about how big he LOOKS. These are the
       art's own alpha bounds, measured off assets/bh/wanderer/wanderer.png. */
    const INK = { x0: 60 / 640, y0: 88 / 640, x1: 622 / 640, y1: 505 / 640 };
    const ink = bb ? { w: (INK.x1 - INK.x0) * bb.width, h: (INK.y1 - INK.y0) * bb.height } : null;
    const ring = document.querySelector('.map-radius');
    const rr = ring && ring.getBoundingClientRect();
    const pin = document.querySelector('.map-spawn');
    const pr = pin && pin.getBoundingClientRect();
    // does a tap on his coat reach what is underneath him
    let through = null;
    if (bb) {
      const hit = document.elementFromPoint(Math.round(bb.left + bb.width * 0.5), Math.round(bb.top + bb.height * 0.42));
      through = !!hit && !hit.closest('.map-wanderer-mark');
    }
    /* the apex, on the REAL map: the cone's centre must land on the flame.
       THE MIRROR MOVES THE FLAME, and this row did not know that. v423 flipped
       the plate on his eastward half so the lantern always leads; LANTERN.x is
       measured on the UNMIRRORED art, so on a mirrored plate the flame is at
       1 - x and this read was 0.624 of the marker out. It went red on a
       perfectly good cone whenever his beat happened to be heading east, which
       is half the time, and it was red on clean v423: measured 124.75 px on
       both v423 and this tree before the fix, exactly (1 - 2*0.188) * 200.
       Audit drift, fixed at the assertion. */
    const east = mark && mark.classList.contains('facing-east');
    let dLantern = null, dPlateCentre = null;
    if (bb && cb) {
      const lx = east ? 1 - W.LANTERN.x : W.LANTERN.x;
      const l = { x: bb.left + lx * bb.width, y: bb.top + W.LANTERN.y * bb.height };
      const c = { x: cb.left + cb.width / 2, y: cb.top + cb.height / 2 };
      dLantern = +Math.hypot(c.x - l.x, c.y - l.y).toFixed(2);
      dPlateCentre = +Math.hypot(c.x - (bb.left + bb.width / 2), c.y - (bb.top + bb.height / 2)).toFixed(2);
    }
    /* IS HE AT THE BACK OF THE MARKER LAYER. Graded on the STACKING ORDER, not
       on whether a pin happened to land on him this run: the field is generated
       from the clock, so "no pin overlapped him" is a normal outcome and a
       hit-test alone would pass vacuously on exactly the runs that matter.
       (Measured: removing the z-index rule and re-running left this row green,
       because querySelector('.map-spawn') picked one that was nowhere near him.)
       The z-index is always there to read, so it always grades. */
    const zOf = sel => { const n = document.querySelector(sel); return n ? getComputedStyle(n).zIndex : null; };
    const zWanderer = mark ? getComputedStyle(mark).zIndex : null;
    const zOthers = ['.map-you', '.map-spawn'].map(zOf).filter(v => v !== null);
    const behindAll = zWanderer !== null && zOthers.length > 0
      && zOthers.every(z => Number(z) > Number(zWanderer));
    // and where a pin DOES land on him, it must really be tappable
    let pinsOnHim = 0, pinsHittable = 0;
    if (rb) {
      for (const n of document.querySelectorAll('.map-spawn')) {
        const b = n.getBoundingClientRect();
        if (!(b.left < rb.right && b.right > rb.left && b.top < rb.bottom && b.bottom > rb.top)) continue;
        const px = Math.round(b.left + b.width / 2), py = Math.round(b.top + b.height / 2);
        if (px < 0 || py < 0 || px >= innerWidth || py >= innerHeight) continue;   // no pixel, no verdict
        pinsOnHim++;
        const hit = document.elementFromPoint(px, py);
        if (hit && hit.closest('.map-spawn')) pinsHittable++;
      }
    }
    /* AND HE HAS TO BE ON THE SCREEN. elementFromPoint answers null for any
       point outside the viewport, so TAPTHRU-LIVE and PINS-SURVIVE both grade
       NOTHING on an off-screen marker while reporting a cause that is not true.
       Measured, not asserted, and printed by the rows that depend on it. */
    const probe = bb ? { x: Math.round(bb.left + bb.width * 0.5), y: Math.round(bb.top + bb.height * 0.42) } : null;
    const probeInView = !!probe && probe.x >= 0 && probe.y >= 0 && probe.x < innerWidth && probe.y < innerHeight;
    return {
      hasMark: !!mark, probe, probeInView,
      markRect: rb ? { l: Math.round(rb.left), t: Math.round(rb.top), w: Math.round(rb.width), h: Math.round(rb.height) } : null,
      markVisible: !!mark && +getComputedStyle(mark).opacity > 0.5 && rb.width > 10,
      imgSrc: img && img.getAttribute('src'),
      conePx: cb ? Math.round(cb.width) : null,
      coneOpacity: cs ? +cs.opacity : null,
      /* NOT SLICED. This used to be `.slice(0, 120)` and the row below tests it
         for `conic-gradient`. The beam is two layers now, the flame's own pool
         first and the wedge second, and the pool alone is longer than 120
         characters: the slice would have hidden the conic entirely and taken a
         healthy cone red. Kept whole, and the row prints its own head. */
      coneBg: cs ? cs.backgroundImage : null,
      coneAnim: cs ? cs.animationName : null,
      coneRadius: cs ? cs.borderRadius : null,
      inkW: ink ? Math.round(ink.w) : null, inkH: ink ? Math.round(ink.h) : null,
      ringPx: rr ? Math.round(rr.width) : null, pinPx: pr ? Math.round(pr.width) : null,
      through, dLantern, dPlateCentre, facingEast: east,
      zWanderer, zOthers, behindAll, pinsOnHim, pinsHittable,
      range: W.CONE_RANGE_M, markPx: rb ? Math.round(rb.width) : null,
      screenH: innerHeight, screenW: innerWidth,
      arena: !!arena, foeName,
      /* THE ENCOUNTER IS WHAT CONE ENTRY OPENS NOW, not the arena. Captured here
         so the row below can assert the thing that actually happens without a
         tap, and still tell an encounter apart from a fight. */
      encounter: !!document.querySelector('.wnd-enc'),
      encButtons: [...document.querySelectorAll('.wnd-enc-acts .btn')].map(b => b.textContent.trim()),
    };
  }, target.w.id);
  /* DOES THE BEAM HOLD STILL WHILE THE MAP MOVES. Tom, 2026-08-22: "the
     wanderer's light cone is flickering in size ... the cone shouldn't flicker
     or change size."
     THIS IS THE ONLY PLACE THE BUG EXISTS. It is not in the geometry and it is
     not in the paint function: it was in what js/app.js handed the paint
     function on a frame where the map declined to answer, and only a real
     MapLibre camera move under real tile loading produces those frames. So the
     map is DRIVEN here, panBy and zoomTo, and the cone's RENDERED width is
     sampled on every animation frame throughout.
     Measured on v423 before the fix: a 1.6 s pan showed the width go 508 -> 200
     -> 508 within 300 ms, and a zoom went 508 -> 1226 -> 200 -> 1341. The 200
     is the CSS fallback, painted over a correct answer because both sizing
     paths were gated on map.loaded(), which is false for as long as any tile is
     in flight, which through a pan is most of the time.
     Only on the BEHIND boot: the AHEAD boot has an encounter sheet over the map
     and driving the camera under it measures nothing. */
  const drive = label !== 'behind' ? null : await page.evaluate(async () => {
    const map = window.__map;
    const cone = document.querySelector('.wanderer-cone');
    if (!map || !cone) return { error: !map ? 'no window.__map' : 'no cone on the map' };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const run = async (fn, ms) => {
      const widths = [];
      let alive = true;
      const tick = () => { if (!alive) return; widths.push(Math.round(cone.getBoundingClientRect().width)); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      fn();
      await wait(ms);
      alive = false;
      return { frames: widths.length, distinct: [...new Set(widths)].sort((a, b) => a - b), widths };
    };
    const z0 = map.getZoom();
    /* THE PAN WINDOW IS 5.6 SECONDS FOR A 1.6 SECOND PAN, and the extra four are
       the point. The collapse this row exists to catch was painted by
       refreshWanderer, which runs on the Boneyard's 5000 ms world pass, so a
       2.1 s window contained a tick only about two runs in five: proving the row
       red against the real v423 sizing code produced a red TRACKS-LIVE and a
       GREEN STEADY-LIVE, purely on where the tick happened to land. One full
       tick period plus the pan means the sample always covers the moment the
       fault fires (anti-regression rule 12: measure in the state the player is
       complaining about). Nothing about the assertion changes: through a pan and
       through a tick, at one zoom, the lit ground covers the same pixels. */
    const pan = await run(() => map.panBy([180, 130], { duration: 1600 }), 5600);
    const zoom = await run(() => map.zoomTo(z0 + 1.4, { duration: 1600 }), 2100);
    /* Did it grow, and did it only ever grow. A zoom IN must make the lit ground
       cover more pixels, monotonically: a single step backwards is the flicker.
       One tolerance, of one pixel, for the rounding at the very start. */
    let backwards = 0;
    for (let i = 1; i < zoom.widths.length; i++) if (zoom.widths[i] < zoom.widths[i - 1] - 1) backwards++;
    return { pan: { frames: pan.frames, distinct: pan.distinct },
      zoom: { frames: zoom.frames, steps: zoom.distinct.length, backwards,
        first: zoom.widths[0], last: zoom.widths[zoom.widths.length - 1],
        min: Math.min(...zoom.widths) } };
  });
  // kept for the eye, not asserted on: the rows above measure the DOM
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/wanderer-${label}.png` });
  await browser.close();
  return { target, seenState, drive };
}

/* EVERY ROW IS NAMED IN THE UNPROVEN LIST TOO, so a machine that cannot draw the
   map reports six ungraded checks by name rather than an empty green run. */
const ROWS = [
  'CONTROL the behind-him fix was really outside his cone',
  'DRAWN-LIVE he is on the real map, as Cam drew him',
  'CONE-LIVE his lantern is painted on the real map, as a circular sector',
  'CONTROL the lantern is nowhere near the middle of him, so LANTERN-LIVE is not vacuous',
  'LANTERN-LIVE on the real map the beam springs from his flame, not his chest',
  'LOOMS-LIVE he is the biggest thing on the map, by a distance, and no bigger',
  'PINS-SURVIVE he sits at the BACK of the marker layer, so the pins and the player clear him',
  'TAPTHRU-LIVE a tap on his coat reaches the map underneath, not him',
  'REACH-LIVE the beam is a searchlight, not a puddle: it runs past the edge of the screen',
  'NO-AMBUSH standing behind him starts no fight',
  'STILL-LIVE the lantern does not pulse: no animation, and still plainly visible',
  'CONTROL the map was really driven and the cone really sampled',
  'STEADY-LIVE panning the map does not change the size of the light',
  'TRACKS-LIVE and zooming does, smoothly and only upwards, never via the fallback',
  'CONTROL the ahead fix was really inside his cone',
  'CHARGE-LIVE walking into the light catches you, with no tap anywhere',
  'CHARGE-LIVE and what it opens is the CHOICE, not the arena behind it',
];

// ---- 1. BEHIND him: drawn, lit, and NOT fought
const behind = await run(180, 'behind');
let cap = behind && behind.cap;
/* AHEAD_ROW is the index in ROWS where the second boot's rows start, so an
   empty sample in one boot declares that boot's rows and leaves the other
   boot's real verdicts alone. */
const AHEAD_ROW = 14;
let empty = behind && behind.empty, emptyFrom = empty ? 0 : null;
if (behind && !cap && !empty) {
  const { target: t, seenState: s, drive: s0drive } = behind;
  ok('CONTROL the behind-him fix was really outside his cone', t.predicted === false,
    `45 m at heading+180 from ${t.w.heading.toFixed(0)} deg`);
  ok('DRAWN-LIVE he is on the real map, as Cam drew him', s.hasMark && s.markVisible && /wanderer\.png$/.test(s.imgSrc || ''),
    `marker ${s.markVisible ? 'visible' : 'not visible'}, src ${s.imgSrc}`);
  ok('CONE-LIVE his lantern is painted on the real map, as a circular sector',
    s.conePx > 60 && s.coneOpacity > 0.5 && /conic-gradient/.test(s.coneBg || '') && /50%/.test(s.coneRadius || ''),
    `${s.conePx}px wide, opacity ${s.coneOpacity}, ${String(s.coneBg).slice(0, 60)}`);
  /* THE APEX, ON THE REAL MAP. The sibling suite proves the geometry in a bare
     document; this proves the marker MapLibre positioned, at the zoom the player
     actually gets, still has its beam springing from the flame. Carries the same
     anti-vacuity control: if the lantern sat at the plate's centre the row would
     pass with nothing implemented. */
  /* Relative to the marker, not a fixed 40px: the offset is a FRACTION of the
     plate, so a hardcoded threshold would go red on a legitimate size change
     rather than on a real defect. */
  ok('CONTROL the lantern is nowhere near the middle of him, so LANTERN-LIVE is not vacuous',
    s.dPlateCentre > s.markPx * 0.1,
    `${s.dPlateCentre}px between the plate's centre and the apex, on a ${s.markPx}px marker`);
  ok('LANTERN-LIVE on the real map the beam springs from his flame, not his chest',
    s.dLantern !== null && s.dLantern < 2,
    `${s.dLantern}px between the cone's apex and the lantern, on a plate drawn facing ${s.facingEast ? 'east (mirrored)' : 'west'}`);
  /* HE LOOMS, AND HE STOPS. A BAND, not a floor, because this line has now been
     wrong in both directions and a one-sided check cannot see that (rule 11:
     name the direction AND the bound).
       FLOOR   Tom, when he was 78px: "needs to be much bigger". He is the one
               POI you are meant to see coming and route around.
       CEILING Tom, on the shipped v421 at MARK_PX 260: "he's too fucking big on
               the map". His ink was 228 wide on a 393 screen, 58% of it, and it
               buried the 75 m collect ring, the player marker and the pins.
     Graded on the two things in the SAME frame that set the scale, the collect
     ring and an ordinary spawn pin, plus the viewport, rather than on a px
     number that means nothing on its own. Measured on the render at MARK_PX 200:
     ink 176x130, ring 127, pin 42, screen 393. So 1.39x the ring, 4.19 pins
     wide, 45% of the screen, and the thresholds sit either side of that with the
     margin the measurements allow.
     GRADED ON WIDTH, not height, against the ring. The ring is a projection of
     75 m so its px size moves with latitude and zoom while MARK_PX does not, and
     at 200 his height clears the ring by 2% where his width clears it by 39%.
     A 2% margin is a coin toss, not a check.
     PROVEN RED BOTH WAYS, see the mutation log in the header. */
  ok('LOOMS-LIVE he is the biggest thing on the map, by a distance, and no bigger',
    s.inkW > s.ringPx * 1.25 && s.inkW > s.pinPx * 4 && s.inkW < s.screenW * 0.5,
    `his ink is ${s.inkW}x${s.inkH} against a ${s.ringPx}px collect ring and a ${s.pinPx}px spawn pin, `
    + `so ${(s.inkW / s.ringPx).toFixed(2)}x the ring and ${(100 * s.inkW / s.screenW).toFixed(0)}% of a ${s.screenW}px screen`);
  /* The hit-test half only means anything for pins whose centre is on screen,
     for the same reason as TAPTHRU above; the z-index half always grades. */
  ok('PINS-SURVIVE he sits at the BACK of the marker layer, so the pins and the player clear him',
    s.behindAll === true && s.pinsHittable === s.pinsOnHim,
    `wanderer z-index ${s.zWanderer} against [${s.zOthers}]; ` +
    `${s.pinsHittable}/${s.pinsOnHim} pin(s) overlapping his ${JSON.stringify(s.markRect)} box are still tappable ` +
    `(on a ${s.screenW}x${s.screenH} screen)`);
  /* GATED ON THE PROBE BEING ON SCREEN, and it says so either way: a null from
     elementFromPoint is "the browser was asked about a pixel that does not
     exist", not "the Wanderer swallowed the tap", and the two used to print the
     same sentence. */
  ok('TAPTHRU-LIVE a tap on his coat reaches the map underneath, not him',
    s.probeInView === true && s.through === true,
    s.probeInView
      ? `elementFromPoint at ${s.probe.x},${s.probe.y} returned ${s.through ? 'something else' : 'the Wanderer'}`
      : `his marker ${JSON.stringify(s.markRect)} is off a ${s.screenW}x${s.screenH} screen, so the probe measured nothing`);
  /* REACH. Tom's mockup runs the beam off the edge of the screen. The ring is
     75 m and is measured by the map's own projection, so the beam's radius in px
     over the ring's radius in px IS the range ratio, measured rather than
     restated, and the same number says whether it leaves the frame. */
  ok('REACH-LIVE the beam is a searchlight, not a puddle: it runs past the edge of the screen',
    s.conePx / 2 > s.ringPx / 2 * 3 && s.conePx / 2 > s.screenW / 2,
    `${Math.round(s.conePx / 2)}px of beam (${s.range} m) against a ${Math.round(s.ringPx / 2)}px 75 m ring, on a ${s.screenW}x${s.screenH} screen`);
  ok('NO-AMBUSH standing behind him starts no fight', s.arena === false, s.foeName || 'no arena');

  /* THE BEAM DOES NOT MOVE ON ITS OWN. The opacity loop is gone (Tom read the
     breathing as a fault), so the one thing that could still animate it is a
     stray keyframe. Graded on the COMPUTED style of the real marker on the real
     map, and paired with a visibility floor: "no animation" must not have been
     achieved by turning the warning off. */
  ok('STILL-LIVE the lantern does not pulse: no animation, and still plainly visible',
    s.coneAnim === 'none' && s.coneOpacity >= 0.6,
    `animation-name ${s.coneAnim}, opacity ${s.coneOpacity}`);

  /* AND IT DOES NOT CHANGE SIZE WHILE THE MAP MOVES. See the note on the driver.
     TWO ROWS BECAUSE THERE ARE TWO DIRECTIONS OF FAILURE, and rule 11 says name
     both. A pan changes no zoom, so the lit ground covers the same pixels
     throughout and the honest answer is ONE width: more than one is the
     flicker. A zoom DOES change it, so exactly one width there would be the
     v423 bug at the other end (the cone not tracking the ground through a
     pinch); it must take many values, all of them growing.
     Measured on this tree after the fix: pan 115 frames, 1 distinct width
     (508 px); zoom 508 -> 1341 over 26 distinct widths with 0 steps backwards.
     Measured on v423 before it: pan 2 widths (508 and the 200 px fallback);
     zoom 4 widths including that same 200. */
  const d = s0drive;
  /* The floor is 20 and 12, not 60. These are requestAnimationFrame samples and
     the frame rate here is whatever swiftshader manages while MapLibre is
     rasterising tiles: measured across runs on this machine at 131, 115 and 54
     frames for the pan and 91, 59 and 20 for the zoom. What this row is for is a
     driver that never ran at all, which reports 0 or 1 (rule 3), not a slow
     machine, and setting the bar at the best run seen would make it flaky. */
  ok('CONTROL the map was really driven and the cone really sampled',
    !!d && !d.error && d.pan.frames >= 40 && d.zoom.frames >= 12,
    d ? (d.error || `${d.pan.frames} frames over the pan, ${d.zoom.frames} over the zoom`) : 'no driver ran');
  ok('STEADY-LIVE panning the map does not change the size of the light',
    !!d && !d.error && d.pan.distinct.length === 1,
    d && !d.error ? `${d.pan.distinct.length} distinct width(s) across ${d.pan.frames} frames of pan and a full world tick: [${d.pan.distinct}]` : 'not measured');
  ok('TRACKS-LIVE and zooming does, smoothly and only upwards, never via the fallback',
    !!d && !d.error && d.zoom.steps >= 8 && d.zoom.backwards === 0 && d.zoom.last > d.zoom.first && d.zoom.min > 200,
    d && !d.error
      ? `${d.zoom.first} -> ${d.zoom.last} px over ${d.zoom.steps} distinct widths, ${d.zoom.backwards} step(s) backwards, smallest seen ${d.zoom.min}`
      : 'not measured');
}

// ---- 2. AHEAD of him, in the light: the encounter fires from the fix alone
const ahead = (cap || empty) ? null : await run(0, 'ahead');
if (ahead && ahead.empty) { empty = ahead.empty; emptyFrom = AHEAD_ROW; }
if (ahead && !ahead.cap && !ahead.empty) {
  const { target: t, seenState: s } = ahead;
  ok('CONTROL the ahead fix was really inside his cone', t.predicted === true,
    `45 m dead ahead of heading ${t.w.heading.toFixed(0)} deg`);
  /* THIS ROW USED TO REQUIRE AN ARENA, and it was right when it was written:
     cone entry went toast -> lunge -> openFight. It now opens the encounter, and
     the arena is behind a deliberate tap on Fight. So the row was asserting a
     behaviour that has been deliberately replaced, which is drift, not a defect.
     WHAT IT IS STILL FOR IS UNCHANGED and is the whole point of the suite: being
     caught must cost the player NO TAP. Standing in the light is enough. That is
     what the first row asserts, off the real map with a real GPS fix.
     The second row is the other half and it is not redundant: it pins that what
     arrives is the CHOICE and not the fight. If a refactor ever routed cone entry
     straight back into openFight, the first row would still pass and the player
     would be back to being ambushed with no way out. */
  ok('CHARGE-LIVE walking into the light catches you, with no tap anywhere',
    s.encounter === true || s.arena === true,
    s.encounter ? 'the encounter opened from the fix alone'
      : (s.arena ? `arena straight away, foe ${s.foeName}` : 'nothing opened'));
  ok('CHARGE-LIVE and what it opens is the CHOICE, not the arena behind it',
    s.encounter === true && s.arena === false && s.encButtons.length === 2,
    `encounter=${s.encounter} arena=${s.arena} buttons=[${s.encButtons.join(', ')}], `
    + `standing 45 m off ${t.w.id} on heading ${t.w.heading.toFixed(0)}`);
}

if (cap || (ahead && ahead.cap)) {
  const why = 'the Boneyard could not draw on this machine';
  for (const n of ROWS) unproven(n, why);
} else if (empty) {
  /* NOBODY TO STAND IN FRONT OF, AND THE REASON IS MEASURED RATHER THAN ASSUMED.
     This used to open with "no Wanderer is within WANDER_SHOW_M of HOME right
     now", which is a claim about his loop, and it printed that claim even when
     the truth was that js/water.js could not reach a tile and the land oracle
     had answered nothing at all (see realWanderer in godmode.js for the
     2026-09-02 measurement). Two different causes, one sentence, and the wrong
     half of it was the load-bearing one. The lead clause now says only what is
     certainly true, which is that there was nobody to grade; realWanderer's own
     `why` names which of the three reasons it was.
     His loop is a genuinely possible reason: he walks 140-220 m once every 45
     minutes and can leave WANDER_SHOW_M inside an instance. Measured 2026-09-02
     by sweeping all 1440 minutes of five consecutive days against the real land
     oracle from HOME: 1414 to 1440 minutes of 1440 have somebody in range, so it
     is a rare state and not the usual explanation for an exit 97. */
  const why = `no Wanderer could be stood in front of on this run: ${empty.why}`;
  for (const n of ROWS.slice(emptyFrom)) unproven(n, why);
}
if (srv) await srv.close();
/* THE BANNER MUST NAME A MISSING PROPERTY. On the empty path there is no
   capability object, so it printed "did not fully run on this machine" and then
   nothing at all about WHAT was missing: an exit 97 that would not say why. The
   land oracle is measured on that path, so it is reported as a measured check
   like WEBGL and TILES are. When it DID answer, the row lands under "PRESENT,
   so these are NOT the reason", which is the honest reading. */
const oracleCap = empty && { checks: [{ kind: 'ORACLE', ok: empty.oracle,
  detail: empty.oracle
    ? `js/water.js classified ${empty.tiles} lattice point(s) around HOME, so the land oracle is not the reason`
    : `js/water.js could not classify a single one of the lattice points around HOME in ${empty.waitedMs}ms, `
      + 'so no wanderer can be placed on land and the empty set says nothing about where he walks' }] };
unprovenReport('wanderer-patrol-live-audit.mjs', cap || (ahead && ahead.cap) || oracleCap);
console.log(fails ? '\nWANDERER PATROL LIVE AUDIT FAILED'
  : ((cap || empty) ? '\nWANDERER PATROL LIVE AUDIT UNPROVEN' : '\nWANDERER PATROL LIVE AUDIT VERIFIED'));
process.exit(exitFor(fails));
