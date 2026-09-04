/* THE WANDERER IN THE BONEYARD: the path, the light, the trigger, the money and
 * the ceiling.
 *
 * He is the one AGENT on the walking map. Everything else out there is a thing
 * at a place; he has a position that changes on its own, a heading, a cone of
 * light drawn ahead of it, and an encounter that fires from the PLAYER'S OWN
 * MOVEMENT rather than from a tap. Five things can go wrong with that and every
 * one of them looks fine from the outside.
 *
 * 1. THE PATH IS DERIVED, NEVER ROLLED. The map rebuilds this from scratch every
 *    5 seconds; a Math.random() walk teleports him twelve times a minute, a
 *    stored position desyncs between devices and lets closing the app reroll him
 *    off your back. So it is graded on PURITY first: the same (date, cell, clock)
 *    re-derived, and re-derived again in a SECOND BROWSER PAGE with its own fresh
 *    module realm, must give the same metre. Asking a cached object about itself
 *    would pass on Math.random too.
 *
 * 2. HE ACTUALLY WALKS, AND SLOWLY. A pure function is easy to make pure by
 *    making it constant. The clock must move him, a new 45-minute instance must
 *    move his whole beat, and the speed that falls out of the loop has to be a
 *    slow walk: fast enough to be hunting, slow enough that a player at walking
 *    pace can always leave. Both ends are asserted, because either failure ships
 *    a different game.
 *
 * 3. THE HEADING IS THE PATH'S OWN TANGENT. It is computed analytically, so a
 *    sign error in the direction of travel or in the longitude scaling would
 *    leave him facing somewhere he is not going and the light would sweep the
 *    wrong way. Graded against the bearing between two real consecutive
 *    positions, which is the definition rather than the implementation.
 *
 * 4. THE LIGHT IS THE TRIGGER, AND WHAT IS DRAWN IS WHAT CATCHES YOU. Proved
 *    with the player INSIDE and OUTSIDE, on both axes (too far, and off to the
 *    side), and then the DRAWN wedge is read back out of the real paint function
 *    and compared with the predicate's own edge.
 *
 * 5. THE MONEY AND THE CEILING. He is farmable by construction (his path is
 *    public and his beat is a loop), so his ledger key is the only thing between
 *    a Step Egg every thirty seconds and a Step Egg per instance. And the
 *    ceiling: denWinsCount() counts `bossfirst-` rows, endlessCeiling = 7 + 3x
 *    that, Tom has reported this area broken three separate times, and the
 *    decision confirmed 2026-08-21 is that a Boneyard Wanderer mints NOTHING.
 *    The behavioural row carries its own CONTROL, because "the ceiling did not
 *    move" also passes on a broken instrument.
 *
 * WHAT THIS DOES NOT DO, on purpose: it does not drive a real GPS fix into the
 * live map. Doing that needs a faked position to survive MapLibre's vector tiles
 * on a machine with a network, which is a flaky thing to hang a money guard on
 * (the same call tests/mimic-audit.mjs made). The hops a fake could hide are
 * covered as source lints instead, and every one of them is an OFFSET or a
 * FIELD, never a class name or a copy string, so reformatting cannot drift them
 * red.
 *
 * THE KNOWN RED IS GONE, AND IT WAS THE ROW, NOT THE APP. 2026-08-27. VISIBLE
 * had been red on clean main for weeks: it wanted a Wanderer handed to the map
 * from beyond his own 300 m cone and witnessed that with ONE wanderersNear call
 * at one point at one minute. A cell is WANDER_CELL_DEG = 0.02 deg, so the eight
 * neighbours of your cell sit 1.4 to 2.2 km off and every one of them is outside
 * WANDER_SHOW_M; one call therefore hands over exactly ONE man, your own cell's,
 * and whether he happens to be inside 300 m at that minute is a coin flip. The
 * row read "0 of 1", which is a sample of one, not a fairness bug.
 * The app was measured before the row was touched, over 1728 player positions
 * (81 cells, two stances in each, six minutes across the day): 1836 handovers,
 * 1638 of them (89.2%) beyond the 300 m cone, furthest handover 1199.80 m
 * against WANDER_SHOW_M = 1200, none past it, no cell handed over twice. He is
 * drawn far outside his light exactly as the rule requires. So VISIBLE now
 * grades that measurement instead of that coin flip, DENSITY grades the same
 * sample instead of the same single call, and SHOW-CAP was added because the
 * sample makes the other side of the contract free to assert.
 * Measured on this tree after the change: 63 PASS / 0 FAIL. Before it, on the
 * same tree: 61 PASS / 1 FAIL (VISIBLE).
 *
 * PROVE-RED, 2026-08-27, for the handover rows. Same method as below: throwaway
 * `cp -R` with .git removed, one mutation at a time, exit read from a FILE.
 * Every mutation exited 1 and moved exactly the row named, 62 PASS / 1 FAIL.
 *   SHOW-SHRINK  WANDER_SHOW_M 1200 -> 300, so he is only drawn once he is
 *     already able to catch you -> VISIBLE "0 of 198 handed over ... beyond the
 *     300 m cone; furthest handover 299 m; drawn out to 300 m (1.0x his reach)".
 *     Note the denominator went 1836 -> 198: the sample control catches the
 *     starvation on its own, which is the half the old one-call row could not do.
 *   CONE-ONLY    wanderersNear's filter changed to CONE_RANGE_M, so the constant
 *     still reads 1200 and the handover no longer honours it -> VISIBLE red on
 *     "furthest handover 299 m" while "drawn out to 1200 m (4.0x)" still prints.
 *     That is the whole point of grading the measurement instead of the constant.
 *   NO-CAP       the WANDER_SHOW_M filter deleted -> SHOW-CAP "13716 of 15552
 *     handovers past 1200 m".
 *   DUP-CELL     every handover pushed twice -> DENSITY "1566 of 1728 handovers
 *     repeated a cell; busiest handover 6 men".
 *
 * PROVE-RED, 2026-08-22, for the rows added with the beam rework. Throwaway
 * `cp -R` of the tree with its .git removed, one mutation at a time, exit code
 * read from a FILE and never through a pipe. Every mutation exited 1; only the
 * rows named went red.
 *   NARROW-WEDGE   the beam stops laid out over CONE_HALF_DEG - 6 instead of
 *     CONE_HALF_DEG, so the light is drawn 48 degrees wide over a 60-degree
 *     trap -> DRAWN "48deg of light ... against a catch wedge of +/-30" and
 *     AGREE "60 disagreements, e.g. bearing 207 at 20m (-29.57deg off his
 *     heading): drawn false, caught true". That is the exact failure the pair
 *     exists for: ground that looks dark and catches you anyway.
 *   FLAT-SLAB      BEAM replaced by the v423 profile, one alpha held flat with
 *     a bevel at each end -> BEAM "at 3/4 out it is 100% of the peak" and
 *     SOFT-EDGE "27 deg off his heading is 95% of the light on his axis".
 *   NO-POOL        the radial-gradient layer deleted, so the wedge springs from
 *     a mathematical point again -> SOURCE "0 stops in the pool layer",
 *     SOURCE-RENDER "0.0 above ground just behind the flame" and LAMP-END
 *     "1.59x the middle of the throw" (2.07x with the pool).
 *   HUGE-POOL      CORE_R 0.085 -> 0.4 -> SOURCE "the pool dies 40% of the way
 *     along the beam (120 m of a 300 m throw)" and SOURCE-RENDER "85.2 above
 *     ground at 15% of the throw behind him". The honesty cap: a glow that big
 *     is lit ground behind a man who catches nobody behind him.
 *   SHORT-MASK     the distance mask taken to zero at 70% -> FALLOFF red.
 *   PULSE-AGAIN    the 3.2s wandererLantern opacity loop put back -> STILL
 *     "animation-name wandererLantern, opacity 0.74".
 *   NO-GATE        the repaint gate deleted from paintWandererCone -> STEADY
 *     "360 style assignment(s) across 120 calls" (0 with it) and HOLD.
 *   FALLBACK-200   the null size made to fall back to 200 the way v423's caller
 *     did -> HOLD "3 style assignment(s) from three unanswerable frames, still
 *     200px". That 200 IS the flicker Tom reported.
 *   VIRGIN-BLANK   the null size made to return early with no fallback at all
 *     -> HOLD "200px, background painted: false". The other direction, and
 *     anti-regression rule 8: never default to hidden.
 *   MIRROR-UNNEGATED  the mirrored plate's translate left un-negated ->
 *     APEX-MIRRORED "124.75px between the apex and the flame".
 * A MUTATION THAT PROVED NOTHING, recorded because it is the useful half: the
 * distance mask restored to its v423 stops moved no row at all (LAMP-END read
 * 1.97x against 2.07x). The near-field brightness is carried by the pool, not
 * by the mask, so the mask was left as it shipped.
 *
 *   node tests/wanderer-boneyard-audit.mjs        (self-serves this checkout)
 *   URL=https://... node tests/wanderer-boneyard-audit.mjs
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boot, seed, serveTree } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
console.log(`URL UNDER TEST  ${base}`);
/* BOOT'S OWN ERROR ARRAY, not a listener attached after it. A listener added
   once boot() has returned cannot see anything thrown during the very first
   load, which is exactly where a broken module import lands: the app comes up
   empty, every module-level row here still passes because it imports its own
   modules by hand, and NO PAGE ERRORS reports green over an app that never
   started. Measured: `import { paintWandererConeXX }` printed PAGEERROR and the
   post-boot listener saw nothing. */
const { browser, page, errors: bootErrs = [] } = await boot(base, { seed: true });
const errs = bootErrs;
page.on('pageerror', e => errs.push(String(e)));

const DATE = '2026-08-21';

try {
  /* ------------------------------------------------------- 1. THE PATH */

  // A wide real sample: many cells, every 45-minute instance of a day, sampled
  // minute by minute inside the instances. An empty or tiny sample is a FAILURE.
  const walk = await page.evaluate(async (DATE) => {
    const W = await import('./js/wanderer.js');
    const { distanceM, bearingDeg } = await import('./js/hunt.js');
    const cells = [];
    for (let cx = -40; cx <= 40; cx += 7) for (let cy = -40; cy <= 40; cy += 7) cells.push([cx, cy]);

    // does the clock move him, and how fast
    const steps = [];
    /* A CONTROL THAT CAN GO RED. Counting loop iterations would grade the audit's
       own for-loop, which is vacuous: an implementation that returned one frozen
       point for every input would still report a big "sample". Count DISTINCT
       positions instead, so a degenerate generator empties the sample it is
       being graded on. */
    const seen = new Set();
    let headingErrWorst = 0, headingChecked = 0;
    for (const [cx, cy] of cells) {
      for (let m = 1; m < 44; m += 4) {
        const a = W.wandererAt(cx, cy, DATE, m);
        const b = W.wandererAt(cx, cy, DATE, m + 1);
        const d = distanceM(a.lat, a.lng, b.lat, b.lng);
        steps.push(d / 60);                      // metres per second
        seen.add(`${a.lat},${a.lng},${a.heading}`);
        /* THE HEADING IS THE PATH'S TANGENT, graded against the DEFINITION: the
           bearing from where he is to where he will be. A 1-minute chord on a
           140-220 m circle subtends 8 degrees, so the chord's bearing lags the
           tangent at `a` by half of that; compare against the MIDPOINT sample,
           where the chord bearing and the tangent coincide. */
        const mid = W.wandererAt(cx, cy, DATE, m + 0.5);
        const chord = bearingDeg(a.lat, a.lng, b.lat, b.lng);
        const err = Math.abs((((chord - mid.heading) + 540) % 360) - 180);
        headingErrWorst = Math.max(headingErrWorst, err);
        headingChecked++;
      }
    }

    // a NEW 45-minute instance must take up a NEW beat
    const beatMoves = [];
    for (const [cx, cy] of cells) {
      const a = W.wandererAt(cx, cy, DATE, 10);
      const b = W.wandererAt(cx, cy, DATE, 55);          // next instance, same phase
      beatMoves.push(distanceM(a.lat, a.lng, b.lat, b.lng));
      if (a.id === b.id) beatMoves.push(-1);             // instance id must change too
    }

    // purity within one realm: re-derive, exactly as refreshWanderer re-derives
    let flips = 0, checked = 0;
    const fp = [];
    for (const [cx, cy] of cells) {
      for (const m of [3, 20, 61, 200, 700, 1300]) {
        const first = W.wandererAt(cx, cy, DATE, m);
        for (let round = 0; round < 4; round++) {
          const again = W.wandererAt(cx, cy, DATE, m);
          checked++;
          if (again.lat !== first.lat || again.lng !== first.lng || again.heading !== first.heading) flips++;
        }
        fp.push([cx, cy, m, first.lat, first.lng, first.heading]);
      }
    }

    /* WHAT THE MAP IS ACTUALLY HANDED: one per cell, and DRAWN well outside his
       own cone. Sampled the way the rest of this file samples, over the same 81
       cells, from two stances inside each (dead centre and off-centre, because a
       player is not standing on a cell centre) and across the day's instances.
       A ONE-CALL SAMPLE IS THE BUG THIS BLOCK REPLACES: a cell is 0.02 deg, so
       its eight neighbours sit 1.4 to 2.2 km away and all but your own fall
       outside WANDER_SHOW_M. One call therefore hands over ONE man, and whether
       that one happens to be inside 300 m at that one minute is a coin flip that
       has nothing to do with what the row is grading. */
    let nCalls = 0, nHanded = 0, nFar = 0, nOver = 0, nDup = 0, nMaxDist = 0, nMaxN = 0;
    for (const [cx, cy] of cells) {
      for (const [ox, oy] of [[0, 0], [0.3, -0.25]]) {
        for (const m of [3, 20, 61, 200, 700, 1300]) {
          const near = W.wanderersNear(DATE, (cx + ox) * W.WANDER_CELL_DEG, (cy + oy) * W.WANDER_CELL_DEG, m);
          nCalls++;
          nHanded += near.length;
          nMaxN = Math.max(nMaxN, near.length);
          if (new Set(near.map(w => `${w.cx}_${w.cy}`)).size !== near.length) nDup++;
          for (const w of near) {
            if (w.dist > W.CONE_RANGE_M) nFar++;
            if (w.dist > W.WANDER_SHOW_M) nOver++;
            nMaxDist = Math.max(nMaxDist, w.dist);
          }
        }
      }
    }
    return {
      cells: cells.length, samples: steps.length, distinct: seen.size, checked, flips, fp,
      spdMin: Math.min(...steps), spdMax: Math.max(...steps),
      spdMean: steps.reduce((a, b) => a + b, 0) / steps.length,
      headingErrWorst, headingChecked,
      beatMin: Math.min(...beatMoves),
      nCalls, nHanded, nFar, nOver, nDup, nMaxDist, nMaxN,
      coneRange: W.CONE_RANGE_M, coneHalf: W.CONE_HALF_DEG, showM: W.WANDER_SHOW_M,
    };
  }, DATE);

  ok('CONTROL the path was graded on a real sample out of the real generator',
    walk.cells >= 100 && walk.samples >= 1000 && walk.checked >= 500 && walk.distinct >= walk.samples * 0.9,
    `${walk.cells} cells, ${walk.samples} one-minute steps of which ${walk.distinct} land somewhere distinct, ${walk.checked} purity reads`);

  ok('PURE re-deriving his position from (date, cell, clock) never changes it',
    walk.flips === 0, `${walk.flips} flips across ${walk.checked} reads`);

  ok('WALKS the clock actually moves him: every one-minute step covers ground',
    walk.spdMin > 0.2, `slowest step ${walk.spdMin.toFixed(3)} m/s`);

  /* SLOWLY, and the ceiling is the half that matters. A player walks at ~1.4
     m/s. If he ever got near that, "step out of the light" stops being a move a
     player can make and the feature becomes a mugging. */
  ok('SLOWLY he walks at well under a third of walking pace, so he can be outwalked',
    walk.spdMax < 0.6 && walk.spdMean > 0.25,
    `${walk.spdMin.toFixed(2)} to ${walk.spdMax.toFixed(2)} m/s, mean ${walk.spdMean.toFixed(2)} (a walk is ~1.4)`);

  ok('HEADING the cone points where he is actually going, not where he has been',
    walk.headingErrWorst < 1.5,
    `worst disagreement ${walk.headingErrWorst.toFixed(3)} deg with the real path bearing, over ${walk.headingChecked} samples`);

  ok('INSTANCE a new 45-minute instance takes up a new beat somewhere else',
    walk.beatMin > 20, `smallest move across the instance boundary ${walk.beatMin.toFixed(0)} m`);

  /* HE IS VISIBLE OUTSIDE THE LIGHT. Tom's own rule, and the reason this is not
     the Mimic: an invisible hunter is a mugging. wanderersNear must hand the map
     Wanderers that are nowhere near catching you, so they can be drawn and
     walked around. */
  /* Three times his own reach, not five. The beam went 90 m -> 300 m and the
     multiple came down with it; what the row is for is unchanged, which is that
     you must be able to SEE him from well outside the light or routing around it
     is not a move you can make. 1200 m against a 300 m beam still means four
     minutes of walking between spotting him and being lit.
     GRADED ON THE HANDOVER, NOT ON THE CONSTANT. The old row read the constant
     and then tried to witness it with a single wanderersNear call, which hands
     over exactly one man; the witness was a coin flip and it had been red on
     clean main for weeks over a sample of one. What is asserted now is the
     distance the map is ACTUALLY handed: the furthest handover in a real sample
     has to reach three cone-lengths, and most handovers have to be outside the
     light, so a wanderersNear rewritten to hand over only men who are already
     about to catch you goes red on the measurement rather than on the constant.
     The denominator is printed: an empty sample is a failure, not a pass. */
  ok('VISIBLE he is handed to the map far outside his own cone, so he can be avoided',
    walk.nHanded >= 500 && walk.nFar >= walk.nHanded * 0.5
    && walk.nMaxDist >= walk.coneRange * 3 && walk.showM >= walk.coneRange * 3,
    `${walk.nFar} of ${walk.nHanded} handed over across ${walk.nCalls} player positions are beyond the ` +
    `${walk.coneRange} m cone; furthest handover ${walk.nMaxDist.toFixed(0)} m; drawn out to ${walk.showM} m ` +
    `(${(walk.showM / walk.coneRange).toFixed(1)}x his reach)`);

  /* And never further than he is drawn: a man handed over past WANDER_SHOW_M is
     a marker the map has no business painting. */
  ok('SHOW-CAP nobody is handed over from beyond the draw radius',
    walk.nOver === 0, `${walk.nOver} of ${walk.nHanded} handovers past ${walk.showM} m`);

  ok('DENSITY one per cell, no more',
    walk.nHanded > 0 && walk.nDup === 0,
    `${walk.nDup} of ${walk.nCalls} handovers repeated a cell; busiest handover ${walk.nMaxN} men`);

  /* PURITY ACROSS REALMS. The rows above all ran in one page, where a module
     that cached a position at import time would still look pure. A second page
     is a second module realm with its own clock read and its own memory: if he
     is derived, it computes the same metre from nothing. */
  const page2 = await browser.newPage();
  await page2.goto(base.replace(/\/?$/, '/') + '?demo', { waitUntil: 'networkidle2' });
  const reload = await page2.evaluate(async ({ DATE, fp }) => {
    const W = await import('./js/wanderer.js');
    let worst = 0, checked = 0;
    // same rule as the path control: an implementation that returned one frozen
    // point would agree with itself across realms perfectly, so the control has
    // to grade how many DIFFERENT positions the comparison actually covered.
    const seen = new Set();
    for (const [cx, cy, m, lat, lng, heading] of fp) {
      const w = W.wandererAt(cx, cy, DATE, m);
      worst = Math.max(worst, Math.abs(w.lat - lat), Math.abs(w.lng - lng), Math.abs(w.heading - heading));
      seen.add(`${w.lat},${w.lng}`);
      checked++;
    }
    return { worst, checked, distinct: seen.size };
  }, { DATE, fp: walk.fp });
  await page2.close();
  ok('CONTROL the cross-realm check compared a real set of positions',
    reload.checked >= 500 && reload.distinct >= reload.checked * 0.9,
    `${reload.checked} positions re-derived in a second browser page, ${reload.distinct} of them distinct`);
  ok('OFFLINE-SAFE a fresh page with no shared memory computes the same man in the same place',
    reload.worst === 0, `worst disagreement ${reload.worst}`);

  /* -------------------------------------------------------- 2. THE LIGHT */

  const cone = await page.evaluate(async (DATE) => {
    const W = await import('./js/wanderer.js');
    // a point `d` metres from (lat,lng) on compass bearing `brg`
    const dest = (lat, lng, brg, d) => {
      const R = 6371000, r = Math.PI / 180;
      const f1 = lat * r, l1 = lng * r, b = brg * r, dr = d / R;
      const f2 = Math.asin(Math.sin(f1) * Math.cos(dr) + Math.cos(f1) * Math.sin(dr) * Math.cos(b));
      const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(dr) * Math.cos(f1), Math.cos(dr) - Math.sin(f1) * Math.sin(f2));
      return { lat: f2 / r, lng: l2 / r };
    };
    const R = W.CONE_RANGE_M, H = W.CONE_HALF_DEG;
    // graded over many DIFFERENT Wanderers, so it cannot pass on one lucky heading
    const cases = [];
    // the sample's own control: these rows are all "probe at heading + N", so a
    // constant heading would grade one direction 180 times and read as coverage.
    const headings = new Set();
    /* Swept across a whole lap, because heading is a function of the phase and
       nothing else: three fixed minute values would grade six directions however
       many cells they were spread over. */
    for (let cx = 0; cx < 20; cx++) {
      for (let m = 1; m < 45; m += 1.5) {
        const w = W.wandererAt(cx, 3, DATE, m);
        headings.add(Math.round(w.heading));
        const probe = (off, dist) => {
          const p = dest(w.lat, w.lng, w.heading + off, dist);
          return W.inWandererCone(w, p.lat, p.lng);
        };
        cases.push({
          ahead: probe(0, R * 0.5),                 // dead ahead, well inside -> IN
          edgeIn: probe(H - 2, R * 0.5),            // just inside the lit edge -> IN
          edgeOut: probe(H + 2, R * 0.5),           // just outside it -> OUT
          side: probe(90, R * 0.5),                 // abreast of him -> OUT
          behind: probe(180, R * 0.5),              // behind him -> OUT
          tooFar: probe(0, R * 1.25),               // straight ahead but past the light -> OUT
          justIn: probe(0, R * 0.95),               // straight ahead, just inside -> IN
          onHim: W.inWandererCone(w, w.lat, w.lng), // standing on him -> IN
        });
      }
    }
    const all = k => cases.every(c => c[k]);
    const none = k => cases.every(c => !c[k]);

    /* WHAT IS DRAWN IS WHAT CATCHES YOU. Read the wedge back out of the REAL
       paint function rather than trusting that two numbers agree: a cone drawn
       wider than the predicate is a player caught by ground that looked dark.

       PARSED PROPERLY NOW, because the beam is no longer a flat top. The old
       read looked for the two stops carrying the one alpha the wedge was
       painted with (.46) and called the outer one the edge. The profile is a
       dome, every stop carries a different alpha, and .46 is not among them, so
       that read would find nothing on a perfectly good cone. This one takes
       EVERY stop out of the conic layer and derives the drawn edge from where
       the alpha reaches zero, which is what "the edge of the light" means for
       any profile anyone paints in future. */
    /* CLASSED AND STYLED, not a bare div. The stylesheet carries the distance
       falloff, so an unclassed element reports `mask: none` and the FALLOFF row
       below grades nothing. (It did exactly that on the first run.) */
    W.ensureWandererStyle();
    const el = document.createElement('div');
    el.className = 'wanderer-cone';
    document.body.appendChild(el);
    const HEAD = 123.4;
    W.paintWandererCone(el, 300, HEAD);
    const bg = el.style.background;
    const maskCss = getComputedStyle(el).getPropertyValue('mask-image')
      || getComputedStyle(el).getPropertyValue('-webkit-mask-image') || '';
    // the two layers: the flame's own pool, then the wedge
    const iConic = bg.indexOf('conic-gradient(');
    const conic = iConic >= 0 ? bg.slice(iConic) : '';
    const pool = iConic > 0 ? bg.slice(0, iConic) : '';
    const from = /from\s+([\d.]+)deg/.exec(conic);
    // the browser re-serialises rgba() with its own spacing and a leading zero,
    // so the read has to tolerate both forms rather than the string we wrote
    const rx = /rgba\(\s*255,\s*228,\s*150,\s*(0?\.?\d+)\s*\)\s+([\d.]+)deg/g;
    const stops = [...conic.matchAll(rx)].map(m => ({ a: +m[1], deg: +m[2] }));
    const lit = stops.filter(s => s.a > 0);
    // the drawn wedge runs from the last dark stop before the light to the
    // first dark stop after it
    const before = stops.filter(s => s.a === 0 && s.deg <= (lit[0] || {}).deg).pop();
    const after = stops.find(s => s.a === 0 && s.deg >= (lit[lit.length - 1] || {}).deg);
    const peak = lit.reduce((m, s) => (s.a > m.a ? s : m), lit[0] || { a: 0, deg: 0 });
    const axis = ((before || {}).deg + (after || {}).deg) / 2;
    /* IS IT A DOME. Walking outward from the axis in either direction, the alpha
       may never rise: that is what separates a beam from a slab with bevelled
       sides. And the shoulder has to be a real fall, not a rounding: at 3/4 of
       the way out the light must be well under the axis. */
    const outward = (dir) => lit.filter(s => dir > 0 ? s.deg >= axis : s.deg <= axis)
      .sort((p, q) => dir * (p.deg - q.deg)).map(s => s.a);
    const monotone = arr => arr.every((v, i) => i === 0 || v <= arr[i - 1] + 1e-9);
    const at = frac => {
      const want = axis + frac * ((after || {}).deg - axis);
      return lit.reduce((m, s) => Math.abs(s.deg - want) < Math.abs(m.deg - want) ? s : m, lit[0]).a;
    };
    /* THE POOL AT THE FLAME. A circle, centred, whose outermost stop is dark:
       its radius is the % at that stop, as a fraction of the beam's radius. */
    const poolStops = [...pool.matchAll(/rgba\([^)]*?,\s*(0?\.?\d+)\s*\)\s+([\d.]+)%/g)].map(m => ({ a: +m[1], pc: +m[2] }));
    el.remove();

    /* DRAWN == CAUGHT, ON A GRID. The rows above compare two numbers; this walks
       a real fan of bearings and radii around a real Wanderer and asks the
       DRAWN geometry and inWandererCone the same question about each point. Any
       disagreement is ground that looks one way and behaves the other. */
    const gw = W.wandererAt(7, 3, DATE, 17.5);
    const drawnLo = gw.heading - (axis - (before || {}).deg);
    const drawnHi = gw.heading + ((after || {}).deg - axis);
    const grid = { n: 0, lit: 0, dark: 0, disagree: 0, worst: null };
    for (let brg = 0; brg < 360; brg += 1) {
      for (const dist of [20, 80, 150, 240, 297, 303, 380]) {
        const p = dest(gw.lat, gw.lng, brg, dist);
        const rel = ((brg - gw.heading) + 540) % 360 - 180;
        const drawn = dist <= R && rel >= (drawnLo - gw.heading) && rel <= (drawnHi - gw.heading);
        const caught = W.inWandererCone(gw, p.lat, p.lng);
        grid.n++;
        if (caught) grid.lit++; else grid.dark++;
        if (drawn !== caught) { grid.disagree++; if (!grid.worst) grid.worst = { brg, dist, rel: +rel.toFixed(2), drawn, caught }; }
      }
    }

    return {
      n: cases.length, headings: headings.size, all_ahead: all('ahead'), all_edgeIn: all('edgeIn'), all_justIn: all('justIn'),
      all_onHim: all('onHim'), none_edgeOut: none('edgeOut'), none_side: none('side'),
      none_behind: none('behind'), none_tooFar: none('tooFar'),
      drawnFrom: from ? +from[1] : null,
      wedgeLo: before ? before.deg : null, wedgeHi: after ? after.deg : null,
      nStops: stops.length, peakA: peak.a, peakDeg: peak.deg, axis,
      domeUp: monotone(outward(1)), domeDown: monotone(outward(-1)),
      shoulder: peak.a ? at(0.75) / peak.a : null,
      pool: poolStops.length, poolInner: poolStops.length ? poolStops[0].a : null,
      poolOuterA: poolStops.length ? poolStops[poolStops.length - 1].a : null,
      poolRadiusPc: poolStops.length ? poolStops[poolStops.length - 1].pc : null,
      maskEndsDark: /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)\s+100%/.test(maskCss),
      maskHead: maskCss.slice(0, 90),
      grid, head: HEAD, gridHeading: gw.heading,
      H, R, bgLen: bg.length,
    };
  }, DATE);

  ok('CONTROL the cone was graded across many different Wanderers and headings',
    cone.n >= 100 && cone.headings >= 40, `${cone.n} (Wanderer, position) cases over ${cone.headings} distinct headings`);
  ok('IN a player standing in the light is caught',
    cone.all_ahead && cone.all_justIn && cone.all_edgeIn && cone.all_onHim,
    `ahead ${cone.all_ahead}, at ${cone.R * 0.95}m ${cone.all_justIn}, ${cone.H - 2}deg off ${cone.all_edgeIn}, on him ${cone.all_onHim}`);
  ok('OUT a player outside it is not: past the light, off to the side, and behind him',
    cone.none_tooFar && cone.none_side && cone.none_behind && cone.none_edgeOut,
    `${cone.R * 1.25}m out ${cone.none_tooFar}, abreast ${cone.none_side}, behind ${cone.none_behind}, ${cone.H + 2}deg off ${cone.none_edgeOut}`);
  ok('CONTROL the painted wedge was really read back, stop by stop',
    cone.nStops >= 4 && cone.peakA > 0 && cone.wedgeLo !== null && cone.wedgeHi !== null,
    `${cone.nStops} colour stops parsed out of the conic layer, peak alpha ${cone.peakA} at ${cone.peakDeg}deg`);
  ok('DRAWN the wedge the map paints is the same wedge that catches you',
    cone.drawnFrom !== null
    && Math.abs(cone.drawnFrom - (cone.head - cone.H)) < 0.11
    && Math.abs((cone.wedgeHi - cone.wedgeLo) - cone.H * 2) < 0.11
    && Math.abs(cone.axis - cone.H) < 0.11,
    `painted from ${cone.drawnFrom}deg, dark at ${cone.wedgeLo} and ${cone.wedgeHi}, `
    + `so ${cone.wedgeHi - cone.wedgeLo}deg of light centred on heading ${cone.head} against a catch wedge of +/-${cone.H}`);

  /* DRAWN == CAUGHT, POINT BY POINT. The row above compares the wedge's numbers.
     This one takes 2520 real points around a real Wanderer and asks the drawn
     geometry and inWandererCone about each of them, so "the light and the trap
     are the same shape" is measured rather than restated. Carries its own
     control: a grid that landed entirely inside or entirely outside the beam
     would agree perfectly and prove nothing (rule 3). */
  ok('CONTROL the drawn-vs-caught grid straddles the edge of the light',
    cone.grid.n >= 1000 && cone.grid.lit > 100 && cone.grid.dark > 100,
    `${cone.grid.n} points around a Wanderer heading ${cone.gridHeading.toFixed(1)}deg: ${cone.grid.lit} caught, ${cone.grid.dark} not`);
  ok('AGREE every point the beam is drawn over is a point that catches you, and no other',
    cone.grid.disagree === 0,
    cone.grid.disagree === 0 ? `0 disagreements in ${cone.grid.n} points`
      : `${cone.grid.disagree} disagreements, e.g. bearing ${cone.grid.worst.brg} at ${cone.grid.worst.dist}m `
        + `(${cone.grid.worst.rel}deg off his heading): drawn ${cone.grid.worst.drawn}, caught ${cone.grid.worst.caught}`);

  /* BEAM. Tom, 2026-08-22: "you need to have the cone coming out of the lantern
     in a more believable way". The old profile held ONE alpha flat from +3deg to
     +57deg with a 3-degree bevel at each end, which is a pane of coloured light,
     not a beam, and it is the reason the wedge read as a shape laid on the map.
     Light out of a lamp is brightest on its axis and dies towards its edges.
     THE DIRECTION OF FAILURE MATTERS AT BOTH ENDS (rule 11). Too flat and it is
     the slab again; too domed and the edges vanish, which would be worse than
     the bug, because the edge of the light is the edge of the trap and a player
     has to be able to see it. So the shoulder is a BAND: at three quarters of
     the way out the light must have fallen well below the axis and must still
     be plainly there. Measured on this tree: 0.58 of the peak. */
  ok('BEAM the light is a dome, brightest on its axis and dimmer to both edges',
    cone.domeUp && cone.domeDown && cone.shoulder !== null
    && cone.shoulder < 0.75 && cone.shoulder > 0.35
    && Math.abs(cone.peakDeg - cone.axis) < 0.11,
    `peak alpha ${cone.peakA} sits on the axis; falls monotonically to both edges `
    + `(${cone.domeUp}/${cone.domeDown}); at 3/4 out it is ${(cone.shoulder * 100).toFixed(0)}% of the peak`);

  /* SOURCE. The other half of "coming out of the lantern": a wedge springing
     from a mathematical point is light that appears out of nothing. There is a
     pool at the apex now, and it is the brightest thing in the drawing.
     AND IT IS CAPPED, which is the honesty half. The pool is a full circle, so
     it is the only lit ground BEHIND him, and inWandererCone catches nobody
     behind him past 5 m. A pool allowed to grow would become a second catch
     zone that catches nothing. Held under 12% of the beam's radius, which at
     the shipped 300 m is 36 m of glow around a man carrying a lamp. */
  ok('SOURCE the beam grows out of a pool of light at the flame, not out of a point',
    cone.pool >= 2 && cone.poolInner > cone.peakA && cone.poolOuterA === 0,
    `${cone.pool} stops in the pool layer, brightest ${cone.poolInner} against a beam peak of ${cone.peakA}, dark at its rim`);
  ok('SOURCE and the pool stays a lamp, never a second catch zone behind him',
    cone.poolRadiusPc !== null && cone.poolRadiusPc > 2 && cone.poolRadiusPc < 12,
    `the pool dies ${cone.poolRadiusPc}% of the way along the beam (${(cone.poolRadiusPc / 100 * cone.R).toFixed(0)} m of a ${cone.R} m throw)`);

  /* THE LIGHT REACHES THE WHOLE WAY. The radial mask is what makes it fade with
     distance, and it must reach zero at 100% and NOT before: a mask that died at
     70% would draw a beam visibly shorter than the range that catches you, which
     is the same dishonesty as a narrow wedge. */
  ok('FALLOFF the beam fades out exactly at its range, not before it',
    cone.maskEndsDark, `mask ${cone.maskHead}`);

  /* THE APEX IS THE LANTERN, NOT THE MIDDLE OF HIM.
   *
   * Tom: "cone originates from his lantern". Every row above measures angle and
   * distance from his lat/lng, and every one of them would still be green with
   * the beam springing from his chest, his boots or his horns, because they
   * never ask WHERE ON THE DRAWING that point is. This does.
   *
   * The trick that makes it one measurement rather than two coordinate systems:
   * the marker is anchored centre, so his lat/lng is the marker's centre, so the
   * cone is centred there and the PLATE is what moves. Build the real marker
   * from the real markup, and the lantern's ink must land on the cone's centre.
   * Carries its own anti-vacuity control, because if LANTERN were {0.5, 0.5}
   * this row would pass with nothing implemented at all. */
  const apex = await page.evaluate(async () => {
    const W = await import('./js/wanderer.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:40px;top:40px;';
    const el = document.createElement('div');
    el.className = 'map-wanderer-mark';
    el.innerHTML = W.wandererMarkHtml();
    host.appendChild(el);
    document.body.appendChild(host);
    /* MEASURED ON BOTH FACINGS. v423 mirrors the plate on his eastward half so
       the lantern always leads, and negates the translate with it so the flame
       stays on the marker's anchor. Its header states the two transforms it
       expects and says "VERIFIED BY RENDER SEPARATELY", which means the shipped
       suite never actually measured the mirrored case: a mirror that forgot to
       negate would leave the beam coming out of his back with every row green.
       The flame is at LANTERN.x on the unmirrored plate and at 1 - LANTERN.x on
       the mirrored one, which is the same correction the live suite needed. */
    const read = (heading) => {
      W.paintWandererCone(el.querySelector('.wanderer-cone'), 480, heading);
      const east = el.classList.contains('facing-east');
      const body = el.querySelector('.wanderer-body').getBoundingClientRect();
      const cone = el.querySelector('.wanderer-cone').getBoundingClientRect();
      const lx = east ? 1 - W.LANTERN.x : W.LANTERN.x;
      const lant = { x: body.left + lx * body.width, y: body.top + W.LANTERN.y * body.height };
      const cc = { x: cone.left + cone.width / 2, y: cone.top + cone.height / 2 };
      const pc = { x: body.left + body.width / 2, y: body.top + body.height / 2 };
      return {
        east, transform: getComputedStyle(el.querySelector('.wanderer-body')).transform,
        dLantern: +Math.hypot(cc.x - lant.x, cc.y - lant.y).toFixed(2),
        dPlateCentre: +Math.hypot(cc.x - pc.x, cc.y - pc.y).toFixed(2),
      };
    };
    const west = read(270), east = read(90);
    const mark = el.getBoundingClientRect();
    const taps = getComputedStyle(el).pointerEvents;
    host.remove();
    return {
      markPx: Math.round(mark.width), MARK_PX: W.MARK_PX, taps,
      dLantern: west.dLantern, dPlateCentre: west.dPlateCentre, west, east,
      lantern: W.LANTERN,
    };
  });
  ok('CONTROL the marker was really built and measured at its shipped size',
    apex.markPx === apex.MARK_PX && apex.markPx > 0, `${apex.markPx}px box, MARK_PX ${apex.MARK_PX}`);
  ok('CONTROL and the lantern is nowhere near the middle of him, so APEX is not vacuous',
    apex.dPlateCentre > apex.MARK_PX * 0.1,
    `the plate's centre is ${apex.dPlateCentre}px from the apex (lantern at ${(apex.lantern.x * 100).toFixed(1)}%, ${(apex.lantern.y * 100).toFixed(1)}% of the plate)`);
  ok('APEX the cone springs from his LANTERN, not from the middle of the drawing',
    apex.dLantern < 1.5, `${apex.dLantern}px between the cone's apex and the flame`);
  ok('CONTROL the mirror really fired, so APEX-MIRRORED is grading a flipped plate',
    apex.east.east === true && apex.west.east === false && /^matrix\(-1/.test(apex.east.transform),
    `west ${apex.west.transform}; east ${apex.east.transform}`);
  ok('APEX-MIRRORED and it still does once he turns east and the plate is flipped',
    apex.east.dLantern < 1.5,
    `${apex.east.dLantern}px between the apex and the flame on the mirrored plate `
    + `(${apex.west.dLantern}px unmirrored), so the negated translate really does keep the light on him`);
  ok('TAPTHRU a 260px marker does not swallow taps on the spawns underneath him',
    apex.taps === 'none', `pointer-events: ${apex.taps}`);

  /* --------------------------------------------- THE LIGHT HOLDS STILL
   *
   * Tom, 2026-08-22: "the wanderer's light cone is flickering in size ... the
   * cone shouldn't flicker or change size." Two separate faults behind one
   * sentence, and they fail in different places, so they are graded separately.
   *
   *  a. IT PULSED. The cone carried a 3.2s opacity loop between .74 and .98,
   *     added as a lantern breathing. He reads it as a fault. Graded on the
   *     computed style, with a visibility floor beside it so "no animation"
   *     cannot be achieved by turning the warning off.
   *  b. IT RESIZED. Graded here as the CONTRACT of the paint function, and on
   *     the real moving map in tests/wanderer-patrol-live-audit.mjs
   *     (STEADY-LIVE, TRACKS-LIVE), which is the only place the real failure
   *     could be reproduced.
   */
  const still = await page.evaluate(async () => {
    const W = await import('./js/wanderer.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:40px;top:40px;';
    const el = document.createElement('div');
    el.className = 'map-wanderer-mark';
    el.innerHTML = W.wandererMarkHtml();
    host.appendChild(el);
    document.body.appendChild(host);
    const cone = el.querySelector('.wanderer-cone');
    const cs = getComputedStyle(cone);
    const anim = { name: cs.animationName, opacity: +cs.opacity };

    W.paintWandererCone(cone, 507.6, 42);
    const settled = Math.round(cone.getBoundingClientRect().width);

    /* THE JITTER, REPRODUCED. A pan reprojects to a size that differs in the
       hundredths of a pixel; drive 120 of those and nothing on screen may move.
       Counted on the STYLE ATTRIBUTE, via a MutationObserver, because "it did
       not repaint" and "it repainted with the same string" are different
       machines and only one of them re-rasterises a 500px beam every frame. */
    /* COUNTED AT THE SETTER, and the first two instruments here were both
       checks that could not fail.
         A MutationObserver CALLBACK is a microtask, so it reports zero for
         everything that happened inside a synchronous loop.
         takeRecords() fixes that and is still wrong, because Chrome does not
         dirty the style attribute when a CSS property is assigned the value it
         already holds. Measured: with the repaint gate DELETED, so the function
         rewrote every property on all 120 calls, the observer saw 0 mutations
         and the row passed. That is the exact shape of anti-regression rule 1.
       So the count is taken where the work is: a Proxy over the element's own
       style object, which sees every assignment whether or not the value
       changed. That is also the thing being asserted, since the cost of the
       flicker is re-rasterising a 500px conic gradient, not the attribute. */
    let sets = 0;
    const realStyle = cone.style;
    const spy = new Proxy(realStyle, {
      get: (t, k) => { const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; },
      set: (t, k, v) => { sets++; t[k] = v; return true; },
    });
    Object.defineProperty(cone, 'style', { configurable: true, get: () => spy });
    const writes = () => { const n = sets; sets = 0; return n; };
    writes();
    /* THE NOISE IS MODELLED ON THE REAL THING, +/- a quarter of a pixel. That is
       what a pan actually produces: measured on the live map, a 1.6 s pan at a
       fixed zoom held ONE rendered width across 115 frames once the gate was in
       (tests/wanderer-patrol-live-audit.mjs, STEADY-LIVE). Deliberately NOT
       straddling a rounding boundary, which would be asking the gate to have
       hysteresis it does not claim: the contract is that the drawn size is the
       rounded size, and equal rounded sizes repaint nothing. */
    const widths = new Set();
    for (let i = 0; i < 120; i++) {
      W.paintWandererCone(cone, 508 + (Math.random() - 0.5) * 0.5, 42);
      widths.add(Math.round(cone.getBoundingClientRect().width * 100) / 100);
    }
    const jitterWrites = writes();

    /* THE CONTROLS. A gate that never lets anything through is not a gate, and
       the two things that MUST get through are a real zoom and a real tick. */
    W.paintWandererCone(cone, 640, 42);
    const zoomWrites = writes(), zoomed = Math.round(cone.getBoundingClientRect().width);
    W.paintWandererCone(cone, 640, 43.5);
    const turnWrites = writes();

    /* AND A SIZE THE MAP CANNOT ANSWER MUST CHANGE NOTHING. This is the actual
       v423 flicker: js/app.js substituted a 200px fallback on any frame where
       the projection was declined, which through a pan is every few seconds. */
    W.paintWandererCone(cone, null, 43.5);
    W.paintWandererCone(cone, 0, 43.5);
    W.paintWandererCone(cone, undefined, 43.5);
    const nullWrites = writes(), heldPx = Math.round(cone.getBoundingClientRect().width);
    delete cone.style;                                   // hand the real style object back

    // and a cone nobody has ever sized still draws, rather than vanishing
    const fresh = document.createElement('div');
    fresh.className = 'map-wanderer-mark';
    fresh.innerHTML = W.wandererMarkHtml();
    document.body.appendChild(fresh);
    const fc = fresh.querySelector('.wanderer-cone');
    W.paintWandererCone(fc, null, 42);
    const virgin = { px: Math.round(fc.getBoundingClientRect().width), painted: /gradient/.test(fc.style.background) };
    fresh.remove();
    host.remove();
    return { anim, settled, jitterWrites, widths: [...widths], zoomWrites, zoomed, turnWrites, nullWrites, heldPx, virgin };
  });

  ok('STILL the lantern does not pulse, and is still plainly visible without it',
    still.anim.name === 'none' && still.anim.opacity >= 0.6,
    `animation-name ${still.anim.name}, opacity ${still.anim.opacity}`);
  ok('CONTROL the cone under test was really sized before the jitter was driven',
    still.settled > 400, `${still.settled}px`);
  ok('STEADY 120 sub-pixel resizes, as a pan produces, repaint nothing and move nothing',
    still.jitterWrites === 0 && still.widths.length === 1,
    `${still.jitterWrites} style assignment(s) across 120 calls, ${still.widths.length} rendered width(s): [${still.widths}]`);
  ok('CONTROL and the gate still lets a real zoom and a real turn of his head through',
    still.zoomWrites > 0 && still.turnWrites > 0 && still.zoomed === 640,
    `zoom ${still.zoomWrites} style assignment(s) -> ${still.zoomed}px, heading change ${still.turnWrites}`);
  ok('HOLD a frame the map cannot size keeps the beam it has, instead of collapsing to the fallback',
    still.nullWrites === 0 && still.heldPx === 640,
    `${still.nullWrites} style assignment(s) from three unanswerable frames, still ${still.heldPx}px`);
  ok('HOLD and a cone nobody has ever sized is drawn anyway, rather than left invisible',
    still.virgin.painted && still.virgin.px > 0,
    `${still.virgin.px}px, background painted: ${still.virgin.painted}`);

  /* ------------------------------------- WHAT THE LIGHT ACTUALLY LOOKS LIKE
   *
   * Every row above reads the gradient's own numbers, and a gradient's numbers
   * are not a picture: masks, blend modes and a stacking context all sit
   * between the stops and the player's eye, and this repo has a rule about
   * grading the render rather than the source values. So this SCREENSHOTS the
   * real cone on a flat ground and measures the pixels.
   *
   * THE MAN IS REMOVED FIRST, and that is not a convenience. His plate is warm
   * green and gold with a drop shadow, and a first pass at this measured his
   * coat as lit ground and reported a 199-degree wedge on a 60-degree cone. The
   * light alone is the thing being graded.
   *
   * Decoded through a canvas in the page, the tests/crate-palette-audit.mjs
   * pattern: screenshot to base64, load it back as an Image, getImageData.
   */
  const GROUND = 0x20;                                     // the flat #202020 ground this is drawn on
  /* Laid OVER the app on its own opaque ground rather than replacing the page:
     the money, ceiling and lint sections still have to run in this same page
     after this, and a wiped body is a fine way to make them grade nothing. */
  const shotBox = await page.evaluate(async () => {
    const W = await import('./js/wanderer.js');
    const stage = document.createElement('div');
    stage.id = 'cone-stage';
    stage.style.cssText = 'position:fixed;inset:0;background:#202020;z-index:99999;';
    const el = document.createElement('div');
    el.className = 'map-wanderer-mark';
    el.style.cssText = 'position:absolute;left:115px;top:300px;';
    el.innerHTML = W.wandererMarkHtml();
    stage.appendChild(el);
    document.body.appendChild(stage);
    el.querySelector('.wanderer-body').remove();          // the LIGHT alone
    W.paintWandererCone(el.querySelector('.wanderer-cone'), 360, 90);   // due east
    const b = el.querySelector('.wanderer-cone').getBoundingClientRect();
    return { cx: b.left + b.width / 2, cy: b.top + b.height / 2, r: b.width / 2 };
  });
  const b64 = await page.screenshot({
    encoding: 'base64',
    clip: { x: shotBox.cx - shotBox.r, y: shotBox.cy - shotBox.r, width: shotBox.r * 2, height: shotBox.r * 2 },
  });
  const px = await page.evaluate(async ({ b64, GROUND }) => {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const R = c.width / 2, cx = R, cy = R;
    // the beam was painted due east, so the axis is +x and "behind him" is -x
    const bucket = {};
    const add = (k, v) => { (bucket[k] = bucket[k] || []).push(v); };
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        const lit = d[i] - GROUND;                        // the light is warm; red carries it
        const dx = x - cx, dy = y - cy, rad = Math.hypot(dx, dy) / R;
        if (rad > 1) continue;
        const rel = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);   // 0 = dead ahead, 180 = behind
        if (rad > 0.02 && rad < 0.05 && rel > 150) add('behind', lit);
        if (rad > 0.13 && rad < 0.18 && rel > 150) add('behindOut', lit);
        if (rad > 0.03 && rad < 0.07 && rel < 6) add('atLamp', lit);
        if (rad > 0.47 && rad < 0.53 && rel < 6) add('mid', lit);
        if (rad > 0.85 && rad < 0.92 && rel < 6) add('far', lit);
        if (rad > 0.2 && rad < 0.8 && rel > 25 && rel < 28) add('edge', lit);
        if (rad > 0.2 && rad < 0.8 && rel < 4) add('axis', lit);
        if (rad > 0.2 && rad < 0.8 && rel > 40 && rel < 90) add('outside', lit);
      }
    }
    const mean = k => (bucket[k] || []).reduce((s, v) => s + v, 0) / ((bucket[k] || []).length || 1);
    const n = k => (bucket[k] || []).length;
    return {
      w: c.width, behind: mean('behind'), behindOut: mean('behindOut'), atLamp: mean('atLamp'),
      mid: mean('mid'), far: mean('far'), edge: mean('edge'), axis: mean('axis'), outside: mean('outside'),
      counts: { behind: n('behind'), atLamp: n('atLamp'), mid: n('mid'), edge: n('edge'), axis: n('axis') },
    };
  }, { b64, GROUND });
  await page.evaluate(() => { document.getElementById('cone-stage')?.remove(); });

  ok('CONTROL the beam was really rendered and really sampled (an empty sample is a FAILURE)',
    px.w > 300 && px.counts.axis > 200 && px.counts.edge > 200 && px.counts.atLamp > 20 && px.axis > 10,
    `${px.w}px render; ${px.counts.axis} axis / ${px.counts.edge} edge / ${px.counts.atLamp} lamp pixels, axis reads +${px.axis.toFixed(1)} over the ground`);
  ok('CONTROL and nothing is drawn outside the wedge, so these are the beam\'s own pixels',
    px.outside < 1.5, `${px.outside.toFixed(2)} above ground at 40-90 deg off his heading`);

  /* HOT AT THE LAMP, measured along the axis. "Brightest at the lantern" was
     already the intent and the mask already started at full, but it started
     FALLING from the very first pixel, so the near field was only 1.5x the
     middle of the throw. Measured on this tree after the fix: 2.0x. */
  ok('LAMP-END the beam is at its hottest where the flame is, not out in the field',
    px.atLamp > px.mid * 1.7 && px.mid > px.far,
    `axis reads ${px.atLamp.toFixed(1)} at the lamp, ${px.mid.toFixed(1)} halfway out, ${px.far.toFixed(1)} at the far end `
    + `(${(px.atLamp / px.mid).toFixed(2)}x the middle of the throw)`);

  /* THE SOURCE HAS SIZE. This is the row that grades Tom's actual complaint and
     it is a binary: before the pool, the ground behind him was mathematically
     dark, because a conic gradient paints nothing outside its wedge. Now his
     lamp glows. Bounded on the other side too, and that bound is the honesty
     one: the glow must die well before it could read as ground worth avoiding,
     since inWandererCone catches nobody behind him past 5 m. */
  ok('SOURCE-RENDER his lantern glows: there is light on the ground right at the flame',
    px.behind > 8, `${px.behind.toFixed(1)} above ground just behind the flame (dead ground reads 0)`);
  ok('SOURCE-RENDER and that glow dies at the lamp, so it can never read as lit ground',
    px.behindOut < 2, `${px.behindOut.toFixed(1)} above ground at 15% of the throw behind him`);

  /* SOFT EDGES. The old profile was one flat alpha with a 3-degree bevel, so the
     edge sat at 84% of the axis: a hard line, and the single biggest reason it
     read as a shape laid on the map rather than as light. Measured after: 35%.
     Floored as well as capped, because an edge nobody can see is the edge of the
     trap nobody can see. */
  ok('SOFT-EDGE the sides of the beam fall away rather than ending in a line',
    px.edge / px.axis < 0.6 && px.edge / px.axis > 0.15,
    `the light 27 deg off his heading is ${(100 * px.edge / px.axis).toFixed(0)}% of the light on his axis `
    + `(${px.edge.toFixed(1)} against ${px.axis.toFixed(1)})`);

  /* OUTWALKABLE. The range is the difficulty dial and it has a hard ceiling that
     is arithmetic, not taste: he turns one lap per WANDER_LAP_MIN, so the far tip
     of the beam sweeps sideways at range * 2PI / lap. Once that reaches walking
     pace, stepping out of the light stops being a move a player can make and the
     feature becomes the mugging it was designed not to be. Graded on the real
     exported function at the real shipped constant. */
  const reach = await page.evaluate(async () => {
    const W = await import('./js/wanderer.js');
    return { range: W.CONE_RANGE_M, tip: +W.coneTipSpeed().toFixed(3), lap: W.WANDER_LAP_MIN,
      at700: +W.coneTipSpeed(700).toFixed(3) };
  });
  ok('CONTROL the tip-speed instrument moves with the range (700 m outruns a walk)',
    reach.at700 > 1.4, `${reach.at700} m/s at 700 m, so the ceiling this row guards is real`);
  ok('OUTWALKABLE the beam\'s far tip sweeps at under half walking pace, so the light can always be left',
    reach.tip < 0.7 && reach.range <= 400,
    `${reach.range} m over a ${reach.lap} min lap = ${reach.tip} m/s at the tip (a walk is 1.4)`);

  /* -------------------------------------------------------- 3. THE MONEY */

  const money = await page.evaluate(async (DATE) => {
    const W = await import('./js/wanderer.js');
    const game = await import('./js/game.js');
    const a = W.wandererAt(101, 5, DATE, 400), b = W.wandererAt(102, 5, DATE, 400);
    const aKey = W.wandererKey(DATE, a);

    /* WALKING BACK INTO THE SAME LIGHT MUST NOT PAY TWICE, and the second claim
       RE-DERIVES its key the way the map does rather than reusing the first
       one's string. Reusing it would grade db.addIfAbsent and nothing else: a
       wandererKey carrying a timestamp or a counter would mint a fresh row on
       every charge, the treadmill this key exists to stop, with this row still
       green. So: same instance, one minute later, freshly derived. */
    const first = await game.award(aKey, 'wanderer', 150, 'Boneyard: the Wanderer', DATE);
    const againKey = W.wandererKey(DATE, W.wandererAt(101, 5, DATE, 401));
    const second = await game.award(againKey, 'wanderer', 150, 'Boneyard: the Wanderer', DATE);

    // three simultaneous wins on one instance: exactly one may pay
    const bKey = W.wandererKey(DATE, b);
    const all = await Promise.all([0, 1, 2].map(() =>
      game.award(bKey, 'wanderer', 150, 'Boneyard: the Wanderer', DATE)));

    // the next 45-minute instance is a NEW key, so he is a recurring hazard
    const later = W.wandererKey(DATE, W.wandererAt(101, 5, DATE, 400 + 45));
    const rows = await (await import('./js/db.js')).db.all('xp');
    return {
      first, second, paid: all.filter(x => x > 0).length,
      rows: rows.filter(r => r.key === bKey).length,
      keyRolls: later !== aKey, sameDay: later.startsWith(`wanderer-${DATE}-`),
    };
  }, DATE);

  ok('ONE-SHOT walking back into the same light does not pay a second time',
    money.first > 0 && money.second === 0, `first paid ${money.first}, second paid ${money.second}`);
  ok('ATOMIC three simultaneous claims on one instance pay exactly once',
    money.paid === 1 && money.rows === 1, `${money.paid} of 3 paid, ${money.rows} ledger row(s)`);
  ok('RECURRING his next 45-minute instance is a new key, so he can catch you again',
    money.keyRolls && money.sameDay, money.keyRolls ? 'key rolls with the instance' : 'the key never changes');

  /* ------------------------------------------------------ 4. THE CEILING */

  const capNow = () => page.evaluate(async () => {
    const poi = await import('./js/poi.js');
    const pit = await import('./js/pit.js');
    const wins = await poi.denWinsCount();
    return { wins, ceiling: pit.endlessCeiling(wins) };
  });
  const before = await capNow();
  ok('SAMPLE a starting ceiling was read', Number.isInteger(before.ceiling) && before.ceiling >= 7,
    `${before.wins} wins, ceiling ${before.ceiling}`);
  /* COUNTED OFF THE LEDGER, not off the loop. "I called award five times" is
     what a ledger that never wrote would also report, and then the CEILING row
     below would be proving nothing at all. */
  const beaten = await page.evaluate(async (DATE) => {
    const W = await import('./js/wanderer.js');
    const game = await import('./js/game.js');
    const keys = new Set();
    for (let cx = 500; cx < 505; cx++) {
      const w = W.wandererAt(cx, 9, DATE, 400);
      const k = W.wandererKey(DATE, w);
      keys.add(k);
      await game.award(k, 'wanderer', 150, 'Boneyard: the Wanderer', DATE);
    }
    const rows = await (await import('./js/db.js')).db.all('xp');
    return rows.filter(r => keys.has(r.key)).length;
  }, DATE);
  const after = await capNow();
  ok('CONTROL enough Boneyard Wanderers were actually beaten to move a ceiling',
    beaten >= 5, `${beaten} wins claimed`);
  ok('CEILING beating Boneyard Wanderers does NOT raise the Gauntlet ceiling',
    after.ceiling === before.ceiling && after.wins === before.wins,
    `${before.ceiling} -> ${after.ceiling} after ${beaten} wins`);
  /* THE CONTROL FOR THE ROW ABOVE. "The ceiling did not move" is exactly what a
     broken denWinsCount, a dead endlessCeiling or a ledger that never wrote
     would also report. So move it on purpose, through the one path that IS
     supposed to move it, in the same session and with the same instrument. */
  await page.evaluate(async () => { const poi = await import('./js/poi.js'); await poi.claimGluttonWin('2026-08-21', 0); });
  const control = await capNow();
  ok('CONTROL and the instrument can move: the Glutton still raises it by 3',
    control.ceiling === after.ceiling + 3, `${after.ceiling} -> ${control.ceiling}`);

  /* -------------------------------------------- 5. THE WIRING, at source */

  const src = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const wsrc = readFileSync(path.join(ROOT, 'js/wanderer.js'), 'utf8');

  /* THE MECHANIC IS NOT THE MIMIC'S. He used to hijack a rare spawn and ambush
     on tap, which is the Mimic with a different face. That version is gone, and
     the thing that would quietly bring it back is the predicate, so its absence
     is the assertion. */
  ok('NOT-A-SPAWN the old tap-a-guarded-egg mechanic is gone from the tree',
    !/isWandererSpawn/.test(src) && !/isWandererSpawn/.test(wsrc),
    'no isWandererSpawn anywhere in app.js or wanderer.js');

  /* THE TRIGGER IS THE PLAYER'S MOVEMENT, and this is the lint that says so: the
     encounter is started from the redraw pass, which runs on every GPS fix and
     every 5-second world pass, and NOT from a click handler. An ORDER of two
     offsets inside one function, so reformatting cannot drift it. */
  const iRefresh = src.indexOf('function refreshWanderer()');
  const iStart = src.indexOf('startWandererEncounter(w, rec.el)', iRefresh);
  const iCone = src.indexOf('if (!inWandererCone(w, lat, lng)) continue;', iRefresh);
  const iMark = src.indexOf('wandererMarkers.set(w.id, rec)', iRefresh);
  ok('TRIGGER the encounter is fired from the redraw pass, gated on the cone test',
    iRefresh > 0 && iCone > iRefresh && iStart > iCone,
    iRefresh < 0 ? 'no refreshWanderer' : `refresh at ${iRefresh}, cone test at ${iCone}, encounter at ${iStart}`);

  /* AVOIDABLE. The marker is built BEFORE the cone test decides anything, so a
     Wanderer who is not currently lighting you is still drawn. Put the test
     first and he would only ever appear at the moment he catches you, which is
     the invisible hunter Tom ruled out. */
  ok('AVOIDABLE he is drawn on the map before the cone test, not only once he has you',
    iMark > iRefresh && iMark < iCone, `marker at ${iMark}, cone test at ${iCone}`);

  /* NOT WHILE BACKGROUNDED. refreshWanderer and startWandererEncounter must live
     entirely inside renderBoneyard, whose interval and geolocation watch are torn
     down by cleanup(). Anything that reaches them from module scope (a
     setInterval, a notification handler, a service-worker message) would be able
     to ambush a phone in a pocket. Graded as containment, not as a name.
     The span runs to the NEXT top-level declaration, so it is generous by a few
     lines at its tail; what it is built to catch is a reference from somewhere
     else entirely (module scope, a notification handler, a service-worker
     message) in an 18,000-line file, not a line snuck into the gap. */
  const iMap = src.indexOf('async function renderBoneyard(');
  /* `buildFighter(` not `buildFighter()`: QA r25 M13 (2026-09-04) gave it a
     `pre = {}` parameter and the literal match read -1, so the span ran to the end
     of the file and every reference outside it counted as "outside". Guard drift. */
  const iAfterMap = src.indexOf('async function buildFighter(', iMap);
  if (iAfterMap < 0) throw new Error('wanderer-boneyard-audit: buildFighter declaration not found after renderBoneyard; the span end marker moved');
  const outside = [...src.matchAll(/refreshWanderer|startWandererEncounter/g)]
    .map(m => m.index).filter(i => i < iMap || i > iAfterMap);
  ok('FOREGROUND the trigger exists only inside the Boneyard screen, so a pocketed phone is safe',
    iMap > 0 && iAfterMap > iMap && outside.length === 0,
    `renderBoneyard spans ${iMap}..${iAfterMap}, ${outside.length} reference(s) outside it`);

  /* FACE. Without `wanderer: true` on the cfg, openFight falls through to the
     coin-flip generator and the rarest boss on the map arrives as a random
     skeleton. That is the drop that cost the Gauntlet its roster look, it is
     silent, and it is a field in an object literal, so it is read here. */
  const iEnc = src.indexOf('async function startWandererEncounter(');
  const encEnd = src.indexOf('\n    }', iEnc);
  const enc = iEnc > 0 ? src.slice(iEnc, encEnd) : '';
  ok('CONTROL the encounter function was located by its boundaries (an empty read is a FAILURE)',
    enc.length > 200 && enc.length < 3000, `${enc.length} chars read`);
  ok('FACE the Boneyard Wanderer fight carries his own drawing into the arena',
    /mode:\s*'wanderer'/.test(enc) && /\bwanderer:\s*true\b/.test(enc), 'mode + face flag on the cfg');
  /* KEY. The money rows prove the ledger refuses a second claim on ONE key; they
     cannot prove the encounter hands the settle the INSTANCE'S key rather than
     minting a fresh one per charge, which would make him farmable with every row
     above still green. */
  ok('KEY the fight claims the instance key, so one beat of his loop pays once',
    /claimKey:\s*wandererKey\(date, w\)/.test(enc), 'claimKey: wandererKey(date, w)');

  /* THE CEILING DECISION, READ OFF THE BRANCH THAT CLAIMS THE WIN. The
     behavioural row above goes red if a marker is minted; this one names WHERE,
     so the next person to add a mint has to argue with a check that points at
     their line.
     The SETTLE occurrence, not the first one: `foeCfg.mode === 'wanderer'` also
     appears in the fromMap line thousands of lines earlier, and anchoring on
     that swallowed 88k characters of unrelated app and read six award calls. */
  const iSettle = src.indexOf("else if (foeCfg.mode === 'wanderer')");
  const settleEnd = src.indexOf("dispatchEvent(new CustomEvent('bh-wanderer-beaten'", iSettle);
  const settle = iSettle > 0 && settleEnd > iSettle ? src.slice(iSettle, settleEnd) : '';
  /* COMMENTS STRIPPED BEFORE THE READ, and the strip is itself checked. The
     decision is WRITTEN OUT in that branch's comment, which names bossfirst
     four times; grading the raw text would go red on the very explanation the
     next reader needs. What must contain no mint is the CODE. */
  const settleCode = settle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').trim();
  const awards = (settleCode.match(/await award\(/g) || []).length;
  ok('CONTROL the wanderer settle branch was located by its boundaries (an empty read is a FAILURE)',
    settle.length > 200 && settle.length < 4000 && settleCode.length > 80,
    `${settle.length} chars, ${settleCode.length} once the comment is stripped, ends at its own bh-wanderer-beaten dispatch`);
  ok('CEILING the settle branch mints no bossfirst marker: one claim, on the instance key',
    !!settleCode && !/bossfirst/i.test(settleCode) && awards === 1 && /foeCfg\.claimKey/.test(settleCode),
    `${awards} award call(s), ${/bossfirst/i.test(settleCode) ? 'MINTS bossfirst' : 'no bossfirst mint'}`);

  ok('NO PAGE ERRORS', errs.length === 0, errs.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  if (srv) await srv.close();
}
/* ------------------------------------------------- STAGGER AND FACING ------
   Two bugs Tom found by playing v422, both structural rather than cosmetic.

   STAGGER. "multiple wanders face and move the same way that should never
   happen there needs to be a stagger." Centre, radius and direction were all
   seeded per instance but THETA WAS NOT: it came only off the clock, so every
   Wanderer alive sat at the same angle of his own loop at the same moment.
   heading derives from theta and dir alone, so the entire world only ever held
   TWO headings, one per direction of travel. Neighbours walked in lockstep and
   swept their lanterns in parallel. Graded on the SPREAD across many cells, not
   on a pair, because two men can differ while twenty-seven march: measured 2
   before, 27 after.

   FACING. "the wanderer has been screen shot facing one way and his cone beacon
   going the opposite that makes no sense." Cam drew him walking WEST, measured
   off the plate's own alpha: his body mass is right-weighted while the lantern
   sits at x=0.188, so he carries it out ahead of him to the left. The cone
   rotates to his heading, so on an eastward beat the light left his lantern and
   swept back across his body. He is mirrored on the eastward half now, and the
   plate's translate is negated with it so the lantern keeps landing on the
   marker's anchor, which is his lat/lng.

   PROVEN RED: drop the seeded phase -> STAGGER reads 2 distinct headings.
   Force facing-east off -> FACING reads the same transform for both headings. */
{
  const W = await import('../js/wanderer.js');
  const date = '2026-08-22';
  let worst = [null, 99];
  for (const mins of [61.5, 210.25, 613.7, 1103.9]) {
    const hs = [];
    for (let cx = 100; cx < 109; cx++) {
      for (let cy = 200; cy < 203; cy++) hs.push(Math.round(W.wandererAt(cx, cy, date, mins).heading));
    }
    const n = new Set(hs).size;
    if (n < worst[1]) worst = [mins, n];
  }
  ok('STAGGER neighbouring Wanderers do not walk in lockstep',
    worst[1] >= 12,
    `fewest distinct headings across 27 cells at any sampled minute: ${worst[1]} (at ${worst[0]}m). `
    + `Floor 12. Before the seeded phase this was 2 at every minute, everywhere, forever.`);

  const a1 = W.wandererAt(104, 201, date, 613.7), a2 = W.wandererAt(104, 201, date, 613.7);
  ok('STAGGER and his beat is still a pure function of date, cell and clock',
    a1.lat === a2.lat && a1.lng === a2.lng && a1.heading === a2.heading,
    `${a1.lat.toFixed(6)},${a1.lng.toFixed(6)} @${a1.heading.toFixed(1)} deg, asked twice`);

  /* The facing rule is a pure function of the heading, so it is graded here
     rather than in the browser: paintWandererCone is the one place that knows
     the heading, and it is the one place that sets the class. */
  const src = readFileSync(path.join(ROOT, 'js', 'wanderer.js'), 'utf8');
  const setsClass = /classList\.toggle\('facing-east', heading > 0 && heading < 180\)/.test(src);
  const mirrorRule = /\.map-wanderer-mark\.facing-east \.wanderer-body[\s\S]{0,120}scaleX\(-1\)/.test(src);

  ok('FACING he is mirrored on the eastward half, so the lantern always leads',
    setsClass && mirrorRule,
    `class set from the heading: ${setsClass}, mirror rule present: ${mirrorRule}`);
  /* THE OFFSET MUST BE NEGATED, and this asserts the expression that produces
     it rather than the number it produces, because the number only exists once
     the stylesheet is built.
     A first version regexed for a literal `translate(-` and failed on a working
     mirror, since the rule is written with a template expression. A second
     version tried to render it here, where `page` is already out of scope.
     VERIFIED BY RENDER SEPARATELY, and these are the measured values: at heading
     270 the plate is matrix(1,0,0,1,62.376,-25.532) and at heading 90 it is
     matrix(-1,0,0,1,-62.376,-25.532). Equal and opposite, so the lantern stays
     on the marker's anchor through the flip. */
  const negated = /\.facing-east \.wanderer-body \{[\s\S]{0,120}translate\(\$\{\(-bodyX\)/.test(src);
  ok('FACING and the mirrored plate negates its translate, so the lantern stays on the anchor',
    negated,
    negated ? 'translate(-bodyX%) scaleX(-1); rendered +62.376 vs -62.376, equal and opposite'
      : 'the mirrored rule does NOT negate the offset: the light would come off him');
}

console.log(fails ? '\nWANDERER BONEYARD AUDIT FAILED' : '\nWANDERER BONEYARD AUDIT VERIFIED');
process.exit(fails);
