// The Bone Road: your lifetime synced steps walk the Bonehead down Cam's
// quest map. Stops pay chests; finishing the road starts the next cycle.
// Pure derivation: lifetime steps come from the health store, claims are
// idempotent ledger keys `road-<cycle>-<stopIdx>`. Nothing else is stored.

import { db } from './db.js';
import { award } from './game.js';
import { coinsAdd, grantCrate } from './loot.js';

// Stop positions are percentages measured on assets/brand/quest-map.png.
export const ROAD_STOPS = [
  { n: 'I',   x: 27, y: 3.5,  steps: 20000,  reward: { crate: 'daily', xp: 40 } },
  { n: 'II',  x: 68, y: 28,   steps: 50000,  reward: { coins: 120, xp: 40 } },
  { n: 'III', x: 22, y: 47.5, steps: 90000,  reward: { crate: 'golden', xp: 60 } },
  { n: 'IV',  x: 82, y: 58.5, steps: 140000, reward: { crate: 'egg', coins: 150, xp: 60 } },
  { n: 'V',   x: 55, y: 78,   steps: 200000, reward: { crate: 'golden', xp: 60 } },
  { n: 'VI',  x: 11, y: 86.5, steps: 270000, reward: { coins: 250, crate: 'daily', xp: 60 } },
  { n: 'X',   x: 11, y: 93.5, steps: 350000, reward: { crate: 'golden', coins: 200, xp: 100 } },
];
export const CYCLE_STEPS = ROAD_STOPS[ROAD_STOPS.length - 1].steps;
const START = { x: 27, y: 0.5 }; // road head, just above stop I

export async function lifetimeSteps() {
  const rows = await db.all('health');
  return rows.reduce((a, r) => a + (r.steps || 0), 0);
}

export function roadKey(cycle, idx) { return `road-${cycle}-${idx}`; }

// state from lifetime steps + the set of claimed ledger keys
export function roadState(lifetime, claimedKeys) {
  let cycle = 1;
  while (claimedKeys.has(roadKey(cycle, ROAD_STOPS.length - 1))) cycle++;
  const progress = Math.max(0, lifetime - (cycle - 1) * CYCLE_STEPS);
  const stops = ROAD_STOPS.map((s, i) => ({
    ...s, idx: i,
    reached: progress >= s.steps,
    claimed: claimedKeys.has(roadKey(cycle, i)),
  }));
  const next = stops.find(s => !s.reached) || null;
  return { cycle, progress, stops, next, done: !next };
}

// traveler position: interpolate along the stop chain by step progress
export function travelerPos(progress) {
  const pts = [{ ...START, steps: 0 }, ...ROAD_STOPS];
  const p = Math.max(0, Math.min(progress, CYCLE_STEPS));
  for (let i = 1; i < pts.length; i++) {
    if (p <= pts[i].steps) {
      const a = pts[i - 1], b = pts[i];
      const t = (p - a.steps) / (b.steps - a.steps || 1);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
}

export function rewardLabel(r) {
  const bits = [];
  if (r.crate) bits.push(r.crate === 'golden' ? 'Golden Crate' : r.crate === 'egg' ? 'Step Egg' : 'Daily Crate');
  if (r.coins) bits.push(`${r.coins} coins`);
  if (r.xp) bits.push(`${r.xp} XP`);
  return bits.join(' + ');
}

export async function claimStop(cycle, idx) {
  const stop = ROAD_STOPS[idx];
  if (!stop) return null;
  const r = stop.reward;
  const xp = await award(roadKey(cycle, idx), 'road', r.xp || 40, `Bone Road: stop ${stop.n}`);
  if (!xp) return null;
  if (r.coins) await coinsAdd(r.coins);
  if (r.crate) await grantCrate(r.crate, 'bone-road');
  return { xp, ...r };
}
