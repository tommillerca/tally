/* THE COSMETIC YOU JUST WON CAN BE FOUND AGAIN.
 *
 * THE BUG (R39-25). "The cosmetic you just won is never named again: 19 taps
 * across the Backpack, the Wardrobe and all 14 slot rails, nothing." v487 added
 * a claim toast at the reveal, so what was still missing is the trail AFTERWARDS:
 * once the card is gone, nothing on any surface says which of your fourteen
 * slots the new piece landed in, or which tile in that slot's grid it is.
 *
 * THE MARK. `nw: 1` on the inv row every grant already writes (js/loot.js,
 * cosRow/gearRow), rendered as a dot in the app's OWN unread language (the same
 * accent plate and --bg ring the crate count and the News dot wear) on two
 * surfaces: the paper-doll slot rail and the tile in that slot's grid. Cleared
 * by clearNewInSlot() when the Wardrobe renders that slot's grid.
 * On the ROW rather than in a kv key of per-slot seen-timestamps because a
 * timestamp needs a backfill answer for every account that already exists, and
 * the honest one ("everything you own is new") is a wall of dots on a shipped
 * collection. An absent flag reads as seen, so old collections stay quiet.
 *
 * ROWS
 *   CONTROL  the grant landed and the Wardrobe is really up: the item is owned
 *            and the paper doll rendered all fourteen slots. Without it MARK
 *            could pass on a page that never got there, and CLEAR could pass on
 *            an empty grid, which is a set of zero dots.
 *   MARK     the slot rail carries the dot on the granted piece's slot, and NOT
 *            on the slots nothing landed in. Both halves: a mark on every slot
 *            is not a mark.
 *   TILE     opening that slot shows the dot on the tile as well.
 *   CLEAR    re-rendering the slot after it has been opened leaves zero dots on
 *            the tile AND on the rail, with the grid still populated.
 *   DURABLE  and it stays clear across a full reload, which is what makes the
 *            state a stored fact rather than a variable.
 *
 * PROVEN RED, 2026-09-07: a throwaway copy with js/app.js, js/loot.js and
 * app.css restored to the commit before the fix -> MARK, TILE red (no .new-dot
 * anywhere), CONTROL green, exit 1. CLEAR and DURABLE are green there for the
 * same reason the bug exists, which is why MARK and TILE are the rows that
 * carry this file.
 *
 * Run: node tests/new-cosmetic-mark-audit.mjs [url]
 */
import { boot, serveTree, sleep, setWidth, dismissOverlays } from './godmode.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* A slot the Wardrobe does NOT open on. It opens on 'H' (S.wardrobeSlot || 'H'),
   and an opened slot is a seen slot, so granting into H would clear the mark in
   the same render that drew it and the audit would be grading its own timing. */
const SLOT = 'E';

let fails = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) fails++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

let srv = null;
let target = process.argv[2] || process.env.URL;
if (!target) {
  srv = await serveTree(ROOT);
  target = srv.url;
  console.log(`no URL given: serving this tree at ${target} rather than grading production`);
}

const { browser, page } = await boot(target);
await setWidth(page, 393, 852);
await sleep(400);
await dismissOverlays(page);

/* The REAL grant door, not a hand-written inv row: grantCosmetic is what every
   crate, drop, shop purchase and quest payout in the app calls. */
const granted = await page.evaluate(async slot => {
  const loot = await import('./js/loot.js');
  const bh = await import('../data/boneheadz.js');
  const owned = await loot.ownedCosmeticIds();
  const item = bh.BH_ITEMS.find(i => i.slot === slot && !owned.has(i.id));
  if (!item) return null;
  const row = await loot.grantCosmetic(item.id, 'test-grant');
  return row ? { id: item.id, name: item.name } : null;
}, SLOT);

const openWardrobe = async () => {
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1400);
  await page.evaluate(() => document.getElementById('charBtn')?.click());
  await sleep(2400);
  /* #charBtn lands on the hub's CRATES tab (the Backpack), not the Wardrobe:
     the sub-tab is a second tap, exactly as it is for a player. */
  await page.evaluate(() => document.querySelector('.ch-tab[data-tab="wardrobe"]')?.click());
  await sleep(2400);
};
const pickSlot = async code => {
  await page.evaluate(c => document.querySelector(`.pd-slot[data-pd="${c}"]`)?.click(), code);
  await sleep(1600);
};
const read = code => page.evaluate(c => ({
  slots: document.querySelectorAll('.pd-slot[data-pd]').length,
  railDot: !!document.querySelector(`.pd-slot[data-pd="${c}"] .new-dot`),
  railDots: [...document.querySelectorAll('.pd-slot[data-pd]')].filter(s => s.querySelector('.new-dot')).map(s => s.dataset.pd),
  cells: document.querySelectorAll(`.ward-grid[data-wslot="${c}"] .ward-cell`).length,
  tileDots: document.querySelectorAll(`.ward-grid[data-wslot="${c}"] .ward-cell .new-dot`).length,
  openSlot: document.querySelector('.ward-grid[data-wslot]')?.dataset.wslot || null,
}), code);

await openWardrobe();
const owned = await page.evaluate(async id => (await (await import('./js/loot.js')).ownedCosmeticIds()).has(id), granted && granted.id);
const before = await read(SLOT);
ok('CONTROL the grant landed and the Wardrobe is up',
  !!granted && owned === true && before.slots === 14,
  `${granted ? `granted "${granted.name}" into ${SLOT}` : 'NOTHING GRANTED'}, owned=${owned}, ${before.slots} paper-doll slots, open slot ${before.openSlot}`);

ok(`MARK the ${SLOT} slot on the rail carries the dot, and only it`,
  before.railDot && before.railDots.length === 1 && before.railDots[0] === SLOT,
  `dots on [${before.railDots.join(', ') || 'none'}] of ${before.slots} slots`);

await pickSlot(SLOT);
const opened = await read(SLOT);
ok(`TILE opening ${SLOT} shows the dot on the tile too`,
  opened.cells > 0 && opened.tileDots >= 1,
  `${opened.tileDots} marked of ${opened.cells} tiles in ${opened.openSlot}`);

/* Away and back: the render AFTER the one that saw it. */
await pickSlot('H');
await pickSlot(SLOT);
const after = await read(SLOT);
ok(`CLEAR ${SLOT} is quiet on the next render, grid still populated`,
  after.cells > 0 && after.tileDots === 0 && !after.railDot,
  `${after.tileDots} tile dots of ${after.cells} tiles, rail dot ${after.railDot}, rail dots [${after.railDots.join(', ') || 'none'}]`);

await page.reload({ waitUntil: 'networkidle2' });
await sleep(2400);
await dismissOverlays(page);
await openWardrobe();
await pickSlot(SLOT);
const reloaded = await read(SLOT);
ok('DURABLE and it is still clear after a full reload',
  reloaded.cells > 0 && reloaded.tileDots === 0 && !reloaded.railDot && reloaded.railDots.length === 0,
  `${reloaded.tileDots} tile dots of ${reloaded.cells} tiles, rail dots [${reloaded.railDots.join(', ') || 'none'}]`);

await browser.close();
if (srv) srv.close();
console.log(`\n${fails ? 'FAILED' : 'OK'}  new-cosmetic-mark-audit`);
process.exit(fails ? 1 : 0);
