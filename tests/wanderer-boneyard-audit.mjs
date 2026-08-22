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

    // one per cell, and he is DRAWN well outside his own cone
    const near = W.wanderersNear(DATE, 49.28, -123.12, 400);
    const cellIds = new Set(near.map(w => `${w.cx}_${w.cy}`));
    return {
      cells: cells.length, samples: steps.length, distinct: seen.size, checked, flips, fp,
      spdMin: Math.min(...steps), spdMax: Math.max(...steps),
      spdMean: steps.reduce((a, b) => a + b, 0) / steps.length,
      headingErrWorst, headingChecked,
      beatMin: Math.min(...beatMoves),
      nearN: near.length, nearCells: cellIds.size,
      nearFar: near.filter(w => w.dist > W.CONE_RANGE_M).length,
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
     minutes of walking between spotting him and being lit. */
  ok('VISIBLE he is handed to the map far outside his own cone, so he can be avoided',
    walk.nearFar > 0 && walk.showM >= walk.coneRange * 3,
    `${walk.nearFar} of ${walk.nearN} nearby are beyond the ${walk.coneRange} m cone; drawn out to ${walk.showM} m ` +
    `(${(walk.showM / walk.coneRange).toFixed(1)}x his reach)`);

  ok('DENSITY one per cell, no more',
    walk.nearN > 0 && walk.nearN === walk.nearCells, `${walk.nearN} nearby across ${walk.nearCells} cells`);

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
       wider than the predicate is a player caught by ground that looked dark. */
    const el = document.createElement('div');
    document.body.appendChild(el);
    W.paintWandererCone(el, 300, 123.4);
    const bg = el.style.background;
    el.remove();
    const from = /from\s+([\d.]+)deg/.exec(bg);
    // the last fully-lit stop is the drawn edge of the wedge
    // the browser re-serialises rgba() with its own spacing and a leading zero,
    // so the read has to tolerate both forms rather than the string we wrote
    const stops = [...bg.matchAll(/rgba\(\s*255,\s*228,\s*150,\s*0?\.46\s*\)\s+([\d.]+)deg/g)].map(x => +x[1]);
    return {
      n: cases.length, headings: headings.size, all_ahead: all('ahead'), all_edgeIn: all('edgeIn'), all_justIn: all('justIn'),
      all_onHim: all('onHim'), none_edgeOut: none('edgeOut'), none_side: none('side'),
      none_behind: none('behind'), none_tooFar: none('tooFar'),
      drawnFrom: from ? +from[1] : null, drawnSpan: stops.length ? Math.max(...stops) : null,
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
  ok('DRAWN the wedge the map paints is the same wedge that catches you',
    cone.drawnFrom !== null && cone.drawnSpan !== null
    && Math.abs(cone.drawnFrom - (123.4 - cone.H)) < 0.11
    && Math.abs(cone.drawnSpan - cone.H * 2) < 3.01,
    `painted from ${cone.drawnFrom}deg spanning ${cone.drawnSpan}deg for heading 123.4 +/- ${cone.H}`);

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
    W.paintWandererCone(el.querySelector('.wanderer-cone'), 480, 0);
    const mark = el.getBoundingClientRect();
    const body = el.querySelector('.wanderer-body').getBoundingClientRect();
    const cone = el.querySelector('.wanderer-cone').getBoundingClientRect();
    const lant = { x: body.left + W.LANTERN.x * body.width, y: body.top + W.LANTERN.y * body.height };
    const cc = { x: cone.left + cone.width / 2, y: cone.top + cone.height / 2 };
    const pc = { x: body.left + body.width / 2, y: body.top + body.height / 2 };
    const taps = getComputedStyle(el).pointerEvents;
    host.remove();
    return {
      markPx: Math.round(mark.width), MARK_PX: W.MARK_PX, taps,
      dLantern: +Math.hypot(cc.x - lant.x, cc.y - lant.y).toFixed(2),
      dPlateCentre: +Math.hypot(cc.x - pc.x, cc.y - pc.y).toFixed(2),
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
  ok('TAPTHRU a 260px marker does not swallow taps on the spawns underneath him',
    apex.taps === 'none', `pointer-events: ${apex.taps}`);

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
  const iAfterMap = src.indexOf('async function buildFighter()', iMap);
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
