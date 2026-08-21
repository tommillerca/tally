/* HOW OFTEN DOES THE WANDERER ACTUALLY CATCH YOU. A measuring instrument, not a
 * pass/fail check, the same way tests/gauntlet-sim.mjs and tests/fight-sim.mjs
 * are.
 *
 * WHY IT EXISTS. Tom asked for "much more reach" on the cone and that is not a
 * cosmetic number: the beam's range is the difficulty dial for the whole
 * feature. Doubling it does not double the catches, because the catch rate is an
 * area sweep against a hunter who is also moving, and reasoning about that from
 * the constant is exactly the mistake gauntlet-sim.mjs exists to record (the
 * Mimic was specced at 1.05x on a theory and measured 12.0% win). So the range
 * was picked off this instrument instead.
 *
 * WHAT IT MEASURES. Catches per hour of continuous walking. A walker moves at
 * WALK_MS along a random-waypoint route, the cone is evaluated on the map's own
 * 5-second cadence, and a Wanderer instance that has already caught this walker
 * cannot catch them again (which is what js/app.js's `wandererEngaged` does).
 * The walk is seeded, so the same invocation gives the same numbers.
 *
 * It imports the REAL js/wanderer.js. Nothing here re-implements the geometry:
 * a sim with its own copy of the cone test measures the copy.
 *
 * Usage:
 *   node tests/wanderer-patrol-sim.mjs
 *   node tests/wanderer-patrol-sim.mjs --walkers 400 --hours 2
 */
import { wanderersNear, inWandererCone, CONE_RANGE_M, CONE_HALF_DEG, WANDER_CELL_DEG } from '../js/wanderer.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const WALKERS = arg('--walkers', 240);
const HOURS = arg('--hours', 1);
const WALK_MS = 1.4;          // m/s, an ordinary walking pace
const TICK_S = 5;             // the Boneyard's own refreshWorld cadence
const DATE = '2026-08-21';
// the shipped range plus the candidates either side of it
const RANGES = process.argv.includes('--ranges')
  ? String(process.argv[process.argv.indexOf('--ranges') + 1]).split(',').map(Number)
  : [90, 150, 200, 240, 300, 400];

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* THE CONE AT AN ARBITRARY RANGE. inWandererCone is fixed at CONE_RANGE_M, which
   is the point of it, so sweeping the range means asking the same question with
   one number swapped. The ANGLE and the apex still come from the real module:
   at the shipped range this reduces to inWandererCone exactly, and the sim
   asserts that below rather than assuming it. */
function inConeAt(w, lat, lng, range) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (lat - w.lat) * r, dLng = (lng - w.lng) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(w.lat * r) * Math.cos(lat * r) * Math.sin(dLng / 2) ** 2;
  const d = 2 * R * Math.asin(Math.sqrt(a));
  if (d > range) return false;
  if (d <= 5) return true;
  const y = Math.sin((lng - w.lng) * r) * Math.cos(lat * r);
  const x = Math.cos(w.lat * r) * Math.sin(lat * r) - Math.sin(w.lat * r) * Math.cos(lat * r) * Math.cos((lng - w.lng) * r);
  const b = ((Math.atan2(y, x) / r) + 360) % 360;
  return Math.abs((((b - w.heading) + 540) % 360) - 180) <= CONE_HALF_DEG;
}

// the sim's own cone must BE the real cone at the shipped range, or every number
// below is measuring a private copy
let agree = 0, disagree = 0;
for (let cx = 0; cx < 40; cx++) {
  const w = wanderersNear(DATE, cx * 0.02 + 49, -123, 300)[0];
  for (let i = 0; i < 40; i++) {
    const lat = w.lat + (i % 7 - 3) * 0.0006, lng = w.lng + (Math.floor(i / 7) - 3) * 0.0009;
    if (inConeAt(w, lat, lng, CONE_RANGE_M) === inWandererCone(w, lat, lng)) agree++; else disagree++;
  }
}
console.log(`CONTROL  the sim's cone agrees with js/wanderer.js at the shipped range: ${agree} agree, ${disagree} disagree`);
if (disagree) { console.log('the sim is measuring its own copy, not the app. Stop.'); process.exit(1); }

const STEPS = Math.round(HOURS * 3600 / TICK_S);
console.log(`\n${WALKERS} walkers x ${HOURS}h at ${WALK_MS} m/s, cone evaluated every ${TICK_S}s`);
console.log(`cell ${WANDER_CELL_DEG} deg, cone half-angle ${CONE_HALF_DEG} deg\n`);
console.log('  range   catches/h   caught 0   1    2    3+     walked');
for (const range of RANGES) {
  let total = 0; const hist = [0, 0, 0, 0];
  let walkedM = 0;
  for (let k = 0; k < WALKERS; k++) {
    const rng = mulberry32(0x5eed + k * 977);
    // spread the walkers over real, different ground so no one cell's geometry
    // sets the answer
    let lat = 49 + (rng() - 0.5) * 0.6, lng = -123 + (rng() - 0.5) * 0.6;
    let mins = 60 + rng() * 720;                    // any time of the local day
    let bearing = rng() * 360, legLeft = 0;
    const caught = new Set();
    for (let s = 0; s < STEPS; s++) {
      if (legLeft <= 0) { bearing = rng() * 360; legLeft = 60 + rng() * 240; }   // a 1-5 min leg
      const step = WALK_MS * TICK_S;
      const br = bearing * Math.PI / 180;
      lat += (step * Math.cos(br)) / 111320;
      lng += (step * Math.sin(br)) / (111320 * Math.cos(lat * Math.PI / 180));
      walkedM += step; legLeft -= TICK_S; mins += TICK_S / 60;
      for (const w of wanderersNear(DATE, lat, lng, mins)) {
        if (caught.has(w.id)) continue;
        if (!inConeAt(w, lat, lng, range)) continue;
        caught.add(w.id);
      }
    }
    total += caught.size;
    hist[Math.min(3, caught.size)]++;
  }
  const per = total / (WALKERS * HOURS);
  const pct = n => `${(hist[n] / WALKERS * 100).toFixed(0)}%`;
  console.log(`  ${String(range).padStart(4)}m ${per.toFixed(2).padStart(10)}   ${pct(0).padStart(4)} ${pct(1).padStart(4)} ${pct(2).padStart(4)} ${pct(3).padStart(4)}   ${(walkedM / WALKERS / 1000).toFixed(1)} km each`);
}
console.log('\ncatches/h is per hour of CONTINUOUS walking with the Boneyard open.');
