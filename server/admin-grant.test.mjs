/* GOD MODE: the admin make-good channel, against a running Worker.
 *
 *   npx wrangler d1 execute bonez --local --file=schema.sql
 *   npx wrangler dev --local --port 8788 --var DEV:1 --var ADMIN_TOKEN:devtoken
 *   node admin-grant.test.mjs
 *
 * WHY THIS EXISTS. Tom, 2026-08-21, after a player deleted her Day One Lizard by
 * accident: "make sure that this is some sort of feature youre figuring out for
 * the future. there will be tiems that we need to go god mode and fix player's
 * mistakes by giving them a new pet etc". So POST /admin/grant grew from
 * coins-only to a small allowlisted menu, and GET /admin/players was added
 * because support arrives as a NAME and the grant route takes a player_id.
 *
 * A CHANNEL THAT CAN MINT ITEMS IS THE MOST DANGEROUS THING IN THIS CODEBASE, so
 * every row below grades one of the properties that keeps it safe, and each one
 * states which direction is failure:
 *
 *   GATE       no token and a wrong token are 401. Failure is a 200.
 *   BODY       playerId, key and note are all required, and an unknown player is
 *              a 404 BEFORE anything is written. Failure is a grant row landing
 *              on nobody, or a player never being told why a gift arrived.
 *   CAP        coins stay 1..20000 and dust 1..2000. Failure is a number outside
 *              the band being accepted, in EITHER direction: 0 is not a grant.
 *   ALLOWLIST  a pet, crate or consumable that is not on the menu is refused,
 *              and so is pet:'random'. Failure is a 200 on an id nobody vetted.
 *   REFUSED    gearId, xp and rename are refused BY NAME, and the refusal writes
 *              nothing. Failure is power, a level, or a forced rename being
 *              mintable from a curl.
 *   DRIFT      the menu and data/boneheadz.js agree about which pets exist, in
 *              BOTH directions. Failure in one direction is a species Tom cannot
 *              hand back at 2am; in the other it is an id that would grant an
 *              item the game has never heard of.
 *   ONCE       the same key twice grants exactly ONE row. Failure is a repeat
 *              call paying twice, which is the whole reason `key` is required.
 *   ADDITIVE   a grant never disturbs a grant already waiting, never touches the
 *              player row, and never lands on anybody else. Failure is this
 *              route being able to take something away.
 *   LOOKUP     the name search is admin-gated, read-only, and finds a player by
 *              name, handle, friend code or id. Failure is Tom having to guess a
 *              uuid, or a LIKE wildcard in the query matching the whole table.
 *
 * EMPTY IS A FAILURE. Every row that walks a collection asserts the collection
 * is non-empty first, so a check that examined nothing cannot report success.
 *
 * PROVE-RED. EVERY row below has a mutation that turns it red, and all of them
 * were run on 2026-08-21 against a `cp -R` throwaway copy of this tree served by
 * its own local Worker. One reintroduced bug at a time, reverted between runs,
 * and the suite green again afterwards:
 *
 *    1. delete the `if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN)` guards
 *       -> GATE grant no token / wrong token, GATE lookup (3).
 *    2. `if (!b.playerId || !b.key)` (drop the note requirement)
 *       -> BODY a note is required (1).
 *    3. raise GRANT_MENU.coins to 2000000        -> CAP coins above the cap (1).
 *    4. add 'random' to GRANT_MENU.pets
 *       -> ALLOWLIST pet random, DRIFT no ghost ids (2).
 *    5. delete the GRANT_REFUSED loop
 *       -> REFUSED gearId / xp / rename, REFUSED writes nothing (4).
 *    6. drop 'CX' from GRANT_MENU.pets
 *       -> DRIFT every species grantable, DRIFT every species grants, the Day
 *       One Lizard lands, ONCE (4).
 *    7. add 'C99' to GRANT_MENU.pets             -> DRIFT no ghost ids (1).
 *    8. `INSERT OR IGNORE` -> `INSERT OR REPLACE` -> ONCE (1).
 *    9. delete the `.replace(/[%_\\]/g, ...)` that escapes the query
 *       -> both LOOKUP wildcard rows (2): "%%" returns the whole table and
 *       "Feisty_Fang" matches through the space.
 *   10. `WHERE id = ?` only, no LIKE arms
 *       -> LOOKUP by friend code, LOOKUP by id (2).
 *   11. default playerId and key when absent
 *       -> BODY playerId required, BODY key required (2).
 *   12. delete the `if (!who) ... 404`           -> BODY unknown player (1).
 *   13. delete the `if (!got.length)` refusal    -> BODY nothing to grant (1).
 *   14. `if (n > cap)` (drop the `n > 0` half)
 *       -> CAP coins at zero, CAP dust at zero (2).
 *   15. `if (n >= cap)`  -> CAP coins at the cap, CAP dust at the cap (2).
 *   16. raise GRANT_MENU.dust to 200000          -> CAP dust above the cap (1).
 *   17. delete the `list.includes(v)` check
 *       -> ALLOWLIST pet/crate/consumable/random, DRIFT publishes its
 *       allowlist, DRIFT every species grantable, DRIFT no ghosts (7).
 *   18. delete the `egg must be 'ready'` check   -> ALLOWLIST egg (1).
 *   19. `DELETE FROM grants WHERE player_id = ? AND key <> ?` before the insert
 *       -> ADDITIVE disturbs no waiting grant, DRIFT every species grants (2).
 *   20. `UPDATE players SET app_v = 'godmode'` alongside the insert
 *       -> ADDITIVE the player row is untouched (1).
 *   21. insert the grant for every row in `players`
 *       -> ADDITIVE it lands on ONE player (1).
 *   22. `if (q.length < 1)`                      -> LOOKUP q >= 2 chars (1).
 *   23. drop the LIKE arms, keep id / friend_code
 *       -> LOOKUP by name, LOOKUP by handle (2).
 *   24. 404 when the search matches nobody
 *       -> LOOKUP wildcard rows, LOOKUP a name nobody has (3).
 *
 * TWO THINGS THAT WOULD NOT GO RED, recorded rather than quietly dropped:
 *   - Removing the SQL `ESCAPE '\'` clause on its own leaves every row green.
 *     Without it the backslashes this route inserts are literal characters, so
 *     the pattern matches nothing instead of matching everything: the only
 *     failure mode is a false NEGATIVE on a name containing % or _, and names
 *     are built from curated word lists that contain neither. The clause is
 *     still correct and still what makes the escaping above mean anything.
 *   - "ADDITIVE the player row itself is untouched" was written against the
 *     shared test player and was BLIND: mutation 20 left it green, because by
 *     the time it ran, every earlier grant in this file had already made the
 *     edit and the "before" read was taken on an already-damaged row. It uses a
 *     freshly registered player now. A row that only fails when it happens to
 *     run first is not a row.
 *
 * Pass BASE=... to point at another origin.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { BH_ITEMS } from '../data/boneheadz.js';
import { flagFor } from './test-flag.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
/* Registrations are flagged when this run is NOT local, so a suite pointed at
   the live API mints accounts nobody can see. See server/test-flag.mjs. */
const IS_TEST = flagFor(BASE);
const T = process.env.ADMIN_TOKEN || 'devtoken';   // wrangler dev sets this via --var
let passed = 0, failed = 0;

/* The limiter outlives the process, so a second run of this file would start
   already throttled and /register would 429 before a single row was graded. */
if (/127\.0\.0\.1|localhost/.test(BASE)) {
  try {
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'bonez', '--local', '--command', 'DELETE FROM rate_limits'],
      { cwd: import.meta.dirname, stdio: 'ignore' });
  } catch { console.log('(could not reset the rate limiter; registrations may 429)'); }
}

async function test(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); failed++; }
}
function group(title) { console.log(`\n--- ${title}`); }

const b64 = buf => Buffer.from(new Uint8Array(buf)).toString('base64');
const rndIp = () => `198.18.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
const uniq = tag => `${tag}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

/** Read a Response body ONCE: passing `await r.text()` as an assert message
 *  consumes it before the test can parse it, which reads as a route failure. */
async function read(r) {
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, text, json };
}

/** A throwaway player, registered the way the app registers. */
async function newPlayer() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const res = await fetch(`${BASE}/register`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': rndIp() },
    body: JSON.stringify({ test: IS_TEST, pubkey: pubJwk }),
  });
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
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
  return { me, signed };
}

const grant = (body, tok = T) => fetch(`${BASE}/admin/grant`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(tok ? { 'x-admin-token': tok } : {}) },
  body: JSON.stringify(body),
});
const lookup = (q, tok = T) => fetch(`${BASE}/admin/players?q=${encodeURIComponent(q)}`,
  { headers: tok ? { 'x-admin-token': tok } : {} });
/** Everything currently waiting in a player's grants feed. */
const feed = async P => ((await (await P.signed('GET', '/grants?since=0')).json()).grants || []);

console.log(`admin make-good @ ${BASE}\n`);

/* The player this whole file is about. Named through the REAL /name route, with
   a per-run suffix because names are globally unique and this file is meant to
   be runnable twice. */
const FANG = await newPlayer();
const FANG_NUM = 1 + Math.floor(Math.random() * 900);
const FANG_NAME = `Feisty Fang #${FANG_NUM}`;
{
  const r = await read(await FANG.signed('POST', '/name', { adj: 50, noun: 26, num: FANG_NUM }));
  if (r.status !== 200) throw new Error(`could not name the test player: ${r.status} ${r.text}`);
}
const OTHER = await newPlayer();

group('GATE: the token is the whole authorisation');
await test('GATE grant refuses a call with no token', async () => {
  assert.equal((await grant({ playerId: FANG.me.playerId, key: uniq('k'), note: 'n', coins: 1 }, null)).status, 401);
});
await test('GATE grant refuses a wrong token', async () => {
  assert.equal((await grant({ playerId: FANG.me.playerId, key: uniq('k'), note: 'n', coins: 1 }, 'wrong')).status, 401);
});
await test('GATE lookup refuses a call with no token', async () => {
  assert.equal((await lookup('Feisty', null)).status, 401);
});

group('BODY: who, why, and once');
await test('BODY playerId is required', async () => {
  assert.equal((await grant({ key: uniq('k'), note: 'n', coins: 1 })).status, 400);
});
await test('BODY a key is required, so a repeat call cannot pay twice', async () => {
  assert.equal((await grant({ playerId: FANG.me.playerId, note: 'n', coins: 1 })).status, 400);
});
await test('BODY a note is required: the player must be told WHY it arrived', async () => {
  assert.equal((await grant({ playerId: FANG.me.playerId, key: uniq('k'), coins: 1 })).status, 400);
});
await test('BODY an unknown player is a 404, not a grant into the void', async () => {
  const r = await read(await grant({ playerId: 'no-such-player', key: uniq('k'), note: 'n', coins: 5 }));
  assert.equal(r.status, 404, r.text);
});
await test('BODY a grant that hands over nothing is refused', async () => {
  const r = await read(await grant({ playerId: FANG.me.playerId, key: uniq('k'), note: 'n' }));
  assert.equal(r.status, 400, r.text);
  assert.match(r.json.error, /nothing to grant/);
});

group('CAP: every number has a band, and both edges are closed');
for (const [field, cap] of [['coins', 20000], ['dust', 2000]]) {
  await test(`CAP ${field} at zero is not a grant`, async () => {
    assert.equal((await grant({ playerId: FANG.me.playerId, key: uniq('k'), note: 'n', [field]: 0 })).status, 400);
  });
  await test(`CAP ${field} above the cap (${cap}) is refused: a fat finger must not mint a fortune`, async () => {
    const r = await read(await grant({ playerId: FANG.me.playerId, key: uniq('k'), note: 'n', [field]: cap + 1 }));
    assert.equal(r.status, 400, r.text);
    assert.match(r.json.error, new RegExp(`${field} must be 1\\.\\.${cap}`));
  });
  await test(`CAP ${field} exactly at the cap is allowed`, async () => {
    const r = await read(await grant({ playerId: FANG.me.playerId, key: uniq('k'), note: 'at the cap', [field]: cap }));
    assert.equal(r.status, 200, r.text);
  });
}

group('ALLOWLIST: only vetted ids, and never a random one');
for (const [field, bad] of [['pet', 'C999'], ['crate', 'mythic'], ['consumable', 'godmode'], ['pet', 'random']]) {
  await test(`ALLOWLIST ${field} "${bad}" is refused`, async () => {
    const r = await read(await grant({ playerId: FANG.me.playerId, key: uniq('k'), note: 'n', [field]: bad }));
    assert.equal(r.status, 400, r.text);
    assert.match(r.json.error, new RegExp(`^${field} must be one of`));
  });
}
await test('ALLOWLIST an egg is only ever a READY one', async () => {
  assert.equal((await grant({ playerId: FANG.me.playerId, key: uniq('k'), note: 'n', egg: 'later' })).status, 400);
  const r = await read(await grant({ playerId: FANG.me.playerId, key: uniq('k'), note: 'an egg', egg: 'ready' }));
  assert.equal(r.status, 200, r.text);
});

group('REFUSED: the arms this route will not carry');
for (const [field, value] of [['gearId', 'g-ir-1'], ['xp', 500], ['rename', 'Old Name']]) {
  await test(`REFUSED ${field} is refused by name, with the reason in the response`, async () => {
    const r = await read(await grant({ playerId: FANG.me.playerId, key: uniq('k'), note: 'n', [field]: value }));
    assert.equal(r.status, 400, r.text);
    assert.match(r.json.error, new RegExp(`^${field} is not grantable here: .+`));
  });
}
await test('REFUSED a refused arm writes NOTHING, even alongside a legal one', async () => {
  const key = uniq('refused');
  const before = (await feed(FANG)).length;
  assert.ok(before > 0, 'CONTROL: the feed must already hold the legal grants above');
  const r = await read(await grant({ playerId: FANG.me.playerId, key, note: 'n', coins: 100, gearId: 'g-ir-1' }));
  assert.equal(r.status, 400, r.text);
  const after = await feed(FANG);
  assert.equal(after.length, before, 'a refused call must not leave a row behind');
  assert.equal(after.filter(g => g.key === key).length, 0);
});

group('DRIFT: the menu and the catalogue agree about which pets exist');
/* The allowlist is duplicated in the Worker because it does not bundle the
   client, so it is read back out of the route's OWN refusal message rather than
   from a copy of the list, and graded against the real catalogue in BOTH
   directions. */
const SPECIES = BH_ITEMS.filter(i => i.slot === 'C').map(i => i.id);
let MENU_PETS = [];
await test('DRIFT the route publishes its pet allowlist when it refuses one', async () => {
  const r = await read(await grant({ playerId: FANG.me.playerId, key: uniq('k'), note: 'n', pet: 'C999' }));
  MENU_PETS = String(r.json.error).replace(/^pet must be one of:\s*/, '').split(/,\s*/).filter(Boolean);
  assert.ok(MENU_PETS.length >= 5, `expected a real allowlist, got ${JSON.stringify(MENU_PETS)}`);
  assert.ok(SPECIES.length >= 5, `CONTROL: the catalogue must hold pets, got ${SPECIES.length}`);
});
await test('DRIFT every species in data/boneheadz.js can be handed back', async () => {
  const missing = SPECIES.filter(id => !MENU_PETS.includes(id));
  assert.deepEqual(missing, [], `add these to GRANT_MENU.pets in server/src/index.js: ${missing.join(', ')}`);
});
await test('DRIFT the menu holds no id the game has never heard of', async () => {
  const ghosts = MENU_PETS.filter(id => !SPECIES.includes(id));
  assert.deepEqual(ghosts, [], `these are on GRANT_MENU.pets and not in the catalogue: ${ghosts.join(', ')}`);
});
await test('DRIFT every species actually grants through the route', async () => {
  const G = await newPlayer();
  for (const id of SPECIES) {
    const r = await read(await grant({ playerId: G.me.playerId, key: uniq('sp-' + id), note: `make-good ${id}`, pet: id }));
    assert.equal(r.status, 200, `${id}: ${r.text}`);
    assert.equal(r.json.payload.pet, id);
  }
  const got = (await feed(G)).map(g => g.payload.pet).filter(Boolean);
  assert.deepEqual([...got].sort(), [...SPECIES].sort());
});

group('THE DAY ONE LIZARD: the case this whole route exists for');
const LIZ_KEY = uniq('lizard');
await test('the Day One Lizard lands on the named player, once', async () => {
  const r = await read(await grant({
    playerId: FANG.me.playerId, key: LIZ_KEY, pet: 'CX',
    note: 'Your Day One Lizard, back where it belongs. Sorry about that!',
  }));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.inserted, true);
  // the response must NAME who it landed on and WHAT they got
  assert.equal(r.json.to, FANG_NAME, 'the response must name the player, so a mistype is caught here');
  assert.equal(r.json.playerId, FANG.me.playerId);
  assert.match(r.json.granted, /pet CX/);
  const rows = (await feed(FANG)).filter(g => g.key === LIZ_KEY);
  assert.equal(rows.length, 1, 'exactly one grant should be waiting');
  assert.equal(rows[0].payload.pet, 'CX');
  assert.match(rows[0].payload.note, /Day One Lizard/);
});
await test('ONCE the same key twice grants exactly once', async () => {
  const r = await read(await grant({ playerId: FANG.me.playerId, key: LIZ_KEY, pet: 'CX', note: 'a second, careless call' }));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.inserted, false, 'the same key must never pay twice');
  const rows = (await feed(FANG)).filter(g => g.key === LIZ_KEY);
  assert.equal(rows.length, 1);
  assert.match(rows[0].payload.note, /Day One Lizard/, 'and the FIRST note must survive: a repeat cannot overwrite');
});

group('ADDITIVE: it can only ever give');
await test('ADDITIVE a new grant disturbs no grant already waiting', async () => {
  const before = await feed(FANG);
  assert.ok(before.length >= 2, `CONTROL: the feed must already hold grants, has ${before.length}`);
  const r = await read(await grant({ playerId: FANG.me.playerId, key: uniq('extra'), note: 'and a crate', crate: 'golden' }));
  assert.equal(r.status, 200, r.text);
  const after = await feed(FANG);
  assert.equal(after.length, before.length + 1, 'exactly one row added');
  for (const g of before) {
    const still = after.find(x => x.key === g.key);
    assert.ok(still, `grant ${g.key} vanished`);
    assert.equal(JSON.stringify(still.payload), JSON.stringify(g.payload), `grant ${g.key} was rewritten`);
  }
});
await test('ADDITIVE the player row itself is untouched', async () => {
  /* A PLAYER NOBODY HAS GRANTED TO YET, and that is load-bearing rather than
     tidy. Run against FANG this row was blind: every earlier grant in this file
     would already have made whatever edit is being looked for, so the "before"
     read was taken on an ALREADY-damaged row and nothing moved. Measured: a
     mutation writing `UPDATE players SET app_v='godmode'` on every grant left
     this row GREEN. A row that only fails when it happens to run first is not a
     row. */
  const P = await newPlayer();
  const row = async () => await (await fetch(`${BASE}/dev/player?id=${P.me.playerId}`)).text();
  const before = await row();
  assert.ok(before.includes(P.me.playerId), 'CONTROL: the dev player read must return the row');
  const r = await read(await grant({ playerId: P.me.playerId, key: uniq('untouched'), note: 'coins', coins: 25 }));
  assert.equal(r.status, 200, `CONTROL: the grant itself must land — ${r.text}`);
  assert.equal(await row(), before, 'a grant must not edit the player: no name, no profile, no snapshot');
});
await test('ADDITIVE it lands on ONE player and nobody else', async () => {
  const key = uniq('targeted');
  await grant({ playerId: FANG.me.playerId, key, note: 'for Fang alone', pet: 'C1' });
  const theirs = await feed(OTHER);
  assert.equal(theirs.filter(g => g.key === key).length, 0);
  assert.equal(theirs.filter(g => g.payload && g.payload.pet).length, 0, 'the other player has been handed no pets at all');
});

group('LOOKUP: find a player by NAME, because that is what support gives you');
await test('LOOKUP q must be at least 2 characters', async () => {
  assert.equal((await lookup('F')).status, 400);
});
await test('LOOKUP finds the player by a case-insensitive fragment of their name', async () => {
  const r = await read(await lookup('feisty fang'));
  assert.equal(r.status, 200, r.text);
  const hit = r.json.players.find(p => p.id === FANG.me.playerId);
  assert.ok(hit, `not found among ${r.json.count}: ${r.text.slice(0, 300)}`);
  assert.equal(hit.name, FANG_NAME);
  // the fields that let Tom spot a near-miss before he grants anything
  assert.ok(hit.handle && hit.friendCode, 'a hit must carry the handle and friend code');
  assert.ok(Number.isInteger(hit.level) && hit.lastSeen > 0, 'a hit must carry level and last-seen');
});
await test('LOOKUP finds the player by their generated handle', async () => {
  const r = await read(await lookup(FANG.me.handle.slice(0, 6)));
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.players.some(p => p.id === FANG.me.playerId), r.text.slice(0, 300));
});
await test('LOOKUP finds the player by friend code', async () => {
  const r = await read(await lookup(FANG.me.friendCode));
  assert.equal(r.json.count, 1, r.text);
  assert.equal(r.json.players[0].id, FANG.me.playerId);
});
await test('LOOKUP finds the player by id, so a copy-pasted uuid still works', async () => {
  const r = await read(await lookup(FANG.me.playerId));
  assert.equal(r.json.count, 1, r.text);
  assert.equal(r.json.players[0].id, FANG.me.playerId);
});
await test('LOOKUP a LIKE wildcard in the query is TEXT, not a match-everything', async () => {
  const r = await read(await lookup('%%'));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.count, 0, `"%%" must match the literal text, got ${r.json.count} players`);
});
await test('LOOKUP a single-character wildcard is text too', async () => {
  // "_" matches any one character in LIKE, so an unescaped query would find
  // "Feisty Fang" through the space. Escaped, it is a name nobody has.
  const r = await read(await lookup('Feisty_Fang'));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.count, 0, `"_" must be literal, got ${r.json.count} players`);
});
await test('LOOKUP a name nobody has is an empty list, not an error', async () => {
  const r = await read(await lookup(uniq('nobody')));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.count, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
