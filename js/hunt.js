// The Boneyard: GPS spawn hunt. Spawns are generated deterministically from
// (date, WAVE, neighborhood grid cell), so every device computes the same field
// offline and a future server could verify collections. Location is used only
// in-memory to measure distance; coordinates are never persisted or uploaded.
//
// WAVES: the field re-seeds every WAVE_HOURS through the day. Each wave moves the
// spawns to new spots (and re-rolls their types + rare chance), so coming back to
// the same zone a couple hours later is a fresh hunt. Collections are per-wave
// (the wave is baked into the spawn id -> ledger key), so you can't farm one spot
// back-to-back within a wave, but exploration across the day keeps paying out.

import { award } from './game.js';
import { coinsAdd, grantCrate } from './loot.js';
import { dateKey } from './nutrition.js';

const CELL_DEG = 0.005;           // ~550 m grid
export const COLLECT_RADIUS_M = 55;   // a touch roomier (Tom)
export const VIEW_RADIUS_M = 1200;    // show spawns from farther so routes plan ahead
export const WAVE_HOURS = 2;          // the whole field refreshes this often

// Which intraday wave we're in (0-based slot of the local day). Derived from the
// clock so the map naturally rolls to a fresh field as the day goes on.
export function currentWave(d = new Date()) {
  return Math.floor((d.getHours() * 60 + d.getMinutes()) / (WAVE_HOURS * 60));
}
// ms until the next wave (so the map can schedule a refresh right on the flip).
export function msToNextWave(d = new Date()) {
  const slot = WAVE_HOURS * 60;
  const mins = d.getHours() * 60 + d.getMinutes();
  const next = (Math.floor(mins / slot) + 1) * slot;
  return (next - mins) * 60000 - d.getSeconds() * 1000 - d.getMilliseconds();
}

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

// 3 spawns per cell per WAVE, deterministic. Rare appears in a given cell on
// ~1 wave in 3, so "a rare showed up nearby" is a real event, not a constant.
// The wave is part of the seed AND every id, so each refresh relocates the
// spawns and starts them uncollected again.
export function spawnsForCell(date, cx, cy, wave = currentWave()) {
  const rand = mulberry32(hashStr(`${date}:w${wave}:${cx}:${cy}`));
  const out = [];
  const types = ['bones', 'bones', 'bones', 'bones', 'coins', 'coins', 'crate'];
  for (let i = 0; i < 3; i++) {
    const type = types[Math.floor(rand() * types.length)];
    out.push({
      id: `${cx}_${cy}_w${wave}_${i}`,
      type, wave,
      lat: (cx + (rand() - 0.5) * 0.92) * CELL_DEG,
      lng: (cy + (rand() - 0.5) * 0.92) * CELL_DEG,
    });
  }
  if (rand() < 0.34) {
    out.push({
      id: `${cx}_${cy}_w${wave}_rare`,
      type: 'rare', wave,
      lat: (cx + (rand() - 0.5) * 0.92) * CELL_DEG,
      lng: (cy + (rand() - 0.5) * 0.92) * CELL_DEG,
    });
  }
  return out;
}

// All spawns in the neighborhood for the CURRENT wave, nearest first, annotated.
export function spawnsNear(date, lat, lng, wave = currentWave()) {
  const { cx, cy } = cellOf(lat, lng);
  const all = [];
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      all.push(...spawnsForCell(date, cx + dx, cy + dy, wave));
    }
  }
  return all
    .map(s => ({ ...s, dist: distanceM(lat, lng, s.lat, s.lng), bearing: bearingDeg(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 14);
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
