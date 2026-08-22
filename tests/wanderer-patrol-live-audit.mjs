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
 * NEEDS A MAP. MapLibre needs WebGL and vector tiles; on a machine with neither,
 * every row here would be graded against a blank screen and pass on nothing. So
 * it measures the capability first and reports UNPROVEN with exit 97 rather than
 * green, the same contract tests/boneyard-audit.mjs runs under.
 *
 *   node tests/wanderer-patrol-live-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree, boneyardCapability, unproven, unprovenReport, exitFor } from './godmode.js';

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

  // where is he, and where would a player have to stand
  const target = await page.evaluate(async ({ HOME, offsetDeg }) => {
    const W = await import('./js/wanderer.js');
    const { dateKey } = await import('./js/nutrition.js');
    const date = dateKey();
    const w = W.wanderersNear(date, HOME.latitude, HOME.longitude)[0];
    const dest = (lat, lng, brg, d) => {
      const R = 6371000, r = Math.PI / 180;
      const f1 = lat * r, l1 = lng * r, b = brg * r, dr = d / R;
      const f2 = Math.asin(Math.sin(f1) * Math.cos(dr) + Math.cos(f1) * Math.sin(dr) * Math.cos(b));
      const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(dr) * Math.cos(f1), Math.cos(dr) - Math.sin(f1) * Math.sin(f2));
      return { lat: f2 / r, lng: l2 / r };
    };
    const p = dest(w.lat, w.lng, w.heading + offsetDeg, 45);
    return { w: { lat: w.lat, lng: w.lng, heading: w.heading, id: w.id }, p, date,
      predicted: W.inWandererCone(w, p.lat, p.lng) };
  }, { HOME, offsetDeg });

  await page.setGeolocation({ latitude: target.p.lat, longitude: target.p.lng });
  await page.evaluate(() => { location.hash = '#/boneyard'; });
  await sleep(2500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(11000);

  const seenState = await page.evaluate(async () => {
    const W = await import('./js/wanderer.js');
    const mark = document.querySelector('.map-wanderer-mark');
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
    // the apex, on the REAL map: the cone's centre must land on the flame
    let dLantern = null, dPlateCentre = null;
    if (bb && cb) {
      const l = { x: bb.left + W.LANTERN.x * bb.width, y: bb.top + W.LANTERN.y * bb.height };
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
        pinsOnHim++;
        const hit = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
        if (hit && hit.closest('.map-spawn')) pinsHittable++;
      }
    }
    return {
      hasMark: !!mark,
      markVisible: !!mark && +getComputedStyle(mark).opacity > 0.5 && rb.width > 10,
      imgSrc: img && img.getAttribute('src'),
      conePx: cb ? Math.round(cb.width) : null,
      coneOpacity: cs ? +cs.opacity : null,
      coneBg: cs ? cs.backgroundImage.slice(0, 120) : null,
      coneRadius: cs ? cs.borderRadius : null,
      inkW: ink ? Math.round(ink.w) : null, inkH: ink ? Math.round(ink.h) : null,
      ringPx: rr ? Math.round(rr.width) : null, pinPx: pr ? Math.round(pr.width) : null,
      through, dLantern, dPlateCentre,
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
  });
  // kept for the eye, not asserted on: the rows above measure the DOM
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/wanderer-${label}.png` });
  await browser.close();
  return { target, seenState };
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
  'CONTROL the ahead fix was really inside his cone',
  'CHARGE-LIVE walking into the light catches you, with no tap anywhere',
  'CHARGE-LIVE and what it opens is the CHOICE, not the arena behind it',
];

// ---- 1. BEHIND him: drawn, lit, and NOT fought
const behind = await run(180, 'behind');
let cap = behind && behind.cap;
if (behind && !cap) {
  const { target: t, seenState: s } = behind;
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
    s.dLantern !== null && s.dLantern < 2, `${s.dLantern}px between the cone's apex and the lantern`);
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
  ok('PINS-SURVIVE he sits at the BACK of the marker layer, so the pins and the player clear him',
    s.behindAll === true && s.pinsHittable === s.pinsOnHim,
    `wanderer z-index ${s.zWanderer} against [${s.zOthers}]; ` +
    `${s.pinsHittable}/${s.pinsOnHim} pin(s) overlapping him are still tappable`);
  ok('TAPTHRU-LIVE a tap on his coat reaches the map underneath, not him',
    s.through === true, `elementFromPoint over his body returned ${s.through ? 'something else' : 'the Wanderer'}`);
  /* REACH. Tom's mockup runs the beam off the edge of the screen. The ring is
     75 m and is measured by the map's own projection, so the beam's radius in px
     over the ring's radius in px IS the range ratio, measured rather than
     restated, and the same number says whether it leaves the frame. */
  ok('REACH-LIVE the beam is a searchlight, not a puddle: it runs past the edge of the screen',
    s.conePx / 2 > s.ringPx / 2 * 3 && s.conePx / 2 > s.screenW / 2,
    `${Math.round(s.conePx / 2)}px of beam (${s.range} m) against a ${Math.round(s.ringPx / 2)}px 75 m ring, on a ${s.screenW}x${s.screenH} screen`);
  ok('NO-AMBUSH standing behind him starts no fight', s.arena === false, s.foeName || 'no arena');
}

// ---- 2. AHEAD of him, in the light: the encounter fires from the fix alone
const ahead = cap ? null : await run(0, 'ahead');
if (ahead && !ahead.cap) {
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
    `encounter=${s.encounter} arena=${s.arena} buttons=[${s.encButtons.join(', ')}]`);
}

if (cap || (ahead && ahead.cap)) {
  const why = 'the Boneyard could not draw on this machine';
  for (const n of ROWS) unproven(n, why);
}
if (srv) await srv.close();
unprovenReport('wanderer-patrol-live-audit.mjs', cap || (ahead && ahead.cap));
console.log(fails ? '\nWANDERER PATROL LIVE AUDIT FAILED'
  : (cap ? '\nWANDERER PATROL LIVE AUDIT UNPROVEN' : '\nWANDERER PATROL LIVE AUDIT VERIFIED'));
process.exit(exitFor(fails));
