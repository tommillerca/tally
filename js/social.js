// Social backbone (S0): anonymous device identity + profile sync + grants feed.
// Privacy contract: ONLY the game snapshot ever uploads (level, stats, outfit
// ids, gear ids, badge count). Food logs, weights, and location NEVER leave the
// device. Going online is opt-in.
//
// Identity: an ECDSA P-256 keypair generated on-device (kv 'identity', stored
// as JWKs so it rides inside the normal backup export; restoring a backup on a
// new phone re-registers the same pubkey and gets the SAME account back).
// Every API call is signed: "METHOD\nPATH\nTS\nBODY".
//
// Grants: the server hands down ledger events (welcome bonus, trades, PvP
// rewards, friend badges). Each has a unique key; we ingest through the same
// idempotent award() as local play, so replays and re-pulls are harmless.

import { kvGet, kvSet } from './db.js';
import { award } from './game.js';
import { coinsAdd, grantCrate, grantConsumable, grantGear } from './loot.js';

// Production API. Empty until the worker is deployed; the Go Online UI stays
// hidden while unset. Overridable for tests/dev via ?api= or kv 'apiBase'.
const PROD_API = '';

let cachedApi = null;
export async function apiBase() {
  if (cachedApi !== null) return cachedApi;
  const kv = await kvGet('apiBase', null);
  cachedApi = kv || PROD_API || '';
  return cachedApi;
}
// honor ?api=http://127.0.0.1:8788 once at boot (dev/e2e hook)
export async function initFromQuery() {
  try {
    const q = new URLSearchParams(location.search).get('api');
    if (q) { await kvSet('apiBase', q); cachedApi = q; }
  } catch { /* no location in tests */ }
}

/* ---------------- identity ---------------- */
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));

async function ensureIdentity() {
  let id = await kvGet('identity', null);
  if (id && id.privJwk && id.pubJwk) return id;
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  id = {
    privJwk: await crypto.subtle.exportKey('jwk', kp.privateKey),
    pubJwk: await crypto.subtle.exportKey('jwk', kp.publicKey),
    createdAt: Date.now(),
  };
  await kvSet('identity', id);
  return id;
}

async function signingKey() {
  const id = await ensureIdentity();
  return crypto.subtle.importKey('jwk', id.privJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function signedFetch(method, path, bodyObj = null) {
  const base = await apiBase();
  const me = await kvGet('social', null);
  if (!base || !me) throw new Error('offline');
  const body = bodyObj ? JSON.stringify(bodyObj) : '';
  const ts = Date.now();
  const key = await signingKey();
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${method}\n${path}\n${ts}\n${body}`));
  return fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-bh-player': me.playerId, 'x-bh-ts': String(ts), 'x-bh-sig': b64(sig) },
    body: method === 'GET' ? undefined : body,
  });
}

/* ---------------- account ---------------- */
export async function isOnline() { return !!(await apiBase()) && !!(await kvGet('social', null)); }
export async function socialMe() { return kvGet('social', null); }

// Opt in: register this device's pubkey. Re-running (or restoring a backup)
// returns the same account.
export async function goOnline() {
  const base = await apiBase();
  if (!base) return { ok: false, reason: 'no-api' };
  const id = await ensureIdentity();
  const r = await fetch(base + '/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pubkey: id.pubJwk }),
  });
  if (!r.ok) return { ok: false, reason: 'register-failed', status: r.status };
  const me = await r.json();
  await kvSet('social', { playerId: me.playerId, handle: me.handle, friendCode: me.friendCode, onlineAt: Date.now() });
  return { ok: true, me };
}

/* ---------------- profile snapshot up ---------------- */
// snapshot comes from app.js (it owns buildFighter etc.); social.js only ships it
export async function syncProfile(snapshot, appV = '') {
  const r = await signedFetch('PUT', '/profile', { snapshot, appV });
  return r.ok;
}

/* ---------------- grants feed down ---------------- */
// Apply one grant payload as additive rewards. XP goes through award() with the
// grant's key, so the ledger stays idempotent even if we re-pull.
async function applyGrant(g) {
  const p = g.payload || {};
  const xp = await award(g.key, g.type || 'social', p.xp || 0, p.note || 'From the Crew');
  if (xp === 0 && p.xp > 0) return false; // already ingested: skip side effects too
  if (p.coins) await coinsAdd(p.coins);
  if (p.crate) await grantCrate(p.crate, 'social');
  if (p.consumable) await grantConsumable(p.consumable, 'social');
  if (p.gearId) await grantGear(p.gearId, 'social');
  return true;
}

export async function pullGrants() {
  const since = (await kvGet('grantCursor', 0)) || 0;
  const r = await signedFetch('GET', `/grants?since=${since}`);
  if (!r.ok) return { applied: 0 };
  const data = await r.json();
  let applied = 0;
  const seen = new Set((await kvGet('grantsSeen', [])) || []);
  for (const g of data.grants || []) {
    if (seen.has(g.key)) continue; // belt AND suspenders next to award()'s key check
    if (await applyGrant(g)) applied++;
    seen.add(g.key);
  }
  await kvSet('grantsSeen', [...seen].slice(-500));
  if (data.cursor && data.cursor !== since) await kvSet('grantCursor', data.cursor);
  return { applied, grants: data.grants || [] };
}

/* ---------------- auto sync ---------------- */
// Called at boot/resume with a snapshot builder. Throttled; never throws.
const SYNC_THROTTLE_MS = 5 * 60 * 1000;
export async function autoSync(buildSnapshot, appV = '') {
  try {
    if (!(await isOnline())) return null;
    const last = (await kvGet('socialSyncAt', 0)) || 0;
    if (Date.now() - last < SYNC_THROTTLE_MS) return null;
    await kvSet('socialSyncAt', Date.now());
    const snapshot = await buildSnapshot();
    if (snapshot) await syncProfile(snapshot, appV);
    return await pullGrants();
  } catch { return null; }
}
