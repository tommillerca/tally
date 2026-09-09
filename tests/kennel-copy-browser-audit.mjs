/* R2 browser proof, written for independent review. Not run in this sandbox.
 * Local checkout only. Operates copy/breed/destroy/Kennel controls and checks
 * identity after actions. CONTROL requires real seeded instances and decoded art.
 * Expected fixed output: six PASS rows and KENNEL COPY BROWSER: 0 failed.
 * Prove red by restoring pre-R2 app.js/loot.js in a throwaway checkout.
 */
import assert from 'node:assert/strict';
import { boot, sleep, setWidth, dismissOverlays } from './godmode.js';
const url = process.argv[2];
if (url) assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'local checkout URL required');
const { browser, page, errors } = await boot(url);
let failed = 0;
async function row(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
async function click(selector) {
  await page.waitForSelector(selector, { visible: true });
  await page.$eval(selector, el => el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
  await sleep(350);
  const hit = await page.$eval(selector, el => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });
  assert(hit, `${selector} is covered at its tap point`);
  await page.click(selector); await sleep(750);
}
const frost = { iid: 'r2-frost', sp: 'C1', morph: 'frost', shiny: false, lineage: 0, hatchedAtSteps: 0 };
const ember = { ...frost, iid: 'r2-ember', morph: 'ember' };
async function seed(instances, bank = {}) {
  await page.evaluate(async ({ instances, bank }) => {
    const { db, kvSet } = await import('/js/db.js');
    for (const sp of new Set(instances.map(x => x.sp))) await db.put('inv', { id: `r2-cos-${sp}`, kind: 'cos', itemId: sp });
    await kvSet('petInst', instances);
    await kvSet('petTaken', []);
    await kvSet('petLvlV', 2);
    await kvSet('petLvlSteps', bank);
    await kvSet('petEquipped', instances[0].iid);
    await kvSet('equipped', { C: instances[0].sp });
  }, { instances, bank });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2000); await dismissOverlays(page);
  await click('#stableBtn');
}
try {
  await row('CONTROL selected instances render decoded art', async () => {
    await seed([frost, ember], { 'r2-frost': 105000 });
    const state = await page.evaluate(async () => {
      const images = [...document.querySelectorAll('#stableBody .cf-kin img')];
      return { ids: (await (await import('/js/loot.js')).petInstances()).map(x => x.iid),
        decoded: images.length === 2 && images.every(x => x.complete && x.naturalWidth > 0) };
    });
    assert.deepEqual(state.ids, ['r2-frost', 'r2-ember']); assert(state.decoded);
  });
  await row('R44-14 copy actions keep colour and card chips fit at 320 and 393', async () => {
    for (const width of [320, 393]) {
      await setWidth(page, width, 852);
      await click('[data-kin="r2-ember"]');
      assert((await page.$eval('.cf-cap', el => el.textContent)).includes('Ember Drizzle'));
      await click('[data-kin="r2-frost"]');
      assert((await page.$eval('.cf-cap', el => el.textContent)).includes('Frost Drizzle'));
      const fits = await page.$eval('.cf-card[data-sp="C1"]', card => {
        const chips = [...card.querySelectorAll('.cf-chip')];
        const colour = chips.find(c => c.textContent.trim() === 'Frost');
        if (!colour || chips.length !== 1 || /\b(common|uncommon|rare|epic|legendary)\b/i.test(card.textContent)
          || /\br-(common|uncommon|rare|epic|legendary)\b/.test(card.className)) return false;
        const r = colour.getBoundingClientRect(), box = card.getBoundingClientRect();
        const level = card.querySelector('.cf-lv')?.getBoundingClientRect();
        if (!level) return false;
        const overlaps = r.left < level.right && r.right > level.left && r.top < level.bottom && r.bottom > level.top;
        return r.width > 0 && r.left >= box.left && r.right <= box.right && r.bottom <= box.bottom && r.top >= box.top && !overlaps;
      });
      assert(fits, `Frost chip absent, clipped, tiered or overlaps level at ${width}`);
    }
  });
  await row('R44-14 breed picker and feed facts name the spare', async () => {
    await click('[data-breedsel="r2-frost"]');
    await click('[data-kin="r2-ember"]');
    await click('[data-breedsel="r2-ember"]');
    const text = await page.$eval('.breed-bar', el => el.textContent);
    assert(text.includes('Frost Drizzle') && text.includes('Ember Drizzle'));
    await click('[data-offsp="r2-frost"]');
    assert((await page.$eval('.breed-facts', el => el.textContent)).includes('Ember Drizzle · Lv 1 is destroyed'));
  });
  await row('R44-5 typed destruction names the unique colour and lost investment', async () => {
    await seed([frost, ember], { 'r2-frost': 105000 });
    await click('[data-destroy="r2-frost"]');
    const text = await page.$eval('#pdIn', el => el.closest('.sheet').textContent);
    assert(text.includes('Frost Drizzle · Lv 10') && text.includes('105,000 banked steps'));
    assert(await page.$eval('#pdGo', el => el.disabled));
    await page.type('#pdIn', 'wrong');
    assert(await page.$eval('#pdGo', el => el.disabled));
    await page.$eval('#pdIn', el => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.type('#pdIn', 'DESTROY');
    await click('#pdGo');
    const ids = await page.evaluate(async () => (await (await import('/js/loot.js')).petInstances()).map(x => x.iid));
    assert(!ids.includes('r2-frost') && ids.includes('r2-ember'));
  });
  await row('R44-16 duplicate reveal retains colour through Take them home', async () => {
    await page.evaluate(async () => {
      const { BH_BY_ID } = await import('/data/boneheadz.js');
      window.__openHatch({ item: BH_BY_ID.C1, morph: 'frost', shiny: false, dupe: true });
    });
    await page.waitForSelector('.hatch-reveal.show', { visible: true });
    const text = await page.$eval('.hatch-reveal', el => el.textContent);
    assert(text.includes('ANOTHER ONE!') && text.includes('Frost Drizzle'));
    await click('#hatchOk');
    assert.equal(await page.$('#hatchOk'), null);
  });
  await row('R44-18 complete Kennel acknowledges all 30 and cell click keeps its name', async () => {
    const all = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].flatMap(sp => ['base', 'ember', 'frost', 'toxic', 'midnight'].map(morph => ({ ...frost, sp, morph, iid: `r2-${sp}-${morph}` })));
    await seed(all);
    await click('#kennelBtn');
    assert.equal(await page.$$eval('.k-cell', cells => cells.length), 30);
    assert((await page.$eval('#kennelBody', el => el.textContent)).includes('Your Kennel is complete.'));
    assert(!/lock|hollow/i.test(await page.$eval('.k-lead', el => el.textContent)));
    await click('.k-cell[data-sp="C1"][data-morph="frost"]');
    assert.equal(await page.$eval('.k-grid-label[data-sp="C1"]', el => el.textContent), 'Frost Drizzle');
  });
  assert.equal(errors.length, 0, errors.join('\n'));
} finally {
  await browser.close();
}
console.log(`KENNEL COPY BROWSER: ${failed} failed`);
process.exitCode = failed ? 1 : 0;
