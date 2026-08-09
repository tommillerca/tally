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
    thumbsWithContent: rows.filter(r => r.querySelector('.nw-thumb').childElementCount > 0).length,
    imgs: imgs.length, decoded: imgs.filter(i => i.naturalWidth > 0).length,
  };
});
ok('tapping News swaps the pane', n.updatesHidden);
// an empty sample is a failure, not a pass
ok('every announcement is listed', n.rows >= 5, `${n.rows}: ${n.titles.join(', ')}`);
ok('every row carries its own artwork', n.thumbsWithContent === n.rows, `${n.thumbsWithContent}/${n.rows}`);
ok('the art in it decodes', n.imgs === 0 || n.decoded === n.imgs, `${n.decoded}/${n.imgs}`);

// the row must open the REAL popup, not a rebuilt copy
const opened = await page.evaluate(async () => {
  const row = document.querySelector('[data-news="drop"]');
  if (!row) return { veil: false, cards: 0, sheetStillOpen: false };
  row.click();
  await new Promise(r => setTimeout(r, 700));
  const veil = document.querySelector('.drop-veil');
  return { veil: !!veil, cards: document.querySelectorAll('.drop-veil .drop-card').length,
           sheetStillOpen: !!document.getElementById('wnNews') };
});
ok('a row opens the real announcement', opened.veil && opened.cards > 0, JSON.stringify(opened));
ok('the What\'s New sheet survives underneath', opened.sheetStillOpen);
ok('no page errors', errs.length === 0, errs.join(' ; '));
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall green');
process.exit(fails.length ? 1 : 0);
