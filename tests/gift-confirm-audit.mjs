/* ONE TAP MUST NEVER SEND COINS TO ANOTHER PLAYER.
 *
 * The coin-gift chips in the friend sheet ([data-amt], js/app.js) sent up to
 * 500 coins on a SINGLE tap. That is worse than the accidental 1,000-coin
 * cauldron buy that armToConfirm was written for, because the refund path in
 * that handler only runs when the send FAILS: a successful send to the wrong
 * friend, or a thumb landing on 500 instead of 250, is final and lands in
 * somebody else's Backpack.
 *
 * WHAT THIS ASSERTS, and why it is shaped this way:
 *   ARM      one tap changes the label and does NOT move the balance
 *   COMMIT   the second tap actually spends, exactly once
 *   COOLOFF  an armed chip disarms itself, so a forgotten tap cannot be
 *            completed by a later stray one
 *
 * COMMIT is the row that stops this becoming a check that cannot fail. An
 * "arm" fix that also broke sending would pass ARM and be a worse bug.
 *
 * It is measured as a DIP, not as an end state, and that is deliberate. The
 * handler deducts locally BEFORE it awaits the send (js/app.js, "deduct
 * locally first; refund if the send fails"), and with no account signedFetch
 * throws 'offline' before it ever reaches the network (js/social.js:237), so
 * the refund runs and the balance lands exactly back where it started. Reading
 * the balance afterwards therefore cannot tell a working commit from a commit
 * that never ran. Polling for the transient low-water mark can, it needs no
 * network and no mock, and it fails if the spend stops happening.
 *
 *   node tests/gift-confirm-audit.mjs        (self-serves this checkout)
 *   URL=https://... node tests/gift-confirm-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, settle, serveTree } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
const { browser, page } = await boot(base);

try {
  await seed(page, { level: 20, coins: 5000 });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  /* the gift sheet lives behind a friend profile; __openFriendProfile is the
     webdriver-gated hook the other crew audits use */
  await page.evaluate(() => {
    window.__openFriendProfile({ playerId: 'gf1', name: 'Test Friend', alias: null,
      profile: { level: 12, levelName: 'Bonehead', badges: 1, gearCount: 2, outfit: {}, pet: null } });
  });
  await sleep(1200);
  await page.evaluate(() => document.getElementById('fpGift')?.click());
  await sleep(1200); await settle(page, 300);

  const chips = () => page.evaluate(() => [...document.querySelectorAll('.gift-amt')]
    .map(b => ({ amt: b.dataset.amt, label: b.textContent.trim(), armed: b.dataset.armed === '1', disabled: b.disabled })));
  const balance = () => page.evaluate(async () => (await import('./js/loot.js')).coins());
  /* the low-water mark over a window: catches the deduct even though the failed
     send refunds it a moment later */
  const dipAfter = async (act, ms = 1800) => {
    let low = await balance();
    await act();
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const b = await balance();
      if (b < low) low = b;
    }
    return low;
  };

  const before = await chips();
  /* AN EMPTY SAMPLE IS A FAILURE: no chips means every row below grades nothing */
  ok('SAMPLE the gift sheet rendered its amount chips', before.length >= 3,
    `${before.length} chips: ${before.map(c => c.amt).join(', ')}`);
  if (before.length < 3) throw new Error('no chips to drive');

  const target = before[before.length - 1].amt;         // the biggest, worst case
  const startBal = await balance();

  /* ---- ARM: one tap must not move a coin, at any instant ---- */
  const lowOne = await dipAfter(() => page.evaluate(a => document.querySelector(`.gift-amt[data-amt="${a}"]`).click(), target));
  const afterOne = await balance();
  const armed = (await chips()).find(c => c.amt === target);
  ok('ARM   one tap does not send anything', afterOne === startBal && lowOne === startBal,
    `balance ${startBal} -> ${afterOne}, lowest seen ${lowOne}`);
  ok('ARM   and the chip says what the second tap will do', armed.armed && /\?$/.test(armed.label),
    JSON.stringify(armed.label));

  /* ---- COMMIT: the second tap really does spend ---- */
  const lowTwo = await dipAfter(() => page.evaluate(a => document.querySelector(`.gift-amt[data-amt="${a}"]`).click(), target));
  const afterTwo = await balance();
  ok('COMMIT the second tap spends, exactly once', lowTwo === startBal - (+target),
    `lowest seen ${lowTwo} (expected ${startBal - (+target)}), settled at ${afterTwo}`);

  /* ---- COOLOFF: an armed chip must disarm itself ---- */
  const other = before[0].amt;
  await page.evaluate(a => document.querySelector(`.gift-amt[data-amt="${a}"]`)?.click(), other);
  await sleep(400);
  const armedNow = (await chips()).find(c => c.amt === other);
  await sleep(3600);                                     // ARM_COOLOFF_MS is 3200
  const disarmed = (await chips()).find(c => c.amt === other);
  const balEnd = await balance();
  ok('COOLOFF an armed chip disarms on its own, unspent',
    (!armedNow || armedNow.armed) && (!disarmed || !disarmed.armed) && balEnd === afterTwo,
    `armed ${armedNow && armedNow.armed} -> ${disarmed && disarmed.armed}, balance ${afterTwo} -> ${balEnd}`);

  ok('NO page errors', true);
} finally {
  await browser.close();
  srv?.close?.();
}
console.log(fails ? '\nGIFT CONFIRM: FAILED' : '\nGIFT CONFIRM: one tap cannot send');
process.exit(fails);
