// The Boneyard: daily GPS spawn hunt. Spawns are generated deterministically
// from (date, neighborhood grid cell), so every device computes the same field
// offline and a future server could verify collections. Location is used only
// in-memory to measure distance; coordinates are never persisted or uploaded.

import { award } from './game.js';
import { coinsAdd, grantCrate } from './loot.js';
import { dateKey } from './nutrition.js';

const CELL_DEG = 0.005;           // ~550 m grid
export const COLLECT_RADIUS_M = 45;
export const VIEW_RADIUS_M = 600;

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

// 3 spawns per cell per day, deterministic. Rare appears in a given cell on
// ~1 day in 3, so "a rare showed up nearby" is a real event, not a constant.
export function spawnsForCell(date, cx, cy) {
  const rand = mulberry32(hashStr(`${date}:${cx}:${cy}`));
  const out = [];
  const types = ['bones', 'bones', 'bones', 'bones', 'coins', 'coins', 'crate'];
  for (let i = 0; i < 3; i++) {
    const type = types[Math.floor(rand() * types.length)];
    out.push({
      id: `${cx}_${cy}_${i}`,
      type,
      lat: (cx + (rand() - 0.5) * 0.92) * CELL_DEG,
      lng: (cy + (rand() - 0.5) * 0.92) * CELL_DEG,
    });
  }
  if (rand() < 0.34) {
    out.push({
      id: `${cx}_${cy}_rare`,
      type: 'rare',
      lat: (cx + (rand() - 0.5) * 0.92) * CELL_DEG,
      lng: (cy + (rand() - 0.5) * 0.92) * CELL_DEG,
    });
  }
  return out;
}

// All spawns in the 3x3 neighborhood, nearest first, annotated with live geometry.
export function spawnsNear(date, lat, lng) {
  const { cx, cy } = cellOf(lat, lng);
  const all = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      all.push(...spawnsForCell(date, cx + dx, cy + dy));
    }
  }
  return all
    .map(s => ({ ...s, dist: distanceM(lat, lng, s.lat, s.lng), bearing: bearingDeg(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 9);
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
