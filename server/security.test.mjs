/* Security-hardening tests against a running Worker.
 *
 *   npx wrangler d1 execute bonez --local --file=schema.sql
 *   npx wrangler dev --local --port 8788 --var DEV:1 --var ADMIN_TOKEN:devtoken
 *   node security.test.mjs
 *
 * One suite per finding from the 2026-08-16 audit. Each block states the
 * MECHANISM it is defending, which DIRECTION is failure, and the BOUND, because
 * "the number moved" is not a result: the leaderboard's own lazy-mount audit
 * once passed BECAUSE the app was broken, by grading a trend instead of a
 * ceiling. Every assertion here has a side.
 *
 * An empty sample set is a FAILURE, never a pass. Anything that walks a
 * collection asserts the collection is non-empty first, so a check that examined
 * nothing cannot report success.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { flagFor, RUN } from './test-flag.mjs';

const BASE = process.env.BASE || process.env.API || 'http://127.0.0.1:8788';
/* Registrations are flagged when this run is NOT local, so a suite pointed at
   the live API mints accounts nobody can see. See server/test-flag.mjs. */
const IS_TEST = flagFor(BASE);
let passed = 0, failed = 0;

// The limiter outlives the process, so a second run would start throttled.
if (/127\.0\.0\.1|localhost/.test(BASE)) {
  try {
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'bonez', '--local', '--command', 'DELETE FROM rate_limits'],
      { cwd: import.meta.dirname, stdio: 'ignore' });
  } catch { console.log('(could not reset the rate limiter; some limits may already be spent)'); }
}

async function test(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); failed++; }
}
function group(title) { console.log(`\n--- ${title}`); }

const b64 = buf => Buffer.from(new Uint8Array(buf)).toString('base64');
const rndIp = () => `198.18.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
const rndDevice = () => 'sec-' + Math.random().toString(36).slice(2, 12);

async function read(r) {
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, text, json };
}

/** A throwaway player. Each registers from its own synthetic edge IP because
 *  /register is now IP rate limited; cf-connecting-ip is set by Cloudflare at
 *  the edge in production, so this is only settable locally. */
async function newPlayer(ip = rndIp()) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const res = await fetch(`${BASE}/register`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ test: IS_TEST, run: RUN, pubkey: pubJwk }),
  });
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  const me = await res.json();
  /** Sign exactly as the app does. `tsOverride` is passed straight through and
   *  SIGNED, which matters: a test that sent a junk ts with a signature over a
   *  different one would be proving the signature check works, not the skew
   *  check. */
  const signed = async (method, path, bodyObj = null, tsOverride = null) => {
    const body = bodyObj === null ? '' : (typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj));
    const ts = tsOverride === null ? String(Date.now()) : String(tsOverride);
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey,
      new TextEncoder().encode(`${method}\n${path}\n${ts}\n${body}`));
    return fetch(BASE + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-bh-player': me.playerId, 'x-bh-ts': ts, 'x-bh-sig': b64(sig) },
      body: method === 'GET' ? undefined : body,
    });
  };
  return { me, kp, signed };
}

const RACE_V = 2;                    // must match RACE_RULES in src/index.js
const snapshot = (extra = {}) => ({ level: 5, outfit: { SK: 'SK0-1' }, gear: [], raceV: RACE_V, ...extra });
const putProfile = (p, snap) => p.signed('PUT', '/profile', { snapshot: snap, appV: 'sectest' });
const storedProfile = async playerId =>
  JSON.parse((await (await fetch(`${BASE}/dev/player?id=${playerId}`)).json()).profile || '{}');

/* The race week, mirrored from RACE_EPOCH / RACE_DAYS in src/index.js. */
const RACE_EPOCH = '2026-08-07', RACE_DAYS = 7;
const EPOCH_MS = Date.parse(RACE_EPOCH + 'T00:00:00Z');
const WEEK_MS = RACE_DAYS * 86400000;
const weekStartMs = at => EPOCH_MS + Math.floor((at - EPOCH_MS) / WEEK_MS) * WEEK_MS;
const dayKey = ms => new Date(ms).toISOString().slice(0, 10);
const THIS_WEEK = dayKey(weekStartMs(Date.now()));
const LAST_WEEK = dayKey(weekStartMs(Date.now()) - WEEK_MS);
const ELAPSED_DAYS_THIS_WEEK = Math.min(RACE_DAYS,
  Math.max(1, Math.ceil((Date.now() - weekStartMs(Date.now())) / 86400000)));

/* Bounds the server derives, mirrored so the tests assert against the DERIVATION
   rather than against whatever the server happened to answer. */
const MAX_BADGES = 29;                       // BADGES.length in js/game.js
const MAX_STEPS_PER_DAY = 5 * 20000;         // 5x the top STEP_OVER tier in js/game.js
function xpForLevel(L) { return L <= 1 ? 0 : Math.round((120 * Math.pow(L - 1, 1.55) + 80 * (L - 1)) / 10) * 10; }
function levelForXp(xp) { let L = 1; while (L < 100000 && xpForLevel(L + 1) <= xp) L++; return L; }
const DAILY_XP_CEILING = 1589;               // see the derivation in src/index.js
const PRIOR_HISTORY_DAYS = 90;
const XP_ALL_BADGES = MAX_BADGES * 25;
const BURST_LEVELS = levelForXp(DAILY_XP_CEILING);   // 5
const dayZeroLevelCeiling = levelForXp(DAILY_XP_CEILING * PRIOR_HISTORY_DAYS + XP_ALL_BADGES);

console.log(`security hardening @ ${BASE}`);
console.log(`(race week ${THIS_WEEK}, day ${ELAPSED_DAYS_THIS_WEEK} of ${RACE_DAYS}; day-zero level ceiling ${dayZeroLevelCeiling})`);

/* =====================================================================
   FINDING 1. /profile was an unvalidated client assertion.

   MECHANISM. The whole check was: body <= 24 KB, signature valid, snapshot is a
   non-null object. The object was JSON.stringify'd straight into
   players.profile, and /leaderboard ranks on json_extract(profile,'$.level')
   and '$.badges', the step race reads '$.weekSteps' / '$.weekKey' / '$.raceV',
   and the same blob is copied into spires.defender for every tower the caller
   holds. One signed PUT of {level:999999, badges:999999} was rank 1 forever.
   ===================================================================== */
group('1. the profile snapshot is bounded, not merely stored');

await test('an absurd level is clamped to what the XP curve could plausibly produce', async () => {
  const p = await newPlayer();
  const r = await read(await putProfile(p, snapshot({ level: 999999 })));
  assert.equal(r.status, 200, `the sync still succeeds, it is not rejected (${r.text})`);
  assert.ok(r.json.bounded?.includes('level'), 'the response NAMES the field it pulled down');
  const stored = await storedProfile(p.me.playerId);
  // DIRECTION: failure is the level landing ABOVE the ceiling. BOUND: the level
  // the curve reaches from DAILY_XP_CEILING x PRIOR_HISTORY_DAYS plus every
  // badge, which is the most a day-old account could ever have earned.
  assert.ok(stored.level <= dayZeroLevelCeiling,
    `level must not exceed the day-zero ceiling ${dayZeroLevelCeiling}, got ${stored.level}`);
  assert.ok(stored.level >= 1, 'and it is still a real level, not zeroed');
  assert.notEqual(stored.level, 999999, 'the claim itself was not stored');
});

await test('the clamped level is what the LEADERBOARD ranks on', async () => {
  // the bound is worthless if it only lives in players.profile and the board
  // reads something else. This is the consumer the finding was actually about.
  const p = await newPlayer();
  await putProfile(p, snapshot({ level: 999999 }));
  const board = await (await p.signed('GET', '/leaderboard')).json();
  assert.ok(board.players.length > 0, 'PRECONDITION: the board is not empty (an empty sample set is a failure)');
  const me = board.players.find(x => x.playerId === p.me.playerId);
  assert.ok(me, 'PRECONDITION: the player is on the board at all');
  assert.ok(me.level <= dayZeroLevelCeiling, `the board must publish the bounded level, got ${me.level}`);
  // and nobody at all is above the ceiling, so this is not one lucky row
  for (const row of board.players) {
    assert.ok(row.level <= dayZeroLevelCeiling, `${row.name} is on the board at level ${row.level}`);
  }
});

await test('badges cannot exceed the number of badges that exist', async () => {
  const p = await newPlayer();
  const r = await read(await putProfile(p, snapshot({ badges: 999999 })));
  assert.ok(r.json.bounded?.includes('badges'), 'the response names it');
  const stored = await storedProfile(p.me.playerId);
  // BOUND: BADGES.length in js/game.js. There is no judgement in this one --
  // you cannot have earned more badges than the game defines.
  assert.equal(stored.badges, MAX_BADGES, `badges must clamp to ${MAX_BADGES}`);
});

await test('an honest snapshot passes through untouched', async () => {
  // the guard has to be provably non-destructive, or it is a new bug rather
  // than a fix. Nothing here is near a bound.
  const p = await newPlayer();
  const honest = snapshot({ level: 12, badges: 7, levelName: 'Macro Machinist', weekKey: THIS_WEEK, weekSteps: 31000 });
  const r = await read(await putProfile(p, honest));
  assert.equal(r.status, 200);
  assert.equal(r.json.bounded, undefined, `nothing should be bounded on an honest sync, got ${JSON.stringify(r.json.bounded)}`);
  const stored = await storedProfile(p.me.playerId);
  assert.equal(stored.level, 12);
  assert.equal(stored.badges, 7);
  assert.equal(stored.weekSteps, 31000);
  assert.equal(stored.levelName, 'Macro Machinist', 'fields with no bound are carried verbatim');
});

await test('a level jump beyond the daily maximum is refused once the account is old enough to judge', async () => {
  /* The ratchet is a function of TIME, so the account has to actually age. It is
     deliberately not applied on day one, when a first Apple Health backfill
     legitimately imports months of history at once, so the fixture ages the row
     past that window first. */
  const p = await newPlayer();
  await putProfile(p, snapshot({ level: 10 }));
  const warp = await (await fetch(BASE + '/dev/player-warp', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: p.me.playerId, backMs: 10 * 86400000 }),
  })).json();
  assert.ok(warp.ok && warp.row, 'PRECONDITION: the account really was aged');
  assert.equal(warp.row.max_level, 10, 'PRECONDITION: the server recorded the level it accepted');

  const r = await read(await putProfile(p, snapshot({ level: 300 })));
  assert.ok(r.json.bounded?.includes('level'), 'the jump is named as bounded');
  const stored = await storedProfile(p.me.playerId);
  // BOUND: max_level plus BURST_LEVELS for today and for each elapsed day since
  // the level last rose. BURST_LEVELS is the level DAILY_XP_CEILING reaches from
  // a standing start, which is the most the game itself can pay in a day.
  const bound = 10 + BURST_LEVELS * (1 + 10);
  assert.ok(stored.level <= bound, `a 10 -> 300 teleport must be held to ${bound}, got ${stored.level}`);
  assert.ok(stored.level > 10, 'but real progress is still allowed through');
});

group('1b. the step race, which pays real coins');

await test('a fresh account cannot claim LAST week, which is what steals the podium', async () => {
  /* THE MONEY PATH. STEP_RACE_PODIUM pays 5,000 coins, a Golden Crate and 200
     dust for first, settled lazily by whoever calls /steps/week first in a new
     week. Setting weekKey to last week and weekSteps to anything took it. */
  const attacker = await newPlayer();
  const r = await read(await putProfile(attacker, snapshot({ weekKey: LAST_WEEK, weekSteps: 600000 })));
  assert.equal(r.status, 200);
  const stored = await storedProfile(attacker.me.playerId);
  // DIRECTION: failure is any total surviving for a week the server never
  // watched this account race. BOUND: zero, because a past week is frozen at
  // whatever was accepted while it was current, and nothing was.
  assert.equal(stored.weekSteps, 0, 'a past week is frozen at what the server actually recorded, which is nothing');
});

await test('and so the podium is not paid to them', async () => {
  const attacker = await newPlayer();
  await putProfile(attacker, snapshot({ weekKey: LAST_WEEK, weekSteps: 600000 }));
  // trigger settlement of last week, exactly as the attack would
  const wk = await (await attacker.signed('GET', `/steps/week?week=${THIS_WEEK}`)).json();
  assert.ok(wk.week === THIS_WEEK, 'PRECONDITION: the race route answered');
  const grants = await (await attacker.signed('GET', '/grants?since=0')).json();
  const paid = (grants.grants || []).filter(g => String(g.key).startsWith('stepweek-'));
  assert.equal(paid.length, 0, `no step-race prize may be paid to a forged week, got ${JSON.stringify(paid)}`);
});

await test('this week is capped per ELAPSED day, so no hour can add 200,000 steps', async () => {
  const p = await newPlayer();
  const r = await read(await putProfile(p, snapshot({ weekKey: THIS_WEEK, weekSteps: 5000000 })));
  assert.ok(r.json.bounded?.includes('weekSteps'), 'the response names it');
  const stored = await storedProfile(p.me.playerId);
  // BOUND: MAX_STEPS_PER_DAY for each day of this race week that has actually
  // elapsed. On the first day of a week that is 100,000 and it only reaches
  // 700,000 once the whole week has been walked.
  const cap = MAX_STEPS_PER_DAY * ELAPSED_DAYS_THIS_WEEK;
  assert.ok(stored.weekSteps <= cap, `week total must not exceed ${cap} on day ${ELAPSED_DAYS_THIS_WEEK}, got ${stored.weekSteps}`);
  assert.ok(stored.weekSteps > 0, 'and the racer is not simply erased');
});

await test('weekSteps is monotone: a later sync cannot walk the total backwards', async () => {
  const p = await newPlayer();
  await putProfile(p, snapshot({ weekKey: THIS_WEEK, weekSteps: 40000 }));
  await putProfile(p, snapshot({ weekKey: THIS_WEEK, weekSteps: 100 }));
  const stored = await storedProfile(p.me.playerId);
  // DIRECTION: failure is the number going DOWN. Steps do not un-walk, and a
  // total that can fall is a total that can be rewritten.
  assert.equal(stored.weekSteps, 40000, 'the highest accepted total for the week stands');
});

await test('a week key that is not a real, nearby week is dropped entirely', async () => {
  const p = await newPlayer();
  const r = await read(await putProfile(p, snapshot({ weekKey: '2030-01-07', weekSteps: 500000 })));
  assert.ok(r.json.bounded?.includes('weekKey'), 'the response names it');
  const stored = await storedProfile(p.me.playerId);
  assert.equal(stored.weekKey, undefined, 'an uncontestable week is not a week');
  assert.equal(stored.weekSteps, undefined, 'and it carries no total with it');
  // a mid-week date that is not a period start is not a week either
  const p2 = await newPlayer();
  const mid = dayKey(weekStartMs(Date.now()) + 3 * 86400000);
  await putProfile(p2, snapshot({ weekKey: mid, weekSteps: 90000 }));
  assert.equal((await storedProfile(p2.me.playerId)).weekKey, undefined,
    `${mid} is inside the week but is not its start, so it is not a valid key`);
});

await test('the bounded snapshot is what defends a spire, not the raw claim', async () => {
  // /profile copies the snapshot into spires.defender for every tower the caller
  // holds. If the clamp happened after that copy, a rival would fight the
  // inflated build.
  const owner = await newPlayer();
  const rival = await newPlayer();
  const id = `sp-${900000 + Math.floor(Math.random() * 9000)}-${900000 + Math.floor(Math.random() * 9000)}`;
  await putProfile(owner, snapshot({ level: 6 }));
  const claim = await read(await owner.signed('PUT', `/spires/${id}/claim`, { name: 'Test Spire', lat: 1, lng: 1 }));
  assert.equal(claim.status, 200, `PRECONDITION: the tower was claimed (${claim.text})`);
  await putProfile(owner, snapshot({ level: 999999, badges: 999999 }));
  const seen = await (await rival.signed('GET', `/spires?ids=${id}`)).json();
  assert.equal(seen.spires.length, 1, 'PRECONDITION: the rival can see the tower');
  const def = seen.spires[0].defender;
  assert.ok(def, 'PRECONDITION: there is a defender payload to check');
  assert.ok(def.level <= dayZeroLevelCeiling, `the defender must carry the bounded level, got ${def.level}`);
  assert.equal(def.badges, MAX_BADGES, 'and the bounded badge count');
});

/* =====================================================================
   FINDING 2. Unauthenticated unlimited writes, and the recovery lockout.

   THE SHARP EDGE. rateLimitRecovery counted its budget by querying the SAME
   events table that /events writes to, on a bucket key of
   SHA-256('bh-rl:' + ip) truncated to 8 bytes. Every ingredient was in the
   published source, so anyone could compute the bucket for any IP and POST ten
   forged rows with that device and name='rl_recovery', locking that IP out of
   account recovery for ten minutes and, at about six requests an hour, forever.
   Recovery is the only path that saves an account whose keychain is gone.
   ===================================================================== */
group('2. the recovery lockout, and real limits on the unsigned writes');

/** The bucket the OLD limiter would have used for an IP. This is the attack,
 *  reproduced exactly: it is computable by anyone holding the source. */
async function legacyBucketFor(ip) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bh-rl:' + ip));
  return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

await test('THE SHARP EDGE: forging limiter rows through /events cannot lock an IP out of recovery', async () => {
  const victimIp = rndIp();
  // a real account with a recovery bundle, so a successful lookup is observable
  const victim = await newPlayer(victimIp);
  const rid = 'vic' + Math.random().toString(36).slice(2, 10);
  const bundle = { wrapped: Buffer.from('ciphertext').toString('base64'), salt: 'c2FsdA==', iters: 1000000, recoveryId: rid };
  assert.equal((await victim.signed('PUT', '/recovery', bundle)).status, 200, 'PRECONDITION: a bundle is stored');

  // THE ATTACK. Compute the victim's bucket and post far more than the budget.
  const bucket = await legacyBucketFor(victimIp);
  const forged = Array.from({ length: 25 }, () => ({ name: 'rl_recovery' }));
  const ev = await read(await fetch(BASE + '/events', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': rndIp() },
    body: JSON.stringify({ device: bucket, appV: 'attack', events: forged }),
  }));
  // The attack must genuinely have been CARRIED OUT, or this test proves
  // nothing: an empty sample set is a failure.
  assert.equal(ev.status, 200, `PRECONDITION: the ingest accepted the forged batch (${ev.text})`);
  assert.equal(ev.json.accepted, 25, `PRECONDITION: all 25 forged rows were written, got ${ev.json.accepted}`);
  // and for the other bucket name too, since both share the route
  await fetch(BASE + '/events', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': rndIp() },
    body: JSON.stringify({ device: bucket, appV: 'attack', events: Array.from({ length: 25 }, () => ({ name: 'rl_ridcheck' })) }),
  });

  // DIRECTION: failure is a 429. The victim must still be able to recover.
  const look = await read(await fetch(`${BASE}/recovery/id/${rid}`, { headers: { 'cf-connecting-ip': victimIp } }));
  assert.notEqual(look.status, 429, 'a stranger must not be able to spend the victim\'s recovery budget');
  assert.equal(look.status, 200, `and the bundle still comes back (${look.text})`);
  assert.ok(look.json.wrapped, 'with the ciphertext intact');
});

await test('the recovery limiter still limits the person actually using it', async () => {
  // the decoupling must not have removed the throttle it replaced: this is the
  // other direction of the same guard.
  const ip = rndIp();
  let saw429 = false, attempts = 0;
  for (let i = 0; i < 30 && !saw429; i++) {
    attempts++;
    const r = await fetch(`${BASE}/recovery/id/nosuch${Math.random().toString(36).slice(2, 8)}`, { headers: { 'cf-connecting-ip': ip } });
    if (r.status === 429) saw429 = true;
  }
  assert.ok(saw429, 'ciphertext lookups must still throttle, or the phrase can be attacked at speed');
  assert.ok(attempts > 5, `and not on the first try either, got ${attempts}`);
});

await test('/events is rate limited per device, above honest traffic and below abuse', async () => {
  const device = rndDevice();
  const ip = rndIp();
  const post = () => fetch(BASE + '/events', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ device, appV: 'sectest', events: [{ name: 'app_open' }] }),
  });
  // DIRECTION, LOW SIDE: a normal client makes about 28 POSTs a day. Throttling
  // any of those is a broken game, so the first 28 must all be accepted.
  for (let i = 0; i < 28; i++) {
    assert.equal((await post()).status, 200, `honest daily traffic must never be throttled (request ${i + 1})`);
  }
  // DIRECTION, HIGH SIDE: it must actually stop. BOUND: 120/hour, so a 429 by
  // 130. Without a ceiling this is a trend, and a trend is not a check.
  let saw429 = false, at = 0;
  for (let i = 29; i <= 130 && !saw429; i++) {
    at = i;
    if ((await post()).status === 429) saw429 = true;
  }
  assert.ok(saw429, 'the ingest must refuse eventually, or 51 D1 writes a request is unbounded');
  assert.ok(at > 100, `and the limit must sit above honest volume, tripped at ${at}`);
});

await test('/events limiting is per device, not global: one abuser cannot mute everyone', async () => {
  // the previous test just spent a device's whole budget. A different device
  // from a different IP must be unaffected, or the limiter is a denial of
  // service in its own right.
  const r = await fetch(BASE + '/events', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': rndIp() },
    body: JSON.stringify({ device: rndDevice(), appV: 'sectest', events: [{ name: 'app_open' }] }),
  });
  assert.equal(r.status, 200, 'an unrelated device must still be able to send');
});

/* THE CROWD, WHICH IS THE CASE THE TEST ABOVE CANNOT SEE, because it puts the
   unrelated device on a DIFFERENT address. Round 12 put twelve users on ONE:
   each posted 60 events an hour, half of what a single device is allowed, and
   users 1 to 10 spent the 600/hour IP budget exactly while users 11 and 12 got
   429 on every post for the rest of the window. A brand-new install's very
   first POST came back 429 with a retry-after of 59 minutes. So an office,
   school, gym or stadium behind one NAT went analytics-dark, and the devices
   upsert with it, once about ten people were active on it.
   This is the expensive form of the check: 612 real requests through one
   address, which is the smallest number that crosses the old 600 ceiling and
   therefore the smallest that goes RED on the old constant. The cheap form
   (arithmetic on the two constants, no worker) lives in schema-plan.test.mjs;
   neither covers the other, because a limit can be big enough on paper and
   still be checked in an order that refuses the request. */
await test('a NAT\'d crowd is not locked out: 12 devices behind one address all keep sending', async () => {
  const ip = rndIp();
  const crowd = Array.from({ length: 12 }, () => rndDevice());
  const post = device => fetch(BASE + '/events', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ device, appV: 'sectest', events: [{ name: 'app_open' }] }),
  });
  // 51 rounds x 12 devices = 612 requests on one IP, which is past the 600 the
  // old budget allowed. Round-robin, so the last device is not simply the one
  // that arrives after the budget is spent.
  const refused = new Map();
  for (let round = 0; round < 51; round++) {
    const results = await Promise.all(crowd.map(post));
    for (let i = 0; i < crowd.length; i++) {
      if (results[i].status === 429) refused.set(crowd[i], (refused.get(crowd[i]) || 0) + 1);
      await results[i].text();
    }
  }
  // DIRECTION: any 429 at all is the failure, and the BOUND is that the run
  // genuinely exceeded the old ceiling. 612 > 600, so a green result here could
  // not have been produced by a run that stayed inside it.
  assert.equal(refused.size, 0,
    `${refused.size} of 12 devices behind one address were refused (${[...refused.values()].join(', ')} posts each). ` +
    'On NAT that is every install past the tenth going dark, first POST included.');

  // AND THE FIRST-INSTALL CASE BY NAME, because it is the one that hurts most:
  // a phone that has never posted anything, arriving on a busy address.
  const brandNew = await fetch(BASE + '/events', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ device: rndDevice(), appV: 'sectest', events: [{ name: 'app_open' }] }),
  });
  await brandNew.text();
  assert.equal(brandNew.status, 200,
    'a first-time install on a busy address was refused, which is the exact 429 round 12 measured');
});

await test('and the same address still stops ONE abusive device', async () => {
  /* The other direction of the same guard, on the SAME address the crowd just
     used: raising the IP budget must not have removed the control. The device
     bucket is the one that binds, so an abuser spends its own 120/hour and
     stops, while the crowd around it is untouched. */
  const ip = rndIp();
  const abuser = rndDevice(), bystander = rndDevice();
  const post = device => fetch(BASE + '/events', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ device, appV: 'sectest', events: [{ name: 'app_open' }] }),
  });
  let saw429 = false, at = 0;
  for (let i = 1; i <= 140 && !saw429; i++) {
    at = i;
    const r = await post(abuser);
    if (r.status === 429) saw429 = true;
    await r.text();
  }
  assert.ok(saw429, 'one device could post 140 times an hour unchecked, at 51 D1 writes a request');
  assert.ok(at > 100, `and the ceiling must sit above honest volume, tripped at ${at}`);
  // BOUND, and the whole point: the abuser is stopped and the address is not.
  const other = await post(bystander);
  await other.text();
  assert.equal(other.status, 200,
    'spending one device\'s budget locked out its neighbours, so the limiter is still a denial of service');
});

await test('/register is rate limited per IP, and only that IP', async () => {
  const ip = rndIp();
  const mint = async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
    return fetch(`${BASE}/register`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
      body: JSON.stringify({ test: IS_TEST, run: RUN, pubkey: pubJwk }),
    });
  };
  // BOUND: 10/hour. Enough for a household setting up several phones.
  let saw429 = false, at = 0;
  for (let i = 1; i <= 20 && !saw429; i++) {
    at = i;
    if ((await mint()).status === 429) saw429 = true;
  }
  assert.ok(saw429, 'account minting must be bounded');
  assert.ok(at > 5, `but a family with a few phones must get through, tripped at ${at}`);
  // and a different IP is untouched, which is what proves the bucket is per-IP
  const other = await newPlayer();
  assert.ok(other.me.playerId, 'a different IP can still register');
});

await test('/report and /survey are rate limited per device', async () => {
  const device = rndDevice();
  const ip = rndIp();
  const report = () => fetch(BASE + '/report', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ device, kind: 'den-nominate', note: 'a place' }),
  });
  assert.equal((await report()).status, 200, 'the first report goes through');
  let reportBlocked = false, ra = 0;
  for (let i = 2; i <= 40 && !reportBlocked; i++) { ra = i; if ((await report()).status === 429) reportBlocked = true; }
  assert.ok(reportBlocked, 'map feedback must be bounded');
  assert.ok(ra > 10, `but a session's worth of nominations must land, tripped at ${ra}`);

  const sdevice = rndDevice();
  const survey = () => fetch(BASE + '/survey', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': rndIp() },
    body: JSON.stringify({ device: sdevice, name: 'T', email: 't@example.com', feedback: 'hi' }),
  });
  assert.equal((await survey()).status, 200, 'the survey can be submitted');
  let surveyBlocked = false;
  for (let i = 2; i <= 12 && !surveyBlocked; i++) { if ((await survey()).status === 429) surveyBlocked = true; }
  assert.ok(surveyBlocked, 'a one-time survey must not be an unbounded write endpoint');
});

/* =====================================================================
   FINDING 3. The leaderboard published the lookup key to every top player's
   encrypted identity bundle.

   MECHANISM. /leaderboard returned friendCode for the top 100. GET
   /recovery/<friendCode> is unsigned by necessity and returns {wrapped, salt,
   iters}: the AES-GCM-wrapped identity bundle. So one signed call harvested 100
   codes and 100 bundles could then be attacked offline forever. A cracked phrase
   yields the ECDSA signing key AND the AES backup key. The KDF (PBKDF2,
   1,000,000 iterations) is strong and is not the defect; the free availability
   of the ciphertext is.
   ===================================================================== */
group('3. the board no longer publishes a handle to anyone\'s ciphertext');

await test('no friend code appears anywhere in a leaderboard response', async () => {
  const p = await newPlayer();
  await putProfile(p, snapshot({ level: 9 }));
  const other = await newPlayer();
  await putProfile(other, snapshot({ level: 8 }));
  const res = await read(await p.signed('GET', '/leaderboard'));
  assert.equal(res.status, 200);
  const rows = res.json.players || [];
  // an empty board would make every assertion below vacuously true
  assert.ok(rows.length >= 2, `PRECONDITION: the board has rows to inspect, got ${rows.length}`);
  // DIRECTION: failure is ANY occurrence. BOUND: zero, over the whole payload,
  // not just the field it used to live in -- a code moved to another key is the
  // same leak.
  const codes = res.text.match(/BONE-[A-Z0-9]{4}-[A-Z0-9]{4}/g) || [];
  assert.equal(codes.length, 0, `the board must carry no friend codes at all, found ${codes.length}: ${codes.slice(0, 3)}`);
  for (const row of rows) {
    assert.equal(row.friendCode, undefined, `${row.name} still carries a friendCode field`);
  }
  // and the replacement is present, or the Add button has nothing to send
  const someoneElse = rows.find(r => !r.you);
  assert.ok(someoneElse, 'PRECONDITION: the board shows somebody other than the caller');
  assert.ok(typeof someoneElse.addToken === 'string' && someoneElse.addToken.length > 20,
    'each row carries an opaque add token instead');
  assert.ok(!/BONE-/.test(someoneElse.addToken), 'and the token is not a friend code in disguise');
});

await test('the add token adds that player, and nothing else', async () => {
  const a = await newPlayer();
  const b = await newPlayer();
  await putProfile(a, snapshot({ level: 11 }));
  await putProfile(b, snapshot({ level: 11 }));
  const board = await (await b.signed('GET', '/leaderboard')).json();
  const row = board.players.find(x => x.playerId === a.me.playerId);
  assert.ok(row && row.addToken, 'PRECONDITION: A is on B\'s board with a token');
  const r = await read(await b.signed('POST', '/friends/add', { token: row.addToken }));
  assert.equal(r.status, 200, `adding from the board must work (${r.text})`);
  assert.equal(r.json.status, 'pending', 'it is a REQUEST, which the other player still has to accept');
  const list = await (await a.signed('GET', '/friends')).json();
  assert.ok(list.incoming.some(x => x.playerId === b.me.playerId), 'A sees the incoming request');
});

await test('a forged or tampered add token is refused', async () => {
  const a = await newPlayer();
  const b = await newPlayer();
  await putProfile(a, snapshot({ level: 11 }));
  const board = await (await b.signed('GET', '/leaderboard')).json();
  const row = board.players.find(x => x.playerId === a.me.playerId);
  assert.ok(row && row.addToken, 'PRECONDITION: a real token to tamper with');
  const [exp, mac, id] = row.addToken.split('.');
  const flip = s => s.slice(0, -1) + (s.slice(-1) === 'a' ? 'b' : 'a');
  const forgeries = {
    'a flipped signature': `${exp}.${flip(mac)}.${id}`,
    'a stretched expiry': `${(parseInt(exp, 36) + 86400000).toString(36)}.${mac}.${id}`,
    'a swapped player id': `${exp}.${mac}.${b.me.playerId}`,
    'no signature at all': `${exp}..${id}`,
    'not a token': 'garbage',
  };
  for (const [what, token] of Object.entries(forgeries)) {
    const r = await read(await b.signed('POST', '/friends/add', { token }));
    assert.equal(r.status, 400, `${what} must be refused, got ${r.status}`);
  }
  // and the real one still works, so this is not a blanket rejection
  assert.equal((await b.signed('POST', '/friends/add', { token: row.addToken })).status, 200,
    'the genuine token is still accepted');
});

await test('the harvest is closed end to end: board -> code -> bundle no longer joins up', async () => {
  const victim = await newPlayer();
  await putProfile(victim, snapshot({ level: 40 }));
  const rid = 'v' + Math.random().toString(36).slice(2, 10);
  assert.equal((await victim.signed('PUT', '/recovery', {
    wrapped: Buffer.from('secret-bundle').toString('base64'), salt: 'c2FsdA==', iters: 1000000, recoveryId: rid,
  })).status, 200, 'PRECONDITION: the victim has a wrapped bundle to steal');

  const attacker = await newPlayer();
  const board = await read(await attacker.signed('GET', '/leaderboard'));
  assert.ok((board.json.players || []).length > 0, 'PRECONDITION: the attacker can read a non-empty board');
  // step 1 of the attack: harvest codes. There are none.
  assert.equal((board.text.match(/BONE-[A-Z0-9]{4}-[A-Z0-9]{4}/g) || []).length, 0, 'nothing to harvest');
  // step 2, granting the attacker the code anyway (say they were sent it in a
  // chat): it is no longer a handle to the ciphertext for a modern account.
  const direct = await read(await fetch(`${BASE}/recovery/${victim.me.friendCode}`, { headers: { 'cf-connecting-ip': rndIp() } }));
  assert.equal(direct.status, 404, `a friend code must not resolve to a bundle (${direct.text})`);
  assert.ok(!direct.json?.wrapped, 'and above all not to the wrapped bundle');
});

/* =====================================================================
   FINDING 4. The timestamp skew check failed open.

   MECHANISM. `Math.abs(Date.now() - Number(ts)) > MAX_SKEW_MS` with ts="abc"
   is `NaN > 300000`, which is false, so the request was NOT rejected. Any
   non-numeric x-bh-ts skipped the five-minute freshness bound entirely.

   These sign over the junk timestamp they send, so the ONLY thing that can
   reject them is the skew check. A test that signed over a different value
   would be re-proving the signature check and would pass with the bug present.
   ===================================================================== */
group('4. the timestamp skew check fails closed');

await test('a non-numeric timestamp is refused, though the signature over it is valid', async () => {
  const p = await newPlayer();
  for (const junk of ['abc', 'NaN', 'Infinity', '-Infinity', '12abc', 'null', '{}', ' ']) {
    const r = await p.signed('GET', '/me', null, junk);
    // DIRECTION: failure is 200. With the bug, every one of these was served.
    assert.equal(r.status, 401, `x-bh-ts=${JSON.stringify(junk)} must be refused, got ${r.status}`);
  }
});

await test('the freshness bound still holds for numbers, in both directions', async () => {
  const p = await newPlayer();
  const old = await p.signed('GET', '/me', null, Date.now() - 10 * 60 * 1000);
  assert.equal(old.status, 401, 'a stale timestamp is still refused');
  const future = await p.signed('GET', '/me', null, Date.now() + 10 * 60 * 1000);
  assert.equal(future.status, 401, 'and so is one from the future');
  const now = await p.signed('GET', '/me', null, Date.now());
  assert.equal(now.status, 200, 'and a real one still works: this is a fix, not a lockout');
});

await test('a non-numeric timestamp cannot write either', async () => {
  // /me is a read. The finding matters most on the routes that change state.
  const p = await newPlayer();
  const before = await storedProfile(p.me.playerId);
  const r = await p.signed('PUT', '/profile', { snapshot: snapshot({ level: 3 }) }, 'abc');
  assert.equal(r.status, 401, 'a write with a junk timestamp is refused');
  const after = await storedProfile(p.me.playerId);
  assert.deepEqual(after, before, 'and nothing was written');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
