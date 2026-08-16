// Anonymous, first-party product analytics. No third-party trackers.
// Events carry a RANDOM per-device id (not the social pubkey, not linked to any
// identity) plus a coarse event name + optional small props. NEVER food, weight,
// health, or personal data. Queued locally and flushed to YOUR OWN backend
// (the same Cloudflare Worker as social) only when an API base is configured.
import { kvGet, kvSet } from './db.js';
import { apiBase, socialMe } from './social.js';
import { platformTag } from './native.js';
import { dateKey, daysBetween } from './nutrition.js';

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
      const r = await fetch(base + '/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device, appV, plat: platformTag(), label, events: batch }) });
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
      features: Array.isArray(data.features) ? data.features.slice(0, 20).map(f => String(f).slice(0, 24)) : [],
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

/* ---- RETENTION (2026-08-16) -------------------------------------------------
 * Two rows, and between them the only question nobody could answer: do people
 * come back, and when they come back do they finish a day?
 *
 *   day_first_open { d, g, s }   the FIRST open of a new local day.
 *       d = install age in days (-1 when unknown), g = days since the last
 *       active day (-1 when there is no previous active day on record),
 *       s = the logging streak the player is looking at.
 *   day_closed     { r, d }      the day-close award actually minted.
 *       r = 'close' (yesterday landed on budget) | 'effort' (yesterday was
 *       logged but off budget), d = install age on the day it fired.
 *
 * WHY d RIDES IN THE PAYLOAD, and why it must not be "simplified away". The
 * queue is capped (QCAP, oldest evicted first) and flushes are best effort, so
 * a device's history here is LOSSY BY CONSTRUCTION. Reconstructing "this install
 * is 14 days old" by finding its first row and counting forward only works if
 * that first row survived. Carrying the age on every row means ONE surviving
 * day_first_open from day 14 proves the install is 14 days old on its own, and
 * the whole return curve is recoverable from an arbitrary subset of rows.
 * The same reasoning puts d on day_closed: it joins the close to the open of the
 * same day BY VALUE, rather than through the server's own day column, which is
 * derived from arrival time and disagrees with the client's LOCAL day for
 * anybody logging in the evening west of Greenwich.
 *
 * SUPPRESSION IS INHERITED, NOT REIMPLEMENTED. Both rows go through track(), so
 * demo sessions and webdriver sessions are dropped by the one BOT gate at the
 * top of this file. They are deliberately NOT written into 'evq' directly the
 * way pushErr does below: pushErr has an audited escape hatch and a reason to
 * need one, and these have neither.
 *
 * STORAGE: exactly one new kv key, RETENTION_DAY_KEY, holding the last active
 * day as a plain 'YYYY-MM-DD' string. That is the whole storage addition.
 * The install anchor is NOT stored again: settings.createdAt already exists,
 * it is written at onboarding, and it rides inside the cloud backup, so a
 * restored device keeps its real cohort instead of re-joining today's.
 * An install old enough to predate settings.createdAt reports d = -1 rather
 * than a made-up age, and the query drops those rows by name.
 *
 * Guard: tests/retention-audit.mjs. Query: docs/RETENTION-QUERIES.md.
 */
export const RETENTION_DAY_KEY = 'retentionDay';

/* -1 means "not known", and it has to be distinct from 0, which means "today".
   A negative day count can only come from a clock that moved backwards, and
   "unknown" is the honest reading of that, so it clamps to -1 as well. */
const dayCount = n => (Number.isFinite(n) && n >= 0 ? n : -1);

/* PURE, and exported so the guard can drive it without a browser: no kv, no
   clock, no track(). Given the stored last active day, today's local day key,
   the install day (or null) and the streak, it returns the row to emit, or null
   when this open is not the first of a new day.
   The two directions this is guarding, both of which are silent in production:
   a row when `last` already equals today (double counting inflates retention),
   and null on a genuinely new day (the return is never recorded at all). */
export function dayFirstOpenRow(last, today, installDay, streak) {
  if (!today) return null;
  if (last === today) return null;
  return {
    d: installDay ? dayCount(daysBetween(installDay, today)) : -1,
    g: last ? dayCount(daysBetween(last, today)) : -1,
    s: Math.max(0, Math.round(Number(streak) || 0)),
  };
}

// The install anchor, read from the settings row that already exists.
async function installDay() {
  const s = await kvGet('settings', null);
  const t = Number(s && s.createdAt) || 0;
  return t ? dateKey(new Date(t)) : null;
}

/* Serialized on its own chain, for the same reason track() is: the two call
   sites (boot and the day rollover) can be in flight at once on a resume, and a
   read-modify-write of the gate that interleaves emits the day twice. Read the
   gate, write the gate and queue the row inside ONE link, so the second caller
   reads a day that is already recorded and emits nothing.
   The gate is written BEFORE the row is queued: if the order were reversed, a
   throw between them would leave the day unrecorded and the next open of the
   same day would emit a second row. Double counting is the worse failure, so
   the write that prevents it goes first.
   Returns the props it emitted, or null. */
let retentionChain = Promise.resolve();
export function trackDayFirstOpen({ streak = 0 } = {}) {
  retentionChain = retentionChain.then(async () => {
    const today = dateKey();
    const row = dayFirstOpenRow(await kvGet(RETENTION_DAY_KEY, null), today, await installDay(), streak);
    if (!row) return null;
    await kvSet(RETENTION_DAY_KEY, today);
    track('day_first_open', row);
    return row;
  }).catch(() => null);   // analytics never breaks the app, and a rejected chain would break every later call
  return retentionChain;
}

/* Called ONLY from the branch where the day-close award really minted; see
   awardDayCloseIfDue in js/game.js. There is no flag of our own here on purpose:
   the idempotency is the XP ledger's, which is the only thing that knows. */
export async function trackDayClosed(r) {
  try {
    const day = await installDay();
    track('day_closed', { r, d: day ? dayCount(daysBetween(day, dateKey())) : -1 });
  } catch { /* analytics never breaks the day close */ }
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
