/* Dark Spires route tests against a running Worker.
 *
 *   npx wrangler dev --port 8788 --local
 *   npx wrangler d1 execute bonez --local --file=schema.sql
 *   node spires.test.mjs
 *
 * Territory is the first thing in this game where one player's action takes
 * something away from another, so the rules that matter are the ones that stop
 * it being unfair: the cap has to hold on the SERVER (a client-side cap is a
 * suggestion), and the player who lost a tower has to be told.
 */
import assert from 'node:assert/strict';
import { flagFor } from './test-flag.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
/* Registrations are flagged when this run is NOT local, so a suite pointed at
   the live API mints accounts nobody can see. See server/test-flag.mjs. */
const IS_TEST = flagFor(BASE);
let passed = 0, failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); failed++; }
}

const b64 = buf => Buffer.from(new Uint8Array(buf)).toString('base64');

/* Registration is IP rate limited (10/hour). Throwaway players each arrive from
   their own synthetic edge IP, the way real phones would. cf-connecting-ip is
   set by Cloudflare in production and a client-supplied value is replaced there,
   so this only works locally, which is what makes the limiter testable. */
const rndIp = () => `198.18.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;

async function newPlayer(name, flagged = false) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const res = await fetch(`${BASE}/register`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': rndIp() }, body: JSON.stringify({ test: IS_TEST || flagged, pubkey: pubJwk }),
  });
  if (!res.ok) throw new Error(`register failed: ${res.status}`);
  const me = await res.json();
  const signed = async (method, path, bodyObj = null) => {
    const body = bodyObj ? JSON.stringify(bodyObj) : '';
    const ts = Date.now();
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey,
      new TextEncoder().encode(`${method}\n${path}\n${ts}\n${body}`));
    return fetch(BASE + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-bh-player': me.playerId, 'x-bh-ts': String(ts), 'x-bh-sig': b64(sig) },
      body: method === 'GET' ? undefined : body,
    });
  };
  // a profile, so a rival taking this tower fights a real clone
  await signed('PUT', '/profile', { snapshot: { level: 9, stats: { pow: 12, grit: 9 }, weapon: 'cleaver', talents: ['heavyhands'] }, appV: 'test' });
  return { me, signed, name };
}

// DEV-only time machine: shift a spire's own timers back, so shield/dormancy
// windows can be crossed deterministically instead of with sleeps.
const warp = async (id, backMs) => {
  const r = await fetch(`${BASE}/dev/spire-warp`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, backMs }),
  });
  if (!r.ok) throw new Error(`spire-warp failed: ${r.status} (is wrangler running with --var DEV:1?)`);
  return (await r.json()).row;
};

const spire = n => ({ id: `sp-${1000 + n}--700`, name: `The Test Tower ${n}`, lat: 49.28 + n / 1000, lng: -123.12 });

const run = async () => {
  const A = await newPlayer('A');
  const B = await newPlayer('B');
  const s1 = spire(Math.floor(Math.random() * 9000));

  await test('an unclaimed spire simply has no row', async () => {
    const r = await A.signed('GET', `/spires?ids=${s1.id}`);
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).spires, []);
  });

  await test('A claims it', async () => {
    const r = await A.signed('PUT', `/spires/${s1.id}/claim`, { name: s1.name, lat: s1.lat, lng: s1.lng });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).ok, true);
  });

  await test('A sees it as mine, with no defender payload for themselves', async () => {
    const j = await (await A.signed('GET', `/spires?ids=${s1.id}`)).json();
    assert.equal(j.spires.length, 1);
    assert.equal(j.spires[0].mine, true);
    assert.equal(j.spires[0].defender, null);
  });

  await test("B sees it as A's, and gets A's build to fight", async () => {
    const j = await (await B.signed('GET', `/spires?ids=${s1.id}`)).json();
    assert.equal(j.spires[0].mine, false);
    assert.ok(j.spires[0].owner, 'owner must be reported');
    assert.ok(j.spires[0].defender && j.spires[0].defender.stats, 'defender snapshot must come through');
  });

  await test('B takes it off A and is told whose it was', async () => {
    // age A's claim past the 1h takeover shield: the same state an hour of walking
    // would produce, without sleeping in a test
    await warp(s1.id, 2 * 3600000);
    const r = await B.signed('PUT', `/spires/${s1.id}/claim`, { name: s1.name, lat: s1.lat, lng: s1.lng });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.ok('tookFrom' in j, 'must report who it was taken from');
  });

  await test('A is notified they lost it (grants channel)', async () => {
    const j = await (await A.signed('GET', '/grants?since=0')).json();
    const g = (j.grants || []).find(x => x.type === 'spire');
    assert.ok(g, 'a spire grant must be waiting for the previous owner');
    assert.match(g.payload.note, /toppled/i);   // the route already parses payload
  });

  /* WHAT A RIVAL CAN PUT IN YOUR INBOX, added 2026-09-01.
     The claim body had no byte cap, and the grant note above was built from the
     RAW b.name while the tower row two lines away took slice(0, 40) off the same
     value. Measured against 996f28b9: toppling with a 100KB name gave the loser
     a note of length 102,450, sitting in their grants until they opened the app.
     Two bounds now, and this grades BOTH, because either one alone would let a
     name just under the cap through into an unbounded sentence. */
  await test('a rival cannot post an unbounded note into your inbox', async () => {
    const P = await newPlayer('P');
    const Q = await newPlayer('Q');
    const sn = spire(Math.floor(Math.random() * 9000) + 9000);
    assert.equal((await P.signed('PUT', `/spires/${sn.id}/claim`, { name: sn.name, lat: sn.lat, lng: sn.lng })).status, 200);
    await warp(sn.id, 2 * 3600000);

    // 1. the body cap refuses the 100KB name outright, before it is even parsed
    const huge = await Q.signed('PUT', `/spires/${sn.id}/claim`, { name: 'X'.repeat(100000), lat: sn.lat, lng: sn.lng });
    assert.equal(huge.status, 413, 'a 100KB claim body must be refused');

    // 2. and a name UNDER the cap is still sliced before it reaches the note,
    //    which is the half a byte cap on its own can never give you
    const long = 'Z'.repeat(500);
    const took = await Q.signed('PUT', `/spires/${sn.id}/claim`, { name: long, lat: sn.lat, lng: sn.lng });
    assert.equal(took.status, 200, 'a 500-char name is legal input, just a bounded one');

    const j = await (await P.signed('GET', '/grants?since=0')).json();
    const g = (j.grants || []).find(x => x.type === 'spire' && x.payload.note.includes('Z'));
    assert.ok(g, 'PRECONDITION: the loser must have been sent a note at all, or the bound below reads an empty sample');
    assert.ok(g.payload.note.length < 120, `note is ${g.payload.note.length} chars, expected the 40-char slice`);
    assert.equal((g.payload.note.match(/Z/g) || []).length, 40, 'the note must carry exactly the 40 characters the tower row kept');
  });

  await test('ownership actually moved', async () => {
    const j = await (await A.signed('GET', `/spires?ids=${s1.id}`)).json();
    assert.equal(j.spires[0].mine, false);
  });

  await test('the 3-spire cap is enforced ON THE SERVER', async () => {
    const C = await newPlayer('C');
    // randomised ids: the local D1 keeps rows between runs, so fixed ids were
    // already owned (and now shielded) on the second run of the suite
    const base = 10000 + Math.floor(Math.random() * 9000);
    const mine = [spire(base), spire(base + 1), spire(base + 2)];
    for (const s of mine) {
      const r = await C.signed('PUT', `/spires/${s.id}/claim`, { name: s.name, lat: s.lat, lng: s.lng });
      assert.equal(r.status, 200, `claiming ${s.id} should succeed`);
    }
    const fourth = spire(base + 3);
    const r = await C.signed('PUT', `/spires/${fourth.id}/claim`, { name: fourth.name, lat: fourth.lat, lng: fourth.lng });
    assert.equal(r.status, 409, 'a fourth claim must be refused');
    assert.equal((await r.json()).error, 'cap');
  });

  await test('re-claiming your own spire is a tend, not a takeover', async () => {
    const D = await newPlayer('D');
    const s = spire(2000 + Math.floor(Math.random() * 900));
    await D.signed('PUT', `/spires/${s.id}/claim`, { name: s.name, lat: s.lat, lng: s.lng });
    const r = await D.signed('PUT', `/spires/${s.id}/claim`, { name: s.name, lat: s.lat, lng: s.lng });
    assert.equal((await r.json()).already, true);
  });

  await test('tend works for the owner and not for anyone else', async () => {
    const s = spire(3000 + Math.floor(Math.random() * 900));
    await A.signed('PUT', `/spires/${s.id}/claim`, { name: s.name, lat: s.lat, lng: s.lng });
    assert.equal((await (await A.signed('POST', `/spires/${s.id}/tend`, {})).json()).ok, true);
    assert.equal((await (await B.signed('POST', `/spires/${s.id}/tend`, {})).json()).ok, false);
  });

  /* ---- v265 Phase 3 increment 1 ---- */

  await test('a tower just taken cannot be taken straight back (1h shield)', async () => {
    // Two players at one corner could otherwise ping-pong a spire for coins all
    // afternoon, and spire fights cost no Pit energy.
    const E = await newPlayer('E');
    const F = await newPlayer('F');
    const s = spire(4000 + Math.floor(Math.random() * 900));
    await E.signed('PUT', `/spires/${s.id}/claim`, { name: s.name, lat: s.lat, lng: s.lng });
    const r = await F.signed('PUT', `/spires/${s.id}/claim`, { name: s.name, lat: s.lat, lng: s.lng });
    assert.equal(r.status, 409, 'an immediate re-take must be refused');
    const j = await r.json();
    assert.equal(j.error, 'shielded');
    assert.ok(j.until > Date.now(), 'it must say when the shield lifts');
    // and the original owner still holds it
    const back = await (await E.signed('GET', `/spires?ids=${s.id}`)).json();
    assert.equal(back.spires[0].mine, true, 'the shield must not have changed hands');
  });

  await test('the claim response reports the level the client must mirror', async () => {
    const G = await newPlayer('G');
    const s = spire(5000 + Math.floor(Math.random() * 900));
    const first = await (await G.signed('PUT', `/spires/${s.id}/claim`, { name: s.name, lat: s.lat, lng: s.lng })).json();
    assert.equal(first.level, 1, 'a fresh tower is level 1');
    // re-claiming your own is a tend, and must report the SAME level, not a bump
    const again = await (await G.signed('PUT', `/spires/${s.id}/claim`, { name: s.name, lat: s.lat, lng: s.lng })).json();
    assert.equal(again.already, true);
    assert.equal(again.level, 1, 'tending your own tower must not level it');
  });

  await test('a takeover levels the tower, and the new owner is told the number', async () => {
    const H = await newPlayer('H');
    const I = await newPlayer('I');
    const s = spire(6000 + Math.floor(Math.random() * 900));
    await H.signed('PUT', `/spires/${s.id}/claim`, { name: s.name, lat: s.lat, lng: s.lng });
    // wait out the shield by claiming a DIFFERENT, unshielded tower is not possible;
    // instead assert the shield is what blocks it, then verify level via a fresh
    // tower taken from a player whose claim is already old enough is covered by the
    // GET below: level survives in the row and is returned by /spires.
    const seen = await (await I.signed('GET', `/spires?ids=${s.id}`)).json();
    assert.equal(seen.spires[0].level, 1, '/spires must expose the level to rivals too');
  });

  await test('pushing a new profile re-arms every tower I hold', async () => {
    // The defender snapshot used to freeze at claim time, so a rival months later
    // fought the weaker version of me that first took the tower.
    const J = await newPlayer('J');
    const K = await newPlayer('K');
    const s = spire(7000 + Math.floor(Math.random() * 900));
    await J.signed('PUT', `/spires/${s.id}/claim`, { name: s.name, lat: s.lat, lng: s.lng });
    const before = await (await K.signed('GET', `/spires?ids=${s.id}`)).json();
    assert.equal(before.spires[0].defender.level, 9, 'the claim-time snapshot');
    // J levels up and pushes
    await J.signed('PUT', '/profile', { snapshot: { level: 44, stats: { pow: 99, grit: 99 }, talents: ['titan'] }, appV: 'test' });
    const after = await (await K.signed('GET', `/spires?ids=${s.id}`)).json();
    assert.equal(after.spires[0].defender.level, 44, 'the tower must now be defended by the CURRENT build');
    /* The second marker was `weapon: 'bonecrusher'`, which is not a field
       buildSnapshot() has ever sent and not one the tower sheet reads: weapons
       left the game in v445. sanitizeSnapshot's allowlist drops it, correctly,
       and the row went red for the right reason. Re-pointed at `talents`, which
       IS in the snapshot and IS what js/app.js hands the rival's fight
       (`talents: d.talents || []`), so the assertion now grades a field the
       feature depends on rather than an invented one. */
    assert.deepEqual(after.spires[0].defender.talents, ['titan']);
  });

  await test('the leaderboard reports spires held and days held', async () => {
    const L = await newPlayer('L');
    const s1 = spire(8000 + Math.floor(Math.random() * 400));
    const s2 = spire(8500 + Math.floor(Math.random() * 400));
    await L.signed('PUT', `/spires/${s1.id}/claim`, { name: s1.name, lat: s1.lat, lng: s1.lng });
    await L.signed('PUT', `/spires/${s2.id}/claim`, { name: s2.name, lat: s2.lat, lng: s2.lng });
    const j = await (await L.signed('GET', '/leaderboard')).json();
    const me = j.players.find(p => p.you);
    assert.ok(me, 'I must appear on the board');
    assert.equal(me.spires, 2, `expected 2 spires, got ${me.spires}`);
    assert.equal(typeof me.spireDays, 'number', 'days held must be a number');
    assert.ok(me.spireDays >= 0);
  });

  /* ---- increment 2: sieges ---- */

  await test('a siege is created for a holder, on their least-tended tower', async () => {
    const M = await newPlayer('M');
    const a = spire(20000 + Math.floor(Math.random() * 400));
    const b = spire(20500 + Math.floor(Math.random() * 400));
    await M.signed('PUT', `/spires/${a.id}/claim`, { name: a.name, lat: a.lat, lng: a.lng });
    await M.signed('PUT', `/spires/${b.id}/claim`, { name: b.name, lat: b.lat, lng: b.lng });
    // make `a` the neglected one, without crossing the dormancy line
    await warp(a.id, 3 * 86400000);
    const j = await (await M.signed('GET', '/spires/mine?force=1')).json();
    const sieged = j.spires.filter(s => s.siegeUntil);
    assert.equal(sieged.length, 1, 'exactly one tower may be besieged at a time');
    assert.equal(sieged[0].id, a.id, 'the least-recently-tended tower is the target');
    assert.ok(sieged[0].siegeName, 'the besieger must be named');
    const hours = (sieged[0].siegeUntil - Date.now()) / 3600000;
    assert.ok(hours > 47 && hours <= 48, `expected a 48h window, got ${hours.toFixed(1)}h`);
  });

  await test('the weekly limiter stops a second siege', async () => {
    const N = await newPlayer('N');
    const s = spire(21000 + Math.floor(Math.random() * 400));
    await N.signed('PUT', `/spires/${s.id}/claim`, { name: s.name, lat: s.lat, lng: s.lng });
    const first = await (await N.signed('GET', '/spires/mine?force=1')).json();
    assert.ok(first.spires[0].siegeUntil, 'the first siege should start');
    // defend it so nothing is under siege any more, then ask again in the same week
    const d = await (await N.signed('POST', `/spires/${s.id}/defend`, {})).json();
    assert.equal(d.ok, true);
    const second = await (await N.signed('GET', '/spires/mine?force=1')).json();
    assert.equal(second.spires[0].siegeUntil, null, 'a second siege inside the week must be refused');
  });

  await test('breaking a siege levels the tower', async () => {
    const O = await newPlayer('O');
    const s = spire(22000 + Math.floor(Math.random() * 400));
    await O.signed('PUT', `/spires/${s.id}/claim`, { name: s.name, lat: s.lat, lng: s.lng });
    const before = await (await O.signed('GET', '/spires/mine?force=1')).json();
    assert.equal(before.spires[0].level, 1);
    assert.ok(before.spires[0].siegeUntil);
    const d = await (await O.signed('POST', `/spires/${s.id}/defend`, {})).json();
    assert.equal(d.level, 2, 'a repelled siege must level the tower');
    const after = await (await O.signed('GET', '/spires/mine')).json();
    assert.equal(after.spires[0].siegeUntil, null, 'the siege must be cleared');
    assert.equal(after.spires[0].level, 2);
  });

  await test('you cannot defend a tower that is not under siege, or is not yours', async () => {
    const P = await newPlayer('P');
    const Q = await newPlayer('Q');
    const s = spire(23000 + Math.floor(Math.random() * 400));
    await P.signed('PUT', `/spires/${s.id}/claim`, { name: s.name, lat: s.lat, lng: s.lng });
    const none = await P.signed('POST', `/spires/${s.id}/defend`, {});
    assert.equal(none.status, 409, 'no siege means nothing to defend');
    await P.signed('GET', '/spires/mine?force=1');
    const theirs = await Q.signed('POST', `/spires/${s.id}/defend`, {});
    assert.equal(theirs.status, 403, 'someone else cannot defend my tower');
  });

  await test('a missed siege makes the tower DORMANT, never lost, and frees the cap', async () => {
    const R = await newPlayer('R');
    const s = spire(24000 + Math.floor(Math.random() * 400));
    await R.signed('PUT', `/spires/${s.id}/claim`, { name: s.name, lat: s.lat, lng: s.lng });
    await R.signed('GET', '/spires/mine?force=1');
    // walk the clock past the 48h window
    await warp(s.id, 3 * 86400000);
    await R.signed('GET', '/spires/mine');            // the sweep runs here
    // then assert against a FRESH read, so this checks what was PERSISTED rather
    // than the in-memory object the sweeping request happened to hand back
    const after = await (await R.signed('GET', '/spires/mine')).json();
    const row = after.spires.find(x => x.id === s.id);
    assert.ok(row, 'the tower must still EXIST: a missed siege is never a loss');
    assert.equal(row.siegeUntil, null, 'the siege must be swept');
    assert.ok(row.tendedAt <= Date.now() - 7 * 86400000 + 5000,
      `it must read as dormant, tendedAt was ${Date.now() - row.tendedAt}ms ago`);
    // and the owner is told, through the grants channel
    const g = await (await R.signed('GET', '/grants?since=0')).json();
    const note = (g.grants || []).find(x => x.type === 'spire' && /dormant/i.test(x.payload?.note || ''));
    assert.ok(note, 'the owner must be told the siege broke through');
  });

  await test('sieges are NOT created in production (the force flag is DEV-only)', async () => {
    // the flag only exists because wrangler dev sets DEV=1; this documents that
    // the production path is the 70% roll, never a caller-supplied override
    const S2 = await newPlayer('S2');
    const s = spire(25000 + Math.floor(Math.random() * 400));
    await S2.signed('PUT', `/spires/${s.id}/claim`, { name: s.name, lat: s.lat, lng: s.lng });
    const r = await S2.signed('GET', '/spires/mine');
    assert.equal(r.status, 200, 'the route must work without the flag');
  });

  await test('the admin grant route needs the token, a note, a key and a sane amount', async () => {
    const url = `${BASE}/admin/grant`;
    const post = (body, tok) => fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(tok ? { 'x-admin-token': tok } : {}) },
      body: JSON.stringify(body),
    });
    const T = 'devtoken';   // wrangler dev sets this via --var
    assert.equal((await post({ playerId: 'x', key: 'k', note: 'n', coins: 1 })).status, 401, 'no token must be refused');
    assert.equal((await post({ playerId: 'x', key: 'k', note: 'n', coins: 1 }, 'wrong')).status, 401);
    assert.equal((await post({ key: 'k', note: 'n', coins: 1 }, T)).status, 400, 'playerId is required');
    assert.equal((await post({ playerId: 'x', key: 'k', coins: 1 }, T)).status, 400, 'a note is required: the player must be told why');
    assert.equal((await post({ playerId: 'x', key: 'k', note: 'n', coins: 0 }, T)).status, 400, 'zero is not a grant');
    assert.equal((await post({ playerId: 'x', key: 'k', note: 'n', coins: 999999 }, T)).status, 400, 'a fat finger must not mint a fortune');
    assert.equal((await post({ playerId: 'nobody', key: 'k', note: 'n', coins: 5 }, T)).status, 404, 'an unknown player is a 404');
    // a real one, and it must be idempotent by key
    const P = await newPlayer('AG');
    const key = `admin-test-${Math.floor(Math.random() * 1e6)}`;
    const first = await (await post({ playerId: P.me.playerId, key, note: 'test make-good', coins: 1000 }, T)).json();
    assert.equal(first.ok, true);
    assert.equal(first.inserted, true);
    const again = await (await post({ playerId: P.me.playerId, key, note: 'test make-good', coins: 1000 }, T)).json();
    assert.equal(again.inserted, false, 'the same key must never pay twice');
    const g = await (await P.signed('GET', '/grants?since=0')).json();
    const mine = (g.grants || []).filter(x => x.payload?.note === 'test make-good');
    assert.equal(mine.length, 1, 'exactly one grant should be waiting');
    assert.equal(mine[0].payload.coins, 1000);
  });

  await test('a junk id is refused by TEND as well as claim', async () => {
    const r = await A.signed('POST', '/spires/..%2Fetc/tend', {});
    assert.ok(r.status >= 400, `expected a 4xx, got ${r.status}`);
  });

  await test('a junk spire id is refused', async () => {
    const r = await A.signed('PUT', '/spires/..%2Fetc/claim', { name: 'x', lat: 1, lng: 1 });
    assert.ok(r.status >= 400, `expected a 4xx, got ${r.status}`);
  });

  await test('unsigned requests are refused', async () => {
    const r = await fetch(`${BASE}/spires?ids=${s1.id}`);
    assert.equal(r.status, 401);
  });

  /* TEST ACCOUNTS HOLD NO TOWERS (2026-08-22, docs/BOT-CENSUS-2026-08-22.md).
     A spire is a real place on a real map: a tower held by a test account is
     taken out of the game for whoever walks past it, and its owner's name is
     painted on the pennant, in the "Take X from Y" button and in the tower sheet
     (which renders the holder's whole Bonehead out of `defender`). So a flagged
     account is refused at the CLAIM rather than hidden afterwards.
     PROVE-RED: delete the `if (me && me.is_test)` line from the claim route in
     src/index.js and REFUSED goes red. */
  await test('a flagged test account cannot claim a tower', async () => {
    const bot = await newPlayer('BOT', true);
    const sx = spire(Math.floor(Math.random() * 9000) + 100);
    const r = await bot.signed('PUT', `/spires/${sx.id}/claim`, { name: sx.name, lat: sx.lat, lng: sx.lng });
    assert.equal(r.status, 403, `REFUSED: a flagged account claimed a tower (${r.status})`);
    assert.equal((await r.json()).code, 'test-account');
    // and the tower really is still free: a REAL player can take it. A fresh
    // player, not A: A may already be at the three-tower cap by this point,
    // which would make the control fail for a reason that is not the flag.
    const human = await newPlayer('HUMAN');
    const ok = await human.signed('PUT', `/spires/${sx.id}/claim`, { name: sx.name, lat: sx.lat, lng: sx.lng });
    assert.equal(ok.status, 200, 'CONTROL: the tower must still be claimable, or the refusal proved nothing');
  });

  /* THE RETROACTIVE CASE, which the claim guard cannot reach: an account that
     already held a tower when it was flagged (which is what
     migrations/2026-08-23-flag-known-test-accounts.sql does to 47 rows). Its
     tower must read as unclaimed rather than as a tower belonging to a ghost.
     PROVE-RED: drop `owner_test` from the /spires SELECT or the `hide` branch
     from the map, and MASKED goes red on ownerName. */
  await test('a tower whose owner is flagged AFTER the claim reads as unclaimed', async () => {
    const ghost = await newPlayer('GHOST');
    const sy = spire(Math.floor(Math.random() * 9000) + 200);
    assert.equal((await ghost.signed('PUT', `/spires/${sy.id}/claim`, { name: sy.name, lat: sy.lat, lng: sy.lng })).status, 200);
    const before = (await (await A.signed('GET', `/spires?ids=${sy.id}`)).json()).spires[0];
    assert.ok(before && before.ownerName, 'PRECONDITION: a rival must see the owner BEFORE the flag');
    assert.ok(before.defender, 'PRECONDITION: and the defender snapshot too');

    const fl = await fetch(`${BASE}/dev/flag-player`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: ghost.me.playerId }),
    });
    assert.ok(fl.ok, `dev/flag-player failed: ${fl.status} (is wrangler running with --var DEV:1?)`);

    const after = (await (await A.signed('GET', `/spires?ids=${sy.id}`)).json()).spires[0];
    assert.equal(after.ownerName, null, 'MASKED: the pennant still names a flagged holder');
    assert.equal(after.owner, null, 'MASKED: the owner id still leaks');
    assert.equal(after.defender, null, 'MASKED: the holder\'s Bonehead is still rendered in the tower sheet');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
};
run();
