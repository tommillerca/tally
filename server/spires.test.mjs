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

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
let passed = 0, failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); failed++; }
}

const b64 = buf => Buffer.from(new Uint8Array(buf)).toString('base64');

async function newPlayer(name) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const res = await fetch(`${BASE}/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: pubJwk }),
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

  await test('ownership actually moved', async () => {
    const j = await (await A.signed('GET', `/spires?ids=${s1.id}`)).json();
    assert.equal(j.spires[0].mine, false);
  });

  await test('the 3-spire cap is enforced ON THE SERVER', async () => {
    const C = await newPlayer('C');
    const mine = [spire(101), spire(102), spire(103)];
    for (const s of mine) {
      const r = await C.signed('PUT', `/spires/${s.id}/claim`, { name: s.name, lat: s.lat, lng: s.lng });
      assert.equal(r.status, 200, `claiming ${s.id} should succeed`);
    }
    const fourth = spire(104);
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

  await test('a junk spire id is refused', async () => {
    const r = await A.signed('PUT', '/spires/..%2Fetc/claim', { name: 'x', lat: 1, lng: 1 });
    assert.ok(r.status >= 400, `expected a 4xx, got ${r.status}`);
  });

  await test('unsigned requests are refused', async () => {
    const r = await fetch(`${BASE}/spires?ids=${s1.id}`);
    assert.equal(r.status, 401);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
};
run();
