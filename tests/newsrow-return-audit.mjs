/* WHERE A NEWS ROW PUTS YOU BACK.
 *
 * Tapping a story in What's New closes the sheet, plays the announcement, and
 * then puts the player back on the News list once the announcement goes. That
 * "put them back" poll (js/app.js ~7228) waits for the VEIL to close and for
 * the hash to be unchanged, and both of those miss the same case: an
 * announcement whose CTA opens a SHEET without navigating.
 *
 * The Bone Garden row does exactly that. Its popup's CTA closes the veil and
 * calls openGardenSheet, so the poll saw no veil and an unchanged hash,
 * concluded the player was back where they started, and re-opened What's New
 * ON TOP of the garden sheet. Measured before the fix: sheet depth 2, and
 * closing What's New left the player looking at a Bone Garden sheet they never
 * opened, on the Crew tab.
 *
 * This was found by surveying every closeAllSheetsViaHistory caller after the
 * Glutton bug (one popstate closes one sheet, so depth 2 strands a sheet). The
 * survey called this one "the one to watch" and could not reproduce it inside
 * its timebox. It reproduces; this pins it.
 *
 * PROVE-RED: remove the `if (sheetStack.length) return;` guard and DEPTH fails
 * with two sheets open.
 *
 * Usage: node tests/newsrow-return-audit.mjs [baseUrl]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srv.url;

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const { browser, page } = await boot(base);
const state = () => page.evaluate(() => ({
  sheets: document.querySelectorAll('#sheets > div').length,
  names: [...document.querySelectorAll('#sheets > div')].map(d => (d.querySelector('h2')?.textContent || '?').trim()),
  veil: !!document.querySelector('.drop-veil'),
  hash: location.hash,
}));

await page.evaluate(() => {
  window.__testMe = { playerId: 'me', name: 'Hollow Shovel', friendCode: 'BONE-4K7Q', handle: 'hollow' };
  window.__testFriends = { friends: [], incoming: [], outgoing: [] };
  location.hash = '#/friends';
});
await sleep(2400);
await page.evaluate(() => document.getElementById('crewWhatsNew')?.click());
await sleep(1400);
await page.evaluate(() => document.querySelector('[data-wntab="news"]')?.click());
await sleep(600);
const opened = await state();
ok('SETUP What\'s New is open on the News tab', opened.sheets === 1, JSON.stringify(opened));

/* The garden row is the one whose CTA opens a sheet rather than navigating.
   If it ever stops doing that, this audit is testing nothing, so check. */
const tapped = await page.evaluate(() => { const r = document.querySelector('[data-news="garden"]'); if (!r) return false; r.click(); return true; });
ok('SETUP the garden story is listed and tappable', tapped, '');
await sleep(1600);
const popped = await state();
ok('SETUP its announcement opened', popped.veil, JSON.stringify(popped));

const cta = await page.evaluate(() => { const b = document.getElementById('gardenSeeBtn'); if (!b) return false; b.click(); return true; });
ok('SETUP the announcement CTA is there to take', cta, '');
await sleep(1400);
const onSheet = await state();
ok('SETUP the CTA opened a SHEET without navigating (the case the poll missed)',
  onSheet.sheets === 1 && !onSheet.veil && onSheet.hash === opened.hash, JSON.stringify(onSheet));

/* The poll gets its turn here. It must leave the player where the CTA put
   them, not stack the News list back on top of it. */
await sleep(3000);
const after = await state();
ok('DEPTH the News list does NOT re-open on top of the sheet the player chose',
  after.sheets === 1, JSON.stringify(after));
ok('DEPTH and the sheet they are on is the one they asked for',
  after.names.some(n => /garden/i.test(n)), JSON.stringify(after.names));

/* And the exit: closing that sheet must return them to the tab they came
   from, with nothing left underneath. */
await page.evaluate(() => document.querySelector('#sheets > div:last-child .sheet-close')?.click());
await sleep(1400);
const exit = await state();
ok('EXIT closing it leaves no stale sheet behind', exit.sheets === 0, JSON.stringify(exit));
ok('EXIT and the player is back on the tab they started from', exit.hash === opened.hash, `${exit.hash} vs ${opened.hash}`);

console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`);
await browser.close();
srv?.close();
process.exit(fails.length ? 1 : 0);
