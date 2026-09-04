/* WHERE A NEWS ROW PUTS YOU BACK.
 *
 * Tapping a story in What's New closes the sheet, plays the announcement, and
 * then puts the player back on the News list once the announcement goes. That
 * "put them back" poll (js/app.js, the [data-news] handler in openWhatsNew)
 * watches for the VEIL or a .tz-pop sheet to close and for the hash to be
 * unchanged, and it must NOT re-open What's New on top of a sheet the player
 * chose. Two guards do that: the `.tz-pop` clause in `stillOpen` and the
 * `if (sheetStack.length) return;` early exit.
 *
 * HISTORY. This file was written around the Bone Garden row, whose poster CTA
 * opened the Hollow sheet on the same hash: the poll saw no veil and an
 * unchanged hash, decided the player was back, and re-opened What's New ON TOP
 * of the garden (sheet depth 2). That row left NEWS on 2026-08-18 and this audit
 * sat in the gate's skip tier ("needs an announcement whose CTA opens a sheet").
 * Run on 2026-09-04 against integ/day2 it did exactly what the skip reason
 * predicted: its SETUP could not find [data-news="garden"], every later row
 * graded a What's New sheet that had never closed, and the O1 rows below were
 * appended under that stale state.
 *
 * RE-PREMISED ON A ROW THAT EXISTS. "63 new cosmetics" (id `teaser`) opens a
 * SHEET directly, on the same hash, with no poster in between. It is the live
 * case of "a story that leaves the player on a sheet", and the poll's job with
 * it is: leave them there (DEPTH), and when they close it, put them back on the
 * News list (RETURN), which is the behaviour Tom asked for on 2026-08-09.
 *
 * PROVE-RED (part 1): both guards must go, because each covers the other for
 * this row. Delete the `|| document.querySelector('.tz-pop')` clause AND the
 * `if (sheetStack.length) return;` line in the poll: DEPTH fails with two sheets
 * open (What's New re-stacked on the teaser). Deleting the `.then(... news tab)`
 * reddens RETURN-TAB.
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
  /* Identity, not copy. A sheet is named by the element only its builder makes
     (#tzReel is the teaser's reel; #wnNews is What's New's News pane), so a
     retitled screen cannot redden a row about WHICH screen is open. */
  teaser: !!document.querySelector('#sheets #tzReel'),
  newsPane: (() => { const p = document.querySelector('#sheets #wnNews'); return p ? !p.hidden : false; })(),
  veil: !!document.querySelector('.drop-veil'),
  hash: location.hash,
}));

/* Crew -> What's New -> News tab. The same three taps a player makes. */
const openNewsTab = async () => {
  await page.evaluate(() => document.getElementById('crewWhatsNew')?.click());
  await sleep(1400);
  await page.evaluate(() => document.querySelector('[data-wntab="news"]')?.click());
  await sleep(600);
  return state();
};

await page.evaluate(() => {
  window.__testMe = { playerId: 'me', name: 'Hollow Shovel', friendCode: 'BONE-4K7Q', handle: 'hollow' };
  window.__testFriends = { friends: [], incoming: [], outgoing: [] };
  location.hash = '#/friends';
});
await sleep(2400);
const opened = await openNewsTab();
ok('SETUP What\'s New is open on the News tab', opened.sheets === 1 && opened.newsPane, JSON.stringify(opened));

/* ---- part 1: a story that leaves the player on a SHEET, same hash ---- */
const tapped = await page.evaluate(() => { const r = document.querySelector('[data-news="teaser"]'); if (!r) return false; r.click(); return true; });
ok('SETUP the cosmetics teaser story is listed and tappable', tapped, '');
/* the handler closes What's New through history (removed at 320ms) and opens
   the story 220ms later; 1600 is well past both */
await sleep(1600);
const onSheet = await state();
ok('SETUP the story opened its SHEET, closed What\'s New, no veil, same hash (the case the poll has to get right)',
  onSheet.sheets === 1 && onSheet.teaser && !onSheet.veil && onSheet.hash === opened.hash, JSON.stringify(onSheet));

/* The poll ticks every 300ms from the open. Ten ticks later the player must
   still be looking at exactly the sheet they chose. */
await sleep(3000);
const after = await state();
ok('DEPTH the News list does NOT re-open on top of the sheet the player chose',
  after.sheets === 1, JSON.stringify(after));
ok('DEPTH and the sheet they are on is the one they asked for',
  after.teaser, JSON.stringify(after.names));

/* And the exit: closing the story must put them BACK on the News list, on the
   tab they came from, with the story gone (not stacked underneath). Timing:
   the closing sheet is buried at 320ms, the poll needs one tick to see it gone
   and one more to re-open (<= 920ms), then openWhatsNew's dynamic import. */
await page.evaluate(() => document.getElementById('tzClose')?.click());
await sleep(1800);
const back = await state();
ok('RETURN closing the story puts them back on What\'s New, and only What\'s New', back.sheets === 1 && !back.teaser, JSON.stringify(back));
ok('RETURN-TAB and it is open on the News tab, where they were reading', back.newsPane, JSON.stringify(back.names));
ok('RETURN and they are still on the tab they started from', back.hash === opened.hash, `${back.hash} vs ${opened.hash}`);
await page.evaluate(() => document.querySelector('#sheets > div:last-child .sheet-close')?.click());
await sleep(800);
const clean = await state();
ok('EXIT closing What\'s New leaves nothing behind', clean.sheets === 0 && !clean.veil, JSON.stringify(clean));

/* ---- part 2: QA ROUND 26 O1: THE POSTER IS A TRAP ----
   Today -> News -> "Dark Spires" opened a .drop-veil OUTSIDE the sheet stack:
   Escape did nothing, history.back() did nothing, two route changes left it
   covering the tab bar. openVeil now puts every poster on sheetStack, so the
   same back that closes a sheet closes it.

   THE SAMPLE IS TAKEN ON THE POPSTATE, NOT 700ms LATER. The first run (2026-09-04,
   integ/day2) slept 700ms after history.back() and BACK-TABBAR read
   `elementFromPoint = bh-anim`: the poster had closed correctly, and by 600ms the
   app's own "put them back on News" poll (one 300ms tick to see the veil gone,
   one more to re-open) had put What's New back over the tab bar. The row was
   grading the product's return behaviour as a hit-test failure. popstate is the
   event that pops the veil (closeTopSheet removes a stackless wrap synchronously),
   so sampling in the same task, one frame later, leaves the poll at least 300ms
   away by construction. The 1000ms timer is the no-popstate fallback so a
   history with nothing behind it cannot hang the run; `popped` records which.

   BACK-VEIL IS NOT VACUOUS: it requires the veil to have been open BEFORE back.
   PROVE-RED: on the pre-O1 code (bare document.body.appendChild(veil), no stack
   record) popstate finds an empty stack and does nothing: BACK-VEIL fails with
   veil=true and BACK-TABBAR fails because elementFromPoint over the first tab
   returns the veil. RETURN-AFTER-POSTER also fails there (the poll never sees
   the veil go). */
const opened2 = await openNewsTab();
ok('SETUP What\'s New is open on the News tab again', opened2.sheets === 1 && opened2.newsPane, JSON.stringify(opened2));
const spireRow = await page.evaluate(() => { const r = document.querySelector('[data-news="spire"]'); if (!r) return false; r.click(); return true; });
ok('SETUP the Dark Spires story is listed and tappable', spireRow, '');
await sleep(1600);
const spireOpen = await state();
ok('SETUP the Dark Spires poster opened (a .drop-veil, no sheet under it)', spireOpen.veil && spireOpen.sheets === 0, JSON.stringify(spireOpen));
const afterBack = await page.evaluate(async () => {
  const popped = await new Promise(r => {
    addEventListener('popstate', () => r(true), { once: true });
    setTimeout(() => r(false), 1000);
    history.back();
  });
  await new Promise(r => requestAnimationFrame(r));
  const tab = document.querySelector('#tabbar .tab');
  const t = tab?.getBoundingClientRect();
  const hit = t ? document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2) : null;
  return {
    popped,
    veil: !!document.querySelector('.drop-veil'),
    sheets: document.querySelectorAll('#sheets > div').length,
    hitInTabbar: !!(hit && hit.closest('#tabbar')),
    hit: hit ? (hit.id || hit.className || hit.tagName) : null,
    hash: location.hash,
  };
});
ok('BACK-VEIL a poster that WAS open is closed by history.back(): no .drop-veil left in the DOM',
  spireOpen.veil && afterBack.popped && !afterBack.veil, JSON.stringify(afterBack));
ok('BACK-TABBAR and the tab bar under it is hit-testable again', afterBack.hitInTabbar, `elementFromPoint over the first tab = ${afterBack.hit}`);
/* the "put them back on News" poll re-opens What's New once the poster goes.
   That is the product behaviour the first run tripped over; assert it, then
   close it so the run ends clean. */
await sleep(1800);
const returned = await state();
ok('RETURN-AFTER-POSTER the News list comes back once the poster is gone', returned.sheets === 1 && returned.newsPane && !returned.veil, JSON.stringify(returned));
await page.evaluate(() => document.querySelector('#sheets > div:last-child .sheet-close')?.click());
await sleep(800);

console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`);
await browser.close();
srv?.close();
process.exit(fails.length ? 1 : 0);
