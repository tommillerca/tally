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
        await env.DB.prepare('UPDATE players SET profile = ?, app_v = ?, last_seen = ? WHERE id = ?')
          .bind(JSON.stringify(body.snapshot), String(body.appV || ''), Date.now(), auth.playerId).run();
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
                  last_seen
           FROM players ORDER BY lvl DESC, badges DESC, last_seen DESC LIMIT 100`).all();
        const players = (rows.results || []).map(r => ({
          playerId: r.id,
          name: r.name || r.handle,
          level: r.lvl || 1,
          levelName: r.lvlName || null,
          badges: r.badges || 0,
          outfit: (() => { try { return r.outfit ? JSON.parse(r.outfit) : null; } catch { return null; } })(), // cosmetic ids only; art renders client-side
          friendCode: r.friend_code,
          lastSeen: r.last_seen,
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
        const appV = String(body.appV || '').slice(0, 16);
        const cf = request.cf || {};
        const city = [cf.city, cf.region || cf.regionCode, cf.country].filter(Boolean).join(', ') || null;
        await env.DB.prepare(
          `INSERT INTO leads (device, player, label, name, email, email_optin, feedback, most_wanted, app_v, geo, ts)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(device, player, label, name, email, optin, feedback, mostWanted, appV, city, Date.now()).run();
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
        const leads = await all(`SELECT l.name, l.email, l.email_optin optin, l.feedback, l.most_wanted mostWanted, l.geo, l.ts, COALESCE(l.label, d.label) label FROM leads l LEFT JOIN devices d ON d.device = l.device WHERE ${nin('l.device')} ORDER BY l.ts DESC LIMIT 200`);
        return json({ totalDevices, dau, wau, totalEvents, byName, activeByDay, newByDay, screenTime, featureOpens, featureTime, playMinutes, sessions, avgSessionMin, returnRate, testers, byCountry, byCity, reports, leads, generatedAt: Date.now() });
      }

      // DEV-ONLY helpers for tests (env.DEV="1"; never set in production).
      if (env.DEV === '1' && path === '/dev/grant' && request.method === 'POST') {
        const b = await request.json();
        await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
          .bind(b.playerId, b.key, b.type || 'social', JSON.stringify(b.payload || {}), Date.now()).run();
        return json({ ok: true });
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
