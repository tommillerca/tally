// Exercise the shipped seat function with measured regression geometry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('function seatToast(t) {'), source.indexOf('let toastTimer = 0;'));
function seat(rects, height = 65, vh = 812) {
  let y;
  const controls = rects.map(([top, h, width = 320]) => ({
    parentElement: null, closest: () => null, contains(hit) { return hit === this; },
    getBoundingClientRect: () => ({ top, bottom: top + h, left: 20, right: 20 + width, width, height: h }),
  }));
  const t = { contains: () => false, offsetHeight: height, dataset: {}, style: { setProperty: (_, value) => { y = value.includes('100vh') ? vh - 12 : value.includes('--sat') ? 12 : parseFloat(value); } }, getBoundingClientRect: () => ({ left: 26, right: 349 }) };
  vm.runInNewContext(fn + '\nseatToast(t)', { t, innerWidth: 375, innerHeight: vh,
    document: { documentElement: {}, querySelectorAll: () => controls, elementFromPoint: (x, y) => controls.find(c => { const r = c.getBoundingClientRect(); return y >= r.top && y <= r.bottom; }) },
    getComputedStyle: () => ({ top: `${y}px`, visibility: 'visible', display: 'block', opacity: '1', getPropertyValue: () => '0px' }),
  });
  return { y, clear: t.dataset.seatClear };
}
assert.equal(seat([]).y, 812 - 96 - 65);
// The bottom row blocks the default; Gwart blocks the old 110px choice.
assert.deepEqual(seat([[0, 163], [620, 100]]), { y: 175, clear: 'true' });
// Fight Flee plus a full move tray leaves a gap between header and tray.
assert.deepEqual(seat([[0, 154], [400, 210]], 105, 667), { y: 166, clear: 'true' });
// Large stages alone do not make CLEAR impossible.
assert.equal(seat([[53, 480, 480]]).clear, 'true');
// Covering a meaningful share of a larger control must still count.
assert.equal(seat([[0, 812]], 300).clear, 'false');
console.log('PASS toast-seat: default, Gwart, fight, stage, impossible surface');
