/* NOTIFICATIONS: what the tiers actually DO, not what they are labelled.
 *
 * Settings -> NOTIFICATIONS has three buttons (#notifAll, #notifEss,
 * #notifTest) and a boot-time asker (maybeRequestNotifPermission at
 * js/app.js:1573). The retention lever, and it fails silently in both
 * directions: a permission prompt that stops firing, or an "essentials"
 * tier that quietly means "none" (or, on this build, quietly means
 * "same as All"). A toggle that flips a boolean nothing reads is the
 * exact shape of the vacuous checks we have been finding all week.
 *
 * WHAT THIS AUDIT MEASURES, reading the APP STATE (kv 'notifPrefs')
 * rather than the toggle position:
 *   1. #notifAll writes { enabled:T, reminder:T, streak:T, friends:T }.
 *   2. #notifEss writes ... what? Assert it exactly, then compare to
 *      what #notifAll wrote. If the two are byte-equal, the tiers are
 *      identical and the labels lie. Report as a finding.
 *   3. `siege` (the fifth pref kind declared in notify.js DEFAULTS) is
 *      NOT written by either button. But because notifPrefs() merges
 *      stored over DEFAULTS, siege reads true regardless. That is a
 *      real property worth asserting: a stored payload that OMITS a
 *      key leaves the DEFAULT in play.
 *   4. #notifTest calls notifyNow, which is permission-gated. If we
 *      grant Notification permission, it should return true and the
 *      toast should say "Test notification sent." Otherwise it says
 *      "Could not send. Check permission."
 *   5. maybeRequestNotifPermission is skipped under navigator.webdriver
 *      (line 1575) so a headless run cannot exercise the ASK path
 *      directly. That skip itself is worth asserting: without it, every
 *      audit that opens the app would trigger a browser permission
 *      prompt that no test can dismiss. Verify by reading the guard's
 *      source and by seeding notifAsked to false + booting + confirming
 *      no permission prompt fired.
 */
import { boot, sleep, serveTree } from './godmode.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const srv = { kill: () => srvHandle && srvHandle.close() };
const base = argv || srvHandle.url;

const { browser, page } = await boot(base);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };
const finding = (kind, l, d = '') => console.log(`FINDING-${kind}  ${l}${d ? '\n  ' + d : ''}`);

/* Grant Notification permission to this origin so the button handlers'
 * requestNotifPermission returns 'granted' rather than early-returning
 * with the "Allow notifications when prompted" toast. */
const origin = new URL(base).origin;
await browser.defaultBrowserContext().overridePermissions(origin, ['notifications']);

/* Route to Settings and wait for the notif buttons to render. */
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(600);
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForSelector('#notifAll', { timeout: 10000 });
await page.waitForSelector('#notifEss', { timeout: 5000 });
await page.waitForSelector('#notifTest', { timeout: 5000 });

/* Read the DEFAULTS constant from notify.js so my assertions cannot drift
   from the module's own truth. */
const defaultsPref = await page.evaluate(async () => {
  const m = await import('./js/notify.js');
  /* notify.js does not export DEFAULTS, so read it by calling notifPrefs
     with kv cleared: the merge returns the pure defaults. */
  const { kvSet } = await import('./js/db.js');
  await kvSet('notifPrefs', null);
  return await m.notifPrefs();
});
console.log('DEFAULTS (read from notifPrefs on empty kv):', JSON.stringify(defaultsPref));
check('SETUP  DEFAULTS include siege = true (the fifth kind, not written by either button)',
  defaultsPref?.siege === true, `siege=${defaultsPref?.siege}`);

/* ------ 1. #notifAll writes prefs ------ */
await page.evaluate(async () => {
  const { kvSet } = await import('./js/db.js');
  await kvSet('notifPrefs', null);   // wipe so we see exactly what All writes
});
await page.evaluate(() => document.querySelector('#notifAll').click());
await sleep(500);
const afterAll = await page.evaluate(async () => {
  const { kvGet } = await import('./js/db.js');
  return await kvGet('notifPrefs', null);
});
console.log('after #notifAll (stored kv):', JSON.stringify(afterAll));
check('ALL  #notifAll writes enabled/reminder/streak/friends all true',
  afterAll?.enabled === true && afterAll?.reminder === true &&
  afterAll?.streak === true && afterAll?.friends === true,
  JSON.stringify(afterAll));

/* ------ 2. #notifEss writes prefs; compare against ALL ------ */
await page.evaluate(async () => {
  const { kvSet } = await import('./js/db.js');
  await kvSet('notifPrefs', null);
});
await page.evaluate(() => document.querySelector('#notifEss').click());
await sleep(500);
const afterEss = await page.evaluate(async () => {
  const { kvGet } = await import('./js/db.js');
  return await kvGet('notifPrefs', null);
});
console.log('after #notifEss (stored kv):', JSON.stringify(afterEss));
check('ESS  #notifEss writes enabled/reminder/streak/friends all true',
  afterEss?.enabled === true && afterEss?.reminder === true &&
  afterEss?.streak === true && afterEss?.friends === true,
  JSON.stringify(afterEss));

/* ------ FINDING A: All and Essentials write byte-equal payloads ------ */
const same = JSON.stringify(afterAll) === JSON.stringify(afterEss);
if (same) {
  finding('A (INFO)  #notifAll and #notifEss write byte-equal preferences',
    `Both buttons store ${JSON.stringify(afterAll)}. The button labels ("Everything (power user)" vs "Just essentials") advertise two tiers but the stored payload is IDENTICAL, so the two toggle the same set of kinds. Per notify.js the app has FIVE kinds in DEFAULTS: enabled, reminder, streak, friends, siege. Neither button writes siege, but notifPrefs() merges stored-over-DEFAULTS so siege reads true regardless. Result: All and Essentials are the same tier, with different toast copy. The button labels lie. Reg's file class (app.js:7540-7548); report only, do not fix. Possible fixes: (a) make Essentials write a strict subset (e.g. enabled + streak only, drop reminder + friends), (b) remove one button and rename the other, or (c) accept the labels as marketing.`);
}

/* ------ 3. Merged prefs include siege from DEFAULTS ------ */
/* Seed a payload that OMITS siege rather than clicking a button for it: both
   presets write siege explicitly now (that is what makes them different tiers,
   see notif-tier-audit.mjs), so the buttons can no longer demonstrate the merge.
   The property being pinned is unchanged: a stored payload missing a key leaves
   the DEFAULT in play, which is what carries an existing save across an upgrade
   that adds a new kind. */
const merged = await page.evaluate(async () => {
  const { kvSet } = await import('./js/db.js');
  await kvSet('notifPrefs', { enabled: true, reminder: true, streak: true, friends: true });
  return (await import('./js/notify.js')).notifPrefs();
});
console.log('merged prefs over a stored payload with no siege key:', JSON.stringify(merged));
check('MERGE  notifPrefs merges stored-over-DEFAULTS so an omitted siege reads true',
  merged?.siege === true,
  `merged.siege=${merged?.siege}`);

/* ------ 4. #notifTest fires notifyNow ------ */
/* Stub Notification.requestPermission to always return 'granted' so
   requestNotifPermission on 'web' returns true (headless permission
   override should already do this, but the stub is a belt to the
   overridePermissions braces). Also stub Notification constructor + the
   SW registration's showNotification so notifyNow's success path can
   complete without actually raising an OS notification. */
await page.evaluate(() => {
  window.Notification = window.Notification || function () {};
  Notification.permission = 'granted';
  Notification.requestPermission = async () => 'granted';
  /* If a SW registration exists, wrap its showNotification. If not, the
     web branch falls back to `new Notification(...)`, which the stubbed
     constructor above tolerates. */
  navigator.serviceWorker?.getRegistration?.().then(r => {
    if (r) { r.showNotification = async () => true; }
  });
});
await sleep(200);
const fired = await page.evaluate(async () => {
  const { notifyNow } = await import('./js/notify.js');
  return await notifyNow('Vlad audit', 'test body');
});
check('TEST  notifyNow returns true when permission is granted (web path)',
  fired === true, `notifyNow returned ${fired}`);

/* Also verify the button itself fires the toast on success.
 *
 * DO NOT read #toast once and hope. `toast()` is a QUEUE (app.js:2244): each
 * entry holds the screen for its own duration (2200ms default, 3200ms for
 * this button) before the next runs, and the app emits ambient toasts of its
 * own that sit AHEAD of the one we trigger. Measured on this build: the click
 * lands while "Tip: back up your log" is showing, a seed-pouch nudge is
 * already queued behind it, and "Test notification sent." does not reach the
 * screen until ~8000ms after the click. The previous 6000ms wait on the live
 * textContent expired mid-queue and read "" on a perfectly healthy app.
 *
 * So: record every distinct message into __toastLog with a MutationObserver
 * (a queued toast can come and go inside one poll interval), then wait on the
 * CONDITION, not on a duration. The copy asserted here is unique to this
 * button, so the log cannot match anything else, and if the message never
 * appears the loop still times out with an empty log and the check still
 * fails. Same trap as the redeem audit; same fix. */
await page.evaluate(() => {
  window.__toastLog = [];
  const el = document.getElementById('toast');
  if (!el) return;
  const push = () => {
    const t = (el.textContent || '').trim();
    if (t && window.__toastLog[window.__toastLog.length - 1] !== t) window.__toastLog.push(t);
  };
  new MutationObserver(push).observe(el, { childList: true, subtree: true, characterData: true });
});
await page.evaluate(() => document.querySelector('#notifTest').click());
const TOAST_RE = /test notification sent|background the app|could not send/i;
let testToast = '';
for (const t0 = Date.now(); Date.now() - t0 < 25000;) {
  testToast = await page.evaluate(re =>
    (window.__toastLog || []).find(t => new RegExp(re, 'i').test(t)) || '', TOAST_RE.source);
  if (testToast) break;
  await sleep(250);
}
console.log('toast log:', JSON.stringify(await page.evaluate(() => window.__toastLog || [])));
console.log('test toast:', testToast);
check('TEST  #notifTest button toasts success (not "Could not send")',
  /test notification sent|background the app/i.test(testToast) && !/could not send/i.test(testToast),
  `toast="${testToast}"`);

/* ------ 5. maybeRequestNotifPermission skips under navigator.webdriver ------ */
/* This is a source-level assertion: line 1575 has `if (navigator.webdriver) return;`.
   That guard is what stops every audit that opens the app from triggering
   a browser permission prompt no test could dismiss. Read the source
   directly and pin the exact shape; if a future edit widens the guard
   or drops the return, this check goes red naming the drift. */
const appSrc = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'js/app.js'), 'utf8');
const idx = appSrc.indexOf('async function maybeRequestNotifPermission');
const body = appSrc.slice(idx, appSrc.indexOf('\nasync function ', idx + 10));
const webdriverGuard = /if\s*\(\s*navigator\.webdriver\s*\)\s*return\s*;/.test(body);
check('BOOT-ASKER  maybeRequestNotifPermission has the `if (navigator.webdriver) return;` guard (protects tests from a system prompt)',
  webdriverGuard, webdriverGuard ? '' : 'the webdriver-skip guard is MISSING from maybeRequestNotifPermission');

/* And a behavioural check: seed notifAsked=false, reload, wait, then read
   the kv. The webdriver guard should mean notifAsked is NEVER set from
   this path (it is only set from within tick() inside the timer, and the
   whole function returns before setting the timer). So notifAsked stays
   false. */
await page.evaluate(async () => {
  const { kvSet } = await import('./js/db.js');
  await kvSet('notifAsked', false);
});
await page.reload({ waitUntil: 'networkidle2' });
await sleep(4500);   // > 3500ms so any deferred asker would have fired
const askedAfterBoot = await page.evaluate(async () => {
  const { kvGet } = await import('./js/db.js');
  return await kvGet('notifAsked', null);
});
check('BOOT-ASKER  under webdriver, notifAsked is not touched by maybeRequestNotifPermission (kv still false)',
  askedAfterBoot === false,
  `notifAsked after boot=${askedAfterBoot}`);

await browser.close();
srv.kill();
console.log(bad ? `\n${bad} FAILED` : '\nNOTIFICATIONS VERIFIED');
process.exit(bad ? 1 : 0);
