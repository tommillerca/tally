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
 *   5. NOTHING ASKS FOR NOTIFICATION PERMISSION AT LAUNCH. Until
 *      2026-08-25 maybeRequestNotifPermission raised the OS dialog on
 *      the boot path, 3.5s in, before the player had asked for a single
 *      notification: it was the third of six interruptions Tom counted
 *      on a simulator launch. That function is gone and the ask moved to
 *      the two Settings buttons that turn notifications ON, which is
 *      where it earns its keep. Both directions are graded, and both are
 *      behavioural: Notification.requestPermission is spied on BEFORE
 *      the page loads, with navigator.webdriver MASKED so the app cannot
 *      self-suppress the way it does for every other audit here. Zero
 *      calls across a launch, and at least one the moment #notifAll is
 *      pressed, so "nobody asks" cannot be satisfied by an app that can
 *      no longer ask at all.
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
/* GRANT IT FOR REAL IF THE BROWSER WILL, AND ONLY STUB IF IT WILL NOT.
 *
 * WHAT WAS WRONG HERE, because this row was RED on clean main for days and the
 * app was innocent the whole time. The old stub did:
 *
 *     window.Notification = window.Notification || function () {};
 *     Notification.permission = 'granted';
 *
 * Chrome HAS a Notification constructor, so the `||` keeps the real one, and
 * `permission` is a read-only ACCESSOR on it, so the plain assignment silently
 * no-ops. Measured under HEADLESS_MODE=shell: permission stayed 'denied' before
 * and after the stub, notifyNow correctly returned false, and this row reported
 * it as an app failure. The app was right and the test was wrong.
 *
 * overridePermissions is the honest mechanism and it is tried FIRST, but it
 * does not work here either: measured on this machine it resolves without
 * error and leaves Notification.permission at 'denied'. So the accessor is
 * redefined, which is the only thing that takes, and only when the real grant
 * has not already worked.
 *
 * AND THE PRECONDITION IS NOW ASSERTED. That is the actual defect this row had:
 * it graded notifyNow's answer without ever checking that its own setup had
 * taken effect, so it could only ever say "the app is broken" when the truth
 * was "the stub did nothing". */
try { await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['notifications']); }
catch { /* not supported here; the in-page fallback below covers it */ }
const permPath = await page.evaluate(() => {
  const real = Notification.permission === 'granted';
  if (!real) Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
  Notification.requestPermission = async () => 'granted';
  /* If a SW registration exists, wrap its showNotification. If not, the web
     branch falls back to `new Notification(...)`, which is real here and does
     not throw once permission reads granted. */
  navigator.serviceWorker?.getRegistration?.().then(r => {
    if (r) { r.showNotification = async () => true; }
  });
  return { granted: Notification.permission === 'granted', via: real ? 'browser grant' : 'redefined accessor' };
});
await sleep(200);
check('CONTROL  the permission really reads granted before notifyNow is graded',
  permPath.granted === true,
  `Notification.permission = ${permPath.granted ? 'granted' : 'NOT granted'} via ${permPath.via}`);
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

/* ------ 5. nothing asks for notification permission at launch ------ */
/* MASKED, and it is the point of the row. Every launch-time gate in this app
   suppresses itself under navigator.webdriver, and puppeteer IS webdriver, so an
   unmasked page proves nothing about what a player's phone does. The spy is
   installed in the same evaluateOnNewDocument, ahead of every app script. */
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
  window.__permAsks = 0;
  const real = Notification.requestPermission.bind(Notification);
  Notification.requestPermission = (...a) => { window.__permAsks++; return real(...a); };
});
await page.reload({ waitUntil: 'networkidle2' });
await sleep(6000);   // well past the 3500ms the old boot asker used

const maskedOk = await page.evaluate(() => navigator.webdriver === false && typeof window.__permAsks === 'number');
check('BOOT-ASKER  CONTROL the spy is installed and navigator.webdriver reads false (an unmasked page grades nothing)',
  maskedOk, maskedOk ? 'masked, spy live' : 'the mask or the spy did not survive the reload');

const asksOnBoot = await page.evaluate(() => window.__permAsks);
check('BOOT-ASKER  a launch asks for notification permission ZERO times',
  asksOnBoot === 0, `Notification.requestPermission called ${asksOnBoot}x on boot`);

/* And the other direction: the ask must still happen where somebody said yes.
   A zero above is also what a build that CANNOT ask would report. */
await page.evaluate(() => { location.hash = '#/settings'; });
await sleep(2500);
await page.evaluate(() => document.querySelector('#notifAll')?.click());
await sleep(1200);
const asksAfterToggle = await page.evaluate(() => window.__permAsks);
check('BOOT-ASKER  and pressing "Everything" in Settings DOES ask, so the ask moved rather than died',
  asksAfterToggle > asksOnBoot, `${asksAfterToggle} ask(s) after the toggle, ${asksOnBoot} before`);

/* Static, and it is the row that catches a re-add before it ships: no source in
   js/ may call requestNotifPermission from a launch-time scheduler again. */
const appSrc = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'js/app.js'), 'utf8');
const reAdded = /async function maybeRequestNotifPermission/.test(appSrc);
check('BOOT-ASKER  maybeRequestNotifPermission has not come back',
  !reAdded, reAdded ? 'js/app.js declares maybeRequestNotifPermission again' : 'absent');

await browser.close();
srv.kill();
console.log(bad ? `\n${bad} FAILED` : '\nNOTIFICATIONS VERIFIED');
process.exit(bad ? 1 : 0);
