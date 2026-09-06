/* RETIRED (v251). Rare-spawn pushes were scheduled from `lastLoc` — wherever you
 * happened to be when the app was last open — for spawn windows up to 8 ahead.
 * By the time one fired you were usually somewhere else entirely, so it promised
 * a rare "near you" that was near where you USED to be. Tom: "I feel like it
 * doesn't actually correlate with something good nearby on the map".
 *
 * This now only CANCELS. That matters: players have rare pushes already queued on
 * their phones, and simply deleting the scheduler would leave those firing for
 * days. Kept under the old name so every existing call site keeps cancelling.
 * The in-app cue when you are genuinely within RARE_CUE_M still fires, because
 * that one is measured against where you are standing right now. */
export async function scheduleRares() {
  const L = ln(); if (!L) return;
  try {
    const pend = await L.getPending();
    const mine = (pend.notifications || []).filter(n => n.id >= ID.rareLo && n.id <= ID.rareHi).map(n => ({ id: n.id }));
    if (mine.length) await L.cancel({ notifications: mine });
  } catch { /* ignore */ }
}
// Notifications. One preference model, two backends: Capacitor LocalNotifications
// on the native app (real scheduled + background notifications) and the Web
// Notifications API in a browser/PWA (immediate only; no background scheduling).
// Everything is opt-in and fails silent — a player can have ALL of it (rares
// pushed as they surface) or NONE. Nothing fires until the player turns it on
// and grants permission.

import { db, kvGet, kvSet } from './db.js';
import { isNative } from './native.js';
import { dateKey, streakFrom } from './nutrition.js';
import { streakDateSet } from './game.js';

// New users have notifications ON by default (Tom's call). enabled=true only
// takes effect once the OS grants permission, asked from an explicit Settings
// control (never at boot, see notifGateOk below); until then nothing fires,
// nothing schedules. Existing users who deliberately turned it off saved
// {enabled:false} and keep that.
// `siege` is the ONE notification type Dark Spires adds. The project has a hard
// reduced-frequency rule, so it fires at most twice per siege (once on discovery,
// once at T-12h) and a siege can only happen once a week. BOTH halves read this
// pref: the discovery push through the `kind` argument to notifyNow, the T-12h
// one in scheduleSiegeReminder. It used to be only the second half.
const DEFAULTS = { enabled: true, reminder: true, streak: true, friends: true, siege: true };
export async function notifPrefs() { return { ...DEFAULTS, ...((await kvGet('notifPrefs', {})) || {}) }; }
export async function setNotifPrefs(p) { await kvSet('notifPrefs', p); }

// immLo..immHi is a small pool for every IMMEDIATE push (friend request, gift,
// cheer, siege discovery, HealthKit stall, the Settings test button). They
// used to all schedule as one shared id (9), so two firing within the same
// ~500ms window (a real gift-then-cheer sequence) had the second overwrite
// the first before it ever displayed (R37-12). Round-robin through the pool
// instead so back-to-back pushes get distinct ids.
const ID = { reminder: 1, streak: 2, siege: 3, immLo: 9, immHi: 14, rareLo: 1000, rareHi: 1899 };
export const IMM_IDS = []; for (let i = ID.immLo; i <= ID.immHi; i++) IMM_IDS.push(i);
let immCursor = 0;
export function nextImmId() { const id = IMM_IDS[immCursor % IMM_IDS.length]; immCursor++; return id; }

// PURE, exported for the node unit test: given the recent send timestamps and
// "now", decide whether one more immediate push is allowed, and return the
// pruned list to keep as state. This is a safety net against a genuine
// runaway (a bug looping notifyNow), not a throttle on ordinary play: a
// player who was away can legitimately have a friend request, a gift, a
// cheer, a siege discovery and a stall notice all fire within the same boot.
// ponytail: in-memory, per-session, fixed ceiling; raise it if a real burst
// (a mass gift event, say) ever needs more headroom than this.
export const IMM_WINDOW_MS = 10000;
export const IMM_MAX = 20;
export function immRateCheck(recentTimestamps, now) {
  const kept = recentTimestamps.filter(t => now - t < IMM_WINDOW_MS);
  const ok = kept.length < IMM_MAX;
  if (ok) kept.push(now);
  return { ok, kept };
}
let immSentAt = [];
function immRateOk() { const { ok, kept } = immRateCheck(immSentAt, Date.now()); immSentAt = kept; return ok; }

// PURE, exported for the node unit test: the permission x prefs decision every
// scheduling path below makes before it ever touches the OS. `extraKey` is one
// additional preference to gate on ('siege' for the siege reminder); omit it
// for "master switch + permission only" (the recurring reminder/streak decide
// their OWN inclusion, per-key, when building the notis list in
// syncNotifications). Reused by notifyNow, syncNotifications and
// scheduleSiegeReminder so the three cannot drift from each other or from this
// test: DEFAULTS.enabled defaults true (R37-4), so without the permState check
// here a fresh install schedules the 19:00 reminder before ever asking.
export function notifGateOk(prefs, permState, extraKey = null) {
  if (!prefs || !prefs.enabled) return false;
  if (extraKey && prefs[extraKey] === false) return false;
  return permState === 'granted';
}

// PURE, exported for the node unit test: no push lands 22:00-08:00 local; a
// time in that window moves to the next 08:00 (R37-10). Takes/returns a plain
// timestamp so it has no Capacitor/DOM dependency.
export function clampQuietHours(ts) {
  const d = new Date(ts);
  const h = d.getHours();
  if (h >= 22 || h < 8) {
    if (h >= 22) d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
  }
  return d.getTime();
}

function ln() { try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null; } catch { return null; } }

// 'native' = full scheduling; 'web' = immediate only; 'none' = unsupported.
export function notifPlatform() {
  if (isNative() && ln()) return 'native';
  if (typeof Notification !== 'undefined') return 'web';
  return 'none';
}

export async function requestNotifPermission() {
  const p = notifPlatform();
  try {
    if (p === 'native') { const r = await ln().requestPermissions(); return r.display === 'granted'; }
    if (p === 'web') { return (await Notification.requestPermission()) === 'granted'; }
  } catch { /* ignore */ }
  return false;
}
export async function notifPermissionState() {
  const p = notifPlatform();
  try {
    if (p === 'native') { const r = await ln().checkPermissions(); return r.display; } // granted|denied|prompt
    if (p === 'web') return Notification.permission; // granted|denied|default
  } catch { /* ignore */ }
  return 'unsupported';
}

/* Fire a notification right now: the Settings test button, and every push the
   app raises the moment it learns something (a siege discovered, a gift, a
   stalled step feed). Returns whether it dispatched.

   `kind` is the preference this push belongs to, and every call site passes one.
   Until v386 this function read NO preference at all, not even `enabled`. So the
   siege DISCOVERY push (checkSieges) was delivered to a player who had picked
   "Just essentials", and to a player who had turned notifications fully OFF:
   measured at 1 push queued on the device under both. Only the T-12h half was
   gated, in scheduleSiegeReminder below, so the tier was honoured in kv and
   nowhere else.

   The gate lives HERE rather than at each call site on purpose. A call-site gate
   fixes the two callers that are wrong today and leaves the class open, because
   the next caller is gated only by whoever remembers. Gating here means a caller
   added tomorrow is gated by default.
     'any'                -> no per-kind pref of its own; the master switch alone
                             governs it (the HealthKit stall notice, the test
                             button).
     a key from DEFAULTS  -> the master switch AND that key.
   An unknown kind falls through to master-switch-only rather than vanishing
   silently; tests/notif-tier-audit.mjs fails a call site that names one.

   There is NO exemption. Off means nothing is pushed, which is what the Settings
   copy already promises the player ("Off: nothing gets pushed to you"). The test
   button is not an exception: renderSettings only renders it inside the
   `${np.enabled ? ...}` block, so it is unreachable while Off and gating it
   costs nothing. */
export async function notifyNow(title, body, kind = 'any') {
  const prefs = await notifPrefs();
  const p = notifPlatform();
  try {
    if (p === 'native') {
      /* R37-3: this branch used to hardcode `return true` with no permission
         check at all, so a player who denied notifications got told "Sent"
         (the Settings test button, verbatim) while the OS silently dropped it.
         checkPermissions() is the same call requestNotifPermission() makes;
         reading it here means the truth and the toast can never disagree. */
      const perm = await ln().checkPermissions();
      if (!notifGateOk(prefs, perm.display, kind === 'any' ? null : kind)) return false;
      if (!immRateOk()) return false;
      await ln().schedule({ notifications: [{ id: nextImmId(), title, body, schedule: { at: new Date(Date.now() + 500) } }] });
      return true;
    }
    if (p === 'web' && notifGateOk(prefs, Notification.permission, kind === 'any' ? null : kind)) {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) await reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
      else new Notification(title, { body });
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

/* A siege has a deadline, so it gets the one reminder this project allows: a
   nudge 12h before the window shuts. Native only (the web has no background
   scheduling), cancelled and re-set each time so it can never stack, and cleared
   outright when the siege ends. Gated on the siege pref. */
export async function scheduleSiegeReminder(name, spireName, until) {
  if (notifPlatform() !== 'native') return false;
  const prefs = await notifPrefs();
  const L = ln(); if (!L) return false;
  const perm = await L.checkPermissions().catch(() => ({ display: 'denied' }));
  if (!notifGateOk(prefs, perm.display, 'siege')) return false;
  // R37-10: the raw T-12h offset landed at 2, 3 and 5am across 8 measured open
  // times. Clamp to the 08:00-22:00 window before scheduling.
  const at = clampQuietHours(until - 12 * 3600000);
  try {
    await L.cancel({ notifications: [{ id: ID.siege }] });
    if (at <= Date.now() + 60000) return false;      // too close to be useful
    await L.schedule({ notifications: [{
      id: ID.siege,
      title: 'The siege is nearly through',
      body: `${name} has 12 hours left at ${spireName}. Walk out and break it.`,
      schedule: { at: new Date(at) },
    }] });
    return true;
  } catch { return false; }
}

export async function cancelSiegeReminder() {
  if (notifPlatform() !== 'native') return;
  const L = ln(); if (!L) return;
  try { await L.cancel({ notifications: [{ id: ID.siege }] }); } catch { /* ignore */ }
}

// (Re)schedule the recurring reminders per prefs. Native only (web has no
// background scheduling). Cancels ours first so toggles take effect cleanly.
export async function syncNotifications() {
  if (notifPlatform() !== 'native') return;
  const L = ln(); if (!L) return;
  const p = await notifPrefs();
  try {
    const pend = await L.getPending();
    const mine = (pend.notifications || []).filter(n => n.id === ID.reminder || n.id === ID.streak).map(n => ({ id: n.id }));
    if (mine.length) await L.cancel({ notifications: mine });
  } catch { /* ignore */ }
  /* R37-4: DEFAULTS.enabled is true for every new player, so without this the
     19:00 reminder was already scheduled on a fresh install before the app had
     ever asked for permission (prompt/denied never blocked scheduling, only
     the pref did). Cancelling stale ids above still runs regardless, so a
     revoked permission cleans up rather than leaving orphaned schedules. */
  const perm = await L.checkPermissions().catch(() => ({ display: 'denied' }));
  if (!notifGateOk(p, perm.display)) return;
  const notis = [];
  if (p.reminder) notis.push({ id: ID.reminder, title: 'Boneheadz Gym', body: "Log today's food. Your skeleton earns XP from every meal.", schedule: { on: { hour: 19, minute: 0 }, allowWhileIdle: true } });
  if (p.streak) {
    /* NO STREAK, NO NAG. This was a repeating nightly schedule with no gate, so
       a dead streak got guilt-poked at 20:30 forever, the one guilt-toned
       surface left for a lapsed player. Two changes, both needed:
       1. Only schedule while the streak is actually alive (same streakDateSet +
          streakFrom the game scores with, freeze days included).
       2. ONE-SHOT, not repeating. A repeating schedule outlives a dead streak
          on a phone that never opens the app again; a one-shot fires at most
          once after the last open, when the streak was genuinely alive, and
          every open re-arms it. The cancel above clears any legacy repeating
          schedule the moment this build first runs. */
    try {
      const [log, xp] = await Promise.all([db.all('log'), db.all('xp')]);
      const today = dateKey();
      const set = streakDateSet(log, xp);
      if (streakFrom([...set], today) > 0) {
        const at = new Date(); at.setHours(20, 30, 0, 0);
        // Today already logged: today's streak is safe, so the next useful nag
        // is tomorrow evening. Today unlogged and 20:30 already past: schedule
        // nothing, because by tomorrow evening the streak is dead.
        if (set.has(today)) at.setDate(at.getDate() + 1);
        if (at.getTime() > Date.now()) notis.push({ id: ID.streak, title: 'Keep your streak', body: 'Log something before midnight to keep the streak alive.', schedule: { at, allowWhileIdle: true } });
      }
    } catch { /* fails silent, like everything here */ }
  }
  if (notis.length) { try { await L.schedule({ notifications: notis }); } catch { /* ignore */ } }
}


