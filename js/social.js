// Social backbone (S0): anonymous device identity + profile sync + grants feed
// + full ENCRYPTED cloud backup.
//
// Privacy contract:
//  - The public game snapshot (level, stats, outfit ids, gear ids) uploads in
//    the clear so friends/leaderboards can read it.
//  - The full save backup (which DOES include food log, weight, health) is
//    end-to-end ENCRYPTED on-device with a key the server never sees. The
//    server stores opaque ciphertext; "your data stays private" still holds
//    because nobody but this device can decrypt it.
//  - Nothing is ever readable server-side beyond the public snapshot.
//
// Identity: an ECDSA P-256 signing keypair + an AES-GCM backup key, both
// generated on-device (kv 'identity', stored as JWKs so they ride inside the
// normal backup export AND get mirrored to the OS keychain on native, so a
// reinstall / wiped device can re-authenticate and decrypt its cloud backup).
// Re-registering the same pubkey returns the SAME account. Every API call is
// signed: "METHOD\nPATH\nTS\nBODY".
//
// Grants: the server hands down ledger events (welcome bonus, trades, PvP
// rewards, friend badges). Each has a unique key; we ingest through the same
// idempotent award() as local play, so replays and re-pulls are harmless.

import { kvGet, kvSet, exportAll, importAll } from './db.js';
import { award } from './game.js';
import { coinsAdd, grantCrate, grantConsumable, grantGear } from './loot.js';

// Production API. Empty until the worker is deployed; the Go Online UI stays
// hidden while unset. Overridable for tests/dev via ?api= or kv 'apiBase'.
const PROD_API = 'https://bonez-api.boneheadz.workers.dev';

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

// Native keychain bridge. On iOS a tiny custom Capacitor plugin (BhVault) stores
// the identity in the OS keychain, which SURVIVES app reinstalls / wiped WebView
// containers (same Apple team). In browsers these are no-ops. This is the piece
// that lets a reset device re-authenticate and pull its own cloud backup instead
// of silently minting a brand-new empty account.
function vaultPlugin() {
  try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BhVault) || null; }
  catch { return null; }
}
async function readKeychainIdentity() {
  const v = vaultPlugin();
  if (!v || !v.get) return null;
  try {
    const r = await v.get({ key: 'identity' });
    return r && r.value ? JSON.parse(r.value) : null;
  } catch { return null; }
}
function mirrorIdentity(id) {
  const v = vaultPlugin();
  if (!v || !v.set) return;
  try { v.set({ key: 'identity', value: JSON.stringify(id) }); } catch { /* best effort */ }
}

async function ensureIdentity() {
  let id = await kvGet('identity', null);
  if (id && id.privJwk && id.pubJwk) { mirrorIdentity(id); return id; }
  // Fresh or wiped install: recover the identity from the OS keychain BEFORE
  // minting a new one, so we come back as the same account (and can decrypt the
  // cloud backup) instead of starting over empty.
  const kc = await readKeychainIdentity();
  if (kc && kc.privJwk && kc.pubJwk) { await kvSet('identity', kc); return kc; }
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  id = {
    privJwk: await crypto.subtle.exportKey('jwk', kp.privateKey),
    pubJwk: await crypto.subtle.exportKey('jwk', kp.publicKey),
    createdAt: Date.now(),
  };
  await kvSet('identity', id);
  mirrorIdentity(id);
  return id;
}

async function signingKey() {
  const id = await ensureIdentity();
  return crypto.subtle.importKey('jwk', id.privJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

// AES-GCM key for the E2E backup. Created lazily and folded into the SAME
// identity bundle, so it exports + rides to the keychain alongside the signing
// key. Existing accounts (identity without aesJwk) upgrade in place.
async function backupKey() {
  const id = await ensureIdentity();
  if (!id.aesJwk) {
    const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    id.aesJwk = await crypto.subtle.exportKey('jwk', k);
    await kvSet('identity', id);
    mirrorIdentity(id); // push updated bundle to native keychain (no-op in browsers)
  }
  return crypto.subtle.importKey('jwk', id.aesJwk, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

const u8ToB64 = u8 => btoa(String.fromCharCode(...u8));
const b64ToU8 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

// Encrypt an object -> base64(iv(12) || ciphertext). Server can never read this.
async function encryptBackup(obj) {
  const key = await backupKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(obj));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0); out.set(ct, iv.length);
  return u8ToB64(out);
}
async function decryptBackup(b64s) {
  const key = await backupKey();
  const buf = b64ToU8(b64s);
  const iv = buf.slice(0, 12), ct = buf.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(pt));
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
  await kvSet('social', { playerId: me.playerId, handle: me.handle, friendCode: me.friendCode, name: me.name || null, onlineAt: Date.now() });
  return { ok: true, me };
}

// Your display name for the UI: the curated name if set, else the bone-name.
export async function displayName() {
  const me = await kvGet('social', null);
  return me ? (me.name || me.handle) : null;
}

/* ---------------- friends + name ---------------- */
// Set the curated display name from word-list indices (no free text uploaded).
export async function setName(adj, noun, num) {
  const r = await signedFetch('POST', '/name', { adj, noun, num });
  if (!r.ok) return { ok: false };
  const data = await r.json();
  const me = (await kvGet('social', null)) || {};
  me.name = data.name; await kvSet('social', me);
  return { ok: true, name: data.name };
}
export async function friendRequest(code) {
  try { const r = await signedFetch('POST', '/friends/request', { code }); const d = await r.json().catch(() => ({})); return { ok: r.ok, ...d }; }
  catch { return { ok: false }; }
}
export async function acceptFriend(id) { try { return (await signedFetch('POST', '/friends/accept', { id })).ok; } catch { return false; } }
export async function removeFriend(id) { try { return (await signedFetch('POST', '/friends/remove', { id })).ok; } catch { return false; } }

// Private, local-only nicknames: what YOU call a friend so a generic bone-name
// is memorable ("Bone Guy" -> "Coach Mike"). Stored on-device in kv, so it's
// free text with nothing to moderate (it never leaves this phone except inside
// the user's own end-to-end-encrypted backup). Keyed by the friend's playerId.
export async function setFriendAlias(playerId, alias) {
  const map = (await kvGet('friendAliases', null)) || {};
  const clean = String(alias || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (clean) map[playerId] = clean; else delete map[playerId];
  await kvSet('friendAliases', map);
  return clean;
}
export async function listFriends() {
  let data;
  try { const r = await signedFetch('GET', '/friends', null); if (!r.ok) return { friends: [], incoming: [], outgoing: [] }; data = await r.json(); }
  catch { return { friends: [], incoming: [], outgoing: [] }; }
  const aliases = (await kvGet('friendAliases', null)) || {};
  for (const bucket of ['friends', 'incoming', 'outgoing']) for (const f of (data[bucket] || [])) f.alias = aliases[f.playerId] || null;
  return data;
}

// Incoming friend requests that are NEW since the last check, for a one-time
// notification per requester. Records the current incoming set so we never
// re-notify. On the very first run (no baseline) it seeds silently so a
// restored account doesn't spam a notification for every pending request.
export async function newFriendRequests() {
  const data = await listFriends();
  const incoming = data.incoming || [];
  const ids = incoming.map(f => f.playerId);
  const prev = await kvGet('knownIncoming', null);
  await kvSet('knownIncoming', ids);
  if (prev === null) return { fresh: [], incoming };
  const known = new Set(prev);
  return { fresh: incoming.filter(f => !known.has(f.playerId)), incoming };
}

/* ---------------- profile snapshot up ---------------- */
// snapshot comes from app.js (it owns buildFighter etc.); social.js only ships it
export async function syncProfile(snapshot, appV = '') {
  const r = await signedFetch('PUT', '/profile', { snapshot, appV });
  return r.ok;
}

/* ---------------- full encrypted backup ---------------- */
// Encrypt the ENTIRE local save (foods, log, weights, kv, xp, health, inv) and
// push the ciphertext. Never throws to the caller path; returns ok/false.
export async function pushBackup(appV = '') {
  try {
    const snapshot = await exportAll();
    const blob = await encryptBackup(snapshot);
    const r = await signedFetch('PUT', '/backup', { blob, appV });
    if (r.ok) await kvSet('backupAt', Date.now());
    return r.ok;
  } catch { return false; }
}

// Pull + decrypt the cloud backup and merge it in (additive importAll). Returns
// { restored, counts } or { restored:false }. Used on a fresh/empty install.
export async function pullBackup() {
  try {
    const r = await signedFetch('GET', '/backup', null);
    if (r.status === 404) return { restored: false, reason: 'none' };
    if (!r.ok) return { restored: false, reason: 'http-' + r.status };
    const data = await r.json();
    if (!data.blob) return { restored: false, reason: 'empty' };
    const snapshot = await decryptBackup(data.blob);
    const counts = await importAll(snapshot);
    return { restored: true, counts, updatedAt: data.updatedAt };
  } catch (e) { return { restored: false, reason: String(e && e.message || e) }; }
}

// Is there a backup on the server for this identity? (cheap existence probe)
export async function hasCloudBackup() {
  try {
    const r = await signedFetch('GET', '/backup', null);
    return r.ok;
  } catch { return false; }
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
  const appliedGrants = []; // the grants that actually landed (for the reveal UI)
  const seen = new Set((await kvGet('grantsSeen', [])) || []);
  for (const g of data.grants || []) {
    if (seen.has(g.key)) continue; // belt AND suspenders next to award()'s key check
    if (await applyGrant(g)) { applied++; appliedGrants.push(g); }
    seen.add(g.key);
  }
  await kvSet('grantsSeen', [...seen].slice(-500));
  if (data.cursor && data.cursor !== since) await kvSet('grantCursor', data.cursor);
  return { applied, appliedGrants, grants: data.grants || [] };
}

/* ---------------- boot: auto-online + restore-once ---------------- */
// Cloud backup is ON for everyone by default (opt out via kv 'cloudOff'). At
// boot we silently ensure an account exists, then ONCE per install pull the
// encrypted backup down. On a fresh or wiped device 'bootRestored' is absent
// (it lived in the wiped DB), so this is exactly when a restore should happen;
// established devices already have the flag and skip the pull. importAll is
// additive, so even a redundant restore only merges identical rows.
// Returns { restored, counts? } so the caller can toast + refresh.
export async function bootSync() {
  try {
    if (await kvGet('cloudOff', false)) return { restored: false, reason: 'opted-out' };
    if (!(await apiBase())) return { restored: false, reason: 'no-api' };
    // ensure online (idempotent; ensureIdentity recovers the key from the OS
    // keychain first, so a wiped device comes back as the SAME account)
    if (!(await kvGet('social', null))) {
      const r = await goOnline();
      if (!r.ok) return { restored: false, reason: 'offline' };
    }
    if (await kvGet('bootRestored', false)) return { restored: false, reason: 'already' };
    const res = await pullBackup();
    await kvSet('bootRestored', true);
    return res;
  } catch (e) { return { restored: false, reason: String(e && e.message || e) }; }
}

// Opt out / back in to cloud backup.
export async function setCloudBackup(on) { await kvSet('cloudOff', !on); }
export async function cloudBackupOn() { return !(await kvGet('cloudOff', false)); }

/* ---------------- auto sync ---------------- */
// Called at boot/resume with a snapshot builder. Throttled; never throws.
// Also pushes the full encrypted backup (its own, slower throttle) so progress
// is always recoverable without the user ever tapping "Export".
const SYNC_THROTTLE_MS = 5 * 60 * 1000;
const BACKUP_THROTTLE_MS = 10 * 60 * 1000;
export async function autoSync(buildSnapshot, appV = '') {
  try {
    if (!(await isOnline())) return null;
    const now = Date.now();
    const lastBackup = (await kvGet('backupAt', 0)) || 0;
    if (now - lastBackup > BACKUP_THROTTLE_MS) await pushBackup(appV);
    const last = (await kvGet('socialSyncAt', 0)) || 0;
    if (now - last < SYNC_THROTTLE_MS) return null;
    await kvSet('socialSyncAt', now);
    const snapshot = await buildSnapshot();
    if (snapshot) await syncProfile(snapshot, appV);
    return await pullGrants();
  } catch { return null; }
}
