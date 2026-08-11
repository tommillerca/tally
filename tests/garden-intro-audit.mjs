/* The intro popup, its retirement, the pinned banner, and the FLOW fix: opening
 * the Kitchen must land you on the cauldrons, not on a wall of empty beds. */
import { boot, sleep } from './godmode.js';
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
const { browser, page } = await boot(process.argv[2] || process.env.URL);
await page.evaluateOnNewDocument(() => { window.__gardenForce = 1; });
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };
const clearOverlays = async () => {
  await page.evaluate(() => { document.querySelector('.dw')?.remove(); document.querySelector('.drop-veil:not(.garden-veil)')?.remove(); });
};

// ---- 1. the flow: what do you see when you walk into the Kitchen?
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1600); await clearOverlays();
await (await page.$('#kitchenActBtn')).click();
await sleep(1800);
const flow = await page.evaluate(() => {
  const body = document.getElementById('kitchenBody');
  const heads = [...body.querySelectorAll('.sect-h')].map(h => h.textContent.trim().split('\n')[0].trim());
  const row = document.getElementById('gardenRow');
  const firstBelowHero = heads[0] || '';
  return {
    heads: heads.slice(0, 4),
    firstBelowHero,
    beds: body.querySelectorAll('.plot-card').length,
    gardenRow: row ? row.textContent.replace(/\s+/g, ' ').trim() : null,
    // where the garden row sits relative to the cauldrons, in real pixels
    potTop: Math.round(body.querySelector('.pot-row')?.getBoundingClientRect().top ?? -1),
    rowTop: Math.round(row?.getBoundingClientRect().top ?? -1),
  };
});
console.log('kitchen flow:', JSON.stringify(flow));
check('the Kitchen opens on the Cauldrons', /Cauldrons/i.test(flow.firstBelowHero), flow.firstBelowHero);
check('no bed grid in the Kitchen at all', flow.beds === 0, `${flow.beds} bed cards`);
check('the garden is one row', !!flow.gardenRow, flow.gardenRow);
check('and it sits BELOW the cauldrons', flow.rowTop > flow.potTop, `pots at ${flow.potTop}, row at ${flow.rowTop}`);

// ---- 2. that row opens the garden, with the beds on it
await page.evaluate(() => document.getElementById('gardenRow').click());
await sleep(1600);
const sheet = await page.evaluate(() => ({
  title: [...document.querySelectorAll('#sheets .sheet h2')].slice(-1)[0]?.textContent.trim(),
  beds: document.querySelectorAll('#gardenBody .plot-card').length,
  compost: !!document.getElementById('compostBtn'),
  dig: !!document.getElementById('buyBed'),
}));
console.log('garden sheet:', JSON.stringify(sheet));
check('the row opens a Bone Garden screen', sheet.title === 'The Bone Garden', String(sheet.title));
check('with the beds, the heap and the dig button on it', sheet.beds === 3 && sheet.compost && sheet.dig, JSON.stringify(sheet));
await page.evaluate(() => history.back()); await sleep(900);
await page.evaluate(() => history.back()); await sleep(900);

// ---- 3. the popup, forced (webdriver is gated so audits stay quiet)
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.kvSet('gardenIntroSeen', 0);
  window.__gardenForce = 1;
});
await page.reload({ waitUntil: 'networkidle2' });
await sleep(6000);
await clearOverlays();
await sleep(1500);
let pop = await page.evaluate(() => {
  const v = document.querySelector('.garden-veil');
  return v ? {
    title: v.querySelector('.drop-title')?.textContent.trim(),
    stages: [...v.querySelectorAll('.gd-stage i')].map(e => e.textContent.trim()),
    icons: v.querySelectorAll('.gd-stage svg').length,
    cta: v.querySelector('#gardenSeeBtn')?.textContent.trim(),
    later: !!v.querySelector('#gardenLaterBtn'),
    how: (v.querySelector('.drop-how')?.textContent || '').slice(0, 40),
  } : null;
});
console.log('popup:', JSON.stringify(pop));
check('the intro popup appears', !!pop);
if (pop) {
  check('it names the garden', /Bone Garden/.test(pop.title || ''), pop.title);
  check('it teaches the loop in three stages, all drawn', pop.stages.join('>') === 'PLANT>WATER>HARVEST' && pop.icons === 3, `${pop.stages.join('>')} / ${pop.icons} icons`);
  check('it has a CTA and a way out', /SEE THE GARDEN/.test(pop.cta || '') && pop.later, pop.cta);
  check('it says where seeds come from', /walk/i.test(pop.how), pop.how);
  // the CTA must land on the garden, not just close
  await page.evaluate(() => document.getElementById('gardenSeeBtn').click());
  await sleep(1800);
  const landed = await page.evaluate(() => ({
    title: [...document.querySelectorAll('#sheets .sheet h2')].slice(-1)[0]?.textContent.trim(),
    veilGone: !document.querySelector('.garden-veil'),
    seen: null,
  }));
  const seen = await page.evaluate(async () => (await (await import('./js/db.js')).kvGet('gardenIntroSeen', 0)));
  console.log('after CTA:', JSON.stringify(landed), 'seen =', seen);
  check('SEE THE GARDEN opens the garden', landed.title === 'The Bone Garden' && landed.veilGone, JSON.stringify(landed));
  check('and retires the popup for good', seen >= 99, String(seen));
}

// ---- 4. it must STOP after 5 launches (a popup that never retires is a bug)
const retire = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.kvSet('gardenIntroSeen', 5);
  return await db.kvGet('gardenIntroSeen', 0);
});
await page.reload({ waitUntil: 'networkidle2' });
await sleep(6500);
const after5 = await page.evaluate(() => !!document.querySelector('.garden-veil'));
console.log('seen=5 ->', retire, 'veil shown:', after5);
check('at 5 showings the popup stops', after5 === false);

// ---- 5. the pinned banner on Today
await page.evaluate(() => { document.querySelector('.dw')?.remove(); document.querySelector('.drop-veil')?.remove(); });
const banner = await page.evaluate(() => {
  const d = document.querySelector('details.garden-banner');
  if (!d) return null;
  const collapsed = { open: d.open, summary: d.querySelector('summary').textContent.replace(/\s+/g, ' ').trim(), iconDrawn: !!d.querySelector('summary svg') };
  d.setAttribute('open', '');
  return { ...collapsed, cta: d.querySelector('#gardenToKitchen')?.textContent.trim(), body: (d.querySelector('.glutton-mech')?.textContent || '').slice(0, 50), stages: d.querySelectorAll('.gd-stage').length };
});
console.log('banner:', JSON.stringify(banner));
check('a collapsible banner is pinned on Today', !!banner);
if (banner) {
  check('it starts collapsed', banner.open === false);
  check('its icon actually draws (not an empty box)', banner.iconDrawn);
  check('it expands to the pitch and a CTA', /Open the garden/.test(banner.cta || '') && banner.stages === 3, JSON.stringify({ cta: banner.cta, stages: banner.stages }));
  await sleep(500);
  await page.evaluate(() => document.getElementById('gardenToKitchen').click());
  await sleep(1800);
  const to = await page.evaluate(() => [...document.querySelectorAll('#sheets .sheet h2')].slice(-1)[0]?.textContent.trim());
  check('the banner CTA opens the garden', to === 'The Bone Garden', String(to));
}
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nGARDEN INTRO + FLOW VERIFIED');
process.exit(bad ? 1 : 0);
