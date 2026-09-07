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
const CRASH = { pred: null, armed: false, killed: 0 };
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
      const put = s.put, del = s.delete;
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
const reboot = () => { CRASH.pred = null; CRASH.armed = false; };
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
  const taken = ((await kvGet('crateTaken', [])) || []).includes(crate.id);
  let landed = false, why = '';
  if (!r.ok) why = `openCrate threw "${r.err}"; coins ${coins}, coinsRev ${rev}, ${inv.length} inv rows, crateTaken ${taken}`;
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
    if (!taken) missing.push('crateTaken receipt');
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
    wins.length === 1 && coins === wins[0].v.coins && ((await kvGet('crateTaken', [])) || []).length === 1,
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

console.log(fails ? `\n${fails} FAIL` : '\nall clean');
process.exit(fails ? 1 : 0);
