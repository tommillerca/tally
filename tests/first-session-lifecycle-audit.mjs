/* R37-1: THE INSTALL SESSION NEVER GOT A BOOT TAIL.
 *
 * boot() returns early at the `if (!S.settings)` branch for a fresh install
 * (straight into onboarding) and never reaches its own tail: onAppResume(...),
 * setInterval(rollDayIfNeeded, 60e3), touchServerDay, maybeWelcomeBack,
 * social.autoSync, refreshNotifSchedules and the rest. The session that just
 * finished onboarding is exactly the one that took a DIFFERENT path
 * (enterAppFromOnboarding), which used to rebind only the tab bar, hashchange
 * and analytics. So the whole of day one had no resume handling and no day
 * rollover: background then resume fired ZERO requests and ZERO day closes,
 * measured 3 of 3 runs (round 37 handoff, FIRSTDAY lane).
 *
 * The fix lifts that tail into bindAppLifecycle(), guarded by a module-level
 * flag so a second call from either path is a no-op, and calls it from BOTH
 * boot() and enterAppFromOnboarding().
 *
 * WHAT THIS PROVES, and how. Reaching the state by PLAYING it (godmode's own
 * rule) means actually finishing the real onboarding UI in a real page --
 * no reload, no seeded settings, no calling enterAppFromOnboarding directly,
 * because a test that calls the function under test cannot go red when the
 * REAL call site is deleted.
 *
 *   CLOCK    a fake Date replaces the real one before ANY app script runs
 *            (evaluateOnNewDocument), so js/app.js's module-level `_dayAnchor`
 *            and `S.date` (both `dateKey()` at parse time) are captured under
 *            a clock this file can move later, in the SAME page.
 *   ONBOARD  the real onboarding screens render and the real buttons (#onbGo,
 *            #onbMe, #onbSkip) are clicked, landing on #/today with the tab
 *            bar live, all in one page, no navigation.
 *   TAIL-1   the fake clock is walked across local midnight (still no
 *            reload), then a REAL visibilitychange resume is fired the same
 *            way multitab-audit.mjs does it -- backgrounding this page behind
 *            a second real tab and bringing it back -- and kv 'lastOpenDay'
 *            is asserted to have advanced to the new day. Two different
 *            functions write that key and both are reachable ONLY from
 *            bindAppLifecycle's onAppResume: rollDayIfNeeded (the day close)
 *            and maybeWelcomeBack (the return card's own bookkeeping). Either
 *            one moving it is proof the tail ran; neither moving it, on a
 *            genuinely later day, is proof it did not.
 *
 *   TAIL-2   the page is then reloaded as a returning player, walked across
 *            another midnight, and genuinely resumed. This is the boot()
 *            call-site half that the original audit never exercised.
 *
 * PROVE-RED: delete the `bindAppLifecycle();` line in enterAppFromOnboarding
 * (js/app.js) and re-run. TAIL-1 fails because lastOpenDay never leaves null,
 * and TODAY still passes (onboarding itself is unaffected), which is the
 * point: this is the row that would have caught R37-1 and nothing else pretty
 * lies about being fine because the day never advanced.
 *
 * Usage: node tests/first-session-lifecycle-audit.mjs [baseUrl]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveTree, loadPuppeteer, chromePath, sandboxArgs, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srv.url;

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({
  /* PINNED 'new', NOT HEADLESS_MODE: same reason as tests/multitab-audit.mjs.
     TAIL needs a real backgrounded-then-foregrounded tab to raise a genuine
     visibilitychange; under 'shell' a page never truly backgrounds (measured:
     document.hidden stays false and the listener never fires across a real
     bringToFront swap), which would report a false red on a healthy app. This
     suite takes no screenshots, so 'shell''s one advantage (this Mac cannot
     screenshot under 'new') buys nothing here. */
  headless: 'new',
  defaultViewport: { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  executablePath: chromePath(),
  args: [...sandboxArgs()],
});

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  /* THE WHOLE Date, pinned before the first byte of app script runs (same
     technique as tests/lapse-witness-audit.mjs, ported to the browser via
     evaluateOnNewDocument instead of a node-side globalThis.Date swap).
     dateKey() (js/nutrition.js) reads local getFullYear/getMonth/getDate off
     `new Date()`, so only Date.now() would leave it untouched. */
  await page.evaluateOnNewDocument(() => {
    const RealDate = Date;
    let persisted = 0;
    try { persisted = Number(localStorage.getItem('__lifecycleAuditNow')) || 0; } catch {}
    window.__NOW = persisted || RealDate.now();
    class FakeDate extends RealDate {
      constructor(...a) { super(...(a.length ? a : [window.__NOW])); }
      static now() { return window.__NOW; }
    }
    window.Date = FakeDate;
  });

  // fresh install: no ?demo (that seeds settings via seedDemo and skips
  // onboarding entirely), no seeded kv. IndexedDB is empty in a new profile.
  await page.goto(base.replace(/\/?$/, '/'), { waitUntil: 'networkidle2' });
  await sleep(900);

  const clockOk = await page.evaluate(() => Date.now() === window.__NOW);
  ok('CLOCK the fake Date replaced the real one before any app script ran', clockOk);

  /* ---- ONBOARD: the real screens, the real buttons, one page, no reload --- */
  const step0 = await page.evaluate(() => !!document.querySelector('#onbGo'));
  ok('ONBOARD step 0 renders for a fresh install (no settings)', step0);
  if (step0) { await page.click('#onbGo'); await sleep(500); }

  const step1 = await page.evaluate(() => !!document.querySelector('#onbMe'));
  ok('ONBOARD step 1 (the reveal) renders', step1);
  if (step1) { await page.click('#onbMe'); await sleep(500); }

  const step2 = await page.evaluate(() => !!document.querySelector('#onbSkip'));
  ok('ONBOARD step 2 (the plan) renders', step2);
  if (step2) { await page.click('#onbSkip'); await sleep(1600); }

  const landed = await page.evaluate(() => ({
    hash: location.hash,
    tabbarLive: !!document.querySelector('#tabbar') && getComputedStyle(document.querySelector('#tabbar')).display !== 'none',
  }));
  ok('ONBOARD finishes into Today in the SAME page (no reload), tab bar live',
    landed.hash === '#/today' && landed.tabbarLive, JSON.stringify(landed));

  /* ---- BEFORE: capture the day + lastOpenDay under the still-unmoved clock */
  const before = await page.evaluate(async () => {
    const { dateKey } = await import('/js/nutrition.js?q=1');
    const { kvGet } = await import('/js/db.js?q=1');
    return { day: dateKey(new Date(window.__NOW)), lastOpenDay: await kvGet('lastOpenDay', null) };
  });

  /* ---- walk the clock across local midnight, no reload, no re-navigation - */
  const after0 = await page.evaluate(async () => {
    const { dateKey, msToNextMidnight } = await import('/js/nutrition.js?q=1');
    window.__NOW += msToNextMidnight(window.__NOW) + 5000; // 5s past local midnight
    return dateKey(new Date(window.__NOW));
  });
  ok('CLOCK-2 the fake clock now reads the next local day', after0 !== before.day, `${before.day} -> ${after0}`);

  /* ---- a REAL visibilitychange resume: background this tab behind a real
     second tab, then bring it back. Same technique as multitab-audit.mjs's
     RESUME-SETUP row, chosen over faking document.hidden because Chrome fires
     the genuine event for a real tab swap and nothing here has to trust a
     dispatched fake one. */
  const blank = await browser.newPage();
  await blank.bringToFront();
  await sleep(300);
  await page.bringToFront();
  await sleep(1800); // onAppResume's own 500ms de-dupe window, plus the async chain inside it

  const afterResume = await page.evaluate(async () => {
    const { kvGet } = await import('/js/db.js?q=1');
    return { lastOpenDay: await kvGet('lastOpenDay', null) };
  });
  await blank.close();

  ok("TAIL-1 onboarding-session resume rolls the day forward (only enterAppFromOnboarding's bindAppLifecycle call can install it)",
    afterResume.lastOpenDay === after0,
    `before ${JSON.stringify(before.lastOpenDay)}, want ${JSON.stringify(after0)}, got ${JSON.stringify(afterResume.lastOpenDay)}`);

  /* A real second session. Persist only the fake clock across navigation, then
     reload the installed save so boot(), rather than onboarding, owns the
     lifecycle binding. */
  await page.evaluate(() => localStorage.setItem('__lifecycleAuditNow', String(window.__NOW)));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(900);
  const returning = await page.evaluate(() => ({ hash: location.hash, onboarding: !!document.querySelector('#onbGo') }));
  ok('SECOND returning-player reload enters the app without onboarding', !returning.onboarding, JSON.stringify(returning));

  const secondDay = await page.evaluate(async () => {
    const { dateKey, msToNextMidnight } = await import('/js/nutrition.js?q=2');
    window.__NOW += msToNextMidnight(window.__NOW) + 5000;
    localStorage.setItem('__lifecycleAuditNow', String(window.__NOW));
    return dateKey(new Date(window.__NOW));
  });
  const blank2 = await browser.newPage();
  await blank2.bringToFront();
  await sleep(300);
  await page.bringToFront();
  await sleep(1800);
  const secondResume = await page.evaluate(async () => {
    const { kvGet } = await import('/js/db.js?q=2');
    return await kvGet('lastOpenDay', null);
  });
  await blank2.close();
  ok("TAIL-2 returning-session resume rolls the next day forward (only boot's bindAppLifecycle call can install it)",
    secondResume === secondDay, `want ${JSON.stringify(secondDay)}, got ${JSON.stringify(secondResume)}`);

  ok('NOERR no page error across onboarding + the tail', errors.length === 0, errors.join(' | ').slice(0, 300));
} finally {
  await browser.close();
  if (srv) srv.close();
}

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(failed ? 'FIRST SESSION LIFECYCLE AUDIT FAILED' : 'FIRST SESSION LIFECYCLE VERIFIED');
process.exit(failed ? 1 : 0);
