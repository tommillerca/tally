/* tests/purchase-firewall.mjs: COINS MUST NEVER REACH A STATTED ITEM.
 *
 * WHY THIS EXISTS. Tom's call, locked 2026-08-07 and not up for reopening:
 * Boneheadz monetisation is COSMETIC ONLY. Never sell power. The rack (the
 * cosmetic shop, js/loot.js) is the first surface in the game where a player
 * spends a real balance on an item, so it is the first place that rule can be
 * broken by an ordinary refactor: `grantCosmetic` and `grantGear` sit eleven
 * lines apart in the same module, take the same shape of argument, and one of
 * them sells power.
 *
 * A rule nobody can check is a preference. This is the check, and it has two
 * halves because each is blind to the other's failure:
 *
 *   RUNTIME  a real purchase is performed through the REAL buy function against
 *            a real IndexedDB, and every store is measured before and after.
 *            Coins fall by exactly the price and by more than zero; `inv` gains
 *            exactly one row and it is a `cos` row; every pre-existing `inv` row
 *            is byte-identical; `gearloadout` and `equipped` are byte-identical;
 *            `looks` and `paidlooks` each gain exactly their one entry. A static
 *            scan cannot see a payout that arrives through a computed name.
 *   STATIC   no reference from the purchase path to grantGear, grantCrate,
 *            buyWeapon, equipGear, db.put('inv', kvSet('gearloadout' or
 *            kvSet('equipped'. A runtime check cannot see a branch it did not
 *            happen to take, and the cheapest way to sell power by accident is a
 *            branch that only fires for one rarity.
 *
 * IT ALSO PINS THE TWO THINGS THAT MAKE THE PURCHASE HONEST, because both are
 * invisible from the UI until a real buyer hits them:
 *   ONCE     the same purchase performed twice pays exactly once. Sequentially
 *            AND concurrently: the authority is db.addIfAbsent on one kv row, so
 *            exactly one caller anywhere on the device is ever told yes. The
 *            naive kvGet/kvSet form passes the sequential half and was MEASURED
 *            printing 16,500 coins to three concurrent callers on the garden
 *            refund.
 *   WEAR     a bought look is FREE TO WEAR. Transmog is priced in Bone Dust, so
 *            without the `paidlooks` row a player who just paid 3,000 coins for
 *            a look is asked for dust the first time they put it on. The row is
 *            graded against a NEGATIVE CONTROL in the same slot on the same
 *            save: a collected-but-unbought look must still cost dust, so a
 *            transmogPrice that returns 0 for everything cannot pass.
 *   REROLL   the ladder runs out. A spend with no ceiling is the other way this
 *            screen could take an unbounded amount of money, so the ladder is
 *            drained to exhaustion and two attempts past it: each reroll charges
 *            exactly its rung, the total is 2,000 coins, and a refused reroll
 *            spends nothing.
 *
 * CONTROL ROWS. Every measurement here is preceded by a row that fails if the
 * check is looking in the wrong place: the static scanner must have found real
 * function bodies containing their known markers, the buy must have had a
 * non-zero price and an unowned target, and the negative control above must be
 * non-zero. An empty sample is a failure, never a pass.
 *
 * PROVE-RED (all four run against this tree, in a throwaway worktree):
 *   1. swap `grantCosmetic(artId, 'rack')` for `grantGear('g-ir-1', 'rack')`
 *      -> STATIC and INV-COS and LOOKS go red
 *   2. delete `await markPaid(art.slot, artId);`
 *      -> PAIDLOOKS and WEAR-FREE go red
 *   3. swap the addIfAbsent claim for a kvGet/kvSet read-then-write
 *      -> ONCE-RACE goes red (three concurrent callers all pay)
 *   4. move the spend above the claim
 *      -> ONCE-SEQ goes red
 *   5. drop the `st.rr >= RACK_REROLL_LADDER.length` limit in rerollRack
 *      -> REROLL-CAP goes red (the ladder never runs out and keeps charging)
 *
 * Usage: node tests/purchase-firewall.mjs            (serves this tree)
 *        node tests/purchase-firewall.mjs <base-url>
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

/* ===========================================================================
 * STATIC: the purchase path may not name a single thing that sells power.
 *
 * Prose is blanked rather than removed, character for character, so the indices
 * below still address the ORIGINAL source. An earlier guard in this project
 * passed because the word it looked for was sitting in a comment while the real
 * check had been deleted; the same trick in reverse would let a forbidden name
 * inside a comment fail this file for nothing.
 * ======================================================================== */
function stripProse(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length))
    .replace(/`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g,
      m => m[0] + m.slice(1, -1).replace(/[^\n]/g, ' ') + m[0]);
}
/* The body of one named function, brace-matched over the PROSE-BLANKED copy so
   a `{` inside a comment or a template literal cannot end the span early, and
   sliced out of the original so the returned text is the real code. */
function fnSource(raw, name) {
  const blank = stripProse(raw);
  const m = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(blank);
  if (!m) return null;
  const open = blank.indexOf('{', m.index + m[0].length - 1);
  if (open < 0) return null;
  let depth = 0;
  for (let j = open; j < blank.length; j++) {
    if (blank[j] === '{') depth++;
    else if (blank[j] === '}' && --depth === 0) return { raw: raw.slice(m.index, j + 1), blank: blank.slice(m.index, j + 1) };
  }
  return null;
}

const lootSrc = readFileSync(path.join(ROOT, 'js', 'loot.js'), 'utf8');
const appSrc = readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const PATH_FNS = [
  ['js/loot.js:buyRackItem', fnSource(lootSrc, 'buyRackItem'), ['addIfAbsent', 'grantCosmetic', 'markPaid']],
  ['js/loot.js:rerollRack', fnSource(lootSrc, 'rerollRack'), ['kvUpdate', 'coinsAdd']],
  ['js/app.js:wireRackBuys', fnSource(appSrc, 'wireRackBuys'), ['buyRackItem', 'armToConfirm']],
];

/* CONTROL. If a rename, a refactor to an arrow function, or a broken brace
   match makes any of these come back empty or unrecognisable, the FORBIDDEN row
   below would pass by having nothing to read. That is exactly the shape of the
   four guards that reported green while blind on 2026-08-19. */
for (const [id, fn, markers] of PATH_FNS) {
  const got = fn ? markers.filter(w => fn.blank.includes(w)) : [];
  ok(`CONTROL the scanner found the real body of ${id}`,
    !!fn && fn.raw.length > 200 && got.length === markers.length,
    fn ? `${fn.raw.length} chars, markers found: ${got.join(', ') || 'NONE'}` : 'NOT FOUND. Did it get renamed or turned into an arrow function?');
}

/* Every one of these either grants a statted item, equips one, or writes the
   two stores that decide what a fighter carries. None of them belongs anywhere
   a coin or a grain of dust is being spent. */
const FORBIDDEN = ['grantGear', 'grantCrate', 'buyWeapon', 'equipGear',
  "db.put('inv'", "kvSet('gearloadout'", "kvSet('equipped'"];
const hits = [];
for (const [id, fn] of PATH_FNS) {
  if (!fn) continue;
  for (const bad of FORBIDDEN) {
    let at = fn.blank.indexOf(bad);
    while (at >= 0) {
      hits.push(`${id} references ${bad}`);
      at = fn.blank.indexOf(bad, at + 1);
    }
  }
}
ok('STATIC no purchase path references a statted-item grant, an equip, or the gear stores',
  hits.length === 0,
  hits.length ? `\n     ${hits.join('\n     ')}\n     COSMETIC ONLY: coins never buy power (Tom, 2026-08-07)` : `${FORBIDDEN.length} forbidden names checked across ${PATH_FNS.length} functions`);

/* ===========================================================================
 * RUNTIME: measure every store around a real purchase.
 * ======================================================================== */
const srv = process.argv[2] ? null : await serveTree(ROOT);
const base = process.argv[2] || srv.url;
console.log(`URL UNDER TEST: ${base}`);
const { browser, page, errors } = await boot(base);
await sleep(1200);

const res = await page.evaluate(async () => {
  const loot = await import('/js/loot.js');
  const db = await import('/js/db.js');
  const snap = async () => ({
    inv: (await db.db.all('inv')).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))).map(r => JSON.stringify(r)),
    gearloadout: JSON.stringify(await db.kvGet('gearloadout', {})),
    equipped: JSON.stringify(await db.kvGet('equipped', {})),
    paidlooks: ((await db.kvGet('paidlooks', [])) || []).slice(),
    looks: ((await db.kvGet('looks', [])) || []).slice(),
    coins: await loot.coins(),
    dust: await loot.boneDust(),
  });

  /* SETUP. A wallet that can afford the whole rack, and a STATTED piece worn in
     the slot under test, because transmogPrice is free when a slot holds no
     gear: without this the WEAR rows would read 0 for every look on the save
     and could not fail. */
  await db.kvSet('coins', 50000);
  await db.kvSet('bonedust', 5000);
  const rk = await loot.rack();
  const { BH_BY_ID } = await import('/data/boneheadz.js');
  const { GEAR_ITEMS } = await import('/js/gear.js');
  // the rung whose slot both holds gear and has a second art to price against
  let target = null;
  for (let i = 0; i < rk.ids.length; i++) {
    const art = BH_BY_ID[rk.ids[i]];
    const g = GEAR_ITEMS.find(x => x.slot === art.slot && x.artId !== rk.ids[i]);
    if (!art || !g) continue;
    if ((await loot.ownedCosmeticIds()).has(rk.ids[i])) continue;
    target = { i, id: rk.ids[i], slot: art.slot, name: art.name, gear: g };
    break;
  }
  if (!target) return { error: 'no rack rung is in a gear slot with a second art: nothing to grade' };
  await loot.grantGear(target.gear.id, 'audit');
  await db.kvSet('gearloadout', { [target.slot]: target.gear.id });
  // the negative control's look is COLLECTED but never bought, so it must still
  // cost dust after the purchase below
  const other = GEAR_ITEMS.find(x => x.slot === target.slot && x.artId !== target.id && x.artId !== target.gear.artId);
  if (other) await loot.collectLook(other.artId);

  const coinPrice = loot.RACK_POOLS[target.i][0];
  const dustPrice = loot.RACK_DUST[target.i];
  const before = await snap();
  const wearBefore = await loot.transmogPrice(target.slot, target.id);

  /* THE BUY, through the real function the button calls. */
  const buy1 = await loot.buyRackItem(target.id, 'coins');
  const after = await snap();
  const wearAfter = await loot.transmogPrice(target.slot, target.id);
  const wearOther = other ? await loot.transmogPrice(target.slot, other.artId) : null;

  /* ONCE, sequentially. */
  const buy2 = await loot.buyRackItem(target.id, 'coins');
  const afterTwice = await snap();

  /* ONCE, concurrently, on a DIFFERENT rung, because the first one is already
     owned and a second attempt on an owned item is refused before the claim is
     even reached. Three callers overlapping is the shape that broke the garden
     refund: read the balance in one transaction, write the reward in another. */
  let race = null;
  for (let i = 0; i < rk.ids.length; i++) {
    if (i === target.i) continue;
    if ((await loot.ownedCosmeticIds()).has(rk.ids[i])) continue;
    const price = loot.RACK_POOLS[i][0];
    const c0 = await loot.coins();
    const rs = await Promise.all([
      loot.buyRackItem(rk.ids[i], 'coins'),
      loot.buyRackItem(rk.ids[i], 'coins'),
      loot.buyRackItem(rk.ids[i], 'coins'),
    ]);
    race = { id: rk.ids[i], price, spent: c0 - (await loot.coins()), granted: rs.filter(r => r.ok).length };
    break;
  }

  /* THE DUST LEG, on a third rung, so "spends real coins or real Bone Dust" is
     graded in both currencies rather than assumed symmetric. */
  let dustLeg = null;
  for (let i = 0; i < rk.ids.length; i++) {
    if ((await loot.ownedCosmeticIds()).has(rk.ids[i])) continue;
    const price = loot.RACK_DUST[i];
    const d0 = await loot.boneDust(); const c0 = await loot.coins();
    const r = await loot.buyRackItem(rk.ids[i], 'dust');
    dustLeg = { id: rk.ids[i], price, ok: r.ok, dustSpent: d0 - (await loot.boneDust()), coinDelta: (await loot.coins()) - c0 };
    break;
  }

  /* THE REROLL LADDER, drained. A spend with no ceiling is the other way this
     screen could take an unbounded amount of money: the ladder is FREE then
     100/200/300/400/500/500, six paid a day, and it must stop. Driven to
     exhaustion and one attempt past it. */
  await db.kvSet('coins', 100000);
  const rrStart = await loot.coins();
  const rrSteps = [];
  for (let n = 0; n < loot.RACK_REROLL_LADDER.length + 2; n++) {
    const c0 = await loot.coins();
    const ids0 = (await loot.rack()).ids.join(',');
    const r = await loot.rerollRack();
    rrSteps.push({ n, ok: r.ok, reason: r.reason || null, spent: c0 - (await loot.coins()),
      changed: (await loot.rack()).ids.join(',') !== ids0 });
  }
  const rrSpent = rrStart - (await loot.coins());

  return { target: { ...target, gear: target.gear.id }, coinPrice, dustPrice, before, after, afterTwice,
    buy1, buy2, wearBefore, wearAfter, wearOther, otherArt: other ? other.artId : null, race, dustLeg,
    ladder: loot.RACK_REROLL_LADDER, rrSteps, rrSpent };
});

if (res.error) { ok('SETUP the audit found something to grade', false, res.error); }
else {
  const { before, after, afterTwice } = res;

  /* ---- CONTROL: an empty or free sample is a failure, never a pass ---- */
  ok('CONTROL the purchase had a real, non-zero price and an unowned target',
    res.coinPrice > 0 && res.buy1.ok === true,
    `${res.target.name} (${res.target.id}, slot ${res.target.slot}) at ${res.coinPrice} coins, buy returned ok=${res.buy1.ok}`);
  ok('CONTROL the save had inventory rows to compare against',
    before.inv.length > 0, `${before.inv.length} inv rows before the buy`);

  /* ---- THE MONEY ---- */
  ok('COINS the balance fell by exactly the price, and by more than zero',
    before.coins - after.coins === res.coinPrice && res.coinPrice > 0,
    `${before.coins} -> ${after.coins} (fell ${before.coins - after.coins}, price ${res.coinPrice})`);

  /* ---- THE FIREWALL ---- */
  ok('GEARLOADOUT byte-identical across the purchase',
    before.gearloadout === after.gearloadout, `${before.gearloadout} -> ${after.gearloadout}`);
  ok('EQUIPPED byte-identical across the purchase',
    before.equipped === after.equipped, `${before.equipped} -> ${after.equipped}`);
  const beforeSet = new Set(before.inv);
  const addedRows = after.inv.filter(r => !beforeSet.has(r));
  const lostRows = before.inv.filter(r => !new Set(after.inv).has(r));
  ok('INV every pre-existing inventory row survives the purchase byte-identical',
    lostRows.length === 0, lostRows.length ? lostRows.join('\n     ') : `${before.inv.length} rows unchanged`);
  ok('INV the purchase adds exactly one inventory row',
    addedRows.length === 1, `${addedRows.length} added: ${addedRows.join(' | ') || '(none)'}`);
  const addedRow = addedRows.length === 1 ? JSON.parse(addedRows[0]) : null;
  ok('INV-COS the one added row is a COSMETIC, never gear, never a crate',
    !!addedRow && addedRow.kind === 'cos' && addedRow.itemId === res.target.id && addedRow.id === `cos:${res.target.id}`,
    addedRow ? JSON.stringify(addedRow) : 'no single added row to grade');

  /* ---- THE LEDGERS ---- */
  const looksAdded = after.looks.filter(x => !before.looks.includes(x));
  ok('LOOKS the wardrobe gains exactly the piece that was bought',
    looksAdded.length === 1 && looksAdded[0] === res.target.id,
    `+${looksAdded.length}: ${looksAdded.join(', ') || '(none)'}`);
  const paidAdded = after.paidlooks.filter(x => !before.paidlooks.includes(x));
  ok('PAIDLOOKS the paid-look ledger gains exactly slot:artId for the piece bought',
    paidAdded.length === 1 && paidAdded[0] === `${res.target.slot}:${res.target.id}`,
    `+${paidAdded.length}: ${paidAdded.join(', ') || '(none)'} (want ${res.target.slot}:${res.target.id})`);

  /* ---- WEAR: the end of the chain the player actually experiences ---- */
  ok('CONTROL a look that was NOT bought still costs dust in the same slot',
    res.wearOther != null && res.wearOther > 0,
    res.otherArt ? `${res.target.slot}:${res.otherArt} costs ${res.wearOther} dust` : 'no second art in this slot to price against, so the WEAR row below cannot fail');
  ok('CONTROL the bought look cost dust to wear BEFORE it was bought',
    res.wearBefore > 0, `${res.wearBefore} dust before the purchase`);
  ok('WEAR-FREE a bought look is free to wear, forever',
    res.wearAfter === 0, `transmogPrice(${res.target.slot}, ${res.target.id}) = ${res.wearAfter} dust after buying it`);

  /* ---- ONCE ---- */
  ok('ONCE-SEQ the same purchase performed a second time pays nothing',
    res.buy2.ok === false && res.buy2.reason === 'owned' && afterTwice.coins === after.coins,
    `second call: ok=${res.buy2.ok} reason=${res.buy2.reason}, coins ${after.coins} -> ${afterTwice.coins}`);
  ok('ONCE-SEQ the second attempt adds no second inventory row',
    afterTwice.inv.length === after.inv.length, `${after.inv.length} -> ${afterTwice.inv.length} rows`);
  ok('CONTROL the concurrent leg actually ran on an unowned rung',
    !!res.race && res.race.price > 0, res.race ? `${res.race.id} at ${res.race.price} coins` : 'no rung left to race');
  ok('ONCE-RACE three concurrent buys of the same piece charge for exactly one',
    !!res.race && res.race.spent === res.race.price && res.race.granted === 1,
    res.race ? `3 callers spent ${res.race.spent} (price ${res.race.price}), ${res.race.granted} granted` : 'not run');

  /* ---- DUST ---- */
  ok('CONTROL the dust leg ran with a real, non-zero dust price',
    !!res.dustLeg && res.dustLeg.price > 0 && res.dustLeg.ok === true,
    res.dustLeg ? `${res.dustLeg.id} at ${res.dustLeg.price} dust, ok=${res.dustLeg.ok}` : 'not run');
  ok('DUST a dust purchase spends dust exactly, and spends no coins at all',
    !!res.dustLeg && res.dustLeg.dustSpent === res.dustLeg.price && res.dustLeg.coinDelta === 0,
    res.dustLeg ? `dust fell ${res.dustLeg.dustSpent} (price ${res.dustLeg.price}), coins moved ${res.dustLeg.coinDelta}` : 'not run');

  /* ---- REROLL: a spend that must run out ---- */
  const granted = res.rrSteps.filter(r => r.ok);
  const refused = res.rrSteps.filter(r => !r.ok);
  ok('CONTROL the reroll ladder actually granted rerolls, and they changed the rack',
    granted.length === res.ladder.length && granted.every(r => r.changed),
    `${granted.length} of ${res.ladder.length} granted, ${granted.filter(r => r.changed).length} changed the nine`);
  ok('REROLL-LADDER each reroll charges exactly its rung, first one free',
    granted.every((r, i) => r.spent === res.ladder[i]),
    `spent ${granted.map(r => r.spent).join(', ')} against ladder ${res.ladder.join(', ')}`);
  ok('REROLL-CAP the day\'s rerolls run out, and the ceiling is 2,000 coins',
    refused.length === 2 && refused.every(r => r.reason === 'limit') && res.rrSpent === 2000,
    `${refused.length} refused (${[...new Set(refused.map(r => r.reason))].join('/')}) after ${res.rrSpent} coins spent in total`);
  /* `refused.every(...)` on an EMPTY set is true, and this row passed vacuously
     on the prove-red where the ladder never ran out. An empty sample is a
     failure, never a pass. */
  ok('REROLL-CAP a refused reroll spends nothing',
    refused.length > 0 && refused.every(r => r.spent === 0),
    refused.length ? `${refused.length} refused attempts spent ${refused.map(r => r.spent).join(', ')}` : 'NO reroll was ever refused, so this row graded nothing');
}

ok('CONTROL the page threw nothing while the purchases ran', errors.length === 0, errors.join(' | ') || 'no page errors');

await browser.close();
if (srv) srv.close();
console.log(fails ? `\npurchase-firewall: ${fails} FAILED` : '\npurchase-firewall: all green');
process.exit(fails ? 1 : 0);
