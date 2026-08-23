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

import { db, kvGet, kvSet, kvUpdate, exportAll, importAll, witnessServerDay } from './db.js';
import { awardOnce } from './game.js';
import { coinsAdd, grantCrate, grantConsumable, grantGear, boneDustAdd, grantEgg, grantPet } from './loot.js';

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
// Returns { ok, id }. `ok:false` means the vault could not be READ, which is a
// completely different thing from "the vault is empty" and the two must never be
// collapsed: an empty vault means mint a new identity, and doing that after a
// failed read is precisely how a live account gets replaced by a fresh one.
// Verified on Android 2026-07-28: the boot sequence really is get -> empty ->
// mint -> set, so a lying "empty" destroys the key on the very next line.
async function readKeychainIdentity() {
  const v = vaultPlugin();
  if (!v || !v.get) return { ok: true, id: null };      // browsers: no vault, not an error
  try {
    const r = await v.get({ key: 'identity' });
    if (r && r.error) return { ok: false, id: null };
    return { ok: true, id: r && r.value ? JSON.parse(r.value) : null };
  } catch { return { ok: false, id: null }; }
}

// Compare-and-set. Refuses to overwrite a DIFFERENT account's key, and refuses to
// write at all when the current contents are unknown. Adding aesJwk to the same
// bundle is fine (same privJwk.d); genuinely swapping accounts needs force, which
// only restoreWithPhrase passes.
async function mirrorIdentity(id, { force = false } = {}) {
  const v = vaultPlugin();
  if (!v || !v.set || !id?.privJwk?.d) return;
  try {
    if (!force) {
      const cur = await readKeychainIdentity();
      if (!cur.ok) return;                                // unknown contents: never blind-write
      if (cur.id?.privJwk?.d && cur.id.privJwk.d !== id.privJwk.d) {
        // Another account is in the vault. That is a recoverable account we would
        // otherwise erase, so leave it alone and record it for the UI to offer.
        await kvSet('vaultConflict', { at: Date.now() });
        return;
      }
    }
    await v.set({ key: 'identity', value: JSON.stringify(id) });
  } catch { /* best effort */ }
}

// Erasing this device has to clear the vault too. Without this, "Erase ALL data"
// wipes IndexedDB, the next boot reads the vault, and the account the player just
// deleted walks straight back in.
// What the device vault ACTUALLY holds and can do, for the Settings row. Null on
// the web, where there is no vault and there is nothing honest to claim.
export async function vaultStatus() {
  const v = vaultPlugin();
  if (!v) return null;
  let s = {};
  try { if (v.status) s = (await v.status()) || {}; } catch { /* report what we can */ }
  return { ...s, conflict: await kvGet('vaultConflict', null), unreadable: await kvGet('vaultUnreadable', 0) };
}

// The other account this phone's vault is holding, if mirrorIdentity refused to
// overwrite one. Returns null when there is no conflict.
export async function vaultOtherIdentity() {
  if (!(await kvGet('vaultConflict', null))) return null;
  const cur = await readKeychainIdentity();
  if (!cur.ok || !cur.id?.privJwk?.d) return null;
  const mine = await kvGet('identity', null);
  return cur.id.privJwk.d === mine?.privJwk?.d ? null : cur.id;
}

/* ONE-TIME BACKFILL for a vault that becomes available AFTER the account
   exists. ensureIdentity deliberately never mirrors on the happy path (a
   mirror-on-every-read once destroyed a good keychain entry), and the mint /
   restore sites are the only writers. That leaves exactly one hole, and iOS
   is standing in it as of the BhVault registration fix: every existing player
   has a local identity and an EMPTY, newly-visible vault, and nothing ever
   writes the mirror, so the plugin's whole purpose (surviving reinstalls)
   stays unmet for them. This closes it, with the same additive-only rules as
   everything else in this file:
     - writes ONLY when the vault read succeeded AND came back empty
     - an unreadable vault is never written (ok:false is not "empty")
     - a different account in the vault is left alone (mirrorIdentity's
       compare-and-set already refuses and records vaultConflict)
   Deps are injectable so the four cases are unit-testable without a browser. */
export async function backfillVaultMirror(deps = {}) {
  const read = deps.read || readKeychainIdentity;
  const mirror = deps.mirror || mirrorIdentity;
  const getId = deps.getId || (() => kvGet('identity', null));
  const id = await getId();
  if (!id?.privJwk?.d) return 'no-local';        // nothing to protect yet
  const kc = await read();
  if (!kc.ok) return 'unreadable';               // never conclude empty from a failed read
  if (kc.id?.privJwk?.d) {
    return kc.id.privJwk.d === id.privJwk.d ? 'already' : 'conflict';
  }
  await mirror(id);                              // CAS inside; empty vault -> write
  import('./analytics.js').then(a => a.track('vault_backfill')).catch(() => {});
  return 'written';
}

export async function forgetIdentity() {
  const v = vaultPlugin();
  try { if (v && v.remove) await v.remove({ key: 'identity' }); } catch { /* best effort */ }
}

async function ensureIdentity() {
  let id = await kvGet('identity', null);
  // Deliberately does NOT mirror on every read. It used to, and that is how a
  // freshly minted identity overwrote a good keychain entry seconds after a
  // reinstall, destroying the only key that could decrypt an existing backup.
  // The keychain is written exactly where a NEW key is created, or on restore.
  if (id && id.privJwk && id.pubJwk) return id;
  // Fresh or wiped install: recover the identity from the OS keychain BEFORE
  // minting a new one, so we come back as the same account (and can decrypt the
  // cloud backup) instead of starting over empty.
  let kc = await readKeychainIdentity();
  // A failed read is not an empty vault. Retry before concluding this is a new
  // player, because the alternative is silently abandoning a real account.
  for (let i = 0; !kc.ok && i < 3; i++) {
    await new Promise(r => setTimeout(r, 400 * (i + 1)));
    kc = await readKeychainIdentity();
  }
  if (kc.id && kc.id.privJwk && kc.id.pubJwk) {
    await kvSet('identity', kc.id);
    /* the moment the whole feature exists for: a wiped container came back as
       the SAME account. Reported (anonymously) so real-world reinstalls prove
       the net in D1 instead of anyone proving it by deleting their own app. */
    // dynamic: analytics.js imports FROM this module, so a static import here
    // would close a cycle (same trap cooking.js documents with poi.js)
    import('./analytics.js').then(a => a.track('vault_recover')).catch(() => {});
    return kc.id;
  }
  if (!kc.ok) await kvSet('vaultUnreadable', Date.now());  // surfaced in Settings; do NOT mirror below
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  id = {
    privJwk: await crypto.subtle.exportKey('jwk', kp.privateKey),
    pubJwk: await crypto.subtle.exportKey('jwk', kp.publicKey),
    createdAt: Date.now(),
  };
  await kvSet('identity', id);
  await mirrorIdentity(id);   // no-ops if the vault is unreadable or holds someone else
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
    await mirrorIdentity(id); // same key plus aesJwk, so compare-and-set allows it
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

/* EVERY REQUEST GETS A DEADLINE, BECAUSE A HANG IS NOT A FAILURE.
 *
 * Not one fetch in this file had a timeout. Every caller here is written for a
 * REJECTION ("catch { return { ok:false } }"), and a promise that never settles
 * is a different thing: the catch never runs, so the caller's failure copy never
 * runs either, and whatever the handler did before awaiting stays done forever.
 *
 * Measured 2026-08-17 against a server that accepts the request and never
 * answers (js/social.js unchanged, four separate controls, six seconds each and
 * still going):
 *   free gift        button stuck on "..."        disabled, no toast
 *   250-coin gift    coins 5000 -> 4750           refund never ran, no toast
 *   name save        button stuck on "Saving..."  disabled, no toast
 *   add a friend     button stuck on "..."        disabled, no toast
 * and an unrelated toast ("The Bone Merchant has an upgrade you can afford")
 * sitting on screen the whole time reading like success. That is the v373
 * "a failed write must not look like a saved meal" shape, on the network.
 *
 * A phone that loses signal mid-request does not get a TCP reset: the socket
 * just goes quiet, and Chrome will sit on it for minutes. So the deadline is
 * ours to set. 12s is long enough for one bar of LTE (the slowest honest
 * round trip measured against the live Worker is under 3s) and short enough
 * that a player is still looking at the screen when the answer comes.
 *
 * AbortController, not Promise.race: racing leaves the request in flight and
 * the socket open, so a screen that retries stacks connections. Aborting
 * rejects the fetch with an AbortError, which every catch in this file already
 * handles as "could not reach the server", which is exactly what it is.
 *
 * WHAT THIS DOES NOT FIX, stated plainly: a write whose answer is lost after
 * the server has acted is still ambiguous, and the client cannot tell it apart
 * from one that never landed. See the coin-gift note in js/app.js.
 */
export const API_DEADLINE_MS = 12000;
let deadlineMs = API_DEADLINE_MS;
/* Webdriver-gated, same pattern as __testFriends / __testApplyGrant. An audit
   that had to wait the real 12s four times over would be too slow to keep, and
   shrinking it exercises the SAME code path: if the deadline is ever removed
   this setter becomes a no-op and the audit's stuck-button rows go red. */
export function __setApiDeadline(ms) {
  if (typeof navigator !== 'undefined' && navigator.webdriver !== true) return false;
  deadlineMs = Math.max(1, Number(ms) || API_DEADLINE_MS);
  return true;
}

export function apiFetch(url, opts = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new DOMException('the server did not answer in time', 'TimeoutError')), deadlineMs);
  return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(t));
}

async function signedFetch(method, path, bodyObj = null) {
  const base = await apiBase();
  const me = await kvGet('social', null);
  if (!base || !me) throw new Error('offline');
  const body = bodyObj ? JSON.stringify(bodyObj) : '';
  const ts = Date.now();
  const key = await signingKey();
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${method}\n${path}\n${ts}\n${body}`));
  return apiFetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-bh-player': me.playerId, 'x-bh-ts': String(ts), 'x-bh-sig': b64(sig) },
    body: method === 'GET' ? undefined : body,
  });
}

/* ---------------- account ---------------- */
export async function isOnline() { return !!(await apiBase()) && !!(await kvGet('social', null)); }
export async function socialMe() { return kvGet('social', null); }

/* Is the server asking this player to rename? Returns the name we owe a change
   from, or null. Deliberately a live /me read rather than a grant: a grant is
   consumed exactly once, and the player this exists for is on an old build that
   would swallow the payload without understanding it and lose the flag forever.
   A field on their row survives that, and survives a reinstall. Fails soft: no
   network means no nag, which is the right way round for an apology. */
export async function renameOwed() {
  try {
    const r = await signedFetch('GET', '/me', null);
    if (!r || !r.ok) return null;
    const d = await r.json().catch(() => ({}));
    return d.renameOf || null;
  } catch { return null; }
}

// Opt in: register this device's pubkey. Re-running (or restoring a backup)
// returns the same account.
export async function goOnline() {
  const base = await apiBase();
  if (!base) return { ok: false, reason: 'no-api' };
  const id = await ensureIdentity();
  const r = await apiFetch(base + '/register', {
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
/* THE ONLY signedFetch CALLER IN THIS FILE THAT DID NOT CATCH.
   signedFetch REJECTS on no network (and throws 'offline' with no account), so on
   a dropped connection this threw straight out of the Save handler in
   openNameBuilder, which had already set the button to "Saving..." and disabled
   it. Nothing re-enabled it: the player was left holding a dead button with no
   toast and no explanation until they closed the sheet. Measured against a dead
   API port: unhandled rejection "Failed to fetch" at signedFetch, button stuck at
   Saving/disabled, zero toasts.
   The caller already has the right copy for a returned failure ("Could not save
   your name. Try again in a bit."), so the fix is to make the failure a RETURN
   like every sibling here rather than to teach one handler about throws. The
   whole body is inside it on purpose: an unreadable 200 body or a failed kvSet is
   also a name that did not save, and must not leave the button dead either. */
export async function setName(adj, noun, num) {
  try {
    const r = await signedFetch('POST', '/name', { adj, noun, num });
    // A 409 is a NAMED outcome (somebody already has this name), not a failure to
    // reach the server. Pass it through with the free number the server suggested
    // so the sheet can offer it, instead of a generic "could not save".
    if (r.status === 409) {
      const d = await r.json().catch(() => ({}));
      return { ok: false, reason: 'taken', name: d.name, suggestNum: d.suggestNum ?? null };
    }
    if (!r.ok) return { ok: false };
    const data = await r.json();
    const me = (await kvGet('social', null)) || {};
    me.name = data.name; await kvSet('social', me);
    // a rename we asked for is now satisfied; never ask again
    await kvSet('renameRequired', null);
    return { ok: true, name: data.name };
  } catch { return { ok: false }; }
}
/* `reached:false` means the request never got an answer, which is NOT the same
   news as "no Bonehead has that code" and must not borrow its copy. Measured
   2026-08-17 against a hanging server: the Add button came back with "No
   Bonehead has that code. Double-check it." for a code that was perfectly
   valid, sending the player off to re-read a code that was never the problem. */
export async function friendRequest(code) {
  try { const r = await signedFetch('POST', '/friends/request', { code }); const d = await r.json().catch(() => ({})); return { ok: r.ok, reached: true, ...d }; }
  catch { return { ok: false, reached: false }; }
}
export async function acceptFriend(id) { try { return (await signedFetch('POST', '/friends/accept', { id })).ok; } catch { return false; } }
export async function removeFriend(id) { try { return (await signedFetch('POST', '/friends/remove', { id })).ok; } catch { return false; } }

// Send a gift to a friend. mode 'free' = the once-a-day server-rolled gift;
// mode 'spend' = your own coins (the CALLER deducts locally first). The gift is
// delivered as a grant the friend reveals on their next open. Returns
// { ok, status, reward?, code? }.
export async function sendGift(toId, mode, coins) {
  try {
    const r = await signedFetch('POST', '/gift', { to: toId, mode, coins });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, ...d };
  } catch { return { ok: false }; }
}
// Send a preset cheer (index into the client-side CHEERS list; no free text).
export async function sendCheer(toId, cheer) {
  try {
    const r = await signedFetch('POST', '/cheer', { to: toId, cheer });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, ...d };
  } catch { return { ok: false }; }
}

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
/* "COULD NOT ASK" IS NOT "YOU HAVE NOBODY".
 *
 * This used to return an empty crew for BOTH, and the Crew tab renders an empty
 * crew as `#cfanEmpty`: "No Crew yet. Send a friend your code..." Measured
 * 2026-08-17 with three friends on the server and the API unreachable: the tab
 * read "YOUR CREW · 0" and told the player to go and make some friends. Their
 * crew looked deleted.
 *
 * The honest version of this already existed forty lines away in the same
 * screen: the leaderboard keeps `null` separate from `[]` and says "Could not
 * reach the Crew server. Tap to try again." on the same failure, in the same
 * render pass. Only the fan collapsed the two.
 *
 * `reached` rather than a null return, deliberately: every caller here reads
 * `.friends` / `.incoming` and would have to learn about null. This way the
 * shape is unchanged for all of them and the ones that need to tell the
 * difference ask. */
export async function listFriends() {
  let data;
  const unreached = { friends: [], incoming: [], outgoing: [], reached: false };
  try { const r = await signedFetch('GET', '/friends', null); if (!r.ok) return unreached; data = await r.json(); }
  catch { return unreached; }
  const aliases = (await kvGet('friendAliases', null)) || {};
  for (const bucket of ['friends', 'incoming', 'outgoing']) for (const f of (data[bucket] || [])) f.alias = aliases[f.playerId] || null;
  return { ...data, reached: true };
}

// Incoming friend requests that are NEW since the last check, for a one-time
// notification per requester. Records the current incoming set so we never
// re-notify. On the very first run (no baseline) it seeds silently so a
// restored account doesn't spam a notification for every pending request.
export async function newFriendRequests() {
  const data = await listFriends();
  /* A failed read must not become the new baseline. It used to: offline,
     `incoming` came back empty, `knownIncoming` was overwritten with [], and the
     next successful poll re-announced every pending request as new. One
     duplicate notification per drop, for requests the player had already seen. */
  if (data.reached === false) return { fresh: [], incoming: [], reached: false };
  const incoming = data.incoming || [];
  const ids = incoming.map(f => f.playerId);
  const prev = await kvGet('knownIncoming', null);
  await kvSet('knownIncoming', ids);
  if (prev === null) return { fresh: [], incoming };
  const known = new Set(prev);
  return { fresh: incoming.filter(f => !known.has(f.playerId)), incoming };
}

// The all-players leaderboard (ranked by level, server-side). Each row carries
// the player's friend code so the Crew tab can offer one-tap "add friend" —
// deliberate while the community is small: everyone can find everyone.
/* ---------------- Dark Spires: shared territory ----------------
   The server is the authority on WHO holds a spire; the client still decides
   where towers are and what they are called (both deterministic from the map
   cell), so these calls only ever move ownership. Every one fails soft: offline
   players keep playing against the local model rather than seeing an error. */

export async function fetchSpires(ids) {
  if (!ids.length) return null;
  // Most players are offline-only until they join the Crew. Ask first rather than
  // throwing and catching a request that was never going to be made.
  if (!(await isOnline())) return null;
  try {
    const r = await signedFetch('GET', `/spires?ids=${encodeURIComponent(ids.join(','))}`);
    if (!r.ok) return null;
    return (await r.json()).spires || [];
  } catch { return null; }
}

/** Take a spire. Returns {ok, tookFrom, level} or
 *  {ok:false, reason:'cap'|'shielded'|'server'|'offline'}. A 409 now carries WHICH
 *  rule refused it: the three-tower cap, or the 1h shield on a freshly taken
 *  tower. Reading the body matters because the two need different copy. */
export async function claimSpireRemote(spire) {
  try {
    const r = await signedFetch('PUT', `/spires/${encodeURIComponent(spire.id)}/claim`,
      { name: spire.name, lat: spire.lat, lng: spire.lng });
    if (r.status === 409) {
      const b = await r.json().catch(() => ({}));
      return { ok: false, reason: b.error === 'shielded' ? 'shielded' : 'cap', until: b.until || 0, cap: b.cap || 3 };
    }
    if (!r.ok) return { ok: false, reason: 'server' };
    return await r.json();
  } catch { return { ok: false, reason: 'offline' }; }
}

/** Every tower I hold, and the only route that can START a siege (the server
 *  creates one lazily here, so the 48h window always begins while I am looking).
 *  Returns null when offline, so callers keep the last known state. */
/* This week's step race. The server settles the previous week's prize on the
   first request of a new one, so simply opening the Crew tab is what pays the
   winner: no cron, and nothing to remember to run. */
export async function fetchStepRace(weekKey) {
  try {
    if (!(await isOnline())) return null;
    const r = await signedFetch('GET', `/steps/week?week=${encodeURIComponent(weekKey)}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/* THE PODIUM THAT WAS PAID, for a week that has already settled.
   Deliberately NOT fetchStepRace: that board filters on each player's CURRENT
   week, so a racer drops out of the week they won the moment they walk again.
   Measured on production 2026-08-14, seven days after the only settled race:
   three of the five players who were PAID had already vanished from it, and it
   returned three who never placed. This route reads the grant rows instead,
   which are the receipt and are never rewritten. */
export async function fetchSettledRace(weekKey) {
  try {
    if (!(await isOnline())) return null;
    const r = await signedFetch('GET', `/steps/settled?week=${encodeURIComponent(weekKey)}`);
    if (!r.ok) return null;
    return (await r.json()).podium || [];
  } catch { return null; }
}

export async function fetchMySpires() {
  try {
    if (!(await isOnline())) return null;
    const r = await signedFetch('GET', '/spires/mine');
    if (!r.ok) return null;
    return (await r.json()).spires || [];
  } catch { return null; }
}

/** Break a siege after winning the defense. {ok, level} or {ok:false, reason}. */
export async function defendSpireRemote(id) {
  try {
    const r = await signedFetch('POST', `/spires/${encodeURIComponent(id)}/defend`, {});
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      return { ok: false, reason: b.reason || 'server' };
    }
    return await r.json();
  } catch { return { ok: false, reason: 'offline' }; }
}

export async function tendSpireRemote(id) {
  try {
    const r = await signedFetch('POST', `/spires/${encodeURIComponent(id)}/tend`, {});
    return r.ok;
  } catch { return false; }
}

export async function leaderboard() {
  try {
    const r = await signedFetch('GET', '/leaderboard', null);
    if (!r.ok) return null;
    return (await r.json()).players || [];
  } catch { return null; }
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
    /* THE OPT-OUT IS A WRITE GUARD, NOT JUST A RESTORE ONE. `cloudOff` used to
       be read in exactly one place, bootSync's restore path, so Settings ->
       Cloud backup -> Off stopped the download and left the UPLOAD running on
       every boot and resume through autoSync. The player was told "your progress
       will only live on this phone" and privacy.html said the same. The save is
       end-to-end encrypted, so nothing readable was ever exposed, and that is
       the only reason this was a broken promise rather than a leak: somebody who
       opts out is not asking for their data to be unreadable, they are asking
       for it not to be sent.

       The guard is HERE and not in the callers because all four of them
       (autoSync, both Go Online buttons, the cbOn toggle) converge on the one
       `signedFetch('PUT', '/backup')` below, and gating any one caller would
       leave the other three open. cbOn sets the flag before it calls this, so
       turning backup back on still pushes immediately.
       tests/cloud-optout-audit.mjs, proven red against the missing guard. */
    if (await kvGet('cloudOff', false)) return false;
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
    /* `replace: false` PINS TODAY'S BEHAVIOUR HERE ON PURPOSE. importAll now
       defaults to a true restore (it clears each declared store first) so the
       Settings Import button cannot be farmed for coins. This path is not that
       button. It runs once per install from bootSync on a device that has
       nothing to clear, and from adoptIdentity on a device that may have a
       local save the cloud snapshot has never seen. Turning that one into a
       replace would delete local-only progress, which is a product call about
       account recovery and not a security fix. Left as the documented merge
       until Reg rules on it. */
    const counts = await importAll(snapshot, { replace: false });
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
/* A GIFT IS NOT A RECEIPT. Tom, 2026-08-08: "make it so that you have to open
   gifts from friends in the crew tab... theres an open animation. its boring to
   just have it appear with no fanfare or credit to the sender. otherwise
   deliveries reads like a receipt you'd get at a store."
   So a gift is HELD, sealed, until you open it by hand. Everything else (step
   race prizes, spire news, crew rewards) still applies on arrival: those are
   outcomes, not presents, and holding them would just be friction. */
const HELD_TYPES = new Set(['gift']);
const GIFTBOX = 'giftbox';

/* IDEMPOTENT ON THE KEY, NOT ON THE XP.
 *
 * The line below used to be:
 *     const xp = await award(key, ...);
 *     if (xp === 0 && p.xp > 0) return false;   // already ingested
 * and the intent in that comment is right. The implementation could not carry
 * it, because award() returns 0 for BOTH "already in the ledger" and "this
 * payload is worth 0 XP", and the only thing separating them was `p.xp > 0`.
 * So the guard was live for exactly the payloads that carry XP, and dead for
 * every payload that does not. Checked against what the server actually sends:
 *   /gift mode=spend   { coins }                      no xp
 *   /gift mode=free    { coins | crate | consumable } no xp
 *   step-race podium   { coins, dust, crate }         no xp
 *   /admin/grant       { coins|dust|pet|crate|
 *                        consumable|egg, note }       no xp   <- whose own
 *        header promises "an explicit key so a repeated call cannot pay twice"
 *   spire notices      { note }                       no xp
 *   social-welcome     { coins: 50, xp: 10 }          the ONLY protected one
 * Every gift, every prize and every make-good was therefore re-payable by any
 * client that ingested its grant row a second time. Measured 2026-08-17 with
 * two real accounts against a local Worker: a 100-coin gift, opened, then
 * re-delivered, took the recipient 1100 -> 1200.
 *
 * award() writes its ledger row unconditionally, xp 0 included, so the row IS
 * the durable receipt. Read it directly and the guard covers every payload
 * shape, including the ones that pay nothing but coins.
 *
 * AND READING IT IS NOT ENOUGH WHEN THERE ARE TWO OF YOU. Added 2026-08-17.
 * The v390 fix above was `if (await db.get('xp', key)) return false;` followed,
 * one await later, by the award that writes the row. That is a check and then
 * an act, and the gap between them is a window a second consumer walks
 * straight through. It does not need a re-delivery or a restore: the app open
 * in TWO TABS is enough, because pullGrants runs in both and both get the same
 * feed. Measured on two real pages sharing one database, both handed the same
 * 100-coin grant at the same instant: the ledger ended with exactly ONE row
 * for the key, which is what makes it invisible to a row count, and the player
 * ended with 200 coins. Every payload shape is affected, gifts, race prizes,
 * make-goods and welcome bonuses alike.
 *
 * awardOnce collapses the check and the act into one IndexedDB request
 * (db.addIfAbsent), so exactly one caller anywhere on the device is ever told
 * `claimed: true` for a key, and only that one runs the side effects below. */
async function applyPayload(key, type, p) {
  const claim = await awardOnce(key, type || 'social', p.xp || 0, p.note || 'From the Crew');
  if (!claim.claimed) return false;            // already ingested: skip side effects too
  if (p.coins) await coinsAdd(p.coins);
  if (p.dust) await boneDustAdd(p.dust);   // step-race podium pays dust; nothing else does yet
  if (p.crate) await grantCrate(p.crate, 'social');
  if (p.consumable) await grantConsumable(p.consumable, 'social');
  // `egg: 'ready'` hands over one that can be cracked immediately (goal 0)
  if (p.egg) await grantEgg('social', p.egg === 'ready' ? 0 : undefined);
  /* A PET BY NAME. The make-good arm: /admin/grant can hand a named player back
     a species they lost to a mistake or a bug, the Day One Lizard included, and
     this is the only way that can happen (a redeem code lives in the client
     bundle, so it would hand CX to everybody and destroy the exclusive).
     ALWAYS AN EXPLICIT ID, never 'random': the server's allowlist refuses it, so
     grantPet's exclusive filter on random grants is never reached from here and
     is left exactly as it is. grantPet is additive in both places ownership
     lives (a petInst copy plus the idempotent `cos` row) and only equips the pet
     if the companion slot is EMPTY, so a make-good can never displace the pet
     the player chose. */
  if (p.pet) await grantPet(p.pet, 'social');
  if (p.gearId) await grantGear(p.gearId, 'social');
  /* A rename we owe the player (2026-08-08). Two people held one name because
     /name had no uniqueness check. The later claimant by account age is asked to
     pick again, and the apology gift rides the same payload so it lands whether
     or not they read the notice. Stores the OLD name so the notice can say which
     name it is about, and so the check can no-op once they have changed it. */
  if (p.rename) await kvSet('renameRequired', String(p.rename));
  return true;
}

// Test hook: a grant normally arrives through pullGrants, which needs a live
// server. This is the same applyGrant the pull uses, so a test exercises the
// real path rather than a re-implementation of it.
export const __testApplyGrant = g => applyGrant(g);

/** Sealed gifts waiting to be opened, newest last. */
export async function giftBox() { return (await kvGet(GIFTBOX, [])) || []; }

/** Open one. Applies the reward at THIS moment, then hands back what was inside
 *  so the caller can play the reveal and name who sent it. */
export async function openGift(key) {
  /* Remove first: a double tap must not pay twice. The removal is now an
     atomic read-modify-write of the box, because `const box = await giftBox();
     ... await kvSet(GIFTBOX, box.filter(...))` is the same lost-update shape as
     everything else here: two tabs opening the same present both read the box
     with the gift in it, and each writes back a list computed from its own
     stale copy, so a SECOND sealed gift in the box could be resurrected by the
     loser's write. The payout itself is gated on applyPayload's atomic ledger
     claim, so only one of them can pay regardless. */
  let g = null;
  await kvUpdate(GIFTBOX, list => {
    const box = list || [];
    g = box.find(x => x.key === key) || null;
    return g ? box.filter(x => x.key !== key) : box;
  }, []);
  if (!g) return null;
  /* If applyPayload says no, this key was already ingested somewhere else and
     nothing was paid, so there is nothing to reveal and the caller must not
     play an unwrap for a present that paid nobody. */
  if (!await applyPayload(g.key, g.type, g.payload || {})) return null;
  return g;
}

async function applyGrant(g) {
  const p = g.payload || {};
  if (HELD_TYPES.has(g.type)) {
    /* A PRESENT YOU HAVE ALREADY OPENED IS NOT A NEW PRESENT. The box dedupes
       on key, but only against gifts still SEALED in it; openGift removes the
       row, so a re-delivered grant found an empty box and put the opened gift
       straight back, sealed, with an OPEN button on it. Same measurement as
       applyPayload above: the guard there stops the second payout, and this
       stops the ghost present that would now open onto nothing. The ledger row
       openGift wrote is the receipt for both. */
    if (await db.get('xp', g.key)) return false;
    /* Atomic, because both tabs pull the same feed at boot and each was writing
       back a box computed from its own stale read: the loser's write put the
       other tab's newly-sealed gift back out of existence, or duplicated this
       one. The dedupe now happens INSIDE the transaction, against whatever the
       box holds at that instant, so the list is exact however many tabs pull. */
    await kvUpdate(GIFTBOX, list => {
      const box = list || [];
      if (box.some(x => x.key === g.key)) return box;
      return [...box, { key: g.key, type: g.type, payload: p, ts: g.ts || Date.now() }].slice(-100);
    }, []);
    return true;    // it landed: it is in your box, sealed
  }
  return applyPayload(g.key, g.type, p);
}

export async function pullGrants() {
  const since = (await kvGet('grantCursor', 0)) || 0;
  const r = await signedFetch('GET', `/grants?since=${since}`);
  if (!r.ok) return { applied: 0 };
  const data = await r.json();
  let applied = 0, heldCount = 0;
  const appliedGrants = []; // the grants that actually landed (for the reveal UI)
  const seen = new Set((await kvGet('grantsSeen', [])) || []);
  const newlySeen = [];
  for (const g of data.grants || []) {
    if (seen.has(g.key)) continue; // belt AND suspenders next to the ledger claim
    if (await applyGrant(g)) {
      applied++;
      // a sealed gift is not "delivered" yet: keep it out of the boot reveal so
      // opening it in the Crew tab is still the first time you see what it is
      if (!HELD_TYPES.has(g.type)) appliedGrants.push(g);
      else heldCount++;
    }
    seen.add(g.key);
    newlySeen.push(g.key);
  }
  /* MERGE, DO NOT OVERWRITE. This was `kvSet('grantsSeen', [...seen])` built
     from a read taken before the loop, so a second tab pulling the same feed
     wrote back a list missing everything the first tab had added meanwhile.
     Measured with 30 additions across two tabs: 23 survived. A key that falls
     out of this list is a key the next pull re-ingests, which is exactly the
     re-delivery the ledger claim in applyPayload now has to catch on its own.
     Both layers are wanted: this one keeps the cheap check honest. */
  if (newlySeen.length) {
    await kvUpdate('grantsSeen', cur => {
      const merged = new Set(cur || []);
      for (const k of newlySeen) merged.add(k);
      return [...merged].slice(-500);
    }, []);
  }
  /* The cursor only ever moves FORWARD. Last write wins on a plain kvSet, and
     with two tabs pulling, the slower one's older cursor could land last and
     drag the feed back, re-delivering everything between. */
  if (data.cursor && data.cursor !== since) {
    await kvUpdate('grantCursor', cur => (Number(cur) || 0) > Number(data.cursor) ? cur : data.cursor, 0);
  }
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
/* ---------------- account recovery ----------------
   The backup above is encrypted with a key that lives in the device keychain.
   Delete the app and that key can go with it, and the backup is undecryptable
   forever. That is not theoretical: it destroyed a real level 27 account on
   2026-07-27. A recovery phrase wraps the identity bundle so the account can be
   rebuilt on ANY device. The phrase never leaves the phone; the server stores
   only ciphertext plus the KDF salt.

   Tom chose a USER-PICKED phrase over a generated code ("people will forget to
   save the ones you auto generate"). That is weaker, so it is defended with a
   length floor, a common-password blocklist, and a deliberately expensive KDF. */
// v231 raised both of these. A recovery id is CHOSEN, so unlike a random friend
// code it is guessable, which means anyone can pull down your wrapped bundle and
// attack it offline at their leisure. The phrase now has to carry the weight the
// friend code used to: longer, more than one word, and a KDF that costs about a
// second per guess instead of half of one.
export const RECOVERY_ITERS = 1000000;
export const RECOVERY_MIN_LEN = 12;
export const RECOVERY_ID_RE = /^[a-z0-9._-]{4,32}$/;   // keep in step with the Worker
// the phrases people actually reach for first; refusing them costs nothing
const WEAK_PHRASES = new Set(['password', 'password1', '12345678', '123456789', 'qwertyui', 'qwerty123',
  'iloveyou', 'letmein1', 'boneheadz', 'boneheads', 'football', 'baseball', 'sunshine', 'princess',
  'trustno1', 'starwars', 'whatever', 'superman', 'passw0rd', 'abc12345', 'welcome1',
  'password123', 'qwerty123456', 'iloveyou123', 'letmein12345', 'boneheadzgym']);

export function phraseProblem(phrase) {
  const p = String(phrase || '').trim();
  if (p.length < RECOVERY_MIN_LEN) return `Use at least ${RECOVERY_MIN_LEN} characters.`;
  if (WEAK_PHRASES.has(p.toLowerCase().replace(/\s+/g, ''))) return 'That one is too easy to guess. Pick something personal.';
  if (/^(.)\1+$/.test(p)) return 'Pick something less repetitive.';
  // Two words beats one long word by a mile, and it is a rule people can act on.
  // ponytail: a space-or-digit check, not a dictionary. Ship a wordlist only if
  // real phrases turn out to be single common words despite this.
  if (!/[\s\d]/.test(p)) return 'Use more than one word, or add a number. Two words you will remember beats one long one.';
  return null;
}

// A recovery id is public-ish, like a friend code. It is a lookup handle, not a
// secret; the phrase is the secret.
export function recoveryIdProblem(id) {
  const s = String(id || '').toLowerCase().trim();
  if (s.length < 4) return 'Use at least 4 characters.';
  if (s.length > 32) return 'Keep it under 32 characters.';
  if (!RECOVERY_ID_RE.test(s)) return 'Letters, numbers, dots, dashes and underscores only.';
  return null;
}

export async function recoveryIdAvailable(id) {
  const s = String(id || '').toLowerCase().trim();
  const base = await apiBase();
  if (!base || recoveryIdProblem(s)) return { ok: false };
  try {
    const r = await apiFetch(`${base}/recovery/available/${encodeURIComponent(s)}`);
    if (r.status === 429) return { ok: false, reason: 'Too many checks. Wait a minute.' };
    if (!r.ok) return { ok: false };
    return { ok: true, available: !!(await r.json()).available };
  } catch { return { ok: false }; }
}

const enc = new TextEncoder();

async function phraseKey(phrase, salt, iters) {
  const base = await crypto.subtle.importKey('raw', enc.encode(String(phrase).trim()), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iters, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// Wrap the identity bundle under the phrase and store the ciphertext server-side.
// recoveryId is the memorable handle the player restores BY. Optional only so an
// existing account can re-wrap without renaming itself.
export async function setRecoveryPhrase(phrase, recoveryId = null) {
  const bad = phraseProblem(phrase);
  if (bad) return { ok: false, reason: bad };
  const rid = recoveryId == null ? null : String(recoveryId).toLowerCase().trim();
  if (rid) {
    const badId = recoveryIdProblem(rid);
    if (badId) return { ok: false, reason: badId, field: 'id' };
  }
  if (!(await apiBase())) return { ok: false, reason: 'Not online yet.' };
  // Offline players are the MOST exposed (no cloud backup at all), so getting
  // them online is part of saving a phrase rather than a reason to refuse.
  if (!(await kvGet('social', null))) {
    const on = await goOnline();
    if (!on.ok) return { ok: false, reason: 'Could not get online to save it. Check your connection.' };
  }
  await ensureIdentity();
  await backupKey();                             // make sure aesJwk exists before wrapping
  const full = await kvGet('identity', null);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await phraseKey(phrase, salt, RECOVERY_ITERS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(full)));
  const wrapped = u8ToB64(new Uint8Array([...iv, ...new Uint8Array(ct)]));
  let r;
  try {
    r = await signedFetch('PUT', '/recovery', { wrapped, salt: u8ToB64(salt), iters: RECOVERY_ITERS, recoveryId: rid });
  } catch { return { ok: false, reason: 'Could not reach the server. Try again.' }; }
  // signedFetch hands back the raw Response, so a taken id arrives as 409, not a throw
  if (r && r.status === 409) return { ok: false, reason: 'That recovery ID is taken. Pick another.', field: 'id' };
  if (!r || !r.ok) return { ok: false, reason: 'Could not reach the server. Try again.' };
  await kvSet('recoverySetAt', Date.now());
  if (rid) await kvSet('recoveryId', rid);
  return { ok: true, recoveryId: rid || (await kvGet('recoveryId', null)), friendCode: (await kvGet('social', {}))?.friendCode || null };
}

export async function myRecoveryId() { return kvGet('recoveryId', null); }

export async function hasRecoveryPhrase() { return !!(await kvGet('recoverySetAt', 0)); }

// Rebuild the account on a fresh device: fetch the wrapped bundle by friend code,
// unwrap with the phrase, install the identity, then the normal backup pull works.
// handle is EITHER a recovery id (what everyone gets from v231 on) or a
// BONE-XXXX-XXXX friend code (what people who wrote theirs down already have).
export async function restoreWithPhrase(handle, phrase) {
  const input = String(handle || '').trim();
  const isCode = /^BONE-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(input.toUpperCase());
  if (!isCode && recoveryIdProblem(input)) {
    return { ok: false, reason: 'That does not look like a recovery ID or a friend code.' };
  }
  const url = isCode
    ? `/recovery/${encodeURIComponent(input.toUpperCase())}`
    : `/recovery/id/${encodeURIComponent(input.toLowerCase())}`;
  const base = await apiBase();
  if (!base) return { ok: false, reason: 'No connection.' };
  let meta;
  try {
    const res = await apiFetch(base + url);
    if (res.status === 429) return { ok: false, reason: 'Too many attempts. Wait a few minutes.' };
    if (!res.ok) return { ok: false, reason: `No account found for that ${isCode ? 'friend code' : 'recovery ID'}.` };
    meta = await res.json();
  } catch { return { ok: false, reason: 'Could not reach the server.' }; }
  let bundle;
  try {
    const raw = b64ToU8(meta.wrapped);
    const key = await phraseKey(phrase, b64ToU8(meta.salt), Number(meta.iters) || RECOVERY_ITERS);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
    bundle = JSON.parse(new TextDecoder().decode(pt));
  } catch { return { ok: false, reason: 'Wrong phrase for that account.' }; }
  if (!bundle || !bundle.privJwk || !bundle.pubJwk) return { ok: false, reason: 'That recovery data is damaged.' };
  if (!isCode) await kvSet('recoveryId', input.toLowerCase());   // so Settings can show it again
  return adoptIdentity(bundle);
}

// Become this identity and pull its save. Shared by phrase restore and by
// adopting the bundle the vault is already holding (vaultConflict), which needs
// no phrase because the key itself is right there.
export async function adoptIdentity(bundle) {
  if (!bundle || !bundle.privJwk || !bundle.pubJwk) return { ok: false, reason: 'That recovery data is damaged.' };
  await kvSet('identity', bundle);
  await mirrorIdentity(bundle, { force: true });   // deliberate account swap
  await kvSet('social', null);                   // re-register under the restored key
  await kvSet('bootRestored', false);            // let the backup pull run again
  await kvSet('vaultConflict', null);
  const on = await goOnline();
  if (!on.ok) return { ok: false, reason: 'Restored the key but could not go online.' };
  const pulled = await pullBackup();
  await kvSet('bootRestored', true);
  await kvSet('recoverySetAt', Date.now());
  return { ok: true, restored: !!(pulled && pulled.restored), counts: pulled && pulled.counts };
}

/* THE ONE CLOCK THE PLAYER CANNOT MOVE (js/db.js, RULE 3 of the day guard).
   `GET /health` is unsigned and takes no identity, which is the only reason it
   is usable for this: a device whose clock is a day out cannot make a SIGNED
   call at all, because verifySigned refuses a timestamp more than five minutes
   off, so the signed API goes dark at exactly the moment we most want to know
   what day it really is. Nothing is sent: no id, no body, no headers of ours.
   Fails soft in every direction (no api, no network, a 500, junk json), because
   the guard treats "we learned nothing" as "do not tighten the ceiling", never
   as a refusal. Deliberately NOT gated on cloudOff: opting out of cloud backup
   is a decision about the player's DATA, and letting it also switch off the
   ceiling would make "turn cloud off" the cheat this exists to stop. */
export async function touchServerDay() {
  const base = await apiBase();
  if (!base) return null;
  try {
    const r = await fetch(base + '/health', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return await witnessServerDay(j && j.ts);
  } catch { return null; }
}

export async function bootSync() {
  try {
    // before every gate below: the ceiling is not a cloud feature (see above)
    touchServerDay().catch(() => {});
    /* fire-and-forget, deliberately BEFORE the cloud gates below: the mirror
       backfill protects local-only players too (cloud off / no api), and it is
       a no-op everywhere except "readable empty vault + existing local id". */
    backfillVaultMirror().catch(() => {});
    if (await kvGet('cloudOff', false)) return { restored: false, reason: 'opted-out' };
    if (!(await apiBase())) return { restored: false, reason: 'no-api' };
    // ensure online (idempotent; ensureIdentity recovers the key from the OS
    // keychain first, so a wiped device comes back as the SAME account)
    if (!(await kvGet('social', null))) {
      // A brand-new install has no identity ANYWHERE. Never mint one here:
      // bootSync runs before the onboarding gate, and registering at that
      // moment filled the leaderboard with abandoned level-1 "players" (one
      // per install that never finished onboarding). New players register at
      // onboarding completion; a device with a prior identity (kv or
      // keychain) is a reinstall and still restores right here.
      const prior = await kvGet('identity', null);
      if (!(prior && prior.privJwk)) {
        const kc = await readKeychainIdentity();
        if (!(kc.id && kc.id.privJwk)) return { restored: false, reason: 'new-player' };
      }
      const r = await goOnline();
      if (!r.ok) return { restored: false, reason: 'offline' };
    }
    if (await kvGet('bootRestored', false)) return { restored: false, reason: 'already' };
    const res = await pullBackup();
    /* DO NOT BURN THE ONE-SHOT ON A FAILURE. This used to set bootRestored
       unconditionally, so a transient 500 or a dropped connection on the very
       first boot permanently forfeited the automatic cloud restore: the flag said
       "already restored" forever after, and the player silently kept an empty
       save with a perfectly good backup sitting on the server.

       The flag is a guard against restoring TWICE, so it should only be set once
       there is nothing left to restore: a success, or a definitive answer that no
       backup exists. Everything else (http-*, offline, a decrypt or import throw)
       is a maybe, and a maybe must be retried on the next boot. Retrying costs
       one GET at boot. */
    if (res.restored || res.reason === 'none' || res.reason === 'empty') await kvSet('bootRestored', true);
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
