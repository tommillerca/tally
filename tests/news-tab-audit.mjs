/* What's New has two panes, and the News pane must actually re-open the real
   announcements. Tom, 2026-08-09: "create a subtab in patch notes called news
   that just has all pop ups in there so people can catch up if they missed it."
   Proven red against v346: no tabs, no news rows. */
import { boot, sleep } from './godmode.js';
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const { browser, page } = await boot(process.argv[2] || 'http://localhost:8765/');
const errs = []; page.on('pageerror', e => errs.push(String(e)));

// the Crew tab carries the What's New card; it gates on being online, so use the
// existing webdriver fixtures
await page.evaluate(() => {
  window.__testMe = { playerId: 'me', name: 'Hollow Shovel', friendCode: 'BONE-4K7Q', handle: 'hollow' };
  window.__testFriends = { friends: [], incoming: [], outgoing: [] };
  location.hash = '#/friends';
});
await sleep(2400);
await page.evaluate(() => document.getElementById('crewWhatsNew')?.click());
await sleep(1300);
const t = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.wn-tab')].map(x => x.textContent.trim()),
  updatesShown: !document.getElementById('wnUpdates')?.hidden,
  newsShown: !document.getElementById('wnNews')?.hidden,
  entries: document.querySelectorAll('.wn-entry').length,
}));
ok('the sheet has two tabs', t.tabs.length === 2, JSON.stringify(t.tabs));
ok('Updates is the default pane', t.updatesShown && !t.newsShown, JSON.stringify(t));
ok('the version list is still there', t.entries > 3, `${t.entries} entries`);

const n = await page.evaluate(async () => {
  const tab = document.querySelector('[data-wntab="news"]');
  // report a clean FAIL rather than throwing, so the red is legible against a
  // build that has no tabs at all
  if (!tab) return { rows: 0, titles: [], thumbsWithContent: 0, imgs: 0, decoded: 0, updatesHidden: false };
  tab.click();
  await new Promise(r => setTimeout(r, 300));
  const rows = [...document.querySelectorAll('.nw-row')];
  const imgs = [...document.querySelectorAll('.nw-thumb img')];
  await Promise.all(imgs.map(i => i.decode().catch(() => {})));
  return {
    updatesHidden: document.getElementById('wnUpdates').hidden,
    rows: rows.length,
    titles: rows.map(r => r.querySelector('b').textContent),
    /* Drawn means DRAWN, whether the art is a bitmap or an icon: a decoded <img>
       with a real box, or an <svg> with a real box. The first version demanded an
       <img> and failed the garden row, whose art is legitimately icon art. */
    thumbsDrawn: rows.filter(r => {
      const t = r.querySelector('.nw-thumb');
      const big = e => { const b = e.getBoundingClientRect(); return b.width > 4 && b.height > 4; };
      const img = [...t.querySelectorAll('img')].some(i => i.naturalWidth > 0 && big(i));
      const svg = [...t.querySelectorAll('svg')].some(big);
      return img || svg;
    }).length,
    imgs: imgs.length, decoded: imgs.filter(i => i.naturalWidth > 0).length,
  };
});
ok('tapping News swaps the pane', n.updatesHidden);
// an empty sample is a failure, not a pass
ok('every announcement is listed', n.rows >= 5, `${n.rows}: ${n.titles.join(', ')}`);
/* "has a child element" was another check that could not fail: two rows held a
   <span> that rendered at zero size and it counted them as art. Measure PIXELS:
   a decoded image inside a box with real width and height. */
ok('every row draws real pixels', n.thumbsDrawn === n.rows, `${n.thumbsDrawn}/${n.rows} drew`);
ok('the art in it decodes', n.imgs === 0 || n.decoded === n.imgs, `${n.decoded}/${n.imgs}`);

// the row must open the REAL popup, not a rebuilt copy
const opened = await page.evaluate(async () => {
  const row = document.querySelector('[data-news="drop"]');
  if (!row) return { veil: false, cards: 0, sheetStillOpen: false };
  row.click();
  await new Promise(r => setTimeout(r, 700));
  const veil = document.querySelector('.drop-veil');
  return { veil: !!veil, cards: document.querySelectorAll('.drop-veil .drop-card').length,
           sheetsUnder: document.querySelectorAll('#sheets .sheet').length };
});
ok('a row opens the real announcement', opened.veil && opened.cards > 0, JSON.stringify(opened));
/* THE ASSERTION THAT ACTUALLY CATCHES IT, and I had it backwards. v348 left the
   What's New sheet OPEN under the announcement, and the announcement's CTA then
   closed every sheet, which is what tore the news list out from under the player.
   My first guard asserted the sheet SHOULD survive underneath, so it passed on
   the broken build. Nothing may be buried under an announcement. */
ok('nothing is left stacked under the announcement', opened.sheetsUnder === 0,
  `${opened.sheetsUnder} sheet(s) under the overlay`);

/* THE CHECK I SHOULD HAVE WRITTEN. The first version asserted the sheet survived
   UNDERNEATH the popup and passed, because it looked before anything was
   dismissed. The announcements end on a CTA that closes every sheet, so one
   dismissal tore down the news list and every later tap did nothing. What
   matters is the state AFTER a dismissal, and that a second announcement still
   opens. */
const after = await page.evaluate(async () => {
  const veil = document.querySelector('.drop-veil');
  const cta = veil?.querySelector('.drop-cta, button, .btn');
  if (cta) cta.click(); else veil?.remove();
  await new Promise(r => setTimeout(r, 900));
  const stray = document.querySelectorAll('.drop-veil').length;
  /* Some announcements END on a navigation (Dark Spires sends you to the
     Boneyard) and that is the CTA doing its job, so returning to Crew is the
     player's move, not the app's. Go there the way they would. */
  location.hash = '#/friends';
  await new Promise(r => setTimeout(r, 1600));
  document.getElementById('crewWhatsNew')?.click();
  await new Promise(r => setTimeout(r, 1300));
  document.querySelector('[data-wntab="news"]')?.click();
  await new Promise(r => setTimeout(r, 400));
  const rows = document.querySelectorAll('.nw-row').length;
  document.querySelector('[data-news="garden"]')?.click();
  await new Promise(r => setTimeout(r, 900));
  return { stray, rowsOnReturn: rows, secondOpened: !!document.querySelector('.drop-veil'),
           veilsStacked: document.querySelectorAll('.drop-veil').length };
});
ok('dismissing leaves no stray overlay', after.stray === 0, JSON.stringify(after));
ok('the news list is reachable again afterwards', after.rowsOnReturn >= 5, `${after.rowsOnReturn} rows`);
ok('a SECOND announcement still opens', after.secondOpened, JSON.stringify(after));
ok('overlays never stack', after.veilsStacked <= 1, `${after.veilsStacked} veils`);
ok('no page errors', errs.length === 0, errs.join(' ; '));
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall green');
process.exit(fails.length ? 1 : 0);
