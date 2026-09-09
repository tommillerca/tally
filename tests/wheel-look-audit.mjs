/* Frozen fix-wheel-look, 2026-09-09. Node-only production markup/geometry checks.
 * RED on the original wheel: LABELS, RING, PALETTE and PRINT fail.
 * This does not render pixels. Browser and pixel review remain owed.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = process.cwd();
const source = readFileSync(resolve(root, 'js/wheel.js'), 'utf8');
const { pixCur } = await import(pathToFileURL(resolve(root, 'js/icons-pix.js')));
const { bhIconRaw } = await import(pathToFileURL(resolve(root, 'js/icons-pack.js')));
const nodes = [];
const stub = () => ({ classList: { add() {}, remove() {} }, style: {},
  setAttribute() {}, addEventListener() {}, querySelector: () => stub() });
const api = vm.runInNewContext(source.replace(/^import .*;$/gm, '').replace(/^export /gm, '')
  + '\n;({ wheelSvg, wheelIconsHtml, STYLE, PRIZES, showWheel });', {
  pixCur, bhIconRaw, navigator: { webdriver: true }, window: {},
  dateKey: () => '2026-09-09',
  document: { createElement: stub, body: { appendChild: node => nodes.push(node) } },
});
api.showWheel(0, api.PRIZES[0], {}, async () => ({ coinDelta: 30 }), { sounds: false });
const markup = nodes[0].innerHTML;
const svg = api.wheelSvg();
const icons = api.wheelIconsHtml();
const paths = [...svg.matchAll(/<path\b[^>]*fill="([^"]+)"[^>]*>/g)];
const labelGrade = (drawing, html) => {
  assert.doesNotMatch(drawing, /<text\b/, 'prize labels still ride the rotating wheel');
  const wheelEnd = html.indexOf('</div>', html.indexOf('class="dw-wheel"'));
  const keyStart = html.indexOf('class="dw-prizes"');
  assert.ok(keyStart > wheelEnd, 'prize key must be outside the rotating wheel');
  const labels = [...html.matchAll(/class="dw-prize-name">([^<]+)</g)].map(m => m[1]);
  assert.equal(labels.length, api.PRIZES.length, 'one fixed name per prize');
  assert.deepEqual(labels, Array.from(api.PRIZES, p => p.name));
};
let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); }
}
check('CONTROL the label grader rejects text riding a wheel', () => {
  assert.throws(() => labelGrade('<svg><text>Bone</text></svg>', markup), /still ride/);
});
check('SAMPLE production draws all seven prizes and assets exist', () => {
  assert.equal(api.PRIZES.length, 7);
  assert.equal(paths.length, api.PRIZES.length);
  const imgs = [...icons.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>/g)];
  assert.equal(imgs.length, api.PRIZES.length);
  for (const [tag, src] of imgs) {
    assert.ok(existsSync(resolve(root, src)), `missing ${src}`);
    assert.match(tag, /width="48"/);
    assert.match(tag, /height="48"/);
  }
});
check('LABELS all prize names stay outside the spinning wheel', () => labelGrade(svg, markup));
check('RING all seven icon centres share one radius', () => {
  const slots = [...icons.matchAll(/class="dw-ico" style="([^"]+)"/g)];
  assert.equal(slots.length, api.PRIZES.length);
  const radii = slots.map(([, style]) => {
    const x = Number(/left:([\d.]+)%/.exec(style)?.[1]);
    const y = Number(/(?:top|--dwt):([\d.]+)%/.exec(style)?.[1]);
    return Math.hypot(x - 50, y - 50);
  });
  assert.ok(radii.every(r => Number.isFinite(r) && r > 20 && r < 40));
  assert.ok(Math.max(...radii) - Math.min(...radii) < .03,
    `radii differ: ${radii.map(r => r.toFixed(2)).join(', ')}`);
  assert.doesNotMatch(api.STYLE, /\.dw-flip/);
});
check('PALETTE coins, crates and supplies each have a consistent spot colour', () => {
  const fills = paths.map(p => p[1]);
  assert.equal(fills[0], '#E2AB36');
  assert.equal(fills[4], fills[0]); assert.equal(fills[5], fills[0]);
  assert.equal(fills[1], '#F0EDD6'); assert.equal(fills[3], fills[1]);
  assert.equal(fills[2], '#2A2D28'); assert.equal(fills[6], fills[2]);
});
check('PRINT panel, rim and button use ink borders and hard shadows', () => {
  assert.match(api.STYLE, /border:2px solid #2A2D28/, 'missing 2px ink border');
  assert.match(api.STYLE, /box-shadow:4px 5px 0 #2A2D28/, 'missing hard offset shadow');
  assert.match(svg, /stroke="#2A2D28"/);
  assert.doesNotMatch(api.STYLE, /blur\(|dwWisp|dwFlicker/);
});
console.log(`wheel-look: ${6 - failures}/6 passed`);
process.exitCode = failures ? 1 : 0;
