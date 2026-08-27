/* tests/news-banner-audit.mjs: THE NEWS BANNER IS QUIET, COMPLETE AND TIDY.
 *
 * Tom, 2026-08-27: "we have news in a collapsed banner that players can open and
 * it drops down to see all the past banners. when there is new news there can be
 * an icon letting them know otherwise it stays collapsed and avoids being
 * annoying?" and, on the first render of it, "your icons are aligned right now
 * theyre different themes with different centreing and scaling it looks sloppy".
 *
 * WHAT IT ASSERTS, on the real Today through the real markup:
 *   SETUP    the banner rendered with rows, because every row below passes on an
 *            empty one
 *   QUIET    it is CLOSED on arrival. v448 deleted every launch takeover; a
 *            banner that opens itself is that decision quietly reversed
 *   COVERED  every row of the NEWS registry is present. The banner and the News
 *            tab read one array on purpose, and this fails if they diverge
 *   TILES    every thumbnail is bounded to the same longest side and centred in
 *            its tile. MEASURED before the fix: art filled 0.36 to 3.80 of a 40px
 *            tile, a ten-fold spread, with the Discord tile 19px off centre on a
 *            40px box because its art is a fixed 78px square. Bounds are a ratio
 *            and a pixel offset rather than a fill fraction, because a tall
 *            sprite and a wide one legitimately fill different areas of the same
 *            box; what must match is the bounding size and the centre
 *   SAFE     a row whose thumb throws costs its own tile and nothing else. The
 *            step-race thumb takes the player's outfit (`eq => headshotHtml(eq)`)
 *            and calling it with nothing threw on `.B`, which blanked the ENTIRE
 *            home screen with no page error and no console error. Today is the
 *            default screen; one row's art must never be able to take it down
 *
 * DIRECTION OF FAILURE. Open the banner by default and QUIET reds. Remove the
 * normalisation pass and TILES reds with the real spread. Break one thumb and
 * SAFE reds while the screen still renders.
 *
 * Self-serves THIS checkout when given no URL: boot() defaults to the live site.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv[2] || process.env.URL;
const own = argUrl ? null : await serveTree(ROOT);
const url = argUrl || own.url;
const { browser, page } = await boot(url);
let bad = 0;
const ok = (l, p, d = '') => { console.log(`${p ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!p) bad++; };
const done = async c => { await browser.close(); if (own) own.close(); process.exit(c); };

const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForFunction(() => !!document.querySelector('#screen #newsBanner'), { timeout: 20000, polling: 100 });
await sleep(700);

const rest = await page.evaluate(() => {
  const nb = document.querySelector('#newsBanner');
  return { open: nb.open, rows: nb.querySelectorAll('.nb-row').length, dot: !!nb.querySelector('.nb-dot') };
});
ok('SETUP    the banner rendered on Today with rows in it', rest.rows > 0, `${rest.rows} rows`);
if (bad) { console.log('\nFAIL (setup): nothing below grades a real banner.'); await done(2); }

ok('QUIET    it is CLOSED on arrival, so it can never become the launch takeover v448 removed',
  rest.open === false, `open=${rest.open}, unread dot=${rest.dot}`);

const declared = (await (await fetch(url + '/js/app.js')).text())
  .split('const NEWS = [')[1]?.split('\n];')[0] || '';
const ids = [...declared.matchAll(/\{ id: '([a-z]+)'/g)].map(m => m[1]);
const seen = await page.evaluate(() => [...document.querySelectorAll('.nb-row')].map(b => b.dataset.news));
const missing = ids.filter(i => !seen.includes(i));
ok('COVERED  every row of the NEWS registry is in the banner, so it cannot drift from the News tab',
  ids.length > 0 && missing.length === 0,
  `${ids.length} declared, ${seen.length} rendered${missing.length ? `, MISSING: ${missing.join(', ')}` : ''}`);

await page.evaluate(() => document.querySelector('#newsBanner > summary')?.click());
await sleep(900);
const tiles = await page.evaluate(() => [...document.querySelectorAll('.nb-thumb')].map(t => {
  const kid = t.firstElementChild;
  const tb = t.getBoundingClientRect();
  if (!kid) return { id: t.closest('.nb-row').dataset.news, empty: true };
  const kb = kid.getBoundingClientRect();
  return {
    id: t.closest('.nb-row').dataset.news,
    long: +Math.max(kb.width, kb.height).toFixed(1),
    over: +Math.max(kb.width / tb.width, kb.height / tb.height).toFixed(2),
    dx: Math.round((kb.left + kb.width / 2) - (tb.left + tb.width / 2)),
    dy: Math.round((kb.top + kb.height / 2) - (tb.top + tb.height / 2)),
  };
}));
const drawn = tiles.filter(t => !t.empty);
const longs = drawn.map(t => t.long);
const spread = Math.max(...longs) - Math.min(...longs);
const worst = Math.max(...drawn.map(t => Math.max(Math.abs(t.dx), Math.abs(t.dy))));
const overflow = drawn.filter(t => t.over > 1.001);
ok('TILES    every thumbnail is bounded to the same longest side, centred, and none overflows its tile',
  drawn.length >= 3 && spread <= 1.5 && worst <= 1 && overflow.length === 0,
  `longest side ${Math.min(...longs)}-${Math.max(...longs)}px (spread ${spread.toFixed(1)}, bound 1.5), `
  + `worst centre offset ${worst}px (bound 1), ${overflow.length} overflowing`
  + `. Before the normalisation pass: fill 0.36 to 3.80 of the tile and 19px off centre.`);

ok('SAFE     no page error while rendering nine rows of other people\'s art',
  errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');

console.log(`\nnews-banner: ${bad ? bad + ' FAILED' : 'clean'}`);
await done(bad ? 1 : 0);
