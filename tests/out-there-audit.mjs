/* "Out there today" on the Today screen.
 *
 * Tom, 2026-08-09: "why does out there today on today page not have the new gear
 * drop anymore? Get rid of the puffer pack banner and glutton banner".
 *
 * The drop row was gone because it SHARED ONE SLOT with the Bone Garden: the
 * teaser only rendered when nothing was ripe, so any ripe crop silently replaced
 * the newest cosmetics with a gardening reminder. That is the whole bug, and it
 * is why the RIPE case below is the check that matters. It is proven red against
 * the old ternary.
 *
 * Run: node tests/out-there-audit.mjs [baseUrl]
 */
import { boot, sleep, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = argv || srvHandle.url;
const fails = [];
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) fails.push(name);
};

// Put a ripe crop in the ground the way the garden itself stores one, so
// cropsReady() answers honestly instead of being stubbed.
async function setCrops(page, ripe) {
  await page.evaluate(async n => {
    const db = await import('./js/db.js');
    const plots = [];
    for (let i = 0; i < n; i++) plots.push({ ing: 'marrow', plantedAt: Date.now() - 9e6, readyAt: Date.now() - 6e6, watered: true });
    while (plots.length < 3) plots.push(null);
    await db.kvSet('garden', { plotsOwned: 3, plots, seeds: {}, composts: { date: '', used: 0 } });
  }, ripe);
  await page.evaluate(() => { location.hash = '#/pit'; });
  await sleep(400);
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1400);
}

const readCard = page => page.evaluate(() => {
  const card = document.querySelector('.card.out-there');
  if (!card) return { missing: true };
  const rows = [...card.querySelectorAll(':scope > details, :scope > .glutton-banner')];
  return {
    missing: false,
    rows: rows.map(r => ({
      cls: r.className,
      text: (r.querySelector('.gbn-txt')?.innerText || '').replace(/\s+/g, ' ').trim(),
    })),
    html: card.innerHTML.length,
  };
});

const { browser, page } = await boot(base);
const errs = [];
page.on('pageerror', e => errs.push(e.message));

await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1500);

/* ---- 1. with NOTHING ripe: the drop row is there, the two dead rows are not ---- */
await setCrops(page, 0);
let card = await readCard(page);
ok('the Out there card renders', !card.missing);
const dry = card.rows.map(r => r.cls).join(' | ');
/* MATCH A CLASS TOKEN, NEVER THE TAIL OF THE ATTRIBUTE. `/glutton-banner$/` on the
   trimmed className demanded that token come LAST, and every banner in js/app.js
   emits it FIRST as the shared base class ("glutton-banner garden-banner",
   "...teaser-banner", "...spire-banner"), so this could not go red on any row the
   app is capable of rendering. `glutton-banner` on its own says nothing about the
   Glutton; the summary text is what identifies the row Tom asked to be gone. */
const hasCls = (r, c) => r.cls.trim().split(/\s+/).includes(c);
ok('no Glutton row', !card.rows.some(r => hasCls(r, 'glutton-banner') && /glutton/i.test(r.text)), dry);
/* `drop-banner` was the Puffer row's second class until it was deleted in v342, so
   querying it now matches nothing in js/, data/, index.html or app.css. Its title
   is the part that survives a re-add under any class name. */
ok('no Puffer Pack row', !card.rows.some(r => /puffer/i.test(r.text)), dry);
ok('the cosmetics drop row is there (nothing ripe)', card.rows.some(r => /teaser-banner/.test(r.cls)), dry);

/* ---- 2. with crops RIPE: BOTH the garden row and the drop row show ----
   This is the regression Tom hit. Against the old code the drop row is absent
   here, so this assertion is what goes red. */
await setCrops(page, 2);
card = await readCard(page);
const wet = card.rows.map(r => r.cls).join(' | ');
ok('the garden row appears when a crop is ripe', card.rows.some(r => /garden-banner|garden/.test(r.cls) || /crop/i.test(r.text)), wet);
ok('the cosmetics drop row SURVIVES a ripe crop', card.rows.some(r => /teaser-banner/.test(r.cls)), wet);

/* ---- 3. the surviving row still opens and still composes its art ---- */
const opened = await page.evaluate(async () => {
  const d = document.querySelector('.card.out-there details.teaser-banner');
  if (!d) return { no: true };
  d.querySelector('summary').click();
  await new Promise(r => setTimeout(r, 900));
  const imgs = [...d.querySelectorAll('.tz-strip img')];
  return { no: false, open: d.open, imgs: imgs.length, decoded: imgs.filter(i => i.naturalWidth > 0).length };
});
ok('the drop row expands', !opened.no && opened.open === true);
// an empty sample set is a failure, not a pass (anti-regression rule 3)
ok('its strip decodes real pixels', opened.imgs > 0 && opened.decoded === opened.imgs,
  `${opened.decoded}/${opened.imgs} decoded`);

ok('no page errors', errs.length === 0, errs.join(' ; '));

await browser.close();
if (srvHandle) srvHandle.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall green');
process.exit(fails.length ? 1 : 0);
