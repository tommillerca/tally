// Anonymous, first-party product analytics. No third-party trackers.
// Events carry a RANDOM per-device id (not the social pubkey, not linked to any
// identity) plus a coarse event name + optional small props. NEVER food, weight,
// health, or personal data. Queued locally and flushed to YOUR OWN backend
// (the same Cloudflare Worker as social) only when an API base is configured.
import { kvGet, kvSet } from './db.js';
import { apiBase, socialMe } from './social.js';
import { platformTag } from './native.js';

let appV = '';
const QCAP = 300;

/* ---- QUEUE ADMISSION: a rare event is never squeezed out by a noisy one -----
 * Measured against live D1 (2026-08-16): 96% of every row in the events table is
 * navigation telemetry. screen_time 20128, feat_open 15842, feat_time 15398,
 * screen 14462, session_ping 10015, against roughly 2945 gameplay rows in total.
 *
 * The old admission rule was `q.slice(-QCAP)`: keep the newest 300, drop the
 * oldest. That is a TIME rule, not a value rule, so when the queue sits at the
 * cap (which is what happens the moment flush() stops draining, i.e. any offline
 * stretch on an offline-first app, and the queue is persisted in IndexedDB so
 * the stretch survives app restarts) the survivors are simply the last 300 rows
 * emitted, in the app's natural 96/4 mix. A pit_win emitted early in a long
 * offline stretch is gone, and it is gone because navigation was loud.
 *
 * THE INVARIANT, stated so it can be guarded: no event name may be pushed below
 * its EQUAL SHARE of the cap by another name's volume. Concretely, the row we
 * drop to make room is always the oldest row of whichever name currently holds
 * the MOST slots, so a name is only ever a candidate for eviction while it is
 * (tied for) the biggest occupant in the queue. With ~33 distinct names in the
 * app that floor is ~9 rows each, and pit_win runs 1-2 a session.
 *
 * Self-tuning ON PURPOSE. The alternative designs both encode the judgement
 * "which events are cheap to lose" in a constant: a priority list, or a pair of
 * queues with a per-queue cap. Both have the same failure - a new event name
 * lands in whichever bucket somebody forgot to update, and nobody revisits the
 * constant. Here there is no list and nothing to keep in sync; the policy reads
 * the queue's own composition, so it follows the app's event mix for free.
 *
 * Degrades to the old behaviour when nothing is common: if every name holds one
 * slot, the max is 1, findIndex returns 0, and we drop the oldest row. FIFO.
 *
 * THE DASHBOARD HAS A DISCONTINUITY AT THIS BUILD, and it is not a behaviour
 * change: nothing about what the app EMITS moved, only which rows survive an
 * unflushed stretch. Anyone reading a trend across this boundary must be told:
 *
 *   JUMP UP (they were being destroyed and now are not). Every gameplay and
 *   lifecycle name: pit_win, boss_win, mini_win, secret_boss_win, glutton_win,
 *   friend_battle, fight_start, food_log, cook, hatch, transmute, buy_weapon,
 *   quest_claim, go_online, feedback_send, survey_*, onb_*, garden_intro_*,
 *   log_write_failed, vault_backfill, vault_recover, pet_iid_heal, err,
 *   app_open, session_start, session_resume. The `played` column of the tester
 *   table and the crash counts are the visible ones. The step is a RECOVERY of
 *   rows that were always emitted, so reading it as players suddenly playing
 *   more is exactly backwards.
 *
 *   DIP (they now absorb the eviction the rare names used to absorb):
 *   screen_time, screen, feat_open, feat_time, session_ping. Measured on a
 *   driven 344-row stretch: screen_time and screen went 150 -> 146 each, -2.7%,
 *   which bought the entire gameplay tail its life.
 *
 *   WATCH THIS ONE: playMinutes and avgSessionMin are computed server-side as
 *   session_ping x 45s. session_ping is now evictable ahead of a pit_win, so
 *   play time can read LOWER after this build for any device that crosses the
 *   cap. The levelling property keeps it small - the four loud names are ground
 *   down to each other before anything below them is touched, and session_ping
 *   is the quietest of the four - but it is a denominator, so a dip there moves
 *   every per-minute rate. tests/event-queue-audit.mjs pins it.
 *
 *   NOT COMPARABLE EITHER WAY: the shape of the screen_time / feat_time dwell
 *   histograms under cap pressure. Before, the survivors were one contiguous
 *   recent window of everything; now they are the newest rows of each loud name
 *   separately. Both are recency-biased, differently.
 */
function admit(q, row) {
  while (q.length >= QCAP) {
    const n = new Map();
    for (const r of q) n.set(r.name, (n.get(r.name) || 0) + 1);
    let worst = null, worstN = 0;
    for (const [name, c] of n) if (c > worstN) { worstN = c; worst = name; }
    // append-ordered queue, so the FIRST row of that name is its oldest
    const i = q.findIndex(r => r.name === worst);
    q.splice(i < 0 ? 0 : i, 1);
  }
  q.push(row);
  return q;
}

// Never record analytics for non-real sessions: automated browsers
// (navigator.webdriver, set by headless/CI) AND ?demo mode (used for dev
// verification + showcasing; it runs on a separate demo DB). Both would
// otherwise register as phantom "testers" and inflate the counts. Real users
// hit the plain URL in a normal browser.
const BOT = (typeof navigator !== 'undefined' && navigator.webdriver === true)
  || (typeof location !== 'undefined' && location.search && location.search.includes('demo'));

/* window.__evProbe: webdriver-only escape hatch, the __crateForce / __errProbe
 * idiom. The admission policy above can only be proven against a queue that is
 * actually FILLING, and under BOT nothing queues at all. With the probe set,
 * track()/screen() queue exactly as they do for a real player, so an audit
 * measures the shipped code path rather than a copy of it.
 * flush() keeps its own BOT gate, unconditional and NEVER probed, so a probed
 * row can never leave the device: it is queued and then read straight back out
 * of kv by the audit. Strictly narrower than __errProbe, which does not gate
 * the network either but relies on no audit configuring an apiBase. */
const probing = () => typeof window !== 'undefined' && !!window.__evProbe;

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
  if (BOT && !probing()) return writeChain;
  writeChain = writeChain.then(async () => {
    const q = (await kvGet('evq', [])) || [];
    await kvSet('evq', admit(q, { name, props: props || undefined, ts: Date.now() }));
  }).catch(() => { /* analytics never breaks the app */ });
  return writeChain;
}

// ---- screen dwell (the "heatmap": how long testers spend on each screen) ----
// screen(name) closes out the previous screen's time and opens the new one.
let curScreen = null, curScreenAt = 0;
export function screen(name) {
  if (BOT && !probing()) return;
  const now = Date.now();
  if (curScreen && curScreen !== name && curScreenAt) {
    track('screen_time', { s: curScreen, ms: now - curScreenAt });
  }
  if (curScreen !== name) { curScreen = name; curScreenAt = now; track('screen', { s: name }); }
}

/* FINDING, 2026-08-16, MEASURED AND NOT FIXED HERE (gwart/evqueue owns the
 * ADMISSION policy above; this is a second, independent loss channel and it wants
 * its own branch). SECOND ANALYTICS LOSS CHANNEL: flush() mutates the kv queue
 * OFF the writeChain that track() serialises through.
 *
 * `let q = kvGet('evq')` below takes a LOCAL copy, then awaits deviceId(),
 * socialMe() (a network call) and one fetch per 50-row batch, and then writes that
 * local copy back with `kvSet('evq', q)`. Every row track() appended in between is
 * overwritten out of existence. track()'s own comment says this exact race was
 * found and fixed for track-vs-track; flush-vs-track was left.
 *
 * Measured by replaying this function's statement sequence verbatim against the
 * same kv store with the real track() running concurrently, 120 rows queued and a
 * 250ms round trip: 11 of 12 rows queued during the flush window were destroyed,
 * including a pit_win. Only the row queued after the final kvSet survived.
 *
 * This is the complement of the admission bug: the cap only bites while flush is
 * NOT draining (offline), and this one only bites while it IS (online). Together
 * there is no state in which the queue is lossless.
 *
 * The fix is small - put flush's mutation on the chain, re-reading rather than
 * writing a stale copy, which is sound because new rows only ever append:
 *     const sent = batch.length;
 *     await (writeChain = writeChain.then(async () => {
 *       const cur = (await kvGet('evq', [])) || [];
 *       await kvSet('evq', cur.slice(sent));
 *     }));
 *     q = q.slice(sent);
 * What is NOT small is guarding it behaviourally, which needs a seam that lets an
 * audit watch flush() reach a server. flush()'s BOT gate is the only thing keeping
 * audits out of production D1 (apiBase() falls back to PROD_API when no override
 * is set), so opening it is a real decision, not a bolt-on to this branch. */
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
    // same admission policy as track(): ERR_CAP already makes 'err' the rarest
    // name in the queue, and under the old slice(-QCAP) that rarity bought it
    // nothing. A crash at the start of an offline stretch was the FIRST row
    // navigation pushed out. Now it is the last.
    await kvSet('evq', admit(q, { name: 'err', props: { m: mFit, k: kind, src: tail, b: appV || undefined, s: curScreen || undefined }, ts: Date.now() }));
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
