// Run: node tests/pet-C-node-guard.mjs [CHECKOUT] [C1|C2|C3|DPR|ROSTER]
// Default sources resolve relative to this test, never the invoking directory.
// C2 tests the production listener in Node, not browser surfaces.
// C3 replays supplied QA geometry, not new browser measurements.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
const root = resolve(process.argv[2] || fileURLToPath(new URL('..', import.meta.url)));
const only = process.argv[3];
const mod = p => import(pathToFileURL(join(root, p)));
const pets = await mod('js/pets.js');
const art = await mod('data/boneheadz.js');
const app = readFileSync(join(root, 'js/app.js'), 'utf8');
const cut = (start, end) => {
  const a = app.indexOf(start), b = app.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `source seam missing: ${start}`);
  return app.slice(a, b);
};
let failed = 0;
async function row(name, run) {
  if (only && name !== only) return;
  try { console.log(`PASS ${name} ${await run()}`); }
  catch (e) { failed++; console.log(`FAIL ${name} ${e.message}`); }
}
await row('C1', async () => {
  const { cardModel, cardHtml } = await mod('js/paddock-cards.js');
  const level = n => cardModel({ iid: 'copy-2', sp: 'C5', levelSteps: n }).level;
  assert.equal(level(82000), pets.petLevel(82000), `82000 steps: card=${level(82000)}, shared=${pets.petLevel(82000)}`);
  let samples = 0;
  for (const n of [...pets.PET_LEVEL_STEPS.flatMap(t => [t - 1, t, t + 1]), pets.PET_LEVEL_STEPS.at(-1) + 20000, 1e12]) {
    assert.equal(level(n), pets.petLevel(n), `${n} steps`);
    const html = cardHtml(cardModel({ iid: 'copy-2', sp: 'C5', levelSteps: n }));
    assert(html.includes(`pdk-lv">LV ${pets.petLevel(n)}</span>`), `${n} steps: rendered card label`);
    assert(level(n) <= pets.PET_MAX_LEVEL);
    samples++;
  }
  return `82000 steps: card=${level(82000)}, shared=${pets.petLevel(82000)}; ${samples} boundary/cap samples`;
});
await row('C2', async () => {
  const copies = [{ iid: 'one', sp: 'C5', morph: 'base' }, { iid: 'two', sp: 'C5', morph: 'midnight' }];
  let equipped = copies[0], click, rendered, pushed;
  const S = { petMorphs: { C5: 'base' }, shinyPets: new Set(), sounds: false };
  const btn = { dataset: { eq: 'two' }, addEventListener: (event, handler) => { assert.equal(event, 'click'); click = handler; } };
  const ctx = vm.createContext({ ...art, ...pets, S, window: { devicePixelRatio: 2 },
    body: {}, $$: selector => { assert.equal(selector, '[data-eq]'); return [btn]; },
    petInstances: async () => copies, equippedPetInstance: async () => equipped,
    bestInstance: (xs, sp) => xs.find(x => x.sp === sp),
    setEquippedPet: async iid => { equipped = copies.find(x => x.iid === iid); },
    popSound: () => {}, pushProfileSoon: () => { pushed = S.petMorphs.C5; },
    render: () => { rendered = vm.runInContext("petSpriteHtml('C5', 76)", ctx); },
    wearOf: w => w || {}, petWearsFootball: () => false, animatedPetHtml: () => null,
    ANIMATED_PETS: new Set(), petScale: () => 1,
  });
  vm.runInContext('let openIid = null, cfIid = null;\n' +
    cut('async function refreshPetMorphs()', 'async function refreshPetWear()') +
    cut('function croppedPetImg(', '// Pet sprite:') +
    cut('function petSpriteHtml(', 'function petPortraitHtml('), ctx);
  vm.runInContext(cut("    $$('[data-eq]', body).forEach", '    /* THE NICKNAME,'), ctx);
  assert.equal(typeof click, 'function');
  await click();
  assert(rendered.includes('C5__midnight.png'), `after EQUIP, synchronous sprite still draws ${S.petMorphs.C5}; expected midnight`);
  assert.equal(pushed, 'midnight');
  btn.dataset.eq = 'one';
  await click();
  assert(!rendered.includes('/morph/'), 'reverse EQUIP must draw base');
  return 'production EQUIP listener -> cache -> production sprite: midnight then base; browser surfaces unverified';
});
await row('C3', async () => {
  const ctx = vm.createContext({ ...art, window: { devicePixelRatio: 2 }, wearOf: w => w || {} });
  vm.runInContext(cut('function croppedPetImg(', '// Pet sprite:'), ctx);
  const source = dpr => {
    ctx.window.devicePixelRatio = dpr;
    return vm.runInContext("croppedPetImg('C1', 48, false, null, {}, true)", ctx).match(/<img[^>]* src="([^"]+)"/)[1];
  };
  // CONTROL: the existing DPR 2 source tier must survive unchanged.
  assert(source(2).includes('/thumb/384/'), 'DPR 2 must retain the existing C1 tier');
  const baseline = [[393, 852, 0.910], [320, 568, 0.698], [402, 874, 1.405 / 1.5], [430, 932, 1.527 / 1.5], [440, 956, 1.570 / 1.5]];
  const results = [];
  for (const [w, h, ratio2] of baseline) {
    const src = source(3);
    const pngWidth = readFileSync(join(root, src)).readUInt32BE(16);
    const ratio = ratio2 * 384 * 1.5 / pngWidth;
    results.push(`${w}x${h}=${ratio.toFixed(3)}`);
    assert(ratio <= 1.4, `${w}x${h} DPR 3 replay=${ratio.toFixed(3)} > 1.4; source=${src}`);
  }
  return `QA geometry replay at DPR 3: ${results.join(', ')}; decoded browser ratios unverified`;
});
await row('DPR', async () => {
  const { setWidth } = await mod('tests/godmode.js');
  const calls = [];
  const page = { setViewport: async opts => calls.push(opts) };
  await setWidth(page, 402, 874, 3);
  await setWidth(page, 430);
  assert.deepEqual(calls[0], { width: 402, height: 874, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 'explicit DPR 3 must reach the viewport');
  assert.deepEqual(calls[1], { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'legacy callers must retain DPR 2 and both mobile flags');
  return 'setWidth forwards DPR 3; omitted DPR remains 2 with mobile/touch flags';
});
await row('ROSTER', async () => {
  const source = readFileSync(join(root, 'js/paddock.js'), 'utf8');
  const start = source.indexOf('export async function paddockRoster()');
  const end = source.indexOf('/* Eggs for the nest', start);
  assert(start >= 0 && end > start, 'paddockRoster source seam missing');
  const copies = [{ iid: 'one', sp: 'C5', morph: 'midnight' }, { iid: 'future', sp: 'C99' }, { iid: 'founder', sp: 'CX' }];
  const ctx = vm.createContext({ ...pets, BOND_MAX: 5,
    petInstances: async () => copies, petBonds: async () => ({}),
    petLevelBank: async () => ({ one: 182000 }), petNicks: async () => ({}), petWear: async () => ({}),
    assignNames: () => ({}), flavorFor: () => '', motionFor: () => 'walk',
  });
  vm.runInContext(source.slice(start, end).replace('export ', ''), ctx);
  const rows = await vm.runInContext('paddockRoster()', ctx);
  assert.equal(rows.map(r => r.iid).join(','), 'founder,one', 'unknown species must not enter the render roster; CX remains');
  assert.equal(rows.find(r => r.iid === 'one').morph, 'midnight');
  assert.equal(rows.find(r => r.iid === 'one').levelSteps, 182000, 'above-cap bank stays banked');
  return 'known species only; CX, instance morph and above-cap steps preserved';
});
process.exitCode = failed ? 1 : 0;
