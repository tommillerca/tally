/* THE WANDERER, OUT IN THE BONEYARD.
 *
 * He already exists in the Gauntlet (js/pit.js, WANDERER_EVERY = 13) as the
 * rarest and hardest rung on the ladder. Nothing put him on the walking map.
 *
 * Tom, 2026-08-21, and this file is the whole of it: "the wanderer walks around
 * the boneyard slowly hunting down the player, he casts a cone of light ahead of
 * the way he is walking and if the player steps into that light he will charge at
 * them and start an encounter."
 *
 * So he is not a spawn. Everything else out there is a THING AT A PLACE that you
 * walk to and tap; he is the one AGENT, with a position that changes on its own
 * and a trigger that fires from the player's movement rather than their thumb.
 *
 * THE PATH IS DERIVED, NEVER ROLLED. Same rule as isMimicSpawn and for a harder
 * reason. The map re-runs refreshWorld every 5 seconds and rebuilds this from
 * scratch each pass, so a `Math.random()` walk would teleport him twelve times a
 * minute; storing a position instead would desync between devices, break offline,
 * and let closing the app reroll him off your back. Position and heading are a
 * pure function of (date, cell, clock): every device that asks the same question
 * at the same moment gets the same man in the same place facing the same way,
 * with nothing stored and nothing to sync.
 *
 * THE SHAPE IS A SEEDED CLOSED LOOP, walked once per 45-minute instance. A
 * circle, because it is the one path with a CONSTANT speed (a Lissajous or a
 * random-waypoint chain speeds up and slows down, and "he walks slowly" then
 * stops being true half the lap) and because its tangent, which is his heading,
 * is exact rather than sampled. Centre, radius and direction of travel are all
 * seeded off the instance, so when the Boneyard's 45-minute clock turns over he
 * takes up a new beat somewhere else in the cell, exactly as every spawn slot
 * relocates. Within the instance he is continuous.
 *
 * HOW FAST. Circumference / 45 min. At the radius range below that is 0.33 to
 * 0.51 m/s, roughly a third of walking pace (~1.4 m/s), so a player can always
 * outwalk him and always get out of the light. That is the point: an invisible
 * or uncatchable hunter is a mugging. He is drawn on the map like any other POI
 * whether or not you are in his cone, and the cone is drawn too, so being caught
 * is a thing you did, not a thing that happened to you.
 *
 * Cam's art is not altered anywhere in here. He is the plate, as drawn.
 */

/* distanceM and bearingDeg are hunt.js's, not copies. js/mimic.js keeps a local
   hash to avoid dragging hunt.js (and game.js, loot.js, nutrition.js behind it)
   onto the Boneyard's hot path; that argument does not apply here, because
   js/app.js already imports hunt.js for the spawn field, so this import adds
   nothing at all to the module graph. */
import { distanceM, bearingDeg } from './hunt.js';

function hash(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// a stable 0..1 from a string. Four independent hashes rather than bit-slices of
// one, because slices of a single FNV word correlate and his centre would trail
// his radius across the grid.
const frac = s => hash(s) / 4294967296;

/* HOW MANY EXIST PER AREA: exactly one per cell, always, everywhere.
 *
 * 0.02 degrees is a 2.2 km x ~1.5 km cell, about 3.2 km at Vancouver's latitude.
 * The Boneyard's other grids are smaller on purpose (hunt.js CELL_DEG 0.005 for
 * spawns, poi.js DEN_CELL_DEG 0.01 for dens) because those are things you go
 * looking for. He is not: a phone viewport at MAP_START_ZOOM covers 0.55 km, so
 * one per 3.2 km means he is on screen roughly one map in six, which keeps him
 * the rarest face out there, the same thing he is on the ladder.
 *
 * "Always present" rather than a presence roll, because the roll would buy
 * nothing: a cell is 3.2 km and his beat is 400 m across, so the cell is mostly
 * empty ground either way, and a second derived predicate is a second thing to
 * keep honest. Density is the cell size, and it is one number. */
export const WANDER_CELL_DEG = 0.02;

/* One lap per 45-minute instance, which is the Boneyard's own clock (hunt.js
   SPAWN_TTL_MIN). Deliberately equal, not merely aligned: it means he is back at
   his loop's start point at the instant the instance rolls and he moves to a new
   beat, so the one discontinuity in his path is the smallest one available. */
export const WANDER_LAP_MIN = 45;
export const WANDER_R_MIN_M = 140;   // 0.33 m/s
export const WANDER_R_MAX_M = 220;   // 0.51 m/s

/* THE CONE. 300 m and 60 degrees total (+/- 30 off his heading).
 *
 * Tom, after seeing the first build on the map: "cone originates from his lantern
 * and points in the direction he faces with much more reach". His mockup runs the
 * beam off the edge of the screen. A phone viewport at MAP_START_ZOOM covers
 * about 260 x 525 m, so "off the edge" means the range has to clear ~260 m: this
 * is a searchlight, not the 90 m puddle it shipped as.
 *
 * THE RANGE IS A DIFFICULTY DIAL, NOT A LOOK, so it was measured rather than
 * picked. tests/wanderer-patrol-sim.mjs walks 240 seeded players 5 km each at
 * 1.4 m/s with the cone evaluated on the map's own 5-second cadence:
 *
 *    90 m   0.12 catches/h   88% of hour-long walks meet him not at all
 *   150 m   0.22            80%
 *   200 m   0.26            76%
 *   240 m   0.33            70%
 *   300 m   0.40            66%   <- shipped
 *   400 m   0.53            57%
 *
 * Those walkers do not look where they are going, so every figure is an UPPER
 * bound for a player who can see the beam. 300 m is 3.3x the old catch rate and
 * still leaves two hours of walking between encounters, which is the right side
 * of rare for the hardest fight on the map.
 *
 * THE CEILING, and it is arithmetic rather than taste. He turns one full lap per
 * WANDER_LAP_MIN, so the far tip of the beam sweeps sideways at
 * range * 2*PI / (45*60) m/s. At 300 m that is 0.70 m/s, half walking pace, so
 * stepping out of the light is always a move a player can make. At 400 m it is
 * 0.93 m/s, still under a walk. Past about 600 m the tip outruns a walking
 * player and being caught stops being avoidable by construction, which is the
 * one thing this feature must never become. DO NOT SET THIS ABOVE 400 without
 * changing WANDER_LAP_MIN to match. Asserted in
 * tests/wanderer-boneyard-audit.mjs (OUTWALKABLE).
 *
 * 60 degrees is a torch, not a floodlight: the unlit 300 degrees behind and
 * beside him is what makes "avoid him" a real move rather than a dice roll. */
export const CONE_RANGE_M = 300;
export const CONE_HALF_DEG = 30;
// the sweep speed of the beam's far tip, m/s. Exported so the guard reads the
// real number rather than restating the arithmetic in its own words.
export const coneTipSpeed = (range = CONE_RANGE_M) => (2 * Math.PI * range) / (WANDER_LAP_MIN * 60);

/* WHERE HIS LANTERN IS, MEASURED OFF THE ART'S OWN INK.
 *
 * Tom: "cone originates from his lantern". So the beam's apex is not the middle
 * of the drawing, it is the flame, and a guessed pixel nudge would drift the
 * moment the marker is scaled or the plate is re-exported. These are FRACTIONS
 * of the 640x640 plate, taken from the flame's red core: the mask
 * (alpha > 200, R > 180, G < 110, B < 110) isolates a single 10x10 blob at
 * (120.4, 401.7) and nothing else in the drawing, because the red core is the
 * only pure red ink Cam used. 120.4/640 and 401.7/640.
 *
 * The apex is put on his lat/lng by moving the DRAWING, not the light: the
 * marker is anchored centre, so the cone sits on the anchor and the plate is
 * translated by the difference. That way his geographic position IS the flame,
 * inWandererCone needs no offset at all, and the drawn apex and the apex that
 * catches you cannot disagree at any zoom. Asserted in
 * tests/wanderer-boneyard-audit.mjs (APEX) and measured on the live map in
 * tests/wanderer-patrol-live-audit.mjs (LANTERN-LIVE). */
export const LANTERN = { x: 120.4 / 640, y: 401.7 / 640 };

// how far out he is drawn at all. The 3x3 cell scan below reaches further than
// this, so the limit is this number rather than the grid.
export const WANDER_SHOW_M = 1200;

const RAD = Math.PI / 180;
const M_PER_DEG_LAT = 111320;

// live minutes since local midnight, IDENTICAL to hunt.js's private nowMins.
// The whole field has to agree on what instance it is.
function nowMins(d = new Date()) { return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }

export function wandererCell(lat, lng) {
  return { cx: Math.round(lat / WANDER_CELL_DEG), cy: Math.round(lng / WANDER_CELL_DEG) };
}

/* WHERE HE IS AND WHICH WAY HE IS FACING, as a pure function of (date, cell,
   clock). No state, no storage, no randomness, no clamping to anything the map
   happens to have loaded.

   The heading is the loop's ANALYTIC tangent, not a bearing sampled between two
   nearby positions. Position north of centre is r*cos(theta) and east of centre
   is r*sin(theta)*dir, so the velocity is (-sin theta) north and (dir*cos theta)
   east, and the compass bearing is atan2 of those two. Exact at every point
   including the poles of the parameterisation, where a sampled bearing would
   wobble by however wide the sample was. */
export function wandererAt(cx, cy, date, mins = nowMins()) {
  const inst = Math.floor(mins / WANDER_LAP_MIN);
  const seed = `wander:${date}:${cx}:${cy}:i${inst}`;
  // 0.72 of the cell, so a beat centred at the edge still leaves his loop mostly
  // inside its own cell and two neighbours cannot overlap their lit ground.
  const clat = (cx + (frac(`${seed}:lat`) - 0.5) * 0.72) * WANDER_CELL_DEG;
  const clng = (cy + (frac(`${seed}:lng`) - 0.5) * 0.72) * WANDER_CELL_DEG;
  const r = WANDER_R_MIN_M + frac(`${seed}:r`) * (WANDER_R_MAX_M - WANDER_R_MIN_M);
  const dir = frac(`${seed}:dir`) < 0.5 ? -1 : 1;      // +1 walks the loop clockwise
  const theta = 2 * Math.PI * ((mins - inst * WANDER_LAP_MIN) / WANDER_LAP_MIN);
  // metres per degree of longitude shrinks with latitude; floored so the maths
  // cannot divide by ~0 at the poles.
  const mPerDegLng = M_PER_DEG_LAT * Math.max(0.05, Math.cos(clat * RAD));
  return {
    id: `${cx}_${cy}_i${inst}`, cx, cy, inst, r, dir,
    lat: clat + (r * Math.cos(theta)) / M_PER_DEG_LAT,
    lng: clng + (r * Math.sin(theta) * dir) / mPerDegLng,
    heading: ((Math.atan2(dir * Math.cos(theta), -Math.sin(theta)) / RAD) + 360) % 360,
    speed: (2 * Math.PI * r) / (WANDER_LAP_MIN * 60),   // m/s, for the audit to read
  };
}

// Every Wanderer whose beat could be near you: his own cell and its eight
// neighbours, because a loop centred near an edge crosses into the next one.
export function wanderersNear(date, lat, lng, mins = nowMins()) {
  const { cx, cy } = wandererCell(lat, lng);
  const out = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const w = wandererAt(cx + dx, cy + dy, date, mins);
      w.dist = distanceM(lat, lng, w.lat, w.lng);
      if (w.dist <= WANDER_SHOW_M) out.push(w);
    }
  }
  return out.sort((a, b) => a.dist - b.dist);
}

/* ARE YOU IN THE LIGHT? A circular sector, which is exactly what the cone is
   DRAWN as (paintWandererCone below is a conic-gradient inside a circle), so
   what the player sees and what catches them are the same shape rather than two
   shapes that agree approximately. */
export function inWandererCone(w, lat, lng) {
  const d = distanceM(w.lat, w.lng, lat, lng);
  if (d > CONE_RANGE_M) return false;
  // standing on him is inside the cone by definition; a bearing from a point to
  // itself is atan2(0,0) and would otherwise decide this on rounding noise.
  if (d <= 5) return true;
  const b = bearingDeg(w.lat, w.lng, lat, lng);
  return Math.abs((((b - w.heading) + 540) % 360) - 180) <= CONE_HALF_DEG;
}

/* HIS LEDGER KEY, and therefore his cap: one payout per (date, cell, 45-minute
   instance). He has no spawn under him any more, so unlike the version that
   hijacked a rare egg he needs a key of his own. Keyed by instance rather than
   by day because he is a recurring hazard, not a daily event; keyed at all
   because otherwise walking a loop round his loop pays 150 XP and a Step Egg
   every thirty seconds.
   A LOSS OR A FLEE WRITES NOTHING, so the fight can be retaken while the same
   instance lasts. The ledger caps the REWARD, never the encounter. */
export function wandererKey(date, w) { return `wanderer-${date}-${w.id}`; }

/* ---------------------------------------------------- the marker and the cone */

/* Injected here rather than added to app.css, the js/mimic.js and js/gateintro.js
   pattern: app.css is 5k lines and contested, and this feature's whole visual
   surface is one marker and one wedge. */
// his marker's box, px. See the note on .map-wanderer-mark below for how it was
// picked; exported so the guard grades the shipped number rather than a copy.
export const MARK_PX = 260;

const STYLE_ID = 'wanderer-style';
export function ensureWandererStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  const bodyX = ((0.5 - LANTERN.x) * 100).toFixed(3);
  const bodyY = ((0.5 - LANTERN.y) * 100).toFixed(3);
  st.textContent = `
/* HE IS THE BIGGEST THING ON THE MAP, and that is the point rather than a
   flourish: he is the one POI you are meant to see coming and route around, so
   at 78px among 42px spawn pins he read as one more collectable. MARK_PX was
   picked by rendering at 393x852 over four sizes and measuring, not by
   multiplying: at 180 he is merely large, at 340 his silhouette reaches the
   screen edges and buries the pins beside him. At 260 his ink stands 169px tall
   against a 127px collect ring and a 42px spawn pin, which is the mockup's
   proportion, and the pins next to him are still whole.
   POINTER-EVENTS OFF ON THE WHOLE MARKER. A 260px element anchored over the map
   would swallow every tap in a 260px square, and the spawn pins under his coat
   are the things you are out here to collect. He has no tap interaction of his
   own: the encounter fires from the player's position, never from a thumb, so
   nothing is lost. Asserted in tests/wanderer-patrol-live-audit.mjs (TAPTHRU). */
.map-wanderer-mark { position: relative; width: ${MARK_PX}px; height: ${MARK_PX}px; pointer-events: none; z-index: 0; }
/* HE GOES TO THE BACK OF THE MARKER LAYER, and this rule names other people's
   classes on purpose. MapLibre markers are DOM siblings with no z-index at all,
   so they paint in creation order and he is created after the player: measured
   at 260px, his coat covered the player's own marker AND the 75 m collect ring,
   which is the one thing on that screen that tells you what "in reach" means.
   He is the only marker big enough to bury another one, so the rule is his, and
   it lives here rather than in app.css for the same reason the rest of this
   stylesheet does. Raising all six together leaves their order among themselves
   exactly as it was; the only thing that changes is that they clear him. */
.map-you, .map-spawn, .map-den-mark, .map-mini-mark, .map-spire, .map-glutton-mark { z-index: 1; }
/* The plate is shifted so the LANTERN lands on the marker's centre, which is the
   anchor, which is his lat/lng. Percentages of the marker's own box, so this
   stays correct at any MARK_PX. */
.wanderer-body { position: absolute; inset: 0; transform: translate(${bodyX}%, ${bodyY}%); }
.map-wanderer-mark img {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;
  filter: drop-shadow(0 5px 8px rgba(0,0,0,.7)); z-index: 2;
}
/* The lantern. Sized in px by JS off the map's own projection so the lit ground
   is really CONE_RANGE_M, and rotated by rewriting the conic-gradient's start
   angle rather than by transforming the element: the map is north-up with
   rotation disabled, conic-gradient's 0deg is 12 o'clock going clockwise, so the
   angle IS the compass bearing and there is no transform to fight over. The
   marker root's transform belongs to MapLibre and nothing here touches it. */
.wanderer-cone {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 200px; height: 200px; border-radius: 50%; z-index: 1; pointer-events: none;
  /* A BEAM, NOT A PANE OF LIGHT. Tom: brightest at the lantern, fading out along
     its length. At 90 m the old near-flat mask read as a puddle and got away
     with it; over 300 m a flat wedge reads as a coloured shape laid on the map.
     The falloff starts at the flame and never fully stops, so the far end is a
     hint of light rather than an edge. */
  -webkit-mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,.62) 34%, rgba(0,0,0,.28) 68%, rgba(0,0,0,0) 100%);
  mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,.62) 34%, rgba(0,0,0,.28) 68%, rgba(0,0,0,0) 100%);
  animation: wandererLantern 3.2s ease-in-out infinite;
}
@keyframes wandererLantern { 0%, 100% { opacity: .74 } 50% { opacity: .98 } }
.map-wanderer-mark.charging img { animation: wandererCharge 700ms ease-out both; }
@keyframes wandererCharge {
  0% { transform: scale(1) } 45% { transform: scale(1.3) } 100% { transform: scale(1.12) }
}
/* REDUCED MOTION DISABLES, IT DOES NOT SPEED UP: animation-duration 0.001s does
   not stop a loop, it runs it a thousand times a second. The cone still has to
   be VISIBLE with motion off, because it is the warning, so it keeps a static
   opacity rather than being hidden. */
@media (prefers-reduced-motion: reduce) {
  .wanderer-cone { animation: none; opacity: .9; }
  .map-wanderer-mark.charging img { animation: none; }
}`;
  document.head.appendChild(st);
}

export const WANDERER_ART = 'assets/bh/wanderer/wanderer.png';

export function wandererMarkHtml() {
  ensureWandererStyle();
  return `<div class="wanderer-cone"></div>` +
    `<div class="wanderer-body"><img src="${WANDERER_ART}" alt="The Wanderer"></div>`;
}

// px is the cone's DIAMETER at CONE_RANGE_M; heading is his compass bearing.
export function paintWandererCone(el, px, heading) {
  if (!el) return;
  el.style.width = el.style.height = `${Math.round(px)}px`;
  const from = ((heading - CONE_HALF_DEG) + 360) % 360;
  const span = CONE_HALF_DEG * 2;
  el.style.background =
    `conic-gradient(from ${from.toFixed(1)}deg,` +
    ` rgba(255,228,150,0) 0deg,` +
    ` rgba(255,228,150,.46) 3deg,` +
    ` rgba(255,228,150,.46) ${span - 3}deg,` +
    ` rgba(255,228,150,0) ${span}deg,` +
    ` rgba(255,228,150,0) 360deg)`;
}

/* ---------------------------------------------------------------- the fight */

/* WHAT HE IS WORTH, AND WHAT HE COSTS, BOTH MEASURED. Unchanged from the version
 * that ambushed an egg: the fight was never the part that was wrong.
 *
 * The multiplier is not read off his Gauntlet line. On the ladder his 1.45x is
 * a RELATIVE step over the ordinary curve; on the map the multiplier is
 * absolute, so the same number means a different fight and had to be measured
 * as one. Driven through the real engine (tests/fight-sim.mjs's policy, 120
 * seeds, elemental tree, aiLevel 5) at the map's own scale:
 *
 *   the Mimic, shipped, 1.15x flat        50.8% player win
 *   the Wanderer at 1.25x                 30.0%
 *   the Wanderer at 1.45x                 14.2%   <- shipped
 *   the Wanderer at 1.6x                   8.3%
 *   the Glutton, shipped, 1.3x + slab      5.0%
 *   top landmark den, 1.32x + slab         5.0%
 *
 * So he is by a distance the hardest fight on the map and still short of the
 * day's world boss. That last gap is a product call, not an accident: the
 * Glutton is a scheduled destination you choose. This one comes to you, and a
 * 5% wall you did not ask for is a mugging. If Tom wants him at Glutton parity
 * it is one number: 1.7.
 *
 * AND HE PAYS A STEP EGG, which is why anyone would ever step into the light on
 * purpose. A hazard with no prize has exactly one correct play (walk round the
 * back of him forever) and the feature may as well not ship. The egg costs
 * nothing extra to the faucet: the ledger key above caps him at one payout per
 * cell per 45 minutes and he is won 14.2% of the time, so catching him every
 * single instance would pay 0.14 eggs per cell-instance against the rare spawn's
 * own 0.08, and nobody catches him every instance.
 *
 * THE TREE IS THE IDENTITY, exactly as on the ladder: he always brings the
 * elemental set, because the lantern is the whole drawing. You learn that the
 * Wanderer burns you, and you can come back dressed for it. It is spelled out
 * here rather than imported because pit.js does not export ENDLESS_TREES.
 */
export const WANDERER_FIGHT = {
  mult: 1.45,
  aiLevel: 5,
  talents: ['frostbolt', 'firebolt', 'totemic', 'frostbite', 'wildfire', 'tempest'],
  xp: 150,
  coins: 200,
};
