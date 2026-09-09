/* Frozen rarity-out work order. Execute shipped markup in Node, without sockets.
 * CONTROL rejects a label and tier class. The red proof restores the removed
 * pet-panel label in js/app.js and runs this audit, then restores the fix.
 * This does not prove browser layout, paint or interaction.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as pets from '../js/pets.js';
import * as loot from '../js/loot.js';
import * as pdk from '../js/paddock-cards.js';
import { GEAR_ITEMS, GEAR_SLOT_LABELS } from '../js/gear.js';
import { BH_BY_ID, BH_SLOTS, PET_SHOP, bhAsset } from '../data/boneheadz.js';
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const deps = { ...pets, ...loot, BH_BY_ID, BH_SLOTS, PET_SHOP, bhAsset, esc,
  RAR_ORDER: Object.keys(loot.RARITIES), S: { shinyPets: new Set() },
  petSpriteHtml: () => '<img>', petPortraitHtml: () => '<img>', petShotHtml: () => '<img>',
  sparkIco: () => '*', ICONS: { star: () => '*', coin: () => 'coin' },
  canWear: () => false, PC_WEAR_CSS: 200 };
function cut(start, end) {
  const a = app.indexOf(start), b = app.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `CONTROL missing production block ${start}`);
  return app.slice(a, b);
}
function fn(name) { return cut(`function ${name}(`, '\n}') + '\n}'; }
function run(code, args = {}) {
  const all = { ...deps, ...args };
  return new Function(...Object.keys(all), code)(...Object.values(all));
}
function clean(html) {
  assert(html.length > 0, 'CONTROL empty surface');
  assert.doesNotMatch(html, /\br-(?:common|uncommon|rare|epic|legendary|undefined)\b/i, 'pet rarity tier class');
  // The earned shiny variant is explicitly exempt from removal.
  const text = html.replace(/<[^>]*>/g, ' ').replace(/Ultra-rare variant/g, 'SHINY variant');
  assert.doesNotMatch(text, /\b(?:common|uncommon|rare|epic|legendary|rarity)\b/i, 'pet rarity label');
}
let passed = 0, failed = 0;
function check(name, action) {
  try { action(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
check('CONTROL label and class detectors reject regressions', () => {
  assert.throws(() => clean('<small>Epic</small>'), /pet rarity label/);
  assert.throws(() => clean('<div class="pet-card r-common">Pet</div>'), /pet rarity tier class/);
  clean('<b>SHINY</b><small>Ultra-rare variant</small>');
});
check('SHOP pet hero and accessories omit rarity in owned and locked states', () => {
  for (const ownedCos of [new Set(), new Set([PET_SHOP.pet.id]), new Set(Object.keys(BH_BY_ID))]) {
    const html = run(fn('petShelfHtml') + '\nreturn petShelfHtml(ownedCos, 999999);', { ownedCos });
    clean(html); assert(html.includes(BH_BY_ID[PET_SHOP.pet.id].name));
  }
});
check('PANEL every species retains stats, level and shiny without rarity', () => {
  for (const sp of pdk.PET_SPECIES) for (const shiny of [false, true]) {
    const html = run(fn('petPanelHtml') + '\nreturn petPanelHtml(sp, {});',
      { sp: sp.id, S: { shinyPets: new Set(shiny ? [sp.id] : []) } });
    clean(html); assert(html.includes('Pet level 1')); assert(html.includes('pet-stats'));
    assert.equal(html.includes('SHINY'), shiny);
  }
});
check('HATCH every species, duplicate and shiny reveal omits rarity', () => {
  for (const item of pdk.PET_SPECIES) for (const shiny of [false, true]) for (const dupe of [false, true]) {
    const html = run(cut('  const hatchName =', '  const wrap2 = openSheet(') + '\nreturn revealHtml;',
      { item, res: { shiny, dupe, morph: 'base' } });
    clean(html); assert(html.includes(item.name)); assert.equal(html.includes('SHINY'), shiny);
  }
});
check('STABLE cards, initial caption and focus repaint retain family and shiny', () => {
  for (const sp of pdk.PET_SPECIES) for (const shiny of [false, true]) {
    const x = { iid: 'pet', sp: sp.id, shiny, lineage: 2, morph: 'base' };
    const args = { roster: [x], focused: x, cfIid: x.iid, bank: {}, eqIid: x.iid, sel: [],
      bySp: { [x.sp]: [x] }, nicks: {}, nickTag: () => '', kinChips: () => '', cfDots: '' };
    const cards = run(cut('    const cfCards =', '    const cfDots =') + '\nreturn cfCards;', args);
    clean(cards); assert.equal(cards.includes('SHINY'), shiny);
    const caption = run(cut('    const cfCaption =', '    const cfActs =') + '\nreturn cfCaption;', args);
    clean(caption); assert(caption.includes(pets.familyOf(sp.id).name));
    const nodes = { b: {}, '.role': {}, '.cf-meta': {} };
    run(cut('    function repaintFocus() {', '      const isEq = inst.iid === eqIid, inSel =') + '\n}\nrepaintFocus();',
      { ...args, body: {}, $: selector => selector === '.cf-cap' ? {} : nodes[selector] });
    clean(nodes['.role'].innerHTML);
    assert.equal(nodes['.role'].innerHTML, `<span class="dot"></span>${pets.familyOf(sp.id).name}`);
  }
});
check('PADDOCK models and all owned/locked tiles carry no rarity fields or glow', () => {
  assert.equal('PDK_RARITY' in pdk, false);
  for (const shiny of [false, true]) {
    const roster = pdk.PET_SPECIES.map((sp, i) => ({ iid: String(i), sp: sp.id, shiny, bond: 2 }));
    for (const rows of [[], roster]) {
      for (const m of [...pdk.gridModel(rows), ...rows.map(pdk.cardModel)]) {
        for (const key of ['rarity', 'rarityColor', 'glow']) assert.equal(key in m, false, key);
      }
      const html = pdk.panelHtml(rows, { count: 0 }); clean(html);
      assert.equal((html.match(/class="pdk-tile/g) || []).length, pdk.PET_SPECIES.length + 1); // Egg tile too.
    }
    for (const row of roster) {
      const html = pdk.sliderHtml(roster, row.sp); clean(html);
      assert.equal(html.includes('SHINY'), shiny); clean(pdk.lockedCardHtml(row.sp));
    }
  }
});
check('RECEIPTS pet result and delivery cards omit rarity; gear keeps every tier', () => {
  const code = fn('crateResultToCard') + '\n' + fn('packCardHtml');
  for (const item of pdk.PET_SPECIES) for (const type of ['cosmetic', 'dupe']) {
    const html = run(code + '\nreturn packCardHtml(crateResultToCard(r));', { r: { type, item, coins: 20 } });
    clean(html); assert(html.includes(item.name));
  }
  const delivery = app.split('\n').find(l => l.includes('if (p.pet && BH_BY_ID[p.pet])'));
  assert(delivery, 'CONTROL delivery producer exists');
  const cards = run('let hadCard = false; const cards = [];\n' + delivery + '\nreturn cards;',
    { p: { pet: 'C1' }, kind: 'CREW DELIVERY', note: 'Welcome' });
  assert.equal(cards.length, 1);
  clean(run(fn('packCardHtml') + '\nreturn packCardHtml(c);', { c: cards[0] }));
  const outer = app.split('\n').find(l => l.includes('reveal.className = `pack-reveal'));
  assert(outer, 'CONTROL outer reveal exists');
  const reveal = {};
  run(outer, { reveal, c: cards[0], first: false, CRATE_SEQ: {}, crate: null }); clean(reveal.className);
  for (const [rarity, r] of Object.entries(loot.RARITIES)) {
    const html = run(fn('packCardHtml') + '\nreturn packCardHtml(c);', { c: { name: 'Gear', rarity, kind: 'GEAR' } });
    assert(html.includes(`r-${rarity}`)); assert(html.includes(`>${r.label}</div>`));
    assert.throws(() => clean(html), /pet rarity/);
    run(outer, { reveal, c: { rarity }, first: false, CRATE_SEQ: {}, crate: null });
    assert(reveal.className.includes(`r-${rarity}`));
  }
});
check('PADDOCK field sprites have no species glow', () => {
  const source = cut('  const petHtml = r => {', '\n  return `');
  for (const kind of ['fly', 'hover', 'walk', 'flop']) {
    const html = run(source + '\nreturn petHtml(r);', { r: { iid: 'pet', sp: 'C2', shiny: true },
      places: { pet: { kind, w: 60, x: 20, y: 100, x0: 0, x1: 200, dur: 10 } } });
    clean(html); assert.doesNotMatch(html, /pdk-gold|pdk-epic/);
  }
  assert.doesNotMatch(css, /pdk-gold|pdk-epic/);
});
check('SOURCE pet-only help, level-up, breeding and Kennel contain no tier labels', () => {
  const blocks = [fn('openPetsHelp'), fn('openPetLevelUp'), fn('openPetBreedResult'),
    cut('  if (newPet) {', '  const bits = [];'),
    cut('async function openKennel()', '\nif (typeof window')];
  for (const block of blocks) {
    const code = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /RARITIES|\.rarity|\b(?:rarity|common|uncommon|epic|legendary)\b/i);
  }
});
check('SOURCE pet stage classes and accessory wardrobe cannot emit rarity', () => {
  const stages = app.split('\n').filter(l => /class="[^"\n]*(?:petlvl-avatar|petmini)/.test(l));
  assert(stages.length >= 4, 'CONTROL all four pet stages');
  for (const line of stages) assert.doesNotMatch(line, /rarity|r-\$\{/);
  const wear = app.split('\n').find(l => l.includes('data-petwear="${i.id}"'));
  assert(wear); assert.doesNotMatch(wear, /rarity|r-\$\{/);
  // Presentation-only scope preserves the existing species order and balance data.
  assert.match(cut('    const bySp = {};', '    const a = sel[0]'), /const order = Object\.keys\(bySp\)\.sort\(/);
});
check('CSS pet tier rules are gone and shared gear callers still own their rules', () => {
  assert.doesNotMatch(css, /\.(?:rar-lbl|pet-kind)\b|\.(?:pet-card|hatch-pet|hatch-prize|t3-petcard|cf-card|pdk-tile)\.r-(?:common|uncommon|rare|epic|legendary)|\.cf-cap \.dot\.r-/);
  for (const selector of ['.rk-rar', '.rk.r-epic', '.ward-cell.r-common', '.pack-card.r-legendary', '.rar-chip']) {
    assert(css.includes(selector), `gear CSS lost ${selector}`);
  }
  assert(app.includes('const rackTag = r => `<span class="rk-rar">${r.toUpperCase()}</span>`'));
  assert(app.includes('class="gear-inspect r-${ig.rarity}"'));
  assert(app.includes('${rar.label} · ${GEAR_SLOT_LABELS[ig.slot]}'));
});
check('CONTROL actual gear, cosmetic, crate odds and weapon rack producers retain rarity', () => {
  const code = fn('gearToCard') + '\n' + fn('crateResultToCard') + '\n' + fn('packCardHtml');
  const rackCode = cut('  const rackTile = (id, coin, dust, thumb) => {', '  /* AURAS GO ON WEAPONS');
  const rackTag = run(cut('  const rackTag = r =>', '  /* THE RACK STAGES') + '\nreturn rackTag;');
  assert(new Set(GEAR_ITEMS.map(g => g.rarity)).size >= 3, 'CONTROL statted gear sample');
  assert(GEAR_ITEMS.length > 0, 'CONTROL actual gear catalogue is non-empty');
  for (const gear of GEAR_ITEMS) {
    const html = run(code + '\nreturn packCardHtml(crateResultToCard(r));',
      { r: { type: 'gear', gear }, GEAR_SLOT_LABELS, STAT_CODE: {}, TALENT_DESC: {} });
    assert(html.includes(`r-${gear.rarity}`));
    assert(html.includes(`>${loot.RARITIES[gear.rarity].label}</div>`));
  }
  for (const [rarity, meta] of Object.entries(loot.RARITIES)) {
    const gear = GEAR_ITEMS.find(g => g.rarity === rarity);
    const item = Object.values(BH_BY_ID).find(i => i.slot === 'IR' && i.rarity === rarity);
    assert(item, `CONTROL missing actual rack tier ${rarity}`);
    // The live gear catalog has three tiers; cosmetics and the rack have all five.
    const rows = [{ type: 'cos', item }, { type: 'dupe', item, coins: 20 }];
    if (gear) rows.push({ type: 'gear', gear }, { type: 'geardupe', gear, coins: 20 });
    for (const r of rows) {
      const html = run(code + '\nreturn packCardHtml(crateResultToCard(r));',
        { r, GEAR_SLOT_LABELS, STAT_CODE: {}, TALENT_DESC: {} });
      assert(html.includes(`r-${rarity}`), `reward lost ${rarity} class`);
      assert(html.includes(`>${meta.label}</div>`), `reward lost ${meta.label}`);
    }
    const html = run(rackCode + '\nreturn rackTile(id, 100, 10);', {
      id: item.id, rackTag, rackOwns: () => false, fitClass: () => '', RACK_BASE: {},
      avatarLayersHtml: () => '<img>', rackBuyRow: () => '<button>Buy</button>',
      ICONS: { searchIco: () => '*' },
    });
    assert(html.includes(`class="rk r-${rarity}"`));
    assert(html.includes(`<span class="rk-rar">${rarity.toUpperCase()}</span>`));
  }
  const odds = run(cut('        const line = kind => crateOdds(kind)', '      })()}'));
  assert(odds.includes('Crate odds'));
  for (const meta of Object.values(loot.RARITIES)) assert(odds.includes(meta.label));
  assert(odds.includes('%'), 'crate odds percentages disappeared');
});
console.log(`${passed}/${passed + failed} pet rarity checks passed`);
process.exitCode = failed ? 1 : 0;
