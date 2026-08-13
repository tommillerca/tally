/* THE LEADERBOARD MUST NOT DECODE THE WHOLE BOARD AT ONCE.
 *
 * Tom, 2026-08-13: "I go to crew tab I tap leaderboard tile and it tries to
 * open blanks the screen then shows crew tab again not the headboard
 * interface." Over and over, reproducibly, on device.
 *
 * IT IS NOT A PAYLOAD BUG, and that matters because that is where everyone
 * looked first. A fixture built from the worker's real row mapping
 * (server/src/index.js:679-694), covering every field it can emit as null
 * (levelName, outfit, stats, pet all `|| null`; friendCode, lastSeen, joinedAt
 * with NO fallback at all), renders clean at 100 rows with zero page errors.
 * esc() is String(s ?? ''), onlineLabel() returns early on falsy, lbHeadHtml
 * falls back to a default outfit, and social.leaderboard() always returns an
 * array or null. There is no throw to find.
 *
 * IT IS MEMORY. Every row mounted a full avatarLayersHtml stack at the art's
 * natural 640x640. Measured on a 100-row board carrying only TWO cosmetic
 * layers per player: 200 images, ~312MB of decoded RGBA in a single open. Real
 * players wear six to eight layers, so a real board is nearer 600-800 images
 * and about a gigabyte. iOS kills the WKWebView renderer on memory, and a
 * killed renderer leaves NO javascript error: it blanks and the app comes back
 * up on the last route. That is exactly the symptom, and it is why every check
 * we owned said the board was fine.
 *
 * So the guard is a BUDGET, not a try/catch. Heads mount as rows approach the
 * viewport; a board nobody scrolls decodes about eleven of them.
 *
 * PROVE-RED: restore the eager `${lbHeadHtml(p, 52)}` in openLeaderboard's row
 * template and BUDGET + DEFER both fail (100/100 mounted, ~312MB).
 *
 * An empty board is also a failure here, not a pass: HEADS asserts the visible
 * rows carry decoded art, because "decodes nothing" would satisfy a budget
 * check on its own.
 *
 * Usage: node tests/lb-memory-audit.mjs
 */

import { boot, seed, sleep, serveTree } from './godmode.js';
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

await seed(page, { level: 12 });
/* The board only exists for an online player: under webdriver `social` is off,
   the Crew tab renders "Go online", and #crewLeaderboard is never emitted. Without
   this seam the whole file measures nothing. */
await page.evaluate(() => {
  window.__testMe = { playerId: 'me', name: 'H', friendCode: 'BONE-1', handle: 'h' };
  window.__testFriends = { friends: [], incoming: [], outgoing: [] };
  window.__testLb = Array.from({ length: 100 }, (_, i) => ({
    playerId: 'p' + i, name: 'Bonehead ' + i, level: 60 - Math.floor(i / 2), badges: 0,
    outfit: { B: 'B0-1', SK: 'SK0-1' }, pet: null, friendCode: 'BONE-' + i,
    lastSeen: Date.now(), joinedAt: Date.now(), spires: 0, spireDays: 0, you: false }));
  location.hash = '#/friends';
});
await sleep(1800);
await page.evaluate(() => document.getElementById('crewLeaderboard')?.click());
await sleep(3000);

/* MEASURE THE ART, NOT THE MECHANISM. An earlier version of this file counted
   [data-lbhead] placeholders, which do not exist on the eager tree, so it
   PASSED on the very bug it was written for. Decoded images are what the
   renderer pays for and what both implementations can be compared on. */
const shot = () => page.evaluate(() => {
  const imgs = [...document.querySelectorAll('.lb-head img')];
  let bytes = 0;
  for (const i of imgs) if (i.naturalWidth) bytes += i.naturalWidth * i.naturalHeight * 4;
  return {
    rows: document.querySelectorAll('.lb-row').length,
    imgs: imgs.length,
    decoded: imgs.filter(i => i.naturalWidth > 0).length,
    mb: +(bytes / 1048576).toFixed(1),
    firstFour: [...document.querySelectorAll('.lb-row')].slice(0, 4)
      .map(r => { const i = r.querySelector('.lb-head img'); return !!i && i.naturalWidth > 0; }),
  };
});

const a = await shot();
ok('ROWS the whole board renders (an empty board is a FAILURE)', a.rows === 100, `${a.rows} rows`);
ok('HEADS the top rows show decoded art, whatever the mechanism',
  a.firstFour.length === 4 && a.firstFour.every(Boolean), JSON.stringify(a.firstFour));
ok('BUDGET one open decodes well under what kills a WKWebView renderer',
  a.mb < 90 && a.decoded > 0, `${a.mb} MB across ${a.imgs} images (the crash was 312.5 MB / 200)`);

await page.evaluate(() => { const b = document.getElementById('lbBody'); if (b) b.scrollTop = b.scrollHeight * 0.6; });
await sleep(2500);
const b2 = await shot();
ok('DEFER the board did not draw every head up front: scrolling adds more',
  b2.imgs > a.imgs, `${a.imgs} -> ${b2.imgs} images after scrolling`);
ok('DEFER the heads mounted on scroll actually decode',
  b2.decoded > a.decoded, `${a.decoded} -> ${b2.decoded} decoded`);
ok('NO page errors', errs.length === 0, errs.slice(0, 2).join(' ; '));

await browser.close(); srv.close?.();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nleaderboard memory clean');
process.exit(fails.length ? 1 : 0);
