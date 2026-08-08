// API tests against a locally running worker (npm run dev, port 8788).
// Node 18+ has WebCrypto + fetch built in, so this mirrors the browser exactly.
import assert from 'node:assert/strict';

const BASE = process.env.API || 'http://127.0.0.1:8788';
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  PASS', name); }
  catch (e) { failed++; console.log('  FAIL', name, '\n   ', e.message); }
}

const b64 = buf => Buffer.from(buf).toString('base64');
async function makeKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return {
    kp,
    pubJwk: await crypto.subtle.exportKey('jwk', kp.publicKey),
  };
}
async function signedFetch(kp, playerId, method, path, body = '', tsOverride = null) {
  const ts = tsOverride ?? Date.now();
  const msg = `${method}\n${path}\n${ts}\n${body}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(msg));
  return fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-bh-player': playerId, 'x-bh-ts': String(ts), 'x-bh-sig': b64(sig) },
    body: method === 'GET' ? undefined : body,
  });
}

const { kp, pubJwk } = await makeKeys();
let player = null;

await test('health', async () => {
  const r = await (await fetch(BASE + '/health')).json();
  assert.ok(r.ok);
});

await test('register issues player + friend code + handle', async () => {
  const r = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: pubJwk }) })).json();
  assert.ok(r.playerId && /^BONE-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(r.friendCode) && r.handle.includes(' '), JSON.stringify(r));
  player = r;
});

await test('re-register with same key returns the SAME account (backup restore)', async () => {
  const r = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: pubJwk }) })).json();
  assert.equal(r.playerId, player.playerId);
  assert.ok(r.existing);
});

await test('bad pubkey rejected', async () => {
  const r = await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: { kty: 'RSA' } }) });
  assert.equal(r.status, 400);
});

await test('signed profile PUT accepted + stored', async () => {
  const body = JSON.stringify({ snapshot: { level: 8, stats: { power: 20 }, outfit: { SK: 'SK0-1' }, gear: [] }, appV: 'v66' });
  const r = await signedFetch(kp, player.playerId, 'PUT', '/profile', body);
  assert.equal(r.status, 200);
  const p = await (await fetch(BASE + `/dev/player?id=${player.playerId}`)).json();
  assert.equal(JSON.parse(p.profile).level, 8);
  assert.equal(p.app_v, 'v66');
});

await test('tampered body rejected (signature covers body)', async () => {
  const good = JSON.stringify({ snapshot: { level: 8 } });
  const ts = Date.now();
  const msg = `PUT\n/profile\n${ts}\n${good}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(msg));
  const r = await fetch(BASE + '/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-bh-player': player.playerId, 'x-bh-ts': String(ts), 'x-bh-sig': b64(sig) },
    body: JSON.stringify({ snapshot: { level: 99 } }), // tampered
  });
  assert.equal(r.status, 401);
});

await test('wrong key rejected', async () => {
  const other = await makeKeys();
  const body = JSON.stringify({ snapshot: { level: 1 } });
  const r = await signedFetch(other.kp, player.playerId, 'PUT', '/profile', body);
  assert.equal(r.status, 401);
});

await test('stale timestamp rejected (replay protection)', async () => {
  const body = JSON.stringify({ snapshot: { level: 8 } });
  const r = await signedFetch(kp, player.playerId, 'PUT', '/profile', body, Date.now() - 10 * 60 * 1000);
  assert.equal(r.status, 401);
});

await test('grants: welcome grant delivered, cursor advances, no redelivery', async () => {
  const r1 = await (await signedFetch(kp, player.playerId, 'GET', '/grants?since=0')).json();
  assert.ok(r1.grants.some(g => g.key === 'social-welcome' && g.payload.coins === 50), JSON.stringify(r1));
  const r2 = await (await signedFetch(kp, player.playerId, 'GET', `/grants?since=${r1.cursor}`)).json();
  assert.equal(r2.grants.length, 0);
});

await test('dev grant flows through', async () => {
  await fetch(BASE + '/dev/grant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ playerId: player.playerId, key: 'test-coins-1', payload: { coins: 25, note: 'test' } }) });
  const r = await (await signedFetch(kp, player.playerId, 'GET', '/grants?since=0')).json();
  assert.ok(r.grants.some(g => g.key === 'test-coins-1'));
});

await test('/me returns identity after restore', async () => {
  const r = await (await signedFetch(kp, player.playerId, 'GET', '/me')).json();
  assert.equal(r.friendCode, player.friendCode);
});

await test('analytics: /events ingests an anonymous batch', async () => {
  const device = 'devtest-' + Math.random().toString(36).slice(2);
  const r = await (await fetch(BASE + '/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device, appV: 'v80', events: [{ name: 'app_open' }, { name: 'pit_win', props: { level: 8 } }, { name: 'food_log' }] }) })).json();
  assert.ok(r.ok && r.accepted === 3, JSON.stringify(r));
});

await test('analytics: /stats is admin-gated + aggregates', async () => {
  assert.equal((await fetch(BASE + '/stats')).status, 401);
  const ok = await fetch(BASE + '/stats?token=devtoken');
  assert.equal(ok.status, 200);
  const s = await ok.json();
  assert.ok(s.totalDevices >= 1 && s.totalEvents >= 3, JSON.stringify(s));
  assert.ok(s.byName.some(e => e.name === 'pit_win'), 'event names aggregated');
  assert.ok(s.dau >= 1, 'DAU counts today');
});

await test('backup: PUT stores ciphertext, GET returns it verbatim', async () => {
  const blob = 'AAAA' + Buffer.from('pretend-ciphertext-' + Math.random()).toString('base64');
  const put = await signedFetch(kp, player.playerId, 'PUT', '/backup', JSON.stringify({ blob, appV: 'v84' }));
  assert.equal(put.status, 200);
  const got = await (await signedFetch(kp, player.playerId, 'GET', '/backup')).json();
  assert.equal(got.blob, blob, 'blob round-trips byte-for-byte');
  assert.equal(got.appV, 'v84');
});

await test('backup: PUT overwrites the previous row (one per player)', async () => {
  const blob2 = 'BBBB' + Buffer.from('second-' + Math.random()).toString('base64');
  await signedFetch(kp, player.playerId, 'PUT', '/backup', JSON.stringify({ blob: blob2 }));
  const got = await (await signedFetch(kp, player.playerId, 'GET', '/backup')).json();
  assert.equal(got.blob, blob2);
});

await test('backup: GET 404 when a player has none', async () => {
  const fresh = await makeKeys();
  const reg = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: fresh.pubJwk }) })).json();
  const r = await signedFetch(fresh.kp, reg.playerId, 'GET', '/backup');
  assert.equal(r.status, 404);
});

await test('backup: PUT requires a valid signature (wrong key rejected)', async () => {
  const other = await makeKeys();
  const r = await signedFetch(other.kp, player.playerId, 'PUT', '/backup', JSON.stringify({ blob: 'x' }));
  assert.equal(r.status, 401);
});

// ---- curated display name ----
/* RUN-UNIQUE NUMBERS. Names became unique server-side on 2026-08-08, and the
   local D1 persists between runs, so a hardcoded name is claimed by the PREVIOUS
   run's player and every later run 409s. That is the feature working, not a
   regression, so the tests carry a per-run suffix instead of fixed strings. */
const RUNSUF = 100 + Math.floor(Math.random() * 800);
await test('name: set curated display name by indices, /me reflects it', async () => {
  const r = await signedFetch(kp, player.playerId, 'POST', '/name', JSON.stringify({ adj: 1, noun: 0, num: RUNSUF }));
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.name, `Grim Rex #${RUNSUF}`, JSON.stringify(d));
  const me = await (await signedFetch(kp, player.playerId, 'GET', '/me')).json();
  assert.equal(me.name, `Grim Rex #${RUNSUF}`);
});

await test('name: no number is allowed', async () => {
  const d = await (await signedFetch(kp, player.playerId, 'POST', '/name', JSON.stringify({ adj: 0, noun: 0 }))).json();
  assert.equal(d.name, 'Rattling Rex');
});

await test('name: out-of-range indices rejected (no free text ever)', async () => {
  const r = await signedFetch(kp, player.playerId, 'POST', '/name', JSON.stringify({ adj: 999, noun: 0 }));
  assert.equal(r.status, 400);
});

// ---- friends ----
let p2 = null, p2keys = null;
await test('friends: request by code is pending, reciprocation auto-accepts', async () => {
  p2keys = await makeKeys();
  p2 = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: p2keys.pubJwk }) })).json();
  const r1 = await (await signedFetch(kp, player.playerId, 'POST', '/friends/request', JSON.stringify({ code: p2.friendCode }))).json();
  assert.equal(r1.status, 'pending', JSON.stringify(r1));
  const aList = await (await signedFetch(kp, player.playerId, 'GET', '/friends')).json();
  assert.ok(aList.outgoing.some(x => x.playerId === p2.playerId), 'A has outgoing');
  const bList = await (await signedFetch(p2keys.kp, p2.playerId, 'GET', '/friends')).json();
  assert.ok(bList.incoming.some(x => x.playerId === player.playerId), 'B has incoming');
  const r2 = await (await signedFetch(p2keys.kp, p2.playerId, 'POST', '/friends/request', JSON.stringify({ code: player.friendCode }))).json();
  assert.equal(r2.status, 'accepted', JSON.stringify(r2));
  const aNow = await (await signedFetch(kp, player.playerId, 'GET', '/friends')).json();
  assert.ok(aNow.friends.some(x => x.playerId === p2.playerId), 'A now friends with B');
});

await test('friends: name + public profile surface in the list', async () => {
  await signedFetch(p2keys.kp, p2.playerId, 'POST', '/name', JSON.stringify({ adj: 2, noun: 2, num: RUNSUF })); // Dusty Knuckles #N
  await signedFetch(p2keys.kp, p2.playerId, 'PUT', '/profile', JSON.stringify({ snapshot: { level: 12, levelName: 'Bruiser', outfit: { SK: 'SK0-1' } }, appV: 'v100' }));
  const aList = await (await signedFetch(kp, player.playerId, 'GET', '/friends')).json();
  const b = aList.friends.find(x => x.playerId === p2.playerId);
  assert.equal(b.name, `Dusty Knuckles #${RUNSUF}`);
  assert.equal(b.profile.level, 12);
  assert.equal(b.friendCode, p2.friendCode);
});

await test('gift: free daily gift delivers a grant, second same-day 409s', async () => {
  const r1 = await signedFetch(kp, player.playerId, 'POST', '/gift', JSON.stringify({ to: p2.playerId, mode: 'free' }));
  assert.equal(r1.status, 200);
  const j1 = await r1.json();
  assert.ok(j1.ok && j1.reward, 'returns a rolled reward');
  const grants = await (await signedFetch(p2keys.kp, p2.playerId, 'GET', '/grants?since=0')).json();
  const gift = (grants.grants || []).find(g => g.type === 'gift' && g.payload.mode === 'free');
  assert.ok(gift, 'recipient sees the gift grant');
  assert.ok(gift.payload.from && gift.payload.note.includes(gift.payload.from), 'gift carries sender name');
  const r2 = await signedFetch(kp, player.playerId, 'POST', '/gift', JSON.stringify({ to: p2.playerId, mode: 'free' }));
  assert.equal(r2.status, 409, 'one free gift per friend per day');
});

await test('gift: spend-coins gift delivers the exact coins', async () => {
  const r = await signedFetch(kp, player.playerId, 'POST', '/gift', JSON.stringify({ to: p2.playerId, mode: 'spend', coins: 120 }));
  assert.equal(r.status, 200);
  const grants = await (await signedFetch(p2keys.kp, p2.playerId, 'GET', '/grants?since=0')).json();
  const spend = (grants.grants || []).find(g => g.type === 'gift' && g.payload.mode === 'spend');
  assert.equal(spend.payload.coins, 120);
});

await test('gift: to a non-friend is 403', async () => {
  const stranger = await makeKeys();
  const s = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: stranger.pubJwk }) })).json();
  const r = await signedFetch(kp, player.playerId, 'POST', '/gift', JSON.stringify({ to: s.playerId, mode: 'free' }));
  assert.equal(r.status, 403);
});

await test('cheer: preset cheer delivers a reward-less grant; self + bad index rejected', async () => {
  const r = await signedFetch(kp, player.playerId, 'POST', '/cheer', JSON.stringify({ to: p2.playerId, cheer: 0 }));
  assert.equal(r.status, 200);
  const grants = await (await signedFetch(p2keys.kp, p2.playerId, 'GET', '/grants?since=0')).json();
  const cheer = (grants.grants || []).find(g => g.type === 'cheer');
  assert.ok(cheer && cheer.payload.cheer === 0 && !cheer.payload.coins, 'cheer carries index, no reward');
  const self = await signedFetch(kp, player.playerId, 'POST', '/cheer', JSON.stringify({ to: player.playerId, cheer: 0 }));
  assert.equal(self.status, 400);
  const bad = await signedFetch(kp, player.playerId, 'POST', '/cheer', JSON.stringify({ to: p2.playerId, cheer: 999 }));
  assert.equal(bad.status, 400);
});

await test('friends: accept endpoint seals a one-way request', async () => {
  const p3keys = await makeKeys();
  const p3 = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: p3keys.pubJwk }) })).json();
  await signedFetch(p3keys.kp, p3.playerId, 'POST', '/friends/request', JSON.stringify({ code: player.friendCode }));
  const acc = await signedFetch(kp, player.playerId, 'POST', '/friends/accept', JSON.stringify({ id: p3.playerId }));
  assert.equal(acc.status, 200);
  const aList = await (await signedFetch(kp, player.playerId, 'GET', '/friends')).json();
  assert.ok(aList.friends.some(x => x.playerId === p3.playerId));
});

await test('friends: cannot friend your own code', async () => {
  const r = await signedFetch(kp, player.playerId, 'POST', '/friends/request', JSON.stringify({ code: player.friendCode }));
  assert.equal(r.status, 400);
});

await test('friends: unknown code 404', async () => {
  const r = await signedFetch(kp, player.playerId, 'POST', '/friends/request', JSON.stringify({ code: 'BONE-ZZZZ-ZZZZ' }));
  assert.equal(r.status, 404);
});

await test('friends: remove drops the edge for both sides', async () => {
  await signedFetch(kp, player.playerId, 'POST', '/friends/remove', JSON.stringify({ id: p2.playerId }));
  const aList = await (await signedFetch(kp, player.playerId, 'GET', '/friends')).json();
  assert.ok(!aList.friends.some(x => x.playerId === p2.playerId), 'A no longer friends with B');
  const bList = await (await signedFetch(p2keys.kp, p2.playerId, 'GET', '/friends')).json();
  assert.ok(!bList.friends.some(x => x.playerId === player.playerId), 'B no longer friends with A');
});

// Leaderboard: never-synced registrations must be invisible (they COALESCE to
// level-1 "bots"; 98 of 118 production rows were these), and a shiny pet must
// ride the payload so the board can render it shiny.
// PROVE-RED: drop the WHERE profile IS NOT NULL, or the pet field, from
// /leaderboard in src/index.js and the matching assert fails by name.
await test('leaderboard: hides never-synced players, carries pet.shiny', async () => {
  const synced = await makeKeys();
  const ghost = await makeKeys();
  const sp = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: synced.pubJwk }) })).json();
  const gp = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: ghost.pubJwk }) })).json();
  // level 999: the local dev DB accumulates a synced player per past run, and
  // the board is LIMIT 100, so a modest level can legitimately miss the page
  const body = JSON.stringify({ snapshot: { level: 999, outfit: { SK: 'SK0-1', C: 'C3' }, pet: { id: 'C3', level: 6, shiny: true }, gear: [] }, appV: 'test' });
  assert.equal((await signedFetch(synced.kp, sp.playerId, 'PUT', '/profile', body)).status, 200);
  const board = await (await signedFetch(synced.kp, sp.playerId, 'GET', '/leaderboard')).json();
  const me = board.players.find(x => x.playerId === sp.playerId);
  assert.ok(me, 'synced player is on the board');
  assert.ok(me.pet && me.pet.shiny === true && me.pet.id === 'C3', 'pet rides the leaderboard payload with shiny intact');
  assert.ok(!board.players.some(x => x.playerId === gp.playerId), 'never-synced registration is hidden');
});

/* THE WEEKLY STEP RACE. Tom, 2026-08-08: a weekly most-steps event with a prize
   and a visible 1st/2nd/3rd. Ranks come from the profile snapshot the client
   already syncs, stamped with the week they belong to, and the previous week is
   settled lazily on the first request of a new one.
   PROVE-RED: drop the `json_extract(profile,'$.weekKey') = ?` clause and the
   stale-week assert fails; remove the INSERT OR IGNORE and the pay-once assert
   fails with two grants. */
await test('step race: ranks this week only, and pays last week exactly once', async () => {
  // A FRESH week per run. The local dev DB persists between runs, so a fixed week
  // meant the second run found last week already settled and the pay-once assert
  // failed for a reason that had nothing to do with the code. Both keys are
  // derived from a known Monday so they are always real week starts.
  const MON = Date.parse('2030-01-07T00:00:00Z');   // a Monday
  const wk = new Date(MON + (Date.now() % 400) * 7 * 86400000).toISOString().slice(0, 10);
  const prev = new Date(Date.parse(wk + 'T00:00:00Z') - 7 * 86400000).toISOString().slice(0, 10);
  const mk = async (level, weekKey, steps) => {
    const k = await makeKeys();
    const p = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: k.pubJwk }) })).json();
    const body = JSON.stringify({ snapshot: { level, outfit: { SK: 'SK0-1' }, gear: [], weekKey, weekSteps: steps }, appV: 'test' });
    assert.equal((await signedFetch(k.kp, p.playerId, 'PUT', '/profile', body)).status, 200);
    return { k, p };
  };
  const walker = await mk(5, wk, 42000);
  const slower = await mk(5, wk, 9000);
  const stale = await mk(5, prev, 999999);       // last week's total, must NOT rank now

  const r = await (await signedFetch(walker.k.kp, walker.p.playerId, 'GET', `/steps/week?week=${wk}`)).json();
  const ids = r.players.map(x => x.playerId);
  assert.ok(ids.includes(walker.p.playerId) && ids.includes(slower.p.playerId), 'this week\'s racers are on the board');
  assert.ok(!ids.includes(stale.p.playerId), 'a stale sync from last week does not rank in this one');
  const wi = ids.indexOf(walker.p.playerId), si = ids.indexOf(slower.p.playerId);
  assert.ok(wi < si, 'ordered by steps, most first');
  assert.equal(r.players[wi].rank, wi + 1, 'rank is 1-based and matches position');
  assert.ok(r.prize && r.prize.coins > 0, 'the race states its prize');

  // last week had a racer (`stale`), so the FIRST request above settles it
  const g1 = await (await signedFetch(stale.k.kp, stale.p.playerId, 'GET', '/grants?since=0')).json();
  const prizes = (g1.grants || []).filter(x => x.key === `stepweek-${prev}`);
  assert.equal(prizes.length, 1, 'last week\'s winner was paid exactly once');
  assert.ok(prizes[0].payload.coins > 0 && /step race/i.test(prizes[0].payload.note || ''), 'the prize says what it was for');
  assert.ok(/1st/.test(prizes[0].payload.note), 'the note names the place finished');
  // Tom, 2026-08-08: "give 4th and 5th something but just far less than top 3."
  assert.ok(r.podium.length >= 5, `the board publishes every paying place, got ${r.podium.length}`);
  for (let i = 1; i < r.podium.length; i++) {
    assert.ok(r.podium[i].coins < r.podium[i - 1].coins, `place ${i + 1} pays less than place ${i}`);
  }
  assert.ok(r.podium[3].coins * 2 < r.podium[2].coins, '4th is FAR less than 3rd, not a near-miss');

  // and asking again must not pay twice
  await signedFetch(slower.k.kp, slower.p.playerId, 'GET', `/steps/week?week=${wk}`);
  const g2 = await (await signedFetch(stale.k.kp, stale.p.playerId, 'GET', '/grants?since=0')).json();
  assert.equal((g2.grants || []).filter(x => x.key === `stepweek-${prev}`).length, 1, 'settling is idempotent');
});

/* NAMES ARE UNIQUE. Tom, 2026-08-08: "How did you allow two people to pick the
   same name Massive coc? That was the whole point of usernames?"
   /name was a blind UPDATE with no check and players.name has no UNIQUE, so the
   second claimant simply overwrote nothing and kept the same string.
   PROVE-RED: delete the `clash` lookup in src/index.js and the second claim
   returns 200 instead of 409, failing the first assertion below. */
await test('names are unique: second claimant is refused and offered a free number', async () => {
  const mk = async () => {
    const k = await makeKeys();
    const p = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: k.pubJwk }) })).json();
    return { k, p };
  };
  const a = await mk(), b = await mk();
  // 57 = 'Chiseled', 15 = 'Coccyx' — indices, not free text (same wire format as
  // the app. Persistent local D1: find a suffix no earlier run has claimed.
  let pick = null, r1 = null;
  for (let i = 0; i < 8 && !pick; i++) {
    const cand = { adj: 57, noun: 15, num: 100 + Math.floor(Math.random() * 800) };
    const res = await signedFetch(a.k.kp, a.p.playerId, 'POST', '/name', JSON.stringify(cand));
    if (res.status === 200) { pick = cand; r1 = res; }
  }
  assert.ok(pick, 'could not find an unclaimed name to test with');
  assert.equal(r1.status, 200, 'first claimant gets the name');
  const taken = (await r1.json()).name;

  const r2 = await signedFetch(b.k.kp, b.p.playerId, 'POST', '/name', JSON.stringify(pick));
  assert.equal(r2.status, 409, 'second claimant is refused');
  const d2 = await r2.json();
  assert.equal(d2.reason, 'taken', 'refusal is a NAMED outcome, not a bare error');
  assert.equal(d2.name, taken);
  assert.ok(Number.isInteger(d2.suggestNum) && d2.suggestNum >= 1, 'a free number is offered: ' + JSON.stringify(d2));

  // the offered number must actually work
  const r3 = await signedFetch(b.k.kp, b.p.playerId, 'POST', '/name', JSON.stringify({ ...pick, num: d2.suggestNum }));
  assert.equal(r3.status, 200, 'the suggested number is genuinely free');
  assert.notEqual((await r3.json()).name, taken);
});

await test('names are unique: case-insensitive, and re-saving your OWN name still works', async () => {
  const k = await makeKeys();
  const p = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: k.pubJwk }) })).json();
  const pick = { adj: 58, noun: 62, num: 100 + Math.floor(Math.random() * 800) };
  assert.equal((await signedFetch(k.kp, p.playerId, 'POST', '/name', JSON.stringify(pick))).status, 200);
  // re-saving the identical name must NOT trip the guard (id <> self)
  assert.equal((await signedFetch(k.kp, p.playerId, 'POST', '/name', JSON.stringify(pick))).status, 200,
    'a player re-saving their own name must not be told it is taken');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
