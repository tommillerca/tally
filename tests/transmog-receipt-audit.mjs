/* tests/transmog-receipt-audit.mjs: A FREE WEAR IS NOT A PURCHASE.
 *
 * QA round 22 W1 (HIGH, economy) and W11 (LOW, dead code), 2026-09-04.
 *
 * W1. transmogPrice charges 0 when the slot holds no statted gear (deliberate,
 * Tom 2026-08-11: a plain cosmetic already looks like itself). applyTransmog
 * then banked a receipt through markPaid on EVERY apply, zero-cost ones too, and
 * paidLooks() seeded a receipt for anything in the live transmog map on every
 * read. Lane G drove it: unequip the statted piece, apply a 60-dust look for 0,
 * re-equip, and the look is worn and reads "owned" forever. Two banking paths,
 * one exploit. The fix banks only when dust moved, seeds only over statted
 * gear, and drops an unpaid override when gear enters its slot.
 *
 * W11. fitPrice sums transmogPrice over fit.tm; applyFit priced the fit BEFORE
 * restoring the fit's gear, so a stripped player's fit read 0 and the "That fit
 * needs N dust" toast was unreachable. Now: restore gear, price, then charge.
 *
 * PROVE-RED on origin/main 96c1104a (v471), this file dropped into a cp -R copy:
 *   FAIL W1 after re-equipping the gear the look costs full price again
 *        price 0, want 12
 *   FAIL W1 the free wear left no receipt
 *        paidlooks holds H:H10-2
 *   FAIL W11 a fit holding an unpaid look on a slot its gear pass fills is refused for dust
 *        applyFit -> {"ok":true,"cost":0,"name":"W11"}
 *   the CONTROL rows all green there, so every leg really ran.
 *
 * PURE: node only, no browser, about 1s.   node tests/transmog-receipt-audit.mjs
 */
import './mem-idb.mjs';   // installs globalThis.indexedDB before js/db.js opens it
import { readFileSync } from 'node:fs';

const { kvGet, kvSet, useDbName } = await import('../js/db.js');
const loot = await import('../js/loot.js');
useDbName('transmog-receipt-audit');

const out = [];
let fails = 0;
const ok = (m, cond, detail = '') => {
  if (cond) out.push(`ok   ${m}${detail ? '  ' + detail : ''}`);
  else { fails++; out.push(`FAIL ${m}${detail ? '  ' + detail : ''}`); }
};

/* Real level-1 gear, two per slot, so the second piece's ART is a collected
   look the player can wear over the first piece's STATS. */
const HAT = 'g-H10-1-gravecaller', HAT_LOOK_GEAR = 'g-H10-2-ringmaster', HAT_LOOK = 'H10-2';
const SOCK = 'g-S1-1-gravewarden', SOCK_LOOK_GEAR = 'g-S1-2-boneshaman', SOCK_LOOK = 'S1-2';
for (const g of [HAT, HAT_LOOK_GEAR, SOCK, SOCK_LOOK_GEAR]) await loot.grantGear(g, 'audit');
const FULL = loot.transmogCost(HAT_LOOK);
const paid = async () => [...await loot.paidLooks()];
const price = () => loot.transmogPrice('H', HAT_LOOK);

ok('SETUP the look under test has a real non-zero price and is collected',
  FULL > 0 && (await loot.collectedLooks()).has(HAT_LOOK), `transmogCost(${HAT_LOOK}) = ${FULL}`);

/* ---- W1: the four steps ---- */
await loot.equipGear('H', HAT);
ok('CONTROL with statted gear in the slot the look costs its full price', await price() === FULL, `price ${await price()}`);

await loot.equipGear('H', null);                                   // 1. unequip
ok('CONTROL (free rule unchanged, Tom 2026-08-11) with no gear in the slot the look is free', await price() === 0, `price ${await price()}`);

const free = await loot.applyTransmog('H', HAT_LOOK);              // 2. apply for 0
ok('CONTROL the free apply went through at 0', free.ok && free.cost === 0, JSON.stringify(free));
ok('W1 the free wear left no receipt', !(await paid()).includes(`H:${HAT_LOOK}`), `paidlooks ${JSON.stringify(await paid())}`);

await loot.equipGear('H', HAT);                                    // 3. re-equip
ok('W1 after re-equipping the gear the look costs full price again', await price() === FULL, `price ${await price()}, want ${FULL}`);
ok('W1 the receipt is still absent after the re-equip (the seed did not bank it either)',
  !(await paid()).includes(`H:${HAT_LOOK}`), `paidlooks ${JSON.stringify(await paid())}`);
ok('W1 the unpaid override did not survive stats entering the slot',
  (await loot.transmogMap()).H === undefined, `transmog ${JSON.stringify(await loot.transmogMap())}`);

const reTap = await loot.applyTransmog('H', HAT_LOOK).then(async r => { await loot.clearTransmog('H'); return r; });
ok('W1 with gear back on, applying the look is a real purchase again (refused: no dust)',
  reTap.ok === false && reTap.reason === 'dust' && reTap.need === FULL, JSON.stringify(reTap));

/* ---- CONTROL: a PAID apply IS banked and re-apply is free ---- */
await loot.boneDustAdd(100);
const bought = await loot.applyTransmog('H', HAT_LOOK);
ok('CONTROL a paid apply charges the full price', bought.ok && bought.cost === FULL && await loot.boneDust() === 100 - FULL,
  `${JSON.stringify(bought)}, dust ${await loot.boneDust()}`);
ok('CONTROL the paid apply banked the receipt', (await paid()).includes(`H:${HAT_LOOK}`), `paidlooks ${JSON.stringify(await paid())}`);
await loot.clearTransmog('H');
ok('CONTROL a bought look is free to re-apply', await price() === 0, `price ${await price()}`);
const again = await loot.applyTransmog('H', HAT_LOOK);
ok('CONTROL re-applying a bought look costs 0', again.ok && again.cost === 0, JSON.stringify(again));
await loot.equipGear('H', null); await loot.equipGear('H', HAT);
ok('CONTROL a PAID look survives re-gearing (rule 3: the look sticks as the gear changes)',
  (await loot.transmogMap()).H === HAT_LOOK, `transmog ${JSON.stringify(await loot.transmogMap())}`);

/* ---- W11: price the fit against the loadout its gear pass produces ---- */
await loot.equipGear('S', null); await loot.clearTransmog('S');
await kvSet('bonedust', 0);
const unpaidFit = { id: 'w11-unpaid', name: 'W11', tm: { S: SOCK_LOOK }, cos: {}, gear: { S: SOCK }, ts: 1 };
const paidFit = { id: 'w11-paid', name: 'Paid', tm: { H: HAT_LOOK }, cos: {}, gear: { H: HAT }, ts: 2 };
await kvSet('outfits', [unpaidFit, paidFit]);
ok('CONTROL the stripped player prices the unpaid fit at 0 before its gear is back (the wrong loadout)',
  await loot.fitPrice(unpaidFit) === 0 && !(await loot.gearLoadout()).S, `fitPrice ${await loot.fitPrice(unpaidFit)}`);
const refused = await loot.applyFit('w11-unpaid');
ok('W11 a fit holding an unpaid look on a slot its gear pass fills is refused for dust',
  refused.ok === false && refused.reason === 'dust' && refused.need === loot.transmogCost(SOCK_LOOK) && refused.have === 0,
  `applyFit -> ${JSON.stringify(refused)}`);
ok('W11 the refusal left the player re-geared and the unpaid look off',
  (await loot.gearLoadout()).S === SOCK && (await loot.transmogMap()).S === undefined,
  `loadout.S ${(await loot.gearLoadout()).S}, transmog ${JSON.stringify(await loot.transmogMap())}`);
ok('W11 (the reachable badge) with gear in the slot the fit now prices above 0',
  await loot.fitPrice(unpaidFit) > 0, `fitPrice ${await loot.fitPrice(unpaidFit)}`);
const worn = await loot.applyFit('w11-paid');
ok('W11 a fit of paid looks prices 0 and goes on', worn.ok && worn.cost === 0 && await loot.fitPrice(paidFit) === 0, JSON.stringify(worn));

/* The UI half of W11 is a static slice: the chip badge and the toast exist and
   are keyed on the price applyFit now returns. They render in a browser, which
   this audit does not have; wardrobe-audit.mjs owns the pixels. */
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
ok('REACH the fit chip renders .fc-cost when fitPrice is above 0',
  /\$\{price \? `<i class="fc-cost">\$\{price\}/.test(app), 'fc-cost markup keyed on price');
ok('REACH the applyFit handler toasts "That fit needs N dust" on reason dust',
  /res\.reason === 'dust' \? `That fit needs \$\{res\.need\.toLocaleString\(\)\} dust/.test(app), 'toast keyed on reason dust');

console.log(out.join('\n'));
console.log(fails ? `\n${fails} FAILED` : '\na free wear is a wear, not a purchase');
process.exit(fails ? 1 : 0);
