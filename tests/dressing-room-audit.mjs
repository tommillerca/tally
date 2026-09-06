/* tests/dressing-room-audit.mjs: THE LOOK PICKER COLLAPSES LIKE THE FIT GRID,
 * AND "ITS OWN LOOK" IS THE GEAR'S OWN ART, IN PIXELS.
 *
 * Tom, v476, two P0s in the Dressing Room (the transmog picker under the
 * Wardrobe's fit grid):
 *   (A) "the colour picker in the wardrobe works well but down in the transmog
 *       mirror section it's individually listing every single cleat/shirt etc
 *       as its own thing without a colour picker"
 *   (B) "selecting my shoe as its own wear-it style is actually just
 *       interfacing it off and showing the sock, no way to just style its own
 *       look? this could be with other clothes too not just shoe"
 *
 * v474 collapsed the fit grid to one tile per bhFamilyKey with a colourway rail
 * (wardrobe-family-grid-audit). The look picker never got it: measured on this
 * tree before the fix at 393x852 with the cleats owned, 35 tiles for 33 offered
 * looks, 31 of them the SAME untinted master PNG (no fbTintAttr), so a player could
 * not tell one team from another, let alone pick one. After: 5 tiles in a 163px
 * grid, one family tile carrying the count and its worn colourway, a 31-tile rail
 * on tap.
 *
 * WHAT IT ASSERTS
 *   SEED     the kit is owned in the slot and every gear slot under test holds
 *            statted gear the seeded level can wear. An unseeded fixture is an
 *            empty sample (anti-regression rule 3).
 *   FAMILY   tiles in the look grid == 2 fixed cells + the page's OWN bhFamilies
 *            count over the offered looks, and that is strictly fewer than the
 *            piece count (the control: a rule that collapsed nothing fails here).
 *   RAIL     tapping the family tile opens ONE rail in the document with a real
 *            box, one tappable tile per colourway, every tile with a non-zero
 *            box and its own tint (distinct data-tints == tiles), and a price
 *            tag per tile.
 *   PICK     tapping a colourway on the rail: the After figure's tint span
 *            paints THAT team's primary hex (read off the span's style, from the
 *            team table, not typed here), the family tile re-targets to it, the
 *            bar names it. Wear it: the transmog map holds exactly that id and
 *            the Now figure paints it.
 *   OWN x5   for H, T, P, S, FW: statted gear worn, a collected look applied over
 *            it, open the slot, tap "Its own look": the After figure's layer for
 *            that slot is the gear's own art file, and after Wear it so is the
 *            big stage, with the disguise gone from the map. Never the default,
 *            never nothing. A row with no layer in the slot is a FAILURE.
 *
 * PROVE-RED, 2026-09-06, this file run from a `git archive origin/main` tree
 * (v477, the pre-fix picker), 8 FAILED:
 *   FAIL FAMILY one look tile per family, not per piece  35 tiles for 33 looks;
 *        the rule says 2 + 3 = 5
 *   FAIL RAIL tapping the family tile opens a rail with one tinted tile per
 *        colourway  no .ward-cell.fam in the look grid
 *   (PICK rows go red with it: nothing to tap.)
 * The OWN rows are green on origin/main too: (B) as reported ("shows the sock",
 * i.e. the slot resolves to nothing) did NOT reproduce on this tree for any of
 * the 12 store/UI states probed across H, T, S, FW. They were proven red by
 * MUTATION instead, previewEq's own-look branch deleting the slot rather than
 * restoring it (`else if (p === '') delete e[slot];`), which is the bug as
 * described:
 *   FAIL OWN FW the After figure draws the gear's own art  layers [] want FW/FW1.png
 *   (and the same for H, T, P, S.)
 *
 * One boot, 393x852, HEADLESS_MODE=shell, about 60s.
 *   node tests/dressing-room-audit.mjs [url]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, serveTree, sleep, setWidth, dismissOverlays } from './godmode.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2] || process.env.URL;
const server = arg ? null : await serveTree(ROOT);
const BASE = (arg || server.url).replace(/\/?$/, '/');
console.log(`grading ${BASE}`);
const { browser, page } = await boot(BASE, { headless: process.env.HEADLESS_MODE || 'shell' });
page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 400)));
await setWidth(page, 393, 852);

let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };
const die = async (why, detail) => {
  console.log(`${why}, nothing below would be graded against a real state: ${JSON.stringify(detail)}`);
  await browser.close(); if (server) server.close();
  process.exit(1);
};
const quiet = () => page.evaluate(() => { const t = document.querySelector('#toast'); if (t) t.hidden = true; });

/* A level high enough to wear the lowest-level gear in every slot under test,
   and dust for the paid disguises the OWN rows put on and take off. */
await seed(page, { level: 30, dust: 2000 });
const KIT_SLOT = 'FW';
const GEAR_SLOTS = ['H', 'T', 'P', 'S', 'FW'];

/* ---- SEED ---------------------------------------------------------------- */
const seeded = await page.evaluate(async (kitSlot, slots) => {
  const loot = await import('./js/loot.js');
  const { kvSet } = await import('./js/db.js');
  const { BH_ITEMS } = await import('./data/boneheadz.js');
  const { GEAR_ITEMS } = await import('./js/gear.js');
  const { totalXp, levelFor } = await import('./js/game.js');
  await kvSet('equipped', {}); await kvSet('gearloadout', {}); await kvSet('transmog', {}); await kvSet('paidlooks', []);
  const lvl = levelFor(await totalXp()).level;
  const kit = BH_ITEMS.filter(i => i.slot === kitSlot && i.football);
  for (const i of kit) await loot.grantCosmetic(i.id, 'audit');
  /* two gear pieces per slot with DIFFERENT art, so the second one's art is a
     collected look the first can be disguised as */
  const gear = {};
  for (const s of slots) {
    const pool = GEAR_ITEMS.filter(g => g.slot === s && g.minLevel <= lvl).sort((a, b) => a.minLevel - b.minLevel);
    const worn = pool[0], other = pool.find(g => g.artId !== worn?.artId);
    if (!worn || !other) return { error: `no wearable gear pair for ${s} at level ${lvl}` };
    await loot.grantGear(worn.id, 'audit'); await loot.grantGear(other.id, 'audit');
    gear[s] = { worn: worn.id, art: worn.artId, look: other.artId };
  }
  const owned = await loot.ownedCosmeticIds();
  return { lvl, kit: kit.length, kitOwned: kit.filter(i => owned.has(i.id)).length, gear };
}, KIT_SLOT, GEAR_SLOTS).catch(e => ({ error: String(e) }));
if (seeded.error || !seeded.kit || seeded.kitOwned !== seeded.kit) await die('SEED FAILED', seeded);
check(`SEED the ${KIT_SLOT} kit is owned (${seeded.kitOwned}/${seeded.kit}) and ${GEAR_SLOTS.length} slots hold wearable gear at level ${seeded.lvl}`,
  true, JSON.stringify(seeded.gear));

const openSlot = async slot => {
  await page.evaluate(() => { location.hash = '#/today'; }); await sleep(900);
  await page.evaluate(() => { location.hash = '#/bonehead'; }); await sleep(1800);
  await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="wardrobe"]')?.click()); await sleep(2200);
  await page.evaluate(s => document.querySelector(`[data-pd="${s}"]`)?.click(), slot); await sleep(2400);
  await dismissOverlays(page, 2); await quiet();
};
const state = slot => page.evaluate(async slot => {
  const loot = await import('./js/loot.js');
  return { rawEq: (await loot.equipped({ raw: true }))[slot] || null, look: (await loot.equipped())[slot] || null,
    lo: (await loot.gearLoadout())[slot] || null, tm: (await loot.transmogMap())[slot] ?? null };
}, slot);
/* the layer for ONE slot, off the rendered stack: its src (relative to assets/bh/)
   and, for a football garment, the hex its tint span is painting */
const layer = (sel, slot) => page.evaluate(async (sel, slot) => {
  const { BH_BY_ID } = await import('./data/boneheadz.js');
  const root = document.querySelector(sel);
  if (!root) return { why: 'no ' + sel };
  const imgs = [...root.querySelectorAll('.bh-anim > img')];
  const mine = imgs.filter(i => { const src = i.getAttribute('src'); return src.includes(`/${slot}/`) || src.includes('/football/'); });
  const tint = root.querySelector(`.fb-tint[data-fbslot="${slot}"]`);
  return { srcs: mine.map(i => i.getAttribute('src').replace(/^.*assets\/bh\//, '')), tint: tint ? tint.style.background : null,
    decoded: mine.every(i => i.complete && i.naturalWidth > 0), n: imgs.length };
}, sel, slot);
const rgb = hex => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };

/* ---- FAMILY: the picker, with the cleats worn as a plain cosmetic ---------- */
await page.evaluate(async slot => {
  const loot = await import('./js/loot.js');
  const { BH_ITEMS } = await import('./data/boneheadz.js');
  await loot.equip(slot, BH_ITEMS.find(i => i.slot === slot && i.football).id);
}, KIT_SLOT);
await openSlot(KIT_SLOT);
const fam = await page.evaluate(async slot => {
  const loot = await import('./js/loot.js');
  const { BH_ITEMS, bhFamilies } = await import('./data/boneheadz.js');
  const grid = document.querySelector('.mog-panel .look-grid');
  if (!grid) return { why: 'no .mog-panel .look-grid' };
  /* the page's own answer: the looks this slot offers are the collected ones minus
     what is on (renderCharacter's slotArts), grouped by the catalogue rule */
  const base = (await loot.equipped({ raw: true }))[slot];
  const looks = await loot.collectedLooks();
  const offered = BH_ITEMS.filter(i => i.slot === slot && looks.has(i.id) && i.id !== base);
  const cells = [...grid.querySelectorAll('[data-look]')];
  const famTiles = cells.filter(c => c.classList.contains('fam'));
  return { pieces: offered.length, families: bhFamilies(offered).size, tiles: cells.length, famTiles: famTiles.length,
    badge: famTiles[0]?.querySelector('.ward-fam-n')?.textContent, famIds: famTiles[0]?.dataset.famIds?.split(' ').length,
    tinted: cells.filter(c => c.querySelector('canvas[data-tints]')).length,
    gridH: Math.round(grid.getBoundingClientRect().height), rails: grid.querySelectorAll('.fam-rail').length };
}, KIT_SLOT);
console.log('family:', JSON.stringify(fam));
if (fam.why) await die('PICKER NOT FOUND', fam);
check('FAMILY CONTROL the slot offers more pieces than families (there is something to collapse)',
  fam.pieces > fam.families && fam.families > 0, `${fam.pieces} pieces in ${fam.families} families`);
check('FAMILY one look tile per family, not per piece',
  fam.tiles === 2 + fam.families, `${fam.tiles} tiles for ${fam.pieces} looks; the rule says 2 + ${fam.families} = ${2 + fam.families}`);
check('FAMILY the family tile carries its count and its ids',
  fam.famTiles >= 1 && fam.badge === String(fam.famIds) && fam.famIds > 1, `badge ${fam.badge}, ${fam.famIds} ids on ${fam.famTiles} family tiles`);
check('FAMILY the football tiles carry their team tint (an untinted master is 32 identical grey shoes)',
  fam.tinted >= 1 + fam.famTiles, `${fam.tinted} tinted canvases (own-look tile + family tiles)`);
check('FAMILY no rail is open until one is asked for', fam.rails === 0, String(fam.rails));

/* ---- RAIL: open it ------------------------------------------------------ */
await page.evaluate(() => document.querySelector('.mog-panel .look-grid .ward-cell.fam')?.click());
await sleep(1400); await quiet();
const rail = await page.evaluate(() => {
  const grid = document.querySelector('.mog-panel .look-grid');
  const tile = grid?.querySelector('.ward-cell.fam');
  const rails = [...grid?.querySelectorAll('.fam-rail') || []];
  const r = rails[0];
  if (!tile) return { why: 'no .ward-cell.fam in the look grid' };
  if (!r) return { why: 'no rail opened' };
  const tiles = [...r.querySelectorAll('[data-look]')];
  const rr = r.getBoundingClientRect();
  return { rails: rails.length, connected: r.isConnected, box: [Math.round(rr.width), Math.round(rr.height)],
    tiles: tiles.length, famIds: tile.dataset.famIds.split(' ').length,
    zeroBoxes: tiles.filter(t => t.getBoundingClientRect().height === 0 || t.getBoundingClientRect().width === 0).length,
    distinctTints: new Set(tiles.map(t => t.querySelector('canvas')?.dataset.tints || '')).size,
    prices: r.querySelectorAll('.look-cost').length, expanded: tile.getAttribute('aria-expanded'),
    bar: (document.querySelector('.mog-bar')?.textContent || '').replace(/\s+/g, ' ').trim() };
});
console.log('rail:', JSON.stringify(rail));
check('RAIL tapping the family tile opens a rail with one tinted tile per colourway',
  !rail.why && rail.rails === 1 && rail.connected && rail.box[1] > 40 && rail.tiles === rail.famIds && rail.zeroBoxes === 0
  && rail.distinctTints === rail.tiles && rail.prices === rail.tiles && rail.expanded === 'true',
  rail.why || `${rail.tiles} tiles for ${rail.famIds} ids, ${rail.distinctTints} distinct tints, ${rail.prices} prices, box ${rail.box.join('x')}`);

/* ---- PICK: a colourway off the rail, previewed, then worn ---------------- */
const pick = await page.evaluate(async () => {
  const { FOOTBALL_TEAM_BY_ID } = await import('./data/football-teams.js');
  const { BH_BY_ID } = await import('./data/boneheadz.js');
  const t = document.querySelectorAll('.mog-panel .fam-rail [data-look]')[9];
  if (!t) return { why: 'no 10th rail tile' };
  t.click();
  const it = BH_BY_ID[t.dataset.look];
  return { id: t.dataset.look, name: it.name, hex: FOOTBALL_TEAM_BY_ID[it.football.team].a };
});
await sleep(1400); await quiet();
const afterPick = pick.why ? pick : {
  ...await layer('.mog-figs figure:nth-of-type(2)', KIT_SLOT),
  ...await page.evaluate(() => ({
    famLook: document.querySelector('.mog-panel .look-grid .ward-cell.fam')?.dataset.look,
    famSel: document.querySelector('.mog-panel .look-grid .ward-cell.fam')?.classList.contains('selected'),
    railSel: document.querySelector('.mog-panel .fam-rail [data-look].selected')?.dataset.look,
    caps: [...document.querySelectorAll('.mog-cap')].map(c => c.textContent.trim()),
    bar: (document.querySelector('.mog-bar')?.textContent || '').replace(/\s+/g, ' ').trim(),
    apply: document.querySelector('[data-look-apply]')?.dataset.lookApply ?? null,
  })),
};
console.log('pick:', JSON.stringify(pick), JSON.stringify(afterPick));
check('PICK the After figure paints the tapped team\'s primary on the garment, decoded',
  !pick.why && afterPick.srcs?.length === 1 && afterPick.decoded && afterPick.tint === rgb(pick.hex) && afterPick.caps[1] === 'After',
  pick.why || `tint ${afterPick.tint} want ${rgb(pick.hex)} (${pick.name}), layers ${JSON.stringify(afterPick.srcs)}`);
check('PICK the family tile now stands for that colourway and the rail rings it',
  !pick.why && afterPick.famLook === pick.id && afterPick.famSel && afterPick.railSel === pick.id,
  `tile ${afterPick.famLook}, selected ${afterPick.famSel}, rail ${afterPick.railSel}`);
check('PICK the bar names it and offers to wear it',
  !pick.why && afterPick.bar.includes(pick.name) && afterPick.apply === pick.id, afterPick.bar);
await page.evaluate(() => document.querySelector('[data-look-apply]')?.click());
await sleep(2000); await quiet();
const worn = { ...await state(KIT_SLOT), now: await layer('.mog-figs figure:nth-of-type(1)', KIT_SLOT) };
console.log('worn:', JSON.stringify(worn));
check('PICK Wear it puts exactly that colourway in the transmog map and on the Now figure',
  !pick.why && worn.tm === pick.id && worn.look === pick.id && worn.now.tint === rgb(pick.hex), `tm ${worn.tm}, now ${worn.now.tint}`);

/* ---- OWN x5: its own look is the gear's own art ------------------------- */
for (const slot of GEAR_SLOTS) {
  const g = seeded.gear[slot];
  const st0 = await page.evaluate(async (slot, g) => {
    const loot = await import('./js/loot.js');
    const { kvSet } = await import('./js/db.js');
    await kvSet('equipped', {}); await kvSet('gearloadout', {}); await kvSet('transmog', {});
    await loot.equipGear(slot, g.worn);
    const r = await loot.applyTransmog(slot, g.look);
    return { applied: r, look: (await loot.equipped())[slot] };
  }, slot, g);
  if (!st0.applied.ok || st0.look !== g.look) await die(`OWN ${slot} fixture: could not disguise the gear`, st0);
  await openSlot(slot);
  const before = await layer('.mog-figs figure:nth-of-type(1)', slot);
  await page.evaluate(() => document.querySelector('.mog-panel [data-look=""]')?.click());
  await sleep(1400); await quiet();
  const after = await layer('.mog-figs figure:nth-of-type(2)', slot);
  const want = `${slot}/${g.art}.png`;
  console.log(`OWN ${slot}:`, JSON.stringify({ before: before.srcs, after: after.srcs, want }));
  check(`OWN ${slot} CONTROL the slot is disguised before the tap (the Now figure draws the look, not the gear)`,
    before.srcs?.length === 1 && before.srcs[0] === `${slot}/${g.look}.png`, `now ${JSON.stringify(before.srcs)} look ${g.look}`);
  check(`OWN ${slot} the After figure draws the gear's own art`,
    after.srcs?.length === 1 && after.srcs[0] === want && after.decoded, `layers ${JSON.stringify(after.srcs)} want ${want}`);
  await page.evaluate(() => document.querySelector('[data-look-apply=""]')?.click());
  await sleep(2000); await quiet();
  const stage = await layer('.bh-stage.lg', slot);
  const st1 = await state(slot);
  check(`OWN ${slot} Wear it: the stage draws the gear's own art and the disguise is gone from the map`,
    stage.srcs?.length === 1 && stage.srcs[0] === want && st1.tm === null && st1.look === g.art && st1.lo === g.worn,
    `stage ${JSON.stringify(stage.srcs)}, ${JSON.stringify(st1)}`);
}

await browser.close();
if (server) server.close();
console.log(bad ? `\n${bad} FAILED` : '\nDRESSING ROOM OK: one tile per family, and its own look is its own');
process.exit(bad ? 1 : 0);
