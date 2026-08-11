/* THE YEAR VIEW NAMES THE MONTH YOU TAPPED.
 *
 * Year buckets are monthly averages and carry no date, so wireBarChart's readout
 * falls back to the point's `label`. That label was `'JFMAMJJASOND'[month]`, which
 * gives January, June and July all the same name, and April and August, and March
 * and May: tapping a bar read "J · 210,432 steps" and there was no way to tell
 * which J. Three of the twelve months were unreadable and the chart looked fine.
 *
 * WHY THE CHECK IS DISTINCTNESS, not "the string is 'Jan'". The bug is ambiguity,
 * so the assertion has to be the property that was broken: tap all twelve bars,
 * take the part of the readout before the value, and every one must be different
 * from the other eleven. A check for a specific spelling would pass on any other
 * scheme that repeats itself, and would fail on a locale that is not English.
 *
 * PROVE-RED (run at the time this was written): put
 * `label: 'JFMAMJJASOND'[dt.getMonth()]` back in metricSeries and DISTINCT fails
 * with `J, J, J` and `A, A` and `M, M` named in its output.
 *
 * It seeds twelve months of steps into the health store the way the app writes
 * them, reloads, and then drives the REAL controls: the Steps tile on Progress,
 * the Year tab in the sheet, and a real mouse click on each bar. Nothing here
 * calls metricSeries or wireBarChart directly, because the bug was in what the
 * player reads, not in what the function returns.
 *
 * Run: node tests/year-readout-audit.mjs <baseUrl>   (or via npm run gate)
 */
import { boot, settle, dismissOverlays } from './godmode.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

/* No default URL: :8765 in this house is usually another session's checkout. */
const base = process.argv[2] || process.env.URL;
if (!base) {
  console.log('FAIL  year-readout-audit needs a base URL, and there is no safe default.');
  console.log('        Use `npm run gate`, or pass one: node tests/year-readout-audit.mjs http://127.0.0.1:PORT/');
  process.exit(1);
}

/* Click by selector with a REAL mouse at the element centre, scrolled into view.
   Programmatic .click() does not reach some of this app's handlers, and a control
   below the fold measures fine while a click at its coordinates lands in dead
   space (godmode.js carries the same warning, learned the same way). */
async function clickSel(page, sel) {
  const at = await page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  if (!at) return false;
  await page.mouse.click(at.x, at.y);
  return true;
}

const { browser, page } = await boot(base);

/* Twelve months of steps, one row per bucket with a distinct value, written to the
   health store exactly as the app writes it (keyPath 'date'). Guarded on ?demo and
   tally-demo like godmode.seed: a test run must never be able to touch a real save. */
const seeded = await page.evaluate(async () => {
  if (!new URLSearchParams(location.search).has('demo')) return { error: 'refusing to seed: this page is not in ?demo mode' };
  const dbs = (await indexedDB.databases()).map(d => d.name);
  if (!dbs.includes('tally-demo')) return { error: `refusing to seed: no tally-demo database (saw: ${dbs.join(', ') || 'none'})` };
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const now = new Date();
  const rows = [];
  for (let i = 11; i >= 0; i--) {
    /* the 1st, not mid-month: the current bucket's 15th is in the future for the
       first half of any month, and a reading dated ahead of today is not a thing
       the app would ever have written. */
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-01`;
    rows.push({ date, steps: 4000 + (11 - i) * 137 });
  }
  await new Promise((res, rej) => {
    const tx = db.transaction('health', 'readwrite');
    rows.forEach(r => tx.objectStore('health').put(r));
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  return { n: rows.length, from: rows[0].date, to: rows[rows.length - 1].date };
});
if (seeded.error) { console.log(`FAIL  ${seeded.error}`); await browser.close(); process.exit(1); }
console.log(`seeded ${seeded.n} monthly step readings, ${seeded.from} to ${seeded.to}`);

/* WAIT FOR THE CONDITION, NOT THE CLOCK. Every wait below was a fixed sleep, and
   this audit passed standalone while failing inside the gate, where ten suites run
   back to back and everything arrives later. That is the same mistake, in the same
   week, that the fight suite next door was fixed for; a clock that is long enough on
   a quiet machine is a coin flip on a busy one. Each waitForFunction names the thing
   it is waiting for, so a timeout reports which step never arrived instead of
   failing later with an empty sample. */
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction(() => !!document.querySelector('[data-metric="steps"]') || !!document.getElementById('screen')?.children.length,
  { timeout: 30000, polling: 100 }).catch(() => {});
await dismissOverlays(page);
await page.evaluate(() => { location.hash = '#/progress'; });
/* the Steps tile is the thing the next line clicks, so that is the condition */
const tileReady = await page.waitForFunction(() => {
  const el = document.querySelector('[data-metric="steps"]');
  return !!el && el.getBoundingClientRect().width > 0;
}, { timeout: 30000, polling: 100 }).then(() => true).catch(() => false);
ok('the Progress screen arrived with its Steps tile', tileReady, tileReady ? '' : 'no [data-metric="steps"] control after 30s: the screen never finished rendering');
await settle(page, 300);

const openedTile = await clickSel(page, '[data-metric="steps"]');
ok('the Steps tile on Progress opens its history', openedTile, openedTile ? '' : 'no [data-metric="steps"] control on the Progress screen');
/* the sheet is open when the window tabs it owns exist */
const sheetReady = await page.waitForFunction(() => !!document.querySelector('.sheet-trend .rtab[data-r="year"]'),
  { timeout: 30000, polling: 100 }).then(() => true).catch(() => false);
ok('the history sheet opened', sheetReady, sheetReady ? '' : 'no .sheet-trend with range tabs after 30s');
await settle(page, 300);

/* EVERY QUERY IS SCOPED TO THE SHEET. The Progress screen behind it draws its own
   tappable charts: 28 more .bc-hit and two more .bc-readout. The first version of
   this audit read document.querySelector('.bc-readout'), got the CARD's readout,
   and reported all twelve months as "Tap any bar for that day's exact steps." It
   was measuring the wrong chart while clicking the right one. */
const sheets = await page.evaluate(() => document.querySelectorAll('.sheet-trend').length);
ok('exactly one history sheet is open', sheets === 1, `${sheets} .sheet-trend elements: more than one means any reading here could be the stale sheet's`);

const openedYear = await clickSel(page, '.sheet-trend .rtab[data-r="year"]');
ok('the sheet offers a Year window', openedYear, openedYear ? '' : 'no .rtab[data-r="year"] in the history sheet');
/* the year panel is REBUILT on the range switch, so wait for its twelve bars
   rather than for a duration */
const yearReady = await page.waitForFunction(() => document.querySelectorAll('.sheet-trend .bc-hit').length === 12,
  { timeout: 30000, polling: 100 }).then(() => true).catch(() => false);
ok('the Year panel rebuilt with twelve buckets', yearReady, yearReady ? '' : `${await page.evaluate(() => document.querySelectorAll('.sheet-trend .bc-hit').length)} tap targets after 30s, expected 12`);
await settle(page, 250);

const hits = await page.evaluate(() => [...document.querySelectorAll('.sheet-trend .bc-hit')].map(h => {
  const r = h.getBoundingClientRect();
  return { i: h.dataset.i, label: h.dataset.label, val: h.dataset.val,
           x: r.left + r.width / 2, y: r.top + r.height / 2 };
}));
/* AN EMPTY SAMPLE IS A FAILURE. Zero bars examined means the sheet never opened
   and every assertion below would be vacuously true. */
ok('the year view drew twelve monthly bars', hits.length === 12, `${hits.length} tap targets`);

const withVal = hits.filter(h => h.val !== '');
ok('and every one of them has a reading to tap', withVal.length === 12, `${withVal.length} of ${hits.length} bars carry a value`);

/* Tap each bar for real and keep what the player is left reading. The mouse stays
   inside the svg the whole time: leaving it fires pointerleave, which resets the
   readout to its idle copy. */
const readouts = [];
for (const h of withVal) {
  await page.mouse.click(h.x, h.y);
  /* wireBarChart marks the clicked bar .on, which is a signal independent of the
     readout's TEXT. Waiting on the text would hang on the very bug this audit
     exists to catch, because two months reading the same is what "broken" means. */
  await page.waitForFunction(i => !!document.querySelector(`.sheet-trend .bc-bar.on[data-i="${i}"]`),
    { timeout: 10000, polling: 50 }, h.i).catch(() => {});
  const txt = await page.evaluate(() => (document.querySelector('.sheet-trend .bc-readout')?.textContent || '').trim());
  readouts.push({ i: h.i, label: h.label, text: txt, when: txt.split('·')[0].trim() });
}
ok('tapping a bar produces a readout', readouts.length === withVal.length && readouts.every(r => r.text),
  `${readouts.filter(r => r.text).length} of ${withVal.length} taps said anything`);

/* THE GUARD. Twelve bars, twelve different months, so twelve different names. */
const whens = readouts.map(r => r.when);
const dupes = whens.filter((w, i) => whens.indexOf(w) !== i);
ok('DISTINCT: no two months read the same', dupes.length === 0,
  dupes.length ? `${[...new Set(dupes)].join(', ')} each name more than one month, from: ${whens.join(', ')}`
               : whens.join(', '));

/* And a single letter is not a month even when it happens to be unique. */
const initials = readouts.filter(r => r.when.length < 3);
ok('and none of them is a bare initial', initials.length === 0,
  initials.length ? initials.map(r => `bar ${r.i} reads "${r.text}"`).join('; ') : `shortest is "${whens.reduce((a, b) => a.length <= b.length ? a : b)}"`);

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nyear readout clean');
process.exit(fails.length ? 1 : 0);
