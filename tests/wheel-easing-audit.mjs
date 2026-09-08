/* w1, Tom, 2026-09-08: "Smooth it out." No wheel easing control point above 1.
 * Source-only guard. Browser motion and visual feel are unverified.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function grade(source) {
  const curves = [...source.matchAll(/cubic-bezier\s*\(([^)]*)\)/gi)];
  assert.ok(curves.length > 0, 'No easing curves found in js/wheel.js');
  for (const [curve, args] of curves) {
    const points = args.split(',').map(value => value.trim());
    assert.equal(points.length, 4, `Expected four coordinates: ${curve}`);
    for (const point of points) {
      assert.ok(point !== '' && Number.isFinite(Number(point)), `Invalid coordinate: ${curve}`);
      assert.ok(Number(point) <= 1, `Control point above 1: ${curve}`);
    }
  }
  return curves.length;
}

assert.throws(() => grade('cubic-bezier(.34,1.6,.64,1)'),
  { name: 'AssertionError', message: /Control point above 1/ });
console.log('PASS CONTROL pre-fix cubic-bezier(.34,1.6,.64,1) is rejected');

const source = readFileSync(new URL('../js/wheel.js', import.meta.url), 'utf8');
try {
  const count = grade(source);
  console.log(`PASS js/wheel.js: ${count} easing curves, no control point above 1`);
} catch (error) {
  console.error(`FAIL js/wheel.js: ${error.message}`);
  process.exitCode = 1;
}
