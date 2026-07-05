// Boneheadz Gym social API. Cloudflare Worker + D1.
// Auth: every player-scoped request is signed by the device's ECDSA P-256 key
// (headers x-bh-player / x-bh-ts / x-bh-sig over "METHOD\nPATH\nTS\nBODY").
// No emails, no passwords, no PII: a pubkey IS the account.

const CORS = {
  'Access-Control-Allow-Origin': '*', // signature auth, no cookies: * is safe (and native WKWebView needs it)
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,x-bh-player,x-bh-ts,x-bh-sig',
  'Access-Control-Max-Age': '86400',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } });

const MAX_SKEW_MS = 5 * 60 * 1000;
const MAX_PROFILE_BYTES = 24 * 1024;

/* ---------------- handle + friend code generation ---------------- */
const ADJ = ['Rattling', 'Grim', 'Dusty', 'Creaky', 'Hollow', 'Marrow', 'Midnight', 'Restless', 'Crooked', 'Sturdy', 'Swift', 'Lucky', 'Feral', 'Ancient', 'Jolly', 'Sneaky'];
const NOUN = ['Rex', 'Femur', 'Knuckles', 'Molar', 'Sternum', 'Tibia', 'Scapula', 'Phalange', 'Vertebrae', 'Clavicle', 'Patella', 'Mandible', 'Rib', 'Talus', 'Hyoid', 'Coccyx'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L lookalikes

function randPick(arr) { return arr[crypto.getRandomValues(new Uint32Array(1))[0] % arr.length]; }
function makeHandle() { return `${randPick(ADJ)} ${randPick(NOUN)}`; }
function makeFriendCode() {
  const r = crypto.getRandomValues(new Uint8Array(8));
  const c = [...r].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `BONE-${c.slice(0, 4)}-${c.slice(4)}`;
}
function newId() { return crypto.randomUUID(); }

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
        const existing = await env.DB.prepare('SELECT id, handle, friend_code FROM players WHERE pubkey = ?').bind(pub).first();
        if (existing) return json({ playerId: existing.id, handle: existing.handle, friendCode: existing.friend_code, existing: true });
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

      // Signed: who am I (handle/code lookup, used by the client after restore).
      if (path === '/me' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const row = await env.DB.prepare('SELECT handle, friend_code, created_at FROM players WHERE id = ?').bind(auth.playerId).first();
        return json({ handle: row.handle, friendCode: row.friend_code, createdAt: row.created_at });
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
      return json({ error: 'server error', detail: String(e).slice(0, 200) }, 500);
    }
  },
};
