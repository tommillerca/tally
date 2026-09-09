// R4-21: a balance MODEL, not a release guard. Reports findings, asserts nothing.
import { spawnsForRoute, COLLECT_RADIUS_M } from '../js/hunt.js';
import { FLOOR, DATE, N, LENGTH_M, DURATION_MIN, START, START_MINS, route, point, dense, measure } from './lib/reachable-density.mjs';

function print(label, row) {
  console.log(`${row.green ? 'GREEN' : 'RED'} ${label}: N=${row.n}, median nearest non-far=${row.median.toFixed(2)} m, reachable spawn sightings=${row.total}, score=${row.score.toFixed(3)} spawns/fix against floor=${FLOOR}, fixes with reach=${row.fixesWithReach}/${row.n}, distinct reachable=${row.distinct}`);
}

console.log(`ROUTE: date=${DATE}, start=${JSON.stringify(START)}, end=${JSON.stringify(route.at(-1))}, northbound ${LENGTH_M} m over ${DURATION_MIN} min; N=${N} fixes/window, step=${(LENGTH_M / (N - 1)).toFixed(3)} m, start minutes=${START_MINS.join(',')}, collect radius=${COLLECT_RADIUS_M} m`);
console.log(`FLOOR: mean >= ${FLOOR} reachable spawn/fix; one nearby target at an ordinary sampled point. Sightings are not collections. Producer geometry only, before snap/render.`);

print('CONTROL synthetic dense field (20 m spacing)', measure(() => dense, START_MINS[0]));
print('CONTROL synthetic sparse field (one fixed spawn)', measure(() => [{ id: 'sparse', ...point(400) }], START_MINS[0]));
const rows = START_MINS.map(mins => {
  const row = measure(spawnsForRoute, mins);
  print(`SHIPPED window start=${mins} min`, row);
  return row;
});
const score = rows.reduce((sum, row) => sum + row.total, 0) / (N * rows.length);
// Every window must meet the floor. A lucky window cannot mask a dead walk.
const pass = rows.every(row => row.green);
console.log(`${pass ? 'GREEN' : 'RED'} SHIPPED density: N=${N * rows.length}, aggregate score=${score.toFixed(3)} against floor=${FLOOR} spawns/fix in EACH window; ${rows.filter(row => row.green).length}/${rows.length} windows meet floor`);
console.log(`FINDING, not a failure: shipped score=${score.toFixed(3)} spawns/fix; floor=${FLOOR}; N=${N * rows.length}; gap=${(FLOOR - score).toFixed(3)} spawns/fix below floor. Spacing decision DEFERRED by product owner Tom. MODEL asserts nothing about the app.`);
