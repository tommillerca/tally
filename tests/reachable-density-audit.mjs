// R4-21: guard the METER, not the deferred shipped spacing decision.
// Dense and sparse CONTROL fields must receive opposite density grades.
// The shared meter also powers reachable-density-model.mjs.
import assert from 'node:assert/strict';
import { COLLECT_RADIUS_M } from '../js/hunt.js';
import { FLOOR, N, START_MINS, point, dense, measure } from './lib/reachable-density.mjs';

function print(label, row) {
  console.log(`${row.green ? 'GREEN' : 'RED'} ${label}: N=${row.n}, median nearest non-far=${row.median.toFixed(2)} m, reachable spawn sightings=${row.total}, score=${row.score.toFixed(3)} spawns/fix against floor=${FLOOR}, fixes with reach=${row.fixesWithReach}/${row.n}, distinct reachable=${row.distinct}`);
}

assert.equal(FLOOR, 1, 'retain the one reachable spawn per fix floor');
assert.equal(COLLECT_RADIUS_M, 75, 'R4-21 leaves the collect radius at 75 m');
const green = measure(() => dense, START_MINS[0]);
print('CONTROL synthetic dense field (20 m spacing)', green);
assert.ok(green.green && green.fixesWithReach === N && green.distinct === dense.length, 'dense CONTROL must be reachable at every fix and meet the floor');
assert.equal(green.total, 722, 'dense CONTROL must count actual sightings');
assert.equal(green.score, 7.220, 'dense CONTROL must divide sightings by fixes');
const sparse = measure(() => [{ id: 'sparse', ...point(400) }], START_MINS[0]);
print('CONTROL synthetic sparse field (one fixed spawn)', sparse);
assert.ok(!sparse.green && sparse.total > 0, 'a few reachable sightings must not satisfy the density floor');
assert.equal(sparse.total, 18, 'sparse CONTROL must count actual sightings');
assert.equal(sparse.score, 0.180, 'sparse CONTROL must divide sightings by fixes');
const empty = measure(() => [], START_MINS[0]);
assert.ok(!empty.green && empty.total === 0 && empty.median === Infinity);
const outside = measure(() => [{ id: 'outside', ...point(-76), dist: 0 }], START_MINS[0]);
assert.ok(!outside.green && outside.total === 0, 'recompute geometry, do not trust cached dist');
const far = measure(() => dense.map(s => ({ ...s, far: true })), START_MINS[0]);
assert.ok(!far.green && far.total === 0, 'far beacons cannot carry reachability');
console.log('PASS CONTROL empty field, outside-radius field and far-only field all grade RED');

console.log('GREEN reachable-density meter guard: dense and sparse controls distinguished; shipped reading is a MODEL.');
