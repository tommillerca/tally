/* Drive the garden through the REAL controls: compost a spare ingredient, plant
 * the seed, water it, fast-forward the clock in the database, harvest, and assert
 * the ingredient count actually moved. Calling garden.js directly would prove the
 * model and nothing about whether the Kitchen ever calls it. */
import { boot, sleep, click } from './godmode.js';
const { browser, page } = await boot(process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };
const openKitchen = async () => {
  // one sheet at a time, each awaited: batching history.back() calls inside a
  // single evaluate tears the execution context out from under the script
  for (let i = 0; i < 6; i++) {
    const open = await page.evaluate(() => !!document.querySelector('#sheets > div'));
    if (!open) break;
    await page.evaluate(() => history.back());
    await sleep(500);
  }
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1600);
  await page.evaluate(() => { document.querySelector('.dw')?.remove(); });
  await sleep(400);
  const kb = await page.$('#kitchenActBtn');
  if (!kb) throw new Error('the Kitchen button is missing on Today');
  await kb.click();
  await sleep(1700);
};

// a glut to compost with
await page.evaluate(async () => {
  const c = await import('./js/cooking.js');
  await c.grantIngredient('graveroot', 6);
});

await openKitchen();
const first = await page.evaluate(() => ({
  hasGarden: /BONE GARDEN|Bone Garden/.test(document.body.textContent),
  beds: document.querySelectorAll('.plot-card').length,
  buyBed: !!document.getElementById('buyBed'),
  empty: document.querySelectorAll('.plot-card.locked').length,
  compostBtn: document.getElementById('compostBtn')?.textContent.trim(),
  cauldronsStillThere: /Cauldrons/.test(document.body.textContent),
  shopIntact: document.querySelectorAll('[data-cook]').length,
}));
console.log('kitchen:', JSON.stringify(first));
check('the garden is in the Kitchen', first.hasGarden);
check('three free beds, all empty', first.beds === 3 && first.empty === 3, `${first.beds} beds / ${first.empty} empty`);
check('a fourth bed is on offer for coins', first.buyBed);
check('the compost button shows the daily allowance', /3 left/.test(first.compostBtn || ''), first.compostBtn);
check('the cauldrons and recipes are untouched', first.cauldronsStillThere && first.shopIntact >= 7, `${first.shopIntact} cook buttons`);

// compost: the heap sheet, a real tap
await page.evaluate(() => document.getElementById('compostBtn').click());
await sleep(1200);
const heap = await page.evaluate(() => ({
  odds: [...document.querySelectorAll('.odds span')].map(s => s.textContent.trim()),
  rareBlocked: [...document.querySelectorAll('.crate-row b')].some(b => /Cannot be composted/.test(b.textContent)),
  rows: document.querySelectorAll('[data-compost]').length,
  ectoplasmOffered: [...document.querySelectorAll('[data-compost]')].some(b => b.dataset.compost === 'ectoplasm'),
}));
console.log('heap:', JSON.stringify(heap));
check('the odds are stated up front', heap.odds.join('|') === '155%|235%|310%', heap.odds.join('|'));
check('Ectoplasm cannot be composted', heap.rareBlocked && !heap.ectoplasmOffered);
const before = await page.evaluate(async () => (await (await import('./js/cooking.js')).ingredients()).graveroot);
await page.evaluate(() => document.querySelector('[data-compost="graveroot"]').click());
await sleep(1400);
const afterCompost = await page.evaluate(async () => {
  const g = await import('./js/garden.js'), c = await import('./js/cooking.js');
  return { seeds: (await g.seeds()).graveroot || 0, ing: (await c.ingredients()).graveroot, left: (await g.compostStatus()).left,
           btnLabel: document.querySelector('[data-compost="graveroot"]')?.closest('.crate-row') ? document.querySelector('.sect-h + .crate-row') && document.body.textContent.match(/(\d) composts? left today/)?.[1] : null };
});
console.log('after compost:', JSON.stringify(afterCompost), 'ing before', before);
check('one ingredient was spent', afterCompost.ing === before - 1, `${before} -> ${afterCompost.ing}`);
check('1 to 3 seeds came back', afterCompost.seeds >= 1 && afterCompost.seeds <= 3, String(afterCompost.seeds));
check('the daily allowance went down', afterCompost.left === 2, String(afterCompost.left));
check('the sheet re-rendered with the new allowance', afterCompost.btnLabel === '2', String(afterCompost.btnLabel));

// exhaust the cap through the real button and prove it refuses the fourth
await page.evaluate(() => document.querySelector('[data-compost="graveroot"]').click()); await sleep(1100);
await page.evaluate(() => document.querySelector('[data-compost="graveroot"]').click()); await sleep(1100);
const capped = await page.evaluate(async () => {
  const g = await import('./js/garden.js');
  const btn = document.querySelector('[data-compost="graveroot"]');
  return { left: (await g.compostStatus()).left, disabled: !!btn?.disabled };
});
console.log('at the cap:', JSON.stringify(capped));
check('the heap closes for the day at the cap', capped.left === 0 && capped.disabled);

// plant via the bed, water, then harvest after fast-forwarding the readyAt
await openKitchen();
await page.evaluate(() => document.querySelector('.plot-card.locked[data-plant]').click());
await sleep(1200);
const sow = await page.evaluate(() => ({ options: document.querySelectorAll('#plantBody [data-sow]').length, label: document.querySelector('#plantBody .recipe-need')?.textContent.trim() }));
console.log('plant sheet:', JSON.stringify(sow));
check('the plant sheet offers the seeds you hold', sow.options >= 1, `${sow.options} options`);
check('it states the grow time and the yield', /3h · yields 2 to 4/.test(sow.label || ''), sow.label);
await page.evaluate(() => document.querySelector('[data-sow]').click());
await sleep(1600);

const planted = await page.evaluate(() => ({
  growing: document.querySelectorAll('.plot-card.thirsty, .plot-card.growing').length,
  thirstyFlag: !!document.querySelector('.plot-flag'),
  waterBtn: !!document.querySelector('[data-water]'),
  empty: document.querySelectorAll('.plot-card.locked').length,
}));
console.log('planted:', JSON.stringify(planted));
check('the bed is now growing and asking for water', planted.growing === 1 && planted.waterBtn && planted.empty === 2);

await page.evaluate(() => document.querySelector('[data-water]').click());
await sleep(1300);
const watered = await page.evaluate(async () => {
  const g = await import('./js/garden.js');
  const st = await g.gardenState();
  return { watered: st.plots.find(p => !p.empty)?.watered, stillOffered: !!document.querySelector('[data-water]') };
});
console.log('watered:', JSON.stringify(watered));
check('watering sticks and cannot be repeated', watered.watered === true && !watered.stillOffered);

// fast-forward: the only honest way to test a 3h timer
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const g = await db.kvGet('garden');
  g.plots = g.plots.map(p => p ? { ...p, readyAt: Date.now() - 1000 } : p);
  await db.kvSet('garden', g);
});
await openKitchen();
const ripe = await page.evaluate(() => ({
  sheet: document.querySelector('#sheets .sheet h2')?.textContent.trim() || 'none',
  cards: document.querySelectorAll('.plot-card').length,
  ready: document.querySelectorAll('.plot-card.ready').length,
  flag: document.querySelector('.plot-flag.crop')?.textContent.trim(),
  harvestBtn: !!document.querySelector('[data-harvest]'),
}));
console.log('ripe:', JSON.stringify(ripe));
check('the Kitchen is actually open (an empty sample is not a pass)', ripe.sheet === 'Kitchen' && ripe.cards > 0, `${ripe.sheet} / ${ripe.cards} cards`);
check('the bed reads as ready', ripe.ready === 1 && ripe.flag === 'READY' && ripe.harvestBtn);
if (!ripe.harvestBtn) { console.log('cannot harvest what is not ready; stopping here'); await browser.close(); process.exit(1); }

const ingBefore = await page.evaluate(async () => (await (await import('./js/cooking.js')).ingredients()).graveroot || 0);
await page.evaluate(() => document.querySelector('[data-harvest]').click());
await sleep(2000);
const reveal = await page.evaluate(() => ({
  kick: document.querySelector('.hv-kick')?.textContent.trim(),
  name: document.querySelector('.hv-name')?.textContent.trim(),
  iconPainted: !!document.querySelector('.hv-ico svg'),
}));
console.log('reveal:', JSON.stringify(reveal));
check('the harvest reveal shows what you got', /HARVEST|BUMPER CROP/.test(reveal.kick || '') && /Graveroot ×[234]/.test(reveal.name || ''), `${reveal.kick} / ${reveal.name}`);
check('the reveal actually draws its crop', reveal.iconPainted);

const done = await page.evaluate(async () => {
  const c = await import('./js/cooking.js'), g = await import('./js/garden.js');
  const st = await g.gardenState();
  return { ing: (await c.ingredients()).graveroot || 0, empty: st.plots.filter(p => p.empty).length, ready: st.readyCount };
});
console.log('after harvest:', JSON.stringify(done), 'ing before', ingBefore);
const gained = done.ing - ingBefore;
check('the crop landed in the ingredient inventory', gained >= 3 && gained <= 4, `+${gained} (watered, so 3 or 4)`);
check('the bed is empty again', done.empty === 3 && done.ready === 0);

// and the hook back on Today
await page.evaluate(async () => {
  const db = await import('./js/db.js'), g = await import('./js/garden.js');
  await g.grantSeed('marrow', 1);
  await g.plantSeed('marrow');
  const gg = await db.kvGet('garden');
  gg.plots = gg.plots.map(p => p ? { ...p, readyAt: Date.now() - 1000 } : p);
  await db.kvSet('garden', gg);
});
for (let i = 0; i < 6; i++) {
  if (!await page.evaluate(() => !!document.querySelector('#sheets > div'))) break;
  await page.evaluate(() => history.back());
  await sleep(500);
}
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(2400);
const today = await page.evaluate(() => ({
  badge: !!document.querySelector('#kitchenActBtn .hero-badge'),
  card: document.querySelector('#kitchenCard')?.textContent || '',
}));
console.log('today:', JSON.stringify(today));
check('a ripe crop badges the Kitchen button on Today', today.badge);
check('and says so on the card', /crop.? ready to pick/.test(today.card), today.card.slice(0, 60));

await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nGARDEN VERIFIED END TO END');
process.exit(bad ? 1 : 0);
