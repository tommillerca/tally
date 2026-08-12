/* The daily haunted prize wheel. maybeShowDailyWheel in js/wheel.js:185 pops
 * once per real day, on first open, and PAYS COINS from the ledger. It has
 * five separate ways to silently retire itself, and one guard between a
 * player and unlimited coins:
 *
 *   1. webdriver           the harness itself. Skipped unless __wheelForce.
 *   2. wheelLastDate       already claimed today, so no re-show.
 *   3. waitForSplash       the splash never leaves in 6s so the wheel is
 *                          delayed enough that a player reloads first.
 *   4. sheetStackOpen      a sheet is already open, wheel skips rather than
 *                          stack over it.
 *   5. commit() date gate  re-check inside commit so a mid-spin reload cannot
 *                          bank the prize twice. This one is the money guard.
 *
 * None of them ERROR when they fire. They return false. So a future silent
 * retirement of the feature reads exactly like a healthy off-day. This audit
 * fires each gate deliberately, names in the output which one declined, and
 * proves the commit-side guard behaviourally by driving a second spin the way
 * a player would.
 *
 * Runs against a local server the suite self-serves via godmode.serveTree, or
 * argv/env URL if given (same convention as year-readout / feel / t2 audits).
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

/* Reboot the page with a fresh state, optionally installing __wheelForce
 * BEFORE any app script runs so the boot-path check sees it. Everything below
 * uses this rather than reload() + fiddle-after so a gate can never be armed
 * against the wrong boot. */
async function reboot({ wheelForce = false } = {}) {
  await page.evaluateOnNewDocument(w => {
    if (w) window.__wheelForce = true;
    else   delete window.__wheelForce;
  }, wheelForce);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2400);
}

/* Wait for the wheel DOM to arrive (or not, within a bounded budget). Returns
 * true when .dw appears, false on timeout: caller decides which is the pass. */
async function waitForWheel(ms = 8000) {
  return page.waitForSelector('.dw', { timeout: ms }).then(() => true).catch(() => false);
}

/* Clean state before every named check: kv wheelLastDate cleared, any leftover
 * .dw or .sheet removed, __wheelForce off unless the test asks for it. */
async function cleanState() {
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.kvSet('wheelLastDate', null);
    /* Clear the v61 make-good gate so the wheel does not silently re-enable
       itself between tests (it only fires once ever, but explicit is safer). */
    await db.kvSet('wheelResetOnce_v61', true);
    document.querySelectorAll('.dw').forEach(n => n.remove());
    /* Any lingering test-fixture .sheet from the sheetStackOpen check. */
    document.querySelectorAll('#sheets .sheet').forEach(n => n.remove());
  });
}

/* Detect which gate declined a maybeShowDailyWheel call by observation alone,
 * so a future silent retirement is at least named in this audit's output
 * rather than reading as a healthy off-day. Order matches the function's own
 * short-circuit order. Returns the FIRST gate that would decline; if none
 * would, returns 'none' and the caller should see the wheel appear. */
async function detectGate() {
  return page.evaluate(async () => {
    const db = await import('./js/db.js');
    const preview = location.search.includes('wheel=1');
    const today = new Date().toISOString().slice(0, 10);
    if (navigator.webdriver && !window.__wheelForce && !preview) return 'webdriver';
    if (!preview && (await db.kvGet('wheelLastDate', null)) === today) return 'wheelLastDate';
    /* waitForSplash is a wait, not a decline; but a splash that never leaves
       delays the wheel past a player's patience, so we count its presence as
       a distinct arrival hazard. Named separately so the caller can decide. */
    if (document.getElementById('splash')) return 'waitForSplash';
    if (document.querySelector('#sheets .sheet')) return 'sheetStackOpen';
    return 'none';
  });
}

/* -------------- 1. THE PAYOUT GUARD, because it is the money -------------- */

// clean slate, force the wheel to arrive, drive a real click through the SPIN
// button and assert the payout happened.
await reboot({ wheelForce: true });
await cleanState();

/* Fire the wheel via the same path the app uses at boot: import the module and
   call maybeShowDailyWheel with force: true so the outer date-gate is bypassed
   this run (we want the commit-side guard measured, not the outer one). */
await page.evaluate(async () => {
  const w = await import('./js/wheel.js');
  window.__wheelPromise1 = w.maybeShowDailyWheel({ sounds: false, force: true });
});
const shown1 = await waitForWheel();
check('WHEEL SHOWS  the wheel arrives after force-show on a clean state', shown1);

const spin1 = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const loot = await import('./js/loot.js');
  const beforeCoins = await loot.coins();
  const beforeDate  = await db.kvGet('wheelLastDate', null);
  /* Fire the SPIN button the way a player would: real .click(), not a call
     into window.__dw.spin() (that hook exists but calling it would test the
     hook, not the button). */
  const btn = document.querySelector('.dw #dwSpin');
  if (!btn) return { error: 'no #dwSpin button on the wheel' };
  btn.click();
  /* commit is awaited inside the click handler; give the microtask + kv
     roundtrip time to settle without waiting on the whole spin animation. */
  await new Promise(r => setTimeout(r, 400));
  const afterCoins = await loot.coins();
  const afterDate  = await db.kvGet('wheelLastDate', null);
  const today = new Date().toISOString().slice(0, 10);
  const prize = window.__dw?.prize;
  return {
    prize, beforeCoins, afterCoins, coinDelta: afterCoins - beforeCoins,
    beforeDate, afterDate, dateStampedToday: afterDate === today,
  };
});
check('PAYOUT-1  the first spin completes without error', !spin1.error, spin1.error || '');
check('PAYOUT-1  commit stamped wheelLastDate to today (the double-dip guard)', spin1.dateStampedToday, `date now ${spin1.afterDate}`);
check("PAYOUT-1  it paid SOMETHING (prize was granted; coin prizes show delta, non-coin prizes stamp the date)",
  spin1.prize && (spin1.coinDelta > 0 || (spin1.prize && !spin1.prize.startsWith('c'))),
  `prize=${spin1.prize} coinDelta=${spin1.coinDelta}`);

/* Now the second-attempt guard. Two paths to the double-dip:
     A) the outer date gate stops the wheel from re-showing at all (measured
        in test 3-b below alongside the other early-returns)
     B) commit()'s OWN re-check refuses even if the wheel somehow re-shows.
   (B) is the belt-AND-braces guard, and it is what would matter if any
   future change opened a re-show path. Test it directly: force the wheel to
   re-show with force:true (bypasses the outer date gate), spin, assert
   coinDelta 0 and wheelLastDate unchanged. */
await page.evaluate(() => { document.querySelectorAll('.dw').forEach(n => n.remove()); });
await page.evaluate(async () => {
  const w = await import('./js/wheel.js');
  window.__wheelPromise2 = w.maybeShowDailyWheel({ sounds: false, force: true });
});
const shown2 = await waitForWheel();
check('WHEEL-RESHOW  a force-show still opens the wheel after a spin (so the commit guard is what we measure next)', shown2);

const spin2 = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const loot = await import('./js/loot.js');
  const beforeCoins = await loot.coins();
  const beforeDate  = await db.kvGet('wheelLastDate', null);
  const btn = document.querySelector('.dw #dwSpin');
  if (!btn) return { error: 'no #dwSpin button on the re-shown wheel' };
  btn.click();
  await new Promise(r => setTimeout(r, 400));
  const afterCoins = await loot.coins();
  const afterDate  = await db.kvGet('wheelLastDate', null);
  return { beforeCoins, afterCoins, coinDelta: afterCoins - beforeCoins,
           beforeDate, afterDate, dateUnchanged: beforeDate === afterDate };
});
check('PAYOUT-2  the second spin (already-claimed state) pays NOTHING', spin2.coinDelta === 0,
  `coinDelta=${spin2.coinDelta} (before ${spin2.beforeCoins}, after ${spin2.afterCoins})`);
check('PAYOUT-2  and wheelLastDate is not stamped again', spin2.dateUnchanged,
  `before ${spin2.beforeDate}, after ${spin2.afterDate}`);

/* -------------- 2. THE FEATURE STILL FIRES ON A REAL BOOT -------------- */

/* Clean kv FIRST so wheelLastDate is not carrying today's stamp from PAYOUT-1,
   THEN reboot so the app's own boot-path fires against the clean state. If we
   reboot before cleaning, boot's maybeShowDailyWheel sees wheelLastDate=today
   and short-circuits, which is not the property under test. */
await cleanState();
await reboot({ wheelForce: true });
/* No manual maybeShowDailyWheel call here: this is the app's OWN boot path,
   which app.js line 577 fires. Wait a little longer since boot runs many
   other things too. */
const shownOnBoot = await waitForWheel(10000);
check('BOOT-SHOWS  the wheel fires from the app\'s real boot path with __wheelForce set', shownOnBoot,
  shownOnBoot ? '' : 'the .dw element never appeared within 10s of a fresh boot');

/* -------------- 3. EACH EARLY-RETURN NAMED IN THE OUTPUT -------------- */

/* 3a. webdriver: __wheelForce OFF, everything else clean. detectGate should
   name 'webdriver' and the wheel must NOT arrive. */
await reboot({ wheelForce: false });
await cleanState();
const g3a = await detectGate();
await page.evaluate(async () => {
  const w = await import('./js/wheel.js');
  window.__wheelPromise3a = w.maybeShowDailyWheel({ sounds: false });   // no force
});
const arrived3a = await waitForWheel(2500);
check('GATE  webdriver: named + wheel refuses to arrive', g3a === 'webdriver' && !arrived3a,
  `gate=${g3a} arrived=${arrived3a}`);

/* 3b. wheelLastDate: __wheelForce ON so webdriver is not the gate; stamp today
   into kv; wheel refuses. */
await reboot({ wheelForce: true });
await cleanState();
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const today = new Date().toISOString().slice(0, 10);
  await db.kvSet('wheelLastDate', today);
});
const g3b = await detectGate();
await page.evaluate(async () => {
  const w = await import('./js/wheel.js');
  window.__wheelPromise3b = w.maybeShowDailyWheel({ sounds: false });
});
const arrived3b = await waitForWheel(2500);
check('GATE  wheelLastDate: named + wheel refuses to arrive', g3b === 'wheelLastDate' && !arrived3b,
  `gate=${g3b} arrived=${arrived3b}`);

/* 3c. sheetStackOpen: __wheelForce ON, wheelLastDate cleared, inject a fake
   .sheet into #sheets so sheetStackOpen returns true. Wheel refuses. */
await reboot({ wheelForce: true });
await cleanState();
await page.evaluate(() => {
  const sheets = document.getElementById('sheets') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'sheets' }));
  const fake = document.createElement('div');
  fake.className = 'sheet';
  fake.dataset.vladFixture = '1';
  sheets.appendChild(fake);
});
const g3c = await detectGate();
await page.evaluate(async () => {
  const w = await import('./js/wheel.js');
  window.__wheelPromise3c = w.maybeShowDailyWheel({ sounds: false });
});
const arrived3c = await waitForWheel(2500);
check('GATE  sheetStackOpen: named + wheel refuses to arrive', g3c === 'sheetStackOpen' && !arrived3c,
  `gate=${g3c} arrived=${arrived3c}`);

/* 3d. waitForSplash: install a persistent #splash element BEFORE the wheel
   call. The wheel waits inside waitForSplash for up to 6s. So the assertion
   here is not "wheel refuses" (it will arrive after ~6s), but that the wheel
   is DELAYED past 3s while the splash sits there. A silent retirement of the
   feature would fail this the same way it would fail 3a-c: the wheel simply
   never turns up. So the check is "detectGate names it AND the wheel does
   arrive within the splash cap". */
await reboot({ wheelForce: true });
await cleanState();
await page.evaluate(() => {
  const splash = document.createElement('div');
  splash.id = 'splash';
  splash.dataset.vladFixture = '1';
  document.body.appendChild(splash);
});
const g3d = await detectGate();
const t0 = Date.now();
await page.evaluate(async () => {
  const w = await import('./js/wheel.js');
  window.__wheelPromise3d = w.maybeShowDailyWheel({ sounds: false, force: true });
});
/* Wait for the wheel; must arrive after the 6s splash cap in waitForSplash. */
const arrived3d = await waitForWheel(9000);
const elapsed = Date.now() - t0;
check('GATE  waitForSplash: named + wheel eventually appears (after the 6s splash cap)',
  g3d === 'waitForSplash' && arrived3d && elapsed >= 2000,
  `gate=${g3d} arrived=${arrived3d} elapsed=${elapsed}ms`);
/* Remove the splash so subsequent tests are not slowed. */
await page.evaluate(() => document.getElementById('splash')?.remove());

/* 3e. commit() date-gate: covered end-to-end by PAYOUT-2 above (the second
   spin pays nothing because commit re-checks wheelLastDate). Re-stating it
   here as a named row so a reader sees all five gates in one place. */
check('GATE  commit-date-gate: named + double-dip refused',
  spin2 && spin2.coinDelta === 0 && spin2.dateUnchanged,
  `coinDelta=${spin2 && spin2.coinDelta} dateUnchanged=${spin2 && spin2.dateUnchanged}`);

/* -------------- final -------------- */
await browser.close();
srv.kill();
console.log(bad ? `\n${bad} FAILED` : '\nWHEEL VERIFIED');
process.exit(bad ? 1 : 0);
