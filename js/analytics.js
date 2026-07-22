// Anonymous, first-party product analytics. No third-party trackers.
// Events carry a RANDOM per-device id (not the social pubkey, not linked to any
// identity) plus a coarse event name + optional small props. NEVER food, weight,
// health, or personal data. Queued locally and flushed to YOUR OWN backend
// (the same Cloudflare Worker as social) only when an API base is configured.
import { kvGet, kvSet } from './db.js';
import { apiBase, socialMe } from './social.js';

let appV = '';
const QCAP = 300;
// Never record analytics for non-real sessions: automated browsers
// (navigator.webdriver, set by headless/CI) AND ?demo mode (used for dev
// verification + showcasing; it runs on a separate demo DB). Both would
// otherwise register as phantom "testers" and inflate the counts. Real users
// hit the plain URL in a normal browser.
const BOT = (typeof navigator !== 'undefined' && navigator.webdriver === true)
  || (typeof location !== 'undefined' && location.search && location.search.includes('demo'));

async function deviceId() {
  let id = await kvGet('analyticsId', null);
  if (!id) {
    id = (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    await kvSet('analyticsId', id);
  }
  return id;
}

// Record an event (fire-and-forget). Keep names coarse + props tiny.
// Writes are serialized through a promise chain: bursts (e.g. screen_time then
// screen, fired in the same tick) would otherwise race on the read-modify-write
// of the kv queue and clobber each other, silently dropping events.
let writeChain = Promise.resolve();
export function track(name, props) {
  if (BOT) return writeChain;
  writeChain = writeChain.then(async () => {
    const q = (await kvGet('evq', [])) || [];
    q.push({ name, props: props || undefined, ts: Date.now() });
    await kvSet('evq', q.slice(-QCAP));
  }).catch(() => { /* analytics never breaks the app */ });
  return writeChain;
}

// ---- screen dwell (the "heatmap": how long testers spend on each screen) ----
// screen(name) closes out the previous screen's time and opens the new one.
let curScreen = null, curScreenAt = 0;
export function screen(name) {
  if (BOT) return;
  const now = Date.now();
  if (curScreen && curScreen !== name && curScreenAt) {
    track('screen_time', { s: curScreen, ms: now - curScreenAt });
  }
  if (curScreen !== name) { curScreen = name; curScreenAt = now; track('screen', { s: name }); }
}

let flushing = false;
export async function flush() {
  if (BOT || flushing) return;
  flushing = true;
  try {
    const base = await apiBase();
    if (!base) return; // only when YOUR backend is configured; otherwise it just queues
    let q = (await kvGet('evq', [])) || [];
    if (!q.length) return;
    const device = await deviceId();
    // for online testers, attach the Crew name so the dashboard shows who's who
    // (anonymous stays anonymous for anyone who hasn't gone online). Location is
    // added server-side from the request's coarse edge geo, never device GPS.
    const me = await socialMe().catch(() => null);
    const label = me ? (me.name || me.handle || null) : null;
    while (q.length) {
      const batch = q.slice(0, 50);
      const r = await fetch(base + '/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device, appV, label, events: batch }) });
      if (!r || !r.ok) break; // keep the queue; retry next flush
      q = q.slice(batch.length);
      await kvSet('evq', q);
    }
  } catch { /* best-effort */ }
  finally { flushing = false; }
}

// Player-submitted map feedback (den nominations + unreachable-spot reports).
// Private dev channel — sent to your own server, shown only in the dashboard,
// never to other players (so it's not public UGC). Best-effort, capped note.
export async function sendReport(kind, data = {}) {
  if (BOT) return { ok: false, reason: 'bot' };
  try {
    const base = await apiBase();
    if (!base) return { ok: false, reason: 'offline' };
    const me = await socialMe().catch(() => null);
    const body = {
      device: await deviceId(), appV,
      label: me ? (me.name || me.handle || null) : null,
      kind,                                   // 'den-nominate' | 'unreachable'
      lat: data.lat, lng: data.lng,
      target: data.target ? String(data.target).slice(0, 60) : null,
      note: data.note ? String(data.note).slice(0, 280) : null,
    };
    const r = await fetch(base + '/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: !!(r && r.ok) };
  } catch { return { ok: false, reason: 'error' }; }
}

// One-time in-app survey lead (name/email/feedback/most-wanted + update opt-in).
// Email is contact info (declared in the store data-safety forms). Same private
// dev channel as reports; best-effort. The reward grant is handled locally by the
// caller regardless of whether this POST succeeds.
export async function sendSurvey(data = {}) {
  if (BOT) return { ok: false, reason: 'bot' };
  try {
    const base = await apiBase();
    if (!base) return { ok: false, reason: 'offline' };
    const me = await socialMe().catch(() => null);
    const body = {
      device: await deviceId(), appV,
      player: me ? (me.id || me.handle || null) : null,
      label: me ? (me.name || me.handle || null) : null,
      name: data.name ? String(data.name).slice(0, 60) : null,
      email: data.email ? String(data.email).slice(0, 120) : null,
      emailOptin: !!data.emailOptin,
      feedback: data.feedback ? String(data.feedback).slice(0, 500) : null,
      mostWanted: data.mostWanted ? String(data.mostWanted).slice(0, 280) : null,
    };
    const r = await fetch(base + '/survey', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: !!(r && r.ok) };
  } catch { return { ok: false, reason: 'error' }; }
}

export async function initAnalytics(version) {
  if (BOT) return; // automated/verification browsers never count as testers
  appV = version || '';
  track('app_open');
  track('session_start');
  flush();
  setInterval(flush, 60000); // drain while the app is open
  // play-time heartbeat: one ping per ~45s the app is actually visible/foreground.
  // Total play time ≈ ping count × 45s; sessions ≈ session_start count.
  setInterval(() => { if (document.visibilityState === 'visible') track('session_ping'); }, 45000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { track('session_resume'); if (curScreen) curScreenAt = Date.now(); flush(); }
    else if (curScreen && curScreenAt) { track('screen_time', { s: curScreen, ms: Date.now() - curScreenAt }); curScreenAt = 0; }
  });
}
