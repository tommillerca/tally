// Notifications. One preference model, two backends: Capacitor LocalNotifications
// on the native app (real scheduled + background notifications) and the Web
// Notifications API in a browser/PWA (immediate only; no background scheduling).
// Everything is opt-in and fails silent — a player can have ALL of it (rares
// pushed as they surface) or NONE. Nothing fires until the player turns it on
// and grants permission.

import { kvGet, kvSet } from './db.js';
import { isNative } from './native.js';
import { raresNear, SPAWN_TTL_MIN } from './hunt.js';
import { dateKey } from './nutrition.js';

const DEFAULTS = { enabled: false, rares: true, reminder: true, streak: true };
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

// Schedule "a rare is surfacing near you" pushes for the next few 45-min windows,
// computed deterministically from a last-known location. Native only. No live
// background GPS needed: rares are deterministic per (date, cell, window), so we
// know exactly when/where one appears near where you last were.
export async function scheduleRares(lat, lng) {
  if (notifPlatform() !== 'native' || lat == null) return;
  const p = await notifPrefs();
  const L = ln(); if (!L) return;
  try {
    const pend = await L.getPending();
    const mine = (pend.notifications || []).filter(n => n.id >= ID.rareLo && n.id <= ID.rareHi).map(n => ({ id: n.id }));
    if (mine.length) await L.cancel({ notifications: mine });
  } catch { /* ignore */ }
  if (!p.enabled || !p.rares) return;
  const date = dateKey();
  const now = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const curInst = Math.floor(nowM / SPAWN_TTL_MIN);
  const notis = [];
  for (let i = curInst + 1; i <= curInst + 8 && i * SPAWN_TTL_MIN < 1440; i++) {
    const wm = i * SPAWN_TTL_MIN;
    if (!raresNear(date, lat, lng, wm + 0.1).length) continue;
    const at = new Date(now); at.setHours(Math.floor(wm / 60), Math.round(wm % 60), 0, 0);
    if (at.getTime() > Date.now() + 30000) {
      notis.push({ id: ID.rareLo + (i % 800), title: 'A rare stirs in the Boneyard', body: 'A rare spawn is surfacing near you. Head out and grab it.', schedule: { at, allowWhileIdle: true } });
    }
  }
  if (notis.length) { try { await L.schedule({ notifications: notis }); } catch { /* ignore */ } }
}
