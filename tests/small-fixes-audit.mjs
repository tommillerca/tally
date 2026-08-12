/* The three small fixes, operated rather than eyeballed. */
import { boot, sleep } from './godmode.js';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
/* repo-relative and self-creating: the old absolute path pointed at one dead
   session's scratchpad, so every screenshot here threw on any other machine. */
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

// 1. the quests header now uses the display face, like the feature dropdowns
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1800);
await page.evaluate(() => { document.querySelector('.dw')?.remove(); document.querySelector('.drop-veil')?.remove(); });
const fonts = await page.evaluate(() => {
  const q = document.querySelector('.q-collapse > summary');
  const b = document.querySelector('.glutton-banner .gbn-txt b');
  const f = el => el ? getComputedStyle(el).fontFamily.split(',')[0].replace(/['"]/g, '') : null;
  return { quests: f(q), banner: f(b) };
});
console.log('fonts:', JSON.stringify(fonts));
check('the quests header matches the feature dropdowns', !!fonts.quests && fonts.quests === fonts.banner, JSON.stringify(fonts));
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
/* A MISSING TAB OR FOLD IS THE FINDING, NOT A CRASH. Both used to be bare
   `.click()` calls, so a missing crates tab or melt fold threw a TypeError and
   took every melt assertion below down with it, unrun and unreported. */
const tabbed = await page.evaluate(() => { const t = document.querySelector('#chTabs .ch-tab[data-tab="crates"]'); if (t) t.click(); return !!t; });
check('the Crates tab is there to open', tabbed, tabbed ? '' : '#chTabs .ch-tab[data-tab="crates"] is not on the page');
await sleep(1700);
const folded = await page.evaluate(() => {
  const sum = document.querySelector('.melt-fold > summary');
  if (!sum) return false;
  sum.scrollIntoView({ block: 'start' });
  sum.click();
  return true;
});
check('the melt fold is there to open', folded, folded ? '' : '.melt-fold > summary is not on the page');
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
