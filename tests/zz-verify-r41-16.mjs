/* One-off verification for R41-16: the Today level chip must repaint on a
 * real Pit fight settle, WITHOUT navigating away and back. Drives a real
 * fight through the game's own engine (godmode.finishFight -> __bhFight.finish),
 * reads #lvlChip's DOM text before and after, on the SAME standing screen. */
import { boot, seed, openPit, fightRung, finishFight, settle, sleep, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srv = await serveTree(ROOT);
const base = srv.url;   // boot() appends ?demo itself; appending it here too double-added the query string
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

const { browser, page } = await boot(base);
// low level, no rungs beaten: rung 1 must be winnable and pay xp
await seed(page, { level: 3, coins: 500 });

const chipText = () => page.evaluate(() => document.querySelector('#lvlChip')?.textContent.replace(/\s+/g, ' ').trim() || null);

const before = await chipText();
console.log('chip before:', before);

const opened = await fightRung(page, 1);
check('fight opened', !!opened);

const over = await finishFight(page, 'p');
check('fight resolved with a real winner', !!over && over.winner, JSON.stringify(over));

// close the fight-over card (Done) WITHOUT navigating: the Pit sheet closes,
// Today (already standing behind it) is what we read next.
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter(b => /^(done|collect)$/i.test(b.textContent.trim()));
  btns.forEach(b => b.click());
});
await settle(page, 400);
await sleep(400);

const after = await chipText();
console.log('chip after (same screen, no navigation):', after);

check('the level chip text on Today actually changed after the fight settled, with no navigation', before !== after, `before="${before}" after="${after}"`);

// sanity: a real navigation-refresh (route()) would ALSO show the new number;
// confirm the two agree (i.e. the in-place repaint did not invent a WRONG number)
await page.evaluate(() => location.hash = '#/trends');
await sleep(300);
await page.evaluate(() => location.hash = '#/today');
await sleep(500);
const afterNav = await chipText();
check('the in-place repaint matches what a full re-render shows (no false number)', after === afterNav, `inPlace="${after}" reRendered="${afterNav}"`);

await browser.close();
srv.close();
console.log(bad ? `\n${bad} FAILED` : '\nALL GREEN');
process.exit(bad ? 1 : 0);
