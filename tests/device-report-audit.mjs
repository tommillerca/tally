import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as production from '../js/device-report.js';

const manifest = JSON.parse(readFileSync(new URL('../native/capabilities.json', import.meta.url), 'utf8'));
export const PURE = [
  ['known-gap lookup', m => {
    assert.ok(manifest.plugins.length > 0, 'empty capability sample');
    assert.equal(m.knownGap(manifest, 'Haptics'), true);
    for (const id of ['App', 'Health', 'BhVault', 'LocalNotifications', 'Unknown']) assert.equal(m.knownGap(manifest, id), false);
    assert.equal(m.knownGap(null, 'Haptics'), false);
    assert.equal(m.knownGap({ plugins: [{ id: 'App', known_gap: 'deliberate' }] }, 'App'), true);
  }, 'return !!manifest?.plugins?.find(p => p.id === id && p.known_gap);', 'return false;'],
  ['three-state classifier', m => {
    assert.equal(m.classifyPlugin('Haptics', false, '', true).state, 'missing (declared known gap)');
    assert.equal(m.classifyPlugin('App', false).state, 'missing');
    assert.equal(m.classifyPlugin('App', true).state, 'registered');
    assert.equal(m.classifyPlugin('Health', true, ':auth-not-probed').state, 'registered');
    assert.equal(m.classifyPlugin('Haptics', true).state, 'no readback');
    assert.equal(m.classifyPlugin('BhVault', true, ':probe-failed').state, 'no readback');
    assert.equal(m.classifyPlugin('LocalNotifications', true, ':granted').state, 'permitted');
    for (const value of [':denied', ':prompt', ':?', '']) assert.equal(m.classifyPlugin('LocalNotifications', true, value).state, 'registered');
    for (const value of [':has-key', ':empty', ':unreadable']) {
      assert.equal(m.classifyPlugin('BhVault', true, value).value, value.slice(1));
      assert.equal(m.classifyPlugin('BhVault', true, value).state, 'registered');
    }
  }, "if (id === 'Haptics')", "if (false)"],
  ['safe-area arithmetic', m => {
    assert.deepEqual(m.safeAreaMath(47, 34, 844, 800), { top: 47, bottom: 34, dockBottom: 800, safeBottom: 810, clearance: 10 });
    assert.equal(m.safeAreaMath(0, 34, 844, 844).clearance, -34);
    assert.equal(m.safeAreaMath(0, 0, 600, 600).clearance, 0);
    assert.equal(m.safeAreaMath(47.5, 33.5, 844, 810).clearance, 0.5);
    assert.equal(m.safeAreaMath(0, 0, 600, undefined), null);
    assert.equal(m.safeAreaMath(NaN, 0, 600, 600), null);
  }, 'clearance: viewportBottom - bottom - dockBottom', 'clearance: viewportBottom - dockBottom'],
  ['plain-text serialization', m => {
    const rows = [
      { name: 'Safe area', state: 'measured', value: 'top 47px; bottom 34px' },
      { name: 'Haptics', state: 'missing (declared known gap)', value: 'no bridge object' },
      { name: 'Resume', state: 'not yet observed', value: 'pauses 0; resumes 0' },
      { name: 'Ring/silent switch', state: 'needs a person', value: 'No supported readback.' },
    ];
    assert.equal(m.reportText(rows), 'Device report\nSafe area: measured | top 47px; bottom 34px\nHaptics: missing (declared known gap) | no bridge object\nResume: not yet observed | pauses 0; resumes 0\nRing/silent switch: needs a person | No supported readback.');
    assert.throws(() => m.reportText([]), /no observations/);
  }, 'rows.map(r =>', 'rows.slice(0, 1).map(r =>'],
];

export async function runDeviceGuards(proveRed = false) {
  assert.equal(PURE.length, 4);
  const source = readFileSync(new URL('../js/device-report.js', import.meta.url), 'utf8');
  for (const [name, guard, before, after] of PURE) {
    if (proveRed) {
      assert.ok(source.includes(before), `mutation target missing: ${name}`);
      const mutant = await import('data:text/javascript;base64,' + Buffer.from(source.replace(before, after)).toString('base64'));
      let failure;
      try { guard(mutant); } catch (error) { failure = error; }
      assert.ok(failure instanceof assert.AssertionError, `mutant survived: ${name}`);
      console.log(`RED ${name}: ${failure.message}`);
    }
    guard(production);
    console.log(`GREEN ${name}`);
  }
  console.log('Device report: 4 passed, 0 failed');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await runDeviceGuards(process.argv.includes('--prove-red'));
