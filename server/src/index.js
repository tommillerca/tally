// Boneheadz Gym social API. Cloudflare Worker + D1.
// Auth: every player-scoped request is signed by the device's ECDSA P-256 key
// (headers x-bh-player / x-bh-ts / x-bh-sig over "METHOD\nPATH\nTS\nBODY").
// No emails, no passwords, no PII: a pubkey IS the account.

const CORS = {
  'Access-Control-Allow-Origin': '*', // signature auth, no cookies: * is safe (and native WKWebView needs it)
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,x-bh-player,x-bh-ts,x-bh-sig,x-bh-admin',
  'Access-Control-Max-Age': '86400',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } });

const MAX_SKEW_MS = 5 * 60 * 1000;
const MAX_PROFILE_BYTES = 24 * 1024;
const MAX_BACKUP_BYTES = 4 * 1024 * 1024; // encrypted full save (food log grows over time)

/* ---------------- names + friend codes ----------------
   NAME_ADJ / NAME_NOUN power the curated name builder: the client sends INDICES,
   the server reconstructs the string from these lists. No free text ever crosses
   the wire, so no offensive names are possible and there is nothing to moderate.
   KEEP IN SYNC with tally/js/names.js (identical order). */
const ADJ = ['Rattling', 'Grim', 'Dusty', 'Creaky', 'Hollow', 'Marrow', 'Midnight', 'Restless', 'Crooked', 'Sturdy', 'Swift', 'Lucky', 'Feral', 'Ancient', 'Jolly', 'Sneaky', 'Iron', 'Cursed', 'Phantom', 'Rowdy', 'Chrome', 'Vicious', 'Gnarly', 'Wicked', 'Bony', 'Rugged', 'Shadow', 'Fresh', 'Savage', 'Brutal', 'Twisted', 'Jagged', 'Ragged', 'Grisly', 'Ghastly', 'Ghoulish', 'Spectral', 'Sinister', 'Vile', 'Rotten', 'Withered', 'Charred', 'Frozen', 'Blazing', 'Molten', 'Rusty', 'Frostbit', 'Toxic', 'Venomous', 'Rabid', 'Feisty', 'Reckless', 'Hungry', 'Ironclad', 'Swole', 'Ripped', 'Chiseled', 'Massive', 'Mighty', 'Beastly', 'Prowling', 'Nocturnal', 'Eerie', 'Murky', 'Gloomy', 'Silent', 'Menacing', 'Lurking', 'Snarling', 'Howling', 'Grinning', 'Neon', 'Golden', 'Obsidian', 'Cracked', 'Grave', 'Wretched', 'Thunderous', 'Stormy', 'Electric'];
const NOUN = ['Rex', 'Femur', 'Knuckles', 'Molar', 'Sternum', 'Tibia', 'Scapula', 'Phalange', 'Vertebrae', 'Clavicle', 'Patella', 'Mandible', 'Rib', 'Talus', 'Hyoid', 'Coccyx', 'Skull', 'Spine', 'Reaper', 'Ripper', 'Jawbone', 'Cranium', 'Gains', 'Crypt', 'Ghoul', 'Wraith', 'Fang', 'Hustle', 'Bruiser', 'Brawler', 'Slugger', 'Crusher', 'Basher', 'Smasher', 'Chomper', 'Gnasher', 'Stomper', 'Wrecker', 'Mauler', 'Ravager', 'Menace', 'Terror', 'Nightmare', 'Specter', 'Wight', 'Lich', 'Revenant', 'Banshee', 'Gargoyle', 'Golem', 'Titan', 'Brute', 'Fiend', 'Demon', 'Gremlin', 'Goblin', 'Warlock', 'Bonesaw', 'Skeleton', 'Bonehead', 'Ossuary', 'Casket', 'Coffin', 'Tombstone', 'Boneyard', 'Ribcage', 'Kneecap', 'Backbone', 'Humerus', 'Ulna', 'Pelvis', 'Sacrum', 'Fibula', 'Tusk', 'Claw', 'Talon', 'Horn', 'Spike', 'Deadlift', 'Pump'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L lookalikes

function randPick(arr) { return arr[crypto.getRandomValues(new Uint32Array(1))[0] % arr.length]; }
function makeHandle() { return `${randPick(ADJ)} ${randPick(NOUN)}`; }
// Reconstruct a curated name from indices. Returns null if out of range (tamper).
function buildName(a, n, num) {
  const adj = ADJ[a | 0], noun = NOUN[n | 0];
  if (!adj || !noun) return null;
  const suffix = (Number.isInteger(num) && num >= 0 && num <= 999) ? ` #${num}` : '';
  return `${adj} ${noun}${suffix}`;
}
function makeFriendCode() {
  const r = crypto.getRandomValues(new Uint8Array(8));
  const c = [...r].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `BONE-${c.slice(0, 4)}-${c.slice(4)}`;
}
function newId() { return crypto.randomUUID(); }
function pairKey(x, y) { return x < y ? [x, y] : [y, x]; } // canonical a<b for friendships

// The free daily friend-gift roll (server-authoritative so it can't be forged).
// Mostly coins, sometimes a crate/charm, rarely an egg.
function rollFreeGift() {
  const r = Math.random();
  if (r < 0.50) return { coins: [30, 50, 60, 75][Math.floor(Math.random() * 4)] };
  if (r < 0.80) return { crate: 'daily' };
  if (r < 0.93) return { consumable: 'xp2' };   // Battle Charm
  return { crate: 'egg' };
}

/* ---------------- recovery lookups ----------------
   A recovery id is a handle the player CHOOSES, so unlike a friend code it is
   guessable. Every unsigned recovery endpoint therefore shares one limiter, so
   adding a route can never accidentally ship an unthrottled way to harvest
   ciphertext. Keep this in step with RECOVERY_ID_RE in js/social.js. */
const RECOVERY_ID_RE = /^[a-z0-9._-]{4,32}$/;

/** Returns a 429 Response when the caller is over budget, else null.
 *  `bucket` matters: handing out CIPHERTEXT has to be tight, but an availability
 *  check only reveals whether a name is taken. They shared one counter at first,
 *  which meant a player trying four candidate IDs in the setup sheet spent half
 *  the budget that their actual restore needs. Separate buckets, separate costs. */
async function rateLimitRecovery(request, env, limit = 10, windowMs = 600000, bucket = 'rl_recovery') {
  // hash the IP: the events table holds anonymous ids by design, and a raw IP
  // log would be a privacy regression for an app that never uploads location
  const ipRaw = request.headers.get('cf-connecting-ip') || 'unknown';
  const ipHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode('bh-rl:' + ipRaw)))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  const hits = Number((await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM events WHERE device = ? AND name = ? AND ts > ?')
    .bind(ipHash, bucket, now - windowMs).first())?.n || 0);
  if (hits >= limit) return json({ error: 'too many attempts, try again later' }, 429);
  await env.DB.prepare('INSERT INTO events (device, name, props, app_v, day, ts) VALUES (?,?,?,?,?,?)')
    .bind(ipHash, bucket, '{}', '', new Date(now).toISOString().slice(0, 10), now).run().catch(() => {});
  return null;
}

/* ---------------- signature auth ---------------- */
async function verifySigned(request, env, bodyText) {
  const playerId = request.headers.get('x-bh-player');
  const ts = request.headers.get('x-bh-ts');
  const sig = request.headers.get('x-bh-sig');
  if (!playerId || !ts || !sig) return { err: 'missing auth headers' };
  if (Math.abs(Date.now() - Number(ts)) > MAX_SKEW_MS) return { err: 'stale timestamp' };
  const row = await env.DB.prepare('SELECT pubkey FROM players WHERE id = ?').bind(playerId).first();
  if (!row) return { err: 'unknown player' };
  const url = new URL(request.url);
  const msg = `${request.method}\n${url.pathname}${url.search}\n${ts}\n${bodyText || ''}`;
  try {
    const key = await crypto.subtle.importKey('jwk', JSON.parse(row.pubkey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sigBytes, new TextEncoder().encode(msg));
    return ok ? { playerId } : { err: 'bad signature' };
  } catch {
    return { err: 'bad signature' };
  }
}

/* ---------------- routes ---------------- */
// A spire untended this long is dormant and stops counting against the cap.
const SPIRE_DORMANT_MS = 7 * 86400000;
const SPIRE_SHIELD_MS = 3600000;         // 1h after a takeover, the tower cannot flip back
const SIEGE_WINDOW_MS = 48 * 3600000;   // time to walk there and break it
const SIEGE_COOLDOWN_MS = 7 * 86400000; // at most one siege per player per week
const SIEGE_CHANCE = 0.7;               // ...and not even every eligible week
// Graverise-flavour besiegers. Seeded per (spire, week) so the name is stable for
// everyone looking at the same siege, owner and rival alike.
const SIEGE_NAMES = ['Gravelord Mulch', 'The Rattling Choir', 'Sister Ossuary', 'Kiln the Unfed',
  'Marrowjaw', 'The Pale Tithe', 'Hollow Abbot Crane', 'Nine-Finger Vesper'];
function siegeNameFor(id, at) {
  let h = 2166136261;
  const key = `${id}:${Math.floor(at / SIEGE_COOLDOWN_MS)}`;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return SIEGE_NAMES[(h >>> 0) % SIEGE_NAMES.length];
}

/* Expire any siege whose 48h has run out. NEVER destructive: the tower is not
   lost, it is backdated into DORMANT, which is the state the whole client already
   understands (and which frees a cap slot). Idempotent: the grant key carries the
   window, and tended_at only ever moves backwards to the dormancy line. */
async function sweepSieges(env, rows, now) {
  const dead = (rows || []).filter(r => r.siege_until && r.siege_until < now);
  for (const r of dead) {
    // ONE value, used for the write AND for the object we hand back. Computing the
    // dormancy line in SQL and again in JS let the response describe a state the
    // database was not in, which is how a test can pass over a broken write.
    const dormantAt = Math.min(r.tended_at, now - SPIRE_DORMANT_MS);
    await env.DB.prepare(
      `UPDATE spires SET tended_at = ?, siege_until = NULL, siege_name = NULL, updated_at = ?
       WHERE id = ? AND siege_until IS NOT NULL`)
      .bind(dormantAt, now, r.id).run();
    await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
      .bind(r.owner, `siege-lost-${r.id}-${r.siege_until}`, 'spire', JSON.stringify({
        note: `${r.siege_name || 'The siege'} broke through at ${r.name}. It stands dormant, not lost: walk back and take it again.`,
      }), now).run();
    r.siege_until = null; r.siege_name = null; r.tended_at = dormantAt;
  }
  return rows;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    try {
      if (path === '/health') return json({ ok: true, ts: Date.now() });

      // Register a device pubkey -> player. Idempotent: re-registering the same
      // key (reinstall from backup) returns the existing account.
      if (path === '/register' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        const jwk = body && body.pubkey;
        if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) return json({ error: 'bad pubkey' }, 400);
        const pub = JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });
        const existing = await env.DB.prepare('SELECT id, handle, friend_code, name FROM players WHERE pubkey = ?').bind(pub).first();
        if (existing) return json({ playerId: existing.id, handle: existing.handle, friendCode: existing.friend_code, name: existing.name || null, existing: true });
        // retry on the (astronomically unlikely) friend-code collision
        for (let i = 0; i < 5; i++) {
          const id = newId(), handle = makeHandle(), code = makeFriendCode(), now = Date.now();
          try {
            await env.DB.prepare('INSERT INTO players (id, pubkey, handle, friend_code, created_at, last_seen) VALUES (?,?,?,?,?,?)')
              .bind(id, pub, handle, code, now, now).run();
            // welcome grant: a little hello the client ingests as a ledger event
            await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
              .bind(id, 'social-welcome', 'welcome', JSON.stringify({ coins: 50, xp: 10, note: 'Welcome to the Crew' }), now).run();
            return json({ playerId: id, handle, friendCode: code });
          } catch (e) {
            if (!String(e).includes('UNIQUE')) throw e;
          }
        }
        return json({ error: 'could not allocate friend code' }, 500);
      }

      // Signed: push the game-profile snapshot (never food data).
      if (path === '/profile' && request.method === 'PUT') {
        const bodyText = await request.text();
        if (bodyText.length > MAX_PROFILE_BYTES) return json({ error: 'profile too large' }, 413);
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const body = JSON.parse(bodyText || '{}');
        if (!body.snapshot || typeof body.snapshot !== 'object') return json({ error: 'missing snapshot' }, 400);
        const snap = JSON.stringify(body.snapshot);
        const nowP = Date.now();
        await env.DB.prepare('UPDATE players SET profile = ?, app_v = ?, last_seen = ? WHERE id = ?')
          .bind(snap, String(body.appV || ''), nowP, auth.playerId).run();
        // Keep every tower I hold defended by my CURRENT build. The snapshot used
        // to be frozen at claim time, so a rival months later fought the weaker
        // version of me that first took the spire. Cheap: indexed by owner.
        await env.DB.prepare('UPDATE spires SET defender = ?, updated_at = ? WHERE owner = ?')
          .bind(snap, nowP, auth.playerId).run();
        return json({ ok: true });
      }

      // Signed: store the full ENCRYPTED save backup (client-side AES-GCM; the
      // server never has the key and cannot read it). One row per player.
      if (path === '/backup' && request.method === 'PUT') {
        const bodyText = await request.text();
        if (bodyText.length > MAX_BACKUP_BYTES) return json({ error: 'backup too large' }, 413);
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const body = JSON.parse(bodyText || '{}');
        if (typeof body.blob !== 'string' || !body.blob) return json({ error: 'missing blob' }, 400);
        const now = Date.now();
        await env.DB.prepare('INSERT INTO backups (player_id, blob, app_v, size, updated_at) VALUES (?,?,?,?,?) ' +
          'ON CONFLICT(player_id) DO UPDATE SET blob=excluded.blob, app_v=excluded.app_v, size=excluded.size, updated_at=excluded.updated_at')
          .bind(auth.playerId, body.blob, String(body.appV || ''), body.blob.length, now).run();
        return json({ ok: true, updatedAt: now });
      }

      // Signed: pull the encrypted backup back down (fresh install / new phone).
      if (path === '/backup' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const row = await env.DB.prepare('SELECT blob, app_v, updated_at FROM backups WHERE player_id = ?').bind(auth.playerId).first();
        if (!row) return json({ error: 'no backup' }, 404);
        return json({ blob: row.blob, appV: row.app_v, updatedAt: row.updated_at });
      }

      /* ---------------- account recovery ----------------
         Why this exists: the backup above is encrypted with a key that lived
         ONLY in the device keychain. Delete the app and that key is gone, and
         the backup becomes undecryptable forever. That destroyed a real level 27
         account. A recovery phrase wraps the identity bundle client-side so the
         account can be rebuilt on any device. The server still only ever holds
         ciphertext plus a KDF salt: it cannot read a save, and it cannot help an
         attacker without also cracking the phrase. */

      // Signed: store (or replace) the wrapped identity bundle.
      if (path === '/recovery' && request.method === 'PUT') {
        const bodyText = await request.text();
        if (bodyText.length > 64 * 1024) return json({ error: 'too large' }, 413);
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const body = JSON.parse(bodyText || '{}');
        if (typeof body.wrapped !== 'string' || !body.wrapped) return json({ error: 'missing wrapped' }, 400);
        if (typeof body.salt !== 'string' || !body.salt) return json({ error: 'missing salt' }, 400);
        const iters = Number(body.iters) || 0;
        if (iters < 100000) return json({ error: 'weak kdf' }, 400);
        let rid = null;
        if (body.recoveryId != null && body.recoveryId !== '') {
          rid = String(body.recoveryId).toLowerCase().trim();
          if (!RECOVERY_ID_RE.test(rid)) return json({ error: 'bad recovery id' }, 400);
          const taken = await env.DB.prepare(
            'SELECT player_id FROM recovery WHERE recovery_id = ? AND player_id != ?')
            .bind(rid, auth.playerId).first();
          if (taken) return json({ error: 'that recovery id is taken' }, 409);
        }
        const now = Date.now();
        try {
          await env.DB.prepare(
            'INSERT INTO recovery (player_id, wrapped, salt, iters, updated_at, recovery_id) VALUES (?,?,?,?,?,?) ' +
            'ON CONFLICT(player_id) DO UPDATE SET wrapped=excluded.wrapped, salt=excluded.salt, ' +
            'iters=excluded.iters, updated_at=excluded.updated_at, ' +
            // keep the existing id when this call does not carry one
            'recovery_id=COALESCE(excluded.recovery_id, recovery.recovery_id)')
            .bind(auth.playerId, body.wrapped, body.salt, iters, now, rid).run();
        } catch (e) {
          // the unique index is the real guard; the SELECT above only races
          if (/UNIQUE|constraint/i.test(String(e))) return json({ error: 'that recovery id is taken' }, 409);
          throw e;
        }
        return json({ ok: true, updatedAt: now, recoveryId: rid });
      }

      // Is this recovery id free? Rate limited like the lookups, since it is an
      // unauthenticated probe of which handles exist.
      if (path.startsWith('/recovery/available/') && request.method === 'GET') {
        const rid = decodeURIComponent(path.slice('/recovery/available/'.length)).toLowerCase().trim();
        if (!RECOVERY_ID_RE.test(rid)) return json({ error: 'bad recovery id' }, 400);
        // Its own generous bucket: the setup sheet checks as you type, and this
        // must never eat the budget a real restore depends on.
        const limited = await rateLimitRecovery(request, env, 60, 600000, 'rl_ridcheck');
        if (limited) return limited;
        const row = await env.DB.prepare('SELECT 1 AS x FROM recovery WHERE recovery_id = ?').bind(rid).first();
        return json({ available: !row });
      }

      // UNSIGNED, same bargain as the friend-code lookup below: hands out
      // ciphertext to whoever knows the handle. A recovery id is CHOSEN, so it is
      // more guessable than a random friend code, which is exactly why the client
      // requires a longer phrase and a heavier KDF before it will attach one.
      if (path.startsWith('/recovery/id/') && request.method === 'GET') {
        const rid = decodeURIComponent(path.slice('/recovery/id/'.length)).toLowerCase().trim();
        if (!RECOVERY_ID_RE.test(rid)) return json({ error: 'bad recovery id' }, 400);
        const limited = await rateLimitRecovery(request, env);
        if (limited) return limited;
        const row = await env.DB.prepare(
          'SELECT wrapped, salt, iters FROM recovery WHERE recovery_id = ?').bind(rid).first();
        if (!row) return json({ error: 'no account' }, 404);
        return json({ wrapped: row.wrapped, salt: row.salt, iters: row.iters });
      }

      // Signed: has this account got a recovery phrase yet? (drives the nag)
      if (path === '/recovery' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const row = await env.DB.prepare('SELECT updated_at FROM recovery WHERE player_id = ?').bind(auth.playerId).first();
        return json({ set: !!row, updatedAt: row ? row.updated_at : null });
      }

      // UNSIGNED by necessity: a device restoring an account has no key yet, so
      // it cannot sign. Looked up by friend code, which is semi-public, so this
      // hands out ciphertext to anyone who knows a code. That is acceptable only
      // because the phrase is never sent and the wrap is PBKDF2-hardened, but it
      // does mean an offline attack is possible, so it is rate limited per IP.
      if (path.startsWith('/recovery/') && request.method === 'GET') {
        const code = decodeURIComponent(path.slice('/recovery/'.length)).toUpperCase().trim();
        if (!/^BONE-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return json({ error: 'bad code' }, 400);
        const limited = await rateLimitRecovery(request, env);
        if (limited) return limited;
        const p = await env.DB.prepare('SELECT id FROM players WHERE friend_code = ?').bind(code).first();
        if (!p) return json({ error: 'no account' }, 404);
        const row = await env.DB.prepare('SELECT wrapped, salt, iters FROM recovery WHERE player_id = ?').bind(p.id).first();
        if (!row) return json({ error: 'no recovery set' }, 404);
        return json({ wrapped: row.wrapped, salt: row.salt, iters: row.iters });
      }

      // Signed: pull server-issued ledger events (idempotent on the client by key).
      if (path === '/grants' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const since = Number(url.searchParams.get('since') || 0);
        const rows = await env.DB.prepare('SELECT id, key, type, payload, ts FROM grants WHERE player_id = ? AND id > ? ORDER BY id LIMIT 50')
          .bind(auth.playerId, since).all();
        const grants = (rows.results || []).map(r => ({ id: r.id, key: r.key, type: r.type, payload: JSON.parse(r.payload), ts: r.ts }));
        return json({ grants, cursor: grants.length ? grants[grants.length - 1].id : since });
      }

      // Signed: set your display name from curated indices (no free text -> no
      // moderation). Server reconstructs the string from its own word lists.
      if (path === '/name' && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const b = JSON.parse(bodyText || '{}');
        const name = buildName(b.adj, b.noun, b.num);
        if (!name) return json({ error: 'bad name indices' }, 400);
        await env.DB.prepare('UPDATE players SET name = ?, last_seen = ? WHERE id = ?').bind(name, Date.now(), auth.playerId).run();
        return json({ ok: true, name });
      }

      // Signed: request a friend by their friend code. If they already requested
      // you, this accepts. Idempotent.
      if (path === '/friends/request' && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const code = String((JSON.parse(bodyText || '{}').code) || '').toUpperCase().trim();
        const target = await env.DB.prepare('SELECT id FROM players WHERE friend_code = ?').bind(code).first();
        if (!target) return json({ error: 'no player with that code' }, 404);
        if (target.id === auth.playerId) return json({ error: 'that is your own code' }, 400);
        const [a, b] = pairKey(auth.playerId, target.id);
        const ex = await env.DB.prepare('SELECT status, requested_by FROM friendships WHERE a = ? AND b = ?').bind(a, b).first();
        const now = Date.now();
        if (ex && ex.status === 'accepted') return json({ ok: true, status: 'accepted' });
        if (ex && ex.requested_by !== auth.playerId) { // they already asked me -> accept
          await env.DB.prepare('UPDATE friendships SET status = ? , ts = ? WHERE a = ? AND b = ?').bind('accepted', now, a, b).run();
          return json({ ok: true, status: 'accepted' });
        }
        if (!ex) await env.DB.prepare('INSERT INTO friendships (a, b, status, requested_by, ts) VALUES (?,?,?,?,?)').bind(a, b, 'pending', auth.playerId, now).run();
        return json({ ok: true, status: 'pending' });
      }

      // Signed: accept an incoming request.
      if (path === '/friends/accept' && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const other = String(JSON.parse(bodyText || '{}').id || '');
        const [a, b] = pairKey(auth.playerId, other);
        const ex = await env.DB.prepare('SELECT requested_by FROM friendships WHERE a = ? AND b = ?').bind(a, b).first();
        if (!ex) return json({ error: 'no such request' }, 404);
        if (ex.requested_by === auth.playerId) return json({ error: 'cannot accept your own request' }, 400);
        await env.DB.prepare('UPDATE friendships SET status = ?, ts = ? WHERE a = ? AND b = ?').bind('accepted', Date.now(), a, b).run();
        return json({ ok: true });
      }

      // Signed: remove a friend / decline a request.
      if (path === '/friends/remove' && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const [a, b] = pairKey(auth.playerId, String(JSON.parse(bodyText || '{}').id || ''));
        await env.DB.prepare('DELETE FROM friendships WHERE a = ? AND b = ?').bind(a, b).run();
        return json({ ok: true });
      }

      // Signed: my friends + pending, each with the other player's public profile.
      if (path === '/friends' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const rows = await env.DB.prepare(
          'SELECT f.a, f.b, f.status, f.requested_by, f.ts, ' +
          'pa.handle a_handle, pa.name a_name, pa.friend_code a_code, pa.profile a_profile, pa.app_v a_v, pa.last_seen a_seen, ' +
          'pb.handle b_handle, pb.name b_name, pb.friend_code b_code, pb.profile b_profile, pb.app_v b_v, pb.last_seen b_seen ' +
          'FROM friendships f JOIN players pa ON pa.id = f.a JOIN players pb ON pb.id = f.b ' +
          'WHERE f.a = ? OR f.b = ? ORDER BY f.ts DESC LIMIT 100').bind(auth.playerId, auth.playerId).all();
        const friends = [], incoming = [], outgoing = [];
        for (const r of rows.results || []) {
          const meIsA = r.a === auth.playerId;
          const other = {
            playerId: meIsA ? r.b : r.a,
            name: (meIsA ? r.b_name : r.a_name) || (meIsA ? r.b_handle : r.a_handle),
            handle: meIsA ? r.b_handle : r.a_handle,
            friendCode: meIsA ? r.b_code : r.a_code,
            appV: meIsA ? r.b_v : r.a_v,
            profile: (() => { try { return JSON.parse(meIsA ? r.b_profile : r.a_profile); } catch { return null; } })(),
            since: r.ts,
            lastSeen: meIsA ? r.b_seen : r.a_seen,
          };
          if (r.status === 'accepted') friends.push(other);
          else if (r.requested_by === auth.playerId) outgoing.push(other);
          else incoming.push(other);
        }
        return json({ friends, incoming, outgoing });
      }

      /* ---------------- Dark Spires: shared territory ----------------
         Ownership has to live here or a spire means something different on every
         phone. Unclaimed spires have NO row, matching the client's local model,
         so "nobody has taken it" needs no bookkeeping. The client still owns
         placement and naming (both deterministic from the map cell), so the
         server never invents a tower. */

      /* Every tower I hold, and the ONLY place a siege is ever created.
         WHY LAZILY, HERE, instead of a cron: there is no server-to-device push
         channel in this project at all (notifications are scheduled on-device).
         A cron could start a 48h siege while the app was closed and burn the whole
         window in silence, which is unwinnable-by-design. Creating it at the moment
         the owner checks in guarantees they see the full 48 hours. It also means a
         player on an OLD build is simply never besieged, because old clients never
         call this route: nobody gets a timer they cannot see. */
      if (path === '/spires/mine' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const now = Date.now();
        const rs = await env.DB.prepare(
          `SELECT id, name, lat, lng, owner, owner_name, claimed_at, tended_at, level, siege_until, siege_name
             FROM spires WHERE owner = ?`).bind(auth.playerId).all();
        let rows = await sweepSieges(env, rs.results || [], now);

        // Eligible: I hold a live tower, none of them is already under siege, and
        // my weekly cooldown has passed. Then a roll, so it is not a chore.
        const live = rows.filter(r => r.tended_at > now - SPIRE_DORMANT_MS);
        const besieged = rows.some(r => r.siege_until && r.siege_until > now);
        const me = await env.DB.prepare('SELECT siege_last FROM players WHERE id = ?').bind(auth.playerId).first();
        const cooled = !me?.siege_last || (now - me.siege_last) >= SIEGE_COOLDOWN_MS;
        // DEV-only: force the roll so a test can exercise CREATION deterministically
        // (eligibility and target choice are the logic worth testing; the dice are
        // not). Never available in production.
        const forced = env.DEV === '1' && url.searchParams.get('force') === '1';
        if (live.length && !besieged && cooled && (forced || Math.random() < SIEGE_CHANCE)) {
          // the least-recently-tended tower: deterministic (so it is testable) and
          // it nudges the weekly circuit toward the one being neglected
          const target = live.slice().sort((a, b) => a.tended_at - b.tended_at)[0];
          const until = now + SIEGE_WINDOW_MS;
          const nm = siegeNameFor(target.id, now);
          await env.DB.batch([
            env.DB.prepare('UPDATE spires SET siege_until = ?, siege_name = ?, updated_at = ? WHERE id = ? AND owner = ?')
              .bind(until, nm, now, target.id, auth.playerId),
            env.DB.prepare('UPDATE players SET siege_last = ? WHERE id = ?').bind(now, auth.playerId),
          ]);
          rows = rows.map(r => r.id === target.id ? { ...r, siege_until: until, siege_name: nm } : r);
        }
        return json({
          spires: rows.map(r => ({
            id: r.id, name: r.name, lat: r.lat, lng: r.lng, level: r.level || 1,
            claimedAt: r.claimed_at, tendedAt: r.tended_at,
            siegeUntil: r.siege_until || null, siegeName: r.siege_name || null,
          })),
        });
      }

      // Break a siege. Owner only, and only while the window is actually open: a
      // repelled siege LEVELS the tower, which is what makes level mean something.
      if (path.startsWith('/spires/') && path.endsWith('/defend') && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const id = path.slice('/spires/'.length, -'/defend'.length);
        if (!/^sp-[-0-9]+-[-0-9]+$/.test(id)) return json({ error: 'bad spire id' }, 400);
        const now = Date.now();
        const row = await env.DB.prepare('SELECT owner, siege_until, level FROM spires WHERE id = ?').bind(id).first();
        if (!row || row.owner !== auth.playerId) return json({ ok: false, reason: 'not-yours' }, 403);
        if (!row.siege_until || row.siege_until < now) return json({ ok: false, reason: 'no-siege' }, 409);
        await env.DB.prepare(
          `UPDATE spires SET siege_until = NULL, siege_name = NULL, tended_at = ?, level = level + 1, updated_at = ?
             WHERE id = ? AND owner = ?`).bind(now, now, id, auth.playerId).run();
        return json({ ok: true, level: (row.level || 1) + 1 });
      }

      // Who holds these spires? ids come from the client's local cell scan.
      if (path === '/spires' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const ids = (url.searchParams.get('ids') || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 24);
        if (!ids.length) return json({ spires: [] });
        const q = `SELECT id, name, owner, owner_name, defender, claimed_at, tended_at, level, siege_until, siege_name FROM spires WHERE id IN (${ids.map(() => '?').join(',')})`;
        const rs = await env.DB.prepare(q).bind(...ids).all();
        // a rival walking past a besieged tower should see it under siege too
        const swept = await sweepSieges(env, rs.results || [], Date.now());
        return json({
          spires: swept.map(r => ({
            id: r.id, name: r.name, owner: r.owner, ownerName: r.owner_name,
            siegeUntil: r.siege_until || null, siegeName: r.siege_name || null,
            claimedAt: r.claimed_at,          // so a rival's tower can show its age
            mine: r.owner === auth.playerId,
            defender: r.owner === auth.playerId ? null : JSON.parse(r.defender || 'null'),
            claimedAt: r.claimed_at, tendedAt: r.tended_at, level: r.level,
          })),
        });
      }

      // Take one. The client has already won the fight locally (same trust model
      // as every other award in this game, friends-scale, stated plainly).
      if (path.startsWith('/spires/') && path.endsWith('/claim') && request.method === 'PUT') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const id = path.slice('/spires/'.length, -'/claim'.length);
        if (!/^sp-[-0-9]+-[-0-9]+$/.test(id)) return json({ error: 'bad spire id' }, 400);
        const b = JSON.parse(bodyText || '{}');
        if (!b.name || typeof b.lat !== 'number' || typeof b.lng !== 'number') return json({ error: 'missing spire' }, 400);
        const now = Date.now();
        const me = await env.DB.prepare('SELECT id, name, handle, profile FROM players WHERE id = ?').bind(auth.playerId).first();
        const prev = await env.DB.prepare('SELECT owner, owner_name, level, claimed_at FROM spires WHERE id = ?').bind(id).first();
        // SHIELD: a tower just taken cannot be taken straight back. Two friends at
        // one corner could otherwise ping-pong a spire for 80 coins a pass, and
        // spire fights are free. Derived from claimed_at, so no new column.
        if (prev && prev.owner !== auth.playerId && (prev.claimed_at || 0) > now - SPIRE_SHIELD_MS) {
          return json({ error: 'shielded', until: (prev.claimed_at || 0) + SPIRE_SHIELD_MS }, 409);
        }
        if (prev && prev.owner === auth.playerId) {
          await env.DB.prepare('UPDATE spires SET tended_at = ?, updated_at = ?, defender = ? WHERE id = ?')
            .bind(now, now, me.profile || null, id).run();
          return json({ ok: true, already: true, level: prev.level || 1 });
        }
        // Cap: three live spires each, enforced HERE too. A client-only cap is a
        // suggestion, and this is the rule that keeps towers available to others.
        const held = await env.DB.prepare('SELECT COUNT(*) AS n FROM spires WHERE owner = ? AND tended_at > ?')
          .bind(auth.playerId, now - SPIRE_DORMANT_MS).first();
        if ((held?.n || 0) >= 3) return json({ error: 'cap', cap: 3 }, 409);
        await env.DB.prepare(`INSERT INTO spires (id, name, lat, lng, owner, owner_name, defender, claimed_at, tended_at, level, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, owner=excluded.owner, owner_name=excluded.owner_name,
               defender=excluded.defender, claimed_at=excluded.claimed_at, tended_at=excluded.tended_at,
               level=spires.level+1, updated_at=excluded.updated_at`)
          .bind(id, String(b.name).slice(0, 40), b.lat, b.lng, auth.playerId, me?.name || me?.handle || null,
                me?.profile || null, now, now, 1, now).run();
        // Tell the loser, through the grants channel the client already ingests.
        if (prev && prev.owner !== auth.playerId) {
          await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
            .bind(prev.owner, `spire-lost-${id}-${now}`, 'spire', JSON.stringify({
              note: `${me?.name || me?.handle || 'Someone'} toppled ${b.name}. Walk back and take it.`,
            }), now).run();
        }
        // the level AFTER this write is the number the client must mirror: a fresh
        // claim is 1, a takeover is the previous level + 1
        const lvl = prev ? (prev.level || 1) + 1 : 1;
        return json({ ok: true, tookFrom: prev ? (prev.owner_name || 'someone') : null, level: lvl });
      }

      // A visit restores resolve. Owner only.
      if (path.startsWith('/spires/') && path.endsWith('/tend') && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const id = path.slice('/spires/'.length, -'/tend'.length);
        if (!/^sp-[-0-9]+-[-0-9]+$/.test(id)) return json({ error: 'bad spire id' }, 400);
        const now = Date.now();
        const r = await env.DB.prepare('UPDATE spires SET tended_at = ?, updated_at = ? WHERE id = ? AND owner = ?')
          .bind(now, now, id, auth.playerId).run();
        return json({ ok: !!(r.meta?.changes) });
      }

      // Signed: the all-players leaderboard. Ranked by snapshot level. Includes
      // each player's friend code so anyone can add anyone straight from the
      // board (deliberate while the community is small — codes are share-keys,
      // not secrets, and names are curated so there's no PII here).
      if (path === '/leaderboard' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const rows = await env.DB.prepare(
          `SELECT id, handle, name, friend_code,
                  CAST(COALESCE(json_extract(profile,'$.level'), 1) AS INTEGER) lvl,
                  json_extract(profile,'$.levelName') lvlName,
                  CAST(COALESCE(json_extract(profile,'$.badges'), 0) AS INTEGER) badges,
                  json_extract(profile,'$.outfit') outfit,
                  json_extract(profile,'$.pet') pet,
                  last_seen,
                  (SELECT COUNT(*) FROM spires sp WHERE sp.owner = players.id AND sp.tended_at > ?) spires,
                  (SELECT COALESCE(SUM(? - sp.claimed_at), 0) FROM spires sp WHERE sp.owner = players.id AND sp.tended_at > ?) held_ms
           FROM players
           WHERE profile IS NOT NULL -- a registration that never synced a snapshot COALESCEs to a level-1 "bot"; hide it
           ORDER BY lvl DESC, badges DESC, last_seen DESC LIMIT 100`)
          .bind(Date.now() - SPIRE_DORMANT_MS, Date.now(), Date.now() - SPIRE_DORMANT_MS).all();
        const players = (rows.results || []).map(r => ({
          playerId: r.id,
          name: r.name || r.handle,
          level: r.lvl || 1,
          levelName: r.lvlName || null,
          badges: r.badges || 0,
          outfit: (() => { try { return r.outfit ? JSON.parse(r.outfit) : null; } catch { return null; } })(), // cosmetic ids only; art renders client-side
          pet: (() => { try { return r.pet ? JSON.parse(r.pet) : null; } catch { return null; } })(), // {id, level, shiny, lineage}: the board must show a shiny as its shiny
          friendCode: r.friend_code,
          lastSeen: r.last_seen,
          spires: r.spires || 0,
          spireDays: Math.floor((r.held_ms || 0) / 86400000),
          you: r.id === auth.playerId,
        }));
        return json({ players });
      }

      // Signed: send a gift to an accepted friend. mode 'free' = one server-rolled
      // gift per friend per day; mode 'spend' = the sender's own coins (client
      // deducts locally), capped 5/friend/day + 1000/gift. Delivered as a grant so
      // it rides the recipient's normal reward-reveal on their next open.
      if (path === '/gift' && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const bd = JSON.parse(bodyText || '{}');
        const to = String(bd.to || '');
        const mode = bd.mode === 'spend' ? 'spend' : 'free';
        if (!to || to === auth.playerId) return json({ error: 'bad recipient' }, 400);
        const [a, b] = pairKey(auth.playerId, to);
        const fr = await env.DB.prepare('SELECT status FROM friendships WHERE a = ? AND b = ?').bind(a, b).first();
        if (!fr || fr.status !== 'accepted') return json({ error: 'not friends' }, 403);
        const me = await env.DB.prepare('SELECT handle, name FROM players WHERE id = ?').bind(auth.playerId).first();
        const fromName = (me && (me.name || me.handle)) || 'A Bonehead';
        const day = new Date(Date.now()).toISOString().slice(0, 10);
        let reward, key, note;
        if (mode === 'free') {
          key = `gift-free-${auth.playerId}-${day}`;
          const existed = await env.DB.prepare('SELECT 1 FROM grants WHERE player_id = ? AND key = ?').bind(to, key).first();
          if (existed) return json({ error: 'already sent today', code: 'daily-done' }, 409);
          reward = rollFreeGift();
          note = `${fromName} sent you a gift!`;
        } else {
          const coins = Math.max(1, Math.min(1000, Math.floor(bd.coins || 0)));
          // prefix-range count (no LIKE: playerIds contain '_', a LIKE wildcard)
          const pfx = `gift-spend-${auth.playerId}-${day}-`;
          const cnt = await env.DB.prepare('SELECT COUNT(*) n FROM grants WHERE player_id = ? AND key >= ? AND key < ?').bind(to, pfx, pfx + '￿').first();
          const n = (cnt && cnt.n) || 0;
          if (n >= 5) return json({ error: 'daily spend-gift limit', code: 'limit' }, 429);
          key = `gift-spend-${auth.playerId}-${day}-${n}`;
          reward = { coins };
          note = `${fromName} sent you ${coins} coins!`;
        }
        const payload = JSON.stringify({ ...reward, from: fromName, note, gift: true, mode });
        await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)').bind(to, key, 'gift', payload, Date.now()).run();
        return json({ ok: true, reward, mode });
      }

      // Signed: send a preset cheer/emote to an accepted friend. Index into a
      // client-side phrase list (no free text = nothing to moderate). Capped
      // 10/friend/day. Delivered as a reward-less grant.
      if (path === '/cheer' && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const bd = JSON.parse(bodyText || '{}');
        const to = String(bd.to || '');
        const cheer = Math.floor(Number(bd.cheer));
        if (!to || to === auth.playerId) return json({ error: 'bad recipient' }, 400);
        if (!(cheer >= 0 && cheer < 64)) return json({ error: 'bad cheer' }, 400);
        const [a, b] = pairKey(auth.playerId, to);
        const fr = await env.DB.prepare('SELECT status FROM friendships WHERE a = ? AND b = ?').bind(a, b).first();
        if (!fr || fr.status !== 'accepted') return json({ error: 'not friends' }, 403);
        const me = await env.DB.prepare('SELECT handle, name FROM players WHERE id = ?').bind(auth.playerId).first();
        const fromName = (me && (me.name || me.handle)) || 'A Bonehead';
        const day = new Date(Date.now()).toISOString().slice(0, 10);
        const pfx = `cheer-${auth.playerId}-${day}-`;
        const cnt = await env.DB.prepare('SELECT COUNT(*) n FROM grants WHERE player_id = ? AND key >= ? AND key < ?').bind(to, pfx, pfx + '￿').first();
        const n = (cnt && cnt.n) || 0;
        if (n >= 10) return json({ error: 'daily cheer limit', code: 'limit' }, 429);
        const key = `cheer-${auth.playerId}-${day}-${n}`;
        const payload = JSON.stringify({ from: fromName, cheer, cheerFrom: auth.playerId, note: `${fromName} cheered you` });
        await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)').bind(to, key, 'cheer', payload, Date.now()).run();
        return json({ ok: true });
      }

      // Signed: who am I (handle/code/name lookup, used by the client after restore).
      if (path === '/me' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const row = await env.DB.prepare('SELECT handle, friend_code, name, created_at FROM players WHERE id = ?').bind(auth.playerId).first();
        return json({ handle: row.handle, friendCode: row.friend_code, name: row.name || null, createdAt: row.created_at });
      }

      // Anonymous analytics ingest. Unsigned (events carry only a random device
      // id + coarse event names, no identity/PII), but capped to resist spam.
      if (path === '/events' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        if (!body || typeof body.device !== 'string' || !Array.isArray(body.events)) return json({ error: 'bad body' }, 400);
        const device = body.device.slice(0, 64);
        const appV = String(body.appV || '').slice(0, 16);
        const batch = body.events.slice(0, 50); // cap per request
        const now = Date.now();
        const stmt = env.DB.prepare('INSERT INTO events (device, name, props, app_v, day, ts) VALUES (?,?,?,?,?,?)');
        const ops = [];
        for (const e of batch) {
          if (!e || typeof e.name !== 'string') continue;
          const ts = Number(e.ts) || now;
          const day = new Date(ts).toISOString().slice(0, 10);
          const props = e.props ? JSON.stringify(e.props).slice(0, 300) : null;
          ops.push(stmt.bind(device, e.name.slice(0, 40), props, appV, day, ts));
        }
        if (ops.length) await env.DB.batch(ops);
        // upsert the tester's identity (Crew name, if online) + coarse edge geo
        // from Cloudflare (country/region/city off the request IP; no device GPS).
        const cf = request.cf || {};
        const label = (typeof body.label === 'string' && body.label) ? body.label.slice(0, 40) : null;
        await env.DB.prepare(
          `INSERT INTO devices (device, label, country, region, city, first_seen, last_seen)
           VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(device) DO UPDATE SET
             label = COALESCE(excluded.label, devices.label),
             country = COALESCE(excluded.country, devices.country),
             region = COALESCE(excluded.region, devices.region),
             city = COALESCE(excluded.city, devices.city),
             last_seen = excluded.last_seen`
        ).bind(device, label, cf.country || null, cf.region || cf.regionCode || null, cf.city || null, now, now).run();
        return json({ ok: true, accepted: ops.length });
      }

      // Player-submitted map feedback: den nominations + unreachable-spot reports.
      // Unsigned + best-effort like /events (no account needed). Private dev
      // channel — only ever surfaced in the admin dashboard, never to players.
      if (path === '/report' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        if (!body || typeof body.device !== 'string' || typeof body.kind !== 'string') return json({ error: 'bad body' }, 400);
        const kind = body.kind.slice(0, 24); // 'den-nominate' | 'unreachable'
        const device = body.device.slice(0, 64);
        const appV = String(body.appV || '').slice(0, 16);
        const label = (typeof body.label === 'string' && body.label) ? body.label.slice(0, 40) : null;
        const lat = Number.isFinite(body.lat) ? Math.round(body.lat * 1e5) / 1e5 : null;
        const lng = Number.isFinite(body.lng) ? Math.round(body.lng * 1e5) / 1e5 : null;
        const target = (typeof body.target === 'string' && body.target) ? body.target.slice(0, 60) : null;
        const note = (typeof body.note === 'string' && body.note) ? body.note.slice(0, 280) : null;
        const cf = request.cf || {};
        const city = [cf.city, cf.region || cf.regionCode, cf.country].filter(Boolean).join(', ') || null;
        await env.DB.prepare(
          `INSERT INTO reports (device, label, kind, lat, lng, target, note, app_v, geo, ts)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).bind(device, label, kind, lat, lng, target, note, appV, city, Date.now()).run();
        return json({ ok: true });
      }

      // One-time in-app survey lead: name/email/feedback/most-wanted + an explicit
      // opt-in to update emails. Unsigned + best-effort like /report (no account
      // needed). Email is contact info -> declared in the store data-safety forms.
      // Private dev channel; only ever surfaced in the admin dashboard.
      if (path === '/survey' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        if (!body || typeof body.device !== 'string') return json({ error: 'bad body' }, 400);
        const device = body.device.slice(0, 64);
        const player = (typeof body.player === 'string' && body.player) ? body.player.slice(0, 200) : null;
        const label = (typeof body.label === 'string' && body.label) ? body.label.slice(0, 40) : null;
        const name = (typeof body.name === 'string' && body.name) ? body.name.trim().slice(0, 60) : null;
        const email = (typeof body.email === 'string' && body.email) ? body.email.trim().slice(0, 120) : null;
        const optin = body.emailOptin ? 1 : 0;
        const feedback = (typeof body.feedback === 'string' && body.feedback) ? body.feedback.slice(0, 500) : null;
        const mostWanted = (typeof body.mostWanted === 'string' && body.mostWanted) ? body.mostWanted.slice(0, 280) : null;
        // features they said they use: an array of short slugs -> stored comma-joined
        const features = Array.isArray(body.features)
          ? body.features.filter(f => typeof f === 'string').slice(0, 20).map(f => f.slice(0, 24)).join(',') || null
          : null;
        const appV = String(body.appV || '').slice(0, 16);
        const cf = request.cf || {};
        const city = [cf.city, cf.region || cf.regionCode, cf.country].filter(Boolean).join(', ') || null;
        await env.DB.prepare(
          `INSERT INTO leads (device, player, label, name, email, email_optin, feedback, most_wanted, features, app_v, geo, ts)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(device, player, label, name, email, optin, feedback, mostWanted, features, appV, city, Date.now()).run();
        return json({ ok: true });
      }

      // Admin dashboard aggregates. Gated by ADMIN_TOKEN (set via wrangler secret).
      if (path === '/stats' && request.method === 'GET') {
        const token = url.searchParams.get('token') || request.headers.get('x-bh-admin') || '';
        if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ error: 'unauthorized' }, 401);
        const today = new Date().toISOString().slice(0, 10);
        const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
        const q = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).first());
        const all = async (sql, ...b) => ((await env.DB.prepare(sql).bind(...b).all()).results || []);
        // Exclude the developer's own device(s) so one heavy in-house tester
        // (Tom = "Wretched Goblin") doesn't skew the numbers. Reversible: edit
        // EX_IDS to re-include or add devices. IDs are sanitised then inlined.
        const EX_IDS = ['fb31564c-22cc-49e8-836b-2da8fbf8531f'];
        const inList = EX_IDS.map(id => `'${String(id).replace(/[^a-f0-9-]/gi, '')}'`).join(',') || "''";
        const nin = col => `${col} NOT IN (${inList})`;
        const totalDevices = (await q(`SELECT COUNT(DISTINCT device) n FROM events WHERE ${nin('device')}`)).n;
        const dau = (await q(`SELECT COUNT(DISTINCT device) n FROM events WHERE day = ? AND ${nin('device')}`, today)).n;
        const wau = (await q(`SELECT COUNT(DISTINCT device) n FROM events WHERE day >= ? AND ${nin('device')}`, weekAgo)).n;
        const totalEvents = (await q(`SELECT COUNT(*) n FROM events WHERE ${nin('device')}`)).n;
        const byName = await all(`SELECT name, COUNT(*) n FROM events WHERE ${nin('device')} GROUP BY name ORDER BY n DESC LIMIT 30`);
        const activeByDay = await all(`SELECT day, COUNT(DISTINCT device) n FROM events WHERE day >= ? AND ${nin('device')} GROUP BY day ORDER BY day`, new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
        const newByDay = await all(`SELECT day, COUNT(*) n FROM (SELECT device, MIN(day) day FROM events WHERE ${nin('device')} GROUP BY device) GROUP BY day ORDER BY day DESC LIMIT 14`);
        // screen-dwell "heatmap": total minutes testers spent on each screen
        const screenTime = await all(`SELECT json_extract(props,'$.s') s, ROUND(SUM(json_extract(props,'$.ms'))/60000.0,1) min, COUNT(*) n FROM events WHERE name='screen_time' AND props IS NOT NULL AND ${nin('device')} GROUP BY s ORDER BY SUM(json_extract(props,'$.ms')) DESC`);
        // feature usage: how often each feature-sheet was opened + total minutes in it
        const featureOpens = await all(`SELECT json_extract(props,'$.f') f, COUNT(*) n FROM events WHERE name='feat_open' AND props IS NOT NULL AND ${nin('device')} GROUP BY f ORDER BY n DESC LIMIT 40`);
        const featureTime = await all(`SELECT json_extract(props,'$.f') f, ROUND(SUM(json_extract(props,'$.ms'))/60000.0,1) min FROM events WHERE name='feat_time' AND props IS NOT NULL AND ${nin('device')} GROUP BY f ORDER BY SUM(json_extract(props,'$.ms')) DESC LIMIT 40`);
        // play time: one ping ≈ 45s of active play; sessions = session_start count
        const pings = (await q(`SELECT COUNT(*) n FROM events WHERE name='session_ping' AND ${nin('device')}`)).n || 0;
        const sessions = (await q(`SELECT COUNT(*) n FROM events WHERE name='session_start' AND ${nin('device')}`)).n || 0;
        const playMinutes = Math.round(pings * 45 / 60);
        const avgSessionMin = sessions ? Math.round((pings * 45 / sessions / 60) * 10) / 10 : 0;
        // return rate: share of testers who came back on a later day than their first
        const r = await q(`SELECT COUNT(*) total, SUM(CASE WHEN firstday <> lastday THEN 1 ELSE 0 END) returned FROM (SELECT device, MIN(day) firstday, MAX(day) lastday FROM events WHERE ${nin('device')} GROUP BY device)`);
        const returnRate = r && r.total ? Math.round((r.returned / r.total) * 100) : 0;
        // per-tester leaderboard (top 30 by activity), with Crew name + coarse geo
        const testers = await all(
          `SELECT e.device, COUNT(*) events, MIN(e.day) first, MAX(e.day) last,
                  SUM(CASE WHEN e.name IN ('food_log','pit_win','boss_win','mini_win','cook','hatch','quest_claim','friend_battle','buy_weapon','transmute') THEN 1 ELSE 0 END) played,
                  d.label, d.country, d.region, d.city
           FROM events e LEFT JOIN devices d ON d.device = e.device
           WHERE ${nin('e.device')}
           GROUP BY e.device ORDER BY events DESC LIMIT 30`);
        const byCountry = await all(`SELECT COALESCE(country,'?') country, COUNT(*) n FROM devices WHERE ${nin('device')} GROUP BY country ORDER BY n DESC`);
        const byCity = await all(`SELECT COALESCE(city,'?') city, COALESCE(region,'') region, COALESCE(country,'') country, COUNT(*) n FROM devices WHERE ${nin('device')} GROUP BY city, region, country ORDER BY n DESC LIMIT 30`);
        // community map feedback: newest first (den nominations + unreachable reports + general feedback)
        const reports = await all(`SELECT r.kind, r.lat, r.lng, r.target, r.note, r.geo, r.ts, COALESCE(r.label, d.label) label FROM reports r LEFT JOIN devices d ON d.device = r.device WHERE ${nin('r.device')} ORDER BY r.ts DESC LIMIT 100`);
        // survey leads: newest first (name/email/feedback/most-wanted + opt-in flag)
        const leads = await all(`SELECT l.name, l.email, l.email_optin optin, l.feedback, l.most_wanted mostWanted, l.features, l.geo, l.ts, COALESCE(l.label, d.label) label FROM leads l LEFT JOIN devices d ON d.device = l.device WHERE ${nin('l.device')} ORDER BY l.ts DESC LIMIT 200`);
        return json({ totalDevices, dau, wau, totalEvents, byName, activeByDay, newByDay, screenTime, featureOpens, featureTime, playMinutes, sessions, avgSessionMin, returnRate, testers, byCountry, byCity, reports, leads, generatedAt: Date.now() });
      }

      /* Admin: hand a specific player coins through the normal grants channel, so a
         mis-tap or a bug can be made good without touching their device. Gated on
         ADMIN_TOKEN, the same secret the dashboard uses. Deliberately narrow:
         coins only, a required note so the player is told WHY, an explicit key so a
         repeated call cannot pay twice, and a cap so a fat finger here cannot mint a
         fortune. It cannot take anything away. */
      if (path === '/admin/grant' && request.method === 'POST') {
        const token = request.headers.get('x-admin-token') || '';
        if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ error: 'unauthorized' }, 401);
        const b = await request.json().catch(() => ({}));
        const coins = Math.floor(Number(b.coins) || 0);
        if (!b.playerId || !b.key || !b.note) return json({ error: 'playerId, key and note are required' }, 400);
        if (!(coins > 0) || coins > 20000) return json({ error: 'coins must be 1..20000' }, 400);
        const who = await env.DB.prepare('SELECT id, name, handle FROM players WHERE id = ?').bind(String(b.playerId)).first();
        if (!who) return json({ error: 'no such player' }, 404);
        const r = await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
          .bind(who.id, String(b.key), 'social', JSON.stringify({ coins, note: String(b.note).slice(0, 160) }), Date.now()).run();
        return json({ ok: true, to: who.name || who.handle, coins, inserted: !!(r.meta?.changes) });
      }

      // DEV-ONLY helpers for tests (env.DEV="1"; never set in production).
      if (env.DEV === '1' && path === '/dev/grant' && request.method === 'POST') {
        const b = await request.json();
        await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
          .bind(b.playerId, b.key, b.type || 'social', JSON.stringify(b.payload || {}), Date.now()).run();
        return json({ ok: true });
      }
      // Backdate a spire's timers so a test can simulate "an hour later" or "eight
      // days later" without sleeping. DEV only, and it can only ever move a row's
      // OWN timestamps: it grants nothing and cannot change ownership.
      if (env.DEV === '1' && path === '/dev/spire-warp' && request.method === 'POST') {
        const b = await request.json();
        const back = Number(b.backMs) || 0;
        // move EVERY timer on the row, so "three days passed" means the same thing
        // to the shield, to dormancy and to an open siege. Shifting only some of
        // them produced a tower that was somehow both stale and freshly besieged.
        await env.DB.prepare(
          `UPDATE spires SET claimed_at = claimed_at - ?, tended_at = tended_at - ?,
             siege_until = CASE WHEN siege_until IS NULL THEN NULL ELSE siege_until - ? END
           WHERE id = ?`)
          .bind(back, back, back, String(b.id || '')).run();
        const row = await env.DB.prepare('SELECT id, owner, claimed_at, tended_at, level, siege_until FROM spires WHERE id = ?').bind(String(b.id || '')).first();
        return json({ ok: true, row: row || null });
      }
      if (env.DEV === '1' && path === '/dev/player' && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT id, handle, friend_code, profile, app_v FROM players WHERE id = ?')
          .bind(url.searchParams.get('id')).first();
        return json(row || {});
      }

      return json({ error: 'not found' }, 404);
    } catch (e) {
      console.error('handler error', e && e.stack || e);
      return json({ error: 'server error', detail: String(e).slice(0, 200) }, 500);
    }
  },
};
