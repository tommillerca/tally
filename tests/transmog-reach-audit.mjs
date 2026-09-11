// R9 frozen work order. Production render functions and loot services in Node.
// Bounds: no viewport or hit-test claim; commit reach has its own browser audit.
// PROVE-RED: run this new guard before the R9 source edits. Arrival, four labels,
// data counts and acquisition route rows must fail against the frozen baseline.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import './mem-idb.mjs';
import * as L from '../js/loot.js';
import * as D from '../js/db.js';
import { GEAR_ITEMS } from '../js/gear.js';
import { BH_ITEMS, bhFamilies } from '../data/boneheadz.js';
import { initLootIfNeeded } from '../js/game.js';
import { addDays, dateKey } from '../js/nutrition.js';
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
let passed = 0, failed = 0, sequence = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); }
}
function block(from, to) {
  const start = app.indexOf(from), end = app.indexOf(to, start);
  assert(start >= 0 && end > start, `production block exists: ${from}`);
  return app.slice(start, end);
}
async function seed(values = {}) {
  D.useDbName(`r9-${++sequence}`);
  for (const [k,v] of Object.entries(values)) await D.kvSet(k,v);
}
const bar = block('    const mogBarHtml =', '\n\n    /* ================= THE COLOURWAY');
function renderBar(state, mogOn = true) {
  return vm.runInNewContext(`${bar}; mogBarHtml()`, { mogOn, mogState: () => state,
    wornGear: null, nameOf: () => 'Hat', esc: String, dustIco: '', dustBal: 20 });
}
await check('ARRIVAL disabled second step renders before a choice', () => {
  const html = renderBar({sel:'', cost:0, afford:true, changed:false});
  assert.match(html, /class="look-bar mog-bar/);
  assert.match(html, /<button[^>]*disabled>Wear it<\/button>/);
  assert(!html.includes('data-look-apply='));
});
await check('CONTROL active selection enables commit; inactive panel stays absent', () => {
  assert.match(renderBar({sel:'H10-3',cost:6,afford:true,changed:true}), /data-look-apply="H10-3"/);
  assert.equal(renderBar({}, false), '');
});
const tag = block('    const costTag =', '\n    /* THE BAR');
const tagFor = (id, tm, wornGear, price=0) => vm.runInNewContext(`${tag}; costTag(id)`, {
  ...L, id, slot:'H', tm, wornGear, lookPriceMap:{[id]:price}, dustIco:'dust', esc:String,
});
const labels = [
  ['', {}, {}, 'Free'],
  ['H10-3', {H:'H10-3'}, {}, 'Wearing'],
  ['H10-3', {}, null, 'Free: no stats'],
  ['H10-3', {}, {}, 'Paid'],
];
for (const [id,tm,gear,label] of labels) await check(`ZERO ${label}`, () => {
  const html = tagFor(id,tm,gear);
  if (label === 'Free' || label === 'Free: no stats') assert.equal(html, '', 'free labels emit no element or spacing');
  else assert.match(html, new RegExp(`>${label}<`));
});
await check('RESET and HIDE retain actions without free labels or cost badges', () => {
  const tiles = block('        const lookTilesHtml =', '        /* ---------------------------------------------------------------- v2');
  const html=vm.runInNewContext(`${tiles}; lookTilesHtml([])`, {...L,
    cell:(value,inner)=>`<button data-look="${value}">${inner}</button>`,
    ownArt:{}, bhTrim:()=>'', bhAsset:()=>'', fbTintAttr:()=>'', esc:String,
    wornGear:null, tm:{}, slot:'H', ICONS:{hidden:()=>''}, bhFamilies:()=>new Map(),
  });
  assert.match(html,/>Reset</); assert.match(html,/>Hide</); assert.doesNotMatch(html, /Free/);
  assert(!html.includes('look-cost'), 'free actions use their existing caption, not a second overlapping badge');
});
await check('ITEM markup drops free badges and preserves state and dust badges', () => {
  const tiles = block('        const lookTilesHtml =', '        /* ---------------------------------------------------------------- v2');
  for (const [current, wornGear, price, expected] of [
    ['', null, 0, ''], ['H10-3', null, 0, 'Wearing'], ['', {}, 0, 'Paid'], ['', {}, 12, '12dust'],
  ]) {
    const item = {id:'H10-3', name:'Hat', rarity:'common'};
    const html = vm.runInNewContext(`${tiles}; lookTilesHtml([item])`, {...L, item,
      cell:(value,inner)=>`<button data-look="${value}">${inner}</button>`,
      ownArt:{}, bhTrim:()=>'', bhAsset:()=>'', fbTintAttr:()=>'', esc:String,
      wornGear, tm:{H:current}, slot:'H', ICONS:{hidden:()=>''},
      bhFamilies:items=>new Map([['hat',items]]), RAR_ORDER:['common'], sel:current, cur:current,
      lookArt:()=>'<canvas></canvas>', rarityTagHtml:()=>'',
      costTag:id=>tagFor(id,{H:current},wornGear,price),
    });
    assert.doesNotMatch(html, /Free/);
    const inner = html.match(/<button data-look="H10-3">([\s\S]*?)<\/button>/)[1];
    if (!expected) assert.equal(inner, '<canvas></canvas>', 'no badge, placeholder or whitespace remains');
    else assert.match(inner, new RegExp(`>${expected}<`));
  }
});
await check('REFRESH inserts Wearing after an absent badge and removes a newly free badge', () => {
  const source = block("        const tag = $('.look-cost', c);", '\n      }\n      // Keep the disabled');
  let markup = '';
  const c = {dataset:{look:'H10-3'}, insertAdjacentHTML:(_where,html)=>{markup=html;}};
  const tag = {set outerHTML(html) {markup=html;}};
  for (const current of ['H10-3', '', 'H10-3']) {
    vm.runInNewContext(source, {c, $:()=>markup ? tag : null, lookPriceMap:{'H10-3':0},
      costTag:id=>tagFor(id,{H:current},null)});
    assert.equal(markup, current ? '<span class="look-cost paid">Wearing</span>' : '');
  }
});
await check('CONTROL priced tile retains dust amount and hide is free', () => {
  assert.match(tagFor('H10-3',{}, {},12), />12dust</);
  assert.equal(L.transmogCost(L.TRANSMOG_HIDE),0);
});
const gear = GEAR_ITEMS.find(g => g.slot === 'H');
const alt = BH_ITEMS.find(i => i.slot === 'H' && i.id !== gear.artId && !i.default);
await check('PRICE four free reasons and an unpaid gear look', async () => {
  await seed();
  assert.equal(await L.transmogPrice('H',''),0);
  assert.equal(await L.transmogPrice('H',L.TRANSMOG_HIDE),0);
  assert.equal(await L.transmogPrice('H',alt.id),0);
  await D.kvSet('gearloadout',{H:gear.id});
  assert.equal(await L.transmogPrice('H',alt.id),L.transmogCost(alt.id));
  await D.kvSet('transmog',{H:alt.id});
  assert.equal(await L.transmogPrice('H',alt.id),0);
  await L.markPaid('H',alt.id);
  await D.kvSet('transmog',{});
  assert.equal(await L.transmogPrice('H',alt.id),0);
});
await check('COUNTS data counts individual looks; alternatives exclude baseline and empty slots', () => {
  const owned = new Set([gear.artId, alt.id]);
  const counts = L.wardrobeLookCounts(owned,{H:gear.artId});
  assert.equal(counts.collected, 2);
  assert.equal(counts.alternatives, 1);
  assert.equal(L.wardrobeLookCounts(owned,{}).alternatives,0);
  assert.equal(L.wardrobeLookCounts(new Set([gear.artId]),{H:gear.artId}).alternatives,0);
  assert.equal(counts.total, BH_ITEMS.filter(i=>!i.default).length);
  const family = [...bhFamilies(BH_ITEMS.filter(i=>i.slot==='H' && !i.default)).values()].find(items=>items.length>1);
  assert(family, 'CONTROL multi-colour family exists');
  const pair = family.slice(0,2);
  assert.equal(bhFamilies(pair).size,1);
  assert.equal(L.wardrobeLookCounts(new Set(pair.map(i=>i.id)),{H:pair[0].id}).collected,2,
    'two collected colourways remain two looks even when the renderer draws one family tile');
  assert.equal(L.wardrobeLookCounts(owned,{H:alt.id},{H:gear.id}).alternatives,1,
    'statted gear supplies the baseline');
  assert.match(app, /wardrobeLookCounts\(looksHave,/);
});
await check('ROUTES picker explains and opens existing acquisition destinations', () => {
  assert.match(app, /data-look-source="crates"/);
  assert.match(app, /data-look-source="shop"/);
  const source = block("    $$('[data-look-source]'", '\n    // --- saved fits:');
  const targets=[];
  vm.runInNewContext(source, {content:{}, $$:()=>['crates','shop'].map(tab=>({
    dataset:{lookSource:tab}, addEventListener:(_event,fn)=>fn(),
  })), openCharacter:tab=>targets.push(tab)});
  assert.deepEqual(targets,['crates','shop']);
});
await check('NEW PLAYER welcome crates supply a progression route without buying power', async () => {
  await seed();
  await initLootIfNeeded();
  const inv=await D.db.all('inv');
  assert.deepEqual(inv.filter(r=>r.kind==='crate').map(r=>r.crate).sort(),['daily','golden']);
  assert.equal(await L.boneDust(),0);
  assert.equal((await L.ownedGearIds()).size,0);
  assert.equal((await L.fits()).length,0);
  // v546 raised the day-one welcome grant from 40 to 340 (DAYONE_TOPUP). This
  // row was authored on v545; the number is the shipped grant, not a tuning.
  assert.equal(await L.coins(),340);
});
await check('DEMO isolated seed has coins and unopened crates, no dust, gear or fits', async () => {
  await seed();
  assert(app.includes("if (S.demo) { useDbName('tally-demo');"));
  // Execute the actual inventory/economy part of seedDemo, before food logging.
  const source = block('async function seedDemo() {', '  const g = id => GENERIC_FOODS');
  await vm.runInNewContext(`${source}}; seedDemo()`, { ...D, ...L,
    computeTargets:()=>({}), addDays, dateKey });
  assert.equal(await L.coins(),340);
  assert.equal(await L.boneDust(),0);
  assert.equal((await L.ownedGearIds()).size,0);
  assert.equal((await L.fits()).length,0);
  const inv = await D.db.all('inv');
  assert.equal(inv.filter(r=>r.kind==='crate').length,2);
  assert.equal(inv.filter(r=>r.kind==='cos').length,14);
  const counts=L.wardrobeLookCounts(await L.collectedLooks(),await L.equipped({raw:true}),await L.gearLoadout());
  assert.equal(counts.alternatives,0);
  console.log(`EVIDENCE demo counts ${JSON.stringify(counts)}; coins=340 dust=0 gear=0 fits=0 crates=2`);
});
await check('COMMIT collected look debits dust once, preserves gear and appearance ownership', async () => {
  await seed({gearloadout:{H:gear.id},bonedust:100});
  await L.grantGear(gear.id,'r9'); await L.grantCosmetic(alt.id,'r9');
  const before = await D.db.all('inv');
  const result=await L.applyTransmog('H',alt.id);
  assert.equal(result.ok,true); assert.equal(result.cost,L.transmogCost(alt.id));
  assert.equal(await L.boneDust(),100-result.cost);
  assert.deepEqual(await D.db.all('inv'),before);
  assert.equal((await L.gearLoadout()).H,gear.id);
  await L.clearTransmog('H');
  assert.equal((await L.applyTransmog('H',alt.id)).cost,0);
});
await check('RETENTION melting keeps the earned appearance and pays dust', async () => {
  await seed(); await L.grantGear(gear.id,'r9');
  const result = await L.disenchantGear(gear.id);
  assert.equal(result.ok,true);
  assert((await L.collectedLooks()).has(gear.artId));
  assert.equal(await L.boneDust(),L.gearDustValue(gear));
  assert(!(await L.ownedGearIds()).has(gear.id)); // existing destructive policy, disclosed deviation
});
await check('COPY melt disclosure is before the act and dust explanation is unconditional', () => {
  assert.match(app,/Melting consumes the gear and its stats\. Its look is yours forever\./);
  assert.match(app,/Every piece pays Bone Dust\. Use dust for looks in the Dressing Room and the weekly Rack\./);
  assert(!app.includes('It costs dust, and only the first time.'));
  assert(!app.includes('} · pick your fit</div>'));
});
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
