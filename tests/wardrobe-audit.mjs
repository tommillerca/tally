/* Two complaints: equipping flashes the whole page, and the chosen background moves
 * with the character. Both are measured, not eyeballed.
 *   FLASH  -> is unrelated DOM being destroyed on each tap? Stamp a marker and see
 *             if it survives.
 *   BACKDROP -> is the background inside the element carrying the idle animation? */
/* MERGE NOTE (pre-flight, 2026-08-12): two branches improved this header and
   each dropped the other's improvement. ext/audit-hardening made DIR
   repo-relative and self-creating (the old absolute path pointed into a dead
   session's scratchpad and threw on any other machine); ext/detach-guard-adoption
   added the shared retryOnDetach import. Both are wanted, so both are here. */
import { boot, sleep, retryOnDetach } from './godmode.js';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIR = fileURLToPath(new URL('./shots', import.meta.url));
mkdirSync(DIR, { recursive: true });
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
const { browser, page } = await boot(process.argv[2] || process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

/* own a background so there IS one to misbehave.
   grantCosmetic, NOT grantItem: there is no grantItem, and the old `?.` swallowed
   that whole chain (grant AND the trailing .catch) to undefined. Nothing was
   seeded, no error was raised, and every check below graded whatever the demo
   save happened to hold. An unseeded fixture is an empty sample, so it fails the
   run here rather than quietly grading nothing. */
const seeded = await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const { BH_ITEMS } = await import('./data/boneheadz.js');
  const bg = BH_ITEMS.filter(i => i.slot === 'BG').slice(0, 2).map(b => b.id);
  const hats = BH_ITEMS.filter(i => i.slot === 'H').slice(0, 5).map(h => h.id);
  for (const id of [...bg, ...hats]) await loot.grantCosmetic(id, 'test');
  const db = await import('./js/db.js');
  if (bg[0]) { const eq = await db.kvGet('equipped', {}); eq.BG = bg[0]; await db.kvSet('equipped', eq); }
  const owned = await loot.ownedCosmeticIds();
  return { bg, hats, missing: [...bg, ...hats].filter(id => !owned.has(id)) };
}).catch(e => ({ error: String(e) }));
if (seeded.error || seeded.missing.length || !seeded.bg.length || !seeded.hats.length) {
  console.log('SEED FAILED, nothing below would be graded against the seeded state:', JSON.stringify(seeded));
  await browser.close();
  process.exit(1);
}
console.log('seeded:', JSON.stringify({ bg: seeded.bg, hats: seeded.hats }));
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(2000);
await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="wardrobe"]')?.click());
await sleep(2200);

// ---- the BACKDROP ----
/* This page.evaluate is the exact site that reproduced "Attempted to use
   detached Frame" under load-avg 13 on 2026-08-12: a plain post-click read
   of the just-rendered wardrobe stage, with nothing navigating between the
   tab click at line 32 and this evaluate. Under CDP starvation the frame's
   execution-context id flips out from under puppeteer between the sleep
   and this call, and the audit dies naming this line. Wrapped in the
   harness-level retryOnDetach (godmode.js): only the specific detach text
   is caught, exactly one retry, and the resync re-waits for .bh-stage.lg
   before the second read so the retry reads a settled page rather than
   guessing. A second detach or any other error propagates untouched. */
const readBgInfo = () => page.evaluate(() => {
  const stage = document.querySelector('.bh-stage.lg');
  if (!stage) return null;
  const back = stage.querySelector('.bh-backdrop');
  const anim = stage.querySelector('.bh-anim');
  return {
    hasBackdrop: !!back,
    backdropInsideAnimated: !!(back && back.closest('.bh-anim')),
    bgImgsInsideAnim: anim ? [...anim.querySelectorAll('img')].filter(i => /\/BG\//.test(i.getAttribute('src') || '')).length : -1,
    animHasAnimation: anim ? getComputedStyle(anim).animationName : null,
    backdropAnimation: back ? getComputedStyle(back).animationName : null,
  };
});
const bgInfo = await retryOnDetach(readBgInfo, () =>
  page.waitForFunction(() => !!document.querySelector('.bh-stage.lg'),
    { timeout: 15000, polling: 100 }));
console.log('backdrop:', JSON.stringify(bgInfo));
check('the stage renders a static backdrop element', !!bgInfo?.hasBackdrop);
check('the backdrop is NOT inside the animated stack', bgInfo && bgInfo.backdropInsideAnimated === false);
check('no BG layer is left inside the animated stack', bgInfo && bgInfo.bgImgsInsideAnim === 0, String(bgInfo?.bgImgsInsideAnim));
check('the character stack is still the thing that animates', bgInfo && bgInfo.animHasAnimation === 'bh-idle', String(bgInfo?.animHasAnimation));
check('and the backdrop itself never animates', bgInfo && bgInfo.backdropAnimation === 'none', String(bgInfo?.backdropAnimation));

// ---- the FLASH ----
// stamp unrelated nodes; a full re-render destroys them, an in-place update does not
await page.evaluate(() => {
  document.querySelectorAll('.ward-grid').forEach((g, i) => { g.dataset.marker = 'm' + i; });
  const other = document.querySelectorAll('.ward-cell');
  if (other.length) other[other.length - 1].dataset.marker = 'last';
});
const cells = await page.evaluate(() => {
  const g = document.querySelector('.ward-grid[data-wslot]');
  const list = g ? [...g.querySelectorAll('[data-equip]')] : [];
  return { slot: g?.dataset.wslot, count: list.length, ids: list.map(c => c.dataset.equip) };
});
console.log('first slot grid:', JSON.stringify(cells));
check('there is a slot grid tagged with its slot', !!cells.slot, JSON.stringify(cells));

const target = await page.evaluate(() => {
  const g = document.querySelector('.ward-grid[data-wslot]');
  const notEquipped = [...g.querySelectorAll('[data-equip]')].find(c => !c.classList.contains('equipped'));
  if (!notEquipped) return null;
  notEquipped.dataset.probe = '1';
  return { id: notEquipped.dataset.equip };
});
if (!target) { console.log('no unequipped item to try on; cannot test'); await browser.close(); process.exit(1); }
await page.evaluate(() => document.querySelector('[data-probe="1"]').click());
await sleep(1400);
const after = await page.evaluate(() => ({
  markersSurvived: [...document.querySelectorAll('.ward-grid')].filter(g => g.dataset.marker).length,
  gridCount: document.querySelectorAll('.ward-grid').length,
  lastMarkerSurvived: !!document.querySelector('.ward-cell[data-marker="last"]'),
  probeStillThere: !!document.querySelector('[data-probe="1"]'),
  probeNowEquipped: !!document.querySelector('[data-probe="1"]')?.classList.contains('equipped'),
  ringsInThatGrid: document.querySelectorAll('.ward-grid[data-wslot] .equipped').length,
  stageLayers: document.querySelectorAll('.bh-stage.lg .bh-anim img').length,
  stageComposing: !!document.querySelector('.bh-stage.lg .bh-anim.bh-composing'),
  // a MISSING backdrop used to satisfy this (undefined?.closest() -> undefined -> !undefined
  // is true), so "the backdrop stayed outside" passed with the backdrop deleted.
  backdropStillOutside: !!document.querySelector('.bh-backdrop') && !document.querySelector('.bh-backdrop').closest('.bh-anim'),
}));
console.log('after equipping:', JSON.stringify(after));
check('the page was NOT rebuilt: unrelated grids survive', after.markersSurvived === after.gridCount && after.gridCount > 0, JSON.stringify(after));
check('a far-away cell survives too', after.lastMarkerSurvived);
check('the tapped cell is the same element, now ringed', after.probeStillThere && after.probeNowEquipped);
check('exactly one ring in that slot', after.ringsInThatGrid === 1, String(after.ringsInThatGrid));
check('the character still has its layers', after.stageLayers > 0, `${after.stageLayers} layers`);
check('and is NOT hidden mid-swap (no flash)', after.stageComposing === false);
check('the backdrop stayed outside the animation', after.backdropStillOutside);
const st = await page.$('.bh-stage.lg');
/* the evidence shot must not be able to kill the run: a missing stage is already
   a named FAIL above ("the character still has its layers"), not a throw here. */
if (st) { await st.screenshot({ path: `${DIR}/wardrobe-stage.png` }); }
else { console.log('note: no .bh-stage.lg to shoot'); }
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nWARDROBE: NO FLASH, BACKDROP HELD STILL');
process.exit(bad ? 1 : 0);
