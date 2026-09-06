/* THE FIRST PET YOU HATCH IS OUT WITH YOU. 2026-09-06, HANDOFFr39 R39-1 (P0).
 *
 * Measured on v482 and again on v487 (d7906217): cold start, real onboarding,
 * hatch the welcome egg through the Backpack's HATCH button, adopt, go home.
 * equipped() answered {B, SK} with NO C slot, #heroPetBtn was absent, and the
 * Stable offered the pet as OUT WITH YOU with EQUIP disabled. Nothing on any
 * screen could repair it; the only escape was hatching a second pet.
 *
 * MECHANISM. Two records say which pet is out: kv `petEquipped` (the instance,
 * what the Stable and the Pit read) and the paper-doll C slot in kv `equipped`
 * (the species, what Today draws). equippedPetIid()'s heal wrote petEquipped
 * alone; only setEquippedPet ever wrote the slot, and nothing on the hatch path
 * called it. So the two records disagreed and each screen believed its own.
 *
 * FIX. equippedPetIid makes the slot follow whatever it answers, on every path
 * and not only the heal, and hatchEgg calls it so the first pet is out before
 * the reveal closes. js/app.js's Stable additionally refuses to call a pet OUT
 * WITH YOU unless the worn outfit agrees (browser half: pet-ownership-audit
 * FIRSTPET, STABLE-EQ).
 *
 * ROWS, each on its own database:
 *   HEAL     one owned pet, nothing equipped: equippedPetIid answers her AND the
 *            C slot holds her species.
 *   STUCK    the shipped state exactly (petEquipped valid, C slot empty): the
 *            next equippedPetIid repairs the slot. This is every v482..v487
 *            player who already hatched.
 *   HATCH    the real hatchEgg on a goal-0 egg (the welcome egg's tier): the
 *            hatched species is in the C slot with petEquipped agreeing.
 *   CONTROL  a pet the player CHOSE stays chosen: a second copy minted and a
 *            second egg hatched never re-point petEquipped or the slot. This is
 *            the row that fails if the fix is "always equip the newest".
 *
 * PROVE-RED on d7906217 (pre-fix), this file copied in unchanged:
 *   FAIL HEAL one owned pet and nothing equipped: equippedPetIid equips her in BOTH records  petEquipped=pmtpwgn2w-1-C6 C=undefined
 *   FAIL STUCK the shipped bug state (petEquipped valid, C slot empty) is repaired by the next equippedPetIid  C=undefined
 *   FAIL HATCH hatchEgg on a goal-0 egg leaves the hatched species in the C slot with petEquipped agreeing  hatched=C1 C=undefined petEquipped=null
 *   first-pet: 3 FAILED, exit 1. CONTROL green on both trees, as a control should be.
 *
 * PURE: node only, mem-idb under the real js/db.js + js/loot.js, ~1s.
 *   node tests/first-pet-audit.mjs
 */
import './mem-idb.mjs';   // installs globalThis.indexedDB before js/db.js opens it

const { kvGet, kvSet, useDbName } = await import('../js/db.js');
const loot = await import('../js/loot.js');
const { BH_ITEMS } = await import('../data/boneheadz.js');

let fails = 0;
const ok = (m, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${m}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};
const PETS = BH_ITEMS.filter(i => i.slot === 'C' && !i.unreleased);
ok('SETUP the catalogue has at least two species to work with', PETS.length >= 2, `${PETS.length} species`);
if (PETS.length < 2) process.exit(2);
const A = PETS[0].id, B = PETS[1].id;
const slotC = async () => (await loot.equipped({ raw: true })).C;

/* ---- HEAL ---- */
useDbName('first-pet-heal');
{
  const inst = await loot.addPetInstance(A, {});
  const iid = await loot.equippedPetIid();
  const C = await slotC();
  ok('HEAL one owned pet and nothing equipped: equippedPetIid equips her in BOTH records',
    iid === inst.iid && C === A, `petEquipped=${iid} C=${C}`);
}

/* ---- STUCK ---- */
useDbName('first-pet-stuck');
{
  const inst = await loot.addPetInstance(A, {});
  await kvSet('petEquipped', inst.iid);          // the heal already ran on v487 and wrote this
  const eq = await loot.equipped({ raw: true }); delete eq.C; await kvSet('equipped', eq);
  ok('STUCK-SETUP petEquipped valid and the C slot empty, the state v482..v487 left players in',
    (await kvGet('petEquipped', null)) === inst.iid && (await slotC()) === undefined);
  const iid = await loot.equippedPetIid();
  const C = await slotC();
  ok('STUCK the shipped bug state (petEquipped valid, C slot empty) is repaired by the next equippedPetIid',
    iid === inst.iid && C === A, `C=${C}`);
}

/* ---- HATCH ---- */
useDbName('first-pet-hatch');
{
  const egg = await loot.grantEgg('first-pet-audit', 0);   // goal 0 is the welcome egg's own tier
  const res = await loot.hatchEgg(egg.id);
  const insts = await loot.petInstances();
  const iid = await kvGet('petEquipped', null);
  const C = await slotC();
  ok('HATCH-SETUP the egg hatched one instance', res.ready === true && insts.length === 1, `ready=${res.ready} instances=${insts.length}`);
  ok('HATCH hatchEgg on a goal-0 egg leaves the hatched species in the C slot with petEquipped agreeing',
    !!res.item && C === res.item.id && insts.some(x => x.iid === iid && x.sp === res.item.id), `hatched=${res.item && res.item.id} C=${C} petEquipped=${iid}`);
}

/* ---- CONTROL ---- */
useDbName('first-pet-control');
{
  const chosen = await loot.addPetInstance(A, {});
  await loot.setEquippedPet(chosen.iid);
  await loot.addPetInstance(B, {});
  const afterMint = { iid: await loot.equippedPetIid(), C: await slotC() };
  const egg = await loot.grantEgg('first-pet-audit', 0);
  const res = await loot.hatchEgg(egg.id);
  const afterHatch = { iid: await loot.equippedPetIid(), C: await slotC() };
  ok('CONTROL a chosen pet stays chosen: a second copy minted and a second egg hatched never re-point either record',
    res.ready === true && afterMint.iid === chosen.iid && afterMint.C === A && afterHatch.iid === chosen.iid && afterHatch.C === A,
    `after mint ${JSON.stringify(afterMint)}, after hatch ${JSON.stringify(afterHatch)} (chosen ${chosen.iid}/${A})`);
}

console.log(fails ? `\nfirst-pet: ${fails} FAILED` : '\nfirst-pet: the first pet you hatch is out with you, in both records');
process.exit(fails ? 1 : 0);
