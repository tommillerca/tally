// R48-A, 2026-09-07. Node proof: production importAll/equipment and extracted
// production Dressing Room/settlement bodies. Storage is mem-idb; DOM and FX
// are small adapters. Real browser arrival/decode stays in dressing-room-audit.
// CONTROL cases keep empty fixtures from passing. Prove red on a throwaway
// tree with original app.js/boneheadz.js and the five original audit files.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import * as dbmod from '../js/db.js';
import * as loot from '../js/loot.js';
import * as game from '../js/game.js';
import * as cooking from '../js/cooking.js';
import * as art from '../data/boneheadz.js';
import * as gear from '../js/gear.js';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const readTest = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const esc = x => String(x).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
let passed = 0, failed = 0, seq = 0;
async function test(name, run) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `SETUP production boundaries exist: ${start}`);
  return source.slice(a, b);
}
const lookSetup = between(app, '    const wornGear = gearLo[slot]', '    /* ================= THE COLOURWAY RAIL');
// R9, 2026-09-10: the end anchor used to include the line that FOLLOWED the
// panel, so inserting the acquisition links between the panel's closure and
// ${mogBarHtml()} broke the extraction. The panel ends at its own closure.
const lookPanel = between(app, '        /* TRANSMOG. Offered', '      })()}\n');
async function dressingRoom(id, replace, asset = art.bhAsset, gearId = null) {
  dbmod.useDbName(`r48-art-${++seq}`);
  await dbmod.importAll({ app: 'tally', version: 3, log: [], kv: [
    { k: 'equipped', v: id == null ? {} : { H: id } },
    { k: 'gearloadout', v: gearId ? { H: gearId } : {} },
  ] }, { replace });
  const rawEq = await loot.equipped({ raw: true });
  assert.equal(rawEq.H, id ?? undefined, 'SETUP importAll must reach raw equipment');
  const context = vm.createContext({ ...art, ...gear, ...loot, bhAsset: asset,
    gearLo: await loot.gearLoadout(), rawEq, slot: 'H', S: { mogv2: true, lookPreview: art.BH_ITEMS.find(i => i.slot === 'H').id },
    look: await loot.equipped(), tm: {}, looks: new Set(art.BH_ITEMS.filter(i => i.slot === 'H').map(i => i.id)), dustBal: 100,
    ICONS: new Proxy({}, { get: () => () => '<i></i>' }), esc, bhTrim: x => x,
    avatarLayersHtml: () => '<span class="figure-adapter"></span>', fbTintAttr: () => '', rarityTagHtml: () => '',
    RAR_ORDER: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
  });
  return vm.runInContext(`(async () => { ${lookSetup}\nreturn { html: (() => { ${lookPanel}\n})(), bar: mogBarHtml(), baseArtId }; })()`, context);
}
await test('CONTROL known cosmetic and gear retain Dressing Room tiles and controls', async () => {
  const known = art.BH_ITEMS.find(i => i.slot === 'H');
  const knownGear = gear.GEAR_ITEMS.find(i => i.slot === 'H');
  for (const gearId of [null, knownGear.id]) {
    const r = await dressingRoom(known.id, true, art.bhAsset, gearId);
    assert.match(r.html, /data-look=""/); assert.match(r.bar, /data-look-apply/);
    assert.equal(r.baseArtId, gearId ? knownGear.artId : known.id);
  }
});
await test('CONTROL absent equipment gives an explanatory panel without controls', async () => {
  const r = await dressingRoom(null, true);
  assert.match(r.html, /mog-empty/); assert.equal(r.bar, '');
});
for (const replace of [true, false]) {
  await test(`RESTORE ${replace ? 'replace' : 'merge'} unknown truthy H keeps Dressing Room markup`, async () => {
    let r, error;
    try { r = await dressingRoom('sp-unresolvable-r48', replace); } catch (e) { error = e; }
    assert.ok(r?.html.length > 0, `rendered ${r?.html.length || 0} characters; ${error?.message || ''}`);
    assert.match(r.html, /mog-empty/);
    assert.doesNotMatch(r.html + r.bar, /data-look(?:=|-apply)|mog-go/);
    assert.equal((await dbmod.kvGet('equipped')).H, 'sp-unresolvable-r48', 'unknown stored data must survive');
  });
}
await test('BOUNDARY unknown artwork never reaches asset generation or Apply controls', async () => {
  const r = await dressingRoom('sp-unresolvable-r48', true, item => {
    assert.ok(item, 'Dressing Room passed unresolved artwork to bhAsset'); return art.bhAsset(item);
  });
  assert.equal(r.bar, ''); assert.equal(r.baseArtId, null);
});
await test('ASSET undefined and null return a drawable placeholder; every catalogue asset is unchanged', () => {
  for (const item of [undefined, null]) {
    assert.match(art.bhAsset(item), /^data:image\/svg\+xml,/);
    assert.match(decodeURIComponent(art.bhAsset(item).split(',')[1]), /<svg[\s\S]*<text/);
  }
  for (const item of art.BH_ITEMS_WITH_UNRELEASED) assert.equal(art.bhAsset(item), item.file || `assets/bh/${item.slot}/${item.id}.png`);
});

// Execute the shipped listener, including its pre-navigation errors array.
const boot = readTest('godmode.js');
const collector = between(boot, '    const errors = [];', '    // ?demo puts us');
const page = new EventEmitter();
const errors = vm.runInNewContext(`(() => { ${collector}\nreturn errors; })()`, { page, console: { log() {} } });
// 2026-09-07: the five proven-dead assertions named by the frozen work order.
const audits = ['emporium', 'hero-share', 'shop-door', 'purchase-write-failure', 'tabbar-contrast'];
for (const name of audits) {
  await test(`ERRORS ${name} observes clean, first-load and later errors`, () => {
    const source = readTest(`${name}-audit.mjs`);
    const row = source.match(/ok\('NO page errors',[^\n]+/);
    assert.ok(row, 'SETUP real error assertion exists');
    const verdict = () => vm.runInNewContext(row[0], { errors, ok: (_name, pass) => pass });
    errors.length = 0; assert.equal(verdict(), true, 'CONTROL clean stream must pass');
    page.emit('pageerror', new Error('r48-first-load'));
    page.emit('pageerror', new Error('r48-later-action'));
    assert.equal(verdict(), false, `${name}: two collected errors still report PASS`);
    assert.match(source, /const \{ browser, page, errors \} = await boot\(base\)/, 'audit must consume the boot-time stream');
  });
}

const refreshSource = between(app, '/* refreshLevelChip:', '/* set when a new service worker');
const settleSource = between(app, '  async function settle() {', "    /* Spend the day's attempt");
async function settleChip(winner, webdriver, source = refreshSource) {
  dbmod.useDbName(`r48-chip-${++seq}`);
  await game.award(`r48-before-${seq}`, 'test', 195, 'Before fight');
  const levelText = { textContent: 'STALE' }, title = { textContent: 'STALE' }, name = { textContent: 'Real Player' };
  const xp = { innerHTML: 'STALE' }, chip = { isConnected: true };
  const reads = [];
  const context = vm.createContext({ ...dbmod, ...loot, ...game, ...cooking, window: {}, navigator: { webdriver },
    document: { querySelectorAll: () => [] },
    $: selector => ({ '#lvlChip': chip, '.hero-lvrow .hero-lv': levelText, '.hero-title': title, '.hero-name': name, '.hero-xprow': xp })[selector] || null,
    esc, XP_PIPS: Number(app.match(/const XP_PIPS = (\d+);/)[1]),
    totalXp: () => { const p = game.totalXp(); reads.push(p); return p; },
    settled: false, fight: { over: { winner } }, staked: false, foeCfg: { mode: 'spar' }, fightId: `r48-${seq}`,
    el: () => null, add: null, markDowned() {}, renderActions() {}, trackEvent() {},
    FIGHT_ROW_LABEL: { spar: 'Pit win' }, S: { sounds: false },
    confettiRain() {}, levelSound() {}, queueCelebration() {}, evaluateBadges: async () => [],
  });
  vm.runInContext(source, context);
  const alias = typeof context.window.__refreshLevelChip;
  await vm.runInContext(settleSource + '\n}\nsettle();', context);
  await Promise.all(reads); await new Promise(resolve => setImmediate(resolve));
  const total = await game.totalXp(), level = game.levelFor(total);
  return { levelText: levelText.textContent, title: title.textContent, name: name.textContent, xp: xp.innerHTML, total, level, alias, reads: reads.length };
}
for (const winner of ['p', 'f']) {
  await test(`CHIP webdriver=false ${winner === 'p' ? 'win' : 'loss'} refreshes production level and XP`, async () => {
    const r = await settleChip(winner, false);
    assert.ok(r.reads > 0, 'settlement never read XP');
    assert.equal(r.total, winner === 'p' ? 205 : 195, 'CONTROL real settlement award reaches ledger');
    assert.equal(r.levelText, `Lv ${r.level.level}`);
    assert.equal(r.title, game.LEVEL_NAMES[Math.min(r.level.level, game.LEVEL_NAMES.length) - 1]);
    assert.equal(r.name, 'Real Player');
    assert.ok(r.xp.includes(`${r.level.into.toLocaleString()}/${r.level.need.toLocaleString()}`), r.xp);
    assert.equal(r.alias, 'undefined', 'production leaks the webdriver alias');
  });
}
await test('CONTROL omitted level refresh leaves stale chip text', async () => {
  const broken = refreshSource.replace('if (level) level.textContent = `Lv ${lvl.level}`;', '');
  assert.notEqual(broken, refreshSource);
  const r = await settleChip('p', false, broken);
  assert.equal(r.levelText, 'STALE');
  assert.notEqual(r.levelText, `Lv ${r.level.level}`);
});
await test('CONTROL webdriver=true retains the test alias', async () => {
  const r = await settleChip('p', true); assert.equal(r.alias, 'function'); assert.notEqual(r.xp, 'STALE');
});
console.log(`r48-state: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
