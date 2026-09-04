/* tests/kitchen-atomic-audit.mjs: THE KITCHEN'S TWO TIMED CLAIMS, UNDER A RACE
 * AND UNDER A MOVED CLOCK. QA round 26 O2 / O3 / O4.
 *
 *  O2  doTransmute checked the cooldown in one transaction and stamped it in
 *      another, with the spend and the grant awaited in between. Two overlapping
 *      taps (8/8 on one page, 4/5 across two tabs) both read "ready", both spent
 *      six commons and both minted an Ectoplasm. The stamp is now the CLAIM: one
 *      kvUpdate on 'transmuteAt' that refuses inside the transaction, so the
 *      second tap loses before anything is paid.
 *  O3  the cooldown was a raw device timestamp. Clock forward: ten Ectoplasm in
 *      forty seconds. Clock back: msLeft grew one-for-one to 8780h, survived a
 *      reload and rode along in exportAll. Now (1) the transmute asks claimDay
 *      like every other day-keyed reward, so a forward jump is bounded by the
 *      witness ceiling, and (2) a stamp in the future is read as now, so the
 *      lockout can never exceed one cooldown.
 *  O4  grantPotion was the last read-modify-write granter in the file: two Serve
 *      taps in one frame emptied two pots and banked one potion. kvUpdate now.
 *
 * PURE: node only, mem-idb under the real js/db.js and js/cooking.js, <1s.
 * HONESTY on the two CONCURRENT rows: mem-idb commits on a macrotask and the
 * request callbacks fire on microtasks, so overlapping reads CAN interleave
 * here; whether they did is printed on each row (both were red on origin/main
 * 96c1104a, see the report of the fix commit). The browser truth is
 * reward-sop-audit's REPEAT transmute rows.
 *
 *   node tests/kitchen-atomic-audit.mjs
 */
import './mem-idb.mjs';   // installs globalThis.indexedDB before js/db.js opens it

const { kvGet, kvSet, useDbName, WITNESS_GRACE, DAY_WITNESS_KEY } = await import('../js/db.js');
const { dayOrdinal, dateKey } = await import('../js/nutrition.js');
const cook = await import('../js/cooking.js');
useDbName('kitchen-atomic-audit');

const out = [];
let fails = 0;
const ok = (m, cond, detail = '') => {
  if (cond) out.push(`ok   ${m}${detail ? '  ' + detail : ''}`);
  else { fails++; out.push(`FAIL ${m}${detail ? '  ' + detail : ''}`); }
};
const H = 3600e3, D = 24 * H;
const NOW = Date.now();
const commons = inv => cook.COMMON_INGREDIENT_IDS.reduce((a, id) => a + (inv[id] || 0), 0);
async function reset({ marrow = 12, at = 0, witnessDay = dateKey(new Date(NOW)) } = {}) {
  await kvSet('ingredients', { marrow });
  await kvSet('transmuteAt', at);
  await kvSet('dayHighWater', witnessDay);
  await kvSet('dayPaceKey', witnessDay);
  await kvSet('dayPaceAt', NOW);
  await kvSet(DAY_WITNESS_KEY, dayOrdinal(witnessDay));
}

/* ---- O2: two overlapping transmutes pay once ---- */
await reset();
const c0 = await cook.doTransmute(NOW);
ok('CONTROL a ready, funded transmute pays', c0.ok === true, JSON.stringify(c0));
let inv = await cook.ingredients();
ok('CONTROL one transmute: six commons out, one Ectoplasm in', commons(inv) === 6 && inv.ectoplasm === 1, JSON.stringify(inv));
const seq = await cook.doTransmute(NOW);
ok('SEQUENTIAL the second transmute on the same day is refused', seq.ok === false && seq.reason === 'cooldown', JSON.stringify(seq));

await reset();
const both = await Promise.all([cook.doTransmute(NOW), cook.doTransmute(NOW)]);
inv = await cook.ingredients();
const wins = both.filter(r => r.ok).length;
ok('CONCURRENT two overlapping transmutes: exactly one wins', wins === 1, JSON.stringify(both));
ok('CONCURRENT two overlapping transmutes: ONE Ectoplasm minted, SIX commons spent', inv.ectoplasm === 1 && commons(inv) === 6,
  `inv=${JSON.stringify(inv)} (12 commons in; on main both taps pay: ectoplasm 2, commons 0)`);
ok('CONCURRENT the stamp was written once, to now', (await kvGet('transmuteAt')) === NOW);

/* ---- O3: a moved clock ---- */
await reset({ at: NOW + 365 * D });
const back = await cook.transmuteStatus(NOW);
ok('BACKWARD a stamp 365 days in the future leaves at most one cooldown, not 8780h', back.msLeft <= cook.TRANSMUTE.cooldownMs,
  `msLeft=${(back.msLeft / H).toFixed(1)}h against cooldown ${cook.TRANSMUTE.cooldownMs / H}h`);
ok('BACKWARD the clamp does not free the transmute early (msLeft > 0, ready false)', back.msLeft > 0 && back.ready === false);

await reset();
const jump = NOW + (WITNESS_GRACE + 3) * D;   // clearly past the witness ceiling
const fwd = await cook.doTransmute(jump);
inv = await cook.ingredients();
ok('FORWARD a jump past the witness ceiling is refused', fwd.ok === false && fwd.reason === 'day', JSON.stringify(fwd));
ok('FORWARD a refused jump spends nothing and mints nothing', commons(inv) === 12 && !inv.ectoplasm, JSON.stringify(inv));
ok('FORWARD a refused jump leaves the stamp untouched', (await kvGet('transmuteAt')) === 0);
// the honest case still pays: the stamp is 21h old and today is witnessed
await reset({ at: NOW - 21 * H });
const honest = await cook.doTransmute(NOW);
ok('CONTROL a 21h-old stamp on a witnessed day still pays', honest.ok === true, JSON.stringify(honest));
// the number is not touched
ok('SHAPE the cooldown is still 20h', cook.TRANSMUTE.cooldownMs === 20 * H);

/* ---- O4: two overlapping grantPotion calls both land ---- */
await kvSet('potions', {});
const pid = cook.POTIONS[0].id;
await Promise.all([cook.grantPotion(pid), cook.grantPotion(pid)]);
const pots = await cook.potionsInv();
ok('CONCURRENT two overlapping grantPotion(id) land two potions', pots[pid] === 2, `count=${pots[pid]} (main: 1, one Serve lost)`);
await Promise.all([cook.grantPotion(pid), cook.grantPotion(cook.POTIONS[1].id)]);
const pots2 = await cook.potionsInv();
ok('CONCURRENT two different potions granted at once both land', pots2[pid] === 3 && pots2[cook.POTIONS[1].id] === 1, JSON.stringify(pots2));

console.log(out.join('\n'));
console.log(fails ? `\nFAIL (${fails})` : `\nall green, ${out.length} checks`);
process.exit(fails ? 1 : 0);
