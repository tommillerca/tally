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
export const COLLECT_RADIUS_M = 55;   // a touch roomier (Tom)
export const SPAWN_TTL_MIN = 45;      // each spawn slot lives this long, then relocates
const SLOTS = 3;                      // spawn slots per cell
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

export const SPAWN_TYPES = {
  bones: { label: 'Bone cache', xp: 40, weight: 4 },
  coins: { label: 'Coin pile', coins: 60, weight: 2 },
  crate: { label: 'Buried crate', crate: 'daily', weight: 1 },
  rare:  { label: 'RARE spawn', crate: 'egg', xp: 80, weight: 0 }, // placed explicitly on lucky days
};

const SPAWN_WEIGHTS = ['bones', 'bones', 'bones', 'bones', 'coins', 'coins', 'crate'];

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
  // rare: scarce, its own 45m instance so "a rare stirs nearby" is a real event.
  const rInst = Math.floor(mins / SPAWN_TTL_MIN);
  const rr = mulberry32(hashStr(`${date}:${cx}:${cy}:rare:i${rInst}`));
  if (rr() < 0.03) {
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
