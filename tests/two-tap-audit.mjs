/* One tap must never spend. The failing result is a coin balance that DROPS on the
 * first tap, so that is what this measures, on the real buttons. */
import { boot, sleep } from './godmode.js';
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
const { browser, page } = await boot(process.argv[2] || process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };
const coins = () => page.evaluate(async () => (await import('./js/loot.js')).coins());

await page.evaluate(async () => { await (await import('./js/loot.js')).coinsAdd(20000); });

// ---- THE CAULDRON: the actual accident ----
// v304: the Kitchen opens on two doors and the cauldrons sit behind COOK, so
// reaching #buyPot and #forageBtn takes a real tap on that door first.
const openCook = async () => {
  for (let i = 0; i < 6; i++) { if (!await page.evaluate(() => !!document.querySelector('#sheets > div'))) break; await page.evaluate(() => history.back()); await sleep(400); }
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1600);
  await page.evaluate(() => document.querySelector('.dw')?.remove());
  const b = await page.$('#kitchenActBtn'); await b.click(); await sleep(1700);
  /* THE KITCHEN NO LONGER HAS DOORS. It landed on COOK and GROW until
     2026-08-18, when the Bone Garden left the player's path and the landing
     became the cook view itself. Tapping the door when it exists keeps this
     runnable against an older tree; its absence is not a failure here, it is
     garden-closed-audit.mjs's assertion. */
  const door = await page.$('#doorCook');
  if (door) { await door.click(); await sleep(1200); }
};
await openCook();
const before = await coins();
const label0 = await page.evaluate(() => document.getElementById('buyPot')?.textContent.replace(/\s+/g, ' ').trim());
check('the extra cauldron button is there', !!label0, label0);
await page.evaluate(() => document.getElementById('buyPot').click());
await sleep(600);
const afterOne = await coins();
const armed = await page.evaluate(() => {
  const b = document.getElementById('buyPot');
  return { armed: b?.dataset.armed, text: b?.textContent.replace(/\s+/g, ' ').trim(), gold: b?.classList.contains('arming') };
});
console.log(`cauldron: ${before} -> ${afterOne}`, JSON.stringify(armed));
check('ONE tap on the cauldron spends NOTHING', afterOne === before, `${before} -> ${afterOne}`);
check('it asks, naming the price', armed.armed === '1' && /Spend 1,000\?/.test(armed.text), armed.text);
check('and it goes gold while it waits', armed.gold);
await page.evaluate(() => document.getElementById('buyPot').click());
await sleep(1600);
const afterTwo = await coins();
console.log('after the confirm:', afterTwo);
check('the second tap buys it', afterTwo === before - 1000, `${before} -> ${afterTwo}`);

// ---- it must FORGET, so a stray tap minutes later cannot buy ----
await openCook();
const c0 = await coins();
const btn2 = await page.$('#buyPot');
if (btn2) {
  await page.evaluate(() => document.getElementById('buyPot').click());
  await sleep(4200);                            // longer than the cool-off
  // after the cool-off the paused render loop resumes and builds a FRESH button, so
  // `armed` is undefined rather than '0'. Both mean not-armed; assert the state, and
  // assert the label is back, which is what a player actually sees.
  const cooled = await page.evaluate(() => {
    const b = document.getElementById('buyPot');
    return { armed: b?.dataset.armed ?? 'fresh', text: b?.textContent.replace(/\s+/g, ' ').trim(), arming: b?.classList.contains('arming') };
  });
  const c1 = await coins();
  check('an armed button cools off by itself', cooled.armed !== '1' && !cooled.arming, JSON.stringify(cooled));
  check('and its original label comes back', !/Spend/.test(cooled.text || ''), cooled.text);
  check('and nothing was spent while it cooled', c1 === c0, `${c0} -> ${c1}`);
}

// ---- FORAGE ----
await openCook();
const f0 = await coins();
await page.evaluate(() => document.getElementById('forageBtn').click());
await sleep(600);
const f1 = await coins();
const fArm = await page.evaluate(() => document.getElementById('forageBtn')?.textContent.trim());
check('one tap on Forage spends nothing', f1 === f0, `${f0} -> ${f1}`);
check('and it asks first', /Spend 45\?/.test(fArm || ''), fArm);
await page.evaluate(() => document.getElementById('forageBtn').click());
await sleep(1400);
check('the confirm forages', (await coins()) === f0 - 45, `${f0} -> ${await coins()}`);

/* ---- THE BONE MERCHANT stood here, and it was the priciest tap in the game:
   up to 6,000 coins AND 350 Bone Dust behind one [data-buyweapon] button. The
   merchant closed on 2026-08-25 (S0) and there is no weapon left to buy, so the
   row would now be an empty sample, which this file treats as a FAILURE rather
   than a pass.
   THE PRICIEST SURVIVING TAP IS THE DROP, at 3,000 coins, and it is graded
   above through [data-buydrop]. The structural sweep that holds for buttons
   nobody has written yet lives in tests/unit.test.js ("no control that spends
   coins or dust buys on a single tap"), and [data-buyweapon] came off its list
   in the same change. ---- */

/* AND THE MERCHANT REALLY IS GONE FROM THE SHOP, which is a different claim from
   "the button is guarded": a leftover row that still renders would be a dead
   control on the priciest screen in the game. Graded on the real screen. */
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(1700);
await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="shop"]')?.click());
await sleep(1800);
await page.evaluate(() => document.querySelector('#shopRest')?.click());
await sleep(900);
const merch = await page.evaluate(() => ({
  buys: document.querySelectorAll('[data-buyweapon]').length,
  equips: document.querySelectorAll('[data-weapon]').length,
  heading: /Bone Merchant/.test(document.body.textContent),
  // CONTROL: the shop really did render, so "no merchant" is not "no screen"
  coinCells: document.querySelectorAll('[data-buy]').length,
}));
console.log('shop after S0:', JSON.stringify(merch));
check('CONTROL the shop screen really rendered, so the rows below are not vacuous',
  merch.coinCells > 0, JSON.stringify(merch));
check('the Bone Merchant renders no buy buttons', merch.buys === 0, `${merch.buys} found`);
check('and no equip buttons', merch.equips === 0, `${merch.equips} found`);
check('and its heading is gone from the Shop', !merch.heading);

await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nNO PURCHASE SPENDS ON ONE TAP');
process.exit(bad ? 1 : 0);
