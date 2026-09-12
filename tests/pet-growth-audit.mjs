/* Commander browser proof: node tests/pet-growth-audit.mjs [baseUrl]
 * Run unchanged against live before release: TODAY must fail with equal widths.
 * No live RED or local browser result is claimed until the commander runs it.
 */
import assert from 'node:assert/strict';
import { boot } from './godmode.js';

const { browser, page } = await boot(process.argv[2] || process.env.URL);
try {
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const ids = await page.evaluate(async () => {
    if (!navigator.webdriver || !new URL(location.href).searchParams.has('demo')) {
      throw new Error('Fixture requires webdriver and demo mode');
    }
    const db = await import('/js/db.js');
    db.useDbName('tally-demo');
    const loot = await import('/js/loot.js');
    const base = await loot.addPetInstance('C6');
    const grown = await loot.addPetInstance('C6');
    const rows = await loot.petInstances();
    await db.kvSet('petInst', rows.map(p => p.iid === grown.iid ? { ...p, lineage: 3 } : p.iid === base.iid ? { ...p, lineage: 0 } : p));
    await loot.equip('C', 'C6');
    return [base.iid, grown.iid];
  });
  const measure = async iid => {
    await page.evaluate(async id => {
      const { setEquippedPet } = await import('/js/loot.js');
      await setEquippedPet(id);
      location.hash = '#/today';
    }, iid);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('#heroPetBtn .petcrop');
    return page.evaluate(async id => {
      const loot = await import('/js/loot.js');
      const pet = await loot.equippedPetInstance();
      if (pet?.iid !== id) throw new Error('Wrong equipped instance');
      const sprite = document.querySelector('#heroPetBtn .petcrop');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const r = sprite.getBoundingClientRect();
      return { width: r.width, height: r.height, lineage: pet.lineage || 0 };
    }, iid);
  };
  const base = await measure(ids[0]);
  const grown = await measure(ids[1]);
  console.log(`TODAY ${JSON.stringify({ base, grown })}`);
  assert.ok(base.width > 0 && base.height > 0 && grown.width > 0 && grown.height > 0, 'Nonempty sprite measurements');
  assert.equal(base.lineage, 0);
  assert.equal(grown.lineage, 3);
  assert.ok(Math.abs(grown.width - base.width * 1.12) <= 1, 'TODAY lineage 3 is 12% wider within 1px');
  assert.ok(Math.abs((grown.width / grown.height) / (base.width / base.height) - 1) <= 0.01, 'ASPECT unchanged within 1%');
  console.log('PASS TODAY growth and ASPECT');
} finally {
  await browser.close();
}
