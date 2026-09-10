/* Frozen R8 source contracts. These are NOT rendered contrast or visibility
 * proof. The companion browser audit samples screenshots on the real Shop.
 * Run --css /path/to/baseline.css to reproduce source RED without editing it.
 * CONTROL mutations remove the short-wallet and disabled-ghost selectors.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cssDeclarations } from './lib/css-declarations.mjs';

const override = process.argv.indexOf('--css');
const source = readFileSync(override < 0 ? new URL('../app.css', import.meta.url) : process.argv[override + 1], 'utf8');
const rows = cssDeclarations(source);
const declarations = (selector, input = rows) => Object.fromEntries(input
  .filter(r => r.context.split(',').map(s => s.trim()).includes(selector))
  .map(r => [r.property, r.value]));
let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function shortTreatment(input) {
  const short = declarations('.t3-price[data-short="1"]', input);
  const cant = declarations('.rk-buy .t3-price.cant', input);
  for (const p of ['background', 'color', 'border-color', 'box-shadow']) {
    assert.ok(cant[p], `CONTROL .cant has ${p}`);
    assert.equal(short[p], cant[p], `data-short must share .cant ${p}`);
  }
}
function disabledTreatment(input) {
  const disabled = declarations('.btn.ghost:disabled', input);
  assert.equal(disabled.color, 'var(--text-3)');
  assert.equal(disabled['box-shadow'], 'var(--sh-sm)');
  assert.notEqual(disabled.color, declarations('.btn.ghost', input).color);
}
check('CONTROL affordable price defines filled gold with ink digits and violet dust', () => {
  assert.equal(declarations('.t3-price').background, 'var(--gold)');
  assert.equal(declarations('.t3-price').color, 'var(--ink)');
  assert.equal(declarations('.t3-price.dust').background, 'var(--violet)');
});
check('AFFORDABLE shared rack sizing cannot override price fill or digit ink', () => {
  const shared = declarations('.rk-buy > button');
  assert.equal(shared['min-height'], '44px', 'CONTROL rack target size retained');
  for (const p of ['background', 'background-color', 'color', 'border']) {
    assert.equal(shared[p], undefined, `shared rack ${p} overrides the price treatment`);
  }
});
check('CANT hollow prices retain currency-colored digits', () => {
  assert.equal(declarations('.rk-buy .t3-price.cant').background, 'transparent');
  assert.equal(declarations('.rk-buy .t3-price.cant').color, 'var(--gold)');
  assert.equal(declarations('.rk-buy .t3-price.dust.cant').color, 'var(--violet)');
});
check('SHORT pet prices share the hollow .cant treatment', () => shortTreatment(rows));
check('GHOST disabled treatment outranks the enabled two-class selector', () => disabledTreatment(rows));
check('CONTROL removing data-short styling is rejected', () => {
  const mutant = cssDeclarations(source.replaceAll('.t3-price[data-short="1"]', '.r8-removed-short'));
  assert.throws(() => shortTreatment(mutant));
});
check('CONTROL removing disabled ghost styling is rejected', () => {
  const mutant = cssDeclarations(source.replaceAll('.btn.ghost:disabled', '.r8-removed-disabled'));
  assert.throws(() => disabledTreatment(mutant));
});
console.log(`R8 Shop CSS source: ${passed} passed, ${failed} failed. Render proof is separate.`);
process.exitCode = failed ? 1 : 0;
