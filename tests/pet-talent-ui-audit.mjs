// Reviewer-only browser proof. Not run in the lane A socket-denied sandbox.
// node tests/pet-talent-ui-audit.mjs [http://127.0.0.1:PORT/]
// Expected: PASS STABLE-SAVE, PASS STABLE-REOPEN, PASS STALE-REFUSAL,
// PASS DUPLICATE-LOCKED, PASS BATTLE, then pet-talent-ui: 5 passed, 0 failed.
// Red control: run unchanged with HEAD's app.js restored in a throwaway copy.
// STABLE-SAVE must fail because its click still writes a species id.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boot, seed, settle, fightRung, serveTree, dismissOverlays } from './godmode.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseArg = process.argv[2];
if (baseArg) assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseArg).hostname), 'use a local checkout server only');
const own = baseArg ? null : await serveTree(root);
let browser, passed = 0;
try {
  const session = await boot(baseArg || own.url);
  browser = session.browser;
  const { page } = session;
  await seed(page, { level: 20, coins: 10000 });
  // Observe the real app's battle boundary without replacing any implementation.
  // This response comes from THIS checkout; all real UI and storage paths execute.
  const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const call = 'battlePet = buildBattlePet(petInst.sp, pl, picks, { shiny: !!petInst.shiny, lineage: petInst.lineage || 0 });';
  assert.equal(source.split(call).length, 2, 'exactly one battle boundary must be observed');
  const observed = source.replace(call, call + '\nwindow.__petTalentProof = { iid: petInst.iid, level: pl, input: [...picks], output: [...battlePet.picks] };');
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/js/app.js') request.respond({ status: 200, contentType: 'application/javascript', body: observed });
    else request.continue();
  });
  await page.evaluate(async () => {
    const { kvSet, db } = await import('/js/db.js');
    const { PET_LEVEL_STEPS, PET_TREES } = await import('/js/pets.js');
    const copies = ['talent-veteran', 'talent-newborn'].map(iid => ({ iid, sp: 'C1', shiny: false, lineage: 0 }));
    await db.put('inv', { id: 'cos-C1', kind: 'cos', itemId: 'C1' });
    for (const [key, value] of Object.entries({ petInst: copies, petLvlV: 2,
      petLvlSteps: { 'talent-veteran': PET_LEVEL_STEPS[9], 'talent-newborn': 0 },
      pettalents: { C1: PET_TREES.imp.map(t => t.opts[0].id) },
      petEquipped: 'talent-veteran', equipped: { C: 'C1' } })) await kvSet(key, value);
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await dismissOverlays(page);
  const click = async selector => {
    await page.waitForSelector(selector, { visible: true });
    await page.$eval(selector, el => el.scrollIntoView({ block: 'center' }));
    await settle(page);
    const hit = await page.$eval(selector, el => {
      const r = el.getBoundingClientRect();
      return !el.disabled && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
    assert.ok(hit, `control is disabled or covered: ${selector}`);
    await page.click(selector);
    await settle(page);
  };
  const pass = name => { passed++; console.log(`PASS ${name}`); };
  await click('#stableBtn');
  await click('[data-pettree="talent-veteran"]');
  const pick = '[data-petpick2="i-siphon"]';
  await click(pick);
  await page.waitForFunction(async () => {
    const { petPicks } = await import('/js/loot.js');
    return (await petPicks('talent-veteran')).includes('i-siphon');
  });
  const saved = await page.evaluate(async () => {
    const { petPicks } = await import('/js/loot.js');
    return { own: await petPicks('talent-veteran'), sibling: await petPicks('talent-newborn') };
  });
  assert.ok(saved.own.includes('i-siphon'));
  assert.deepEqual(saved.sibling, []);
  assert.equal(await page.$eval(pick, el => el.classList.contains('on')), true);
  pass('STABLE-SAVE');
  await click('[data-pettree="talent-veteran"]');
  await click('[data-pettree="talent-veteran"]');
  assert.equal(await page.$eval(pick, el => el.classList.contains('on')), true);
  pass('STABLE-REOPEN');

  // Simulate a restore while the level-10 tree remains open, then click its
  // still-enabled capstone. No dataset tampering and no direct handler calls.
  const before = await page.evaluate(async () => {
    const { kvSet, kvGet } = await import('/js/db.js');
    await kvSet('petLvlSteps', { 'talent-veteran': 0, 'talent-newborn': 0 });
    return kvGet('pettalents');
  });
  await click('[data-petpick2="i-havoc"]');
  await page.waitForFunction(() => document.body.textContent.includes('This pet has not unlocked that talent.'));
  assert.deepEqual(await page.evaluate(async () => (await import('/js/db.js')).kvGet('pettalents')), before);
  pass('STALE-REFUSAL');
  await click('[data-pettree="talent-veteran"]');
  await click('[data-kin="talent-newborn"]');
  await click('[data-pettree="talent-newborn"]');
  const buttons = await page.$$eval('[data-petpick2]', els => els.map(el => ({ disabled: el.disabled, on: el.classList.contains('on'), iid: el.dataset.iid })));
  assert.equal(buttons.length, 10, 'empty or incomplete tree cannot pass');
  assert.ok(buttons.every(b => b.disabled && !b.on && b.iid === 'talent-newborn'));
  pass('DUPLICATE-LOCKED');
  await click('[data-eq="talent-newborn"]');
  // Seed the stale legacy exploit directly, then enter through a real fight button.
  await page.evaluate(async () => {
    const { kvSet } = await import('/js/db.js');
    const { PET_TREES } = await import('/js/pets.js');
    await kvSet('pettalents', { __iidV: 2, 'talent-newborn': PET_TREES.imp.map(t => t.opts[0].id) });
    window.__petTalentProof = null;
  });
  assert.ok(await fightRung(page, 1), 'real fight did not start');
  const battle = await page.evaluate(() => ({ proof: window.__petTalentProof, fight: window.__bhFight?.state() }));
  assert.deepEqual(battle.proof, { iid: 'talent-newborn', level: 1, input: [], output: [] });
  assert.ok(battle.fight && battle.fight.pet > 0, 'the fight must actually contain the pet');
  pass('BATTLE');
  console.log(`pet-talent-ui: ${passed} passed, 0 failed`);
} catch (e) {
  console.error(`FAIL pet-talent-ui: ${e.message}`);
  console.log(`pet-talent-ui: ${passed} passed, 1 failed`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (own) own.close();
}
