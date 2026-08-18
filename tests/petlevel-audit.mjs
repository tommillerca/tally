/* PET LEVEL-UP (js/app.js openPetLevelUp:9658): reward moment shown when the
 * equipped pet crosses a step threshold. It has no runtime coverage today.
 *
 * Two silent failure shapes worth pinning:
 *   1. Wrong prevLevel. If before === after (e.g. both computed at `level`),
 *      every stat delta reads "+0" but the sheet still opens; a check that
 *      only asserts "the sheet rendered" would pass. What a player sees is
 *      a moment that says nothing.
 *   2. Sheet never opens. checkPetLevelUp short-circuits (prev is null on
 *      first sighting; cur <= prev; sheetStack is non-empty and it goes to
 *      toast). A test that expects the sheet to open on ANY sync would miss
 *      the "silently retired" case.
 *
 * DRIVE PATH. checkPetLevelUp fires from onHealthSync (via ingestHealth),
 * and boot itself schedules a checkPetLevelUp 1500 ms after `initGameIfNeeded`
 * (js/app.js:622). openPetLevelUp is module-scope, not exported to window.
 * The natural player path is a Sync now: fill clipboard with a valid
 * payload, click #hkSyncNow, ingestHealth runs -> onHealthSync runs ->
 * checkPetLevelUp fires. That is what this audit drives. The pet's step
 * bank (kv 'petLvlSteps') and last-seen level (kv 'petSeenLevel') are
 * seeded before the sync so checkPetLevelUp sees a real cur>prev jump and
 * openPetLevelUp opens with prev and cur set to different levels.
 *
 * ASSERTIONS use the battle-stat formulas from js/pets.js:135 as ground
 * truth, so a "+0" line reads red the way it should rather than reading as
 * "just how big the delta happens to be this level". petBattleStats is
 * imported for the expected value, not read out of the DOM twice.
 */
import { boot, sleep, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const srv = { kill: () => srvHandle && srvHandle.close() };
const base = argv || srvHandle.url;

const { browser, page } = await boot(base);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

/* Seed a fresh equipped pet so we own the iid + starting level. Wipe any
 * open sheets so checkPetLevelUp does not fall through to the toast path
 * at app.js:11631. The seed jumps steps from L2 (needs 4000) to L3 (needs
 * 9000): seeded value 10000 puts cur = 3 and seen[iid] = 2 gives prev = 2. */
const setup = await page.evaluate(async () => {
  const { db, kvSet, kvGet, newId } = await import('./js/db.js');
  const { equippedPetInstance } = await import('./js/loot.js');
  const { petLevel } = await import('./js/pets.js');
  /* Ensure the equipped-pet slot has a pet we control. If nothing is
     equipped, seed a Bulldog (C1) instance and mark it equipped. */
  let inst = await equippedPetInstance();
  if (!inst) {
    const iid = newId();
    const insts = (await kvGet('petInsts', [])) || [];
    insts.push({ iid, C: 'C1', gotAt: Date.now(), source: 'test' });
    await kvSet('petInsts', insts);
    await kvSet('petEquipped', iid);
    inst = await equippedPetInstance();
  }
  const iid = inst.iid;
  /* Seed the step bank + last-seen level for a level 2 -> 3 jump. */
  const bank = (await kvGet('petLvlSteps', {})) || {};
  bank[iid] = 10000;
  await kvSet('petLvlSteps', bank);
  const seen = (await kvGet('petSeenLevel', {})) || {};
  seen[iid] = 2;
  await kvSet('petSeenLevel', seen);
  /* Clear any sheets currently open so checkPetLevelUp does NOT branch to
     the toast path. Remove the DOM nodes AND clear the module's own stack
     via ESC + history back which the app uses on sheet close. */
  document.querySelectorAll('#sheets .sheet, #sheets > *').forEach(n => n.remove());
  return {
    iid, sp: inst.sp, shiny: !!inst.shiny, lineage: inst.lineage || 0,
    currentLevel: petLevel(bank[iid]),
    seenLevel: seen[iid],
  };
});
check('SETUP  equipped pet iid + species located', !!setup.iid && !!setup.sp, JSON.stringify(setup));
check('SETUP  seeded step bank puts current level at 3', setup.currentLevel === 3, `currentLevel=${setup.currentLevel}`);
check('SETUP  seen level = 2 (so checkPetLevelUp sees a real jump 2 -> 3)', setup.seenLevel === 2);

/* Expected deltas from pets.js:135 formulas. Read them from the app itself
 * so the assertions cannot drift from the game's own numbers. Any change
 * to petBattleStats surfaces here as a delta drift, not as a false pass. */
const expected = await page.evaluate(async setup => {
  const { petBattleStats } = await import('./js/pets.js');
  const before = petBattleStats(setup.sp, 2, setup.shiny, setup.lineage);
  const after  = petBattleStats(setup.sp, 3, setup.shiny, setup.lineage);
  return {
    before, after,
    dPower: after.power - before.power,
    dHp:    after.hp - before.hp,
    dReflex:after.reflex - before.reflex,
  };
}, setup);
console.log('expected deltas:', JSON.stringify(expected));
check('EXPECTED  power delta 2->3 is strictly positive (would go +0 on a wrong-prevLevel bug)',
  expected.dPower > 0, `dPower=${expected.dPower}`);
check('EXPECTED  hp delta 2->3 is strictly positive',
  expected.dHp > 0, `dHp=${expected.dHp}`);
check('EXPECTED  reflex delta 2->3 is strictly positive',
  expected.dReflex > 0, `dReflex=${expected.dReflex}`);

/* DRIVE: Sync from clipboard fires ingestHealth -> onHealthSync ->
 * checkPetLevelUp on web. Stub clipboard.readText with a valid payload
 * so the parse -> ingest chain runs on real data. Same pattern the
 * health-intake audit uses; stub via defineProperty so navigator.clipboard
 * gets a readable method under puppeteer. */
const appToday = await page.evaluate(async () => (await import('./js/nutrition.js')).dateKey());
async function setClipboard(text) {
  await page.evaluate(t => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: async () => t },
    });
  }, text);
}
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(600);
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForSelector('#hkSyncNow', { timeout: 10000 });
await setClipboard(`tally-hk d=${appToday} steps=100`);
/* Belt and braces: remove any sheets still on the page before the sync
   fires, so checkPetLevelUp goes to the sheet path not the toast path. */
await page.evaluate(() => document.querySelectorAll('#sheets .sheet, #sheets > *').forEach(n => n.remove()));
await page.evaluate(() => document.querySelector('#hkSyncNow').click());

/* Wait for the level-up sheet. `.lvlup-stage` is the container inside
 * openPetLevelUp's markup. Cap at 15s so a "sheet never opens" bug is a
 * FAIL rather than a hang. */
const sheetShown = await page.waitForSelector('.lvlup-stage', { timeout: 15000 })
  .then(() => true).catch(() => false);
check('SHEET  openPetLevelUp arrives on Sync now (an empty sample here is a FAIL)',
  sheetShown, sheetShown ? '' : 'no .lvlup-stage on the page after 15s of the sync');

if (sheetShown) {
  /* Read the sheet contents. openPetLevelUp writes "PET LEVEL <N>!" and
   * three .pet-gain lines, each with a <b> (absolute stat) and optional
   * <i> (delta). A "+0" bug shows the <b> the same but omits the <i>, so
   * an assertion on <i> presence + text catches the wrong-prevLevel shape. */
  const dom = await page.evaluate(() => {
    const stage = document.querySelector('.lvlup-stage');
    const stamp = document.querySelector('.lvl-stamp')?.textContent?.trim();
    const gains = [...document.querySelectorAll('.pet-gain')].map(g => ({
      key: (g.textContent || '').trim().split(/\s+/)[0],
      abs: g.querySelector('b')?.textContent?.trim(),
      delta: g.querySelector('i')?.textContent?.trim() || null,
    }));
    return {
      stampText: stamp,
      gains,
      hasCta: !!document.querySelector('#celeOk, #petTalentBtn'),
      subText: document.querySelector('.cele-sub')?.textContent?.trim(),
    };
  });
  console.log('sheet contents:', JSON.stringify(dom));
  check(`SHEET  the level stamp reads "PET LEVEL 3!" (from cur=${setup.currentLevel})`,
    /PET LEVEL\s*3\s*!/i.test(dom.stampText || ''),
    `stamp="${dom.stampText}"`);
  check('SHEET  three .pet-gain rows (PWR, HP, REF)',
    dom.gains.length === 3 && dom.gains.map(g => g.key).join(',') === 'PWR,HP,REF',
    JSON.stringify(dom.gains.map(g => g.key)));
  /* Every delta must be a REAL positive number matching the expected
     jump. This is the check that catches the wrong-prevLevel bug: a
     before === after would leave the <i> element empty (no +N), so
     delta reads null and the assertion fires. */
  const gainByKey = Object.fromEntries(dom.gains.map(g => [g.key, g]));
  check(`SHEET-DELTA  PWR shows "+${expected.dPower}" (would be empty on +0 bug)`,
    gainByKey.PWR?.delta === `+${expected.dPower}`,
    `PWR delta="${gainByKey.PWR?.delta}", expected "+${expected.dPower}"`);
  check(`SHEET-DELTA  HP shows "+${expected.dHp}"`,
    gainByKey.HP?.delta === `+${expected.dHp}`,
    `HP delta="${gainByKey.HP?.delta}", expected "+${expected.dHp}"`);
  check(`SHEET-DELTA  REF shows "+${expected.dReflex}"`,
    gainByKey.REF?.delta === `+${expected.dReflex}`,
    `REF delta="${gainByKey.REF?.delta}", expected "+${expected.dReflex}"`);
  /* The absolute stats on each row are the AFTER value; if they equal the
     BEFORE the whole moment is graded on the wrong level. */
  check('SHEET-ABS  PWR absolute matches the AFTER stat (not the BEFORE)',
    gainByKey.PWR?.abs === String(expected.after.power),
    `abs="${gainByKey.PWR?.abs}", expected=${expected.after.power}`);
  check('SHEET-ABS  HP absolute matches the AFTER stat',
    gainByKey.HP?.abs === String(expected.after.hp),
    `abs="${gainByKey.HP?.abs}", expected=${expected.after.hp}`);
  check('SHEET-ABS  REF absolute matches the AFTER stat',
    gainByKey.REF?.abs === String(expected.after.reflex),
    `abs="${gainByKey.REF?.abs}", expected=${expected.after.reflex}`);
  check('SHEET  a CTA button is present (Nice / Later / Pick my talent)',
    dom.hasCta);
}

/* After the sheet opens, checkPetLevelUp wrote seen[iid] = 3 (line 11628).
 * Verify: a repeat sync must NOT re-open the sheet (cur === prev short-
 * circuits at line 11626), which is the same class of guard as the
 * wheel/glutton "second attempt pays nothing" property. */
await page.evaluate(() => document.querySelectorAll('.lvlup-stage').forEach(n => n.closest('#sheets > *')?.remove() || n.remove()));
await sleep(400);
await page.evaluate(() => document.querySelector('#hkSyncNow').click());
await sleep(1500);
const repeatShown = await page.evaluate(() => !!document.querySelector('.lvlup-stage'));
check('REPEAT  the level-up sheet does NOT re-open on the next sync (cur === prev short-circuits)',
  !repeatShown,
  repeatShown ? '.lvlup-stage is on the page after a repeat sync (SOP violation, same shape as double-payout)' : '');

await browser.close();
srv.kill();
console.log(bad ? `\n${bad} FAILED` : '\nPET LEVEL-UP VERIFIED');
process.exit(bad ? 1 : 0);
