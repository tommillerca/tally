// Frozen fix-lab-density, 2026-09-09. Executes production renderers without sockets.
// RED before the fix: reset sentence rendered 3 times; browse density guard failed.
// Optional argv[2] resolves the checkout while this check is staged outside tests/.
// Each group has a nonempty CONTROL and a deliberately faulty variant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL(process.argv[2] ? `file://${process.argv[2]}/` : '../', import.meta.url);
const { MORPHS, MORPH_LABEL } = await import(new URL('js/pets.js', root));

const { BH_BY_ID } = await import(new URL('data/boneheadz.js', root));
const source = readFileSync(new URL('js/app.js', root), 'utf8');
const pure = source.split('// LAB UI PURE BEGIN:')[1].split('\n').slice(1).join('\n').split('// LAB UI PURE END')[0];
assert.ok(pure.length > 1000, 'CONTROL nonempty production renderers');
const context = vm.createContext({ MORPHS, MORPH_LABEL, BH_BY_ID, KENNEL_SPECIES: ['C1','C2','C3','C4','C5','C6'].map(id => BH_BY_ID[id]), esc: x => String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'), morphSwatch: morph => ({ base: 'var(--text)', ember: '#f0763a', frost: '#5fb8ec', toxic: '#8fd23c', rose: '#e878a5', midnight: '#6b4fc4' })[morph], petPortraitHtml: (sp, px, shiny, opts) => { assert.equal(typeof shiny, 'boolean'); assert.equal(opts.wear, null); assert.equal(opts.thumb, true); return `<img data-portrait data-shiny="${shiny}" src="${sp}-${opts.morph}.png" width="${px}">`; }, petSpriteHtml: (sp, px, ground, opts) => { assert.equal(typeof ground, 'boolean'); assert.equal(opts.shiny, false); assert.equal(opts.wear, null); return `<img src="${sp}-${opts.morph}.png" width="${px}">`; } });
vm.runInContext(pure, context);
const ui = context;
let passed = 0, failed = 0;
async function check(name, run) {
  try { await run(); console.log(`PASS CONTROL ${name}`); passed++; }
  catch (error) { console.error(`FAIL ${name}: ${error.message.split('\n')[0]}${error.actual === 3 ? ' (actual 3, expected 1)' : ''}`); failed++; }
}
function rejectsMutation(good, bad, assertion) { assertion(good); assert.throws(() => assertion(bad), 'faulty variant must be rejected'); }
const pet = (iid, morph = 'base', extra = {}) => ({ iid, sp: 'C1', morph, shiny: false, eligible: true, bankedSteps: 0, level: 1, nickname: '', lineage: 0, bond: 0, talents: [], equipped: false, safeSurplus: true, ...extra });
const state = (extra = {}) => ({ status: 'ready', used: 0, capacity: 1, remaining: 1, resetTime: '00:00', zone: 'America/Vancouver', collectionCount: 1, pets: [pet('a'),pet('b'),pet('keeper')], species: { C1: { count: 1, hasEligiblePair: true, safeCounts: { base: 2 } } }, hasEligiblePair: true, hasSafePair: true, hasSafeUsefulPair: true, ui: { introRead: false, todayHidden: false }, coins: 0, hasExperiment: true, eggs: [{ steps: 1250, goal: 8000, ready: false }], unseen: [], ...extra });
const quote = (extra = {}) => ({ opId: 'experiment-control', recipe: 'toxic-rose', species: 'C1', inputs: [pet('a','toxic'),pet('b','rose')], distribution: [{ morph: 'midnight', weight: 4 }], protection: 'none', branches: [{ morph: 'midnight', lost: ['C1|toxic','C1|rose'], gained: ['C1|midnight'], afterCount: 1, counts: [{ cell: 'C1|toxic', before: 1, after: 0 }, { cell: 'C1|rose', before: 1, after: 0 }, { cell: 'C1|midnight', before: 0, after: 1 }] }], salvageDust: 20, result: { iid: 'new', morph: 'midnight' }, ...extra });

const reset = 'Experiments reset at 00:00, America/Vancouver.';
const count = (html, text) => html.split(text).length - 1;
const unescape = html => html.replaceAll('&#39;', "'");
await check('exhausted limit occurs once, beside disabled Review pair, across inventory states', () => {
  for (const extra of [{}, { pets: [], hasEligiblePair: false }, { hasEligiblePair: false }, { hasSafePair: false }]) {
    const html = unescape(ui.labBenchHtml(state({ used: 1, remaining: 0, ...extra }), [null, null], 'C1'));
    const grade = h => {
      assert.equal(count(h, reset), 1, 'reset sentence must occur once, including disclosures');
      assert.equal(count(h, "You've used 1/1 experiments today."), 1);
      assert.match(h, /<p id="labPairHint"[^>]*>You've used 1\/1 experiments today\. Experiments reset at 00:00, America\/Vancouver\.<\/p><button[^>]*aria-describedby="labPairHint"[^>]*data-lab-review disabled/);
      assert.equal((h.match(/data-lab-slot="[01]" disabled/g) || []).length, 2);
    };
    rejectsMutation(html, html + `<p>${reset}</p>`, grade);
    rejectsMutation(html, html.replace(reset, ''), grade);
  }
});
await check('available reset and browse next action remain present', () => {
  const html = ui.labBenchHtml(state(), [null, null], 'C1');
  const grade = h => {
    assert.equal(count(h, reset), 1);
    assert.match(h, /1 experiment available today/);
    assert.match(h, /Choose first pet to review a pair/);
    assert.match(h, /data-lab-slot="0" >/);
  };
  rejectsMutation(html, html.replace(reset, ''), grade);
});
await check('browse explains the room once without consumption repetition or stock jargon', () => {
  for (const sp of ['', 'C1']) {
    const html = ui.labBenchHtml(state(), [null, null], sp);
    const grade = h => {
      assert.equal(count(h, 'Make a new colour from two pets of the same species.'), 1);
      assert.doesNotMatch(h, /Both inputs are permanently consumed|Every experiment removes two pets|Both pets are consumed|The Laboratory reduces your total by one pet|Two pets in\. One new pet out\.|Spare pets:|Spare counts|class="lab-stock"/);
      assert.match(h, /Choose first pet/);
      assert.match(h, /Choose second pet/);
      assert.match(h, /Spending your last copy can remove a colour from your collection/);
      assert.match(h, /Trained pets are allowed, but all their investment is lost/);
    };
    rejectsMutation(html, html + '<p>Every experiment removes two pets to make one.</p>', grade);
    rejectsMutation(html, html + '<p>Spare pets: Base 4. Need 2.</p>', grade);
  }
});
await check('confirmation retains destruction, investment, collection and typed consent disclosures', () => {
  const q = quote({ inputs: [pet('a', 'toxic', { nickname: 'Bite', level: 10, bankedSteps: 82001, lineage: 4, bond: 3, talents: ['Fang'], equipped: true }), pet('b', 'rose')] });
  const html = ui.labConfirmationHtml(q);
  const required = [
    'Both pets are permanently consumed. Their training, names, lineage, bonds and talent choices do not transfer.',
    'The new pet starts at level 1, with 0 banked steps and lineage 0.',
    'will be destroyed: level 10, 82,001 banked training steps. None of those steps transfer.',
    'The name Bite is removed with this pet.', 'loses lineage 4 and bond 3/5.',
    'talent choices are removed: Fang.', 'is your equipped pet.',
    'Collection after: 1/36', 'Animate pays no dust.',
    'This cannot be undone. Type ANIMATE to destroy both pets and create one new pet.'
  ];
  const grade = h => { for (const text of required) assert.ok(h.includes(text), text); };
  for (const text of required) rejectsMutation(html, html.replace(text, ''), grade);
});
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
