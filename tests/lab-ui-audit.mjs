// Frozen BUILD 2b, 2026-09-08. Production UI renderers, no browser or sockets.
// Each group has a nonempty CONTROL and a deliberately faulty variant.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { MORPHS, MORPH_LABEL, ownedPairs, ownedCellCount, petLevel, isMorph, morphAsset } from '../js/pets.js';
import { eggProgress } from '../js/loot.js';
import { BH_BY_ID } from '../data/boneheadz.js';
const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const pure = source.split('// LAB UI PURE BEGIN:')[1].split('\n').slice(1).join('\n').split('// LAB UI PURE END')[0];
assert.ok(pure.length > 1000, 'CONTROL nonempty production renderers');
const context = vm.createContext({ MORPHS, MORPH_LABEL, BH_BY_ID, KENNEL_SPECIES: ['C1','C2','C3','C4','C5','C6'].map(id => BH_BY_ID[id]), esc: x => String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'), morphSwatch: morph => ({ base: 'var(--text)', ember: '#f0763a', frost: '#5fb8ec', toxic: '#8fd23c', rose: '#e878a5', midnight: '#6b4fc4' })[morph], petPortraitHtml: (sp, px, shiny, opts) => { assert.equal(typeof shiny, 'boolean'); assert.equal(opts.wear, null); assert.equal(opts.thumb, true); return `<img data-portrait data-shiny="${shiny}" src="${sp}-${opts.morph}.png" width="${px}">`; }, petSpriteHtml: (sp, px, ground, opts) => { assert.equal(typeof ground, 'boolean'); assert.equal(opts.shiny, false); assert.equal(opts.wear, null); return `<img src="${sp}-${opts.morph}.png" width="${px}">`; } });
vm.runInContext(pure, context);
const ui = context;
let passed = 0;
async function check(name, run) { await run(); console.log(`PASS CONTROL ${name}`); passed++; }
function rejectsMutation(good, bad, assertion) { assertion(good); assert.throws(() => assertion(bad), 'faulty variant must be rejected'); }
const pet = (iid, morph = 'base', extra = {}) => ({ iid, sp: 'C1', morph, shiny: false, eligible: true, bankedSteps: 0, level: 1, nickname: '', lineage: 0, bond: 0, talents: [], equipped: false, safeSurplus: true, ...extra });
const state = (extra = {}) => ({ status: 'ready', used: 0, capacity: 1, remaining: 1, resetTime: '00:00', zone: 'America/Vancouver', collectionCount: 1, pets: [pet('a'),pet('b'),pet('keeper')], species: { C1: { count: 1, hasEligiblePair: true, safeCounts: { base: 2 } } }, hasEligiblePair: true, hasSafePair: true, hasSafeUsefulPair: true, ui: { introRead: false, todayHidden: false }, coins: 0, hasExperiment: true, eggs: [{ steps: 1250, goal: 8000, ready: false }], unseen: [], ...extra });
const quote = (extra = {}) => ({ opId: 'experiment-control', recipe: 'toxic-rose', species: 'C1', inputs: [pet('a','toxic'),pet('b','rose')], distribution: [{ morph: 'midnight', weight: 4 }], protection: 'none', branches: [{ morph: 'midnight', lost: ['C1|toxic','C1|rose'], gained: ['C1|midnight'], afterCount: 1, counts: [{ cell: 'C1|toxic', before: 1, after: 0 }, { cell: 'C1|rose', before: 1, after: 0 }, { cell: 'C1|midnight', before: 0, after: 1 }] }], salvageDust: 20, result: { iid: 'new', morph: 'midnight' }, ...extra });
await check('bench has all three paths, empty slots, progress and every sink', () => {
  const html = ui.labBenchHtml(state(), [null,null], '');
  const grade = h => { assert.equal((h.match(/data-recipe=/g)||[]).length, 3); assert.match(h,/Choose first pet/); assert.match(h,/Choose second pet/); assert.match(h,/data-lab-review disabled/); assert.match(h,/1 of 36 colours/); for (const dest of ['collection','eggs','melt','breed']) assert.match(h,new RegExp(`data-lab-nav="${dest}"`)); assert.match(h,/Melting clears the pile. Breeding builds strength. The Laboratory builds the collection./); assert.match(h,/1,250\/8,000 steps/); };
  rejectsMutation(html, html.replace('data-recipe="toxic-rose"','removed'), grade);
});
await check('chooser has six 96px portraits before selection; selected bench leads the path', () => {
  const html = ui.labBenchHtml(state(), [null,null], '');
  const grade = h => {
    assert.equal((h.match(/data-portrait/g) || []).length, 6);
    assert.equal((h.match(/type="radio" name="labSpecies"/g) || []).length, 6);
    assert.doesNotMatch(h, / checked|Base colour:|Not collected/);
    assert.ok(h.indexOf('data-portrait') < h.indexOf('class="lab-odds"'));
    for (let i = 1; i <= 6; i++) assert.match(h, new RegExp(`C${i}-base.png" width="96"`));
  };
  rejectsMutation(html, html.replaceAll('data-portrait', 'missing-portrait'), grade);
  const selected = ui.labBenchHtml(state(), [null,null], 'C1');
  const selectedGrade = h => {
    assert.doesNotMatch(h, /class="lab-species"|Colour previews|class="lab-recipe"|lab-colour-dots/);
    assert.match(h, /Selected species/); assert.match(h, /data-lab-change-species/);
    assert.match(h, /<h3>Choose your pair<\/h3>/);
    assert.ok(h.indexOf('data-lab-slot="0"') < h.indexOf('class="lab-path"'));
    for (const morph of MORPHS) assert.match(h, new RegExp(`C1-${morph}.png" width="96"`));
  };
  rejectsMutation(selected, selected + ui.labSpeciesHtml(state(), ''), selectedGrade);
  rejectsMutation(selected, selected.replace('data-lab-change-species', 'missing-control'), selectedGrade);
});
// Polish guards pin source contracts. Layout, glyph ink and motion still need pixels.
const rule = (text, selector) => {
  const start = text.indexOf(selector + ' {');
  assert.ok(start >= 0, `CONTROL rule exists: ${selector}`);
  return text.slice(start, text.indexOf('}', start) + 1);
};
await check('path ownership has positive markers, honest accessible names and no wall of absence', () => {
  const html = ui.labRecipesHtml(state({ pets: [pet('rose', 'rose')] }), 'C1');
  const grade = h => {
    assert.equal((h.match(/class="lab-specimen"/g) || []).length, 6);
    assert.equal((h.match(/✓ Have/g) || []).length, 1);
    assert.match(h, /Base [^"]+: not owned/); assert.match(h, /Rose [^"]+: owned/);
    assert.match(h, /Unmarked colours are still to collect/);
    assert.doesNotMatch(h, />Not collected|>Not owned/);
  };
  rejectsMutation(html, html.replace('✓ Have', 'Not collected'), grade);
  const empty = ui.labBenchHtml(state({ pets: [], species: { C1: { count: 0 } } }), [null,null], 'C1');
  rejectsMutation(empty, empty.replace('Six colours to collect','0 missing'), h => { assert.match(h,/Six colours to collect/); assert.doesNotMatch(h,/✓ Have/); });
  // The coherent engine collection takes precedence over the fallback roster.
  assert.match(ui.labRecipesHtml(state({ pets: [], ownedCells: ['C1|base'] }), 'C1'), /Base [^"]+: owned/);
});
await check('radio circles are visually hidden while native focus and selected text survive', () => {
  const grade = text => {
    const input = rule(text, '.lab-species-choice input');
    assert.match(input, /clip-path: inset\(50%\)/);
    assert.doesNotMatch(input, /display:\s*none|visibility:\s*hidden/);
    assert.match(rule(text, '.lab-species-choice input:focus-visible + .lab-species-tile'), /outline: 2px solid var\(--accent\)/);
    assert.match(rule(text, '.lab-species-choice input:checked + .lab-species-tile'), /border-color: var\(--text-2\)/);
  };
  rejectsMutation(css, css.replace('clip-path: inset(50%)', 'clip-path: none'), grade);
  rejectsMutation(css, css.replace('clip-path: inset(50%)', 'display: none; clip-path: inset(50%)'), grade);
  const html = ui.labSpeciesHtml(state(), 'C2', true);
  const radios = html.match(/<input[^>]+>/g);
  assert.equal(radios.length, 6);
  assert.equal(radios.filter(r => / checked/.test(r)).length, 1);
  assert.match(radios[1], /value="C2" checked/);
  assert.ok(radios.every(r => /type="radio" name="labSpecies"/.test(r) && !/tabindex|disabled|aria-hidden/.test(r)));
  assert.equal((html.match(/✓ Selected/g) || []).length, 1);
  assert.equal((html.match(/type="radio"/g) || []).length, 6);
});
await check('species tile spacing contracts with the approved 96px portraits and readable text', () => {
  const grade = text => {
    const tile = rule(text, '.lab-species-tile');
    assert.match(tile, /gap: 2px/); assert.match(tile, /padding: 4px/);
    assert.match(tile, /min-height: 44px/);
    assert.doesNotMatch(tile, /max-height|overflow:\s*hidden|font-size|transform/);
    assert.match(text, /\.lab-species \{ gap: 8px; \}/);
    assert.match(rule(text, '.lab-selected, .lab-species-tile small, .lab-species-tile > span:not(.lab-art), .lab-specimen small'), /font-size: var\(--fs-3\); line-height: 1.5/);
  };
  rejectsMutation(css, css.replace('gap: 2px; height: 100%; min-height: 44px; padding: 4px;', 'gap: 8px; height: 100%; min-height: 44px; padding: 12px;'), grade);
  const html = ui.labSpeciesHtml(state(), '');
  rejectsMutation(html, html.replaceAll('width="96"', 'width="64"'), h => assert.equal((h.match(/width="96"/g) || []).length, 6));
});
await check('path art stays in normal flow and phone species choices keep two columns', () => {
  const grade = text => {
    assert.match(rule(text, '.lab-tier .lab-art'), /min-height: 96px/);
    assert.match(rule(text, '.lab-species'), /repeat\(2, minmax\(0, 1fr\)\)/);
    for (const selector of ['.lab-path', '.lab-tier', '.lab-connection', '.lab-specimen figcaption']) assert.doesNotMatch(rule(text, selector), /max-height|overflow: hidden|position: absolute|filter:/);
    const phone = text.slice(text.lastIndexOf('@media (max-width: 380px)'));
    assert.doesNotMatch(phone, /\.lab-species/);
  };
  rejectsMutation(css, css.replace('.lab-tier .lab-art { min-height: 96px', '.lab-tier .lab-art { min-height: 48px'), grade);
  rejectsMutation(css, css.replace('.lab-slots { grid-template-columns: 1fr;', '.lab-slots, .lab-species { grid-template-columns: 1fr;'), grade);
});
await check('reveal settles in 240ms at full opacity without rarity effects', () => {
  const grade = text => {
    assert.match(rule(text, '.lab-surprise.lab-play [data-lab-result-art]'), /animation: lab-result-arrive \.24s ease-out both/);
    const motion = text.slice(text.indexOf('@keyframes lab-result-arrive'), text.indexOf('.lab-today, .lab-interruption'));
    assert.match(motion, /from \{ transform: scale\(\.96\); \} to \{ transform: scale\(1\); \}/);
    assert.doesNotMatch(motion, /opacity|filter|box-shadow/);
    assert.doesNotMatch(rule(text, '.lab-reveal [data-lab-result-art]'), /filter|box-shadow|opacity/);
    assert.match(text, /@media \(prefers-reduced-motion: reduce\).*lab-surprise[^}]+animation: none/s);
  };
  rejectsMutation(css, css.replace('lab-result-arrive .24s', 'lab-result-arrive .65s'), grade);
  rejectsMutation(css, css.replace('from { transform: scale(.96); }', 'from { transform: scale(.65); opacity: .15; }'), grade);
  const reveal = source.slice(source.indexOf('  async function reveal(receipt)'), source.indexOf('  function incubators()'));
  assert.match(reveal, /await Promise.all\([^;]+img.decode\(\)/);
  assert.match(reveal, /receipt.distribution.length > 1 && !reducedMotion/);
  assert.match(reveal, /id="labSkip">Skip reveal/);
  assert.match(reveal, /classList.remove\('lab-play'\)/);
  assert.match(reveal, /Its image could not load. Retry the image or view the pet/);
});
await check('DEMO occupies shell and wrapping sheet headers only in demo mode', () => {
  const bootLine = source.split('\n').find(line => line.includes("useDbName('tally-demo')"));
  const sheetLine = source.split('\n').find(line => line.includes("if (S.demo) $('.sheet-head', wrap)"));
  assert.ok(bootLine && sheetLine, 'CONTROL production demo placement sites exist');
  const render = (demo, boot = bootLine) => {
    const calls = [], wrap = {};
    const $ = (selector, parent) => {
      assert.ok(selector === '#app' || selector === '.sheet-head');
      if (selector === '.sheet-head') assert.equal(parent, wrap);
      return { insertAdjacentHTML: (position, html) => calls.push({ selector, position, html }) };
    };
    vm.runInNewContext(boot + '\n' + sheetLine, { S: { demo }, $, wrap, useDbName: name => assert.equal(name, 'tally-demo') });
    return calls;
  };
  const calls = render(true);
  rejectsMutation(calls, calls.slice(1), value => {
    assert.equal(value.length, 2);
    assert.deepEqual(value.map(x => [x.selector, x.position]), [['#app', 'afterbegin'], ['.sheet-head', 'beforeend']]);
    assert.match(value[0].html, /class="demo-header"/);
    assert.ok(value.every(x => /class="demo-badge">DEMO/.test(x.html)));
  });
  assert.deepEqual(render(false), []);
  const grade = text => {
    const badge = rule(text, '.demo-badge');
    assert.match(badge, /position: static/); assert.match(badge, /background: var\(--amber\); color: #201500/);
    assert.doesNotMatch(badge, /bottom:|left:|z-index:|opacity:/);
    assert.match(rule(text, '.demo-header'), /flex: none/);
    assert.match(rule(text, '.sheet-head:has(> .demo-badge)'), /flex-wrap: wrap/);
    assert.match(rule(text, '.sheet-head:has(> .demo-badge) h2'), /white-space: normal/);
    assert.match(rule(text, '.sheet-head:has(> .demo-badge) .sheet-close'), /max-width: 100%; overflow-wrap: anywhere/);
  };
  rejectsMutation(css, css.replace('position: static; display: inline-block; flex: none;', 'position: fixed; display: inline-block; flex: none;'), grade);
  rejectsMutation(css, css.replace('.sheet-head:has(> .demo-badge) { flex-wrap: wrap;', '.sheet-head:has(> .demo-badge) { flex-wrap: nowrap;'), grade);
});
await check('Bangers heading retains the ink overhang padding, which requires pixel review', () => {
  const grade = text => assert.match(rule(text, '.sheet-head h2'), /padding-right: 0\.14em/);
  rejectsMutation(css, css.replace('padding-right: 0.14em', 'padding-right: 0'), grade);
});
await check('exactly one lime next action follows selection, with no automatic pet choice', () => {
  const cases = [
    ['', [null,null], state(), 'data-lab-choose-species'],
    ['C1', [null,null], state(), 'data-lab-slot="0"'],
    ['C1', ['a',null], state(), 'data-lab-slot="1"'],
    ['C1', [null,'b'], state(), 'data-lab-slot="0"'],
    ['C1', ['a','b'], state(), 'data-lab-review'],
    ['C1', ['a','b'], state({ remaining: 0 }), 'data-lab-nav="collection"'],
    ['C1', [null,null], state({ status: 'unavailable' }), 'data-lab-nav="collection"'],
    ['C1', ['a','b'], state({ pets: [pet('a'),pet('b','rose')] }), 'data-lab-slot="0"'],
  ];
  for (const [sp, pair, snapshot, target] of cases) {
    const html = ui.labBenchHtml(snapshot, pair, sp);
    const grade = h => {
      const actions = h.match(/<button[^>]*class="[^"]*\blab-next\b[^"]*"[^>]*>/g) || [];
      assert.equal(actions.length, 1);
      assert.ok(actions[0].includes(target));
      assert.doesNotMatch(actions[0], /disabled/);
    };
    rejectsMutation(html, html.replace('lab-next', 'ghost'), grade);
    rejectsMutation(html, html + '<button class="lab-next">Extra</button>', grade);
  }
  rejectsMutation(css, css.replace('.lab-room .lab-next { background: var(--accent)', '.lab-room .lab-next { background: var(--surface)'), h => assert.match(h, /\.lab-room \.lab-next \{ background: var\(--accent\); color: var\(--accent-ink\)/));
});
await check('recipe progression uses engine distributions and preserves certain Midnight', () => {
  const snapshot = state({ species: { C1: { recipes: { 'base-base': { distribution: [{ morph: 'ember', weight: 22 }, { morph: 'frost', weight: 22 }], protection: 'none', shortage: 'Need another Base pet.' }, 'ember-frost': { distribution: [{ morph: 'toxic', weight: 10 }, { morph: 'rose', weight: 10 }], protection: 'none' } } } } });
  const html = ui.labRecipesHtml(snapshot, 'C1');
  const grade = h => {
    assert.ok(h.indexOf('data-recipe="base-base"') < h.indexOf('data-recipe="ember-frost"'));
    assert.ok(h.indexOf('data-recipe="ember-frost"') < h.indexOf('data-recipe="toxic-rose"'));
    /* REMOVED 2026-09-08: this row asserted the PROTECTED design (100% Frost,
       "Missing colours come first", 75/25). Tom removed that protection so the
       first two recipes are always 50/50: "you could make 3 frost before you make
       1 ember thats the risk part". Keeping it would pin a superseded rule. */
    for (const text of ['Make Ember or Frost', '50% Ember', '50% Frost', 'Always 50/50. Each coin flip can repeat a colour you already have.', 'Need another Base pet.', '50% Toxic', '50% Rose', 'Make Midnight. Guaranteed.', '100% Midnight']) assert.ok(h.includes(text), text);
    assert.doesNotMatch(h, /Missing colours come first|Needed ingredients come first|100% Frost|roulette/);
  };
  rejectsMutation(html, html.replace('100% Midnight', '50% Midnight'), grade);
  assert.match(ui.labRecipesHtml(state(), ''), /Example odds. Choose a species to see your chances./);
  const counts = ui.labBenchHtml(state(), [null,null], 'C1');
  rejectsMutation(counts, counts.replace('Base 2. Need 2.', 'Base 0. Need 2.'), h => assert.match(h, /Spare pets: Base 2. Need 2./));
  const unknown = ui.labBenchHtml(state({ pets: [pet('a','ember')] }), ['a',null], 'C1');
  rejectsMutation(unknown, unknown.replaceAll('Unknown', '0'), h => assert.match(h, /Spare pets: Ember Unknown. Need 1. Frost Unknown. Need 1./));
});
await check('the two repeated sentences occur once in their applicable context', () => {
  const snapshot = state({ species: { C1: { count: 1, recipes: {
    'base-base': { distribution: [{ morph: 'frost', weight: 1 }], protection: 'collection' },
    'ember-frost': { distribution: [{ morph: 'toxic', weight: 1 }, { morph: 'rose', weight: 1 }], protection: 'collection' }
  } } } });
  const html = ui.labBenchHtml(snapshot, [null,null], 'C1');
  for (const sentence of ['Two pets in. One new pet out.', 'Missing colours come first.']) {
    const grade = h => assert.equal(h.split(sentence).length - 1, 1);
    rejectsMutation(html, html + sentence, grade);
    rejectsMutation(html, html.replace(sentence, ''), grade);
  }
  assert.equal((html.match(/aria-describedby="labCollectionProtection"/g) || []).length, 2);
  assert.doesNotMatch(html.slice(html.indexOf('data-recipe="toxic-rose"'), html.indexOf('<details id="labHelp"')), /Missing colours|labCollectionProtection/);
  assert.doesNotMatch(ui.labRecipesHtml(state(), 'C1'), /Missing colours come first/);
});
await check('species change expands native choices and clears the exact pets and quote on selection', () => {
  const handler = source.match(/radio.addEventListener\('change', e => \{ ([^\n]+?) \}\)\);/)[1];
  const run = text => {
    const ctx = vm.createContext({ e: { target: { value: 'C2' } }, species: 'C1', choosingSpecies: true, selected: ['a','b'], quote: { opId: 'old' }, body: {}, paint() {}, $: () => ({ focus() {} }) });
    vm.runInContext(text, ctx);
    return ctx;
  };
  const grade = text => { const ctx = run(text); assert.equal(ctx.species,'C2'); assert.equal(ctx.choosingSpecies,false); assert.deepEqual(Array.from(ctx.selected),[null,null]); assert.equal(ctx.quote,null); };
  rejectsMutation(handler, handler.replace('selected = [null, null];', ''), grade);
  rejectsMutation(handler, handler.replace('quote = null;', ''), grade);
  rejectsMutation(handler, handler.replace('choosingSpecies = false;', ''), grade);
  const cancel = source.match(/data-lab-keep-species.*?click', \(\) => \{ (.+?) \}\);/)[1];
  rejectsMutation(cancel, cancel.replace('choosingSpecies = false;', ''), text => {
    const ctx = run(text); assert.equal(ctx.choosingSpecies,false); assert.equal(ctx.species,'C1');
    assert.deepEqual(Array.from(ctx.selected),['a','b']); assert.equal(ctx.quote.opId,'old');
  });
  const expand = source.match(/choosingSpecies = true; paint\(\);[^\n]+?focus\(\);/)[0];
  const ctx = vm.createContext({ choosingSpecies: false, body: {}, paint() {}, $: () => ({ focus() {} }) });
  vm.runInContext(expand, ctx);
  const html = ui.labSpeciesHtml(state(), 'C1', ctx.choosingSpecies);
  rejectsMutation(html, ui.labSpeciesHtml(state(), 'C1'), h => assert.equal((h.match(/type="radio"/g) || []).length,6));
});
await check('compact supporting disclosures preserve help, recovery and the full bench quote', () => {
  const s = state({ unseen: [quote()], ui: { introRead: true } });
  const html = ui.labBenchHtml(s, [null,null], 'C1', quote());
  const grade = h => {
    assert.ok(h.indexOf('data-lab-recover') < h.indexOf('class="lab-working"'));
    assert.ok(h.includes(ui.labBranchesHtml(quote())));
    for (const text of ['Both inputs are permanently consumed.', 'Every experiment removes two pets to make one.', 'Both pets are consumed.', 'Spending last copies can leave cells empty.', 'Trained pets are allowed, but all their investment is lost.', '0/1 experiments used', '00:00, America/Vancouver', 'More pet actions']) assert.ok(h.includes(text), text);
    assert.match(h, /<details id="labHelp" >/);
  };
  rejectsMutation(html, html.replace(ui.labBranchesHtml(quote()), ''), grade);
  rejectsMutation(html, html.replaceAll('Both pets are consumed.', ''), grade);
  assert.match(ui.labBenchHtml(state(),[null,null],'C1'), /<details id="labHelp" open>/);
  const exhausted = ui.labBenchHtml(state({ remaining: 0, used: 1, pets: [], hasEligiblePair: false }),[null,null],'C1');
  const visible = exhausted.replace(/<details[^>]*>[\s\S]*?<\/details>/g,'');
  rejectsMutation(visible, visible.replace('00:00, America/Vancouver', ''), h => assert.match(h, /Experiments reset at 00:00, America\/Vancouver/));
  const picker = source.slice(source.indexOf('  function picker(slot)'), source.indexOf('  async function updatePreview()'));
  rejectsMutation(picker, picker.replace('<div id="labPickRows"></div>', ''), h => { assert.ok(h.indexOf('Both inputs will be destroyed.') < h.indexOf('id="labPickRows"')); assert.ok(h.indexOf('id="labPickRows"') < h.indexOf('${labSinksHtml()}')); });
});
await check('bench help discloses repeated coin flips without collection or stock promises', () => {
  const html = ui.labBenchHtml(state(), [null,null], '');
  const grade = h => {
    for (const text of ['Base + Base always gives Ember 50% or Frost 50%', 'Ember + Frost always gives Toxic 50% or Rose 50%', 'can repeat a colour you already have', 'Three Frost before your first Ember is possible', 'Your collection, ingredient stock and previous results never change the odds']) assert.ok(h.includes(text), text);
    assert.doesNotMatch(h, /missing colours come first|needed ingredients come first|One missing means 100%|only one below two means 100%/i);
  };
  rejectsMutation(html, html.replace('Three Frost before your first Ember is possible', 'Missing colours come first'), grade);
});
await check('all 36 preview files use the shipped morph resolver and suppress shiny and wear', () => {
  const helper = source.slice(source.indexOf('function petPortraitHtml('), source.indexOf('async function refreshShinyPets'));
  const portrait = Function('morphAsset', 'BH_BY_ID', 'bhAsset', 'croppedPetImg', `${helper}; return petPortraitHtml;`)(morphAsset, BH_BY_ID, p => `assets/bh/C/${p.id}.png`, (sp, px, ground, src, wear, thumb) => ({ sp, px, ground, src, wear, thumb }));
  const paths = [];
  for (let i = 1; i <= 6; i++) for (const morph of MORPHS) {
    const sp = `C${i}`, art = portrait(sp, 144, false, { morph, wear: null, thumb: true });
    assert.equal(art.src, morph === 'base' ? `assets/bh/C/${sp}.png` : morphAsset(sp, morph));
    assert.ok(existsSync(new URL('../' + art.src, import.meta.url)), art.src);
    assert.equal(art.wear, null); assert.equal(art.thumb, true); assert.equal(art.px, 144); paths.push(art.src);
  }
  rejectsMutation(paths, paths.slice(1), value => assert.equal(new Set(value).size, 36));
  const shiny = ui.labPickerHtml(state({ pets: [pet('shiny', 'base', { shiny: true, eligible: false, reason: 'Shiny pets cannot be used here.' })] }), [null,null], 0);
  rejectsMutation(shiny, shiny.replace('data-shiny="true"', 'data-shiny="false"'), h => { assert.match(h, /data-shiny="true"/); assert.match(h, /Shiny pets cannot be used here/); });
});
await check('empty and no-pair states are neutral and still explain eggs', () => {
  for (const [s, text] of [[state({ pets: [], hasEligiblePair: false, hasSafePair: false }), 'Hatch eggs to discover species. The recipe path is here when you have a pair.'],[state({ hasEligiblePair: false, hasSafePair: false }), 'Your pets do not match a recipe yet. Hatch eggs to discover species and build matching pairs.']]) {
    const html = ui.labBenchHtml(s,[null,null],'');
    rejectsMutation(html, html.replace(text,'You missed an experiment'), h => { assert.ok(h.includes(text)); assert.doesNotMatch(h,/data-lab-incubators|missed|hurry|!/i); assert.equal((h.match(/data-recipe=/g)||[]).length,3); });
  }
});
await check('cap, invested-only, species-complete and cannot-afford states offer next actions', () => {
  const cases = [[state({ used: 1, remaining: 0 }), '', "You've used 1/1 experiments today. Experiments reset at 00:00, America/Vancouver."], [state({ hasSafePair: false }), '', 'Keep one of each colour.'], [state({ species: { C1: { complete: true, count: 6 } } }), 'C1', 'Choose another species'], [state({ species: { C1: { hasEligiblePair: false } } }), 'C1', 'Hatch eggs or choose another species']];
  for (const [s, sp, text] of cases) rejectsMutation(ui.labStateCopy(s,sp), 'Try harder', h => assert.ok(h.includes(text)));
  const html = ui.labIncubatorHtml(state({ used: 1, remaining: 0, coins: 1250 }));
  rejectsMutation(html, html.replace('18,750','0'), h => { assert.match(h,/20,000 coins/); assert.match(h,/1,250; 18,750 more needed/); assert.match(h,/data-lab-buy="2" disabled/); assert.match(h,/free daily experiment has been used/); });
  assert.doesNotMatch(ui.labIncubatorHtml(state({ coins: 20000 })), /data-lab-buy="2" disabled/);
});
await check('picker never selects a pet and trained ordinary partners stay selectable', () => {
  const s = state({ pets: [pet('last','toxic',{ lastCopy: true, safeSurplus: false, bankedSteps: 500, level: 1 }),pet('rose','rose'),pet('shiny','rose',{ shiny: true, eligible: false, reason: 'Shiny pets cannot be used here.' }),pet('founder','base',{ sp: 'CX', eligible: false, reason: 'The Day One Lizard cannot be used here.' }),pet('wrong','base'),pet('alien','oops',{ eligible: false, reason: 'This saved colour is not supported.' })] });
  const html = ui.labPickerHtml(s,[null,'rose'],0);
  rejectsMutation(html,html.replace('data-lab-pick="last" ', 'data-lab-pick="last" disabled '),h => { assert.match(h,/data-lab-pick="last" >/); assert.match(h,/Last collection copy/); assert.match(h,/Trained/); assert.match(h,/data-lab-pick="shiny" disabled/); assert.match(h,/data-lab-pick="wrong" disabled/); assert.match(h,/Day One Lizard cannot/); assert.match(h,/saved colour is not supported/); assert.doesNotMatch(h,/checked|aria-selected="true"/); });
});
await check('confirmation names every investment and exact pair-wide cell loss', () => {
  const q = quote({ inputs: [pet('a','toxic',{ nickname: '<Bite>', bankedSteps: 82001, level: 10, lineage: 4, bond: 3, talents: ['Fang'], equipped: true }),pet('b','rose',{ bankedSteps: 731, level: 1 })] });
  const html = ui.labConfirmationHtml(q);
  const grade = h => { for (const text of ['&lt;Bite&gt;','level 10, 82,001 banked training steps','level 1, 731 banked training steps','lineage 4 and bond 3/5','Fang','Non-shiny','equipped pet','Type ANIMATE','Toxic','Rose','Midnight','Collection after: 1/36','20 Bone Dust','Animate pays no dust','Both pets are permanently consumed.','will be destroyed:','The name &lt;Bite&gt; is removed with this pet.','This cannot be undone. Type ANIMATE to destroy both pets and create one new pet.']) assert.ok(h.includes(text),text); assert.doesNotMatch(h,/<Bite>/); };
  rejectsMutation(html,html.replace('82,001','82,000').replace('82,001','82,000'),grade);
  rejectsMutation(html,html.replaceAll('will be destroyed:', 'will be changed:'),grade);
  const exactLoss = h => {
    assert.match(h, /cells become empty: Toxic [^,]+, Rose [^.]+\. New cells: Midnight [^.]+\./);
    for (const cell of q.branches[0].counts) assert.ok(h.includes(`${ui.labCell(cell.cell)}: ${cell.before} to ${cell.after} pets`));
  };
  rejectsMutation(html, html.replace('cells become empty: Toxic', 'cells become empty: Ember'), exactLoss);
  rejectsMutation(html, html.replace('1 to 0 pets', '1 to 1 pets'), exactLoss);
  assert.equal(ui.labNeedsTyped(q),true);
  assert.equal(ui.labNeedsTyped(quote({ branches: [{ morph: 'midnight', lost: [], gained: [], afterCount: 3 }] })),false);
  for (const extra of [{ bankedSteps: 1 },{ level: 2 },{ nickname: 'N' },{ lineage: 1 },{ bond: 1 },{ talents: ['Fang'] },{ equipped: true }]) assert.equal(ui.labNeedsTyped(quote({ inputs: [pet('a','toxic',extra),pet('b','rose')],branches: [{ lost: [] }] })),true);
});
await check('every certain reveal is direct and only two-way outcomes get surprise', () => {
  const final = ui.labRevealHtml(quote());
  rejectsMutation(final,final.replace('lab-direct','lab-surprise'),h => { assert.match(h,/lab-direct/); assert.match(h,/Midnight was guaranteed by this recipe/); assert.match(h,/C1-midnight.png/); assert.doesNotMatch(h,/lab-surprise|roulette|gamble|50%/); });
  const singleton = ui.labRevealHtml(quote({ recipe: 'base-base', protection: 'collection', distribution: [{ morph: 'ember', weight: 22 }], result: { iid: 'new', morph: 'ember' }, branches: [{ morph: 'ember', lost: [], gained: ['C1|ember'], afterCount: 2 }] }));
  assert.match(singleton,/This saved experiment had a guaranteed result/); assert.match(singleton,/lab-direct/);
  for (const [recipe, morphs] of [['base-base',['ember','frost']], ['ember-frost',['toxic','rose']]]) {
    const html = ui.labRevealHtml(quote({ recipe, distribution: morphs.map(morph=>({morph,weight:1})), result: { iid:'new',morph:morphs[0] }, branches:morphs.map(morph=>({morph,lost:[],gained:[`C1|${morph}`],afterCount:2})) }));
    assert.match(html,/lab-surprise/); assert.doesNotMatch(html,/guaranteed/);
  }
  const duplicate = ui.labRevealHtml(quote({ branches: [{ morph:'midnight',lost:['C1|toxic','C1|rose'],gained:[],afterCount:1 }], resultPresent: false }));
  assert.match(duplicate,/Another copy. Optional extra copy./); assert.doesNotMatch(duplicate,/Added to your collection|Needed for/); assert.match(duplicate,/does not recreate it/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\).*lab-surprise[^}]+animation: none/s);
  assert.ok(ui.labQuoteSupported(quote()));
  assert.equal(ui.labQuoteSupported(quote({ distribution:[{morph:'toxic',weight:10},{morph:'midnight',weight:4}] })),false);
});
await check('Today row requires all gates, keeps hide, and never advertises mere eligibility', () => {
  const ctx = { current: true, priorDay: true, hidden: false };
  const html = ui.labTodayHtml(state(),ctx);
  rejectsMutation(html,html.replace('data-lab-open','broken'),h => { assert.match(h,/data-lab-open/); assert.match(h,/data-lab-hide/); assert.match(h,/Two matching spare pets are consumed/); });
  for (const change of [{ current:false },{ priorDay:false },{ hidden:true }]) assert.equal(ui.labTodayHtml(state(),{...ctx,...change}),'');
  for (const change of [{ remaining:0 },{ hasSafeUsefulPair:false },{ status:'unknown' },{ status:'unavailable' },{ collectionCount:36 }]) assert.equal(ui.labTodayHtml(state(change),ctx),'');
  assert.match(source,/setUi\(\{ todayHidden: true \}\)/); assert.match(source,/setUi\(\{ todayHidden: false \}\)/);
});
await check('interrupted fight and unknown save copy name the action without inventing a result', () => {
  const html = ui.labInterruptedFightHtml({ phase:'open',foe:'<Slab>' });
  rejectsMutation(html,html.replaceAll('Open the Pit','Continue'),h=>{ assert.match(h,/&lt;Slab&gt;/); assert.match(h,/Open the Pit/); assert.doesNotMatch(h,/saved|sorry|!/i); });
  assert.equal(ui.labInterruptedFightHtml({ phase:'settled' }),'');
  assert.match(ui.labStateCopy({status:'unknown'}),/before trying again/);
});
await check('six-column surfaces and Rose tint have production controls', () => {
  const palette = source.match(/const MORPH_SHELL = (\{[^;]+\});/)[1];
  const swatches = vm.runInNewContext('('+palette+')');
  assert.ok(swatches.ember && swatches.frost && swatches.rose);
  rejectsMutation(css,css.replaceAll('repeat(var(--kennel-columns, 6)', 'repeat(5'),h=>assert.match(h,/\.k-grid-head, \.k-grid-cells[^}]+repeat\(var\(--kennel-columns, 6\)/));
  assert.doesNotMatch(source,/All five colourways|Five colourways per pet/);
  assert.doesNotMatch(pure,/\u2014/);
});
await check('all navigation controls reach the named existing actions', () => {
  const targets = [], nodes = ['collection','eggs','melt','breed'].map(dest => ({ dataset:{labNav:dest}, addEventListener(event,fn){assert.equal(event,'click');this.click=fn;} }));
  const open = { addEventListener(event,fn){this.click=fn;} };
  Object.assign(context, { $$: selector => selector === '[data-lab-nav]' ? nodes : [open], openKennel:()=>targets.push('collection'), openCharacter:tab=>targets.push(tab), openStable:opts=>targets.push(opts.labAction), openLaboratory:()=>targets.push('laboratory') });
  const links = source.slice(source.indexOf('function wireLabLinks('),source.indexOf('\nlet labUncertainOperation'));
  vm.runInContext(links,context);context.wireLabLinks({});
  nodes.forEach(n=>n.click());open.click();
  rejectsMutation(targets, targets.slice(0,-1), value=>assert.deepEqual(value,['collection','crates','melt','breed','laboratory']));
});
await check('absent engine overview reads actual egg progress and cannot select or spend', async () => {
  const values = { petInst:[pet('a')],petLvlSteps:{a:123},petNick:{a:'Name'},petBonds:{a:2},pettalents:{a:['Fang']},petEquipped:'a' };
  Object.assign(context,{ laboratoryEngine:()=>null,kvGet:async(k,d)=>values[k]??d,inventory:async()=>[{kind:'egg',stepsAtStart:2000,goal:8000}],lifetimeStepsSum:async()=>3250,ownedPairs,ownedCellCount,petLevel,isMorph,eggProgress });
  const read = source.slice(source.indexOf('async function labReadSnapshot('),source.indexOf('\n/* Both salvage'));
  vm.runInContext(read,context);
  const snapshot = await context.labReadSnapshot();
  assert.equal(snapshot.status,'unavailable');assert.equal(snapshot.collectionCount,1);assert.equal(snapshot.eggs[0].steps,1250);
  assert.equal(snapshot.pets[0].bankedSteps,123);assert.equal(snapshot.pets[0].nickname,'Name');assert.equal(snapshot.pets[0].eligible,false);
  const html = ui.labBenchHtml(snapshot,[null,null],'C1');
  rejectsMutation(html,html.replace('data-lab-review disabled','data-lab-review'),h=>{assert.match(h,/not available in this build/);assert.match(h,/data-lab-review disabled/);assert.match(h,/1,250\/8,000 steps/);});
});
// Execute the real shared confirmation handler through a minimal event fixture.
// This measures callback gating, not browser hit testing or focus behavior.
await check('shared destructive review requires exact text and suppresses repeat dispatch', async () => {
  const helper = source.slice(source.indexOf('function openPetDestructionReview('),source.indexOf('\nfunction wireLabLinks('));
  let wrap, commits = 0, closed = 0;
  const el = () => ({ disabled:false, value:'', textContent:'', events:{}, addEventListener(k,fn){this.events[k]=fn;} });
  const controls = { '#pdIn':el(), '#pdGo':el(), '#pdStatus':el() };
  Object.assign(context,{ openSheet: (html,opts) => { controls['#pdGo'].disabled = /id="pdGo" disabled/.test(html); wrap={isConnected:true,html,opts};return wrap; }, $:id=>controls[id], history:{back(){closed++;}} });
  vm.runInContext(helper,context);
  const launch = () => context.openPetDestructionReview({title:'Review',html:'Loss',typed:true,commit:async()=>{commits++;return {close:true};}});
  launch();
  assert.equal(controls['#pdIn'].value,''); assert.equal(controls['#pdGo'].disabled,true);
  await controls['#pdGo'].events.click(); assert.equal(commits,0);
  for (const text of ['animate',' ANIMATE','ANIMATE ','DESTROY']) { controls['#pdIn'].value=text;controls['#pdIn'].events.input();assert.equal(controls['#pdGo'].disabled,true);await controls['#pdGo'].events.click(); }
  assert.equal(commits,0);
  controls['#pdIn'].value='ANIMATE'; controls['#pdIn'].events.input(); assert.equal(controls['#pdGo'].disabled,false);
  await Promise.all([controls['#pdGo'].events.click(),controls['#pdGo'].events.click()]); assert.equal(commits,1); assert.equal(closed,1);
  await controls['#pdGo'].events.click();assert.equal(commits,1);
  // Faulty variant enables a destructive action on the wrong text.
  vm.runInContext(helper.replace('accepts(input.value)', 'true'),context);
  launch(); controls['#pdIn'].value='DESTROY'; controls['#pdIn'].events.input();
  assert.throws(()=>assert.equal(controls['#pdGo'].disabled,true), 'mutated handler must fail the exact-text guard');
  assert.match(source.slice(source.indexOf("$$('[data-destroy]'"),source.indexOf("$$('[data-offsp]'")),/openPetDestructionReview\(/);
});
console.log(`${passed} passed, 0 failed. Browser, pixels, engine transactions and IndexedDB durability unrun by this UI guard.`);
