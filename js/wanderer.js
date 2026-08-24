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

/* HE IS BOUND TO LAND. Tom, 2026-08-22: "The wanderer is out in the lake where
 * I am right now. He shouldn't be. He's bound to land."
 *
 * The beat's centre was seeded with zero land awareness, so a cell over a lake
 * put his whole loop on the water. The fix keeps every property the header
 * promises (pure, derived, identical on every device) by keeping the LAND TEST
 * itself derived data: js/water.js classifies a lat/lng against the basemap's
 * own vector tiles at one fixed zoom (see its header for why that is the same
 * answer on every device), and this module consumes it as a plain synchronous
 * function passed in by the caller.
 *
 * THE FALLBACK IS A SEEDED SEQUENCE, NOT A SEARCH. Candidate 0 is the exact
 * centre that has always been seeded, so every beat that was already legal does
 * not move. If candidate k's WHOLE LAP crosses water, candidate k+1 reseeds the
 * centre off `${seed}:altk` and tries again, up to WANDER_TRIES. Every device
 * walks the same sequence against the same tile data and stops at the same k,
 * so two friends still see the same man in the same place. If no candidate
 * fits, the cell is effectively all water and there is NO wanderer that lap:
 * hidden beats floating (changelog v-something already promised "anything with
 * nowhere reachable nearby is hidden instead of stranded in the sea").
 *
 * THE WHOLE LAP IS TESTED, NOT THE CENTRE. He never stands at the centre; he
 * stands on the circle, so the acceptance samples the circle itself at
 * LAND_SAMPLES fixed angles (~11 m apart at the widest loop, finer than the
 * shoreline detail z14 tiles carry). The centre being in a pond with the loop
 * on the shore around it is legal and correct.
 *
 * UNDECIDED IS HIDDEN, NEVER SHOWN-AND-WRONG. While tiles are still loading the
 * oracle answers undefined, wandererAt returns null, and the map's own 5-second
 * refresh retries: the placeWalkable contract, minus the per-viewport snap that
 * would have dragged a moving marker (see refreshWanderer's note in js/app.js).
 */
export const WANDER_TRIES = 12;
const LAND_SAMPLES = 128;
const landMemo = new Map();   // seed -> chosen candidate k, or -1 for "no land"

function beatCenter(cx, cy, seed, k) {
  const s = k ? `${seed}:alt${k}` : seed;
  // 0.72 of the cell, so a beat centred at the edge still leaves his loop mostly
  // inside its own cell and two neighbours cannot overlap their lit ground.
  return {
    clat: (cx + (frac(`${s}:lat`) - 0.5) * 0.72) * WANDER_CELL_DEG,
    clng: (cy + (frac(`${s}:lng`) - 0.5) * 0.72) * WANDER_CELL_DEG,
  };
}

// true = every sampled point of the loop is land; false = some point is water;
// undefined = a needed tile has not arrived yet, so no verdict may be memoized.
function lapOnLand(clat, clng, r, isWater) {
  const mPerDegLng = M_PER_DEG_LAT * Math.max(0.05, Math.cos(clat * RAD));
  for (let j = 0; j < LAND_SAMPLES; j++) {
    const th = (2 * Math.PI * j) / LAND_SAMPLES;
    const w = isWater(clat + (r * Math.cos(th)) / M_PER_DEG_LAT,
      clng + (r * Math.sin(th)) / mPerDegLng);
    if (w !== false) return w ? false : undefined;
  }
  return true;
}

function landCandidate(cx, cy, seed, r, isWater) {
  const memo = landMemo.get(seed);
  if (memo !== undefined) return memo;
  for (let k = 0; k < WANDER_TRIES; k++) {
    const c = beatCenter(cx, cy, seed, k);
    const on = lapOnLand(c.clat, c.clng, r, isWater);
    if (on === undefined) return undefined;          // tiles pending: decide later
    if (on) { remember(seed, k); return k; }
  }
  remember(seed, -1);
  return -1;
}
function remember(seed, k) {
  // instances roll every 45 minutes; a lap's verdict is dead within the hour
  if (landMemo.size > 256) landMemo.clear();
  landMemo.set(seed, k);
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
/* isWater is js/water.js's classifier (or absent: no land constraint, the shape
   every pure-math test of the derivation uses). With it, the beat centre comes
   from the seeded land fallback above and a null return means NO wanderer right
   now: either the cell is effectively all water this lap, or the tiles that
   decide are still downloading and he is hidden until they land. */
export function wandererAt(cx, cy, date, mins = nowMins(), isWater) {
  const inst = Math.floor(mins / WANDER_LAP_MIN);
  const seed = `wander:${date}:${cx}:${cy}:i${inst}`;
  const r = WANDER_R_MIN_M + frac(`${seed}:r`) * (WANDER_R_MAX_M - WANDER_R_MIN_M);
  let k = 0;
  if (isWater) {
    k = landCandidate(cx, cy, seed, r, isWater);
    if (k === undefined || k < 0) return null;
  }
  const { clat, clng } = beatCenter(cx, cy, seed, k);
  const dir = frac(`${seed}:dir`) < 0.5 ? -1 : 1;      // +1 walks the loop clockwise
  /* THE PHASE IS SEEDED, AND LEAVING IT OUT WAS A REAL BUG. Tom, 2026-08-22:
     "multiple wanders face and move the same way that should never happen there
     needs to be a stagger."
     He is right, and it was worse than a cosmetic tell. Centre, radius and
     direction were all seeded per instance, but theta came only off the clock,
     so every Wanderer alive was at the SAME angle of his own loop at the same
     moment. heading is derived from theta and dir alone, so the entire world
     only ever held TWO headings: one per direction of travel. Two men in
     neighbouring cells walked in lockstep and swept their lanterns in parallel,
     which reads as a rendering fault rather than as two people.
     One more seeded term fixes it. It changes nothing else: the path is still a
     pure function of (date, cell, instance), still identical on every device,
     still continuous within an instance, and still a constant-speed circle. */
  const phase = frac(`${seed}:phase`) * 2 * Math.PI;
  const theta = phase + 2 * Math.PI * ((mins - inst * WANDER_LAP_MIN) / WANDER_LAP_MIN);
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
export function wanderersNear(date, lat, lng, mins = nowMins(), isWater) {
  const { cx, cy } = wandererCell(lat, lng);
  const out = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const w = wandererAt(cx + dx, cy + dy, date, mins, isWater);
      if (!w) continue;   // all-water cell, or land tiles still loading
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
export const MARK_PX = 200;

const STYLE_ID = 'wanderer-style';
export function ensureWandererStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  const bodyX = ((0.5 - LANTERN.x) * 100).toFixed(3);
  const bodyY = ((0.5 - LANTERN.y) * 100).toFixed(3);
  st.textContent = `
/* HE IS THE BIGGEST THING ON THE MAP, AND NO BIGGER THAN THAT. Both halves are
   the design and MARK_PX has now been wrong in both directions: at 78px among
   42px spawn pins he read as one more collectable, and at 260 Tom's verdict on
   the shipped v421 build was "he's too fucking big on the map".
   PICKED FROM THE RENDER, TWICE. Five sizes drawn on the real Boneyard at
   393x852 and measured off the RENDERED geometry, and it is his INK that is
   measured, never his element box: the plate is a 640-square whose alpha bounds
   are (60,88)-(622,505), so 12% of the width and 35% of the height of that box
   is transparent air, and this repo has already reported a false "spilling off
   screen" from measuring the wrong rectangle.
     MARK_PX   his ink   vs 127px collect ring   vs 42px spawn pin   of a 393 screen
       260     228x169     1.80w / 1.33h           5.4w                58%   too big
       220     193x143     1.52w / 1.13h           4.6w                49%
       200     176x130     1.39w / 1.02h           4.2w                45%   <- shipped
       180     158x117     1.24w / 0.92h           3.8w                40%
       160     141x104     1.11w / 0.82h           3.4w                36%
   200 is the smallest of them where his ink still beats the 75 m collect ring on
   BOTH axes, so "the biggest thing out there" survives the cut, while his drawn
   area drops 41% from 260 and the ring, the player marker and the pins beside
   him are readable again instead of buried under his coat. 180 and below lose
   the ring on height and he starts reading as one more marker, which is the bug
   at the other end of this same line.
   POINTER-EVENTS OFF ON THE WHOLE MARKER. A 200px element anchored over the map
   would swallow every tap in a 200px square, and the spawn pins under his coat
   are the things you are out here to collect. He has no tap interaction of his
   own: the encounter fires from the player's position, never from a thumb, so
   nothing is lost. Asserted in tests/wanderer-patrol-live-audit.mjs (TAPTHRU),
   which also grades the size band above (LOOMS-LIVE).
   ABSOLUTE, NOT RELATIVE, AND IT IS NOT A STYLE CHOICE. 2026-08-23. MapLibre
   places a marker by writing a transform on a root it has already taken OUT OF
   FLOW (.maplibregl-marker sets position: absolute, left 0, top 0). This
   stylesheet is injected at runtime and maplibre-gl.css is loaded lazily by
   js/map.js, so this block lands AFTER it in the head; both selectors are one
   class, so the later one won and "relative" put every Wanderer back into
   normal flow inside the marker container. Absolute siblings take no space, so
   the FIRST Wanderer read correct and each one after him stacked below the last
   by his own height: measured on the real Boneyard with three of them up,
   offsetTop 0 / 200 / 400, boxes 200px and 400px below the point MapLibre had
   placed, which unprojects to 238 m and 474 m of ground. His cone and
   inWandererCone both use his true position, so on every Wanderer but the
   first the light a player could see was not the light that caught them.
   Absolute agrees with MapLibre rather than fighting it, so this is correct
   whichever order the two stylesheets land in, and it is still a containing
   block for .wanderer-body / .wanderer-cone / the plate, which are all
   position: absolute inside it. Every other marker root in this app is
   "position: relative" in app.css and is SAFE for one reason only: app.css is
   a <link> in the head, so maplibre-gl.css lands after it and wins. Those must
   stay relative because the map key reuses .map-spawn / .map-den-mark /
   .map-mini-mark off the map (legendHtml, js/app.js). Graded live in
   tests/marker-anchor-audit.mjs (ANCHORED, GROUND), which also lints that no
   runtime-injected stylesheet does this again. */
.map-wanderer-mark { position: absolute; width: ${MARK_PX}px; height: ${MARK_PX}px; pointer-events: none; z-index: 0; }
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
/* HE FACES THE WAY HE IS WALKING. Tom, 2026-08-22: "the wanderer has been screen
   shot facing one way and his cone beacon going the opposite that makes no
   sense."
   Cam drew him walking WEST: measured off the plate's own alpha, his body mass
   is right-weighted while the lantern sits at x=0.188, so he carries it out
   ahead of him to the left. The cone rotates to his heading, so on any eastward
   beat the light left his lantern and swept back across his body, which reads as
   a rendering fault rather than as a man.
   Mirrored on the eastward half, and the translate is negated with it: the
   lantern has to keep landing on the marker's centre, which is the anchor, which
   is his lat/lng. Flipping without that moves the light off him.
   The PLATE is mirrored, never the marker root, whose transform belongs to
   MapLibre. Same rule the cone follows. */
.wanderer-body { position: absolute; inset: 0; transform: translate(${bodyX}%, ${bodyY}%); }
.map-wanderer-mark.facing-east .wanderer-body {
  transform: translate(${(-bodyX).toFixed(3)}%, ${bodyY}%) scaleX(-1);
}
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
     hint of light rather than an edge.
     LEFT ALONE ON PURPOSE, 2026-08-22, and this note is the reason. Asked
     whether these stops put the brightness at the SOURCE rather than out in the
     middle of the throw, I measured instead of assuming: the mask is already
     full black at 0%, so the hottest ring is on the lamp, and the whole
     "brightest at the lantern" complaint is carried by the beam having no
     source, not by this. A longer bright throat (#000 held to 7%) was built and
     rendered and moved the axis reading at the flame from 122 to 127 out of
     255, four percent, while the pool below moved it from 76 to 122. So the
     mask went back to what shipped. Do not re-tune it without a render that
     says it did something. */
  -webkit-mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,.62) 34%, rgba(0,0,0,.28) 68%, rgba(0,0,0,0) 100%);
  mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,.62) 34%, rgba(0,0,0,.28) 68%, rgba(0,0,0,0) 100%);
  /* IT DOES NOT MOVE. Tom, 2026-08-22: "the wanderer's light cone is flickering
     ... the cone shouldn't flicker or change size". It carried a 3.2s opacity
     loop between .74 and .98, added as a lantern "breathing"; he reads it as a
     fault, so it is gone and the opacity is the static value the reduced-motion
     rule already used. There is no @keyframes for the cone any more, which is
     why the reduced-motion block below no longer names it: nothing to disable.
     DO NOT ADD MOTION HERE. Not a shimmer, not a pulse, not a travelling
     gradient. It is a warning light on a map, and a warning that moves on its
     own is indistinguishable from a rendering fault. */
  opacity: .9;
}
.map-wanderer-mark.charging img { animation: wandererCharge 700ms ease-out both; }
@keyframes wandererCharge {
  0% { transform: scale(1) } 45% { transform: scale(1.3) } 100% { transform: scale(1.12) }
}
/* REDUCED MOTION DISABLES, IT DOES NOT SPEED UP: animation-duration 0.001s does
   not stop a loop, it runs it a thousand times a second. The cone is not listed:
   it has no animation to disable now, and it must stay VISIBLE with motion off
   because it is the warning, which its own static opacity above already gives
   it. */
@media (prefers-reduced-motion: reduce) {
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

/* THE BEAM'S CROSS-SECTION, as fractions of CONE_HALF_DEG off the axis and the
   alpha at each. Written against the half-angle rather than in degrees so the
   profile survives a change to the catch geometry instead of silently drifting
   away from it.

   IT IS A DOME, NOT A FLAT TOP. The old profile was one alpha (.46) held flat
   from +3 to +57 degrees with a 3-degree ramp at each end, which is a pane of
   coloured light with two bevelled sides, and that is exactly what Tom saw:
   "the cone ... pointing strangely out of the lamp", a shape laid on the map.
   Light out of a lamp is brightest along its axis and dies towards its edges,
   so the axis carries the peak and every stop off it is dimmer.

   THE OUTERMOST STOP IS STILL ALPHA 0 AT EXACTLY THE HALF-ANGLE, and the one
   before it is at .92 of it. That is deliberate and it is the honesty
   constraint: the drawn wedge has to end where inWandererCone ends, or a player
   gets caught by ground that looked dark. So the dome may reshape the INSIDE of
   the wedge as much as it likes and may never narrow it: the edge still ramps
   over the last 8% (2.4 degrees at the shipped half-angle, about the old 3) so
   the boundary stays legible rather than fading into nothing.
   Graded in tests/wanderer-boneyard-audit.mjs (DRAWN, BEAM). */
const BEAM = [[-1, 0], [-0.92, .14], [-0.75, .30], [-0.5, .43], [-0.25, .50], [0, .52],
  [0.25, .50], [0.5, .43], [0.75, .30], [0.92, .14], [1, 0]];

/* THE FLAME'S OWN POOL, as a fraction of the beam's RADIUS. A wedge springing
   from a mathematical point is the other half of "pointing strangely out of the
   lamp": light with no source appears out of nothing. A real lamp is an object,
   so it has a hot pool around it that the beam grows out of.
   SMALL ON PURPOSE, and this is the number that has to stay small. The pool is a
   full circle, so it is the one part of the drawing that is lit BEHIND him, and
   inWandererCone catches nobody behind him beyond 5 m. At .085 of a 300 m radius
   it is a 25 m bloom, which at the zoom the player gets is ~20 px: it reads as
   his lantern glowing, which is true and is why he is visible at all, and never
   as ground worth avoiding. Do not grow it into a second catch zone.
   Graded in tests/wanderer-boneyard-audit.mjs (SOURCE). */
const CORE_R = 0.085;

/* px is the cone's DIAMETER at CONE_RANGE_M, or NULL when the map cannot answer
   right now; heading is his compass bearing. */
export function paintWandererCone(el, px, heading) {
  if (!el) return;
  /* A NULL SIZE KEEPS THE SIZE HE HAS. Tom, 2026-08-22: "the cone shouldn't
     flicker or change size". The caller used to substitute a 200 px fallback
     whenever the map declined to project, which through a pan is every few
     seconds, so a 508 px beam was repeatedly redrawn as a 200 px stub and then
     put back. Measured on the real Boneyard: 508 -> 200 -> 508 inside 300 ms.
     The last good size is a far better answer than a constant, and the 200 is
     kept only for a cone that has never been sized at all, so a map that can
     never project degrades to ugly rather than to invisible (anti-regression
     rule 8) instead of degrading a correct beam to a wrong one.

     AND REPAINT ONLY WHEN THE PICTURE WOULD ACTUALLY CHANGE. v423 bound the
     sizing pass to map.on('move') as well as map.on('zoom'), which was the right
     fix for the cone not tracking the ground through a pinch, but it means this
     runs on every frame of every pan, where the projected size differs in the
     hundredths of a pixel. Rounded first, then compared, so the comparison is
     against what is DRAWN rather than against what was asked for and sub-pixel
     noise cannot get through. A real zoom changes the rounded size and a real
     tick changes the heading, and both still repaint on the next frame. */
  const size = Math.round(px > 0 ? px : (el._conePx || 200));
  if (el._conePx === size && el._coneDeg === heading) return;
  el._conePx = size; el._coneDeg = heading;
  /* The one place that already knows his heading sets which way he faces, so the
     light and the man can never be told two different things. 0-180 is the
     eastward half on a compass bearing. */
  const mark = el.closest ? el.closest('.map-wanderer-mark') : null;
  if (mark) mark.classList.toggle('facing-east', heading > 0 && heading < 180);
  el.style.width = el.style.height = `${size}px`;
  const from = ((heading - CONE_HALF_DEG) + 360) % 360;
  const span = CONE_HALF_DEG * 2;
  const stops = BEAM
    .map(([t, a]) => ` rgba(255,228,150,${a}) ${((t + 1) * CONE_HALF_DEG).toFixed(2)}deg`)
    .join(',');
  /* Two layers, and the pool is painted OVER the beam so the source is the
     brightest thing in the drawing. Both are centred on the element's centre,
     which is the marker's anchor, which is his lat/lng, which is the flame:
     nothing here needs an offset. */
  el.style.background =
    `radial-gradient(circle closest-side at 50% 50%,` +
    ` rgba(255,242,206,.80) 0%,` +
    ` rgba(255,236,180,.46) ${(CORE_R * 42).toFixed(1)}%,` +
    ` rgba(255,228,150,.16) ${(CORE_R * 72).toFixed(1)}%,` +
    ` rgba(255,228,150,0) ${(CORE_R * 100).toFixed(1)}%),` +
    `conic-gradient(from ${from.toFixed(1)}deg,${stops},` +
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

/* ============================================================================
   THE ENCOUNTER, before the fight
   ============================================================================
   Tom, 2026-08-21, with screenshots: "i want to create a cool encounter sequence
   before the fight ... reproduce it with our assets i.e. the typing on screen
   style textbox and proper buttons for fight or flee. if you select fight, then
   it should zoom in retro style (kind of like pokemon combat when you get in a
   trainer battle)".

   WHAT THIS REPLACES. Cone entry used to be `toast() -> 700ms lunge -> arena`.
   The toast said the sentence, which is the problem: a toast is the app's
   interruption channel (a coin landed, a quest ticked) and it slides over
   whatever you were doing without stopping it. This fight is the one thing on
   the map the player did not ask for, so it is the one that has to take the
   screen and ask.

   THE ORDER IS SOUND, THEN LIGHT, THEN HIM, and it is the order in the writing:
   footsteps and a glow first, the silhouette second, his name never. The scene
   is black with one lantern in it and he resolves out of that ground rather than
   cutting in, because you are supposed to be looking at the light wondering what
   is carrying it. That is why the art fades AND walks (a slow scale toward the
   camera) instead of just appearing: 2.2s at 1.0 -> 1.16 is not an entrance
   flourish, it is the distance closing while you read.

   IT IS A REAL CHOICE AND FLEEING IS FREE. wandererEngaged in js/app.js already
   counts a flee as engaged, so walking away costs you this instance and nothing
   else: no coins, no ledger row, no penalty. A prompt whose second button is a
   worse version of the first is not a prompt, and he is a 1.45x boss standing in
   the street, so "not right now" has to be a real answer.

   NO NEW TYPER. talkBoxHtml/runTalkBox is the app's one typing path and this is
   its seventeenth caller, not a private reimplementation (see js/talkbox.js's
   own header on exactly this). Tap-to-skip, the caret/chevron states and the
   reduced-motion print-at-once all come along for free.

   THE ZOOM IS STEPPED ON PURPOSE. `steps(7)` and not a smooth cubic: a Game Boy
   could not tween, and the chunky ratchet is the whole reason the transition
   reads as retro rather than as a modern hero animation. The flash under it is
   two hard alternations, no fade, for the same reason. Duration is 820ms,
   measured against the arena's own build time so the screen is never blank
   between the last frame here and the first frame of the fight.

   Guard: tests/wanderer-encounter-audit.mjs. */

import { talkBoxHtml, runTalkBox, TALK_MS } from './talkbox.js';

const ENC_STYLE_ID = 'wanderer-enc-style';

/* The two lines, in Tom's words from the screenshots. Exported so the guard
   asserts the SHIPPED strings rather than its own copy of them. */
export const ENCOUNTER_LINES = [
  'You hear heavy footsteps, and see a warm glowing light.',
  'Something approaches...',
];

export const ZOOM_MS = 900;

/* A LINE HAS TO SIT STILL LONG ENOUGH TO BE READ. Tom, 2026-08-21: "the text is
   currently too fast to read". It was, and not because of the typing speed: the
   first line was being REPLACED the instant it finished, so it was fully on
   screen for zero milliseconds. TALK_MS is 26ms a character and is the approved
   app-wide number, so it is not touched here; what was missing was the pause
   after. 55 characters take 1.43s to type and then get 1.1s to be read. */
export const LINE_HOLD_MS = 1100;

function ensureEncounterStyle() {
  if (typeof document === 'undefined' || document.getElementById(ENC_STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = ENC_STYLE_ID;
  st.textContent = `
/* z-index 220: above the Mimic's reveal (200), because both can be on screen in
   the same second if a Mimic crate sits inside his cone, and the man who walked
   up to you is the one that has to be in front. */
.wnd-enc {
  position: fixed; inset: 0; z-index: 220; overflow: hidden;
  display: flex; flex-direction: column; justify-content: flex-end;
  padding: 0 16px calc(env(safe-area-inset-bottom, 0px) + 22px);
  background: #05040a;
  animation: wndEncIn 420ms ease both;
  --wnd-art: min(96vw, 460px);
  --wnd-lx: ${(LANTERN.x * 100).toFixed(2)}%;
  --wnd-ly: ${(LANTERN.y * 100).toFixed(2)}%;
}
/* THE SCENE IS ONE MOVING THING: the glow and the plate share a wrapper, so the
   walk carries both and the light stays on the lantern for every frame of it.
   The alternative (a fixed vignette behind a moving figure) is what the first
   build did and it read as a spotlight on a stage rather than as a man carrying
   a lamp: he drifted out of his own light as he came forward. */
/* HE WALKS IN FROM SCREEN RIGHT. Tom, 2026-08-21, after I ignored his reference
   and invented a scale-up instead: "all i wanted was you to have him translate in
   via position key frames from screen right and slide in". So it is position and
   nothing else: he is PARKED off the right edge, and .arrive slides him to centre.
   No scale on this element at any point, which also keeps the zoom's own scale
   the only scale in the sequence and means the two cannot fight over transform. */
.wnd-enc-scene {
  position: absolute; left: 50%; top: 46%;
  width: var(--wnd-art); height: var(--wnd-art);
  transform: translate(calc(-50% + 118vw), -50%); pointer-events: none;
}
/* EASED AT BOTH ENDS, Tom 2026-08-21: "ease the wanderer's slide and landing a
   touch". The old curve started at .22/.61, which is nearly linear off the mark,
   so he snapped into motion and then arrived at a speed he had to stop dead at.
   This one leans in gently and spends its long tail decelerating, so the landing
   settles rather than halts. 1650ms rather than 1500 for the same reason: the
   extra 150ms all lands in the tail. */
.wnd-enc.arrive .wnd-enc-scene { animation: wndEncWalk 1650ms cubic-bezier(.42, .02, .17, 1) both; }
/* THE LANTERN IS THE ONLY LIGHT IN THE ROOM, and it hangs where Cam drew it.
   --wnd-lx / --wnd-ly are LANTERN, the same constant the map marker centres its
   cone on, expressed as a percentage of the plate: nothing here is eyeballed, and
   retiring the constant moves the map and this scene together or neither.
   It is a sibling layer rather than a filter on the <img> because it has to
   spill onto the ground and up onto the talk box, which a drop-shadow cannot. */
.wnd-enc-glow {
  position: absolute; left: var(--wnd-lx); top: var(--wnd-ly);
  width: 420%; height: 420%; transform: translate(-50%, -50%); pointer-events: none;
  background: radial-gradient(circle,
    rgba(255, 226, 158, .52) 0%, rgba(255, 190, 92, .30) 7%,
    rgba(196, 120, 40, .15) 18%, rgba(96, 56, 18, .06) 34%, rgba(5, 4, 10, 0) 58%);
  animation: wndEncFlicker 2.6s ease-in-out infinite;
}
/* HE COMES OUT OF THE DARK RATHER THAN CUTTING IN. The brightness ramp is the
   whole reason the order of the writing works: for the first second you have a
   light and a shape, and he resolves into a man while the line finishes. */
/* OPACITY 1, ALWAYS. This was opacity zero with the entrance supplying the 1,
   and the .wnd-enc.zoom rule setting animation:none then took that animation
   away, so he VANISHED for the whole charge and the sequence zoomed an empty
   frame. He is off screen because the SCENE is off screen, never because the art
   is transparent: one mechanism, and nothing to cancel. */
.wnd-enc-art {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: contain; pointer-events: none; opacity: 1;
}
/* The box and the buttons sit in flow at the bottom, over the scene. */
.wnd-enc .wnd-enc-box { position: relative; z-index: 2; margin: 0 0 12px; }
.wnd-enc-acts {
  position: relative; z-index: 2; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  opacity: 0; pointer-events: none; transition: opacity 220ms ease;
}
.wnd-enc-acts.on { opacity: 1; pointer-events: auto; }
.wnd-enc-acts .btn { width: 100%; }

@keyframes wndEncIn { from { opacity: 0 } to { opacity: 1 } }
@keyframes wndEncFlicker { 0%, 100% { opacity: .82 } 42% { opacity: 1 } 71% { opacity: .74 } }
/* the distance closing while you read: 16% over the length of the first line */
/* POSITION KEYFRAMES, NOTHING ELSE. 118vw parks him fully off the right edge at
   every width; 0% holds there for a beat so the slide reads as an entrance
   rather than as the screen already being mid-move when it fades up. */
@keyframes wndEncWalk {
  0%, 6% { transform: translate(calc(-50% + 118vw), -50%); }
  100%   { transform: translate(-50%, -50%); }
}

/* ---- THE CHARGE. Stepped, not tweened. ---- */
.wnd-enc.zoom .wnd-enc-scene { animation: wndEncZoom ${ZOOM_MS}ms steps(9, end) both; }
.wnd-enc.zoom .wnd-enc-art { animation: none; filter: brightness(1); }
.wnd-enc.zoom::after {
  content: ''; position: absolute; inset: 0; z-index: 3; pointer-events: none;
  /* NOT steps(). The hard cuts are made by PAIRED percentages (51% and 51.01%),
     so they stay hard; leaving a gap between the last two keyframes is what buys
     the fade at the end. steps(1) would quantise that fade into one jump. */
  animation: wndEncFlash ${ZOOM_MS}ms linear both;
}
.wnd-enc.zoom .wnd-enc-box, .wnd-enc.zoom .wnd-enc-acts { opacity: 0; transition: none; }
@keyframes wndEncZoom {
  0%   { transform: translate(-50%, -50%) scale(1); }
  100% { transform: translate(-50%, -50%) scale(6.2); }
}
/* THE ZOOM IS WATCHED FIRST, THEN THE STROBE. The first build interleaved them
   and it read as janky, which it was, and the luminance trace off the recording
   says why: the clear windows were about 110ms each and the art HOLDS inside a
   step, so what the eye actually got was dark, WHITE, dark, WHITE, grey, WHITE.
   A strobe, with the zoom hidden behind it. Measured means per frame were
   40, 33, 220, 63, 229, 115, 235: two of those are the art and four are wash.
   So the order is now sequential, not interleaved:
     0 to 42%   CLEAR. 294ms of nothing but him rushing the camera, nine steps
                of it, which is the part that was being thrown away.
     42 to 76%  THE STROBE, bright / black / bright / black on even ~60ms beats.
                Alternating to near-black rather than dipping to a mid opacity:
                the old 25% dip measured 115 mean, a muddy grey that reads as a
                rendering fault rather than as a beat.
     72 to 100% FADE TO BLACK, 252ms of it, and the arena is built behind the
                black rather than behind a bright wash. Tom, 2026-08-21, on the
                previous cut: "i dont think it should end on a white frame it can
                fade to black then open the fight encounter". He is right for a
                reason worth writing down: a white hold is the brightest frame in
                the sequence, so handing over on it means the arena arrives as a
                drop in brightness, which reads as the screen recovering from the
                transition rather than as the fight beginning.
   Colour is animated instead of opacity so the black beats are really black
   rather than a translucent film over a bright frame. */
@keyframes wndEncFlash {
  0%,     40%  { background: rgba(255, 233, 194, 0) }
  40.01%, 47%  { background: rgba(255, 233, 194, 1) }
  47.01%, 53%  { background: rgba(5, 4, 10, 1) }
  53.01%, 60%  { background: rgba(255, 233, 194, 1) }
  60.01%, 66%  { background: rgba(5, 4, 10, 1) }
  66.01%, 72%  { background: rgba(255, 233, 194, 1) }
  100%         { background: rgba(5, 4, 10, 1) }
}
.wnd-enc.out { animation: wndEncOut 260ms ease both; }
@keyframes wndEncOut { to { opacity: 0 } }

/* REDUCED MOTION KEEPS THE SCENE AND DROPS THE TRAVEL. Every loop here is
   switched off by NAME rather than shortened: this repo has already shipped an
   an animation-duration of .001s that ran an infinite loop a thousand times a
   second. The flash is the one thing that is removed outright rather than
   stilled, because a hard alternating wash is the exact thing the setting is
   asking not to be shown. */
@media (prefers-reduced-motion: reduce) {
  .wnd-enc { animation: wndEncIn 160ms linear both; }
  .wnd-enc-glow { animation-name: none; opacity: .9; }
  .wnd-enc-art { opacity: 1; animation: none; }
  .wnd-enc-scene { transform: translate(calc(-50% + 118vw), -50%); }
  .wnd-enc.arrive .wnd-enc-scene, .wnd-enc.zoom .wnd-enc-scene {
    animation: none; transform: translate(-50%, -50%); }
  .wnd-enc.zoom::after { animation: wndEncIn 200ms linear both; opacity: 1; }
}`;
  document.head.appendChild(st);
}

/* Resolves 'fight' or 'flee'. The overlay removes itself either way; on 'fight'
   it holds through the zoom and hands over on a full white screen, so the caller
   can build the arena underneath and there is no black frame between them. */
export function showWandererEncounter({ reduced = false } = {}) {
  if (typeof document === 'undefined') return Promise.resolve('fight');
  ensureEncounterStyle();
  const el = document.createElement('div');
  el.className = 'wnd-enc';
  el.innerHTML =
    `<div class="wnd-enc-scene"><div class="wnd-enc-glow"></div>` +
      `<img class="wnd-enc-art" src="${WANDERER_ART}" alt="" aria-hidden="true"></div>` +
    talkBoxHtml(ENCOUNTER_LINES[0], { hold: true, cls: 'wnd-enc-box' }) +
    `<div class="wnd-enc-acts">` +
      `<button type="button" class="btn wnd-fight">Fight</button>` +
      `<button type="button" class="btn ghost wnd-flee">Flee</button>` +
    `</div>`;
  document.body.appendChild(el);

  const box = el.querySelector('.talkbox');
  const acts = el.querySelector('.wnd-enc-acts');
  runTalkBox(box, ENCOUNTER_LINES[0], { hold: true });

  /* YOU HEAR HIM BEFORE YOU SEE HIM, and the first cut got this backwards. Tom,
     2026-08-21: "the point was that he is out of frame before the person reads
     'you hear something coming' right now you see him from the very start it
     makes no sense". He is right: the line says you HEAR footsteps and see a
     LIGHT, and the screen was showing the man who is making them. The line and
     the picture contradicted each other for the whole of the first beat.
     So the scene runs in two beats and the class is the switch:
       beat 1  the glow alone in the dark. No figure at all. Line one.
       beat 2  `.arrive` lands, and he walks up out of the black. Line two.
     The art is aria-hidden and the box carries the words, so a screen reader
     gets the same two beats in the same order without the staging.

     THE ADVANCE IS DRIVEN OFF tb-done, NOT OFF A CLOCK, because the box's own
     tap-to-skip can get there first: skipping a line must bring the next beat
     forward, not leave it waiting on a timer the player already outran. The
     clock is only a backstop for a box that never reports done. */
  const typeMs = i => (reduced ? 0 : ENCOUNTER_LINES[i].length * TALK_MS);
  const hold = reduced ? 200 : LINE_HOLD_MS;
  let timer = 0;
  const afterLine = (i, next) => {
    const started = Date.now();
    const tick = () => {
      if (!el.isConnected) return;
      const done = box.classList.contains('tb-done');
      if (done || Date.now() - started > typeMs(i) + 600) {
        timer = setTimeout(next, hold);
        return;
      }
      timer = setTimeout(tick, 60);
    };
    timer = setTimeout(tick, 60);
  };
  afterLine(0, () => {
    el.classList.add('arrive');
    runTalkBox(box, ENCOUNTER_LINES[1], { hold: true });
    afterLine(1, () => acts.classList.add('on'));
  });

  return new Promise(resolve => {
    let done = false;
    const end = (choice) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (choice === 'flee') {
        el.classList.add('out');
        setTimeout(() => { el.remove(); resolve('flee'); }, reduced ? 0 : 260);
        return;
      }
      el.classList.add('zoom');
      /* The overlay is NOT removed here. It is left on the white hold frame and
         torn down by the caller once the arena exists; removing it on this side
         would show the map again for however long openFight takes. */
      setTimeout(() => resolve('fight'), reduced ? 220 : ZOOM_MS);
    };
    el.querySelector('.wnd-fight').addEventListener('click', () => end('fight'));
    el.querySelector('.wnd-flee').addEventListener('click', () => end('flee'));
    el._wndEnd = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  }).then(choice => ({ choice, dismiss: () => el._wndEnd && el._wndEnd() }));
}
