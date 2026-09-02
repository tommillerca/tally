/* THE HEADER KEEPS UP WITH THE PAYOUT. 2026-09-02, round 14 item P7.
 *
 * Walking the reviewer path on the real ship bytes, with navigator.webdriver
 * masked so the genuine first run actually played:
 *
 *   after the Daily Spin's COLLECT on "You won 30 coins", the wallet pill read
 *   224 for the whole 8 seconds it was watched while storage already held 254.
 *   It caught up only when the player navigated away and back.
 *
 *   on the first open of a new day, the header showed 74 coins and 105 XP
 *   while storage held 224 and 180. Same shape, different producer: boot()
 *   paints at line ~1315 and then pays the welcome kit, the garden and
 *   merchant closures, the den ceiling and the day close behind the standing
 *   DOM, with nothing repainting after.
 *
 * A NEW PLAYER'S VERY FIRST SPIN LOOKS UNPAID. That is the launch-visible half
 * and it is why this file exists.
 *
 * WHY A GUARD ON STORAGE WOULD HAVE PASSED THROUGHOUT THIS BUG'S LIFE. The
 * arithmetic was never wrong. coinsAdd landed, the ledger row landed, the level
 * rose. The whole defect is that the SCREEN and the STORE disagree, so every row
 * here reads the rendered text out of the header and compares it against what
 * the app's own modules say is stored, at the same instant.
 *
 * WHY THE MASK IS A GRADED ROW. CALM_BOOT keys off navigator.webdriver
 * (js/app.js:259) and so does the wheel's own `calm` gate (js/wheel.js), so
 * under an unmasked puppeteer the wheel never opens and every row below would
 * be grading a code path no player is on. MASKED fails loudly rather than
 * letting the file pass on nothing. ?demo is kept because NOSOCIAL keys off
 * S.demo as well, which is what stops a test run phoning production.
 *
 * WHY THE CLOCK MOVES. The day's prize is date-seeded (no reroll by reload), so
 * a test has no lever over it and roughly half of all days pay something other
 * than coins. Rather than pin the wedge through the webdriver-only __wheelIdx
 * hook, which would mean unmasking and grading the wrong path, this walks
 * FORWARD a day at a time on a wiped database until it lands on a day that pays
 * coins, and fails by name if it never does. Each attempt is a genuine first
 * open of that day: fresh database, so the app's own day guard seeds rather than
 * refuses. The offset rides in localStorage so one injected script can serve
 * every attempt. Phase 2 uses the same lever for a different job: it moves ONE
 * day on a save it does not wipe, which is what makes a day close fall due.
 *
 * THE ROWS, and which direction is failure:
 *   MASKED    navigator.webdriver reads false. Without it, nothing below plays.
 *   SETUP     a coin-paying day was reached and the wheel really opened on it.
 *             An empty sample is a failure here, never a pass.
 *   REACH     the spin moved the STORE. If the payout did not happen, "the
 *             screen agrees with the store" is true and means nothing.
 *   READER    the wallet pill is on screen with a number in it that parses.
 *             Two readers that both return null agree perfectly.
 *   COLLECT   after COLLECT, the rendered coins match the stored coins inside
 *             the stated window. Failure is the pre-fix behaviour: they never
 *             agree at all.
 *   BOOT      on the first open of a NEW day, before the player touches
 *             anything, the rendered XP matches the stored XP. Its control
 *             asserts the day close really did pay on that boot; see the long
 *             note at phase 2 for why a single fresh open cannot show this.
 *
 * Run: node tests/header-freshness-audit.mjs [baseUrl]
 */
import { boot, sleep } from './godmode.js';

const fails = [];
const ok = (n, pass, d = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!pass) fails.push(n); };

/* The window the header is allowed to take to catch up, and the window this
   file watches before giving up on it. 1500ms is the promise: a repaint that
   takes longer than that is a screen the player has already read.
   Provenance: round 14 item R14-P7, 2026-09-02. The measured pre-fix behaviour
   was not "slow", it was NEVER: the header held the stale number for the whole
   8 seconds it was watched and only moved on a navigation, so any window in
   this range separates fixed from broken. */
const AGREE_MS = 1500;
/* One header read may not outlast a sample interval. A read taken while the
   database is still upgrading can sit unresolved forever, and one of those
   would hang the whole file rather than fail it. */
const READ_MS = 2500;
const WATCH_MS = 4000;
/* How many days forward to walk looking for a coin-paying wedge. The coin
   wedges carry 48 of the 95 weight in js/wheel.js PRIZES, so ten attempts miss
   about one run in a thousand, and a miss is a named FAIL rather than a quiet
   pass. Provenance: weights read off js/wheel.js on 2026-09-02. */
const DAY_TRIES = 10;

const { browser, page, base } = await boot(process.argv[2]);

/* Before any app script on every later load. Two injections, one script: the
   webdriver mask, and a Date that runs `__dayOffset` days ahead so a wiped
   database opens on a day whose prize has not been drawn yet. Date is SHIFTED,
   not frozen: the app measures elapsed time in several places and a stopped
   clock is its own bug. */
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
  let off = 0;
  try { off = Number(localStorage.getItem('__dayOffset') || 0) * 86400000; } catch { /* opaque origin */ }
  if (!off) return;
  const Real = Date;
  class Shifted extends Real {
    constructor(...a) { super(...(a.length ? a : [Real.now() + off])); }
    static now() { return Real.now() + off; }
  }
  window.Date = Shifted;
});

/* A GENUINE FIRST OPEN OF A GIVEN DAY. privacy.html is the one page on this
   origin that does not boot the app, which is what lets the demo database be
   deleted at all: deleteDatabase blocks forever against a live connection. */
async function openDay(offset) {
  await page.goto(base + 'privacy.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async o => {
    localStorage.setItem('__dayOffset', String(o));
    await new Promise(res => {
      const r = indexedDB.deleteDatabase('tally-demo');
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  }, offset);
  await page.goto(base + '?demo', { waitUntil: 'networkidle2' });
}

/* The two numbers this whole file is about, read at the same instant: what the
   header SAYS, and what the app's own modules say is STORED. */
const readHeader = () => Promise.race([page.evaluate(async () => {
  const num = s => { const d = String(s == null ? '' : s).replace(/[^0-9]/g, ''); return d === '' ? null : Number(d); };
  const coinB = document.querySelector('#coinBtn b');
  const xpn = document.querySelector('.hero-xpn');
  const box = coinB ? coinB.getBoundingClientRect() : null;
  const game = await import('/js/game.js');
  const loot = await import('/js/loot.js');
  const dbm = await import('/js/db.js');
  const xp = await game.totalXp();
  const lv = game.levelFor(xp);
  const ledger = await dbm.db.all('xp');
  return {
    saysCoins: coinB ? num(coinB.textContent) : null,
    saysInto: xpn ? num(String(xpn.textContent).split('/')[0]) : null,
    coinW: box ? Math.round(box.width) : 0,
    coinH: box ? Math.round(box.height) : 0,
    storedCoins: await loot.coins(),
    storedInto: lv.into,
    storedXp: xp,
    dayCloses: ledger.filter(r => r.type === 'dayclose' || r.type === 'dayeffort').length,
  };
}), sleep(READ_MS).then(() => ({ saysCoins: null, saysInto: null, coinW: 0, coinH: 0, storedCoins: null, storedInto: null, storedXp: null, dayCloses: null, stalled: true }))]);

// Sample until the screen agrees with the store, or until the watch runs out.
async function watchUntilAgree(pick, ms = WATCH_MS) {
  const t0 = Date.now();
  let last = null, n = 0;
  while (Date.now() - t0 < ms) {
    last = await readHeader(); n++;
    const [said, stored] = pick(last);
    if (said !== null && said === stored) return { agreedMs: Date.now() - t0, last, samples: n };
    await sleep(200);
  }
  return { agreedMs: null, last, samples: n };
}

const wheelUp = () => page.evaluate(() => !!document.querySelector('.dw #dwSpin'));

/* ============ 1. THE SPIN: walk forward to a day that pays coins ============ */
let masked = null, boots = 0, spun = null, beforeSpin = null;
for (let d = 0; d < DAY_TRIES; d++) {
  await openDay(d);
  boots++;
  if (masked === null) masked = await page.evaluate(() => navigator.webdriver);

  // wait for the wheel the genuine first open raises
  let up = false;
  for (let i = 0; i < 24 && !(up = await wheelUp()); i++) await sleep(1000);
  if (!up) continue;

  const before = await readHeader();
  await page.evaluate(() => document.querySelector('#dwSpin')?.click());
  for (let i = 0; i < 20 && !(await page.evaluate(() => !!document.querySelector('.dw-result'))); i++) await sleep(400);
  const won = await page.evaluate(() => (document.querySelector('.dw-result .rl') || {}).textContent || '');
  if (/coins/i.test(won)) { spun = { won, day: d }; beforeSpin = before; break; }
}

ok('MASKED navigator.webdriver reads false, so the wheel and the calm-boot gates do not self-suppress',
  masked === false, `navigator.webdriver = ${masked}`);
ok(`SETUP a coin-paying day was reached inside ${DAY_TRIES} tries and its wheel really opened`,
  !!spun, spun ? `day +${spun.day}, "${String(spun.won).replace(/\s+/g, ' ').trim()}" after ${boots} boots`
    : `${boots} boots, no coin wedge landed (or the wheel never opened: check MASKED first)`);

if (!spun) {
  await browser.close();
  console.log(`\n${fails.length} FAILED: ${fails.join(', ')}`);
  process.exit(1);
}

/* The grant lands on SPIN and the wheel resolves on COLLECT, so this is the
   store's word BEFORE the button that is supposed to trigger the repaint. */
const afterSpin = await readHeader();
ok('REACH the spin actually moved the STORE (a payout that never happened would make every row below vacuous)',
  afterSpin.storedCoins > beforeSpin.storedCoins,
  `${beforeSpin.storedCoins} -> ${afterSpin.storedCoins} coins`);
ok('READER the wallet pill is on screen with a number in it that parses (two null readers agree perfectly)',
  afterSpin.saysCoins !== null && afterSpin.coinW > 0 && afterSpin.coinH > 0,
  `"${afterSpin.saysCoins}" in a ${afterSpin.coinW}x${afterSpin.coinH} box`);

await page.evaluate(() => [...document.querySelectorAll('.dw-cta')].pop()?.click());
const afterCollect = await watchUntilAgree(s => [s.saysCoins, s.storedCoins]);
ok(`COLLECT the header's coins match storage within ${AGREE_MS}ms of COLLECT (this is what a first spin looks like)`,
  afterCollect.agreedMs !== null && afterCollect.agreedMs <= AGREE_MS,
  afterCollect.agreedMs !== null
    ? `agreed after ${afterCollect.agreedMs}ms over ${afterCollect.samples} samples, on ${afterCollect.last.storedCoins} coins`
    : `NEVER agreed in ${WATCH_MS}ms: header says ${afterCollect.last.saysCoins}, storage says ${afterCollect.last.storedCoins}`);

/* ============ 2. THE FIRST OPEN OF A NEW DAY ============
 *
 * TWO BOOTS, AND THE FIRST ONE IS SETUP RATHER THAN A MEASUREMENT. A single
 * fresh open cannot show this: the app's history backfill settles every past
 * day it can see, so awardDayCloseIfDue finds nothing left to pay and the
 * header is trivially right. Measured on origin/main while writing this file:
 * eleven day-close rows already in the ledger at 296ms, the screen agreeing
 * with the store on the first sample. That version of this row would have been
 * green through the whole life of the bug.
 *
 * So boot 1 is the install day, taken to settle. Boot 2 is the SAME save one
 * day on, which is the state the report describes: the one day the backfill
 * could not have closed is the day the player was last using the app, and
 * awardDayCloseIfDue pays it at boot, sixty lines after the screen was painted.
 * The clock moves one day, which is inside the day guard's DAY_GRACE, so the
 * app opens the day honestly rather than being forced through a refusal. */
await openDay(0);
for (let i = 0; i < 24 && !(await wheelUp()); i++) await sleep(1000);
await sleep(4000);                       // let the install day's backfill and its own repaint land
const installDay = await readHeader();

await page.goto(base + 'privacy.html', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('__dayOffset', '1'));   // NO wipe: the same save, one day on
await page.goto(base + '?demo', { waitUntil: 'networkidle2' });
const nextDay = await watchUntilAgree(s => [s.saysInto, s.storedInto]);

ok('BOOT CONTROL the new day really did settle the old one, so the comparison below has something to be wrong about',
  !!nextDay.last && nextDay.last.dayCloses > installDay.dayCloses && nextDay.last.storedXp > installDay.storedXp,
  `${installDay.dayCloses} -> ${nextDay.last && nextDay.last.dayCloses} day-close rows, ` +
  `${installDay.storedXp} -> ${nextDay.last && nextDay.last.storedXp} XP`);
ok(`BOOT the header's XP matches storage within ${AGREE_MS}ms of a new day's first open, before the player touches anything`,
  nextDay.agreedMs !== null && nextDay.agreedMs <= AGREE_MS,
  nextDay.agreedMs !== null
    ? `agreed after ${nextDay.agreedMs}ms over ${nextDay.samples} samples`
    : `NEVER agreed in ${WATCH_MS}ms: header says ${nextDay.last.saysInto} XP into the level, storage says ${nextDay.last.storedInto} (total ${nextDay.last.storedXp})`);

await browser.close();
console.log(fails.length
  ? `\n${fails.length} FAILED: ${fails.join(', ')}`
  : `\nthe header agreed with the store after both payouts (spin day +${spun.day}, ${afterCollect.last.storedCoins} coins)`);
process.exit(fails.length ? 1 : 0);
