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
 * at runtime, and a zero-length kind list, a zero-length diff, a diff kind with
 * no driver, and a call-site scan that finds nothing all fail rather than pass
 * quietly.
 *
 * WHAT THE FIRST VERSION OF THIS FILE GOT WRONG, v386. It graded the STORED
 * preference and called that the contract. `siege` has two paths, a discovery
 * push and a T-12h reminder, and only the reminder was ever gated or driven, so
 * DRIVE passed on the half that worked while the COPY check certified, against
 * kv, a promise the app did not keep: notifyNow read no preference at all, so
 * the discovery push was delivered under "Just essentials" AND with
 * notifications fully OFF (measured: 1 push queued on the device in both). Every
 * COPY claim here is now decided by a push count off a stubbed device queue,
 * DRIVERS covers both siege paths, there is an OFF section, and every notifyNow
 * call site in js/ must name the kind it belongs to so the next caller cannot
 * quietly skip the gate.
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

/* ------ 3. drive every kind down every path, under all three states ------ */
/* Everything from here on is decided by a push COUNT taken off a stubbed device
   queue, not by reading the stored object back. That is the correction this file
   needed: the COPY checks below used to be asserted against ess.merged, so they
   certified a promise the app did not keep. `siege` merged to false under
   Essentials and the check went green, while the DISCOVERY push at
   js/app.js:14397 called notifyNow with no gate at all and the device queued it
   anyway. Measured before the fix: Essentials queued 1, and so did fully Off.

   Two paths per siege, and only one of them was ever driven here. DRIVERS now
   names both:
     'immediate'             notifyNow(title, body, kind), the path the siege
                             DISCOVERY push takes, and the path every gift,
                             cheer, friend request and stall notice takes.
     'scheduleSiegeReminder' the T-12h half.
     'syncNotifications'     the recurring evening reminder + streak saver.
   A silenced kind with no driver FAILS by name rather than passing unexamined,
   and every content kind must have the 'immediate' driver because that is the
   one the COPY contract leans on. */
const DRIVERS = {
  siege: ['immediate', 'scheduleSiegeReminder'],
  reminder: ['immediate', 'syncNotifications'],
  streak: ['immediate', 'syncNotifications'],
  friends: ['immediate'],
};
const undriven = CONTENT.filter(k => !(DRIVERS[k] || []).includes('immediate'));
check('DRIVE  every content kind has the immediate-push driver the copy contract is graded on',
  CONTENT.length > 0 && undriven.length === 0,
  `no immediate driver for: [${undriven.join(', ')}] (write one, do not drop the kind)`);

/* Fully off. Built from the app's own key list so a sixth kind is covered the
   day it lands. 'any' is the kindless push (the HealthKit stall notice at
   js/app.js:2555, the Settings test button): nothing but the master switch can
   silence it, so it is the sharpest probe of what Off means. */
const OFF = Object.fromEntries(KINDS.map(k => [k, false]));
const PROBED = [...CONTENT, 'any'];
const counts = await page.evaluate(async (pAll, pEss, pOff, plan) => {
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
  const run = async (kind, driver) => {
    if (driver === 'scheduleSiegeReminder') await m.scheduleSiegeReminder('Marrowjaw', 'The Ashen Fang', Date.now() + 40 * 3600000);
    else if (driver === 'syncNotifications') await m.syncNotifications();
    else await m.notifyNow('Your spire is under siege', 'Marrowjaw is at The Ashen Fang. 40h to walk out and break it.', kind);
  };
  const out = {};
  for (const [kind, drivers] of plan) {
    out[kind] = {};
    for (const driver of drivers) {
      const n = {};
      for (const [tier, prefs] of [['all', pAll], ['ess', pEss], ['off', pOff]]) {
        await kvSet('notifPrefs', prefs);
        queued.length = 0;
        await run(kind, driver);
        n[tier] = queued.length;
      }
      out[kind][driver] = n;
    }
  }
  const platform = m.notifPlatform();
  delete window.Capacitor;
  return { platform, out };
}, all.merged, ess.merged, OFF, PROBED.map(k => [k, k === 'any' ? ['immediate'] : DRIVERS[k]]));
console.log('device queue counts:', JSON.stringify(counts.out));
check('DRIVE  the fake shell really reports native, so the device scheduler was exercised',
  counts.platform === 'native', `notifPlatform()=${counts.platform}`);
check('DRIVE  every kind was actually driven (an empty sample set is a failure, not a pass)',
  PROBED.length > 1 && PROBED.every(k => counts.out[k] && Object.keys(counts.out[k]).length > 0),
  `probed: [${PROBED.join(', ')}]`);
const deadSample = PROBED.filter(k => counts.out[k].immediate.all !== 1);
check('DRIVE  under Everything each kind queues exactly one immediate push, so a 0 elsewhere means something',
  deadSample.length === 0,
  deadSample.map(k => `${k}=${counts.out[k].immediate.all}`).join(' ') || 'all 1');

/* ------ 4. the shipped copy is the contract, and BEHAVIOUR is what backs it ------ */
/* The toast #notifEss raises names the kinds the player is being promised. Read
   it out of the source and hold the app to it in BOTH directions, against the
   device queue: a kind the copy names must still be DELIVERED under Essentials,
   and a kind it does not name must queue ZERO. Reword the copy without moving
   the behaviour (or the reverse) and this goes red naming the pair.

   DIRECTION: failure is a push arriving that the copy did not promise, or a
   promised push going missing. BOUND: exactly 1 under Everything, exactly 0
   under Essentials for an unnamed kind. Not "fewer", zero: an immediate push is
   one push, so "quieter" and "silent" are the same number here. */
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
const named = k => COPY_WORDS[k] && COPY_WORDS[k].test(essCopy);
const promisedOff = CONTENT.filter(k => named(k) && counts.out[k].immediate.ess !== 1);
const silentOn = CONTENT.filter(k => COPY_WORDS[k] && !named(k) && counts.out[k].immediate.ess !== 0);
check('COPY  every kind the Essentials toast names is actually DELIVERED under Essentials',
  promisedOff.length === 0,
  `promised but not delivered: [${promisedOff.map(k => `${k} queued ${counts.out[k].immediate.ess}`).join(', ')}]`);
check('COPY  every kind the Essentials toast does NOT name queues ZERO pushes under Essentials',
  silentOn.length === 0,
  `unmentioned but still delivered: [${silentOn.map(k => `${k} queued ${counts.out[k].immediate.ess}`).join(', ')}]`);

/* The gap the original bug lived in: kv said one thing, the device did another.
   Pin them together directly. */
const disagree = CONTENT.filter(k => (ess.merged[k] === true) !== (counts.out[k].immediate.ess > 0));
check('COPY  the stored Essentials preference and the device queue agree, kind by kind',
  disagree.length === 0,
  disagree.map(k => `${k}: pref=${ess.merged[k]} queued=${counts.out[k].immediate.ess}`).join(' '));

/* ------ 5. OFF means nothing, with no exemptions ------ */
/* The Settings copy for the master switch is literally "Off: nothing gets pushed
   to you" (renderSettings). Hold every kind AND the kindless push to that, down
   every driver. Before the fix, a player who had turned notifications off still
   received the siege discovery push and the stalled-steps notice. */
const leaks = [];
for (const k of PROBED) for (const [d, n] of Object.entries(counts.out[k])) if (n.off !== 0) leaks.push(`${k}/${d}=${n.off}`);
check('OFF  with notifications fully off nothing at all is queued, no kind exempt',
  leaks.length === 0 && PROBED.length > 1, `still delivered with enabled=false: [${leaks.join(', ')}]`);

/* ------ 6. every kind the tiers disagree about is READ before notifying ------ */
/* Source half: the kind must be consulted somewhere that decides whether to
   send. Two shapes count, because there are now two: a conditional naming the
   kind (scheduleSiegeReminder's `!prefs.siege`), or a notifyNow call site that
   names the kind, which wires it to the generic gate at the top of notifyNow.
   Without one of these the tiers are two payloads nothing consults. */
const notifySrc = fs.readFileSync(path.join(ROOT, 'js/notify.js'), 'utf8');

/* Every notifyNow call in the shipped js/ must name its kind. This is what
   closes the class rather than the two call sites that were wrong: add an
   ungated notifyNow tomorrow and this goes red on the file and line. */
const KNOWN = new Set([...CONTENT, 'any']);
const callSites = [];
for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js') && n !== 'notify.js')) {
  fs.readFileSync(path.join(ROOT, 'js', f), 'utf8').split('\n').forEach((line, i) => {
    for (const frag of line.split('notifyNow(').slice(1)) {
      const m = frag.match(/,\s*'([A-Za-z]+)'\s*\)/);
      callSites.push({ at: `js/${f}:${i + 1}`, kind: m ? m[1] : null });
    }
  });
}
console.log('notifyNow call sites:', JSON.stringify(callSites));
check('GATE  the scan found the notifyNow call sites at all (an empty scan is a failure)',
  callSites.length > 0, `${callSites.length} found`);
const kindless = callSites.filter(c => !c.kind || !KNOWN.has(c.kind));
check('GATE  every notifyNow call site names a kind notify.js knows, so none can slip the gate',
  kindless.length === 0,
  kindless.map(c => `${c.at} kind=${c.kind === null ? 'MISSING' : c.kind}`).join(' | '));
const siegeSite = callSites.find(c => c.kind === 'siege');
check('GATE  the siege DISCOVERY push names kind `siege` (the half that was ungated)',
  !!siegeSite, siegeSite ? siegeSite.at : 'no notifyNow call site passes kind `siege`');

const named2 = new Set(callSites.map(c => c.kind));
const gated = k => new RegExp(`(?:if\\s*\\(|&&|\\|\\|)[^\\n]*\\b(?:p|prefs|np)\\.${k}\\b`).test(appSrc + notifySrc) || named2.has(k);
const ungated = quieter.filter(k => !gated(k));
check('READ  every kind Essentials silences is consulted by real code before it notifies',
  quieter.length > 0 && ungated.length === 0,
  quieter.length === 0 ? 'nothing silenced, so nothing was examined' : `ungated: [${ungated.join(', ')}]`);

/* Behavioural half, down every driver a silenced kind has: a kind that reads as
   a subset in kv but schedules identically on the device has not been turned
   off. DIRECTION: failure is Essentials queueing as much as Everything. BOUND:
   Everything at least 1 (an empty sample proves nothing), Essentials strictly
   fewer, and exactly 0 on the immediate path. */
for (const kind of quieter) {
  for (const [driver, n] of Object.entries(counts.out[kind])) {
    check(`DRIVE  ${kind}/${driver}: Everything queues at least one push (an empty sample proves nothing)`,
      n.all >= 1, `queued ${n.all} under Everything`);
    check(`DRIVE  ${kind}/${driver}: Essentials queues strictly fewer, down to 0`,
      n.ess < n.all, `Everything queued ${n.all}, Essentials queued ${n.ess}`);
  }
  check(`DRIVE  ${kind}/immediate: Essentials queues exactly ZERO, not merely fewer`,
    counts.out[kind].immediate.ess === 0, `queued ${counts.out[kind].immediate.ess} under Essentials`);
}

await browser.close();
srv.kill();
console.log(bad ? `\n${bad} FAILED` : '\nNOTIFICATION TIERS VERIFIED');
process.exit(bad ? 1 : 0);
