// The Boneyard: GPS spawn hunt. Spawns are generated deterministically from
// (date, grid cell, per-slot instance), so every device computes the same field
// offline and a future server could verify collections. Location is used only
// in-memory to measure distance; coordinates are never persisted or uploaded.
//
// STAGGERED RESPAWN (no global reset): each cell has a few spawn "slots"; every
// slot lives SPAWN_TTL_MIN (~45m) then RELOCATES to a fresh spot with a fresh
// type. Crucially the slots are PHASE-STAGGERED, so they flip at different times
// and the field drifts continuously instead of resetting all at once. Combined
// with the map's lock-on-approach (a spawn you're walking toward never moves
// until you grab it or leave), you're never robbed of a target mid-approach.
// The instance is baked into each spawn id -> ledger key, so a spot can't be
// farmed back-to-back within its 45m life, but exploration keeps paying out.

import { award } from './game.js';
import { coinsAdd, grantCrate } from './loot.js';
import { dateKey } from './nutrition.js';

const CELL_DEG = 0.005;           // ~550 m grid
export const COLLECT_RADIUS_M = 75;   // roomier again (Tom, 2026-08-07: ~33% more than 55)
export const SPAWN_TTL_MIN = 45;      // each spawn slot lives this long, then relocates
/* DENSITY, 2026-08-18. Tom: "i think we need to add more coins and small things
   to the bone yard and then decrease the amount each one gives so it evens out
   and doesnt blow the economy but keeps the game interesting", and "splitting up
   the amount of food items and gold would help us curb that and make the boneyard
   seem more full."
   So: 2.5x the spawns, and every per-spawn payout cut to match. Measured, not
   guessed (scratchpad supply-sim.mjs, real generator + real drop tables): coins
   per day 0.89x, crates per day 0.89x, XP per day 1.00x, ingredients per day
   1.46x, and the count generated inside a phone viewport goes 4.2 -> 10.2. On
   the RENDERED map (placeWalkable hides anything it cannot snap to walkable
   ground, and anything off-screen) that is 2.5 -> 7.0 "nearby" over four
   locations, which is the number Tom will actually see. Ingredients are
   the one line that RISES, because the Bone Garden is coming out and the map has
   to feed the Kitchen on its own (ROADMAP, Stage 1). */
export const SLOTS = 5;               // spawn slots per cell
export const NEAR_M = 1600;           // full-density hunt radius around you
export const FAR_M = 6000;            // route-planning: crates/rares shown this far out
export const RARE_CUE_M = 1500;       // a rare within this range earns a "stirs nearby" cue

// live minutes since local midnight (fractional). Instances use floor(), so a
// slot only actually flips on its 45-minute boundary.
function nowMins(d = new Date()) { return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
// deterministic phase offset per slot so slots DON'T flip together (staggered)
function slotPhase(cx, cy, k) { return hashStr(`ph:${cx}:${cy}:${k}`) % SPAWN_TTL_MIN; }
// which 45-min instance a slot is on right now (monotonic through the local day)
function slotInstance(cx, cy, k, mins) { return Math.floor((mins + SPAWN_TTL_MIN - slotPhase(cx, cy, k)) / SPAWN_TTL_MIN); }

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cellOf(lat, lng) {
  return { cx: Math.round(lat / CELL_DEG), cy: Math.round(lng / CELL_DEG) };
}

// meters between two coordinates (haversine)
export function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// initial bearing from point 1 to point 2, degrees clockwise from north
export function bearingDeg(lat1, lng1, lat2, lng2) {
  const toR = Math.PI / 180;
  const y = Math.sin((lng2 - lng1) * toR) * Math.cos(lat2 * toR);
  const x = Math.cos(lat1 * toR) * Math.sin(lat2 * toR) -
    Math.sin(lat1 * toR) * Math.cos(lat2 * toR) * Math.cos((lng2 - lng1) * toR);
  return ((Math.atan2(y, x) / toR) + 360) % 360;
}

/* Per-spawn payouts are all DIVIDED BY THE DENSITY BUMP above, so the field got
   busier without the faucet opening. `weight` is the real weight now (it used to
   disagree with the hand-written SPAWN_WEIGHTS list below it: bones claimed 4 and
   got 2, coins claimed 2 and got 1), and coin piles are the type that grew,
   because "more coins and small things" is what Tom asked to see out there. */
export const SPAWN_TYPES = {
  bones: { label: 'Bone cache', xp: 16, weight: 5 },
  coins: { label: 'Coin pile', coins: 12, xp: 6, weight: 5 },
  /* WEIGHT 1 -> 4, 2026-09-03. At weight 1 a buried crate was 7.1% of spawns and
     a Mimic (one in three of them) 2.4%, i.e. one per 42 spawns walked, which is
     why the Mimic shipped in August and no player had ever reported meeting one.
     Tom: "make more chests on the map to accommodate for this change in actually
     finding loot". MEASURED at weight 4 with MIMIC_SHARE 5: chests 23.5% of
     spawns, Mimics 4.7% (one per 21), real loot chests 18.8% (was 4.8%).
     THIS IS THE DIAL. Loot chests are ~4x commoner than before; if the economy
     runs hot, lower this weight before touching MIMIC_SHARE. */
  crate: { label: 'Buried crate', crate: 'daily', xp: 6, weight: 4 },
  rare:  { label: 'RARE spawn', crate: 'egg', xp: 80, weight: 0 }, // placed explicitly on lucky days
  /* THE FOOD SPAWN. It used to be the garden's presence on the map and its whole
     identity was `seeds: 2`. The Bone Garden is coming out, so seeds are on their
     way to being worthless and this became the worst find in the game. It now
     pays COOKING INGREDIENTS instead, demand-weighted against the cookbook
     (cooking.js DEMAND_POOL), which is what the Kitchen needs once the garden
     stops feeding it. How much food each type carries lives in cooking.js
     SPAWN_FOOD, next to the pools, because cooking.js cannot import this module
     without closing a cycle. */
  herbs: { label: 'Herb patch', xp: 10, weight: 3 },
};

// derived from the weights above, so the table is the only place a rate lives
const SPAWN_WEIGHTS = Object.entries(SPAWN_TYPES).flatMap(([id, d]) => Array(d.weight).fill(id));

// Spawns for one cell at time `mins`. Each slot re-rolls its type + position on
// its own instance, and a rare occasionally surfaces on its own slow instance.
export function spawnsForCell(date, cx, cy, mins = nowMins()) {
  const out = [];
  for (let k = 0; k < SLOTS; k++) {
    const inst = slotInstance(cx, cy, k, mins);
    const r = mulberry32(hashStr(`${date}:${cx}:${cy}:s${k}:i${inst}`));
    out.push({
      id: `${cx}_${cy}_s${k}_i${inst}`, slot: k, inst,
      type: SPAWN_WEIGHTS[Math.floor(r() * SPAWN_WEIGHTS.length)],
      lat: (cx + (r() - 0.5) * 0.92) * CELL_DEG,
      lng: (cy + (r() - 0.5) * 0.92) * CELL_DEG,
    });
  }
  // rare (Mystery Egg): its own 45m instance so "an egg stirs nearby" is a real
  // event. Rate tuned up so eggs (the pet pipeline) actually reach players.
  const rInst = Math.floor(mins / SPAWN_TTL_MIN);
  const rr = mulberry32(hashStr(`${date}:${cx}:${cy}:rare:i${rInst}`));
  if (rr() < 0.08) {
    out.push({
      id: `${cx}_${cy}_rare_i${rInst}`, slot: 'rare', inst: rInst, type: 'rare', rare: true,
      lat: (cx + (rr() - 0.5) * 0.92) * CELL_DEG,
      lng: (cy + (rr() - 0.5) * 0.92) * CELL_DEG,
    });
  }
  return out;
}

// The hunt field for route planning: FULL density within NEAR_M, plus just the
// worth-walking-to targets (crates + rares) out to FAR_M as distant "beacons",
// so the map shows where a multi-hour walk could head without thousands of pins.
export function spawnsForRoute(date, lat, lng, mins = nowMins()) {
  const { cx, cy } = cellOf(lat, lng);
  const R = Math.ceil(FAR_M / (CELL_DEG * 111000)) + 1; // cells covering FAR_M
  const near = [], far = [];
  for (let dx = -R; dx <= R; dx++) {
    for (let dy = -R; dy <= R; dy++) {
      for (const s of spawnsForCell(date, cx + dx, cy + dy, mins)) {
        const dist = distanceM(lat, lng, s.lat, s.lng);
        const o = { ...s, dist, bearing: bearingDeg(lat, lng, s.lat, s.lng) };
        if (dist <= NEAR_M) near.push(o);
        else if (dist <= FAR_M && (s.type === 'rare' || s.type === 'crate')) { o.far = true; far.push(o); }
      }
    }
  }
  near.sort((a, b) => a.dist - b.dist);
  far.sort((a, b) => a.dist - b.dist);
  return near.slice(0, 80).concat(far.slice(0, 50));
}

// Back-compat: nearest spawns around a point (used by quests/tests).
export function spawnsNear(date, lat, lng, mins = nowMins()) {
  const { cx, cy } = cellOf(lat, lng);
  const all = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) all.push(...spawnsForCell(date, cx + dx, cy + dy, mins));
  return all
    .map(s => ({ ...s, dist: distanceM(lat, lng, s.lat, s.lng), bearing: bearingDeg(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 20);
}

// Rares within cue range at time `mins` (used to schedule "rare nearby" pushes
// deterministically for upcoming 45-min windows near a last-known location).
export function raresNear(date, lat, lng, mins) {
  const { cx, cy } = cellOf(lat, lng);
  const out = [];
  for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
    for (const s of spawnsForCell(date, cx + dx, cy + dy, mins)) {
      if (s.type !== 'rare') continue;
      const dist = distanceM(lat, lng, s.lat, s.lng);
      if (dist <= RARE_CUE_M) out.push({ ...s, dist });
    }
  }
  return out.sort((a, b) => a.dist - b.dist);
}

export function spawnKey(date, spawn) { return `spawn-${date}-${spawn.id}`; }

// Collect a spawn (caller has verified proximity). Idempotent via the ledger.
export async function collectSpawn(spawn, date = dateKey()) {
  const def = SPAWN_TYPES[spawn.type];
  const xp = await award(spawnKey(date, spawn), 'spawn', def.xp || 15, `Boneyard: ${def.label}`, date);
  if (xp === 0) return null; // already collected
  const out = { xp, coins: 0, crate: null, type: spawn.type, label: def.label };
  if (def.coins) { await coinsAdd(def.coins); out.coins = def.coins; }
  if (def.crate) { await grantCrate(def.crate, 'boneyard'); out.crate = def.crate; }
  return out;
}

export function fmtDist(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function compassLabel(bearing) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(bearing / 45) % 8];
}
