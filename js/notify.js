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

import { kvGet, kvSet } from './db.js';
import { isNative } from './native.js';
import { dateKey } from './nutrition.js';

// New users have notifications ON by default (Tom's call). enabled=true only
// takes effect once the OS grants permission (requested once at boot); until
// then nothing fires. Existing users who deliberately turned it off saved
// {enabled:false} and keep that.
const DEFAULTS = { enabled: true, reminder: true, streak: true, friends: true };
export async function notifPrefs() { return { ...DEFAULTS, ...((await kvGet('notifPrefs', {})) || {}) }; }
export async function setNotifPrefs(p) { await kvSet('notifPrefs', p); }

const ID = { reminder: 1, streak: 2, test: 9, rareLo: 1000, rareHi: 1899 };

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

// Fire a notification right now (test button; and foregrounded rares fall back to
// the in-app cue elsewhere). Returns whether it dispatched.
export async function notifyNow(title, body) {
  const p = notifPlatform();
  try {
    if (p === 'native') {
      await ln().schedule({ notifications: [{ id: ID.test, title, body, schedule: { at: new Date(Date.now() + 500) } }] });
      return true;
    }
    if (p === 'web' && Notification.permission === 'granted') {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) await reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
      else new Notification(title, { body });
      return true;
    }
  } catch { /* ignore */ }
  return false;
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
  if (!p.enabled) return;
  const notis = [];
  if (p.reminder) notis.push({ id: ID.reminder, title: 'Boneheadz Gym', body: "Log today's food. Your skeleton earns XP from every meal.", schedule: { on: { hour: 19, minute: 0 }, allowWhileIdle: true } });
  if (p.streak) notis.push({ id: ID.streak, title: 'Keep your streak', body: 'Log something before midnight to keep the streak alive.', schedule: { on: { hour: 20, minute: 30 }, allowWhileIdle: true } });
  if (notis.length) { try { await L.schedule({ notifications: notis }); } catch { /* ignore */ } }
}


