// Frozen BUILD 2b, 2026-09-08. Production UI renderers, no browser or sockets.
// Each group has a nonempty CONTROL and a deliberately faulty variant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { MORPHS, MORPH_LABEL, ownedPairs, ownedCellCount, petLevel, isMorph } from '../js/pets.js';
import { eggProgress } from '../js/loot.js';
import { BH_BY_ID } from '../data/boneheadz.js';
const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const pure = source.split('// LAB UI PURE BEGIN:')[1].split('\n').slice(1).join('\n').split('// LAB UI PURE END')[0];
assert.ok(pure.length > 1000, 'CONTROL nonempty production renderers');
const context = vm.createContext({ MORPHS, MORPH_LABEL, BH_BY_ID, KENNEL_SPECIES: ['C1','C2','C3','C4','C5','C6'].map(id => BH_BY_ID[id]), esc: x => String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'), petSpriteHtml: (sp, px, ground, opts) => { assert.equal(typeof ground, 'boolean'); assert.equal(opts.shiny, false); assert.equal(opts.wear, null); return `<img src="${sp}-${opts.morph}.png" width="${px}">`; } });
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
  const grade = h => { assert.equal((h.match(/data-recipe=/g)||[]).length, 3); assert.match(h,/Choose input 1/); assert.match(h,/Choose input 2/); assert.match(h,/data-lab-review disabled/); assert.match(h,/1\/36/); for (const dest of ['collection','eggs','melt','breed']) assert.match(h,new RegExp(`data-lab-nav="${dest}"`)); assert.match(h,/Melting clears the pile. Breeding builds strength. The Laboratory builds the collection./); assert.match(h,/1,250\/8,000 steps/); };
  rejectsMutation(html, html.replace('data-recipe="toxic-rose"','removed'), grade);
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
  const grade = h => { for (const text of ['&lt;Bite&gt;','level 10, 82,001 banked training steps','level 1, 731 banked training steps','lineage 4 and bond 3/5','Fang','Non-shiny','equipped pet','Type ANIMATE','Toxic','Rose','Midnight','Collection after: 1/36','20 Bone Dust','Animate pays no dust']) assert.ok(h.includes(text),text); assert.doesNotMatch(h,/<Bite>/); };
  rejectsMutation(html,html.replace('82,001','82,000').replace('82,001','82,000'),grade);
  assert.equal(ui.labNeedsTyped(q),true);
  assert.equal(ui.labNeedsTyped(quote({ branches: [{ morph: 'midnight', lost: [], gained: [], afterCount: 3 }] })),false);
  for (const extra of [{ bankedSteps: 1 },{ level: 2 },{ nickname: 'N' },{ lineage: 1 },{ bond: 1 },{ talents: ['Fang'] },{ equipped: true }]) assert.equal(ui.labNeedsTyped(quote({ inputs: [pet('a','toxic',extra),pet('b','rose')],branches: [{ lost: [] }] })),true);
});
await check('every certain reveal is direct and only two-way outcomes get surprise', () => {
  const final = ui.labRevealHtml(quote());
  rejectsMutation(final,final.replace('lab-direct','lab-surprise'),h => { assert.match(h,/lab-direct/); assert.match(h,/Midnight was guaranteed by this recipe/); assert.match(h,/C1-midnight.png/); assert.doesNotMatch(h,/lab-surprise|roulette|gamble|50%/); });
  const singleton = ui.labRevealHtml(quote({ recipe: 'base-base', protection: 'collection', distribution: [{ morph: 'ember', weight: 22 }], result: { iid: 'new', morph: 'ember' }, branches: [{ morph: 'ember', lost: [], gained: ['C1|ember'], afterCount: 2 }] }));
  assert.match(singleton,/Ember was guaranteed by protection/); assert.match(singleton,/lab-direct/);
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
