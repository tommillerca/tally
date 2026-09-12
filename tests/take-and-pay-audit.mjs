/* tests/take-and-pay-audit.mjs: TAKE AND PAY IS ONE STEP. 2026-09-06 economy audit.
 *
 * Five actions spend an inventory input and pay for it: openCrate (the crate),
 * hatchEgg (the egg), disenchantGear (the piece), salvagePet / salvageInstance
 * (a pet copy on kv 'petInst') and migrateLegacyEggs (a legacy egg-crate). Every
 * one of them took the input with db.take (or the kvUpdate that removes the
 * copy) and then paid in LATER transactions, and openCrate's own comment
 * accepted the consequence: a process death between the two destroys the input
 * and pays nothing. A fully walked egg gone with no pet, a Bone Crate gone with
 * no hand, a melted piece with no dust.
 *
 * The fix is one transaction per site (js/db.js takeAndPay / payAtomic: the
 * take and the whole payout commit together or not at all), so there is no
 * pending receipt and nothing to resume on the next boot. This file proves
 * that by KILLING THE PROCESS at the IndexedDB boundary: the moment the take is
 * journaled, every transaction opened after it aborts. Under the old order the
 * take commits alone; under the new one the payout is already inside it.
 *
 * Rows, per site:
 *   SETUP    the kill switch was armed by the take (an unarmed row proves nothing)
 *   CRASH    after the take: the input is gone AND the whole payout is on disk
 *   REBOOT   (crate) a death BEFORE the take leaves the crate, and a normal open
 *            afterwards pays; two overlapping opens still pay exactly once
 *   RNG      hatchEgg still draws the same number of random values (the roll is
 *            unconditional, so the stream is byte-identical to before)
 *
 * PROVED RED on origin/main bce3a937 (the old order), same file, no edits:
 *   FAIL CRASH crate: the crate is gone AND the whole hand is on disk  crate gone=true, hand landed=false: openCrate threw "kvUpdate aborted"; coins 0, coinsRev 0, 0 inv rows, crateTaken false
 *   FAIL CRASH egg: the egg is gone AND the pet is minted in the same transaction  egg gone=true, pet minted=false, instances=[]
 *   FAIL CRASH gear: the piece is gone AND the dust is paid with its revision  row gone=true, bonedust 0 (want 20), dustRev 0 threw "kvUpdate aborted"
 *   FAIL CRASH salvageInstance: the copy is gone AND dust, ownership teardown and receipt are on disk  copy gone=true, bonedust 0 (want 10), cos row present=true, invTaken=false, pets has species=true (call threw "null")
 *   FAIL CRASH salvagePet: the copy is gone AND dust, ownership teardown and receipt are on disk  copy gone=true, bonedust 0 (want 10), cos row present=true, invTaken=false, pets has species=true (call threw "null")
 *   FAIL CRASH legacy: the egg-crate is gone AND the egg exists (count conserved)  legacy rows=0, eggs=0
 *
 * PURE: node only, mem-idb under the real js/db.js and js/loot.js, ~1s.
 *
 *   node tests/take-and-pay-audit.mjs
 */
import './mem-idb.mjs';   // installs globalThis.indexedDB before js/db.js opens it

/* ---- the kill switch, wrapped around mem-idb BEFORE js/db.js opens it ----
   `pred` looks at every put/delete as it is journaled; when it says yes the
   switch arms, and every transaction created from then on aborts before it
   can do anything. The transaction that armed it is already running and
   commits normally: that is "the process died right after this write". */
const CRASH = { abortClaim: false, pred: null, armed: false, killed: 0 };
const realOpen = globalThis.indexedDB.open.bind(globalThis.indexedDB);
globalThis.indexedDB.open = (...a) => {
  const req = realOpen(...a);
  let os = null;
  Object.defineProperty(req, 'onsuccess', {
    get() { return os ? (e => { wrapDb(req.result); os(e); }) : null; },
    set(fn) { os = fn; },
  });
  return req;
};
function wrapDb(d) {
  if (d.__killable) return;
  d.__killable = true;
  const realTx = d.transaction.bind(d);
  d.transaction = (...a) => {
    const t = realTx(...a);
    if (CRASH.armed) { CRASH.killed++; t.abort(); return t; }
    const realOs = t.objectStore.bind(t);
    t.objectStore = name => {
      const s = realOs(name);
      const put = s.put, add = s.add, del = s.delete;
      s.add = v => {
        if (CRASH.pred && CRASH.pred({ store: name, op: 'add', key: v && (v.k ?? v.id ?? v.key ?? v.date), v })) CRASH.armed = true;
        const r = add(v);
        if (CRASH.armed && CRASH.abortClaim) {
          let success;
          Object.defineProperty(r, 'onsuccess', {
            get() { return e => { if (success) success(e); t.abort(); }; },
            set(fn) { success = fn; },
          });
        }
        return r;
      };
      s.put = v => {
        if (CRASH.pred && CRASH.pred({ store: name, op: 'put', key: v && (v.k ?? v.id ?? v.key ?? v.date), v })) CRASH.armed = true;
        return put(v);
      };
      s.delete = k => {
        if (CRASH.pred && CRASH.pred({ store: name, op: 'del', key: k })) CRASH.armed = true;
        return del(k);
      };
      return s;
    };
    return t;
  };
}
const dieAfter = pred => { CRASH.pred = pred; CRASH.armed = false; CRASH.killed = 0; };
const reboot = () => { CRASH.pred = null; CRASH.armed = false; CRASH.abortClaim = false; };
const attempt = p => p.then(v => ({ ok: true, v }), e => ({ ok: false, err: String((e && e.message) || e) }));

const dbm = await import('../js/db.js');
const { kvGet, kvSet, useDbName, db } = dbm;
const loot = await import('../js/loot.js');
const { GEAR_ITEMS } = await import('../js/gear.js');
const { BH_ITEMS } = await import('../data/boneheadz.js');

let fails = 0;
const ok = (m, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${m}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};
const invRows = async () => db.all('inv');
const has = async id => (await db.get('inv', id)) !== undefined;
/* the take receipt: kv 'invTaken' since the merge with fix/currency-revisions
   (js/db.js atomic writes it for every 'inv' removal, uncapped); the legacy
   'crateTaken' list is still read by importAll, so a receipt on it counts too */
const receipts = async () => new Set([...((await kvGet('invTaken', [])) || []), ...((await kvGet('crateTaken', [])) || [])]);

/* ================= CRATE ================= */
useDbName('tap-crate');
{
  const crate = await loot.grantCrate('golden', 'audit');
  dieAfter(e => e.store === 'inv' && e.op === 'del' && e.key === crate.id);
  const r = await attempt(loot.openCrate(crate.id));
  ok('SETUP crate: the kill switch was armed by the take', CRASH.armed, `armed=${CRASH.armed} killed=${CRASH.killed}`);
  reboot();
  const gone = !(await has(crate.id));
  const coins = await kvGet('coins', 0), rev = await kvGet('coinsRev', 0);
  const inv = await invRows();
  const taken = (await receipts()).has(crate.id);
  let landed = false, why = '';
  if (!r.ok) why = `openCrate threw "${r.err}"; coins ${coins}, coinsRev ${rev}, ${inv.length} inv rows, receipt ${taken}`;
  else {
    const res = r.v;
    const looks = (await kvGet('looks', [])) || [];
    const ings = (await kvGet('ingredients', {})) || {};
    const missing = [];
    for (const x of res.results) {
      if (x.type === 'consumable' && !inv.some(row => row.kind === x.consumable)) missing.push(`consumable ${x.consumable}`);
      if (x.type === 'ingredient' && !(ings[x.ingredient] > 0)) missing.push(`ingredient ${x.ingredient}`);
      if (x.type === 'gear' && !(inv.some(row => row.id === `gear:${x.gear.id}`) && looks.includes(x.gear.artId))) missing.push(`gear ${x.gear.id}`);
      if (x.type === 'cos' && !(inv.some(row => row.id === `cos:${x.item.id}`) && looks.includes(x.item.id))) missing.push(`cos ${x.item.id}`);
    }
    if (coins !== res.coins) missing.push(`coins ${coins} (want ${res.coins})`);
    if (rev !== res.coins) missing.push(`coinsRev ${rev} (want ${res.coins})`);
    if (!taken) missing.push('take receipt');
    landed = missing.length === 0 && res.results.length === 3;
    why = `results=${res.results.map(x => x.type).join(',')} coins=${res.coins}${missing.length ? ' MISSING: ' + missing.join('; ') : ''}`;
  }
  ok('CRASH crate: the crate is gone AND the whole hand is on disk', gone && landed, `crate gone=${gone}, hand landed=${landed}: ${why}`);
}
/* a death BEFORE the take: the crate stays, nothing is paid */
useDbName('tap-crate-before');
{
  const crate = await loot.grantCrate('golden', 'audit');
  dieAfter(() => true);
  CRASH.armed = true;
  const r = await attempt(loot.openCrate(crate.id));
  reboot();
  ok('REBOOT crate: a death before the take leaves the crate unopened and unpaid',
    !r.ok && await has(crate.id) && (await kvGet('coins', 0)) === 0, `threw=${!r.ok} crate present=${await has(crate.id)} coins=${await kvGet('coins', 0)}`);
  const again = await attempt(loot.openCrate(crate.id));
  ok('REBOOT crate: the next open, with the process alive, pays in full',
    again.ok && again.v.results.length === 3 && (await kvGet('coins', 0)) === again.v.coins && !(await has(crate.id)),
    again.ok ? `coins=${await kvGet('coins', 0)} results=${again.v.results.length}` : again.err);
}
/* the reorder must not reopen the double-open: two overlapping opens, one paid */
useDbName('tap-crate-race');
{
  const crate = await loot.grantCrate('golden', 'audit');
  const both = await Promise.all([attempt(loot.openCrate(crate.id)), attempt(loot.openCrate(crate.id))]);
  const wins = both.filter(b => b.ok);
  const coins = await kvGet('coins', 0);
  ok('REBOOT crate: two overlapping opens of one crate pay exactly once',
    wins.length === 1 && coins === wins[0].v.coins && (await receipts()).size === 1,
    `wins=${wins.length} coins=${coins} (winner said ${wins[0] && wins[0].v.coins})`);
}

/* ================= EGG ================= */
useDbName('tap-egg');
{
  const egg = await loot.grantEgg('audit', 0);   // goal 0: hatches on arrival (the welcome egg's tier)
  dieAfter(e => e.store === 'inv' && e.op === 'del' && e.key === egg.id);
  await attempt(loot.hatchEgg(egg.id));         // the post-hatch equip heal dies under the kill switch either way
  ok('SETUP egg: the kill switch was armed by the take', CRASH.armed, `armed=${CRASH.armed} killed=${CRASH.killed}`);
  reboot();
  const gone = !(await has(egg.id));
  const insts = (await kvGet('petInst', [])) || [];
  const sp = insts[0] && insts[0].sp;
  const bank = (await kvGet('petLvlSteps', {})) || {};
  const pets = (await kvGet('pets', {})) || {};
  const minted = insts.length === 1 && !!sp && (await has(`cos:${sp}`)) && insts[0].iid in bank && sp in pets;
  ok('CRASH egg: the egg is gone AND the pet is minted in the same transaction', gone && minted,
    `egg gone=${gone}, pet minted=${minted}, instances=${JSON.stringify(insts.map(x => x.sp))}${sp ? ` cos row=${await has(`cos:${sp}`)} bank=${insts[0].iid in bank} pets=${sp in pets}` : ''}`);
}
/* the rng stream: one shiny draw, one per hatchChance species, one index draw */
useDbName('tap-egg-rng');
{
  const egg = await loot.grantEgg('audit', 0);
  const H = BH_ITEMS.filter(i => i.slot === 'C' && !i.exclusive && i.hatchChance).length;
  const orig = globalThis.crypto.getRandomValues;
  let draws = 0;
  globalThis.crypto.getRandomValues = a => { draws++; a[0] = 0x7fffffff; return a; };   // 0.5: never shiny, never the 1% pet
  let res;
  try { res = await loot.hatchEgg(egg.id); } finally { globalThis.crypto.getRandomValues = orig; }
  ok('RNG hatchEgg draws exactly 1 + hatchChance species + 1 random values, as before the reorder',
    res.ready === true && draws === 2 + H, `draws=${draws} want ${2 + H} (H=${H})`);
}

/* ================= GEAR ================= */
useDbName('tap-gear');
{
  const g = GEAR_ITEMS.find(i => i.rarity === 'rare');
  await loot.grantGear(g.id, 'audit');
  const want = loot.gearDustValue(g);
  dieAfter(e => e.store === 'inv' && e.op === 'del' && e.key === `gear:${g.id}`);
  const r = await attempt(loot.disenchantGear(g.id));
  ok('SETUP gear: the kill switch was armed by the take', CRASH.armed, `armed=${CRASH.armed} killed=${CRASH.killed}`);
  reboot();
  const gone = !(await has(`gear:${g.id}`));
  const dust = await kvGet('bonedust', 0), rev = await kvGet('dustRev', 0);
  ok('CRASH gear: the piece is gone AND the dust is paid with its revision', gone && dust === want && rev === want && r.ok && r.v.ok,
    `row gone=${gone}, bonedust ${dust} (want ${want}), dustRev ${rev}${r.ok ? '' : ` threw "${r.err}"`}`);
}

/* ================= PET SALVAGE (both paths) ================= */
const SP = BH_ITEMS.find(i => i.slot === 'C' && !i.exclusive && i.rarity === 'common').id;
async function seedOnePet(iid) {
  await kvSet('petInst', [{ iid, sp: SP, lineage: 0, shiny: false, hatchedAtSteps: 0 }]);
  await db.put('inv', { id: `cos:${SP}`, kind: 'cos', itemId: SP, source: 'audit', ts: Date.now() });
  await kvSet('pets', { [SP]: { hatchedAtSteps: 0 } });
  await kvSet('petLvlSteps', { [iid]: 0 });
  await kvSet('petLvlV', 2);
}
for (const [label, run] of [
  ['salvageInstance', iid => loot.salvageInstance(iid)],
  ['salvagePet', () => loot.salvagePet(SP)],
]) {
  useDbName(`tap-${label}`);
  const iid = `k-${label}`;
  await seedOnePet(iid);
  const want = loot.petDustValue(BH_ITEMS.find(i => i.id === SP));
  dieAfter(e => e.store === 'kv' && e.op === 'put' && e.key === 'petInst' && Array.isArray(e.v.v) && !e.v.v.some(x => x.iid === iid));
  const r = await attempt(run(iid));
  ok(`SETUP ${label}: the kill switch was armed by the take`, CRASH.armed, `armed=${CRASH.armed} killed=${CRASH.killed}`);
  reboot();
  const insts = (await kvGet('petInst', [])) || [];
  const gone = !insts.some(x => x.iid === iid);
  const dust = await kvGet('bonedust', 0);
  const cosLeft = await has(`cos:${SP}`);
  const receipt = ((await kvGet('invTaken', [])) || []).includes(`cos:${SP}`);
  const petsHas = SP in ((await kvGet('pets', {})) || {});
  ok(`CRASH ${label}: the copy is gone AND dust, ownership teardown and receipt are on disk`,
    gone && dust === want && !cosLeft && receipt && !petsHas,
    `copy gone=${gone}, bonedust ${dust} (want ${want}), cos row present=${cosLeft}, invTaken=${receipt}, pets has species=${petsHas}${r.ok ? '' : ` (call threw "${r.err}")`}`);
}

/* ================= LEGACY EGG-CRATE ================= */
useDbName('tap-legacy');
{
  await db.put('inv', { id: 'legacy-1', kind: 'crate', crate: 'egg', source: 'old', ts: Date.now() });
  dieAfter(e => e.store === 'inv' && e.op === 'del' && e.key === 'legacy-1');
  await attempt(loot.migrateLegacyEggs());
  ok('SETUP legacy: the kill switch was armed by the take', CRASH.armed, `armed=${CRASH.armed} killed=${CRASH.killed}`);
  reboot();
  const inv = await invRows();
  const legacy = inv.filter(r => r.kind === 'crate' && r.crate === 'egg').length;
  const eggs = inv.filter(r => r.kind === 'egg').length;
  ok('CRASH legacy: the egg-crate is gone AND the egg exists (count conserved)', legacy === 0 && eggs === 1, `legacy rows=${legacy}, eggs=${eggs}`);
}

/* L1 frozen-order seams. Drive production exports and the actual settle/log
   source. DOM collaborators are inert; writes use the same kill model above.
   A failed recovery is a loss, even when the meal/fight itself was saved. */
const { readFileSync } = await import('node:fs');
const game = await import('../js/game.js');
const cooking = await import('../js/cooking.js');
const { CHAMPION } = await import('../js/pit.js');
const { dateKey } = await import('../js/nutrition.js');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const noop = () => {};

useDbName('tap-shop');
{
  await kvSet('coins', 90);
  dieAfter(e => e.store === 'kv' && e.key === 'coins' && e.v.v === 0);
  await attempt(loot.buyShopItem('vigor'));
  ok('SETUP shop: kill armed at 90-coin debit', CRASH.armed);
  reboot();
  ok('CRASH shop: 90 coins buys one Draught even after death',
    await kvGet('coins', 0) === 0 && await loot.consumableCount('vigor') === 1 && await kvGet('coinsRev', 0) === 90,
    `coins=${await kvGet('coins', 0)}, goods=${await loot.consumableCount('vigor')}, cost=90 coins`);
}
useDbName('tap-shop-race');
{
  await kvSet('coins', 90);
  const both = await Promise.all([loot.buyShopItem('vigor'), loot.buyShopItem('vigor')]);
  ok('CONTROL shop: two buyers can spend a 90-coin wallet only once',
    both.filter(r => r.ok).length === 1 && await loot.consumableCount('vigor') === 1 && await kvGet('coins', 0) === 0);
}

// Execute settle through its economic end, before the victory-panel DOM. This
// includes the shipped clear-then-pay sequence when copied onto the old tree.
const settleStart = app.indexOf('  async function settle() {');
const settleEnd = app.indexOf('    // the fight is decided, so the escape hatch', settleStart);
if (settleStart < 0 || settleEnd < 0) throw new Error('settle source missing');
const settleSrc = app.slice(settleStart, settleEnd).replace("import('./game.js')", "import('../js/game.js')") + '\n}';
const cfg = { mode: 'rung', rung: 1, name: 'Rattles', coins: 60, repeatCoins: 15, xp: 40, done: false };
async function drivePit(config = cfg, id = 'l1-fight') {
  const ctx = { ...game, ...loot, kvSet, kvGet, db, dateKey,
    settled: false, staked: true, fightId: id, foeCfg: config,
    fight: { over: { winner: 'p' } }, add: null,
    document: { querySelectorAll: () => [] }, el: () => null,
    consumeFightFoodBuffs: cooking.consumeFightFoodBuffs, foodCoinMult: cooking.foodCoinMult,
    markDowned: noop, renderActions: noop, trackEvent: noop,
    window: {}, refreshLevelChip: noop, confettiRain: noop, levelSound: noop,
    S: { sounds: false }, queueCelebration: noop, FIGHT_ROW_LABEL: {},
    CHAMPION, CHAMP_PRIZE_ID: 'SK15', CHAMP_TITLE: 'Marrow King', BH_BY_ID: Object.fromEntries(BH_ITEMS.map(i => [i.id, i])),
    bhAsset: () => '', crateIcon: () => '', CRATES: loot.CRATES,
  };
  return new Function('ctx', `with (ctx) { return (${settleSrc})(); }`)(ctx);
}
for (const seam of ['stake', 'fight-xp', 'rung-xp', 'badge']) {
  useDbName(`tap-pit-${seam}`);
  await kvSet('game-init', true);
  await kvSet('pitFight', { phase: 'open', mode: 'rung', foe: cfg.name, at: 123 });
  dieAfter(e => seam === 'stake'
    ? e.store === 'kv' && ((e.key === 'pitFight' && e.v?.v === null) || e.key === 'pitPending:l1-fight')
    : e.store === 'xp' && (seam === 'fight-xp' ? e.v.type === 'fight' : seam === 'rung-xp' ? e.key === 'pitrung-1' : e.key === 'badge-pit-1'));
  const r = await attempt(drivePit());
  ok(`SETUP Pit ${seam}: kill boundary reached`, CRASH.armed, r.err || 'settled');
  reboot();
  await game.initGameIfNeeded(null);
  const total = (await db.all('xp')).reduce((n, row) => n + row.xp, 0);
  ok(`REBOOT Pit ${seam}: staked win retains 60 coins and 75 XP`,
    await kvGet('coins', 0) === 60 && total === 75 && await kvGet('pitFight', null) === null,
    `coins=${await kvGet('coins', 0)}, XP=${total}; measured loss: charge, 60 coins and 75 XP`);
  await game.initGameIfNeeded(null);
  ok(`ONCE Pit ${seam}: another open cannot pay again`, await kvGet('coins', 0) === 60 && (await db.all('xp')).reduce((n, row) => n + row.xp, 0) === 75);
}

useDbName('tap-pit-modifiers');
{
  await kvSet('game-init', true);
  await kvSet('pitFight', { phase: 'open', mode: 'rung', foe: cfg.name, at: 123 });
  await kvSet('buffs', { xp2: 5 });
  const opaque = { kind: 'combat', format: 99, fightsLeft: 8 };
  await kvSet('foodbuffs', [{ kind: 'combat', fightsLeft: 3 }, opaque, { kind: 'coins', untilMs: Date.now() + 60000, pct: 0.25 }]);
  dieAfter(e => e.key === 'pitPending:l1-fight' || (e.key === 'pitFight' && e.v?.v === null));
  await attempt(drivePit());
  ok('SETUP Pit modifiers: win intent boundary reached', CRASH.armed);
  reboot();
  await kvSet('pitFight', null); // the arena's close handler may acknowledge it first
  await game.initGameIfNeeded(null);
  await game.initGameIfNeeded(null);
  const buffs = await kvGet('foodbuffs', []);
  ok('REBOOT Pit modifiers: one charm and food charge buy the recorded 94 coins',
    await kvGet('coins', 0) === 94 && (await kvGet('buffs')).xp2 === 4 && buffs[0].fightsLeft === 2 && JSON.stringify(buffs[1]) === JSON.stringify(opaque),
    `coins=${await kvGet('coins', 0)}, charm=${(await kvGet('buffs')).xp2}, food=${buffs[0].fightsLeft}`);
}
for (const mode of ['rung', 'champ', 'endless']) {
  useDbName(`tap-pit-control-${mode}`);
  const config = { ...cfg, mode, rank: 1, name: mode === 'champ' ? 'The Marrow King' : cfg.name };
  await kvSet('game-init', true);
  await kvSet('pitFight', { phase: 'open', mode, foe: config.name, at: 123 });
  const results = await Promise.all([attempt(drivePit(config)), attempt(drivePit(config))]);
  const primary = mode === 'rung' ? 'pitrung-1' : mode === 'champ' ? 'pitchamp' : 'endless-1';
  ok(`CONTROL Pit ${mode}: overlapping settlement pays one primary reward`,
    results.every(r => r.ok) && await kvGet('coins', 0) === 60 && !!await db.get('xp', primary),
    `coins=${await kvGet('coins', 0)}, errors=${results.filter(r => !r.ok).map(r => r.err)}`);
  const before = (await db.all('xp')).reduce((n, r) => n + r.xp, 0);
  await kvSet('pitFight', { phase: 'open', mode, foe: config.name, at: 124 });
  await drivePit({ ...config, done: true }, 'l1-repeat');
  ok(`CONTROL Pit ${mode}: a different repeat win pays 15 coins and only 10 fight XP`,
    await kvGet('coins', 0) === 75 && (await db.all('xp')).reduce((n, r) => n + r.xp, 0) === before + 10);
  if (mode === 'champ') ok('CONTROL Pit champion: first clear pays one crate and the skull',
    (await db.all('inv')).filter(r => r.kind === 'crate').length === 1 && !!await db.get('inv', 'cos:SK15') && (await kvGet('looks', [])).includes('SK15'));
}

// L5: run the actual meal writer. Storage and XP are real; UI collaborators
// expose the writer's return contract, not a claimed browser/pixel proof.
const mealStart = app.indexOf('async function commitLogEntry(');
const mealEnd = app.indexOf('\nfunction queueCelebration(', mealStart);
if (mealStart < 0 || mealEnd < 0) throw new Error('log commit source missing');
function mealWriter(entry, overrides = {}) {
  const ctx = { db, dateKey, S: { date: dateKey(), settings: { targets: null } },
    rollDayIfNeeded: async () => {}, refreshNotifSchedules: noop, recordMealUsed: async () => {},
    onFoodLogged: game.onFoodLogged, entriesFor: async date => (await db.all('log')).filter(e => e.date === date),
    trackEvent: noop, toast: noop, storageIsFull: err => err?.name === 'QuotaExceededError', ...overrides };
  return new Function('ctx', `with (ctx) { return ${app.slice(mealStart, mealEnd)}; }`)(ctx);
}
const dinner = id => ({ id, date: dateKey(), ts: Date.now(), meal: 2, foodId: 'dinner', name: 'Dinner', kcal: 642, p: 20, c: 80, f: 20 });
const foodXp = async () => (await db.all('xp')).filter(r => r.type === 'log' || r.type === 'firstlog').reduce((n, r) => n + r.xp, 0);
// Separate module state represents a second opener, sharing the same database.
const otherGame = await import('../js/game.js?l5-second-open');
for (const seam of ['log', 'base', 'firstlog', 'scan', 'label', 'done']) {
  useDbName(`tap-meal-${seam}`);
  await kvSet('game-init', true);
  const entry = dinner('l5-meal');
  const via = seam === 'label' ? 'label' : 'scan';
  const commit = mealWriter(entry);
  dieAfter(e => seam === 'log' ? e.store === 'log' && e.key === entry.id
    : seam === 'done' ? e.store === 'kv' && e.key === `foodXpDone:${entry.id}`
    : e.store === 'xp' && e.v.type === (seam === 'base' ? 'log' : seam));
  const result = await attempt(commit(entry, null, via));
  ok(`SETUP meal ${seam}: kill armed after committed totals`, CRASH.armed);
  reboot();
  if (seam === 'log') ok('CONTROL meal: committed receipt failure returns zero XP',
    result.ok && result.v.receiptFailed === true && result.v.xp === 0 && (await db.get('log', entry.id))?.kcal === 642);
  await Promise.all([game.initGameIfNeeded(null), otherGame.initGameIfNeeded(null)]);
  const xp = await foodXp();
  ok(seam === 'log' ? 'REBOOT meal: saved 642-kcal dinner recovers 25 XP' : `REBOOT meal ${seam}: saved dinner recovers 25 XP`,
    (await db.get('log', entry.id))?.kcal === 642 && xp === 25,
    `kcal=${(await db.get('log', entry.id))?.kcal}, XP=${xp}`);
  ok(`REBOOT meal ${seam}: original ${via} context survives`,
    (await db.all('xp')).filter(r => r.type === via).reduce((n, r) => n + r.xp, 0) === (via === 'scan' ? 15 : 20));
  const before = await game.totalXp();
  await game.initGameIfNeeded(null);
  await otherGame.initGameIfNeeded(null);
  ok(`ONCE meal ${seam}: overlapping and repeated opens pay exactly once`,
    xp === 25 && await foodXp() === 25 && await game.totalXp() === before &&
    (await db.all('xp')).filter(r => r.type === 'log' && r.ref === entry.id).length === 1);
}

useDbName('tap-meal-midnight');
{
  await kvSet('game-init', true);
  const entry = dinner('l5-midnight');
  dieAfter(e => e.store === 'log' && e.key === entry.id);
  await attempt(mealWriter(entry)(entry, null, 'label'));
  const armed = CRASH.armed;
  reboot();
  const RealDate = globalThis.Date;
  const tomorrow = new RealDate(); tomorrow.setDate(tomorrow.getDate() + 1);
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [tomorrow.getTime()])); }
    static now() { return tomorrow.getTime(); }
  };
  try {
    // Reconstruct an old-day edit just as the portion form does, without
    // copying private metadata. It must retain the pending original intent.
    const edit = { ...entry, kcal: 650 }; delete edit.foodXp;
    const edited = await mealWriter(edit)(edit, null);
    ok('CONTROL meal: yesterday edit saves and returns zero XP', edited.xp === 0 && (await db.get('log', entry.id)).kcal === 650);
    await game.initGameIfNeeded({ p: 1 });
    await game.initGameIfNeeded({ p: 1 });
    ok('REBOOT meal midnight: original date and label entitlement recover once', armed && await foodXp() === 25 &&
      (await db.get('xp', `firstlog-${entry.date}`))?.xp === 15 &&
      (await db.get('xp', 'label-dinner'))?.xp === 20 && !(await db.get('xp', `protein-${entry.date}`)));
    const backdated = { ...entry, id: 'l5-backdated' }; // copied intent is not authority
    const res = await mealWriter(backdated)(backdated, null, 'scan');
    await game.initGameIfNeeded(null);
    ok('CONTROL meal: backdated copies create no entitlement or XP', res.xp === 0 && await foodXp() === 25 &&
      !(await db.get('log', backdated.id)).foodXp);
  } finally { globalThis.Date = RealDate; }
}

for (const quota of [false, true]) {
  useDbName(`tap-meal-write-failure-${quota}`);
  const entry = dinner('l5-unsaved'), btn = { disabled: true }, messages = [], events = [];
  let followed = false;
  const err = new Error('injected log write failure');
  if (quota) err.name = 'QuotaExceededError';
  const result = await mealWriter(entry, {
    db: { get: db.get, put: async () => { throw err; } },
    toast: message => messages.push(message), trackEvent: event => events.push(event),
    onFoodLogged: async () => { followed = true; },
  })(entry, btn);
  ok(`CONTROL meal: ${quota ? 'quota' : 'write'} failure keeps the entry available and reports failure`,
    result === null && btn.disabled === false && entry.kcal === 642 && !followed &&
    !(await db.get('log', entry.id)) && events.includes('log_write_failed') &&
    messages.some(m => quota ? m.includes('out of storage') : m.includes('Could not save that meal')));
}
// Execute the production toast expressions for both Add forms with the actual
// zero-XP receipt shape. Full sheet visibility still requires the browser audit.
const toastLines = app.split('\n').filter(l => l.includes('toast(') && l.includes('game.receiptFailed'));
ok('CONTROL meal: both Add forms report saved calories and missing XP', toastLines.length === 2 && toastLines.every(line => {
  let message;
  new Function('toast', 'editing', 'entry', 'n', 'kcal', 'game', line)(m => { message = m; }, false, null, { kcal: 642 }, 642, { xp: 0, receiptFailed: true });
  return message === 'Added · 642 kcal · XP did not record';
}));

useDbName('tap-meal-cap');
{
  await kvSet('game-init', true);
  for (let n = 0; n < 21; n++) {
    const entry = dinner(`l5-cap-${n}`);
    await mealWriter(entry, { onFoodLogged: async () => { throw new Error('XP unavailable'); } })(entry, null);
  }
  await Promise.all([game.initGameIfNeeded(null), otherGame.initGameIfNeeded(null)]);
  await game.initGameIfNeeded(null);
  ok('REBOOT meal: recovery retains the 20-log daily ceiling',
    (await db.all('log')).length === 21 && await foodXp() === 215,
    `meals=${(await db.all('log')).length}, XP=${await foodXp()}`);
}

useDbName('tap-meal-backfill');
{
  // A restore may contain an older row plus a new pending intent, without a
  // completed game-init flag. Ordinal history replay must go first, so it and
  // recovery agree on which entry owns each capped slot.
  const legacy = dinner('a-legacy'), pending = dinner('b-pending');
  await db.put('log', legacy);
  await mealWriter(pending, { onFoodLogged: async () => { throw new Error('XP unavailable'); } })(pending, null);
  await game.initGameIfNeeded(null);
  const logs = (await db.all('xp')).filter(r => r.type === 'log');
  ok('INIT meal: history backfill and recovery keep one receipt per entry',
    logs.length === 2 && logs.filter(r => r.ref === legacy.id).length === 1 && logs.filter(r => r.ref === pending.id).length === 1,
    `refs=${logs.map(r => r.ref).join(',')}`);
  await game.onFoodLogged(legacy, { entriesForDate: [legacy, pending] });
  await game.initGameIfNeeded(null);
  ok('ONCE meal: restored history cannot acquire an extra slot on retry', await foodXp() === 35, `XP=${await foodXp()}`);
}

// Friend and spar claims: exercise both rollback and death after commit.
for (const kind of ['friend', 'spar']) for (const won of [true, false]) {
  const tag = `${kind}-${won ? 'win' : 'loss'}`;
  const amount = kind === 'friend' ? (won ? 25 : 8) : (won ? 15 : 5);
  const type = kind === 'friend' ? 'friendbattle' : 'spar';
  const act = () => kind === 'friend'
    ? game.claimFriendBattle('eco5', won, '2031-09-12')
    : game.claimSpar('eco5', won, '2031-09-12');
  const rows = async () => (await db.all('xp')).filter(r => r.type === type);
  useDbName(`tap-${tag}-rollback`);
  dieAfter(e => e.store === 'xp' && e.v?.type === type);
  CRASH.abortClaim = true;
  const aborted = await attempt(act());
  const armed = CRASH.armed;
  reboot();
  ok(`CRASH ${tag}: abort rolls back claim and payout`, armed && !aborted.ok &&
    (await rows()).length === 0 && await kvGet('coins', 0) === 0);
  const retry = await act();
  ok(`CONTROL ${tag}: retry pays original amount`, retry.coins === amount &&
    await kvGet('coins', 0) === amount && await kvGet('coinsRev', 0) === amount && (await rows()).length === 1);
  if (kind === 'friend') {
    const row = (await rows())[0];
    ok(`CONTROL ${tag}: friend metadata and XP commit with coins`,
      row.friendId === 'eco5' && row.won === (won ? 1 : 0) && row.xp === (won ? 12 : 5));
  }
  const again = await act();
  ok(`ONCE ${tag}: repeat pays nothing`, again.coins === 0 && await kvGet('coins', 0) === amount && (await rows()).length === 1);
  useDbName(`tap-${tag}-committed`);
  dieAfter(e => e.store === 'xp' && e.v?.type === type);
  await attempt(act());
  const committedArmed = CRASH.armed;
  reboot();
  await act();
  ok(`CRASH ${tag}: death after claim commit retains payment once`, committedArmed &&
    (await rows()).length === 1 && await kvGet('coins', 0) === amount,
    `coins=${await kvGet('coins', 0)}, want=${amount}`);
  useDbName(`tap-${tag}-race`);
  const race = await Promise.all([act(), act()]);
  ok(`ONCE ${tag}: concurrent claims pay once`, race.filter(r => r.coins > 0).length === 1 &&
    await kvGet('coins', 0) === amount && (await rows()).length === 1);
}

useDbName('tap-spar-bonuses');
{
  await kvSet('buffs', { xp2: 2 });
  const act = id => game.claimSpar(id, true, '2031-09-12', 1.5);
  dieAfter(e => e.store === 'xp' && e.v?.type === 'spar');
  CRASH.abortClaim = true;
  await attempt(act('bonus'));
  const armed = CRASH.armed;
  reboot();
  ok('CRASH spar bonuses: abort restores charm and all coins', armed &&
    (await kvGet('buffs', {})).xp2 === 2 && await kvGet('coins', 0) === 0 && (await db.all('xp')).length === 0);
  const paid = await act('bonus');
  ok('CONTROL spar bonuses: charm then food preserve rounding and receipt',
    paid.coins === 29 && paid.extras?.join('|') === 'Battle Charm +4 coins|Feast +10 coins' &&
    await kvGet('coins', 0) === 29 && await kvGet('coinsRev', 0) === 29 && (await kvGet('buffs', {})).xp2 === 1);
  await act('bonus');
  ok('ONCE spar bonuses: retry does not spend another charm',
    await kvGet('coins', 0) === 29 && (await kvGet('buffs', {})).xp2 === 1);
}
useDbName('tap-spar-cap');
{
  const claims = await Promise.all(Array.from({ length: 16 }, (_, i) =>
    game.claimSpar(`cap-${i}`, i % 2 === 0, '2031-09-12')));
  const rows = (await db.all('xp')).filter(r => r.type === 'spar');
  const total = claims.reduce((n, r) => n + r.coins, 0);
  ok('CONTROL spar cap: concurrent wins and losses share exactly 12 paid slots',
    rows.length === 12 && claims.filter(r => r.claimed).length === 12 &&
    rows.every(r => r.xp === 0) && await kvGet('coins', 0) === total);
  const next = await game.claimSpar('next-day', false, '2031-09-13');
  ok('CONTROL spar cap: next day pays five again', next.coins === 5 && await kvGet('coins', 0) === total + 5);
}
ok('REACH arena: friend and both spar outcomes display committed coins',
  !app.slice(app.indexOf("const r = await claimFriendBattle"), app.indexOf("} else if (won)", app.indexOf("const r = await claimFriendBattle"))).includes('coinsAdd(') &&
  app.includes("if (foeCfg.mode !== 'wanderer' && foeCfg.mode !== 'spar') {") &&
  app.includes("if (coins && foeCfg.mode !== 'spar') await coinsAdd(coins);") &&
  app.includes('const r = await claimSpar(fightId, true, undefined, await foodCoinMult());'));

// These two seams are ALREADY repaired in this checkout. They must remain
// green on the baseline too; do not call that a newly proven-red fix.
const social = await import('../js/social.js');
const spires = await import('../js/spires.js');
useDbName('tap-grant');
{
  const grant = { key: 'l1-grant', type: 'social', payload: { coins: 90, xp: 25, consumable: 'vigor' } };
  dieAfter(e => e.store === 'xp' && e.key === grant.key);
  await attempt(social.__testApplyGrant(grant));
  ok('SETUP grant: kill armed at receipt', CRASH.armed);
  reboot();
  await social.__testApplyGrant(grant);
  ok('BASELINE grant: receipt and payout commit together, retry pays once',
    await kvGet('coins', 0) === 90 && (await db.get('xp', grant.key))?.xp === 25 && await loot.consumableCount('vigor') === 1);
}
useDbName('tap-spire');
{
  const tower = { id: 'sp-l1-1', name: 'L1 tower', level: 1, claimedAt: Date.now(), tendedAt: Date.now() };
  await kvSet('social', { playerId: 'audit', onlineAt: Date.now() });
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ spires: [tower], serverNow: Date.now() }) });
  try {
    // The authority has committed ownership; all subsequent local writes die.
    dieAfter(() => false); CRASH.armed = true;
    await attempt(spires.syncSieges([tower]));
    const killed = CRASH.killed;
    reboot();
    ok('SETUP Spire: device mirror died after server ownership', killed > 0 && !(await spires.spireState())[tower.id]);
    await spires.syncSieges(await social.fetchMySpires());
    await spires.syncSieges(await social.fetchMySpires());
    ok('BASELINE Spire: next ownership sync heals the missing tower once',
      (await spires.spireState())[tower.id]?.claimedAt === tower.claimedAt && Object.keys(await spires.spireState()).length === 1);
  } finally { globalThis.fetch = priorFetch; }
}

console.log(fails ? `\n${fails} FAIL` : '\nall clean');
process.exit(fails ? 1 : 0);
