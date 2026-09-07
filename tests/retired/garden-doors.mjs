/* THE GARDEN IS FINDABLE.
 *
 * Tom, 2026-08-07: "the garden feels like an after thought that you wouldn't
 * think to click into." He was right about the cause. The Bone Garden was ONE
 * ROW inside the Kitchen sheet, wedged between the cauldrons and the recipe list,
 * so reaching it needed you to already know the Kitchen existed, open it, and
 * notice a line among eleven recipes. Nothing on the home screen ever said a crop
 * was ready.
 *
 * His call, 2026-08-07, after seeing three options: C and B2, not A. So:
 *   B2  Today's action row is FIVE doors, Kitchen and Garden paired at the end,
 *       and the Garden's door carries a live count when crops are ready.
 *   C   The Kitchen opens on two doors, COOK and GROW, of equal weight. Cooking
 *       is one tap deeper than it used to be. That is the trade he accepted.
 * Built to market-quality-mockups/garden-c-kitchen.html and garden-b-tile.html.
 *
 * PROVE-RED (each confirmed 2026-08-07, failure text is what it printed):
 *   DOORS   render the cook view first (set `view = 'cook'`)
 *           -> "the Kitchen opens on its two doors" fails, doorCook missing
 *   BURIED  put gardenRowHtml(garden, seedTotal) back in the cook view
 *           -> BURIED fails, the row is back inside the recipe list
 *   TILE    drop the gardenActBtn tile from the action row
 *           -> TILE fails at 4 tiles with no Garden
 *   COOK    remove the #kdBack control
 *           -> COOK fails, there is no way back out of the recipe list
 *
 * Usage: node tests/garden-doors.mjs        (URL=... for live)
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree} from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srv = null, srvHandle = null;
let base = process.env.URL;
if (!base) {
  /* serveTree: a free port from the OS, and a HARD ERROR if python never
     bound. The hard-coded port with stdio:'ignore' meant a stranded server
     already holding it made this audit talk to whatever was listening. */
  srvHandle = await serveTree(ROOT);
  srv = { kill: () => srvHandle.close() };
  base = srvHandle.url;
}
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const { browser, page } = await boot(base);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await seed(page, { level: 16, coins: 900 });

/* Seeds in the pouch and a ripe crop, so the doors have something true to say and
   the Garden's tile has a count. Written the way the game writes them. */
await page.evaluate(async () => {
  const { kvSet } = await import('./js/db.js');
  const now = Date.now();
  await kvSet('garden', {
    plotsOwned: 3,
    plots: [
      { ing: 'graveroot', plantedAt: now - 9e6, readyAt: now - 1e5, watered: true },
      { ing: 'bog', plantedAt: now - 2e6, readyAt: now + 7e6, watered: false },
      null,
    ],
    seeds: { graveroot: 3, bog: 2 },
  });
});
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(2200);

/* ------------------------------------------------- the row stays at FOUR doors
   A fifth Garden tile shipped in v304 and came straight back out the same day.
   Tom: "we dont need the garden icon on Today because if you click kitchen it's
   gonna basically take you there." So the invariant is the opposite of what it
   was for a few hours: the row is four, and the Kitchen's dot has to speak for
   the Garden too, or a ripe crop goes unannounced anywhere a player looks. */
const row = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll('.hero-actions .hero-act')];
  const k = document.querySelector('#kitchenActBtn');
  return {
    n: tiles.length,
    labels: tiles.map(t => t.innerText.replace(/\s+/g, ' ').trim()),
    gardenTile: !!document.querySelector('#gardenActBtn'),
    kitchenBadge: !!(k && k.querySelector('.hero-badge')),
  };
});
ok('TILE the row is four doors, not five', row.n === 4, `${row.n}: ${row.labels.join(' | ')}`);
ok('TILE there is no separate Garden tile', row.gardenTile === false, `#gardenActBtn present: ${row.gardenTile}`);
/* The seed above leaves one crop ready and nothing cooking, so the ONLY reason
   this dot can be lit is the Garden. That is the whole point of folding it in.
   PROVE-RED: drop `|| cropsRipe` from the Kitchen tile and this fails. */
ok('TILE a ripe crop lights the Kitchen door, since nothing else will',
  row.kitchenBadge === true, `badge on Kitchen: ${row.kitchenBadge}`);
const clipped = await page.evaluate(() => [...document.querySelectorAll('.hero-actions .hero-act span')]
  .filter(s => s.scrollWidth > s.clientWidth + 1).map(s => s.textContent.trim()));
ok('TILE no label is clipped', clipped.length === 0, clipped.join(', ') || 'all four fit');

/* ------------------------------------------------------------- C: the Kitchen */
await page.evaluate(() => document.getElementById('kitchenActBtn')?.click());
await sleep(1800);
const doors = await page.evaluate(() => {
  const t = el => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
  return {
    cook: t(document.querySelector('#doorCook')),
    grow: t(document.querySelector('#doorGrow')),
    recipesOnFirstScreen: document.querySelectorAll('.crate-row.recipe').length,
    buriedRow: !!document.querySelector('#gardenRow'),
    ingredients: document.querySelectorAll('.ing-cell').length,
  };
});
ok('DOORS the Kitchen opens on its two doors', !!doors.cook && !!doors.grow,
  JSON.stringify({ cook: !!doors.cook, grow: !!doors.grow }));
ok('DOORS it does NOT open on the recipe list any more', doors.recipesOnFirstScreen === 0,
  `${doors.recipesOnFirstScreen} recipes on the first screen`);
/* THE ACTUAL COMPLAINT. A row buried in a list is what "afterthought" meant. */
ok('BURIED the Garden is no longer a row inside the recipe list', doors.buriedRow === false,
  `#gardenRow present: ${doors.buriedRow}`);
ok('DOORS each door states its own live state (an empty door is a FAILURE)',
  /ready|cook|ingredient/i.test(doors.cook || '') && /ready|water|growing|seed|planted/i.test(doors.grow || ''),
  JSON.stringify({ cook: doors.cook, grow: doors.grow }));
ok('DOORS GROW says what the garden actually holds right now',
  /1 crop ready/i.test(doors.grow || '') && /5 seeds unplanted/i.test(doors.grow || ''), String(doors.grow));
ok('DOORS the ingredients stay on the shared screen', doors.ingredients > 0, `${doors.ingredients} cells`);

/* BALANCE. Tom, 2026-08-07: "i think we can make the banner for the haunted
   kitchen much smaller now because it's banner heavy." It was 178px of marquee
   sitting on top of two doors, which pushed GROW off the bottom of an 852px
   phone: the door that fixes the discovery problem needed a scroll to be seen.
   The band is 92px now and both doors land above the fold.
   PROVE-RED (confirmed 2026-08-07): put .marquee back to height:178px and the
   first BALANCE check fails, {"marquee":178,"cook":146}. The second one did NOT
   go red at 178px on this 852px phone (GROW still ended at 617), so it is a
   floor for smaller screens rather than a proven guard, and it is written down
   that way instead of being claimed as one. */
const balance = await page.evaluate(() => {
  const h = s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : null; };
  const g = document.querySelector('#doorGrow');
  return { marquee: h('.marquee'), cook: h('#doorCook'), grow: h('#doorGrow'),
    growBottom: g ? Math.round(g.getBoundingClientRect().bottom) : null, vh: innerHeight };
});
ok('BALANCE the banner does not outweigh the doors it sits on',
  balance.marquee != null && balance.marquee < balance.cook,
  JSON.stringify({ marquee: balance.marquee, cook: balance.cook }));
ok('BALANCE both doors are on screen without scrolling',
  balance.growBottom != null && balance.growBottom <= balance.vh,
  JSON.stringify({ growBottom: balance.growBottom, viewport: balance.vh }));

await page.evaluate(() => document.getElementById('doorGrow')?.click());
await sleep(1400);
const grew = await page.evaluate(() => document.querySelectorAll('.sheet-head h2')[document.querySelectorAll('.sheet-head h2').length - 1]?.textContent.trim());
ok('DOORS GROW opens the Bone Garden', /bone garden/i.test(grew || ''), String(grew));
await page.evaluate(() => history.back());
await sleep(800);

await page.evaluate(() => document.getElementById('doorCook')?.click());
await sleep(1000);
const cookView = await page.evaluate(() => ({
  recipes: document.querySelectorAll('.crate-row.recipe').length,
  pots: !!document.querySelector('.pot-row'),
  back: !!document.querySelector('#kdBack'),
  backVisible: (() => { const b = document.querySelector('#kdBack'); if (!b) return false; const r = b.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.top < innerHeight; })(),
}));
ok('COOK the recipes and cauldrons are behind the COOK door', cookView.recipes > 0 && cookView.pots,
  JSON.stringify(cookView));
/* Anti-regression rule 8: never default to hidden, and never strand anyone. */
ok('COOK there is a way back to the doors, on screen', cookView.back && cookView.backVisible,
  JSON.stringify({ present: cookView.back, onScreen: cookView.backVisible }));
const backOut = await page.evaluate(async () => {
  document.querySelector('#kdBack')?.click();
  await new Promise(r => setTimeout(r, 500));
  return !!document.querySelector('#doorGrow');
});
ok('COOK and it really does go back', backOut === true, `doors restored: ${backOut}`);

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
