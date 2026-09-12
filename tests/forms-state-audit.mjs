// PURE: production binders and rendered strings over DOM doubles, no browser or network.
// --main reads the baseline from this checkout's git object database without editing it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ftInToCm, cmToFtIn, lbToKg, kgToLb } from '../js/nutrition.js';
const source = process.argv.includes('--main')
  ? execFileSync('git', ['show', 'main:js/app.js'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  : readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function cut(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Production slice missing: ${start}`);
  return source.slice(a, b);
}
function run(code, deps) { return new AsyncFunction(...Object.keys(deps), code)(...Object.values(deps)); }
function dom() {
  const nodes = new Map();
  const $ = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', hidden: false, checked: false,
      classList: { add() {}, remove() {}, toggle() {} }, scrollIntoView() {},
      addEventListener(type, fn) { this[type] = fn; } });
    return nodes.get(id);
  };
  return { $, $$: selector => selector.includes(',') ? selector.split(',').map($) : [] };
}
let passed = 0, failed = 0;
async function test(row, fn) {
  try { await fn(); passed++; console.log(`PASS ${row}`); }
  catch (e) { failed++; console.log(`FAIL ${row}: ${e.message}`); }
}
await test('HEIGHT', async () => {
  const errors = [];
  for (const units of ['lb', 'kg']) {
    const d = dom(), $ = d.$;
    for (const [id, value] of Object.entries({ pfAge: '30', pfFt: '5', pfIn: '10', pfCm: '178', pfW: '80' })) $('#' + id).value = value;
    const get = await run(cut('function profileProblem(np)', '\nfunction openProfileSheet()') + '\nreturn bindProfileForm({}, {units}, null);', {
      ...d, units, num: v => v === '' ? null : Number(v),
      ftInToCm, cmToFtIn, lbToKg, kgToLb,
      LIMITS: { age: { min: 1, max: 120 }, heightCm: { min: 50, max: 250 }, weightLb: { min: 1, max: 1000 }, weightKg: { min: 1, max: 500 } },
      GOALS: [], computeTargets: () => ({ kcal: 2000, p: 100, c: 200, f: 60, tdee: 2000 }), TARGET_DISCLOSURE: ''
    });
    const target = $(units === 'lb' ? '#pfKg' : '#pfLb');
    target.click({ target });
    assert.ok(Math.abs(get().heightCm - 178) < 1, 'nonblank conversion control');
    const back = $(units === 'lb' ? '#pfLb' : '#pfKg'); back.click({ target: back });
    if (units === 'lb') { $('#pfFt').value = ''; $('#pfIn').value = ''; } else $('#pfCm').value = '';
    target.click({ target });
    try {
      assert.equal(get().heightCm, null);
      for (const id of units === 'lb' ? ['#pfCm'] : ['#pfFt', '#pfIn']) assert.equal($(id).value, '');
      assert.match($('#pfPreview').textContent, /Fill in height/);
    } catch (e) { errors.push(`${units}: ${e.message}`); }
  }
  assert.equal(errors.join('; '), '');
});
await test('LUCKY', async () => {
  const d = dom(), calls = [];
  await run(cut('async function openNameBuilder(after)', '\n// Preset cheers:') + '\nawait openNameBuilder(null);', {
    ...d, social: { socialMe: async () => null, setName: async (...args) => { calls.push(args); return calls.length === 1 ? { reason: 'taken', suggestNum: 7, name: 'Bones' } : { ok: false }; } },
    parseDisplayName: () => null, kvGet: async () => ({ adj: 0, noun: 0, num: null }), randomName: () => ({}),
    NAME_ADJ: [], NAME_NOUN: [], esc: s => s, openSheet: () => ({}), document: { activeElement: null },
    buildDisplayName: (a, n, num) => `Bones${num == null ? '' : '#' + num}`, toast() {}
  });
  assert.equal(d.$('#nbNumOn').checked, false);
  assert.equal(d.$('#nbNumVal').hidden, true);
  await d.$('#nbSave').click();
  await d.$('#nbSave').click();
  assert.deepEqual(calls.map(c => c[2]), [null, 7]);
  assert.equal(d.$('#nbPreview').textContent, 'Bones#7');
  assert.equal(d.$('#nbNumVal').value, '7');
  assert.equal(d.$('#nbNumOn').checked, true);
  assert.equal(d.$('#nbNumVal').hidden, false);
});
const recovery = cut('async function openRecoverySheet()', '\n/* One toast for everything');
async function recoveryHarness(upgrading = false) {
  const d = dom(), pending = [], timers = new Map(), messages = []; let html = '', serial = 0;
  await run(recovery + '\nawait openRecoverySheet();', {
    ...d, social: { myRecoveryId: async () => '', hasRecoveryPhrase: async () => upgrading,
      recoveryIdProblem: v => v === '!' ? 'Invalid ID' : null, phraseProblem: () => null,
      recoveryIdAvailable: v => new Promise(resolve => pending.push({ v, resolve })),
      setRecoveryPhrase: async () => ({ ok: true, recoveryId: 'bones' }) },
    openSheet: s => { html = s; return {}; }, esc: s => s,
    setTimeout: fn => { timers.set(++serial, fn); return serial; }, clearTimeout: id => timers.delete(id),
    S: { sounds: false }, levelSound() {}, closeAllSheetsViaHistory() {}, refresh() {}, toast: s => messages.push(s)
  });
  return { ...d, pending, messages, html, edit(value) { d.$('#rcId').value = value; d.$('#rcId').input(); },
    fire() { const [id, fn] = [...timers][0]; timers.delete(id); return fn(); } };
}
await test('RACE', async () => {
  const errors = [];
  for (const next of ['bravo', '', '!']) {
    const h = await recoveryHarness(); h.edit('alpha'); const a = h.fire();
    h.edit(next);
    if (next === 'bravo') { const b = h.fire(); h.pending[1].resolve({ ok: true, available: true }); await b; }
    const expected = next === 'bravo' ? '"bravo" is free.' : next === '' ? '' : 'Invalid ID';
    assert.equal(h.$('#rcIdState').textContent, expected, 'new input control');
    h.pending[0].resolve({ ok: true, available: false }); await a;
    if (h.$('#rcIdState').textContent !== expected) errors.push(`${next || 'empty'} overwritten`);
  }
  assert.deepEqual(errors, []);
});
await test('COPY', async () => {
  for (const upgrade of [false, true]) {
    const h = await recoveryHarness(upgrade);
    assert.match(h.html, /ID and (?:your )?phrase.*unlock.*account/);
    assert.match(h.html, /[Rr]ecovering progress also needs a successful cloud backup/);
    assert.doesNotMatch(h.html, /bring your Bonehead back on any phone|ID is all you need/);
    if (upgrade) assert.ok(h.html.includes('Use this ID and your phrase instead of your friend code.'));
    h.$('#rcId').value = 'bones'; h.$('#rcPhrase').value = h.$('#rcPhrase2').value = 'secret words';
    await h.$('#rcSave').click();
    assert.match(h.messages[0], /unlock.*account/);
    assert.match(h.messages[0], /[Rr]ecovering progress also needs a successful cloud backup/);
    assert.doesNotMatch(h.messages[0], /Restore anywhere/);
  }
});
console.log(`forms-state: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
