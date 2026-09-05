/* tests/looks-door-audit.mjs: THE LOOKS COLLECTION HAS A DOOR.
 *
 * WHY THIS EXISTS. v395 removed the LOOKS card from the Backpack hub. That card
 * was the collection's ONLY entry point, so `tab === 'looks'` in renderCharacter
 * kept rendering perfectly and no player could ever reach it: the hub chips were
 * wardrobe/crates/shop/talents, nothing in the DOM carried data-tab="looks", and
 * the app threw no error because nothing was broken. A screen with no door does
 * not look like a bug from the inside.
 *
 * The LEVEL chip came off in the same change and was checked: its screen is
 * reached by openProgressSheet() from elsewhere. Looks got no such check, which
 * is the whole lesson. "The screen renders" is not reachability.
 *
 * WHAT IT ASSERTS, all by OPERATING controls with a real mouse, never by calling
 * renderCharacter directly (calling the render function proves the branch works,
 * which was never in doubt):
 *   SEED     the fixture really owns looks, so the grid below has something to
 *            draw. An empty sample set is a failure, not a pass.
 *   HUB      the chip row is still exactly 4 chips and LEVEL is still gone, so
 *            restoring the door cannot quietly restore what Tom deliberately cut
 *   DOOR     a control carrying data-tab="looks" exists on the WARDROBE screen
 *   HIT      document.elementFromPoint at its centre is that control, so nothing
 *            is sitting on top of it
 *   OPENS    a real page.click on it renders the collection: [data-look-info]
 *            tiles present, [data-look-locked] tiles present
 *   COUNT    the collected tally is visible and agrees with the tiles drawn
 *
 * DIRECTION OF FAILURE. Remove the .ward-looks button from js/app.js and DOOR,
 * HIT, OPENS and COUNT all go red; that is the exact regression this watches and
 * it was run that way before this file was committed. Put the chip back in
 * #chTabs instead and HUB goes red on 5 chips.
 *
 * COUNT'S RULE, RE-PREMISED 2026-09-05. fix/memory-families (merged into this
 * branch) made the Collection draw one tile per bhFamilyKey, not one per owned
 * piece: a 32-team kit collapses to one badge with a rail, so a piece-counting
 * door (e.g. "26/624 looks") promised 26 while the screen behind it drew 21.
 * The door now counts what the shelf draws (families), pieces moved to a
 * secondary "N pieces" clause on the same button. A "tile" therefore means any
 * drawn, unlocked .col-cell -- a lone piece's own tile (carries
 * data-look-info) or a family's one collapsed badge (carries data-fam-toggle)
 * -- so COUNT below sums both, not [data-look-info] alone.
 *
 * Self-serves THIS checkout when given no URL: boot() defaults to the live site,
 * so a bare run would grade production and read as coverage of the tree.
 *   node tests/looks-door-audit.mjs            # this worktree
 *   node tests/looks-door-audit.mjs <url>      # somewhere else
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT = process.env.SHOT || path.join(os.tmpdir(), 'looks-door.png');
const argUrl = process.argv[2] || process.env.URL;
const own = argUrl ? null : await serveTree(ROOT);
const url = argUrl || own.url;

const { browser, page } = await boot(url);
let bad = 0, ran = 0;
const check = (l, ok, d = '') => { ran++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };
const done = async code => { await browser.close(); if (own) own.close(); process.exit(code); };

/* SEED. Own a spread of cosmetics so the collection has both collected and
   locked tiles to draw. Without this the grid can be empty and every assertion
   below would be grading nothing. */
const seeded = await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const { BH_ITEMS } = await import('./data/boneheadz.js');
  const ids = BH_ITEMS.filter(i => !i.default).slice(0, 12).map(i => i.id);
  for (const id of ids) await loot.grantCosmetic(id, 'test');
  const have = await loot.collectedLooks();
  return { asked: ids.length, missing: ids.filter(id => !have.has(id)), total: BH_ITEMS.filter(i => !i.default).length };
}).catch(e => ({ error: String(e) }));
check('SEED the fixture owns collected looks to draw', !seeded.error && seeded.asked > 0 && seeded.missing?.length === 0,
  JSON.stringify(seeded));
if (bad) { console.log('\nFAIL (seed): nothing below would grade against a seeded state.'); await done(1); }

await page.evaluate(() => { location.hash = '#/bonehead'; });
await page.waitForFunction(() => !!document.querySelector('#chTabs .ch-tab'), { timeout: 20000, polling: 100 });
await page.click('#chTabs .ch-tab[data-tab="wardrobe"]');
await page.waitForFunction(() => !!document.querySelector('.ward-head'), { timeout: 20000, polling: 100 });
await sleep(600);

/* HUB. The row Tom took to four tabs stays at four, and LEVEL stays gone. */
const hub = await page.evaluate(() => ({
  chips: [...document.querySelectorAll('#chTabs .ch-tab')].map(c => c.dataset.tab),
  labels: [...document.querySelectorAll('#chTabs .ch-tab')].map(c => c.textContent.trim().toUpperCase()),
  looksChipInHub: !!document.querySelector('#chTabs [data-tab="looks"]'),
  cols: getComputedStyle(document.querySelector('#chTabs')).gridTemplateColumns.split(' ').length,
}));
console.log('hub:', JSON.stringify(hub));
check('HUB the chip row is exactly 4 chips', hub.chips.length === 4, hub.chips.join(', '));
check('HUB the row still lays out as 4 columns', hub.cols === 4, String(hub.cols));
check('HUB LEVEL is still absent from the chip row', !hub.labels.some(l => l.includes('LEVEL')) && !hub.chips.includes('progress'));
check('HUB the Looks door is NOT back in the chip row', hub.looksChipInHub === false);

/* DOOR + HIT. It exists on the wardrobe screen, and nothing is over it. */
const door = await page.evaluate(() => {
  const b = document.querySelector('.ward-head [data-tab="looks"]');
  if (!b) return { found: false };
  const r = b.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    found: true, text: b.textContent.trim(), tag: b.tagName, w: Math.round(r.width), h: Math.round(r.height),
    hitIsDoor: !!(hit && hit.closest('[data-tab="looks"]') === b),
    hitWas: hit ? (hit.className || hit.tagName) : null,
  };
});
console.log('door:', JSON.stringify(door));
check('DOOR the Wardrobe carries a control that opens the Looks collection', door.found === true);
check('DOOR it is a real button with a real box', door.tag === 'BUTTON' && door.w > 40 && door.h > 14, `${door.w}x${door.h}`);
check('HIT nothing is sitting on top of it', door.hitIsDoor === true, String(door.hitWas));
const pillN = Number(String(door.text || '').match(/(\d+)\s*\/\s*(\d+)/)?.[1] ?? -1);
check('COUNT the door shows the collected tally', pillN >= 0 && /\d+\s*\/\s*\d+\s*looks/i.test(door.text || ''), door.text);

/* OPENS. A real mouse click, at the real coordinates, on the real page.
   A missing door must still be REPORTED by the rows below rather than thrown as
   a stack: on a tree with no door the whole point is to read four red rows
   naming the regression, not a puppeteer selector error. */
if (door.found) {
  await page.screenshot({ path: SHOT.replace(/\.png$/, '-wardrobe.png') });
  await page.click('.ward-head [data-tab="looks"]');
  await page.waitForFunction(() => !!document.querySelector('[data-look-info], [data-fam-toggle], [data-look-locked]'),
    { timeout: 20000, polling: 100 }).catch(() => {});
  await sleep(700);
}

const coll = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('.col-head')].map(h => h.textContent.trim());
  return {
    info: document.querySelectorAll('[data-look-info]').length,
    // a drawn owned tile is EITHER a lone piece (data-look-info) or a
    // collapsed family badge (data-fam-toggle, no data-look-info of its own)
    // -- see the 2026-09-05 note above the file header.
    tiles: document.querySelectorAll('.col-grid .col-cell:not(.locked)').length,
    locked: document.querySelectorAll('[data-look-locked]').length,
    heads: heads.slice(0, 4),
    tallies: heads.filter(t => /\d+\s+of\s+\d+/.test(t)).length,
    stillOnWardrobe: !!document.querySelector('.paperdoll'),
  };
});
console.log('collection:', JSON.stringify(coll));
check('OPENS the click landed on the Looks collection, not the Wardrobe', coll.stillOnWardrobe === false);
check('OPENS collected pieces render', coll.info > 0, `${coll.info} [data-look-info]`);
check('OPENS locked pieces render', coll.locked > 0, `${coll.locked} [data-look-locked]`);
check('COUNT a per-slot "N of M" tally is on screen', coll.tallies > 0, coll.heads.join(' | '));
check('COUNT the tiles drawn match the tally the door advertised', coll.tiles === pillN, `tiles ${coll.tiles}, door said ${pillN}`);

await page.screenshot({ path: SHOT });
console.log('shots:', SHOT.replace(/\.png$/, '-wardrobe.png'), 'and', SHOT);
console.log(bad ? `\nFAIL (${bad} of ${ran})` : `\nall green, ${ran} checks`);
await done(bad ? 1 : 0);
