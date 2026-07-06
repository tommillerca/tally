// Anonymous, first-party product analytics. No third-party trackers.
// Events carry a RANDOM per-device id (not the social pubkey, not linked to any
// identity) plus a coarse event name + optional small props. NEVER food, weight,
// health, or personal data. Queued locally and flushed to YOUR OWN backend
// (the same Cloudflare Worker as social) only when an API base is configured.
import { kvGet, kvSet } from './db.js';
import { apiBase } from './social.js';

let appV = '';
const QCAP = 300;

async function deviceId() {
  let id = await kvGet('analyticsId', null);
  if (!id) {
    id = (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    await kvSet('analyticsId', id);
  }
  return id;
}

// Record an event (fire-and-forget). Keep names coarse + props tiny.
export async function track(name, props) {
  try {
    const q = (await kvGet('evq', [])) || [];
    q.push({ name, props: props || undefined, ts: Date.now() });
    await kvSet('evq', q.slice(-QCAP));
  } catch { /* analytics never breaks the app */ }
}

let flushing = false;
export async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    const base = await apiBase();
    if (!base) return; // only when YOUR backend is configured; otherwise it just queues
    let q = (await kvGet('evq', [])) || [];
    if (!q.length) return;
    const device = await deviceId();
    while (q.length) {
      const batch = q.slice(0, 50);
      const r = await fetch(base + '/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device, appV, events: batch }) });
      if (!r || !r.ok) break; // keep the queue; retry next flush
      q = q.slice(batch.length);
      await kvSet('evq', q);
    }
  } catch { /* best-effort */ }
  finally { flushing = false; }
}

export async function initAnalytics(version) {
  appV = version || '';
  track('app_open');
  flush();
  setInterval(flush, 60000); // drain while the app is open
}
