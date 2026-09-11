import assert from 'node:assert/strict';
import { boot, sleep, setWidth } from './godmode.js';
const { browser, page } = await boot(undefined, { headless: 'shell' });
try {
  await setWidth(page, 390, 844);
  const fixture = await page.evaluate(async () => {
    const loot = await import('./js/loot.js');
    const { BH_ITEMS, BH_BY_ID, bhFamilyKey, bhFamilies } = await import('./data/boneheadz.js');
    const families = [...bhFamilies(BH_ITEMS.filter(i => i.slot === 'H')).values()];
    const gearOwned = await loot.ownedGearIds();
    const { GEAR_ITEMS } = await import('./js/gear.js');
    const gearKeys = new Set(GEAR_ITEMS.filter(g => gearOwned.has(g.id)).map(g => bhFamilyKey(BH_BY_ID[g.artId])));
    const family = families.find(f => f.length === 3 && !gearKeys.has(bhFamilyKey(f[0])));
    if (!family) throw new Error('CONTROL no three-variant fixture family');
    const singles = families.filter(f => f.length === 1 && !gearKeys.has(bhFamilyKey(f[0]))).slice(0, 3).map(f => f[0]);
    const ids = [...family.map(i => i.id), ...singles.slice(0, 2).map(i => i.id)];
    for (const id of ids) await loot.grantCosmetic(id, 'audit');
    const base = singles[2];
    await loot.grantCosmetic(base.id, 'audit');
    await loot.equip('H', base.id);
    const owned = await loot.ownedCosmeticIds();
    return { ids, key: bhFamilyKey(family[0]), base: base.id, owned: ids.filter(id => owned.has(id)),
      keys: ids.map(id => bhFamilyKey(BH_ITEMS.find(i => i.id === id))) };
  });
  assert.equal(fixture.owned.length, 5, 'CONTROL all five granted through primitives');
  assert.equal(new Set(fixture.keys.slice(0, 3)).size, 1, 'CONTROL three same look');
  assert.equal(new Set(fixture.keys).size, 3, 'CONTROL two separate looks');
  console.log('CONTROL', fixture);
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await page.waitForSelector('[data-pd="H"]');
  const grid = '[data-ward-pieces] .ward-grid[data-wslot="H"]';
  const count = async (selector, attr) => page.evaluate(({ selector, attr, ids }) => {
    const tiles = [...document.querySelectorAll(`${selector} > .ward-cell`)];
    const matching = tiles.filter(n => ids.includes(n.getAttribute(`data-${attr}`)) || n.dataset.famIds?.split(' ').some(id => ids.includes(id)));
    return { tiles: matching.length, badge: matching.find(n => n.dataset.famIds?.includes(ids[0]))?.querySelector('.ward-fam-n')?.textContent };
  }, { selector, attr, ids: fixture.ids });
  const stacked = await count(grid, 'equip');
  assert.equal(stacked.tiles, 3, 'STACK five items become three tiles');
  assert.equal(stacked.badge, '3', 'STACK exact variant count');
  console.log('STACK', stacked);
  await page.click(`${grid} [data-family="${fixture.key}"]`);
  await sleep(500);
  for (const id of fixture.ids.slice(0, 3)) {
    assert.ok(await page.$(`${grid} .fam-rail [data-equip="${id}"]:not(:disabled)`), `REACHABLE ${id}`);
  }
  await page.click(`${grid} .fam-rail [data-equip="${fixture.ids[1]}"]`);
  await page.waitForFunction(async id => (await (await import('./js/loot.js')).equipped({ raw: true })).H === id, {}, fixture.ids[1]);
  console.log('REACHABLE second variant worn');
  // Restore the unrelated base through the primitive, then reopen the screen.
  await page.evaluate(async base => {
    await (await import('./js/loot.js')).equip('H', base);
    location.hash = '#/today';
  }, fixture.base);
  await sleep(400);
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await page.waitForSelector('[data-ward-mode]');
  await page.click('[data-ward-mode]');
  await page.waitForSelector('[data-ward-looks]:not([hidden]) .ward-grid');
  const looks = '[data-ward-looks] .ward-grid';
  const transmog = await count(looks, 'look');
  assert.equal(transmog.tiles, 3, 'TRANSMOG STACK five items become three tiles');
  assert.equal(transmog.badge, '3', 'TRANSMOG STACK count');
  console.log('TRANSMOG STACK', transmog);
  await page.click(`${looks} [data-family="${fixture.key}"]`);
  for (const id of fixture.ids.slice(0, 3)) {
    assert.ok(await page.$(`${looks} .fam-rail [data-look="${id}"]:not(:disabled)`), `TRANSMOG REACHABLE ${id}`);
  }
  await page.click(`${looks} .fam-rail [data-look="${fixture.ids[1]}"]`);
  await sleep(600);
  const commit = await page.$('.mog-dock [data-look-apply], [data-look-apply]');
  assert.ok(commit, 'TRANSMOG commit reachable');
  await commit.click();
  await sleep(600);
  const worn = await page.evaluate(async () => (await (await import('./js/loot.js')).equipped()).H);
  assert.equal(worn, fixture.ids[1], 'TRANSMOG REACHABLE second variant worn');
  console.log('TRANSMOG REACHABLE second variant worn');
} finally { await browser.close(); }
