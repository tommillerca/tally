// Anonymous, first-party product analytics. No third-party trackers.
// Events carry a RANDOM per-device id (not the social pubkey, not linked to any
// identity) plus a coarse event name + optional small props. NEVER food, weight,
// health, or personal data. Queued locally and flushed to YOUR OWN backend
// (the same Cloudflare Worker as social) only when an API base is configured.
import { kvGet, kvSet } from './db.js';
/* apiFetch, not bare fetch: these three POSTs are all awaited by a UI that has
   already disabled its button ("Sending..."), so a server that accepts the
   request and never answers leaves the feedback sheet and the map report sheet
   dead with no message. Same deadline as every other call to our own Worker;
   see the header on apiFetch in js/social.js. */
import { apiBase, socialMe, apiFetch } from './social.js';
import { platformTag } from './native.js';

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
  /* window.__evProbe is the same webdriver-only escape hatch pushErr() carries,
     for the same reason: an audit has to be able to prove an event is QUEUED.
     Nothing else sets it, and flush() keeps its own BOT gate with no apiBase in
     a test, so a probe row can never leave the device. */
  if (BOT && !(typeof window !== 'undefined' && window.__evProbe)) return writeChain;
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
      const r = await apiFetch(base + '/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device, appV, plat: platformTag(), label, events: batch }) });
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
    const r = await apiFetch(base + '/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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
    /* QA round 27 R2. This read `me.id || me.handle`, and the kv `social`
       record (js/social.js kvSet('social', { playerId, handle, friendCode,
       name, onlineAt })) has NO `id` field, so every survey row ever written
       carried the HANDLE in leads.player while /account/delete binds the
       player ID: the delete has never matched a row and the name + email
       outlived the account. The real id is `playerId`, the same field every
       signed call puts in x-bh-player. The handle still travels in `label`. */
    const body = {
      device: await deviceId(), appV,
      player: me ? (me.playerId || null) : null,
      label: me ? (me.name || me.handle || null) : null,
      name: data.name ? String(data.name).slice(0, 60) : null,
      email: data.email ? String(data.email).slice(0, 120) : null,
      emailOptin: !!data.emailOptin,
      feedback: data.feedback ? String(data.feedback).slice(0, 500) : null,
      mostWanted: data.mostWanted ? String(data.mostWanted).slice(0, 280) : null,
      features: Array.isArray(data.features) ? data.features.slice(0, 20).map(f => String(f).slice(0, 24)) : [],
      /* Survey v2 S3: `form` names the survey, `answers` and `ctx` are OBJECTS
         (server/src/index.js POST /survey caps them at 4000 / 1000 chars and
         refuses, never truncates). Sent only when the caller passes a form, so a
         v1 body is byte-for-byte what it was and lands with form NULL. */
      ...(data.form ? { form: String(data.form).slice(0, 24), answers: data.answers || {}, ctx: data.ctx || {} } : {}),
    };
    const r = await apiFetch(base + '/survey', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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

/* ---- production error telemetry (2026-08-10) --------------------------------
 * If a player hits a crash, nobody finds out: there was no error reporting at
 * all, and "Tom plays daily and finds most bugs himself" was the de facto crash
 * channel. Every uncaught error and unhandled rejection now rides the SAME
 * anonymous pipe as the rest of analytics, as 'err' rows in the existing events
 * table: no new endpoint, no new data class. The no-PII rule holds because the
 * payload is the exception's own message head, a path tail of the source file,
 * the build and the screen name. Never food, weight, health or identity.
 *
 * Caps, because a crash loop must not become a flood: at most ERR_CAP rows per
 * session, at most ERR_DUP of the same message, message clipped to 180 chars.
 *
 * BOT gating: automated browsers must never register as phantom testers, so
 * errors honor the same BOT gate as track(). The ONE exception is
 * window.__errProbe (webdriver-only escape hatch, the __crateForce idiom): it
 * lets the audit prove errors are QUEUED without ever flushing them. flush()
 * keeps its own BOT gate and no audit has an apiBase, so a probe row can never
 * leave the device.
 *
 * Installed at MODULE LOAD, not from initAnalytics(): init is skipped on the
 * onboarding path and returns early under BOT, and a crash during onboarding
 * is precisely the launch-day crash we most need to hear about.
 */
const ERR_CAP = 5, ERR_DUP = 2;
let errCount = 0;
const errSeen = new Map();
function pushErr(kind, msg, src) {
  if (BOT && !(typeof window !== 'undefined' && window.__errProbe)) return;
  if (errCount >= ERR_CAP) return;
  const m = String(msg || 'unknown').slice(0, 180);
  const dup = (errSeen.get(m) || 0) + 1;
  errSeen.set(m, dup);
  if (dup > ERR_DUP) return;
  errCount += 1;
  // path tail only: no origin, no query string, nothing device-identifying
  const tail = src ? String(src).split('?')[0].split('/').slice(-2).join('/').slice(0, 80) : undefined;
  /* THE SERVER CLIPS props AT 300 CHARS, MID-STRING, AND IS NOT JSON-AWARE.
     server/src/index.js does `JSON.stringify(e.props).slice(0, 300)`. A 180-char
     message plus an 80-char source serializes to 319, so it lands in D1 as
     unterminated JSON and json_extract(props,'$.m') returns null on exactly the
     crashes with the longest, most informative messages: the errors view would
     silently miss them. Measured (319 -> invalid), not assumed.
     Budgeted here rather than in the Worker because the client can shorten the
     one field that varies, and a Worker deploy is a heavier, separately-owned
     change. If the server cap ever rises this only becomes slack. */
  const SRV_PROP_CAP = 300;
  const fit = mm => JSON.stringify({ m: mm, k: kind, src: tail, b: appV || undefined, s: curScreen || undefined }).length;
  let mFit = m;
  while (mFit.length > 24 && fit(mFit) > SRV_PROP_CAP) mFit = mFit.slice(0, mFit.length - 8);
  // writes through the same serialized chain as track(), but deliberately past
  // track()'s own BOT gate: pushErr has already decided above
  writeChain = writeChain.then(async () => {
    const q = (await kvGet('evq', [])) || [];
    q.push({ name: 'err', props: { m: mFit, k: kind, src: tail, b: appV || undefined, s: curScreen || undefined }, ts: Date.now() });
    await kvSet('evq', q.slice(-QCAP));
  }).catch(() => { /* telemetry never breaks the app */ });
  // a crashing tab may not live to the next interval flush
  setTimeout(() => flush(), 2500);
}
if (typeof window !== 'undefined') {
  window.addEventListener('error', e =>
    pushErr('error', e.message, e.filename ? `${e.filename}:${e.lineno || 0}` : null));
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    pushErr('rejection', r && (r.message || String(r)), r && r.stack ? String(r.stack).split('\n')[1] : null);
  });
}
