/* NOTIFICATION TIERS ARE DIFFERENT TIERS, and the difference is read.
 *
 * THE BUG THIS PINS. Settings -> NOTIFICATIONS offers two presets,
 * #notifAll ("Everything (power user)") and #notifEss ("Just essentials").
 * Up to and including v385 both handlers passed the SAME object literal to
 * applyNotifs: { enabled:true, reminder:true, streak:true, friends:true }.
 * Byte-equal. So "Just essentials" was "Everything" with a different toast,
 * and a player who picked the quieter tier got every push anyway. Neither
 * button wrote `siege`, the fifth kind in notify.js DEFAULTS, and notifPrefs()
 * merges stored-over-DEFAULTS, so siege read TRUE under both tiers.
 *
 * WHY A SEPARATE AUDIT FROM notif-audit.mjs. That one measures the mechanism
 * (does a click reach kv, does notifyNow fire, does the boot asker stay off
 * under webdriver). This one measures the MEANING: that the two tiers are
 * distinguishable, that the quiet one is a strict subset of the loud one, that
 * the shipped copy and the stored payload say the same thing, and that every
 * kind the tiers disagree about is consulted by real code before it notifies.
 * A preference nothing reads is the vacuous-check shape (CLAUDE.md rule 1).
 *
 * WHICH DIRECTION IS FAILURE (rule 11). Not "the payloads changed": Essentials
 * must be a SUBSET, bounded on both ends. At least one content kind ON under
 * All and OFF under Essentials (or the tiers collapse back into one), and at
 * most all-but-none, because `enabled` must stay true or "essentials" would
 * just be the Off switch wearing a label. Every comparison runs over the MERGED
 * prefs, which is what readers actually see, not the raw stored payload: the
 * original bug hid precisely in the gap between those two.
 *
 * EMPTY IS FAILURE (rule 3). The kind list is read from the app's own DEFAULTS
 * at runtime, and a zero-length kind list, a zero-length diff, or a diff kind
 * with no driver all fail rather than pass quietly.
 */
import { boot, sleep, serveTree } from './godmode.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(ROOT);
const srv = { kill: () => srvHandle && srvHandle.close() };
const base = argv || srvHandle.url;

const { browser, page } = await boot(base);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

/* Grant Notification permission so the preset handlers get past
   requestNotifPermission instead of early-returning with a toast. */
await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['notifications']);

await page.evaluate(() => { location.hash = '#/today'; });
await sleep(600);
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForSelector('#notifAll', { timeout: 10000 });
await page.waitForSelector('#notifEss', { timeout: 5000 });

/* Click a preset on a wiped kv and read back BOTH the stored payload and the
   merged view, because a key the button omits still reads as its DEFAULT. */
const pressPreset = async sel => {
  await page.evaluate(async () => {
    const { kvSet } = await import('./js/db.js');
    await kvSet('notifPrefs', null);
  });
  await page.evaluate(s => document.querySelector(s).click(), sel);
  await sleep(500);
  return page.evaluate(async () => {
    const { kvGet } = await import('./js/db.js');
    const { notifPrefs } = await import('./js/notify.js');
    return { stored: await kvGet('notifPrefs', null), merged: await notifPrefs() };
  });
};

/* The kind list comes from the app, not from me, so a sixth kind added to
   DEFAULTS is graded the day it lands instead of being silently skipped. */
const DEFAULTS = await page.evaluate(async () => {
  const { kvSet } = await import('./js/db.js');
  await kvSet('notifPrefs', null);
  return (await import('./js/notify.js')).notifPrefs();
});
const KINDS = Object.keys(DEFAULTS || {});
const CONTENT = KINDS.filter(k => k !== 'enabled');   // `enabled` is the master switch, not a kind
console.log('DEFAULTS:', JSON.stringify(DEFAULTS));
check('SETUP  notify.js DEFAULTS expose at least one content kind to differ on',
  CONTENT.length > 0, `content kinds = [${CONTENT.join(', ')}]`);

const all = await pressPreset('#notifAll');
const ess = await pressPreset('#notifEss');
console.log('#notifAll  stored:', JSON.stringify(all.stored), ' merged:', JSON.stringify(all.merged));
console.log('#notifEss  stored:', JSON.stringify(ess.stored), ' merged:', JSON.stringify(ess.merged));

/* ------ 1. the tiers are distinguishable at all ------ */
check('TIERS  #notifAll and #notifEss do NOT write byte-equal preferences',
  JSON.stringify(all.stored) !== JSON.stringify(ess.stored),
  `All=${JSON.stringify(all.stored)} Ess=${JSON.stringify(ess.stored)}`);
check('TIERS  the two tiers differ in the MERGED view a reader sees, not only in the raw payload',
  JSON.stringify(all.merged) !== JSON.stringify(ess.merged),
  `All=${JSON.stringify(all.merged)} Ess=${JSON.stringify(ess.merged)}`);

/* ------ 2. Essentials is a bounded strict subset of Everything ------ */
const louder = CONTENT.filter(k => ess.merged[k] && !all.merged[k]);   // on under Ess, off under All
const quieter = CONTENT.filter(k => all.merged[k] && !ess.merged[k]);  // the whole point
check('SUBSET  no kind is louder under Essentials than under Everything',
  louder.length === 0, `louder under Essentials: [${louder.join(', ')}]`);
check(`SUBSET  Essentials silences between 1 and ${CONTENT.length} of the ${CONTENT.length} content kinds`,
  quieter.length >= 1 && quieter.length <= CONTENT.length,
  `silenced: [${quieter.join(', ')}] (${quieter.length})`);
check('SUBSET  Essentials keeps `enabled` true: it is a quieter tier, not the Off switch',
  ess.merged.enabled === true, `enabled=${ess.merged.enabled}`);
check('SUBSET  Everything leaves every content kind on',
  CONTENT.every(k => all.merged[k] === true),
  CONTENT.map(k => `${k}=${all.merged[k]}`).join(' '));

/* ------ 3. the shipped copy is the contract, both ways ------ */
/* The toast #notifEss raises names the kinds the player is being promised. Read
   it out of the source and hold the payload to it, in BOTH directions: a kind
   the copy names must be on, and a kind it does not name must be off. Reword the
   copy without moving the payload (or the reverse) and this goes red naming the
   pair. The original bug fails the second half: the copy never mentioned sieges
   and siege merged to true anyway. */
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const essHandler = appSrc.slice(appSrc.indexOf("$('#notifEss'"), appSrc.indexOf("$('#notifTest'"));
const essCopy = (essHandler.match(/'(Essentials[^']*)'/) || [])[1] || '';
console.log('#notifEss toast copy:', JSON.stringify(essCopy));
const COPY_WORDS = { reminder: /reminder/i, streak: /streak/i, friends: /friend|crew/i, siege: /siege|spire/i };
check('COPY  the #notifEss handler still raises a toast that enumerates what the player gets',
  essCopy.length > 0, `copy="${essCopy}"`);
const unmapped = CONTENT.filter(k => !COPY_WORDS[k]);
check('COPY  every content kind has a phrase this audit knows how to look for in the copy',
  unmapped.length === 0, `no COPY_WORDS entry for: [${unmapped.join(', ')}] (add one, do not skip the kind)`);
const promisedOff = CONTENT.filter(k => COPY_WORDS[k] && COPY_WORDS[k].test(essCopy) && !ess.merged[k]);
const silentOn = CONTENT.filter(k => COPY_WORDS[k] && !COPY_WORDS[k].test(essCopy) && ess.merged[k]);
check('COPY  every kind the Essentials toast names is actually ON',
  promisedOff.length === 0, `promised but off: [${promisedOff.join(', ')}]`);
check('COPY  every kind the Essentials toast does NOT name is actually OFF',
  silentOn.length === 0, `unmentioned but on: [${silentOn.join(', ')}]`);

/* ------ 4. every kind the tiers disagree about is READ before notifying ------ */
/* Source half: a gate expression on the kind must exist somewhere that decides
   whether to send. Without this the tiers are two payloads nothing consults. */
const notifySrc = fs.readFileSync(path.join(ROOT, 'js/notify.js'), 'utf8');
const gated = k => new RegExp(`(?:if\\s*\\(|&&|\\|\\|)[^\\n]*\\b(?:p|prefs|np)\\.${k}\\b`).test(appSrc + notifySrc);
const ungated = quieter.filter(k => !gated(k));
check('READ  every kind Essentials silences is gated by a real conditional in app.js or notify.js',
  quieter.length > 0 && ungated.length === 0,
  quieter.length === 0 ? 'nothing silenced, so nothing was examined' : `ungated: [${ungated.join(', ')}]`);

/* Behavioural half, and the one that matters: stand up a fake Capacitor shell so
   notifPlatform() reports 'native', then drive the real scheduler under each
   tier's prefs and COUNT what it queues. A kind that reads as a subset in kv but
   schedules identically on the device has not actually been turned off.
   Every silenced kind needs a driver here; one without a driver FAILS by name
   rather than passing unexamined. */
/* Names only; the dispatch itself lives in the page below, so the drivers stay
   plain source rather than a string fed to new Function (the app ships a CSP). */
const DRIVERS = { siege: 'scheduleSiegeReminder', reminder: 'syncNotifications', streak: 'syncNotifications' };
const undriven = quieter.filter(k => !DRIVERS[k]);
check('DRIVE  every kind Essentials silences has a driver that schedules through the real code path',
  undriven.length === 0, `no driver for: [${undriven.join(', ')}] (write one, do not drop the kind)`);

for (const kind of quieter.filter(k => DRIVERS[k])) {
  const counts = await page.evaluate(async (prefsAll, prefsEss, k) => {
    const queued = [];
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        LocalNotifications: {
          requestPermissions: async () => ({ display: 'granted' }),
          checkPermissions: async () => ({ display: 'granted' }),
          getPending: async () => ({ notifications: [] }),
          cancel: async () => {},
          schedule: async o => { queued.push(...(o.notifications || [])); },
        },
      },
    };
    const m = await import('./js/notify.js');
    const { kvSet } = await import('./js/db.js');
    const run = async () => {
      if (k === 'siege') await m.scheduleSiegeReminder('Marrowjaw', 'The Ashen Fang', Date.now() + 40 * 3600000);
      else await m.syncNotifications();
    };
    await kvSet('notifPrefs', prefsAll);
    queued.length = 0;
    await run();
    const underAll = queued.length;
    await kvSet('notifPrefs', prefsEss);
    queued.length = 0;
    await run();
    const underEss = queued.length;
    const platform = m.notifPlatform();
    delete window.Capacitor;
    return { underAll, underEss, platform };
  }, all.merged, ess.merged, kind);
  console.log(`driver ${kind}:`, JSON.stringify(counts));
  check(`DRIVE  ${kind}: the fake shell really reports native, so the scheduler was exercised`,
    counts.platform === 'native', `notifPlatform()=${counts.platform}`);
  check(`DRIVE  ${kind}: Everything queues at least one push (an empty sample proves nothing)`,
    counts.underAll >= 1, `queued ${counts.underAll} under Everything`);
  check(`DRIVE  ${kind}: Essentials queues strictly fewer, down to 0`,
    counts.underEss < counts.underAll,
    `Everything queued ${counts.underAll}, Essentials queued ${counts.underEss}`);
}

await browser.close();
srv.kill();
console.log(bad ? `\n${bad} FAILED` : '\nNOTIFICATION TIERS VERIFIED');
process.exit(bad ? 1 : 0);
