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
  const door = await page.$('#doorCook');
  if (!door) throw new Error('the Kitchen has no COOK door');
  await door.click(); await sleep(1200);
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

// ---- THE BONE MERCHANT: the priciest tap in the game ----
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(1700);
await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="shop"]')?.click());
await sleep(1800);
/* The shop used to render its merchant behind a <details class="shop-fold">
   that needed opening after the tab click. Current shape (js/app.js merchantHtml
   at ~line 4780) renders the merchant rows and [data-buyweapon] buttons
   directly under the shop tab, no fold. suite-rot flagged this line's
   .shop-fold query as STALE (verified 2026-08-13: no js/ file emits
   .shop-fold anymore; app.css has an orphaned rule block that is dead too).
   The setAttribute was a no-op even before this cleanup; dropping the line
   removes the dead selector and does not change the subsequent
   [data-buyweapon] read the assertion actually depends on. */
await sleep(500);
const w0 = await coins();
const wInfo = await page.evaluate(() => {
  const b = [...document.querySelectorAll('[data-buyweapon]')].find(x => !x.disabled);
  if (!b) return null;
  b.dataset.probe = '1';
  return { id: b.dataset.buyweapon, label: b.textContent.replace(/\s+/g, ' ').trim() };
});
console.log('weapon button:', JSON.stringify(wInfo));
if (wInfo) {
  await page.evaluate(() => document.querySelector('[data-probe="1"]').click());
  await sleep(700);
  const w1 = await coins();
  const wArm = await page.evaluate(() => document.querySelector('[data-probe="1"]')?.textContent.trim());
  check('one tap at the Bone Merchant spends nothing', w1 === w0, `${w0} -> ${w1}`);
  check('and it names the price it is about to take', /Spend [\d,]+/.test(wArm || ''), wArm);
} else {
  check('there was a buyable weapon to test (an empty set is not a pass)', false, 'none found');
}
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nNO PURCHASE SPENDS ON ONE TAP');
process.exit(bad ? 1 : 0);
