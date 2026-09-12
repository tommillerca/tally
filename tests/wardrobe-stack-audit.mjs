import assert from 'node:assert/strict';
import { boot, sleep, setWidth, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* SERVE THIS TREE WHEN NO URL IS GIVEN. boot(undefined) defaults to the LIVE
   site, so a bare `node tests/<this>.mjs` would grade production and report
   green while proving nothing about the code under it. Flagged twice in one
   day by submission-preflight-audit's COVERAGE row. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || process.env.URL || null;
const srv = base ? null : await serveTree(ROOT);
const { browser, page } = await boot(base || srv.url, { headless: 'shell' });
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
  /* Stay on H. The previous line opened a DIFFERENT slot so that H appeared in
     the `.ward-other-slots` overview; that overview is gone in v586, and the
     stacking it was written for lives in the open slot's own grid. */
  await page.waitForSelector(grid);
  const stacked = await page.evaluate(async gridSel => {
    const { BH_ITEMS_WITH_UNRELEASED, BH_BY_ID, BH_SLOTS, bhFamilyKey } = await import('./data/boneheadz.js');
    const { GEAR_ITEMS } = await import('./js/gear.js');
    const loot = await import('./js/loot.js');
    const owned = await loot.ownedCosmeticIds();
    const gear = await loot.ownedGearIds();
    const expected = [];
    for (const { code } of BH_SLOTS.filter(s => !['S', 'C'].includes(s.code))) {
      const counts = new Map();
      const arts = [...BH_ITEMS_WITH_UNRELEASED.filter(i => i.slot === code && owned.has(i.id)),
        ...GEAR_ITEMS.filter(g => g.slot === code && gear.has(g.id)).map(g => BH_BY_ID[g.artId])];
      for (const art of arts) {
        const key = bhFamilyKey(art);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      for (const [key, owned] of counts) expected.push({ slot: code, key, owned });
    }
    /* RETARGETED IN v586. This graded the `.ward-other-slots` overview, which
       listed every OTHER slot's families below the open one. Tom removed that
       on 2026-09-12: "why when scrolling donw are you showing me background
       body etc all this shit the point is you pick something on the paper doll
       equip it then go back to the paper doll equip the next thing youre trying
       to do too much". Asserting twelve of those sections made this guard pin
       the behaviour he rejected, so it would have gone red on the fix.
       What the feature is actually FOR survives and is what is graded now:
       cosmetics that share a look stack into ONE tile with a count, inside the
       grid of the slot the player opened. */
    const tiles = [...document.querySelectorAll(gridSel + ' [data-equip]')].filter(t => t.dataset.equip);
    return { tiles: tiles.length,
      expected: expected.filter(f => f.slot === 'H'),
      actual: tiles.map(t => ({ id: t.dataset.equip,
        badge: t.querySelector('.ward-fam-n')?.textContent ?? null })) };
  }, grid);
  console.log('STACK', JSON.stringify(stacked));
  assert.ok(stacked.expected.length > 0, 'CONTROL owned families in the open slot');
  assert.ok(stacked.tiles > 0, 'CONTROL the open slot rendered equip tiles (empty sample = failure)');
  /* One tile carries the fixture family's count: three owned variants of one
     look collapse to a single tile badged 3, which is the whole feature. */
  const badges = stacked.actual.map(t => t.badge).filter(Boolean);
  assert.ok(badges.includes('3'), `STACK the three same-look variants collapse to one tile badged 3, saw ${JSON.stringify(badges)}`);
  assert.ok(stacked.tiles < stacked.expected.reduce((n, f) => n + f.owned, 0) + 2,
    'STACK the grid shows fewer tiles than owned items, i.e. they stacked');
  /* Open the stack from the slot's own grid now that the overview is gone. The
     family tile carries data-family as well as data-equip: one tap both wears
     what the tile shows and opens the rail of its siblings underneath. */
  await page.evaluate(sel => document.querySelector(sel)?.click(), `${grid} .ward-cell.fam[data-family]`);
  await sleep(700);
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
  assert.equal(transmog.tiles, 3, 'TRANSMOG PRE-EXISTING grouping five items become three tiles');
  assert.equal(transmog.badge, '3', 'TRANSMOG PRE-EXISTING grouping count');
  console.log('TRANSMOG PRE-EXISTING grouping', transmog);
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
} finally { await browser.close(); if (srv) srv.close(); }
