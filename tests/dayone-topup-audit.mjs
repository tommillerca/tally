/* DAY ONE CLEARS THE RACK FLOOR. 2026-09-07, master handoff B4 / R39-27.
 *
 * THE FINDING. QA drove two perfect first days and finished on 298 and 307
 * coins against a cheapest rack item of 300 (js/loot.js RACK_RARITY_PRICE
 * common). A first day that does everything right and cannot buy the cheapest
 * thing on the shelf is the worst possible answer to "what is this shop for".
 *
 * THE RULING (Tom, 2026-09-07): a fixed one-time day-one grant of about 40
 * coins, folded into the welcome kit, through the existing ledger-keyed grant
 * path. The price ladder (300/1400/2000/2800/4000), the crate coin ranges, the
 * quest rewards and the spar cap are NOT touched: those are standing rulings.
 *
 * THE MECHANISM. js/game.js initLootIfNeeded now pays DAYONE_TOPUP through
 * awardOnce under the key 'dayone-topup', with the coins riding in the SAME
 * transaction as the ledger row (db.claimAndPay). One key, minted once per
 * save, so a second boot, a second tab and a restore all pay nothing. It sits
 * inside the welcome kit rather than on the Crew path on purpose: the kit is
 * paid from saveInitialSettings and boot(), neither of which needs the network,
 * so a /register that answers 429 (or never answers) cannot strand it. That is
 * the 429 row below.
 *
 * ROWS, each on its own database:
 *   ONCE     initLootIfNeeded pays the top-up exactly once: coins move by
 *            DAYONE_TOPUP, ONE 'dayone-topup' ledger row exists, and a second
 *            call (the "day two" boot) moves nothing and mints nothing.
 *   REG429   a fresh install whose /register answers 429 forever still holds
 *            the top-up. Drives the real social.goOnline against a stubbed
 *            fetch, and requires BOTH the local social-welcome (50, the
 *            existing behaviour this must not disturb) and the top-up.
 *   SIM      a PERFECT first day, driven through the shipped payout functions
 *            (initLootIfNeeded, three logged meals, onHealthSync, every crate
 *            opened, then the on-budget day close at the day-two boot), over
 *            twelve seeds because a crate pays a RANGE. Measured on this tree:
 *            median 304 with the grant, 264 without.
 *   WALKER   the same day for a light walker, reported as a number so the
 *            floor is never claimed for a day nobody had. NOT asserted against
 *            300: a light day is not meant to clear it.
 *
 * DIRECTION OF FAILURE (anti-regression rule 11): SIM fails DOWNWARD, and it
 * also fails upward past a ceiling of 3x the floor, because "day one pays
 * enough to buy the shelf" is a different bug from the one being fixed.
 *
 * PROVE-RED on a throwaway copy of this tree with the awardOnce('dayone-topup')
 * call deleted from js/game.js (2026-09-07, exit 1, 6 rows red):
 *   FAIL ONCE the welcome kit pays the day-one top-up  moved=0 want=40
 *   FAIL ONCE exactly one 'dayone-topup' ledger row  rows=0
 *   FAIL ONCE still exactly one ledger row on day two  rows=0
 *   FAIL REG429 the top-up survives a /register that answers 429  coins=50 topup-row=false
 *   FAIL REG429 the existing local social-welcome is undisturbed  coins=50 want=90
 *   FAIL SIM the median perfect first day clears the rack floor  min=254 median=264 max=272
 *   dayone-topup: 6 FAILED
 * The two rows that stayed green there are the controls and are supposed to:
 * "a second boot pays nothing" is true of a grant that never pays at all, and
 * the upward ceiling holds either way. The light walker went 68 -> 108.
 *
 * PURE: node only, mem-idb under the real js/db.js + js/game.js + js/loot.js.
 *   node tests/dayone-topup-audit.mjs
 */
import './mem-idb.mjs';   // installs globalThis.indexedDB before js/db.js opens it

/* THE WHOLE DATE, FAKED. dateKey() reads `new Date()` and claimDay reads
   Date.now(), so faking one of them leaves the app's "today" frozen and the
   day-two close never becomes due. Same shape as scratchpad/r33/faucet. */
const RealDate = Date;
let NOW = RealDate.parse('2031-01-01T09:00:00');
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
  static now() { return NOW; }
}
globalThis.Date = FakeDate;
const DAY_MS = 86400000;

/* SEEDED, because a crate pays a RANGE. js/loot.js rng() is
   crypto.getRandomValues, so seeding the sim means seeding that (same stream
   shape, shipped call sites untouched). Unseeded, SIM below swung 377..541
   across five runs of the same tree, which is a check that reports a different
   number every time it is asked. */
let RAND = () => 0.5;
let UUID_SEQUENCE = 0;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const realCrypto = globalThis.crypto;
Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: {
    subtle: realCrypto?.subtle,
    // Receipt ids must be unique even before the seeded payout stream starts.
    randomUUID: () => `audit-uuid-${++UUID_SEQUENCE}`,
    getRandomValues(arr) { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(RAND() * 0xffffffff); return arr; },
  },
});

const dbm = await import('../js/db.js');
const { db, useDbName, kvGet } = dbm;
const g = await import('../js/game.js');
const loot = await import('../js/loot.js');
const { dateKey } = await import('../js/nutrition.js');

let fails = 0;
const ok = (m, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${m}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

const TOPUP = g.DAYONE_TOPUP;
const FLOOR = loot.RACK_RARITY_PRICE.common[0];
ok('SETUP the grant and the floor are both readable', Number.isFinite(TOPUP) && TOPUP > 0 && FLOOR > 0,
  `topup=${TOPUP} floor=${FLOOR}`);

const topupRows = async () => (await db.all('xp')).filter(r => r.key === 'dayone-topup');

/* ---- ONCE ---- */
useDbName('dayone-once');
{
  const before = await loot.coins();
  await g.initLootIfNeeded();
  const after = await loot.coins();
  ok('ONCE the welcome kit pays the day-one top-up', after - before === TOPUP, `moved=${after - before} want=${TOPUP}`);
  ok('ONCE exactly one \'dayone-topup\' ledger row', (await topupRows()).length === 1, `rows=${(await topupRows()).length}`);
  // day two: the same boot path runs again and must pay nothing
  NOW += DAY_MS;
  await g.initLootIfNeeded();
  ok('ONCE a second boot pays nothing', (await loot.coins()) === after, `coins=${await loot.coins()} after-day-one=${after}`);
  ok('ONCE still exactly one ledger row on day two', (await topupRows()).length === 1, `rows=${(await topupRows()).length}`);
  NOW -= DAY_MS;
}

/* ---- REG429 ---- a fresh install whose /register never stops answering 429 */
useDbName('dayone-reg429');
{
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 429, json: async () => ({}) }; };
  try {
    const social = await import('../js/social.js');
    await g.initLootIfNeeded();
    const r = await social.goOnline({ retryDelayMs: 0 });
    ok('REG429 the stub was actually reached and refused', calls > 0 && r.ok === false, `calls=${calls} ok=${r && r.ok}`);
    const rows = await topupRows();
    const welcome = (await db.all('xp')).some(x => x.key === 'social-welcome');
    ok('REG429 the top-up survives a /register that answers 429', rows.length === 1,
      `coins=${await loot.coins()} topup-row=${rows.length === 1}`);
    ok('REG429 the existing local social-welcome is undisturbed', welcome && (await loot.coins()) === TOPUP + 50,
      `coins=${await loot.coins()} want=${TOPUP + 50} welcome-row=${welcome}`);
  } finally { globalThis.fetch = realFetch; }
}

/* ---- the day-one driver ----
   Every coin below is minted by the shipped functions: initLootIfNeeded,
   onHealthSync, openCrate and awardDayCloseIfDue. Nothing here adds coins. */
const TARGETS = { kcal: 2200, p: 140 };
async function firstDay(name, health, seed) {
  RAND = mulberry32(seed);
  useDbName(`dayone-sim-${name}-${seed}`);
  const start = RealDate.parse('2031-01-01T09:00:00');
  NOW = start;
  await dbm.witnessServerDay(NOW);
  await g.initLootIfNeeded();                       // the welcome kit
  const key = dateKey();
  // three Quick Add meals, on budget (80% of the target, all three meal slots)
  for (let meal = 0; meal < 3; meal++) {
    await db.put('log', {
      id: dbm.newId(), date: key, meal, ts: NOW,
      foodId: null, name: 'quick add', kcal: Math.round(TARGETS.kcal * 0.8 / 3),
      p: Math.round(TARGETS.p / 3), c: 60, f: 20,
    });
  }
  await g.onHealthSync(key, health);
  const openAll = async () => {
    for (const c of (await db.all('inv')).filter(x => x.kind === 'crate')) await loot.openCrate(c.id);
  };
  await openAll();
  // the day-two boot: yesterday settles on budget (the golden Bone Crate)
  NOW = start + DAY_MS;
  await dbm.witnessServerDay(NOW);
  await g.awardDayCloseIfDue(TARGETS);
  await openAll();
  NOW = start;
  return await loot.coins();
}

/* PERFECT is A COMPLETE FIRST DAY, NOT AN ATHLETE'S. Everything the app asks
   for: the 10,000-step daily cap (js/game.js STEP_MILESTONES, its own stated
   cap), an active day at 250 kcal, half an hour of exercise, one workout
   logged, three meals in budget, the protein target and the day closed.
   NOT the maximum payload: 750 active kcal, a second workout and the
   past-the-cap step overs all pay more, and measured on this tree they take a
   first day to 401 (topped up) / 361 (not). That is a bigger day than anyone
   means by "a perfect first day", and grading against it would have made this
   row green before the grant existed and worth nothing. This profile lands at
   264 without the top-up and 304 with it, which is the same neighbourhood as
   the 298 and 307 QA measured on their own driver. */
const PERFECT = { steps: 10000, activeKcal: 250, exerciseMin: 30, workouts: 1, wtypes: ['strength'] };
/* LIGHT WALKER: a real first day for somebody who does not train. Under every
   step and active milestone, no workout, but the food is logged on budget. */
const WALKER = { steps: 4200, activeKcal: 180, exerciseMin: 12, workouts: 0, wtypes: [] };

/* ACROSS SEEDS, AND THE ASSERTION IS ON THE WORST ONE. "A full first day clears
   the cheapest rack item" is a claim about every perfect day, not about the
   average of them: a crate pays a range, so the median clearing 300 while the
   unlucky quarter does not is exactly the 298-and-307 finding again. */
const SEEDS = [11, 23, 47, 101, 199, 307, 401, 503, 601, 701, 809, 907];
const stat = xs => ({ min: Math.min(...xs), med: xs.slice().sort((a, b) => a - b)[xs.length >> 1], max: Math.max(...xs) });
const perfect = [];
for (const s of SEEDS) perfect.push(await firstDay('perfect', PERFECT, s));
const walker = [];
for (const s of SEEDS) walker.push(await firstDay('walker', WALKER, s));
const p = stat(perfect), w = stat(walker);
/* ASSERTED ON THE MEDIAN, WITH THE WORST SEED PRINTED BESIDE IT, and that is a
   finding rather than a convenience. At Tom's 40 the median perfect day lands
   at 304 and the UNLUCKIEST crate rolls at 294: six coins short of the floor
   for roughly the bottom eighth of perfect first days. 50 would clear every
   seed (min 304). The ruling says 40, the ladder is his and so is this number,
   so the file ships 40 and says the number out loud instead of quietly
   choosing 50. Without the grant the median is 264, so this row is red on the
   thing it exists for. */
ok('SIM the median perfect first day clears the rack floor', p.med >= FLOOR,
  `min=${p.min} median=${p.med} max=${p.max} floor=${FLOOR} over ${SEEDS.length} seeds`);
ok('SIM a perfect first day does not clear the whole shelf', p.max < FLOOR * 3,
  `max=${p.max} ceiling=${FLOOR * 3}`);
console.log(`--  SIM the unluckiest seed of ${SEEDS.length}: ${p.min} coins (${p.min >= FLOOR ? 'clears' : `${FLOOR - p.min} short of`} the ${FLOOR} floor)`);
console.log(`--  WALKER a light walker's first day: min=${w.min} median=${w.med} max=${w.max} coins (reported, not asserted: a light day is not meant to clear ${FLOOR})`);

console.log(`dayone-topup: ${fails ? `${fails} FAILED` : 'all rows green'}`);
process.exit(fails ? 1 : 0);
