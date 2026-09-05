/* tests/wardrobe-family-grid-audit.mjs — THE COLLAPSED GRID, IN PIXELS.
 *
 * WHY THIS EXISTS. QA round 23 F6 measured the ceiling on this screen: 57
 * collected looks in one slot make a 1,420px grid, and past tile 36 the figure
 * is never on screen while a tile is tappable. F6 shipped the rarity sort and
 * the tier tags; this is the next step, and Tom named it: "we need to collapse
 * similar items into a different interface because as we have different
 * colourways and variations like this helmet or like the kitsune mask those
 * that have collected like 1000 head slots over the years will have a messy af
 * wardrobe."
 *
 * tests/wardrobe-family-audit.mjs grades the RULE and is pure. This file grades
 * the only thing that rule was for: what a heavy collection looks like on a
 * 390x844 phone, measured off the render.
 *
 * THE "BEFORE" IS MEASURED, NOT DERIVED. Computing it as ceil(n/4) * pitch is
 * arithmetic about a stylesheet, and this project has burned review cycles on
 * exactly that kind of estimate. Instead the flat grid is BUILT IN THE LIVE
 * DOCUMENT out of clones of a real tile in a real .ward-grid beside the real
 * one, at the same viewport, in the same renderer, and measured with the same
 * getBoundingClientRect call. It reproduces main's markup exactly: one
 * .ward-cell per owned item, which is what `items.map(...)` emitted before this
 * change. Both grids are asserted CONNECTED, non-zero and non-degenerate before
 * either number is used.
 *
 * WHAT IT ASSERTS
 *   SEED      every hat in the catalogue is granted AND owned. An unseeded
 *             fixture is an empty sample: without this the whole file grades
 *             whatever the demo save happens to hold.
 *   SAMPLE    the grid really did collapse something and really did leave
 *             singletons alone: at least five family tiles AND at least five
 *             plain ones. A run with no families of either kind proves nothing,
 *             and the two halves are each other's control -- a badge that
 *             rendered on everything fails SOLO, a rule that collapsed nothing
 *             fails this.
 *   COUNT     one tile per family, no more and no less, checked against the
 *             page's own bhFamilies over the owned set rather than a number
 *             typed into this file.
 *   HEIGHT    the collapsed grid is measurably shorter than the flat control,
 *             and short enough that the last tile is reachable.
 *   SOLO      a family of one is the tile that already shipped: no count badge,
 *             no data-family, and tapping it opens NO rail.
 *   BADGE     the count badge has a readable box inside its tile and never
 *             lands under .ward-cell.equipped::after's green tick, whose box is
 *             read off getComputedStyle(cell, '::after') rather than off the
 *             numbers in app.css. The first version of the badge did exactly
 *             that collide, on the one family tile worth reading at a glance.
 *   RAIL      tapping a family tile opens a rail that is in the document, has
 *             non-zero height, sits inside the viewport, and holds exactly one
 *             tappable tile per owned variant. Every tile's rect is checked, so
 *             a rail that rendered at zero height cannot pass.
 *   WORN      the promise Tom made this for: after equipping a sibling out of
 *             the rail, the COLLAPSED TILE DRAWS THAT VARIANT. Graded on the
 *             tile canvas's PIXELS before and after, never on its data-art
 *             attribute, and with a same-size control so "the canvas changed"
 *             cannot pass on a blank redraw.
 *   SECOND    ONE FAMILY IS AN ANECDOTE. A second, unrelated family is opened
 *             (the H13 Blowfish hoods after the H10 headbands, both hand-drawn
 *             and neither football) and the first rail must have closed: a rail
 *             per open family would stack nine of them into this grid and undo
 *             the change, and no row above can see it.
 *   SCROLL    how far the thumb travels to reach the slot's LAST tile, measured
 *             at real scroll positions on the app's real scroller, once with
 *             the flat control in the document and once with the collapsed
 *             grid. Its first row is the control: it fails unless BOTH scrolls
 *             actually moved and both landed on a visible tile.
 *             AND WHAT IS NOT FIXED IS PRINTED RATHER THAN ASSERTED. F6's other
 *             number, the figure being off screen at the bottom of a big slot,
 *             is still 0px visible on BOTH grids: 909px of tiles under a 414px
 *             doll does not fit in 844px and collapsing this slot does not make
 *             it. The line says so with the measurement beside it instead of
 *             picking a threshold today's number happens to clear.
 *
 * PROVE-RED, 2026-09-04, one mutation at a time in an rsync copy of the tree
 * OUTSIDE the worktree (no .git, no node_modules; the suite serves the tree
 * itself). Every mutation asserted `source.count(old) == 1` BEFORE the replace,
 * so "it stayed green" could never mean "the replace matched nothing", and the
 * restored copy was re-run green at the end: 24 ok, 0 FAIL, exit 0.
 *
 *   1. the grid goes back to one tile per ITEM (`const fams = items.map(i => [i])`)
 *      FAIL COUNT one tile per family, checked against the catalogue rule  57
 *           tiles for 57 owned items; the rule says 36 (9 of them families)
 *      FAIL HEIGHT the collapsed grid is shorter than the flat one it replaces
 *           1367px -> 1367px (0px, 0% off) for 57 owned pieces
 *      FAIL SCROLL the last tile is closer to the top of the slot than it was
 *           1456px of thumb travel over 58 flat tiles -> 1456px over 58
 *           collapsed tiles (0px saved)
 *      (SAMPLE and both BADGE rows go red with them: 6 of 24.)
 *   2. the count badge moved back to `right: 3px`, the tick's corner
 *      FAIL BADGE the count never lands under the equipped tick  9 of 9 family
 *           tiles overlap
 *   3. a family of ONE gets a count badge too
 *      FAIL SOLO a family of one carries no count badge  36 badges on 9 family
 *           tiles, 27 on plain tiles
 *   4. restageWardrobe stops re-drawing the family tile's art
 *      FAIL WORN the collapsed tile now points at the variant you put on  tile
 *           data-equip H10-6 -> H10-6, ringed=true
 *      FAIL WORN and its PIXELS changed: the tile is drawing a different
 *           picture  canvas checksum 3425528777 -> 3425528777
 *      (and the run shows why the pixel row is the one that matters: saved
 *      H10-1 and onDoll true, so every attribute-level row was still green.)
 *   5. .fam-rail rendered at `height: 0; overflow: hidden`
 *      FAIL RAIL a rail opens, in the document, with a real box  390x12 at
 *           y=440
 *      (NOTE: the per-tile rows stayed green there -- 8/8 reachable, 0 zero
 *      boxes -- because overflow:hidden clips the paint and leaves the tiles'
 *      rects alone. The rail's OWN box is what caught it, which is the argument
 *      for measuring the container as well as its children.)
 *
 * Toasts are dismissed before every screenshot (Tom rejected an earlier sheet
 * for popups over the art) and every animation is paused before a pixel is
 * compared, so nothing here is diffing two moments of an idle loop.
 *
 * One boot, 390x844, measured ~40s.
 */
import { boot, sleep, setWidth, shotDir } from './godmode.js';

const DIR = shotDir('tally-shots');
const { browser, page } = await boot(process.argv[2] || process.env.URL,
  { headless: process.env.HEADLESS_MODE || 'shell' });
page.on('pageerror', e => console.log('PAGEERROR', (e && e.stack ? e.stack : String(e)).slice(0, 600)));
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };
const die = async (why, detail) => {
  console.log(`${why}, nothing below would be graded against a real state: ${JSON.stringify(detail)}`);
  await browser.close();
  process.exit(1);
};
/* HIDE THE TOAST, DO NOT REMOVE IT. Removing #toast made this file's own
   harness throw inside the app: nextToast() schedules a 180ms exit that then
   reads $('#toast').classList, and a suite that deletes the node under it
   raises a pageerror that reads exactly like a bug in the feature under test.
   Hidden is what a dismissed toast is anyway. */
const quiet = () => page.evaluate(() => {
  for (const a of document.getAnimations()) { try { a.pause(); } catch { /* finished */ } }
  const t = document.querySelector('#toast');
  if (t) { t.hidden = true; t.classList.remove('out'); }
  document.querySelectorAll('.sheet, .veil').forEach(n => n.remove());
});

await setWidth(page, 390, 844);

/* ---- SEED: a genuinely heavy collection --------------------------------- */
const SLOT = 'H';   // 57 items, the slot F6 measured and the one Tom named
const seeded = await page.evaluate(async slot => {
  const loot = await import('./js/loot.js');
  const { BH_ITEMS } = await import('./data/boneheadz.js');
  const mine = BH_ITEMS.filter(i => i.slot === slot);
  for (const i of mine) await loot.grantCosmetic(i.id, 'test');
  const owned = await loot.ownedCosmeticIds();
  return { want: mine.length, missing: mine.filter(i => !owned.has(i.id)).map(i => i.id) };
}, SLOT).catch(e => ({ error: String(e) }));
if (seeded.error || !seeded.want || seeded.missing.length) await die('SEED FAILED', seeded);
check(`SEED all ${seeded.want} ${SLOT}-slot pieces are granted and owned`, true, `${seeded.want} items`);

await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(2500);
await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="wardrobe"]')?.click());
await sleep(2600);

/* ---- what the page itself says the answer should be --------------------- */
const truth = await page.evaluate(async slot => {
  const loot = await import('./js/loot.js');
  const { BH_ITEMS, bhFamilies } = await import('./data/boneheadz.js');
  const owned = await loot.ownedCosmeticIds();
  const mine = BH_ITEMS.filter(i => i.slot === slot && owned.has(i.id));
  const f = bhFamilies(mine);
  return { items: mine.length, families: f.size, multi: [...f.values()].filter(g => g.length > 1).length,
    biggest: Math.max(...[...f.values()].map(g => g.length)) };
}, SLOT);
console.log('catalogue truth:', JSON.stringify(truth));

/* ---- MEASURE: the collapsed grid, and a flat control beside it ---------- */
const geo = await page.evaluate(slot => {
  const grid = document.querySelector(`.ward-grid[data-wslot="${slot}"]`);
  if (!grid) return { err: 'no grid for ' + slot };
  const cells = [...grid.querySelectorAll('.ward-cell')];
  const plain = cells.find(c => !c.classList.contains('fam') && !c.classList.contains('none'));
  if (!plain) return { err: 'no plain cell to clone for the control' };
  const after = Math.round(grid.getBoundingClientRect().height);

  /* THE CONTROL GRID. Same class, same parent, same viewport, same tile boxes:
     one .ward-cell per OWNED item, which is exactly what this screen rendered
     before the collapse. Built, measured, removed. */
  const flat = document.createElement('div');
  flat.className = 'ward-grid';
  flat.dataset.control = '1';
  /* The None cell is not an item and was there before the collapse too, so it
     is carried across rather than counted as a garment: the control has to be
     the grid main renders, which is one tile per owned item PLUS None. */
  const none = cells.filter(c => c.classList.contains('none')).length;
  const n = cells.reduce((a, c) => a + (c.dataset.famIds ? c.dataset.famIds.split(' ').length : 1), 0);
  for (let i = 0; i < n; i++) {
    const c = plain.cloneNode(true);
    c.classList.remove('fam', 'equipped');
    delete c.dataset.famIds; delete c.dataset.family;
    c.querySelector('.ward-fam-n')?.remove();
    flat.appendChild(c);
  }
  grid.parentNode.insertBefore(flat, grid);
  const fr = flat.getBoundingClientRect();
  const control = { h: Math.round(fr.height), w: Math.round(fr.width), n, none, connected: flat.isConnected,
    cells: flat.querySelectorAll('.ward-cell').length,
    cellH: Math.round(flat.firstElementChild.getBoundingClientRect().height) };
  flat.remove();

  return {
    slot, after, connected: grid.isConnected, w: Math.round(grid.getBoundingClientRect().width),
    cells: cells.length,
    fam: cells.filter(c => c.classList.contains('fam')).length,
    solo: cells.filter(c => !c.classList.contains('fam') && !c.classList.contains('none')).length,
    badges: grid.querySelectorAll('.ward-fam-n').length,
    badgesOnSolo: cells.filter(c => !c.classList.contains('fam') && c.querySelector('.ward-fam-n')).length,
    railsAtRest: grid.querySelectorAll('.fam-rail').length,
    cellH: Math.round(plain.getBoundingClientRect().height),
    control,
  };
}, SLOT);
if (geo.err) await die('GRID NOT FOUND', geo);
console.log('geometry:', JSON.stringify(geo));

check('SAMPLE the grid holds both collapsed families and plain tiles',
  geo.fam >= 5 && geo.solo >= 5, `${geo.fam} family tiles, ${geo.solo} plain tiles`);
check('SAMPLE both grids are in the live document with real boxes',
  geo.connected && geo.control.connected && geo.after > 0 && geo.control.h > 0
  && geo.w > 100 && geo.control.w > 100 && geo.cellH > 20 && geo.control.cellH > 20,
  `collapsed ${geo.w}x${geo.after} (cell ${geo.cellH}px), control ${geo.control.w}x${geo.control.h} (cell ${geo.control.cellH}px)`);
check('COUNT one tile per family, checked against the catalogue rule',
  geo.fam + geo.solo === truth.families && geo.fam === truth.multi,
  `${geo.fam + geo.solo} tiles for ${truth.items} owned items; the rule says ${truth.families} (${truth.multi} of them families)`);
check('COUNT the control really is the flat grid it is standing in for',
  geo.control.n === truth.items + geo.control.none && geo.control.cells === geo.control.n,
  `${geo.control.cells} control tiles for ${truth.items} owned items plus ${geo.control.none} None cell`);
check('SOLO a family of one carries no count badge',
  geo.badgesOnSolo === 0 && geo.badges === geo.fam,
  `${geo.badges} badges on ${geo.fam} family tiles, ${geo.badgesOnSolo} on plain tiles`);
check('SOLO no rail is open until one is asked for', geo.railsAtRest === 0, String(geo.railsAtRest));

/* ---- BADGE: the count and the equipped tick share a tile, not a corner ---
   The first version of the badge sat at top-right, which is exactly where
   .ward-cell.equipped::after paints its green tick, so on the ONE family tile
   worth reading at a glance -- the one you are wearing -- the count was under
   the tick. The tick is a pseudo-element and has no node to measure, so its box
   comes from getComputedStyle(cell, '::after'), which is the RENDER's own
   resolved values rather than the numbers typed in app.css. */
const badge = await page.evaluate(slot => {
  const grid = document.querySelector(`.ward-grid[data-wslot="${slot}"]`);
  const fam = [...grid.querySelectorAll('.ward-cell.fam')];
  const px = v => parseFloat(v) || 0;
  const rows = fam.map(c => {
    const cr = c.getBoundingClientRect();
    const n = c.querySelector('.ward-fam-n');
    if (!n) return { id: c.dataset.equip, err: 'no badge' };
    const nr = n.getBoundingClientRect();
    /* THE TICK ONLY EXISTS ON AN EQUIPPED TILE, so every tile is measured
       WEARING one: without this the ::after resolves to zero and the overlap
       test passes for free on every tile that happens not to be on. The class
       is put back immediately, so nothing downstream sees it. */
    const had = c.classList.contains('equipped');
    if (!had) c.classList.add('equipped');
    const a = getComputedStyle(c, '::after');
    const w = px(a.width), h = px(a.height);
    /* top/right in the cell's own box; the rule is top:4px right:4px 20x20 */
    const tick = { left: cr.right - px(a.right) - w, top: cr.top + px(a.top), w, h };
    const overlap = w > 0 && h > 0
      && nr.left < tick.left + tick.w && nr.right > tick.left
      && nr.top < tick.top + tick.h && nr.bottom > tick.top;
    if (!had) c.classList.remove('equipped');
    return { id: c.dataset.equip, badgeW: Math.round(nr.width), badgeH: Math.round(nr.height),
      readable: nr.width >= 14 && nr.height >= 10 && nr.top >= cr.top && nr.left >= cr.left,
      tickW: Math.round(w), overlap };
  });
  return { rows, ticks: rows.filter(r => r.tickW > 0).length };
}, SLOT);
console.log('badge:', JSON.stringify(badge));
check('BADGE the tick really has a box, so the overlap test is not free',
  badge.ticks === badge.rows.length && badge.rows.length > 0,
  `${badge.ticks} of ${badge.rows.length} family tiles resolved a non-zero ::after`);
check('BADGE the count never lands under the equipped tick',
  badge.rows.every(r => !r.err && !r.overlap),
  `${badge.rows.filter(r => r.overlap).length} of ${badge.rows.length} family tiles overlap`);
check('BADGE every count badge has a readable box inside its tile',
  badge.rows.length > 0 && badge.rows.every(r => r.readable),
  `${badge.rows.length} badges, smallest ${Math.min(...badge.rows.map(r => r.badgeW || 0))}x${Math.min(...badge.rows.map(r => r.badgeH || 0))}`);
check('HEIGHT the collapsed grid is shorter than the flat one it replaces',
  geo.after < geo.control.h,
  `${geo.control.h}px -> ${geo.after}px (${geo.control.h - geo.after}px, ${Math.round((1 - geo.after / geo.control.h) * 100)}% off) for ${truth.items} owned pieces`);
check('HEIGHT and it fits inside three phone-heights, which the flat one did not',
  geo.after < 844 * 3 && geo.control.h >= geo.after,
  `${geo.after}px against a 844px viewport`);

await quiet();
await page.screenshot({ path: `${DIR}/fam-grid-collapsed.png` });

/* ---- SCROLL: how far the thumb travels to the last tile ------------------
   QA round 23 F6 measured this slot at 1,420px and found that "past tile 36 the
   figure is never on screen while a tile is tappable". BOTH halves are measured
   here, at REAL scroll positions on the REAL scroller (the app scrolls a
   container, not the document, so document.scrollingElement reports 0 and an
   earlier version of this row graded a scroll that never happened), once with
   the flat control grid in the document and once with the collapsed one.

   AND THE FIGURE ROW IS REPORTED, NOT ASSERTED GREEN, because it is not fixed.
   Collapsing takes 458px off this grid and the Bonehead is STILL off screen by
   the time the last tile is under the thumb: 909px of tiles below a 414px doll
   does not fit in 844px and no amount of collapsing this slot makes it. What
   the collapse buys is TRAVEL, which is what the row below asserts. Saying so
   here rather than picking a threshold the current number happens to clear. */
const reach = await page.evaluate(async slot => {
  const grid = document.querySelector(`.ward-grid[data-wslot="${slot}"]`);
  const stage = document.querySelector('.bh-stage.lg');
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  /* THE APP SCROLLS A CONTAINER. Find it by walking up for the first ancestor
     that actually overflows, and fall back to the document only if none does. */
  const scrollerOf = el => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const o = getComputedStyle(n).overflowY;
      if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 4) return n;
    }
    return document.scrollingElement;
  };
  const scroller = scrollerOf(grid);
  const measure = async g => {
    scroller.scrollTop = 0;
    await raf();
    g.lastElementChild.scrollIntoView({ block: 'end', behavior: 'auto' });
    await raf();
    const lr = g.lastElementChild.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    return {
      lastTileVisible: lr.top < innerHeight && lr.bottom > 0 && lr.height > 20,
      figVisible: Math.round(Math.max(0, Math.min(sr.bottom, innerHeight) - Math.max(sr.top, 0))),
      figHeight: Math.round(sr.height),
      travel: Math.round(scroller.scrollTop),
      gridH: Math.round(g.getBoundingClientRect().height),
    };
  };
  const after = await measure(grid);
  /* the BEFORE: the same flat control, in the document, scrolled the same way */
  const cells = [...grid.querySelectorAll('.ward-cell')];
  const plain = cells.find(c => !c.classList.contains('fam') && !c.classList.contains('none'));
  const flat = document.createElement('div');
  flat.className = 'ward-grid';
  const n = cells.reduce((a, c) => a + (c.dataset.famIds ? c.dataset.famIds.split(' ').length : 1), 0);
  for (let i = 0; i < n; i++) { const c = plain.cloneNode(true); c.classList.remove('fam', 'equipped'); flat.appendChild(c); }
  grid.style.display = 'none';
  grid.parentNode.insertBefore(flat, grid);
  await raf();
  const before = await measure(flat);
  flat.remove();
  grid.style.display = '';
  scroller.scrollTop = 0;
  await raf();
  return { scroller: scroller.id || scroller.className || scroller.tagName,
    before, after, tiles: { before: n, after: cells.length } };
}, SLOT);
console.log('reach:', JSON.stringify(reach));
check('SCROLL both measurements really scrolled to a visible last tile',
  reach.before.lastTileVisible && reach.after.lastTileVisible
  && reach.before.travel > 0 && reach.after.travel > 0 && reach.before.figHeight > 100,
  `scroller ${reach.scroller}; flat travelled ${reach.before.travel}px, collapsed ${reach.after.travel}px, figure ${reach.after.figHeight}px tall`);
check('SCROLL the last tile is closer to the top of the slot than it was',
  reach.after.travel < reach.before.travel,
  `${reach.before.travel}px of thumb travel over ${reach.tiles.before} flat tiles -> ${reach.after.travel}px over ${reach.tiles.after} collapsed tiles (${reach.before.travel - reach.after.travel}px saved)`);
console.log(`NOT FIXED, reported: the Bonehead at the last tile is ${reach.before.figVisible}px visible flat and ${reach.after.figVisible}px collapsed, of ${reach.after.figHeight}px. Collapsing this slot buys travel, not the figure.`);

/* ---- SOLO: tapping a plain tile opens nothing ---------------------------- */
const soloTap = await tap(c => !c.classList.contains('fam') && !c.classList.contains('none') && !c.classList.contains('equipped'));
check('SOLO tapping a plain tile opens no rail and the tile still equips',
  soloTap && soloTap.rails === 0 && soloTap.equipped,
  soloTap ? `${soloTap.rails} rails after tapping ${soloTap.id}, equipped=${soloTap.equipped}` : 'no plain tile to tap');

/* ---- RAIL ---------------------------------------------------------------- */
const famTap = await tap(c => c.classList.contains('fam'), true);
if (!famTap) await die('NO FAMILY TILE TO TAP', geo);
console.log('rail:', JSON.stringify(famTap.rail));
const R = famTap.rail || {};
check('RAIL a rail opens, in the document, with a real box',
  R.connected && R.h > 40 && R.w > 100, `${R.w}x${R.h} at y=${R.y}`);
check('RAIL it sits inside the viewport, not below the fold',
  R.y >= 0 && R.y < 844, `y=${R.y}`);
check('RAIL one tappable tile per owned variant, every one with a real box',
  R.n === famTap.famSize && R.zeroBoxes === 0,
  `${R.n} tiles for a family of ${famTap.famSize}, ${R.zeroBoxes} with a zero rect`);
check('RAIL every variant is hit-testable once scrolled to',
  R.reachable === R.n, `${R.reachable}/${R.n} returned their own tile from elementFromPoint`);

await quiet();
await page.screenshot({ path: `${DIR}/fam-grid-rail.png` });

/* ---- WORN: the collapsed tile draws what you put on --------------------- */
await page.evaluate(() => {
  /* the RAIL row above dragged this rail across eight tiles; park it and let
     the smooth scroll land before a rect is read for a click */
  const r = document.querySelector('.fam-rail');
  if (r) { r.style.scrollBehavior = 'auto'; r.scrollLeft = 0; }
});
await sleep(600);
const worn = await page.evaluate(async () => {
  const tile = document.querySelector('.ward-cell.fam[aria-expanded="true"]');
  const rail = document.querySelector('.fam-rail');
  if (!tile || !rail) return { err: 'rail closed' };
  const cv = tile.querySelector('canvas.ward-art');
  const px = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const ink = d => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 16) n++; return n; };
  const sum = d => { let s = 0; for (let i = 0; i < d.length; i += 41) s = (s * 31 + d[i]) >>> 0; return s; };
  const b4 = px(cv);
  const target = [...rail.querySelectorAll('[data-equip]')].find(b => !b.classList.contains('equipped'));
  if (!target) return { err: 'every variant already worn' };
  const r = target.getBoundingClientRect();
  return { before: { ink: ink(b4), sum: sum(b4), id: tile.dataset.equip },
    click: { x: r.x + r.width / 2, y: r.y + r.height / 2, id: target.dataset.equip } };
});
if (worn.err) await die('WORN COULD NOT RUN', worn);
await page.mouse.click(worn.click.x, worn.click.y);
await sleep(1800);
const after = await page.evaluate(async id => {
  const db = await import('./js/db.js');
  const tile = document.querySelector('.ward-cell.fam[aria-expanded="true"]');
  const cv = tile && tile.querySelector('canvas.ward-art');
  if (!cv) return { err: 'tile gone' };
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let ink = 0, s = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 16) ink++;
  for (let i = 0; i < d.length; i += 41) s = (s * 31 + d[i]) >>> 0;
  const eq = await db.kvGet('equipped', {});
  const layers = [...document.querySelectorAll('.bh-stage.lg img')].map(i => i.getAttribute('src') || '');
  return { ink, sum: s, tileId: tile.dataset.equip, ringed: tile.classList.contains('equipped'),
    /* a football piece is one shared master plus .fb-tint spans, so "on the doll" for
       it means every one of the team's tint hexes is painted in this slot's spans */
    saved: eq.H, onDoll: layers.some(src => src.includes(`/${id}.png`)) || await (async () => {
      const { footballTints } = await import('./data/football-teams.js');
      const { BH_BY_ID } = await import('./data/boneheadz.js');
      const t = footballTints(BH_BY_ID[id]); if (!t) return false;
      const styles = [...document.querySelectorAll('.bh-stage.lg .fb-tint[data-fbslot="H"]')].map(s => (s.getAttribute('style') || '').toLowerCase());
      return t.every(x => styles.some(st => st.includes(String(x.hex).toLowerCase())));
    })(),
    railRing: [...document.querySelectorAll('.fam-rail [data-equip]')].filter(b => b.classList.contains('equipped')).map(b => b.dataset.equip) };
}, worn.click.id);
if (after.err) await die('WORN LOST THE TILE', after);
console.log('worn:', JSON.stringify({ before: worn.before, clicked: worn.click.id, after }));
check('WORN the equip really happened (saved, and drawn on the Bonehead)',
  after.saved === worn.click.id && after.onDoll,
  `saved=${after.saved}, wanted=${worn.click.id}, on the doll=${after.onDoll}`);
check('WORN the collapsed tile now points at the variant you put on',
  after.tileId === worn.click.id && after.ringed,
  `tile data-equip ${worn.before.id} -> ${after.tileId}, ringed=${after.ringed}`);
check('WORN and its PIXELS changed: the tile is drawing a different picture',
  after.sum !== worn.before.sum,
  `canvas checksum ${worn.before.sum} -> ${after.sum}`);
check('WORN the tile is still drawing a garment, not a blank square',
  after.ink > 500 && worn.before.ink > 500,
  `${worn.before.ink} inked pixels -> ${after.ink} of ${200 * 200}`);
check('WORN exactly the tapped variant is ringed in the rail',
  after.railRing.length === 1 && after.railRing[0] === worn.click.id,
  JSON.stringify(after.railRing));

await quiet();
await page.screenshot({ path: `${DIR}/fam-grid-worn.png` });

/* ---- SECOND: a different family, and only ever one rail -----------------
   ONE FAMILY IS AN ANECDOTE. The rows above all ran on the H10 headbands; this
   opens a SECOND, unrelated family (the H13 Blowfish hoods) and asserts the
   first rail closed when it did. A rail per open family would stack nine rails
   into this grid and undo the whole change, and nothing above could see it. */
const second = await page.evaluate(() => {
  const grid = document.querySelector('.ward-grid[data-wslot]');
  const open = document.querySelector('.ward-cell.fam[aria-expanded="true"]');
  const other = [...grid.querySelectorAll('.ward-cell.fam')]
    .filter(c => c !== open)
    .sort((a, b) => b.dataset.famIds.split(' ').length - a.dataset.famIds.split(' ').length)[0];
  if (!other) return null;
  document.querySelectorAll('[data-probe]').forEach(n => n.removeAttribute('data-probe'));
  other.scrollIntoView({ block: 'center' });
  other.dataset.probe = '1';
  return { first: open && open.dataset.family, family: other.dataset.family,
    size: other.dataset.famIds.split(' ').length, ids: other.dataset.famIds };
});
if (!second) await die('NO SECOND FAMILY TO OPEN', { note: 'the run needs two families to prove one is not a special case' });
await sleep(400);
const sBox = await page.evaluate(() => {
  const r = document.querySelector('[data-probe="1"]').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(sBox.x, sBox.y);
await sleep(1500);
const sOut = await page.evaluate(() => {
  const grid = document.querySelector('.ward-grid[data-wslot]');
  const rails = [...grid.querySelectorAll('.fam-rail')];
  const r = rails[0];
  return { rails: rails.length,
    family: r && r.dataset.family,
    n: r ? r.querySelectorAll('[data-equip]').length : 0,
    h: r ? Math.round(r.getBoundingClientRect().height) : 0,
    y: r ? Math.round(r.getBoundingClientRect().y) : -1,
    expanded: [...grid.querySelectorAll('.ward-cell.fam[aria-expanded="true"]')].map(c => c.dataset.family) };
});
console.log('second family:', JSON.stringify({ picked: second, got: sOut }));
check('SECOND a different family opens its own rail, the right size, on screen',
  sOut.family === second.family && sOut.n === second.size && sOut.h > 40 && sOut.y >= 0 && sOut.y < 844,
  `${second.family} (${second.size} variants, ids ${second.ids}) -> ${sOut.n} tiles, ${sOut.h}px at y=${sOut.y}`);
check('SECOND exactly one rail is open, and it belongs to exactly one tile',
  sOut.rails === 1 && sOut.expanded.length === 1 && sOut.expanded[0] === second.family,
  `${sOut.rails} rails, tiles marked open: ${JSON.stringify(sOut.expanded)} (the first was ${second.first})`);

await quiet();
await page.screenshot({ path: `${DIR}/fam-grid-second.png` });
console.log(`shots in ${DIR}`);
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nWARDROBE FAMILIES: ONE TILE PER DRAWING, THE RAIL HOLDS THE REST, THE TILE SHOWS WHAT IS ON');
process.exit(bad ? 1 : 0);

/* Tap a tile by predicate with a REAL mouse click at its centre. Programmatic
   .click() does not reach some of this app's handlers (godmode's own note), and
   this screen's whole complaint is about tiles you cannot reach, so a click that
   skips the geometry would be testing the wrong thing. */
async function tap(pred, wantRail = false) {
  const picked = await page.evaluate((src, big) => {
    const grid = document.querySelector('.ward-grid[data-wslot]');
    const fn = new Function('c', `return (${src})(c)`);
    let list = [...grid.querySelectorAll('.ward-cell')].filter(fn);
    if (big) list = list.sort((a, b) => b.dataset.famIds.split(' ').length - a.dataset.famIds.split(' ').length);
    const t = list[0];
    if (!t) return null;
    document.querySelectorAll('[data-probe]').forEach(n => n.removeAttribute('data-probe'));
    t.scrollIntoView({ block: 'center' });
    t.dataset.probe = '1';
    return { id: t.dataset.equip, famSize: t.dataset.famIds ? t.dataset.famIds.split(' ').length : 1 };
  }, pred.toString(), wantRail);
  if (!picked) return null;
  await sleep(500);
  const box = await page.evaluate(() => {
    const t = document.querySelector('[data-probe="1"]');
    const r = t.getBoundingClientRect();
    const fig = document.querySelector('.bh-stage.lg').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2,
      figTop: Math.round(fig.top), figBottom: Math.round(fig.bottom) };
  });
  await page.mouse.click(box.x, box.y);
  await sleep(1600);
  const out = await page.evaluate(() => {
    const grid = document.querySelector('.ward-grid[data-wslot]');
    const t = document.querySelector('[data-probe="1"]');
    const rail = grid.querySelector('.fam-rail');
    const base = { rails: grid.querySelectorAll('.fam-rail').length, equipped: !!t?.classList.contains('equipped'), id: t?.dataset.equip };
    if (!rail) return base;
    const r = rail.getBoundingClientRect();
    const tiles = [...rail.querySelectorAll('[data-equip]')];
    let zero = 0, reach = 0;
    /* SMOOTH SCROLLING OFF WHILE MEASURING. .fam-rail sets scroll-behavior:
       smooth, so a rect read straight after scrollIntoView belongs to a scroll
       that has not landed -- the same mis-measurement the football rail's own
       comment records ("reading scrollLeft back in the middle of a smooth
       scroll"). The first version of this row reported 3 of 8 tiles reachable
       on a rail where all 8 are. Restored below so the shot is of the real
       thing. */
    const was = rail.style.scrollBehavior;
    rail.style.scrollBehavior = 'auto';
    for (const b of tiles) {
      b.scrollIntoView({ block: 'nearest', inline: 'center' });
      const bb = b.getBoundingClientRect();
      if (bb.width < 10 || bb.height < 10) { zero++; continue; }
      const hit = document.elementFromPoint(bb.x + bb.width / 2, bb.y + bb.height / 2);
      if (hit && (hit === b || b.contains(hit))) reach++;
    }
    rail.scrollLeft = 0;
    rail.style.scrollBehavior = was;
    return { ...base, rail: { connected: rail.isConnected, h: Math.round(r.height), w: Math.round(r.width),
      y: Math.round(r.y), n: tiles.length, zeroBoxes: zero, reachable: reach } };
  });
  return { ...out, ...box, famSize: picked.famSize };
}
