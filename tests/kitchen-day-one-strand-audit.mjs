/* R38-23: A DAY-ONE COOK COULD STRAND THEMSELVES.
 *
 * HANDOFFr3820260906.md: the starter pouch is {marrow:2, salt:1}, exactly Bone
 * Broth's needs (js/cooking.js RECIPES), but Stoneskin Draught only needs
 * {marrow:1, salt:1} and is ALSO affordable from it. A day-one save has both
 * buttons enabled; cooking Stoneskin instead of Bone Broth leaves {marrow:1,
 * salt:0}, which cooks nothing else in the game (0 of 13 recipe/potion
 * buttons), and there was no way to get the pot back. Measured recovery cost:
 * 606 coins of foraging against a day-one wallet of roughly 300.
 *
 * TWO FIXES, both driven through the real Kitchen sheet, never by calling
 * cancelCook()/startCook() directly:
 *   TIP    before the first tap, the sheet says which recipe the starter
 *          ingredients are for.
 *   CANCEL starting the WRONG pot (Stoneskin, on purpose, to reproduce the
 *          exact strand) is recoverable: Cancel returns the ingredients to
 *          the day-one wallet, byte for byte, and Bone Broth is affordable
 *          again afterward.
 *
 * Seeds through js/db.js at the SAME url the app already loaded (no ?q=1):
 * this runs through boot()'s ?demo path, which points the app's own db.js at
 * 'tally-demo' via a module-scope useDbName() call, and a query-busted import
 * resolves to a separate module instance still pointed at 'tally' -- see the
 * comment in tests/pit-kitchen-hint-audit.mjs, where this cost a debugging
 * round first.
 *
 * PROVE-RED:
 *   TIP    blank the `starterTip` assignment in openKitchen (js/app.js) and
 *          TIP goes red; CANCEL is unaffected (independent claim).
 *   CANCEL delete cancelCook's export (js/cooking.js) or drop the data-cancel
 *          button from potCard (js/app.js) and CANCEL goes red: no button to
 *          find, ingredients stay spent.
 *
 * Usage: node tests/kitchen-day-one-strand-audit.mjs [baseUrl]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep } from './godmode.js';

const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

const { browser, page, errors } = await boot(argUrl);

const closeSheets = async () => {
  for (let i = 0; i < 6; i++) {
    if (!await page.evaluate(() => !!document.querySelector('#sheets > div'))) break;
    await page.evaluate(() => history.back());
    await sleep(450);
  }
};
const openKitchen = async () => {
  await closeSheets();
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1200);
  await page.evaluate(() => { document.querySelector('.dw')?.remove(); document.querySelector('.drop-veil')?.remove(); });
  await sleep(300);
  const kb = await page.$('#kitchenActBtn');
  if (!kb) throw new Error('the Kitchen button is missing on Today');
  await kb.click();
  await sleep(1400);
};

try {
  // ---- exactly the day-one wallet: Bone Broth's needs, nothing more ----
  await page.evaluate(async () => {
    const { kvSet } = await import('/js/db.js');
    await kvSet('ingredients', { marrow: 2, salt: 1 });
    await kvSet('cooking', null);
    await kvSet('cookq', []);
    await kvSet('pantry', []);
    await kvSet('foodbuffs', []);
    await kvSet('potions', {});
  });

  // ---- TIP: before any tap, the sheet says what the pouch is for ----
  await openKitchen();
  const tipText = await page.evaluate(() => document.querySelector('#kitchenBody')?.textContent || '');
  ok('TIP the day-one Kitchen names Bone Broth before the first tap',
    /bone broth/i.test(tipText.split('Cauldrons')[0] || tipText),
    (tipText.match(/[^.]*Bone Broth[^.]*\./)?.[0] || '(not found)').trim());

  // ---- reproduce the exact strand: cook the WRONG recipe (Stoneskin) ----
  const stoneskinBtn = await page.$('button[data-cook="stoneskin"]');
  if (!stoneskinBtn) throw new Error('button[data-cook="stoneskin"] not found: is the day-one seed still {marrow:2, salt:1}?');
  const disabled = await page.evaluate(b => b.disabled, stoneskinBtn);
  ok('SETUP Stoneskin is affordable from the day-one pouch (the exact mis-tap the report names)', !disabled);
  await stoneskinBtn.click();
  await sleep(900);

  const stranded = await page.evaluate(async () => {
    const { kvGet } = await import('/js/db.js');
    const inv = await kvGet('ingredients', {});
    const anyEnabled = [...document.querySelectorAll('[data-cook]')].some(b => !b.disabled);
    return { inv, anyEnabled };
  });
  ok('STRAND the wrong cook really does leave nothing else affordable (reproduces the report, not a strawman)',
    !stranded.anyEnabled, JSON.stringify(stranded.inv));

  // ---- CANCEL: the pot can be undone, ingredients back byte for byte ----
  const cancelBtn = await page.$('[data-cancel]');
  ok('CANCEL a Cancel control exists on the cooking pot', !!cancelBtn);
  if (cancelBtn) {
    await cancelBtn.click();               // arm
    await sleep(200);
    const armedLabel = await page.evaluate(b => b.textContent.trim(), cancelBtn);
    ok('CANCEL first tap arms a confirm, does not cancel immediately', /cancel\?/i.test(armedLabel), armedLabel);
    await cancelBtn.click();               // confirm, well inside the 2.4s cooloff
    await sleep(900);
  }

  const restored = await page.evaluate(async () => {
    const { kvGet } = await import('/js/db.js');
    return { inv: await kvGet('ingredients', {}), cooking: await kvGet('cooking', null) };
  });
  ok('RESTORE ingredients are back to the exact day-one wallet',
    restored.inv.marrow === 2 && restored.inv.salt === 1, JSON.stringify(restored.inv));
  ok('RESTORE the pot is empty again (nothing was served)',
    !restored.cooking || restored.cooking.every(c => !c), JSON.stringify(restored.cooking));

  // ---- and Bone Broth is cookable again: the strand is really gone ----
  await openKitchen();
  const brothBtn = await page.$('button[data-cook="bone-broth"]');
  const brothDisabled = brothBtn ? await page.evaluate(b => b.disabled, brothBtn) : null;
  ok('RECOVER Bone Broth is affordable again after the cancel', brothBtn && !brothDisabled);

  ok('NOERR no page error', errors.length === 0, errors.join(' | ').slice(0, 300));
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.p).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(failed ? 'KITCHEN DAY-ONE STRAND AUDIT FAILED' : 'KITCHEN DAY-ONE STRAND AUDIT VERIFIED');
process.exit(failed ? 1 : 0);
