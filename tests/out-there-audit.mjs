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
import { boot, sleep } from './godmode.js';

const base = process.argv[2] || 'http://localhost:8765/';
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
ok('no Glutton row', !card.rows.some(r => /glutton-banner$/.test(r.cls.trim()) && /Glutton/i.test(r.text)), dry);
ok('no Puffer Pack row', !card.rows.some(r => /drop-banner/.test(r.cls) || /Puffer/i.test(r.text)), dry);
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
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall green');
process.exit(fails.length ? 1 : 0);
