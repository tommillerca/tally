/* R2: production copy expressions and destroy controls executed in Node.
 * DOM doubles do not prove layout, hit targets, pixels or browser timing.
 * CONTROL uses zero/partial/full grids and a real, persisted duplicate salvage.
 * Prove red: restore the pre-R2 app.js and loot.js in a throwaway copy, run this
 * audit, then restore the fixed files and run again. See r2-proof.md.
 */
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as loot from '../js/loot.js';
import * as pets from '../js/pets.js';
import { BH_BY_ID, PET_SHOP } from '../data/boneheadz.js';
import { db, kvSet, useDbName } from '../js/db.js';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const deps = { ...loot, ...pets, BH_BY_ID, PET_SHOP, esc,
  petPortraitHtml: () => '<img>', petSpriteHtml: () => '<img>', sparkIco: () => '*',
  ICONS: { dust: () => 'dust', close: () => 'close', lock: () => 'lock' } };
function cut(start, end) {
  const a = app.indexOf(start), b = app.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `CONTROL missing production block: ${start}`);
  return app.slice(a, b);
}
function run(code, args = {}) {
  const all = { ...deps, ...args };
  const disclosure = cut('// PET DESTRUCTION UI PURE BEGIN', '// PET DESTRUCTION UI PURE END');
  return new AsyncFunction(...Object.keys(all), disclosure + '\n' + code)(...Object.values(all));
}
let passed = 0, failed = 0, sequence = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
const frost = { iid: 'frost', sp: 'C1', morph: 'frost', shiny: false, lineage: 0 };
const ember = { ...frost, iid: 'ember', morph: 'ember' };
const duplicate = { ...frost, iid: 'duplicate' };
const bank = { frost: 105000, ember: 0, duplicate: 0 };
const selection = { bySp: { C1: [frost, ember] }, byBest: () => 0,
  nicks: { frost: '<Snow>' }, bank, eqIid: frost.iid, sel: [],
  roster: [frost], focusIdx: 0, focused: frost, nickTag: () => '', cfDots: '' };

await test('CONTROL naming follows rendered morph, base, shiny and CX identity', () => {
  assert.equal(loot.petInstanceName(frost, 105000), 'Frost Drizzle · Lv 10');
  assert.equal(loot.petColourName({ ...frost, morph: undefined }), 'Base');
  // 2026-09-08 finding 9: unknown saved colours must not impersonate Base.
  assert.equal(loot.petColourName({ ...frost, morph: 'future' }), 'Unsupported colour (future)');
  assert.equal(loot.petColourName({ ...frost, shiny: true }), 'Shiny');
  assert.equal(loot.petColourName({ ...frost, sp: 'CX' }), 'Base');
});
await test('R44-14 copy chips name both colours even with a nickname', async () => {
  const html = await run(cut('    const kinChips =', '    const focusIdx =') + '\nreturn kinChips(focused);', selection);
  assert(html.includes('Frost · Lv 10'), 'copy chip omitted Frost · Lv 10');
  assert(html.includes('Ember · Lv 1'), 'copy chip omitted Ember · Lv 1');
  assert(html.includes('&lt;Snow>'), 'nickname must stay escaped');
});
await test('R44-14 card chip and initial caption name the displayed colour', async () => {
  const html = await run(cut('    const cfCards =', '    const cfDots =') + '\nreturn cfCards;', selection);
  assert.match(html, /class="cf-chip"[^>]*>Frost<\/span>/, 'card has no Frost chip');
  assert.equal((html.match(/class="cf-chip"/g) || []).length, 1, 'one colour chip replaces the old rarity/colour pair');
  assert.doesNotMatch(html, /\b(?:common|uncommon|rare|epic|legendary)\b/i, 'pet card must not claim a rarity');
  const caption = await run(cut('    const cfCaption =', '    const cfActs =') + '\nreturn cfCaption;', { ...selection, kinChips: () => '' });
  assert(caption.includes('Frost Drizzle'), 'initial caption loses colour');
});
await test('R44-14 carousel repaint preserves the new focused colour', async () => {
  const nodes = { b: {}, '.role': {}, '.cf-meta': {} };
  const code = cut('    function repaintFocus() {', '      const isEq = inst.iid === eqIid, inSel =');
  await run(code + '\n}\nrepaintFocus();', { ...selection, cfIid: frost.iid, body: {},
    $: selector => selector === '.cf-cap' ? {} : nodes[selector] });
  assert(nodes.b.innerHTML.includes('Frost Drizzle'), 'repaint omitted Frost');
});
await test('R44-14 breed picker and irreversible facts name colour and level', async () => {
  const html = await run(cut('    const spChips =', '    // Count owned colour cells,') + '\nreturn spChips;',
    { ...selection, pair: true, a: frost, b: ember, offSp: frost.iid });
  assert(html.includes('Frost Drizzle'), 'nicknamed keeper lost colour/species');
  assert(html.includes('Ember Drizzle'), 'spare lost colour/species');
  const facts = cut('          <ul class="breed-facts">', '          ${spareIsPrecious ?');
  const rendered = await run('return `' + facts + '`;', { keeper: frost, spare: ember, insts: [frost, ember], bank, offLineage: 1 });
  assert(rendered.includes('Frost Drizzle · Lv 10'), 'keeper facts omit colour/level');
  assert(rendered.includes('Ember Drizzle · Lv 1'), 'destroy facts omit colour/level');
  const button = app.match(/<button class="btn" id="doBreed"[^\n]+/)[0];
  assert((await run('return `' + button + '`;', { spare: ember, bank, canBreedNow: true })).includes('Ember Drizzle · Lv 1'));
});
await test('R44-14 armed breeding button and toast keep the spare identity', async () => {
  // A duplicate exercises the quick path. A last colour now requires typing,
  // covered by breed-last-colour-audit (frozen work order, 2026-09-08).
  const roster = [frost, ember, {...ember, iid:'ember-spare'}];
  useDbName(`kennel-breed-${++sequence}`);
  for (const [key,value] of Object.entries({petInst:roster, petLvlV:2, petLvlSteps:bank,
    pettalents:{__iidV:2}, petStepCredit:0, petEquipped:null})) await kvSet(key,value);
  const events = {}, messages = [];
  const btn = { dataset: {}, textContent: 'Feed in', classList: { add() {} },
    addEventListener: (name, fn) => { events[name] = fn; } };
  await run(cut("    $('#doBreed', body)?.addEventListener", "    $$('[data-petpick2]'"), {
    $: () => btn, body: {}, insts: [frost, ember], sel: ['frost', 'ember'], offSp: 'frost', bank,
    toast: message => messages.push(message), setTimeout: () => {} });
  await events.click({ currentTarget: btn });
  assert(btn.textContent.includes('Ember Drizzle · Lv 1'), 'armed breed button omitted colour/level');
  assert(messages.some(m => m.includes('Ember Drizzle · Lv 1 is destroyed for good')), 'breed toast omitted colour/level');
});
await test('R44-16 true duplicate reveal keeps Frost Drizzle', async () => {
  const html = await run(cut('  const hatchName =', '  const wrap2 = openSheet(') + '\nreturn revealHtml;',
    { item: BH_BY_ID.C1, res: { morph: 'frost', dupe: true, shiny: false } });
  assert(html.includes('ANOTHER ONE!'), 'duplicate headline was lost');
  assert(html.includes('Frost Drizzle'), 'ANOTHER ONE names only Drizzle');
});

const destroyCode = cut("    $$('[data-destroy]', body).forEach", "    $$('[data-offsp]'");
// Each case isolates its stated investment. Equipped pets now require typing
// independently, covered by r3-rest-audit. Plain duplicates here are unequipped.
async function destroyHarness(instances, steps = {}, iid = instances[0].iid) {
  useDbName(`kennel-copy-${++sequence}`);
  for (const [key, value] of Object.entries({ petInst: instances, petLvlV: 2, petLvlSteps: steps,
    petStepCredit: 0, petEquipped: null, equipped: {} })) await kvSet(key, value);
  for (const sp of new Set(instances.map(x => x.sp))) await db.put('inv', { id: `cos-${sp}`, kind: 'cos', itemId: sp });
  const events = {}, inputEvents = {}, goEvents = {}, toasts = [], sheets = [], timers = [];
  const btn = { dataset: { destroy: iid, dust: '60' }, innerHTML: 'DESTROY 60', isConnected: true,
    addEventListener: (name, fn) => { events[name] = fn; } };
  const input = { value: '', addEventListener: (name, fn) => { inputEvents[name] = fn; } };
  const go = { disabled: true, addEventListener: (name, fn) => { goEvents[name] = fn; } };
  const sharedReview = cut('function openPetDestructionReview(', '\nfunction wireLabLinks(');
  await run(sharedReview + '\n' + destroyCode, { insts: instances, bank: steps, body: {}, S: { sounds: false },
    $$: () => [btn], $: s => s === '#pdIn' ? input : go,
    openSheet: html => { sheets.push(html); return {}; },
    toast: message => toasts.push(message), setTimeout: fn => timers.push(fn),
    popSound: () => {}, history: { back() {} }, render: () => {} });
  return { btn, input, go, toasts, sheets, timers, click: events.click,
    type: value => { input.value = value; inputEvents.input(); }, confirm: () => goEvents.click() };
}
await test('R44-5 level 10 unique colour opens typed gate and names lost steps', async () => {
  const h = await destroyHarness([frost, ember], bank);
  await h.click();
  assert.equal(h.sheets.length, 1, 'two taps can destroy Level 10 Frost without typed confirmation');
  assert(h.sheets[0].includes('Frost Drizzle · Lv 10'), 'confirm omits identity');
  assert(h.sheets[0].includes('105,000 banked steps'), 'confirm omits banked steps');
  assert(h.sheets[0].includes('last copy of this colour'), 'confirm omits unique colour warning');
  await h.confirm();
  assert.equal((await loot.petInstances()).length, 2, 'blank confirmation must not destroy');
  h.type('no'); assert(h.go.disabled);
  h.type('DESTROY'); assert.equal(h.go.disabled, false);
  await h.confirm();
  assert.deepEqual((await loot.petInstances()).map(x => x.iid), ['ember']);
  assert(h.toasts.some(t => t.includes('Frost Drizzle · Lv 10 salvaged into 60 Bone Dust')), 'result toast loses identity');
});
await test('R44-5 unique colour at level 1 needs typing', async () => {
  const h = await destroyHarness([frost, ember]); await h.click();
  assert.equal(h.sheets.length, 1, 'unique Frost colour got the light gate');
});
await test('R44-5 trained duplicate, shiny and lineage each need typing', async () => {
  for (const [inst, steps] of [[frost, { frost: 1 }], [{ ...frost, shiny: true }, {}], [{ ...frost, lineage: 1 }, {}]]) {
    const other = { ...inst, iid: 'duplicate' };
    const h = await destroyHarness([inst, other], steps); await h.click();
    assert.equal(h.sheets.length, 1, `investment bypassed typing: ${JSON.stringify({ inst, steps })}`);
  }
});
await test('R44-5 plain duplicate arm and result toast retain colour and level', async () => {
  const h = await destroyHarness([frost, duplicate]); await h.click();
  assert(h.btn.innerHTML.includes('Frost Drizzle · Lv 1'), 'armed button says only Melt for 60?');
  assert(h.toasts.some(t => t.includes('Frost Drizzle · Lv 1') && t.includes('cannot be undone')), 'no named toast on arming');
  assert.equal((await loot.petInstances()).length, 2);
  await h.click();
  assert.deepEqual((await loot.petInstances()).map(x => x.iid), ['duplicate']);
  assert(h.toasts.some(t => t.includes('Frost Drizzle · Lv 1 salvaged into 60 Bone Dust')), 'result toast says only Drizzle');
});
await test('CONTROL untrained duplicate still requires two taps and really pays once', async () => {
  const h = await destroyHarness([frost, duplicate]); await h.click();
  assert.equal(h.sheets.length, 0);
  assert.equal(await loot.boneDust(), 0);
  await h.click(); assert.equal(await loot.boneDust(), 60);
  await h.click(); assert.equal(await loot.boneDust(), 60);
});
await test('R44-5 an armed button cannot confirm a different copy', async () => {
  const h = await destroyHarness([frost, duplicate]); await h.click();
  h.btn.dataset.destroy = duplicate.iid;
  await h.click();
  assert.equal((await loot.petInstances()).length, 2, 'focus switch reused another instance confirmation');
});

async function kennel(instances) {
  const body = { innerHTML: '' };
  await run(cut('async function openKennel()', '\nif (typeof window') + '\nawait openKennel();', {
    openSheet: () => ({}), $: () => body, $$: () => [], petInstances: async () => instances,
    KENNEL_SPECIES: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].map(id => BH_BY_ID[id]),
    wireLabLinks: () => {}, // Navigation is exercised in lab-ui-audit; this fixture owns collection copy.
    croppedPetImg: () => '<img>', morphSwatch: () => '#fff' });
  return body.innerHTML;
}
await test('CONTROL empty and partial Kennel still show 36 grid controls', async () => {
  for (const instances of [[], [frost]]) {
    const html = await kennel(instances);
    assert.equal([...html.matchAll(/class="k-cell/g)].length, 36);
    assert(!html.includes('Your Kennel is complete.'));
  }
});
await test('R44-18 complete collection acknowledges 36/36 without locked-cell instructions', async () => {
  const all = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].flatMap(sp => pets.MORPHS.map(morph => ({ sp, morph })));
  const html = await kennel(all);
  assert(html.includes('Collection &middot; 36 / 36'));
  assert(html.includes('Your Kennel is complete.'), '36/36 has no acknowledgement');
  const lead = html.match(/<p class="k-lead">([^<]*)/)[1];
  assert(!/lock|hollow|not/i.test(lead), `complete grid still says: ${lead}`);
});
await test('R44-23 roster never asserts Base ownership without its cell', async () => {
  // Forward-version morph data can own the species while owning zero known cells.
  const html = await kennel([{ ...frost, morph: 'future' }]);
  assert(html.includes('Collection &middot; 0 / 36'));
  assert(!html.includes('Base owned'), 'roster asserts Base owned at 0 / 36');
  assert(html.includes('No colourways owned'));
  const mixed = await kennel([frost, { ...frost, morph: 'base' }]);
  assert(mixed.includes('Base, Frost owned'), 'caption omits owned Base when Frost is also present');
});
console.log(`KENNEL COPY: ${passed} passed, ${failed} failed (Node only, no pixel claim)`);
process.exitCode = failed ? 1 : 0;
