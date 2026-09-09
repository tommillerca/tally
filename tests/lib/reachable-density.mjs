// Shared deterministic density meter and fixtures; no release assertions.
import { distanceM, COLLECT_RADIUS_M } from '../../js/hunt.js';

const FLOOR = 1;
const DATE = '2026-09-09';
const N = 100;
const LENGTH_M = 800;
const DURATION_MIN = 10;
const START = { lat: 49.2490, lng: -123.1000 };
const START_MINS = [540, 585, 630, 675];
// Main/Kingsway area: a straight northbound synthetic corridor on land,
// sampled INCLUDING both endpoints. This is not a walkability or road-snap test.
const point = metres => ({ lat: START.lat + metres / 6371000 * 180 / Math.PI, lng: START.lng });
const route = Array.from({ length: N }, (_, i) => point(LENGTH_M * i / (N - 1)));

function measure(provider, startMins) {
  const counts = [], nearest = [], distinct = new Set();
  for (const [i, fix] of route.entries()) {
    const spawns = provider(DATE, fix.lat, fix.lng, startMins + DURATION_MIN * i / (N - 1));
    const distances = spawns.filter(s => !s.far).map(s => ({
      id: s.id, distance: distanceM(fix.lat, fix.lng, s.lat, s.lng),
    }));
    const reachable = distances.filter(s => s.distance <= COLLECT_RADIUS_M);
    counts.push(reachable.length);
    nearest.push(Math.min(...distances.map(s => s.distance)));
    for (const s of reachable) distinct.add(s.id);
  }
  nearest.sort((a, b) => a - b);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const score = total / counts.length;
  return { n: counts.length, total, score, green: score >= FLOOR,
    fixesWithReach: counts.filter(n => n > 0).length, distinct: distinct.size,
    median: (nearest[N / 2 - 1] + nearest[N / 2]) / 2 };
}

// Fixed spatial CONTROL fields, never teleported to the sampled fix.
const dense = Array.from({ length: 41 }, (_, i) => ({ id: `dense-${i}`, ...point(i * 20) }));
export { FLOOR, DATE, N, LENGTH_M, DURATION_MIN, START, START_MINS, route, point, dense, measure };
