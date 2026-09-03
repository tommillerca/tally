/* The three small fixes, operated rather than eyeballed. */
import { boot, sleep, shotDir } from './godmode.js';
const DIR = shotDir('tally-shots');  // machine-local, see godmode shotDir
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
/* 'shell', not 'new': on this Mac Page.captureScreenshot never returns under
   headless 'new', and this suite takes a screenshot. Measured 2026-09-03 on a
   4-cell probe (headless new|shell x captureBeyondViewport default|false):
   'new' hit the 45s protocolTimeout on BOTH cbv settings, 'shell' returned in
   234ms. So the camera was the fault, not the clip. See boot(). */
const { browser, page } = await boot(process.argv[2] || process.env.URL, { headless: process.env.HEADLESS_MODE || 'shell' });
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

// 1. the quests header now uses the display face, like the feature dropdowns
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1800);
await page.evaluate(() => { document.querySelector('.dw')?.remove(); document.querySelector('.drop-veil')?.remove(); });
/* RE-ANCHORED 2026-09-03 OFF A SIBLING AND ONTO THE TOKEN, and the app is fine.
   This read the face off `.glutton-banner .gbn-txt b` ON TODAY and compared the
   two. That element left Today on 2026-08-21 with the rest of the banner stack
   (js/app.js, "EVICTED FROM THE DAY"); the only .glutton-banner left is on Crew
   and inside the retired spire card. So `banner` came back null and the row went
   red about a comparison it could no longer take, not about the quests header.
   The rule it is FOR has not moved: app.css:3803 says the quests summary wears
   "the display face, matching the feature dropdowns (.gbn-txt b)", and .gbn-txt b
   is `font-family: var(--display)`. So compare against --display itself, read off
   the live page rather than pinned, which is the same rule stated against the
   thing both elements were always pointing at. BOTH sides must resolve, so a
   missing header or a missing token is a red and not a pass on two nulls. */
const fonts = await page.evaluate(() => {
  const q = document.querySelector('.q-collapse > summary');
  const first = v => (v || '').split(',')[0].trim().replace(/['"]/g, '') || null;
  return {
    quests: q ? first(getComputedStyle(q).fontFamily) : null,
    display: first(getComputedStyle(document.documentElement).getPropertyValue('--display')),
  };
});
console.log('fonts:', JSON.stringify(fonts));
check('the quests header matches the feature dropdowns', !!fonts.quests && !!fonts.display && fonts.quests === fonts.display, JSON.stringify(fonts));
const el0 = await page.$('.q-collapse');
if (el0) { await el0.screenshot({ path: `${DIR}/quests-font.png` }); console.log('shot quests-font'); }

// 2 + 3. the melt list: stat lines, the junk sweep, and the richer dust values
await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const { GEAR_ITEMS } = await import('./js/gear.js');
  const { totalXp, levelFor } = await import('./js/game.js');
  const lvl = levelFor(await totalXp()).level;
  const pool = GEAR_ITEMS.filter(g => (g.minLevel || 1) <= lvl);
  const junk = pool.filter(g => g.rarity === 'common' || g.rarity === 'uncommon').slice(0, 4);
  // pick rares with DIFFERENT stat totals, or the dust-varies check tests my
  // sampling instead of the formula
  const pts = g => Object.values(g.stats || {}).reduce((a, v) => a + v, 0);
  const rares = pool.filter(g => g.rarity === 'rare');
  const seen = new Set(), good = [];
  for (const g of rares.sort((a, b) => pts(a) - pts(b))) {
    if (seen.has(pts(g))) continue;
    seen.add(pts(g)); good.push(g);
    if (good.length === 4) break;
  }
  for (const g of [...junk, ...good]) await loot.grantGear(g.id, 'test');
  return { junk: junk.length, good: good.length };
});
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(1700);
await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="crates"]').click());
await sleep(1700);
await page.evaluate(() => { const sum = document.querySelector('.melt-fold > summary'); sum.scrollIntoView({ block: 'start' }); sum.click(); });
await sleep(900);
const list = await page.evaluate(() => ({
  rows: document.querySelectorAll('.melt-row').length,
  withStatLine: document.querySelectorAll('.melt-stat').length,
  withNoStatLine: document.querySelectorAll('.melt-nostat').length,
  junkBtn: document.getElementById('meltJunk')?.textContent.trim() || null,
}));
console.log('melt list:', JSON.stringify(list));
check('every row says whether it carries stats', list.rows > 0 && list.withStatLine + list.withNoStatLine === list.rows, JSON.stringify(list));
check('there is a junk sweep', !!list.junkBtn, String(list.junkBtn));

if (list.junkBtn) {
  await page.evaluate(() => document.getElementById('meltJunk').click());
  await sleep(600);
  const swept = await page.evaluate(() => {
    const picked = [...document.querySelectorAll('.melt-pick')].filter(c => c.checked);
    return {
      picked: picked.length,
      anyGoodPicked: picked.some(c => c.dataset.junk === '0'),
      bar: document.getElementById('meltGo')?.textContent.trim(),
    };
  });
  console.log('after the sweep:', JSON.stringify(swept));
  check('the sweep picks only the junk tiers, never a rare or legendary', swept.picked > 0 && !swept.anyGoodPicked, JSON.stringify(swept));
}
// the dust numbers on the rows must differ between statted and plain
const dust = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.melt-pick')];
  const g = rows.filter(r => r.dataset.junk === '0').map(r => +r.dataset.dust);
  const p = rows.filter(r => r.dataset.junk === '1').map(r => +r.dataset.dust);
  return { good: g, junk: p };
});
console.log('dust on the rows:', JSON.stringify(dust));
check('the good tiers melt for more than the junk', dust.good.length && dust.junk.length && Math.min(...dust.good) > Math.max(...dust.junk), JSON.stringify(dust));
check('dust varies within a tier, so stat points matter', new Set(dust.good).size > 1 || new Set(dust.junk).size > 1, JSON.stringify(dust));
const el = await page.$('.melt-fold');
if (el) { await el.screenshot({ path: `${DIR}/melt-stats.png` }); console.log('shot melt-stats'); }
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nSMALL FIXES VERIFIED');
process.exit(bad ? 1 : 0);
