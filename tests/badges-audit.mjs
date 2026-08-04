/* Show the badge wall with the four Warden badges EARNED, so Tom sees them as a
 * player would rather than greyed out. */
import { boot, sleep } from './godmode.js';
const DIR = '/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/a40abded-9d02-469c-8111-2200136500f1/scratchpad/shots';
const { browser, page } = await boot(process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

// award the four through the real ledger so they show as earned
await page.evaluate(async () => {
  const { db } = await import('./js/db.js');
  const { dateKey } = await import('./js/nutrition.js');
  for (const id of ['warden-7', 'warden-30', 'warden-100', 'siege-1'])
    await db.put('xp', { key: 'badge-' + id, type: 'badge', xp: 25, date: dateKey(), note: id });
});
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(1800);
await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="progress"]')?.click());
await sleep(2200);

const d = await page.evaluate(() => {
  const wanted = ['Warden', 'Keeper of the Gate', 'Lord of Spires', 'Siegebreaker'];
  const all = [...document.querySelectorAll('.badge')];
  const mine = all.filter(b => wanted.some(w => b.textContent.trim() === w));
  return {
    total: all.length,
    found: mine.map(b => ({
      name: b.textContent.trim(),
      earned: !b.classList.contains('locked'),
      drawn: !!b.querySelector('.bicon svg'),
      rawEmoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(b.querySelector('.bicon')?.textContent || ''),
    })),
  };
});
console.log(JSON.stringify(d, null, 1));
check('all four Warden badges are on the wall', d.found.length === 4, `${d.found.length} of 4`);
check('they show as earned', d.found.every(b => b.earned));
check('each one draws a pack icon, not a system emoji', d.found.every(b => b.drawn && !b.rawEmoji), JSON.stringify(d.found.map(b => [b.name, b.drawn, b.rawEmoji])));

// frame the four so they are legible in the shot
await page.evaluate(() => {
  const wanted = ['Warden', 'Keeper of the Gate', 'Lord of Spires', 'Siegebreaker'];
  const first = [...document.querySelectorAll('.badge')].find(b => b.textContent.trim() === 'Warden');
  first?.scrollIntoView({ block: 'center' });
});
await sleep(600);
const grid = await page.$('.badge-grid');
if (grid) { await grid.screenshot({ path: `${DIR}/badges.png` }); console.log('shot badges'); }
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nWARDEN BADGES RENDER AS DRAWN ICONS');
process.exit(bad ? 1 : 0);
