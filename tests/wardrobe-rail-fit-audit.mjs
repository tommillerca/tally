/* THE VARIANT RAIL FITS ON SCREEN, AND ITS CARDS ARE ONE SIZE.
 *
 * Tom, 2026-09-12, tapping a statted piece: "this menu pops down below the fold
 * and not near the gear youre trying to click it feels like a glitch. also
 * youve fully miscaled the items".
 *
 * Two defects, both measured at 393x852 on a save seeded with 14 cosmetic
 * families and 20 gear pieces, and both PRE-EXISTING (the same fixture against
 * app.css at d29682d1 produced the identical numbers, so they predate this
 * week's Wardrobe work):
 *
 *   NEAR   the rail opened at y578 under a tile whose bottom was y577, which is
 *          correct, but it was 303px tall and ran to y880 on an 852px screen.
 *          The controls for the piece you just tapped sat off the bottom, which
 *          is why it reads as nothing having happened.
 *   UNIFORM the cosmetic cards carried `<canvas class="ward-art" width="200"
 *          height="200">` as a DIRECT child of the card button, while the only
 *          rule sizing that canvas is `.pw-item.famr .famr-art canvas.ward-art`
 *          and it requires a `.famr-art` WRAPPER. The selector never matched, so
 *          the canvas fell back to its intrinsic 200x200 inside a 104px card:
 *          267px tall against 110px for the gear cards beside it in the same
 *          rail.
 *
 * ROWS
 *   CONTROL  the fixture opened a slot whose grid holds at least one tile that
 *            expands, and the rail actually opened with cards in it. Every row
 *            below reads those cards, so an empty rail must fail here rather
 *            than let them pass on nothing.
 *   NEAR     the rail's top is within 24px of the tapped tile's bottom, so it
 *            stays where the player is looking.
 *   FITS     the rail's bottom is inside the viewport.
 *   UNIFORM  every card in the rail is the same height within 2px. This is the
 *            row that catches an unsized canvas: one card 2.4x its neighbours
 *            is what "miscaled" looked like.
 *   ART      every art canvas renders at its CSS size rather than its intrinsic
 *            attribute size, i.e. no canvas is wider than its own card.
 *
 * Run: node tests/wardrobe-rail-fit-audit.mjs [url]
 */
import { boot, sleep, serveTree, dismissOverlays, exitFor } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) fails++;
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const base = process.argv[2] || process.env.URL || null;
const srv = base ? null : await serveTree(ROOT);
const url = base || srv.url;
const { browser, page } = await boot(url);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await sleep(4500);
await dismissOverlays(page);

await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const { GEAR_ITEMS } = await import('./js/gear.js');
  const { BH_ITEMS, bhFamilies } = await import('./data/boneheadz.js');
  for (const fam of [...bhFamilies(BH_ITEMS.filter(i => i.slot === 'H')).values()].slice(0, 14))
    for (const item of fam) await loot.grantCosmetic(item.id, 'audit');
  for (const g of GEAR_ITEMS.filter(g => g.slot === 'H').slice(0, 20)) await loot.grantGear(g.id, 'audit');
});
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(2200);
await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="wardrobe"]')?.click());
await sleep(2200);
await page.evaluate(() => document.querySelector('[data-pd="H"]')?.click());
await sleep(2000);

const tapped = await page.evaluate(() => {
  /* A GEAR tile, specifically. Its rail is the one that mixes gear cards with
     cosmetic "replaces gear stats" cards, and the cosmetic ones are where the
     unsized canvas lived. A family tile opens a two-card rail with no cosmetic
     card in it, so a fixture that settles for one cannot see the defect: the
     first version of this audit did exactly that and stayed green with the fix
     removed. */
  const t = document.querySelector('.ward-grid[data-wslot="H"] .ward-cell.gear')
    || document.querySelector('.ward-grid[data-wslot="H"] .ward-cell.fam');
  if (!t) return null;
  const b = t.getBoundingClientRect();
  t.click();
  return { y: +b.y.toFixed(1), bottom: +b.bottom.toFixed(1) };
});
await sleep(1400);

const m = await page.evaluate(() => {
  const rail = document.querySelector('.fam-rail');
  if (!rail) return { rail: null };
  const rb = rail.getBoundingClientRect();
  const cards = [...rail.children].map(c => {
    const b = c.getBoundingClientRect();
    const art = c.querySelector('canvas.ward-art, img');
    const ab = art ? art.getBoundingClientRect() : null;
    return { h: +b.height.toFixed(1), w: +b.width.toFixed(1),
      art: ab ? { w: +ab.width.toFixed(1), h: +ab.height.toFixed(1), attr: art.width || null } : null };
  });
  return { rail: { y: +rb.y.toFixed(1), bottom: +rb.bottom.toFixed(1), h: +rb.height.toFixed(1) },
    cards, vh: innerHeight };
});

ok('CONTROL a tile expanded and the rail opened with cards',
  !!tapped && !!m.rail && m.cards.length > 0,
  tapped ? `tile bottom ${tapped.bottom}, rail ${m.rail ? m.rail.h + 'px with ' + m.cards.length + ' cards' : 'absent'}` : 'no expandable tile in the slot');

if (m.rail && m.cards.length) {
  const near = Math.abs(m.rail.y - tapped.bottom);
  ok('NEAR the rail opens next to the tile that was tapped', near <= 24,
    `rail top ${m.rail.y}, tile bottom ${tapped.bottom}, gap ${near.toFixed(1)}px`);
  ok('FITS the rail ends inside the viewport', m.rail.bottom <= m.vh,
    `rail ${m.rail.y}..${m.rail.bottom} in ${m.vh}px`);
  const hs = [...new Set(m.cards.map(c => c.h))];
  ok('UNIFORM every card in the rail is one height', Math.max(...hs) - Math.min(...hs) <= 2,
    `heights ${JSON.stringify(hs)}`);
  const oversized = m.cards.filter(c => c.art && c.art.w > c.w);
  ok('ART no art canvas is wider than its own card', oversized.length === 0,
    oversized.length ? `${oversized.length} oversized: ${JSON.stringify(oversized.slice(0, 2))}`
      : `${m.cards.filter(c => c.art).length} art canvases within their cards`);
}

await browser.close();
if (srv) srv.close();
console.log(`\n${fails ? 'FAILED' : 'OK'}  wardrobe-rail-fit-audit`);
process.exit(exitFor(fails));
